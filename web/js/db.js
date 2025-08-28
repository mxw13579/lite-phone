// 数据库层模块 - db.js
// 包含Dexie数据库实例化、表结构定义、数据迁移和CRUD操作
// 采用惰性初始化模式，提高应用启动性能

let isInitialized = false;

// 创建Dexie数据库实例
export const db = new Dexie('GeminiChatDB');

// 定义数据库表结构和版本迁移
export function initializeDatabase() {
    // 避免重复初始化
    if (isInitialized) {
        console.log('数据库已初始化，跳过重复初始化');
        return Promise.resolve();
    }
    const { 
        DEFAULT_PROMPT_IMAGE,
        DEFAULT_PROMPT_VOICE, 
        DEFAULT_PROMPT_TRANSFER,
        DEFAULT_PROMPT_SINGLE,
        DEFAULT_PROMPT_GROUP
    } = window.CONSTANTS || {};

    db.version(10).stores({ // 版本号从 9 增加到 10
        chats: '&id, isGroup',
        apiConfig: '&id',
        globalSettings: '&id',
        userStickers: '&id, url, name',
        worldBooks: '&id, name',
        musicLibrary: '&id',
        personaPresets: '&id',
        presets: '&id, name' // 新增 presets 表
    }).upgrade(async tx => {
        // 数据迁移逻辑：将旧的全局预设转换为新的预设条目
        const globalSettings = await tx.table('globalSettings').get('main');
        if (globalSettings && globalSettings.promptSingle) {
            const newPreset = {
                id: 'preset_default_migrated',
                name: '默认预设 (已迁移)',
                remark: '从旧版本自动迁移的预设',
                promptImage: globalSettings.promptImage || DEFAULT_PROMPT_IMAGE,
                promptVoice: globalSettings.promptVoice || DEFAULT_PROMPT_VOICE,
                promptTransfer: globalSettings.promptTransfer || DEFAULT_PROMPT_TRANSFER,
                promptSingle: globalSettings.promptSingle || DEFAULT_PROMPT_SINGLE,
                promptGroup: globalSettings.promptGroup || DEFAULT_PROMPT_GROUP,
            };
            await tx.table('presets').add(newPreset);

            // 更新 globalSettings
            delete globalSettings.promptImage;
            delete globalSettings.promptVoice;
            delete globalSettings.promptTransfer;
            delete globalSettings.promptSingle;
            delete globalSettings.promptGroup;
            globalSettings.activePresetId = newPreset.id;
            await tx.table('globalSettings').put(globalSettings);
        }
    });
    
    // 标记为已初始化
    isInitialized = true;
    console.log('数据库初始化完成');
}

// 确保数据库已初始化的辅助函数
export async function ensureDbInitialized() {
    if (!isInitialized) {
        console.log('检测到数据库未初始化，正在惰性初始化...');
        await initializeDatabase();
    }
}

// === CRUD 操作封装函数 ===

// 聊天相关操作
export async function getAllChats() {
    await ensureDbInitialized();
    return await db.chats.toArray();
}

export async function getChatById(id) {
    await ensureDbInitialized();
    return await db.chats.get(id);
}

export async function saveChat(chat) {
    await ensureDbInitialized();
    return await db.chats.put(chat);
}

export async function deleteChat(id) {
    await ensureDbInitialized();
    return await db.chats.delete(id);
}

// API配置操作
export async function getApiConfig() {
    await ensureDbInitialized();
    return await db.apiConfig.get('main');
}

export async function saveApiConfig(config) {
    await ensureDbInitialized();
    return await db.apiConfig.put({ id: 'main', ...config });
}

// 全局设置操作
export async function getGlobalSettings() {
    await ensureDbInitialized();
    return await db.globalSettings.get('main');
}

export async function saveGlobalSettings(settings) {
    await ensureDbInitialized();
    return await db.globalSettings.put({ id: 'main', ...settings });
}

// 用户贴纸操作
export async function getAllUserStickers() {
    await ensureDbInitialized();
    return await db.userStickers.toArray();
}

export async function saveUserSticker(sticker) {
    await ensureDbInitialized();
    return await db.userStickers.put(sticker);
}

export async function deleteUserSticker(id) {
    await ensureDbInitialized();
    return await db.userStickers.delete(id);
}

// 世界书操作
export async function getAllWorldBooks() {
    await ensureDbInitialized();
    return await db.worldBooks.toArray();
}

export async function getWorldBookById(id) {
    await ensureDbInitialized();
    return await db.worldBooks.get(id);
}

export async function saveWorldBook(worldBook) {
    await ensureDbInitialized();
    return await db.worldBooks.put(worldBook);
}

export async function deleteWorldBook(id) {
    await ensureDbInitialized();
    return await db.worldBooks.delete(id);
}

// 音乐库操作
export async function getMusicLibrary() {
    await ensureDbInitialized();
    return await db.musicLibrary.get('main');
}

export async function saveMusicLibrary(musicLib) {
    await ensureDbInitialized();
    return await db.musicLibrary.put({ id: 'main', ...musicLib });
}

// 角色预设操作
export async function getAllPersonaPresets() {
    await ensureDbInitialized();
    return await db.personaPresets.toArray();
}

export async function getPersonaPresetById(id) {
    await ensureDbInitialized();
    return await db.personaPresets.get(id);
}

export async function savePersonaPreset(preset) {
    await ensureDbInitialized();
    return await db.personaPresets.put(preset);
}

export async function deletePersonaPreset(id) {
    await ensureDbInitialized();
    return await db.personaPresets.delete(id);
}

// 预设操作
export async function getAllPresets() {
    await ensureDbInitialized();
    return await db.presets.toArray();
}

export async function getPresetById(id) {
    await ensureDbInitialized();
    return await db.presets.get(id);
}

export async function savePreset(preset) {
    await ensureDbInitialized();
    return await db.presets.put(preset);
}

export async function deletePreset(id) {
    await ensureDbInitialized();
    return await db.presets.delete(id);
}

// 批量加载所有数据的函数
export async function loadAllDataFromDB() {
    const [chatsArr, apiConfig, globalSettings, userStickers, worldBooks, musicLib, personaPresets, presets] = await Promise.all([
        getAllChats(),
        getApiConfig(),
        getGlobalSettings(),
        getAllUserStickers(),
        getAllWorldBooks(),
        getMusicLibrary(),
        getAllPersonaPresets(),
        getAllPresets()
    ]);

    // 处理聊天数据格式
    const chats = chatsArr.reduce((acc, chat) => {
        if (!chat.musicData) chat.musicData = { totalTime: 0 };
        if (chat.settings && chat.settings.linkedWorldBookId && !chat.settings.linkedWorldBookIds) {
            chat.settings.linkedWorldBookIds = [chat.settings.linkedWorldBookId];
            delete chat.settings.linkedWorldBookId;
        }
        acc[chat.id] = chat;
        return acc;
    }, {});

    // 设置默认配置
    const defaultApiConfig = { id: 'main', proxyUrl: '', apiKey: '', model: '' };
    const defaultGlobalSettings = {
        id: 'main',
        wallpaper: 'linear-gradient(135deg, #89f7fe, #66a6ff)',
        enableGeolocation: false,
        remoteThemeUrl: '',
        activePresetId: null
    };

    return {
        chats,
        apiConfig: apiConfig || defaultApiConfig,
        globalSettings: { ...defaultGlobalSettings, ...(globalSettings || {}) },
        userStickers: userStickers || [],
        worldBooks: worldBooks || [],
        musicLibrary: musicLib || { playlist: [] },
        personaPresets: personaPresets || [],
        presets: presets || []
    };
}