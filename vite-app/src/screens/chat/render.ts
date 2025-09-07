// 优化点说明：
// 1) 常量与默认头像在构造时缓存，减少 window 访问与重复计算
// 2) 使用 DocumentFragment/批量 DOM 插入，减少重排重绘
// 3) 抽取纯函数：时间格式化/头像选择/最后一条消息摘要，提升可读性与复用
// 4) 统一 DOM 查询缓存到私有字段，避免重复 getElementById
// 5) 避免重复 slice(-1)，预先取最后消息及时间用于排序与显示
// 6) 早退与空值合并，减少分支复杂度；小函数拆分
// 7) prepend/append/loadMore 保持滚动位置，减少闪动
// 8) 使用 const/let、严格类型、可选链、空值合并，提升可维护性

import type { Chat, Message, GlobalSettings } from '../../state';
import { buildMessageContent } from './domBuilders';

interface Constants {
  STICKER_REGEX: RegExp;
  DEFAULT_AVATAR: string;
  DEFAULT_MY_GROUP_AVATAR: string;
  DEFAULT_GROUP_MEMBER_AVATAR: string;
  DEFAULT_GROUP_AVATAR: string;
  MESSAGE_RENDER_WINDOW: number;
}

interface StateManager {
  state: {
    chats: Record<string, Chat>;
    activeChatId: string | null;
    globalSettings: GlobalSettings;
  };
}

interface MessageRenderElement {
  element: HTMLElement;
  timestamp: number;
}

// --- 模块级状态 ---
let currentRenderedCount = 0;

// --- 工具函数 ---
const clearChildren = (el: HTMLElement) => {
  el.textContent = '';
};

const createEl = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
};

const frag = () => document.createDocumentFragment();

const formatTimestamp = (timestamp?: number): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

const getLastMessageAndTime = (chat: Chat) => {
  const last = chat.history.length ? chat.history[chat.history.length - 1] : undefined;
  return { last, time: last?.timestamp ?? 0 };
};

export class MessageRenderModule {
  private constants: Constants;
  private avatars: {
    defaultAvatar: string;
    defaultMyGroupAvatar: string;
    defaultGroupMemberAvatar: string;
    defaultGroupAvatar: string;
  };
  private stickerRegex: RegExp;
  private messageRenderWindow: number;

  // DOM 缓存
  private chatListEl: HTMLElement | null = null;
  private messagesContainer: HTMLElement | null = null;
  private typingIndicatorEl: HTMLElement | null = null;

  constructor() {
    const win = window as any;
    const constants = (win.CONSTANTS || {}) as Partial<Constants>;
    this.constants = {
      STICKER_REGEX: constants.STICKER_REGEX ?? /^(https:\/\/i\.postimg\.cc\/.+|data:image)/,
      DEFAULT_AVATAR: constants.DEFAULT_AVATAR ?? 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg',
      DEFAULT_MY_GROUP_AVATAR: constants.DEFAULT_MY_GROUP_AVATAR ?? 'https://i.postimg.cc/cLPP10Vm/4.jpg',
      DEFAULT_GROUP_MEMBER_AVATAR: constants.DEFAULT_GROUP_MEMBER_AVATAR ?? 'https://i.postimg.cc/VkQfgzGJ/1.jpg',
      DEFAULT_GROUP_AVATAR: constants.DEFAULT_GROUP_AVATAR ?? 'https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg',
      MESSAGE_RENDER_WINDOW: constants.MESSAGE_RENDER_WINDOW ?? 50,
    } as Constants;

    this.avatars = {
      defaultAvatar: this.constants.DEFAULT_AVATAR,
      defaultMyGroupAvatar: this.constants.DEFAULT_MY_GROUP_AVATAR,
      defaultGroupMemberAvatar: this.constants.DEFAULT_GROUP_MEMBER_AVATAR,
      defaultGroupAvatar: this.constants.DEFAULT_GROUP_AVATAR,
    };

    this.stickerRegex = this.constants.STICKER_REGEX;
    this.messageRenderWindow = this.constants.MESSAGE_RENDER_WINDOW;
  }

