// 消息编写模块 - 负责文本消息发送、指令解析、AI回复触发与群聊交互
// 优化：降低复杂度、提高可读性与类型安全、避免 O(n^2) 查找

import type { Chat, Message, GlobalSettings, ApiConfig, Preset } from '../../state';
import DB from '../../database';
import { showError, showValidationError } from '../../services/errorHandling';

// === 扩展类型 ===
type BaseMessage = Message & { timestamp: number };

type TransferMessage = BaseMessage & {
  type: 'transfer';
  senderName: string;
  receiverName: string;
  amount: number;
  note: string;
};

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
  musicState: unknown;
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

type Sticker = { id: string; url: string; name: string };

type WinType = (Window & typeof globalThis) & {
  STATE?: StateManager;
  DB?: DatabaseManager;
  CHAT_MODULES?: {
    renderModule?: {
      appendMessage?: (msg: Message, chat: Chat) => void;
      renderChatList?: () => void;
    };
    eventsModule?: {
      bindStickerItemEvents?: (el: HTMLElement, sticker: Sticker) => void;
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
  allEditableCandidateContents: '.message-bubble:not(.system-message-container) .content',
} as const;

const CLASS = {
  editable: 'editable',
  isSticker: 'is-sticker',
  isVoice: 'is-voice-message',
  isTransfer: 'is-transfer',
  isAiImage: 'is-ai-image',
  hasImage: 'has-image',
  visible: 'visible',
} as const;

function getWin(): WinType {
  return window as unknown as WinType;
}

// 统一获取上下文，减少可选链判空与重复引用
function getCtx() {
  const win = getWin();
  return {
    win,
    state: win.STATE,
    db: win.DB,
    renders: win.CHAT_MODULES?.renderModule,
    events: win.CHAT_MODULES?.eventsModule,
    ai: win.SCREENS?.aiResponseModule,
  };
}

function genIdNow() {
  const now = Date.now();
  return { id: String(now), timestamp: now };
}

function qs<T extends Element>(selector: string): T | null {
  return document.querySelector(selector) as T | null;
}

function qsAll<T extends Element>(selector: string): NodeListOf<T> {
  return document.querySelectorAll(selector) as NodeListOf<T>;
}

function getActiveChatOrNull(state?: StateManager): Chat | null {
  if (!state?.state?.activeChatId) return null;
  return state.state.chats[state.state.activeChatId] || null;
}

function isEditableBubble(el: Element): boolean {
  const list = [CLASS.isSticker, CLASS.isVoice, CLASS.isTransfer, CLASS.isAiImage, CLASS.hasImage];
  const bubble = el.closest('.message-bubble');
  if (!bubble) return false;
  return !list.some(c => bubble.classList.contains(c));
}

function resetInput(el: HTMLTextAreaElement) {
  el.value = '';
  el.style.height = 'auto';
  el.focus();
}

function setEditUiState(isEditing: boolean) {
  const img = qs<HTMLImageElement>(SEL.editBtnImg);
  const btn = qs<HTMLElement>(SEL.editBtn);
  if (img) {
    if (isEditing) {
      img.src = 'https://i.postimg.cc/GtrQTBZ1/image.png';
      img.alt = '保存';
    } else {
      img.src = 'https://i.postimg.cc/V60TWbGr/image.png';
      img.alt = '编辑';
    }
  }
  if (btn) btn.title = isEditing ? '保存编辑' : '编辑消息';
}

// 统一追加消息、保存、刷新UI
async function appendAndPersist(chat: Chat, msg: Message, opts?: { refreshList?: boolean }) {
  chat.history.push(msg);
  await DB.saveChat(chat);
  const { renders } = getCtx();
  renders?.appendMessage?.(msg, chat);
  if (opts?.refreshList !== false) renders?.renderChatList?.();
}

export class MessageComposerModule {
  // 发送文本消息
  async handleSendMessage(): Promise<void> {
    const { state } = getCtx();
    const input = qs<HTMLTextAreaElement>(SEL.chatInput);
    if (!state || !input) return;

    const content = input.value.trim();
    if (!content) return;

    const chat = getActiveChatOrNull(state);
    if (!chat) return;

    const meta = genIdNow();
    const msg: BaseMessage = {
      id: meta.id,
      sender: 'user',
      role: 'user',
      content,
      timestamp: meta.timestamp,
    } as BaseMessage;

    await appendAndPersist(chat, msg);
    resetInput(input);
  }

  // 拍一拍
  async handlePat(msg: Message): Promise<void> {
    const { win, state } = getCtx();
    if (win.getIsSelectionMode?.() || !state) return;

    const chat = getActiveChatOrNull(state);
    if (!chat) return;

    const myName = chat.isGroup ? (chat.settings.myGroupNickname || '我') : '我';

    const isAssistant = msg.role === 'assistant';
    let patteeName = '自己';
    let patteeSuffix = '';

    if (isAssistant) {
      if (chat.isGroup) {
        const member = chat.members?.find(m => m.name === (msg as any).senderName);
        patteeName = `"${(msg as any).senderName ?? '对方'}"`;
        patteeSuffix = member?.patSuffix || '';
      } else {
        patteeName = `"${chat.name}"`;
        patteeSuffix = chat.settings.aiPatSuffix || '';
      }
    } else if (chat.isGroup && chat.settings.myGroupNickname === (msg as any).senderName) {
      patteeName = '自己';
    }

    const meta = genIdNow();
    const patMessage: BaseMessage = {
      id: meta.id,
      sender: 'user',
      role: 'user',
      type: 'pat',
      content: `${myName}拍了拍${patteeName}${patteeSuffix || ''}`,
      timestamp: meta.timestamp,
    } as BaseMessage;

    await appendAndPersist(chat, patMessage, { refreshList: false });
  }

  // AI 响应解析
  parseAiResponse(content: string): string[] {
    // 1) 完整 JSON 数组
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    } catch {}

    // 2) 匹配首个 JSON 数组片段
    const match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) return arr;
      } catch {}
    }

    // 3) 按行切分，过滤代码块标记
    const lines = content.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('```'));
    return lines.length ? lines : [content];
  }

  // 触发 AI 响应
  async triggerAiResponse(): Promise<void> {
    const { ai } = getCtx();
    if (ai?.triggerAiResponse) {
      await ai.triggerAiResponse();
      return;
    }
    console.error('AI响应模块未找到，请检查模块加载');
    showError('AI响应功能暂时不可用，请刷新页面重试');
  }

  // 渲染表情面板
  renderStickerPanel(): void {
    const { events, state } = getCtx();
    if (!state) return;

    const grid = qs<HTMLDivElement>(SEL.stickerGrid);
    if (!grid) return;

    grid.textContent = '';

    const stickers = state.state.userStickers;
    if (!stickers || stickers.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-secondary)';
      emptyMsg.style.gridColumn = '1 / -1';
      emptyMsg.textContent = '达人请点击右上角“添加”或“上传”来添加你的第一个表情哦！';
      grid.appendChild(emptyMsg);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const sticker of stickers) {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      item.style.backgroundImage = `url(${sticker.url})`;
      item.title = sticker.name;
      events?.bindStickerItemEvents?.(item, sticker);
      frag.appendChild(item);
    }
    grid.appendChild(frag);
  }

  // 发送表情
  async sendSticker(sticker: Sticker): Promise<void> {
    const { state } = getCtx();
    const chat = getActiveChatOrNull(state);
    if (!chat) return;

    const meta = genIdNow();
    const msg: BaseMessage = {
      id: meta.id,
      sender: 'user',
      role: 'user',
      content: sticker.url,
      meaning: sticker.name,
      timestamp: meta.timestamp,
    } as BaseMessage;

    await appendAndPersist(chat, msg);

    qs<HTMLDivElement>(SEL.stickerPanel)?.classList.remove(CLASS.visible);
  }

  // 发送用户转账
  async sendUserTransfer(): Promise<void> {
    const { state } = getCtx();
    const chat = getActiveChatOrNull(state);
    if (!chat) return;

    const amountInput = qs<HTMLInputElement>(SEL.transferAmount);
    const noteInput = qs<HTMLInputElement>(SEL.transferNote);
    if (!amountInput || !noteInput) return;

    const amount = parseFloat(amountInput.value);
    const note = noteInput.value.trim();

    if (!Number.isFinite(amount) || amount < 0 || amount > 9999) {
      showValidationError('请输入有效的金额 (0 到 9999 之间)');
      return;
    }

    const senderName = chat.isGroup ? (chat.settings.myGroupNickname || '我') : '我';
    const receiverName = chat.isGroup ? '群聊' : chat.name;
    const meta = genIdNow();

    const msg: TransferMessage = {
      id: meta.id,
      role: 'user',
      type: 'transfer',
      content: '',
      sender: 'user',
      senderName,
      receiverName,
      amount,
      note,
      timestamp: meta.timestamp,
    };

    await appendAndPersist(chat, msg);

    qs<HTMLDivElement>(SEL.transferModal)?.classList.remove(CLASS.visible);
    amountInput.value = '';
    noteInput.value = '';
  }

  // 退出编辑模式
  async exitMessageEditMode(shouldSave = false): Promise<void> {
    const { win, state } = getCtx();
    if (!win.getIsMessageEditMode?.()) return;

    setEditUiState(false);

    let changesMade = false;
    const chat = getActiveChatOrNull(state);

    if (shouldSave && chat) {
      // 使用 Map 降低从 O(n^2) -> O(n)
      const nodes = Array.from(qsAll<HTMLElement>(SEL.editableMessageContents));
      const timestampToIndex = new Map<number, number>();
      chat.history.forEach((m, idx) => timestampToIndex.set((m as BaseMessage).timestamp, idx));

      for (const contentEl of nodes) {
        const bubble = contentEl.closest('.message-bubble') as HTMLElement | null;
        if (!bubble?.dataset.timestamp) continue;
        const timestamp = Number(bubble.dataset.timestamp);
        const idx = timestampToIndex.get(timestamp);
        if (idx == null) continue;

        const newContent = contentEl.textContent || '';
        const message = chat.history[idx] as BaseMessage;
        if (message.content !== newContent) {
          message.content = newContent;
          changesMade = true;
        }
      }

      if (changesMade) {
        await DB.saveChat(chat);
        win.showCustomAlert?.('保存成功', '消息已更新。');
      }
    }

    // 关闭可编辑状态
    qsAll<HTMLElement>(SEL.editableMessageContents).forEach(el => {
      el.contentEditable = 'false';
      el.classList.remove(CLASS.editable);
    });

    win.setIsMessageEditMode?.(false);
  }

  // 进入编辑模式
  enterMessageEditMode(): void {
    const { win } = getCtx();
    if (win.getIsMessageEditMode?.()) return;

    setEditUiState(true);

    // 只对文本类气泡开启编辑
    qsAll<Element>(SEL.allEditableCandidateContents).forEach(contentEl => {
      if (isEditableBubble(contentEl)) {
        const el = contentEl as HTMLElement;
        el.contentEditable = 'true';
        el.classList.add(CLASS.editable);
      }
    });

    win.setIsMessageEditMode?.(true);
    win.showCustomAlert?.('进入编辑模式', '您现在可以点击编辑按钮来编辑其内容。完成后，请再次点击“保存”按钮。');
  }

  async toggleMessageEditMode(): Promise<void> {
    const { win, state } = getCtx();
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
