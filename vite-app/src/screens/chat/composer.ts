// 娑堟伅缂栧啓妯″潡 - 璐熻矗鏂囨湰娑堟伅鍙戦€併€佸懡浠よВ鏋愩€丄I鍥炲瑙﹀彂鍜岀兢鑱婇€昏緫
// Phase 2+4: 浣跨敤DB浠撳簱璁块棶 + 缁熶竴閿欒澶勭悊

import type { Chat, Message, GlobalSettings, ApiConfig, Preset } from '../../state';
import DB from '../../database';
import { showError, showValidationError } from '../../services/errorHandling';

// === 绫诲瀷瀹氫箟 ===
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

// === 甯搁噺/宸ュ叿 ===
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

// 缁熶竴鑾峰彇 State/DB/娓叉煋妯″潡锛岄伩鍏嶆瘡澶勯噸澶嶅垽绌?
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

// 缁熶竴杩藉姞娑堟伅銆佷繚瀛樸€佸埛鏂癠I
async function appendAndPersist(chat: Chat, msg: Message, opts?: { refreshList?: boolean; appendOnly?: boolean }) {
  chat.history.push(msg);
  // Phase 2: 缁熶竴 DB 浠撳簱璋冪敤
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

// === 妯″潡 ===
export class MessageComposerModule {
  // 鍙戦€佹枃鏈秷鎭?
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

    // 閲嶇疆杈撳叆妗?
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatInput.focus();
  }

  // 鎷嶄竴鎷?
  async handlePat(msg: Message): Promise<void> {
    const { win, state } = getWinStateDb();
    if (win.getIsSelectionMode?.() || !state) return;

    const chat = getActiveChatOrNull(state);
    if (!chat) return;

    const myName = chat.isGroup ? (chat.settings.myGroupNickname || '我') : '我';
    let patteeName = '鑷繁';
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
      patteeName = '鑷繁';
    }

    const content = `${myName}鎷嶄簡鎷?{patteeName}${patteeSuffix || ''}`;
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

    // 灞€閮?append 宸插湪 appendAndPersist 鎵ц
  }

  // AI 鍝嶅簲瑙ｆ瀽
  parseAiResponse(content: string): string[] {
    // 浼樺厛 JSON 鏁扮粍
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}

    // 瀹芥澗鍖归厤棣栦釜涓嫭鍙?JSON
    const match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) return arr;
      } catch (_) {}
    }

    // 鎸夎鎷嗗垎锛岃繃婊や唬鐮佸潡鏍囪
    const lines = content
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('```'));
    return lines.length ? lines : [content];
  }

  // 濮旀墭 AI 鍝嶅簲
  async triggerAiResponse(): Promise<void> {
    const { win } = getWinStateDb();
    const mod = win.SCREENS?.aiResponseModule;
    if (mod?.triggerAiResponse) {
      await mod.triggerAiResponse();
      return;
    }
    console.error('AI鍝嶅簲妯″潡鏈壘鍒帮紝璇锋鏌ユā鍧楀姞杞?);
    showError('AI鍝嶅簲鍔熻兘鏆傛椂涓嶅彲鐢紝璇峰埛鏂伴〉闈㈤噸璇?);
  }

  // 娓叉煋琛ㄦ儏鍖呴潰鏉?
  renderStickerPanel(): void {
    const { win, state } = getWinStateDb();
    if (!state) return;

    const grid = qs<HTMLDivElement>(SEL.stickerGrid);
    if (!grid) return;

    // 鎬ц兘锛氫竴娆℃€ф竻绌?
    grid.textContent = '';

    if (state.state.userStickers.length === 0) {
      const emptyMsg = document.createElement('p');
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-secondary)';
      emptyMsg.style.gridColumn = '1 / -1';
      emptyMsg.textContent = '澶т汉璇风偣鍑诲彸涓婅"娣诲姞"鎴?涓婁紶"鏉ユ坊鍔犱綘鐨勭涓€涓〃鎯呭惂锛?;
      grid.appendChild(emptyMsg);
      return;
    }

    // 鎬ц兘锛氫娇鐢?DocumentFragment 鎵归噺鎻掑叆
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

  // 鍙戦€佽〃鎯?
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

  // 鍙戦€佺敤鎴疯浆璐?
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
      showValidationError('璇疯緭鍏ユ湁鏁堢殑閲戦 (0 鍒?9999 涔嬮棿)');
      return;
    }

    const senderName = chat.isGroup ? (chat.settings.myGroupNickname || '我') : '我';
    const receiverName = chat.isGroup ? '缇よ亰' : chat.name;
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

  // 閫€鍑虹紪杈戞ā寮?
  async exitMessageEditMode(shouldSave = false): Promise<void> {
    const { win, state } = getWinStateDb();
    if (!win.getIsMessageEditMode?.()) return;

    const img = qs<HTMLImageElement>(SEL.editBtnImg);
    if (img) {
      img.src = 'https://i.postimg.cc/V60TWbGr/image.png';
      img.alt = '缂栬緫';
    }
    const btn = qs<HTMLElement>(SEL.editBtn);
    if (btn) btn.title = '缂栬緫娑堟伅';

    let changesMade = false;
    const chat = getActiveChatOrNull(state);
    if (shouldSave && chat) {
      // 鎬ц兘锛氫竴娆℃€ф姄鍙栨墍鏈夊彲缂栬緫鍏冪礌
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
        win.showCustomAlert?.('淇濆瓨鎴愬姛', '娑堟伅宸叉洿鏂般€?);
      }
    }

    // 鍏抽棴鍙紪杈戠姸鎬?
    qsAll<HTMLElement>(SEL.editableMessageContents).forEach(el => {
      el.contentEditable = 'false';
      el.classList.remove(CLASS.editable);
    });

    win.setIsMessageEditMode?.(false);
  }

  // 杩涘叆缂栬緫妯″紡
  enterMessageEditMode(): void {
    const { win } = getWinStateDb();
    if (win.getIsMessageEditMode?.()) return;

    const img = qs<HTMLImageElement>(SEL.editBtnImg);
    if (img) {
      img.src = 'https://i.postimg.cc/GtrQTBZ1/image.png';
      img.alt = '淇濆瓨';
    }
    const btn = qs<HTMLElement>(SEL.editBtn);
    if (btn) btn.title = '淇濆瓨缂栬緫';

    // 浠呭鏂囨湰绫绘皵娉″紑鍚紪杈?
    qsAll<Element>(SEL.allEditableCandidateContents).forEach(contentEl => {
      const bubble = contentEl.closest('.message-bubble');
      if (bubble && isContentEditableCandidate(bubble)) {
        (contentEl as HTMLElement).contentEditable = 'true';
        contentEl.classList.add(CLASS.editable);
      }
    });

    win.setIsMessageEditMode?.(true);
    win.showCustomAlert?.('杩涘叆缂栬緫妯″紡', '鎮ㄧ幇鍦ㄥ彲浠ョ偣鍑绘秷鎭皵娉℃潵缂栬緫鍏跺唴瀹广€傚畬鎴愬悗锛岃鍐嶆鐐瑰嚮"淇濆瓨"鎸夐挳銆?);
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

// === 鍗曚緥 ===
export const messageComposerModule = new MessageComposerModule();
export default messageComposerModule;










