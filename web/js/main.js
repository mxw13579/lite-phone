/**
 * EPhone 应用入口文件
 * 负责初始化全局状态、路由和兼容性代理
 */

import { initializeDB, getDB } from './core/db.js';
import { loadGlobalState, globalState } from './core/state.js';
import { eventBus, EventTypes } from './core/event-bus.js';
import { scheduler, BuiltInTasks } from './core/scheduler.js';
import { routeManager } from './core/router.js';
import { renderPluginsScreen, initializePluginsView } from './domains/plugins/view.js';
import { renderMomentsScreen, initializeMomentsView } from './domains/moments/view.js';
import { renderPresetListScreen, initializePresetsView } from './domains/presets/view.js';
import { renderWorldBookScreen, initializeWorldBookView } from './domains/worldbook/view.js';
import { renderThemesScreen, initializeThemesView } from './domains/themes/view.js';
import { renderChatListScreen, initializeChatsView } from './domains/chats/view.js';
import { renderApiSettingsScreen, initializeApiSettingsView } from './domains/api-settings/view.js';
import { renderMemoryManagementScreen, initializeMemoriesView } from './domains/memories/view.js';
import { renderBehaviorSettingsScreen, initializeBehaviorSettingsView } from './domains/behavior-settings/view.js';
import { showToast, showSuccess, showError, showWarning } from './utils/notify.js';
import { initializeDataManagement, setupBackupEventListeners, getDataStats, displayDataManagementStatus } from './utils/data-management.js';
import { initializeGlobalNavigation } from './utils/navigation.js';
import { themeService } from './services/themes.js';
import { backupService } from './services/backup.js';
import { memoryService } from './services/memory.js';

// 模块系统状态标志
let modulesInitialized = false;

// 临时保留的全局变量（后续迁移到 state 模块）
let isMessageEditMode = false;
let editingPresetId = null;
let myAddress = '位置未知';
let musicState = {
    isActive: false,
    activeChatId: null,
    isPlaying: false,
    playlist: [],
    currentIndex: -1,
    playMode: 'order',
    totalElapsedTime: 0,
    timerId: null
};

// 应用初始化
window.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('EPhone App starting initialization...');
        
        // 发送应用初始化事件
        await eventBus.emit(EventTypes.APP_INIT, { timestamp: Date.now() });
        
        // 初始化数据库
        await initializeDB();
        
        // 加载全局状态
        await loadGlobalState();
        
        // 初始化服务层
        await initializeServices();
        
        // 初始化事件系统和调度器
        await initializeEventSystem();
        
        // 初始化现代化路由管理器
        await initializeRouting();
        
        // 初始化应用
        await initializeApp();
        
        // 设置模块初始化成功标志
        modulesInitialized = true;
        window.__MODULES_READY__ = true;
        
        // 发送应用就绪事件
        await eventBus.emit(EventTypes.APP_READY, { timestamp: Date.now() });
        
        showSuccess('EPhone 模块系统初始化完成');
        console.log('EPhone App initialization completed');
    } catch (error) {
        console.error('EPhone App initialization failed:', error);
        showError(`模块系统初始化失败: ${error.message}`);
        
        // 发送错误事件
        eventBus.emit(EventTypes.APP_ERROR, { 
            error: error.message, 
            timestamp: Date.now() 
        });
        
        // 系统初始化失败，直接显示错误信息
        console.error('EPhone模块系统初始化失败，请检查控制台错误信息');
        showError('系统初始化失败，请刷新页面重试');
    }
});

/**
 * 处理屏幕切换事件
 * @param {Object} data 屏幕切换数据
 */
function handleScreenTransition(data) {
    const { from, to, timestamp, route } = data;
    
    try {
        // 清理前一个屏幕的状态（如果需要）
        cleanupScreenState(from);
        
        // 初始化新屏幕状态（如果需要）
        initializeScreenState(to);
        
        // 更新导航状态
        updateNavigationState(from, to);
        
        // 触发相关统计和分析（如果需要）
        recordScreenTransition(from, to, timestamp);
        
    } catch (error) {
        console.error('Screen transition handling failed:', error);
    }
}

