import { messageRenderModule, MessageRenderModule } from './render';
import { eventHandlerModule, EventHandlerModule } from './events';
import { messageComposerModule, MessageComposerModule } from './composer';
import { attachmentHandlerModule, AttachmentHandlerModule } from './attachments';
import { voicePlaybackModule, VoicePlaybackModule } from './playback';
import STATE from '../../state';
import type { Chat, Message } from '../../state';

type Deps = {
  render?: MessageRenderModule;
  events?: EventHandlerModule;
  composer?: MessageComposerModule;
  attachments?: AttachmentHandlerModule;
  playback?: VoicePlaybackModule;
};

export class ChatScreenModule {
  public readonly renderModule: MessageRenderModule;
  public readonly eventsModule: EventHandlerModule;
  public readonly composerModule: MessageComposerModule;
  public readonly attachmentsModule: AttachmentHandlerModule;
  public readonly playbackModule: VoicePlaybackModule;

  // 缓存常用 DOM 节点，减少重复查询
  private chatScreenEl: HTMLElement | null = null;
  private selectionCountEl: HTMLElement | null = null;

  // 依赖注入，便于测试与替换；默认使用单例
  constructor(deps: Deps = {}) {
    this.renderModule = deps.render ?? messageRenderModule;
    this.eventsModule = deps.events ?? eventHandlerModule;
    this.composerModule = deps.composer ?? messageComposerModule;
    this.attachmentsModule = deps.attachments ?? attachmentHandlerModule;
    this.playbackModule = deps.playback ?? voicePlaybackModule;

    // 首次缓存
    this.chatScreenEl = document.getElementById('chat-interface-screen');
    this.selectionCountEl = document.getElementById('selection-count');
  }

  // === 初始化方法 ===
  initListeners(): void {
    this.eventsModule.initListeners();
    this.attachmentsModule.bindImagePreviewEvents();
    this.playbackModule.initVoicePlayback();
  }

  // === 渲染相关API ===
  createMessageElement(msg: Message, chat: Chat): HTMLElement {
    const element = this.renderModule.createMessageElement(msg, chat);

    // 委托事件绑定；空值保护
    const bubble = element.querySelector<HTMLElement>('.message-bubble');
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

    // 改用导入的 STATE，避免依赖 window
    const chats = STATE.state?.chats;
    if (!chats) return;

    // 减少状态读取与断言
    document.querySelectorAll<HTMLElement>('.chat-list-item').forEach(item => {
      const chatId = item.dataset.chatId as string | undefined;
      if (!chatId) return;
      const chat = chats[chatId];
      if (!chat) return;
      this.eventsModule.bindChatListItemEvents(item, chat);
    });
  }

  renderChatInterface(chatId: string): void {
    this.exitSelectionMode();
    this.renderModule.renderChatInterface(chatId);

    // 渲染后刷新缓存（可能节点被重新创建）
    this.chatScreenEl = document.getElementById('chat-interface-screen');
    this.selectionCountEl = document.getElementById('selection-count');
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
    if (!chatId) {
      console.error('openChat: chatId 无效');
      return;
    }
    const chats = STATE.state?.chats;
    if (!chats || !chats[chatId]) {
      console.error('openChat: 聊天不存在', { chatId });
      return;
    }

    STATE.setActiveChatId(chatId);
    this.renderChatInterface(chatId);

    // 向后兼容可能存在的全局屏幕切换
    const win = window as any;
    if (typeof win?.showScreen === 'function') {
      win.showScreen('chat-interface-screen');
    }
  }

