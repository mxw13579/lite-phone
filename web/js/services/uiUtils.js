/**
 * UI工具服务模块 - services/uiUtils.js
 * 提供通用的UI组件和工具函数
 * 
 * 主要功能：
 * - 模态框管理（Modal Management）
 * - 通知系统（Notification System） 
 * - 时钟显示（Clock Display）
 * - 主题管理（Theme Management）
 * 
 * @module UIUtils
 * @version 1.0.0
 */

let modalResolve = null;
let notificationTimeout = null;

/**
 * 显示自定义模态框
 * @function showCustomModal
 * @returns {void}
 */
export function showCustomModal() {
    const modalOverlay = document.getElementById('custom-modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('visible');
    }
}

export function hideCustomModal() {
    const modalOverlay = document.getElementById('custom-modal-overlay');
    const modalConfirmBtn = document.getElementById('custom-modal-confirm');
    
    if (modalOverlay) {
        modalOverlay.classList.remove('visible');
    }
    if (modalConfirmBtn) {
        modalConfirmBtn.classList.remove('btn-danger');
    }
    if (modalResolve) {
        modalResolve(null);
    }
}

/**
 * 显示确认对话框
 * @function showCustomConfirm
 * @param {string} title - 对话框标题
 * @param {string} message - 对话框消息内容
 * @param {Object} [options={}] - 配置选项
 * @param {string} [options.confirmText] - 确认按钮文本
 * @param {string} [options.confirmButtonClass] - 确认按钮CSS类名
 * @returns {Promise<boolean>} 用户确认结果
 */
export function showCustomConfirm(title, message, options = {}) {
    return new Promise(resolve => {
        modalResolve = resolve;
        
        const modalTitle = document.getElementById('custom-modal-title');
        const modalBody = document.getElementById('custom-modal-body');
        const modalCancelBtn = document.getElementById('custom-modal-cancel');
        const modalConfirmBtn = document.getElementById('custom-modal-confirm');
        
        if (!modalTitle || !modalBody || !modalCancelBtn || !modalConfirmBtn) {
            console.error('Modal elements not found');
            resolve(false);
            return;
        }
        
        modalTitle.textContent = title;
        modalBody.innerHTML = `<p>${message}</p>`;
        modalCancelBtn.style.display = 'block';
        modalConfirmBtn.textContent = options.confirmText || '确定';
        
        if (options.confirmButtonClass) {
            modalConfirmBtn.classList.add(options.confirmButtonClass);
        }
        
        modalConfirmBtn.onclick = () => {
            resolve(true);
            hideCustomModal();
        };
        
        modalCancelBtn.onclick = () => {
            resolve(false);
            hideCustomModal();
        };
        
        showCustomModal();
    });
}

export function showCustomAlert(title, message) {
    return new Promise(resolve => {
        modalResolve = resolve;
        
        const modalTitle = document.getElementById('custom-modal-title');
        const modalBody = document.getElementById('custom-modal-body');
        const modalCancelBtn = document.getElementById('custom-modal-cancel');
        const modalConfirmBtn = document.getElementById('custom-modal-confirm');
        
        if (!modalTitle || !modalBody || !modalCancelBtn || !modalConfirmBtn) {
            console.error('Modal elements not found');
            resolve(true);
            return;
        }
        
        modalTitle.textContent = title;
        modalBody.innerHTML = `<p style="text-align: left; white-space: pre-wrap;">${message}</p>`;
        modalCancelBtn.style.display = 'none';
        modalConfirmBtn.textContent = '好的';
        
        modalConfirmBtn.onclick = () => {
            modalCancelBtn.style.display = 'block';
            modalConfirmBtn.textContent = '确定';
            resolve(true);
            hideCustomModal();
        };
        
        showCustomModal();
    });
}

export function showCustomPrompt(title, placeholder, initialValue = '', type = 'text') {
    return new Promise(resolve => {
        modalResolve = resolve;
        
        const modalTitle = document.getElementById('custom-modal-title');
        const modalBody = document.getElementById('custom-modal-body');
        const modalConfirmBtn = document.getElementById('custom-modal-confirm');
        const modalCancelBtn = document.getElementById('custom-modal-cancel');
        
        if (!modalTitle || !modalBody || !modalConfirmBtn || !modalCancelBtn) {
            console.error('Modal elements not found');
            resolve(null);
            return;
        }
        
        modalTitle.textContent = title;
        modalBody.innerHTML = `<input type="${type}" id="custom-prompt-input" placeholder="${placeholder}" value="${initialValue}">`;
        
        const input = document.getElementById('custom-prompt-input');
        modalConfirmBtn.textContent = '确定';
        
        modalConfirmBtn.onclick = () => {
            resolve(input ? input.value : null);
            hideCustomModal();
        };
        
        modalCancelBtn.onclick = () => {
            resolve(null);
            hideCustomModal();
        };
        
        showCustomModal();
        
        // Focus input after modal is shown
        setTimeout(() => {
            if (input) input.focus();
        }, 100);
    });
}

