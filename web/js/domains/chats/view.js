/**
 * 聊天视图层
 * 负责聊天界面的渲染和交互
 */

import { 
    getAllChats,
    createChat,
    updateChatSettings,
    sendMessage,
    getChatMessages,
    clearChatMessages,
    deleteChat,
    generateSystemPrompt
} from './controller.js';
import { $, byId, createElement, show, hide, setContent, addEventListener } from '../../utils/dom.js';
import { validateRequired } from '../../utils/validation.js';
import { showToast, showSuccess, showError, showWarning } from '../../utils/notify.js';
import { escapeHtml } from '../../utils/security.js'; // 🔒 安全修复：导入HTML转义函数
import { routeManager } from '../../core/router.js';

// 页面元素和状态
let elements = {};
let currentChatId = null;

/**
 * 初始化聊天视图
 */
export async function initializeChatsView() {
    try {
        // 缓存页面元素
        cacheElements();
        
        // 绑定事件
        bindEvents();
        
        console.log('Chats view initialized');
    } catch (error) {
        console.error('Failed to initialize chats view:', error);
        showError('聊天界面初始化失败');
    }
}

/**
 * 缓存页面元素
 */
function cacheElements() {
    elements = {
        // 聊天列表页面
        chatList: byId('chat-list'),
        addChatBtn: byId('add-chat-btn'),
        addGroupChatBtn: byId('add-group-chat-btn'),
        
        // 聊天界面页面
        chatMessages: byId('chat-messages'),
        chatInput: byId('chat-input'),
        sendBtn: byId('send-btn'),
        chatHeaderTitle: byId('chat-header-title'),
        backToListBtn: byId('back-to-list-btn'),
        chatSettingsBtn: byId('chat-settings-btn'),
        
        // 聊天设置模态框
        chatSettingsModal: byId('chat-settings-modal'),
        chatNameInput: byId('chat-name-input'),
        aiPersonaInput: byId('ai-persona'),
        myPersonaInput: byId('my-persona'),
        maxMemoryInput: byId('max-memory'),
        saveChatSettingsBtn: byId('save-chat-settings-btn'),
        cancelChatSettingsBtn: byId('cancel-chat-settings-btn'),
        clearChatBtn: byId('clear-chat-btn')
    };
}

/**
 * 绑定事件处理器
 */
function bindEvents() {
    // 聊天列表相关
    if (elements.addChatBtn) {
        addEventListener(elements.addChatBtn, 'click', handleAddSingleChat);
    }
    if (elements.addGroupChatBtn) {
        addEventListener(elements.addGroupChatBtn, 'click', handleAddGroupChat);
    }
    
    // 聊天界面相关
    if (elements.sendBtn) {
        addEventListener(elements.sendBtn, 'click', handleSendMessage);
    }
    if (elements.chatInput) {
        addEventListener(elements.chatInput, 'keypress', handleChatInputKeyPress);
    }
    if (elements.backToListBtn) {
        addEventListener(elements.backToListBtn, 'click', () => showScreen('chat-list-screen'));
    }
    if (elements.chatSettingsBtn) {
        addEventListener(elements.chatSettingsBtn, 'click', handleOpenChatSettings);
    }
    
    // 聊天设置模态框
    if (elements.saveChatSettingsBtn) {
        addEventListener(elements.saveChatSettingsBtn, 'click', handleSaveChatSettings);
    }
    if (elements.cancelChatSettingsBtn) {
        addEventListener(elements.cancelChatSettingsBtn, 'click', handleCloseChatSettings);
    }
    if (elements.clearChatBtn) {
        addEventListener(elements.clearChatBtn, 'click', handleClearChat);
    }
}

/**
 * 渲染聊天列表界面
 */
export async function renderChatListScreen() {
    try {
        const chats = await getAllChats();
        renderChatsList(chats);
        
        console.log('Chat list rendered');
    } catch (error) {
        console.error('Failed to render chat list screen:', error);
        showError('加载聊天列表失败');
    }
}

/**
 * 渲染聊天列表
 * @param {Array} chats 聊天数组
 */
