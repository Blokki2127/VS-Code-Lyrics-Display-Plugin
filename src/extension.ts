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

  // ── SMTC 事件处理 ──

  // 曲目变化 → 获取歌词 → 更新面板
  smtcReader.on('trackChange', async (track: TrackInfo) => {
    logInfo(`曲目变化: ${track.artist} - ${track.title} [${track.sourceApp}]`);

    // 更新状态栏
    statusBar.update(track);

    // 确保面板可见
    lyricsPanel.createOrShow();

    // 获取歌词
    const result = await fetcher.fetchLyrics(track);

    // 获取翻译（如开启）
    if (result && getConfig<boolean>('lyrics.enableTranslation', true)) {
      // 网易云内建翻译已在 fetchLyrics 中获取
      // 这里做额外翻译补充
    }

    // 音译处理
    if (result) {
      const enriched = await translator.enrich(track, result);
      lyricsPanel.update(track, enriched);
    } else {
      lyricsPanel.update(track, null);
    }
  });

  // 播放位置更新 → 仅更新当前句标记（高频）
  smtcReader.on('positionChange', (position: number) => {
    lyricsPanel.updatePosition(position);
  });

  // 无媒体 → 隐藏状态栏
  smtcReader.on('noMedia', () => {
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
  logInfo('插件已停用');
}
