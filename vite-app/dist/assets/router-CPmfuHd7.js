const SCREEN_IDS = {
  HOME: "home-screen",
  CHAT_LIST: "chat-list-screen",
  CHAT_INTERFACE: "chat-interface-screen",
  API_SETTINGS: "api-settings-screen",
  WALLPAPER: "wallpaper-screen",
  WORLD_BOOK: "world-book-screen",
  WORLD_BOOK_EDITOR: "world-book-editor-screen",
  PRESET_LIST: "preset-list-screen",
  PRESET_EDITOR: "preset-editor-screen"
};
let currentScreenId = SCREEN_IDS.HOME;
const screenRenderMap = {
  [SCREEN_IDS.HOME]: () => {
  },
  [SCREEN_IDS.CHAT_LIST]: () => window.renderChatListProxy?.(),
  [SCREEN_IDS.CHAT_INTERFACE]: () => window.renderChatInterfaceProxy?.(),
  [SCREEN_IDS.API_SETTINGS]: () => window.renderApiSettingsProxy?.(),
  [SCREEN_IDS.WALLPAPER]: () => window.renderWallpaperScreenProxy?.(),
  [SCREEN_IDS.WORLD_BOOK]: () => window.renderWorldBookScreenProxy?.(),
  [SCREEN_IDS.WORLD_BOOK_EDITOR]: () => window.renderWorldBookEditorProxy?.(),
  [SCREEN_IDS.PRESET_LIST]: () => window.renderPresetListProxy?.(),
  [SCREEN_IDS.PRESET_EDITOR]: () => window.renderPresetEditorProxy?.()
};
const screenPostProcessMap = {
  [SCREEN_IDS.HOME]: void 0,
  [SCREEN_IDS.CHAT_LIST]: void 0,
  [SCREEN_IDS.CHAT_INTERFACE]: (screenId) => {
    const state = window.state;
    if (state && window.updateListenTogetherIconProxy) {
      window.updateListenTogetherIconProxy(state.activeChatId);
    }
  },
  [SCREEN_IDS.API_SETTINGS]: void 0,
  [SCREEN_IDS.WALLPAPER]: void 0,
  [SCREEN_IDS.WORLD_BOOK]: void 0,
  [SCREEN_IDS.WORLD_BOOK_EDITOR]: void 0,
  [SCREEN_IDS.PRESET_LIST]: void 0,
  [SCREEN_IDS.PRESET_EDITOR]: void 0
};
function showScreen(screenId) {
  const win = window;
  const isMessageEditMode = win.STATE?.isMessageEditMode || (typeof win.isMessageEditMode !== "undefined" ? win.isMessageEditMode : win.getIsMessageEditMode?.() ?? false);
  if (isMessageEditMode && screenId !== SCREEN_IDS.CHAT_INTERFACE) {
    if (win.exitMessageEditMode) {
      win.exitMessageEditMode(false);
    }
  }
  const renderFunction = screenRenderMap[screenId];
  if (renderFunction) {
    try {
      renderFunction();
    } catch (error) {
      console.error(`屏幕渲染函数执行失败: ${screenId}`, error);
    }
  }
  switchScreenDisplay(screenId);
  const postProcess = screenPostProcessMap[screenId];
  if (postProcess) {
    try {
      postProcess(screenId);
    } catch (error) {
      console.error(`屏幕后处理函数执行失败: ${screenId}`, error);
    }
  }
  pushRoute(screenId);
  currentScreenId = screenId;
  console.log("路由切换：当前屏幕 =", screenId);
}
function switchScreenDisplay(screenId) {
  const screens = document.querySelectorAll(".screen");
  screens.forEach((screen) => {
    screen.classList.remove("active");
  });
  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add("active");
    console.log("屏幕切换：激活屏幕", screenId);
  } else {
    console.error("屏幕切换：未找到屏幕元素", screenId);
  }
}
function getCurrentScreen() {
  return currentScreenId;
}
function isCurrentScreen(screenId) {
  return currentScreenId === screenId;
}
function goHome() {
  showScreen(SCREEN_IDS.HOME);
}
function navigateToChat(chatId) {
  if (chatId && window.setActiveChatId) {
    window.setActiveChatId(chatId);
  }
  showScreen(SCREEN_IDS.CHAT_INTERFACE);
}
function navigateToChatList() {
  showScreen(SCREEN_IDS.CHAT_LIST);
}
function navigateToApiSettings() {
  showScreen(SCREEN_IDS.API_SETTINGS);
}
function navigateToWorldBook() {
  showScreen(SCREEN_IDS.WORLD_BOOK);
}
function navigateToWorldBookEditor() {
  showScreen(SCREEN_IDS.WORLD_BOOK_EDITOR);
}
function navigateToPresets() {
  showScreen(SCREEN_IDS.PRESET_LIST);
}
function navigateToPresetEditor() {
  showScreen(SCREEN_IDS.PRESET_EDITOR);
}
function navigateToWallpaper() {
  showScreen(SCREEN_IDS.WALLPAPER);
}
function registerScreenRenderer(screenId, renderFunction) {
  screenRenderMap[screenId] = renderFunction;
  console.log("路由注册：注册屏幕渲染函数", screenId);
}
function registerScreenPostProcess(screenId, postProcessFunction) {
  screenPostProcessMap[screenId] = postProcessFunction;
  console.log("路由注册：注册屏幕后处理函数", screenId);
}
function setupProxyMappings() {
  const win = window;
  const proxyFunctions = [
    "renderChatListProxy",
    "renderChatInterfaceProxy",
    "renderApiSettingsProxy",
    "renderWallpaperScreenProxy",
    "renderWorldBookScreenProxy",
    "renderWorldBookEditorProxy",
    "renderPresetListProxy",
    "renderPresetEditorProxy",
    "updateListenTogetherIconProxy"
  ];
  proxyFunctions.forEach((fnName) => {
    if (!win[fnName]) {
      win[fnName] = () => {
      };
    }
  });
  console.log("路由初始化：代理函数映射已设置");
}
const routeHistory = [];
const MAX_HISTORY = 10;
function pushRoute(screenId, params) {
  const entry = {
    screenId,
    timestamp: Date.now(),
    params
  };
  routeHistory.push(entry);
  if (routeHistory.length > MAX_HISTORY) {
    routeHistory.shift();
  }
}
function goBack() {
  if (routeHistory.length > 1) {
    routeHistory.pop();
    const previousRoute = routeHistory[routeHistory.length - 1];
    if (previousRoute) {
      showScreen(previousRoute.screenId);
      return true;
    }
  }
  return false;
}
function getRouteHistory() {
  return routeHistory.map((entry) => entry.screenId);
}
function getRouteHistoryEntries() {
  return [...routeHistory];
}
function clearRouteHistory() {
  routeHistory.length = 0;
  pushRoute(currentScreenId);
}
function initRouter() {
  setupProxyMappings();
  pushRoute(currentScreenId);
  console.log("路由模块初始化完成");
}
if (typeof window !== "undefined") {
  const win = window;
  win.SCREEN_IDS = SCREEN_IDS;
  win.showScreen = showScreen;
  win.getCurrentScreen = getCurrentScreen;
  win.isCurrentScreen = isCurrentScreen;
  win.goHome = goHome;
  win.navigateToChat = navigateToChat;
  win.navigateToChatList = navigateToChatList;
  win.navigateToApiSettings = navigateToApiSettings;
  win.navigateToWorldBook = navigateToWorldBook;
  win.navigateToPresets = navigateToPresets;
  win.navigateToWallpaper = navigateToWallpaper;
  win.registerScreenRenderer = registerScreenRenderer;
  win.registerScreenPostProcess = registerScreenPostProcess;
  win.setupProxyMappings = setupProxyMappings;
  win.goBack = goBack;
  win.getRouteHistory = getRouteHistory;
  win.initRouter = initRouter;
}
var router_default = {
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
export {
  router_default as r
};
