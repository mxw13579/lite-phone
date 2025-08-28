/**
 * 使用方法：AI行为执行器，自动执行建议的行为动作
 * import { BehaviorExecutor } from './behavior-executor.js';
 * 
 * const executor = new BehaviorExecutor();
 * await executor.initialize();
 */

import { eventBus, EventTypes } from '../core/event-bus.js';
import { getDB } from '../core/db.js';
import { memoryService } from './memory.js';
import { getAllChats, createChat, getChatMessages, sendMessage } from '../domains/chats/controller.js';
import { publishMoment, addComment } from '../domains/moments/store.js';

/**
 * 行为执行配置
 */
const EXECUTION_CONFIG = {
    // 执行限制
    maxDailyExecutions: {
        chat_reply: 20,
        proactive_chat: 5,
        moment_post: 3,
        moment_comment: 10
    },
    
    // 重试配置
    maxRetries: 3,
    retryDelayMs: 2000,
    
    // 撤销配置  
    allowUndo: true,
    undoTimeoutMs: 30000, // 30秒内可撤销
    
    // 限流配置
    rateLimits: {
        chat_reply: 60000,      // 1分钟
        proactive_chat: 300000, // 5分钟
        moment_post: 600000,    // 10分钟
        moment_comment: 180000  // 3分钟
    }
};

/**
 * AI行为执行器
 * 负责将行为建议转化为实际的系统动作
 */
export class BehaviorExecutor {
    constructor() {
        this.executionHistory = [];
        this.dailyExecutions = this.initializeDailyCounter();
        this.lastExecutions = new Map(); // 限流记录
        this.pendingUndos = new Map(); // 待撤销的动作
        this.isInitialized = false;
    }