/**
 * 清理屏幕状态
 * @param {string} screenId 屏幕ID
 */
function cleanupScreenState(screenId) {
    // 具体的清理逻辑可根据需要扩展
    // 例如：清理定时器、取消请求、释放资源等
    switch (screenId) {
        case 'chat-interface-screen':
            // 清理聊天界面相关状态
            break;
        case 'moments-screen':
            // 清理朋友圈相关状态
            break;
        default:
            // 通用清理
            break;
    }
}

/**
 * 初始化屏幕状态
 * @param {string} screenId 屏幕ID
 */
function initializeScreenState(screenId) {
    // 具体的初始化逻辑可根据需要扩展
    // 例如：加载数据、设置监听器、启动定时器等
    switch (screenId) {
        case 'memory-management-screen':
            // 渲染记忆管理界面
            renderMemoryManagementScreen();
            break;
        case 'behavior-settings-screen':
            // 渲某AI行为设置界面
            renderBehaviorSettingsScreen();
            break;
        case 'home-screen':
            // 确保主屏幕状态正确
            break;
        default:
            // 通用初始化
            break;
    }
}

/**
 * 更新导航状态
 * @param {string} from 来源屏幕
 * @param {string} to 目标屏幕
 */
function updateNavigationState(from, to) {
    // 更新全局导航状态，这里可以用于面包屑导航等
    if (globalState && globalState.navigation) {
        globalState.navigation.currentScreen = to;
        globalState.navigation.previousScreen = from;
        globalState.navigation.lastTransitionTime = Date.now();
    }
}

/**
 * 记录屏幕切换统计
 * @param {string} from 来源屏幕
 * @param {string} to 目标屏幕
 * @param {number} timestamp 时间戳
 */
function recordScreenTransition(from, to, timestamp) {
    // 可用于用户行为分析和系统监控
    // 这里只做简单的日志记录，实际项目中可能需要发送到分析服务
    const transitionData = {
        from,
        to,
        timestamp,
        userAgent: navigator.userAgent,
        sessionId: globalState?.sessionId || 'unknown'
    };
    
    // 存储到本地或发送到服务器（根据需要实现）
    console.log('Screen transition recorded:', transitionData);
}

/**
 * 初始化服务层
 */
async function initializeServices() {
    try {
        console.log('Initializing services...');
        
        // 初始化主题服务
        await themeService.initialize();
        console.log('✅ Theme service initialized');
        
        // 初始化备份服务
        await backupService.initialize();
        console.log('✅ Backup service initialized');
        
        // 初始化记忆服务
        await memoryService.initialize();
        console.log('✅ Memory service initialized');
        
        console.log('Services layer initialized successfully');
        
    } catch (error) {
        console.error('Failed to initialize services:', error);
        throw error;
    }
}

/**
 * 初始化事件系统和调度器
 */
