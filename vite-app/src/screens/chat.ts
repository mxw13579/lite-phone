// 聊天屏幕模块 - TypeScript版本
// 处理聊天列表、聊天界面、消息管理、AI响应等核心功能

import type { Chat, Message, GlobalSettings, ApiConfig, Preset } from '../state';

// === 类型定义 ===
interface MessageRenderElement {
  element: HTMLElement;
  timestamp: number;
}

interface ParsedAiMessage {
  name?: string;
  message?: string;
  content?: string;
  type?: 'voice_message' | 'ai_image' | 'transfer';
  description?: string;
  amount?: number;
  note?: string;
  receiver?: string;
}

interface Constants {
  STICKER_REGEX: RegExp;
  DEFAULT_AVATAR: string;
  DEFAULT_MY_GROUP_AVATAR: string;
  DEFAULT_GROUP_MEMBER_AVATAR: string;
  DEFAULT_GROUP_AVATAR: string;
  MESSAGE_RENDER_WINDOW: number;
  DEFAULT_PROMPT_IMAGE: string;
  DEFAULT_PROMPT_VOICE: string;
  DEFAULT_PROMPT_TRANSFER: string;
  DEFAULT_PROMPT_SINGLE: string;
  DEFAULT_PROMPT_GROUP: string;
}

interface MusicState {
  isActive: boolean;
  activeChatId: string | null;
  currentIndex: number;
  playlist: Array<{
    name: string;
    artist: string;
  }>;
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
  musicState: MusicState;
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

// === 模块状态变量 ===
let isSelectionMode = false;
let selectedMessages = new Set<number>();
let isMessageEditMode = false;
let editingMemberId: string | null = null;
let editingPersonaPresetId: string | null = null;
let currentRenderedCount = 0;

// === 聊天核心模块类 ===
export class ChatScreenModule {
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
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
    
    if (!chatInput || !state || !db) return;
    
    const content = chatInput.value.trim();
    if (!content || !state.state.activeChatId) return;
    
    const chat = state.state.chats[state.state.activeChatId];
    if (!chat) return;
    
    const msg: Message = {
      role: 'user',
      content,
      timestamp: Date.now()
    };
    
    // 添加消息到聊天历史
    chat.history.push(msg);
    await db.db.chats.put(chat);
    
    // 渲染消息并更新界面
    this.appendMessage(msg, chat);
    this.renderChatList();
    
    // 清空输入框并重置高度
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatInput.focus();
  }

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

    bubble.addEventListener('dblclick', () => {
      // 编辑模式下禁止拍一拍
      if (isMessageEditMode) return;
      this.handlePat(msg);
    });

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
    
    this.addLongPressListener(bubble, () => this.enterSelectionMode(msg.timestamp));
    bubble.addEventListener('click', () => {
      if (isSelectionMode) this.toggleMessageSelection(msg.timestamp);
    });
    
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

