/**
 * 人设管理服务模块 - TypeScript版本
 * Phase 2+4: 使用DB仓库访问 + 统一错误处理
 * 
 * 负责管理AI角色人设预设库功能，包括：
 * - 人设预设的创建、编辑、删除、应用
 * - 人设库界面的渲染与交互
 * - 群聊成员人设的管理
 * - 长按手势识别和模态框交互
 * 
 * 从services/index.ts第1204-1592行提取独立
 */

import type { PersonaPreset } from '../state';
import DB from '../database';
import { showError, showValidationError, showOperationError } from './errorHandling';

// === 类型定义 ===
interface ModalOptions {
  confirmText?: string;
  confirmButtonClass?: string;
}

interface StateManager {
  state: {
    chats: Record<string, any>;
    activeChatId: string | null;
    personaPresets: PersonaPreset[];
  };
}

interface DatabaseManager {
  db: {
    personaPresets: {
      delete(id: string): Promise<void>;
      put(preset: PersonaPreset): Promise<void>;
      add(preset: PersonaPreset): Promise<void>;
    };
  };
}

// === 角色人设服务模块 ===
export class PersonaService {
  private editingPersonaPresetId: string | null = null;

  // 获取默认头像
  private getDefaultAvatar(): string {
    const win = window as any;
    return win.CONSTANTS?.DEFAULT_AVATAR || 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
  }

  // 打开人设库
  openPersonaLibrary(): void {
    this.renderPersonaLibrary();
    const personaLibraryModal = document.getElementById('persona-library-modal');
    if (personaLibraryModal) {
      personaLibraryModal.classList.add('visible');
    }
  }

  // 关闭人设库
  closePersonaLibrary(): void {
    const personaLibraryModal = document.getElementById('persona-library-modal');
    if (personaLibraryModal) {
      personaLibraryModal.classList.remove('visible');
    }
  }

  // 渲染人设库
  renderPersonaLibrary(): void {
    const win = window as any;
    const state: StateManager = win.STATE;
    if (!state?.state) return;

    const grid = document.getElementById('persona-library-grid');
    if (!grid) return;

    // 安全：清空grid内容
    while (grid.firstChild) {
      grid.removeChild(grid.firstChild);
    }

    if (state.state.personaPresets.length === 0) {
      // 安全：使用DOM构建代替innerHTML
      const emptyP = document.createElement('p');
      emptyP.style.color = 'var(--text-secondary)';
      emptyP.style.gridColumn = '1 / -1';
      emptyP.style.textAlign = 'center';
      emptyP.style.marginTop = '20px';
      emptyP.textContent = '空空如也~ 点击右上角"添加"来创建你的第一个人设预设吧！';
      grid.appendChild(emptyP);
      return;
    }

    state.state.personaPresets.forEach(preset => {
      const item = document.createElement('div');
      item.className = 'persona-preset-item';
      item.style.backgroundImage = `url(${preset.avatar})`;
      item.dataset.presetId = preset.id;
      
      item.addEventListener('click', () => this.applyPersonaPreset(preset.id));
      this.addLongPressListener(item, () => this.showPresetActions(preset.id));
      
      grid.appendChild(item);
    });
  }

  // 应用人设预设
  applyPersonaPreset(presetId: string): void {
    const win = window as any;
    const state: StateManager = win.STATE;
    if (!state?.state) return;

    const preset = state.state.personaPresets.find(p => p.id === presetId);
    if (preset) {
      const myAvatarPreview = document.getElementById('my-avatar-preview') as HTMLImageElement;
      const myPersona = document.getElementById('my-persona') as HTMLTextAreaElement;
      
      if (myAvatarPreview) {
        myAvatarPreview.src = preset.avatar;
      }
      if (myPersona) {
        myPersona.value = preset.persona;
      }
    }
    this.closePersonaLibrary();
  }

