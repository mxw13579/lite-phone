/**
 * 音乐播放服务模块 - 独立版本
 * 
 * 提供完整的音乐播放功能，包括：
 * - 播放控制（播放/暂停、上一首/下一首）
 * - 播放模式切换（顺序/随机/单曲循环）
 * - 播放列表管理（添加/删除歌曲）
 * - "一起听"功能（多聊天对象音乐会话）
 * - UI更新与状态同步
 * 
 * 支持本地文件和网络URL两种音源
 */

import type { Chat } from '../state';

// === 类型定义 ===
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

interface MusicState {
  playlist: Track[];
  currentIndex: number;
  isPlaying: boolean;
  playMode: 'order' | 'random' | 'single';
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

interface DatabaseManager {
  db: {
    tables: any[];
    transaction: (mode: string, tables: any[], callback: () => Promise<void>) => Promise<void>;
    chats: any;
    userStickers: any;
    worldBooks: any;
    personaPresets: any;
    apiConfig: any;
    globalSettings: any;
    musicLibrary: any;
  };
}

// === 音乐播放服务类 ===
export class MusicService {
  // 音乐播放控制
  togglePlayPause(): void {
    const audioPlayer = document.getElementById('audio-player') as HTMLAudioElement;
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    
    if (!audioPlayer || !musicState) return;

    if (audioPlayer.paused) {
      if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
        this.playSong(0);
      } else if (musicState.currentIndex > -1) {
        audioPlayer.play();
      }
    } else {
      audioPlayer.pause();
    }
  }

  // 播放指定歌曲
  playSong(index: number): void {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    const audioPlayer = document.getElementById('audio-player') as HTMLAudioElement;
    
    if (!musicState || !audioPlayer || index < 0 || index >= musicState.playlist.length) return;

    musicState.currentIndex = index;
    const track = musicState.playlist[index];
    
    if (track.isLocal && track.src instanceof Blob) {
      audioPlayer.src = URL.createObjectURL(track.src);
    } else if (!track.isLocal) {
      audioPlayer.src = track.src as string;
    } else {
      console.error('本地歌曲源错误:', track);
      return;
    }

    audioPlayer.play();
    this.updatePlaylistUI();
    this.updatePlayerUI();
  }

  // 播放下一首
  playNext(): void {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    if (!musicState || musicState.playlist.length === 0) return;

    let nextIndex: number;
    switch (musicState.playMode) {
      case 'random':
        nextIndex = Math.floor(Math.random() * musicState.playlist.length);
        break;
      case 'single':
        this.playSong(musicState.currentIndex);
        return;
      case 'order':
      default:
        nextIndex = (musicState.currentIndex + 1) % musicState.playlist.length;
        break;
    }
    this.playSong(nextIndex);
  }

  // 播放上一首
  playPrev(): void {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    if (!musicState || musicState.playlist.length === 0) return;

    const newIndex = (musicState.currentIndex - 1 + musicState.playlist.length) % musicState.playlist.length;
    this.playSong(newIndex);
  }

  // 切换播放模式
  changePlayMode(): void {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    if (!musicState) return;

    const modes: Array<'order' | 'random' | 'single'> = ['order', 'random', 'single'];
    const currentModeIndex = modes.indexOf(musicState.playMode);
    musicState.playMode = modes[(currentModeIndex + 1) % modes.length];
    
    const modeBtn = document.getElementById('music-mode-btn');
    if (modeBtn) {
      modeBtn.textContent = {
        'order': '顺序',
        'random': '随机',
        'single': '单曲'
      }[musicState.playMode];
    }
  }

  // 从URL添加歌曲
  async addSongFromURL(): Promise<void> {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    if (!musicState) return;

    const url = await this.showCustomPrompt("添加网络歌曲", "请输入歌曲的URL", "", "url");
    if (!url) return;
    
    const name = await this.showCustomPrompt("歌曲信息", "请输入歌名");
    if (!name) return;
    
    const artist = await this.showCustomPrompt("歌曲信息", "请输入歌手名");
    if (!artist) return;

    musicState.playlist.push({name, artist, src: url, isLocal: false});
    await this.saveGlobalPlaylist();
    this.updatePlaylistUI();
    
    if (musicState.currentIndex === -1) {
      musicState.currentIndex = musicState.playlist.length - 1;
      this.updatePlayerUI();
    }
  }

