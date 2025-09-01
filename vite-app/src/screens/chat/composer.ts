// 消息编写模块 - 负责文本消息发送、命令解析、AI回复触发和群聊逻辑
// 提取自 chat.ts 的消息编写相关功能
// Phase 2+4: 使用DB仓库访问 + 统一错误处理

import type { Chat, Message, GlobalSettings, ApiConfig, Preset } from '../../state';
import DB from '../../database';
import { showError, showValidationError, showOperationError } from '../../services/errorHandling';

// === 类型定义 ===
interface Constants {
  STICKER_REGEX: RegExp;
}

interface StateManager {
  state: {
    chats: Record<string, Chat>;
    activeChatId: string | null;
    globalSettings: GlobalSettings;
    apiConfig: ApiConfig;
    presets: Preset[];
    worldBooks: Array<{ id: string; name: string; content: string }>;
    userStickers: Array<{ id: string; url: string; name: string }>;
  };
  musicState: any;
  myAddress: string;
  setActiveChatId: (chatId: string) => void;
  getActivePreset: () => Preset | undefined;
}

interface DatabaseManager {
  db: {
    chats: {
      put: (chat: Chat) => Promise<void>;
      delete: (chatId: string) => Promise<void>;
    };
    userStickers: {
      delete: (stickerId: string) => Promise<void>;
    };
  };
}

// === 消息编写模块类 ===
export class MessageComposerModule {
  // 处理发送消息逻辑
  async handleSendMessage(): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
    
    if (!chatInput || !state || !db) return;
    
    const content = chatInput.value.trim();
    if (!content || !state.state.activeChatId) return;
    
    const chat = state.state.chats[state.state.activeChatId];
    if (!chat) return;
    