function renderChatsList(chats) {
    if (!elements.chatList) return;
    
    if (chats.length === 0) {
        elements.chatList.innerHTML = `
            <div class="no-chats">
                <div class="no-chats-icon">💬</div>
                <p>还没有聊天记录</p>
                <p style="color: #999; font-size: 14px;">点击右上角的按钮开始聊天</p>
            </div>
        `;
        return;
    }
    
    const chatItems = chats.map(chat => createChatItem(chat));
    setContent(elements.chatList, chatItems.join(''), true);
    
    // 绑定聊天项事件
    bindChatItemEvents();
}

/**
 * 创建聊天项HTML
 * @param {Object} chat 聊天数据
 * @returns {string} HTML字符串
 */
function createChatItem(chat) {
    // 🔒 安全修复：对所有动态内容进行HTML转义
    const unreadBadge = chat.unreadCount > 0 ? `<span class="unread-badge">${escapeHtml(String(chat.unreadCount))}</span>` : '';
    const groupIcon = chat.isGroup ? '👥' : '💬';
    
    return `
        <div class="chat-item" data-chat-id="${escapeHtml(chat.id)}">
            <div class="chat-avatar">
                <span class="chat-icon">${groupIcon}</span>
            </div>
            <div class="chat-info">
                <div class="chat-header">
                    <h3 class="chat-name">${escapeHtml(chat.name)}</h3>
                    <span class="chat-time">${escapeHtml(chat.formattedTime)}</span>
                    ${unreadBadge}
                </div>
                <p class="chat-preview">${escapeHtml(chat.lastMessagePreview)}</p>
            </div>
            <div class="chat-actions">
                <button class="chat-action-btn delete-chat-btn" data-chat-id="${escapeHtml(chat.id)}" title="删除聊天">
                    <span>🗑️</span>
                </button>
            </div>
        </div>
    `;
}

/**
 * 绑定聊天项事件
 */
function bindChatItemEvents() {
    if (!elements.chatList) return;
    
    // 使用事件委托处理聊天项点击
    addEventListener(elements.chatList, 'click', (event) => {
        // 处理删除按钮
        const deleteBtn = event.target.closest('.delete-chat-btn');
        if (deleteBtn) {
            event.stopPropagation();
            const chatId = deleteBtn.dataset.chatId;
            handleDeleteChatFromList(chatId);
            return;
        }
        
        // 处理聊天项点击（打开聊天）
        const chatItem = event.target.closest('.chat-item');
        if (chatItem) {
            const chatId = chatItem.dataset.chatId;
            handleOpenChat(chatId);
        }
    });
}

/**
 * 打开聊天
 * @param {string} chatId 聊天ID
 */
async function handleOpenChat(chatId) {
    try {
        currentChatId = chatId;
        
        // 获取聊天信息
        const chats = await getAllChats();
        const chat = chats.find(c => c.id === chatId);
        
        if (!chat) {
            showError('聊天不存在');
            return;
        }
        
        // 更新聊天标题
        if (elements.chatHeaderTitle) {
            elements.chatHeaderTitle.textContent = chat.name;
        }
        
        // 加载聊天消息
        await loadChatMessages(chatId);
        
        // 切换到聊天界面
        showScreen('chat-interface-screen');
        
    } catch (error) {
        console.error('Failed to open chat:', error);
        showError('打开聊天失败');
    }
};

/**
 * 加载聊天消息
 * @param {string} chatId 聊天ID
 */
async function loadChatMessages(chatId) {
    try {
        const messages = await getChatMessages(chatId);
        renderChatMessages(messages);
        
        // 滚动到底部
        if (elements.chatMessages) {
            elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
        }
        
    } catch (error) {
        console.error('Failed to load chat messages:', error);
        showError('加载消息失败');
    }
}

/**
 * 渲染聊天消息
 * @param {Array} messages 消息数组
 */
function renderChatMessages(messages) {
    if (!elements.chatMessages) return;
    
    if (messages.length === 0) {
        elements.chatMessages.innerHTML = '<div class="no-messages">开始对话吧！</div>';
        return;
    }
    
    const messageItems = messages.reverse().map(message => createMessageItem(message));
    setContent(elements.chatMessages, messageItems.join(''), true);
}

