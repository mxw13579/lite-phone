// 统一的window兼容性注入模块
// 集中管理所有全局API注入，避免重复和冲突

import CONSTANTS, { injectConstantsToWindow } from '../constants';
import STATE, { injectStateToWindow } from '../state';
import DB, { injectDatabaseToWindow } from '../database';
import ROUTER from '../router';
import * as SCREENS from '../screens';
import * as SERVICES from '../services';
import { aiResponseModule } from '../screens/aiResponse';

// 导入屏幕管理器和模块实例
const { 
  screenManager, 
  worldBookScreenModule, 
  presetScreenModule 
} = SCREENS as any;

/**
 * 统一的兼容性注入函数
 * 替代各模块分散的window注入
 */
export function injectCompatibilityAPIs(): void {
  console.log('🔧 开始统一注入兼容性API...');
  
  // === 使用各模块的统一注入函数 ===
  injectConstantsToWindow();
  injectStateToWindow();
  injectDatabaseToWindow();
  
  // === 核心模块注入 ===
  window.STATE = STATE;
  window.DB = DB;
  window.ROUTER = ROUTER;
  window.SCREENS = { ...SCREENS, aiResponseModule };
  
  // === 路由兼容性 ===
  window.SCREEN_IDS = ROUTER.SCREEN_IDS;
  window.showScreen = ROUTER.showScreen.bind(ROUTER);
  window.navigateToChat = ROUTER.navigateToChat.bind(ROUTER);
  window.navigateToChatList = ROUTER.navigateToChatList.bind(ROUTER);
  window.getCurrentScreen = ROUTER.getCurrentScreen.bind(ROUTER);
  window.initRouter = ROUTER.initRouter.bind(ROUTER);
  
  // === 服务层兼容性（委托给services模块）===
  SERVICES.injectServicesToWindow();
  
  // === AI响应模块兼容性 ===
  window.triggerAiResponse = () => SCREENS.chatScreenModule.triggerAiResponse();
  window.parseAiResponse = (content: string) => aiResponseModule.parseAiResponse(content);
  
  // === 聊天模块兼容性 ===
  window.ChatModule = SCREENS.chatScreenModule;
  
  // === 屏幕代理函数兼容性 ===
  // 以前由screens/index.ts注入，现在统一到这里
  window.screenManager = screenManager;
  window.renderChatListProxy = SCREENS.chatScreenModule.renderChatList.bind(SCREENS.chatScreenModule);
  window.renderChatInterfaceProxy = (chatId: string) => SCREENS.chatScreenModule.renderChatInterface(chatId);
  window.renderWorldBookScreenProxy = () => screenManager?.renderScreen('world-book');
  window.renderPresetListProxy = () => screenManager?.renderScreen('presets');
  window.renderApiSettingsProxy = () => screenManager?.renderScreen('api-settings');
  window.renderWallpaperScreenProxy = () => screenManager?.renderScreen('wallpaper');
  
  // 编辑器代理函数
  window.renderWorldBookEditorProxy = () => screenManager?.renderScreen('world-book-editor');
  window.renderPresetEditorProxy = () => screenManager?.renderScreen('preset-editor');
  
  // 编辑器打开函数
  window.openWorldBookEditor = (id: string) => {
    worldBookScreenModule?.openWorldBookEditor(id);
  };
  window.openPresetEditor = (id: string | null) => {
    presetScreenModule?.openPresetEditor(id);
  };
  
  // === 消息编辑函数兼容性 ===
  window.exitMessageEditMode = (shouldSave = false) => {
    return SCREENS.chatScreenModule.exitMessageEditMode(shouldSave);
  };
  window.toggleMessageEditMode = () => {
    return SCREENS.chatScreenModule.toggleMessageEditMode();
  };
  
  // === 内部状态追踪 ===
  window._editingMemberId = null;
  
  console.log('✅ 统一兼容性API注入完成');
}

// TypeScript全局声明（从main.ts移动到这里）
declare global {
  interface Window {
    // 核心模块
    CONSTANTS: any;
    STATE: any;
    DB: any;
    ROUTER: any;
    SCREENS: any;
    
    // 向后兼容的状态管理API
    state: any;
    musicState: any;
    myAddress: any;
    setActiveChatId: any;
    updateGlobalSettings: any;
    setApiConfig: any;
    setMyAddress: any;
    getActiveChat: any;
    getActivePreset: any;
    isGroupChat: any;
    getFullState: any;
    
    // 向后兼容的数据库API
    db: any;
    Dexie: any;
    loadAllDataFromDB: any;
    initializeDatabase: any;
    
    // 向后兼容的路由API
    SCREEN_IDS: any;
    showScreen: any;
    navigateToChat: any;
    navigateToChatList: any;
    getCurrentScreen: any;
    initRouter: any;
    
    // AI响应和聊天模块API
    triggerAiResponse: any;
    parseAiResponse: any;
    ChatModule: any;
    
    // 屏幕管理器和代理函数
    screenManager: any;
    renderChatListProxy: any;
    renderChatInterfaceProxy: any;
    renderWorldBookScreenProxy: any;
    renderPresetListProxy: any;
    renderApiSettingsProxy: any;
    renderWallpaperScreenProxy: any;
    renderWorldBookEditorProxy: any;
    renderPresetEditorProxy: any;
    openWorldBookEditor: any;
    openPresetEditor: any;
    
    // 消息编辑函数
    exitMessageEditMode: any;
    toggleMessageEditMode: any;
    
    // 内部状态追踪
    _editingMemberId: any;
    
    // 服务层（类型声明由services/index.ts提供）
    
    // 其他扩展属性
    [key: string]: any;
  }
}