/**
 * 聊天控制器层
 * 负责聊天逻辑、消息处理和预设整合
 */

import { getDB } from '../../core/db.js';
import { getActivePreset } from '../presets/store.js';
import { getAllWorldBooks } from '../worldbook/store.js';

/**
 * 生成系统提示词
 * @param {Object} chat 聊天对象
 * @param {string} myAddress 用户地址
 * @param {Object} musicContext 音乐上下文
 * @returns {Promise<string>} 生成的系统提示词
 */
export async function generateSystemPrompt(chat, myAddress = '位置未知', musicContext = '') {
    try {
        // 获取活跃预设
        const activePreset = await getActivePreset();
        if (!activePreset) {
            throw new Error('No active preset found');
        }

        // 获取世界书内容
        const worldBookContent = await getWorldBookContent(chat);
        
        // 构建基础提示词变量
        const templateVars = {
            currentTime: new Date().toLocaleString('zh-CN'),
            myAddress: myAddress || '位置未知',
            worldBookContent,
            musicContext: musicContext || '',
            aiImageInstructions: activePreset.promptImage || '',
            aiVoiceInstructions: activePreset.promptVoice || '',
            transferInstructions: activePreset.promptTransfer || ''
        };

        let systemPrompt;

        if (chat.isGroup) {
            // 群聊提示词
            const membersList = chat.members?.map(m => `- **${m.name}**: ${m.persona}`).join('\n') || '';
            const myNickname = chat.settings?.myGroupNickname || '我';
            
            const groupVars = {
                ...templateVars,
                membersList,
                myNickname,
                groupAiImageInstructions: `\n# 群聊中发送图片的能力\n- 群成员同样可以发送"文字描述的图片"。\n- 若要为某个角色发送图片，请单独发送一个特殊的对象，格式为：\`{"name": "角色名", "type": "ai_image", "description": "这里是对图片的详细文字描述..."}\`。`,
                groupAiVoiceInstructions: `\n# 发送语音的能力\n- 群成员同样可以发送"模拟语音消息"。\n- 若要发送语音，请为该角色单独发送一个特殊的对象，格式为：\`{"name": "角色名", "type": "voice_message", "content": "这里是语音的文字内容..."}\`。`
            };

            systemPrompt = replaceTemplateVars(activePreset.promptGroup, {
                ...groupVars,
                'chat.settings.myPersona': chat.settings?.myPersona || ''
            });
        } else {
            // 单聊提示词
            const singleVars = {
                ...templateVars,
                'chat.name': chat.name || 'AI助手',
                'chat.settings.aiPersona': chat.settings?.aiPersona || '',
                'chat.settings.myPersona': chat.settings?.myPersona || ''
            };

            systemPrompt = replaceTemplateVars(activePreset.promptSingle, singleVars);
        }

        return systemPrompt;

    } catch (error) {
        console.error('Failed to generate system prompt:', error);
        throw error;
    }
}

/**
 * 获取世界书内容
 * @param {Object} chat 聊天对象
 * @returns {Promise<string>} 世界书内容
 */
async function getWorldBookContent(chat) {
    try {
        if (!chat.settings?.linkedWorldBooks || chat.settings.linkedWorldBooks.length === 0) {
            return '';
        }

        const worldBooks = await getAllWorldBooks();
        const linkedBooks = worldBooks.filter(book => 
            chat.settings.linkedWorldBooks.includes(book.id)
        );

        if (linkedBooks.length === 0) {
            return '';
        }

        const content = linkedBooks.map(book => 
            `\n# ${book.name}\n${book.content}`
        ).join('\n');

        return content;

    } catch (error) {
        console.error('Failed to get world book content:', error);
        return '';
    }
}

/**
 * 替换模板变量
 * @param {string} template 模板字符串
 * @param {Object} vars 变量对象
 * @returns {string} 替换后的字符串
 */
function replaceTemplateVars(template, vars) {
    if (!template) return '';

    let result = template;
    
    // 替换所有变量
    Object.entries(vars).forEach(([key, value]) => {
        const regex = new RegExp(`{${key}}`, 'g');
        result = result.replace(regex, value || '');
    });

    return result;
}

/**
 * 获取所有聊天
 * @returns {Promise<Array>} 聊天列表
 */
export async function getAllChats() {
    try {
        const db = getDB();
        if (!db) return [];

        const chats = await db.chats.orderBy('updatedAt').reverse().toArray();
        
        // 为每个聊天添加额外信息
        return chats.map(chat => ({
            ...chat,
            lastMessagePreview: getLastMessagePreview(chat),
            formattedTime: formatChatTime(chat.updatedAt),
            unreadCount: chat.messages?.filter(m => !m.isRead && m.senderId !== 'user').length || 0
        }));

    } catch (error) {
        console.error('Failed to get all chats:', error);
        return [];
    }
}

/**
 * 获取最后一条消息预览
 * @param {Object} chat 聊天对象
 * @returns {string} 消息预览
 */
