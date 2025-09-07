// 应用初始化模块 - 优化版 TypeScript
// 关键优化：
// 1) 统一工具函数与DOM缓存，减少重复DOM查询
// 2) 批量事件注册 + AbortController，支持销毁与重绑
// 3) 通过 window 访问服务，降低耦合
// 4) 早返回与可选链，增强健壮性

import type { StateManager, Chat, Member, Message } from '../state';

type WinLike = any;

function getWin(): WinLike {
  return window as any;
}

function id<T extends HTMLElement = HTMLElement>(elId: string): T | null {
  return document.getElementById(elId) as T | null;
}

function on(
    el: Element | null,
    event: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions
) {
  if (el) el.addEventListener(event, handler, options);
}

function showPanel(el: HTMLElement | null) {
  if (el) el.classList.add('visible');
}

function hidePanel(el: HTMLElement | null) {
  if (el) el.classList.remove('visible');
}

function toggleClass(el: Element | null, className: string, enabled: boolean) {
  if (!el) return;
  if (enabled) el.classList.add(className);
  else el.classList.remove(className);
}

function getActiveChatOrNull(): Chat | null {
  const win = getWin();
  const st: StateManager | undefined = win.STATE;
  const chatId = st?.state?.activeChatId;
  return chatId ? st!.state.chats[chatId] : null;
}

export class InitializationModule {
  // 修正：允许字符串或数字，兼容消息id类型
  private selectedMessages = new Set<string | number>();
  private editingMemberId: string | null = null;
  private initialized = false;
  private controller: AbortController | null = null;

  // DOM 缓存
  private els = {
    // chat
    backToListBtn: null as HTMLElement | null,
    editMessagesBtn: null as HTMLElement | null,
    transferBtn: null as HTMLElement | null,
    transferModal: null as HTMLElement | null,
    transferConfirmBtn: null as HTMLElement | null,
    transferCancelBtn: null as HTMLElement | null,
    openStickerBtn: null as HTMLElement | null,
    closeStickerBtn: null as HTMLElement | null,
    stickerPanel: null as HTMLElement | null,
    sendPhotoBtn: null as HTMLElement | null,
    uploadImgBtn: null as HTMLElement | null,
    voiceMsgBtn: null as HTMLElement | null,
    chatInterfaceScreen: null as HTMLElement | null,

    // group members
    addMemberBtn: null as HTMLElement | null,
    saveMemberBtn: null as HTMLElement | null,
    cancelMemberEditBtn: null as HTMLElement | null,
    memberEditor: null as HTMLElement | null,
    memberNameInput: null as HTMLInputElement | null,
    memberPersonaInput: null as HTMLTextAreaElement | null,
    memberPatSuffixInput: null as HTMLInputElement | null,

    // persona library
    openPersonaLibBtn: null as HTMLElement | null,
    closePersonaLibBtn: null as HTMLElement | null,
    createPersonaBtn: null as HTMLElement | null,
    savePersonaBtn: null as HTMLElement | null,
    cancelPersonaBtn: null as HTMLElement | null,

    // music
    musicPlayPauseBtn: null as HTMLElement | null,
    musicNextBtn: null as HTMLElement | null,
    musicPrevBtn: null as HTMLElement | null,
    musicModeBtn: null as HTMLElement | null,
    addSongUrlBtn: null as HTMLElement | null,
    addSongFileBtn: null as HTMLElement | null,
    backToChatBtn: null as HTMLElement | null,
    musicPlaylistBtn: null as HTMLElement | null,
    closePlaylistBtn: null as HTMLElement | null,
    playlistPanel: null as HTMLElement | null,

    // UI modal
    customModalClose: null as HTMLElement | null,
    customConfirmOk: null as HTMLElement | null,
    customConfirmCancel: null as HTMLElement | null,
    customPromptOk: null as HTMLElement | null,
    customPromptCancel: null as HTMLElement | null,
    customPromptInput: null as HTMLInputElement | null,
  };

  async initializeApp(): Promise<void> {
    if (this.initialized) {
      console.log('初始化已完成，跳过重复绑定');
      return;
    }

    // 若之前存在控制器，先中止（防御）
    this.controller?.abort();
    this.controller = new AbortController();
    const signal = this.controller.signal;

    this.cacheDom();

    console.log('开始初始化应用事件监听器...');
    this.initChatInterfaceListeners(signal);
    this.initGroupMemberListeners(signal);
    this.initPersonaLibraryListeners(signal);
    this.initMusicPlayerListeners(signal);
    this.initUIModalListeners(signal);
    this.initialized = true;
    console.log('应用事件监听器初始化完成');
  }

