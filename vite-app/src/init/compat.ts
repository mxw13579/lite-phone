// 统一的 window 兼容性注入（修复：移除对 Node process 类型依赖）

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

type ScreenId =
    | 'world-book'
    | 'presets'
    | 'api-settings'
    | 'wallpaper'
    | 'world-book-editor'
    | 'preset-editor';

interface RouterShape {
  readonly SCREEN_IDS: Record<string, string>;
  showScreen: (id: string, ...args: unknown[]) => unknown;
  navigateToChat: (chatId: string) => unknown;
  navigateToChatList: () => unknown;
  getCurrentScreen: () => { id: string } | null;
  initRouter: () => unknown;
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
  renderScreen?: (id: ScreenId) => void;
}

interface ScreensShape {
  screenManager?: ScreenManager;
  worldBookScreenModule?: { openWorldBookEditor?: (id: string) => void };
  presetScreenModule?: { openPresetEditor?: (id: string | null) => void };
  chatScreenModule?: ChatScreenModule;
}

// 环境检测：纯浏览器安全实现，避免依赖 Node 的 process 类型
function detectDev(): boolean {
  // 1) 显式全局开关（可由构建器或测试注入）
  if (typeof (window as any).__DEV__ === 'boolean') return !!(window as any).__DEV__;

  // 2) Vite 风格
  try {
    // import.meta 在 TS 中默认 any，不会引入 Node 类型
    if (typeof import.meta !== 'undefined') {
      const im: any = import.meta as any;
      if (im.env?.DEV === true) return true;
      if (typeof im.env?.MODE === 'string') return im.env.MODE !== 'production';
    }
  } catch { /* noop */ }

  // 3) Webpack/环境变量注入（通过 typeof 安全访问）
  const maybeProcess: any = (typeof globalThis !== 'undefined' && (globalThis as any).process) || undefined;
  const env = maybeProcess?.env;
  if (env && typeof env.NODE_ENV === 'string') {
    return env.NODE_ENV !== 'production';
  }

  return false;
}

const DEV = detectDev();
const LOG_PREFIX = 'CompatAPI';
const log = (...args: unknown[]) => DEV && console.log('🔧', LOG_PREFIX + ':', ...args);
const ok = (...args: unknown[]) => DEV && console.log('✅', LOG_PREFIX + ':', ...args);
const err = (...args: unknown[]) => console.error(LOG_PREFIX + ':', ...args);

const noop = () => {};
const safeNoop = <T extends (...a: any[]) => any>(fn?: T): T =>
    (typeof fn === 'function' ? fn : (noop as T));

function bindAll<T extends object, K extends readonly (keyof T)[]>(ctx: T, keys: K) {
  const out = {} as { [P in K[number]]: T[P] };
  for (const key of keys) {
    const v = ctx[key];
    (out as any)[key] = typeof v === 'function' ? (v as Function).bind(ctx) : v;
  }
  return out;
}

function batchAssign<T extends object>(
    target: T,
    entries: Record<string, unknown>,
    { detectOverwrite = DEV }: { detectOverwrite?: boolean } = {}
): void {
  if (detectOverwrite) {
    for (const k of Object.keys(entries)) {
      if (k in target) {
        console.warn(`${LOG_PREFIX}: 覆盖全局键 "${k}"`);
      }
    }
  }
  Object.assign(target, entries);
}

function pickChatModules(cm?: ChatScreenModule) {
  if (!cm) return undefined;
  const { renderModule, eventsModule, composerModule, attachmentsModule, playbackModule } = cm;
  return { renderModule, eventsModule, composerModule, attachmentsModule, playbackModule };
}

const {
  screenManager,
  worldBookScreenModule,
  presetScreenModule,
  chatScreenModule,
} = (SCREENS as unknown as ScreensShape);

function setInfo(container: Element, text: string, color?: string) {
  const div = document.createElement('div');
  div.style.padding = '20px';
  div.style.textAlign = 'center';
  if (color) div.style.color = color;
  div.textContent = text;
  (container as HTMLElement).replaceChildren(div);
}

