// 数据库层模块 - 优化版（修复Dexie.Table导入错误）

import Dexie from 'dexie';
import type {
  Chat,
  GlobalSettings,
  UserSticker,
  WorldBook,
  PersonaPreset,
  Preset,
  Track,
  ApiConfig
} from '../state';
import type { Persona, UserRole } from '../screens/personaCenter/types/PersonaTypes';

// 常量
const DB_NAME = 'GeminiChatDB';
const MAIN_ID = 'main';

// 类型
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

// Dexie数据库
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
    super(DB_NAME);
    this.initSchema();
  }

  private initSchema() {
    // v10
    this.version(10)
        .stores({
          chats: '&id, isGroup',
          apiConfig: '&id',
          globalSettings: '&id',
          userStickers: '&id, url, name',
          worldBooks: '&id, name',
          musicLibrary: '&id',
          personaPresets: '&id',
          presets: '&id, name'
        })
        .upgrade(async tx => {
          const gs = await tx.table('globalSettings').get(MAIN_ID);
          if (gs && (gs as any).promptSingle) {
            const CONSTANTS = (window as any).CONSTANTS;
            const newPreset: Preset = {
              id: 'preset_default_migrated',
              name: '默认预设 (已迁移)',
              remark: '从旧版本自动迁移的预设',
              promptImage: (gs as any).promptImage || CONSTANTS?.DEFAULT_PROMPT_IMAGE || '',
              promptVoice: (gs as any).promptVoice || CONSTANTS?.DEFAULT_PROMPT_VOICE || '',
              promptTransfer: (gs as any).promptTransfer || CONSTANTS?.DEFAULT_PROMPT_TRANSFER || '',
              promptSingle: (gs as any).promptSingle || CONSTANTS?.DEFAULT_PROMPT_SINGLE || '',
              promptGroup: (gs as any).promptGroup || CONSTANTS?.DEFAULT_PROMPT_GROUP || ''
            };
            await tx.table('presets').add(newPreset);
            ['promptImage', 'promptVoice', 'promptTransfer', 'promptSingle', 'promptGroup'].forEach(k => delete (gs as any)[k]);
            (gs as any).activePresetId = newPreset.id;
            await tx.table('globalSettings').put(gs);
          }
        });

    // v11
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

// 单例与初始化缓存
let dbInitPromise: Promise<void> | null = null;
export const db = new EPhoneDatabase();

export function initializeDatabase(): Promise<void> {
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = db.open()
      .then(() => {
        console.log('数据库初始化完成');
      })
      .catch(error => {
        console.error('数据库初始化失败:', error);
        dbInitPromise = null; // 重置以便重试
        throw error;
      });

  return dbInitPromise;
}

export async function ensureDbInitialized(): Promise<void> {
  if (!dbInitPromise) await initializeDatabase();
  else await dbInitPromise;
}

// 工具
const normIsGroup = (val: any) => Boolean(val === true || val === 'true');

// 通用CRUD模板
function createCRUD<T>(table: Dexie.Table<T, string>) {
  return {
    getAll: async (): Promise<T[]> => {
      await ensureDbInitialized();
      return table.toArray();
    },
    getById: async (id: string): Promise<T | undefined> => {
      await ensureDbInitialized();
      return table.get(id);
    },
    save: async (item: T): Promise<string> => {
      await ensureDbInitialized();
      return table.put(item);
    },
    delete: async (id: string): Promise<void> => {
      await ensureDbInitialized();
      return table.delete(id);
    }
  };
}

// 聊天
export async function getAllChats(): Promise<Chat[]> {
  await ensureDbInitialized();
  return (await db.chats.toArray()).map(chat => ({ ...chat, isGroup: normIsGroup(chat.isGroup) }));
}
export async function getChatById(id: string): Promise<Chat | undefined> {
  await ensureDbInitialized();
  const chat = await db.chats.get(id);
  return chat ? { ...chat, isGroup: normIsGroup(chat.isGroup) } : chat;
}
export async function saveChat(chat: Chat): Promise<string> {
  await ensureDbInitialized();
  return db.chats.put(chat);
}
export async function deleteChat(id: string): Promise<void> {
  await ensureDbInitialized();
  return db.chats.delete(id);
}

// API配置
const apiConfigCRUD = createCRUD<ApiConfig & { id: string }>(db.apiConfig);
export const getApiConfig = () => apiConfigCRUD.getById(MAIN_ID);
export const saveApiConfig = (config: Partial<ApiConfig>) =>
    apiConfigCRUD.save({ id: MAIN_ID, ...config } as ApiConfig & { id: string });

// 全局设置
const globalSettingsCRUD = createCRUD<GlobalSettings & { id: string }>(db.globalSettings);
export const getGlobalSettings = () => globalSettingsCRUD.getById(MAIN_ID);
export const saveGlobalSettings = (settings: Partial<GlobalSettings>) =>
    globalSettingsCRUD.save({ id: MAIN_ID, ...settings } as GlobalSettings & { id: string });

// 用户贴纸
const userStickerCRUD = createCRUD<UserSticker>(db.userStickers);
export const getAllUserStickers = userStickerCRUD.getAll;
export const saveUserSticker = userStickerCRUD.save;
export const deleteUserSticker = userStickerCRUD.delete;

// 世界书
const worldBookCRUD = createCRUD<WorldBook>(db.worldBooks);
export const getAllWorldBooks = worldBookCRUD.getAll;
export const getWorldBookById = worldBookCRUD.getById;
export const saveWorldBook = worldBookCRUD.save;
export const deleteWorldBook = worldBookCRUD.delete;

// 音乐库
export async function getMusicLibrary(): Promise<MusicLibrary | undefined> {
  await ensureDbInitialized();
  return db.musicLibrary.get(MAIN_ID);
}
export async function saveMusicLibrary(musicLib: Partial<MusicLibrary>): Promise<string> {
  await ensureDbInitialized();
  return db.musicLibrary.put({ id: MAIN_ID, ...musicLib } as MusicLibrary);
}

// 角色预设
const personaPresetCRUD = createCRUD<PersonaPreset>(db.personaPresets);
export const getAllPersonaPresets = personaPresetCRUD.getAll;
export const getPersonaPresetById = personaPresetCRUD.getById;
export const savePersonaPreset = personaPresetCRUD.save;
export const deletePersonaPreset = personaPresetCRUD.delete;

// 预设
const presetCRUD = createCRUD<Preset>(db.presets);
export const getAllPresets = presetCRUD.getAll;
export const getPresetById = presetCRUD.getById;
export const savePreset = presetCRUD.save;
export const deletePreset = presetCRUD.delete;

// Persona
const personaCRUD = createCRUD<Persona>(db.personas);
export const getAllPersonas = personaCRUD.getAll;
export const getPersonaById = personaCRUD.getById;
export const savePersona = personaCRUD.save;
export const deletePersona = personaCRUD.delete;

// Persona搜索（索引友好：name前缀检索）
export async function searchPersonas(term: string, filters?: { status?: string }): Promise<Persona[]> {
  await ensureDbInitialized();
  let collection = db.personas.where('name').startsWithIgnoreCase(term)
      .or('tags').anyOf(term.split(' '));

  if (filters?.status) {
    collection = collection.and(p => (p as any).status === filters.status);
  }

  return collection.toArray();
}

// UserRole
const userRoleCRUD = createCRUD<UserRole>(db.userRoles);
export const getAllUserRoles = userRoleCRUD.getAll;
export const getUserRoleById = userRoleCRUD.getById;
export const saveUserRole = userRoleCRUD.save;
export const deleteUserRole = userRoleCRUD.delete;

export async function searchUserRoles(term: string): Promise<UserRole[]> {
  await ensureDbInitialized();
  return db.userRoles.where('name').startsWithIgnoreCase(term).toArray();
}
export async function setGlobalDefaultUserRole(id: string): Promise<void> {
  await ensureDbInitialized();
  await db.transaction('rw', db.userRoles, async () => {
    await db.userRoles.where('isGlobalDefault').equals(1).modify({ isGlobalDefault: false } as any);
    await db.userRoles.update(id, { isGlobalDefault: true } as any);
  });
}
export async function updateUserRoleLastUsedAt(id: string): Promise<void> {
  await ensureDbInitialized();
  await db.userRoles.update(id, { lastUsedAt: Date.now() } as any);
}

// 批量与统计
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

  const chats: Record<string, Chat> = {};
  for (const chat of chatsArr) {
    if (!chat.musicData) chat.musicData = { totalTime: 0 };
    if (chat.settings && (chat.settings as any).linkedWorldBookId && !chat.settings.linkedWorldBookIds) {
      chat.settings.linkedWorldBookIds = [(chat.settings as any).linkedWorldBookId];
      delete (chat.settings as any).linkedWorldBookId;
    }
    chats[chat.id] = chat;
  }

  const defaultApiConfig: ApiConfig = { proxyUrl: '', apiKey: '', model: '' };
  const defaultGlobalSettings: GlobalSettings = {
    wallpaper: 'linear-gradient(135deg, #89f7fe, #66a6ff)',
    enableGeolocation: false,
    remoteThemeUrl: '',
    activePresetId: ''
  };
  const defaultMusicLibrary: MusicLibrary = { id: MAIN_ID, playlist: [] };

  return {
    chats,
    apiConfig: { ...defaultApiConfig, ...(apiConfig ?? {}) },
    globalSettings: { ...defaultGlobalSettings, ...(globalSettings ?? {}) },
    userStickers: userStickers ?? [],
    worldBooks: worldBooks ?? [],
    musicLibrary: musicLib ?? defaultMusicLibrary,
    personaPresets: personaPresets ?? [],
    presets: presets ?? [],
    personas: personas ?? [],
    userRoles: userRoles ?? []
  };
}

