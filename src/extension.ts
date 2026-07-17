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

  let currentTrackId = '';
  let isNetease = false;  // 当前播放器是网易云 → 使用 elog 位置

  // ── 共用：曲目变化处理 ──
  async function handleTrackChange(track: TrackInfo): Promise<void> {
    const trackId = `${track.artist}|${track.title}`;
    if (trackId === currentTrackId) return; // 同一首歌，跳过
    currentTrackId = trackId;

    // 检测是否网易云
    isNetease = track.sourceApp?.toLowerCase().includes('cloudmusic');

    logInfo(`曲目变化: ${track.artist} - ${track.title} [${track.sourceApp}]${isNetease ? ' (Elog)' : ''}`);

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

  // ── SMTC：主要切歌检测（可靠，始终有 artist + title）──
  smtcReader.on('trackChange', async (track: TrackInfo) => {
    await handleTrackChange(track);
  });

  // SMTC 位置（非网易云时使用）
  smtcReader.on('positionChange', (position: number) => {
    if (!isNetease) {
      lyricsPanel.updatePosition(position);
    }
  });

  smtcReader.on('noMedia', () => {
    currentTrackId = '';
    isNetease = false;
    statusBar.update(null);
  });

  // ── Elog：仅提供精确位置（不负责切歌检测）──
  elogReader.on('trackChange', (track: ElogTrackInfo) => {
    // Elog 也检测到切歌 → 同步 isNetease，但不重复 handleTrackChange
    // 因为 SMTC 已经会触发 handleTrackChange
    isNetease = true;
  });

  elogReader.on('position', (position: number) => {
    if (isNetease) {
      lyricsPanel.updatePosition(position);
    }
  });

  elogReader.on('status', (playing: boolean) => {
    logInfo(`Elog 播放状态: ${playing ? '播放' : '暂停'}`);
  });

  // ── 启动 ──
  smtcReader.start();
  elogReader.start();
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
