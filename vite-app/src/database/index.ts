// 数据库层模块 - TypeScript版本
// 包含Dexie数据库实例化、表结构定义、数据迁移和CRUD操作
// 采用惰性初始化模式，提高应用启动性能

// 导入Dexie和相关依赖
import Dexie from 'dexie';
import type { Chat, GlobalSettings, UserSticker, WorldBook, PersonaPreset, Preset, Track, ApiConfig } from '../state';
import type { Persona, UserRole } from '../screens/personaCenter/types/PersonaTypes';

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
  personas: Persona[];
  userRoles: UserRole[];
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
  personas!: Dexie.Table<Persona, string>;
  userRoles!: Dexie.Table<UserRole, string>;

  constructor() {
    super('GeminiChatDB');
    this.initializeSchema();
  }

  private initializeSchema() {
    // 版本10：原有表结构
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

    // 版本11：添加personas和userRoles表，扩展Chat表角色引用字段
    this.version(11).stores({
      chats: '&id, isGroup, personaId, defaultUserRoleId',
      apiConfig: '&id',
      globalSettings: '&id',
      userStickers: '&id, url, name',
      worldBooks: '&id, name',
      musicLibrary: '&id',
      personaPresets: '&id',
      presets: '&id, name',
      personas: '&id, name, type, *tags, archived, status, version, updatedAt, lastUsedAt',
      userRoles: '&id, name, type, *tags, archived, updatedAt, lastUsedAt, isGlobalDefault'
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
  const chats = await db.chats.toArray();
  // 规范化isGroup字段，确保为严格布尔类型
  return chats.map(chat => ({
    ...chat,
    isGroup: Boolean(chat.isGroup === true || chat.isGroup === 'true')
  }));
}

export async function getChatById(id: string): Promise<Chat | undefined> {
  await ensureDbInitialized();
  const chat = await db.chats.get(id);
  if (chat) {
    // 规范化isGroup字段，确保为严格布尔类型
    return {
      ...chat,
      isGroup: Boolean(chat.isGroup === true || chat.isGroup === 'true')
    };
  }
  return chat;
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

// === Persona CRUD操作 ===

// 获取所有Persona
export async function getAllPersonas(): Promise<Persona[]> {
  await ensureDbInitialized();
  return await db.personas.toArray();
}

// 根据ID获取Persona
export async function getPersonaById(id: string): Promise<Persona | undefined> {
  await ensureDbInitialized();
  return await db.personas.get(id);
}

// 保存Persona
export async function savePersona(persona: Persona): Promise<string> {
  await ensureDbInitialized();
  return await db.personas.put(persona);
}

// 删除Persona
export async function deletePersona(id: string): Promise<void> {
  await ensureDbInitialized();
  return await db.personas.delete(id);
}

// 搜索Persona
export async function searchPersonas(term: string, filters?: { archived?: boolean, status?: string }): Promise<Persona[]> {
  await ensureDbInitialized();
  let collection = db.personas.where('name').startsWithIgnoreCase(term)
    .or('tags').anyOf(term.split(' '));
  
  if (filters?.archived !== undefined) {
    collection = collection.and(persona => persona.archived === filters.archived);
  }
  
  if (filters?.status) {
    collection = collection.and(persona => persona.status === filters.status);
  }
  
  return await collection.toArray();
}

// 更新最后使用时间
export async function updatePersonaLastUsedAt(id: string): Promise<void> {
  await ensureDbInitialized();
  await db.personas.update(id, { lastUsedAt: Date.now() });
}

// === UserRole CRUD操作 ===

// 获取所有UserRole
export async function getAllUserRoles(): Promise<UserRole[]> {
  await ensureDbInitialized();
  return await db.userRoles.toArray();
}

// 根据ID获取UserRole
export async function getUserRoleById(id: string): Promise<UserRole | undefined> {
  await ensureDbInitialized();
  return await db.userRoles.get(id);
}

// 保存UserRole
export async function saveUserRole(userRole: UserRole): Promise<string> {
  await ensureDbInitialized();
  return await db.userRoles.put(userRole);
}

// 删除UserRole
export async function deleteUserRole(id: string): Promise<void> {
  await ensureDbInitialized();
  return await db.userRoles.delete(id);
}

// 搜索UserRole
export async function searchUserRoles(term: string, filters?: { archived?: boolean }): Promise<UserRole[]> {
  await ensureDbInitialized();
  let collection = db.userRoles.where('name').startsWithIgnoreCase(term)
    .or('tags').anyOf(term.split(' '));
  
  if (filters?.archived !== undefined) {
    collection = collection.and(userRole => userRole.archived === filters.archived);
  }
  
  return await collection.toArray();
}

// 设置全局默认UserRole
export async function setGlobalDefaultUserRole(id: string): Promise<void> {
  await ensureDbInitialized();
  await db.transaction('rw', db.userRoles, async () => {
    // 先清除所有的全局默认状态
    await db.userRoles.where('isGlobalDefault').equals(true).modify({ isGlobalDefault: false });
    // 设置新的全局默认
    await db.userRoles.update(id, { isGlobalDefault: true });
  });
}

// 更新最后使用时间
export async function updateUserRoleLastUsedAt(id: string): Promise<void> {
  await ensureDbInitialized();
  await db.userRoles.update(id, { lastUsedAt: Date.now() });
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
    presets,
    personas,
    userRoles
  ] = await Promise.all([
    getAllChats(),
    getApiConfig(),
    getGlobalSettings(),
    getAllUserStickers(),
    getAllWorldBooks(),
    getMusicLibrary(),
    getAllPersonaPresets(),
    getAllPresets(),
    getAllPersonas(),
    getAllUserRoles()
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
    presets: presets || [],
    personas: personas || [],
    userRoles: userRoles || []
  };
}

// === 批量操作和统计API（Phase 2 新增）===

// 统计操作
export async function getChatsCount(): Promise<number> {
  await ensureDbInitialized();
  return await db.chats.count();
}

export async function getUserStickersCount(): Promise<number> {
  await ensureDbInitialized();
  return await db.userStickers.count();
}

export async function getWorldBooksCount(): Promise<number> {
  await ensureDbInitialized();
  return await db.worldBooks.count();
}

export async function getPersonaPresetsCount(): Promise<number> {
  await ensureDbInitialized();
  return await db.personaPresets.count();
}

// 批量添加操作
export async function bulkAddChats(chats: Chat[]): Promise<string[]> {
  await ensureDbInitialized();
  return await db.chats.bulkAdd(chats, { allKeys: true }) as string[];
}

export async function bulkAddUserStickers(stickers: UserSticker[]): Promise<string[]> {
  await ensureDbInitialized();
  return await db.userStickers.bulkAdd(stickers, { allKeys: true }) as string[];
}

export async function bulkAddWorldBooks(worldBooks: WorldBook[]): Promise<string[]> {
  await ensureDbInitialized();
  return await db.worldBooks.bulkAdd(worldBooks, { allKeys: true }) as string[];
}

export async function bulkAddPersonaPresets(presets: PersonaPreset[]): Promise<string[]> {
  await ensureDbInitialized();
  return await db.personaPresets.bulkAdd(presets, { allKeys: true }) as string[];
}

// 事务操作 - 用于数据导入
export async function clearAllTables(): Promise<void> {
  await ensureDbInitialized();
  return await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((table: any) => table.clear()));
  });
}

