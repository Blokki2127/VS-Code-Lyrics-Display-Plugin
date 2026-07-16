# 歌词显示 — VS Code 插件

基于 Windows SMTC（系统媒体传输控件）的歌词显示插件，支持多平台歌词源。

## 功能

- 🎵 自动检测任意播放器的当前曲目（Spotify、网易云、QQ音乐、浏览器等）
- 📝 多平台歌词获取：网易云音乐 / QQ音乐 / LRCLIB / 本地 .lrc 文件
- 🎯 当前句大字号突出显示，其余句半透明淡化
- 🌐 外语歌词翻译（日→中、韩→中等）
- 🔤 外语歌词音译（日文罗马音、韩文罗马音、中文拼音）
- 🎨 15 项自定义样式（字号、颜色、透明度、间距、动画）
- 🌓 自动适配 VS Code 深色/浅色主题

## 系统要求

- **Windows 10/11**（依赖 SMTC WinRT API）
- VS Code 1.85.0+

## 安装

从源码构建：

```bash
npm install
npm run build
npm run package
```

然后通过 VS Code 的 "从 VSIX 安装..." 安装生成的 `.vsix` 文件。

## 使用

1. 安装插件后，打开任意音乐播放器播放歌曲
2. 歌词面板自动打开，显示当前歌曲信息和歌词
3. 状态栏右侧显示当前曲目简讯
4. 通过命令面板（`Ctrl+Shift+P`）可使用以下命令：
   - `歌词：显示歌词面板` — 重新打开歌词面板
   - `歌词：刷新当前歌词` — 强制刷新歌词
   - `歌词：切换翻译显示` — 开关歌词翻译

## 配置

在 VS Code `settings.json` 中配置（`lyrics.*` 命名空间）：

```json
{
  "lyrics.source": "online",
  "lyrics.onlineProvider": "netease",
  "lyrics.enableTranslation": true,
  "lyrics.enableTransliteration": true,
  "lyrics.style.activeFontSize": 20,
  "lyrics.style.normalFontSize": 14,
  "lyrics.style.inactiveOpacity": 0.5
}
```

完整配置项列表见 [package.json](package.json) 的 `contributes.configuration` 部分。

## 开发

```bash
npm run watch   # 开发模式（自动构建 + 监听）
# 然后在 VS Code 中按 F5 启动扩展开发宿主
```

## 工作原理

1. 插件启动时长驻一个 PowerShell 进程，每 500ms 检查 Windows SMTC 状态
2. 检测到曲目变化时，通过 stdout 输出 JSON
3. Node.js 端接收 JSON 后，查询配置的歌词 API
4. 歌词文本解析后渲染到 Webview 面板，当前句匹配播放位置高亮
5. 翻译和音译在获取歌词后一并处理

## 许可

MIT License
