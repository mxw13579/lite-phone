// 状态管理模块 - TypeScript版本
// 集中管理应用的全局状态和状态更新函数

import type { Persona, UserRole } from '../screens/personaCenter/types/PersonaTypes';

// === TypeScript类型定义 ===

export interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  members?: Member[];
  settings: ChatSettings;
  history: Message[];
  musicData: {
    totalTime: number;
  };
  // 角色引用字段
  personaId?: string;           // 使用的AI角色ID
  defaultUserRoleId?: string;   // 默认用户角色ID
  compositionHash?: string;     // 合成哈希，用于版本一致性检查
}

export interface Member {
  id: string;
  name: string;
  persona: string;
  avatar: string;
  patSuffix: string;
}

export interface ChatSettings {
  aiPersona: string;
  myPersona: string;
  maxMemory: number;
  aiAvatar: string;
  myAvatar: string;
  background: string;
  theme: string;
  linkedWorldBookIds: string[];
  aiPatSuffix: string;
  myPatSuffix: string;
  myGroupNickname?: string;
  groupAvatar?: string;
}

export interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: number;
  type?: 'text' | 'image' | 'voice' | 'transfer' | 'sticker' | 'ai_image' | 'voice_message' | 'pat' | 'user_photo';
  meaning?: string;
  role?: string;
  // 角色引用字段
  userRoleId?: string;          // 消息级用户角色ID（用于特定消息的角色注入）
  [key: string]: any;
}

export interface GlobalSettings {
  wallpaper: string;
  enableGeolocation: boolean;
  remoteThemeUrl: string;
  activePresetId: string;
  [key: string]: any;
}

export interface ApiConfig {
  proxyUrl: string;
  apiKey: string;
  model: string;
  [key: string]: any;
}

export interface UserSticker {
  id: string;
  url: string;
  name: string;
}

export interface WorldBook {
  id: string;
  name: string;
  content: string;
}

export interface PersonaPreset {
  id: string;
  avatar: string;
  persona: string;
}

export interface Preset {
  id: string;
  name: string;
  remark: string;
  promptImage: string;
  promptVoice: string;
  promptTransfer: string;
  promptSingle: string;
  promptGroup: string;
}

export interface MusicState {
  isActive: boolean;
  activeChatId: string | null;
  isPlaying: boolean;
  playlist: Track[];
  currentIndex: number;
  playMode: 'order' | 'random' | 'single';
  totalElapsedTime: number;
}

export interface Track {
  id: string;
  name: string;
  artist: string;
  src: string;
  isLocal: boolean;
}

export interface EditStates {
  isMessageEditMode: boolean;
  editingPresetId: string | null;
  newWallpaperBase64: string | null;
  isSelectionMode: boolean;
  editingMemberId: string | null;
  editingWorldBookId: string | null;
  editingPersonaPresetId: string | null;
}

export interface RenderState {
  currentRenderedCount: number;
  lastKnownBatteryLevel: number;
  alertFlags: {
    hasShown40: boolean;
    hasShown20: boolean;
    hasShown10: boolean;
  };
  batteryAlertTimeout: number | null;
  notificationTimeout: number | null;
}

export interface AppState {
  chats: Record<string, Chat>;
  activeChatId: string | null;
  globalSettings: GlobalSettings;
  apiConfig: ApiConfig;
  userStickers: UserSticker[];
  worldBooks: WorldBook[];
  personaPresets: PersonaPreset[];
  presets: Preset[];
  personas: Persona[];
  userRoles: UserRole[];
  activePersonaId?: string;
  activeUserRoleId?: string;
}

// === 管理器接口定义 ===
export interface StateManager {
  state: AppState;
  musicState: MusicState;
  myAddress: () => string;
  setActiveChatId: (chatId: string | null) => void;
  updateGlobalSettings: (newSettings: Partial<GlobalSettings>) => Promise<void>;
  setApiConfig: (config: Partial<ApiConfig>) => void;
  getActiveChat: () => Chat | null;
  getActivePreset: () => Preset | null;
  isGroupChat: (chatId?: string | null) => boolean;
  getFullState: () => any;
}