// 通知管理
export function showNotification(chatId, messageContent) {
    const state = window.STATE?.state;
    if (!state || !state.chats[chatId]) return;
    
    clearTimeout(notificationTimeout);
    const chat = state.chats[chatId];
    const bar = document.getElementById('notification-bar');
    
    if (!bar) return;
    
    const avatar = document.getElementById('notification-avatar');
    const nameEl = document.getElementById('notification-content')?.querySelector('.name');
    const messageEl = document.getElementById('notification-content')?.querySelector('.message');
    
    if (avatar) {
        const avatars = window.CONSTANTS;
        const defaultAvatar = avatars?.DEFAULT_AVATAR || 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
        avatar.src = chat.settings.aiAvatar || chat.settings.groupAvatar || defaultAvatar;
    }
    
    if (nameEl) nameEl.textContent = chat.name;
    if (messageEl) messageEl.textContent = messageContent;
    
    const newBar = bar.cloneNode(true);
    bar.parentNode.replaceChild(newBar, bar);
    
    newBar.addEventListener('click', () => {
        if (window.ChatModule?.openChat) {
            window.ChatModule.openChat(chatId);
        }
        newBar.classList.remove('visible');
    });
    
    newBar.classList.add('visible');
    notificationTimeout = setTimeout(() => {
        newBar.classList.remove('visible');
    }, 4000);
}

// 时钟管理
export function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
    const dateString = now.toLocaleDateString('zh-CN', {weekday: 'long', month: 'long', day: 'numeric'});
    
    const mainTime = document.getElementById('main-time');
    const statusBarTime = document.getElementById('status-bar-time');
    const mainDate = document.getElementById('main-date');
    
    if (mainTime) mainTime.textContent = timeString;
    if (statusBarTime) statusBarTime.textContent = timeString;
    if (mainDate) mainDate.textContent = dateString;
}

// 初始化时钟（定期更新）
export function initClock() {
    updateClock();
    setInterval(updateClock, 1000 * 30); // 每30秒更新一次
}

// 主题列表模态框管理
export function closeThemeListModal() {
    const themeListModal = document.getElementById('theme-list-modal');
    const themeListContainer = document.getElementById('theme-list-container');
    
    if (themeListModal) {
        themeListModal.classList.remove('visible');
    }
    if (themeListContainer) {
        themeListContainer.innerHTML = ''; // 关闭时清空内容
    }
}

export async function openThemeListModal(jsonUrl, title) {
    const themeListModal = document.getElementById('theme-list-modal');
    const themeListModalTitle = document.getElementById('theme-list-modal-title');
    const themeListContainer = document.getElementById('theme-list-container');
    
    if (!themeListModal || !themeListContainer) return;
    
    if (themeListModalTitle) {
        themeListModalTitle.textContent = title;
    }
    
    themeListModal.classList.add('visible');
    themeListContainer.innerHTML = '<p>正在加载主题列表...</p>';
    
    try {
        const response = await fetch(jsonUrl);
        if (!response.ok) {
            throw new Error(`网络请求失败: ${response.status}`);
        }
        
        const themes = await response.json();
        if (!Array.isArray(themes) || themes.length === 0) {
            themeListContainer.innerHTML = '<p>未找到有效的主题或列表为空。</p>';
            return;
        }
        
        themeListContainer.innerHTML = ''; // 清空加载提示
        themes.forEach((theme, index) => {
            const themeId = `theme-option-${index}`;
            const themeItem = document.createElement('div');
            themeItem.className = 'theme-item';
            themeItem.innerHTML = `
                <div class="theme-item-header">
                    <input type="radio" id="${themeId}" name="theme-selection" value="${theme.css_url}">
                    <label for="${themeId}">${theme.description || '无标题'}</label>
                </div>
                <div class="theme-item-details">
                    <span>作者: ${theme.author || '未知'}</span>
                    <span>版本: ${theme.version || '未知'}</span>
                </div>
                <p class="theme-item-remark">${theme.remark || '无备注'}</p>
            `;
            themeListContainer.appendChild(themeItem);
        });
    } catch (error) {
        console.error("加载主题列表失败:", error);
        themeListContainer.innerHTML = `<p style="color: red;">加载失败: ${error.message}</p>`;
    }
}

export async function confirmThemeSelection() {
    const selectedRadio = document.querySelector('input[name="theme-selection"]:checked');
    if (!selectedRadio) {
        alert('请先选择一个主题！');
        return;
    }
    
    const url = selectedRadio.value;
    const stylesheet = document.getElementById('main-stylesheet');
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    // 应用主题
    if (stylesheet) {
        if (url && url.trim() !== '') {
            stylesheet.href = url + '?v=' + Date.now();
        } else {
            stylesheet.href = './unified-style.css';
        }
    }
    
    // 保存主题设置
    if (state && db) {
        state.globalSettings.remoteThemeUrl = url;
        await db.globalSettings.put(state.globalSettings);
    }
    
    showCustomAlert("主题已更新", "新主题已应用并保存。");
    closeThemeListModal();
}

// 初始化模态框事件监听器
export function initModalListeners() {
    const modalCancelBtn = document.getElementById('custom-modal-cancel');
    const modalOverlay = document.getElementById('custom-modal-overlay');
    
    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', hideCustomModal);
    }
    
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                hideCustomModal();
            }
        });
    }
}

console.log('UI工具服务模块已初始化');