/**
 * 创建消息项HTML
 * @param {Object} message 消息数据
 * @returns {string} HTML字符串
 */
function createMessageItem(message) {
    const isUser = message.senderId === 'user';
    const messageClass = isUser ? 'user-message' : 'ai-message';
    const bubbleClass = isUser ? 'user' : 'ai';
    
    let content = message.content;
    
    // 处理特殊消息类型
    if (message.type === 'transfer') {
        content = `<div class="transfer-message">💰 转账 ¥${message.amount}<br><span class="transfer-note">${message.note || ''}</span></div>`;
    } else if (message.type === 'image') {
        content = `<div class="image-message">📷 ${message.description || '图片'}</div>`;
    } else if (message.type === 'voice') {
        content = `<div class="voice-message">🎵 ${message.content}</div>`;
    }
    
    return `
        <div class="message-item ${messageClass}">
            <div class="message-bubble ${bubbleClass}">
                <div class="message-sender">${message.senderName}</div>
                <div class="message-content">${content}</div>
                <div class="message-time">${formatMessageTime(message.timestamp)}</div>
            </div>
        </div>
    `;
}

/**
 * 格式化消息时间
 * @param {string} timestamp 时间戳
 * @returns {string} 格式化后的时间
 */
function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

/**
 * 处理添加单聊
 */
