// UI工具服务 - 模态框、通知、时钟等UI辅助功能
// 从services/index.ts中提取的UIUtilsService类

import type { GlobalSettings, Chat } from '../state';

// === 类型定义 ===
interface ModalOptions {
  confirmText?: string;
  confirmButtonClass?: string;
}

interface StateManager {
  state: {
    chats: Record<string, Chat>;
    activeChatId: string | null;
    globalSettings: GlobalSettings;
  };
}

interface DatabaseManager {
  db: any; // Dexie数据库实例
}

export class UIUtilsService {
  private modalResolve: ((value: any) => void) | null = null;
  private notificationTimeout: number | null = null;

  // 显示自定义模态框
  showCustomModal(): void {
    const modalOverlay = document.getElementById('custom-modal-overlay');
    if (modalOverlay) {
      modalOverlay.classList.add('visible');
    }
  }

  hideCustomModal(): void {
    const modalOverlay = document.getElementById('custom-modal-overlay');
    const modalConfirmBtn = document.getElementById('custom-modal-confirm');
    
    if (modalOverlay) {
      modalOverlay.classList.remove('visible');
    }
    if (modalConfirmBtn) {
      modalConfirmBtn.classList.remove('btn-danger');
    }
    if (this.modalResolve) {
      this.modalResolve(null);
    }
  }

  // 显示确认对话框
  showCustomConfirm(title: string, message: string, options: ModalOptions = {}): Promise<boolean> {
    return new Promise(resolve => {
      this.modalResolve = resolve;
      
      const modalTitle = document.getElementById('custom-modal-title');
      const modalBody = document.getElementById('custom-modal-body');
      const modalCancelBtn = document.getElementById('custom-modal-cancel');
      const modalConfirmBtn = document.getElementById('custom-modal-confirm');
      
      if (!modalTitle || !modalBody || !modalCancelBtn || !modalConfirmBtn) {
        console.error('Modal elements not found');
        resolve(false);
        return;
      }
      
      modalTitle.textContent = title;
      modalBody.innerHTML = `<p>${message}</p>`;
      modalCancelBtn.style.display = 'block';
      modalConfirmBtn.textContent = options.confirmText || '确定';
      
      if (options.confirmButtonClass) {
        modalConfirmBtn.classList.add(options.confirmButtonClass);
      }
      
      modalConfirmBtn.onclick = () => {
        resolve(true);
        this.hideCustomModal();
      };
      
      modalCancelBtn.onclick = () => {
        resolve(false);
        this.hideCustomModal();
      };
      
      this.showCustomModal();
    });
  }

  showCustomAlert(title: string, message: string): Promise<boolean> {
    return new Promise(resolve => {
      this.modalResolve = resolve;
      
      const modalTitle = document.getElementById('custom-modal-title');
      const modalBody = document.getElementById('custom-modal-body');
      const modalCancelBtn = document.getElementById('custom-modal-cancel');
      const modalConfirmBtn = document.getElementById('custom-modal-confirm');
      
      if (!modalTitle || !modalBody || !modalCancelBtn || !modalConfirmBtn) {
        console.error('Modal elements not found');
        resolve(true);
        return;
      }
      
      modalTitle.textContent = title;
      modalBody.innerHTML = `<p style="text-align: left; white-space: pre-wrap;">${message}</p>`;
      modalCancelBtn.style.display = 'none';
      modalConfirmBtn.textContent = '好的';
      
      modalConfirmBtn.onclick = () => {
        modalCancelBtn.style.display = 'block';
        modalConfirmBtn.textContent = '确定';
        resolve(true);
        this.hideCustomModal();
      };
      
      this.showCustomModal();
    });
  }

  showCustomPrompt(title: string, placeholder: string, initialValue = '', type = 'text'): Promise<string | null> {
    return new Promise(resolve => {
      this.modalResolve = resolve;
      
      const modalTitle = document.getElementById('custom-modal-title');
      const modalBody = document.getElementById('custom-modal-body');
      const modalConfirmBtn = document.getElementById('custom-modal-confirm');
      const modalCancelBtn = document.getElementById('custom-modal-cancel');
      
      if (!modalTitle || !modalBody || !modalConfirmBtn || !modalCancelBtn) {
        console.error('Modal elements not found');
        resolve(null);
        return;
      }
      
      modalTitle.textContent = title;
      modalBody.innerHTML = `<input type="${type}" id="custom-prompt-input" placeholder="${placeholder}" value="${initialValue}">`;
      
      const input = document.getElementById('custom-prompt-input') as HTMLInputElement;
      modalConfirmBtn.textContent = '确定';
      
      modalConfirmBtn.onclick = () => {
        resolve(input ? input.value : null);
        this.hideCustomModal();
      };
      
      modalCancelBtn.onclick = () => {
        resolve(null);
        this.hideCustomModal();
      };
      
      this.showCustomModal();
      
      // Focus input after modal is shown
      setTimeout(() => {
        if (input) input.focus();
      }, 100);
    });
  }

  // 通知管理
  showNotification(chatId: string, messageContent: string): void {
    const win = window as any;
    const state: StateManager = win.STATE;
    if (!state?.state || !state.state.chats[chatId]) return;
    
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }
    const chat = state.state.chats[chatId];
    const bar = document.getElementById('notification-bar');
    
    if (!bar) return;
    