export const getChatsCount = async () => (await ensureDbInitialized(), db.chats.count());
export const getUserStickersCount = async () => (await ensureDbInitialized(), db.userStickers.count());
export const getWorldBooksCount = async () => (await ensureDbInitialized(), db.worldBooks.count());
export const getPersonaPresetsCount = async () => (await ensureDbInitialized(), db.personaPresets.count());

export async function bulkAddChats(chats: Chat[]): Promise<string[]> {
  await ensureDbInitialized();
  return db.chats.bulkAdd(chats, { allKeys: true }) as Promise<string[]>;
}
export async function bulkAddUserStickers(stickers: UserSticker[]): Promise<string[]> {
  await ensureDbInitialized();
  return db.userStickers.bulkAdd(stickers, { allKeys: true }) as Promise<string[]>;
}
export async function bulkAddWorldBooks(worldBooks: WorldBook[]): Promise<string[]> {
  await ensureDbInitialized();
  return db.worldBooks.bulkAdd(worldBooks, { allKeys: true }) as Promise<string[]>;
}
export async function bulkAddPersonaPresets(presets: PersonaPreset[]): Promise<string[]> {
  await ensureDbInitialized();
  return db.personaPresets.bulkAdd(presets, { allKeys: true }) as Promise<string[]>;
}

