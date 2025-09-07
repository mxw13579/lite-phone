// TypeScript（优化版）
import DB from '../database';
import type { Chat } from '../state';

interface ModalOptions {
  confirmText?: string;
  confirmButtonClass?: string;
}

interface Track {
  name: string;
  artist: string;
  src: string | Blob;
  isLocal: boolean;
  requiresReupload?: boolean;
}

type PlayMode = 'order' | 'random' | 'single';

interface MusicState {
  playlist: Track[];
  currentIndex: number;
  isPlaying: boolean;
  playMode: PlayMode;
  totalElapsedTime: number;
  isActive: boolean;
  activeChatId: string | null;
  timerId: number | null;
}

interface StateManager {
  state: {
    chats: Record<string, Chat>;
    activeChatId: string | null;
    globalSettings: any;
    personaPresets: any[];
    userStickers: any[];
  };
  musicState: MusicState;
}

const MODES: PlayMode[] = ['order', 'random', 'single'] as const;
const MODE_LABEL: Record<PlayMode, string> = { order: '顺序', random: '随机', single: '单曲' };

// Blob URL 缓存（空间换时间）+ 反查，用于统一释放
const blobURLCache = new WeakMap<Blob, string>();
const activeBlobURLs = new Set<string>();

// DOM 工具
const $id = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const $svg = (selector: string) => document.querySelector(selector) as SVGElement | null;
const setText = (el: Element | null, text: string) => { if (el) el.textContent = text; };
const setClass = (el: Element | null, on: boolean, cls: string) => { if (!el) return; el.classList[on ? 'add' : 'remove'](cls); };

// 状态/音频访问
const getState = () => (window as any).STATE as StateManager | null ?? null;
const getMusicState = () => getState()?.musicState ?? null;
// 缓存 audio 节点，避免重复查询
const audioEl: HTMLAudioElement | null = $id<HTMLAudioElement>('audio-player');

// 去抖
function debounce<T extends (...args: any[]) => any>(fn: T, wait = 200) {
  let t: number | null = null;
  return (...args: Parameters<T>) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => { t = null; fn(...args); }, wait);
  };
}

// 格式化
const formatHours = (seconds: number) => (seconds / 3600).toFixed(1);

// 播放安全封装：统一处理异常与状态
async function playSafe(): Promise<boolean> {
  const ms = getMusicState();
  if (!ms || !audioEl) return false;
  try {
    await audioEl.play();
    ms.isPlaying = true;
    return true;
  } catch (e) {
    // 常见：NotAllowedError, AbortError
    ms.isPlaying = false;
    return false;
  }
}

// 统一释放 blob URL
function revokeIfBlob(url: string) {
  if (url.startsWith('blob:') && activeBlobURLs.has(url)) {
    URL.revokeObjectURL(url);
    activeBlobURLs.delete(url);
  }
}

// 页面关闭时清理
window.addEventListener('unload', () => {
  for (const url of Array.from(activeBlobURLs)) revokeIfBlob(url);
});

// Page Visibility：不可见时暂停计时器自增（不暂停播放）
document.addEventListener('visibilitychange', () => {
  const ms = getMusicState();
  if (!ms || ms.timerId == null) return;
  const hidden = document.hidden;
  // 标记：隐藏时不自增，由计时器分支判断
  (ms as any).__pageHidden__ = hidden;
});

export class MusicService {
  // UI 批量更新
  private withUIUpdate<T>(fn: () => T, options: { player?: boolean; playlist?: boolean } = { player: true, playlist: true }): T {
    const ret = fn();
    if (options.player) this.updatePlayerUI();
    if (options.playlist) this.updatePlaylistUI();
    return ret;
  }

  // 播放/暂停
  togglePlayPause(): void {
    const ms = getMusicState();
    if (!ms || !audioEl) return;

    if (audioEl.paused) {
      if (ms.currentIndex === -1 && ms.playlist.length > 0) {
        this.playSong(0);
      } else if (ms.currentIndex > -1) {
        playSafe().finally(() => this.updatePlayerUI());
      }
    } else {
      audioEl.pause();
      ms.isPlaying = false;
      this.updatePlayerUI();
    }
  }

  // 组装音源并设置 src（本地 Blob 复用并记录 URL，减少 createObjectURL 次数）
  private setAudioSource(track: Track): boolean {
    if (!audioEl) return false;
    if (track.isLocal && track.src instanceof Blob) {
      let url = blobURLCache.get(track.src);
      if (!url) {
        url = URL.createObjectURL(track.src);
        blobURLCache.set(track.src, url);
        activeBlobURLs.add(url);
      }
      audioEl.src = url;
      return true;
    }
    if (!track.isLocal && typeof track.src === 'string') {
      audioEl.src = track.src;
      return true;
    }
    console.warn('无效的歌曲源:', track);
    return false;
  }

