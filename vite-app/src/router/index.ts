// 路由管理模块 - TypeScript版本  
// 处理屏幕切换逻辑和页面导航

// === TypeScript类型定义 ===
export type ScreenId = 
  | 'home-screen'
  | 'chat-list-screen' 
  | 'chat-interface-screen'
  | 'api-settings-screen'
  | 'wallpaper-screen'
  | 'world-book-screen'
  | 'world-book-editor-screen'
  | 'preset-list-screen'
  | 'preset-editor-screen';

export type RenderFunction = () => void;
export type PostProcessFunction = (screenId: ScreenId) => void;

export interface RouteEntry {
  screenId: ScreenId;
  timestamp: number;
  params?: Record<string, any>;
}

// 屏幕ID常量
export const SCREEN_IDS: Record<string, ScreenId> = {
  HOME: 'home-screen',
  CHAT_LIST: 'chat-list-screen',
  CHAT_INTERFACE: 'chat-interface-screen',
  API_SETTINGS: 'api-settings-screen',
  WALLPAPER: 'wallpaper-screen',
  WORLD_BOOK: 'world-book-screen',
  WORLD_BOOK_EDITOR: 'world-book-editor-screen',
  PRESET_LIST: 'preset-list-screen',
  PRESET_EDITOR: 'preset-editor-screen'
} as const;

// === 路由状态管理 ===

// 当前活动屏幕ID
let currentScreenId: ScreenId = SCREEN_IDS.HOME;

// 屏幕渲染代理映射
const screenRenderMap: Partial<Record<ScreenId, RenderFunction>> = {
  [SCREEN_IDS.HOME]: () => {},
  [SCREEN_IDS.CHAT_LIST]: () => (window as any).renderChatListProxy?.(),
  [SCREEN_IDS.CHAT_INTERFACE]: () => (window as any).renderChatInterfaceProxy?.(),
  [SCREEN_IDS.API_SETTINGS]: () => (window as any).renderApiSettingsProxy?.(),
  [SCREEN_IDS.WALLPAPER]: () => (window as any).renderWallpaperScreenProxy?.(),
  [SCREEN_IDS.WORLD_BOOK]: () => (window as any).renderWorldBookScreenProxy?.(),
  [SCREEN_IDS.WORLD_BOOK_EDITOR]: () => (window as any).renderWorldBookEditorProxy?.(),
  [SCREEN_IDS.PRESET_LIST]: () => (window as any).renderPresetListProxy?.(),
  [SCREEN_IDS.PRESET_EDITOR]: () => (window as any).renderPresetEditorProxy?.()
};

// 特殊屏幕的后处理函数
const screenPostProcessMap: Partial<Record<ScreenId, PostProcessFunction | undefined>> = {
  [SCREEN_IDS.HOME]: undefined,
  [SCREEN_IDS.CHAT_LIST]: undefined,
  [SCREEN_IDS.CHAT_INTERFACE]: (screenId: ScreenId) => {
    const state = (window as any).state;
    if (state && (window as any).updateListenTogetherIconProxy) {
      (window as any).updateListenTogetherIconProxy(state.activeChatId);
    }
  },
  [SCREEN_IDS.API_SETTINGS]: undefined,
  [SCREEN_IDS.WALLPAPER]: undefined,
  [SCREEN_IDS.WORLD_BOOK]: undefined,
  [SCREEN_IDS.WORLD_BOOK_EDITOR]: undefined,
  [SCREEN_IDS.PRESET_LIST]: undefined,
  [SCREEN_IDS.PRESET_EDITOR]: undefined
};

// === 核心路由函数 ===