async function handleAddSingleChat() {
    try {
        const chatName = prompt('请输入聊天名称：');
        if (!chatName?.trim()) return;
        
        const chatData = {
            name: chatName.trim(),
            isGroup: false,
            settings: {
                aiPersona: '你是一个友善的AI助手，总是乐于帮助用户解决问题。',
                myPersona: '我是一个普通用户。'
            }
        };
        
        const result = await createChat(chatData);
        
        if (result.success) {
            showToast(result.message, 'success');
            await renderChatListScreen(); // 刷新列表
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to add single chat:', error);
        showError('创建单聊失败');
    }
}

/**
 * 处理添加群聊
 */
async function handleAddGroupChat() {
    try {
        const chatName = prompt('请输入群聊名称：');
        if (!chatName?.trim()) return;
        
        const chatData = {
            name: chatName.trim(),
            isGroup: true,
            settings: {
                aiPersona: '这是一个活跃的群聊。',
                myPersona: '我是群聊的发起者。',
                myGroupNickname: '群主'
            },
            members: [
                {
                    name: 'AI助手1',
                    persona: '一个友善的AI助手'
                },
                {
                    name: 'AI助手2', 
                    persona: '一个活泼的AI助手'
                }
            ]
        };
        
        const result = await createChat(chatData);
        
        if (result.success) {
            showToast(result.message, 'success');
            await renderChatListScreen(); // 刷新列表
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to add group chat:', error);
        showError('创建群聊失败');
    }
}

/**
 * 处理发送消息
 */
async function handleSendMessage() {
    if (!currentChatId || !elements.chatInput) return;
    
    const content = elements.chatInput.value.trim();
    if (!content) return;
    
    try {
        const message = {
            senderId: 'user',
            senderName: '我',
            content: content,
            type: 'text'
        };
        
        const result = await sendMessage(currentChatId, message);
        
        if (result.success) {
            // 清空输入框
            elements.chatInput.value = '';
            
            // 重新加载消息
            await loadChatMessages(currentChatId);
            
            // TODO: 这里应该调用AI接口获取回复
            // 暂时模拟AI回复
            setTimeout(async () => {
                const aiMessage = {
                    senderId: 'ai',
                    senderName: 'AI助手',
                    content: '收到你的消息：' + content,
                    type: 'text'
                };
                
                await sendMessage(currentChatId, aiMessage);
                await loadChatMessages(currentChatId);
            }, 1000);
            
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to send message:', error);
        showError('发送消息失败');
    }
}

/**
 * 处理输入框按键事件
 * @param {Event} event 事件对象
 */
function handleChatInputKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSendMessage();
    }
}

/**
 * 处理打开聊天设置
 */
async function handleOpenChatSettings() {
    if (!currentChatId) return;
    
    try {
        const chats = await getAllChats();
        const chat = chats.find(c => c.id === currentChatId);
        
        if (!chat) {
            showError('聊天不存在');
            return;
        }
        
        // 填充设置表单
        if (elements.chatNameInput) elements.chatNameInput.value = chat.name;
        if (elements.aiPersonaInput) elements.aiPersonaInput.value = chat.settings?.aiPersona || '';
        if (elements.myPersonaInput) elements.myPersonaInput.value = chat.settings?.myPersona || '';
        if (elements.maxMemoryInput) elements.maxMemoryInput.value = chat.settings?.maxMemory || 10;
        
        // 显示模态框
        if (elements.chatSettingsModal) {
            elements.chatSettingsModal.style.display = 'flex';
        }
        
    } catch (error) {
        console.error('Failed to open chat settings:', error);
        showError('加载聊天设置失败');
    }
}

/**
 * 处理保存聊天设置
 */
async function handleSaveChatSettings() {
    if (!currentChatId) return;
    
    try {
        const settings = {
            name: elements.chatNameInput?.value.trim() || '',
            settings: {
                aiPersona: elements.aiPersonaInput?.value.trim() || '',
                myPersona: elements.myPersonaInput?.value.trim() || '',
                maxMemory: parseInt(elements.maxMemoryInput?.value) || 10
            }
        };
        
        // 验证设置
        if (!settings.name) {
            showError('聊天名称不能为空');
            return;
        }
        
        const result = await updateChatSettings(currentChatId, settings.settings);
        
        if (result.success) {
            // 更新聊天名称
            const db = await import('../../core/db.js').then(m => m.getDB());
            if (db) {
                await db.chats.update(currentChatId, { 
                    name: settings.name,
                    updatedAt: new Date().toISOString()
                });
            }
            
            showToast('设置保存成功', 'success');
            handleCloseChatSettings();
            
            // 更新界面标题
            if (elements.chatHeaderTitle) {
                elements.chatHeaderTitle.textContent = settings.name;
            }
            
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to save chat settings:', error);
        showError('保存设置失败');
    }
}

/**
 * 处理关闭聊天设置
 */
function handleCloseChatSettings() {
    if (elements.chatSettingsModal) {
        elements.chatSettingsModal.style.display = 'none';
    }
}

/**
 * 处理清空聊天记录
 */
async function handleClearChat() {
    if (!currentChatId) return;
    
    if (confirm('确定要清空聊天记录吗？此操作无法撤销。')) {
        try {
            const result = await clearChatMessages(currentChatId);
            
            if (result.success) {
                showToast(result.message, 'success');
                await loadChatMessages(currentChatId);
                handleCloseChatSettings();
            } else {
                showError(result.error);
            }
            
        } catch (error) {
            console.error('Failed to clear chat:', error);
            showError('清空聊天记录失败');
        }
    }
}

/**
 * 从列表删除聊天
 * @param {string} chatId 聊天ID
 */
async function handleDeleteChatFromList(chatId) {
    if (confirm('确定要删除这个聊天吗？此操作无法撤销。')) {
        try {
            const result = await deleteChat(chatId);
            
            if (result.success) {
                showToast(result.message, 'success');
                await renderChatListScreen(); // 刷新列表
            } else {
                showError(result.error);
            }
            
        } catch (error) {
            console.error('Failed to delete chat:', error);
            showError('删除聊天失败');
        }
    }
};

/**
 * 显示屏幕
 * @param {string} screenId 屏幕ID
 */
function showScreen(screenId) {
    try {
        routeManager.navigateToScreen(screenId);
    } catch (error) {
        console.error('Failed to navigate to screen:', screenId, error);
        // Fallback: try basic screen switching
        const screen = document.getElementById(screenId);
        if (screen) {
            document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
            screen.style.display = 'block';
        } else {
            console.warn('Screen not found:', screenId);
        }
    }
}


