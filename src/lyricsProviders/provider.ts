import type { TrackInfo, LyricsResult } from '../types/index.js';

/** 歌词提供器接口 — 每个实现负责从一种来源获取歌词 */
export interface ILyricsProvider {
  readonly name: string;

  /**
   * 搜索歌词
   * @param track 当前播放曲目信息
   * @returns 原始歌词文本（可能含 LRC 时间戳），未找到返回 null
   */
  search(track: TrackInfo): Promise<string | null>;
}

/** 歌词获取结果 */
export type { LyricsResult };