    /**
     * 初始化行为执行器
     */
    async initialize() {
        if (this.isInitialized) {
            return { success: true };
        }

        try {
            // 监听行为建议事件
            eventBus.on('behavior.action-suggested', async (data) => {
                await this.handleActionSuggestion(data);
            });

            // 监听用户撤销请求
            eventBus.on('behavior.action-undo', async (data) => {
                await this.handleActionUndo(data);
            });

            // 每日重置计数器
            this.setupDailyReset();

            this.isInitialized = true;
            console.log('✅ Behavior executor initialized');

            return { success: true };

        } catch (error) {
            console.error('❌ Failed to initialize behavior executor:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 处理行为建议
     * @param {Object} suggestionData 建议数据
     */
    async handleActionSuggestion(suggestionData) {
        const {
            chatId,
            actionType,
            probability,
            behaviorScore,
            context,
            suggestedBy,
            timestamp
        } = suggestionData;

        console.log(`🎯 Processing action suggestion: ${actionType} for chat ${chatId} (probability: ${(probability * 100).toFixed(1)}%)`);

        try {
            // 预检查
            const preCheck = await this.preExecutionCheck(actionType, chatId);
            if (!preCheck.canExecute) {
                console.log(`❌ Pre-execution check failed: ${preCheck.reason}`);
                return;
            }

            // 执行动作
            const execution = await this.executeAction({
                actionType,
                chatId,
                probability,
                behaviorScore,
                context,
                suggestedBy,
                timestamp: timestamp || Date.now()
            });

            if (execution.success) {
                console.log(`✅ Action executed successfully: ${actionType}`);
                
                // 记录成功执行
                this.recordExecution(execution);
                
                // 设置撤销定时器（如果允许）
                if (EXECUTION_CONFIG.allowUndo && this.canUndo(actionType)) {
                    this.setupUndoTimer(execution);
                }

                // 发送执行成功事件
                await eventBus.emit('behavior.action-executed', {
                    ...execution,
                    timestamp: Date.now()
                });

            } else {
                console.error(`❌ Action execution failed: ${execution.error}`);
                
                // 发送执行失败事件
                await eventBus.emit('behavior.action-failed', {
                    actionType,
                    chatId,
                    error: execution.error,
                    timestamp: Date.now()
                });
            }

        } catch (error) {
            console.error('Failed to handle action suggestion:', error);
        }
    }

    /**
     * 预执行检查
     * @param {string} actionType 动作类型
     * @param {string} chatId 聊天ID
     * @returns {Object} 检查结果
     */
    async preExecutionCheck(actionType, chatId) {
        // 检查每日执行限制
        if (this.dailyExecutions[actionType] >= EXECUTION_CONFIG.maxDailyExecutions[actionType]) {
            return { 
                canExecute: false, 
                reason: `Daily execution limit reached for ${actionType}` 
            };
        }

        // 检查限流
        const lastExecution = this.lastExecutions.get(`${actionType}_${chatId}`);
        const now = Date.now();
        const rateLimitMs = EXECUTION_CONFIG.rateLimits[actionType];
        
        if (lastExecution && (now - lastExecution) < rateLimitMs) {
            const remainingMs = rateLimitMs - (now - lastExecution);
            return { 
                canExecute: false, 
                reason: `Rate limit active, ${Math.ceil(remainingMs / 1000)}s remaining` 
            };
        }

        // 检查聊天是否存在
        if (actionType.includes('chat')) {
            try {
                const db = getDB();
                const chat = await db.chats.get(chatId);
                if (!chat) {
                    return { canExecute: false, reason: 'Chat not found' };
                }
            } catch (error) {
                return { canExecute: false, reason: 'Failed to verify chat' };
            }
        }

        return { canExecute: true };
    }

    /**
     * 执行具体动作
     * @param {Object} actionData 动作数据
     * @returns {Object} 执行结果
     */
    async executeAction(actionData) {
        const { actionType, chatId, context } = actionData;
        let attempts = 0;
        let lastError = null;

        while (attempts < EXECUTION_CONFIG.maxRetries) {
            try {
                attempts++;
                
                let result;
                switch (actionType) {
                    case 'chat_reply':
                        result = await this.executeChatReply(chatId, context);
                        break;
                    case 'proactive_chat':
                        result = await this.executeProactiveChat(chatId, context);
                        break;
                    case 'moment_post':
                        result = await this.executeMomentPost(context);
                        break;
                    case 'moment_comment':
                        result = await this.executeMomentComment(context);
                        break;
                    default:
                        throw new Error(`Unknown action type: ${actionType}`);
                }

                if (result.success) {
                    // 更新限流记录
                    this.lastExecutions.set(`${actionType}_${chatId}`, Date.now());
                    this.dailyExecutions[actionType]++;

                    return {
                        success: true,
                        actionType,
                        chatId,
                        executionId: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        result: result.data,
                        attempts,
                        ...actionData
                    };
                } else {
                    lastError = result.error;
                }

            } catch (error) {
                lastError = error.message;
                console.error(`Action execution attempt ${attempts} failed:`, error);
                
                // 如果不是最后一次尝试，等待后重试
                if (attempts < EXECUTION_CONFIG.maxRetries) {
                    await this.sleep(EXECUTION_CONFIG.retryDelayMs * attempts);
                }
            }
        }

        return {
            success: false,
            error: lastError || 'Unknown execution error',
            attempts,
            actionType,
            chatId
        };
    }

    /**
     * 执行聊天回复
     * @param {string} chatId 聊天ID
     * @param {Object} context 上下文
     * @returns {Object} 执行结果
     */
    async executeChatReply(chatId, context) {
        try {
            // 🔧 修复：直接使用导入的聊天控制器函数
            
            // 获取最近的聊天历史
            const recentMessages = await getChatMessages(chatId, 5);

            // 生成回复内容（这里可以集成AI生成逻辑）
            const replyContent = await this.generateChatReply(recentMessages, context);

            // 发送回复消息
            const messageResult = await sendMessage(chatId, {
                senderId: 'ai',
                senderName: 'AI助手',
                content: replyContent,
                type: 'text',
                metadata: {
                    generatedBy: 'behavior-executor',
                    behaviorScore: context.behaviorScore,
                    keywords: context.keywords
                }
            });

            if (!messageResult.success) {
                throw new Error(messageResult.error);
            }

            return {
                success: true,
                data: {
                    messageId: messageResult.message.id,
                    content: replyContent,
                    timestamp: messageResult.message.timestamp
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 执行主动聊天
     * @param {string} chatId 聊天ID
     * @param {Object} context 上下文
     * @returns {Object} 执行结果
     */
    async executeProactiveChat(chatId, context) {
        try {
            // 🔧 修复：直接使用导入的聊天控制器函数
            
            // 生成主动聊天内容
            const proactiveContent = await this.generateProactiveMessage(chatId, context);

            // 发送主动消息
            const messageResult = await sendMessage(chatId, {
                senderId: 'ai',
                senderName: 'AI助手',
                content: proactiveContent,
                type: 'text',
                metadata: {
                    generatedBy: 'behavior-executor',
                    actionType: 'proactive',
                    behaviorScore: context.behaviorScore
                }
            });

            if (!messageResult.success) {
                throw new Error(messageResult.error);
            }

            return {
                success: true,
                data: {
                    messageId: messageResult.message.id,
                    content: proactiveContent,
                    timestamp: messageResult.message.timestamp
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 执行朋友圈发布
     * @param {Object} context 上下文
     * @returns {Object} 执行结果
     */
    async executeMomentPost(context) {
        try {
            // 生成朋友圈内容
            const momentContent = await this.generateMomentContent(context);

            // 发布朋友圈
            const momentResult = await publishMoment({
                authorId: 'ai',
                content: momentContent,
                visibility: 'user_and_roles',
                aiGenerated: true,
                metadata: {
                    generatedBy: 'behavior-executor',
                    keywords: context.keywords,
                    behaviorScore: context.behaviorScore
                }
            });

            if (!momentResult.success) {
                throw new Error(momentResult.error);
            }

            return {
                success: true,
                data: {
                    momentId: momentResult.moment.id,
                    content: momentContent,
                    timestamp: momentResult.moment.createdAt
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 执行朋友圈评论
     * @param {Object} context 上下文
     * @returns {Object} 执行结果
     */
    async executeMomentComment(context) {
        try {
            const { momentId } = context;
            if (!momentId) {
                throw new Error('Moment ID is required for comment action');
            }

            // 生成评论内容
            const commentContent = await this.generateCommentContent(context);

            // 添加评论
            const commentResult = await addComment(momentId, {
                authorId: 'ai',
                content: commentContent,
                metadata: {
                    generatedBy: 'behavior-executor',
                    behaviorScore: context.behaviorScore
                }
            });

            if (!commentResult.success) {
                throw new Error(commentResult.error);
            }

            return {
                success: true,
                data: {
                    commentId: commentResult.comment.id,
                    momentId,
                    content: commentContent,
                    timestamp: commentResult.comment.createdAt
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 生成聊天回复内容
     * @param {Array} recentMessages 最近消息
     * @param {Object} context 上下文
     * @returns {Promise<string>} 回复内容
     */
    async generateChatReply(recentMessages, context) {
        // 这里可以集成更复杂的AI生成逻辑
        // 暂时使用简单的模板生成
        
        const templates = [
            "我理解你的想法。根据我们之前的对话，{context}",
            "关于{keywords}这个话题，我想补充一些想法...",
            "基于我们的聊天历史，我觉得{context}",
            "让我从另一个角度来看这个问题：{context}"
        ];

        const template = templates[Math.floor(Math.random() * templates.length)];
        const keywords = context.keywords?.slice(0, 3).join('、') || '这个问题';
        const contextText = `关于${keywords}，我认为这是一个很有趣的话题`;

        return template
            .replace('{keywords}', keywords)
            .replace('{context}', contextText);
    }

    /**
     * 生成主动聊天内容
     * @param {string} chatId 聊天ID
     * @param {Object} context 上下文
     * @returns {Promise<string>} 主动消息内容
     */
    async generateProactiveMessage(chatId, context) {
        const templates = [
            "我在想我们之前聊到的{keywords}，有了一些新的想法...",
            "今天想起了{keywords}，想和你分享一下我的思考",
            "关于{keywords}，我发现了一些有趣的观点",
            "最近在思考{keywords}相关的问题，想听听你的看法"
        ];

        const template = templates[Math.floor(Math.random() * templates.length)];
        const keywords = context.keywords?.slice(0, 2).join('和') || '我们的对话';

        return template.replace('{keywords}', keywords);
    }

    /**
     * 生成朋友圈内容
     * @param {Object} context 上下文
     * @returns {Promise<string>} 朋友圈内容
     */
    async generateMomentContent(context) {
        const templates = [
            "最近在思考{keywords}，感觉收获很多 🤔",
            "今天的思考：关于{keywords}的一些想法 ✨",
            "分享一个关于{keywords}的有趣观点 💡",
            "生活感悟：{keywords}让我想到了很多 🌟"
        ];

        const template = templates[Math.floor(Math.random() * templates.length)];
        const keywords = context.keywords?.slice(0, 2).join('和') || '生活';

        return template.replace('{keywords}', keywords);
    }

    /**
     * 生成评论内容
     * @param {Object} context 上下文
     * @returns {Promise<string>} 评论内容
     */
    async generateCommentContent(context) {
        const templates = [
            "很有道理！我也这么觉得 👍",
            "这个观点很有意思，学到了",
            "说得很棒，完全赞同你的想法",
            "这让我想到了另一个角度...",
            "深有同感！"
        ];

        return templates[Math.floor(Math.random() * templates.length)];
    }

    /**
     * 处理动作撤销
     * @param {Object} undoData 撤销数据
     */
    async handleActionUndo(undoData) {
        const { executionId } = undoData;
        
        const pendingUndo = this.pendingUndos.get(executionId);
        if (!pendingUndo) {
            console.warn(`No pending undo found for execution: ${executionId}`);
            return;
        }

        try {
            const success = await this.performUndo(pendingUndo);
            
            if (success) {
                this.pendingUndos.delete(executionId);
                console.log(`✅ Action undone successfully: ${executionId}`);
                
                await eventBus.emit('behavior.action-undone', {
                    executionId,
                    actionType: pendingUndo.actionType,
                    timestamp: Date.now()
                });
            }

        } catch (error) {
            console.error('Failed to undo action:', error);
        }
    }

    /**
     * 执行撤销操作
     * @param {Object} undoInfo 撤销信息
     * @returns {Promise<boolean>} 是否成功
     */
    async performUndo(undoInfo) {
        const { actionType, result } = undoInfo;

        try {
            switch (actionType) {
                case 'chat_reply':
                case 'proactive_chat':
                    // 🔧 修复：暂时使用TODO，需要实现单条消息删除功能
                    // TODO: 需要在聊天控制器中添加 deleteMessage 功能
                    console.warn('撤销聊天消息功能尚未实现，messageId:', result.messageId);
                    return false;

                case 'moment_post':
                    // 删除发布的朋友圈
                    // TODO: 实现朋友圈删除逻辑
                    return true;

                case 'moment_comment':
                    // 删除评论
                    // TODO: 实现评论删除逻辑
                    return true;

                default:
                    console.warn(`Undo not supported for action type: ${actionType}`);
                    return false;
            }
        } catch (error) {
            console.error('Failed to perform undo:', error);
            return false;
        }
    }

    /**
     * 设置撤销定时器
     * @param {Object} execution 执行记录
     */
    setupUndoTimer(execution) {
        const { executionId, actionType, result } = execution;
        
        this.pendingUndos.set(executionId, {
            actionType,
            result,
            timestamp: Date.now()
        });

        // 设置撤销超时
        setTimeout(() => {
            this.pendingUndos.delete(executionId);
        }, EXECUTION_CONFIG.undoTimeoutMs);
    }

    /**
     * 检查动作是否可撤销
     * @param {string} actionType 动作类型
     * @returns {boolean} 是否可撤销
     */
    canUndo(actionType) {
        return ['chat_reply', 'proactive_chat', 'moment_post', 'moment_comment'].includes(actionType);
    }

    /**
     * 记录执行历史
     * @param {Object} execution 执行记录
     */
    recordExecution(execution) {
        this.executionHistory.push({
            ...execution,
            recordedAt: Date.now()
        });

        // 保留最近500条记录
        if (this.executionHistory.length > 500) {
            this.executionHistory = this.executionHistory.slice(-500);
        }
    }

    /**
     * 初始化每日计数器
     * @returns {Object} 计数器对象
     */
    initializeDailyCounter() {
        return Object.keys(EXECUTION_CONFIG.maxDailyExecutions).reduce((acc, actionType) => {
            acc[actionType] = 0;
            return acc;
        }, {});
    }

    /**
     * 设置每日重置
     */
    setupDailyReset() {
        // 计算到明天0点的毫秒数
        const now = new Date();
        const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        const msUntilMidnight = tomorrow.getTime() - now.getTime();

        // 设置首次重置
        setTimeout(() => {
            this.resetDailyCounters();
            
            // 设置每日定时重置
            setInterval(() => {
                this.resetDailyCounters();
            }, 24 * 60 * 60 * 1000);
            
        }, msUntilMidnight);
    }

    /**
     * 重置每日计数器
     */
    resetDailyCounters() {
        this.dailyExecutions = this.initializeDailyCounter();
        console.log('📅 Daily execution counters reset');
        
        eventBus.emit('behavior.daily-reset', {
            timestamp: Date.now()
        });
    }

    /**
     * 获取执行统计
     * @returns {Object} 统计信息
     */
    getStats() {
        const total = this.executionHistory.length;
        const successful = this.executionHistory.filter(e => e.success).length;
        const byActionType = {};

        for (const execution of this.executionHistory) {
            const { actionType } = execution;
            if (!byActionType[actionType]) {
                byActionType[actionType] = { total: 0, successful: 0 };
            }
            byActionType[actionType].total++;
            if (execution.success) {
                byActionType[actionType].successful++;
            }
        }

        return {
            total,
            successful,
            successRate: total > 0 ? (successful / total * 100).toFixed(1) + '%' : '0%',
            dailyExecutions: { ...this.dailyExecutions },
            byActionType,
            pendingUndos: this.pendingUndos.size,
            recentExecutions: this.executionHistory.slice(-10)
        };
    }

    /**
     * 睡眠函数
     * @param {number} ms 毫秒数
     * @returns {Promise} Promise
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 创建全局行为执行器实例
export const behaviorExecutor = new BehaviorExecutor();