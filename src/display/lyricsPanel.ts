import * as vscode from 'vscode';
import type { TrackInfo, LyricsResult, LrcLine } from '../types/index.js';
import { findCurrentLineIndex } from '../lyricsProviders/lrcParser.js';
import { getStyleConfig, getPanelColumn, getConfig } from '../utils/config.js';
import { logDebug } from '../utils/logger.js';

/**
 * Webview 歌词面板 — 主显示区域
 * - 显示完整歌词
 * - 当前句大字号显示
 * - 翻译 + 音译显示
 * - 配置变更实时刷新样式
 */
export class LyricsPanel {
  private panel: vscode.WebviewPanel | null = null;
  private currentTrack: TrackInfo | null = null;
  private lrcLines: LrcLine[] = [];
  private currentLyrics: string | null = null;
  private translation: string = '';
  private transliteration: string = '';
  private currentLineIndex: number = -1;
  private _onSeek: ((position: number) => void) | null = null;

  /** 注册 seek 回调（用户点击歌词行时触发） */
  onSeek(callback: (position: number) => void): void {
    this._onSeek = callback;
  }

  /** 创建或显示面板 */
  createOrShow(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    const pos = getPanelColumn();
    this.panel = vscode.window.createWebviewPanel(
      'lyricsView',
      '歌词',
      { viewColumn: pos, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    // 监听 webview 消息（点击歌词行同步）
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.type === 'seekTo' && typeof msg.position === 'number') {
        this._onSeek?.(msg.position);
      }
    });

    // 显示等待状态（在检测到曲目之前）
    if (!this.currentTrack) {
      this.panel.webview.html = this.buildWaitingHtml();
    }

