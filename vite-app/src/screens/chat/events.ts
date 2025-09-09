// 事件处理模块 - 负责DOM事件绑定、键盘事件和用户交互处理
// Phase 4: 使用统一错误处理 + 可选链委托 + 事件优化

import type { Message, Chat } from '../../state';
import DB from '../../database';
import { showError, showOperationError } from '../../services/errorHandling';

// —— 工具与辅助 ——

// 统一获取 window 并封装外部依赖访问
function getWin(): any {
  return window as any;
}

// 简化事件绑定
function on<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
): void {
  el.addEventListener(type, handler as EventListener, options);
}

// 简化选择器
function qs<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// 安全委托外部模块函数调用
async function safeCall<F extends (...args: any[]) => any>(
    fn: F | undefined,
    args: Parameters<F>,
    errMsg: string,
    onMissing?: () => void
): Promise<ReturnType<F> | void> {
  if (!fn) {
    console.error(errMsg);
    onMissing?.();
    return;
  }
  try {
    return await fn(...args);
  } catch (e) {
    console.error(errMsg, e);
    showOperationError(errMsg, e as Error);
  }
}

// 使用 rAF 优化滚动到底部
function deferScroll(containerId: string, delay = 50): void {
  const exec = () => {
    const el = qs(containerId);
    if (el) el.scrollTop = el.scrollHeight;
  };
  if ('requestAnimationFrame' in window) {
    requestAnimationFrame(() => setTimeout(exec, delay));
  } else {
    setTimeout(exec, delay);
  }
}

// —— 主模块 ——

export class EventHandlerModule {
  // 使用 Pointer Events 优先，回退 mouse/touch。避免多事件重复与泄漏
  addLongPressListener(
      element: HTMLElement,
      callback: (e: Event) => void,
      holdMs = 500
  ): void {
    let timer: number | null = null;
    let startX = 0;
    let startY = 0;
    const moveThreshold = 6; // 像素阈值：避免移动触发

    const win = getWin();

    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const start = (e: Event) => {
      if (win.getIsSelectionMode?.()) return;
      clear();

      // 记录起点
      const point =
          (e as PointerEvent).clientX !== undefined
              ? (e as PointerEvent)
              : (e as TouchEvent).touches?.[0];

      startX = point?.clientX ?? 0;
      startY = point?.clientY ?? 0;

      timer = window.setTimeout(() => {
        callback(e);
        clear();
      }, holdMs);
    };

    const cancel = () => clear();

    const maybeCancelByMove = (e: Event) => {
      const pe = e as PointerEvent;
      const te = e as TouchEvent;
      const point =
          pe.clientX !== undefined ? pe : te.touches?.[0] ?? te.changedTouches?.[0];
      if (!point) return;
      const dx = (point.clientX ?? 0) - startX;
      const dy = (point.clientY ?? 0) - startY;
      if (dx * dx + dy * dy > moveThreshold * moveThreshold) clear();
    };

    // Pointer 事件优先
    if ('onpointerdown' in window) {
      on(element, 'pointerdown', start as any, { passive: true });
      on(element, 'pointerup', cancel as any);
      on(element, 'pointerleave', cancel as any);
      on(element, 'pointercancel', cancel as any);
      on(element, 'pointermove', maybeCancelByMove as any, { passive: true });
      return;
    }

    // 回退 mouse/touch
    on(element, 'mousedown', start as any);
    on(element, 'mouseup', cancel as any);
    on(element, 'mouseleave', cancel as any);
    on(element, 'mousemove', maybeCancelByMove as any);

    on(element, 'touchstart', start as any, { passive: true });
    on(element, 'touchend', cancel as any);
    on(element, 'touchcancel', cancel as any);
    on(element, 'touchmove', maybeCancelByMove as any, { passive: true });
  }

  initListeners(): void {
    this.initSendButtonListeners();
    this.initInputListeners();
  }

  private initSendButtonListeners(): void {
    const sendBtn = qs('send-btn');
    const waitReplyBtn = qs('wait-reply-btn');

    if (sendBtn) {
      on(sendBtn, 'click', async () => {
        await this.handleSendMessage();
      });
    }

    if (waitReplyBtn) {
      on(waitReplyBtn, 'click', () => {
        this.triggerAiResponse();
        deferScroll('chat-messages', 40);
      });
    }
  }