  // 长按监听器
  addLongPressListener(element: HTMLElement, callback: (e: Event) => void): void {
    let pressTimer: number;
    const startPress = (e: Event) => {
      if (isSelectionMode) return;
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

  // 拍一拍功能
  async handlePat(msg: Message): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    
    if (isSelectionMode || !state?.state?.activeChatId) return;
    
    const chat = state.state.chats[state.state.activeChatId];
    const patterName = chat.isGroup ? (chat.settings.myNickname || '我') : '你';
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
    if (chat.isGroup && msg.role === 'user' && chat.settings.myNickname === msg.senderName) {
      patteeName = '自己';
    }

    const patMessageContent = `${patterName}拍了拍${patteeName}${patteeSuffix || ''}`;

    const patMessage: Message = {
      type: 'pat',
      content: patMessageContent,
      timestamp: Date.now(),
      role: 'user'
    };

    chat.history.push(patMessage);
    await db.db.chats.put(chat);
    this.appendMessage(patMessage, chat);
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
        
        item.addEventListener('click', async () => {
          this.openChat(chat.id);
        });
        
        this.addLongPressListener(item, async (e) => {
          const confirmed = await this.showCustomConfirm('删除对话', `确定要删除与 "${chat.name}" 的整个对话吗？此操作不可撤销。`, {confirmButtonClass: 'btn-danger'});
          if (confirmed) {
            try {
              const musicState = state.musicState;
              if (musicState?.isActive && musicState.activeChatId === chat.id) {
                await this.endListenTogetherSession(false);
              }
              delete state.state.chats[chat.id];
              if (state.state.activeChatId === chat.id) state.state.activeChatId = null;
              await win.DB.db.chats.delete(chat.id);
              this.renderChatList();
            } catch (error) {
              console.error("删除聊天失败:", error);
              alert("删除失败，请稍后再试。");
            }
          }
        });
        
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
    this.exitSelectionMode();
    
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
    button.addEventListener('click', () => this.loadMoreMessages());
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

  // 打开聊天
  openChat(chatId: string): void {
    const win = window as any;
    const state: StateManager = win.STATE;
    if (!state) return;
    
    state.setActiveChatId(chatId);
    this.renderChatInterface(chatId);
    
    if (win.showScreen) {
      win.showScreen('chat-interface-screen');
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

  // 选择模式管理
  enterSelectionMode(initialMsgTimestamp: number): void {
    if (isMessageEditMode) {
      this.exitMessageEditMode(false);
    }
    if (isSelectionMode) return;
    
    isSelectionMode = true;
    const chatScreen = document.getElementById('chat-interface-screen');
    if (chatScreen) {
      chatScreen.classList.add('selection-mode');
    }
    this.toggleMessageSelection(initialMsgTimestamp);
  }

  exitSelectionMode(): void {
    if (!isSelectionMode) return;
    
    isSelectionMode = false;
    const chatScreen = document.getElementById('chat-interface-screen');
    if (chatScreen) {
      chatScreen.classList.remove('selection-mode');
    }
    
    selectedMessages.forEach(ts => {
      const bubble = document.querySelector(`.message-bubble[data-timestamp="${ts}"]`);
      if (bubble) bubble.classList.remove('selected');
    });
    selectedMessages.clear();
  }

  toggleMessageSelection(timestamp: number): void {
    const bubble = document.querySelector(`.message-bubble[data-timestamp="${timestamp}"]`);
    if (!bubble) return;
    
    if (selectedMessages.has(timestamp)) {
      selectedMessages.delete(timestamp);
      bubble.classList.remove('selected');
    } else {
      selectedMessages.add(timestamp);
      bubble.classList.add('selected');
    }
    
    const selectionCount = document.getElementById('selection-count');
    if (selectionCount) {
      selectionCount.textContent = `已选 ${selectedMessages.size} 条`;
    }
    
    if (selectedMessages.size === 0) {
      this.exitSelectionMode();
    }
  }

  // 消息编辑模式
  async exitMessageEditMode(shouldSave = false): Promise<void> {
    if (!isMessageEditMode) return;

    const editBtnImg = document.querySelector('#edit-messages-btn img') as HTMLImageElement;
    if (editBtnImg) {
      editBtnImg.src = 'https://i.postimg.cc/V60TWbGr/image.png'; // Edit icon
      editBtnImg.alt = '编辑';
    }
    
    const editBtn = document.querySelector('#edit-messages-btn') as HTMLElement;
    if (editBtn) {
      editBtn.title = '编辑消息';
    }

    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    let changesMade = false;

    if (shouldSave && state?.state && db) {
      const chat = state.state.chats[state.state.activeChatId!];
      if (chat) {
        document.querySelectorAll('.message-bubble .content.editable').forEach(contentEl => {
          const timestamp = parseInt((contentEl.closest('.message-bubble') as HTMLElement).dataset.timestamp!, 10);
          const newContent = (contentEl as HTMLElement).innerHTML;

          const message = chat.history.find(msg => msg.timestamp === timestamp);
          if (message && message.content !== newContent) {
            message.content = newContent;
            changesMade = true;
          }
        });

        if (changesMade) {
          await db.db.chats.put(chat);
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

    isMessageEditMode = false;
  }

  enterMessageEditMode(): void {
    if (isMessageEditMode) return;

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
    
    isMessageEditMode = true;
    
    const win = window as any;
    if (win.showCustomAlert) {
      win.showCustomAlert('进入编辑模式', '您现在可以点击消息气泡来编辑其内容。完成后，请再次点击"保存"按钮。');
    }
  }

  async toggleMessageEditMode(): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    if (!state?.state?.activeChatId) return;

    if (isMessageEditMode) {
      await this.exitMessageEditMode(true); // Exit and save
    } else {
      this.enterMessageEditMode(); // Enter
    }
  }

  // 表情包面板渲染
  renderStickerPanel(): void {
    const win = window as any;
    const state: StateManager = win.STATE;
    if (!state?.state) return;
    
    const grid = document.getElementById('sticker-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (state.state.userStickers.length === 0) {
      grid.innerHTML = '<p style="text-align:center; color: var(--text-secondary); grid-column: 1 / -1;">大人请点击右上角"添加"或"上传"来添加你的第一个表情吧！</p>';
      return;
    }
    
    state.state.userStickers.forEach(sticker => {
      const item = document.createElement('div');
      item.className = 'sticker-item';
      item.style.backgroundImage = `url(${sticker.url})`;
      item.title = sticker.name;
      item.addEventListener('click', () => this.sendSticker(sticker));
      
      this.addLongPressListener(item, () => {
        if (isSelectionMode) return;
        const existingDeleteBtn = item.querySelector('.delete-btn');
        if (existingDeleteBtn) return;
        
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.onclick = async (e) => {
          e.stopPropagation();
          const confirmed = await this.showCustomConfirm('删除表情', `确定要删除表情 "${sticker.name}" 吗？`, {confirmButtonClass: 'btn-danger'});
          if (confirmed) {
            await win.DB.db.userStickers.delete(sticker.id);
            state.state.userStickers = state.state.userStickers.filter(s => s.id !== sticker.id);
            this.renderStickerPanel();
          }
        };
        item.appendChild(deleteBtn);
        deleteBtn.style.display = 'block';
        setTimeout(() => item.addEventListener('mouseleave', () => deleteBtn.remove(), {once: true}), 3000);
      });
      
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
      role: 'user', 
      content: sticker.url, 
      meaning: sticker.name, 
      timestamp: Date.now()
    };
    
    chat.history.push(msg);
    await db.db.chats.put(chat);
    this.appendMessage(msg, chat);
    this.renderChatList();
    
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
      alert('请输入有效的金额 (0 到 9999 之间)！');
      return;
    }
    
    const chat = state.state.chats[state.state.activeChatId];
    const senderName = chat.isGroup ? (chat.settings.myNickname || '我') : '我';
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
    await db.db.chats.put(chat);
    this.appendMessage(msg, chat);
    this.renderChatList();
    
    const transferModal = document.getElementById('transfer-modal');
    if (transferModal) {
      transferModal.classList.remove('visible');
    }
    
    amountInput.value = '';
    noteInput.value = '';
  }

  // AI响应触发 - 委托给专用的AI响应模块
  async triggerAiResponse(): Promise<void> {
    const win = window as any;
    console.log('Chat模块：委托给AI响应模块处理');
    
    // 使用专用的AI响应模块处理所有逻辑
    if (win.SCREENS?.aiResponseModule?.triggerAiResponse) {
      return await win.SCREENS.aiResponseModule.triggerAiResponse();
    } else {
      console.error('AI响应模块未找到，请检查模块加载');
      alert('AI响应功能暂时不可用，请刷新页面重试');
    }
  }

  // 辅助函数
  private async showCustomConfirm(title: string, message: string, options: any = {}): Promise<boolean> {
    const win = window as any;
    if (win.showCustomConfirm) {
      return win.showCustomConfirm(title, message, options);
    }
    return confirm(message);
  }

  private showCustomAlert(title: string, message: string): void {
    const win = window as any;
    if (win.showCustomAlert) {
      win.showCustomAlert(title, message);
    } else {
      alert(message);
    }
  }

  private async endListenTogetherSession(saveState = true): Promise<void> {
    const win = window as any;
    if (win.endListenTogetherSession) {
      return win.endListenTogetherSession(saveState);
    }
  }

  private showNotification(chatId: string, messageContent: string): void {
    const win = window as any;
    if (win.UIService && win.UIService.showNotification) {
      win.UIService.showNotification(chatId, messageContent);
    }
  }

  // 模块状态访问器
  getIsSelectionMode(): boolean {
    return isSelectionMode;
  }

  getSelectedMessages(): Set<number> {
    return new Set(selectedMessages);
  }

  getIsMessageEditMode(): boolean {
    return isMessageEditMode;
  }

  getCurrentRenderedCount(): number {
    return currentRenderedCount;
  }
}

// === 全局单例实例 ===
export const chatScreenModule = new ChatScreenModule();

// === 向后兼容：注入到window对象 ===
declare global {
  interface Window {
    ChatModule: ChatScreenModule;
    // 聊天核心API
    renderChatList: () => void;
    renderChatInterface: (chatId: string) => void;
    openChat: (chatId: string) => void;
    createMessageElement: (msg: Message, chat: Chat) => HTMLElement;
    appendMessage: (msg: Message, chat: Chat, isInitialLoad?: boolean) => void;
    formatTimestamp: (timestamp: number) => string;
    // AI响应API
    triggerAiResponse: () => Promise<void>;
    parseAiResponse: (content: string) => string[];
    // 消息交互API
    handlePat: (msg: Message) => Promise<void>;
    enterSelectionMode: (timestamp: number) => void;
    exitSelectionMode: () => void;
    toggleMessageSelection: (timestamp: number) => void;
    // 编辑模式API
    enterMessageEditMode: () => void;
    exitMessageEditMode: (shouldSave?: boolean) => Promise<void>;
    toggleMessageEditMode: () => Promise<void>;
    // 表情包API
    renderStickerPanel: () => void;
    sendSticker: (sticker: { id: string; url: string; name: string }) => Promise<void>;
    // 转账API
    sendUserTransfer: () => Promise<void>;
    // 状态访问API
    getIsSelectionMode: () => boolean;
    getSelectedMessages: () => Set<number>;
    getIsMessageEditMode: () => boolean;
    getCurrentRenderedCount: () => number;
  }
}

// 注入到window对象，保持向后兼容性
if (typeof window !== 'undefined') {
  const win = window as any;
  
  // 主模块实例
  win.ChatModule = chatScreenModule;
  
  // 聊天核心API
  win.renderChatList = () => chatScreenModule.renderChatList();
  win.renderChatInterface = (chatId: string) => chatScreenModule.renderChatInterface(chatId);
  win.openChat = (chatId: string) => chatScreenModule.openChat(chatId);
  win.createMessageElement = (msg: Message, chat: Chat) => chatScreenModule.createMessageElement(msg, chat);
  win.appendMessage = (msg: Message, chat: Chat, isInitialLoad?: boolean) => chatScreenModule.appendMessage(msg, chat, isInitialLoad);
  win.formatTimestamp = (timestamp: number) => chatScreenModule.formatTimestamp(timestamp);
  
  // AI响应API
  win.triggerAiResponse = () => chatScreenModule.triggerAiResponse();
  win.parseAiResponse = (content: string) => chatScreenModule.parseAiResponse(content);
  
  // 消息交互API
  win.handlePat = (msg: Message) => chatScreenModule.handlePat(msg);
  win.enterSelectionMode = (timestamp: number) => chatScreenModule.enterSelectionMode(timestamp);
  win.exitSelectionMode = () => chatScreenModule.exitSelectionMode();
  win.toggleMessageSelection = (timestamp: number) => chatScreenModule.toggleMessageSelection(timestamp);
  
  // 编辑模式API
  win.enterMessageEditMode = () => chatScreenModule.enterMessageEditMode();
  win.exitMessageEditMode = (shouldSave?: boolean) => chatScreenModule.exitMessageEditMode(shouldSave);
  win.toggleMessageEditMode = () => chatScreenModule.toggleMessageEditMode();
  
  // 表情包API
  win.renderStickerPanel = () => chatScreenModule.renderStickerPanel();
  win.sendSticker = (sticker: any) => chatScreenModule.sendSticker(sticker);
  
  // 转账API
  win.sendUserTransfer = () => chatScreenModule.sendUserTransfer();
  
  // 状态访问API
  win.getIsSelectionMode = () => chatScreenModule.getIsSelectionMode();
  win.getSelectedMessages = () => chatScreenModule.getSelectedMessages();
  win.getIsMessageEditMode = () => chatScreenModule.getIsMessageEditMode();
  win.getCurrentRenderedCount = () => chatScreenModule.getCurrentRenderedCount();
}

// 默认导出
export default {
  chatScreenModule,
  ChatScreenModule
};

console.log('聊天模块(TypeScript版)已初始化');