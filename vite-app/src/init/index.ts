// 修复点：DomRefs 不再被推断为只读；cacheDom 使用整体替换赋值

import type { StateManager, Chat, Member, Message } from '../state';

type MinimalRouter = { showScreen?: (s: string) => void };
type ChatRenderModule = { appendMessage?: (m: Message, c: Chat) => void; renderChatList?: () => void };
type ChatModuleType = {
  renderStickerPanel?: () => void;
  renderModule?: ChatRenderModule;
  attachmentsModule?: { handleImageSelect?: () => void };
  playbackModule?: { sendVoiceMessage?: (text: string) => void };
  toggleMessageEditMode?: () => void;
  exitMessageEditMode?: (save?: boolean) => void;
  sendUserTransfer?: () => void;
};
type PersonaServiceType = {
  openPersonaLibrary?: () => void;
  closePersonaLibrary?: () => void;
  openPersonaEditorForCreate?: () => void;
  savePersonaPreset?: () => void;
  closePersonaEditor?: () => void;
  renderGroupMemberSettings?: () => void;
};
type MusicServiceType = {
  togglePlayPause?: () => void;
  playNext?: () => void;
  playPrev?: () => void;
  changePlayMode?: () => void;
  addSongFromURL?: () => void;
  addSongFromLocal?: () => void;
  returnToChat?: () => void;
  updatePlaylistUI?: () => void;
};
type DBType = { saveChat?: (c: Chat) => Promise<void> | void };

type WinLike = Window & {
  STATE?: StateManager;
  ROUTER?: MinimalRouter;
  ChatModule?: ChatModuleType;
  PersonaService?: PersonaServiceType;
  MusicService?: MusicServiceType;
  DB?: DBType;
  CONSTANTS?: { DEFAULT_GROUP_MEMBER_AVATAR?: string };
  _confirmResolve?: (v: boolean) => void;
  _promptResolve?: (v: string | null) => void;
  showCustomPrompt?: (title: string, msg: string) => Promise<string | null>;
  showCustomConfirm?: (title: string, msg: string) => Promise<boolean>;
  InitializationModule?: InitializationModule;
  initializeApp?: () => Promise<void>;
  exitSelectionMode?: () => void;
  toggleMessageEditMode?: () => void;
  sendUserTransfer?: () => void;
  destroyInitialization?: () => void;
};

const DOM_IDS = {
  backToListBtn: 'back-to-list-btn',
  editMessagesBtn: 'edit-messages-btn',
  transferBtn: 'transfer-btn',
  transferModal: 'transfer-modal',
  transferConfirmBtn: 'transfer-confirm-btn',
  transferCancelBtn: 'transfer-cancel-btn',
  openStickerBtn: 'open-sticker-panel-btn',
  closeStickerBtn: 'close-sticker-panel-btn',
  stickerPanel: 'sticker-panel',
  sendPhotoBtn: 'send-photo-btn',
  uploadImgBtn: 'upload-image-btn',
  voiceMsgBtn: 'voice-message-btn',
  chatInterfaceScreen: 'chat-interface-screen',
  addMemberBtn: 'add-member-btn',
  saveMemberBtn: 'save-member-btn',
  cancelMemberEditBtn: 'cancel-member-edit-btn',
  memberEditor: 'member-editor',
  memberNameInput: 'member-name-input',
  memberPersonaInput: 'member-persona-input',
  memberPatSuffixInput: 'member-pat-suffix-input',
  openPersonaLibBtn: 'open-persona-library-btn',
  closePersonaLibBtn: 'close-persona-library-btn',
  createPersonaBtn: 'create-persona-btn',
  savePersonaBtn: 'save-persona-btn',
  cancelPersonaBtn: 'cancel-persona-btn',
  musicPlayPauseBtn: 'music-play-pause-btn',
  musicNextBtn: 'music-next-btn',
  musicPrevBtn: 'music-prev-btn',
  musicModeBtn: 'music-mode-btn',
  addSongUrlBtn: 'add-song-url-btn',
  addSongFileBtn: 'add-song-file-btn',
  backToChatBtn: 'back-to-chat-btn',
  musicPlaylistBtn: 'music-playlist-btn',
  closePlaylistBtn: 'close-playlist-btn',
  playlistPanel: 'music-playlist-panel',
  customModal: 'custom-modal',
  customModalClose: 'custom-modal-close',
  customConfirmOk: 'custom-confirm-ok',
  customConfirmCancel: 'custom-confirm-cancel',
  customPromptOk: 'custom-prompt-ok',
  customPromptCancel: 'custom-prompt-cancel',
  customPromptInput: 'custom-prompt-input',
} as const;