  // 播放指定索引
  playSong(index: number): void {
    const ms = getMusicState();
    if (!ms || !audioEl) return;
    if (index < 0 || index >= ms.playlist.length) return;

    // 释放上一首 blob URL（仅在切歌且是本地 URL 时）
    if (ms.currentIndex >= 0) revokeIfBlob(audioEl.src);

    ms.currentIndex = index;
    const track = ms.playlist[index];
    if (!this.setAudioSource(track)) return;

    // 单曲循环通过 audio.loop 控制，避免自定义 next 逻辑多处判断
    audioEl.loop = ms.playMode === 'single';

    playSafe().then((ok) => {
      this.updateListenTogetherIcon(ms.activeChatId || null);
      // 播放失败时也更新 UI，保持一致
      this.updatePlayerUI();
      this.updatePlaylistUI();
    });
  }

  // 计算下一首（随机模式避免重复：多次抽样 + 回退）
  private nextIndexByMode(ms: MusicState): number {
    const len = ms.playlist.length;
    if (len === 0) return -1;
    if (ms.playMode === 'single') return ms.currentIndex;

    if (ms.playMode === 'random') {
      if (len === 1) return 0;
      // 尝试最多 3 次避免重复，否则顺移
      for (let i = 0; i < 3; i++) {
        const r = Math.floor(Math.random() * len);
        if (r !== ms.currentIndex) return r;
      }
      return (ms.currentIndex + 1) % len;
    }

    // order
    return (ms.currentIndex + 1) % len;
  }

  playNext(): void {
    const ms = getMusicState();
    if (!ms || ms.playlist.length === 0) return;
    const next = this.nextIndexByMode(ms);
    if (next !== -1) this.playSong(next);
  }

  playPrev(): void {
    const ms = getMusicState();
    if (!ms || ms.playlist.length === 0) return;
    const len = ms.playlist.length;
    const idx = ms.currentIndex < 0 ? 0 : (ms.currentIndex - 1 + len) % len;
    this.playSong(idx);
  }

  changePlayMode(): void {
    const ms = getMusicState();
    if (!ms) return;
    const i = MODES.indexOf(ms.playMode);
    ms.playMode = MODES[(i + 1) % MODES.length];
    if (audioEl) audioEl.loop = ms.playMode === 'single';

    const modeBtn = $id('music-mode-btn');
    setText(modeBtn, MODE_LABEL[ms.playMode]);
  }

  async addSongFromURL(): Promise<void> {
    const ms = getMusicState();
    if (!ms) return;

    // 并行收集输入，减少交互等待
    const url = await this.showCustomPrompt('添加网络歌曲', '请输入歌曲的URL', '', 'url');
    if (!url) return;
    const [name, artist] = await Promise.all([
      this.showCustomPrompt('歌曲信息', '请输入歌名'),
      this.showCustomPrompt('歌曲信息', '请输入歌手名'),
    ]);
    if (!name || !artist) return;

    await this.withUIUpdate(async () => {
      ms.playlist.push({ name, artist, src: url, isLocal: false });
      await this.saveGlobalPlaylist();
      if (ms.currentIndex === -1) ms.currentIndex = ms.playlist.length - 1;
    });
  }

  async addSongFromLocal(files: FileList): Promise<void> {
    const ms = getMusicState();
    if (!ms || !files.length) return;

    const toAdd: Track[] = [];
    for (const file of Array.from(files)) {
      const [name, artist] = await Promise.all([
        this.showCustomPrompt('歌曲信息', '请输入歌名', file.name.replace(/\.[^.]+$/, '')),
        this.showCustomPrompt('歌曲信息', '请输入歌手名', ''),
      ]);
      if (!name || !artist) continue;
      toAdd.push({ name, artist, src: file, isLocal: true, requiresReupload: false });
    }
    if (!toAdd.length) return;

    await this.withUIUpdate(async () => {
      ms.playlist.push(...toAdd);
      await this.saveGlobalPlaylist();
      if (ms.currentIndex === -1 && ms.playlist.length > 0) ms.currentIndex = 0;
    });
  }

