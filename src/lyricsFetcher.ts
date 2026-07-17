import type { TrackInfo, LyricsResult, LrcLine } from './types/index.js';
import type { ILyricsProvider } from './lyricsProviders/provider.js';
import { LrclibProvider } from './lyricsProviders/lrclibProvider.js';
import { NeteaseProvider } from './lyricsProviders/neteaseProvider.js';
import { QQMusicProvider } from './lyricsProviders/qqMusicProvider.js';
import { LocalProvider } from './lyricsProviders/localProvider.js';
import { parseLrc, isLrcFormat, toPlainText, stripLyricTimestamps } from './lyricsProviders/lrcParser.js';
import { getConfig } from './utils/config.js';
import { logInfo, logError } from './utils/logger.js';

/**
 * 歌词获取编排器
 * 管理多提供器、缓存、翻译获取
 */
export class LyricsFetcher {
  private cache: Map<string, LyricsResult> = new Map();
  private providers: Map<string, ILyricsProvider> = new Map();

  constructor() {
    // 注册所有提供器
    this.providers.set('lrclib', new LrclibProvider());
    this.providers.set('netease', new NeteaseProvider());
    this.providers.set('qqmusic', new QQMusicProvider());
    this.providers.set('local', new LocalProvider());
  }

  /** 获取歌词（含解析） */
  async fetchLyrics(track: TrackInfo): Promise<LyricsResult | null> {
    const cacheKey = this.cacheKey(track);

    // 1. 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logInfo(`缓存命中: ${track.artist} - ${track.title}`);
      return cached;
    }

    const source = getConfig<string>('lyrics.source', 'online');
    let rawLyrics: string | null = null;
    let providerName: string = 'none';

    // 2. 本地查找（如配置 local 或 both）
    if (source === 'local' || source === 'both') {
      const localProvider = this.providers.get('local')!;
      rawLyrics = await localProvider.search(track);
      if (rawLyrics) providerName = 'local';
    }

    let translation: string | undefined;

    // 3. 在线查找（如配置 online 或 both）
    if (!rawLyrics && (source === 'online' || source === 'both')) {
      const onlineProviderName = getConfig<string>('lyrics.onlineProvider', 'netease');
      ({ rawLyrics, translation, providerName } = await this.tryProvider(onlineProviderName, track));
    }

    // 4. 降级：首选失败 → 逐一尝试其他在线源
    if (!rawLyrics) {
      const fallbackOrder = ['qqmusic', 'lrclib', 'netease'];
      for (const name of fallbackOrder) {
        if (name === getConfig<string>('lyrics.onlineProvider', 'netease')) continue;
        ({ rawLyrics, translation, providerName } = await this.tryProvider(name, track));
        if (rawLyrics) break;
      }
    }

    if (!rawLyrics) {
      logInfo(`未找到歌词: ${track.artist} - ${track.title}`);
      return null;
    }

    // 5. 解析歌词
    const result = this.parseLyrics(rawLyrics, providerName, translation);
    this.cache.set(cacheKey, result);
    logInfo(`歌词已获取 [${providerName}]: ${track.artist} - ${track.title}${translation ? ' (含翻译)' : ''}`);
    return result;
  }

  /** 尝试单个提供器，Netease 则同时获取翻译 */
  private async tryProvider(name: string, track: TrackInfo): Promise<{
    rawLyrics: string | null;
    translation?: string;
    providerName: string;
  }> {
    const provider = this.providers.get(name);
    if (!provider) return { rawLyrics: null, providerName: 'none' };

    if (name === 'netease') {
      const netease = provider as NeteaseProvider;
      const result = await netease.searchWithTranslation(track);
      if (result) {
        const trans = result.tlyric
          ? stripLyricTimestamps(result.tlyric)
          : undefined;
        return { rawLyrics: result.lyrics, translation: trans, providerName: netease.name };
      }
      return { rawLyrics: null, providerName: 'none' };
    }

    const raw = await provider.search(track);
    return { rawLyrics: raw, providerName: raw ? provider.name : 'none' };
  }

  /** 清除缓存 */
  clearCache(): void {
    this.cache.clear();
    logInfo('歌词缓存已清除');
  }

  private parseLyrics(rawLyrics: string, source: string, translation?: string): LyricsResult {
    let lyrics: string;
    let lrcLines: LrcLine[] | undefined;

    if (isLrcFormat(rawLyrics)) {
      lrcLines = parseLrc(rawLyrics);
      lyrics = lrcLines.map(l => l.text).join('\n');
    } else {
      lyrics = rawLyrics;
      lrcLines = undefined;
    }

    return { lyrics, lrcLines, source, translation };
  }

  private cacheKey(track: TrackInfo): string {
    return `${track.artist.toLowerCase().trim()}|${track.title.toLowerCase().trim()}`;
  }
}

// re-export NeteaseProvider for translation
import { NeteaseProvider } from './lyricsProviders/neteaseProvider.js';
