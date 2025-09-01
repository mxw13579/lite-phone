// 应用初始化模块 - TypeScript版本
// 包含所有DOM事件监听器的初始化设置

import type { StateManager, DatabaseManager, Chat, Member, Message } from '../state';
import DB from '../database';

export class InitializationModule {
  private selectedMessages = new Set<number>();
  private editingMemberId: string | null = null;

  /**
   * 初始化应用的所有事件监听器和UI组件
   */
  async initializeApp(): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    const musicState = state?.musicState;
    
    // 获取默认头像常量
    const defaultAvatar = win.CONSTANTS?.DEFAULT_AVATAR || 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
    const defaultMyGroupAvatar = win.CONSTANTS?.DEFAULT_MY_GROUP_AVATAR || 'https://i.postimg.cc/cLPP10Vm/4.jpg';
    const defaultGroupMemberAvatar = win.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || 'https://i.postimg.cc/VkQfgzGJ/1.jpg';
    const defaultGroupAvatar = win.CONSTANTS?.DEFAULT_GROUP_AVATAR || 'https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg';
    
    console.log('开始初始化应用事件监听器...');
    
    // 初始化各类事件监听器
    this.initChatInterfaceListeners();
    this.initGroupMemberListeners();
    this.initPersonaLibraryListeners();
    this.initMusicPlayerListeners();
    this.initUIModalListeners();
    
