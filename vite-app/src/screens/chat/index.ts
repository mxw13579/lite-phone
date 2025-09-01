// 聊天模块统一导出文件 - Barrel Export Pattern
// 整合所有聊天相关子模块，保持向后兼容性
// Phase 3: 状态统一改造 - 使用STATE模块统一管理临时状态

// === 子模块导入 ===
import { messageRenderModule, MessageRenderModule } from './render';
import { eventHandlerModule, EventHandlerModule } from './events';
import { messageComposerModule, MessageComposerModule } from './composer';
import { attachmentHandlerModule, AttachmentHandlerModule } from './attachments';
import { voicePlaybackModule, VoicePlaybackModule } from './playback';
import STATE from '../../state';

// === 类型导入 ===
import type { Chat, Message } from '../../state';

// === 聊天核心模块类 - 整合版本（Phase 3: 状态已统一到STATE模块）===
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
    
    // 验证 chatId 和聊天是否存在
    if (!chatId || !state.state.chats[chatId]) {
      console.error('openChat: 聊天不存在', chatId);
      return;
    }
    
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
    if (STATE.isMessageEditMode) {
      this.exitMessageEditMode(false);
    }
    if (STATE.isSelectionMode) return;
    
    STATE.setSelectionMode(true);
    const chatScreen = document.getElementById('chat-interface-screen');
    if (chatScreen) {
      chatScreen.classList.add('selection-mode');
    }
    this.toggleMessageSelection(initialMsgTimestamp);
  }

  exitSelectionMode(): void {
    if (!STATE.isSelectionMode) return;
    
    STATE.setSelectionMode(false);
    const chatScreen = document.getElementById('chat-interface-screen');
    if (chatScreen) {
      chatScreen.classList.remove('selection-mode');
    }
    
    STATE.getSelectedMessages().forEach(ts => {
      const bubble = document.querySelector(`.message-bubble[data-timestamp="${ts}"]`);
      if (bubble) bubble.classList.remove('selected');
    });
    STATE.clearSelectedMessages();
  }

  toggleMessageSelection(timestamp: number): void {
    const bubble = document.querySelector(`.message-bubble[data-timestamp="${timestamp}"]`);
    if (!bubble) return;
    
    if (STATE.getSelectedMessages().has(timestamp)) {
      STATE.removeSelectedMessage(timestamp);
      bubble.classList.remove('selected');
    } else {
      STATE.addSelectedMessage(timestamp);
      bubble.classList.add('selected');
    }
    
    const selectionCount = document.getElementById('selection-count');
    if (selectionCount) {
      selectionCount.textContent = `已选 ${STATE.getSelectedMessageCount()} 条`;
    }
    
    if (STATE.getSelectedMessageCount() === 0) {
      this.exitSelectionMode();
    }
  }

  // === 编辑模式API - 委托给composer模块 ===
  async exitMessageEditMode(shouldSave = false): Promise<void> {
    await this.composerModule.exitMessageEditMode(shouldSave);
    STATE.setMessageEditMode(false);
  }

  enterMessageEditMode(): void {
    this.composerModule.enterMessageEditMode();
    STATE.setMessageEditMode(true);
  }

  async toggleMessageEditMode(): Promise<void> {
    if (STATE.isMessageEditMode) {
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
    return STATE.isSelectionMode;
  }

  getSelectedMessages(): Set<number> {
    return STATE.getSelectedMessages();
  }

  getIsMessageEditMode(): boolean {
    return STATE.isMessageEditMode;
  }

  getCurrentRenderedCount(): number {
    return this.renderModule.getCurrentRenderedCount();
  }
}

// === 全局单例实例 ===
export const chatScreenModule = new ChatScreenModule();

// === 向后兼容：已统一迁移到init/compat.ts ===

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