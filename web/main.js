/**
 * ESM入口文件 - main.js  
 * 完全模块化的应用入口，整合所有功能模块并提供向后兼容的全局API
 * 
 * 架构说明：
 * - 统一的ES模块导入管理
 * - 向后兼容的全局API暴露
 * - 模块化服务集成
 * - 屏幕路由管理
 * - 完整的应用初始化流程
 * 
 * @module Main
 * @version 2.0.0
 * @description 重构后的模块化入口，从monolithic转向clean architecture
 */

// 导入初始化模块
import { initializeApp } from './js/initApp.js';
import { initializeAppExtended } from './js/initAppExtended.js';

// 导入常量模块
import {
    DEFAULT_PROMPT_IMAGE,
    DEFAULT_PROMPT_VOICE,
    DEFAULT_PROMPT_TRANSFER,
    DEFAULT_PROMPT_SINGLE,
    DEFAULT_PROMPT_GROUP,
    DEFAULT_AVATAR,
    DEFAULT_MY_GROUP_AVATAR,
    DEFAULT_GROUP_MEMBER_AVATAR,
    DEFAULT_GROUP_AVATAR,
    STICKER_REGEX,
    MESSAGE_RENDER_WINDOW
} from './js/constants.js';

// 导入数据库模块
import { db, initializeDatabase, loadAllDataFromDB } from './js/db.js';

// 导入状态管理模块
import { 
    state, 
    musicState, 
    myAddress,
    setActiveChatId,
    updateGlobalSettings,
    setApiConfig,
    setMyAddress,
    getActiveChat,
    getActivePreset,
    isGroupChat,
    getFullState
} from './js/state.js';

// 导入路由模块
import { 
    showScreen,
    SCREEN_IDS,
    getCurrentScreen,
    navigateToChat,
    navigateToChatList,
    initRouter
} from './js/router.js';

// 导入屏幕模块
import { renderWorldBookScreen, initWorldBookListeners } from './js/screens/worldBook.js';
import { renderApiSettingsScreen, initApiSettingsListeners, initApiSettingsModule } from './js/screens/apiSettings.js';
import { renderWallpaperScreen, initWallpaperListeners, initWallpaperModule } from './js/screens/wallpaper.js';
import { renderPresetListScreen, initPresetsListeners, initPresetsData } from './js/screens/presets.js';
import { 
    renderChatList, 
    renderChatInterface,
    openChat,
    appendMessage,
    prependMessage,
    loadMoreMessages,
    prependLoadMoreButton,
    enterMessageEditMode,
    exitMessageEditMode,
    toggleMessageEditMode,
    enterSelectionMode,
    exitSelectionMode,
    toggleMessageSelection,
    renderStickerPanel,
    sendSticker,
    sendUserTransfer,
    handlePat,
    parseAiResponse,
    createMessageElement,
    formatTimestamp,
    addLongPressListener
} from './js/screens/chat.js';
import { triggerAiResponse } from './js/screens/aiResponse.js';

// 导入服务模块
import { 
    showCustomModal, 
    hideCustomModal, 
    showCustomConfirm, 
    showCustomAlert, 
    showCustomPrompt,
    showNotification,
    updateClock,
    initClock,
    closeThemeListModal,
    openThemeListModal,
    confirmThemeSelection,
    initModalListeners
} from './js/services/uiUtils.js';
import { 
    showBatteryAlert,
    updateBatteryDisplay,
    handleBatteryChange,
    initBatteryManager,
    getBatteryStatus
} from './js/services/batteryService.js';
import { 
    exportData,
    importData,
    handleImportDataEvent,
    clearAllData,
    getDataStats
} from './js/services/dataService.js';
import {
    togglePlayPause,
    playSong,
    playNext,
    playPrev,
    changePlayMode,
    addSongFromURL,
    addSongFromLocal,
    deleteTrack,
    updatePlayerUI,
    updateElapsedTimeDisplay,
    updatePlaylistUI,
    startListenTogetherSession,
    endListenTogetherSession,
    updateListenTogetherIcon,
    returnToChat,
    handleListenTogetherClick
} from './js/services/musicService.js';
import {
    openPersonaLibrary,
    closePersonaLibrary,
    renderPersonaLibrary,
    applyPersonaPreset,
    showPresetActions,
    hidePresetActions,
    openPersonaEditorForCreate,
    openPersonaEditorForEdit,
    deletePersonaPreset,
    closePersonaEditor,
    savePersonaPreset,
    initPersonaPresetListeners,
    openMemberEditor,
    renderGroupMemberSettings
} from './js/services/personaService.js';