export interface DatabaseManager {
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

export interface MusicLibrary {
  id: 'main';
  playlist: Track[];
}

// === 核心状态对象 ===
export const state: AppState = {
  chats: {},
  activeChatId: null,
  globalSettings: {} as GlobalSettings,
  apiConfig: {} as ApiConfig,
  userStickers: [],
  worldBooks: [],
  personaPresets: [],
  presets: [],
  personas: [],
  userRoles: [],
  activePersonaId: undefined,
  activeUserRoleId: undefined
};

// === 辅助状态变量 ===
export let myAddress = '位置未知';

export const musicState: MusicState = {
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
export let editingPresetId: string | null = null;
export let newWallpaperBase64: string | null = null;
export let isSelectionMode = false;
export let selectedMessages = new Set<number>();
export let editingMemberId: string | null = null;
export let editingWorldBookId: string | null = null;
export let editingPersonaPresetId: string | null = null;

// === 其他状态变量 ===
export let currentRenderedCount = 0;
export let lastKnownBatteryLevel = 1;
export let alertFlags = { hasShown40: false, hasShown20: false, hasShown10: false };
export let batteryAlertTimeout: number | null = null;
export let notificationTimeout: number | null = null;

// === 状态更新函数 (Setter) ===

// 设置激活的聊天ID
export function setActiveChatId(chatId: string | null): void {
  state.activeChatId = chatId;
  console.log('状态更新：激活聊天ID =', chatId);
}

// 更新全局设置
export async function updateGlobalSettings(newSettings: Partial<GlobalSettings>): Promise<void> {
  Object.assign(state.globalSettings, newSettings);
  
  // 保存到数据库
  const saveGlobalSettings = (window as any).saveGlobalSettings;
  if (saveGlobalSettings) {
    try {
      await saveGlobalSettings(newSettings);
    } catch (error) {
      console.error('保存全局设置到数据库失败:', error);
    }
  }
  
  console.log('状态更新：全局设置已更新');
}

// 设置API配置
export function setApiConfig(config: Partial<ApiConfig>): void {
  Object.assign(state.apiConfig, config);
  console.log('状态更新：API配置已更新');
}

// 更新API配置（同时更新内存状态和数据库）
export async function updateApiConfig(newConfig: Partial<ApiConfig>): Promise<void> {
  Object.assign(state.apiConfig, newConfig);
  
  // 保存到数据库
  const saveApiConfig = (window as any).saveApiConfig;
  if (saveApiConfig) {
    try {
      await saveApiConfig(newConfig);
    } catch (error) {
      console.error('保存API配置到数据库失败:', error);
    }
  }
  
  console.log('状态更新：API配置已更新并保存');
}

// 更新聊天数据
export function updateChat(chatId: string, chatData: Partial<Chat>): void {
  if (state.chats[chatId]) {
    Object.assign(state.chats[chatId], chatData);
  } else {
    state.chats[chatId] = chatData as Chat;
  }
  console.log('状态更新：聊天数据已更新', chatId);
}

// 删除聊天
export function removeChat(chatId: string): void {
  delete state.chats[chatId];
  if (state.activeChatId === chatId) {
    state.activeChatId = null;
  }
  console.log('状态更新：聊天已删除', chatId);
}

// 设置用户贴纸
export function setUserStickers(stickers: UserSticker[]): void {
  state.userStickers = stickers;
  console.log('状态更新：用户贴纸已更新');
}

// 添加用户贴纸
export function addUserSticker(sticker: UserSticker): void {
  state.userStickers.push(sticker);
  console.log('状态更新：新增用户贴纸');
}

// 删除用户贴纸
export function removeUserSticker(stickerId: string): void {
  state.userStickers = state.userStickers.filter(s => s.id !== stickerId);
  console.log('状态更新：删除用户贴纸', stickerId);
}

// 设置世界书
export function setWorldBooks(worldBooks: WorldBook[]): void {
  state.worldBooks = worldBooks;
  console.log('状态更新：世界书已更新');
}

// 添加世界书
export function addWorldBook(worldBook: WorldBook): void {
  state.worldBooks.push(worldBook);
  console.log('状态更新：新增世界书');
}

// 更新世界书
export function updateWorldBook(worldBookId: string, worldBookData: Partial<WorldBook>): void {
  const index = state.worldBooks.findIndex(wb => wb.id === worldBookId);
  if (index !== -1) {
    Object.assign(state.worldBooks[index], worldBookData);
    console.log('状态更新：世界书已更新', worldBookId);
  }
}

// 删除世界书
export function removeWorldBook(worldBookId: string): void {
  state.worldBooks = state.worldBooks.filter(wb => wb.id !== worldBookId);
  console.log('状态更新：删除世界书', worldBookId);
}

// 设置预设列表
export function setPresets(presets: Preset[]): void {
  state.presets = presets;
  console.log('状态更新：预设列表已更新');
}

// 添加预设
export function addPreset(preset: Preset): void {
  state.presets.push(preset);
  console.log('状态更新：新增预设');
}

// 更新预设
export function updatePreset(presetId: string, presetData: Partial<Preset>): void {
  const index = state.presets.findIndex(p => p.id === presetId);
  if (index !== -1) {
    Object.assign(state.presets[index], presetData);
    console.log('状态更新：预设已更新', presetId);
  }
}

// 删除预设
export function removePreset(presetId: string): void {
  state.presets = state.presets.filter(p => p.id !== presetId);
  console.log('状态更新：删除预设', presetId);
}

// 设置角色预设
export function setPersonaPresets(presets: PersonaPreset[]): void {
  state.personaPresets = presets;
  console.log('状态更新：角色预设已更新');
}

// 删除角色预设
export function removePersonaPreset(presetId: string): void {
  state.personaPresets = state.personaPresets.filter(p => p.id !== presetId);
  console.log('状态更新：删除角色预设', presetId);
}

// === Persona状态管理函数 ===

// 设置Personas
export function setPersonas(personas: Persona[]): void {
  state.personas = personas;
  console.log('状态更新：Personas已更新');
}

// 添加Persona
export function addPersona(persona: Persona): void {
  state.personas.push(persona);
  console.log('状态更新：新增Persona');
}

// 更新Persona
export function updatePersona(personaId: string, personaData: Partial<Persona>): void {
  const index = state.personas.findIndex(p => p.id === personaId);
  if (index !== -1) {
    Object.assign(state.personas[index], personaData);
    console.log('状态更新：Persona已更新', personaId);
  }
}

// 删除Persona
export function removePersona(personaId: string): void {
  state.personas = state.personas.filter(p => p.id !== personaId);
  if (state.activePersonaId === personaId) {
    state.activePersonaId = undefined;
  }
  console.log('状态更新：删除Persona', personaId);
}

// 设置活跃Persona
export function setActivePersonaId(personaId: string | undefined): void {
  state.activePersonaId = personaId;
  console.log('状态更新：活跃Persona ID', personaId);
}

// === UserRole状态管理函数 ===

// 设置UserRoles
export function setUserRoles(userRoles: UserRole[]): void {
  state.userRoles = userRoles;
  console.log('状态更新：UserRoles已更新');
}

// 添加UserRole
export function addUserRole(userRole: UserRole): void {
  state.userRoles.push(userRole);
  console.log('状态更新：新增UserRole');
}

// 更新UserRole
export function updateUserRole(userRoleId: string, userRoleData: Partial<UserRole>): void {
  const index = state.userRoles.findIndex(ur => ur.id === userRoleId);
  if (index !== -1) {
    Object.assign(state.userRoles[index], userRoleData);
    console.log('状态更新：UserRole已更新', userRoleId);
  }
}

// 删除UserRole
export function removeUserRole(userRoleId: string): void {
  state.userRoles = state.userRoles.filter(ur => ur.id !== userRoleId);
  if (state.activeUserRoleId === userRoleId) {
    state.activeUserRoleId = undefined;
  }
  console.log('状态更新：删除UserRole', userRoleId);
}

// 设置活跃UserRole
export function setActiveUserRoleId(userRoleId: string | undefined): void {
  state.activeUserRoleId = userRoleId;
  console.log('状态更新：活跃UserRole ID', userRoleId);
}

// 获取活跃的Persona
export function getActivePersona(): Persona | null {
  return state.activePersonaId ? 
    state.personas.find(p => p.id === state.activePersonaId) || null : 
    null;
}

// 获取活跃的UserRole
export function getActiveUserRole(): UserRole | null {
  return state.activeUserRoleId ? 
    state.userRoles.find(ur => ur.id === state.activeUserRoleId) || null : 
    null;
}

// === 辅助状态更新函数 ===

// 设置地址
export function setMyAddress(address: string): void {
  myAddress = address;
  console.log('状态更新：地址已设置为', address);
}

// 音乐状态更新
export function setMusicActive(chatId: string): void {
  musicState.isActive = true;
  musicState.activeChatId = chatId;
  console.log('状态更新：音乐模式激活', chatId);
}

export function setMusicInactive(): void {
  musicState.isActive = false;
  musicState.activeChatId = null;
  musicState.isPlaying = false;
  console.log('状态更新：音乐模式停用');
}

// 编辑状态更新
export function setMessageEditMode(enabled: boolean): void {
  isMessageEditMode = enabled;
  console.log('状态更新：消息编辑模式', enabled ? '启用' : '禁用');
}

export function setEditingPresetId(presetId: string | null): void {
  editingPresetId = presetId;
  console.log('状态更新：编辑预设ID', presetId);
}

export function setSelectionMode(enabled: boolean): void {
  isSelectionMode = enabled;
  if (!enabled) {
    selectedMessages.clear();
  }
  console.log('状态更新：选择模式', enabled ? '启用' : '禁用');
}

// === 消息选择操作API（Phase 3新增）===

// 添加选中消息
export function addSelectedMessage(timestamp: number): void {
  selectedMessages.add(timestamp);
  console.log('状态更新：添加选中消息', timestamp);
}

// 移除选中消息
export function removeSelectedMessage(timestamp: number): void {
  selectedMessages.delete(timestamp);
  console.log('状态更新：移除选中消息', timestamp);
}

// 切换消息选中状态
export function toggleSelectedMessage(timestamp: number): void {
  if (selectedMessages.has(timestamp)) {
    selectedMessages.delete(timestamp);
  } else {
    selectedMessages.add(timestamp);
  }
  console.log('状态更新：切换消息选中', timestamp, selectedMessages.has(timestamp) ? '选中' : '取消');
}

// 清空所有选中消息
export function clearSelectedMessages(): void {
  selectedMessages.clear();
  console.log('状态更新：清空所有选中消息');
}

// 获取选中消息数量
export function getSelectedMessageCount(): number {
  return selectedMessages.size;
}

// 获取选中消息集合（返回副本）
export function getSelectedMessages(): Set<number> {
  return new Set(selectedMessages);
}

// === 状态查询函数 ===

// 获取当前激活的聊天
export function getActiveChat(): Chat | null {
  return state.activeChatId ? state.chats[state.activeChatId] : null;
}

// 获取当前激活的预设
export function getActivePreset(): Preset | null {
  if (!state.globalSettings.activePresetId) return null;
  return state.presets.find(p => p.id === state.globalSettings.activePresetId) || null;
}

// 检查是否为群聊
export function isGroupChat(chatId: string | null = state.activeChatId): boolean {
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
    } as EditStates,
    renderState: {
      currentRenderedCount,
      lastKnownBatteryLevel,
      alertFlags,
      batteryAlertTimeout,
      notificationTimeout
    } as RenderState
  };
}

