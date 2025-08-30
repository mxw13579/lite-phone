// 聊天模块统一导出文件 - Barrel Export Pattern
// 整合所有聊天相关子模块，保持向后兼容性

// === 子模块导入 ===
import { messageRenderModule, MessageRenderModule } from './render';
import { eventHandlerModule, EventHandlerModule } from './events';
import { messageComposerModule, MessageComposerModule } from './composer';
import { attachmentHandlerModule, AttachmentHandlerModule } from './attachments';
import { voicePlaybackModule, VoicePlaybackModule } from './playback';

// === 类型导入 ===
import type { Chat, Message } from '../../state';

// === 模块状态变量 ===
let isSelectionMode = false;
let selectedMessages = new Set<number>();
let isMessageEditMode = false;

// === 聊天核心模块类 - 整合版本 ===
export class ChatScreenModule {
  // 子模块实例
  public renderModule: MessageRenderModule;
  public eventsModule: EventHandlerModule;
  public composerModule: MessageComposerModule;
  public attachmentsModule: AttachmentHandlerModule;
  public playbackModule: VoicePlaybackModule;

  constructor() {
    this.renderModule = messageRenderModule;
    this.eventsModule = eventHandlerModule;
    this.composerModule = messageComposerModule;
    this.attachmentsModule = attachmentHandlerModule;
    this.playbackModule = voicePlaybackModule;
  }

  // === 初始化方法 ===
  initListeners(): void {
    this.eventsModule.initListeners();
    this.attachmentsModule.bindImagePreviewEvents();
    this.playbackModule.initVoicePlayback();
  }

  // === 渲染相关API - 委托给render模块 ===
  createMessageElement(msg: Message, chat: Chat): HTMLElement {
    const element = this.renderModule.createMessageElement(msg, chat);
    
    // 为消息元素绑定事件
    const bubble = element.querySelector('.message-bubble') as HTMLElement;
    if (bubble) {
      this.eventsModule.bindMessageEvents(element, bubble, msg);
    }
    
    return element;
  }

  formatTimestamp(timestamp: number): string {
    return this.renderModule.formatTimestamp(timestamp);
  }

  renderChatList(): void {
    this.renderModule.renderChatList();
    
    // 为聊天列表项绑定事件
    const win = window as any;
    const state = win.STATE;
    if (state?.state) {
      document.querySelectorAll('.chat-list-item').forEach(item => {
        const chatId = (item as HTMLElement).dataset.chatId;
        if (chatId && state.state.chats[chatId]) {
          this.eventsModule.bindChatListItemEvents(item as HTMLElement, state.state.chats[chatId]);
        }
      });
    }
  }

  renderChatInterface(chatId: string): void {
    this.exitSelectionMode();
    this.renderModule.renderChatInterface(chatId);
  }

  appendMessage(msg: Message, chat: Chat, isInitialLoad = false): void {
    this.renderModule.appendMessage(msg, chat, isInitialLoad);
  }

  prependMessage(msg: Message, chat: Chat): void {
    this.renderModule.prependMessage(msg, chat);
  }

  loadMoreMessages(): void {
    this.renderModule.loadMoreMessages();
  }

  // === 聊天导航API ===
  openChat(chatId: string): void {
    const win = window as any;
    const state = win.STATE;
    if (!state) return;
    
    state.setActiveChatId(chatId);
    this.renderChatInterface(chatId);
    
    if (win.showScreen) {
      win.showScreen('chat-interface-screen');
    }
  }

  // === 消息交互API - 委托给composer模块 ===
  async handlePat(msg: Message): Promise<void> {
    return this.composerModule.handlePat(msg);
  }

  parseAiResponse(content: string): string[] {
    return this.composerModule.parseAiResponse(content);
  }

  async triggerAiResponse(): Promise<void> {
    return this.composerModule.triggerAiResponse();
  }

  // === 选择模式API ===
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

  // === 编辑模式API - 委托给composer模块 ===
  async exitMessageEditMode(shouldSave = false): Promise<void> {
    await this.composerModule.exitMessageEditMode(shouldSave);
    isMessageEditMode = false;
  }

  enterMessageEditMode(): void {
    this.composerModule.enterMessageEditMode();
    isMessageEditMode = true;
  }

  async toggleMessageEditMode(): Promise<void> {
    if (isMessageEditMode) {
      await this.exitMessageEditMode(true); // Exit and save
    } else {
      this.enterMessageEditMode(); // Enter
    }
  }

  // === 表情包API - 委托给composer模块 ===
  renderStickerPanel(): void {
    this.composerModule.renderStickerPanel();
    
    // 为表情包项绑定事件
    document.querySelectorAll('.sticker-item').forEach(item => {
      const win = window as any;
      const state = win.STATE;
      const url = (item as HTMLElement).style.backgroundImage.match(/url\("(.+)"\)/)?.[1];
      const name = (item as HTMLElement).title;
      if (url && name) {
        const sticker = state.state.userStickers.find((s: any) => s.url === url && s.name === name);
        if (sticker) {
          this.eventsModule.bindStickerItemEvents(item as HTMLElement, sticker);
        }
      }
    });
  }