// 暴露常量到全局作用域供全局兼容性使用
window.CONSTANTS = {
    DEFAULT_PROMPT_IMAGE,
    DEFAULT_PROMPT_VOICE,
    DEFAULT_PROMPT_TRANSFER,
    DEFAULT_PROMPT_SINGLE,
    DEFAULT_PROMPT_GROUP,
    DEFAULT_AVATAR,
    DEFAULT_MY_GROUP_AVATAR,
    DEFAULT_GROUP_MEMBER_AVATAR,
    DEFAULT_GROUP_AVATAR,
    STICKER_REGEX,
    MESSAGE_RENDER_WINDOW
};

// 暴露数据库实例和函数到全局作用域
window.DB = {
    db,
    initializeDatabase,
    loadAllDataFromDB
};

// 暴露状态管理到全局作用域
window.STATE = {
    state,
    musicState,
    myAddress,
    setActiveChatId,
    updateGlobalSettings,
    setApiConfig,
    setMyAddress,
    getActiveChat,
    getActivePreset,
    isGroupChat,
    getFullState
};

// 暴露路由到全局作用域
window.ROUTER = {
    showScreen,
    SCREEN_IDS,
    getCurrentScreen,
    navigateToChat,
    navigateToChatList,
    initRouter
};

// 暴露showScreen函数到全局作用域（保持向后兼容）
window.showScreen = showScreen;