  async deleteTrack(index: number): Promise<void> {
    const ms = getMusicState();
    if (!ms || !audioEl) return;
    if (index < 0 || index >= ms.playlist.length) return;

    const track = ms.playlist[index];
    const wasCurrent = ms.currentIndex === index;
    const wasPlaying = ms.isPlaying && wasCurrent;

    // 如当前正在播放本地 URL，释放
    if (wasCurrent) revokeIfBlob(audioEl.src);

    await this.withUIUpdate(async () => {
      ms.playlist.splice(index, 1);
      await this.saveGlobalPlaylist();

      if (ms.playlist.length === 0) {
        if (!audioEl.paused) audioEl.pause();
        audioEl.src = '';
        ms.currentIndex = -1;
        ms.isPlaying = false;
        return;
      }

      if (wasPlaying) {
        ms.currentIndex = Math.min(index, ms.playlist.length - 1);
        this.playNext();
      } else if (ms.currentIndex >= index) {
        ms.currentIndex = Math.max(0, ms.currentIndex - 1);
      }
    });
  }

  updatePlayerUI(): void {
    const ms = getMusicState();
    if (!ms) return;

    this.updateListenTogetherIcon(ms.activeChatId);
    this.updateElapsedTimeDisplay();

    const titleEl = $id('music-player-song-title');
    const artistEl = $id('music-player-artist');
    const playPauseBtn = $id('music-play-pause-btn');

    if (ms.currentIndex > -1 && ms.playlist.length > 0) {
      const track = ms.playlist[ms.currentIndex];
      setText(titleEl, track.name);
      setText(artistEl, track.artist);
    } else {
      setText(titleEl, '请添加歌曲');
      setText(artistEl, '...');
    }

    if (playPauseBtn) {
      const playing = audioEl ? !audioEl.paused : ms.isPlaying;
      playPauseBtn.textContent = playing ? '❚❚' : '▶';
    }
  }

  updateElapsedTimeDisplay(): void {
    const ms = getMusicState();
    if (!ms) return;
    const timeCounter = $id('music-time-counter');
    if (timeCounter) {
      timeCounter.textContent = `已经一起听了${formatHours(ms.totalElapsedTime)}小时`;
    }
  }