export async function clearAllTables(): Promise<void> {
  await ensureDbInitialized();
  return db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
}

export async function updatePersonaLastUsedAt(id: string): Promise<void> {
  await ensureDbInitialized();
  await db.personas.update(id, { lastUsedAt: Date.now() } as Partial<Persona>);
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
  return db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
    if (data.chats?.length) await db.chats.bulkAdd(data.chats);
    if (data.userStickers?.length) await db.userStickers.bulkAdd(data.userStickers);
    if (data.worldBooks?.length) await db.worldBooks.bulkAdd(data.worldBooks);
    if (data.personaPresets?.length) await db.personaPresets.bulkAdd(data.personaPresets);
    if (data.apiConfig) await db.apiConfig.put({ id: MAIN_ID, ...data.apiConfig } as ApiConfig & { id: string });
    if (data.globalSettings) await db.globalSettings.put({ id: MAIN_ID, ...data.globalSettings } as GlobalSettings & { id: string });
    if (data.musicLibrary) await db.musicLibrary.put({ id: MAIN_ID, playlist: data.musicLibrary.playlist });
  });
}

// 向后兼容：window注入
export function injectDatabaseToWindow(): void {
  if (typeof window !== 'undefined') {
    Object.assign(window, {
      db,
      Dexie,
      initializeDatabase,
      ensureDbInitialized,
      loadAllDataFromDB,
      // 聊天
      getAllChats,
      getChatById,
      saveChat,
      deleteChat,
      // API
      getApiConfig,
      saveApiConfig,
      // 全局设置
      getGlobalSettings,
      saveGlobalSettings,
      // 贴纸
      getAllUserStickers,
      saveUserSticker,
      deleteUserSticker,
      // 世界书
      getAllWorldBooks,
      getWorldBookById,
      saveWorldBook,
      deleteWorldBook,
      // 音乐库
      getMusicLibrary,
      saveMusicLibrary,
      // 角色预设
      getAllPersonaPresets,
      getPersonaPresetById,
      savePersonaPreset,
      deletePersonaPreset,
      // 预设
      getAllPresets,
      getPresetById,
      savePreset,
      deletePreset,
      // Persona
      getAllPersonas,
      getPersonaById,
      savePersona,
      deletePersona,
      searchPersonas,
      updatePersonaLastUsedAt,
      // UserRole
      getAllUserRoles,
      getUserRoleById,
      saveUserRole,
      deleteUserRole,
      searchUserRoles,
      setGlobalDefaultUserRole,
      updateUserRoleLastUsedAt,
      // 统计与批量
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
    });
  }
}

// 默认导出
export default {
  db,
  initializeDatabase,
  ensureDbInitialized,
  loadAllDataFromDB,
  // 聊天
  getAllChats,
  getChatById,
  saveChat,
  deleteChat,
  // API
  getApiConfig,
  saveApiConfig,
  // 全局设置
  getGlobalSettings,
  saveGlobalSettings,
  // 贴纸
  getAllUserStickers,
  saveUserSticker,
  deleteUserSticker,
  // 世界书
  getAllWorldBooks,
  getWorldBookById,
  saveWorldBook,
  deleteWorldBook,
  // 音乐库
  getMusicLibrary,
  saveMusicLibrary,
  // 角色预设
  getAllPersonaPresets,
  getPersonaPresetById,
  savePersonaPreset,
  deletePersonaPreset,
  // 预设
  getAllPresets,
  getPresetById,
  savePreset,
  deletePreset,
  // Persona和UserRole
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
  // 批量与统计
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
