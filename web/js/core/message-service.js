/**
 * 使用方法：数据库schema升级到v13，添加独立的messages表
 * 这是对db.js的增强，实现消息表拆分优化
 */

/**
 * 升级数据库schema到v13 - 消息表拆分
 */
export async function upgradeToV13(db) {
    // 版本13：消息表拆分优化
    db.version(13).stores({
        // 继承v12所有表
        chats: '&id, isGroup, updatedAt',
        apiConfig: '&id',
        globalSettings: '&id',
        userStickers: '&id, url, name',
        worldBooks: '&id, name',
        musicLibrary: '&id',
        personaPresets: '&id',
        presets: '&id, name',
        memories: '&id, roleId, chatId, type, importance, createdAt, [roleId+createdAt]',
        moments: '&id, authorId, createdAt, visibility, aiGenerated',
        comments: '&id, momentId, createdAt, authorId, parentId',
        reactions: '&id, momentId, userId, type, [momentId+userId]',
        plugins: '&id, name, enabled, errors, configSnapshot, updatedAt',
        migrations: '&id, fromVersion, toVersion, appliedAt',
        behaviorLogs: '&id, roleId, actionType, timestamp, success, [roleId+timestamp], [actionType+timestamp]',
        behaviorScores: '&id, roleId, timestamp, score, breakdown, [roleId+timestamp]',
        
        // 新增：独立的消息表
        messages: '&id, chatId, senderId, timestamp, type, [chatId+timestamp], senderId, type'
    }).upgrade(async tx => {
        console.log('Upgrading database to version 13 - Creating independent messages table...');
        
        const startTime = Date.now();
        let migratedCount = 0;
        let chatCount = 0;
        
        try {
            // 获取所有聊天
            const allChats = await tx.chats.toArray();
            console.log(`Found ${allChats.length} chats to migrate`);
            
            // 迁移每个聊天的消息
            for (const chat of allChats) {
                if (chat.messages && Array.isArray(chat.messages) && chat.messages.length > 0) {
                    chatCount++;
                    console.log(`Migrating ${chat.messages.length} messages from chat ${chat.id}`);
                    
                    // 将消息数组中的每条消息转换为独立记录
                    const messageRecords = chat.messages.map((message, index) => ({
                        id: message.id || `msg_${chat.id}_${Date.now()}_${index}`,
                        chatId: chat.id,
                        senderId: message.senderId || 'user',
                        senderName: message.senderName || '用户',
                        content: message.content || '',
                        type: message.type || 'text',
                        timestamp: this.normalizeTimestamp(message.timestamp),
                        isRead: message.isRead || false,
                        metadata: message.metadata || null,
                        // 保留其他自定义字段
                        ...this.extractCustomFields(message)
                    }));
                    
                    // 批量插入到messages表
                    await tx.messages.bulkAdd(messageRecords);
                    migratedCount += messageRecords.length;
                    
                    // 从chat记录中移除messages数组，但保留统计信息
                    const updatedChat = {
                        ...chat,
                        messages: undefined, // 移除消息数组
                        messageCount: messageRecords.length,
                        lastMessageId: messageRecords[messageRecords.length - 1]?.id,
                        lastMessageTimestamp: messageRecords[messageRecords.length - 1]?.timestamp
                    };
                    
                    await tx.chats.put(updatedChat);
                }
            }
            
            // 记录迁移信息
            const migrationRecord = {
                id: `migration_v13_${Date.now()}`,
                fromVersion: 12,
                toVersion: 13,
                appliedAt: Date.now(),
                description: 'Messages table separation',
                stats: {
                    migratedChats: chatCount,
                    migratedMessages: migratedCount,
                    duration: Date.now() - startTime
                }
            };
            
            await tx.migrations.add(migrationRecord);
            
            console.log(`✅ Messages migration completed: ${migratedCount} messages from ${chatCount} chats in ${Date.now() - startTime}ms`);
            
        } catch (error) {
            console.error('❌ Messages migration failed:', error);
            throw error;
        }
    });
    
    return db;
}

/**
 * 标准化时间戳
 * @param {string|number} timestamp 原始时间戳
 * @returns {number} 毫秒时间戳
 */
function normalizeTimestamp(timestamp) {
    if (typeof timestamp === 'number') {
        return timestamp;
    }
    
    if (typeof timestamp === 'string') {
        try {
            return new Date(timestamp).getTime();
        } catch (e) {
            console.warn('Invalid timestamp format:', timestamp);
            return Date.now();
        }
    }
    
    return Date.now();
}

/**
 * 提取自定义字段
 * @param {Object} message 原始消息对象
 * @returns {Object} 自定义字段
 */
function extractCustomFields(message) {
    const standardFields = [
        'id', 'chatId', 'senderId', 'senderName', 'content', 
        'type', 'timestamp', 'isRead', 'metadata'
    ];
    
    const customFields = {};
    for (const [key, value] of Object.entries(message)) {
        if (!standardFields.includes(key)) {
            customFields[key] = value;
        }
    }
    
    return customFields;
}