  private initInputListeners(): void {
    const chatInput = qs<HTMLTextAreaElement>('chat-input');
    if (!chatInput) return;

    // 使用 keydown 代替已被弃用的 keypress
    on(chatInput, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        qs('send-btn')?.click();
      }
    });

    // 自适应高度：仅在高度变化时设置，rAF 降低布局抖动
    let prevHeight = chatInput.offsetHeight;
    on(chatInput, 'input', () => {
      const apply = () => {
        chatInput.style.height = 'auto';
        const next = chatInput.scrollHeight;
        if (next !== prevHeight) {
          chatInput.style.height = next + 'px';
          prevHeight = next;
        }
      };
      if ('requestAnimationFrame' in window) {
        requestAnimationFrame(apply);
      } else {
        apply();
      }
    });
  }

  private async handleSendMessage(): Promise<void> {
    const win = getWin();
    await safeCall(
        win.CHAT_MODULES?.composerModule?.handleSendMessage?.bind(win.CHAT_MODULES?.composerModule),
        [],
        '发送消息失败'
    );
  }

  private async triggerAiResponse(): Promise<void> {
    const win = getWin();
    const ok = await safeCall(
        win.SCREENS?.aiResponseModule?.triggerAiResponse?.bind(win.SCREENS?.aiResponseModule),
        [],
        'AI响应触发失败',
        () => showError('AI响应功能暂时不可用，请刷新页面重试')
    );
    return ok as any;
  }

  bindPatEvent(bubble: HTMLElement, msg: Message): void {
    on(bubble, 'dblclick', () => {
      const win = getWin();
      if (win.getIsMessageEditMode?.()) return;
      const handler =
          win.CHAT_MODULES?.eventsModule?.handlePat ?? win.handlePat?.bind(win);
      if (handler) handler(msg);
    });
  }

  bindSelectionEvent(bubble: HTMLElement, timestamp: number): void {
    on(bubble, 'click', () => {
      const win = getWin();
      if (!win.getIsSelectionMode?.()) return;
      win.toggleMessageSelection?.(timestamp);
    });
  }

  bindMessageEvents(wrapper: HTMLElement, bubble: HTMLElement, msg: Message): void {
    // 长按进入选择模式
    this.addLongPressListener(bubble, () => {
      const win = getWin();
      win.enterSelectionMode?.(msg.timestamp);
    });

    // 双击拍一拍
    this.bindPatEvent(bubble, msg);

    // 点击选择消息
    this.bindSelectionEvent(bubble, msg.timestamp);
  }

  bindChatListItemEvents(item: HTMLElement, chat: Chat): void {
    on(item, 'click', () => {
      const win = getWin();
      win.openChat?.(chat.id);
    });

    // 长按删除聊天
    this.addLongPressListener(item, async () => {
      const confirmed = await this.showCustomConfirm(
          '删除对话',
          `确定要删除与 "${chat.name}" 的整个对话吗？此操作不可撤销。`,
          { confirmButtonClass: 'btn-danger' }
      );
      if (!confirmed) return;

      const win = getWin();
      try {
        const state = win.STATE;
        // 停止音乐会话（若关联此聊天）
        const musicState = state?.musicState;
        if (musicState?.isActive && musicState.activeChatId === chat.id) {
          await win.endListenTogetherSession?.(false);
        }

        // 本地状态更新
        const prevChat = state.state.chats[chat.id];
        const prevActive = state.state.activeChatId;
        delete state.state.chats[chat.id];
        if (prevActive === chat.id) state.state.activeChatId = null;

        // DB 删除
        try {
          await DB.deleteChat(chat.id);
        } catch (dbErr) {
          // 简单回滚，保证一致性
          state.state.chats[chat.id] = prevChat;
          state.state.activeChatId = prevActive;
          throw dbErr;
        }

        // 重新渲染
        win.CHAT_MODULES?.renderModule?.renderChatList?.();
      } catch (error) {
        console.error('删除聊天失败:', error);
        showOperationError('删除聊天', error as Error);
      }
    });
  }

  bindStickerItemEvents(
      item: HTMLElement,
      sticker: { id: string; url: string; name: string }
  ): void {
    on(item, 'click', () => {
      const win = getWin();
      win.CHAT_MODULES?.composerModule?.sendSticker?.(sticker);
    });

    this.addLongPressListener(item, () => {
      const win = getWin();
      if (win.getIsSelectionMode?.()) return;

      if ((item as any)._hasDeleteBtn) return;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.type = 'button';
      deleteBtn.textContent = '×';

      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = await this.showCustomConfirm(
            '删除表情',
            `确定要删除表情 "${sticker.name}" 吗？`,
            { confirmButtonClass: 'btn-danger' }
        );
        if (!confirmed) return;

        try {
          const win2 = getWin();
          const state = win2.STATE;
          await DB.deleteUserSticker(sticker.id);
          state.state.userStickers = state.state.userStickers.filter(
              (s: any) => s.id !== sticker.id
          );
          win2.CHAT_MODULES?.composerModule?.renderStickerPanel?.();
        } catch (err) {
          showOperationError('删除表情', err as Error);
        }
      };

      (item as any)._hasDeleteBtn = true;
      item.appendChild(deleteBtn);
      deleteBtn.style.display = 'block';

      // 3秒后若鼠标离开则移除按钮，一次性监听
      setTimeout(() => {
        on(
            item,
            'mouseleave',
            () => {
              deleteBtn.remove();
              (item as any)._hasDeleteBtn = false;
            },
            { once: true }
        );
      }, 3000);
    });
  }

  bindLoadMoreButtonEvents(button: HTMLElement): void {
    on(button, 'click', () => {
      const win = getWin();
      win.CHAT_MODULES?.renderModule?.loadMoreMessages?.();
    });
  }

  private async showCustomConfirm(
      title: string,
      message: string,
      options: any = {}
  ): Promise<boolean> {
    const win = getWin();
    if (win.showCustomConfirm) {
      return win.showCustomConfirm(title, message, options);
    }
    return Promise.resolve(confirm(message));
  }
}

// 全局单例
export const eventHandlerModule = new EventHandlerModule();
export default eventHandlerModule;