let personaEditorLoading: Promise<void> | null = null;
async function lazyImportPersonaEditor(rootId: string) {
  const root = document.getElementById(rootId);
  if (!root) return err(`未找到容器 #${rootId}`);

  if (!personaEditorLoading) {
    setInfo(root, '正在加载角色编辑器...');
    personaEditorLoading = (async () => {
      try {
        const mod = await import('../screens/personaEditor/PersonaEditorScreen');
        const Editor = mod.PersonaEditorScreen;
        const editor = new Editor(root);
        await editor.initialize();
        (window as any).personaEditorScreen = editor;
      } catch (e: any) {
        setInfo(root, `加载失败: ${e?.message ?? '未知错误'}`, 'red');
        err('PersonaEditorScreen 加载失败', e);
      } finally {
        personaEditorLoading = null;
      }
    })();
  }
  await personaEditorLoading;
}

const PERSONA_CENTER_KEY: unique symbol = Symbol.for('app/persona-center-instance');
const PERSONA_CENTER_HOST_KEY: unique symbol = Symbol.for('app/persona-center-host');

type WinWithPersona = Window & {
  [PERSONA_CENTER_KEY]?: PersonaCenterScreen | null;
  [PERSONA_CENTER_HOST_KEY]?: HTMLElement | null;
};

function getPersonaCenterInstance() {
  return (window as WinWithPersona)[PERSONA_CENTER_KEY] ?? null;
}
function destroyPersonaCenterInstance() {
  const w = window as WinWithPersona;
  const inst = w[PERSONA_CENTER_KEY];
  if (inst) inst.destroy();
  w[PERSONA_CENTER_KEY] = null;
  w[PERSONA_CENTER_HOST_KEY] = null;
}
async function getOrCreatePersonaCenter(container: HTMLElement) {
  const w = window as WinWithPersona;
  if (w[PERSONA_CENTER_KEY] && w[PERSONA_CENTER_HOST_KEY] === container) {
    return w[PERSONA_CENTER_KEY]!;
  }
  destroyPersonaCenterInstance();
  const instance = new PersonaCenterScreen(container);
  await instance.initialize();
  w[PERSONA_CENTER_KEY] = instance;
  w[PERSONA_CENTER_HOST_KEY] = container;
  return instance;
}
async function recreatePersonaCenter(container: HTMLElement) {
  destroyPersonaCenterInstance();
  const instance = new PersonaCenterScreen(container);
  await instance.initialize();
  (window as WinWithPersona)[PERSONA_CENTER_KEY] = instance;
  (window as WinWithPersona)[PERSONA_CENTER_HOST_KEY] = container;
  return instance;
}

