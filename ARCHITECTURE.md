# VS Code 歌词显示插件 — 架构文档

## 项目概览

| 指标 | 数值 |
|------|------|
| TypeScript 源文件 | 17 个 |
| 总代码行数 | ~1,900 行 |
| PowerShell 脚本 | 1 个 |
| 运行时依赖 | 0（仅 Node.js 内建模块） |
| 配置项 | 23 个 |
| 歌词源 | 4 个（网易云 / QQ音乐 / LRCLIB / 本地） |

---

## 架构分层

```
┌────────────────────────────────────────────────────────────┐
│                      extension.ts                          │
│                    (入口 + 编排)                            │
├──────────────┬────────────────────────────┬────────────────┤
│   检测层      │        歌词层               │    显示层      │
│              │                            │               │
│ smtcReader   │  lyricsFetcher             │  lyricsPanel  │
│   (SMTC)     │   ├─ NeteaseProvider        │   (Webview)   │
│              │   ├─ QQMusicProvider        │               │
│ elogReader   │   ├─ LrclibProvider         │  statusBar    │
│   (Elog)     │   └─ LocalProvider          │   (状态栏)    │
│              │                            │               │
│              │  translator                │               │
│              │   └─ transliterator         │               │
└──────────────┴────────────────────────────┴───────────────┘
```

---

## 文件清单

| 文件 | 行数 | 职责 |
|------|------|------|
| [src/extension.ts](src/extension.ts) | 136 | 插件入口，组件编排，SMTC + Elog 双轨调度 |
| [src/smtcReader.ts](src/smtcReader.ts) | 158 | SMTC PowerShell 长驻进程管理 |
| [src/neteaseElogReader.ts](src/neteaseElogReader.ts) | 332 | 网易云 elog 日志读取，精确位置追踪 |
| [src/lyricsFetcher.ts](src/lyricsFetcher.ts) | 131 | 歌词获取编排器（多源 + 缓存） |
| [src/display/lyricsPanel.ts](src/display/lyricsPanel.ts) | 283 | Webview 歌词面板 |
| [src/display/statusBar.ts](src/display/statusBar.ts) | 47 | 状态栏曲目显示 |
| [src/lyricsProviders/provider.ts](src/lyricsProviders/provider.ts) | 16 | 歌词提供器接口 |
| [src/lyricsProviders/lrcParser.ts](src/lyricsProviders/lrcParser.ts) | 106 | LRC 解析引擎 |
| [src/lyricsProviders/neteaseProvider.ts](src/lyricsProviders/neteaseProvider.ts) | 108 | 网易云 API（直连，无需代理） |
| [src/lyricsProviders/qqMusicProvider.ts](src/lyricsProviders/qqMusicProvider.ts) | 81 | QQ音乐 API |
| [src/lyricsProviders/lrclibProvider.ts](src/lyricsProviders/lrclibProvider.ts) | 90 | LRCLIB 免费 API |
| [src/lyricsProviders/localProvider.ts](src/lyricsProviders/localProvider.ts) | 53 | 本地 .lrc 文件 |
| [src/translation/translator.ts](src/translation/translator.ts) | 54 | 翻译/音译编排器 |
| [src/translation/transliterator.ts](src/translation/transliterator.ts) | 181 | 日→罗马音、韩→罗马音 |
| [src/types/index.ts](src/types/index.ts) | 51 | 共享类型定义 |
| [src/utils/config.ts](src/utils/config.ts) | 45 | 配置读取工具 |
| [src/utils/logger.ts](src/utils/logger.ts) | 30 | OutputChannel 日志 |

---

## 检测层：双轨并行

### 轨道 1：SMTC（通用）

**文件**：[smtcReader.ts](src/smtcReader.ts) + [smtc-daemon.ps1](scripts/smtc-daemon.ps1)

| 属性 | 值 |
|------|-----|
| 原理 | PowerShell 长驻进程 → WinRT `GlobalSystemMediaTransportControlsSessionManager` |
| 轮询间隔 | 300ms |
| 编码 | UTF-8 (Console]::Out + Flush) |
| 输出 | stdout JSON（仅状态变化时） |

**职责**：
- ✅ **切歌检测** — 全部播放器（系统级，始终有 artist + title）
- ✅ **位置追踪** — 非网易云播放器
- ✅ **无媒体检测** — 状态栏自动隐藏

