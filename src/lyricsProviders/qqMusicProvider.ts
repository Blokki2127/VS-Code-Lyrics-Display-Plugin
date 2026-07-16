import * as https from 'https';
import type { TrackInfo } from '../types/index.js';
import type { ILyricsProvider } from './provider.js';
import { logError } from '../utils/logger.js';

/**
 * QQ音乐歌词提供器
 * 使用非官方搜索 + 歌词接口
 */
export class QQMusicProvider implements ILyricsProvider {
  readonly name = 'QQMusic';

  async search(track: TrackInfo): Promise<string | null> {
    try {
      // 1. 搜索歌曲
      const songMid = await this.searchSong(track);
      if (!songMid) return null;

      // 2. 获取歌词
      const lyric = await this.getLyric(songMid);
      return lyric;
    } catch (err) {
      logError('QQMusic search error', err);
      return null;
    }
  }

  private async searchSong(track: TrackInfo): Promise<string | null> {
    const keyword = encodeURIComponent(`${track.artist} ${track.title}`);
    const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${keyword}&format=json&n=5&t=0`;

    const data = await this.httpGet(url);
    if (!data) return null;

    const parsed = JSON.parse(data);
    const songs = parsed?.data?.song?.list;

    if (!songs || songs.length === 0) return null;

    // 优先匹配歌名
    for (const song of songs) {
      if (song.songname?.toLowerCase() === track.title.toLowerCase()) {
        return song.songmid;
      }
    }

    return songs[0].songmid;
  }

  private async getLyric(songMid: string): Promise<string | null> {
    const url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songMid}&format=json&nobase64=1`;

    const headers = {
      'Referer': 'https://y.qq.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    const data = await this.httpGet(url, headers);
    if (!data) return null;

    const parsed = JSON.parse(data);
    const lyric = parsed?.lyric || parsed?.data?.lyric || '';
    return lyric || null;
  }

  private httpGet(url: string, extraHeaders?: Record<string, string>): Promise<string | null> {
    return new Promise((resolve) => {
      const options = {
        timeout: 8000,
        headers: extraHeaders
      };
      https.get(url, options, (res) => {
        if (res.statusCode !== 200) { resolve(null); return; }
        let body = '';
        res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        res.on('end', () => resolve(body));
      }).on('error', () => resolve(null))
        .on('timeout', function(this: https.ClientRequest) { this.destroy(); resolve(null); });
    });
  }
}
