import * as vscode from 'vscode';
import { SmtcReader } from './smtcReader.js';
import { LyricsFetcher } from './lyricsFetcher.js';
import { Translator } from './translation/translator.js';
import { LyricsPanel } from './display/lyricsPanel.js';
import { StatusBarDisplay } from './display/statusBar.js';
import { getConfig } from './utils/config.js';
import { logInfo, logError } from './utils/logger.js';
import type { TrackInfo, LyricsResult } from './types/index.js';

export function activate(context: vscode.ExtensionContext) {
  // 仅 Windows 平台支持
  if (process.platform !== 'win32') {
    vscode.window.showWarningMessage('歌词显示插件仅支持 Windows 平台');
    return;
  }

  logInfo('插件正在激活...');

  // 初始化组件
  const smtcReader = new SmtcReader(context);
  const fetcher = new LyricsFetcher();
  const translator = new Translator();
  const lyricsPanel = new LyricsPanel();
  const statusBar = new StatusBarDisplay();

  // 本地计时器（SMTC 不提供 playlist position）
  let trackStartTime = 0;
  let trackStartPosition = 0;
  let trackDuration = 0;
  let isPlaying = false;

  const positionTimer = {
    _timer: null as ReturnType<typeof setInterval> | null,
    start() {
      this.stop();
      trackStartTime = Date.now();
      this._timer = setInterval(() => {
        if (!isPlaying) return;
        const elapsed = (Date.now() - trackStartTime) / 1000;
        const position = trackStartPosition + elapsed;
        if (trackDuration > 0 && position >= trackDuration) {
          this.stop();
          return;
        }
        lyricsPanel.updatePosition(position);
      }, 500);
    },
    stop() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }
  };

  // ── SMTC 事件处理 ──

  // 曲目变化 → 获取歌词 → 更新面板
  smtcReader.on('trackChange', async (track: TrackInfo) => {
    logInfo(`曲目变化: ${track.artist} - ${track.title} [${track.sourceApp}]`);

    // 更新播放状态
    isPlaying = track.playbackStatus === 'Playing';
    trackStartPosition = track.position;
    trackDuration = track.duration;

    // 更新状态栏
    statusBar.update(track);

    // 确保面板可见
    lyricsPanel.createOrShow();

    // 获取歌词
    const result = await fetcher.fetchLyrics(track);

    // 音译处理
    if (result) {
      // 从 LRC 中提取真实时长（最后一行时间戳）
      if (result.lrcLines && result.lrcLines.length > 0) {
        const lastLine = result.lrcLines[result.lrcLines.length - 1];
        if (lastLine.time > trackDuration) {
          trackDuration = lastLine.time;
        }
      }
      const enriched = await translator.enrich(track, result);
      lyricsPanel.update(track, enriched);
    } else {
      lyricsPanel.update(track, null);
    }

    // 启动本地计时器
    if (isPlaying) {
      positionTimer.start();
    }
  });

  // SMTC 位置更新（备用：部分播放器支持）
  smtcReader.on('positionChange', (position: number) => {
    // 用 SMTC 位置校准本地计时器
    if (Math.abs(position - trackStartPosition) > 1) {
      trackStartTime = Date.now();
      trackStartPosition = position;
    }
    lyricsPanel.updatePosition(position);
  });

  // 无媒体 → 隐藏状态栏，停止计时
  smtcReader.on('noMedia', () => {
    isPlaying = false;
    positionTimer.stop();
    statusBar.update(null);
  });

  // ── 启动 ──
  smtcReader.start();
  lyricsPanel.createOrShow();

  // ── 注册命令 ──
  context.subscriptions.push(
    smtcReader,
    statusBar,
    lyricsPanel,

    // 显示歌词面板
    vscode.commands.registerCommand('lyrics.showPanel', () => {
      lyricsPanel.createOrShow();
    }),

    // 刷新当前歌词
    vscode.commands.registerCommand('lyrics.refresh', () => {
      fetcher.clearCache();
      smtcReader.forceUpdate();
    }),

    // 切换翻译显示
    vscode.commands.registerCommand('lyrics.toggleTranslation', async () => {
      const config = vscode.workspace.getConfiguration('lyrics');
      const current = config.get<boolean>('enableTranslation', true);
      await config.update('enableTranslation', !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`歌词翻译已${!current ? '开启' : '关闭'}`);
    })
  );

  logInfo('插件激活完成');
}

export function deactivate() {
  positionTimer.stop();
  logInfo('插件已停用');
}
