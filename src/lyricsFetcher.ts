import type { TrackInfo, LyricsResult, LrcLine } from './types/index.js';
import type { ILyricsProvider } from './lyricsProviders/provider.js';
import { LrclibProvider } from './lyricsProviders/lrclibProvider.js';
import { NeteaseProvider } from './lyricsProviders/neteaseProvider.js';
import { QQMusicProvider } from './lyricsProviders/qqMusicProvider.js';
import { LocalProvider } from './lyricsProviders/localProvider.js';
import { parseLrc, isLrcFormat, toPlainText } from './lyricsProviders/lrcParser.js';
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

    // 3. 在线查找（如配置 online 或 both）
    if (!rawLyrics && (source === 'online' || source === 'both')) {
      const onlineProviderName = getConfig<string>('lyrics.onlineProvider', 'netease');
      const provider = this.providers.get(onlineProviderName);
      if (provider) {
        rawLyrics = await provider.search(track);
        if (rawLyrics) providerName = provider.name;
      }
    }

    // 4. 降级：如果首选失败且还有别的在线源，尝试 LRCLIB
    if (!rawLyrics && source === 'online') {
      const fallbackProvider = this.providers.get('lrclib')!;
      rawLyrics = await fallbackProvider.search(track);
      if (rawLyrics) providerName = fallbackProvider.name;
    }

    if (!rawLyrics) {
      logInfo(`未找到歌词: ${track.artist} - ${track.title}`);
      return null;
    }

    // 5. 解析歌词
    const result = this.parseLyrics(rawLyrics, providerName);
    this.cache.set(cacheKey, result);
    logInfo(`歌词已获取 [${providerName}]: ${track.artist} - ${track.title}`);
    return result;
  }

  /** 获取翻译（仅网易云支持内建翻译） */
  async fetchTranslation(track: TrackInfo): Promise<string | undefined> {
    try {
      const netease = this.providers.get('netease') as NeteaseProvider | undefined;
      if (!netease) return undefined;

      const result = await netease.searchWithTranslation(track);
      if (result?.tlyric) {
        return isLrcFormat(result.tlyric) ? toPlainText(result.tlyric) : result.tlyric;
      }
    } catch {
      // 翻译获取失败，静默降级
    }
    return undefined;
  }

  /** 清除缓存 */
  clearCache(): void {
    this.cache.clear();
    logInfo('歌词缓存已清除');
  }

  private parseLyrics(rawLyrics: string, source: string): LyricsResult {
    let lyrics: string;
    let lrcLines: LrcLine[] | undefined;

    if (isLrcFormat(rawLyrics)) {
      lrcLines = parseLrc(rawLyrics);
      lyrics = lrcLines.map(l => l.text).join('\n');
    } else {
      lyrics = rawLyrics;
      lrcLines = undefined;
    }

    return { lyrics, lrcLines, source };
  }

  private cacheKey(track: TrackInfo): string {
    return `${track.artist.toLowerCase().trim()}|${track.title.toLowerCase().trim()}`;
  }
}

// re-export NeteaseProvider for translation
import { NeteaseProvider } from './lyricsProviders/neteaseProvider.js';
