// 事件处理模块 - 负责DOM事件绑定、键盘事件和用户交互处理
// 提取自 chat.ts 的事件处理相关功能
// Phase 4: 使用统一错误处理

import type { Message, Chat } from '../../state';
import DB from '../../database';
import { showError, showOperationError } from '../../services/errorHandling';

// === 事件处理模块类 ===
export class EventHandlerModule {
  // 长按监听器
  addLongPressListener(element: HTMLElement, callback: (e: Event) => void): void {
    let pressTimer: number;
    const startPress = (e: Event) => {
      const win = window as any;
      if (win.getIsSelectionMode && win.getIsSelectionMode()) return;
      pressTimer = window.setTimeout(() => callback(e), 500);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    element.addEventListener('mousedown', startPress);
    element.addEventListener('mouseup', cancelPress);
    element.addEventListener('mouseleave', cancelPress);
    element.addEventListener('touchstart', startPress, {passive: true});
    element.addEventListener('touchend', cancelPress);
    element.addEventListener('touchmove', cancelPress);
  }

  // 初始化聊天模块事件监听器
  initListeners(): void {
    this.initSendButtonListeners();
    this.initInputListeners();
  }

  // 初始化发送按钮监听器
  private initSendButtonListeners(): void {
    const sendBtn = document.getElementById('send-btn');
    const waitReplyBtn = document.getElementById('wait-reply-btn');
    
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        await this.handleSendMessage();
      });
    }
    
    if (waitReplyBtn) {
      waitReplyBtn.addEventListener('click', () => {
        this.triggerAiResponse();
        setTimeout(() => {
          const messagesContainer = document.getElementById('chat-messages');
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }, 50);
      });
    }
  }

  // 初始化输入框监听器
  private initInputListeners(): void {
    const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
    
    if (chatInput) {
      // 回车发送消息
      chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const sendBtn = document.getElementById('send-btn');
          if (sendBtn) {
            sendBtn.click();
          }
        }
      });
      
      // 自动调整输入框高度
      chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
      });
    }
  }

  // 处理发送消息逻辑
  private async handleSendMessage(): Promise<void> {
    const win = window as any;
    
    // 委托给消息编写模块处理
    if (win.CHAT_MODULES?.composerModule?.handleSendMessage) {
      return await win.CHAT_MODULES.composerModule.handleSendMessage();
    } else {
      console.error('消息编写模块未找到，请检查模块加载');
    }
  }

  // AI响应触发 - 委托给专用的AI响应模块
  private async triggerAiResponse(): Promise<void> {
    const win = window as any;
    console.log('事件模块：委托给AI响应模块处理');
    
    // 使用专用的AI响应模块处理所有逻辑
    if (win.SCREENS?.aiResponseModule?.triggerAiResponse) {
      return await win.SCREENS.aiResponseModule.triggerAiResponse();
    } else {
      console.error('AI响应模块未找到，请检查模块加载');
      showError('AI响应功能暂时不可用，请刷新页面重试');
    }
  }

  // 拍一拍功能处理事件绑定
  bindPatEvent(bubble: HTMLElement, msg: Message): void {
    bubble.addEventListener('dblclick', () => {
      const win = window as any;
      // 编辑模式下禁止拍一拍
      if (win.getIsMessageEditMode && win.getIsMessageEditMode()) return;
      
      // 委托给事件处理模块
      if (win.CHAT_MODULES?.eventsModule?.handlePat) {
        win.CHAT_MODULES.eventsModule.handlePat(msg);
      } else if (win.handlePat) {
        win.handlePat(msg);
      }
    });
  }

  // 选择模式点击事件绑定
  bindSelectionEvent(bubble: HTMLElement, timestamp: number): void {
    bubble.addEventListener('click', () => {
      const win = window as any;
      if (win.getIsSelectionMode && win.getIsSelectionMode()) {
        if (win.toggleMessageSelection) {
          win.toggleMessageSelection(timestamp);
        }
      }
    });
  }

  // 为消息元素绑定所有必要的事件
  bindMessageEvents(wrapper: HTMLElement, bubble: HTMLElement, msg: Message): void {
    // 长按进入选择模式
    this.addLongPressListener(bubble, () => {
      const win = window as any;
      if (win.enterSelectionMode) {
        win.enterSelectionMode(msg.timestamp);
      }
    });

    // 双击拍一拍
    this.bindPatEvent(bubble, msg);

    // 点击选择消息
    this.bindSelectionEvent(bubble, msg.timestamp);
  }

  // 聊天列表项事件绑定
  bindChatListItemEvents(item: HTMLElement, chat: Chat): void {
    // 点击打开聊天
    item.addEventListener('click', async () => {
      const win = window as any;
      if (win.openChat) {
        win.openChat(chat.id);
      }
    });
    
    // 长按删除聊天
    this.addLongPressListener(item, async (e) => {
      const confirmed = await this.showCustomConfirm('删除对话', `确定要删除与 "${chat.name}" 的整个对话吗？此操作不可撤销。`, {confirmButtonClass: 'btn-danger'});
      if (confirmed) {
        try {
          const win = window as any;
          const state = win.STATE;
          
          // 检查音乐状态
          const musicState = state.musicState;
          if (musicState?.isActive && musicState.activeChatId === chat.id) {
            if (win.endListenTogetherSession) {
              await win.endListenTogetherSession(false);
            }
          }
          
          // 删除聊天
          delete state.state.chats[chat.id];
          if (state.state.activeChatId === chat.id) state.state.activeChatId = null;
          await DB.deleteChat(chat.id);
          
          // 重新渲染列表
          if (win.CHAT_MODULES?.renderModule?.renderChatList) {
            win.CHAT_MODULES.renderModule.renderChatList();
          }
        } catch (error) {
          console.error("删除聊天失败:", error);
          showOperationError("删除聊天", error as Error);
        }
      }
    });
  }

  // 表情包项事件绑定
  bindStickerItemEvents(item: HTMLElement, sticker: { id: string; url: string; name: string }): void {
    // 点击发送表情
    item.addEventListener('click', () => {
      const win = window as any;
      if (win.CHAT_MODULES?.composerModule?.sendSticker) {
        win.CHAT_MODULES.composerModule.sendSticker(sticker);
      }
    });
    
    // 长按显示删除按钮
    this.addLongPressListener(item, () => {
      const win = window as any;
      if (win.getIsSelectionMode && win.getIsSelectionMode()) return;
      
      const existingDeleteBtn = item.querySelector('.delete-btn');
      if (existingDeleteBtn) return;
      
      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = '×';
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = await this.showCustomConfirm('删除表情', `确定要删除表情 "${sticker.name}" 吗？`, {confirmButtonClass: 'btn-danger'});
        if (confirmed) {
          const state = win.STATE;
          await DB.deleteUserSticker(sticker.id);
          state.state.userStickers = state.state.userStickers.filter((s: any) => s.id !== sticker.id);
          
          // 重新渲染表情面板
          if (win.CHAT_MODULES?.composerModule?.renderStickerPanel) {
            win.CHAT_MODULES.composerModule.renderStickerPanel();
          }
        }
      };
      item.appendChild(deleteBtn);
      deleteBtn.style.display = 'block';
      setTimeout(() => item.addEventListener('mouseleave', () => deleteBtn.remove(), {once: true}), 3000);
    });
  }

  // 加载更多按钮事件绑定
  bindLoadMoreButtonEvents(button: HTMLElement): void {
    button.addEventListener('click', () => {
      const win = window as any;
      if (win.CHAT_MODULES?.renderModule?.loadMoreMessages) {
        win.CHAT_MODULES.renderModule.loadMoreMessages();
      }
    });
  }

  // 辅助函数
  private async showCustomConfirm(title: string, message: string, options: any = {}): Promise<boolean> {
    const win = window as any;
    if (win.showCustomConfirm) {
      return win.showCustomConfirm(title, message, options);
    }
    return confirm(message);
  }
}

// === 全局单例实例 ===
export const eventHandlerModule = new EventHandlerModule();

// === 默认导出 ===
export default eventHandlerModule;