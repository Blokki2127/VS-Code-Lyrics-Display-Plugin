import * as vscode from 'vscode';
import type { StyleConfig } from '../types/index.js';

/** 获取指定配置值 */
export function getConfig<T>(section: string, defaultValue: T): T {
  return vscode.workspace.getConfiguration().get<T>(section, defaultValue);
}

/** 读取所有样式配置 */
export function getStyleConfig(): StyleConfig {
  const cfg = vscode.workspace.getConfiguration('lyrics.style');
  return {
    activeFontSize:          cfg.get<number>('activeFontSize', 20),
    normalFontSize:           cfg.get<number>('normalFontSize', 14),
    activeFontWeight:         cfg.get<string>('activeFontWeight', '500'),
    activeLineColor:          cfg.get<string>('activeLineColor', ''),
    normalLineColor:          cfg.get<string>('normalLineColor', ''),
    inactiveOpacity:          cfg.get<number>('inactiveOpacity', 0.5),
    translationFontSize:      cfg.get<number>('translationFontSize', 12),
    translationColor:         cfg.get<string>('translationColor', ''),
    transliterationFontSize:  cfg.get<number>('transliterationFontSize', 12),
    transliterationColor:     cfg.get<string>('transliterationColor', ''),
    transliterationItalic:    cfg.get<boolean>('transliterationItalic', true),
    lineSpacing:              cfg.get<number>('lineSpacing', 4),
    transitionDuration:       cfg.get<number>('transitionDuration', 300),
    backgroundColor:          cfg.get<string>('backgroundColor', ''),
  };
}

/** 获取面板列（根据配置映射） */
export function getPanelColumn(): vscode.ViewColumn {
  const pos = getConfig<string>('lyrics.panelPosition', 'beside');
  switch (pos) {
    case 'active': return vscode.ViewColumn.Active;
    case 'bottom': return vscode.ViewColumn.Beside; // VS Code 不支持指定"底部面板"，映射为侧边
    default:       return vscode.ViewColumn.Beside;
  }
}

/** 格式化秒数为 mm:ss */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