  public formatTimestamp(timestamp: number): string {
    return formatTimestamp(timestamp);
  }

  private getState(): StateManager | undefined {
    const win = window as any;
    return win.STATE as StateManager | undefined;
  }

  private ensureDomCache() {
    if (!this.chatListEl) this.chatListEl = document.getElementById('chat-list');
    if (!this.messagesContainer) this.messagesContainer = document.getElementById('chat-messages');
  }

  private getAvatarSrc(msg: Message, chat: Chat, isUser: boolean): string {
    if (chat.isGroup) {
      if (isUser) {
        return chat.settings.myAvatar || this.avatars.defaultMyGroupAvatar;
      }
      const member = chat.members?.find(m => m.name === msg.senderName);
      return member?.avatar || this.avatars.defaultGroupMemberAvatar;
    }
    return isUser
        ? (chat.settings.myAvatar || this.avatars.defaultAvatar)
        : (chat.settings.aiAvatar || this.avatars.defaultAvatar);
  }

  private getLastMessageDisplay(chat: Chat, lastMsg?: Message): string {
    const m = lastMsg;
    if (!m) return '...';
    if (m.type === 'transfer') return '[转账]';
    if (m.type === 'ai_image' || m.type === 'user_photo') return '[照片]';
    if (m.type === 'voice_message') return '[语音]';
    if (typeof m.content === 'string' && this.stickerRegex.test(m.content)) {
      return (m as any).meaning ? `[表情: ${(m as any).meaning}]` : '[表情]';
    }
    if (Array.isArray(m.content)) return '[图片]';
    const text = String(m.content ?? '...');
    const preview = text.length > 20 ? `${text.slice(0, 20)}…` : text;
    return chat.isGroup && m.senderName ? `${m.senderName}: ${preview}` : preview;
  }

  createMessageElement(msg: Message, chat: Chat): HTMLElement {
    const isUser = msg.role === 'user';
    const wrapper = createEl('div', `message-wrapper ${isUser ? 'user' : 'ai'}`);

    if (chat.isGroup && !isUser) {
      const senderNameDiv = createEl('div', 'sender-name', msg.senderName || '未知成员');
      wrapper.appendChild(senderNameDiv);
    }

    const bubble = createEl('div', `message-bubble ${isUser ? 'user' : 'ai'}`) as HTMLDivElement;
    bubble.dataset.timestamp = String(msg.timestamp);

    const avatarSrc = this.getAvatarSrc(msg, chat, isUser);

    // 状态类
    if (msg.type === 'user_photo' || msg.type === 'ai_image') {
      bubble.classList.add('is-ai-image');
    } else if (msg.type === 'voice_message') {
      bubble.classList.add('is-voice-message');
    } else if (msg.type === 'transfer') {
      bubble.classList.add('is-transfer');
    } else if (typeof msg.content === 'string' && this.stickerRegex.test(msg.content)) {
      bubble.classList.add('is-sticker');
    } else if (Array.isArray(msg.content) && msg.content[0]?.type === 'image_url') {
      bubble.classList.add('has-image');
    }

    const contentNode =
        msg.type === 'pat'
            ? createEl('span', '', String(msg.content))
            : buildMessageContent(msg, isUser);

    const avatarGroup = createEl('div', 'avatar-group');
    const avatarImg = createEl('img', 'avatar') as HTMLImageElement;
    avatarImg.src = avatarSrc;

    const timestampSpan = createEl('span', 'timestamp', formatTimestamp(msg.timestamp));

    const contentDiv = createEl('div', 'content');
    contentDiv.appendChild(contentNode);

    avatarGroup.appendChild(avatarImg);
    avatarGroup.appendChild(timestampSpan);
    bubble.appendChild(avatarGroup);
    bubble.appendChild(contentDiv);

    if (msg.type === 'pat') {
      // 系统消息独立样式容器
      const sysWrap = createEl('div', 'system-message-container');
      sysWrap.appendChild(contentNode);
      return sysWrap;
    }

    wrapper.appendChild(bubble);
    return wrapper;
  }

