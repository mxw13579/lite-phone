/**
 * 应用初始化模块 - js/initApp.js
 * 包含所有DOM事件监听器的初始化设置
 * 
 * @module InitApp
 * @version 1.0.0
 */

/**
 * 初始化应用的所有事件监听器和UI组件
 * @function initializeApp
 * @returns {Promise<void>}
 */
export async function initializeApp() {
    const state = window.STATE?.state;
    const db = window.DB?.db;
    const musicState = window.STATE?.musicState;
    
    // 获取默认头像常量
    const defaultAvatar = window.CONSTANTS?.DEFAULT_AVATAR || 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
    const defaultMyGroupAvatar = window.CONSTANTS?.DEFAULT_MY_GROUP_AVATAR || 'https://i.postimg.cc/cLPP10Vm/4.jpg';
    const defaultGroupMemberAvatar = window.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || 'https://i.postimg.cc/VkQfgzGJ/1.jpg';
    const defaultGroupAvatar = window.CONSTANTS?.DEFAULT_GROUP_AVATAR || 'https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg';
    
    // 获取音频播放器
    const audioPlayer = document.getElementById('audio-player');
    
    // 追踪变量
    let selectedMessages = new Set();
    let editingMemberId = null;
    
    // 辅助函数
    const showCustomPrompt = window.UIService?.showCustomPrompt || window.showCustomPrompt;
    const showCustomConfirm = window.UIService?.showCustomConfirm || window.showCustomConfirm;
    const showCustomAlert = window.UIService?.showCustomAlert || window.showCustomAlert;
    
    // 从chat模块获取函数
    const renderChatInterface = window.ChatModule?.renderChatInterface;
    const renderStickerPanel = window.ChatModule?.renderStickerPanel;
    
    // 从persona服务获取函数
    const openPersonaLibrary = window.PersonaService?.openPersonaLibrary;
    const closePersonaLibrary = window.PersonaService?.closePersonaLibrary;
    const openPersonaEditorForCreate = window.PersonaService?.openPersonaEditorForCreate;
    const openPersonaEditorForEdit = window.PersonaService?.openPersonaEditorForEdit;
    const closePersonaEditor = window.PersonaService?.closePersonaEditor;
    const savePersonaPreset = window.PersonaService?.savePersonaPreset;
    const hidePresetActions = window.PersonaService?.hidePresetActions;
    const renderGroupMemberSettings = window.PersonaService?.renderGroupMemberSettings;
    
    // 从music服务获取函数
    const handleListenTogetherClick = window.MusicService?.handleListenTogetherClick;
    const endListenTogetherSession = window.MusicService?.endListenTogetherSession;
    const returnToChat = window.MusicService?.returnToChat;
    const togglePlayPause = window.MusicService?.togglePlayPause;
    const playNext = window.MusicService?.playNext;
    const playPrev = window.MusicService?.playPrev;
    const changePlayMode = window.MusicService?.changePlayMode;
    const addSongFromURL = window.MusicService?.addSongFromURL;
    const addSongFromLocal = window.MusicService?.addSongFromLocal;
    const updatePlayerUI = window.MusicService?.updatePlayerUI;
    const updatePlaylistUI = window.MusicService?.updatePlaylistUI;
    
    // 聊天功能函数定义
    function exitMessageEditMode(shouldSave = false) {
        if (window.exitMessageEditMode) {
            return window.exitMessageEditMode(shouldSave);
        }
    }
    
    function exitSelectionMode() {
        selectedMessages.clear();
        document.getElementById('chat-interface-screen')?.classList.remove('selection-mode');
        document.querySelectorAll('.message-bubble.selected').forEach(bubble => {
            bubble.classList.remove('selected');
        });
    }
    
    function toggleMessageEditMode() {
        if (window.toggleMessageEditMode) {
            return window.toggleMessageEditMode();
        }
    }
    
    function sendUserTransfer() {
        if (window.ChatModule?.sendUserTransfer) {
            return window.ChatModule.sendUserTransfer();
        }
    }
    
    function openMemberEditor(memberId) {
        editingMemberId = memberId;
        const chat = state.chats[state.activeChatId];
        if (!chat || !chat.isGroup) return;
        const member = chat.members.find(m => m.id === memberId);
        if (!member) return;

        document.getElementById('member-name-input').value = member.name;
        document.getElementById('member-persona-input').value = member.persona;
        document.getElementById('member-pat-suffix-input').value = member.patSuffix || '';
        document.getElementById('member-avatar-preview').src = member.avatar || defaultGroupMemberAvatar;

        document.getElementById('member-settings-modal').classList.add('visible');
    }

    // 数据加载
    const allData = await window.DB?.loadAllDataFromDB();
    if (allData) {
        // 将加载的数据应用到状态中
        Object.assign(state, allData);
        console.log('应用数据已加载到状态中');
    }
    
    // 应用主题
    if (state.globalSettings.remoteThemeUrl) {
        const stylesheet = document.getElementById('main-stylesheet');
        if (stylesheet) {
            const url = state.globalSettings.remoteThemeUrl;
            stylesheet.href = url + '?v=' + Date.now();
        }
    }
    
    // 初始化时钟和电池
    window.UIService.updateClock();
    setInterval(window.UIService.updateClock, 1000 * 30);
    window.BatteryService.initBatteryManager();
    
    // ========== 聊天界面事件监听器 ==========
    
    // 返回聊天列表
    document.getElementById('back-to-list-btn')?.addEventListener('click', () => {
        exitMessageEditMode(false);
        exitSelectionMode();
        state.activeChatId = null;
        window.showScreen('chat-list-screen');
    });
    
    // 编辑消息
    document.getElementById('edit-messages-btn')?.addEventListener('click', toggleMessageEditMode);
    
    // 创建新聊天
    document.getElementById('add-chat-btn')?.addEventListener('click', async () => {
        const name = await showCustomPrompt('创建新聊天', '请输入Ta的名字');
        if (name && name.trim()) {
            const newChatId = 'chat_' + Date.now();
            const newChat = {
                id: newChatId,
                name: name.trim(),
                isGroup: false,
                settings: {
                    aiPersona: '你是谁呀。',
                    myPersona: '我是谁呀。',
                    maxMemory: 10,
                    aiAvatar: defaultAvatar,
                    myAvatar: defaultAvatar,
                    background: '',
                    theme: 'default',
                    linkedWorldBookIds: [],
                    aiPatSuffix: '的脑袋瓜',
                    myPatSuffix: '的肩膀'
                },
                history: [],
                musicData: {totalTime: 0}
            };
            state.chats[newChatId] = newChat;
            await db.chats.put(newChat);
            window.ChatModule.renderChatList();
        }
    });
    
    // 创建群聊
    document.getElementById('add-group-chat-btn')?.addEventListener('click', async () => {
        const numStr = await showCustomPrompt('创建群聊', '请输入群成员数量 (2-20)');
        const num = parseInt(numStr);
        if (!num || num < 2 || num > 20) {
            alert('请输入2到20之间的有效数字！');
            return;
        }
        const name = await showCustomPrompt('设置群名', '请输入群聊的名字');
        if (name && name.trim()) {
            const newChatId = 'group_' + Date.now();
            const members = [];
            for (let i = 1; i <= num; i++) members.push({
                id: `member_${Date.now()}_${i}`,
                name: `成员${i}`,
                avatar: defaultGroupMemberAvatar,
                persona: '一个路过的群成员。',
                patSuffix: '的后背'
            });
            const newGroupChat = {
                id: newChatId,
                name: name.trim(),
                isGroup: true,
                members: members,
                settings: {
                    myPersona: '我是谁呀。',
                    myNickname: '我',
                    myPatSuffix: '的肩膀',
                    maxMemory: 10,
                    groupAvatar: defaultGroupAvatar,
                    myAvatar: defaultMyGroupAvatar,
                    background: '',
                    theme: 'default',
                    linkedWorldBookIds: []
                },
                history: [],
                musicData: {totalTime: 0}
            };
            state.chats[newChatId] = newGroupChat;
            await db.chats.put(newGroupChat);
            window.ChatModule.renderChatList();
        }
    });
    
    // 转账功能
    document.getElementById('transfer-btn')?.addEventListener('click', () => 
        document.getElementById('transfer-modal')?.classList.add('visible'));
    document.getElementById('transfer-cancel-btn')?.addEventListener('click', () => 
        document.getElementById('transfer-modal')?.classList.remove('visible'));
    document.getElementById('transfer-confirm-btn')?.addEventListener('click', sendUserTransfer);
    
    // ========== 音乐播放器事件监听器 ==========
    
    document.getElementById('listen-together-btn')?.addEventListener('click', handleListenTogetherClick);
    document.getElementById('music-exit-btn')?.addEventListener('click', () => endListenTogetherSession(true));
    document.getElementById('music-return-btn')?.addEventListener('click', returnToChat);
    document.getElementById('music-play-pause-btn')?.addEventListener('click', togglePlayPause);
    document.getElementById('music-next-btn')?.addEventListener('click', playNext);
    document.getElementById('music-prev-btn')?.addEventListener('click', playPrev);
    document.getElementById('music-mode-btn')?.addEventListener('click', changePlayMode);
    document.getElementById('music-playlist-btn')?.addEventListener('click', () => {
        updatePlaylistUI();
        document.getElementById('music-playlist-panel')?.classList.add('visible');
    });
    document.getElementById('close-playlist-btn')?.addEventListener('click', () => 
        document.getElementById('music-playlist-panel')?.classList.remove('visible'));
    document.getElementById('add-song-url-btn')?.addEventListener('click', addSongFromURL);
    document.getElementById('add-song-local-btn')?.addEventListener('click', () => 
        document.getElementById('local-song-upload-input')?.click());
    document.getElementById('local-song-upload-input')?.addEventListener('change', addSongFromLocal);
    
    // 音频播放器事件
    audioPlayer?.addEventListener('ended', playNext);
    audioPlayer?.addEventListener('pause', () => {
        if (musicState.isActive) {
            musicState.isPlaying = false;
            updatePlayerUI();
        }
    });
    audioPlayer?.addEventListener('play', () => {
        if (musicState.isActive) {
            musicState.isPlaying = true;
            updatePlayerUI();
        }
    });
    
    // ========== 聊天输入事件监听器 ==========
    
    const chatInput = document.getElementById('chat-input');
    
    // 发送消息
    document.getElementById('send-btn')?.addEventListener('click', async () => {
        const content = chatInput?.value.trim();
        if (!content || !state.activeChatId) return;
        const chat = state.chats[state.activeChatId];
        const msg = {role: 'user', content, timestamp: Date.now()};
        chat.history.push(msg);
        await db.chats.put(chat);
        window.ChatModule.appendMessage(msg, chat);
        window.ChatModule.renderChatList();
        chatInput.value = '';
        chatInput.style.height = 'auto';
        chatInput.focus();
    });
    
    // 等待AI回复
    document.getElementById('wait-reply-btn')?.addEventListener('click', () => {
        window.ChatModule.triggerAiResponse();
        setTimeout(() => {
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }, 50);
    });
    
    // 输入框事件
    chatInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('send-btn')?.click();
        }
    });
    
    chatInput?.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
    });
    
    // ========== 聊天消息事件监听器 ==========
    
    document.getElementById('chat-messages')?.addEventListener('click', (e) => {
        const aiImage = e.target.closest('.ai-generated-image');
        if (aiImage) {
            const description = aiImage.dataset.description;
            if (description) showCustomAlert('照片描述', description);
            return;
        }
        const voiceMessage = e.target.closest('.voice-message-body');
        if (voiceMessage) {
            const text = voiceMessage.dataset.text;
            if (text) showCustomAlert('语音内容', text);
            return;
        }
    });
    
    // ========== 聊天设置事件监听器 ==========
    
    const chatSettingsModal = document.getElementById('chat-settings-modal');
    const worldBookSelectBox = document.querySelector('.custom-multiselect .select-box');
    const worldBookCheckboxesContainer = document.getElementById('world-book-checkboxes-container');

    function updateWorldBookSelectionDisplay() {
        const checkedBoxes = worldBookCheckboxesContainer?.querySelectorAll('input:checked');
        const displayText = document.querySelector('.selected-options-text');
        if (!checkedBoxes || !displayText) return;
        
        if (checkedBoxes.length === 0) {
            displayText.textContent = '-- 点击选择 --';
        } else if (checkedBoxes.length > 2) {
            displayText.textContent = `已选择 ${checkedBoxes.length} 项`;
        } else {
            displayText.textContent = Array.from(checkedBoxes).map(cb => cb.parentElement.textContent.trim()).join(', ');
        }
    }

    worldBookSelectBox?.addEventListener('click', (e) => {
        e.stopPropagation();
        worldBookCheckboxesContainer?.classList.toggle('visible');
        worldBookSelectBox.classList.toggle('expanded');
    });
    
    worldBookCheckboxesContainer?.addEventListener('change', updateWorldBookSelectionDisplay);
    
    window.addEventListener('click', (e) => {
        const multiselect = document.querySelector('.custom-multiselect');
        if (multiselect && !multiselect.contains(e.target)) {
            worldBookCheckboxesContainer?.classList.remove('visible');
            worldBookSelectBox?.classList.remove('expanded');
        }
    });
    
    // 更多初始化代码将在下一个文件中继续...
    
    console.log('应用初始化模块已加载完成');
}

console.log('应用初始化模块已准备就绪');