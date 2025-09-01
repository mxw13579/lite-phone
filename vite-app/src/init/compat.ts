// 统一的window兼容性注入模块
// 集中管理所有全局API注入，避免重复和冲突

import CONSTANTS, { injectConstantsToWindow } from '../constants/index';
import STATE, { injectStateToWindow } from '../state/index';
import DB, { injectDatabaseToWindow } from '../database/index';
import ROUTER from '../router/index';
import * as SCREENS from '../screens/index';
import * as SERVICES from '../services/index';
import { aiResponseModule } from '../screens/aiResponse';
import { PersonaCenterScreen } from '../screens/personaCenter/PersonaCenterScreen.ts';

// 导入屏幕管理器和模块实例
const { 
  screenManager, 
  worldBookScreenModule, 
  presetScreenModule 
} = SCREENS as any;

// 角色中心实例（延迟初始化）
let personaCenterInstance: PersonaCenterScreen | null = null;

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
  
  // === 音乐服务代理函数 ===
  window.updateListenTogetherIconProxy = (chatId: string) => {
    const musicService = (SERVICES as any).musicService;
    if (musicService && musicService.updateListenTogetherIcon) {
      musicService.updateListenTogetherIcon(chatId);
    }
  };
  
  // === AI响应模块兼容性 ===
  window.triggerAiResponse = () => SCREENS.chatScreenModule.triggerAiResponse();
  window.parseAiResponse = (content: string) => aiResponseModule.parseAiResponse(content);
  
  // === 聊天模块兼容性 ===
  window.ChatModule = SCREENS.chatScreenModule;
  window.openChat = (chatId: string) => SCREENS.chatScreenModule.openChat(chatId);
  
  // === 屏幕代理函数兼容性 ===
  // 以前由screens/index.ts注入，现在统一到这里
  window.screenManager = screenManager;
  window.renderChatListProxy = SCREENS.chatScreenModule.renderChatList.bind(SCREENS.chatScreenModule);
  window.renderChatInterfaceProxy = (chatId: string) => SCREENS.chatScreenModule.renderChatInterface(chatId);
  window.renderWorldBookScreenProxy = () => screenManager?.renderScreen('world-book');
  window.renderPresetListProxy = () => screenManager?.renderScreen('presets');
  window.renderApiSettingsProxy = () => screenManager?.renderScreen('api-settings');
  window.renderWallpaperScreenProxy = () => screenManager?.renderScreen('wallpaper');
  
  // 角色编辑器代理（全屏挂载 PersonaDetailComponent）
  window.renderPersonaEditorProxy = () => {
    console.log('=== renderPersonaEditorProxy called ===');
    const root = document.getElementById('persona-editor-root');
    if (!root) {
      console.error('persona-editor-root element not found');
      return;
    }
    
    console.log('Found persona-editor-root element:', root);
    
    // 清空容器
    root.innerHTML = '';
    
    // 先显示加载状态
    root.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <div>正在加载角色编辑器...</div>
      </div>
    `;
    
    console.log('Set loading state, starting to load PersonaDetailComponent...');
    
    // 懒加载 TS 源以避免循环依赖
    import('../screens/personaCenter/components/PersonaDetail.ts').then(async ({ PersonaDetailComponent }) => {
      try {
        console.log('PersonaDetailComponent imported successfully');
        
        // 构造一个最小的detail实例，仅用于创建/编辑
        const events = {
          onPersonaCreated: (p: any) => {
            // 创建后返回角色中心并选中
            console.log('onPersonaCreated called', p);
            window.navigateToPersonaCenter?.();
            const inst = window.getPersonaCenterInstance?.();
            inst?.['handlePersonaCreated']?.(p);
          },
          onUserRoleCreated: (u: any) => {
            console.log('onUserRoleCreated called', u);
            window.navigateToPersonaCenter?.();
            const inst = window.getPersonaCenterInstance?.();
            inst?.['handleUserRoleCreated']?.(u);
          },
          onCancel: () => {
            console.log('onCancel called');
            window.navigateToPersonaCenter?.();
          }
        } as any;
        
        const worldBooks = (window as any).STATE?.state?.worldBooks?.reduce?.((acc: any, wb: any) => { acc[wb.id] = wb; return acc; }, {}) || {};
        
        console.log('Creating PersonaDetailComponent...', { worldBooks, root });
        
        // 清空加载状态
        root.innerHTML = '';
        
        const detail = new PersonaDetailComponent(root as unknown as HTMLElement, events, worldBooks);
        
        // 默认进入创建状态（由触发方决定 persona / userRole）
        const mode = (window as any)._personaEditorMode || 'persona';
        console.log('Editor mode:', mode);
        
        // 确保组件完全初始化后再调用创建方法
        setTimeout(async () => {
          try {
            console.log('Attempting to call create method for mode:', mode);
            console.log('Detail component methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(detail)));
            
            if (mode === 'user') {
              console.log('Calling showCreateUserRole...');
              await (detail as any).showCreateUserRole();
            } else {
              console.log('Calling showCreatePersona...');
              await (detail as any).showCreatePersona();
            }
            console.log('Create method called successfully for mode:', mode);
            
            // 验证DOM是否已更新
            console.log('Root innerHTML after create:', root.innerHTML.substring(0, 200) + '...');
          } catch (error) {
            console.error('Error calling create method:', error);
            console.error('Error stack:', error.stack);
            
            // 显示错误信息
            root.innerHTML = `
              <div style="padding: 20px; text-align: center; color: red;">
                <div>创建角色失败: ${error.message}</div>
                <details style="margin-top: 10px; text-align: left;">
                  <summary>错误详情</summary>
                  <pre style="font-size: 12px; white-space: pre-wrap;">${error.stack}</pre>
                </details>
              </div>
            `;
          }
        }, 0);
        
        // 绑定到window便于调试
        (window as any).personaEditorDetail = detail;
        console.log('PersonaDetailComponent initialized successfully');
      } catch (error) {
        console.error('Error initializing PersonaDetailComponent:', error);
        root.innerHTML = `
          <div style="padding: 20px; text-align: center; color: red;">
            <div>加载失败: ${error.message}</div>
          </div>
        `;
      }
    }).catch(error => {
      console.error('Error importing PersonaDetailComponent:', error);
      root.innerHTML = `
        <div style="padding: 20px; text-align: center; color: red;">
          <div>导入失败: ${error.message}</div>
        </div>
      `;
    });
  };
  
  // 角色中心代理函数
  window.renderPersonaCenterProxy = () => {
    const container = document.getElementById('persona-center-screen');
    if (!container) {
      console.error('角色中心容器未找到');
      return;
    }
    
    if (!personaCenterInstance) {
      personaCenterInstance = new PersonaCenterScreen(container);
    }
    
    // 初始化或重新渲染
    personaCenterInstance.initialize().catch(console.error);
  };
  
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
  
  // === 角色中心实例管理 ===
  window.getPersonaCenterInstance = () => personaCenterInstance;
  window.destroyPersonaCenterInstance = () => {
    if (personaCenterInstance) {
      personaCenterInstance.destroy();
      personaCenterInstance = null;
    }
  };
  
  // 验证关键代理函数是否正确注册
  console.log('🔧 验证代理函数注册状态:');
  console.log('- renderPersonaEditorProxy:', typeof window.renderPersonaEditorProxy);
  console.log('- renderPersonaCenterProxy:', typeof window.renderPersonaCenterProxy);
  
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
    openChat: any;
    
    // 屏幕管理器和代理函数
    screenManager: any;
    renderChatListProxy: any;
    renderChatInterfaceProxy: any;
    renderWorldBookScreenProxy: any;
    renderPresetListProxy: any;
    renderApiSettingsProxy: any;
    renderWallpaperScreenProxy: any;
    renderPersonaCenterProxy: any;
    renderWorldBookEditorProxy: any;
    renderPresetEditorProxy: any;
    openWorldBookEditor: any;
    openPresetEditor: any;
    
    // 消息编辑函数
    exitMessageEditMode: any;
    toggleMessageEditMode: any;
    
    // 音乐服务代理函数
    updateListenTogetherIconProxy: any;
    
    // 角色中心管理函数
    getPersonaCenterInstance: any;
    destroyPersonaCenterInstance: any;
    
    // 内部状态追踪
    _editingMemberId: any;
    
    // 服务层（类型声明由services/index.ts提供）
    
    // 其他扩展属性
    [key: string]: any;
  }
}