  // 显示预设操作菜单
  showPresetActions(presetId: string): void {
    this.editingPersonaPresetId = presetId;
    const presetActionsModal = document.getElementById('preset-actions-modal');
    if (presetActionsModal) {
      presetActionsModal.classList.add('visible');
    }
  }

  // 隐藏预设操作菜单
  hidePresetActions(): void {
    const presetActionsModal = document.getElementById('preset-actions-modal');
    if (presetActionsModal) {
      presetActionsModal.classList.remove('visible');
    }
    this.editingPersonaPresetId = null;
  }

  // 打开人设编辑器（创建模式）
  openPersonaEditorForCreate(): void {
    this.editingPersonaPresetId = null;
    
    const personaEditorTitle = document.getElementById('persona-editor-title');
    const presetAvatarPreview = document.getElementById('preset-avatar-preview') as HTMLImageElement;
    const presetPersonaInput = document.getElementById('preset-persona-input') as HTMLTextAreaElement;
    const personaEditorModal = document.getElementById('persona-editor-modal');
    
    if (personaEditorTitle) {
      personaEditorTitle.textContent = '添加人设预设';
    }
    if (presetAvatarPreview) {
      presetAvatarPreview.src = this.getDefaultAvatar();
    }
    if (presetPersonaInput) {
      presetPersonaInput.value = '';
    }
    if (personaEditorModal) {
      personaEditorModal.classList.add('visible');
    }
  }

  // 打开人设编辑器（编辑模式）
  openPersonaEditorForEdit(): void {
    if (!this.editingPersonaPresetId) return;
    
    const win = window as any;
    const state: StateManager = win.STATE;
    if (!state?.state) return;

    const preset = state.state.personaPresets.find(p => p.id === this.editingPersonaPresetId);
    if (!preset) return;

    const personaEditorTitle = document.getElementById('persona-editor-title');
    const presetAvatarPreview = document.getElementById('preset-avatar-preview') as HTMLImageElement;
    const presetPersonaInput = document.getElementById('preset-persona-input') as HTMLTextAreaElement;
    const presetActionsModal = document.getElementById('preset-actions-modal');
    const personaEditorModal = document.getElementById('persona-editor-modal');

    if (personaEditorTitle) {
      personaEditorTitle.textContent = '编辑人设预设';
    }
    if (presetAvatarPreview) {
      presetAvatarPreview.src = preset.avatar;
    }
    if (presetPersonaInput) {
      presetPersonaInput.value = preset.persona;
    }
    if (presetActionsModal) {
      presetActionsModal.classList.remove('visible');
    }
    if (personaEditorModal) {
      personaEditorModal.classList.add('visible');
    }
  }

  // 删除人设预设
  async deletePersonaPreset(): Promise<void> {
    if (!this.editingPersonaPresetId) return;

    const confirmed = await this.showCustomConfirm(
      '删除预设',
      '确定要删除这个人设预设吗？此操作不可恢复。',
      {confirmButtonClass: 'btn-danger'}
    );
    
    if (confirmed) {
      const win = window as any;
      const state: StateManager = win.STATE;
      const db: DatabaseManager = win.DB;
      
      if (state?.state) {
        // Phase 2: 使用DB仓库替换直接Dexie调用
        await DB.deletePersonaPreset(this.editingPersonaPresetId);
        state.state.personaPresets = state.state.personaPresets.filter(p => p.id !== this.editingPersonaPresetId);
        this.hidePresetActions();
        this.renderPersonaLibrary();
      }
    }
  }

  // 关闭人设编辑器
  closePersonaEditor(): void {
    const personaEditorModal = document.getElementById('persona-editor-modal');
    if (personaEditorModal) {
      personaEditorModal.classList.remove('visible');
    }
    this.editingPersonaPresetId = null;
  }

  // 保存人设预设
  async savePersonaPreset(): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    
    if (!state?.state || !db?.db) return;

    const presetAvatarPreview = document.getElementById('preset-avatar-preview') as HTMLImageElement;
    const presetPersonaInput = document.getElementById('preset-persona-input') as HTMLTextAreaElement;
    