  // 从本地添加歌曲
  async addSongFromLocal(files: FileList): Promise<void> {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    if (!musicState || !files.length) return;

    for (const file of Array.from(files)) {
      const name = await this.showCustomPrompt("歌曲信息", "请输入歌名", "");
      if (name === null) continue;
      
      const artist = await this.showCustomPrompt("歌曲信息", "请输入歌手名", "");
      if (artist === null) continue;

      musicState.playlist.push({name, artist, src: file, isLocal: true});
    }

    await this.saveGlobalPlaylist();
    this.updatePlaylistUI();
    
    if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
      musicState.currentIndex = 0;
      this.updatePlayerUI();
    }
  }

  // 删除曲目
  async deleteTrack(index: number): Promise<void> {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    const audioPlayer = document.getElementById('audio-player') as HTMLAudioElement;
    
    if (!musicState || !audioPlayer || index < 0 || index >= musicState.playlist.length) return;

    const track = musicState.playlist[index];
    const wasPlaying = musicState.isPlaying && musicState.currentIndex === index;

    // 清理本地URL
    if (track.isLocal && audioPlayer.src.startsWith('blob:') && musicState.currentIndex === index) {
      URL.revokeObjectURL(audioPlayer.src);
    }

    musicState.playlist.splice(index, 1);
    await this.saveGlobalPlaylist();

    if (musicState.playlist.length === 0) {
      if (musicState.isPlaying) audioPlayer.pause();
      audioPlayer.src = '';
      musicState.currentIndex = -1;
      musicState.isPlaying = false;
    } else {
      if (wasPlaying) {
        this.playNext();
      } else {
        if (musicState.currentIndex >= index) {
          musicState.currentIndex = Math.max(0, musicState.currentIndex - 1);
        }
      }
    }

    this.updatePlayerUI();
    this.updatePlaylistUI();
  }

  // 更新播放器UI
  updatePlayerUI(): void {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    if (!musicState) return;

    this.updateListenTogetherIcon(musicState.activeChatId);
    this.updateElapsedTimeDisplay();

    const titleEl = document.getElementById('music-player-song-title');
    const artistEl = document.getElementById('music-player-artist');
    const playPauseBtn = document.getElementById('music-play-pause-btn');

    if (titleEl && artistEl) {
      if (musicState.currentIndex > -1 && musicState.playlist.length > 0) {
        const track = musicState.playlist[musicState.currentIndex];
        titleEl.textContent = track.name;
        artistEl.textContent = track.artist;
      } else {
        titleEl.textContent = '请添加歌曲';
        artistEl.textContent = '...';
      }
    }

    if (playPauseBtn) {
      playPauseBtn.textContent = musicState.isPlaying ? '❚❚' : '▶';
    }
  }

  // 更新播放时间显示
  updateElapsedTimeDisplay(): void {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    if (!musicState) return;

    const timeCounter = document.getElementById('music-time-counter');
    if (timeCounter) {
      const hours = (musicState.totalElapsedTime / 3600).toFixed(1);
      timeCounter.textContent = `已经一起听了${hours}小时`;
    }
  }

  // 更新播放列表UI
  updatePlaylistUI(): void {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    if (!musicState) return;

    const playlistBody = document.getElementById('playlist-body');
    if (!playlistBody) return;

    // 安全：清空播放列表
    while (playlistBody.firstChild) {
      playlistBody.removeChild(playlistBody.firstChild);
    }

    if (musicState.playlist.length === 0) {
      // 安全：使用DOM构建代替innerHTML
      const emptyP = document.createElement('p');
      emptyP.style.textAlign = 'center';
      emptyP.style.padding = '20px';
      emptyP.style.color = '#888';
      emptyP.textContent = '播放列表是空的~';
      playlistBody.appendChild(emptyP);
      return;
    }

    musicState.playlist.forEach((track, index) => {
      const item = document.createElement('div');
      item.className = 'playlist-item';
      if (index === musicState.currentIndex) item.classList.add('playing');
      
      // 安全：使用DOM构建代替innerHTML
      const playlistItemInfo = document.createElement('div');
      playlistItemInfo.className = 'playlist-item-info';
      
      const titleDiv = document.createElement('div');
      titleDiv.className = 'title';
      titleDiv.textContent = track.name;
      playlistItemInfo.appendChild(titleDiv);
      
      const artistDiv = document.createElement('div');
      artistDiv.className = 'artist';
      artistDiv.textContent = track.artist;
      playlistItemInfo.appendChild(artistDiv);
      
      const deleteBtn = document.createElement('span');
      deleteBtn.className = 'delete-track-btn';
      deleteBtn.dataset.index = index.toString();
      deleteBtn.innerHTML = '&times;'; // HTML实体是安全的
      
      item.appendChild(playlistItemInfo);
      item.appendChild(deleteBtn);

      playlistItemInfo.addEventListener('click', () => this.playSong(index));
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await this.showCustomConfirm('删除歌曲', `确定要从播放列表中删除《${track.name}》吗？`);
        if (confirmed) this.deleteTrack(index);
      });

      playlistBody.appendChild(item);
    });
  }

  // "一起听"功能 - 开始会话
  async startListenTogetherSession(chatId: string): Promise<void> {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    const state: StateManager = win.STATE;
    
    if (!musicState || !state?.state) return;

    const chat = state.state.chats[chatId];
    if (!chat) return;

    musicState.totalElapsedTime = chat.musicData?.totalTime || 0;
    musicState.isActive = true;
    musicState.activeChatId = chatId;

    if (musicState.playlist.length > 0) {
      musicState.currentIndex = 0;
    } else {
      musicState.currentIndex = -1;
    }

    // 启动计时器
    if (musicState.timerId) clearInterval(musicState.timerId);
    musicState.timerId = window.setInterval(() => {
      if (musicState.isPlaying) {
        musicState.totalElapsedTime++;
        this.updateElapsedTimeDisplay();
      }
    }, 1000);

    this.updatePlayerUI();
    this.updatePlaylistUI();

    const musicPlayerOverlay = document.getElementById('music-player-overlay');
    if (musicPlayerOverlay) {
      musicPlayerOverlay.classList.add('visible');
    }
  }

  // "一起听"功能 - 结束会话
  async endListenTogetherSession(saveState = true): Promise<void> {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    const state: StateManager = win.STATE;
    const audioPlayer = document.getElementById('audio-player') as HTMLAudioElement;
    
    if (!musicState || !musicState.isActive) return;

    const oldChatId = musicState.activeChatId;

    // 清理计时器
    if (musicState.timerId) clearInterval(musicState.timerId);

    // 停止播放
    if (musicState.isPlaying && audioPlayer) {
      audioPlayer.pause();
    }

    // 保存状态到聊天记录
    if (saveState && oldChatId && state?.state.chats[oldChatId]) {
      const chat = state.state.chats[oldChatId];
      if (!chat.musicData) chat.musicData = { totalTime: 0 };
      chat.musicData.totalTime = musicState.totalElapsedTime;
      await win.DB.db.chats.put(chat);
    }

    // 重置状态
    musicState.isActive = false;
    musicState.activeChatId = null;
    musicState.totalElapsedTime = 0;
    musicState.timerId = null;

    // 隐藏UI
    const musicPlayerOverlay = document.getElementById('music-player-overlay');
    const musicPlaylistPanel = document.getElementById('music-playlist-panel');
    
    if (musicPlayerOverlay) {
      musicPlayerOverlay.classList.remove('visible');
    }
    if (musicPlaylistPanel) {
      musicPlaylistPanel.classList.remove('visible');
    }

    this.updateListenTogetherIcon(oldChatId, true);
  }

  // 更新"一起听"图标
  updateListenTogetherIcon(chatId: string | null, forceReset = false): void {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    const iconImg = document.querySelector('#listen-together-btn img') as HTMLImageElement;
    
    if (!iconImg) return;

    if (forceReset || !musicState?.isActive || musicState.activeChatId !== chatId) {
      iconImg.src = 'https://i.postimg.cc/8kYShvrJ/90-UI-2.png';
      iconImg.className = '';
      return;
    }

    iconImg.src = 'https://i.postimg.cc/vBN7GnQ9/3-FC8-D1596-C5-CFB200-FCB1-D8-C3-A37-A370.png';
    iconImg.classList.add('rotating');
    
    if (musicState.isPlaying) {
      iconImg.classList.remove('paused');
    } else {
      iconImg.classList.add('paused');
    }
  }

  // 处理"一起听"点击
  async handleListenTogetherClick(): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    const musicState: MusicState = win.STATE?.musicState;
    
    if (!state?.state || !musicState) return;

    const targetChatId = state.state.activeChatId;
    if (!targetChatId) return;

    if (!musicState.isActive) {
      this.startListenTogetherSession(targetChatId);
      return;
    }

    if (musicState.activeChatId === targetChatId) {
      const musicPlayerOverlay = document.getElementById('music-player-overlay');
      if (musicPlayerOverlay) {
        musicPlayerOverlay.classList.add('visible');
      }
    } else {
      const oldChatName = state.state.chats[musicState.activeChatId!]?.name || '未知';
      const newChatName = state.state.chats[targetChatId]?.name || '当前';
      const confirmed = await this.showCustomConfirm(
        '切换听歌对象',
        `您正和「${oldChatName}」听歌。要结束并开始和「${newChatName}」的新会话吗？`,
        {confirmButtonClass: 'btn-danger'}
      );
      if (confirmed) {
        await this.endListenTogetherSession(true);
        await new Promise(resolve => setTimeout(resolve, 50));
        this.startListenTogetherSession(targetChatId);
      }
    }
  }

  // 保存全局播放列表
  private async saveGlobalPlaylist(): Promise<void> {
    const win = window as any;
    const musicState: MusicState = win.STATE?.musicState;
    const db: DatabaseManager = win.DB;
    
    if (musicState && db?.db) {
      await db.db.musicLibrary.put({id: 'main', playlist: musicState.playlist});
    }
  }

  // 辅助函数
  private showCustomPrompt(title: string, placeholder: string, initialValue = '', type = 'text'): Promise<string | null> {
    const win = window as any;
    if (win.showCustomPrompt) {
      return win.showCustomPrompt(title, placeholder, initialValue, type);
    }
    return Promise.resolve(prompt(title));
  }

  private showCustomConfirm(title: string, message: string, options: ModalOptions = {}): Promise<boolean> {
    const win = window as any;
    if (win.showCustomConfirm) {
      return win.showCustomConfirm(title, message, options);
    }
    return Promise.resolve(confirm(message));
  }
}

// 导出服务实例
export const musicService = new MusicService();