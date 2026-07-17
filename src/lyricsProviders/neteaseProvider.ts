import * as https from 'https';
import type { TrackInfo } from '../types/index.js';
import type { ILyricsProvider } from './provider.js';
import { logError, logInfo } from '../utils/logger.js';

const BASE = 'music.163.com';

export interface NeteaseLyricResult {
  lyrics: string;       // 原始歌词
  tlyric?: string;      // 翻译歌词
}

/**
 * 网易云音乐歌词提供器
 * 使用无需加密的 /api 端点（直接 HTTP GET）
 */
export class NeteaseProvider implements ILyricsProvider {
  readonly name = 'Netease';

  async search(track: TrackInfo): Promise<string | null> {
    const result = await this.searchWithTranslation(track);
    if (!result) return null;
    return result.lyrics;
  }

  /** 搜索并返回带翻译的歌词 */
  async searchWithTranslation(track: TrackInfo): Promise<NeteaseLyricResult | null> {
    try {
      const songId = await this.searchSong(track);
      if (!songId) return null;

      return await this.getLyric(songId);
    } catch (err) {
      logError('Netease search error', err);
      return null;
    }
  }

  private async searchSong(track: TrackInfo): Promise<number | null> {
    const keyword = encodeURIComponent(`${track.artist} ${track.title}`);
    const path = `/api/search/get?s=${keyword}&type=1&limit=5`;

    const body = await this.httpGet(path);
    if (!body) return null;

    try {
      const parsed = JSON.parse(body);
      const songs = parsed?.result?.songs;
      if (!songs || songs.length === 0) return null;

      // 精确匹配歌名
      for (const song of songs) {
        if (song.name?.toLowerCase() === track.title.toLowerCase()) {
          logInfo(`Netease exact match: ${song.name} (id:${song.id})`);
          return song.id;
        }
      }

      // 模糊匹配
      logInfo(`Netease fuzzy match: ${songs[0].name} (id:${songs[0].id})`);
      return songs[0].id;
    } catch {
      return null;
    }
  }

  private async getLyric(songId: number): Promise<NeteaseLyricResult | null> {
    const path = `/api/song/lyric?id=${songId}&lv=1&tv=1`;

    const body = await this.httpGet(path);
    if (!body) return null;

    try {
      const parsed = JSON.parse(body);
      const lrc = parsed?.lrc?.lyric || '';
      const tlyric = parsed?.tlyric?.lyric || '';

      if (!lrc) return null;

      return { lyrics: lrc, tlyric: tlyric || undefined };
    } catch {
      return null;
    }
  }

  private httpGet(path: string): Promise<string | null> {
    return new Promise((resolve) => {
      const options = {
        hostname: BASE,
        path,
        method: 'GET',
        headers: {
          'Referer': 'https://music.163.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 8000,
      };

      https.get(options, (res) => {
        if (res.statusCode !== 200) { resolve(null); return; }
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => resolve(body));
      }).on('error', () => resolve(null))
        .on('timeout', function(this: https.ClientRequest) { this.destroy(); resolve(null); });
    });
  }
}
