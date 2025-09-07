// 统一的window兼容性注入模块（优化版）

import CONSTANTS, { injectConstantsToWindow } from '../constants/index';
import STATE, { injectStateToWindow } from '../state/index';
import DB, { injectDatabaseToWindow } from '../database/index';
import ROUTER from '../router/index';
import * as SCREENS from '../screens/index';
import * as SERVICES from '../services/index';
import { aiResponseModule } from '../screens/aiResponse';
import { PersonaCenterScreen } from '../screens/personaCenter/PersonaCenterScreen';

// 缓存常用模块，减少链式读取与重复绑定成本
const {
  screenManager,
  worldBookScreenModule,
  presetScreenModule,
  chatScreenModule,
} = SCREENS as any;

// 统一日志前缀
const LOG_PREFIX = 'CompatAPI';

// 角色中心实例（单例管理）
let personaCenterInstance: PersonaCenterScreen | null = null;

// 小工具：统一绑定到 window，避免重复书写，支持只读冻结（可按需开启）
function bindToWindow<K extends keyof Window>(key: K, value: Window[K]) {
  window[key] = value;
}

// 小工具：安全调用绑定目标
function safeBind<K extends keyof Window>(key: K, fn?: Window[K]) {
  if (typeof fn === 'function') {
    bindToWindow(key, fn);
  }
}

// 小工具：统一懒加载 PersonaEditorScreen
async function lazyImportPersonaEditor(rootId: string) {
  const root = document.getElementById(rootId);
  if (!root) {
    console.error(`${LOG_PREFIX}: 未找到容器 #${rootId}`);
    return;
  }
  root.innerHTML = '<div style="padding:20px;text-align:center;">正在加载角色编辑器...</div>';

  try {
    const mod = await import('../screens/personaEditor/PersonaEditorScreen');
    const Editor = mod.PersonaEditorScreen;
    const editor = new Editor(root as HTMLElement);
    await editor.initialize();
    (window as any).personaEditorScreen = editor; // 调试用途
  } catch (e: any) {
    console.error(`${LOG_PREFIX}: PersonaEditorScreen 加载失败`, e);
    root.innerHTML = `<div style="padding:20px;text-align:center;color:red;">加载失败: ${e?.message ?? '未知错误'}</div>`;
  }
}

// 小工具：角色中心单例确保销毁再创建
function createOrRecreatePersonaCenter(container: HTMLElement) {
  if (personaCenterInstance) {
    personaCenterInstance.destroy();
    personaCenterInstance = null;
  }
  personaCenterInstance = new PersonaCenterScreen(container);
  return personaCenterInstance.initialize();
}

