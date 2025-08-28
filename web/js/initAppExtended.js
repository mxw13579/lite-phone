/**
 * 应用初始化模块扩展 - js/initAppExtended.js
 * 包含剩余的DOM事件监听器初始化设置
 * 
 * @module InitAppExtended
 * @version 1.0.0
 */

/**
 * 初始化应用的扩展事件监听器
 * @function initializeAppExtended
 * @returns {Promise<void>}
 */
export async function initializeAppExtended() {
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    // 获取默认头像常量
    const defaultAvatar = window.CONSTANTS?.DEFAULT_AVATAR || 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
    const defaultMyGroupAvatar = window.CONSTANTS?.DEFAULT_MY_GROUP_AVATAR || 'https://i.postimg.cc/cLPP10Vm/4.jpg';
    const defaultGroupMemberAvatar = window.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || 'https://i.postimg.cc/VkQfgzGJ/1.jpg';
    const defaultGroupAvatar = window.CONSTANTS?.DEFAULT_GROUP_AVATAR || 'https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg';
    
    // 追踪变量
    let selectedMessages = new Set();
    let editingMemberId = null;
    
    // 辅助函数
    const showCustomPrompt = window.UIService?.showCustomPrompt || window.showCustomPrompt;
    const showCustomConfirm = window.UIService?.showCustomConfirm || window.showCustomConfirm;
    const showCustomAlert = window.UIService?.showCustomAlert || window.showCustomAlert;
    
    function exitSelectionMode() {
        selectedMessages.clear();
        document.getElementById('chat-interface-screen')?.classList.remove('selection-mode');
        document.querySelectorAll('.message-bubble.selected').forEach(bubble => {
            bubble.classList.remove('selected');
        });
    }
    
    function openMemberEditor(memberId) {
        editingMemberId = memberId;
        const chat = state.chats[state.activeChatId];
        if (!chat || !chat.isGroup) return;
        const member = chat.members.find(m => m.id === memberId);
        if (!member) return;

        document.getElementById('member-name-input').value = member.name;
        document.getElementById('member-persona-input').value = member.persona;
        document.getElementById('member-pat-suffix-input').value = member.patSuffix || '';
        document.getElementById('member-avatar-preview').src = member.avatar || defaultGroupMemberAvatar;

        document.getElementById('member-settings-modal').classList.add('visible');
    }
    
    // ========== 聊天设置相关事件监听器 ==========
    
    const chatSettingsModal = document.getElementById('chat-settings-modal');
    const worldBookCheckboxesContainer = document.getElementById('world-book-checkboxes-container');

    function updateWorldBookSelectionDisplay() {
        const checkedBoxes = worldBookCheckboxesContainer?.querySelectorAll('input:checked');
        const displayText = document.querySelector('.selected-options-text');
        if (!checkedBoxes || !displayText) return;
        
        if (checkedBoxes.length === 0) {
            displayText.textContent = '-- 点击选择 --';
        } else if (checkedBoxes.length > 2) {
            displayText.textContent = `已选择 ${checkedBoxes.length} 项`;
        } else {
            displayText.textContent = Array.from(checkedBoxes).map(cb => cb.parentElement.textContent.trim()).join(', ');
        }
    }

    // 打开聊天设置
    document.getElementById('chat-settings-btn')?.addEventListener('click', () => {
        if (!state.activeChatId) return;
        const chat = state.chats[state.activeChatId];
        const isGroup = chat.isGroup;
        
        document.getElementById('chat-name-group').style.display = 'block';
        document.getElementById('chat-name-input').value = chat.name;
        document.getElementById('my-persona-group').style.display = 'block';
        document.getElementById('my-persona').value = chat.settings.myPersona;
        document.getElementById('my-pat-suffix-input').value = chat.settings.myPatSuffix || '';
        document.getElementById('my-avatar-group').style.display = 'block';
        document.getElementById('my-avatar-preview').src = chat.settings.myAvatar || (isGroup ? defaultMyGroupAvatar : defaultAvatar);
        document.getElementById('my-group-nickname-group').style.display = isGroup ? 'block' : 'none';
        document.getElementById('group-avatar-group').style.display = isGroup ? 'block' : 'none';
        document.getElementById('group-members-group').style.display = isGroup ? 'block' : 'none';
        document.getElementById('ai-persona-group').style.display = isGroup ? 'none' : 'block';
        document.getElementById('ai-avatar-group').style.display = isGroup ? 'none' : 'block';
        
        worldBookCheckboxesContainer.innerHTML = '';
        const linkedIds = chat.settings.linkedWorldBookIds || [];
        if (state.worldBooks.length === 0) {
            worldBookCheckboxesContainer.innerHTML = '<p style="color: #888; text-align: center; margin: 10px 0;">没有可用的世界书</p>';
        } else {
            state.worldBooks.forEach(book => {
                const isChecked = linkedIds.includes(book.id);
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="${book.id}" ${isChecked ? 'checked' : ''}> ${book.name}`;
                worldBookCheckboxesContainer.appendChild(label);
            });
        }
        updateWorldBookSelectionDisplay();
        
        const bgPreview = document.getElementById('bg-preview');
        const removeBgBtn = document.getElementById('remove-bg-btn');
        if (chat.settings.background) {
            bgPreview.src = chat.settings.background;
            bgPreview.style.display = 'block';
            removeBgBtn.style.display = 'inline-block';
        } else {
            bgPreview.style.display = 'none';
            removeBgBtn.style.display = 'none';
        }
        
        if (isGroup) {
            document.getElementById('my-group-nickname-input').value = chat.settings.myNickname || '';
            document.getElementById('group-avatar-preview').src = chat.settings.groupAvatar || defaultGroupAvatar;
            window.PersonaService?.renderGroupMemberSettings(chat.members);
        } else {
            document.getElementById('ai-persona').value = chat.settings.aiPersona;
            document.getElementById('ai-pat-suffix-input').value = chat.settings.aiPatSuffix || '';
            document.getElementById('ai-avatar-preview').src = chat.settings.aiAvatar || defaultAvatar;
        }
        
        document.getElementById('max-memory').value = chat.settings.maxMemory;
        const currentTheme = chat.settings.theme || 'default';
        const themeRadio = document.querySelector(`input[name="theme-select"][value="${currentTheme}"]`);
        if (themeRadio) themeRadio.checked = true;
        chatSettingsModal.classList.add('visible');
    });
    
    // 群组成员管理
    document.getElementById('add-group-member-btn')?.addEventListener('click', () => {
        if (!state.activeChatId || !state.chats[state.activeChatId].isGroup) return;
        const chat = state.chats[state.activeChatId];
        const newMember = {
            id: `member_${Date.now()}`,
            name: `新成员${chat.members.length + 1}`,
            avatar: defaultGroupMemberAvatar,
            persona: '一个新来的群成员。',
            patSuffix: '的后脑勺'
        };
        chat.members.push(newMember);
        window.PersonaService?.renderGroupMemberSettings(chat.members);
    });
    
    document.getElementById('cancel-member-settings-btn')?.addEventListener('click', () => {
        document.getElementById('member-settings-modal')?.classList.remove('visible');
        editingMemberId = null;
    });
    
    document.getElementById('save-member-settings-btn')?.addEventListener('click', () => {
        if (!editingMemberId) return;
        const chat = state.chats[state.activeChatId];
        const member = chat.members.find(m => m.id === editingMemberId);
        if (member) {
            member.name = document.getElementById('member-name-input').value;
            member.persona = document.getElementById('member-persona-input').value;
            member.patSuffix = document.getElementById('member-pat-suffix-input').value;
            member.avatar = document.getElementById('member-avatar-preview').src;
            window.PersonaService?.renderGroupMemberSettings(chat.members);
            document.getElementById('member-settings-modal')?.classList.remove('visible');
        }
    });
    
    // 聊天设置保存和取消
    document.getElementById('reset-theme-btn')?.addEventListener('click', () => {
        const themeDefault = document.getElementById('theme-default');
        if (themeDefault) themeDefault.checked = true;
    });
    
    document.getElementById('cancel-chat-settings-btn')?.addEventListener('click', () => {
        chatSettingsModal?.classList.remove('visible');
    });
    
    document.getElementById('save-chat-settings-btn')?.addEventListener('click', async () => {
        if (!state.activeChatId) return;
        const chat = state.chats[state.activeChatId];
        const newName = document.getElementById('chat-name-input').value.trim();
        if (!newName) return alert('备注名/群名不能为空！');
        
        chat.name = newName;
        const selectedThemeRadio = document.querySelector('input[name="theme-select"]:checked');
        chat.settings.theme = selectedThemeRadio ? selectedThemeRadio.value : 'default';
        chat.settings.myPersona = document.getElementById('my-persona').value;
        chat.settings.myPatSuffix = document.getElementById('my-pat-suffix-input').value;
        chat.settings.myAvatar = document.getElementById('my-avatar-preview').src;
        
        const checkedBooks = document.querySelectorAll('#world-book-checkboxes-container input[type="checkbox"]:checked');
        chat.settings.linkedWorldBookIds = Array.from(checkedBooks).map(cb => cb.value);
        
        if (chat.isGroup) {
            chat.settings.myNickname = document.getElementById('my-group-nickname-input').value.trim();
            chat.settings.groupAvatar = document.getElementById('group-avatar-preview').src;
        } else {
            chat.settings.aiPersona = document.getElementById('ai-persona').value;
            chat.settings.aiPatSuffix = document.getElementById('ai-pat-suffix-input').value;
            chat.settings.aiAvatar = document.getElementById('ai-avatar-preview').src;
        }
        
        chat.settings.maxMemory = parseInt(document.getElementById('max-memory').value) || 10;
        await db.chats.put(chat);
        chatSettingsModal?.classList.remove('visible');
        window.ChatModule?.renderChatInterface(state.activeChatId);
        window.ChatModule?.renderChatList();
    });
    
    // 清空聊天记录
    document.getElementById('clear-chat-btn')?.addEventListener('click', async () => {
        if (!state.activeChatId) return;
        const chat = state.chats[state.activeChatId];
        const confirmed = await showCustomConfirm('清空聊天记录', '此操作将永久删除此聊天的所有消息，无法恢复。确定要清空吗？', {confirmButtonClass: 'btn-danger'});
        if (confirmed) {
            chat.history = [];
            await db.chats.put(chat);
            window.ChatModule?.renderChatInterface(state.activeChatId);
            window.ChatModule?.renderChatList();
            chatSettingsModal?.classList.remove('visible');
        }
    });
    
    // ========== 文件上传处理器 ==========
    
    const setupFileUpload = (inputId, callback) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        
        input.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (file) {
                const dataUrl = await new Promise((res, rej) => {
                    const reader = new FileReader();
                    reader.onload = () => res(reader.result);
                    reader.onerror = () => rej(reader.error);
                    reader.readAsDataURL(file);
                });
                callback(dataUrl);
                event.target.value = null;
            }
        });
    };
    
    setupFileUpload('ai-avatar-input', (base64) => {
        const preview = document.getElementById('ai-avatar-preview');
        if (preview) preview.src = base64;
    });
    setupFileUpload('my-avatar-input', (base64) => {
        const preview = document.getElementById('my-avatar-preview');
        if (preview) preview.src = base64;
    });
    setupFileUpload('group-avatar-input', (base64) => {
        const preview = document.getElementById('group-avatar-preview');
        if (preview) preview.src = base64;
    });
    setupFileUpload('member-avatar-input', (base64) => {
        const preview = document.getElementById('member-avatar-preview');
        if (preview) preview.src = base64;
    });
    setupFileUpload('bg-input', (base64) => {
        if (state.activeChatId) {
            state.chats[state.activeChatId].settings.background = base64;
            const bgPreview = document.getElementById('bg-preview');
            const removeBgBtn = document.getElementById('remove-bg-btn');
            if (bgPreview) {
                bgPreview.src = base64;
                bgPreview.style.display = 'block';
            }
            if (removeBgBtn) {
                removeBgBtn.style.display = 'inline-block';
            }
        }
    });
    setupFileUpload('preset-avatar-input', (base64) => {
        const preview = document.getElementById('preset-avatar-preview');
        if (preview) preview.src = base64;
    });
    
    // 移除背景
    document.getElementById('remove-bg-btn')?.addEventListener('click', () => {
        if (state.activeChatId) {
            state.chats[state.activeChatId].settings.background = '';
            const bgPreview = document.getElementById('bg-preview');
            const removeBgBtn = document.getElementById('remove-bg-btn');
            if (bgPreview) {
                bgPreview.src = '';
                bgPreview.style.display = 'none';
            }
            if (removeBgBtn) {
                removeBgBtn.style.display = 'none';
            }
        }
    });
    
    // ========== 表情包管理事件监听器 ==========
    
    const stickerPanel = document.getElementById('sticker-panel');
    
    document.getElementById('open-sticker-panel-btn')?.addEventListener('click', () => {
        window.ChatModule?.renderStickerPanel();
        stickerPanel?.classList.add('visible');
    });
    
    document.getElementById('close-sticker-panel-btn')?.addEventListener('click', () => 
        stickerPanel?.classList.remove('visible'));
    
    document.getElementById('add-sticker-btn')?.addEventListener('click', async () => {
        const url = await showCustomPrompt("添加表情(URL)", "请输入表情包的图片URL");
        if (!url || !url.trim().startsWith('http')) return url && alert("请输入有效的URL (以http开头)");
        const name = await showCustomPrompt("命名表情", "请为这个表情命名 (例如：开心、疑惑)");
        if (name && name.trim()) {
            const newSticker = {id: 'sticker_' + Date.now(), url: url.trim(), name: name.trim()};
            await db.userStickers.add(newSticker);
            state.userStickers.push(newSticker);
            window.ChatModule?.renderStickerPanel();
        } else if (name !== null) alert("表情名不能为空！");
    });
    
    document.getElementById('upload-sticker-btn')?.addEventListener('click', () => 
        document.getElementById('sticker-upload-input')?.click());
    
    document.getElementById('sticker-upload-input')?.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64Url = reader.result;
            const name = await showCustomPrompt("命名表情", "请为这个表情命名 (例如：好耶、疑惑)");
            if (name && name.trim()) {
                const newSticker = {id: 'sticker_' + Date.now(), url: base64Url, name: name.trim()};
                await db.userStickers.add(newSticker);
                state.userStickers.push(newSticker);
                window.ChatModule?.renderStickerPanel();
            } else if (name !== null) alert("表情名不能为空！");
        };
        event.target.value = null;
    });
    
    // ========== 多媒体消息事件监听器 ==========
    
    // 上传图片
    document.getElementById('upload-image-btn')?.addEventListener('click', () => 
        document.getElementById('image-upload-input')?.click());
    
    document.getElementById('image-upload-input')?.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file || !state.activeChatId) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Url = e.target.result;
            const chat = state.chats[state.activeChatId];
            const msg = {
                role: 'user',
                content: [{type: 'image_url', image_url: {url: base64Url}}],
                timestamp: Date.now()
            };
            chat.history.push(msg);
            await db.chats.put(chat);
            window.ChatModule?.appendMessage(msg, chat);
            window.ChatModule?.renderChatList();
        };
        reader.readAsDataURL(file);
        event.target.value = null;
    });
    
    // 语音消息
    document.getElementById('voice-message-btn')?.addEventListener('click', async () => {
        if (!state.activeChatId) return;
        const text = await showCustomPrompt("发送语音", "请输入你想说的内容：");
        if (text && text.trim()) {
            const chat = state.chats[state.activeChatId];
            const msg = {role: 'user', type: 'voice_message', content: text.trim(), timestamp: Date.now()};
            chat.history.push(msg);
            await db.chats.put(chat);
            window.ChatModule?.appendMessage(msg, chat);
            window.ChatModule?.renderChatList();
        }
    });
    
    // 发送照片
    document.getElementById('send-photo-btn')?.addEventListener('click', async () => {
        if (!state.activeChatId) return;
        const description = await showCustomPrompt("发送照片", "请用文字描述您要发送的照片：");
        if (description && description.trim()) {
            const chat = state.chats[state.activeChatId];
            const msg = {role: 'user', type: 'user_photo', content: description.trim(), timestamp: Date.now()};
            chat.history.push(msg);
            await db.chats.put(chat);
            window.ChatModule?.appendMessage(msg, chat);
            window.ChatModule?.renderChatList();
        }
    });
    
    // ========== 人设管理事件监听器 ==========
    
    document.getElementById('open-persona-library-btn')?.addEventListener('click', 
        window.PersonaService?.openPersonaLibrary);
    document.getElementById('close-persona-library-btn')?.addEventListener('click', 
        window.PersonaService?.closePersonaLibrary);
    document.getElementById('add-persona-preset-btn')?.addEventListener('click', 
        window.PersonaService?.openPersonaEditorForCreate);
    document.getElementById('cancel-persona-editor-btn')?.addEventListener('click', 
        window.PersonaService?.closePersonaEditor);
    document.getElementById('save-persona-preset-btn')?.addEventListener('click', 
        window.PersonaService?.savePersonaPreset);
    document.getElementById('preset-action-edit')?.addEventListener('click', 
        window.PersonaService?.openPersonaEditorForEdit);
    document.getElementById('preset-action-delete')?.addEventListener('click', 
        window.PersonaService?.deletePersonaPreset);
    document.getElementById('preset-action-cancel')?.addEventListener('click', 
        window.PersonaService?.hidePresetActions);
    
    // ========== 消息选择和删除事件监听器 ==========
    
    document.getElementById('selection-cancel-btn')?.addEventListener('click', exitSelectionMode);
    
    document.getElementById('selection-delete-btn')?.addEventListener('click', async () => {
        if (selectedMessages.size === 0) return;
        const confirmed = await showCustomConfirm('删除消息', `确定要删除选中的 ${selectedMessages.size} 条消息吗？`, {confirmButtonClass: 'btn-danger'});
        if (confirmed) {
            const chat = state.chats[state.activeChatId];
            chat.history = chat.history.filter(msg => !selectedMessages.has(msg.timestamp));
            await db.chats.put(chat);
            window.ChatModule?.renderChatInterface(state.activeChatId);
            window.ChatModule?.renderChatList();
        }
    });
    
    // ========== 数据管理事件监听器 ==========
    
    document.getElementById('export-data-btn')?.addEventListener('click', 
        window.DataService?.exportData);
    document.getElementById('import-data-trigger-btn')?.addEventListener('click', () => 
        document.getElementById('import-data-input')?.click());
    document.getElementById('import-data-input')?.addEventListener('change', 
        window.DataService?.handleImportDataEvent);
    
    // 主题选择弹窗
    document.getElementById('cancel-theme-selection-btn')?.addEventListener('click', 
        window.UIService?.closeThemeListModal);
    document.getElementById('confirm-theme-selection-btn')?.addEventListener('click', 
        window.UIService?.confirmThemeSelection);
    
    // 初始化完成，显示首屏
    window.showScreen('home-screen');
    
    console.log('应用扩展初始化模块已加载完成');
}

console.log('应用扩展初始化模块已准备就绪');