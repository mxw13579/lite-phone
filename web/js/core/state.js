/**
 * 全局状态管理
 * 负责加载、保存和管理应用的全局设置和状态
 */

import { getDB } from './db.js';

// 全局状态对象
export let globalState = {
    chats: {},
    activeChatId: null,
    globalSettings: {},
    apiConfig: {},
    userStickers: [],
    worldBooks: [],
    personaPresets: [],
    presets: [],
    
    // 运行时状态
    isMessageEditMode: false,
    editingPresetId: null,
    myAddress: '位置未知',
    musicState: {
        isActive: false,
        activeChatId: null,
        isPlaying: false,
        playlist: [],
        currentIndex: -1,
        playMode: 'order',
        totalElapsedTime: 0,
        timerId: null
    },
    
    // 导航状态
    navigation: {
        currentScreen: 'home-screen',
        previousScreen: null,
        lastTransitionTime: null,
        history: []
    },
    
    // 会话状态
    sessionId: null
};

// 默认设置
const DEFAULT_SETTINGS = {
    id: 'main',
    theme: 'default',
    language: 'zh-CN',
    geolocationEnabled: false,
    autoSave: true,
    notifications: true,
    soundEnabled: true,
    animationsEnabled: true,
    debugMode: false
};

const DEFAULT_API_CONFIG = {
    id: 'main',
    proxyUrl: '',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    availableModels: [],
    maxTokens: 2000,
    temperature: 0.7
};

/**
 * 加载全局状态
 * @returns {Promise<Object>} 加载的状态对象
 */
export async function loadGlobalState() {
    try {
        const db = getDB();
        if (!db) {
            console.warn('Database not available, using default state');
            return globalState;
        }

        // 并行加载所有数据
        const [
            globalSettings,
            apiConfig,
            chats,
            worldBooks,
            userStickers,
            personaPresets,
            presets
        ] = await Promise.all([
            loadGlobalSettings(),
            loadApiConfig(),
            loadChats(),
            loadWorldBooks(),
            loadUserStickers(),
            loadPersonaPresets(),
            loadPresets()
        ]);

        // 更新全局状态
        Object.assign(globalState, {
            globalSettings: globalSettings || DEFAULT_SETTINGS,
            apiConfig: apiConfig || DEFAULT_API_CONFIG,
            chats: chats || {},
            worldBooks: worldBooks || [],
            userStickers: userStickers || [],
            personaPresets: personaPresets || [],
            presets: presets || []
        });

        // 初始化运行时状态
        if (!globalState.sessionId) {
            globalState.sessionId = generateSessionId();
        }
        
        // 初始化导航历史
        if (!globalState.navigation.history || globalState.navigation.history.length === 0) {
            globalState.navigation.history = ['home-screen'];
        }

        console.log('Global state loaded successfully');
        return globalState;

    } catch (error) {
        console.error('Failed to load global state:', error);
        // 返回默认状态，确保应用可用
        return globalState;
    }
}

/**
 * 保存全局设置
 * @param {Object} settings 设置对象
 * @returns {Promise<void>}
 */
export async function saveGlobalSettings(settings) {
    try {
        const db = getDB();
        if (!db) return;

        const settingsToSave = {
            ...DEFAULT_SETTINGS,
            ...settings,
            updatedAt: new Date().toISOString()
        };

        await db.globalSettings.put(settingsToSave);
        globalState.globalSettings = settingsToSave;
        
        console.log('Global settings saved');
    } catch (error) {
        console.error('Failed to save global settings:', error);
        throw error;
    }
}

/**
 * 保存 API 配置
 * @param {Object} config API配置对象
 * @returns {Promise<void>}
 */
export async function saveApiConfig(config) {
    try {
        const db = getDB();
        if (!db) return;

        const configToSave = {
            ...DEFAULT_API_CONFIG,
            ...config,
            updatedAt: new Date().toISOString()
        };

        await db.apiConfig.put(configToSave);
        globalState.apiConfig = configToSave;
        
        console.log('API config saved');
    } catch (error) {
        console.error('Failed to save API config:', error);
        throw error;
    }
}

/**
 * 加载全局设置
 */
async function loadGlobalSettings() {
    try {
        const db = getDB();
        return await db?.globalSettings.get('main');
    } catch (error) {
        console.error('Failed to load global settings:', error);
        return null;
    }
}

/**
 * 加载 API 配置
 */
