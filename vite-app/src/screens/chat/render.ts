// 消息渲染模块 - 负责消息列表渲染、滚动管理和DOM更新
// 提取自 chat.ts 的消息渲染相关功能
// Phase 4: 使用安全DOM构建器替换innerHTML

import type { Chat, Message, GlobalSettings } from '../../state';
import { buildMessageContent } from './domBuilders';

// === 安全渲染辅助函数 ===
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeForAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

// === 类型定义 ===
interface MessageRenderElement {
  element: HTMLElement;
  timestamp: number;
}

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

// === 模块状态变量 ===
let currentRenderedCount = 0;

// === 消息渲染模块类 ===
export class MessageRenderModule {
  // 获取常量和默认值
  private getConstants(): Constants {
    const win = window as any;
    return win.CONSTANTS || {} as Constants;
  }

  private getDefaultAvatars() {
    const constants = this.getConstants();
    return {
      defaultAvatar: constants.DEFAULT_AVATAR || 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg',
      defaultMyGroupAvatar: constants.DEFAULT_MY_GROUP_AVATAR || 'https://i.postimg.cc/cLPP10Vm/4.jpg',
      defaultGroupMemberAvatar: constants.DEFAULT_GROUP_MEMBER_AVATAR || 'https://i.postimg.cc/VkQfgzGJ/1.jpg',
      defaultGroupAvatar: constants.DEFAULT_GROUP_AVATAR || 'https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg'
    };
  }

  // 消息元素创建
  createMessageElement(msg: Message, chat: Chat): HTMLElement {
    const constants = this.getConstants();
    const avatars = this.getDefaultAvatars();
    const STICKER_REGEX = constants.STICKER_REGEX || /^(https:\/\/i\.postimg\.cc\/.+|data:image)/;
    
    if (msg.type === 'pat') {
      const wrapper = document.createElement('div');
      wrapper.className = 'system-message-container';
      const span = document.createElement('span');
      span.textContent = String(msg.content); // 安全：使用textContent
      wrapper.appendChild(span);
      return wrapper;
    }

    const isUser = msg.role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isUser ? 'user' : 'ai'}`;
    
    if (chat.isGroup && !isUser) {
      const senderNameDiv = document.createElement('div');
      senderNameDiv.className = 'sender-name';
      senderNameDiv.textContent = msg.senderName || '未知成员';
      wrapper.appendChild(senderNameDiv);
    }
    
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isUser ? 'user' : 'ai'}`;
    bubble.dataset.timestamp = String(msg.timestamp);

    let avatarSrc: string;
    if (chat.isGroup) {
      if (isUser) {
        avatarSrc = chat.settings.myAvatar || avatars.defaultMyGroupAvatar;
      } else {
        const member = chat.members?.find(m => m.name === msg.senderName);
        avatarSrc = member ? member.avatar : avatars.defaultGroupMemberAvatar;
      }
    } else {
      avatarSrc = isUser ? (chat.settings.myAvatar || avatars.defaultAvatar) : (chat.settings.aiAvatar || avatars.defaultAvatar);
    }
    
    // Phase 4: 使用安全DOM构建器替换innerHTML拼接
    // 添加相应的CSS类
    if (msg.type === 'user_photo' || msg.type === 'ai_image') {
      bubble.classList.add('is-ai-image');
    } else if (msg.type === 'voice_message') {
      bubble.classList.add('is-voice-message');
    } else if (msg.type === 'transfer') {
      bubble.classList.add('is-transfer');
    } else if (typeof msg.content === 'string' && STICKER_REGEX.test(msg.content)) {
      bubble.classList.add('is-sticker');
    } else if (Array.isArray(msg.content) && msg.content[0]?.type === 'image_url') {
      bubble.classList.add('has-image');
    }
    
    // 使用安全DOM构建器构建消息内容
    const messageContent = buildMessageContent(msg, isUser);
    
    // 安全构建DOM结构，避免innerHTML的XSS风险
    const avatarGroup = document.createElement('div');
    avatarGroup.className = 'avatar-group';
    
    const avatarImg = document.createElement('img');
    avatarImg.src = avatarSrc; // 由浏览器自动转义URL
    avatarImg.className = 'avatar';
    
    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'timestamp';
    timestampSpan.textContent = this.formatTimestamp(msg.timestamp);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    // Phase 4: 替换innerHTML为安全的appendChild
    contentDiv.appendChild(messageContent);
    
    avatarGroup.appendChild(avatarImg);
    avatarGroup.appendChild(timestampSpan);
    bubble.appendChild(avatarGroup);
    bubble.appendChild(contentDiv);
    
