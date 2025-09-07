// 路由管理模块 - 优化版 TypeScript（修复 Array.at 兼容性）

// === 常量与类型 ===
export const SCREEN_IDS = {
  HOME: 'home-screen',
  CHAT_LIST: 'chat-list-screen',
  CHAT_INTERFACE: 'chat-interface-screen',
  API_SETTINGS: 'api-settings-screen',
  WALLPAPER: 'wallpaper-screen',
  WORLD_BOOK: 'world-book-screen',
  WORLD_BOOK_EDITOR: 'world-book-editor-screen',
  PRESET_LIST: 'preset-list-screen',
  PRESET_EDITOR: 'preset-editor-screen',
  PERSONA_CENTER: 'persona-center-screen',
  PERSONA_EDITOR: 'persona-editor-screen'
} as const;
export type ScreenId = typeof SCREEN_IDS[keyof typeof SCREEN_IDS];

export type RenderFunction = () => void;
export type PostProcessFunction = (screenId: ScreenId) => void;
export type BeforeNavigateGuard = (from: ScreenId, to: ScreenId) => boolean;

export interface RouteEntry {
  screenId: ScreenId;
  timestamp: number;
  params?: Record<string, any>;
}

// === 内部工具 ===
const __DEV__ = true; // 构建时可替换
const log = {
  info: (...a: any[]) => __DEV__ && console.log('[router]', ...a),
  warn: (...a: any[]) => console.warn('[router]', ...a),
  error: (...a: any[]) => console.error('[router]', ...a),
};

const getWin = () => (window as any);

const isMsgEditMode = (): boolean => {
  const w = getWin();
  return (
      (w.STATE && typeof w.STATE.isMessageEditMode !== 'undefined' ? w.STATE.isMessageEditMode : undefined) ??
      (typeof w.isMessageEditMode !== 'undefined' ? w.isMessageEditMode : w.getIsMessageEditMode?.() ?? false)
  );
};

// === 路由状态 ===
let currentScreenId: ScreenId = SCREEN_IDS.HOME;
let beforeNavigateGuard: BeforeNavigateGuard | null = null;

// 渲染与后处理使用 Map
const screenRenderMap = new Map<ScreenId, RenderFunction>();
const screenPostProcessMap = new Map<ScreenId, PostProcessFunction>();

// 初始化内置渲染函数
const ensureProxy = (name: string) => getWin()[name] ?? (() => {});
const defaultRenderers: Partial<Record<ScreenId, RenderFunction>> = {
  [SCREEN_IDS.HOME]: () => {},
  [SCREEN_IDS.CHAT_LIST]: () => ensureProxy('renderChatListProxy')(),
  [SCREEN_IDS.CHAT_INTERFACE]: () => {
    const w = getWin();
    const activeChatId = w.STATE?.state?.activeChatId ?? w.state?.activeChatId;
    if (activeChatId) {
      ensureProxy('renderChatInterfaceProxy')(activeChatId);
    } else {
      log.warn('无法渲染聊天界面：没有激活的聊天ID');
    }
  },
  [SCREEN_IDS.API_SETTINGS]: () => ensureProxy('renderApiSettingsProxy')(),
  [SCREEN_IDS.WALLPAPER]: () => ensureProxy('renderWallpaperScreenProxy')(),
  [SCREEN_IDS.WORLD_BOOK]: () => ensureProxy('renderWorldBookScreenProxy')(),
  [SCREEN_IDS.WORLD_BOOK_EDITOR]: () => ensureProxy('renderWorldBookEditorProxy')(),
  [SCREEN_IDS.PRESET_LIST]: () => ensureProxy('renderPresetListProxy')(),
  [SCREEN_IDS.PRESET_EDITOR]: () => ensureProxy('renderPresetEditorProxy')(),
  [SCREEN_IDS.PERSONA_CENTER]: () => ensureProxy('renderPersonaCenterProxy')(),
  [SCREEN_IDS.PERSONA_EDITOR]: () => ensureProxy('renderPersonaEditorProxy')(),
};
Object.entries(defaultRenderers).forEach(([k, v]) => v && screenRenderMap.set(k as ScreenId, v));

const defaultPostProcess: Partial<Record<ScreenId, PostProcessFunction>> = {
  [SCREEN_IDS.CHAT_INTERFACE]: (screenId: ScreenId) => {
    const w = getWin();
    const state = w.state ?? w.STATE?.state;
    if (state?.activeChatId) {
      ensureProxy('updateListenTogetherIconProxy')(state.activeChatId);
    }
  },
};
Object.entries(defaultPostProcess).forEach(([k, v]) => v && screenPostProcessMap.set(k as ScreenId, v));

// === 屏幕元素缓存（避免每次全量查询） ===
const screenElementCache = new Map<ScreenId, HTMLElement>();
let activeEl: HTMLElement | null = null;