// 主要的屏幕切换函数
export function showScreen(screenId: ScreenId): void {
  // 处理消息编辑模式 - 从多个来源检查（与原始版本保持一致）
  const win = window as any;
  const isMessageEditMode = win.STATE?.isMessageEditMode || 
                           (typeof win.isMessageEditMode !== 'undefined' ? win.isMessageEditMode : 
                           (win.getIsMessageEditMode?.() ?? false));
  
  if (isMessageEditMode && screenId !== SCREEN_IDS.CHAT_INTERFACE) {
    if (win.exitMessageEditMode) {
      win.exitMessageEditMode(false);
    }
  }

  // 调用对应屏幕的渲染函数
  const renderFunction = screenRenderMap[screenId];
  if (renderFunction) {
    try {
      renderFunction();
    } catch (error) {
      console.error(`屏幕渲染函数执行失败: ${screenId}`, error);
    }
  }

  // 切换屏幕显示状态
  switchScreenDisplay(screenId);

  // 执行屏幕特定的后处理
  const postProcess = screenPostProcessMap[screenId];
  if (postProcess) {
    try {
      postProcess(screenId);
    } catch (error) {
      console.error(`屏幕后处理函数执行失败: ${screenId}`, error);
    }
  }

  // 记录路由历史
  pushRoute(screenId);

  // 更新当前屏幕ID
  currentScreenId = screenId;
  console.log('路由切换：当前屏幕 =', screenId);
}

// 屏幕显示状态切换的核心逻辑
function switchScreenDisplay(screenId: ScreenId): void {
  // 移除所有屏幕的active类
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => {
    screen.classList.remove('active');
  });

  // 添加目标屏幕的active类
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add('active');
    console.log('屏幕切换：激活屏幕', screenId);
  } else {
    console.error('屏幕切换：未找到屏幕元素', screenId);
  }
}

// === 路由查询函数 ===

// 获取当前活动的屏幕ID
export function getCurrentScreen(): ScreenId {
  return currentScreenId;
}

// 检查指定屏幕是否为当前活动屏幕
export function isCurrentScreen(screenId: ScreenId): boolean {
  return currentScreenId === screenId;
}

// === 导航函数 ===

// 回到主屏幕
export function goHome(): void {
  showScreen(SCREEN_IDS.HOME);
}

// 导航到聊天界面
export function navigateToChat(chatId?: string | null): void {
  if (chatId && (window as any).setActiveChatId) {
    (window as any).setActiveChatId(chatId);
  }
  showScreen(SCREEN_IDS.CHAT_INTERFACE);
}

// 导航到聊天列表
export function navigateToChatList(): void {
  showScreen(SCREEN_IDS.CHAT_LIST);
}

// 导航到API设置
export function navigateToApiSettings(): void {
  showScreen(SCREEN_IDS.API_SETTINGS);
}

// 导航到世界书
export function navigateToWorldBook(): void {
  showScreen(SCREEN_IDS.WORLD_BOOK);
}

// 导航到世界书编辑器
export function navigateToWorldBookEditor(): void {
  showScreen(SCREEN_IDS.WORLD_BOOK_EDITOR);
}

// 导航到预设列表
export function navigateToPresets(): void {
  showScreen(SCREEN_IDS.PRESET_LIST);
}

// 导航到预设编辑器
export function navigateToPresetEditor(): void {
  showScreen(SCREEN_IDS.PRESET_EDITOR);
}

// 导航到壁纸设置
export function navigateToWallpaper(): void {
  showScreen(SCREEN_IDS.WALLPAPER);
}

// === 渲染函数注册系统 ===

// 注册屏幕渲染函数（供屏幕模块使用）
export function registerScreenRenderer(screenId: ScreenId, renderFunction: RenderFunction): void {
  screenRenderMap[screenId] = renderFunction;
  console.log('路由注册：注册屏幕渲染函数', screenId);
}

// 注册屏幕后处理函数
export function registerScreenPostProcess(screenId: ScreenId, postProcessFunction: PostProcessFunction): void {
  screenPostProcessMap[screenId] = postProcessFunction;
  console.log('路由注册：注册屏幕后处理函数', screenId);
}