async function initializeEventSystem() {
    try {
        // 设置事件总线调试模式（开发环境）
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            eventBus.setDebug(true);
        }

        // 注册内置任务
        scheduler.addTask('memory-cleanup', BuiltInTasks.MEMORY_CLEANUP);
        scheduler.addTask('db-health-check', BuiltInTasks.DB_HEALTH_CHECK);
        scheduler.addTask('event-bus-stats', BuiltInTasks.EVENT_BUS_STATS);

        // 启动调度器
        scheduler.start();

        // 注册全局错误监听
        eventBus.on(EventTypes.SYSTEM_ERROR, (data) => {
            console.error('System Error:', data);
        });

        eventBus.on(EventTypes.SYSTEM_WARNING, (data) => {
            console.warn('System Warning:', data);
        });

        eventBus.on(EventTypes.MEMORY_LOW, (data) => {
            console.warn('Memory Low:', data);
            // 可以触发清理操作
        });

        // 监听调度器事件
        eventBus.on(EventTypes.SCHEDULER_TICK, (data) => {
            if (data.type === 'normal') {
                console.log(`Scheduler tick #${data.counter} at ${new Date(data.timestamp).toLocaleTimeString()}`);
            }
        });

        eventBus.on(EventTypes.SCHEDULER_ERROR, (data) => {
            console.error('Scheduler Error:', data);
        });

        // 监听屏幕切换事件
        eventBus.on(EventTypes.SCREEN_CHANGED, (data) => {
            console.log(`Screen changed from '${data.from}' to '${data.to}'`);
            
            // 执行屏幕切换相关的清理和初始化工作
            handleScreenTransition(data);
        });

        // 监听应用生命周期事件
        eventBus.on(EventTypes.APP_INIT, (data) => {
            console.log('Application initialization started', data);
        });

        eventBus.on(EventTypes.APP_READY, (data) => {
            console.log('Application ready', data);
        });

        eventBus.on(EventTypes.APP_ERROR, (data) => {
            console.error('Application error', data);
        });

        // 监听数据变更事件
        eventBus.on(EventTypes.DATA_CHANGED, (data) => {
            console.log('Data changed:', data.type, data.id);
        });

        eventBus.on(EventTypes.DATA_LOADED, (data) => {
            console.log('Data loaded:', data.type);
        });

        eventBus.on(EventTypes.DATA_SAVED, (data) => {
            console.log('Data saved:', data.type, data.id);
        });

        // 监听 API 事件
        eventBus.on(EventTypes.API_REQUEST_START, (data) => {
            console.log('API request started:', data.url);
        });

        eventBus.on(EventTypes.API_REQUEST_SUCCESS, (data) => {
            console.log('API request successful:', data.url);
        });

        eventBus.on(EventTypes.API_REQUEST_ERROR, (data) => {
            console.error('API request failed:', data.url, data.error);
        });

        // 监听主题事件
        eventBus.on(EventTypes.THEME_CHANGED, (data) => {
            console.log('Theme changed to:', data.theme);
        });

        eventBus.on(EventTypes.THEME_UPDATED, (data) => {
            console.log('Theme updated:', data.id);
        });

        // 监听调度器评估事件
        eventBus.on('scheduler.evaluation', (data) => {
            console.log('Scheduler evaluation:', data.type, data.metrics);
        });

        console.log('Event system and scheduler initialized');
        
    } catch (error) {
        console.error('Failed to initialize event system:', error);
        throw error;
    }
}

/**
 * 初始化现代化路由管理器
 */
async function initializeRouting() {
    try {
        // 注册路由渲染器
        routeManager.registerRoute('plugins-screen', {
            title: '插件管理',
            renderer: renderPluginsScreen
        });
        
        routeManager.registerRoute('moments-screen', {
            title: '朋友圈',
            renderer: renderMomentsScreen
        });
        
        routeManager.registerRoute('preset-list-screen', {
            title: '预设管理',
            renderer: renderPresetListScreen
        });
        
        routeManager.registerRoute('world-book-screen', {
            title: '世界书',
            renderer: renderWorldBookScreen
        });
        
        routeManager.registerRoute('themes-screen', {
            title: '美化中心',
            renderer: renderThemesScreen
        });
        
        routeManager.registerRoute('chat-list-screen', {
            title: '聊天列表',
            renderer: renderChatListScreen
        });

        // 注册缺失的屏幕（现在有真实的渲染器）
        routeManager.registerRoute('api-settings-screen', {
            title: 'API设置',
            renderer: renderApiSettingsScreen
        });
        
        routeManager.registerRoute('wallpaper-screen', {
            title: '壁纸设置',
            renderer: renderWallpaperScreen
        });

        // 初始化路由管理器
        routeManager.initialize();

        console.log('Modern routing system initialized');
        
    } catch (error) {
        console.error('Failed to initialize routing:', error);
        throw error;
    }
}

/**
 * 应用初始化函数
 */
async function initializeApp() {
    console.log('EPhone App initializing...');
    
    // 设置路由代理
    setupRouterProxies();
    
    // 设置渲染代理 (兼容现有 HTML onclick)
    setupRenderProxies();
    
    // 初始化核心功能
    initializeCore();
    
    // 初始化数据管理
    initializeDataManagement();
    setupBackupEventListeners();
    
    // 初始化全局导航
    initializeGlobalNavigation();
    
    // 初始化域视图
    await initializeDomainViews();
    
    // 检查数据库健康状态
    await checkSystemHealth();
    
    console.log('EPhone App initialized successfully');
}

