/**
 * EPhone TypeScript主入口文件 - main.ts
 * PR9: 入口事件粘合与测试页联动
 * 
 * @description 从ES6版本迁移的零损失TypeScript重构
 * @architecture Clean Architecture + Service Layer + Module System
 * @compatibility 保持完整的window全局API向后兼容性
 * @modules 导入并初始化17个专用模块
 * @version 2.0.0 (Vite+TS版本)
 */

// === 核心模块导入 ===
import CONSTANTS from './constants';
import STATE from './state';
import DB from './database';
import ROUTER from './router';

// === 屏幕模块导入 ===
import * as SCREENS from './screens';
import { aiResponseModule } from './screens/aiResponse';

// === 初始化模块导入 ===
import { initializationModule } from './init';
import { injectCompatibilityAPIs } from './init/compat';

// === 服务层导入 ===
import * as SERVICES from './services';

console.log('🚀 EPhone Vite+TypeScript 版本启动中...');
console.log('✅ 核心模块已加载:');
console.log('  - CONSTANTS loaded:', Object.keys(CONSTANTS).length, 'keys');
console.log('  - STATE loaded:', Object.keys(STATE).length, 'functions');  
console.log('  - DB loaded:', Object.keys(DB).length, 'functions');
console.log('  - ROUTER loaded:', Object.keys(ROUTER).length, 'functions');
console.log('  - SCREENS loaded:', Object.keys(SCREENS).length, 'modules');
console.log('  - SERVICES loaded:', Object.keys(SERVICES).length, 'services');

// === EPhone应用初始化类 ===
class EPhoneApplication {
  private initialized = false;
  private editingMemberId: string | null = null;

  // 注意： selectedMessages 状态管理已转移到 init/index.ts，避免重复

  /**
   * 应用主初始化流程
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('应用已经初始化，跳过重复初始化');
      return;
    }

    try {
      console.log('🚀 开始EPhone TypeScript应用初始化...');
      
      // 1. 注入全局API，保持向后兼容
      this.injectGlobalAPIs();
      console.log('✅ 全局API注入完成');
      
      // 2. 初始化数据库和状态
      await this.initializeDatabase();
      console.log('✅ 数据库初始化完成');
      
      // 3. 应用主题
      this.applyApplicationTheme();
      console.log('✅ 应用主题加载完成');
      
      // 4. 初始化所有服务
      await this.initializeServices();
      console.log('✅ 所有服务初始化完成');
      
      // 5. 初始化屏幕模块
      await this.initializeScreenModules();
      console.log('✅ 屏幕模块初始化完成');
      
      // 6. 注册DOM事件监听器
      await this.registerEventListeners();
      console.log('✅ 事件监听器注册完成');
      
      // 7. 初始化应用扩展功能
      await this.initializeAppExtended();
      console.log('✅ 应用扩展功能初始化完成');
      
      // 8. 显示首屏
      this.showInitialScreen();
      console.log('✅ 应用初始化完成');
      
      this.initialized = true;
      
    } catch (error) {
      console.error('❌ 应用初始化失败:', error);
      throw error;
    }
  }

  /**
   * 注入全局API到window对象，保持向后兼容
   */
  private injectGlobalAPIs(): void {
    console.log('🔧 使用统一兼容性模块注入全局API...');
    
    // 委托给统一的兼容性注入模块
    injectCompatibilityAPIs();
    
    console.log('✅ 全局API注入完成 - 通过统一兼容性模块');
  }

  /**
   * 初始化数据库和加载数据
   */
  private async initializeDatabase(): Promise<void> {
    // 初始化数据库
    await DB.initializeDatabase();
    
    // 加载所有数据到状态
    const allData = await DB.loadAllDataFromDB();
    if (allData) {
      // 将数据合并到状态管理器中
      Object.assign(STATE.state, allData);
      console.log('应用数据已加载到状态中');
    }
  }

  /**
   * 应用主题
   */
  private applyApplicationTheme(): void {
    if (STATE.state.globalSettings.remoteThemeUrl) {
      const stylesheet = document.getElementById('main-stylesheet') as HTMLLinkElement;
      if (stylesheet) {
        const url = STATE.state.globalSettings.remoteThemeUrl;
        stylesheet.href = url + '?v=' + Date.now();
      }
    }
  }

  /**
   * 初始化所有服务
   */
  private async initializeServices(): Promise<void> {
    // 初始化时钟和电池
    SERVICES.uiUtilsService.updateClock();
    setInterval(() => SERVICES.uiUtilsService.updateClock(), 1000 * 30);
    await SERVICES.batteryService.initBatteryManager();
    
    // 初始化所有服务
    await SERVICES.serviceManager.initAllServices();
  }

