// 统一的 window 兼容性注入（采纳审查建议：XSS 修复、单例改良、类型收窄、bindAll 函数式）

import CONSTANTS, { injectConstantsToWindow } from '../constants/index';
import STATE, { injectStateToWindow } from '../state/index';
import DB, { injectDatabaseToWindow } from '../database/index';
import ROUTER from '../router/index';
import * as SCREENS from '../screens/index';
import * as SERVICES from '../services/index';
import { aiResponseModule, parseAiResponse } from '../screens/aiResponse';
import { PersonaCenterScreen } from '../screens/personaCenter/PersonaCenterScreen';
import type { PersonaEditorScreen } from '../screens/personaEditor/PersonaEditorScreen';
import type { MessageRenderModule } from '../screens/chat/render';
import type { EventHandlerModule } from '../screens/chat/events';
import type { MessageComposerModule } from '../screens/chat/composer';
import type { AttachmentHandlerModule } from '../screens/chat/attachments';
import type { VoicePlaybackModule } from '../screens/chat/playback';

// ---------------- 轻量类型约束（减少 any 泄漏） ----------------
interface RouterShape {
  SCREEN_IDS: any;
  showScreen: (...a: any[]) => any;
  navigateToChat: (...a: any[]) => any;
  navigateToChatList: (...a: any[]) => any;
  getCurrentScreen: (...a: any[]) => any;
  initRouter: (...a: any[]) => any;
}

interface ChatScreenModule {
  renderChatList?: () => void;
  renderChatInterface?: (chatId: string) => void;
  triggerAiResponse?: () => void;
  openChat?: (chatId: string) => void;
  exitMessageEditMode?: (shouldSave?: boolean) => void;
  toggleMessageEditMode?: () => void;

  renderModule?: MessageRenderModule;
  eventsModule?: EventHandlerModule;
  composerModule?: MessageComposerModule;
  attachmentsModule?: AttachmentHandlerModule;
  playbackModule?: VoicePlaybackModule;
}

interface ScreenManager {
  renderScreen?: (id: string) => void;
}

interface ScreensShape {
  screenManager?: ScreenManager;
  worldBookScreenModule?: { openWorldBookEditor?: (id: string) => void };
  presetScreenModule?: { openPresetEditor?: (id: string | null) => void };
  chatScreenModule?: ChatScreenModule;
}

// ---------------- 工具与常量 ----------------
const LOG_PREFIX = 'CompatAPI';
const log = (...args: unknown[]) => console.log('🔧', LOG_PREFIX + ':', ...args);
const ok = (...args: unknown[]) => console.log('✅', LOG_PREFIX + ':', ...args);
const err = (...args: unknown[]) => console.error(LOG_PREFIX + ':', ...args);

const noop = () => {};
const safeNoop = <T extends (...a: any[]) => any>(fn?: T): T =>
    (typeof fn === 'function' ? fn : (noop as T));

function assignAll(pairs: Record<string, any>) {
  Object.assign(window, pairs);
}

// 采用函数式写法（代码审查建议）
function bindAll<T extends object, K extends keyof T>(ctx: T, keys: K[]) {
  return Object.fromEntries(
      keys.map((key) => {
        const value = ctx[key];
        const boundValue = typeof value === 'function' ? (value as Function).bind(ctx) : value;
        return [key, boundValue];
      })
  ) as { [P in K]: T[P] };
}

// ---------------- 模块缓存（减少链式读取） ----------------
const {
  screenManager,
  worldBookScreenModule,
  presetScreenModule,
  chatScreenModule,
} = (SCREENS as unknown as ScreensShape);

function pickChatModules(cm?: ChatScreenModule) {
  if (!cm) return undefined;
  const {
    renderModule,
    eventsModule,
    composerModule,
    attachmentsModule,
    playbackModule,
  } = cm;
  return { renderModule, eventsModule, composerModule, attachmentsModule, playbackModule };
}

