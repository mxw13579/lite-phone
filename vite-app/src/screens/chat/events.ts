import type { Message, Chat } from '../../state';
import DB from '../../database';
import { showError, showOperationError } from '../../services/errorHandling';

// —— 常量与工具 ——
const WIN: Window & typeof globalThis = window;
const raf =
    WIN.requestAnimationFrame?.bind(WIN) ??
    ((cb: FrameRequestCallback) => setTimeout(cb, 16) as unknown as number);
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

const LONG_PRESS_MS_DEFAULT = 500;
const MOVE_THRESHOLD_PX = 6;
const MOVE_THRESHOLD_SQ = MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX;
const SCROLL_DEFER_DELAY = 40;

// 事件绑定：返回解绑函数
function on<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions
): () => void {
  el.addEventListener(type, handler as EventListener, options);
  return () => el.removeEventListener(type, handler as EventListener, options);
}

// 简化选择器
function qs<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

// 宽松 safeCall：避免 @ts-expect-error，使用 unknown 函数类型检查
async function safeCall(
    host: unknown,
    key: string,
    errMsg: string,
    args: unknown[] = [],
    onMissing?: () => void
): Promise<unknown> {
  if (!host || typeof (host as any)[key] !== 'function') {
    console.error(errMsg);
    onMissing?.();
    return;
  }
  const fn: Function = (host as any)[key];
  try {
    return await fn.apply(host, args);
  } catch (e) {
    console.error(errMsg, e);
    showOperationError(errMsg, e as Error);
  }
}

// rAF 优化滚动
function deferScroll(containerId: string, delay = SCROLL_DEFER_DELAY): void {
  const exec = () => {
    const el = qs(containerId);
    if (el) el.scrollTop = el.scrollHeight;
  };
  raf(() => {
    if (delay > 0) setTimeout(exec, delay);
    else exec();
  });
}

// 统一坐标
function getPoint(e: Event): { x: number; y: number } | null {
  const anyE = e as any;
  if (typeof anyE.clientX === 'number' && typeof anyE.clientY === 'number') {
    return { x: anyE.clientX, y: anyE.clientY };
  }
  const te = e as TouchEvent;
  const t = te.touches?.[0] ?? te.changedTouches?.[0];
  if (t) return { x: t.clientX, y: t.clientY };
  return null;
}

const isPointerSupported = 'onpointerdown' in WIN;

