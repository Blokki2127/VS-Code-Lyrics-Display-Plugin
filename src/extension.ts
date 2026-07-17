import * as vscode from 'vscode';
import { SmtcReader } from './smtcReader.js';
import { NeteaseElogReader, type ElogTrackInfo } from './neteaseElogReader.js';
import { LyricsFetcher } from './lyricsFetcher.js';
import { Translator } from './translation/translator.js';
import { LyricsPanel } from './display/lyricsPanel.js';
import { StatusBarDisplay } from './display/statusBar.js';
import { getConfig } from './utils/config.js';
import { logInfo, logError } from './utils/logger.js';
import type { TrackInfo, LyricsResult } from './types/index.js';

export function activate(context: vscode.ExtensionContext) {
  if (process.platform !== 'win32') {
    vscode.window.showWarningMessage('歌词显示插件仅支持 Windows 平台');
    return;
  }

  logInfo('插件正在激活...');

  const smtcReader = new SmtcReader(context);
  const elogReader = new NeteaseElogReader();
  const fetcher = new LyricsFetcher();
  const translator = new Translator();
  const lyricsPanel = new LyricsPanel();
  const statusBar = new StatusBarDisplay();

  // 当前曲目标识 + 是否使用 elog 精确位置
  let currentTrackId = '';
  let useElogPosition = false; // elog 提供精确位置时为 true

  // 用户点击歌词行 → 同步
  lyricsPanel.onSeek((position: number) => {
    logInfo(`手动同步到 ${position.toFixed(1)}s`);
  });

  // ── 共用曲目处理 ──
  async function handleTrackChange(track: TrackInfo | ElogTrackInfo): Promise<void> {
    const trackId = `${track.artist}|${track.title}`;
    currentTrackId = trackId;
    logInfo(`曲目变化: ${track.artist} - ${track.title} [${track.sourceApp}]`);

    statusBar.update(track);
    lyricsPanel.createOrShow();

    const result = await fetcher.fetchLyrics(track);
    if (currentTrackId !== trackId) {
      logInfo(`跳过过期歌词: ${track.artist} - ${track.title}`);
      return;
    }

    if (result) {
      const enriched = await translator.enrich(track, result);
      lyricsPanel.update(track, enriched);
    } else {
      lyricsPanel.update(track, null);
    }
  }

  // ── NetEase elog 事件（精确位置）──
  elogReader.on('trackChange', (track: ElogTrackInfo) => {
    useElogPosition = true;
    handleTrackChange(track);
  });

  elogReader.on('position', (position: number) => {
    if (useElogPosition) {
      lyricsPanel.updatePosition(position);
    }
  });

  elogReader.on('status', (playing: boolean) => {
    logInfo(`Elog 播放状态: ${playing ? '播放' : '暂停'}`);
  });

  // ── SMTC 事件（降级/补充）──
  smtcReader.on('trackChange', async (track: TrackInfo) => {
    // 如果 elog 已接管（网易云），跳过 SMTC 的 track info
    if (useElogPosition && track.sourceApp?.includes('cloudmusic')) {
      return;
    }
    useElogPosition = false;
    await handleTrackChange(track);
  });

  smtcReader.on('positionChange', (position: number) => {
    if (!useElogPosition) {
      lyricsPanel.updatePosition(position);
    }
  });

  smtcReader.on('noMedia', () => {
    statusBar.update(null);
  });

  // ── 启动 ──
  elogReader.start();
  smtcReader.start();
  lyricsPanel.createOrShow();

  // ── 注册命令 ──
  context.subscriptions.push(
    smtcReader,
    elogReader,
    statusBar,
    lyricsPanel,

    vscode.commands.registerCommand('lyrics.showPanel', () => {
      lyricsPanel.createOrShow();
    }),

    vscode.commands.registerCommand('lyrics.refresh', () => {
      fetcher.clearCache();
      smtcReader.forceUpdate();
    }),

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
  logInfo('插件已停用');
}