// ---------------- PersonaEditor 懒加载（XSS 安全） ----------------
function setInfo(container: Element, text: string, color?: string) {
  const div = document.createElement('div');
  div.style.padding = '20px';
  div.style.textAlign = 'center';
  if (color) div.style.color = color;
  div.textContent = text; // 使用纯文本，避免 XSS
  (container as HTMLElement).replaceChildren(div);
}

async function lazyImportPersonaEditor(rootId: string) {
  const root = document.getElementById(rootId);
  if (!root) {
    err(`未找到容器 #${rootId}`);
    return;
  }
  setInfo(root, '正在加载角色编辑器...');
  try {
    const mod = await import('../screens/personaEditor/PersonaEditorScreen');
    const Editor = mod.PersonaEditorScreen;
    const editor = new Editor(root);
    await editor.initialize();
    window.personaEditorScreen = editor; // 调试用途（提供类型声明）
  } catch (e: any) {
    setInfo(root, `加载失败: ${e?.message ?? '未知错误'}`, 'red');
    err('PersonaEditorScreen 加载失败', e);
  }
}

// ---------------- PersonaCenter 单例（兼容重建语义 + 新增单例获取） ----------------
let personaCenterInstance: PersonaCenterScreen | null = null;
let personaCenterHost: HTMLElement | null = null;

function getPersonaCenterInstance() {
  return personaCenterInstance;
}
function destroyPersonaCenterInstance() {
  if (personaCenterInstance) {
    personaCenterInstance.destroy();
    personaCenterInstance = null;
    personaCenterHost = null;
  }
}
async function getOrCreatePersonaCenter(container: HTMLElement) {
  if (personaCenterInstance && personaCenterHost === container) {
    return personaCenterInstance;
  }
  destroyPersonaCenterInstance();
  personaCenterHost = container;
  personaCenterInstance = new PersonaCenterScreen(container);
  await personaCenterInstance.initialize();
  return personaCenterInstance;
}
async function recreatePersonaCenter(container: HTMLElement) {
  destroyPersonaCenterInstance();
  personaCenterHost = container;
  personaCenterInstance = new PersonaCenterScreen(container);
  await personaCenterInstance.initialize();
  return personaCenterInstance;
}

