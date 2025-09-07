// 消息编写模块 - 负责文本消息发送、命令解析、AI回复触发和群聊逻辑
// Phase 2+4: 使用DB仓库访问 + 统一错误处理

import type { Chat, Message, GlobalSettings, ApiConfig, Preset } from '../../state';
import DB from '../../database';
import { showError, showValidationError } from '../../services/errorHandling';

// === 类型定义 ===
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

type WinType = (Window & typeof globalThis) & {
  STATE?: StateManager;
  DB?: DatabaseManager;
  CHAT_MODULES?: {
    renderModule?: {
      appendMessage?: (msg: Message, chat: Chat) => void;
      renderChatList?: () => void;
    };
    eventsModule?: {
      bindStickerItemEvents?: (el: HTMLElement, sticker: { id: string; url: string; name: string }) => void;
    };
  };
  SCREENS?: {
    aiResponseModule?: {
      triggerAiResponse?: () => Promise<void>;
    };
  };
  getIsSelectionMode?: () => boolean;
  getIsMessageEditMode?: () => boolean;
  setIsMessageEditMode?: (v: boolean) => void;
  showCustomAlert?: (title: string, msg: string) => void;
};

// === 常量/工具 ===
const SEL = {
  chatInput: '#chat-input',
  stickerGrid: '#sticker-grid',
  stickerPanel: '#sticker-panel',
  transferAmount: '#transfer-amount',
  transferNote: '#transfer-note',
  transferModal: '#transfer-modal',
  editBtn: '#edit-messages-btn',
  editBtnImg: '#edit-messages-btn img',
  editableMessageContents: '.message-bubble .content.editable',
  allEditableCandidateContents:
      '.message-bubble:not(.system-message-container) .content',
};
const CLASS = {
  editable: 'editable',
  isSticker: 'is-sticker',
  isVoice: 'is-voice-message',
  isTransfer: 'is-transfer',
  isAiImage: 'is-ai-image',
  hasImage: 'has-image',
  visible: 'visible',
};

function getWin(): WinType {
  return window as unknown as WinType;
}

function genIdNow() {
  const now = Date.now();
  return { id: String(now), timestamp: now };
}

// 统一获取 State/DB/渲染模块，避免每处重复判�?
function getWinStateDb() {
  const win = getWin();
  const state = win.STATE;
  const db = win.DB;
  const renders = win.CHAT_MODULES?.renderModule;
  return { win, state, db, renders };
}

function getActiveChatOrNull(state?: StateManager): Chat | null {
  if (!state?.state?.activeChatId) return null;
  return state.state.chats[state.state.activeChatId] || null;
}

// 统一追加消息、保存、刷新UI
async function appendAndPersist(chat: Chat, msg: Message, opts?: { refreshList?: boolean; appendOnly?: boolean }) {
  chat.history.push(msg);
  // Phase 2: 统一 DB 仓库调用
  await DB.saveChat(chat);
  const { win } = getWinStateDb();
  const render = win.CHAT_MODULES?.renderModule;
  if (render?.appendMessage) render.appendMessage(msg, chat);
  if (opts?.refreshList !== false && render?.renderChatList) render.renderChatList();
}

function qs<T extends Element>(selector: string): T | null {
  return document.querySelector(selector) as T | null;
}
function qsAll<T extends Element>(selector: string): NodeListOf<T> {
  return document.querySelectorAll(selector) as NodeListOf<T>;
}

function isContentEditableCandidate(bubble: Element): boolean {
  const list = [CLASS.isSticker, CLASS.isVoice, CLASS.isTransfer, CLASS.isAiImage, CLASS.hasImage];
  return !list.some(c => bubble.classList.contains(c));
}

// === 模块 ===
export class MessageComposerModule {
  // 发送文本消�?
  async handleSendMessage(): Promise<void> {
    const { state } = getWinStateDb();
    const chatInput = qs<HTMLTextAreaElement>(SEL.chatInput);
    if (!chatInput || !state) return;

    const content = chatInput.value.trim();
    const chat = getActiveChatOrNull(state);
    if (!content || !chat) return;

    const meta = genIdNow();
    const msg: Message = {
      id: meta.id,
      sender: 'user',
      role: 'user',
      content,
      timestamp: meta.timestamp,
    };

    await appendAndPersist(chat, msg);

    // 重置输入�?
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatInput.focus();
  }