// === 向后兼容：window对象注入（类型声明移至init/compat.ts） ===

// === 向后兼容：window对象注入 ===
export function injectStateToWindow(): void {
  if (typeof window !== 'undefined') {
    // 核心状态对象
    window.state = state;
    
    // 主要状态更新函数
    window.setActiveChatId = setActiveChatId;
    window.updateGlobalSettings = updateGlobalSettings;
    window.getActiveChat = getActiveChat;
    window.isGroupChat = isGroupChat;
    window.getFullState = getFullState;
    
    // 扩展状态管理函数
    Object.assign(window, {
      myAddress: () => myAddress,
      setMyAddress,
      musicState,
      setMusicActive,
      setMusicInactive,
      updateChat,
      removeChat,
      setUserStickers,
      addUserSticker,
      removeUserSticker,
      setWorldBooks,
      addWorldBook,
      updateWorldBook,
      removeWorldBook,
      setPresets,
      addPreset,
      updatePreset,
      removePreset,
      setPersonaPresets,
      removePersonaPreset,
      // Persona和UserRole状态管理函数
      setPersonas,
      addPersona,
      updatePersona,
      removePersona,
      setActivePersonaId,
      setUserRoles,
      addUserRole,
      updateUserRole,
      removeUserRole,
      setActiveUserRoleId,
      getActivePersona,
      getActiveUserRole,
      setApiConfig,
      updateApiConfig,
      getActivePreset,
      setMessageEditMode,
      setEditingPresetId,
      setSelectionMode,
      // Phase 3新增：消息选择操作API
      addSelectedMessage,
      removeSelectedMessage,
      toggleSelectedMessage,
      clearSelectedMessages,
      getSelectedMessageCount,
      getSelectedMessages
    });
  }
}