**事件流**：
```
SMTC (Windows) → PowerShell daemon → stdout JSON
  → readline 逐行解析 → EventEmitter
    ├─ track → emit('trackChange', TrackInfo)
    ├─ position → emit('positionChange', number)
    └─ no_media → emit('noMedia')
```

### 轨道 2：Elog（网易云特化）

**文件**：[neteaseElogReader.ts](src/neteaseElogReader.ts)

| 属性 | 值 |
|------|-----|
| 原理 | 监控 `%LOCALAPPDATA%/NetEase/CloudMusic/cloudmusic.elog` |
| 编码 | XOR 字节变换 → UTF-8 |
| 轮询间隔 | 500ms |
| 启动恢复 | 倒序解析历史日志，回放事件重建播放状态 |

**职责**：
- ✅ **精确位置追踪** — 含快进快退检测
- ✅ **辅助切歌检测** — SMTC 可能延迟时补充

**Elog 事件类型**：
```
cloudmusic.elog（XOR 解码后）
  ├─ playOneTrackInPlayingList  → 切歌（含完整歌曲 JSON）
  ├─ checkPlayPrivilege         → 切歌（含完整歌曲 JSON）
  ├─ native播放资源load完成      → 切歌（仅 songId → 查本地缓存）
  ├─ setPlayingPosition         → 进度拖拽（精确秒数）
  └─ native播放state            → 播放(1) / 暂停(2)
```

**位置计算公式**：
```
播放中: position = (Date.now() - relativeTime) / 1000
暂停中: lastPosition = (Date.now() - relativeTime) / 1000
恢复:   relativeTime = Date.now() - lastPosition * 1000
拖拽:   relativeTime = Date.now() - newPosition * 1000
```

**缓存机制**：
- `trackCache: Map<songId, {name, artists, album, duration}>`
- `checkPlayPrivilege` / `playOneTrackInPlayingList` 事件自动填充
- `native播放资源load` 触发时查缓存 → 缓存未命中时异步调用 `/api/song/detail` 补全

### 决策逻辑

```
SMTC trackChange 触发
  │
  ├─ sourceApp.includes('cloudmusic')?
  │   ├─ 是 → isNetease = true, 位置由 Elog 接管
  │   └─ 否 → isNetease = false, 位置由 SMTC 接管
  │
  └─ handleTrackChange() → 去重 → 获取歌词 → 更新面板

Elog trackChange 触发（辅助）
  │
  └─ isNetease = true → handleTrackChange()

位置更新:
  ├─ isNetease = true  → elogReader.emit('position') → updatePosition()
  └─ isNetease = false → smtcReader.emit('positionChange') → updatePosition()
```

| 播放器 | 切歌检测 | 位置追踪 |
|--------|----------|----------|
| 网易云 | SMTC + Elog | **Elog**（精确到秒） |
| Spotify/QQ音乐/浏览器等 | **SMTC** | **SMTC** |

---

## 歌词层：四源编排

### 编排器 ([lyricsFetcher.ts](src/lyricsFetcher.ts))

```
fetchLyrics(track)
  │
  ├─ 1. 查缓存 (Map<artist|title, LyricsResult>)
  │
  ├─ 2. source=local → LocalProvider
  │
  ├─ 3. source=online → 按 lyrics.onlineProvider 选择
  │     ├─ netease → NeteaseProvider.searchWithTranslation()
  │     ├─ qqmusic → QQMusicProvider.search()
  │     └─ lrclib  → LrclibProvider.search()
  │
  ├─ 4. 降级 → 逐一尝试: qqmusic → lrclib → netease
  │
  └─ 5. parseLrc() → LyricsResult + 缓存
```

### 提供器对比

| 提供器 | API 端点 | 加密 | 翻译 | 速度 |
|--------|----------|------|------|------|
| **NeteaseProvider** | `music.163.com/api` (GET) | 无 | ✅ `tlyric` | 快 |
| **QQMusicProvider** | `c.y.qq.com` (GET) | 无 | ❌ | 快 |
| **LrclibProvider** | `lrclib.net/api` (GET) | 无 | ❌ | 一般 |
| **LocalProvider** | 本地 `.lrc` 文件 | — | ❌ | 即时 |

### 翻译与音译

**翻译**：网易云 API 返回的 `tlyric` 字段 → `stripLyricTimestamps()` 剥离时间戳但**保留行结构**（与原文逐行对齐）