    // 监听样式配置变更 → 实时刷新
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('lyrics.style') && this.panel && this.currentTrack) {
        this.render();
      }
    });
  }

  /** 更新歌词内容 */
  update(track: TrackInfo, result: LyricsResult | null): void {
    this.currentTrack = track;
    this.lrcLines = result?.lrcLines ?? [];
    this.currentLyrics = result?.lyrics ?? null;
    this.translation = result?.translation ?? '';
    this.transliteration = result?.transliteration ?? '';

    // 初始化当前句
    if (this.lrcLines.length > 0) {
      this.currentLineIndex = findCurrentLineIndex(this.lrcLines, track.position);
    } else {
      this.currentLineIndex = -1;
    }

    this.render();
  }

  /** 高频更新：播放位置变化 → 仅切换 active 行 */
  updatePosition(positionSec: number): void {
    if (!this.panel || this.lrcLines.length === 0) return;

    const newIdx = findCurrentLineIndex(this.lrcLines, positionSec);
    if (newIdx === this.currentLineIndex) return;
    this.currentLineIndex = newIdx;

    // 通过 postMessage 切换 active 类，无需重建 HTML
    this.panel.webview.postMessage({
      type: 'updateActiveLine',
      lineIndex: newIdx,
    });
  }

  /** 完整渲染面板 HTML */
  private render(): void {
    if (!this.panel || !this.currentTrack) return;
    this.panel.webview.html = this.buildHtml();
  }

  /** 构建面板 HTML */
  private buildHtml(): string {
    const style = getStyleConfig();
    const linesHtml = this.buildLinesHtml();
    const track = this.currentTrack!;

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      --bg: ${style.backgroundColor || 'var(--vscode-editor-background)'};
      --fg: var(--vscode-editor-foreground);
      --normal-color: ${style.normalLineColor || 'var(--vscode-editor-foreground)'};
      --active-color: ${style.activeLineColor || 'var(--vscode-editor-foreground)'};
      --trans-color: ${style.translationColor || 'var(--vscode-descriptionForeground)'};
      --roman-color: ${style.transliterationColor || 'var(--vscode-descriptionForeground)'};
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-editor-font-family, 'Microsoft YaHei', sans-serif);
      background: var(--bg);
      color: var(--normal-color);
      padding: 24px 20px;
      line-height: 2.2;
      min-height: 100vh;
    }
    .track-info {
      color: var(--muted);
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    .track-info h2 {
      color: var(--fg);
      margin: 0 0 4px 0;
      font-size: 18px;
    }
    .track-info p { margin: 0; }
    .lyrics-container {
      max-width: 800px;
    }
    .line {
      margin: ${style.lineSpacing}px 0;
      opacity: ${style.inactiveOpacity};
      transition: all ${style.transitionDuration}ms ease;
      padding: 2px 0;
    }
    .line.active {
      opacity: 1;
    }
    .line.active .lyric-text {
      font-size: ${style.activeFontSize}px;
      font-weight: ${style.activeFontWeight};
      color: var(--active-color);
    }
    .lyric-text {
      font-size: ${style.normalFontSize}px;
      color: var(--normal-color);
      margin: 0;
      line-height: 1.8;
    }
    .translation {
      font-size: ${style.translationFontSize}px;
      color: var(--trans-color);
      margin: 2px 0 0 0;
    }
    .transliteration {
      font-size: ${style.transliterationFontSize}px;
      color: var(--roman-color);
      font-style: ${style.transliterationItalic ? 'italic' : 'normal'};
      margin: 2px 0 0 0;
    }
    .no-lyrics {
      text-align: center;
      color: var(--muted);
      margin-top: 60px;
    }
  </style>
</head>
<body>
  <div class="track-info">
    <h2>${this.escapeHtml(track.title)}</h2>
    <p>${this.escapeHtml(track.artist)}${track.album ? ' · ' + this.escapeHtml(track.album) : ''}</p>
    <p style="margin-top:4px;font-size:12px">来源：${this.escapeHtml(track.sourceApp)}</p>
  </div>
  <div class="lyrics-container">
    ${linesHtml}
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', function(e) {
      if (e.data.type === 'updateActiveLine') {
        document.querySelectorAll('.line.active').forEach(function(el) { el.classList.remove('active'); });
        var target = document.querySelector('[data-index="' + e.data.lineIndex + '"]');
        if (target) {
          target.classList.add('active');
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
    // 点击歌词行 → 通知扩展同步到此位置
    document.querySelectorAll('.line').forEach(function(el) {
      el.addEventListener('click', function() {
        var time = parseFloat(this.getAttribute('data-time'));
        if (!isNaN(time)) {
          vscode.postMessage({ type: 'seekTo', position: time });
        }
      });
      el.style.cursor = 'pointer';
      el.title = '点击同步到此句';
    });
  </script>
</body>
</html>`;

    return html;
  }

  /** 构建歌词行 HTML */
  private buildLinesHtml(): string {
    const style = getStyleConfig();
    if (!this.currentLyrics) {
      return `<div class="no-lyrics">
        <p>🎵 暂无歌词</p>
        <p style="font-size:12px;margin-top:8px">请检查网络或尝试切换歌词来源</p>
      </div>`;
    }

    const plainLines = this.currentLyrics.split('\n');
    const romanLines = this.transliteration ? this.transliteration.split('\n') : [];

    // 歌词行（按索引匹配音译）
    const lyricHtml = plainLines.map((line, i) => {
      const isActive = i === this.currentLineIndex;
      const displayText = line.trim() || '&nbsp;';
      // 获取该行 LRC 时间戳（用于点击同步）
      const lineTime = this.lrcLines[i]?.time ?? -1;
      return `<div class="line${isActive ? ' active' : ''}" data-index="${i}" data-time="${lineTime}">
        <p class="lyric-text">${this.escapeHtml(displayText)}</p>
        ${romanLines[i] ? `<p class="transliteration">${this.escapeHtml(romanLines[i])}</p>` : ''}
      </div>`;
    }).join('\n');

    // 翻译作为独立块显示（不与原文逐行对齐）
    let translationHtml = '';
    if (this.translation) {
      const transText = this.translation.trim();
      if (transText) {
        translationHtml = `
          <div style="margin-top:24px;padding-top:16px;border-top:1px dashed var(--vscode-panel-border);">
            <p style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:8px;">📝 翻译</p>
            <pre style="font-family:inherit;font-size:${style.translationFontSize}px;color:${style.translationColor || 'var(--vscode-descriptionForeground)'};white-space:pre-wrap;line-height:1.8;margin:0;">${this.escapeHtml(transText)}</pre>
          </div>`;
      }
    }

    return lyricHtml + translationHtml;
  }

  /** 构建等待状态 HTML */
  private buildWaitingHtml(): string {
    const style = getStyleConfig();
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: var(--vscode-editor-font-family, 'Microsoft YaHei', sans-serif);
      background: ${style.backgroundColor || 'var(--vscode-editor-background)'};
      color: var(--vscode-foreground);
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .waiting { text-align: center; color: var(--vscode-descriptionForeground); }
    .waiting .icon { font-size: 48px; margin-bottom: 16px; }
    .waiting p { margin: 4px 0; font-size: 14px; }
  </style>
</head>
<body>
  <div class="waiting">
    <div class="icon">🎵</div>
    <p>等待播放音乐...</p>
    <p style="font-size:12px">打开任意音乐播放器开始播放</p>
  </div>
</body>
</html>`;
  }

  /** HTML 转义 */
  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }
}