// 批量注册代理函数映射（用于兼容现有代码）
export function setupProxyMappings(): void {
  const win = window as any;
  
  // 确保全局代理函数存在
  const proxyFunctions = [
    'renderChatListProxy',
    'renderChatInterfaceProxy',
    'renderApiSettingsProxy', 
    'renderWallpaperScreenProxy',
    'renderWorldBookScreenProxy',
    'renderWorldBookEditorProxy',
    'renderPresetListProxy',
    'renderPresetEditorProxy',
    'updateListenTogetherIconProxy'
  ];

  proxyFunctions.forEach(fnName => {
    if (!win[fnName]) {
      win[fnName] = () => {};
    }
  });
  
  console.log('路由初始化：代理函数映射已设置');
}

// === 路由历史记录系统 ===

// 路由历史记录（简单实现）
const routeHistory: RouteEntry[] = [];
const MAX_HISTORY = 10;

export function pushRoute(screenId: ScreenId, params?: Record<string, any>): void {
  const entry: RouteEntry = {
    screenId,
    timestamp: Date.now(),
    params
  };
  
  routeHistory.push(entry);
  if (routeHistory.length > MAX_HISTORY) {
    routeHistory.shift();
  }
}

export function goBack(): boolean {
  if (routeHistory.length > 1) {
    routeHistory.pop(); // 移除当前路由
    const previousRoute = routeHistory[routeHistory.length - 1];
    if (previousRoute) {
      showScreen(previousRoute.screenId);
      return true;
    }
  }
  return false;
}

// 获取路由历史记录（返回screenId数组以保持兼容性）
export function getRouteHistory(): string[] {
  return routeHistory.map(entry => entry.screenId);
}

// 获取完整路由历史记录（包含时间戳和参数）
export function getRouteHistoryEntries(): RouteEntry[] {
  return [...routeHistory];
}

export function clearRouteHistory(): void {
  routeHistory.length = 0;
  pushRoute(currentScreenId);
}

// === 路由模块初始化 ===

export function initRouter(): void {
  setupProxyMappings();
  
  // 记录初始路由
  pushRoute(currentScreenId);
  
  console.log('路由模块初始化完成');
}

// === 向后兼容：注入到window对象（类型声明移至init/compat.ts） ===

// 注入到window对象，保持向后兼容性
if (typeof window !== 'undefined') {
  const win = window as any;
  
  // 核心常量和函数
  win.SCREEN_IDS = SCREEN_IDS;
  win.showScreen = showScreen;
  win.getCurrentScreen = getCurrentScreen;
  win.isCurrentScreen = isCurrentScreen;
  
  // 导航函数
  win.goHome = goHome;
  win.navigateToChat = navigateToChat;
  win.navigateToChatList = navigateToChatList;
  win.navigateToApiSettings = navigateToApiSettings;
  win.navigateToWorldBook = navigateToWorldBook;
  win.navigateToPresets = navigateToPresets;
  win.navigateToWallpaper = navigateToWallpaper;
  
  // 注册和管理函数
  win.registerScreenRenderer = registerScreenRenderer;
  win.registerScreenPostProcess = registerScreenPostProcess;
  win.setupProxyMappings = setupProxyMappings;
  
  // 历史记录函数
  win.goBack = goBack;
  win.getRouteHistory = getRouteHistory;
  
  // 初始化函数
  win.initRouter = initRouter;
}

// 默认导出
export default {
  SCREEN_IDS,
  showScreen,
  getCurrentScreen,
  isCurrentScreen,
  goHome,
  navigateToChat,
  navigateToChatList,
  navigateToApiSettings,
  navigateToWorldBook,
  navigateToWorldBookEditor,
  navigateToPresets,
  navigateToPresetEditor,
  navigateToWallpaper,
  registerScreenRenderer,
  registerScreenPostProcess,
  setupProxyMappings,
  pushRoute,
  goBack,
  getRouteHistory,
  getRouteHistoryEntries,
  clearRouteHistory,
  initRouter
};