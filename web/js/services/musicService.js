// 音乐服务模块 - services/musicService.js
// 提供音乐播放器相关功能，包括播放控制、播放列表管理、"一起听"功能

// 音乐播放控制
export function togglePlayPause() {
    const audioPlayer = document.getElementById('audio-player');
    const musicState = window.STATE?.musicState;
    
    if (!audioPlayer || !musicState) return;

    if (audioPlayer.paused) {
        if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
            playSong(0);
        } else if (musicState.currentIndex > -1) {
            audioPlayer.play();
        }
    } else {
        audioPlayer.pause();
    }
}

// 播放指定歌曲
export function playSong(index) {
    const musicState = window.STATE?.musicState;
    const audioPlayer = document.getElementById('audio-player');
    
    if (!musicState || !audioPlayer || index < 0 || index >= musicState.playlist.length) return;

    musicState.currentIndex = index;
    const track = musicState.playlist[index];
    
    if (track.isLocal && track.src instanceof Blob) {
        audioPlayer.src = URL.createObjectURL(track.src);
    } else if (!track.isLocal) {
        audioPlayer.src = track.src;
    } else {
        console.error('本地歌曲源错误:', track);
        return;
    }

    audioPlayer.play();
    updatePlaylistUI();
    updatePlayerUI();
}

// 播放下一首
export function playNext() {
    const musicState = window.STATE?.musicState;
    if (!musicState || musicState.playlist.length === 0) return;

    let nextIndex;
    switch (musicState.playMode) {
        case 'random':
            nextIndex = Math.floor(Math.random() * musicState.playlist.length);
            break;
        case 'single':
            playSong(musicState.currentIndex);
            return;
        case 'order':
        default:
            nextIndex = (musicState.currentIndex + 1) % musicState.playlist.length;
            break;
    }
    playSong(nextIndex);
}

// 播放上一首
export function playPrev() {
    const musicState = window.STATE?.musicState;
    if (!musicState || musicState.playlist.length === 0) return;

    const newIndex = (musicState.currentIndex - 1 + musicState.playlist.length) % musicState.playlist.length;
    playSong(newIndex);
}

// 切换播放模式
export function changePlayMode() {
    const musicState = window.STATE?.musicState;
    if (!musicState) return;

    const modes = ['order', 'random', 'single'];
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
export async function addSongFromURL() {
    const musicState = window.STATE?.musicState;
    if (!musicState) return;

    const url = await showCustomPrompt("添加网络歌曲", "请输入歌曲的URL", "", "url");
    if (!url) return;
    
    const name = await showCustomPrompt("歌曲信息", "请输入歌名");
    if (!name) return;
    
    const artist = await showCustomPrompt("歌曲信息", "请输入歌手名");
    if (!artist) return;

    musicState.playlist.push({name, artist, src: url, isLocal: false});
    await saveGlobalPlaylist();
    updatePlaylistUI();
    
    if (musicState.currentIndex === -1) {
        musicState.currentIndex = musicState.playlist.length - 1;
        updatePlayerUI();
    }
}

// 从本地添加歌曲
export async function addSongFromLocal(files) {
    const musicState = window.STATE?.musicState;
    if (!musicState || !files.length) return;

    for (const file of files) {
        const name = await showCustomPrompt("歌曲信息", "请输入歌名", "");
        if (name === null) continue;
        
        const artist = await showCustomPrompt("歌曲信息", "请输入歌手名", "");
        if (artist === null) continue;

        musicState.playlist.push({name, artist, src: file, isLocal: true});
    }

    await saveGlobalPlaylist();
    updatePlaylistUI();
    
    if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
        musicState.currentIndex = 0;
        updatePlayerUI();
    }
}

// 删除曲目
export async function deleteTrack(index) {
    const musicState = window.STATE?.musicState;
    const audioPlayer = document.getElementById('audio-player');
    
    if (!musicState || !audioPlayer || index < 0 || index >= musicState.playlist.length) return;

    const track = musicState.playlist[index];
    const wasPlaying = musicState.isPlaying && musicState.currentIndex === index;

    // 清理本地URL
    if (track.isLocal && audioPlayer.src.startsWith('blob:') && musicState.currentIndex === index) {
        URL.revokeObjectURL(audioPlayer.src);
    }

    musicState.playlist.splice(index, 1);
    await saveGlobalPlaylist();

    if (musicState.playlist.length === 0) {
        if (musicState.isPlaying) audioPlayer.pause();
        audioPlayer.src = '';
        musicState.currentIndex = -1;
        musicState.isPlaying = false;
    } else {
        if (wasPlaying) {
            playNext();
        } else {
            if (musicState.currentIndex >= index) {
                musicState.currentIndex = Math.max(0, musicState.currentIndex - 1);
            }
        }
    }

    updatePlayerUI();
    updatePlaylistUI();
}