**音译**：`detectLanguage()` → `transliterate()`

| 语言 | 检测方式 | 转换方式 |
|------|----------|----------|
| 日文 | Hiragana/Katakana Unicode 范围 | 150+ 假名 → 罗马音映射表 |
| 韩文 | Hangul Unicode 范围 | 音节分解公式 `(code-0xAC00)→初始/中声/终声` |
| 中文 | CJK Unicode 范围 | 跳过（V2 集成拼音库） |

---

## 显示层

### 歌词面板 ([lyricsPanel.ts](src/lyricsPanel.ts))

| 特性 | 实现 |
|------|------|
| 渲染 | Webview 内联 HTML + CSS（15 项 `lyrics.style.*` 配置驱动） |
| 当前句 | `findCurrentLineIndex(LRC, position)` → CSS `.active` 类 |
| 位置更新 | `postMessage({type:'updateActiveLine', lineIndex})` — 不重建 HTML |
| 热更新 | `onDidChangeConfiguration` → 完全重建 HTML |

**面板布局**：
```
┌─────────────────────────────────┐
│  歌名 (18px)                    │
│  歌手 · 专辑                    │
│  来源：cloudmusic.exe            │
├─────────────────────────────────┤
│  普通句 (14px, opacity 0.5)     │
│    └ 罗马音 (12px, italic)      │
│    └ 翻译 (12px, gray)          │
│                                 │
│  ★ 当前句 (20px, bold, 1.0)     │  ← .active 类
│    └ 罗马音                     │
│    └ 翻译                       │
│                                 │
│  普通句 ...                     │
└─────────────────────────────────┘
```

### 高频位置更新机制

```
每 500ms:
  elogReader.position 或 smtcReader.positionChange
    → findCurrentLineIndex(LRC, positionSec)
    → 若索引未变 → 跳过
    → 若索引变化 → postMessage({ type:'updateActiveLine', lineIndex })
         → webview JS:
            1. 移除所有 .active
            2. 添加 .active 到 [data-index="N"]
            3. scrollIntoView({ smooth, center })
```

### 状态栏 ([statusBar.ts](src/statusBar.ts))

- 文本：`▶ 歌手 - 歌名`（截断 50 字符）
- Hover：专辑、时长、来源应用
- 无点击交互
- 无播放时自动隐藏

---

## 关键算法

### LRC 解析

```
输入: "[00:15.23]Hello world\n[00:18.50]Second line"
正则: /^\[(\d{2}):(\d{2})[.:](\d{2,3})\](.*)/
输出: LrcLine[] = [{time: 15.23, text: "Hello world"}, {time: 18.50, text: "Second line"}]
```

### 当前句查找

```
findCurrentLineIndex(lines, positionSec):
  idx = -1
  for i in 0..lines.length-1:
    if lines[i].time <= positionSec → idx = i
    else → break
  return idx
```

### Elog 字节解码

```
对每个字节 b:
  hexDigit = (floor(b/16) XOR ((b%16)+8)) % 16
  decodedByte = hexDigit*16 + floor(b/64)*4 + (~floor(b/16) & 3)
```

### 切歌去重

```
handleTrackChange(track):
  trackId = lower(artist) + "|" + lower(title)
  if trackId === currentTrackId → 跳过
  currentTrackId = trackId
  → 获取歌词 → 更新面板（异步回调中再次检查 trackId 防止竞态）
```

---

## 配置体系

所有配置位于 `lyrics` 命名空间，共 23 项：

### 歌词来源

| 配置项 | 类型 | 默认值 | 可选值 |
|--------|------|--------|--------|
| `lyrics.source` | string | `"online"` | `online` / `local` / `both` |
| `lyrics.onlineProvider` | string | `"netease"` | `lrclib` / `netease` / `qqmusic` |
| `lyrics.neteaseApiUrl` | string | `""` | 自定义代理地址 |
| `lyrics.qqMusicApiUrl` | string | `""` | 自定义代理地址 |
| `lyrics.localPath` | string | `""` | 本地 .lrc 目录 |

### 翻译

| 配置项 | 类型 | 默认值 |
|--------|------|--------|
| `lyrics.enableTranslation` | boolean | `true` |
| `lyrics.enableTransliteration` | boolean | `true` |

### SMTC

