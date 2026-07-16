import * as https from 'https';
import type { TrackInfo } from '../types/index.js';
import type { ILyricsProvider } from './provider.js';
import { logError } from '../utils/logger.js';
import { getConfig } from '../utils/config.js';

/** 网易云 API 默认地址 */
const DEFAULT_API = 'https://netease-cloud-music-api-cyan-psi.vercel.app';

export interface NeteaseLyricResult {
  lyrics: string;       // 原始歌词
  tlyric?: string;      // 翻译歌词（可能为空）
}

/**
 * 网易云音乐歌词提供器
 * 使用 NeteaseCloudMusicApi 公开代理
 */
export class NeteaseProvider implements ILyricsProvider {
  readonly name = 'Netease';

  private get baseUrl(): string {
    return getConfig<string>('lyrics.neteaseApiUrl', '') || DEFAULT_API;
  }

  async search(track: TrackInfo): Promise<string | null> {
    try {
      // 1. 搜索歌曲 ID
      const songId = await this.searchSong(track);
      if (!songId) return null;

      // 2. 获取歌词
      const lyric = await this.getLyric(songId);
      if (!lyric) return null;

      return lyric.lyrics;
    } catch (err) {
      logError('Netease search error', err);
      return null;
    }
  }

  /** 搜索并返回翻译歌词 */
  async searchWithTranslation(track: TrackInfo): Promise<NeteaseLyricResult | null> {
    try {
      const songId = await this.searchSong(track);
      if (!songId) return null;

      return await this.getLyric(songId);
    } catch (err) {
      logError('Netease searchWithTranslation error', err);
      return null;
    }
  }

  private async searchSong(track: TrackInfo): Promise<number | null> {
    const keywords = encodeURIComponent(`${track.artist} ${track.title}`);
    const url = `${this.baseUrl}/search?keywords=${keywords}&limit=3&type=1`;

    const data = await this.httpGet(url);
    if (!data) return null;

    const parsed = JSON.parse(data);
    const songs = parsed?.result?.songs;

    if (!songs || songs.length === 0) return null;

    // 优先匹配歌名完全一致的
    for (const song of songs) {
      if (song.name?.toLowerCase() === track.title.toLowerCase()) {
        return song.id;
      }
    }

    // 降级：返回第一个结果
    return songs[0].id;
  }

  private async getLyric(songId: number): Promise<NeteaseLyricResult | null> {
    const url = `${this.baseUrl}/lyric?id=${songId}`;
    const data = await this.httpGet(url);
    if (!data) return null;

    const parsed = JSON.parse(data);
    const lrc = parsed?.lrc?.lyric || '';
    const tlyric = parsed?.tlyric?.lyric || '';

    if (!lrc) return null;

    return { lyrics: lrc, tlyric: tlyric || undefined };
  }

  private httpGet(url: string): Promise<string | null> {
    return new Promise((resolve) => {
      https.get(url, { timeout: 8000 }, (res) => {
        if (res.statusCode !== 200) { resolve(null); return; }
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => resolve(body));
      }).on('error', () => resolve(null))
        .on('timeout', function(this: https.ClientRequest) { this.destroy(); resolve(null); });
    });
  }
}