function getLastMessagePreview(chat) {
    if (!chat.messages || chat.messages.length === 0) {
        return '暂无消息';
    }

    const lastMessage = chat.messages[chat.messages.length - 1];
    
    if (typeof lastMessage.content === 'string') {
        return lastMessage.content.slice(0, 50) + (lastMessage.content.length > 50 ? '...' : '');
    }

    if (lastMessage.type === 'image') {
        return '[图片]';
    } else if (lastMessage.type === 'voice') {
        return '[语音]';
    } else if (lastMessage.type === 'transfer') {
        return '[转账]';
    }

    return '消息';
}

/**
 * 格式化聊天时间
 * @param {string} timestamp 时间戳
 * @returns {string} 格式化后的时间
 */
function formatChatTime(timestamp) {
    if (!timestamp) return '';

    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        // 今天
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        // 昨天
        return '昨天';
    } else if (diffDays < 7) {
        // 本周
        return date.toLocaleDateString('zh-CN', { weekday: 'short' });
    } else {
        // 更久以前
        return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    }
}

/**
 * 创建新聊天
 * @param {Object} chatData 聊天数据
 * @returns {Promise<Object>} 操作结果
 */
export async function createChat(chatData) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const chat = {
            id: `chat_${Date.now()}`,
            name: chatData.name || '新聊天',
            isGroup: chatData.isGroup || false,
            messages: [],
            settings: {
                aiPersona: chatData.aiPersona || '',
                myPersona: chatData.myPersona || '',
                linkedWorldBooks: chatData.linkedWorldBooks || [],
                maxMemory: chatData.maxMemory || 10,
                theme: chatData.theme || 'default',
                ...chatData.settings
            },
            members: chatData.members || [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await db.chats.add(chat);

        return {
            success: true,
            chat,
            message: '聊天创建成功'
        };

    } catch (error) {
        console.error('Failed to create chat:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 更新聊天设置
 * @param {string} chatId 聊天ID
 * @param {Object} settings 设置数据
 * @returns {Promise<Object>} 操作结果
 */
export async function updateChatSettings(chatId, settings) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const chat = await db.chats.get(chatId);
        if (!chat) {
            throw new Error(`Chat not found: ${chatId}`);
        }

        const updatedSettings = {
            ...chat.settings,
            ...settings
        };

        await db.chats.update(chatId, {
            settings: updatedSettings,
            updatedAt: new Date().toISOString()
        });

        return {
            success: true,
            message: '聊天设置更新成功'
        };

    } catch (error) {
        console.error('Failed to update chat settings:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 发送消息
 * @param {string} chatId 聊天ID
 * @param {Object} message 消息对象
 * @returns {Promise<Object>} 操作结果
 */
export async function sendMessage(chatId, message) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const chat = await db.chats.get(chatId);
        if (!chat) {
            throw new Error(`Chat not found: ${chatId}`);
        }

        const newMessage = {
            id: `msg_${Date.now()}`,
            senderId: message.senderId || 'user',
            senderName: message.senderName || '用户',
            content: message.content,
            type: message.type || 'text',
            timestamp: new Date().toISOString(),
            isRead: false,
            ...message
        };

        const updatedMessages = [...(chat.messages || []), newMessage];

        await db.chats.update(chatId, {
            messages: updatedMessages,
            updatedAt: new Date().toISOString()
        });

        return {
            success: true,
            message: newMessage,
            totalMessages: updatedMessages.length
        };

    } catch (error) {
        console.error('Failed to send message:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 获取聊天消息
 * @param {string} chatId 聊天ID
 * @param {number} limit 消息数量限制
 * @returns {Promise<Array>} 消息列表
 */
export async function getChatMessages(chatId, limit = 50) {
    try {
        const db = getDB();
        if (!db) return [];

        const chat = await db.chats.get(chatId);
        if (!chat || !chat.messages) return [];

        // 返回最新的消息
        return chat.messages.slice(-limit).reverse();

    } catch (error) {
        console.error('Failed to get chat messages:', error);
        return [];
    }
}

/**
 * 清空聊天记录
 * @param {string} chatId 聊天ID
 * @returns {Promise<Object>} 操作结果
 */
export async function clearChatMessages(chatId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const chat = await db.chats.get(chatId);
        if (!chat) {
            throw new Error(`Chat not found: ${chatId}`);
        }

        await db.chats.update(chatId, {
            messages: [],
            updatedAt: new Date().toISOString()
        });

        return {
            success: true,
            message: '聊天记录已清空'
        };

    } catch (error) {
        console.error('Failed to clear chat messages:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 删除聊天
 * @param {string} chatId 聊天ID
 * @returns {Promise<Object>} 操作结果
 */
export async function deleteChat(chatId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const chat = await db.chats.get(chatId);
        if (!chat) {
            throw new Error(`Chat not found: ${chatId}`);
        }

        await db.chats.delete(chatId);

        return {
            success: true,
            message: '聊天已删除'
        };

    } catch (error) {
        console.error('Failed to delete chat:', error);
        return {
            success: false,
            error: error.message
        };
    }
}