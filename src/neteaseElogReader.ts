import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { EventEmitter } from 'events';

export interface ElogTrackInfo {
  artist: string;
  title: string;
  album: string;
  duration: number;
  position: number;
  isPlaying: boolean;
  sourceApp: string;
}

interface TrackCache {
  name: string;
  artists: string;
  album: string;
  duration: number;
}

/**
 * 网易云 elog 事件读取器
 * 监控 cloudmusic.elog，实时解析播放事件（含精确位置）
 * 参考：MyLifeTracker/StalinDev54
 */
export class NeteaseElogReader extends EventEmitter {
  private filePath: string;
  private fileSize = 0;
  private watchTimer: ReturnType<typeof setInterval> | null = null;

  // 播放状态
  private currentSongId = -1;
  private currentTrackName = '';
  private currentArtist = '';
  private currentAlbum = '';
  private currentDuration = 0;
  private isPlaying = false;
  private lastPosition = 0;
  private relativeTime = 0;

  // songId → track info 缓存（从 privilege/playlist 事件预填）
  private trackCache = new Map<number, TrackCache>();

  constructor() {
    super();
    this.filePath = path.join(
      process.env.LOCALAPPDATA || '',
      'NetEase/CloudMusic/cloudmusic.elog'
    );
  }

  get position(): number {
    if (this.isPlaying) {
      return Math.min(
        (Date.now() - this.relativeTime) / 1000,
        this.currentDuration || Infinity
      );
    }
    return this.lastPosition;
  }

  get trackInfo(): ElogTrackInfo | null {
    if (this.currentSongId === -1) return null;
    return {
      artist: this.currentArtist,
      title: this.currentTrackName,
      album: this.currentAlbum,
      duration: this.currentDuration,
      position: this.position,
      isPlaying: this.isPlaying,
      sourceApp: 'cloudmusic.exe',
    };
  }

  start(): void {
    try {
      if (!fs.existsSync(this.filePath)) {
        console.log('[Elog] File not found:', this.filePath);
        return;
      }

      const buffer = fs.readFileSync(this.filePath);
      const decoded = this.decode(buffer);
      const lines = decoded.split('\n');

      this.recoverState(lines);
      this.fileSize = buffer.length;
      this.watchTimer = setInterval(() => this.poll(), 500);

      console.log('[Elog] Started, songId:', this.currentSongId, 'track:', this.currentTrackName);
    } catch (err) {
      console.error('[Elog] Start error:', err);
    }
  }

  stop(): void {
    if (this.watchTimer) { clearInterval(this.watchTimer); this.watchTimer = null; }
  }

  private poll(): void {
    try {
      const stats = fs.statSync(this.filePath);
      if (stats.size < this.fileSize) { this.fileSize = 0; }

      if (stats.size > this.fileSize) {
        const fd = fs.openSync(this.filePath, 'r');
        const buf = Buffer.alloc(stats.size - this.fileSize);
        fs.readSync(fd, buf, 0, buf.length, this.fileSize);
        fs.closeSync(fd);
        this.fileSize = stats.size;

        const decoded = this.decode(new Uint8Array(buf));
        for (const line of decoded.split('\n')) {
          const t = line.trim();
          if (t) this.processLine(t);
        }
      }

      if (this.isPlaying) {
        this.emit('position', this.position);
      }
    } catch { /* silent */ }
  }