  async sendSticker(sticker: { id: string; url: string; name: string }): Promise<void> {
    return this.composerModule.sendSticker(sticker);
  }

  // === 转账API - 委托给composer模块 ===
  async sendUserTransfer(): Promise<void> {
    return this.composerModule.sendUserTransfer();
  }

  // === 附件API - 委托给attachments模块 ===
  async handleImageSelect(callback?: (imageDataUrl: string) => void): Promise<void> {
    return this.attachmentsModule.handleImageSelect(callback);
  }

  async addStickerFromFile(): Promise<void> {
    return this.attachmentsModule.addStickerFromFile();
  }

  async addStickerFromUrl(): Promise<void> {
    return this.attachmentsModule.addStickerFromUrl();
  }

  // === 语音API - 委托给playback模块 ===
  async playVoiceMessage(element: HTMLElement, text: string, timestamp: number): Promise<void> {
    return this.playbackModule.playVoiceMessage(element, text, timestamp);
  }

  async startVoiceRecording(): Promise<void> {
    return this.playbackModule.startVoiceRecording();
  }

  // === 状态访问API ===
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
    return this.renderModule.getCurrentRenderedCount();
  }
}

// === 全局单例实例 ===
export const chatScreenModule = new ChatScreenModule();

// === 向后兼容：注入到window对象 ===
declare global {
  interface Window {
    ChatModule: ChatScreenModule;
    CHAT_MODULES: {
      renderModule: MessageRenderModule;
      eventsModule: EventHandlerModule;
      composerModule: MessageComposerModule;
      attachmentsModule: AttachmentHandlerModule;
      playbackModule: VoicePlaybackModule;
    };
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
    // 附件API
    handleImageSelect: (callback?: (imageDataUrl: string) => void) => Promise<void>;
    addStickerFromFile: () => Promise<void>;
    addStickerFromUrl: () => Promise<void>;
    // 语音API
    playVoiceMessage: (element: HTMLElement, text: string, timestamp: number) => Promise<void>;
    startVoiceRecording: () => Promise<void>;
    // 状态访问API
    getIsSelectionMode: () => boolean;
    getSelectedMessages: () => Set<number>;
    getIsMessageEditMode: () => boolean;
    getCurrentRenderedCount: () => number;
    setIsMessageEditMode: (mode: boolean) => void;
  }
}

// 注入到window对象，保持向后兼容性
if (typeof window !== 'undefined') {
  const win = window as any;
  
  // 主模块实例
  win.ChatModule = chatScreenModule;
  
  // 子模块访问
  win.CHAT_MODULES = {
    renderModule: messageRenderModule,
    eventsModule: eventHandlerModule,
    composerModule: messageComposerModule,
    attachmentsModule: attachmentHandlerModule,
    playbackModule: voicePlaybackModule
  };
  
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
  
  // 附件API
  win.handleImageSelect = (callback?: (imageDataUrl: string) => void) => chatScreenModule.handleImageSelect(callback);
  win.addStickerFromFile = () => chatScreenModule.addStickerFromFile();
  win.addStickerFromUrl = () => chatScreenModule.addStickerFromUrl();
  
  // 语音API
  win.playVoiceMessage = (element: HTMLElement, text: string, timestamp: number) => chatScreenModule.playVoiceMessage(element, text, timestamp);
  win.startVoiceRecording = () => chatScreenModule.startVoiceRecording();
  
  // 状态访问API
  win.getIsSelectionMode = () => chatScreenModule.getIsSelectionMode();
  win.getSelectedMessages = () => chatScreenModule.getSelectedMessages();
  win.getIsMessageEditMode = () => chatScreenModule.getIsMessageEditMode();
  win.getCurrentRenderedCount = () => chatScreenModule.getCurrentRenderedCount();
  
  // 状态设置API (内部使用)
  win.setIsMessageEditMode = (mode: boolean) => {
    isMessageEditMode = mode;
  };
}

// === 子模块导出 ===
export {
  messageRenderModule,
  eventHandlerModule,
  messageComposerModule,
  attachmentHandlerModule,
  voicePlaybackModule
};

export {
  MessageRenderModule,
  EventHandlerModule,
  MessageComposerModule,
  AttachmentHandlerModule,
  VoicePlaybackModule
};

// === 默认导出 ===
export default {
  chatScreenModule,
  ChatScreenModule,
  messageRenderModule,
  eventHandlerModule,
  messageComposerModule,
  attachmentHandlerModule,
  voicePlaybackModule
};

console.log('聊天模块(拆分版TypeScript版)已初始化');
console.log('子模块已成功加载:', {
  render: !!messageRenderModule,
  events: !!eventHandlerModule,
  composer: !!messageComposerModule,
  attachments: !!attachmentHandlerModule,
  playback: !!voicePlaybackModule
});