// 注意：不再自动注入，由init/compat.ts统一管理全局注入

export default {
  state,
  musicState,
  myAddress: () => myAddress,
  // 导出所有状态管理函数
  setActiveChatId,
  updateGlobalSettings,
  setApiConfig,
  updateApiConfig,
  updateChat,
  removeChat,
  setUserStickers,
  addUserSticker,
  removeUserSticker,
  setWorldBooks,
  addWorldBook,
  updateWorldBook,
  removeWorldBook,
  setPresets,
  addPreset,
  updatePreset,
  removePreset,
  setPersonaPresets,
  removePersonaPreset,
  // Persona和UserRole状态管理函数
  setPersonas,
  addPersona,
  updatePersona,
  removePersona,
  setActivePersonaId,
  setUserRoles,
  addUserRole,
  updateUserRole,
  removeUserRole,
  setActiveUserRoleId,
  getActivePersona,
  getActiveUserRole,
  setMyAddress,
  setMusicActive,
  setMusicInactive,
  setMessageEditMode,
  setEditingPresetId,
  setSelectionMode,
  // Phase 3新增：消息选择操作API
  addSelectedMessage,
  removeSelectedMessage,
  toggleSelectedMessage,
  clearSelectedMessages,
  getSelectedMessageCount,
  getSelectedMessages,
  getActiveChat,
  getActivePreset,
  isGroupChat,
  getFullState
};