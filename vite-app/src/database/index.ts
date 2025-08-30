// 数据库层模块 - TypeScript版本
// 包含Dexie数据库实例化、表结构定义、数据迁移和CRUD操作
// 采用惰性初始化模式，提高应用启动性能

// 导入Dexie和相关依赖
import Dexie from 'dexie';
import type { Chat, GlobalSettings, UserSticker, WorldBook, PersonaPreset, Preset, Track, ApiConfig } from '../state';

// === TypeScript类型定义 ===
export interface MusicLibrary {
  id: 'main';
  playlist: Track[];
}

export interface DatabaseData {
  chats: Record<string, Chat>;
  apiConfig: ApiConfig;
  globalSettings: GlobalSettings;
  userStickers: UserSticker[];
  worldBooks: WorldBook[];
  musicLibrary: MusicLibrary;
  personaPresets: PersonaPreset[];
  presets: Preset[];
}

// === 数据库类定义 ===
class EPhoneDatabase extends Dexie {
  chats!: Dexie.Table<Chat, string>;
  apiConfig!: Dexie.Table<ApiConfig & { id: string }, string>;
  globalSettings!: Dexie.Table<GlobalSettings & { id: string }, string>;
  userStickers!: Dexie.Table<UserSticker, string>;
  worldBooks!: Dexie.Table<WorldBook, string>;
  musicLibrary!: Dexie.Table<MusicLibrary, string>;
  personaPresets!: Dexie.Table<PersonaPreset, string>;
  presets!: Dexie.Table<Preset, string>;

  constructor() {
    super('GeminiChatDB');
    this.initializeSchema();
  }

  private initializeSchema() {
    this.version(10).stores({
      chats: '&id, isGroup',
      apiConfig: '&id',
      globalSettings: '&id',
      userStickers: '&id, url, name',
      worldBooks: '&id, name',
      musicLibrary: '&id',
      personaPresets: '&id',
      presets: '&id, name'
    }).upgrade(async tx => {
      // 数据迁移逻辑：将旧的全局预设转换为新的预设条目
      const globalSettings = await tx.table('globalSettings').get('main');
      if (globalSettings && globalSettings.promptSingle) {
        const CONSTANTS = (window as any).CONSTANTS;
        const newPreset: Preset = {
          id: 'preset_default_migrated',
          name: '默认预设 (已迁移)',
          remark: '从旧版本自动迁移的预设',
          promptImage: globalSettings.promptImage || CONSTANTS?.DEFAULT_PROMPT_IMAGE || '',
          promptVoice: globalSettings.promptVoice || CONSTANTS?.DEFAULT_PROMPT_VOICE || '',
          promptTransfer: globalSettings.promptTransfer || CONSTANTS?.DEFAULT_PROMPT_TRANSFER || '',
          promptSingle: globalSettings.promptSingle || CONSTANTS?.DEFAULT_PROMPT_SINGLE || '',
          promptGroup: globalSettings.promptGroup || CONSTANTS?.DEFAULT_PROMPT_GROUP || '',
        };
        await tx.table('presets').add(newPreset);

        // 更新 globalSettings
        delete (globalSettings as any).promptImage;
        delete (globalSettings as any).promptVoice;
        delete (globalSettings as any).promptTransfer;
        delete (globalSettings as any).promptSingle;
        delete (globalSettings as any).promptGroup;
        globalSettings.activePresetId = newPreset.id;
        await tx.table('globalSettings').put(globalSettings);
      }
    });
  }
}

// === 单例实例 ===
let isInitialized = false;
export const db = new EPhoneDatabase();

// === 初始化函数 ===
export function initializeDatabase(): Promise<void> {
  // 避免重复初始化
  if (isInitialized) {
    console.log('数据库已初始化，跳过重复初始化');
    return Promise.resolve();
  }
  
  // 标记为已初始化
  isInitialized = true;
  console.log('数据库初始化完成');
  return Promise.resolve();
}

// 确保数据库已初始化的辅助函数
export async function ensureDbInitialized(): Promise<void> {
  if (!isInitialized) {
    console.log('检测到数据库未初始化，正在惰性初始化...');
    await initializeDatabase();
  }
}

// === CRUD 操作封装函数 ===

// 聊天相关操作
export async function getAllChats(): Promise<Chat[]> {
  await ensureDbInitialized();
  return await db.chats.toArray();
}

export async function getChatById(id: string): Promise<Chat | undefined> {
  await ensureDbInitialized();
  return await db.chats.get(id);
}

export async function saveChat(chat: Chat): Promise<string> {
  await ensureDbInitialized();
  return await db.chats.put(chat);
}

export async function deleteChat(id: string): Promise<void> {
  await ensureDbInitialized();
  return await db.chats.delete(id);
}

// API配置操作
export async function getApiConfig(): Promise<(ApiConfig & { id: string }) | undefined> {
  await ensureDbInitialized();
  return await db.apiConfig.get('main');
}