/**
 * 消息数据访问层 - 替换原有的直接访问chat.messages的逻辑
 */
export class MessageService {
    constructor(db) {
        this.db = db;
    }

    /**
     * 获取聊天消息（分页）
     * @param {string} chatId 聊天ID
     * @param {Object} options 选项
     * @returns {Promise<Array>} 消息列表
     */
    async getChatMessages(chatId, options = {}) {
        const {
            limit = 50,
            offset = 0,
            order = 'desc', // 'asc' | 'desc'
            since = null, // 时间戳，获取此时间之后的消息
            until = null, // 时间戳，获取此时间之前的消息
            senderId = null, // 特定发送者的消息
            type = null // 特定类型的消息
        } = options;

        try {
            let query = this.db.messages.where('chatId').equals(chatId);
            
            // 时间范围过滤
            if (since) {
                query = query.and(msg => msg.timestamp >= since);
            }
            if (until) {
                query = query.and(msg => msg.timestamp <= until);
            }
            
            // 发送者过滤
            if (senderId) {
                query = query.and(msg => msg.senderId === senderId);
            }
            
            // 类型过滤
            if (type) {
                query = query.and(msg => msg.type === type);
            }
            
            // 排序和分页
            if (order === 'desc') {
                query = query.reverse();
            }
            
            const messages = await query
                .offset(offset)
                .limit(limit)
                .toArray();
            
            // 如果是倒序查询，需要再次反转以保持时间顺序
            return order === 'desc' ? messages.reverse() : messages;
            
        } catch (error) {
            console.error('Failed to get chat messages:', error);
            return [];
        }
    }

    /**
     * 添加消息
     * @param {Object} messageData 消息数据
     * @returns {Promise<Object>} 操作结果
     */
    async addMessage(messageData) {
        try {
            const message = {
                id: messageData.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                chatId: messageData.chatId,
                senderId: messageData.senderId || 'user',
                senderName: messageData.senderName || '用户',
                content: messageData.content || '',
                type: messageData.type || 'text',
                timestamp: messageData.timestamp || Date.now(),
                isRead: messageData.isRead || false,
                metadata: messageData.metadata || null,
                ...messageData
            };

            await this.db.messages.add(message);
            
            // 更新chat的统计信息
            await this.updateChatStats(messageData.chatId);
            
            return {
                success: true,
                message,
                id: message.id
            };

        } catch (error) {
            console.error('Failed to add message:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 更新聊天统计信息
     * @param {string} chatId 聊天ID
     */
    async updateChatStats(chatId) {
        try {
            const messageCount = await this.db.messages.where('chatId').equals(chatId).count();
            const lastMessage = await this.db.messages
                .where('chatId')
                .equals(chatId)
                .reverse()
                .first();

            await this.db.chats.update(chatId, {
                messageCount,
                lastMessageId: lastMessage?.id,
                lastMessageTimestamp: lastMessage?.timestamp,
                updatedAt: Date.now()
            });

        } catch (error) {
            console.error('Failed to update chat stats:', error);
        }
    }

    /**
     * 删除消息
     * @param {string} messageId 消息ID
     * @returns {Promise<Object>} 操作结果
     */
    async deleteMessage(messageId) {
        try {
            const message = await this.db.messages.get(messageId);
            if (!message) {
                return { success: false, error: 'Message not found' };
            }

            await this.db.messages.delete(messageId);
            await this.updateChatStats(message.chatId);

            return { success: true };

        } catch (error) {
            console.error('Failed to delete message:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 清空聊天消息
     * @param {string} chatId 聊天ID
     * @returns {Promise<Object>} 操作结果
     */
    async clearChatMessages(chatId) {
        try {
            await this.db.messages.where('chatId').equals(chatId).delete();
            await this.updateChatStats(chatId);

            return { success: true };

        } catch (error) {
            console.error('Failed to clear chat messages:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 获取消息统计
     * @param {string} chatId 聊天ID
     * @returns {Promise<Object>} 统计信息
     */
    async getMessageStats(chatId) {
        try {
            const total = await this.db.messages.where('chatId').equals(chatId).count();
            const byType = {};
            const bySender = {};

            const messages = await this.db.messages.where('chatId').equals(chatId).toArray();
            
            messages.forEach(msg => {
                // 按类型统计
                byType[msg.type] = (byType[msg.type] || 0) + 1;
                
                // 按发送者统计
                bySender[msg.senderId] = (bySender[msg.senderId] || 0) + 1;
            });

            return {
                total,
                byType,
                bySender,
                firstMessage: messages[0]?.timestamp,
                lastMessage: messages[messages.length - 1]?.timestamp
            };

        } catch (error) {
            console.error('Failed to get message stats:', error);
            return null;
        }
    }
}