    const msg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      role: 'user',
      content,
      timestamp: Date.now()
    };
    
    // 添加消息到聊天历史
    chat.history.push(msg);
    // Phase 2: 使用DB仓库替换直接Dexie调用
    await DB.saveChat(chat);
    
    // 渲染消息并更新界面
    if (win.CHAT_MODULES?.renderModule?.appendMessage) {
      win.CHAT_MODULES.renderModule.appendMessage(msg, chat);
    }
    if (win.CHAT_MODULES?.renderModule?.renderChatList) {
      win.CHAT_MODULES.renderModule.renderChatList();
    }
    
    // 清空输入框并重置高度
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatInput.focus();
  }

  // 拍一拍功能
  async handlePat(msg: Message): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    
    if ((win.getIsSelectionMode && win.getIsSelectionMode()) || !state?.state?.activeChatId) return;
    
    const chat = state.state.chats[state.state.activeChatId];
    const patterName = chat.isGroup ? (chat.settings.myGroupNickname || '我') : '你';
    let patteeName: string, patteeSuffix: string;

    if (msg.role === 'user') {
      patteeName = chat.isGroup ? `自己` : '自己';
      patteeSuffix = chat.settings.myPatSuffix || '';
    } else { // 'assistant' role
      if (chat.isGroup) {
        const member = chat.members?.find(m => m.name === msg.senderName);
        patteeName = `"${msg.senderName}"`;
        patteeSuffix = member ? (member.patSuffix || '') : '';
      } else {
        patteeName = `"${chat.name}"`;
        patteeSuffix = chat.settings.aiPatSuffix || '';
      }
    }

    // If patter and pattee are the same in a group chat, adjust the name
    if (chat.isGroup && msg.role === 'user' && chat.settings.myGroupNickname === msg.senderName) {
      patteeName = '自己';
    }

    const patMessageContent = `${patterName}拍了拍${patteeName}${patteeSuffix || ''}`;

    const patMessage: Message = {
      id: Date.now().toString(),
      sender: 'user',
      type: 'pat',
      content: patMessageContent,
      timestamp: Date.now(),
      role: 'user'
    };

    chat.history.push(patMessage);
    await DB.saveChat(chat);
    
    if (win.CHAT_MODULES?.renderModule?.appendMessage) {
      win.CHAT_MODULES.renderModule.appendMessage(patMessage, chat);
    }
  }

  // AI响应解析
  parseAiResponse(content: string): string[] {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // JSON解析失败，继续尝试其他方法
    }
    
    try {
      const match = content.match(/\[(.*?)\]/s);
      if (match && match[0]) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      // 正则匹配JSON解析失败
    }
    
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('```'));
    if (lines.length > 0) return lines;
    
    return [content];
  }

  // AI响应触发 - 委托给专用的AI响应模块
  async triggerAiResponse(): Promise<void> {
    const win = window as any;
    console.log('Composer模块：委托给AI响应模块处理');
    
    // 使用专用的AI响应模块处理所有逻辑
    if (win.SCREENS?.aiResponseModule?.triggerAiResponse) {
      return await win.SCREENS.aiResponseModule.triggerAiResponse();
    } else {
      console.error('AI响应模块未找到，请检查模块加载');
      showError('AI响应功能暂时不可用，请刷新页面重试');
    }
  }

  // 表情包面板渲染
  renderStickerPanel(): void {
    const win = window as any;
    const state: StateManager = win.STATE;
    if (!state?.state) return;
    
    const grid = document.getElementById('sticker-grid');
    if (!grid) return;
    
    // 安全：清空表情包网格内容
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }
    
    if (state.state.userStickers.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-secondary)';
      emptyMsg.style.gridColumn = '1 / -1';
      emptyMsg.textContent = '大人请点击右上角"添加"或"上传"来添加你的第一个表情吧！';
      grid.appendChild(emptyMsg);
      return;
    }
    
    state.state.userStickers.forEach(sticker => {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      item.style.backgroundImage = `url(${sticker.url})`;
      item.title = sticker.name;
      
      // 绑定事件
      if (win.CHAT_MODULES?.eventsModule?.bindStickerItemEvents) {
        win.CHAT_MODULES.eventsModule.bindStickerItemEvents(item, sticker);
      }
      
      grid.appendChild(item);
    });
  }

  // 发送表情
  async sendSticker(sticker: { id: string; url: string; name: string }): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    
    if (!state?.state?.activeChatId) return;
    
    const chat = state.state.chats[state.state.activeChatId];
    const msg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      role: 'user', 
      content: sticker.url, 
      meaning: sticker.name, 
      timestamp: Date.now()
    };
    
    chat.history.push(msg);
    await DB.saveChat(chat);
    
    if (win.CHAT_MODULES?.renderModule?.appendMessage) {
      win.CHAT_MODULES.renderModule.appendMessage(msg, chat);
    }
    if (win.CHAT_MODULES?.renderModule?.renderChatList) {
      win.CHAT_MODULES.renderModule.renderChatList();
    }
    
    const stickerPanel = document.getElementById('sticker-panel');
    if (stickerPanel) {
      stickerPanel.classList.remove('visible');
    }
  }

  // 发送用户转账
  async sendUserTransfer(): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    
    if (!state?.state?.activeChatId) return;
    
    const amountInput = document.getElementById('transfer-amount') as HTMLInputElement;
    const noteInput = document.getElementById('transfer-note') as HTMLInputElement;
    
    if (!amountInput || !noteInput) return;
    
    const amount = parseFloat(amountInput.value);
    const note = noteInput.value.trim();
    
    if (isNaN(amount) || amount < 0 || amount > 9999) {
      showValidationError('请输入有效的金额 (0 到 9999 之间)');
      return;
    }
    
    const chat = state.state.chats[state.state.activeChatId];
    const senderName = chat.isGroup ? (chat.settings.myGroupNickname || '我') : '我';
    const receiverName = chat.isGroup ? '群聊' : chat.name;
    
    const msg: Message = {
      role: 'user',
      type: 'transfer',
      content: '',
      senderName,
      receiverName,
      timestamp: Date.now()
    } as any;

    // 添加转账特定属性
    (msg as any).amount = amount;
    (msg as any).note = note;
    
    chat.history.push(msg);
    await DB.saveChat(chat);
    
    if (win.CHAT_MODULES?.renderModule?.appendMessage) {
      win.CHAT_MODULES.renderModule.appendMessage(msg, chat);
    }
    if (win.CHAT_MODULES?.renderModule?.renderChatList) {
      win.CHAT_MODULES.renderModule.renderChatList();
    }
    
    const transferModal = document.getElementById('transfer-modal');
    if (transferModal) {
      transferModal.classList.remove('visible');
    }
    
    amountInput.value = '';
    noteInput.value = '';
  }

  // 消息编辑模式管理
  async exitMessageEditMode(shouldSave = false): Promise<void> {
    const win = window as any;
    if (!(win.getIsMessageEditMode && win.getIsMessageEditMode())) return;

    const editBtnImg = document.querySelector('#edit-messages-btn img') as HTMLImageElement;
    if (editBtnImg) {
      editBtnImg.src = 'https://i.postimg.cc/V60TWbGr/image.png'; // Edit icon
      editBtnImg.alt = '编辑';
    }
    
    const editBtn = document.querySelector('#edit-messages-btn') as HTMLElement;
    if (editBtn) {
      editBtn.title = '编辑消息';
    }

    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    let changesMade = false;

    if (shouldSave && state?.state && db) {
      const chat = state.state.chats[state.state.activeChatId!];
      if (chat) {
        document.querySelectorAll('.message-bubble .content.editable').forEach(contentEl => {
          const timestamp = parseInt((contentEl.closest('.message-bubble') as HTMLElement).dataset.timestamp!, 10);
          const newContent = (contentEl as HTMLElement).textContent || '';

          const message = chat.history.find(msg => msg.timestamp === timestamp);
          if (message && message.content !== newContent) {
            message.content = newContent;
            changesMade = true;
          }
        });

        if (changesMade) {
          await DB.saveChat(chat);
          if (win.showCustomAlert) {
            win.showCustomAlert('保存成功', '消息已更新。');
          }
        }
      }
    }

    document.querySelectorAll('.message-bubble .content.editable').forEach(contentEl => {
      (contentEl as HTMLElement).contentEditable = 'false';
      contentEl.classList.remove('editable');
    });

    // 通知状态变更
    if (win.setIsMessageEditMode) {
      win.setIsMessageEditMode(false);
    }
  }

  enterMessageEditMode(): void {
    const win = window as any;
    if (win.getIsMessageEditMode && win.getIsMessageEditMode()) return;

    const editBtnImg = document.querySelector('#edit-messages-btn img') as HTMLImageElement;
    if (editBtnImg) {
      editBtnImg.src = 'https://i.postimg.cc/GtrQTBZ1/image.png';
      editBtnImg.alt = '保存';
    }
    
    const editBtn = document.querySelector('#edit-messages-btn') as HTMLElement;
    if (editBtn) {
      editBtn.title = '保存编辑';
    }

    document.querySelectorAll('.message-bubble:not(.system-message-container) .content').forEach(contentEl => {
      const bubble = contentEl.closest('.message-bubble');
      if (bubble && 
          !bubble.classList.contains('is-sticker') &&
          !bubble.classList.contains('is-voice-message') &&
          !bubble.classList.contains('is-transfer') &&
          !bubble.classList.contains('is-ai-image') &&
          !bubble.classList.contains('has-image')) {
        (contentEl as HTMLElement).contentEditable = 'true';
        contentEl.classList.add('editable');
      }
    });
    
    // 通知状态变更
    if (win.setIsMessageEditMode) {
      win.setIsMessageEditMode(true);
    }
    
    if (win.showCustomAlert) {
      win.showCustomAlert('进入编辑模式', '您现在可以点击消息气泡来编辑其内容。完成后，请再次点击"保存"按钮。');
    }
  }

  async toggleMessageEditMode(): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    if (!state?.state?.activeChatId) return;

    if (win.getIsMessageEditMode && win.getIsMessageEditMode()) {
      await this.exitMessageEditMode(true); // Exit and save
    } else {
      this.enterMessageEditMode(); // Enter
    }
  }
}

// === 全局单例实例 ===
export const messageComposerModule = new MessageComposerModule();

// === 默认导出 ===
export default messageComposerModule;