  // 列表渲染：keyed diff，避免全量重建
  updatePlaylistUI(): void {
    const ms = getMusicState();
    const container = $id('playlist-body');
    if (!ms || !container) return;

    // 一次性委托绑定
    if (!(container as any).__delegated__) {
      container.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        const delBtn = target.closest('.delete-track-btn') as HTMLElement | null;
        if (delBtn?.dataset.index) {
          e.stopPropagation();
          const idx = Number(delBtn.dataset.index);
          const track = ms.playlist[idx];
          if (!track) return;
          const c = await this.showCustomConfirm('删除歌曲', `确定要从播放列表中删除《${track.name}》吗？`);
          if (c) this.deleteTrack(idx);
          return;
        }

        const item = target.closest('.playlist-item') as HTMLElement | null;
        if (item?.dataset.index) this.playSong(Number(item.dataset.index));
      });
      (container as any).__delegated__ = true;
    }

    // 空列表
    if (ms.playlist.length === 0) {
      container.textContent = '';
      const emptyP = document.createElement('p');
      emptyP.style.textAlign = 'center';
      emptyP.style.padding = '20px';
      emptyP.style.color = '#888';
      emptyP.textContent = '播放列表是空的~';
      container.appendChild(emptyP);
      return;
    }

    // keyed diff by index（稳定索引）
    const existing = Array.from(container.querySelectorAll<HTMLElement>('.playlist-item'));
    const used = new Set<number>();

    // 更新/创建
    const frag = document.createDocumentFragment();
    ms.playlist.forEach((track, index) => {
      let node = existing[index];
      if (!node) {
        node = document.createElement('div');
        node.className = 'playlist-item';
        const info = document.createElement('div');
        info.className = 'playlist-item-info';
        const titleDiv = document.createElement('div');
        titleDiv.className = 'title';
        const artistDiv = document.createElement('div');
        artistDiv.className = 'artist';
        info.appendChild(titleDiv);
        info.appendChild(artistDiv);

        const deleteBtn = document.createElement('span');
        deleteBtn.className = 'delete-track-btn';
        deleteBtn.textContent = '×';

        node.appendChild(info);
        node.appendChild(deleteBtn);
      }
      node.dataset.index = String(index);
      node.classList.toggle('playing', index === ms.currentIndex);
      (node.querySelector('.title') as HTMLElement).textContent = track.name;
      (node.querySelector('.artist') as HTMLElement).textContent = track.artist;
      const del = node.querySelector('.delete-track-btn') as HTMLElement;
      del.dataset.index = String(index);

      frag.appendChild(node);
      used.add(index);
    });

    // 清空并一次性插入（避免逐个 DOM 操作）
    container.textContent = '';
    container.appendChild(frag);
  }

  async startListenTogetherSession(chatId: string): Promise<void> {
    const ms = getMusicState();
    const state = getState();
    if (!ms || !state?.state) return;

    const chat = state.state.chats[chatId];
    if (!chat) return;

    ms.totalElapsedTime = chat.musicData?.totalTime || 0;
    ms.isActive = true;
    ms.activeChatId = chatId;

    if (ms.currentIndex < 0 && ms.playlist.length > 0) ms.currentIndex = 0;

    if (ms.timerId) clearInterval(ms.timerId);
    ms.timerId = window.setInterval(() => {
      const playing = audioEl ? !audioEl.paused : ms.isPlaying;
      const hidden = (ms as any).__pageHidden__ as boolean | undefined;
      if (playing && !hidden) {
        ms.totalElapsedTime++;
        this.updateElapsedTimeDisplay();
      }
    }, 1000);

    this.updatePlayerUI();
    this.updatePlaylistUI();

    const overlay = $id('music-player-overlay');
    setClass(overlay, true, 'visible');
  }

  async endListenTogetherSession(saveState = true): Promise<void> {
    const ms = getMusicState();
    const state = getState();
    if (!ms || !ms.isActive) return;

    const oldChatId = ms.activeChatId;

    if (ms.timerId) clearInterval(ms.timerId);
    if (audioEl && !audioEl.paused) audioEl.pause();
    ms.isPlaying = false;

    if (saveState && oldChatId && state?.state.chats[oldChatId]) {
      const chat = state.state.chats[oldChatId];
      if (!chat.musicData) chat.musicData = { totalTime: 0 };
      chat.musicData.totalTime = ms.totalElapsedTime;
      await DB.saveChat(chat);
    }

    ms.isActive = false;
    ms.activeChatId = null;
    ms.totalElapsedTime = 0;
    ms.timerId = null;

    const overlay = $id('music-player-overlay');
    const panel = $id('music-playlist-panel');
    setClass(overlay, false, 'visible');
    setClass(panel, false, 'visible');

    this.updateListenTogetherIcon(oldChatId, true);
  }

  updateListenTogetherIcon(chatId: string | null, forceReset = false): void {
    const ms = getMusicState();
    const icon = $svg('#listen-together-icon');
    if (!icon) return;

    if (forceReset || !ms?.isActive || ms.activeChatId !== chatId) {
      icon.classList.remove('rotating', 'paused');
      return;
    }
    icon.classList.add('rotating');

    const playing = audioEl ? !audioEl.paused : !!ms.isPlaying;
    icon.classList.toggle('paused', !playing);
  }

  async handleListenTogetherClick(): Promise<void> {
    const state = getState();
    const ms = getMusicState();
    if (!state?.state || !ms) return;

    const targetChatId = state.state.activeChatId;
    if (!targetChatId) return;

    if (!ms.isActive) {
      this.startListenTogetherSession(targetChatId);
      return;
    }

    if (ms.activeChatId === targetChatId) {
      const overlay = $id('music-player-overlay');
      setClass(overlay, true, 'visible');
    } else {
      const oldName = state.state.chats[ms.activeChatId!]?.name || '未知';
      const newName = state.state.chats[targetChatId]?.name || '当前';
      const confirmed = await this.showCustomConfirm('切换听歌对象', `您正和「${oldName}」听歌。要结束并开始和「${newName}」的新会话吗？`, { confirmButtonClass: 'btn-danger' });
      if (confirmed) {
        await this.endListenTogetherSession(true);
        await new Promise(r => setTimeout(r, 50));
        this.startListenTogetherSession(targetChatId);
      }
    }
  }

  // 持久化：不存 Blob 本体，仅存元数据；避免空间放大与不可序列化
  private saveGlobalPlaylistImpl = async (): Promise<void> => {
    const ms = getMusicState();
    if (!ms) return;
    const serializable = ms.playlist.map(t => {
      if (t.isLocal && t.src instanceof Blob) {
        const { name, artist } = t;
        return { name, artist, isLocal: true, src: '', requiresReupload: true } as Track;
      }
      return t;
    });
    await DB.saveMusicLibrary({ playlist: serializable as any });
  };
  private saveGlobalPlaylist = debounce(this.saveGlobalPlaylistImpl, 250);

  // 交互
  private showCustomPrompt(title: string, placeholder: string, initialValue = '', type = 'text'): Promise<string | null> {
    const win = window as any;
    if (typeof win.showCustomPrompt === 'function') {
      return win.showCustomPrompt(title, placeholder, initialValue, type);
    }
    const val = prompt(`${title}\n${placeholder}`, initialValue);
    return Promise.resolve(val);
  }

  private showCustomConfirm(title: string, message: string, options: ModalOptions = {}): Promise<boolean> {
    const win = window as any;
    if (typeof win.showCustomConfirm === 'function') {
      return win.showCustomConfirm(title, message, options);
    }
    return Promise.resolve(confirm(`${title}\n${message}`));
  }
}

export const musicService = new MusicService();
