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
// 强制使用 TypeScript 版本的兼容层，避免同名 .js 被解析
import { injectCompatibilityAPIs } from './init/compat.ts';

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
        // 获取全局默认用户角色
        let defaultUserRoleId: string | undefined;
        try {
          const allUserRoles = await DB.getAllUserRoles();
          const globalDefaultRole = allUserRoles.find(role => role.isGlobalDefault);
          defaultUserRoleId = globalDefaultRole?.id;
        } catch (error) {
          console.warn('获取全局默认用户角色失败:', error);
        }
        
        const newChatId = 'chat_' + Date.now();
        const newChat = {
          id: newChatId,
          name: name.trim(),
          isGroup: false,
          defaultUserRoleId, // 设置默认用户角色ID
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
        // Phase 2: 使用DB仓库替换直接Dexie调用
        await DB.saveChat(newChat);
        SCREENS.chatScreenModule.renderChatList();
      }
    });

    // 创建群聊
    document.getElementById('add-group-chat-btn')?.addEventListener('click', async () => {
      const name = await SERVICES.uiUtilsService.showCustomPrompt('创建新群聊', '请输入群名');
      if (name && name.trim()) {
        // 获取全局默认用户角色
        let defaultUserRoleId: string | undefined;
        try {
          const allUserRoles = await DB.getAllUserRoles();
          const globalDefaultRole = allUserRoles.find(role => role.isGlobalDefault);
          defaultUserRoleId = globalDefaultRole?.id;
        } catch (error) {
          console.warn('获取全局默认用户角色失败:', error);
        }
        
        const newChatId = 'group_' + Date.now();
        const newGroupChat = {
          id: newChatId,
          name: name.trim(),
          isGroup: true,
          defaultUserRoleId, // 设置默认用户角色ID
          members: [], // 空成员列表，可以后续添加
          settings: {
            aiPersona: '你们是群聊中的AI助手。',
            myPersona: '我在群聊中。',
            maxMemory: 15, // 群聊默认更多记忆
            aiAvatar: CONSTANTS.DEFAULT_AVATAR,
            myAvatar: CONSTANTS.DEFAULT_AVATAR,
            groupAvatar: CONSTANTS.DEFAULT_GROUP_AVATAR,
            background: '',
            theme: 'default',
            linkedWorldBookIds: [],
            aiPatSuffix: '的脑袋瓜',
            myPatSuffix: '的肩膀'
          },
          history: [],
          musicData: {totalTime: 0}
        };
        STATE.state.chats[newChatId] = newGroupChat;
        await DB.saveChat(newGroupChat);
        SCREENS.chatScreenModule.renderChatList();
      }
    });

    // 聊天设置按钮
    document.getElementById('chat-settings-btn')?.addEventListener('click', () => {
      this.openChatSettings();
    });

    // 取消聊天设置
    document.getElementById('cancel-chat-settings-btn')?.addEventListener('click', () => {
      this.closeChatSettings();
    });

    // 保存聊天设置  
    document.getElementById('save-chat-settings-btn')?.addEventListener('click', () => {
      this.saveChatSettings();
    });

    // 新增群成员按钮
    document.getElementById('add-group-member-btn')?.addEventListener('click', () => {
      this.addGroupMember();
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
    
    // 角色选择器事件监听器
    this.registerPersonaSelectorsListeners();
    
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

  // === 聊天设置相关方法 ===
  
  /**
   * 打开聊天设置模态框
   */
  private openChatSettings(): void {
    const activeChatId = STATE.state.activeChatId;
    if (!activeChatId || !STATE.state.chats[activeChatId]) {
      SERVICES.uiUtilsService.showCustomAlert('错误', '请先选择一个聊天');
      return;
    }

    const chat = STATE.state.chats[activeChatId];
    this.populateChatSettingsForm(chat);
    
    // 加载角色选择器选项
    this.loadPersonaOptions();
    
    // 初始化折叠功能
    this.initializeSettingsCollapse();
    
    const modal = document.getElementById('chat-settings-modal');
    if (modal) {
      modal.classList.add('visible');
    }
  }

  /**
   * 关闭聊天设置模态框
   */
  private closeChatSettings(): void {
    const modal = document.getElementById('chat-settings-modal');
    if (modal) {
      modal.classList.remove('visible');
    }
  }

  /**
   * 加载角色选择器选项
   */
  private async loadPersonaOptions(): Promise<void> {
    try {
      // 导入角色服务
      const { PersonaService } = await import('./screens/personaCenter/services/PersonaService');
      const { UserRoleService } = await import('./screens/personaCenter/services/UserRoleService');
      
      const personaService = new PersonaService();
      const userRoleService = new UserRoleService();
      
      // 获取所有角色（不区分archived状态）
      const [personas, userRoles] = await Promise.all([
        personaService.getAll(),
        userRoleService.getAll()
      ]);
      
      // 更新AI角色下拉框
      const aiPersonaContainer = document.getElementById('ai-persona-options-container');
      if (aiPersonaContainer) {
        const defaultOption = aiPersonaContainer.querySelector('[data-persona-id=""]');
        
        // 清空除默认选项外的所有选项
        Array.from(aiPersonaContainer.children).forEach(child => {
          if (child !== defaultOption) {
            child.remove();
          }
        });
        
        // 添加角色中心的AI角色
        personas.forEach(persona => {
          const option = document.createElement('div');
          option.className = 'option-item';
          option.setAttribute('data-persona-id', persona.id);
          option.innerHTML = `
            <span class="option-label">
              <span class="persona-name">${persona.name}</span>
              <span class="persona-tags">${persona.tags?.slice(0, 2).join(', ') || ''}</span>
            </span>
          `;
          aiPersonaContainer.appendChild(option);
        });
      }
      
      // 更新用户角色下拉框
      const userRoleContainer = document.getElementById('user-role-options-container');
      if (userRoleContainer) {
        const defaultOption = userRoleContainer.querySelector('[data-role-id=""]');
        
        // 清空除默认选项外的所有选项
        Array.from(userRoleContainer.children).forEach(child => {
          if (child !== defaultOption) {
            child.remove();
          }
        });
        
        // 添加角色中心的用户角色
        userRoles.forEach(userRole => {
          const option = document.createElement('div');
          option.className = 'option-item';
          option.setAttribute('data-role-id', userRole.id);
          option.innerHTML = `
            <span class="option-label">
              <span class="persona-name">${userRole.name}</span>
              <span class="persona-tags">${userRole.tags?.slice(0, 2).join(', ') || ''}</span>
            </span>
          `;
          userRoleContainer.appendChild(option);
        });
      }
      
      console.log(`✅ 已加载${personas.length}个AI角色和${userRoles.length}个用户角色到选择器`);
      
    } catch (error) {
      console.error('加载角色选择器失败:', error);
    }
  }

  /**
   * 更新角色选择器的当前选择状态
   */
  private updatePersonaSelections(chat: any): void {
    // 设置AI角色选择器
    const aiPersonaText = document.getElementById('selected-ai-persona-text');
    const selectedAiPersonaId = chat.personaId;
    if (selectedAiPersonaId && aiPersonaText) {
      const selectedOption = document.querySelector(`[data-persona-id="${selectedAiPersonaId}"]`);
      if (selectedOption) {
        const personaName = selectedOption.querySelector('.persona-name')?.textContent;
        aiPersonaText.textContent = personaName || '-- 选择角色 --';
        selectedOption.classList.add('selected');
      }
    }
    
    // 设置用户角色选择器
    const userRoleText = document.getElementById('selected-user-role-text');
    const defaultUserRoleId = chat.defaultUserRoleId;
    if (defaultUserRoleId && userRoleText) {
      const selectedOption = document.querySelector(`[data-role-id="${defaultUserRoleId}"]`);
      if (selectedOption) {
        const roleName = selectedOption.querySelector('.persona-name')?.textContent;
        userRoleText.textContent = roleName || '-- 选择角色 --';
        selectedOption.classList.add('selected');
      }
    }
  }

  /**
   * 注册角色选择器事件监听器
   */
  private registerPersonaSelectorsListeners(): void {
    // AI角色选择器点击事件（使用事件委托）
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      
      // AI角色选择框点击
      if (target.closest('#selected-ai-persona-text') || target.closest('.select-box')) {
        const container = document.getElementById('ai-persona-options-container');
        if (container && target.closest('#ai-persona-options-container')?.parentElement) {
          container.style.display = container.style.display === 'block' ? 'none' : 'block';
        }
      }
      
      // AI角色选项点击
      if (target.closest('#ai-persona-options-container .option-item')) {
        const option = target.closest('.option-item') as HTMLElement;
        const personaId = option.getAttribute('data-persona-id');
        const personaName = option.querySelector('.option-label')?.textContent?.trim();
        
        // 更新选择文本
        const selectedText = document.getElementById('selected-ai-persona-text');
        if (selectedText) {
          selectedText.textContent = personaName || '-- 选择角色 --';
        }
        
        // 标记选中状态
        document.querySelectorAll('#ai-persona-options-container .option-item').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');
        
        // 隐藏下拉框
        const container = document.getElementById('ai-persona-options-container');
        if (container) {
          container.style.display = 'none';
        }
        
        // 如果选择了角色中心的角色，自动填充textarea
        if (personaId) {
          this.fillPersonaTextarea(personaId);
        }
      }
      
      // 用户角色选择框点击
      if (target.closest('#selected-user-role-text') || target.closest('#user-role-options-container')?.parentElement?.querySelector('.select-box') === target.closest('.select-box')) {
        const container = document.getElementById('user-role-options-container');
        if (container && target.closest('#user-role-options-container')?.parentElement) {
          container.style.display = container.style.display === 'block' ? 'none' : 'block';
        }
      }
      
      // 用户角色选项点击
      if (target.closest('#user-role-options-container .option-item')) {
        const option = target.closest('.option-item') as HTMLElement;
        const roleId = option.getAttribute('data-role-id');
        const roleName = option.querySelector('.option-label')?.textContent?.trim();
        
        // 更新选择文本
        const selectedText = document.getElementById('selected-user-role-text');
        if (selectedText) {
          selectedText.textContent = roleName || '-- 选择角色 --';
        }
        
        // 标记选中状态
        document.querySelectorAll('#user-role-options-container .option-item').forEach(opt => {
          opt.classList.remove('selected');
        });
        option.classList.add('selected');
        
        // 隐藏下拉框
        const container = document.getElementById('user-role-options-container');
        if (container) {
          container.style.display = 'none';
        }
      }
    });
    
    // 点击其他地方关闭下拉框
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('#ai-persona-options-container') && !target.closest('.custom-select')) {
        const aiContainer = document.getElementById('ai-persona-options-container');
        const userContainer = document.getElementById('user-role-options-container');
        if (aiContainer) aiContainer.style.display = 'none';
        if (userContainer) userContainer.style.display = 'none';
      }
    });
  }

  /**
   * 根据角色ID填充AI角色textarea
   */
  private async fillPersonaTextarea(personaId: string): Promise<void> {
    try {
      const { PersonaService } = await import('./screens/personaCenter/services/PersonaService');
      const personaService = new PersonaService();
      const persona = await personaService.getById(personaId);
      
      if (persona && persona.prompt?.definition) {
        const textarea = document.getElementById('ai-persona') as HTMLTextAreaElement;
        if (textarea) {
          textarea.value = persona.prompt.definition;
        }
      }
    } catch (error) {
      console.error('加载角色设定失败:', error);
    }
  }

  /**
   * 填充聊天设置表单数据
   */
  private populateChatSettingsForm(chat: any): void {
    // 基础信息
    const chatNameInput = document.getElementById('chat-name-input') as HTMLInputElement;
    if (chatNameInput) chatNameInput.value = chat.name || '';

    // 获取所有需要根据聊天类型显示/隐藏的元素
    const groupNicknameInput = document.getElementById('my-group-nickname-input') as HTMLInputElement;
    const groupAvatarPreview = document.getElementById('group-avatar-preview') as HTMLImageElement;
    const groupAvatarGroup = document.getElementById('group-avatar-group');
    const myGroupNicknameGroup = document.getElementById('my-group-nickname-group');
    const groupMembersGroup = document.getElementById('group-members-group');
    const addGroupMemberBtn = document.getElementById('add-group-member-btn');
    
    // 整个群成员管理区块
    const groupMembersSection = document.querySelector('[data-section="group-members"]') as HTMLElement;
    
    // 角色设定区块相关元素
    const personaSection = document.querySelector('[data-section="persona"]') as HTMLElement;
    const personaSectionTitle = personaSection?.querySelector('.settings-section-title span:first-child') as HTMLElement;
    
    // AI相关元素 - 在群聊中隐藏，单聊中显示
    const aiPersonaGroup = document.getElementById('ai-persona-group');
    const aiAvatarGroup = document.getElementById('ai-avatar-group');

    // 填充角色设定数据
    const aiPersonaTextarea = document.getElementById('ai-persona') as HTMLTextAreaElement;
    const myPersonaTextarea = document.getElementById('my-persona') as HTMLTextAreaElement;
    const aiPatSuffixInput = document.getElementById('ai-pat-suffix-input') as HTMLInputElement;
    const myPatSuffixInput = document.getElementById('my-pat-suffix-input') as HTMLInputElement;
    const aiAvatarPreview = document.getElementById('ai-avatar-preview') as HTMLImageElement;
    const myAvatarPreview = document.getElementById('my-avatar-preview') as HTMLImageElement;
    const maxMemoryInput = document.getElementById('max-memory') as HTMLInputElement;

    // 填充当前聊天的设置数据
    if (aiPersonaTextarea) aiPersonaTextarea.value = chat.settings.aiPersona || '';
    if (myPersonaTextarea) myPersonaTextarea.value = chat.settings.myPersona || '';
    if (aiPatSuffixInput) aiPatSuffixInput.value = chat.settings.aiPatSuffix || '';
    if (myPatSuffixInput) myPatSuffixInput.value = chat.settings.myPatSuffix || '';
    if (maxMemoryInput) maxMemoryInput.value = chat.settings.maxMemory?.toString() || '10';
    
    // 设置角色选择器当前选择
    this.updatePersonaSelections(chat);

    // 头像预览
    if (aiAvatarPreview) {
      aiAvatarPreview.src = chat.settings.aiAvatar || CONSTANTS.DEFAULT_AVATAR;
    }
    if (myAvatarPreview) {
      myAvatarPreview.src = chat.settings.myAvatar || CONSTANTS.DEFAULT_AVATAR;
    }

    // 根据聊天类型显示/隐藏相关设置项（参照myPhone逻辑）
    // 修复：严格布尔判断，防止字符串"false"被误判为true
    const isGroup = chat.isGroup === true || chat.isGroup === 'true';
    console.log('Chat settings - isGroup check:', { chatId: chat.id, isGroup: chat.isGroup, resolved: isGroup });
    
    if (isGroup) {
      // 群聊：显示群聊相关设置，隐藏AI相关设置
      if (groupAvatarGroup) groupAvatarGroup.style.setProperty('display', 'block', 'important');
      if (myGroupNicknameGroup) myGroupNicknameGroup.style.setProperty('display', 'block', 'important');
      if (groupMembersGroup) groupMembersGroup.style.setProperty('display', 'block', 'important');
      if (addGroupMemberBtn) addGroupMemberBtn.style.setProperty('display', 'block', 'important');
      if (groupMembersSection) groupMembersSection.style.setProperty('display', 'block', 'important');
      if (aiPersonaGroup) aiPersonaGroup.style.setProperty('display', 'none', 'important');
      if (aiAvatarGroup) aiAvatarGroup.style.setProperty('display', 'none', 'important');
      
      // 更新角色设定区块标题为群聊模式
      if (personaSectionTitle) {
        personaSectionTitle.textContent = '👤 我的群聊人设';
      }
      
      if (groupAvatarPreview) {
        groupAvatarPreview.src = chat.settings.groupAvatar || CONSTANTS.DEFAULT_GROUP_AVATAR;
      }
      
      // 渲染已有群成员
      if (chat.members && chat.members.length > 0) {
        this.renderGroupMemberSettings(chat.members);
      }
    } else {
      // 单聊：隐藏群聊相关设置，显示AI相关设置
      if (groupAvatarGroup) groupAvatarGroup.style.setProperty('display', 'none', 'important');
      if (myGroupNicknameGroup) myGroupNicknameGroup.style.setProperty('display', 'none', 'important');
      if (groupMembersGroup) groupMembersGroup.style.setProperty('display', 'none', 'important');
      if (addGroupMemberBtn) addGroupMemberBtn.style.setProperty('display', 'none', 'important');
      if (groupMembersSection) groupMembersSection.style.setProperty('display', 'none', 'important');
      if (aiPersonaGroup) aiPersonaGroup.style.setProperty('display', 'block', 'important');
      if (aiAvatarGroup) aiAvatarGroup.style.setProperty('display', 'block', 'important');
      
      // 恢复角色设定区块标题为单聊模式
      if (personaSectionTitle) {
        personaSectionTitle.textContent = '🎭 角色设定';
      }
      
      // 清空群成员设置容器，防止残留内容
      const groupMembersSettings = document.getElementById('group-members-settings');
      if (groupMembersSettings) {
        groupMembersSettings.innerHTML = '';
      }
    }

    // 设置主题选择
    const currentTheme = chat.settings.theme || 'default';
    const themeRadio = document.querySelector(`input[name="theme-select"][value="${currentTheme}"]`) as HTMLInputElement;
    if (themeRadio) themeRadio.checked = true;
    
    // 初始化用户角色选择器
    this.initializeUserRoleSelector(chat);
  }

  /**
   * 初始化用户角色选择器
   */
  private async initializeUserRoleSelector(chat: any): Promise<void> {
    const selectedRoleText = document.getElementById('selected-user-role-text') as HTMLElement;
    const optionsContainer = document.getElementById('user-role-options-container') as HTMLElement;
    const selectBox = optionsContainer?.parentElement?.querySelector('.select-box') as HTMLElement;
    
    if (!selectedRoleText || !optionsContainer || !selectBox) {
      console.warn('用户角色选择器元素未找到');
      return;
    }
    
    try {
      // 获取所有用户角色
      const userRoles = await (window as any).DB.getAllUserRoles();
      
      // 清空选项容器
      optionsContainer.innerHTML = '<div class="option-item" data-role-id=""><span class="option-label">无角色 (使用原始消息)</span></div>';
      
      // 添加用户角色选项
      userRoles.forEach((role: any) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option-item';
        optionDiv.setAttribute('data-role-id', role.id);
        optionDiv.innerHTML = `
          <span class="option-label">${role.name}</span>
          ${role.isGlobalDefault ? '<span class="global-default-badge">默认</span>' : ''}
        `;
        optionsContainer.appendChild(optionDiv);
      });
      
      // 设置当前选中的角色
      const currentRoleId = chat.defaultUserRoleId || '';
      if (currentRoleId) {
        const currentRole = userRoles.find((role: any) => role.id === currentRoleId);
        selectedRoleText.textContent = currentRole ? currentRole.name : '-- 选择角色 --';
      } else {
        selectedRoleText.textContent = '无角色 (使用原始消息)';
      }
      
      // 绑定选择器事件
      selectBox.addEventListener('click', () => {
        optionsContainer.style.display = optionsContainer.style.display === 'block' ? 'none' : 'block';
      });
      
      // 绑定选项点击事件
      optionsContainer.addEventListener('click', (e) => {
        const optionItem = (e.target as HTMLElement).closest('.option-item') as HTMLElement;
        if (!optionItem) return;
        
        const roleId = optionItem.getAttribute('data-role-id') || '';
        const roleName = optionItem.querySelector('.option-label')?.textContent || '-- 选择角色 --';
        
        // 更新显示文本
        selectedRoleText.textContent = roleName;
        
        // 保存选择到聊天对象
        chat.defaultUserRoleId = roleId || undefined;
        
        // 隐藏选项列表
        optionsContainer.style.display = 'none';
        
        console.log(`用户角色已设置: ${roleName} (${roleId})`);
      });
      
      // 点击外部关闭下拉列表
      document.addEventListener('click', (e) => {
        if (!selectBox.contains(e.target as Node)) {
          optionsContainer.style.display = 'none';
        }
      });
      
    } catch (error) {
      console.error('初始化用户角色选择器失败:', error);
      selectedRoleText.textContent = '加载失败';
    }
  }

  /**
   * 初始化设置页面折叠功能
   */
  private initializeSettingsCollapse(): void {
    // 获取所有折叠标题元素
    const collapsibleHeaders = document.querySelectorAll('.collapsible-header');
    
    collapsibleHeaders.forEach(header => {
      // 移除现有事件监听器（避免重复绑定）
      header.removeEventListener('click', this.handleCollapseToggle);
      header.removeEventListener('keydown', this.handleCollapseKeydown);
      
      // 添加点击事件监听器
      header.addEventListener('click', this.handleCollapseToggle.bind(this));
      
      // 添加键盘访问支持
      header.addEventListener('keydown', this.handleCollapseKeydown.bind(this));
    });
    
    // 从localStorage加载折叠状态
    this.loadCollapseStates();
  }

  /**
   * 处理折叠切换点击事件
   */
  private handleCollapseToggle(event: Event): void {
    const header = event.currentTarget as HTMLElement;
    const settingsSection = header.closest('.settings-section');
    
    if (!settingsSection) return;
    
    const isCollapsed = settingsSection.classList.contains('collapsed');
    
    // 切换折叠状态
    if (isCollapsed) {
      settingsSection.classList.remove('collapsed');
    } else {
      settingsSection.classList.add('collapsed');
    }
    
    // 保存折叠状态到localStorage
    const sectionName = settingsSection.getAttribute('data-section');
    if (sectionName) {
      this.saveCollapseState(sectionName, !isCollapsed);
    }
  }

  /**
   * 处理折叠切换键盘事件
   */
  private handleCollapseKeydown(event: KeyboardEvent): void {
    // 支持Enter和Space键
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.handleCollapseToggle(event);
    }
  }

  /**
   * 保存折叠状态到localStorage
   */
  private saveCollapseState(sectionName: string, isCollapsed: boolean): void {
    try {
      const collapseStates = JSON.parse(localStorage.getItem('chatSettingsCollapseStates') || '{}');
      collapseStates[sectionName] = isCollapsed;
      localStorage.setItem('chatSettingsCollapseStates', JSON.stringify(collapseStates));
    } catch (error) {
      console.error('保存折叠状态失败:', error);
    }
  }

  /**
   * 从localStorage加载折叠状态
   */
  private loadCollapseStates(): void {
    try {
      const collapseStates = JSON.parse(localStorage.getItem('chatSettingsCollapseStates') || '{}');
      
      Object.entries(collapseStates).forEach(([sectionName, isCollapsed]) => {
        const section = document.querySelector(`[data-section="${sectionName}"]`);
        if (section && isCollapsed) {
          section.classList.add('collapsed');
        }
      });
    } catch (error) {
      console.error('加载折叠状态失败:', error);
    }
  }

  /**
   * 保存聊天设置
   */
  private async saveChatSettings(): Promise<void> {
    const activeChatId = STATE.state.activeChatId;
    if (!activeChatId || !STATE.state.chats[activeChatId]) {
      return;
    }

    const chat = STATE.state.chats[activeChatId];
    
    // 获取表单数据
    const chatNameInput = document.getElementById('chat-name-input') as HTMLInputElement;
    const groupNicknameInput = document.getElementById('my-group-nickname-input') as HTMLInputElement;
    const aiPersonaTextarea = document.getElementById('ai-persona') as HTMLTextAreaElement;
    const myPersonaTextarea = document.getElementById('my-persona') as HTMLTextAreaElement;
    const aiPatSuffixInput = document.getElementById('ai-pat-suffix-input') as HTMLInputElement;
    const myPatSuffixInput = document.getElementById('my-pat-suffix-input') as HTMLInputElement;
    const maxMemoryInput = document.getElementById('max-memory') as HTMLInputElement;
    const selectedTheme = document.querySelector('input[name="theme-select"]:checked') as HTMLInputElement;
    
    // 更新聊天基本信息
    if (chatNameInput?.value.trim()) {
      chat.name = chatNameInput.value.trim();
    }
    
    // 更新角色设定
    if (aiPersonaTextarea) {
      chat.settings.aiPersona = aiPersonaTextarea.value || '你是谁呀。';
    }
    if (myPersonaTextarea) {
      chat.settings.myPersona = myPersonaTextarea.value || '我是谁呀。';
    }
    
    // 保存角色选择器的选择
    const selectedAiPersonaOption = document.querySelector('#ai-persona-options-container .option-item.selected');
    const selectedUserRoleOption = document.querySelector('#user-role-options-container .option-item.selected');
    
    if (selectedAiPersonaOption) {
      chat.personaId = selectedAiPersonaOption.getAttribute('data-persona-id') || undefined;
    }
    
    if (selectedUserRoleOption) {
      chat.defaultUserRoleId = selectedUserRoleOption.getAttribute('data-role-id') || undefined;
    }
    if (aiPatSuffixInput) {
      chat.settings.aiPatSuffix = aiPatSuffixInput.value || '的脑袋瓜';
    }
    if (myPatSuffixInput) {
      chat.settings.myPatSuffix = myPatSuffixInput.value || '的肩膀';
    }
    
    // 更新记忆设置
    if (maxMemoryInput) {
      const memoryValue = parseInt(maxMemoryInput.value);
      if (memoryValue && memoryValue >= 1 && memoryValue <= 50) {
        chat.settings.maxMemory = memoryValue;
      }
    }
    
    // 更新主题设置
    if (selectedTheme) {
      chat.settings.theme = selectedTheme.value;
    }
    
    // 注意：defaultUserRoleId 已通过用户角色选择器直接保存到 chat 对象中
    // 这里不需要额外处理，因为 chat 对象的引用会在数据库保存时一起保存
    
    // 群聊特殊处理
    if (chat.isGroup && groupNicknameInput?.value.trim()) {
      // 这里可以添加群昵称处理逻辑
    }
    
    try {
      // 保存到数据库
      await DB.saveChat(chat);
      
      // 更新UI
      SCREENS.chatScreenModule.renderChatList();
      
      // 如果当前在聊天界面，更新标题和主题
      const headerTitle = document.getElementById('chat-header-title');
      if (headerTitle) {
        headerTitle.textContent = chat.name;
      }
      
      // 更新聊天界面主题
      const messagesContainer = document.getElementById('chat-messages');
      if (messagesContainer) {
        messagesContainer.dataset.theme = chat.settings.theme || 'default';
      }
      
      this.closeChatSettings();
      SERVICES.uiUtilsService.showCustomAlert('成功', '聊天设置已保存');
      
    } catch (error) {
      console.error('保存聊天设置失败:', error);
      SERVICES.uiUtilsService.showCustomAlert('错误', '保存设置失败，请重试');
    }
  }

  /**
   * 新增群成员
   */
  private addGroupMember(): void {
    const activeChatId = STATE.state.activeChatId;
    if (!activeChatId || !STATE.state.chats[activeChatId] || !STATE.state.chats[activeChatId].isGroup) {
      return;
    }

    const chat = STATE.state.chats[activeChatId];
    
    // 确保members数组存在
    if (!chat.members) {
      chat.members = [];
    }
    
    // 创建新成员（参照myPhone版本）
    const newMember = {
      id: `member_${Date.now()}`,
      name: `新成员${chat.members.length + 1}`,
      avatar: CONSTANTS.DEFAULT_GROUP_MEMBER_AVATAR || CONSTANTS.DEFAULT_AVATAR,
      persona: '一个新来的群成员。',
      patSuffix: '的后脑勺'
    };
    
    // 添加到群成员列表
    chat.members.push(newMember);
    
    // 重新渲染群成员设置
    this.renderGroupMemberSettings(chat.members);
    
    console.log('新增群成员:', newMember.name);
  }

  /**
   * 渲染群成员设置
   */
  private renderGroupMemberSettings(members: any[]): void {
    const container = document.getElementById('group-members-settings');
    if (!container) return;
    
    container.innerHTML = '';
    
    members.forEach((member, index) => {
      const memberDiv = document.createElement('div');
      memberDiv.className = 'group-member-item';
      memberDiv.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        margin-bottom: 10px;
        background: #f9f9f9;
      `;
      
      // 成员头像
      const avatar = document.createElement('img');
      avatar.src = member.avatar;
      avatar.style.cssText = 'width: 40px; height: 40px; border-radius: 50%; object-fit: cover;';
      
      // 成员信息
      const info = document.createElement('div');
      info.style.flex = '1';
      
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = member.name;
      nameInput.style.cssText = 'width: 100%; margin-bottom: 5px; padding: 4px; border: 1px solid #ddd; border-radius: 4px;';
      nameInput.addEventListener('input', () => {
        member.name = nameInput.value;
      });
      
      const personaTextarea = document.createElement('textarea');
      personaTextarea.value = member.persona;
      personaTextarea.rows = 2;
      personaTextarea.style.cssText = 'width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px; resize: vertical;';
      personaTextarea.addEventListener('input', () => {
        member.persona = personaTextarea.value;
      });
      
      info.appendChild(nameInput);
      info.appendChild(personaTextarea);
      
      // 删除按钮
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '删除';
      deleteBtn.style.cssText = 'padding: 5px 10px; background: #ff4757; color: white; border: none; border-radius: 4px; cursor: pointer;';
      deleteBtn.addEventListener('click', () => {
        const activeChatId = STATE.state.activeChatId;
        if (activeChatId && STATE.state.chats[activeChatId] && STATE.state.chats[activeChatId].members) {
          STATE.state.chats[activeChatId].members.splice(index, 1);
          this.renderGroupMemberSettings(STATE.state.chats[activeChatId].members);
        }
      });
      
      memberDiv.appendChild(avatar);
      memberDiv.appendChild(info);
      memberDiv.appendChild(deleteBtn);
      
      container.appendChild(memberDiv);
    });
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