// 路由管理模块 - router.js
// 处理屏幕切换逻辑和页面导航

// 屏幕ID常量
export const SCREEN_IDS = {
    HOME: 'home-screen',
    CHAT_LIST: 'chat-list-screen',
    CHAT_INTERFACE: 'chat-interface-screen',
    API_SETTINGS: 'api-settings-screen',
    WALLPAPER: 'wallpaper-screen',
    WORLD_BOOK: 'world-book-screen',
    PRESET_LIST: 'preset-list-screen'
};

// 当前活动屏幕ID
let currentScreenId = SCREEN_IDS.HOME;

// 屏幕渲染代理映射
const screenRenderMap = {
    [SCREEN_IDS.CHAT_LIST]: () => window.renderChatListProxy?.(),
    [SCREEN_IDS.API_SETTINGS]: () => window.renderApiSettingsProxy?.(),
    [SCREEN_IDS.WALLPAPER]: () => window.renderWallpaperScreenProxy?.(),
    [SCREEN_IDS.WORLD_BOOK]: () => window.renderWorldBookScreenProxy?.(),
    [SCREEN_IDS.PRESET_LIST]: () => window.renderPresetListProxy?.()
};

// 特殊屏幕的后处理函数
const screenPostProcessMap = {
    [SCREEN_IDS.CHAT_INTERFACE]: (screenId) => {
        const state = window.STATE?.state;
        if (state && window.updateListenTogetherIconProxy) {
            window.updateListenTogetherIconProxy(state.activeChatId);
        }
    }
};

// 主要的屏幕切换函数
export function showScreen(screenId) {
    // 处理消息编辑模式 - 从全局状态检查
    const isMessageEditMode = window.STATE?.isMessageEditMode || 
                             (typeof window.isMessageEditMode !== 'undefined' ? window.isMessageEditMode : false);
    
    if (isMessageEditMode && screenId !== SCREEN_IDS.CHAT_INTERFACE) {
        if (window.exitMessageEditMode) {
            window.exitMessageEditMode(false);
        }
    }

    // 调用对应屏幕的渲染函数
    const renderFunction = screenRenderMap[screenId];
    if (renderFunction) {
        renderFunction();
    }

    // 切换屏幕显示状态
    switchScreenDisplay(screenId);

    // 执行屏幕特定的后处理
    const postProcess = screenPostProcessMap[screenId];
    if (postProcess) {
        postProcess(screenId);
    }

    // 更新当前屏幕ID
    currentScreenId = screenId;
    console.log('路由切换：当前屏幕 =', screenId);
}

// 屏幕显示状态切换的核心逻辑
function switchScreenDisplay(screenId) {
    // 移除所有屏幕的active类
    document.querySelectorAll('.screen').forEach(screen => {
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

// 获取当前活动的屏幕ID
export function getCurrentScreen() {
    return currentScreenId;
}

// 检查指定屏幕是否为当前活动屏幕
export function isCurrentScreen(screenId) {
    return currentScreenId === screenId;
}

// 回到主屏幕
export function goHome() {
    showScreen(SCREEN_IDS.HOME);
}

// 导航到聊天界面
export function navigateToChat(chatId = null) {
    if (chatId && window.STATE?.setActiveChatId) {
        window.STATE.setActiveChatId(chatId);
    }
    showScreen(SCREEN_IDS.CHAT_INTERFACE);
}

// 导航到聊天列表
export function navigateToChatList() {
    showScreen(SCREEN_IDS.CHAT_LIST);
}

// 导航到API设置
export function navigateToApiSettings() {
    showScreen(SCREEN_IDS.API_SETTINGS);
}

// 导航到世界书
export function navigateToWorldBook() {
    showScreen(SCREEN_IDS.WORLD_BOOK);
}

// 导航到预设列表
export function navigateToPresets() {
    showScreen(SCREEN_IDS.PRESET_LIST);
}

// 导航到壁纸设置
export function navigateToWallpaper() {
    showScreen(SCREEN_IDS.WALLPAPER);
}

// 注册屏幕渲染函数（供屏幕模块使用）
export function registerScreenRenderer(screenId, renderFunction) {
    screenRenderMap[screenId] = renderFunction;
    console.log('路由注册：注册屏幕渲染函数', screenId);
}

// 注册屏幕后处理函数
export function registerScreenPostProcess(screenId, postProcessFunction) {
    screenPostProcessMap[screenId] = postProcessFunction;
    console.log('路由注册：注册屏幕后处理函数', screenId);
}

// 批量注册代理函数映射（用于兼容现有代码）
export function setupProxyMappings() {
    // 确保全局代理函数存在
    if (!window.renderChatListProxy) {
        window.renderChatListProxy = () => {};
    }
    if (!window.renderApiSettingsProxy) {
        window.renderApiSettingsProxy = () => {};
    }
    if (!window.renderWallpaperScreenProxy) {
        window.renderWallpaperScreenProxy = () => {};
    }
    if (!window.renderWorldBookScreenProxy) {
        window.renderWorldBookScreenProxy = () => {};
    }
    if (!window.renderPresetListProxy) {
        window.renderPresetListProxy = () => {};
    }
    
    console.log('路由初始化：代理函数映射已设置');
}

// 路由历史记录（简单实现）
const routeHistory = [];
const MAX_HISTORY = 10;

export function pushRoute(screenId) {
    routeHistory.push(screenId);
    if (routeHistory.length > MAX_HISTORY) {
        routeHistory.shift();
    }
}

export function goBack() {
    if (routeHistory.length > 1) {
        routeHistory.pop(); // 移除当前路由
        const previousRoute = routeHistory[routeHistory.length - 1];
        showScreen(previousRoute);
        return true;
    }
    return false;
}

export function getRouteHistory() {
    return [...routeHistory];
}

// 路由模块初始化
export function initRouter() {
    setupProxyMappings();
    
    // 记录初始路由
    pushRoute(currentScreenId);
    
    console.log('路由模块初始化完成');
}