  /** 从历史日志恢复状态 */
  private recoverState(lines: string[]): void {
    const relevant: string[] = [];
    let foundExit = false;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.includes('【app】,{"actionId":"exitApp"}')) { foundExit = true; break; }
      if (
        line.includes('【playing】,"playOneTrackInPlayingList"') ||
        line.includes('【playing】,"checkPlayPrivilege"') ||
        line.includes('【playing】,"setPlayingPosition"') ||
        line.includes('【playing】,"native播放state"') ||
        line.includes('【playing】,"native播放资源load完成，开始播放"')
      ) {
        relevant.unshift(line);
      }
    }

    if (foundExit) return;

    let songId = -1, trackName = '', artist = '', album = '', duration = 0;
    let playing = false, position = 0, relativeTime = 0;

    for (const line of relevant) {
      this.applyLine(line, (sid, info) => {
        songId = sid; trackName = info?.name || ''; artist = info?.artists || '';
        album = info?.album || ''; duration = info?.duration || 0;
        playing = true; position = 0; relativeTime = Date.now();
      }, (pos) => {
        position = pos;
        if (playing) relativeTime = Date.now() - pos * 1000;
      }, (newPlaying) => {
        if (newPlaying && !playing) relativeTime = Date.now() - position * 1000;
        else if (!newPlaying && playing) position = (Date.now() - relativeTime) / 1000;
        playing = newPlaying;
      });
    }

    this.currentSongId = songId;
    this.currentTrackName = trackName;
    this.currentArtist = artist;
    this.currentAlbum = album;
    this.currentDuration = duration;
    this.isPlaying = playing;
    this.lastPosition = position;
    this.relativeTime = relativeTime;

    if (songId !== -1) {
      console.log(`[Elog] Recovered: ${artist} - ${trackName}, playing=${playing}, pos=${this.position.toFixed(1)}s`);
    }
  }

  /** 处理新日志行 */
  private processLine(line: string): void {
    if (!line || !line.includes('【playing】')) return;

    const now = Date.now();

    this.applyLine(line, (newId, info) => {
      if (newId === this.currentSongId) return;

      this.currentSongId = newId;
      this.currentTrackName = info?.name || '';
      this.currentArtist = info?.artists || '';
      this.currentAlbum = info?.album || '';
      this.currentDuration = info?.duration || 0;
      this.isPlaying = true;
      this.lastPosition = 0;
      this.relativeTime = now;

      const ti = this.trackInfo;
      if (ti) {
        console.log('[Elog] Track change:', ti.artist, '-', ti.title);
        this.emit('trackChange', ti);
      }
    }, (pos) => {
      this.lastPosition = pos;
      if (this.isPlaying) this.relativeTime = now - pos * 1000;
      this.emit('position', this.position);
    }, (newPlaying) => {
      if (newPlaying && !this.isPlaying) this.relativeTime = now - this.lastPosition * 1000;
      else if (!newPlaying && this.isPlaying) this.lastPosition = (now - this.relativeTime) / 1000;
      this.isPlaying = newPlaying;
      this.emit('status', this.isPlaying);
    });
  }

  /** 统一的事件应用逻辑 */
  private applyLine(
    line: string,
    onTrack: (songId: number, info: TrackCache | null) => void,
    onSeek: (pos: number) => void,
    onState: (playing: boolean) => void,
  ): void {
    // playOneTrackInPlayingList / checkPlayPrivilege → 切歌 + 缓存 track info
    if (line.includes('"playOneTrackInPlayingList"') || line.includes('"checkPlayPrivilege"')) {
      const data = this.extractJson(line);
      if (data) {
        const id = +(data.id || data.track?.id || 0);
        if (id > 0) {
          const info: TrackCache = {
            name: (data.track || data).name || '',
            artists: ((data.track || data).artists || []).map((a: {name: string}) => a.name).join('/'),
            album: ((data.track || data).album || {}).name || '',
            duration: ((data.track || data).duration || 0) / 1000,
          };
          this.trackCache.set(id, info);  // 填充缓存
          onTrack(id, info);
        }
      }
      return;
    }

    // native播放资源load完成，开始播放 → 切歌（仅 songId，从缓存查 track info）
    if (line.includes('"native播放资源load完成，开始播放"')) {
      const data = this.extractJson(line);
      if (data?.songId) {
        const sid = +data.songId;
        const cached = this.trackCache.get(sid);
        if (sid !== this.currentSongId) {
          if (!cached) {
            // 缓存未命中 → 异步查 API，同步先切
            console.log('[Elog] Cache miss for', sid, '- fetching from API');
            this.fetchTrackInfo(sid);
          }
          onTrack(sid, cached || null);
        }
      }
      return;
    }

    // setPlayingPosition → 拖动进度
    if (line.includes('"setPlayingPosition"')) {
      const m = line.match(/"setPlayingPosition",(\d+(?:\.\d+)?)/);
      if (m) onSeek(+m[1]);
      return;
    }

    // native播放state → 播放/暂停
    if (line.includes('"native播放state"')) {
      const m = line.match(/"native播放state",(\d+)/);
      if (m) onState(m[1] === '1');
      return;
    }
  }

  /** 通过 NetEase API 获取歌曲信息 */
  private fetchTrackInfo(songId: number): void {
    const url = `https://music.163.com/api/song/detail?ids=%5B${songId}%5D`;
    https.get(url, { timeout: 5000, headers: { 'Referer': 'https://music.163.com/' } }, (res) => {
      let body = '';
      res.on('data', (d: Buffer) => body += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(body);
          const song = j?.songs?.[0];
          if (song) {
            this.trackCache.set(songId, {
              name: song.name || '',
              artists: (song.ar || []).map((a: {name: string}) => a.name).join('/'),
              album: song.al?.name || '',
              duration: (song.dt || 0) / 1000,
            });
            // 如果当前正在播放这首歌，补充信息
            if (this.currentSongId === songId && !this.currentTrackName) {
              this.currentTrackName = song.name || '';
              this.currentArtist = (song.ar || []).map((a: {name: string}) => a.name).join('/');
              this.currentAlbum = song.al?.name || '';
              this.currentDuration = (song.dt || 0) / 1000;
              const ti = this.trackInfo;
              if (ti) {
                console.log('[Elog] Track info filled from API:', ti.artist, '-', ti.title);
                this.emit('trackChange', ti);
              }
            }
          }
        } catch { /* silent */ }
      });
    }).on('error', () => {});
  }

  /** 解码 elog 字节 */
  private decode(dataArray: Uint8Array): string {
    const bytesArr = Array.from(dataArray);
    const decodedBytes = bytesArr.map((byte) => {
      const hexDigit = (Math.floor(byte / 16) ^ ((byte % 16) + 8)) % 16;
      return hexDigit * 16 + Math.floor(byte / 64) * 4 + (~Math.floor(byte / 16) & 3);
    });
    let decodedBuf = new Uint8Array(decodedBytes);
    while (decodedBuf.length > 0) {
      try { return new TextDecoder('utf-8').decode(decodedBuf); }
      catch { decodedBuf = decodedBuf.slice(1); }
    }
    return '';
  }

  private extractJson(line: string): Record<string, unknown> | null {
    const match = line.match(/\{.*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]) as Record<string, unknown>; } catch { return null; }
  }

  dispose(): void { this.stop(); }
}
