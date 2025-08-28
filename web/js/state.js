// 状态管理模块 - state.js
// 集中管理应用的全局状态和状态更新函数

// === 核心状态对象 ===
export const state = {
    chats: {},
    activeChatId: null,
    globalSettings: {},
    apiConfig: {},
    userStickers: [],
    worldBooks: [],
    personaPresets: [],
    presets: []
};

// === 辅助状态变量 ===
export let myAddress = '位置未知';

export const musicState = {
    isActive: false,
    activeChatId: null,
    isPlaying: false,
    playlist: [],
    currentIndex: -1,
    playMode: 'order',
    totalElapsedTime: 0
};

// === 编辑状态变量 ===
export let isMessageEditMode = false;
export let editingPresetId = null;
export let newWallpaperBase64 = null;
export let isSelectionMode = false;
export let selectedMessages = new Set();
export let editingMemberId = null;
export let editingWorldBookId = null;
export let editingPersonaPresetId = null;

// === 其他状态变量 ===
export let currentRenderedCount = 0;
export let lastKnownBatteryLevel = 1;
export let alertFlags = { hasShown40: false, hasShown20: false, hasShown10: false };
export let batteryAlertTimeout = null;
export let notificationTimeout = null;

// === 状态更新函数 (Setter) ===

// 设置激活的聊天ID
export function setActiveChatId(chatId) {
    state.activeChatId = chatId;
    console.log('状态更新：激活聊天ID =', chatId);
}

// 更新全局设置
export function updateGlobalSettings(newSettings) {
    Object.assign(state.globalSettings, newSettings);
    console.log('状态更新：全局设置已更新');
}

// 设置API配置
export function setApiConfig(config) {
    Object.assign(state.apiConfig, config);
    console.log('状态更新：API配置已更新');
}

// 更新聊天数据
export function updateChat(chatId, chatData) {
    if (state.chats[chatId]) {
        Object.assign(state.chats[chatId], chatData);
    } else {
        state.chats[chatId] = chatData;
    }
    console.log('状态更新：聊天数据已更新', chatId);
}

// 删除聊天
export function removeChat(chatId) {
    delete state.chats[chatId];
    if (state.activeChatId === chatId) {
        state.activeChatId = null;
    }
    console.log('状态更新：聊天已删除', chatId);
}

// 设置用户贴纸
export function setUserStickers(stickers) {
    state.userStickers = stickers;
    console.log('状态更新：用户贴纸已更新');
}

// 添加用户贴纸
export function addUserSticker(sticker) {
    state.userStickers.push(sticker);
    console.log('状态更新：新增用户贴纸');
}

// 删除用户贴纸
export function removeUserSticker(stickerId) {
    state.userStickers = state.userStickers.filter(s => s.id !== stickerId);
    console.log('状态更新：删除用户贴纸', stickerId);
}

// 设置世界书
export function setWorldBooks(worldBooks) {
    state.worldBooks = worldBooks;
    console.log('状态更新：世界书已更新');
}

// 添加世界书
export function addWorldBook(worldBook) {
    state.worldBooks.push(worldBook);
    console.log('状态更新：新增世界书');
}

// 更新世界书
export function updateWorldBook(worldBookId, worldBookData) {
    const index = state.worldBooks.findIndex(wb => wb.id === worldBookId);
    if (index !== -1) {
        Object.assign(state.worldBooks[index], worldBookData);
        console.log('状态更新：世界书已更新', worldBookId);
    }
}

// 删除世界书
export function removeWorldBook(worldBookId) {
    state.worldBooks = state.worldBooks.filter(wb => wb.id !== worldBookId);
    console.log('状态更新：删除世界书', worldBookId);
}

// 设置预设列表
export function setPresets(presets) {
    state.presets = presets;
    console.log('状态更新：预设列表已更新');
}

// 添加预设
export function addPreset(preset) {
    state.presets.push(preset);
    console.log('状态更新：新增预设');
}

// 更新预设
export function updatePreset(presetId, presetData) {
    const index = state.presets.findIndex(p => p.id === presetId);
    if (index !== -1) {
        Object.assign(state.presets[index], presetData);
        console.log('状态更新：预设已更新', presetId);
    }
}

// 删除预设
export function removePreset(presetId) {
    state.presets = state.presets.filter(p => p.id !== presetId);
    console.log('状态更新：删除预设', presetId);
}

// 设置角色预设
export function setPersonaPresets(presets) {
    state.personaPresets = presets;
    console.log('状态更新：角色预设已更新');
}

// 删除角色预设
export function removePersonaPreset(presetId) {
    state.personaPresets = state.personaPresets.filter(p => p.id !== presetId);
    console.log('状态更新：删除角色预设', presetId);
}

// === 辅助状态更新函数 ===

// 设置地址
export function setMyAddress(address) {
    myAddress = address;
    console.log('状态更新：地址已设置为', address);
}

// 音乐状态更新
export function setMusicActive(chatId) {
    musicState.isActive = true;
    musicState.activeChatId = chatId;
    console.log('状态更新：音乐模式激活', chatId);
}

export function setMusicInactive() {
    musicState.isActive = false;
    musicState.activeChatId = null;
    musicState.isPlaying = false;
    console.log('状态更新：音乐模式停用');
}

// 编辑状态更新
export function setMessageEditMode(enabled) {
    isMessageEditMode = enabled;
    console.log('状态更新：消息编辑模式', enabled ? '启用' : '禁用');
}

export function setEditingPresetId(presetId) {
    editingPresetId = presetId;
    console.log('状态更新：编辑预设ID', presetId);
}

export function setSelectionMode(enabled) {
    isSelectionMode = enabled;
    if (!enabled) {
        selectedMessages.clear();
    }
    console.log('状态更新：选择模式', enabled ? '启用' : '禁用');
}

// === 状态查询函数 ===

// 获取当前激活的聊天
export function getActiveChat() {
    return state.activeChatId ? state.chats[state.activeChatId] : null;
}

// 获取当前激活的预设
export function getActivePreset() {
    if (!state.globalSettings.activePresetId) return null;
    return state.presets.find(p => p.id === state.globalSettings.activePresetId);
}

// 检查是否为群聊
export function isGroupChat(chatId = state.activeChatId) {
    const chat = chatId ? state.chats[chatId] : null;
    return chat ? chat.isGroup : false;
}

// 获取完整状态对象（用于调试）
export function getFullState() {
    return {
        state,
        myAddress,
        musicState,
        editStates: {
            isMessageEditMode,
            editingPresetId,
            newWallpaperBase64,
            isSelectionMode,
            editingMemberId,
            editingWorldBookId,
            editingPersonaPresetId
        },
        renderState: {
            currentRenderedCount,
            lastKnownBatteryLevel,
            alertFlags,
            batteryAlertTimeout,
            notificationTimeout
        }
    };
}