  // 选做增强：提供销毁能力，便于热替换/重绑定
  public destroy(): void {
    this.controller?.abort();
    this.controller = null;
    this.initialized = false;
  }

  private cacheDom() {
    this.els.backToListBtn = id('back-to-list-btn');
    this.els.editMessagesBtn = id('edit-messages-btn');
    this.els.transferBtn = id('transfer-btn');
    this.els.transferModal = id('transfer-modal');
    this.els.transferConfirmBtn = id('transfer-confirm-btn');
    this.els.transferCancelBtn = id('transfer-cancel-btn');
    this.els.openStickerBtn = id('open-sticker-panel-btn');
    this.els.closeStickerBtn = id('close-sticker-panel-btn');
    this.els.stickerPanel = id('sticker-panel');
    this.els.sendPhotoBtn = id('send-photo-btn');
    this.els.uploadImgBtn = id('upload-image-btn');
    this.els.voiceMsgBtn = id('voice-message-btn');
    this.els.chatInterfaceScreen = id('chat-interface-screen');

    this.els.addMemberBtn = id('add-member-btn');
    this.els.saveMemberBtn = id('save-member-btn');
    this.els.cancelMemberEditBtn = id('cancel-member-edit-btn');
    this.els.memberEditor = id('member-editor');
    this.els.memberNameInput = id<HTMLInputElement>('member-name-input');
    this.els.memberPersonaInput = id<HTMLTextAreaElement>('member-persona-input');
    this.els.memberPatSuffixInput = id<HTMLInputElement>('member-pat-suffix-input');

    this.els.openPersonaLibBtn = id('open-persona-library-btn');
    this.els.closePersonaLibBtn = id('close-persona-library-btn');
    this.els.createPersonaBtn = id('create-persona-btn');
    this.els.savePersonaBtn = id('save-persona-btn');
    this.els.cancelPersonaBtn = id('cancel-persona-btn');

    this.els.musicPlayPauseBtn = id('music-play-pause-btn');
    this.els.musicNextBtn = id('music-next-btn');
    this.els.musicPrevBtn = id('music-prev-btn');
    this.els.musicModeBtn = id('music-mode-btn');
    this.els.addSongUrlBtn = id('add-song-url-btn');
    this.els.addSongFileBtn = id('add-song-file-btn');
    this.els.backToChatBtn = id('back-to-chat-btn');
    this.els.musicPlaylistBtn = id('music-playlist-btn');
    this.els.closePlaylistBtn = id('close-playlist-btn');
    this.els.playlistPanel = id('music-playlist-panel');

    this.els.customModalClose = id('custom-modal-close');
    this.els.customConfirmOk = id('custom-confirm-ok');
    this.els.customConfirmCancel = id('custom-confirm-cancel');
    this.els.customPromptOk = id('custom-prompt-ok');
    this.els.customPromptCancel = id('custom-prompt-cancel');
    this.els.customPromptInput = id<HTMLInputElement>('custom-prompt-input');
  }

