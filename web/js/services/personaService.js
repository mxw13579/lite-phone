// 角色人设服务模块 - services/personaService.js
// 提供角色人设预设的创建、编辑、删除、应用功能

let editingPersonaPresetId = null;

// 获取默认头像
function getDefaultAvatar() {
    return window.CONSTANTS?.DEFAULT_AVATAR || 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
}

// 打开人设库
export function openPersonaLibrary() {
    renderPersonaLibrary();
    const personaLibraryModal = document.getElementById('persona-library-modal');
    if (personaLibraryModal) {
        personaLibraryModal.classList.add('visible');
    }
}

// 关闭人设库
export function closePersonaLibrary() {
    const personaLibraryModal = document.getElementById('persona-library-modal');
    if (personaLibraryModal) {
        personaLibraryModal.classList.remove('visible');
    }
}

// 渲染人设库
export function renderPersonaLibrary() {
    const state = window.STATE?.state;
    if (!state) return;

    const grid = document.getElementById('persona-library-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (state.personaPresets.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1; text-align: center; margin-top: 20px;">空空如也~ 点击右上角"添加"来创建你的第一个人设预设吧！</p>';
        return;
    }

    state.personaPresets.forEach(preset => {
        const item = document.createElement('div');
        item.className = 'persona-preset-item';
        item.style.backgroundImage = `url(${preset.avatar})`;
        item.dataset.presetId = preset.id;
        
        item.addEventListener('click', () => applyPersonaPreset(preset.id));
        addLongPressListener(item, () => showPresetActions(preset.id));
        
        grid.appendChild(item);
    });
}

// 应用人设预设
export function applyPersonaPreset(presetId) {
    const state = window.STATE?.state;
    if (!state) return;

    const preset = state.personaPresets.find(p => p.id === presetId);
    if (preset) {
        const myAvatarPreview = document.getElementById('my-avatar-preview');
        const myPersona = document.getElementById('my-persona');
        
        if (myAvatarPreview) {
            myAvatarPreview.src = preset.avatar;
        }
        if (myPersona) {
            myPersona.value = preset.persona;
        }
    }
    closePersonaLibrary();
}

// 显示预设操作菜单
export function showPresetActions(presetId) {
    editingPersonaPresetId = presetId;
    const presetActionsModal = document.getElementById('preset-actions-modal');
    if (presetActionsModal) {
        presetActionsModal.classList.add('visible');
    }
}

// 隐藏预设操作菜单
export function hidePresetActions() {
    const presetActionsModal = document.getElementById('preset-actions-modal');
    if (presetActionsModal) {
        presetActionsModal.classList.remove('visible');
    }
    editingPersonaPresetId = null;
}

// 打开人设编辑器（创建模式）
export function openPersonaEditorForCreate() {
    editingPersonaPresetId = null;
    
    const personaEditorTitle = document.getElementById('persona-editor-title');
    const presetAvatarPreview = document.getElementById('preset-avatar-preview');
    const presetPersonaInput = document.getElementById('preset-persona-input');
    const personaEditorModal = document.getElementById('persona-editor-modal');
    
    if (personaEditorTitle) {
        personaEditorTitle.textContent = '添加人设预设';
    }
    if (presetAvatarPreview) {
        presetAvatarPreview.src = getDefaultAvatar();
    }
    if (presetPersonaInput) {
        presetPersonaInput.value = '';
    }
    if (personaEditorModal) {
        personaEditorModal.classList.add('visible');
    }
}

// 打开人设编辑器（编辑模式）
export function openPersonaEditorForEdit() {
    if (!editingPersonaPresetId) return;
    
    const state = window.STATE?.state;
    if (!state) return;

    const preset = state.personaPresets.find(p => p.id === editingPersonaPresetId);
    if (!preset) return;

    const personaEditorTitle = document.getElementById('persona-editor-title');
    const presetAvatarPreview = document.getElementById('preset-avatar-preview');
    const presetPersonaInput = document.getElementById('preset-persona-input');
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
export async function deletePersonaPreset() {
    if (!editingPersonaPresetId) return;

    const confirmed = await showCustomConfirm(
        '删除预设',
        '确定要删除这个人设预设吗？此操作不可恢复。',
        {confirmButtonClass: 'btn-danger'}
    );
    
    if (confirmed) {
        const state = window.STATE?.state;
        const db = window.DB?.db;
        
        if (state && db) {
            await db.personaPresets.delete(editingPersonaPresetId);
            state.personaPresets = state.personaPresets.filter(p => p.id !== editingPersonaPresetId);
            hidePresetActions();
            renderPersonaLibrary();
        }
    }
}

// 关闭人设编辑器
export function closePersonaEditor() {
    const personaEditorModal = document.getElementById('persona-editor-modal');
    if (personaEditorModal) {
        personaEditorModal.classList.remove('visible');
    }
    editingPersonaPresetId = null;
}

// 保存人设预设
export async function savePersonaPreset() {
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db) return;

    const presetAvatarPreview = document.getElementById('preset-avatar-preview');
    const presetPersonaInput = document.getElementById('preset-persona-input');
    
    if (!presetAvatarPreview || !presetPersonaInput) return;

    const avatar = presetAvatarPreview.src;
    const persona = presetPersonaInput.value.trim();
    const defaultAvatar = getDefaultAvatar();

    if (avatar === defaultAvatar && !persona) {
        alert("头像和人设不能都为空哦！");
        return;
    }

    if (editingPersonaPresetId) {
        // 编辑现有预设
        const preset = state.personaPresets.find(p => p.id === editingPersonaPresetId);
        if (preset) {
            preset.avatar = avatar;
            preset.persona = persona;
            await db.personaPresets.put(preset);
        }
    } else {
        // 创建新预设
        const newPreset = {
            id: 'preset_' + Date.now(),
            avatar: avatar,
            persona: persona
        };
        await db.personaPresets.add(newPreset);
        state.personaPresets.push(newPreset);
    }

    renderPersonaLibrary();
    closePersonaEditor();
}