// 关键：DomRefs 明确为可变类型（非 readonly）
type DomRefs = {
  backToListBtn: HTMLElement | null;
  editMessagesBtn: HTMLElement | null;
  transferBtn: HTMLElement | null;
  transferModal: HTMLElement | null;
  transferConfirmBtn: HTMLElement | null;
  transferCancelBtn: HTMLElement | null;
  openStickerBtn: HTMLElement | null;
  closeStickerBtn: HTMLElement | null;
  stickerPanel: HTMLElement | null;
  sendPhotoBtn: HTMLElement | null;
  uploadImgBtn: HTMLElement | null;
  voiceMsgBtn: HTMLElement | null;
  chatInterfaceScreen: HTMLElement | null;

  addMemberBtn: HTMLElement | null;
  saveMemberBtn: HTMLElement | null;
  cancelMemberEditBtn: HTMLElement | null;
  memberEditor: HTMLElement | null;
  memberNameInput: HTMLInputElement | null;
  memberPersonaInput: HTMLTextAreaElement | null;
  memberPatSuffixInput: HTMLInputElement | null;

  openPersonaLibBtn: HTMLElement | null;
  closePersonaLibBtn: HTMLElement | null;
  createPersonaBtn: HTMLElement | null;
  savePersonaBtn: HTMLElement | null;
  cancelPersonaBtn: HTMLElement | null;

  musicPlayPauseBtn: HTMLElement | null;
  musicNextBtn: HTMLElement | null;
  musicPrevBtn: HTMLElement | null;
  musicModeBtn: HTMLElement | null;
  addSongUrlBtn: HTMLElement | null;
  addSongFileBtn: HTMLElement | null;
  backToChatBtn: HTMLElement | null;
  musicPlaylistBtn: HTMLElement | null;
  closePlaylistBtn: HTMLElement | null;
  playlistPanel: HTMLElement | null;

  customModal: HTMLElement | null;
  customModalClose: HTMLElement | null;
  customConfirmOk: HTMLElement | null;
  customConfirmCancel: HTMLElement | null;
  customPromptOk: HTMLElement | null;
  customPromptCancel: HTMLElement | null;
  customPromptInput: HTMLInputElement | null;
};

function getWin(): WinLike {
  return (typeof window !== 'undefined' ? window : ({} as unknown)) as WinLike;
}
function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}
function on(
    el: Element | null,
    event: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions & { signal?: AbortSignal }
) {
  if (el) el.addEventListener(event, handler, options);
}
function show(el: HTMLElement | null) { el?.classList.add('visible'); }
function hide(el: HTMLElement | null) { el?.classList.remove('visible'); }
function toggle(el: Element | null, cls: string, enabled: boolean) {
  if (el) el.classList.toggle(cls, enabled);
}
function getActiveChatOrNull(): Chat | null {
  const st = getWin().STATE;
  const chatId = st?.state?.activeChatId;
  return chatId ? st!.state.chats[chatId] : null;
}

export class InitializationModule {
  private selectedMessages = new Set<string | number>();
  private editingMemberId: string | null = null;
  private initialized = false;
  private controller: AbortController | null = null;

  private els: DomRefs = {
    backToListBtn: null,
    editMessagesBtn: null,
    transferBtn: null,
    transferModal: null,
    transferConfirmBtn: null,
    transferCancelBtn: null,
    openStickerBtn: null,
    closeStickerBtn: null,
    stickerPanel: null,
    sendPhotoBtn: null,
    uploadImgBtn: null,
    voiceMsgBtn: null,
    chatInterfaceScreen: null,

    addMemberBtn: null,
    saveMemberBtn: null,
    cancelMemberEditBtn: null,
    memberEditor: null,
    memberNameInput: null,
    memberPersonaInput: null,
    memberPatSuffixInput: null,

    openPersonaLibBtn: null,
    closePersonaLibBtn: null,
    createPersonaBtn: null,
    savePersonaBtn: null,
    cancelPersonaBtn: null,

    musicPlayPauseBtn: null,
    musicNextBtn: null,
    musicPrevBtn: null,
    musicModeBtn: null,
    addSongUrlBtn: null,
    addSongFileBtn: null,
    backToChatBtn: null,
    musicPlaylistBtn: null,
    closePlaylistBtn: null,
    playlistPanel: null,

    customModal: null,
    customModalClose: null,
    customConfirmOk: null,
    customConfirmCancel: null,
    customPromptOk: null,
    customPromptCancel: null,
    customPromptInput: null,
  };

