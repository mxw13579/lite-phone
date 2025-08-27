/**
 * 使用方法：升级版数据库初始化，支持v13 schema和消息表拆分
 * 替换原有db.js的initializeDB函数
 */

import { upgradeToV13, MessageService } from './message-service.js';

// 数据库实例和消息服务
let db = null;
let messageService = null;

/**
 * 初始化数据库（升级版）
 * @returns {Promise<Dexie>} 数据库实例
 */
export async function initializeDB() {
    if (db) {
        return db;
    }
    
    try {
        db = new Dexie('GeminiChatDB');
        
        // 保持v12版本向后兼容
        db.version(12).stores({
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
            behaviorScores: '&id, roleId, timestamp, score, breakdown, [roleId+timestamp]'
        }).upgrade(async tx => {
            // v12升级逻辑保持不变
            console.log('Upgrading database to version 12 - Adding AI behavior system tables...');
            
            try {
                await tx.migrations.add({
                    id: `migration_v12_${Date.now()}`,
                    fromVersion: 11,
                    toVersion: 12,
                    appliedAt: Date.now(),
                    description: 'AI behavior system tables added'
                });

                // 初始化默认行为配置
                const defaultBehaviorConfig = {
                    id: 'behavior_config',
                    actionThresholds: {
                        chat_reply: 0.7,
                        proactive_chat: 0.8,
                        moment_post: 0.6,
                        moment_comment: 0.5
                    },
                    cooldownPeriods: {
                        chat_reply: 5 * 60 * 1000,      // 5分钟
                        proactive_chat: 30 * 60 * 1000, // 30分钟
                        moment_post: 60 * 60 * 1000,    // 1小时
                        moment_comment: 10 * 60 * 1000  // 10分钟
                    },
                    evaluationSettings: {
                        windowSize: 24 * 60 * 60 * 1000, // 24小时
                        minActivityLevel: 0.3,
                        maxDailyActions: {
                            chat_reply: 10,
                            proactive_chat: 3,
                            moment_post: 2,
                            moment_comment: 5
                        }
                    }
                };

                await tx.globalSettings.put(defaultBehaviorConfig);
                console.log('✅ Default behavior configuration initialized');

            } catch (error) {
                console.error('❌ Failed to upgrade to v12:', error);
                throw error;
            }
        });

        // 升级到v13：消息表拆分
        db.version(13).stores({
            // 继承v12所有表
            chats: '&id, isGroup, updatedAt, messageCount, lastMessageTimestamp',
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
                            timestamp: normalizeTimestamp(message.timestamp),
                            isRead: message.isRead || false,
                            metadata: message.metadata || null,
                            // 保留其他自定义字段
                            ...extractCustomFields(message)
                        }));
                        
                        // 批量插入到messages表
                        await tx.messages.bulkAdd(messageRecords);
                        migratedCount += messageRecords.length;
                        
                        // 更新chat记录，移除messages数组并添加统计信息
                        await tx.chats.update(chat.id, {
                            messages: undefined, // 移除消息数组
                            messageCount: messageRecords.length,
                            lastMessageId: messageRecords[messageRecords.length - 1]?.id,
                            lastMessageTimestamp: messageRecords[messageRecords.length - 1]?.timestamp
                        });
                    }
                }
                
                // 记录迁移信息
                const migrationRecord = {
                    id: `migration_v13_${Date.now()}`,
                    fromVersion: 12,
                    toVersion: 13,
                    appliedAt: Date.now(),
                    description: 'Messages table separation for performance optimization',
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

        // 打开数据库
        await db.open();
        
        // 创建消息服务
        messageService = new MessageService(db);
        
        console.log('✅ Database initialized successfully with messages table optimization');
        return db;
        
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        throw error;
    }
}

/**
 * 获取数据库实例
 * @returns {Dexie} 数据库实例
 */
export function getDB() {
    return db;
}

/**
 * 获取消息服务实例
 * @returns {MessageService} 消息服务实例
 */
export function getMessageService() {
    return messageService;
}

// 工具函数
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

// 保持向后兼容的健康检查函数
export async function checkDatabaseHealth() {
    try {
        if (!db) {
            return { healthy: false, error: 'Database not initialized' };
        }
        
        // 测试基本读写操作
        const testData = { id: 'health_check', timestamp: Date.now() };
        await db.migrations.put(testData);
        const retrieved = await db.migrations.get('health_check');
        await db.migrations.delete('health_check');
        
        if (!retrieved) {
            return { healthy: false, error: 'Failed to read test data' };
        }
        
        // 检查消息服务
        const messageServiceHealthy = messageService && typeof messageService.getChatMessages === 'function';
        
        return { 
            healthy: true, 
            version: db.verno,
            messageServiceReady: messageServiceHealthy,
            timestamp: Date.now()
        };
        
    } catch (error) {
        return { 
            healthy: false, 
            error: error.message,
            timestamp: Date.now()
        };
    }
}