  // === 消息交互API ===
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
      // 不保存，先退出编辑
      void this.exitMessageEditMode(false);
    }
    if (STATE.isSelectionMode) return;

    STATE.setSelectionMode(true);
    this.chatScreenEl ??= document.getElementById('chat-interface-screen');
    this.chatScreenEl?.classList.add('selection-mode');

    this.toggleMessageSelection(initialMsgTimestamp);
  }

  exitSelectionMode(): void {
    if (!STATE.isSelectionMode) return;

    STATE.setSelectionMode(false);
    this.chatScreenEl ??= document.getElementById('chat-interface-screen');
    this.chatScreenEl?.classList.remove('selection-mode');

    // 批量取消选中，减少多余计算
    const selected = Array.from(STATE.getSelectedMessages());
    if (selected.length) {
      const selector = selected.map(ts => `.message-bubble[data-timestamp="${ts}"]`).join(',');
      if (selector) {
        document.querySelectorAll<HTMLElement>(selector).forEach(b => b.classList.remove('selected'));
      }
    }
    STATE.clearSelectedMessages();

    // 清空计数
    this.selectionCountEl ??= document.getElementById('selection-count');
    if (this.selectionCountEl) this.selectionCountEl.textContent = '已选 0 条';
  }

  toggleMessageSelection(timestamp: number): void {
    const bubble = document.querySelector<HTMLElement>(`.message-bubble[data-timestamp="${timestamp}"]`);
    if (!bubble) return;

    const already = STATE.getSelectedMessages().has(timestamp);
    if (already) {
      STATE.removeSelectedMessage(timestamp);
      bubble.classList.remove('selected');
    } else {
      STATE.addSelectedMessage(timestamp);
      bubble.classList.add('selected');
    }

    // 只读取一次计数
    const count = STATE.getSelectedMessageCount();

    this.selectionCountEl ??= document.getElementById('selection-count');
    if (this.selectionCountEl) {
      this.selectionCountEl.textContent = `已选 ${count} 条`;
    }

    if (count === 0) {
      this.exitSelectionMode();
    }
  }

  // === 编辑模式API ===
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
      await this.exitMessageEditMode(true);
    } else {
      this.enterMessageEditMode();
    }
  }

  // === 表情包API ===
  renderStickerPanel(): void {
    this.composerModule.renderStickerPanel();

    const stickers = STATE.state?.userStickers ?? [];
    if (!stickers.length) return;

    document.querySelectorAll<HTMLElement>('.sticker-item').forEach(item => {
      const styleBg = item.style.backgroundImage;
      const url = styleBg.match(/url\("(.+)"\)/)?.[1];
      const name = item.title;
      if (!url || !name) return;

      // O(n) 查找保持不变；小集合可接受
      const sticker = stickers.find((s: any) => s.url === url && s.name === name);
      if (sticker) {
        this.eventsModule.bindStickerItemEvents(item, sticker);
      }
    });
  }

  async sendSticker(sticker: { id: string; url: string; name: string }): Promise<void> {
    return this.composerModule.sendSticker(sticker);
  }

  // === 转账API ===
  async sendUserTransfer(): Promise<void> {
    return this.composerModule.sendUserTransfer();
  }

  // === 附件API ===
  async handleImageSelect(callback?: (imageDataUrl: string) => void): Promise<void> {
    return this.attachmentsModule.handleImageSelect(callback);
  }

  async addStickerFromFile(): Promise<void> {
    return this.attachmentsModule.addStickerFromFile();
  }

  async addStickerFromUrl(): Promise<void> {
    return this.attachmentsModule.addStickerFromUrl();
  }

  // === 语音API ===
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

  // 返回拷贝，避免外部修改内部 Set
  getSelectedMessages(): Set<number> {
    return new Set(STATE.getSelectedMessages());
  }

  getIsMessageEditMode(): boolean {
    return STATE.isMessageEditMode;
  }

  getCurrentRenderedCount(): number {
    return this.renderModule.getCurrentRenderedCount();
  }
}

// 单例
export const chatScreenModule = new ChatScreenModule();

// 统一导出
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

export default {
  chatScreenModule,
  ChatScreenModule,
  messageRenderModule,
  eventHandlerModule,
  messageComposerModule,
  attachmentHandlerModule,
  voicePlaybackModule
};

// 初始化一次性日志
(() => {
  const info = {
    render: !!messageRenderModule,
    events: !!eventHandlerModule,
    composer: !!messageComposerModule,
    attachments: !!attachmentHandlerModule,
    playback: !!voicePlaybackModule
  };
  // 保留可读的初始化信息
  // eslint-disable-next-line no-console
  console.log('聊天模块(拆分版TypeScript)已初始化', info);
})();