  /**
   * 初始化屏幕模块
   */
  private async initializeScreenModules(): Promise<void> {
    // 初始化屏幕模块（按照依赖顺序）
    console.log('初始化世界书屏幕模块...');
    SCREENS.worldBookScreenModule.initListeners();
    
    console.log('初始化API设置屏幕模块...');
    SCREENS.apiSettingsScreenModule.initListeners();
    
    console.log('初始化壁纸屏幕模块...');  
    SCREENS.wallpaperScreenModule.initListeners();
    
    console.log('初始化预设屏幕模块...');
    SCREENS.presetScreenModule.initListeners();
    // 预设模块需要额外的数据初始化
    await SCREENS.presetScreenModule.initPresetsData();
    
    console.log('初始化聊天屏幕模块...');
    // chatScreenModule 可能有不同的初始化方式，先检查是否存在
    if (SCREENS.chatScreenModule && typeof SCREENS.chatScreenModule.initListeners === 'function') {
      SCREENS.chatScreenModule.initListeners();
    }
    
    console.log('初始化AI响应模块...');
    // AI响应模块无需特殊初始化，已在导入时完成
    
    console.log('所有屏幕模块初始化完成');
  }

  /**
   * 注册所有DOM事件监听器
   */
  private async registerEventListeners(): Promise<void> {
    console.log('开始注册DOM事件监听器...');
    
    // 注册基础事件监听器
    this.registerChatInterfaceListeners();
    this.registerFileUploadListeners(); 
    this.registerDataManagementListeners();
    this.registerMusicPlayerListeners();
    
    console.log('DOM事件监听器注册完成');
  }

  /**
   * 聊天界面基础事件监听器
   */
  private registerChatInterfaceListeners(): void {
    // 注意：聊天界面的具体事件由 init/index.ts 处理，避免重复绑定
    // 这里只处理需要在应用层面的聊天相关功能
    
    // 创建新聊天
    document.getElementById('add-chat-btn')?.addEventListener('click', async () => {
      const name = await SERVICES.uiUtilsService.showCustomPrompt('创建新聊天', '请输入Ta的名字');
      if (name && name.trim()) {
        const newChatId = 'chat_' + Date.now();
        const newChat = {
          id: newChatId,
          name: name.trim(),
          isGroup: false,
          settings: {
            aiPersona: '你是谁呀。',
            myPersona: '我是谁呀。',
            maxMemory: 10,
            aiAvatar: CONSTANTS.DEFAULT_AVATAR,
            myAvatar: CONSTANTS.DEFAULT_AVATAR,
            background: '',
            theme: 'default',
            linkedWorldBookIds: [],
            aiPatSuffix: '的脑袋瓜',
            myPatSuffix: '的肩膀'
          },
          history: [],
          musicData: {totalTime: 0}
        };
        STATE.state.chats[newChatId] = newChat;
        await DB.db.chats.put(newChat);
        SCREENS.chatScreenModule.renderChatList();
      }
    });

    console.log('聊天界面事件监听器注册完成');
  }

  /**
   * 文件上传事件监听器
   */
  private registerFileUploadListeners(): void {
    // 这里可以注册文件上传相关事件
    console.log('文件上传事件监听器注册完成');
  }

  /**
   * 数据管理事件监听器  
   */
  private registerDataManagementListeners(): void {
    document.getElementById('export-data-btn')?.addEventListener('click', () => 
      SERVICES.dataService.exportData());
    document.getElementById('import-data-trigger-btn')?.addEventListener('click', () => 
      document.getElementById('import-data-input')?.click());
    document.getElementById('import-data-input')?.addEventListener('change', (event) => 
      SERVICES.dataService.handleImportDataEvent(event));
      
    console.log('数据管理事件监听器注册完成');
  }

  /**
   * 音乐播放器事件监听器
   */
  private registerMusicPlayerListeners(): void {
    document.getElementById('listen-together-btn')?.addEventListener('click', () => 
      SERVICES.musicService.handleListenTogetherClick());
    document.getElementById('music-exit-btn')?.addEventListener('click', () => 
      SERVICES.musicService.endListenTogetherSession(true));
    
    console.log('音乐播放器事件监听器注册完成');
  }

  /**
   * 初始化应用扩展功能
   */
  private async initializeAppExtended(): Promise<void> {
    console.log('开始初始化应用扩展功能...');
    
    // 调用初始化模块的完整初始化
    await initializationModule.initializeApp();
    
    // 初始化API设置模块数据
    await SCREENS.apiSettingsScreenModule.initApiSettingsModule();
    
    console.log('应用扩展功能初始化完成');
  }

  /**
   * 显示初始屏幕
   */
  private showInitialScreen(): void {
    ROUTER.showScreen('home-screen');
  }

  // 注意： exitSelectionMode 方法已转移到 init/index.ts，避免重复定义
  // 如果需要在这里调用，请使用 initializationModule 的接口
}

// 应用实例
const app = new EPhoneApplication();

// === DOM加载后启动应用 ===
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app.initialize().catch(error => {
      console.error('❌ EPhone应用启动失败:', error);
    });
  });
} else {
  // DOM已就绪，直接启动
  app.initialize().catch(error => {
    console.error('❌ EPhone应用启动失败:', error);
  });
}

console.log('🎉 EPhone TypeScript应用已准备启动 - PR9完成');

// === 导出主要类和函数供全局使用 ===
export { EPhoneApplication, app };
export { CONSTANTS, STATE, DB, ROUTER, SCREENS, SERVICES };

// 向后兼容的导出
export const initApp = () => app.initialize();