export function registerScreenElement(id: ScreenId, el: HTMLElement | null): void {
  if (!el) return;
  screenElementCache.set(id, el);
}

function getScreenElement(id: ScreenId): HTMLElement | null {
  const cached = screenElementCache.get(id);
  if (cached) return cached;
  const el = document.getElementById(id);
  if (el) screenElementCache.set(id, el);
  return el;
}

// 仅切换必要元素的类，提高性能
function switchScreenDisplay(screenId: ScreenId): boolean {
  const next = getScreenElement(screenId);
  if (!next) {
    log.error('屏幕切换：未找到屏幕元素', screenId);
    return false;
  }
  // 防御：清理所有误置的 active，确保只有目标屏幕可见
  document.querySelectorAll('.screen.active').forEach(el => {
    if (el !== next) el.classList.remove('active');
  });

  if (activeEl !== next) {
    if (activeEl) activeEl.classList.remove('active');
    next.classList.add('active');
    activeEl = next;
  }
  log.info('屏幕切换：激活屏幕', screenId);
  return true;
}

// === 历史记录（环形缓冲区） ===
const MAX_HISTORY = 10;
const historyBuffer = new Array<RouteEntry>(MAX_HISTORY);
let histSize = 0;
let histHead = 0; // 指向下一个写入位置

function pushRoute(screenId: ScreenId, params?: Record<string, any>): void {
  const entry: RouteEntry = { screenId, timestamp: Date.now(), params };
  historyBuffer[histHead] = entry;
  histHead = (histHead + 1) % MAX_HISTORY;
  if (histSize < MAX_HISTORY) histSize++;
}

function peekPrev(): RouteEntry | null {
  if (histSize <= 1) return null;
  const idx = (histHead - 2 + MAX_HISTORY) % MAX_HISTORY;
  return historyBuffer[idx] || null;
}

export function getRouteHistory(): string[] {
  const out: string[] = [];
  for (let i = 0; i < histSize; i++) {
    const idx = (histHead - histSize + i + MAX_HISTORY) % MAX_HISTORY;
    const e = historyBuffer[idx];
    if (e) out.push(e.screenId);
  }
  return out;
}

export function getRouteHistoryEntries(): RouteEntry[] {
  const out: RouteEntry[] = [];
  for (let i = 0; i < histSize; i++) {
    const idx = (histHead - histSize + i + MAX_HISTORY) % MAX_HISTORY;
    const e = historyBuffer[idx];
    if (e) out.push({ ...e });
  }
  return out;
}

export function clearRouteHistory(): void {
  histSize = 0;
  histHead = 0;
  pushRoute(currentScreenId);
}

export function goBack(): boolean {
  if (histSize <= 1) return false;
  // 移除当前
  histHead = (histHead - 1 + MAX_HISTORY) % MAX_HISTORY;
  histSize--;
  // 使用不含 .at 的安全回退
  const prev = peekPrev();
  let target: ScreenId | null = null;
  if (prev && prev.screenId) {
    target = prev.screenId;
  } else {
    const entries = getRouteHistoryEntries();
    if (entries.length > 0) {
      target = entries[entries.length - 1].screenId;
    }
  }
  if (!target) return false;
  // 使用强制跳转，确保返回操作总是成功
  return showScreen(target, true);
}

// === 核心路由函数 ===
export function showScreen(screenId: ScreenId, force: boolean = false): boolean {
  // 早返回：相同屏幕不重复渲染和写历史（除非强制跳转）
  if (currentScreenId === screenId && !force) {
    log.info('忽略重复路由：', screenId);
    return true;
  }

  if (beforeNavigateGuard && !beforeNavigateGuard(currentScreenId, screenId)) {
    log.info('路由守卫拦截：从', currentScreenId, '到', screenId);
    return false;
  }

  // 退出消息编辑模式（若目标非聊天界面）
  if (isMsgEditMode() && screenId !== SCREEN_IDS.CHAT_INTERFACE) {
    getWin().exitMessageEditMode?.(false);
  }

  const render = screenRenderMap.get(screenId);
  if (render) {
    try {
      render();
    } catch (e) {
      log.error(`屏幕渲染函数执行失败: ${screenId}`, e);
    }
  } else {
    log.warn(`未找到屏幕渲染函数: ${screenId}`);
  }

  const switched = switchScreenDisplay(screenId);
  if (!switched) return false;

  const post = screenPostProcessMap.get(screenId);
  if (post) {
    try {
      post(screenId);
    } catch (e) {
      log.error(`屏幕后处理函数执行失败: ${screenId}`, e);
    }
  }

  pushRoute(screenId);
  currentScreenId = screenId;
  log.info('路由切换：当前屏幕 =', screenId);
  return true;
}

// === 查询函数 ===
export function getCurrentScreen(): ScreenId {
  return currentScreenId;
}
export function isCurrentScreen(screenId: ScreenId): boolean {
  return currentScreenId === screenId;
}