  private initChatInterfaceListeners(signal: AbortSignal): void {
    const win = getWin();

    on(this.els.backToListBtn, 'click', () => {
      this.exitMessageEditMode(false);
      this.exitSelectionMode();
      win.STATE.setActiveChatId(null);
      win.ROUTER?.showScreen?.('chat-list-screen');
    }, { signal });

    on(this.els.editMessagesBtn, 'click', () => this.toggleMessageEditMode(), { signal });

    on(this.els.transferBtn, 'click', () => showPanel(this.els.transferModal), { signal });
    on(this.els.transferConfirmBtn, 'click', () => this.sendUserTransfer(), { signal });
    on(this.els.transferCancelBtn, 'click', () => hidePanel(this.els.transferModal), { signal });

    on(this.els.openStickerBtn, 'click', () => {
      win.ChatModule?.renderStickerPanel?.();
      showPanel(this.els.stickerPanel);
    }, { signal });
    on(this.els.closeStickerBtn, 'click', () => hidePanel(this.els.stickerPanel), { signal });

    on(this.els.sendPhotoBtn, 'click', async () => {
      const desc = await win.showCustomPrompt?.('发送照片', '请用文字描述您要发送的照片：');
      const text = desc?.trim?.();
      if (!text) return;

      const chat = getActiveChatOrNull();
      if (!chat) return;

      const msg: Message = {
        id: `msg_${Date.now()}_${Math.random()}`,
        role: 'user',
        content: text,
        type: 'user_photo',
        sender: chat.isGroup ? (chat.settings.myGroupNickname || '我') : '我',
        timestamp: Date.now(),
      };
      chat.history.push(msg);

      await win.DB?.saveChat?.(chat);
      win.ChatModule?.renderModule?.appendMessage?.(msg, chat);
      win.ChatModule?.renderModule?.renderChatList?.();
    }, { signal });

    on(this.els.uploadImgBtn, 'click', () => {
      win.ChatModule?.attachmentsModule?.handleImageSelect?.();
    }, { signal });

    on(this.els.voiceMsgBtn, 'click', async () => {
      const content = await win.showCustomPrompt?.('发送语音', '请输入你想说的内容：');
      const text = content?.trim?.();
      if (text) win.ChatModule?.playbackModule?.sendVoiceMessage?.(text);
    }, { signal });

    console.log('聊天界面事件监听器初始化完成');
  }

  private initGroupMemberListeners(signal: AbortSignal): void {
    const win = getWin();

    on(this.els.addMemberBtn, 'click', async () => {
      const name = await win.showCustomPrompt?.('添加群成员', '请输入成员名称');
      const memberName = name?.trim?.();
      if (!memberName) return;

      const chat = getActiveChatOrNull();
      if (!chat || !chat.isGroup) return;

      const newMember: Member = {
        id: `member_${Date.now()}`,
        name: memberName,
        persona: '一个有趣的人',
        avatar: win.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || '',
        patSuffix: '的脑袋瓜',
      };
      if (!chat.members) chat.members = [];
      chat.members.push(newMember);

      await win.DB?.saveChat?.(chat);
      this.renderGroupMemberSettings();
    }, { signal });

    on(this.els.saveMemberBtn, 'click', async () => {
      await this.saveMemberChanges();
    }, { signal });

    on(this.els.cancelMemberEditBtn, 'click', () => this.closeMemberEditor(), { signal });

    console.log('群聊成员事件监听器初始化完成');
  }

  private initPersonaLibraryListeners(signal: AbortSignal): void {
    const win = getWin();

    on(this.els.openPersonaLibBtn, 'click', () => win.PersonaService?.openPersonaLibrary?.(), { signal });
    on(this.els.closePersonaLibBtn, 'click', () => win.PersonaService?.closePersonaLibrary?.(), { signal });
    on(this.els.createPersonaBtn, 'click', () => win.PersonaService?.openPersonaEditorForCreate?.(), { signal });
    on(this.els.savePersonaBtn, 'click', () => win.PersonaService?.savePersonaPreset?.(), { signal });
    on(this.els.cancelPersonaBtn, 'click', () => win.PersonaService?.closePersonaEditor?.(), { signal });

    console.log('人设库事件监听器初始化完成');
  }

  private initMusicPlayerListeners(signal: AbortSignal): void {
    const win = getWin();

    on(this.els.musicPlayPauseBtn, 'click', () => win.MusicService?.togglePlayPause?.(), { signal });
    on(this.els.musicNextBtn, 'click', () => win.MusicService?.playNext?.(), { signal });
    on(this.els.musicPrevBtn, 'click', () => win.MusicService?.playPrev?.(), { signal });
    on(this.els.musicModeBtn, 'click', () => win.MusicService?.changePlayMode?.(), { signal });
    on(this.els.addSongUrlBtn, 'click', () => win.MusicService?.addSongFromURL?.(), { signal });
    on(this.els.addSongFileBtn, 'click', () => win.MusicService?.addSongFromLocal?.(), { signal });
    on(this.els.backToChatBtn, 'click', () => win.MusicService?.returnToChat?.(), { signal });

    on(this.els.musicPlaylistBtn, 'click', () => {
      win.MusicService?.updatePlaylistUI?.();
      showPanel(this.els.playlistPanel);
    }, { signal });

    on(this.els.closePlaylistBtn, 'click', () => hidePanel(this.els.playlistPanel), { signal });

    console.log('音乐播放器事件监听器初始化完成');
  }