  async initializeApp(): Promise<void> {
    if (this.initialized) {
      console.log('初始化已完成，跳过重复绑定');
      return;
    }
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

  public destroy(): void {
    this.controller?.abort();
    this.controller = null;
    this.initialized = false;
    this.selectedMessages.clear();
    this.editingMemberId = null;
  }

  private cacheDom() {
    // 使用可变中间对象并整体替换，避免对 this.els 的逐属性写导致 TS2540
    const refs: DomRefs = {
      backToListBtn: byId(DOM_IDS.backToListBtn),
      editMessagesBtn: byId(DOM_IDS.editMessagesBtn),
      transferBtn: byId(DOM_IDS.transferBtn),
      transferModal: byId(DOM_IDS.transferModal),
      transferConfirmBtn: byId(DOM_IDS.transferConfirmBtn),
      transferCancelBtn: byId(DOM_IDS.transferCancelBtn),
      openStickerBtn: byId(DOM_IDS.openStickerBtn),
      closeStickerBtn: byId(DOM_IDS.closeStickerBtn),
      stickerPanel: byId(DOM_IDS.stickerPanel),
      sendPhotoBtn: byId(DOM_IDS.sendPhotoBtn),
      uploadImgBtn: byId(DOM_IDS.uploadImgBtn),
      voiceMsgBtn: byId(DOM_IDS.voiceMsgBtn),
      chatInterfaceScreen: byId(DOM_IDS.chatInterfaceScreen),

      addMemberBtn: byId(DOM_IDS.addMemberBtn),
      saveMemberBtn: byId(DOM_IDS.saveMemberBtn),
      cancelMemberEditBtn: byId(DOM_IDS.cancelMemberEditBtn),
      memberEditor: byId(DOM_IDS.memberEditor),
      memberNameInput: byId<HTMLInputElement>(DOM_IDS.memberNameInput),
      memberPersonaInput: byId<HTMLTextAreaElement>(DOM_IDS.memberPersonaInput),
      memberPatSuffixInput: byId<HTMLInputElement>(DOM_IDS.memberPatSuffixInput),

      openPersonaLibBtn: byId(DOM_IDS.openPersonaLibBtn),
      closePersonaLibBtn: byId(DOM_IDS.closePersonaLibBtn),
      createPersonaBtn: byId(DOM_IDS.createPersonaBtn),
      savePersonaBtn: byId(DOM_IDS.savePersonaBtn),
      cancelPersonaBtn: byId(DOM_IDS.cancelPersonaBtn),

      musicPlayPauseBtn: byId(DOM_IDS.musicPlayPauseBtn),
      musicNextBtn: byId(DOM_IDS.musicNextBtn),
      musicPrevBtn: byId(DOM_IDS.musicPrevBtn),
      musicModeBtn: byId(DOM_IDS.musicModeBtn),
      addSongUrlBtn: byId(DOM_IDS.addSongUrlBtn),
      addSongFileBtn: byId(DOM_IDS.addSongFileBtn),
      backToChatBtn: byId(DOM_IDS.backToChatBtn),
      musicPlaylistBtn: byId(DOM_IDS.musicPlaylistBtn),
      closePlaylistBtn: byId(DOM_IDS.closePlaylistBtn),
      playlistPanel: byId(DOM_IDS.playlistPanel),

      customModal: byId(DOM_IDS.customModal),
      customModalClose: byId(DOM_IDS.customModalClose),
      customConfirmOk: byId(DOM_IDS.customConfirmOk),
      customConfirmCancel: byId(DOM_IDS.customConfirmCancel),
      customPromptOk: byId(DOM_IDS.customPromptOk),
      customPromptCancel: byId(DOM_IDS.customPromptCancel),
      customPromptInput: byId<HTMLInputElement>(DOM_IDS.customPromptInput),
    };
    this.els = refs;
  }

  private initChatInterfaceListeners(signal: AbortSignal): void {
    const win = getWin();

    on(this.els.backToListBtn, 'click', () => {
      this.exitMessageEditMode(false);
      this.exitSelectionMode();
      win.STATE?.setActiveChatId?.(null);
      win.ROUTER?.showScreen?.('chat-list-screen');
    }, { signal });

    on(this.els.editMessagesBtn, 'click', () => this.toggleMessageEditMode(), { signal });

    on(this.els.transferBtn, 'click', () => show(this.els.transferModal), { signal });
    on(this.els.transferConfirmBtn, 'click', () => this.sendUserTransfer(), { signal });
    on(this.els.transferCancelBtn, 'click', () => hide(this.els.transferModal), { signal });

    on(this.els.openStickerBtn, 'click', () => {
      win.ChatModule?.renderStickerPanel?.();
      show(this.els.stickerPanel);
    }, { signal });
    on(this.els.closeStickerBtn, 'click', () => hide(this.els.stickerPanel), { signal });

    on(this.els.sendPhotoBtn, 'click', async () => {
      const text = (await win.showCustomPrompt?.('发送照片', '请用文字描述您要发送的照片：'))?.trim?.();
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

    on(this.els.uploadImgBtn, 'click', () => win.ChatModule?.attachmentsModule?.handleImageSelect?.(), { signal });

    on(this.els.voiceMsgBtn, 'click', async () => {
      const text = (await win.showCustomPrompt?.('发送语音', '请输入你想说的内容：'))?.trim?.();
      if (text) win.ChatModule?.playbackModule?.sendVoiceMessage?.(text);
    }, { signal });

    console.log('聊天界面事件监听器初始化完成');
  }

  private initGroupMemberListeners(signal: AbortSignal): void {
    const win = getWin();

    on(this.els.addMemberBtn, 'click', async () => {
      const memberName = (await win.showCustomPrompt?.('添加群成员', '请输入成员名称'))?.trim?.();
      if (!memberName) return;
      const chat = getActiveChatOrNull();
      if (!chat?.isGroup) return;

      const newMember: Member = {
        id: `member_${Date.now()}`,
        name: memberName,
        persona: '一个有趣的人',
        avatar: win.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || '',
        patSuffix: '的脑袋瓜',
      };
      chat.members = chat.members || [];
      chat.members.push(newMember);

      await win.DB?.saveChat?.(chat);
      this.renderGroupMemberSettings();
    }, { signal });

    on(this.els.saveMemberBtn, 'click', () => this.saveMemberChanges(), { signal });
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
      show(this.els.playlistPanel);
    }, { signal });
    on(this.els.closePlaylistBtn, 'click', () => hide(this.els.playlistPanel), { signal });

    console.log('音乐播放器事件监听器初始化完成');
  }

  private initUIModalListeners(signal: AbortSignal): void {
    const win = getWin();
    on(this.els.customModalClose, 'click', () => hide(this.els.customModal), { signal });
    on(this.els.customConfirmOk, 'click', () => win._confirmResolve?.(true), { signal });
    on(this.els.customConfirmCancel, 'click', () => win._confirmResolve?.(false), { signal });
    on(this.els.customPromptOk, 'click', () => {
      const val = this.els.customPromptInput?.value || '';
      win._promptResolve?.(val);
    }, { signal });
    on(this.els.customPromptCancel, 'click', () => win._promptResolve?.(null), { signal });
    console.log('UI模态框事件监听器初始化完成');
  }

  private exitMessageEditMode(shouldSave = false): void {
    getWin().ChatModule?.exitMessageEditMode?.(shouldSave);
  }
  public exitSelectionMode(): void {
    this.selectedMessages.clear();
    toggle(this.els.chatInterfaceScreen, 'selection-mode', false);
    document.querySelectorAll('.message-bubble.selected').forEach(b => b.classList.remove('selected'));
  }
  public toggleMessageEditMode(): void {
    getWin().ChatModule?.toggleMessageEditMode?.();
  }
  public sendUserTransfer(): void {
    getWin().ChatModule?.sendUserTransfer?.();
  }

  private openMemberEditor(memberId: string): void {
    const chat = getActiveChatOrNull();
    if (!chat?.isGroup || !chat.members) return;

    this.editingMemberId = memberId;
    const member = chat.members.find(m => m.id === memberId);
    if (!member) return;

    this.els.memberNameInput && (this.els.memberNameInput.value = member.name);
    this.els.memberPersonaInput && (this.els.memberPersonaInput.value = member.persona);
    this.els.memberPatSuffixInput && (this.els.memberPatSuffixInput.value = member.patSuffix || '');
    toggle(this.els.memberEditor, 'active', true);
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
    toggle(this.els.memberEditor, 'active', false);
  }

  private renderGroupMemberSettings(): void {
    getWin().PersonaService?.renderGroupMemberSettings?.();
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

export const initializationModule = new InitializationModule();

if (typeof window !== 'undefined') {
  const win = getWin();
  win.InitializationModule = initializationModule;
  win.initializeApp = () => initializationModule.initializeApp();
  win.exitSelectionMode = () => initializationModule.exitSelectionMode();
  win.toggleMessageEditMode = () => initializationModule.toggleMessageEditMode();
  win.sendUserTransfer = () => initializationModule.sendUserTransfer();
  win.destroyInitialization = () => initializationModule.destroy();
}

export default { initializationModule, InitializationModule };

console.log('初始化模块(TypeScript优化版)已加载');