    console.log('应用事件监听器初始化完成');
  }

  /**
   * 聊天界面事件监听器
   */
  private initChatInterfaceListeners(): void {
    const win = window as any;
    
    // 返回聊天列表按钮
    document.getElementById('back-to-list-btn')?.addEventListener('click', () => {
      this.exitMessageEditMode(false);
      this.exitSelectionMode();
      win.STATE.setActiveChatId(null);
      win.ROUTER.showScreen('chat-list-screen');
    });

    // 编辑消息按钮
    document.getElementById('edit-messages-btn')?.addEventListener('click', () => {
      this.toggleMessageEditMode();
    });

    // 发送转账按钮（打开模态框）
    document.getElementById('transfer-btn')?.addEventListener('click', () => {
      const transferModal = document.getElementById('transfer-modal');
      if (transferModal) {
        transferModal.classList.add('visible');
      }
    });

    // 表情面板打开按钮
    document.getElementById('open-sticker-panel-btn')?.addEventListener('click', () => {
      win.ChatModule?.renderStickerPanel();
      const stickerPanel = document.getElementById('sticker-panel');
      if (stickerPanel) {
        stickerPanel.classList.add('visible');
      }
    });

    // 表情面板关闭按钮
    document.getElementById('close-sticker-panel-btn')?.addEventListener('click', () => {
      const stickerPanel = document.getElementById('sticker-panel');
      if (stickerPanel) {
        stickerPanel.classList.remove('visible');
      }
    });

    // 转账模态框确认按钮
    document.getElementById('transfer-confirm-btn')?.addEventListener('click', () => {
      this.sendUserTransfer();
    });

    // 转账模态框取消按钮
    document.getElementById('transfer-cancel-btn')?.addEventListener('click', () => {
      const transferModal = document.getElementById('transfer-modal');
      if (transferModal) {
        transferModal.classList.remove('visible');
      }
    });

    // 发送照片按钮（文字描述照片）
    document.getElementById('send-photo-btn')?.addEventListener('click', async () => {
      const photoDescription = await win.showCustomPrompt('发送照片', '请用文字描述您要发送的照片：');
      if (photoDescription && photoDescription.trim() && win.STATE?.state?.activeChatId) {
        const state = win.STATE.state;
        const chat = state.chats[state.activeChatId];
        if (chat) {
          const msg: any = {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: 'user',
            content: photoDescription.trim(),
            type: 'user_photo',
            sender: chat.isGroup ? (chat.settings.myGroupNickname || '我') : '我',
            timestamp: Date.now()
          };
          
          chat.history.push(msg);
          await win.DB.saveChat(chat);
          
          if (win.ChatModule?.renderModule?.appendMessage) {
            win.ChatModule.renderModule.appendMessage(msg, chat);
          }
          if (win.ChatModule?.renderModule?.renderChatList) {
            win.ChatModule.renderModule.renderChatList();
          }
        }
      }
    });

    // 上传图片按钮（实际文件上传）
    document.getElementById('upload-image-btn')?.addEventListener('click', () => {
      win.ChatModule?.attachmentsModule?.handleImageSelect?.();
    });

    // 发送语音按钮
    document.getElementById('voice-message-btn')?.addEventListener('click', async () => {
      const voiceContent = await win.showCustomPrompt('发送语音', '请输入你想说的内容：');
      if (voiceContent && voiceContent.trim()) {
        win.ChatModule?.playbackModule?.sendVoiceMessage?.(voiceContent.trim());
      }
    });

    console.log('聊天界面事件监听器初始化完成');
  }

  /**
   * 群聊成员管理事件监听器
   */
  private initGroupMemberListeners(): void {
    const win = window as any;
    
    // 添加成员按钮
    document.getElementById('add-member-btn')?.addEventListener('click', async () => {
      const memberName = await win.showCustomPrompt('添加群成员', '请输入成员名称');
      if (memberName && memberName.trim()) {
        const state = win.STATE?.state;
        const chat = state?.chats[state.activeChatId];
        if (chat && chat.isGroup) {
          const newMember: Member = {
            id: `member_${Date.now()}`,
            name: memberName.trim(),
            persona: '一个有趣的人',
            avatar: win.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || '',
            patSuffix: '的脑袋瓜'
          };
          if (!chat.members) chat.members = [];
          chat.members.push(newMember);
          await DB.saveChat(chat);
          this.renderGroupMemberSettings();
        }
      }
    });

    // 成员编辑保存按钮
    document.getElementById('save-member-btn')?.addEventListener('click', async () => {
      await this.saveMemberChanges();
    });

    // 成员编辑取消按钮
    document.getElementById('cancel-member-edit-btn')?.addEventListener('click', () => {
      this.closeMemberEditor();
    });

    console.log('群聊成员事件监听器初始化完成');
  }

  /**
   * 人设库事件监听器
   */
  private initPersonaLibraryListeners(): void {
    const win = window as any;
    
    // 打开人设库按钮
    document.getElementById('open-persona-library-btn')?.addEventListener('click', () => {
      win.PersonaService?.openPersonaLibrary();
    });

    // 关闭人设库按钮
    document.getElementById('close-persona-library-btn')?.addEventListener('click', () => {
      win.PersonaService?.closePersonaLibrary();
    });

    // 创建新人设按钮
    document.getElementById('create-persona-btn')?.addEventListener('click', () => {
      win.PersonaService?.openPersonaEditorForCreate();
    });

    // 保存人设按钮
    document.getElementById('save-persona-btn')?.addEventListener('click', () => {
      win.PersonaService?.savePersonaPreset();
    });

    // 取消人设编辑按钮
    document.getElementById('cancel-persona-btn')?.addEventListener('click', () => {
      win.PersonaService?.closePersonaEditor();
    });

    console.log('人设库事件监听器初始化完成');
  }

  /**
   * 音乐播放器事件监听器
   */
  private initMusicPlayerListeners(): void {
    const win = window as any;
    
    // 播放/暂停按钮
    document.getElementById('music-play-pause-btn')?.addEventListener('click', () => {
      win.MusicService?.togglePlayPause();
    });

    // 下一首按钮
    document.getElementById('music-next-btn')?.addEventListener('click', () => {
      win.MusicService?.playNext();
    });

    // 上一首按钮
    document.getElementById('music-prev-btn')?.addEventListener('click', () => {
      win.MusicService?.playPrev();
    });

    // 播放模式切换按钮
    document.getElementById('music-mode-btn')?.addEventListener('click', () => {
      win.MusicService?.changePlayMode();
    });

    // 添加URL歌曲按钮
    document.getElementById('add-song-url-btn')?.addEventListener('click', () => {
      win.MusicService?.addSongFromURL();
    });

    // 添加本地歌曲按钮
    document.getElementById('add-song-file-btn')?.addEventListener('click', () => {
      win.MusicService?.addSongFromLocal();
    });

    // 返回聊天按钮
    document.getElementById('back-to-chat-btn')?.addEventListener('click', () => {
      win.MusicService?.returnToChat();
    });

    // 音乐播放列表按钮
    document.getElementById('music-playlist-btn')?.addEventListener('click', () => {
      // 先刷新播放列表UI
      if (win.MusicService?.updatePlaylistUI) {
        win.MusicService.updatePlaylistUI();
      }
      const playlistPanel = document.getElementById('music-playlist-panel');
      if (playlistPanel) {
        playlistPanel.classList.add('visible');
      }
    });

    // 关闭播放列表按钮
    document.getElementById('close-playlist-btn')?.addEventListener('click', () => {
      const playlistPanel = document.getElementById('music-playlist-panel');
      if (playlistPanel) {
        playlistPanel.classList.remove('visible');
      }
    });

    console.log('音乐播放器事件监听器初始化完成');
  }

  /**
   * UI模态框事件监听器
   */
  private initUIModalListeners(): void {
    // 自定义模态框关闭按钮
    document.getElementById('custom-modal-close')?.addEventListener('click', () => {
      const modal = document.getElementById('custom-modal');
      if (modal) {
        modal.classList.remove('visible');
      }
    });

    // 自定义确认对话框按钮
    document.getElementById('custom-confirm-ok')?.addEventListener('click', () => {
      const win = window as any;
      win._confirmResolve?.(true);
    });

    document.getElementById('custom-confirm-cancel')?.addEventListener('click', () => {
      const win = window as any;
      win._confirmResolve?.(false);
    });

    // 自定义提示输入对话框按钮
    document.getElementById('custom-prompt-ok')?.addEventListener('click', () => {
      const win = window as any;
      const input = document.getElementById('custom-prompt-input') as HTMLInputElement;
      win._promptResolve?.(input?.value || '');
    });

    document.getElementById('custom-prompt-cancel')?.addEventListener('click', () => {
      const win = window as any;
      win._promptResolve?.(null);
    });

    console.log('UI模态框事件监听器初始化完成');
  }

  // ============ 辅助功能函数 ============

  /**
   * 退出消息编辑模式
   */
  private exitMessageEditMode(shouldSave = false): void {
    const win = window as any;
    if (win.ChatModule?.exitMessageEditMode) {
      win.ChatModule.exitMessageEditMode(shouldSave);
    }
  }

  /**
   * 退出选择模式
   */
  /**
   * 退出选择模式（公开方法，供外部调用）
   */
  exitSelectionMode(): void {
    this.selectedMessages.clear();
    document.getElementById('chat-interface-screen')?.classList.remove('selection-mode');
    document.querySelectorAll('.message-bubble.selected').forEach(bubble => {
      bubble.classList.remove('selected');
    });
  }

  /**
   * 切换消息编辑模式
   */
  public toggleMessageEditMode(): void {
    const win = window as any;
    if (win.ChatModule?.toggleMessageEditMode) {
      win.ChatModule.toggleMessageEditMode();
    }
  }

  /**
   * 发送用户转账
   */
  public sendUserTransfer(): void {
    const win = window as any;
    if (win.ChatModule?.sendUserTransfer) {
      win.ChatModule.sendUserTransfer();
    }
  }

  /**
   * 打开成员编辑器
   */
  private openMemberEditor(memberId: string): void {
    const win = window as any;
    const state = win.STATE?.state;
    
    this.editingMemberId = memberId;
    const chat = state?.chats[state.activeChatId];
    if (!chat || !chat.isGroup || !chat.members) return;
    
    const member = chat.members.find(m => m.id === memberId);
    if (!member) return;

    const nameInput = document.getElementById('member-name-input') as HTMLInputElement;
    const personaInput = document.getElementById('member-persona-input') as HTMLTextAreaElement;
    const patSuffixInput = document.getElementById('member-pat-suffix-input') as HTMLInputElement;

    if (nameInput) nameInput.value = member.name;
    if (personaInput) personaInput.value = member.persona;
    if (patSuffixInput) patSuffixInput.value = member.patSuffix || '';

    const memberEditor = document.getElementById('member-editor');
    if (memberEditor) {
      memberEditor.classList.add('active');
    }
  }

  /**
   * 保存成员更改
   */
  private async saveMemberChanges(): Promise<void> {
    const win = window as any;
    const state = win.STATE?.state;
    
    if (!this.editingMemberId) return;

    const chat = state?.chats[state.activeChatId];
    if (!chat || !chat.isGroup || !chat.members) return;

    const member = chat.members.find(m => m.id === this.editingMemberId);
    if (!member) return;

    const nameInput = document.getElementById('member-name-input') as HTMLInputElement;
    const personaInput = document.getElementById('member-persona-input') as HTMLTextAreaElement;
    const patSuffixInput = document.getElementById('member-pat-suffix-input') as HTMLInputElement;

    if (nameInput) member.name = nameInput.value.trim() || member.name;
    if (personaInput) member.persona = personaInput.value.trim() || member.persona;
    if (patSuffixInput) member.patSuffix = patSuffixInput.value.trim();

    await DB.saveChat(chat);
    this.renderGroupMemberSettings();
    this.closeMemberEditor();
  }

  /**
   * 关闭成员编辑器
   */
  private closeMemberEditor(): void {
    this.editingMemberId = null;
    const memberEditor = document.getElementById('member-editor');
    if (memberEditor) {
      memberEditor.classList.remove('active');
    }
  }

  /**
   * 渲染群成员设置
   */
  private renderGroupMemberSettings(): void {
    const win = window as any;
    if (win.PersonaService?.renderGroupMemberSettings) {
      win.PersonaService.renderGroupMemberSettings();
    }
  }

  /**
   * 删除群成员
   */
  private async deleteMember(memberId: string): Promise<void> {
    const win = window as any;
    const state = win.STATE?.state;
    
    const confirmed = await win.showCustomConfirm('删除成员', '确定要删除这个群成员吗？');
    if (!confirmed) return;

    const chat = state?.chats[state.activeChatId];
    if (!chat || !chat.isGroup || !chat.members) return;

    chat.members = chat.members.filter(m => m.id !== memberId);
    await DB.saveChat(chat);
    this.renderGroupMemberSettings();
  }
}

// === 全局单例实例 ===
export const initializationModule = new InitializationModule();

// === 向后兼容：注入到window对象（类型声明移至init/compat.ts） ===

// 注入到window对象，保持向后兼容性
if (typeof window !== 'undefined') {
  const win = window as any;
  
  // 主模块实例
  win.InitializationModule = initializationModule;
  
  // 初始化API
  win.initializeApp = () => initializationModule.initializeApp();
  
  // 导出UI状态管理方法，避免在main.ts中重复
  win.exitSelectionMode = () => initializationModule.exitSelectionMode();
  win.toggleMessageEditMode = () => initializationModule.toggleMessageEditMode();
  win.sendUserTransfer = () => initializationModule.sendUserTransfer();
}

// 默认导出
export default {
  initializationModule,
  InitializationModule
};

console.log('初始化模块(TypeScript版)已加载');