  private initUIModalListeners(signal: AbortSignal): void {
    const win = getWin();

    on(this.els.customModalClose, 'click', () => {
      hidePanel(id('custom-modal'));
    }, { signal });

    on(this.els.customConfirmOk, 'click', () => win._confirmResolve?.(true), { signal });
    on(this.els.customConfirmCancel, 'click', () => win._confirmResolve?.(false), { signal });

    on(this.els.customPromptOk, 'click', () => {
      const val = this.els.customPromptInput?.value || '';
      win._promptResolve?.(val);
    }, { signal });

    on(this.els.customPromptCancel, 'click', () => win._promptResolve?.(null), { signal });

    console.log('UI模态框事件监听器初始化完成');
  }

  // ============ 辅助功能函数 ============

  private exitMessageEditMode(shouldSave = false): void {
    const win = getWin();
    win.ChatModule?.exitMessageEditMode?.(shouldSave);
  }

  // 公开：退出选择模式
  exitSelectionMode(): void {
    this.selectedMessages.clear();
    toggleClass(this.els.chatInterfaceScreen, 'selection-mode', false);
    document.querySelectorAll('.message-bubble.selected').forEach(b => b.classList.remove('selected'));
  }

  public toggleMessageEditMode(): void {
    const win = getWin();
    win.ChatModule?.toggleMessageEditMode?.();
  }

  public sendUserTransfer(): void {
    const win = getWin();
    win.ChatModule?.sendUserTransfer?.();
  }

  private openMemberEditor(memberId: string): void {
    const chat = getActiveChatOrNull();
    if (!chat?.isGroup || !chat.members) return;

    this.editingMemberId = memberId;
    const member = chat.members.find(m => m.id === memberId);
    if (!member) return;

    if (this.els.memberNameInput) this.els.memberNameInput.value = member.name;
    if (this.els.memberPersonaInput) this.els.memberPersonaInput.value = member.persona;
    if (this.els.memberPatSuffixInput) this.els.memberPatSuffixInput.value = member.patSuffix || '';

    toggleClass(this.els.memberEditor, 'active', true);
  }

  private async saveMemberChanges(): Promise<void> {
    if (!this.editingMemberId) return;

    const win = getWin();
    const chat = getActiveChatOrNull();
    if (!chat?.isGroup || !chat.members) return;

    const member = chat.members.find(m => m.id === this.editingMemberId);
    if (!member) return;

    const name = this.els.memberNameInput?.value?.trim();
    const persona = this.els.memberPersonaInput?.value?.trim();
    const pat = this.els.memberPatSuffixInput?.value?.trim();

    if (name) member.name = name;
    if (persona) member.persona = persona;
    member.patSuffix = pat || '';

    await win.DB?.saveChat?.(chat);
    this.renderGroupMemberSettings();
    this.closeMemberEditor();
  }

  private closeMemberEditor(): void {
    this.editingMemberId = null;
    toggleClass(this.els.memberEditor, 'active', false);
  }

  private renderGroupMemberSettings(): void {
    const win = getWin();
    win.PersonaService?.renderGroupMemberSettings?.();
  }

  private async deleteMember(memberId: string): Promise<void> {
    const win = getWin();
    const ok = await win.showCustomConfirm?.('删除成员', '确定要删除这个群成员吗？');
    if (!ok) return;

    const chat = getActiveChatOrNull();
    if (!chat?.isGroup || !chat.members) return;

    chat.members = chat.members.filter(m => m.id !== memberId);
    await win.DB?.saveChat?.(chat);
    this.renderGroupMemberSettings();
  }
}

// === 全局单例实例 ===
export const initializationModule = new InitializationModule();

// 注入到window对象，保持向后兼容性
if (typeof window !== 'undefined') {
  const win = getWin();
  win.InitializationModule = initializationModule;
  win.initializeApp = () => initializationModule.initializeApp();
  win.exitSelectionMode = () => initializationModule.exitSelectionMode();
  win.toggleMessageEditMode = () => initializationModule.toggleMessageEditMode();
  win.sendUserTransfer = () => initializationModule.sendUserTransfer();
  // 额外暴露销毁方法，便于热替换/重绑
  win.destroyInitialization = () => initializationModule.destroy();
}

export default {
  initializationModule,
  InitializationModule,
};

console.log('初始化模块(TypeScript优化版)已加载');