// 统一注入函数
export function injectCompatibilityAPIs(): void {
  console.log('🔧', `${LOG_PREFIX}: 开始统一注入兼容性API`);

  // 1) 调用模块自带注入
  injectConstantsToWindow();
  injectStateToWindow();
  injectDatabaseToWindow();

  // 2) 绑定核心对象（按需暴露，保持兼容）
  Object.assign(window, {
    STATE,
    DB,
    ROUTER,
    SCREENS: { ...SCREENS, aiResponseModule },
  });

  // 3) 路由方法统一绑定，减少重复 bind
  const {
    SCREEN_IDS,
    showScreen,
    navigateToChat,
    navigateToChatList,
    getCurrentScreen,
    initRouter,
  } = ROUTER;

  Object.assign(window, {
    SCREEN_IDS,
    showScreen: showScreen.bind(ROUTER),
    navigateToChat: navigateToChat.bind(ROUTER),
    navigateToChatList: navigateToChatList.bind(ROUTER),
    getCurrentScreen: getCurrentScreen.bind(ROUTER),
    initRouter: initRouter.bind(ROUTER),
  });

  // 4) 注入服务层
  SERVICES.injectServicesToWindow?.();

  // 缓存服务引用
  const musicService = (SERVICES as any).musicService;

  // 5) 服务/聊天/AI 代理
  bindToWindow('updateListenTogetherIconProxy', (chatId: string) => {
    musicService?.updateListenTogetherIcon?.(chatId);
  });

  Object.assign(window, {
    triggerAiResponse: () => chatScreenModule?.triggerAiResponse?.(),
    parseAiResponse: (content: string) => aiResponseModule.parseAiResponse(content),
    ChatModule: chatScreenModule,
    openChat: (chatId: string) => chatScreenModule?.openChat?.(chatId),
  });

  // 6) 屏幕与渲染代理（统一可选链，避免 NPE）
  bindToWindow('screenManager', screenManager);
  Object.assign(window, {
    renderChatListProxy: chatScreenModule?.renderChatList?.bind(chatScreenModule),
    renderChatInterfaceProxy: (chatId: string) => chatScreenModule?.renderChatInterface?.(chatId),
    renderWorldBookScreenProxy: () => screenManager?.renderScreen?.('world-book'),
    renderPresetListProxy: () => screenManager?.renderScreen?.('presets'),
    renderApiSettingsProxy: () => screenManager?.renderScreen?.('api-settings'),
    renderWallpaperScreenProxy: () => screenManager?.renderScreen?.('wallpaper'),
    renderWorldBookEditorProxy: () => screenManager?.renderScreen?.('world-book-editor'),
    renderPresetEditorProxy: () => screenManager?.renderScreen?.('preset-editor'),
  });

  // 7) Persona Editor 懒加载代理
  bindToWindow('renderPersonaEditorProxy', () => {
    void lazyImportPersonaEditor('persona-editor-root');
  });

  // 8) 角色中心代理（单例）
  bindToWindow('renderPersonaCenterProxy', () => {
    const container = document.getElementById('persona-center-screen');
    if (!container) {
      console.error(`${LOG_PREFIX}: 角色中心容器未找到`);
      return;
    }
    createOrRecreatePersonaCenter(container).catch(console.error);
  });

  // 9) 编辑器打开函数
  Object.assign(window, {
    openWorldBookEditor: (id: string) => worldBookScreenModule?.openWorldBookEditor?.(id),
    openPresetEditor: (id: string | null) => presetScreenModule?.openPresetEditor?.(id),
  });

  // 10) 消息编辑函数
  Object.assign(window, {
    exitMessageEditMode: (shouldSave = false) => chatScreenModule?.exitMessageEditMode?.(shouldSave),
    toggleMessageEditMode: () => chatScreenModule?.toggleMessageEditMode?.(),
  });

  // 11) 内部状态追踪 + 角色中心管理
  bindToWindow('_editingMemberId', null);
  Object.assign(window, {
    getPersonaCenterInstance: () => personaCenterInstance,
    destroyPersonaCenterInstance: () => {
      if (personaCenterInstance) {
        personaCenterInstance.destroy();
        personaCenterInstance = null;
      }
    },
  });

  // 12) 验证
  console.log('🔧', `${LOG_PREFIX}: 代理函数注册状态`, {
    renderPersonaEditorProxy: typeof window.renderPersonaEditorProxy,
    renderPersonaCenterProxy: typeof window.renderPersonaCenterProxy,
  });

  console.log('✅', `${LOG_PREFIX}: 统一兼容性API注入完成`);
}

// TypeScript 全局声明（尽量具体，保留历史兼容 any）
declare global {
  interface Window {
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
    showScreen: (...args: any[]) => any;
    navigateToChat: (...args: any[]) => any;
    navigateToChatList: (...args: any[]) => any;
    getCurrentScreen: (...args: any[]) => any;
    initRouter: (...args: any[]) => any;

    // AI/聊天
    triggerAiResponse: () => void;
    parseAiResponse: (content: string) => any;
    ChatModule: any;
    openChat: (chatId: string) => void;

    // 屏幕与代理
    screenManager: any;
    renderChatListProxy: (() => void) | undefined;
    renderChatInterfaceProxy: ((chatId: string) => void) | undefined;
    renderWorldBookScreenProxy: () => void;
    renderPresetListProxy: () => void;
    renderApiSettingsProxy: () => void;
    renderWallpaperScreenProxy: () => void;
    renderPersonaCenterProxy: () => void;
    renderWorldBookEditorProxy: () => void;
    renderPresetEditorProxy: () => void;
    openWorldBookEditor: (id: string) => void;
    openPresetEditor: (id: string | null) => void;

    // 消息编辑
    exitMessageEditMode: (shouldSave?: boolean) => any;
    toggleMessageEditMode: () => any;

    // 音乐服务代理
    updateListenTogetherIconProxy: (chatId: string) => void;

    // 角色中心管理
    getPersonaCenterInstance: () => PersonaCenterScreen | null;
    destroyPersonaCenterInstance: () => void;

    // 内部状态
    _editingMemberId: any;

    [key: string]: any;
  }
}