| 配置项 | 类型 | 默认值 | 范围 |
|--------|------|--------|------|
| `lyrics.pollingInterval` | number | `300` | 200-2000ms |

### 面板

| 配置项 | 类型 | 默认值 | 可选值 |
|--------|------|--------|--------|
| `lyrics.panelPosition` | string | `"beside"` | `beside` / `active` / `bottom` |

### 样式（lyrics.style.*）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `activeFontSize` | number | `20` | 当前句字号（12-48px） |
| `normalFontSize` | number | `14` | 非当前句字号（10-36px） |
| `activeFontWeight` | string | `"500"` | 当前句字重 |
| `activeLineColor` | string | `""` | 当前句颜色（空=主题色） |
| `normalLineColor` | string | `""` | 非当前句颜色 |
| `inactiveOpacity` | number | `0.5` | 非当前句透明度 |
| `translationFontSize` | number | `12` | 翻译字号 |
| `translationColor` | string | `""` | 翻译颜色 |
| `transliterationFontSize` | number | `12` | 音译字号 |
| `transliterationColor` | string | `""` | 音译颜色 |
| `transliterationItalic` | boolean | `true` | 音译斜体 |
| `lineSpacing` | number | `4` | 行间距 |
| `transitionDuration` | number | `300` | 切换动画时长 |
| `backgroundColor` | string | `""` | 面板背景色 |

### 命令

| 命令 | 标题 |
|------|------|
| `lyrics.showPanel` | 歌词：显示歌词面板 |
| `lyrics.refresh` | 歌词：刷新当前歌词 |
| `lyrics.toggleTranslation` | 歌词：切换翻译显示 |

---

## 数据流完整路径

```
音乐开始播放
  │
  ├─ [SMTC] 300ms内检测 → emit trackChange
  │    ├─ artist, title, album（系统级，可靠）
  │    └─ sourceApp = "cloudmusic.exe" → isNetease = true
  │
  ├─ [Elog] 同步检测 → emit trackChange（辅助）
  │    └─ 含歌曲时长（比 SMTC 精确）
  │
  ▼
handleTrackChange(track)
  │
  ├─ 去重检查 (artist|title)
  ├─ statusBar.update(track)
  ├─ lyricsPanel.createOrShow()
  │
  ├─ fetcher.fetchLyrics(track)
  │    ├─ 缓存命中 → 直接返回
  │    ├─ 缓存未命中 → NeteaseProvider
  │    │    ├─ /api/search/get → songId
  │    │    └─ /api/song/lyric → lrc + tlyric（翻译）
  │    └─ parseLrc() → LrcLine[]
  │
  ├─ translator.enrich(result)
  │    ├─ 翻译: tlyric → stripLyricTimestamps()（逐行剥离时间戳）
  │    └─ 音译: detectLanguage() → transliterate()
  │
  └─ lyricsPanel.update(track, enriched)
       └─ buildHtml() → 内联 CSS + 歌词行 + 翻译 + 音译 → webview

播放中（每 500ms）
  │
  ├─ [Elog] isNetease=true → elogReader.emit('position')
  │    └─ position = (Date.now() - relativeTime) / 1000
  │
  ├─ [SMTC] isNetease=false → smtcReader.emit('positionChange')
  │
  └─ lyricsPanel.updatePosition(position)
       └─ findCurrentLineIndex(LRC, position)
       └─ postMessage → JS 切换 .active 类 + 滚动
```

---

## 设计决策

| 决策 | 原因 |
|------|------|
| 零运行时依赖 | 仅 Node.js 内建模块，零安装负担 |
| SMTC 主导切歌 | 系统级 API，始终有 artist + title |
| Elog 辅助位置 | SMTC 无法获取网易云播放进度 |
| esbuild 构建 | ~100ms vs webpack 2-5s |
| postMessage 更新位置 | 避免每秒重建整个 HTML |
| 翻译独立剥离时间戳 | 翻译行数与原文可能不对齐 |
| 翻译逐行显示 | 保留行结构便于与原文对齐 |
| 内存缓存 | session 级别，简单可靠 |

---

## 致谢

- [MyLifeTracker](https://github.com/StalinDev54/MyLifeTracker) — 网易云 elog 事件日志解析方案
- [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) — 网易云音乐 API 参考
- [LRCLIB](https://lrclib.net) — 开源歌词数据库