  renderChatList(): void {
    this.ensureDomCache();
    const state = this.getState();
    if (!state?.state) {
      console.error('聊天列表渲染：状态管理不可用');
      return;
    }
    const chatListEl = this.chatListEl;
    if (!chatListEl) {
      console.error('聊天列表渲染：chat-list元素不存在');
      return;
    }

    clearChildren(chatListEl);

    const chats = Object.values(state.state.chats);
    if (chats.length === 0) {
      const emptyP = createEl('p');
      emptyP.style.textAlign = 'center';
      emptyP.style.color = '#8a8a8a';
      emptyP.style.marginTop = '50px';
      emptyP.textContent = '点击右上角 "+" 或群组图标添加聊天';
      chatListEl.appendChild(emptyP);
      return;
    }

    // 预提取最后消息与时间，排序 O(n log n)，避免重复 slice(-1)
    const enriched = chats.map(chat => {
      const { last, time } = getLastMessageAndTime(chat);
      return { chat, last, time };
    }).sort((a, b) => b.time - a.time);

    const df = frag();
    for (const { chat, last } of enriched) {
      const item = createEl('div', 'chat-list-item') as HTMLDivElement;
      item.dataset.chatId = chat.id;

      const avatarUrl = chat.isGroup ? (chat.settings.groupAvatar || this.avatars.defaultGroupAvatar) : (chat.settings.aiAvatar || this.avatars.defaultAvatar);
      const avatarImg = createEl('img', 'avatar') as HTMLImageElement;
      avatarImg.src = avatarUrl;

      const infoDiv = createEl('div', 'info');
      const nameLineDiv = createEl('div', 'name-line');
      const nameSpan = createEl('span', 'name', chat.name);

      nameLineDiv.appendChild(nameSpan);
      if (chat.isGroup) {
        nameLineDiv.appendChild(createEl('span', 'group-tag', '群聊'));
      }

      const lastMsgDiv = createEl('div', 'last-msg', this.getLastMessageDisplay(chat, last));

      infoDiv.appendChild(nameLineDiv);
      infoDiv.appendChild(lastMsgDiv);

      item.appendChild(avatarImg);
      item.appendChild(infoDiv);

      df.appendChild(item);
    }
    chatListEl.appendChild(df);

    // 降低噪音：仅在开发时输出
    // console.debug('聊天列表已渲染：', enriched.length);
  }

