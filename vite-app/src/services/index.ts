// 服务模块统一入口 - Barrel导出模式
// 聚合所有服务模块，保持API兼容性

// === 导入所有服务模块 ===
export * from './uiUtils';
export * from './battery';
export * from './data';
export * from './music';
export * from './persona';

// === 导入服务实例 ===
import { uiUtilsService } from './uiUtils';
import { batteryService } from './battery';
import { dataService } from './data';
import { musicService } from './music';
import { personaService } from './persona';

// === 类型定义 ===
interface ModalOptions {
  confirmText?: string;
  confirmButtonClass?: string;
}

// === 服务管理器 ===
export class ServiceManager {
  public uiUtils = uiUtilsService;
  public battery = batteryService;
  public data = dataService;
  public music = musicService;
  public persona = personaService;

  // 初始化所有服务
  async initAllServices(): Promise<void> {
    // 初始化UI工具服务
    this.uiUtils.initClock();
    this.uiUtils.initModalListeners();
    
    // 初始化电池服务
    await this.battery.initBatteryManager();
    
    // 初始化人设服务
    this.persona.initPersonaPresetListeners();
    
    console.log('所有服务模块已初始化完成');
  }

  // 获取服务实例
  getService(serviceName: 'uiUtils' | 'battery' | 'data' | 'music' | 'persona') {
    return this[serviceName];
  }
}

export const serviceManager = new ServiceManager();

// === 向后兼容：导出服务实例 ===
export { uiUtilsService, batteryService, dataService, musicService, personaService };

// === 向后兼容：注入到window对象 ===
declare global {
  interface Window {
    ServiceManager: ServiceManager;
    UIService: typeof uiUtilsService;
    BatteryService: typeof batteryService;
    DataService: typeof dataService;
    MusicService: typeof musicService;
    PersonaService: typeof personaService;
    // UI工具API
    showCustomModal: () => void;
    hideCustomModal: () => void;
    showCustomConfirm: (title: string, message: string, options?: ModalOptions) => Promise<boolean>;
    showCustomAlert: (title: string, message: string) => Promise<boolean>;
    showCustomPrompt: (title: string, placeholder: string, initialValue?: string, type?: string) => Promise<string | null>;
    showNotification: (chatId: string, messageContent: string) => void;
    updateClock: () => void;
    initClock: () => void;
    openThemeListModal: (jsonUrl: string, title: string) => Promise<void>;
    closeThemeListModal: () => void;
    confirmThemeSelection: () => Promise<void>;
    // 电池API
    getBatteryStatus: () => any;
    // 数据API
    exportData: () => Promise<void>;
    importData: (file: File) => Promise<void>;
    clearAllData: () => Promise<void>;
    getDataStats: () => Promise<any>;
    // 音乐API
    togglePlayPause: () => void;
    playNext: () => void;
    playPrev: () => void;
    changePlayMode: () => void;
    addSongFromURL: () => Promise<void>;
    addSongFromLocal: (files: FileList) => Promise<void>;
    startListenTogetherSession: (chatId: string) => Promise<void>;
    endListenTogetherSession: () => Promise<void>;
    // 人设API
    openPersonaLibrary: () => Promise<void>;
    closePersonaLibrary: () => void;
    savePersonaPreset: () => Promise<void>;
    applyPersonaPreset: (preset: any) => Promise<void>;
    openMemberEditor: (chatId: string, memberId: string) => Promise<void>;
  }
}

// 全局注入函数（在init模块中调用）
export function injectServicesToWindow(): void {
  const win = window as any;
  
  // 注入服务管理器
  win.ServiceManager = serviceManager;
  win.UIService = uiUtilsService;
  win.BatteryService = batteryService;
  win.DataService = dataService;
  win.MusicService = musicService;
  win.PersonaService = personaService;
  
  // 注入UI工具API
  win.showCustomModal = () => uiUtilsService.showCustomModal();
  win.hideCustomModal = () => uiUtilsService.hideCustomModal();
  win.showCustomConfirm = (title: string, message: string, options?: ModalOptions) => 
    uiUtilsService.showCustomConfirm(title, message, options);
  win.showCustomAlert = (title: string, message: string) => 
    uiUtilsService.showCustomAlert(title, message);
  win.showCustomPrompt = (title: string, placeholder: string, initialValue = '', type = 'text') => 
    uiUtilsService.showCustomPrompt(title, placeholder, initialValue, type);
  win.showNotification = (chatId: string, messageContent: string) => 
    uiUtilsService.showNotification(chatId, messageContent);
  win.updateClock = () => uiUtilsService.updateClock();
  win.initClock = () => uiUtilsService.initClock();
  win.openThemeListModal = (jsonUrl: string, title: string) => 
    uiUtilsService.openThemeListModal(jsonUrl, title);
  win.closeThemeListModal = () => uiUtilsService.closeThemeListModal();
  win.confirmThemeSelection = () => uiUtilsService.confirmThemeSelection();
  
  // 注入电池API
  win.getBatteryStatus = () => batteryService.getBatteryStatus();
  
  // 注入数据API
  win.exportData = () => dataService.exportData();
  win.importData = (file: File) => dataService.importData(file);
  win.clearAllData = () => dataService.clearAllData();
  win.getDataStats = () => dataService.getDataStats();
  
  // 注入音乐API
  win.togglePlayPause = () => musicService.togglePlayPause();
  win.playNext = () => musicService.playNext();
  win.playPrev = () => musicService.playPrev();
  win.changePlayMode = () => musicService.changePlayMode();
  win.addSongFromURL = () => musicService.addSongFromURL();
  win.addSongFromLocal = (files: FileList) => musicService.addSongFromLocal(files);
  win.startListenTogetherSession = (chatId: string) => musicService.startListenTogetherSession(chatId);
  win.endListenTogetherSession = () => musicService.endListenTogetherSession();
  
  // 注入人设API
  win.openPersonaLibrary = () => personaService.openPersonaLibrary();
  win.closePersonaLibrary = () => personaService.closePersonaLibrary();
  win.savePersonaPreset = () => personaService.savePersonaPreset();
  win.applyPersonaPreset = (preset: any) => personaService.applyPersonaPreset(preset);
  win.openMemberEditor = (chatId: string, memberId: string) => 
    personaService.openMemberEditor(chatId, memberId);
}

// === 默认导出 ===
export default {
  uiUtils: uiUtilsService,
  battery: batteryService,
  data: dataService,
  music: musicService,
  persona: personaService,
  manager: serviceManager
};