export async function importAllData(data: {
  chats?: Chat[];
  userStickers?: UserSticker[];
  worldBooks?: WorldBook[];
  personaPresets?: PersonaPreset[];
  apiConfig?: ApiConfig;
  globalSettings?: GlobalSettings;
  musicLibrary?: { playlist: any[] };
}): Promise<void> {
  await ensureDbInitialized();
  return await db.transaction('rw', db.tables, async () => {
    // 先清空所有表
    await Promise.all(db.tables.map((table: any) => table.clear()));
    
    // 批量插入数据
    if (data.chats && data.chats.length > 0) await db.chats.bulkAdd(data.chats);
    if (data.userStickers && data.userStickers.length > 0) await db.userStickers.bulkAdd(data.userStickers);
    if (data.worldBooks && data.worldBooks.length > 0) await db.worldBooks.bulkAdd(data.worldBooks);
    if (data.personaPresets && data.personaPresets.length > 0) await db.personaPresets.bulkAdd(data.personaPresets);
    
    // 单一配置项
    if (data.apiConfig) await db.apiConfig.put({ id: 'main', ...data.apiConfig } as ApiConfig & { id: string });
    if (data.globalSettings) await db.globalSettings.put({ id: 'main', ...data.globalSettings } as GlobalSettings & { id: string });
    if (data.musicLibrary) await db.musicLibrary.put({ id: 'main', playlist: data.musicLibrary.playlist });
  });
}

// === 向后兼容：window对象注入 ===
export function injectDatabaseToWindow(): void {
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
    
    // Persona CRUD
    window.getAllPersonas = getAllPersonas;
    window.getPersonaById = getPersonaById;
    window.savePersona = savePersona;
    window.deletePersona = deletePersona;
    window.searchPersonas = searchPersonas;
    window.updatePersonaLastUsedAt = updatePersonaLastUsedAt;
    
    // UserRole CRUD
    window.getAllUserRoles = getAllUserRoles;
    window.getUserRoleById = getUserRoleById;
    window.saveUserRole = saveUserRole;
    window.deleteUserRole = deleteUserRole;
    window.searchUserRoles = searchUserRoles;
    window.setGlobalDefaultUserRole = setGlobalDefaultUserRole;
    window.updateUserRoleLastUsedAt = updateUserRoleLastUsedAt;
    
    // Phase 2 新增：批量操作和统计API
    window.getChatsCount = getChatsCount;
    window.getUserStickersCount = getUserStickersCount;
    window.getWorldBooksCount = getWorldBooksCount;
    window.getPersonaPresetsCount = getPersonaPresetsCount;
    window.bulkAddChats = bulkAddChats;
    window.bulkAddUserStickers = bulkAddUserStickers;
    window.bulkAddWorldBooks = bulkAddWorldBooks;
    window.bulkAddPersonaPresets = bulkAddPersonaPresets;
    window.clearAllTables = clearAllTables;
    window.importAllData = importAllData;
  }
}

// 注意：不再自动注入，由init/compat.ts统一管理全局注入

// 默认导出
export default {
  db,
  initializeDatabase,
  ensureDbInitialized,
  loadAllDataFromDB,
  // 基础CRUD函数
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
  deletePreset,
  // Persona和UserRole CRUD
  getAllPersonas,
  getPersonaById,
  savePersona,
  deletePersona,
  searchPersonas,
  updatePersonaLastUsedAt,
  getAllUserRoles,
  getUserRoleById,
  saveUserRole,
  deleteUserRole,
  searchUserRoles,
  setGlobalDefaultUserRole,
  updateUserRoleLastUsedAt,
  // Phase 2 新增：批量操作和统计API
  getChatsCount,
  getUserStickersCount,
  getWorldBooksCount,
  getPersonaPresetsCount,
  bulkAddChats,
  bulkAddUserStickers,
  bulkAddWorldBooks,
  bulkAddPersonaPresets,
  clearAllTables,
  importAllData
};