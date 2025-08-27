/**
 * 使用方法：更新聊天控制器以使用新的消息服务
 * 这是对chats/controller.js的关键部分重构，支持独立消息表
 */

import { getDB, getMessageService } from '../../core/db-v13.js';
import { eventBus, EventTypes } from '../../core/event-bus.js';
import { getActivePreset, validatePresetIntegrity, repairPresetWithDefaults } from '../presets/store.js';
import { getAllWorldBooks } from '../worldbook/store.js';
import { memoryService } from '../../services/memory.js';

// 消息服务实例（将在初始化时设置）
let messageService = null;

/**
 * 初始化消息服务
 */
export function initializeMessageService() {
    messageService = getMessageService();
}

/**
 * 发送消息（重构版，使用独立消息表）
 * @param {string} chatId 聊天ID
 * @param {Object} message 消息对象
 * @returns {Promise<Object>} 操作结果
 */
export async function sendMessage(chatId, message) {
    try {
        const db = getDB();
        if (!db || !messageService) {
            throw new Error('Database or message service not available');
        }

        const chat = await db.chats.get(chatId);
        if (!chat) {
            throw new Error(`Chat not found: ${chatId}`);
        }

        // 创建新消息对象
        const newMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            chatId: chatId,
            senderId: message.senderId || 'user',
            senderName: message.senderName || '用户',
            content: message.content,
            type: message.type || 'text',
            timestamp: Date.now(),
            isRead: false,
            metadata: message.metadata || null,
            ...message
        };

        // 使用消息服务添加消息
        const addResult = await messageService.addMessage(newMessage);
        
        if (!addResult.success) {
            throw new Error(addResult.error || 'Failed to add message');
        }

        // 发送消息事件
        try {
            await eventBus.emit(EventTypes.CHAT_MESSAGE_SENT, {
                chatId,
                message: newMessage,
                senderId: newMessage.senderId,
                timestamp: newMessage.timestamp
            });
        } catch (e) {
            console.warn('Emit CHAT_MESSAGE_SENT failed:', e);
        }

        // 消息发送成功后，异步进行记忆抽取
        setTimeout(async () => {
            try {
                console.log(`开始为聊天 ${chatId} 抽取记忆...`);
                const memoryResult = await memoryService.extractMemoriesFromChat(chatId, 5);
                
                if (memoryResult.success && memoryResult.data?.length > 0) {
                    console.log(`成功抽取 ${memoryResult.data.length} 个记忆:`, memoryResult.message);
                } else if (memoryResult.error) {
                    console.warn(`记忆抽取失败: ${memoryResult.error}`);
                }
            } catch (error) {
                console.warn('自动记忆抽取失败:', error);
            }
        }, 1000);

        return {
            success: true,
            message: newMessage,
            messageId: newMessage.id
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
 * 获取聊天消息（重构版，使用独立消息表分页查询）
 * @param {string} chatId 聊天ID
 * @param {Object} options 查询选项
 * @returns {Promise<Array>} 消息列表
 */
export async function getChatMessages(chatId, options = {}) {
    try {
        if (!messageService) {
            throw new Error('Message service not available');
        }

        // 使用新的分页查询
        const messages = await messageService.getChatMessages(chatId, {
            limit: options.limit || 50,
            offset: options.offset || 0,
            order: 'asc', // 时间顺序
            since: options.since,
            until: options.until,
            senderId: options.senderId,
            type: options.type
        });

        return messages;

    } catch (error) {
        console.error('Failed to get chat messages:', error);
        return [];
    }
}

/**
 * 清空聊天记录（重构版）
 * @param {string} chatId 聊天ID
 * @returns {Promise<Object>} 操作结果
 */
export async function clearChatMessages(chatId) {
    try {
        if (!messageService) {
            throw new Error('Message service not available');
        }

        const result = await messageService.clearChatMessages(chatId);
        
        if (result.success) {
            // 发送清空事件
            await eventBus.emit('chat.messages.cleared', {
                chatId,
                timestamp: Date.now()
            });
        }

        return result;

    } catch (error) {
        console.error('Failed to clear chat messages:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 获取消息统计（新功能）
 * @param {string} chatId 聊天ID
 * @returns {Promise<Object>} 统计信息
 */
export async function getChatMessageStats(chatId) {
    try {
        if (!messageService) {
            return null;
        }

        return await messageService.getMessageStats(chatId);

    } catch (error) {
        console.error('Failed to get message stats:', error);
        return null;
    }
}

/**
 * 获取所有聊天（更新版，适配新的消息统计）
 * @returns {Promise<Array>} 聊天列表
 */
export async function getAllChats() {
    try {
        const db = getDB();
        if (!db) return [];

        const chats = await db.chats.orderBy('lastMessageTimestamp').reverse().toArray();
        
        // 为每个聊天添加额外信息
        return chats.map(chat => ({
            ...chat,
            lastMessagePreview: getLastMessagePreview(chat),
            formattedTime: formatChatTime(chat.lastMessageTimestamp || chat.updatedAt),
            unreadCount: 0 // 需要实现未读消息计数逻辑
        }));

    } catch (error) {
        console.error('Failed to get all chats:', error);
        return [];
    }
}

/**
 * 获取最后一条消息预览（适配新结构）
 * @param {Object} chat 聊天对象
 * @returns {string} 消息预览
 */
function getLastMessagePreview(chat) {
    // 由于消息已移至独立表，这里需要异步获取
    // 临时返回占位文本，实际应该通过messageService获取
    if (chat.lastMessageId) {
        return '加载中...'; // 实际应该异步加载最新消息
    }
    return '暂无消息';
}

/**
 * 异步获取最后一条消息预览（辅助函数）
 * @param {string} chatId 聊天ID
 * @returns {Promise<string>} 消息预览
 */
export async function getLastMessagePreviewAsync(chatId) {
    try {
        if (!messageService) return '暂无消息';

        const messages = await messageService.getChatMessages(chatId, { 
            limit: 1, 
            order: 'desc' 
        });

        if (messages.length === 0) {
            return '暂无消息';
        }

        const lastMessage = messages[0];
        
        if (typeof lastMessage.content === 'string') {
            return lastMessage.content.slice(0, 50) + (lastMessage.content.length > 50 ? '...' : '');
        }

        // 根据类型返回预览
        const typePreview = {
            'image': '[图片]',
            'voice': '[语音]',
            'transfer': '[转账]',
            'file': '[文件]'
        };

        return typePreview[lastMessage.type] || '消息';

    } catch (error) {
        console.error('Failed to get last message preview:', error);
        return '加载失败';
    }
}

/**
 * 格式化聊天时间（支持毫秒时间戳）
 * @param {string|number} timestamp 时间戳
 * @returns {string} 格式化后的时间
 */
function formatChatTime(timestamp) {
    if (!timestamp) return '';

    const now = new Date();
    const date = new Date(typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp);
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
        return '昨天';
    } else if (diffDays < 7) {
        return date.toLocaleDateString('zh-CN', { weekday: 'short' });
    } else {
        return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    }
}

// 保持其他函数不变
export {
    generateSystemPrompt,
    createChat,
    updateChatSettings,
    deleteChat
} from './controller.js'; // 从原文件继承

/**
 * 向后兼容适配器 - 用于逐步迁移现有代码
 */
export const MessageCompatAdapter = {
    /**
     * 模拟原有的chat.messages访问方式
     * @param {string} chatId 聊天ID
     * @returns {Promise<Array>} 消息数组
     */
    async getChatMessages(chatId) {
        return await getChatMessages(chatId, { limit: 1000 }); // 获取大量消息模拟原有行为
    },

    /**
     * 模拟原有的消息添加方式
     * @param {string} chatId 聊天ID
     * @param {Object} message 消息对象
     */
    async addMessage(chatId, message) {
        return await sendMessage(chatId, message);
    }
};