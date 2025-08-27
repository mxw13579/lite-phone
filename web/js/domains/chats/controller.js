/**
 * 聊天控制器层
 * 负责聊天逻辑、消息处理和预设整合
 */

import { getDB } from '../../core/db.js';
import { eventBus, EventTypes } from '../../core/event-bus.js';
import { getActivePreset, validatePresetIntegrity, repairPresetWithDefaults } from '../presets/store.js';
import { getAllWorldBooks } from '../worldbook/store.js';
import { memoryService } from '../../services/memory.js';

/**
 * 生成系统提示词（记忆增强版）
 * @param {Object} chat 聊天对象
 * @param {string} myAddress 用户地址
 * @param {Object} musicContext 音乐上下文
 * @param {Object} contextOptions 上下文选项
 * @returns {Promise<string>} 生成的系统提示词
 */
export async function generateSystemPrompt(chat, myAddress = '位置未知', musicContext = '', contextOptions = {}) {
    try {
        // 获取活跃预设
        const activePreset = await getActivePreset();
        if (!activePreset) {
            throw new Error('无法获取活跃预设，请检查预设配置');
        }
        
        // 验证预设完整性
        const validation = validatePresetIntegrity(activePreset);
        if (!validation.isValid) {
            console.warn(`预设完整性检查失败: ${validation.missingFields.join(', ')}缺失`);
            
            // 使用默认值补全缺失字段
            const completePreset = repairPresetWithDefaults(activePreset);
            return await generatePromptWithPreset(chat, completePreset, myAddress, musicContext, contextOptions);
        }

        return await generatePromptWithPreset(chat, activePreset, myAddress, musicContext, contextOptions);
        
    } catch (error) {
        console.error('Failed to generate system prompt:', error);
        // 提供更友好的错误信息
        throw new Error(`生成系统提示词失败: ${error.message}，请检查预设配置`);
    }
}

/**
 * 使用指定预设生成提示词（记忆增强版）
 * @param {Object} chat 聊天对象
 * @param {Object} preset 预设对象
 * @param {string} myAddress 用户地址
 * @param {Object} musicContext 音乐上下文
 * @param {Object} contextOptions 上下文选项
 * @returns {Promise<string>} 生成的系统提示词
 */
async function generatePromptWithPreset(chat, preset, myAddress = '位置未知', musicContext = '', contextOptions = {}) {
    try {
        // 获取世界书内容
        const worldBookContent = await getWorldBookContent(chat);
        
        // 提取当前对话上下文用于记忆检索
        const contextKeywords = extractContextKeywords(chat, musicContext);
        const chatHistory = getChatHistoryForContext(chat);
        
        // 构建记忆注入上下文
        const memoryContext = {
            tokenBudget: contextOptions.tokenBudget || 10000,
            maxMemories: contextOptions.maxMemories || 15,
            contextKeywords,
            currentMessage: contextOptions.currentMessage || '',
            chatHistory,
            preferredTypes: ['semantic', 'episodic', 'social'], // 优先语义和情节记忆
            urgencyLevel: contextOptions.urgencyLevel || 'normal'
        };
        
        // 注入相关记忆
        let memoryContent = '';
        try {
            const memoryResult = await memoryService.injectMemoriesIntoPrompt(chat.id, memoryContext);
            if (memoryResult.success !== false && memoryResult.memoryText) {
                memoryContent = memoryResult.memoryText;
                console.log(`记忆注入成功 - 使用 ${memoryResult.usedMemories} 个记忆, ${memoryResult.estimatedTokens} tokens`);
            } else if (memoryResult.error) {
                console.warn('记忆注入失败:', memoryResult.error);
            }
        } catch (error) {
            console.warn('记忆服务调用失败:', error);
            // 记忆功能失败不影响聊天生成，继续正常流程
        }
        
        // 构建基础提示词变量
        const templateVars = {
            currentTime: new Date().toLocaleString('zh-CN'),
            myAddress: myAddress || '位置未知',
            worldBookContent,
            memoryContent, // 新增：记忆内容
            musicContext: musicContext || '',
            aiImageInstructions: preset.promptImage || '',
            aiVoiceInstructions: preset.promptVoice || '',
            transferInstructions: preset.promptTransfer || ''
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

            systemPrompt = replaceTemplateVars(preset.promptGroup, {
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

            systemPrompt = replaceTemplateVars(preset.promptSingle, singleVars);
        }

        return systemPrompt;
        
    } catch (error) {
        console.error('Generate prompt with preset failed:', error);
        throw error;
    }
}

/**
 * 提取对话上下文关键词
 * @param {Object} chat 聊天对象
 * @param {string} musicContext 音乐上下文
 * @returns {Array<string>} 关键词列表
 */
function extractContextKeywords(chat, musicContext) {
    const keywords = [];
    
    // 从聊天名称提取
    if (chat.name) {
        keywords.push(...chat.name.split(/\s+/).filter(word => word.length > 1));
    }
    
    // 从AI人设提取关键词
    if (chat.settings?.aiPersona) {
        const personaKeywords = chat.settings.aiPersona
            .split(/[，。！？\s]+/)
            .filter(word => word.length > 1)
            .slice(0, 5); // 最多5个关键词
        keywords.push(...personaKeywords);
    }
    
    // 从用户人设提取关键词
    if (chat.settings?.myPersona) {
        const myPersonaKeywords = chat.settings.myPersona
            .split(/[，。！？\s]+/)
            .filter(word => word.length > 1)
            .slice(0, 3); // 最多3个关键词
        keywords.push(...myPersonaKeywords);
    }
    
    // 从音乐上下文提取
    if (musicContext) {
        const musicKeywords = musicContext
            .split(/[，。！？\s]+/)
            .filter(word => word.length > 1)
            .slice(0, 3);
        keywords.push(...musicKeywords);
    }
    
    // 从最近的消息中提取（如果有）
    if (chat.messages && chat.messages.length > 0) {
        const recentMessages = chat.messages.slice(-3); // 最近3条消息
        recentMessages.forEach(message => {
            if (message.content && typeof message.content === 'string') {
                const messageWords = message.content
                    .split(/[，。！？\s]+/)
                    .filter(word => word.length > 1)
                    .slice(0, 3);
                keywords.push(...messageWords);
            }
        });
    }
    
    // 去重并限制数量
    return [...new Set(keywords)].slice(0, 15);
}

/**
 * 获取用于上下文分析的聊天历史
 * @param {Object} chat 聊天对象
 * @returns {Array} 聊天历史
 */
function getChatHistoryForContext(chat) {
    if (!chat.messages || chat.messages.length === 0) {
        return [];
    }
    
    // 获取最近10条消息作为上下文
    return chat.messages
        .slice(-10)
        .filter(message => message.content && typeof message.content === 'string')
        .map(message => ({
            content: message.content,
            senderId: message.senderId,
            timestamp: message.timestamp
        }));
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
 * 发送消息（记忆增强版）
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

        // 发送消息事件
        try {
            await eventBus.emit(EventTypes.MESSAGE_SENT, {
                chatId,
                message: newMessage
            });
        } catch (e) {
            console.warn('Emit MESSAGE_SENT failed:', e);
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
                // 记忆抽取失败不影响消息发送的成功状态
            }
        }, 1000); // 延迟1秒执行，避免影响消息发送性能

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