async function loadApiConfig() {
    try {
        const db = getDB();
        return await db?.apiConfig.get('main');
    } catch (error) {
        console.error('Failed to load API config:', error);
        return null;
    }
}

/**
 * 加载聊天记录
 */
async function loadChats() {
    try {
        const db = getDB();
        if (!db) return {};
        
        const chatArray = await db.chats.toArray();
        const chats = {};
        chatArray.forEach(chat => {
            chats[chat.id] = chat;
        });
        
        return chats;
    } catch (error) {
        console.error('Failed to load chats:', error);
        return {};
    }
}

/**
 * 加载世界书
 */
async function loadWorldBooks() {
    try {
        const db = getDB();
        return await db?.worldBooks.toArray() || [];
    } catch (error) {
        console.error('Failed to load world books:', error);
        return [];
    }
}

/**
 * 加载用户表情包
 */
async function loadUserStickers() {
    try {
        const db = getDB();
        return await db?.userStickers.toArray() || [];
    } catch (error) {
        console.error('Failed to load user stickers:', error);
        return [];
    }
}

/**
 * 加载人设预设
 */
async function loadPersonaPresets() {
    try {
        const db = getDB();
        return await db?.personaPresets.toArray() || [];
    } catch (error) {
        console.error('Failed to load persona presets:', error);
        return [];
    }
}

/**
 * 加载预设
 */
async function loadPresets() {
    try {
        const db = getDB();
        return await db?.presets.toArray() || [];
    } catch (error) {
        console.error('Failed to load presets:', error);
        return [];
    }
}

/**
 * 获取当前活跃预设
 * @returns {Object|null} 活跃的预设对象
 */
export function getActivePreset() {
    return globalState.presets.find(preset => preset.isActive) || null;
}

/**
 * 设置活跃预设
 * @param {string} presetId 预设ID
 * @returns {Promise<void>}
 */
export async function setActivePreset(presetId) {
    try {
        const db = getDB();
        if (!db) return;

        // 取消所有预设的激活状态
        await db.presets.toCollection().modify({ isActive: false });
        
        // 激活指定预设
        await db.presets.update(presetId, { isActive: true });
        
        // 更新内存中的状态
        globalState.presets.forEach(preset => {
            preset.isActive = preset.id === presetId;
        });
        
        console.log(`Active preset set to: ${presetId}`);
    } catch (error) {
        console.error('Failed to set active preset:', error);
        throw error;
    }
}

/**
 * 生成会话ID
 * @returns {string} 唯一会话标识符
 */
function generateSessionId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `session_${timestamp}_${random}`;
}

/**
 * 更新运行时状态
 * @param {string} key 状态键
 * @param {*} value 状态值
 */
export function updateRuntimeState(key, value) {
    if (key in globalState) {
        globalState[key] = value;
        console.log(`Runtime state updated: ${key}`);
    } else {
        console.warn(`Unknown state key: ${key}`);
    }
}

/**
 * 获取状态值
 * @param {string} key 状态键
 * @returns {*} 状态值
 */
export function getState(key) {
    return globalState[key];
}

/**
 * 重置状态到默认值
 * @param {string[]} keys 要重置的键，如果为空则重置所有
 */
export function resetState(keys = []) {
    if (keys.length === 0) {
        // 重置所有状态
        Object.assign(globalState, {
            chats: {},
            activeChatId: null,
            globalSettings: DEFAULT_SETTINGS,
            apiConfig: DEFAULT_API_CONFIG,
            userStickers: [],
            worldBooks: [],
            personaPresets: [],
            presets: [],
            isMessageEditMode: false,
            editingPresetId: null,
            myAddress: '位置未知'
        });
    } else {
        // 重置指定键
        keys.forEach(key => {
            if (key === 'globalSettings') {
                globalState[key] = { ...DEFAULT_SETTINGS };
            } else if (key === 'apiConfig') {
                globalState[key] = { ...DEFAULT_API_CONFIG };
            } else if (key in globalState) {
                // 根据类型重置为合适的默认值
                const value = globalState[key];
                if (Array.isArray(value)) {
                    globalState[key] = [];
                } else if (typeof value === 'object' && value !== null) {
                    globalState[key] = {};
                } else if (typeof value === 'boolean') {
                    globalState[key] = false;
                } else if (typeof value === 'string') {
                    globalState[key] = '';
                } else {
                    globalState[key] = null;
                }
            }
        });
    }
    
    console.log('State reset completed');
}