// === 守卫管理 ===
export function setBeforeNavigateGuard(guard: BeforeNavigateGuard | null): void {
  beforeNavigateGuard = guard;
  log.info('路由守卫：', guard ? '已设置' : '已清除');
}
export function getBeforeNavigateGuard(): BeforeNavigateGuard | null {
  return beforeNavigateGuard;
}

// === 导航API（保留原有别名以兼容） ===
export function navigate(screenId: ScreenId, params?: Record<string, any>): boolean {
  // params 目前仅保留给未来扩展，showScreen 内部 pushRoute 已处理
  return showScreen(screenId, false) && (params ? (void 0) : true);
}

export function goHome(): void { showScreen(SCREEN_IDS.HOME); }

export function navigateToChat(chatId?: string | null): void {
  const w = getWin();
  if (chatId && w.setActiveChatId && w.state?.activeChatId !== chatId) {
    w.setActiveChatId(chatId);
  }
  showScreen(SCREEN_IDS.CHAT_INTERFACE);
}
export function navigateToChatList(): void { showScreen(SCREEN_IDS.CHAT_LIST); }
export function navigateToApiSettings(): void { showScreen(SCREEN_IDS.API_SETTINGS); }
export function navigateToWorldBook(): void { showScreen(SCREEN_IDS.WORLD_BOOK); }
export function navigateToWorldBookEditor(): void { showScreen(SCREEN_IDS.WORLD_BOOK_EDITOR); }
export function navigateToPresets(): void { showScreen(SCREEN_IDS.PRESET_LIST); }
export function navigateToPresetEditor(): void { showScreen(SCREEN_IDS.PRESET_EDITOR); }
export function navigateToWallpaper(): void { showScreen(SCREEN_IDS.WALLPAPER); }
export function navigateToPersonaCenter(): void { showScreen(SCREEN_IDS.PERSONA_CENTER); }

// === 渲染/后处理注册（返回取消注册函数，便于释放） ===
export function registerScreenRenderer(screenId: ScreenId, fn: RenderFunction): () => void {
  screenRenderMap.set(screenId, fn);
  log.info('路由注册：渲染', screenId);
  return () => screenRenderMap.delete(screenId);
}
export function registerScreenPostProcess(screenId: ScreenId, fn: PostProcessFunction): () => void {
  screenPostProcessMap.set(screenId, fn);
  log.info('路由注册：后处理', screenId);
  return () => screenPostProcessMap.delete(screenId);
}

// === 代理函数准备（与原实现兼容） ===
export function setupProxyMappings(): void {
  const w = getWin();
  const names = [
    'renderChatListProxy',
    'renderChatInterfaceProxy',
    'renderApiSettingsProxy',
    'renderWallpaperScreenProxy',
    'renderWorldBookScreenProxy',
    'renderWorldBookEditorProxy',
    'renderPresetListProxy',
    'renderPresetEditorProxy',
    'renderPersonaCenterProxy',
    'updateListenTogetherIconProxy'
  ];
  names.forEach(n => { if (!w[n]) w[n] = () => {}; });
  log.info('路由初始化：代理函数映射已设置');
}

// === 初始化 ===
export function initRouter(): void {
  setupProxyMappings();
  pushRoute(currentScreenId);
  // 启动时尝试缓存已存在的屏幕元素（可选）
  (Object.values(SCREEN_IDS) as ScreenId[]).forEach(id => {
    const el = document.getElementById(id);
    if (el) registerScreenElement(id, el);
  });
  // 同步初始活动元素：index.html 默认给 home-screen 添加了 active
  // 这里将内部 activeEl 与 DOM 对齐，并清理其他误置的 active，避免多屏并显
  const initialEl = getScreenElement(currentScreenId);
  if (initialEl) {
    document.querySelectorAll('.screen.active').forEach(el => {
      if (el !== initialEl) el.classList.remove('active');
    });
    initialEl.classList.add('active');
    activeEl = initialEl;
  }
  log.info('路由模块初始化完成');
}

// 默认导出保持兼容
export default {
  SCREEN_IDS,
  showScreen,
  getCurrentScreen,
  isCurrentScreen,
  setBeforeNavigateGuard,
  getBeforeNavigateGuard,
  goHome,
  navigateToChat,
  navigateToChatList,
  navigateToApiSettings,
  navigateToWorldBook,
  navigateToWorldBookEditor,
  navigateToPresets,
  navigateToPresetEditor,
  navigateToWallpaper,
  navigateToPersonaCenter,
  registerScreenRenderer,
  registerScreenPostProcess,
  setupProxyMappings,
  // 历史API
  getRouteHistory,
  getRouteHistoryEntries,
  clearRouteHistory,
  goBack,
  initRouter,
  // 新增
  navigate,
  registerScreenElement
};
