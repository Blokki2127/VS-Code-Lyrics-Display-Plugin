import * as https from 'https';
import type { TrackInfo } from '../types/index.js';
import type { ILyricsProvider } from './provider.js';
import { logInfo, logError } from '../utils/logger.js';

const LRCLIB_BASE = 'https://lrclib.net';

/**
 * LRCLIB 歌词提供器
 * 免费、无需 API Key、无限速
 */
export class LrclibProvider implements ILyricsProvider {
  readonly name = 'LRCLIB';

  async search(track: TrackInfo): Promise<string | null> {
    // 1. 精确匹配
    const exactResult = await this.exactSearch(track);
    if (exactResult) return exactResult;

    // 2. 降级搜索
    return await this.fuzzySearch(track);
  }

  private async exactSearch(track: TrackInfo): Promise<string | null> {
    const artist = encodeURIComponent(track.artist);
    const title = encodeURIComponent(track.title);
    const album = encodeURIComponent(track.album || track.title);
    const duration = Math.round(track.duration);

    const url = `${LRCLIB_BASE}/api/get?artist_name=${artist}&track_name=${title}&album_name=${album}&duration=${duration}`;

    try {
      const data = await this.httpGet(url);
      if (!data) return null;

      const parsed = JSON.parse(data);

      // 检查错误
      if (parsed.code === 404) return null;

      // 优先返回纯文本歌词
      if (parsed.plainLyrics) return parsed.plainLyrics;
      if (parsed.syncedLyrics) return parsed.syncedLyrics;

      return null;
    } catch (err) {
      logError('LRCLIB exact search error', err);
      return null;
    }
  }

  private async fuzzySearch(track: TrackInfo): Promise<string | null> {
    const artist = encodeURIComponent(track.artist);
    const title = encodeURIComponent(track.title);
    const url = `${LRCLIB_BASE}/api/search?track_name=${title}&artist_name=${artist}`;

    try {
      const data = await this.httpGet(url);
      if (!data) return null;

      const results = JSON.parse(data);
      if (!Array.isArray(results) || results.length === 0) return null;

      // 取第一个结果
      const first = results[0];
      if (first.plainLyrics) return first.plainLyrics;
      if (first.syncedLyrics) return first.syncedLyrics;

      return null;
    } catch (err) {
      logError('LRCLIB search error', err);
      return null;
    }
  }

  private httpGet(url: string): Promise<string | null> {
    return new Promise((resolve) => {
      https.get(url, { timeout: 5000 }, (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => resolve(body));
      }).on('error', () => resolve(null))
        .on('timeout', function(this: https.ClientRequest) { this.destroy(); resolve(null); });
    });
  }
}