  renderChatInterface(chatId: string): void {
    this.ensureDomCache();
    const state = this.getState();
    const store = state?.state;
    if (!store || !store.chats[chatId]) {
      console.error('聊天界面渲染：聊天不存在', chatId);
      return;
    }

    const chat = store.chats[chatId];
    const messagesContainer = this.messagesContainer;
    if (!messagesContainer) {
      console.error('聊天界面渲染：chat-messages元素不存在');
      return;
    }

    messagesContainer.dataset.theme = chat.settings.theme || 'default';

    const headerTitle = document.getElementById('chat-header-title');
    if (headerTitle) headerTitle.textContent = chat.name;

    clearChildren(messagesContainer);

    const chatScreen = document.getElementById('chat-interface-screen') as HTMLElement | null;
    if (chatScreen) {
      if (chat.settings.background) {
        chatScreen.style.backgroundImage = `url(${chat.settings.background})`;
        chatScreen.style.backgroundColor = 'transparent';
      } else {
        chatScreen.style.backgroundImage = 'none';
        chatScreen.style.backgroundColor = '#f0f2f5';
      }
    }

    const history = chat.history;
    const totalMessages = history.length;
    currentRenderedCount = 0;

    // 渲染最近 N 条
    const start = Math.max(0, totalMessages - this.messageRenderWindow);
    const df = frag();
    for (let i = start; i < totalMessages; i++) {
      const msg = history[i];
      const el = this.createMessageElement(msg, chat);
      this.bindMessageEventsAfterRender(el, msg);
      df.appendChild(el);
    }
    messagesContainer.appendChild(df);
    currentRenderedCount = totalMessages - start;

    if (totalMessages > currentRenderedCount) {
      this.prependLoadMoreButton(messagesContainer);
    }

    // 输入指示器
    const typing = createEl('div') as HTMLDivElement;
    typing.id = 'typing-indicator';
    typing.style.display = 'none';
    typing.textContent = '对方正在输入...';
    messagesContainer.appendChild(typing);
    this.typingIndicatorEl = typing;

    requestAnimationFrame(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  }

  prependLoadMoreButton(container: HTMLElement): void {
    if (container.querySelector('#load-more-btn')) return;
    const button = createEl('button') as HTMLButtonElement;
    button.id = 'load-more-btn';
    button.textContent = '加载更早的记录';
    container.prepend(button);
  }

  loadMoreMessages(): void {
    this.ensureDomCache();
    const state = this.getState();
    const store = state?.state;
    const messagesContainer = this.messagesContainer;
    if (!store || !messagesContainer || !store.activeChatId) return;

    const chat = store.chats[store.activeChatId];
    if (!chat) return;

    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) loadMoreBtn.remove();

    const total = chat.history.length;
    const remain = total - currentRenderedCount;
    if (remain <= 0) return;

    const count = Math.min(this.messageRenderWindow, remain);
    const start = Math.max(0, total - currentRenderedCount - count);
    const end = total - currentRenderedCount; // 开区间
    const slice = chat.history.slice(start, end);

    const oldTop = messagesContainer.scrollTop;
    const oldHeight = messagesContainer.scrollHeight;

    const df = frag();
    // 从旧到新前插，保持时间顺序：先构建 fragment
    for (let i = 0; i < slice.length; i++) {
      const msg = slice[i];
      const el = this.createMessageElement(msg, chat);
      this.bindMessageEventsAfterRender(el, msg);
      df.appendChild(el);
    }

    const anchor = messagesContainer.firstChild; // 可能是 load-more 按钮或消息
    messagesContainer.insertBefore(df, anchor || null);

    currentRenderedCount += slice.length;

    const newHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop = oldTop + (newHeight - oldHeight);

    if (total > currentRenderedCount) {
      this.prependLoadMoreButton(messagesContainer);
    }
  }

  prependMessage(msg: Message, chat: Chat): void {
    this.ensureDomCache();
    const messagesContainer = this.messagesContainer;
    if (!messagesContainer) return;

    const messageEl = this.createMessageElement(msg, chat);
    this.bindMessageEventsAfterRender(messageEl, msg);

    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) {
      messagesContainer.insertBefore(messageEl, loadMoreBtn.nextSibling);
    } else {
      messagesContainer.prepend(messageEl);
    }
  }

  appendMessage(msg: Message, chat: Chat, isInitialLoad = false): void {
    this.ensureDomCache();
    const messagesContainer = this.messagesContainer;
    if (!messagesContainer) return;

    const messageEl = this.createMessageElement(msg, chat);
    this.bindMessageEventsAfterRender(messageEl, msg);

    const typing = this.typingIndicatorEl || document.getElementById('typing-indicator');
    messagesContainer.insertBefore(messageEl, typing || null);

    if (!isInitialLoad) {
      currentRenderedCount++;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  scrollToBottom(): void {
    this.ensureDomCache();
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  getCurrentRenderedCount(): number {
    return currentRenderedCount;
  }

  resetRenderedCount(): void {
    currentRenderedCount = 0;
  }

  private bindMessageEventsAfterRender(messageEl: HTMLElement, msg: Message): void {
    const bubble = messageEl.querySelector('.message-bubble') as HTMLElement | null;
    if (!bubble || msg.type === 'pat') return;
    const win = window as any;
    win.CHAT_MODULES?.eventsModule?.bindMessageEvents?.(messageEl, bubble, msg);
  }
}

export const messageRenderModule = new MessageRenderModule();
export default messageRenderModule;