export async function saveApiConfig(config: Partial<ApiConfig>): Promise<string> {
  await ensureDbInitialized();
  return await db.apiConfig.put({ id: 'main', ...config } as ApiConfig & { id: string });
}

// 全局设置操作
export async function getGlobalSettings(): Promise<(GlobalSettings & { id: string }) | undefined> {
  await ensureDbInitialized();
  return await db.globalSettings.get('main');
}

export async function saveGlobalSettings(settings: Partial<GlobalSettings>): Promise<string> {
  await ensureDbInitialized();
  return await db.globalSettings.put({ id: 'main', ...settings } as GlobalSettings & { id: string });
}

// 用户贴纸操作
export async function getAllUserStickers(): Promise<UserSticker[]> {
  await ensureDbInitialized();
  return await db.userStickers.toArray();
}

export async function saveUserSticker(sticker: UserSticker): Promise<string> {
  await ensureDbInitialized();
  return await db.userStickers.put(sticker);
}

export async function deleteUserSticker(id: string): Promise<void> {
  await ensureDbInitialized();
  return await db.userStickers.delete(id);
}

// 世界书操作
export async function getAllWorldBooks(): Promise<WorldBook[]> {
  await ensureDbInitialized();
  return await db.worldBooks.toArray();
}

export async function getWorldBookById(id: string): Promise<WorldBook | undefined> {
  await ensureDbInitialized();
  return await db.worldBooks.get(id);
}

export async function saveWorldBook(worldBook: WorldBook): Promise<string> {
  await ensureDbInitialized();
  return await db.worldBooks.put(worldBook);
}

export async function deleteWorldBook(id: string): Promise<void> {
  await ensureDbInitialized();
  return await db.worldBooks.delete(id);
}

// 音乐库操作
export async function getMusicLibrary(): Promise<MusicLibrary | undefined> {
  await ensureDbInitialized();
  return await db.musicLibrary.get('main');
}

export async function saveMusicLibrary(musicLib: Partial<MusicLibrary>): Promise<string> {
  await ensureDbInitialized();
  return await db.musicLibrary.put({ id: 'main', ...musicLib } as MusicLibrary);
}

// 角色预设操作
export async function getAllPersonaPresets(): Promise<PersonaPreset[]> {
  await ensureDbInitialized();
  return await db.personaPresets.toArray();
}

export async function getPersonaPresetById(id: string): Promise<PersonaPreset | undefined> {
  await ensureDbInitialized();
  return await db.personaPresets.get(id);
}

export async function savePersonaPreset(preset: PersonaPreset): Promise<string> {
  await ensureDbInitialized();
  return await db.personaPresets.put(preset);
}

export async function deletePersonaPreset(id: string): Promise<void> {
  await ensureDbInitialized();
  return await db.personaPresets.delete(id);
}

// 预设操作
export async function getAllPresets(): Promise<Preset[]> {
  await ensureDbInitialized();
  return await db.presets.toArray();
}

export async function getPresetById(id: string): Promise<Preset | undefined> {
  await ensureDbInitialized();
  return await db.presets.get(id);
}

export async function savePreset(preset: Preset): Promise<string> {
  await ensureDbInitialized();
  return await db.presets.put(preset);
}

export async function deletePreset(id: string): Promise<void> {
  await ensureDbInitialized();
  return await db.presets.delete(id);
}

// === 批量操作函数 ===

