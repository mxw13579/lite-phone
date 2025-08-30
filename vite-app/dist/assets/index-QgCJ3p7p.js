import { c as constants_default, s as state_default } from "./core-DqV6zy1U.js";
import { d as database_default } from "./database-flcFRRqX.js";
import { r as router_default } from "./router-CPmfuHd7.js";
import { S as SCREENS, a as aiResponseModule, c as chatScreenModule, w as worldBookScreenModule, b as apiSettingsScreenModule, d as wallpaperScreenModule, p as presetScreenModule } from "./screens-C89IeLKp.js";
import { S as SERVICES, s as serviceManager, u as uiUtilsService, b as batteryService, d as dataService, m as musicService, p as personaService } from "./services-CGLbbFbj.js";
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
class InitializationModule {
  constructor() {
    this.selectedMessages = /* @__PURE__ */ new Set();
    this.editingMemberId = null;
  }
  /**
   * 初始化应用的所有事件监听器和UI组件
   */
  async initializeApp() {
    const win = window;
    const state = win.STATE;
    state?.musicState;
    win.CONSTANTS?.DEFAULT_AVATAR || "https://i.postimg.cc/PxZrFFFL/o-o-1.jpg";
    win.CONSTANTS?.DEFAULT_MY_GROUP_AVATAR || "https://i.postimg.cc/cLPP10Vm/4.jpg";
    win.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || "https://i.postimg.cc/VkQfgzGJ/1.jpg";
    win.CONSTANTS?.DEFAULT_GROUP_AVATAR || "https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg";
    console.log("开始初始化应用事件监听器...");
    this.initChatInterfaceListeners();
    this.initGroupMemberListeners();
    this.initPersonaLibraryListeners();
    this.initMusicPlayerListeners();
    this.initUIModalListeners();
    console.log("应用事件监听器初始化完成");
  }
  /**
   * 聊天界面事件监听器
   */
  initChatInterfaceListeners() {
    const win = window;
    document.getElementById("back-to-list-btn")?.addEventListener("click", () => {
      this.exitMessageEditMode(false);
      this.exitSelectionMode();
      win.STATE.setActiveChatId(null);
      win.ROUTER.showScreen("chat-list-screen");
    });
    document.getElementById("edit-messages-btn")?.addEventListener("click", () => {
      this.toggleMessageEditMode();
    });
    document.getElementById("transfer-btn")?.addEventListener("click", () => {
      this.sendUserTransfer();
    });
    document.getElementById("sticker-panel-btn")?.addEventListener("click", () => {
      win.ChatModule?.renderStickerPanel();
    });
    document.getElementById("transfer-send-btn")?.addEventListener("click", () => {
      this.sendUserTransfer();
    });
    document.getElementById("transfer-cancel-btn")?.addEventListener("click", () => {
      const transferModal = document.getElementById("transfer-modal");
      if (transferModal) {
        transferModal.classList.remove("visible");
      }
    });
    console.log("聊天界面事件监听器初始化完成");
  }
  /**
   * 群聊成员管理事件监听器
   */
  initGroupMemberListeners() {
    const win = window;
    document.getElementById("add-member-btn")?.addEventListener("click", async () => {
      const memberName = await win.showCustomPrompt("添加群成员", "请输入成员名称");
      if (memberName && memberName.trim()) {
        const state = win.STATE?.state;
        const chat = state?.chats[state.activeChatId];
        if (chat && chat.isGroup) {
          const newMember = {
            id: `member_${Date.now()}`,
            name: memberName.trim(),
            persona: "一个有趣的人",
            avatar: win.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || "",
            patSuffix: "的脑袋瓜"
          };
          if (!chat.members) chat.members = [];
          chat.members.push(newMember);
          await win.DB.db.chats.put(chat);
          this.renderGroupMemberSettings();
        }
      }
    });
    document.getElementById("save-member-btn")?.addEventListener("click", async () => {
      await this.saveMemberChanges();
    });
    document.getElementById("cancel-member-edit-btn")?.addEventListener("click", () => {
      this.closeMemberEditor();
    });
    console.log("群聊成员事件监听器初始化完成");
  }
  /**
   * 人设库事件监听器
   */
  initPersonaLibraryListeners() {
    const win = window;
    document.getElementById("open-persona-library-btn")?.addEventListener("click", () => {
      win.PersonaService?.openPersonaLibrary();
    });
    document.getElementById("close-persona-library-btn")?.addEventListener("click", () => {
      win.PersonaService?.closePersonaLibrary();
    });
    document.getElementById("create-persona-btn")?.addEventListener("click", () => {
      win.PersonaService?.openPersonaEditorForCreate();
    });
    document.getElementById("save-persona-btn")?.addEventListener("click", () => {
      win.PersonaService?.savePersonaPreset();
    });
    document.getElementById("cancel-persona-btn")?.addEventListener("click", () => {
      win.PersonaService?.closePersonaEditor();
    });
    console.log("人设库事件监听器初始化完成");
  }
  /**
   * 音乐播放器事件监听器
   */
  initMusicPlayerListeners() {
    const win = window;
    document.getElementById("play-pause-btn")?.addEventListener("click", () => {
      win.MusicService?.togglePlayPause();
    });
    document.getElementById("next-btn")?.addEventListener("click", () => {
      win.MusicService?.playNext();
    });
    document.getElementById("prev-btn")?.addEventListener("click", () => {
      win.MusicService?.playPrev();
    });
    document.getElementById("play-mode-btn")?.addEventListener("click", () => {
      win.MusicService?.changePlayMode();
    });
    document.getElementById("add-song-url-btn")?.addEventListener("click", () => {
      win.MusicService?.addSongFromURL();
    });
    document.getElementById("add-song-file-btn")?.addEventListener("click", () => {
      win.MusicService?.addSongFromLocal();
    });
    document.getElementById("back-to-chat-btn")?.addEventListener("click", () => {
      win.MusicService?.returnToChat();
    });
    console.log("音乐播放器事件监听器初始化完成");
  }
  /**
   * UI模态框事件监听器
   */
  initUIModalListeners() {
    document.getElementById("custom-modal-close")?.addEventListener("click", () => {
      const modal = document.getElementById("custom-modal");
      if (modal) {
        modal.classList.remove("visible");
      }
    });
    document.getElementById("custom-confirm-ok")?.addEventListener("click", () => {
      const win = window;
      win._confirmResolve?.(true);
    });
    document.getElementById("custom-confirm-cancel")?.addEventListener("click", () => {
      const win = window;
      win._confirmResolve?.(false);
    });
    document.getElementById("custom-prompt-ok")?.addEventListener("click", () => {
      const win = window;
      const input = document.getElementById("custom-prompt-input");
      win._promptResolve?.(input?.value || "");
    });
    document.getElementById("custom-prompt-cancel")?.addEventListener("click", () => {
      const win = window;
      win._promptResolve?.(null);
    });
    console.log("UI模态框事件监听器初始化完成");
  }
  // ============ 辅助功能函数 ============
  /**
   * 退出消息编辑模式
   */
  exitMessageEditMode(shouldSave = false) {
    const win = window;
    if (win.ChatModule?.exitMessageEditMode) {
      win.ChatModule.exitMessageEditMode(shouldSave);
    }
  }
  /**
   * 退出选择模式
   */
  exitSelectionMode() {
    this.selectedMessages.clear();
    document.getElementById("chat-interface-screen")?.classList.remove("selection-mode");
    document.querySelectorAll(".message-bubble.selected").forEach((bubble) => {
      bubble.classList.remove("selected");
    });
  }
  /**
   * 切换消息编辑模式
   */
  toggleMessageEditMode() {
    const win = window;
    if (win.ChatModule?.toggleMessageEditMode) {
      win.ChatModule.toggleMessageEditMode();
    }
  }
  /**
   * 发送用户转账
   */
  sendUserTransfer() {
    const win = window;
    if (win.ChatModule?.sendUserTransfer) {
      win.ChatModule.sendUserTransfer();
    }
  }
  /**
   * 打开成员编辑器
   */
  openMemberEditor(memberId) {
    const win = window;
    const state = win.STATE?.state;
    this.editingMemberId = memberId;
    const chat = state?.chats[state.activeChatId];
    if (!chat || !chat.isGroup || !chat.members) return;
    const member = chat.members.find((m) => m.id === memberId);
    if (!member) return;
    const nameInput = document.getElementById("member-name-input");
    const personaInput = document.getElementById("member-persona-input");
    const patSuffixInput = document.getElementById("member-pat-suffix-input");
    if (nameInput) nameInput.value = member.name;
    if (personaInput) personaInput.value = member.persona;
    if (patSuffixInput) patSuffixInput.value = member.patSuffix || "";
    const memberEditor = document.getElementById("member-editor");
    if (memberEditor) {
      memberEditor.classList.add("active");
    }
  }
  /**
   * 保存成员更改
   */
  async saveMemberChanges() {
    const win = window;
    const state = win.STATE?.state;
    if (!this.editingMemberId) return;
    const chat = state?.chats[state.activeChatId];
    if (!chat || !chat.isGroup || !chat.members) return;
    const member = chat.members.find((m) => m.id === this.editingMemberId);
    if (!member) return;
    const nameInput = document.getElementById("member-name-input");
    const personaInput = document.getElementById("member-persona-input");
    const patSuffixInput = document.getElementById("member-pat-suffix-input");
    if (nameInput) member.name = nameInput.value.trim() || member.name;
    if (personaInput) member.persona = personaInput.value.trim() || member.persona;
    if (patSuffixInput) member.patSuffix = patSuffixInput.value.trim();
    await win.DB.db.chats.put(chat);
    this.renderGroupMemberSettings();
    this.closeMemberEditor();
  }
  /**
   * 关闭成员编辑器
   */
  closeMemberEditor() {
    this.editingMemberId = null;
    const memberEditor = document.getElementById("member-editor");
    if (memberEditor) {
      memberEditor.classList.remove("active");
    }
  }
  /**
   * 渲染群成员设置
   */
  renderGroupMemberSettings() {
    const win = window;
    if (win.PersonaService?.renderGroupMemberSettings) {
      win.PersonaService.renderGroupMemberSettings();
    }
  }
  /**
   * 删除群成员
   */
  async deleteMember(memberId) {
    const win = window;
    const state = win.STATE?.state;
    const confirmed = await win.showCustomConfirm("删除成员", "确定要删除这个群成员吗？");
    if (!confirmed) return;
    const chat = state?.chats[state.activeChatId];
    if (!chat || !chat.isGroup || !chat.members) return;
    chat.members = chat.members.filter((m) => m.id !== memberId);
    await win.DB.db.chats.put(chat);
    this.renderGroupMemberSettings();
  }
}
const initializationModule = new InitializationModule();
if (typeof window !== "undefined") {
  const win = window;
  win.InitializationModule = initializationModule;
  win.initializeApp = () => initializationModule.initializeApp();
}
console.log("初始化模块(TypeScript版)已加载");
console.log("🚀 EPhone Vite+TypeScript 版本启动中...");
console.log("✅ 核心模块已加载:");
console.log("  - CONSTANTS loaded:", Object.keys(constants_default).length, "keys");
console.log("  - STATE loaded:", Object.keys(state_default).length, "functions");
console.log("  - DB loaded:", Object.keys(database_default).length, "functions");
console.log("  - ROUTER loaded:", Object.keys(router_default).length, "functions");
console.log("  - SCREENS loaded:", Object.keys(SCREENS).length, "modules");
console.log("  - SERVICES loaded:", Object.keys(SERVICES).length, "services");
class EPhoneApplication {
  constructor() {
    this.initialized = false;
    this.selectedMessages = /* @__PURE__ */ new Set();
    this.editingMemberId = null;
  }
  /**
   * 应用主初始化流程
   */
  async initialize() {
    if (this.initialized) {
      console.warn("应用已经初始化，跳过重复初始化");
      return;
    }
    try {
      console.log("🚀 开始EPhone TypeScript应用初始化...");
      this.injectGlobalAPIs();
      console.log("✅ 全局API注入完成");
      await this.initializeDatabase();
      console.log("✅ 数据库初始化完成");
      this.applyApplicationTheme();
      console.log("✅ 应用主题加载完成");
      await this.initializeServices();
      console.log("✅ 所有服务初始化完成");
      await this.initializeScreenModules();
      console.log("✅ 屏幕模块初始化完成");
      await this.registerEventListeners();
      console.log("✅ 事件监听器注册完成");
      await this.initializeAppExtended();
      console.log("✅ 应用扩展功能初始化完成");
      this.showInitialScreen();
      console.log("✅ 应用初始化完成");
      this.initialized = true;
    } catch (error) {
      console.error("❌ 应用初始化失败:", error);
      throw error;
    }
  }
  /**
   * 注入全局API到window对象，保持向后兼容
   */
  injectGlobalAPIs() {
    window.CONSTANTS = constants_default;
    window.STATE = state_default;
    window.DB = database_default;
    window.ROUTER = router_default;
    window.SCREENS = { ...SCREENS, aiResponseModule };
    window.state = state_default.state;
    window.musicState = state_default.musicState;
    window.myAddress = () => typeof state_default.myAddress === "function" ? state_default.myAddress() : state_default.myAddress;
    window.setActiveChatId = state_default.setActiveChatId.bind(state_default);
    window.updateGlobalSettings = state_default.updateGlobalSettings.bind(state_default);
    window.setApiConfig = state_default.setApiConfig.bind(state_default);
    window.setMyAddress = state_default.setMyAddress.bind(state_default);
    window.getActiveChat = state_default.getActiveChat.bind(state_default);
    window.getActivePreset = state_default.getActivePreset.bind(state_default);
    window.isGroupChat = state_default.isGroupChat.bind(state_default);
    window.getFullState = state_default.getFullState.bind(state_default);
    window.db = database_default.db;
    window.Dexie = window.Dexie || database_default.db.constructor;
    window.loadAllDataFromDB = database_default.loadAllDataFromDB.bind(database_default);
    window.initializeDatabase = database_default.initializeDatabase.bind(database_default);
    window.SCREEN_IDS = router_default.SCREEN_IDS;
    window.showScreen = router_default.showScreen.bind(router_default);
    window.navigateToChat = router_default.navigateToChat.bind(router_default);
    window.navigateToChatList = router_default.navigateToChatList.bind(router_default);
    window.getCurrentScreen = router_default.getCurrentScreen.bind(router_default);
    window.initRouter = router_default.initRouter.bind(router_default);
    window.ServiceManager = serviceManager;
    window.UIService = uiUtilsService;
    window.BatteryService = batteryService;
    window.DataService = dataService;
    window.MusicService = musicService;
    window.PersonaService = personaService;
    window.showCustomModal = () => uiUtilsService.showCustomModal();
    window.hideCustomModal = () => uiUtilsService.hideCustomModal();
    window.showCustomConfirm = uiUtilsService.showCustomConfirm.bind(uiUtilsService);
    window.showCustomAlert = uiUtilsService.showCustomAlert.bind(uiUtilsService);
    window.showCustomPrompt = uiUtilsService.showCustomPrompt.bind(uiUtilsService);
    window.showNotification = uiUtilsService.showNotification.bind(uiUtilsService);
    window.updateClock = () => uiUtilsService.updateClock();
    window.initClock = () => uiUtilsService.initClock();
    window.exportData = () => dataService.exportData();
    window.importData = dataService.importData.bind(dataService);
    window.handleImportDataEvent = dataService.handleImportDataEvent.bind(dataService);
    window.initBatteryManager = () => batteryService.initBatteryManager();
    window.updateListenTogetherIcon = (chatId, forceReset) => musicService.updateListenTogetherIcon(chatId || null, forceReset);
    window.updateListenTogetherIconProxy = (chatId, forceReset) => musicService.updateListenTogetherIcon(chatId || null, forceReset);
    window.endListenTogetherSession = musicService.endListenTogetherSession.bind(musicService);
    window.triggerAiResponse = () => chatScreenModule.triggerAiResponse();
    window.parseAiResponse = (content) => aiResponseModule.parseAiResponse(content);
    window.ChatModule = chatScreenModule;
    window.renderWorldBookScreenProxy = worldBookScreenModule.renderWorldBookScreen.bind(worldBookScreenModule);
    window.renderApiSettingsProxy = apiSettingsScreenModule.renderApiSettingsScreen.bind(apiSettingsScreenModule);
    window.renderWallpaperScreenProxy = wallpaperScreenModule.renderWallpaperScreen.bind(wallpaperScreenModule);
    window.renderPresetListProxy = () => {
      presetScreenModule.renderPresetListScreen().catch(console.error);
    };
    window.renderChatListProxy = chatScreenModule.renderChatList.bind(chatScreenModule);
    window.exitMessageEditMode = (shouldSave = false) => {
      return chatScreenModule.exitMessageEditMode(shouldSave);
    };
    window.toggleMessageEditMode = () => {
      return chatScreenModule.toggleMessageEditMode();
    };
    window._editingMemberId = null;
    console.log("全局API注入完成 - 向后兼容性保持100%");
  }
  /**
   * 初始化数据库和加载数据
   */
  async initializeDatabase() {
    await database_default.initializeDatabase();
    const allData = await database_default.loadAllDataFromDB();
    if (allData) {
      Object.assign(state_default.state, allData);
      console.log("应用数据已加载到状态中");
    }
  }
  /**
   * 应用主题
   */
  applyApplicationTheme() {
    if (state_default.state.globalSettings.remoteThemeUrl) {
      const stylesheet = document.getElementById("main-stylesheet");
      if (stylesheet) {
        const url = state_default.state.globalSettings.remoteThemeUrl;
        stylesheet.href = url + "?v=" + Date.now();
      }
    }
  }
  /**
   * 初始化所有服务
   */
  async initializeServices() {
    uiUtilsService.updateClock();
    setInterval(() => uiUtilsService.updateClock(), 1e3 * 30);
    await batteryService.initBatteryManager();
    await serviceManager.initAllServices();
  }
  /**
   * 初始化屏幕模块
   */
  async initializeScreenModules() {
    console.log("初始化世界书屏幕模块...");
    worldBookScreenModule.initListeners();
    console.log("初始化API设置屏幕模块...");
    apiSettingsScreenModule.initListeners();
    console.log("初始化壁纸屏幕模块...");
    wallpaperScreenModule.initListeners();
    console.log("初始化预设屏幕模块...");
    presetScreenModule.initListeners();
    await presetScreenModule.initPresetsData();
    console.log("初始化聊天屏幕模块...");
    if (chatScreenModule && typeof chatScreenModule.initListeners === "function") {
      chatScreenModule.initListeners();
    }
    console.log("初始化AI响应模块...");
    console.log("所有屏幕模块初始化完成");
  }
  /**
   * 注册所有DOM事件监听器
   */
  async registerEventListeners() {
    console.log("开始注册DOM事件监听器...");
    this.registerChatInterfaceListeners();
    this.registerFileUploadListeners();
    this.registerDataManagementListeners();
    this.registerMusicPlayerListeners();
    console.log("DOM事件监听器注册完成");
  }
  /**
   * 聊天界面基础事件监听器
   */
  registerChatInterfaceListeners() {
    document.getElementById("back-to-list-btn")?.addEventListener("click", () => {
      chatScreenModule.exitMessageEditMode(false);
      this.exitSelectionMode();
      state_default.setActiveChatId(null);
      router_default.showScreen("chat-list-screen");
    });
    document.getElementById("add-chat-btn")?.addEventListener("click", async () => {
      const name = await uiUtilsService.showCustomPrompt("创建新聊天", "请输入Ta的名字");
      if (name && name.trim()) {
        const newChatId = "chat_" + Date.now();
        const newChat = {
          id: newChatId,
          name: name.trim(),
          isGroup: false,
          settings: {
            aiPersona: "你是谁呀。",
            myPersona: "我是谁呀。",
            maxMemory: 10,
            aiAvatar: constants_default.DEFAULT_AVATAR,
            myAvatar: constants_default.DEFAULT_AVATAR,
            background: "",
            theme: "default",
            linkedWorldBookIds: [],
            aiPatSuffix: "的脑袋瓜",
            myPatSuffix: "的肩膀"
          },
          history: [],
          musicData: { totalTime: 0 }
        };
        state_default.state.chats[newChatId] = newChat;
        await database_default.db.chats.put(newChat);
        chatScreenModule.renderChatList();
      }
    });
    console.log("聊天界面事件监听器注册完成");
  }
  /**
   * 文件上传事件监听器
   */
  registerFileUploadListeners() {
    console.log("文件上传事件监听器注册完成");
  }
  /**
   * 数据管理事件监听器  
   */
  registerDataManagementListeners() {
    document.getElementById("export-data-btn")?.addEventListener("click", () => dataService.exportData());
    document.getElementById("import-data-trigger-btn")?.addEventListener("click", () => document.getElementById("import-data-input")?.click());
    document.getElementById("import-data-input")?.addEventListener("change", (event) => dataService.handleImportDataEvent(event));
    console.log("数据管理事件监听器注册完成");
  }
  /**
   * 音乐播放器事件监听器
   */
  registerMusicPlayerListeners() {
    document.getElementById("listen-together-btn")?.addEventListener("click", () => musicService.handleListenTogetherClick());
    document.getElementById("music-exit-btn")?.addEventListener("click", () => musicService.endListenTogetherSession(true));
    console.log("音乐播放器事件监听器注册完成");
  }
  /**
   * 初始化应用扩展功能
   */
  async initializeAppExtended() {
    console.log("开始初始化应用扩展功能...");
    await initializationModule.initializeApp();
    await apiSettingsScreenModule.initApiSettingsModule();
    console.log("应用扩展功能初始化完成");
  }
  /**
   * 显示初始屏幕
   */
  showInitialScreen() {
    router_default.showScreen("home-screen");
  }
  /**
   * 退出选择模式
   */
  exitSelectionMode() {
    this.selectedMessages.clear();
    document.getElementById("chat-interface-screen")?.classList.remove("selection-mode");
    document.querySelectorAll(".message-bubble.selected").forEach((bubble) => {
      bubble.classList.remove("selected");
    });
  }
}
const app = new EPhoneApplication();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    app.initialize().catch((error) => {
      console.error("❌ EPhone应用启动失败:", error);
    });
  });
} else {
  app.initialize().catch((error) => {
    console.error("❌ EPhone应用启动失败:", error);
  });
}
console.log("🎉 EPhone TypeScript应用已准备启动 - PR9完成");