// 初始化人设预设事件监听器
export function initPersonaPresetListeners() {
    const openPersonaLibraryBtn = document.getElementById('open-persona-library-btn');
    const closePersonaLibraryBtn = document.getElementById('close-persona-library-btn');
    const addPersonaPresetBtn = document.getElementById('add-persona-preset-btn');
    const cancelPersonaEditorBtn = document.getElementById('cancel-persona-editor-btn');
    const savePersonaPresetBtn = document.getElementById('save-persona-preset-btn');
    const presetActionEdit = document.getElementById('preset-action-edit');
    const presetActionDelete = document.getElementById('preset-action-delete');
    const presetActionCancel = document.getElementById('preset-action-cancel');

    if (openPersonaLibraryBtn) {
        openPersonaLibraryBtn.addEventListener('click', openPersonaLibrary);
    }
    if (closePersonaLibraryBtn) {
        closePersonaLibraryBtn.addEventListener('click', closePersonaLibrary);
    }
    if (addPersonaPresetBtn) {
        addPersonaPresetBtn.addEventListener('click', openPersonaEditorForCreate);
    }
    if (cancelPersonaEditorBtn) {
        cancelPersonaEditorBtn.addEventListener('click', closePersonaEditor);
    }
    if (savePersonaPresetBtn) {
        savePersonaPresetBtn.addEventListener('click', savePersonaPreset);
    }
    if (presetActionEdit) {
        presetActionEdit.addEventListener('click', openPersonaEditorForEdit);
    }
    if (presetActionDelete) {
        presetActionDelete.addEventListener('click', deletePersonaPreset);
    }
    if (presetActionCancel) {
        presetActionCancel.addEventListener('click', hidePresetActions);
    }

    console.log('人设预设事件监听器已初始化');
}

// 群成员管理相关
export function openMemberEditor(memberId) {
    const state = window.STATE?.state;
    if (!state?.activeChatId) return;

    const chat = state.chats[state.activeChatId];
    if (!chat || !chat.isGroup) return;

    const member = chat.members.find(m => m.id === memberId);
    if (!member) return;

    const memberNameInput = document.getElementById('member-name-input');
    const memberPersonaInput = document.getElementById('member-persona-input');
    const memberPatSuffixInput = document.getElementById('member-pat-suffix-input');
    const memberAvatarPreview = document.getElementById('member-avatar-preview');
    const memberSettingsModal = document.getElementById('member-settings-modal');

    if (memberNameInput) memberNameInput.value = member.name;
    if (memberPersonaInput) memberPersonaInput.value = member.persona;
    if (memberPatSuffixInput) memberPatSuffixInput.value = member.patSuffix || '';
    if (memberAvatarPreview) {
        const defaultGroupMemberAvatar = window.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || 'https://i.postimg.cc/VkQfgzGJ/1.jpg';
        memberAvatarPreview.src = member.avatar || defaultGroupMemberAvatar;
    }
    if (memberSettingsModal) {
        memberSettingsModal.classList.add('visible');
    }

    // 存储当前编辑的成员ID供保存时使用
    window._editingMemberId = memberId;
}

// 渲染群成员设置
export function renderGroupMemberSettings(members) {
    const container = document.getElementById('group-members-settings');
    if (!container) return;

    const defaultGroupMemberAvatar = window.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || 'https://i.postimg.cc/VkQfgzGJ/1.jpg';
    
    container.innerHTML = '';
    
    members.forEach(member => {
        const item = document.createElement('div');
        item.className = 'member-editor';
        item.dataset.memberId = member.id;

        item.innerHTML = `
            <div class="member-avatar-container">
                <img src="${member.avatar || defaultGroupMemberAvatar}" alt="${member.name}">
                <div class="delete-member-btn" title="删除该成员">&times;</div>
            </div>
            <span class="member-name">${member.name}</span>
        `;

        // 头像点击编辑
        const avatarImg = item.querySelector('img');
        avatarImg.addEventListener('click', () => openMemberEditor(member.id));

        // 删除按钮
        const deleteBtn = item.querySelector('.delete-member-btn');
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmed = await showCustomConfirm(
                '删除成员',
                `确定要删除成员 "${member.name}" 吗？`,
                {confirmButtonClass: 'btn-danger'}
            );
            if (confirmed) {
                const state = window.STATE?.state;
                if (state?.activeChatId) {
                    const chat = state.chats[state.activeChatId];
                    chat.members = chat.members.filter(m => m.id !== member.id);
                    renderGroupMemberSettings(chat.members);
                }
            }
        });

        container.appendChild(item);
    });
}

// 辅助函数
function addLongPressListener(element, callback) {
    if (window.ChatModule?.addLongPressListener) {
        return window.ChatModule.addLongPressListener(element, callback);
    }
    
    // 简单的长按实现
    let pressTimer;
    const startPress = () => {
        pressTimer = setTimeout(callback, 500);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    
    element.addEventListener('mousedown', startPress);
    element.addEventListener('mouseup', cancelPress);
    element.addEventListener('mouseleave', cancelPress);
    element.addEventListener('touchstart', startPress, {passive: true});
    element.addEventListener('touchend', cancelPress);
}

function showCustomConfirm(title, message, options = {}) {
    if (window.showCustomConfirm) {
        return window.showCustomConfirm(title, message, options);
    }
    return confirm(message);
}

export { editingPersonaPresetId };

console.log('角色人设服务模块已初始化');