  // 拍一�?
  async handlePat(msg: Message): Promise<void> {
    const { win, state } = getWinStateDb();
    if (win.getIsSelectionMode?.() || !state) return;

    const chat = getActiveChatOrNull(state);
    if (!chat) return;

    const myName = chat.isGroup ? (chat.settings.myGroupNickname || '�?) : '�?;
    let patteeName = '自己';
    let patteeSuffix = '';

    if (msg.role === 'assistant') {
      if (chat.isGroup) {
        const member = chat.members?.find(m => m.name === msg.senderName);
        patteeName = `"${msg.senderName}"`;
        patteeSuffix = member?.patSuffix || '';
      } else {
        patteeName = `"${chat.name}"`;
        patteeSuffix = chat.settings.aiPatSuffix || '';
      }
    } else if (chat.isGroup && chat.settings.myGroupNickname === msg.senderName) {
      patteeName = '自己';
    }

    const content = `${myName}拍了�?{patteeName}${patteeSuffix || ''}`;
    const meta = genIdNow();

    const patMessage: Message = {
      id: meta.id,
      sender: 'user',
      type: 'pat',
      content,
      timestamp: meta.timestamp,
      role: 'user',
    };

    await appendAndPersist(chat, patMessage, { refreshList: false });

    // 局�?append 已在 appendAndPersist 执行
  }

  // AI 响应解析
  parseAiResponse(content: string): string[] {
    // 优先 JSON 数组
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}

    // 宽松匹配首个中括�?JSON
    const match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) return arr;
      } catch (_) {}
    }

    // 按行拆分，过滤代码块标记
    const lines = content
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('```'));
    return lines.length ? lines : [content];
  }

  // 委托 AI 响应
  async triggerAiResponse(): Promise<void> {
    const { win } = getWinStateDb();
    const handler = win.SCREENS?.aiResponseModule?.triggerAiResponse;
    if (handler) {
      await handler();
      return;
    }
    console.error('AI响应模块未找到，请检查模块加�?);
    showError('AI响应功能暂时不可用，请刷新页面重�?);
  }

  // 渲染表情包面�?
  renderStickerPanel(): void {
    const { win, state } = getWinStateDb();
    if (!state) return;

    const grid = qs<HTMLDivElement>(SEL.stickerGrid);
    if (!grid) return;

    // 性能：一次性清�?
    grid.textContent = '';

    if (state.state.userStickers.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-secondary)';
      emptyMsg.style.gridColumn = '1 / -1';
      emptyMsg.textContent = '大人请点击右上角"添加"�?上传"来添加你的第一个表情吧�?;
      grid.appendChild(emptyMsg);
      return;
    }

    // 性能：使�?DocumentFragment 批量插入
    const frag = document.createDocumentFragment();
    for (const sticker of state.state.userStickers) {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      item.style.backgroundImage = `url(${sticker.url})`;
      item.title = sticker.name;

      win.CHAT_MODULES?.eventsModule?.bindStickerItemEvents?.(item, sticker);
      frag.appendChild(item);
    }
    grid.appendChild(frag);
  }

  // 发送表�?
  async sendSticker(sticker: { id: string; url: string; name: string }): Promise<void> {
    const { state } = getWinStateDb();
    const chat = getActiveChatOrNull(state);
    if (!chat) return;

    const meta = genIdNow();
    const msg: Message = {
      id: meta.id,
      sender: 'user',
      role: 'user',
      content: sticker.url,
      meaning: sticker.name,
      timestamp: meta.timestamp,
    };

    await appendAndPersist(chat, msg);

    const stickerPanel = qs<HTMLDivElement>(SEL.stickerPanel);
    stickerPanel?.classList.remove(CLASS.visible);
  }

  // 发送用户转�?
  async sendUserTransfer(): Promise<void> {
    const { state } = getWinStateDb();
    const chat = getActiveChatOrNull(state);
    if (!chat) return;

    const amountInput = qs<HTMLInputElement>(SEL.transferAmount);
    const noteInput = qs<HTMLInputElement>(SEL.transferNote);
    if (!amountInput || !noteInput) return;

    const amount = parseFloat(amountInput.value);
    const note = noteInput.value.trim();

    if (Number.isNaN(amount) || amount < 0 || amount > 9999) {
      showValidationError('请输入有效的金额 (0 �?9999 之间)');
      return;
    }

    const senderName = chat.isGroup ? (chat.settings.myGroupNickname || '�?) : '�?;
    const receiverName = chat.isGroup ? '群聊' : chat.name;
    const meta = genIdNow();

    const msg: Message = {
      id: meta.id,
      role: 'user',
      type: 'transfer',
      content: '',
      senderName,
      receiverName,
      timestamp: meta.timestamp,
    } as unknown as Message & { amount: number; note: string };

    (msg as any).amount = amount;
    (msg as any).note = note;

    await appendAndPersist(chat, msg);

    qs<HTMLDivElement>(SEL.transferModal)?.classList.remove(CLASS.visible);
    amountInput.value = '';
    noteInput.value = '';
  }

  // 退出编辑模�?
  async exitMessageEditMode(shouldSave = false): Promise<void> {
    const { win, state } = getWinStateDb();
    if (!win.getIsMessageEditMode?.()) return;

    const img = qs<HTMLImageElement>(SEL.editBtnImg);
    if (img) {
      img.src = 'https://i.postimg.cc/V60TWbGr/image.png';
      img.alt = '编辑';
    }
    const btn = qs<HTMLElement>(SEL.editBtn);
    if (btn) btn.title = '编辑消息';

    let changesMade = false;
    const chat = getActiveChatOrNull(state);
    if (shouldSave && chat) {
      // 性能：一次性抓取所有可编辑元素
      const nodes = qsAll<HTMLElement>(SEL.editableMessageContents);
      nodes.forEach(contentEl => {
        const bubble = contentEl.closest('.message-bubble') as HTMLElement | null;
        if (!bubble?.dataset.timestamp) return;
        const timestamp = Number(bubble.dataset.timestamp);
        const newContent = contentEl.textContent || '';
        const message = chat.history.find(m => m.timestamp === timestamp);
        if (message && message.content !== newContent) {
          message.content = newContent;
          changesMade = true;
        }
      });
      if (changesMade) {
        await DB.saveChat(chat);
        win.showCustomAlert?.('保存成功', '消息已更新�?);
      }
    }

    // 关闭可编辑状�?
    qsAll<HTMLElement>(SEL.editableMessageContents).forEach(el => {
      el.contentEditable = 'false';
      el.classList.remove(CLASS.editable);
    });

    win.setIsMessageEditMode?.(false);
  }

  // 进入编辑模式
  enterMessageEditMode(): void {
    const { win } = getWinStateDb();
    if (win.getIsMessageEditMode?.()) return;

    const img = qs<HTMLImageElement>(SEL.editBtnImg);
    if (img) {
      img.src = 'https://i.postimg.cc/GtrQTBZ1/image.png';
      img.alt = '保存';
    }
    const btn = qs<HTMLElement>(SEL.editBtn);
    if (btn) btn.title = '保存编辑';

    // 仅对文本类气泡开启编�?
    qsAll<Element>(SEL.allEditableCandidateContents).forEach(contentEl => {
      const bubble = contentEl.closest('.message-bubble');
      if (bubble && isContentEditableCandidate(bubble)) {
        (contentEl as HTMLElement).contentEditable = 'true';
        contentEl.classList.add(CLASS.editable);
      }
    });

    win.setIsMessageEditMode?.(true);
    win.showCustomAlert?.('进入编辑模式', '您现在可以点击消息气泡来编辑其内容。完成后，请再次点击"保存"按钮�?);
  }

  async toggleMessageEditMode(): Promise<void> {
    const { win, state } = getWinStateDb();
    if (!getActiveChatOrNull(state)) return;

    if (win.getIsMessageEditMode?.()) {
      await this.exitMessageEditMode(true);
    } else {
      this.enterMessageEditMode();
    }
  }
}

// === 单例 ===
export const messageComposerModule = new MessageComposerModule();
export default messageComposerModule;