    wrapper.appendChild(bubble);
    return wrapper;
  }

  // 时间格式化函数
  formatTimestamp(timestamp: number): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  // 聊天列表渲染
  renderChatList(): void {
    const win = window as any;
    const state: StateManager = win.STATE;
    const avatars = this.getDefaultAvatars();
    const constants = this.getConstants();
    const STICKER_REGEX = constants.STICKER_REGEX || /^(https:\/\/i\.postimg\.cc\/.+|data:image)/;
    
    if (!state?.state) {
      console.error('聊天列表渲染：状态管理不可用');
      return;
    }
    
    const chatListEl = document.getElementById('chat-list');
    if (!chatListEl) {
      console.error('聊天列表渲染：chat-list元素不存在');
      return;
    }
    
    // 安全：清空聊天列表内容
    while (chatListEl.firstChild) {
      chatListEl.removeChild(chatListEl.firstChild);
    }
    
    if (Object.keys(state.state.chats).length === 0) {
      // 安全：使用DOM构建代替innerHTML
      const emptyP = document.createElement('p');
      emptyP.style.textAlign = 'center';
      emptyP.style.color = '#8a8a8a';
      emptyP.style.marginTop = '50px';
      emptyP.textContent = '点击右上角 "+" 或群组图标添加聊天';
      chatListEl.appendChild(emptyP);
      return;
    }
    
    // 按最后消息时间排序
    Object.values(state.state.chats)
      .sort((a, b) => (b.history.slice(-1)[0]?.timestamp || 0) - (a.history.slice(-1)[0]?.timestamp || 0))
      .forEach(chat => {
        const lastMsgObj = chat.history.slice(-1)[0] || {} as Message;
        let lastMsgDisplay: string;
        
        if (lastMsgObj.type === 'transfer') {
          lastMsgDisplay = '[转账]';
        } else if (lastMsgObj.type === 'ai_image' || lastMsgObj.type === 'user_photo') {
          lastMsgDisplay = '[照片]';
        } else if (lastMsgObj.type === 'voice_message') {
          lastMsgDisplay = '[语音]';
        } else if (typeof lastMsgObj.content === 'string' && STICKER_REGEX.test(lastMsgObj.content)) {
          lastMsgDisplay = (lastMsgObj as any).meaning ? `[表情: ${(lastMsgObj as any).meaning}]` : '[表情]';
        } else if (Array.isArray(lastMsgObj.content)) {
          lastMsgDisplay = `[图片]`;
        } else {
          lastMsgDisplay = String(lastMsgObj.content || '...').substring(0, 20);
        }
        
        if (chat.isGroup && lastMsgObj.senderName) {
          lastMsgDisplay = `${lastMsgObj.senderName}: ${lastMsgDisplay}`;
        }
        
        const item = document.createElement('div');
        item.className = 'chat-list-item';
        item.dataset.chatId = chat.id;
        
        const avatar = chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar;
        
        // 安全构建聊天列表项DOM结构
        const avatarImg = document.createElement('img');
        avatarImg.src = avatar || avatars.defaultAvatar;
        avatarImg.className = 'avatar';
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'info';
        
        const nameLineDiv = document.createElement('div');
        nameLineDiv.className = 'name-line';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'name';
        nameSpan.textContent = chat.name; // 安全：使用textContent
        
        const lastMsgDiv = document.createElement('div');
        lastMsgDiv.className = 'last-msg';
        lastMsgDiv.textContent = lastMsgDisplay; // 安全：使用textContent
        
        nameLineDiv.appendChild(nameSpan);
        if (chat.isGroup) {
          const groupTagSpan = document.createElement('span');
          groupTagSpan.className = 'group-tag';
          groupTagSpan.textContent = '群聊';
          nameLineDiv.appendChild(groupTagSpan);
        }
        
        infoDiv.appendChild(nameLineDiv);
        infoDiv.appendChild(lastMsgDiv);
        
        item.appendChild(avatarImg);
        item.appendChild(infoDiv);
        
        chatListEl.appendChild(item);
      });
    
    console.log('聊天列表已渲染，共', Object.keys(state.state.chats).length, '个聊天');
  }

  // 聊天界面渲染
  renderChatInterface(chatId: string): void {
    const win = window as any;
    const state: StateManager = win.STATE;
    const constants = this.getConstants();
    const MESSAGE_RENDER_WINDOW = constants.MESSAGE_RENDER_WINDOW || 50;
    
    if (!state?.state || !state.state.chats[chatId]) {
      console.error('聊天界面渲染：聊天不存在', chatId);
      return;
    }
    
    const chat = state.state.chats[chatId];
    
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) {
      console.error('聊天界面渲染：chat-messages元素不存在');
      return;
    }
    
    messagesContainer.dataset.theme = chat.settings.theme || 'default';
    
    const headerTitle = document.getElementById('chat-header-title');
    if (headerTitle) {
      headerTitle.textContent = chat.name;
    }
    
    // 安全：清空消息容器内容
    while (messagesContainer.firstChild) {
      messagesContainer.removeChild(messagesContainer.firstChild);
    }
    
    const chatScreen = document.getElementById('chat-interface-screen');
    if (chatScreen) {
      chatScreen.style.backgroundImage = chat.settings.background ? `url(${chat.settings.background})` : 'none';
      chatScreen.style.backgroundColor = chat.settings.background ? 'transparent' : '#f0f2f5';
    }
    
    const history = chat.history;
    const totalMessages = history.length;
    currentRenderedCount = 0;
    
    // 渲染最近的消息
    const initialMessages = history.slice(-MESSAGE_RENDER_WINDOW);
    initialMessages.forEach(msg => this.appendMessage(msg, chat, true));
    currentRenderedCount = initialMessages.length;
    
    // 如果还有更多消息，添加"加载更多"按钮
    if (totalMessages > currentRenderedCount) {
      this.prependLoadMoreButton(messagesContainer);
    }
    
    // 添加输入指示器
    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'typing-indicator';
    typingIndicator.style.display = 'none';
    typingIndicator.textContent = '对方正在输入...';
    messagesContainer.appendChild(typingIndicator);
    
    // 滚动到底部
    setTimeout(() => messagesContainer.scrollTop = messagesContainer.scrollHeight, 0);
    
    console.log('聊天界面已渲染:', chat.name);
  }

  // 添加"加载更多"按钮
  prependLoadMoreButton(container: HTMLElement): void {
    const button = document.createElement('button');
    button.id = 'load-more-btn';
    button.textContent = '加载更早的记录';
    container.prepend(button);
  }

  // 加载更多消息
  loadMoreMessages(): void {
    const win = window as any;
    const state: StateManager = win.STATE;
    const constants = this.getConstants();
    const MESSAGE_RENDER_WINDOW = constants.MESSAGE_RENDER_WINDOW || 50;
    
    const messagesContainer = document.getElementById('chat-messages');
    const chat = state?.state?.chats[state.state.activeChatId!];
    
    if (!chat || !messagesContainer) return;
    
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) loadMoreBtn.remove();
    
    const totalMessages = chat.history.length;
    const nextSliceStart = totalMessages - currentRenderedCount - MESSAGE_RENDER_WINDOW;
    const nextSliceEnd = totalMessages - currentRenderedCount;
    const messagesToPrepend = chat.history.slice(Math.max(0, nextSliceStart), nextSliceEnd);
    
    const oldScrollHeight = messagesContainer.scrollHeight;
    messagesToPrepend.reverse().forEach(msg => this.prependMessage(msg, chat));
    currentRenderedCount += messagesToPrepend.length;
    
    const newScrollHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop += (newScrollHeight - oldScrollHeight);
    
    if (totalMessages > currentRenderedCount) {
      this.prependLoadMoreButton(messagesContainer);
    }
  }

  // 前置添加消息
  prependMessage(msg: Message, chat: Chat): void {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageEl = this.createMessageElement(msg, chat);
    const loadMoreBtn = document.getElementById('load-more-btn');
    
    // 绑定消息事件
    this.bindMessageEventsAfterRender(messageEl, msg);
    
    if (loadMoreBtn) {
      messagesContainer.insertBefore(messageEl, loadMoreBtn.nextSibling);
    } else {
      messagesContainer.prepend(messageEl);
    }
  }

  // 追加消息
  appendMessage(msg: Message, chat: Chat, isInitialLoad = false): void {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageEl = this.createMessageElement(msg, chat);
    const typingIndicator = document.getElementById('typing-indicator');
    
    // 绑定消息事件
    this.bindMessageEventsAfterRender(messageEl, msg);
    
    messagesContainer.insertBefore(messageEl, typingIndicator);
    
    if (!isInitialLoad) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      currentRenderedCount++;
    }
  }

  // 滚动到底部功能
  scrollToBottom(): void {
    const messagesContainer = document.getElementById('chat-messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  // 获取当前渲染数量
  getCurrentRenderedCount(): number {
    return currentRenderedCount;
  }

  // 重置渲染数量
  resetRenderedCount(): void {
    currentRenderedCount = 0;
  }

  // 为渲染后的消息元素绑定事件
  private bindMessageEventsAfterRender(messageEl: HTMLElement, msg: Message): void {
    const bubble = messageEl.querySelector('.message-bubble') as HTMLElement;
    if (bubble && msg.type !== 'pat') {
      // 获取事件处理模块
      const win = window as any;
      if (win.CHAT_MODULES?.eventsModule?.bindMessageEvents) {
        win.CHAT_MODULES.eventsModule.bindMessageEvents(messageEl, bubble, msg);
      }
    }
  }
}

// === 全局单例实例 ===
export const messageRenderModule = new MessageRenderModule();

// === 默认导出 ===
export default messageRenderModule;