// 批量加载所有数据的函数
export async function loadAllDataFromDB(): Promise<DatabaseData> {
  const [
    chatsArr, 
    apiConfig, 
    globalSettings, 
    userStickers, 
    worldBooks, 
    musicLib, 
    personaPresets, 
    presets
  ] = await Promise.all([
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
  const chats: Record<string, Chat> = chatsArr.reduce((acc, chat) => {
    if (!chat.musicData) {
      chat.musicData = { totalTime: 0 };
    }
    // 兼容旧版本的linkedWorldBookId字段
    if (chat.settings && (chat.settings as any).linkedWorldBookId && !chat.settings.linkedWorldBookIds) {
      chat.settings.linkedWorldBookIds = [(chat.settings as any).linkedWorldBookId];
      delete (chat.settings as any).linkedWorldBookId;
    }
    acc[chat.id] = chat;
    return acc;
  }, {} as Record<string, Chat>);

  // 设置默认配置
  const defaultApiConfig: ApiConfig = { 
    proxyUrl: '', 
    apiKey: '', 
    model: '' 
  };
  
  const defaultGlobalSettings: GlobalSettings = {
    wallpaper: 'linear-gradient(135deg, #89f7fe, #66a6ff)',
    enableGeolocation: false,
    remoteThemeUrl: '',
    activePresetId: ''
  };

  const defaultMusicLibrary: MusicLibrary = {
    id: 'main',
    playlist: []
  };

  return {
    chats,
    apiConfig: { ...defaultApiConfig, ...(apiConfig ? { 
      proxyUrl: apiConfig.proxyUrl || '',
      apiKey: apiConfig.apiKey || '', 
      model: apiConfig.model || ''
    } : {}) },
    globalSettings: { ...defaultGlobalSettings, ...(globalSettings ? {
      wallpaper: globalSettings.wallpaper || defaultGlobalSettings.wallpaper,
      enableGeolocation: globalSettings.enableGeolocation || defaultGlobalSettings.enableGeolocation,
      remoteThemeUrl: globalSettings.remoteThemeUrl || defaultGlobalSettings.remoteThemeUrl,
      activePresetId: globalSettings.activePresetId || defaultGlobalSettings.activePresetId
    } : {}) },
    userStickers: userStickers || [],
    worldBooks: worldBooks || [],
    musicLibrary: musicLib || defaultMusicLibrary,
    personaPresets: personaPresets || [],
    presets: presets || []
  };
}

// === 向后兼容：注入到window对象 ===
declare global {
  interface Window {
    db: typeof db;
    Dexie: typeof Dexie;
    initializeDatabase: typeof initializeDatabase;
    ensureDbInitialized: typeof ensureDbInitialized;
    loadAllDataFromDB: typeof loadAllDataFromDB;
    // CRUD 函数
    getAllChats: typeof getAllChats;
    getChatById: typeof getChatById;
    saveChat: typeof saveChat;
    deleteChat: typeof deleteChat;
    getApiConfig: typeof getApiConfig;
    saveApiConfig: typeof saveApiConfig;
    getGlobalSettings: typeof getGlobalSettings;
    saveGlobalSettings: typeof saveGlobalSettings;
    getAllUserStickers: typeof getAllUserStickers;
    saveUserSticker: typeof saveUserSticker;
    deleteUserSticker: typeof deleteUserSticker;
    getAllWorldBooks: typeof getAllWorldBooks;
    getWorldBookById: typeof getWorldBookById;
    saveWorldBook: typeof saveWorldBook;
    deleteWorldBook: typeof deleteWorldBook;
    getMusicLibrary: typeof getMusicLibrary;
    saveMusicLibrary: typeof saveMusicLibrary;
    getAllPersonaPresets: typeof getAllPersonaPresets;
    savePersonaPreset: typeof savePersonaPreset;
    deletePersonaPreset: typeof deletePersonaPreset;
    getAllPresets: typeof getAllPresets;
    getPresetById: typeof getPresetById;
    savePreset: typeof savePreset;
    deletePreset: typeof deletePreset;
  }
}

// 注入到window对象，保持向后兼容性
if (typeof window !== 'undefined') {
  // 核心对象
  window.db = db;
  window.Dexie = Dexie;
  
  // 初始化函数
  window.initializeDatabase = initializeDatabase;
  window.ensureDbInitialized = ensureDbInitialized;
  window.loadAllDataFromDB = loadAllDataFromDB;
  
  // 聊天 CRUD
  window.getAllChats = getAllChats;
  window.getChatById = getChatById;
  window.saveChat = saveChat;
  window.deleteChat = deleteChat;
  
  // API 配置 CRUD
  window.getApiConfig = getApiConfig;
  window.saveApiConfig = saveApiConfig;
  
  // 全局设置 CRUD
  window.getGlobalSettings = getGlobalSettings;
  window.saveGlobalSettings = saveGlobalSettings;
  
  // 用户贴纸 CRUD
  window.getAllUserStickers = getAllUserStickers;
  window.saveUserSticker = saveUserSticker;
  window.deleteUserSticker = deleteUserSticker;
  
  // 世界书 CRUD
  window.getAllWorldBooks = getAllWorldBooks;
  window.getWorldBookById = getWorldBookById;
  window.saveWorldBook = saveWorldBook;
  window.deleteWorldBook = deleteWorldBook;
  
  // 音乐库 CRUD
  window.getMusicLibrary = getMusicLibrary;
  window.saveMusicLibrary = saveMusicLibrary;
  
  // 角色预设 CRUD
  window.getAllPersonaPresets = getAllPersonaPresets;
  window.savePersonaPreset = savePersonaPreset;
  window.deletePersonaPreset = deletePersonaPreset;
  
  // 预设 CRUD
  window.getAllPresets = getAllPresets;
  window.getPresetById = getPresetById;
  window.savePreset = savePreset;
  window.deletePreset = deletePreset;
}

// 默认导出
export default {
  db,
  initializeDatabase,
  ensureDbInitialized,
  loadAllDataFromDB,
  // 所有CRUD函数
  getAllChats,
  getChatById,
  saveChat,
  deleteChat,
  getApiConfig,
  saveApiConfig,
  getGlobalSettings,
  saveGlobalSettings,
  getAllUserStickers,
  saveUserSticker,
  deleteUserSticker,
  getAllWorldBooks,
  getWorldBookById,
  saveWorldBook,
  deleteWorldBook,
  getMusicLibrary,
  saveMusicLibrary,
  getAllPersonaPresets,
  getPersonaPresetById,
  savePersonaPreset,
  deletePersonaPreset,
  getAllPresets,
  getPresetById,
  savePreset,
  deletePreset
};