// 更新播放器UI
export function updatePlayerUI() {
    const musicState = window.STATE?.musicState;
    if (!musicState) return;

    updateListenTogetherIcon(musicState.activeChatId);
    updateElapsedTimeDisplay();

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
export function updateElapsedTimeDisplay() {
    const musicState = window.STATE?.musicState;
    if (!musicState) return;

    const timeCounter = document.getElementById('music-time-counter');
    if (timeCounter) {
        const hours = (musicState.totalElapsedTime / 3600).toFixed(1);
        timeCounter.textContent = `已经一起听了${hours}小时`;
    }
}

// 更新播放列表UI
export function updatePlaylistUI() {
    const musicState = window.STATE?.musicState;
    if (!musicState) return;

    const playlistBody = document.getElementById('playlist-body');
    if (!playlistBody) return;

    playlistBody.innerHTML = '';

    if (musicState.playlist.length === 0) {
        playlistBody.innerHTML = '<p style="text-align:center; padding: 20px; color: #888;">播放列表是空的~</p>';
        return;
    }

    musicState.playlist.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        if (index === musicState.currentIndex) item.classList.add('playing');
        
        item.innerHTML = `
            <div class="playlist-item-info">
                <div class="title">${track.name}</div>
                <div class="artist">${track.artist}</div>
            </div>
            <span class="delete-track-btn" data-index="${index}">&times;</span>
        `;

        item.querySelector('.playlist-item-info').addEventListener('click', () => playSong(index));
        item.querySelector('.delete-track-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmed = await showCustomConfirm('删除歌曲', `确定要从播放列表中删除《${track.name}》吗？`);
            if (confirmed) deleteTrack(index);
        });

        playlistBody.appendChild(item);
    });
}

// "一起听"功能 - 开始会话
export async function startListenTogetherSession(chatId) {
    const musicState = window.STATE?.musicState;
    const state = window.STATE?.state;
    
    if (!musicState || !state) return;

    const chat = state.chats[chatId];
    if (!chat) return;

    musicState.totalElapsedTime = chat.musicData.totalTime || 0;
    musicState.isActive = true;
    musicState.activeChatId = chatId;

    if (musicState.playlist.length > 0) {
        musicState.currentIndex = 0;
    } else {
        musicState.currentIndex = -1;
    }

    // 启动计时器
    if (musicState.timerId) clearInterval(musicState.timerId);
    musicState.timerId = setInterval(() => {
        if (musicState.isPlaying) {
            musicState.totalElapsedTime++;
            updateElapsedTimeDisplay();
        }
    }, 1000);

    updatePlayerUI();
    updatePlaylistUI();

    const musicPlayerOverlay = document.getElementById('music-player-overlay');
    if (musicPlayerOverlay) {
        musicPlayerOverlay.classList.add('visible');
    }
}

// "一起听"功能 - 结束会话
export async function endListenTogetherSession(saveState = true) {
    const musicState = window.STATE?.musicState;
    const state = window.STATE?.state;
    const audioPlayer = document.getElementById('audio-player');
    
    if (!musicState || !musicState.isActive) return;

    const oldChatId = musicState.activeChatId;

    // 清理计时器
    if (musicState.timerId) clearInterval(musicState.timerId);

    // 停止播放
    if (musicState.isPlaying && audioPlayer) {
        audioPlayer.pause();
    }

    // 保存状态到聊天记录
    if (saveState && oldChatId && state?.chats[oldChatId]) {
        const chat = state.chats[oldChatId];
        chat.musicData.totalTime = musicState.totalElapsedTime;
        await window.DB.db.chats.put(chat);
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

    updateListenTogetherIcon(oldChatId, true);
}

// 更新"一起听"图标
export function updateListenTogetherIcon(chatId, forceReset = false) {
    const musicState = window.STATE?.musicState;
    const iconImg = document.querySelector('#listen-together-btn img');
    
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

// 返回聊天界面
export function returnToChat() {
    const musicPlayerOverlay = document.getElementById('music-player-overlay');
    const musicPlaylistPanel = document.getElementById('music-playlist-panel');
    
    if (musicPlayerOverlay) {
        musicPlayerOverlay.classList.remove('visible');
    }
    if (musicPlaylistPanel) {
        musicPlaylistPanel.classList.remove('visible');
    }
}

// 处理"一起听"点击
export async function handleListenTogetherClick() {
    const state = window.STATE?.state;
    const musicState = window.STATE?.musicState;
    
    if (!state || !musicState) return;

    const targetChatId = state.activeChatId;
    if (!targetChatId) return;

    if (!musicState.isActive) {
        startListenTogetherSession(targetChatId);
        return;
    }

    if (musicState.activeChatId === targetChatId) {
        const musicPlayerOverlay = document.getElementById('music-player-overlay');
        if (musicPlayerOverlay) {
            musicPlayerOverlay.classList.add('visible');
        }
    } else {
        const oldChatName = state.chats[musicState.activeChatId]?.name || '未知';
        const newChatName = state.chats[targetChatId]?.name || '当前';
        const confirmed = await showCustomConfirm(
            '切换听歌对象',
            `您正和「${oldChatName}」听歌。要结束并开始和「${newChatName}」的新会话吗？`,
            {confirmButtonClass: 'btn-danger'}
        );
        if (confirmed) {
            await endListenTogetherSession(true);
            await new Promise(resolve => setTimeout(resolve, 50));
            startListenTogetherSession(targetChatId);
        }
    }
}

// 保存全局播放列表
async function saveGlobalPlaylist() {
    const musicState = window.STATE?.musicState;
    const db = window.DB?.db;
    
    if (musicState && db) {
        await db.musicLibrary.put({id: 'main', playlist: musicState.playlist});
    }
}

// 辅助函数
function showCustomPrompt(title, placeholder, initialValue = '', type = 'text') {
    if (window.showCustomPrompt) {
        return window.showCustomPrompt(title, placeholder, initialValue, type);
    }
    return prompt(title);
}

function showCustomConfirm(title, message, options = {}) {
    if (window.showCustomConfirm) {
        return window.showCustomConfirm(title, message, options);
    }
    return confirm(message);
}

console.log('音乐服务模块已初始化');