// ---------------- 主注入函数 ----------------
export function injectCompatibilityAPIs(): void {
  log('开始统一注入兼容性 API');

  // 1) 模块自带注入
  injectConstantsToWindow();
  injectStateToWindow();
  injectDatabaseToWindow();

  // 2) 核心对象
  assignAll({
    STATE,
    DB,
    ROUTER,
    SCREENS: { ...(SCREENS as any), aiResponseModule },
  });

  // 3) 路由绑定
  const {
    SCREEN_IDS,
    showScreen,
    navigateToChat,
    navigateToChatList,
    getCurrentScreen,
    initRouter,
  } = (ROUTER as unknown as RouterShape);

  assignAll({
    SCREEN_IDS,
    ...bindAll(ROUTER as RouterShape, [
      'showScreen',
      'navigateToChat',
      'navigateToChatList',
      'getCurrentScreen',
      'initRouter',
    ]),
  });

  // 4) 服务层注入与缓存
  SERVICES.injectServicesToWindow?.();
  const musicService = (SERVICES as any).musicService;

  // 5) 服务/聊天/AI 代理
  assignAll({
    updateListenTogetherIconProxy: (chatId: string) =>
        musicService?.updateListenTogetherIcon?.(chatId),

    triggerAiResponse: safeNoop(() => chatScreenModule?.triggerAiResponse?.()),
    parseAiResponse: safeNoop((content: string) => parseAiResponse(content)),
    ChatModule: chatScreenModule,
    openChat: safeNoop((chatId: string) => chatScreenModule?.openChat?.(chatId)),

    CHAT_MODULES: pickChatModules(chatScreenModule),

    // 屏幕与代理
    screenManager,
    renderChatListProxy: safeNoop(chatScreenModule?.renderChatList?.bind(chatScreenModule)),
    renderChatInterfaceProxy: safeNoop((chatId: string) =>
        chatScreenModule?.renderChatInterface?.(chatId)),
    renderWorldBookScreenProxy: safeNoop(() => screenManager?.renderScreen?.('world-book')),
    renderPresetListProxy: safeNoop(() => screenManager?.renderScreen?.('presets')),
    renderApiSettingsProxy: safeNoop(() => screenManager?.renderScreen?.('api-settings')),
    renderWallpaperScreenProxy: safeNoop(() => screenManager?.renderScreen?.('wallpaper')),
    renderWorldBookEditorProxy: safeNoop(() => screenManager?.renderScreen?.('world-book-editor')),
    renderPresetEditorProxy: safeNoop(() => screenManager?.renderScreen?.('preset-editor')),

    // PersonaEditor 懒加载
    renderPersonaEditorProxy: () => { void lazyImportPersonaEditor('persona-editor-root'); },

    // PersonaCenter：保留“重建”语义 + 新增“单例获取”
    renderPersonaCenterProxy: () => {
      const container = document.getElementById('persona-center-screen');
      if (!container) return err('角色中心容器未找到');
      recreatePersonaCenter(container as HTMLElement).catch(err);
    },
    getOrCreatePersonaCenterProxy: () => {
      const container = document.getElementById('persona-center-screen');
      if (!container) return err('角色中心容器未找到');
      getOrCreatePersonaCenter(container as HTMLElement).catch(err);
    },

    // 消息编辑
    exitMessageEditMode: safeNoop((shouldSave?: boolean) =>
        chatScreenModule?.exitMessageEditMode?.(!!shouldSave)),
    toggleMessageEditMode: safeNoop(() => chatScreenModule?.toggleMessageEditMode?.()),

    // 编辑器打开
    openWorldBookEditor: safeNoop((id: string) =>
        worldBookScreenModule?.openWorldBookEditor?.(id)),
    openPresetEditor: safeNoop((id: string | null) =>
        presetScreenModule?.openPresetEditor?.(id)),

    // 角色中心管理
    getPersonaCenterInstance,
    destroyPersonaCenterInstance,

    // 内部状态
    _editingMemberId: null,
  });

  log('代理函数注册状态', {
    renderPersonaEditorProxy: typeof window.renderPersonaEditorProxy,
    renderPersonaCenterProxy: typeof window.renderPersonaCenterProxy,
    getOrCreatePersonaCenterProxy: typeof (window as any).getOrCreatePersonaCenterProxy,
  });

  ok('统一兼容性 API 注入完成');
}

// ---------------- 全局类型补充（含 personaEditorScreen 类型） ----------------
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

    // 路由
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

    // 调试：聊天子模块聚合
    CHAT_MODULES?: {
      renderModule?: MessageRenderModule;
      eventsModule?: EventHandlerModule;
      composerModule?: MessageComposerModule;
      attachmentsModule?: AttachmentHandlerModule;
      playbackModule?: VoicePlaybackModule;
    };

    // 屏幕与代理
    screenManager: any;
    renderChatListProxy: () => void;
    renderChatInterfaceProxy: (chatId: string) => void;
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
    getOrCreatePersonaCenterProxy?: () => void;

    // PersonaEditor 调试引用（类型化）
    personaEditorScreen?: PersonaEditorScreen;

    // 内部状态
    _editingMemberId: any;

    [key: string]: any;
  }
}

// ---------------- 关键改动说明 ----------------
// - 采纳审查建议：bindAll 改为函数式写法；为 window.personaEditorScreen 提供类型声明。
// - XSS 修复：所有加载/错误提示改为 textContent + replaceChildren，避免 innerHTML 注入。
// - 单例改良：保留 renderPersonaCenterProxy 的“重建”语义，新增 getOrCreatePersonaCenterProxy 提供真正单例获取，避免状态丢失风险。
// - 类型收窄：以 RouterShape/ScreensShape/ChatScreenModule 约束热点接口，减少 any，提前发现拼写与结构问题。
// - 可维护性：assignAll + safeNoop 统一注入与兜底，减少重复 Object.assign/bind 与防御性样板代码。