    const avatar = document.getElementById('notification-avatar') as HTMLImageElement;
    const nameEl = document.getElementById('notification-content')?.querySelector('.name');
    const messageEl = document.getElementById('notification-content')?.querySelector('.message');
    
    if (avatar) {
      const constants = win.CONSTANTS;
      const defaultAvatar = constants?.DEFAULT_AVATAR || 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
      avatar.src = chat.settings.aiAvatar || chat.settings.groupAvatar || defaultAvatar;
    }
    
    if (nameEl) nameEl.textContent = chat.name;
    if (messageEl) messageEl.textContent = messageContent;
    
    const newBar = bar.cloneNode(true) as HTMLElement;
    bar.parentNode?.replaceChild(newBar, bar);
    
    newBar.addEventListener('click', () => {
      const chatModule = win.ChatModule;
      if (chatModule?.openChat) {
        chatModule.openChat(chatId);
      }
      newBar.classList.remove('visible');
    });
    
    newBar.classList.add('visible');
    this.notificationTimeout = window.setTimeout(() => {
      newBar.classList.remove('visible');
    }, 4000);
  }

  // 时钟管理
  updateClock(): void {
    const now = new Date();
    const timeString = now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
    const dateString = now.toLocaleDateString('zh-CN', {weekday: 'long', month: 'long', day: 'numeric'});
    
    const mainTime = document.getElementById('main-time');
    const statusBarTime = document.getElementById('status-bar-time');
    const mainDate = document.getElementById('main-date');
    
    if (mainTime) mainTime.textContent = timeString;
    if (statusBarTime) statusBarTime.textContent = timeString;
    if (mainDate) mainDate.textContent = dateString;
  }

  // 初始化时钟（定期更新）
  initClock(): void {
    this.updateClock();
    setInterval(() => this.updateClock(), 1000 * 30); // 每30秒更新一次
  }

  // 主题列表模态框管理
  closeThemeListModal(): void {
    const themeListModal = document.getElementById('theme-list-modal');
    const themeListContainer = document.getElementById('theme-list-container');
    
    if (themeListModal) {
      themeListModal.classList.remove('visible');
    }
    if (themeListContainer) {
      themeListContainer.innerHTML = ''; // 关闭时清空内容
    }
  }

  async openThemeListModal(jsonUrl: string, title: string): Promise<void> {
    const themeListModal = document.getElementById('theme-list-modal');
    const themeListModalTitle = document.getElementById('theme-list-modal-title');
    const themeListContainer = document.getElementById('theme-list-container');
    
    if (!themeListModal || !themeListContainer) return;
    
    if (themeListModalTitle) {
      themeListModalTitle.textContent = title;
    }
    
    themeListModal.classList.add('visible');
    themeListContainer.innerHTML = '<p>正在加载主题列表...</p>';
    
    try {
      const response = await fetch(jsonUrl);
      if (!response.ok) {
        throw new Error(`网络请求失败: ${response.status}`);
      }
      
      const themes = await response.json();
      if (!Array.isArray(themes) || themes.length === 0) {
        themeListContainer.innerHTML = '<p>未找到有效的主题或列表为空。</p>';
        return;
      }
      
      themeListContainer.innerHTML = ''; // 清空加载提示
      themes.forEach((theme: any, index: number) => {
        const themeId = `theme-option-${index}`;
        const themeItem = document.createElement('div');
        themeItem.className = 'theme-item';
        themeItem.innerHTML = `
          <div class="theme-item-header">
              <input type="radio" id="${themeId}" name="theme-selection" value="${theme.css_url}">
              <label for="${themeId}">${theme.description || '无标题'}</label>
          </div>
          <div class="theme-item-details">
              <span>作者: ${theme.author || '未知'}</span>
              <span>版本: ${theme.version || '未知'}</span>
          </div>
          <p class="theme-item-remark">${theme.remark || '无备注'}</p>
        `;
        themeListContainer.appendChild(themeItem);
      });
    } catch (error: any) {
      console.error("加载主题列表失败:", error);
      themeListContainer.innerHTML = `<p style="color: red;">加载失败: ${error.message}</p>`;
    }
  }

  async confirmThemeSelection(): Promise<void> {
    const selectedRadio = document.querySelector('input[name="theme-selection"]:checked') as HTMLInputElement;
    if (!selectedRadio) {
      alert('请先选择一个主题！');
      return;
    }
    
    const url = selectedRadio.value;
    const stylesheet = document.getElementById('main-stylesheet') as HTMLLinkElement;
    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    
    // 应用主题
    if (stylesheet) {
      if (url && url.trim() !== '') {
        stylesheet.href = url + '?v=' + Date.now();
      } else {
        stylesheet.href = './unified-style.css';
      }
    }
    
    // 保存主题设置
    if (state?.state && db?.db) {
      state.state.globalSettings.remoteThemeUrl = url;
      await db.db.globalSettings.put(state.state.globalSettings);
    }
    
    this.showCustomAlert("主题已更新", "新主题已应用并保存。");
    this.closeThemeListModal();
  }

  // 初始化模态框事件监听器
  initModalListeners(): void {
    const modalCancelBtn = document.getElementById('custom-modal-cancel');
    const modalOverlay = document.getElementById('custom-modal-overlay');
    
    if (modalCancelBtn) {
      modalCancelBtn.addEventListener('click', () => this.hideCustomModal());
    }
    
    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
          this.hideCustomModal();
        }
      });
    }
  }
}

// 导出服务实例
export const uiUtilsService = new UIUtilsService();