    if (!presetAvatarPreview || !presetPersonaInput) return;

    const avatar = presetAvatarPreview.src;
    const persona = presetPersonaInput.value.trim();
    const defaultAvatar = this.getDefaultAvatar();

    if (avatar === defaultAvatar && !persona) {
      showValidationError("头像和人设不能都为空");
      return;
    }

    if (this.editingPersonaPresetId) {
      // 编辑现有预设
      const preset = state.state.personaPresets.find(p => p.id === this.editingPersonaPresetId);
      if (preset) {
        preset.avatar = avatar;
        preset.persona = persona;
        // Phase 2: 使用DB仓库替换直接Dexie调用
        await DB.savePersonaPreset(preset);
      }
    } else {
      // 创建新预设
      const newPreset: PersonaPreset = {
        id: 'preset_' + Date.now(),
        avatar: avatar,
        persona: persona
      };
      // Phase 2: 使用DB仓库替换直接Dexie调用
      await DB.savePersonaPreset(newPreset);
      state.state.personaPresets.push(newPreset);
    }

    this.renderPersonaLibrary();
    this.closePersonaEditor();
  }

  // 群成员管理相关
  openMemberEditor(memberId: string): void {
    const win = window as any;
    const state: StateManager = win.STATE;
    if (!state?.state?.activeChatId) return;

    const chat = state.state.chats[state.state.activeChatId];
    if (!chat || !chat.isGroup) return;

    const member = chat.members?.find((m: any) => m.id === memberId);
    if (!member) return;

    const memberNameInput = document.getElementById('member-name-input') as HTMLInputElement;
    const memberPersonaInput = document.getElementById('member-persona-input') as HTMLTextAreaElement;
    const memberPatSuffixInput = document.getElementById('member-pat-suffix-input') as HTMLInputElement;
    const memberAvatarPreview = document.getElementById('member-avatar-preview') as HTMLImageElement;
    const memberSettingsModal = document.getElementById('member-settings-modal');

    if (memberNameInput) memberNameInput.value = member.name;
    if (memberPersonaInput) memberPersonaInput.value = member.persona;
    if (memberPatSuffixInput) memberPatSuffixInput.value = member.patSuffix || '';
    if (memberAvatarPreview) {
      const defaultGroupMemberAvatar = win.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || 'https://i.postimg.cc/VkQfgzGJ/1.jpg';
      memberAvatarPreview.src = member.avatar || defaultGroupMemberAvatar;
    }
    if (memberSettingsModal) {
      memberSettingsModal.classList.add('visible');
    }

    // 存储当前编辑的成员ID供保存时使用
    (win as any)._editingMemberId = memberId;
  }

  // 渲染群成员设置
  renderGroupMemberSettings(members: any[]): void {
    const container = document.getElementById('group-members-settings');
    if (!container) return;

    const win = window as any;
    const defaultGroupMemberAvatar = win.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || 'https://i.postimg.cc/VkQfgzGJ/1.jpg';
    
    // 安全：清空容器内容
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    
    members.forEach(member => {
      const item = document.createElement('div');
      item.className = 'member-editor';
      item.dataset.memberId = member.id;

      // 安全：使用DOM构建代替innerHTML
      const memberAvatarContainer = document.createElement('div');
      memberAvatarContainer.className = 'member-avatar-container';
      
      const avatarImg = document.createElement('img');
      avatarImg.src = member.avatar || defaultGroupMemberAvatar;
      avatarImg.alt = member.name;
      memberAvatarContainer.appendChild(avatarImg);
      
      const deleteBtn = document.createElement('div');
      deleteBtn.className = 'delete-member-btn';
      deleteBtn.title = '删除该成员';
      deleteBtn.textContent = '×'; // 使用textContent替代innerHTML
      memberAvatarContainer.appendChild(deleteBtn);
      
      const memberNameSpan = document.createElement('span');
      memberNameSpan.className = 'member-name';
      memberNameSpan.textContent = member.name;
      
      item.appendChild(memberAvatarContainer);
      item.appendChild(memberNameSpan);

      // 头像点击编辑
      avatarImg.addEventListener('click', () => this.openMemberEditor(member.id));

      // 删除按钮
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const confirmed = await this.showCustomConfirm(
          '删除成员',
          `确定要删除成员 "${member.name}" 吗？`,
          {confirmButtonClass: 'btn-danger'}
        );
        if (confirmed) {
          const state: StateManager = win.STATE;
          if (state?.state?.activeChatId) {
            const chat = state.state.chats[state.state.activeChatId];
            if (chat.members) {
              chat.members = chat.members.filter((m: any) => m.id !== member.id);
              this.renderGroupMemberSettings(chat.members);
            }
          }
        }
      });

      container.appendChild(item);
    });
  }

  // 初始化人设预设事件监听器
  initPersonaPresetListeners(): void {
    const openPersonaLibraryBtn = document.getElementById('open-persona-library-btn');
    const closePersonaLibraryBtn = document.getElementById('close-persona-library-btn');
    const addPersonaPresetBtn = document.getElementById('add-persona-preset-btn');
    const cancelPersonaEditorBtn = document.getElementById('cancel-persona-editor-btn');
    const savePersonaPresetBtn = document.getElementById('save-persona-preset-btn');
    const presetActionEdit = document.getElementById('preset-action-edit');
    const presetActionDelete = document.getElementById('preset-action-delete');
    const presetActionCancel = document.getElementById('preset-action-cancel');

    if (openPersonaLibraryBtn) {
      openPersonaLibraryBtn.addEventListener('click', () => this.openPersonaLibrary());
    }
    if (closePersonaLibraryBtn) {
      closePersonaLibraryBtn.addEventListener('click', () => this.closePersonaLibrary());
    }
    if (addPersonaPresetBtn) {
      addPersonaPresetBtn.addEventListener('click', () => this.openPersonaEditorForCreate());
    }
    if (cancelPersonaEditorBtn) {
      cancelPersonaEditorBtn.addEventListener('click', () => this.closePersonaEditor());
    }
    if (savePersonaPresetBtn) {
      savePersonaPresetBtn.addEventListener('click', () => this.savePersonaPreset());
    }
    if (presetActionEdit) {
      presetActionEdit.addEventListener('click', () => this.openPersonaEditorForEdit());
    }
    if (presetActionDelete) {
      presetActionDelete.addEventListener('click', () => this.deletePersonaPreset());
    }
    if (presetActionCancel) {
      presetActionCancel.addEventListener('click', () => this.hidePresetActions());
    }

    console.log('人设预设事件监听器已初始化');
  }

  // 辅助函数
  private addLongPressListener(element: HTMLElement, callback: () => void): void {
    const win = window as any;
    if (win.ChatModule?.addLongPressListener) {
      return win.ChatModule.addLongPressListener(element, callback);
    }
    
    // 简单的长按实现
    let pressTimer: number;
    const startPress = () => {
      pressTimer = window.setTimeout(callback, 500);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    
    element.addEventListener('mousedown', startPress);
    element.addEventListener('mouseup', cancelPress);
    element.addEventListener('mouseleave', cancelPress);
    element.addEventListener('touchstart', startPress, {passive: true});
    element.addEventListener('touchend', cancelPress);
  }

  private showCustomConfirm(title: string, message: string, options: ModalOptions = {}): Promise<boolean> {
    const win = window as any;
    if (win.showCustomConfirm) {
      return win.showCustomConfirm(title, message, options);
    }
    return Promise.resolve(confirm(message));
  }

  // 获取当前编辑的人设预设ID
  getEditingPersonaPresetId(): string | null {
    return this.editingPersonaPresetId;
  }
}

// === 人设管理服务实例 ===
export const personaService = new PersonaService();