// 应用初始化流程
// 所有模块都已通过ES imports加载，直接执行初始化
(async () => {
    try {
        // 数据库采用惰性初始化，无需在此处强制初始化
        // initializeDatabase(); // 已改为按需初始化
        console.log('ESM兼容层：数据库已配置为惰性初始化');
        
        // 初始化路由
        initRouter();
        console.log('ESM兼容层：路由初始化完成');
        
        // 注册屏幕渲染函数到路由
        if (window.ROUTER?.registerScreenRenderer) {
            window.ROUTER.registerScreenRenderer('world-book-screen', renderWorldBookScreen);
            window.ROUTER.registerScreenRenderer('api-settings-screen', renderApiSettingsScreen);
            window.ROUTER.registerScreenRenderer('wallpaper-screen', renderWallpaperScreen);
            window.ROUTER.registerScreenRenderer('preset-list-screen', renderPresetListScreen);
            window.ROUTER.registerScreenRenderer('chat-list-screen', renderChatList);
            window.ROUTER.registerScreenRenderer('chat-interface-screen', renderChatInterface);
        }
        
        // 设置代理函数
        window.renderWorldBookScreenProxy = renderWorldBookScreen;
        window.renderApiSettingsProxy = renderApiSettingsScreen;
        window.renderWallpaperScreenProxy = renderWallpaperScreen;
        window.renderPresetListProxy = renderPresetListScreen;
        window.renderChatListProxy = renderChatList;
        
        // 暴露聊天相关函数到全局作用域
        window.ChatModule = {
            renderChatList,
            renderChatInterface,
            openChat,
            appendMessage,
            prependMessage,
            loadMoreMessages,
            prependLoadMoreButton,
            enterMessageEditMode,
            exitMessageEditMode,
            toggleMessageEditMode,
            enterSelectionMode,
            exitSelectionMode,
            toggleMessageSelection,
            renderStickerPanel,
            sendSticker,
            sendUserTransfer,
            handlePat,
            parseAiResponse,
            createMessageElement,
            formatTimestamp,
            addLongPressListener,
            triggerAiResponse
        };
        
        // 暴露服务模块到全局作用域
        window.UIService = {
            showCustomModal,
            hideCustomModal,
            showCustomConfirm,
            showCustomAlert,
            showCustomPrompt,
            showNotification,
            updateClock,
            initClock,
            closeThemeListModal,
            openThemeListModal,
            confirmThemeSelection,
            initModalListeners
        };
        
        window.BatteryService = {
            showBatteryAlert,
            updateBatteryDisplay,
            handleBatteryChange,
            initBatteryManager,
            getBatteryStatus
        };
        
        window.DataService = {
            exportData,
            importData,
            handleImportDataEvent,
            clearAllData,
            getDataStats
        };
        
        window.MusicService = {
            togglePlayPause,
            playSong,
            playNext,
            playPrev,
            changePlayMode,
            addSongFromURL,
            addSongFromLocal,
            deleteTrack,
            updatePlayerUI,
            updateElapsedTimeDisplay,
            updatePlaylistUI,
            startListenTogetherSession,
            endListenTogetherSession,
            updateListenTogetherIcon,
            returnToChat,
            handleListenTogetherClick
        };
        
        window.PersonaService = {
            openPersonaLibrary,
            closePersonaLibrary,
            renderPersonaLibrary,
            applyPersonaPreset,
            showPresetActions,
            hidePresetActions,
            openPersonaEditorForCreate,
            openPersonaEditorForEdit,
            deletePersonaPreset,
            closePersonaEditor,
            savePersonaPreset,
            initPersonaPresetListeners,
            openMemberEditor,
            renderGroupMemberSettings
        };
        
        // 暴露服务函数到全局作用域（保持向后兼容）
        window.showCustomModal = showCustomModal;
        window.hideCustomModal = hideCustomModal;
        window.showCustomConfirm = showCustomConfirm;
        window.showCustomAlert = showCustomAlert;
        window.showCustomPrompt = showCustomPrompt;
        window.showNotification = showNotification;
        window.updateClock = updateClock;
        window.initClock = initClock;
        window.exportData = exportData;
        window.importData = importData;
        window.initBatteryManager = initBatteryManager;
        window.updateListenTogetherIcon = updateListenTogetherIcon;
        window.updateListenTogetherIconProxy = updateListenTogetherIcon;
        window.endListenTogetherSession = endListenTogetherSession;
        
        // 初始化屏幕模块数据（不包含需要数据库的部分）
        await initApiSettingsModule();
        await initWallpaperModule();
        // 注意：initPresetsData()移到数据库加载后执行
        
        // 模块化重构完成，所有功能已通过ES modules导入
        console.log('ESM兼容层：模块加载完成');
        
        // 等待DOM就绪后验证全局API
        const checkGlobalAPI = () => {
            if (typeof showScreen === 'undefined') {
                console.error('ESM兼容层：showScreen 函数未定义');
            } else {
                console.log('ESM兼容层：全局API验证通过');
            }
            
            // 验证常量是否可用
            if (window.CONSTANTS && window.CONSTANTS.DEFAULT_PROMPT_IMAGE) {
                console.log('ESM兼容层：常量模块加载成功');
            }
            
            // 验证路由是否可用
            if (window.ROUTER && window.showScreen) {
                console.log('ESM兼容层：路由模块加载成功');
            }
            
            // 初始化屏幕模块事件监听器
            initWorldBookListeners();
            initApiSettingsListeners();
            initWallpaperListeners();
            initPresetsListeners();
            
            // 初始化服务模块
            initModalListeners();
            initPersonaPresetListeners();
            console.log('ESM兼容层：屏幕模块初始化完成');
            
            // 初始化应用事件监听器
            initializeApp().then(async () => {
                console.log('ESM兼容层：应用初始化完成');
                
                // 在数据库加载完成后初始化预设数据
                await initPresetsData();
                console.log('ESM兼容层：预设数据初始化完成');
                
                return initializeAppExtended();
            }).then(() => {
                console.log('ESM兼容层：扩展初始化完成');
            }).catch(error => {
                console.error('ESM兼容层：应用初始化失败:', error);
            });
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkGlobalAPI);
        } else {
            // DOM已就绪
            checkGlobalAPI();
        }
    } catch (error) {
        console.error('ESM兼容层：加载失败:', error);
    }
})();