// —— 主模块 ——
export class EventHandlerModule {
  addLongPressListener(
      element: HTMLElement,
      callback: (e: Event) => void,
      holdMs = LONG_PRESS_MS_DEFAULT
  ): () => void {
    let timer: number | null = null;
    let startX = 0;
    let startY = 0;
    let startTs = 0;

    const clearTimer = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const start = (e: Event) => {
      if ((WIN as any).getIsSelectionMode?.()) return;
      clearTimer();
      const p = getPoint(e);
      startX = p?.x ?? 0;
      startY = p?.y ?? 0;
      startTs = now();
      timer = WIN.setTimeout(() => {
        callback(e);
        clearTimer();
      }, holdMs);
    };

    const cancel = () => clearTimer();

    const maybeCancelByMove = (e: Event) => {
      const p = getPoint(e);
      if (!p) return;
      const dx = p.x - startX;
      const dy = p.y - startY;
      if (dx * dx + dy * dy > MOVE_THRESHOLD_SQ) clearTimer();
      if (now() - startTs < 40) clearTimer();
    };

    const unbinders: Array<() => void> = [];
    if (isPointerSupported) {
      unbinders.push(
          on(element, 'pointerdown', start as any, { passive: true }),
          on(element, 'pointerup', cancel as any),
          on(element, 'pointerleave', cancel as any),
          on(element, 'pointercancel', cancel as any),
          on(element, 'pointermove', maybeCancelByMove as any, { passive: true })
      );
    } else {
      unbinders.push(
          on(element, 'mousedown', start as any),
          on(element, 'mouseup', cancel as any),
          on(element, 'mouseleave', cancel as any),
          on(element, 'mousemove', maybeCancelByMove as any),
          on(element, 'touchstart', start as any, { passive: true }),
          on(element, 'touchend', cancel as any),
          on(element, 'touchcancel', cancel as any),
          on(element, 'touchmove', maybeCancelByMove as any, { passive: true })
      );
    }

    return () => {
      clearTimer();
      unbinders.forEach((u) => u());
    };
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
        deferScroll('chat-messages', SCROLL_DEFER_DELAY);
      });
    }
  }

  private initInputListeners(): void {
    const chatInput = qs<HTMLTextAreaElement>('chat-input');
    if (!chatInput) return;

    on(chatInput, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        qs('send-btn')?.click();
      }
    });

    // 自适应高度（限制最大高度）
    const style = WIN.getComputedStyle(chatInput);
    const lineHeight = parseFloat(style.lineHeight || '20') || 20;
    const maxRows = 8;
    const maxHeight = lineHeight * maxRows;

    let scheduled = false;
    let prevHeight = chatInput.offsetHeight;

    const resize = () => {
      scheduled = false;
      chatInput.style.height = 'auto';
      const next = Math.min(chatInput.scrollHeight, maxHeight);
      if (next !== prevHeight) {
        chatInput.style.height = next + 'px';
        prevHeight = next;
      }
    };

    on(chatInput, 'input', () => {
      if (scheduled) return;
      scheduled = true;
      raf(resize as any);
    });
  }

  private async handleSendMessage(): Promise<void> {
    const cm = (WIN as any).CHAT_MODULES?.composerModule;
    await safeCall(cm, 'handleSendMessage', '发送消息失败');
  }

  private async triggerAiResponse(): Promise<void> {
    const arm = (WIN as any).SCREENS?.aiResponseModule;
    const ok = await safeCall(
        arm,
        'triggerAiResponse',
        'AI响应触发失败',
        [],
        () => showError('AI响应功能暂时不可用，请刷新页面重试')
    );
    return ok as any;
  }

  bindPatEvent(bubble: HTMLElement, msg: Message): void {
    on(bubble, 'dblclick', () => {
      if ((WIN as any).getIsMessageEditMode?.()) return;
      // 修正 TS2339：不要把 handlePat 当作本类属性访问，改为从 window 动态获取
      const handler: ((m: Message) => void) | undefined =
          (WIN as any).CHAT_MODULES?.eventsModule?.handlePat ??
          (typeof (WIN as any).handlePat === 'function' ? (WIN as any).handlePat.bind(WIN) : undefined);
      if (handler) handler(msg);
    });
  }

  bindSelectionEvent(bubble: HTMLElement, timestamp: number): void {
    on(bubble, 'click', () => {
      if (!(WIN as any).getIsSelectionMode?.()) return;
      (WIN as any).toggleMessageSelection?.(timestamp);
    });
  }

  bindMessageEvents(wrapper: HTMLElement, bubble: HTMLElement, msg: Message): void {
    this.addLongPressListener(bubble, () => {
      (WIN as any).enterSelectionMode?.(msg.timestamp);
    });
    this.bindPatEvent(bubble, msg);
    this.bindSelectionEvent(bubble, msg.timestamp);
  }

  bindChatListItemEvents(item: HTMLElement, chat: Chat): void {
    on(item, 'click', () => {
      (WIN as any).openChat?.(chat.id);
    });

    this.addLongPressListener(item, async () => {
      const confirmed = await this.showCustomConfirm(
          '删除对话',
          `确定要删除与 "${chat.name}" 的整个对话吗？此操作不可撤销。`,
          { confirmButtonClass: 'btn-danger' }
      );
      if (!confirmed) return;

      try {
        const state = (WIN as any).STATE;
        const musicState = state?.musicState;
        if (musicState?.isActive && musicState.activeChatId === chat.id) {
          await (WIN as any).endListenTogetherSession?.(false);
        }

        const prevChat = state.state.chats[chat.id];
        const prevActive = state.state.activeChatId;

        delete state.state.chats[chat.id];
        if (prevActive === chat.id) state.state.activeChatId = null;

        try {
          await DB.deleteChat(chat.id);
        } catch (dbErr) {
          state.state.chats[chat.id] = prevChat;
          state.state.activeChatId = prevActive;
          throw dbErr;
        }

        (WIN as any).CHAT_MODULES?.renderModule?.renderChatList?.();
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
      (WIN as any).CHAT_MODULES?.composerModule?.sendSticker?.(sticker);
    });

    this.addLongPressListener(item, () => {
      if ((WIN as any).getIsSelectionMode?.()) return;
      if (item.dataset.hasDeleteBtn === '1') return;

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
          const state = (WIN as any).STATE;
          await DB.deleteUserSticker(sticker.id);
          state.state.userStickers = state.state.userStickers.filter(
              (s: any) => s.id !== sticker.id
          );
          (WIN as any).CHAT_MODULES?.composerModule?.renderStickerPanel?.();
        } catch (err) {
          showOperationError('删除表情', err as Error);
        }
      };

      item.dataset.hasDeleteBtn = '1';
      item.appendChild(deleteBtn);
      deleteBtn.style.display = 'block';

      setTimeout(() => {
        const offLeave = on(
            item,
            'mouseleave',
            () => {
              deleteBtn.remove();
              item.dataset.hasDeleteBtn = '';
              offLeave();
            },
            { once: true }
        );
      }, 3000);
    });
  }

  bindLoadMoreButtonEvents(button: HTMLElement): void {
    on(button, 'click', () => {
      (WIN as any).CHAT_MODULES?.renderModule?.loadMoreMessages?.();
    });
  }

  private async showCustomConfirm(
      title: string,
      message: string,
      options: any = {}
  ): Promise<boolean> {
    if ((WIN as any).showCustomConfirm) {
      return (WIN as any).showCustomConfirm(title, message, options);
    }
    return Promise.resolve(confirm(message));
  }
}

export const eventHandlerModule = new EventHandlerModule();
export default eventHandlerModule;