/**
 * 初始化域视图
 */
async function initializeDomainViews() {
    try {
        console.log('Initializing domain views...');
        
        // 初始化各个域的视图事件处理
        initializePluginsView();
        initializeMomentsView();
        initializePresetsView();
        initializeWorldBookView();
        initializeThemesView();
        initializeChatsView();
        initializeApiSettingsView();
        await initializeMemoriesView();
        await initializeBehaviorSettingsView();
        
        console.log('✅ Domain views initialized');
        
    } catch (error) {
        console.error('Failed to initialize domain views:', error);
        showWarning('视图初始化部分失败，某些功能可能受影响');
    }
}

/**
 * 设置路由代理 (过渡期兼容)
 */
function setupRouterProxies() {
    // 无条件覆盖showScreen，确保新路由管理器的稳定性
    window.showScreen = function(screenId) {
        return routeManager.navigateToScreen(screenId);
    };
    
    // 暴露路由管理器到全局（调试用）
    window.routeManager = routeManager;
}

/**
 * 设置渲染代理 (已弃用 - 由现代化路由管理器处理)
 * 保留此函数以防某些旧代码仍然依赖代理函数
 */
function setupRenderProxies() {
    console.warn('渲染代理系统已弃用，请使用现代化路由管理器');
    
    // 为了兼容性，仍然设置一些基本代理
    const deprecatedProxies = {
        renderPluginsScreenProxy: () => routeManager.navigateToScreen('plugins-screen'),
        renderMomentsScreenProxy: () => routeManager.navigateToScreen('moments-screen'),
        renderPresetListScreenProxy: () => routeManager.navigateToScreen('preset-list-screen'),
        renderWorldBookScreenProxy: () => routeManager.navigateToScreen('world-book-screen'),
        renderThemesScreenProxy: () => routeManager.navigateToScreen('themes-screen'),
        renderChatListScreenProxy: () => routeManager.navigateToScreen('chat-list-screen'),
        renderApiSettingsProxy: () => routeManager.navigateToScreen('api-settings-screen'),
        renderWallpaperScreenProxy: () => routeManager.navigateToScreen('wallpaper-screen')
    };
    
    Object.entries(deprecatedProxies).forEach(([name, handler]) => {
        if (typeof window[name] !== 'function') {
            window[name] = handler;
        }
    });
}

/**
 * 初始化核心功能
 */
function initializeCore() {
    // 将全局状态暴露给 window 以供原始脚本使用
    window.state = globalState;
    
    // 将工具函数暴露给全局
    window.getDB = getDB;
    
    // 将事件系统暴露给全局
    window.eventBus = eventBus;
    window.scheduler = scheduler;
    window.EventTypes = EventTypes;
    
    // 将记忆服务暴露给全局（用于测试和调试）
    window.memoryService = memoryService;
    
    console.log('Core modules initialized');
}

/**
 * 检查系统健康状态
 */
async function checkSystemHealth() {
    try {
        const db = getDB();
        if (db) {
            console.log('✅ Database health check passed');
        } else {
            console.warn('⚠️ Database not available');
        }
        
        // 检查关键 DOM 元素
        const requiredElements = ['#phone-screen', '#home-screen'];
        const missingElements = requiredElements.filter(selector => !document.querySelector(selector));
        
        if (missingElements.length > 0) {
            console.warn('⚠️ Missing DOM elements:', missingElements);
        } else {
            console.log('✅ DOM structure health check passed');
        }
        
    } catch (error) {
        console.error('❌ System health check failed:', error);
    }
}

/**
 * 壁纸设置屏幕渲染器（占位）
 * TODO: 后续可迁移到 domains/wallpaper 模块
 */
async function renderWallpaperScreen() {
    console.log('壁纸设置屏幕已激活');
    // 占位：页面切换由路由管理器处理，这里可添加特定的初始化逻辑
    // 例如：加载壁纸列表、初始化上传功能等
}

// 导出主要函数供其他模块使用
export { globalState, initializeApp };