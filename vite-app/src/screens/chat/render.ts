// 消息渲染模块 - 负责消息列表渲染、滚动管理和DOM更新
// 提取自 chat.ts 的消息渲染相关功能

import type { Chat, Message, GlobalSettings } from '../../state';

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
      wrapper.innerHTML = `<span>${msg.content}</span>`;
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
    
    let contentHtml: string;
    if (msg.type === 'user_photo' || msg.type === 'ai_image') {
      bubble.classList.add('is-ai-image');
      const altText = msg.type === 'user_photo' ? "用户描述的照片" : "AI生成的图片";
      contentHtml = `<img src="https://i.postimg.cc/KYr2qRCK/1.jpg" class="ai-generated-image" alt="${altText}" data-description="${msg.content}">`;
    } else if (msg.type === 'voice_message') {
      bubble.classList.add('is-voice-message');
      const duration = Math.max(1, Math.round((String(msg.content) || '').length / 5));
      const durationFormatted = `0:${String(duration).padStart(2, '0')}''`;
      const waveformHTML = '<div></div><div></div><div></div><div></div><div></div>';
      contentHtml = `<div class="voice-message-body" data-text="${msg.content}"><div class="voice-waveform">${waveformHTML}</div><span class="voice-duration">${durationFormatted}</span></div>`;
    } else if (msg.type === 'transfer') {
      bubble.classList.add('is-transfer');
      const titleText = isUser ? '转账给Ta' : '收到一笔转账';
      const heartIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: middle;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`;
      contentHtml = `<div class="transfer-card"><div class="transfer-title">${heartIcon} ${titleText}</div><div class="transfer-amount">¥ ${Number((msg as any).amount).toFixed(2)}</div><div class="transfer-note">${(msg as any).note || '对方没有留下备注哦~'}</div></div>`;
    } else if (typeof msg.content === 'string' && STICKER_REGEX.test(msg.content)) {
      bubble.classList.add('is-sticker');
      contentHtml = `<img src="${msg.content}" alt="${(msg as any).meaning || 'Sticker'}" class="sticker-image">`;
    } else if (Array.isArray(msg.content) && msg.content[0]?.type === 'image_url') {
      bubble.classList.add('has-image');
      const imageUrl = msg.content[0].image_url.url;
      contentHtml = `<img src="${imageUrl}" class="chat-image" alt="User uploaded image">`;
    } else {
      contentHtml = String(msg.content || '').replace(/\n/g, '<br>');
    }
    
    bubble.innerHTML = `<div class="avatar-group"><img src="${avatarSrc}" class="avatar"><span class="timestamp">${this.formatTimestamp(msg.timestamp)}</span></div><div class="content">${contentHtml}</div>`;
    
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
    
    chatListEl.innerHTML = '';
    
    if (Object.keys(state.state.chats).length === 0) {
      chatListEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 或群组图标添加聊天</p>';
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
        item.innerHTML = `<img src="${avatar || avatars.defaultAvatar}" class="avatar"><div class="info"><div class="name-line"><span class="name">${chat.name}</span>${chat.isGroup ? '<span class="group-tag">群聊</span>' : ''}</div><div class="last-msg">${lastMsgDisplay}</div></div>`;
        
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
    
    messagesContainer.innerHTML = '';
    
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
}

// === 全局单例实例 ===
export const messageRenderModule = new MessageRenderModule();

// === 默认导出 ===
export default messageRenderModule;