export function injectCompatibilityAPIs(): void {
  log('开始统一注入兼容性 API');

  injectConstantsToWindow();
  injectStateToWindow();
  injectDatabaseToWindow();

  batchAssign(window, {
    STATE,
    DB,
    ROUTER,
    SCREENS: { ...(SCREENS as any), aiResponseModule },
  });

  const router = ROUTER as unknown as RouterShape;
  const { SCREEN_IDS } = router;
  batchAssign(window, {
    SCREEN_IDS,
    ...bindAll(router, ['showScreen', 'navigateToChat', 'navigateToChatList', 'getCurrentScreen', 'initRouter'] as const),
  });

  SERVICES.injectServicesToWindow?.();
  const musicService = (SERVICES as any).musicService;

  const proxies = {
    updateListenTogetherIconProxy: (chatId: string) => musicService?.updateListenTogetherIcon?.(chatId),

    triggerAiResponse: () => chatScreenModule?.triggerAiResponse?.(),
    parseAiResponse: (content: string) => parseAiResponse(content),
    ChatModule: chatScreenModule,
    openChat: (chatId: string) => chatScreenModule?.openChat?.(chatId),

    CHAT_MODULES: pickChatModules(chatScreenModule),

    screenManager,
    renderChatListProxy: () => chatScreenModule?.renderChatList?.(),
    renderChatInterfaceProxy: (chatId: string) => chatScreenModule?.renderChatInterface?.(chatId),
    renderWorldBookScreenProxy: () => screenManager?.renderScreen?.('world-book'),
    renderPresetListProxy: () => screenManager?.renderScreen?.('presets'),
    renderApiSettingsProxy: () => screenManager?.renderScreen?.('api-settings'),
    renderWallpaperScreenProxy: () => screenManager?.renderScreen?.('wallpaper'),
    renderWorldBookEditorProxy: () => screenManager?.renderScreen?.('world-book-editor'),
    renderPresetEditorProxy: () => screenManager?.renderScreen?.('preset-editor'),

    renderPersonaEditorProxy: () => { void lazyImportPersonaEditor('persona-editor-root'); },

    renderPersonaCenterProxy: () => {
      const container = document.getElementById('persona-center-screen') as HTMLElement | null;
      if (!container) return err('角色中心容器未找到');
      void recreatePersonaCenter(container);
    },
    getOrCreatePersonaCenterProxy: () => {
      const container = document.getElementById('persona-center-screen') as HTMLElement | null;
      if (!container) return err('角色中心容器未找到');
      void getOrCreatePersonaCenter(container);
    },

    exitMessageEditMode: (shouldSave?: boolean) => chatScreenModule?.exitMessageEditMode?.(Boolean(shouldSave)),
    toggleMessageEditMode: () => chatScreenModule?.toggleMessageEditMode?.(),

    openWorldBookEditor: (id: string) => worldBookScreenModule?.openWorldBookEditor?.(id),
    openPresetEditor: (id: string | null) => presetScreenModule?.openPresetEditor?.(id),

    getPersonaCenterInstance,
    destroyPersonaCenterInstance,

    _editingMemberId: null as any,
  } as const;

  batchAssign(window, proxies);

  log('代理函数注册状态', {
    renderPersonaEditorProxy: typeof (window as any).renderPersonaEditorProxy,
    renderPersonaCenterProxy: typeof (window as any).renderPersonaCenterProxy,
    getOrCreatePersonaCenterProxy: typeof (window as any).getOrCreatePersonaCenterProxy,
  });

  ok('统一兼容性 API 注入完成');
}

declare global {
  interface Window {
    CONSTANTS: any;
    STATE: any;
    DB: any;
    ROUTER: any;
    SCREENS: any;
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

    db: any;
    Dexie: any;
    loadAllDataFromDB: any;
    initializeDatabase: any;

    SCREEN_IDS: any;
    showScreen: (...args: any[]) => any;
    navigateToChat: (...args: any[]) => any;
    navigateToChatList: (...args: any[]) => any;
    getCurrentScreen: (...args: any[]) => any;
    initRouter: (...args: any[]) => any;

    triggerAiResponse: () => void;
    parseAiResponse: (content: string) => any;
    ChatModule: any;
    openChat: (chatId: string) => void;

    CHAT_MODULES?: {
      renderModule?: MessageRenderModule;
      eventsModule?: EventHandlerModule;
      composerModule?: MessageComposerModule;
      attachmentsModule?: AttachmentHandlerModule;
      playbackModule?: VoicePlaybackModule;
    };

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

    exitMessageEditMode: (shouldSave?: boolean) => any;
    toggleMessageEditMode: () => any;

    updateListenTogetherIconProxy: (chatId: string) => void;

    getPersonaCenterInstance: () => PersonaCenterScreen | null;
    destroyPersonaCenterInstance: () => void;
    getOrCreatePersonaCenterProxy?: () => void;

    personaEditorScreen?: PersonaEditorScreen;

    _editingMemberId: any;

    [key: string]: any;
  }
}

// 变更摘要：
// - 移除了对 process 的直接引用，采用 detectDev() 在浏览器安全判断开发环境，解决 TS2580。
// - 其余逻辑保持与前版本一致，不改变外部 API 与行为。
