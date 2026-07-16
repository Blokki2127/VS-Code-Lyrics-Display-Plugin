import type { LrcLine } from '../types/index.js';

/**
 * 解析 LRC 歌词文本为结构化数组
 * 支持格式：[mm:ss.xx] 和 [mm:ss.xxx]
 */
export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];

  for (const line of lrc.split('\n')) {
    // 匹配 [mm:ss.xx] 或 [mm:ss.xxx] 格式
    const match = line.match(/^\[(\d{2}):(\d{2})[.:](\d{2,3})\](.*)/);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const fractional = parseInt(match[3], 10);
    const msDivisor = match[3].length === 3 ? 1000 : 100;
    const time = minutes * 60 + seconds + fractional / msDivisor;
    const text = match[4].trim();

    if (text) {
      lines.push({ time, text });
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

/**
 * 根据当前播放位置找到正在唱的句子索引
 * @returns 当前句索引，-1 表示还没到第一句
 */
export function findCurrentLineIndex(lines: LrcLine[], positionSec: number): number {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= positionSec) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}

/**
 * 提取纯文本（去除所有 LRC 时间戳标签）
 */
export function toPlainText(lrc: string): string {
  return lrc
    .split('\n')
    .map(line => line.replace(/^\[\d{2}:\d{2}[.:]\d{2,3}\]\s*/, ''))
    .filter(line => line.trim().length > 0)
    .join('\n');
}

/**
 * 检测文本是否为 LRC 格式
 */
export function isLrcFormat(text: string): boolean {
  return /^\[\d{2}:\d{2}[.:]\d{2,3}\]/.test(text.split('\n')[0]?.trim() ?? '');
}
