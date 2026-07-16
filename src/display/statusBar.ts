import * as vscode from 'vscode';
import type { TrackInfo } from '../types/index.js';
import { formatTime } from '../utils/config.js';

/**
 * 状态栏曲目信息显示
 * - 显示 ▶ 歌手 - 歌名
 * - Hover 显示详情
 * - 无点击交互
 * - 无播放时自动隐藏
 */
export class StatusBarDisplay {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.name = '歌词显示';
  }

  /** 更新曲目信息 */
  update(track: TrackInfo | null): void {
    if (!track || track.playbackStatus === 'Closed') {
      this.item.hide();
      return;
    }

    const icon = track.playbackStatus === 'Playing' ? '$(play)' : '$(debug-pause)';
    const text = `${icon} ${track.artist} - ${track.title}`;
    this.item.text = text.length > 50 ? text.substring(0, 47) + '...' : text;

    this.item.tooltip = [
      `${track.artist} - ${track.title}`,
      `专辑：${track.album || '未知'}`,
      `时长：${formatTime(track.duration)}`,
      `来源：${track.sourceApp}`,
    ].join('\n');

    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
