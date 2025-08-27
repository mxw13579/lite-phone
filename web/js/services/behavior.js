/**
 * AI行为服务
 * 
 * 功能概述：
 * - AI行为决策的基础算法
 * - 基于互动情况的行为评分机制
 * - 防止过度活跃的冷却系统
 * - 用户可控的行为参数配置
 * 
 * @fileoverview AI行为服务，实现SOLID原则和标准契约
 */

import { getDB } from '../core/db.js';
import { eventBus, EventTypes } from '../core/event-bus.js';
import { createSuccessResponse, createErrorResponse, ErrorTypes } from './contracts.js';

// 行为类型枚举
export const BehaviorActionTypes = {
    CHAT_REPLY: 'chat_reply',
    MOMENT_POST: 'moment_post', 
    MOMENT_COMMENT: 'moment_comment',
    MOMENT_LIKE: 'moment_like',
    PROACTIVE_CHAT: 'proactive_chat',
    MEMORY_FORMATION: 'memory_formation'
};

// 默认行为配置
const DEFAULT_BEHAVIOR_CONFIG = {
    enabled: true,
    frequencies: {
        chatReply: 1.0,         // 聊天回复频率倍数
        momentActivity: 1.0,    // 朋友圈活跃度倍数
        proactiveChat: 0.3      // 主动聊天概率
    },
    cooldowns: {
        [BehaviorActionTypes.CHAT_REPLY]: 30 * 60 * 1000,        // 30分钟
        [BehaviorActionTypes.MOMENT_POST]: 2 * 60 * 60 * 1000,   // 2小时
        [BehaviorActionTypes.MOMENT_COMMENT]: 15 * 60 * 1000,    // 15分钟
        [BehaviorActionTypes.MOMENT_LIKE]: 5 * 60 * 1000,        // 5分钟
        [BehaviorActionTypes.PROACTIVE_CHAT]: 60 * 60 * 1000     // 1小时
    },
    scoreWeights: {
        interactionFrequency: 0.4,    // 互动频率权重
        timeSinceLastAction: 0.3,     // 时间因子权重
        contextRelevance: 0.2,        // 情境相关性权重
        userActivity: 0.1             // 用户活跃度权重
    },
    probabilityThresholds: {
        [BehaviorActionTypes.CHAT_REPLY]: 0.6,
        [BehaviorActionTypes.MOMENT_POST]: 0.8,
        [BehaviorActionTypes.MOMENT_COMMENT]: 0.7,
        [BehaviorActionTypes.MOMENT_LIKE]: 0.5,
        [BehaviorActionTypes.PROACTIVE_CHAT]: 0.9
    }
};

/**
 * AI行为服务类
 * 负责AI角色的行为决策、评分和冷却管理
 */
class BehaviorService {
    constructor() {
        this.scoreCalculator = new BehaviorScoreCalculator();
        this.cooldownManager = new BehaviorCooldownManager();
        this.configCache = null;
        this.isInitialized = false;
    }

    /**
     * 安全的数据库表访问，处理表缺失的情况
     * @param {string} tableName 表名
     * @param {Function} operation 操作函数
     * @param {any} fallbackValue 回退值
     * @returns {Promise<any>} 操作结果或回退值
     * @private
     */
    async safeDbOperation(tableName, operation, fallbackValue = null) {
        try {
            const db = getDB();
            if (!db[tableName]) {
                console.warn(`Table ${tableName} not available, using fallback value:`, fallbackValue);
                return fallbackValue;
            }
            return await operation(db[tableName]);
        } catch (error) {
            if (error.name === 'NotFoundError' || error.message?.includes('not found')) {
                console.warn(`Table ${tableName} operation failed, using fallback:`, error.message);
                return fallbackValue;
            }
            throw error; // 重新抛出非表缺失的错误
        }
    }

    /**
     * 初始化行为服务
     * @returns {Promise<ServiceResponse>}
     */
    async initialize() {
        try {
            // 加载默认配置
            await this.loadDefaultConfig();
            
            // 初始化子模块
            await this.cooldownManager.initialize();
            
            // 设置事件监听
            this.setupEventListeners();
            
            this.isInitialized = true;
            return createSuccessResponse(null, '行为服务初始化成功');
            
        } catch (error) {
            console.error('Behavior service initialization failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 计算行为评分
     * @param {string} roleId 角色ID
     * @param {Object} context 行为上下文
     * @returns {Promise<ServiceResponse>}
     */
    async calculateBehaviorScore(roleId, context) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const score = await this.scoreCalculator.calculateScore({
                roleId,
                ...context,
                config: await this.getBehaviorConfigInternal(roleId)
            });

            const result = {
                score,
                roleId,
                context,
                timestamp: Date.now(),
                breakdown: await this.scoreCalculator.getScoreBreakdown()
            };

            // 记录评分历史
            await this.recordScoreHistory(roleId, result);

            return createSuccessResponse(result, '行为评分计算完成');

        } catch (error) {
            console.error('Calculate behavior score failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 评估特定行为的执行概率
     * @param {string} actionType 行为类型
     * @param {Object} context 上下文信息
     * @returns {Promise<ServiceResponse>}
     */
    async assessActionProbability(actionType, context) {
        try {
            const { roleId, behaviorScore = 0.5 } = context;
            const config = await this.getBehaviorConfigInternal(roleId);
            
            // 检查行为是否启用
            if (!config.enabled) {
                return createSuccessResponse({
                    probability: 0,
                    reason: 'behavior_disabled',
                    actionType
                }, '行为已禁用');
            }

            // 基础概率计算
            let baseProbability = behaviorScore;
            
            // 应用频率倍数
            const frequencyMultiplier = this.getFrequencyMultiplier(actionType, config);
            baseProbability *= frequencyMultiplier;
            
            // 应用时间因子
            const timeScore = await this.calculateTimeScore(roleId, actionType);
            baseProbability *= timeScore;
            
            // 应用情境修正
            const contextModifier = this.calculateContextModifier(actionType, context);
            baseProbability *= contextModifier;
            
            // 限制在合理范围内
            const finalProbability = Math.min(Math.max(baseProbability, 0), 1);
            
            // 检查是否超过阈值
            const threshold = config.probabilityThresholds[actionType] || 0.7;
            const shouldExecute = finalProbability >= threshold;

            const result = {
                probability: finalProbability,
                threshold,
                shouldExecute,
                actionType,
                roleId,
                factors: {
                    behaviorScore,
                    frequencyMultiplier,
                    timeScore,
                    contextModifier
                }
            };

            return createSuccessResponse(result, '行为概率评估完成');

        } catch (error) {
            console.error('Assess action probability failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 应用行为冷却机制
     * @param {string} roleId 角色ID
     * @param {string} actionType 行为类型
     * @returns {Promise<ServiceResponse>}
     */
    async applyCooldown(roleId, actionType) {
        try {
            const cooldownStatus = await this.cooldownManager.checkCooldown(roleId, actionType);
            
            if (!cooldownStatus.canExecute) {
                return createSuccessResponse(cooldownStatus, '行为在冷却期内');
            }

            return createSuccessResponse(cooldownStatus, '行为可以执行');

        } catch (error) {
            console.error('Apply cooldown failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 记录行为执行
     * @param {string} roleId 角色ID
     * @param {string} actionType 行为类型
     * @param {Object} actionData 行为数据
     * @returns {Promise<ServiceResponse>}
     */
    async recordBehaviorExecution(roleId, actionType, actionData = {}) {
        try {
            // 应用冷却
            await this.cooldownManager.applyCooldown(roleId, actionType, actionData);
            
            // 发送行为执行事件
            await eventBus.emit('behavior.action-executed', {
                roleId,
                actionType,
                actionData,
                timestamp: Date.now()
            });

            return createSuccessResponse({
                roleId,
                actionType,
                timestamp: Date.now()
            }, '行为执行已记录');

        } catch (error) {
            console.error('Record behavior execution failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 获取行为配置
     * @param {string} roleId 角色ID
     * @returns {Promise<ServiceResponse>}
     */
    async getBehaviorConfig(roleId) {
        try {
            const config = await this.getBehaviorConfigInternal(roleId);
            return createSuccessResponse(config, '行为配置获取成功');

        } catch (error) {
            console.error('Get behavior config failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 更新行为配置
     * @param {string} roleId 角色ID
     * @param {Object} configUpdate 配置更新
     * @returns {Promise<ServiceResponse>}
     */
    async updateBehaviorConfig(roleId, configUpdate) {
        try {
            const db = getDB();
            const currentConfig = await this.getBehaviorConfigInternal(roleId);
            
            // 深度合并配置
            const updatedConfig = this.mergeConfig(currentConfig, configUpdate);
            
            // 保存到数据库
            await db.globalSettings.put({
                id: `behavior_config_${roleId}`,
                config: updatedConfig,
                roleId,
                updatedAt: new Date().toISOString()
            });

            // 清除缓存
            this.configCache = null;

            // 发送配置更新事件
            await eventBus.emit('behavior.config-updated', {
                roleId,
                config: updatedConfig,
                changes: configUpdate
            });

            return createSuccessResponse(updatedConfig, '行为配置更新成功');

        } catch (error) {
            console.error('Update behavior config failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 获取行为统计
     * @param {string} roleId 角色ID
     * @param {Object} timeRange 时间范围
     * @returns {Promise<ServiceResponse>}
     */
    async getBehaviorStats(roleId, timeRange = {}) {
        try {
            const { 
                startTime = Date.now() - 7 * 24 * 60 * 60 * 1000, // 默认7天
                endTime = Date.now() 
            } = timeRange;

            // 安全获取行为日志
            const behaviorLogs = await this.safeDbOperation(
                'behaviorLogs', 
                table => table
                    .where('roleId').equals(roleId)
                    .and(log => log.timestamp >= startTime && log.timestamp <= endTime)
                    .toArray(),
                [] // 默认空数组
            );

            // 统计分析
            const stats = this.analyzeBehaviorLogs(behaviorLogs);
            
            // 安全获取最近的评分记录
            const recentScores = await this.safeDbOperation(
                'behaviorScores',
                table => table
                    .where('roleId').equals(roleId)
                    .and(score => score.timestamp >= startTime)
                    .reverse()
                    .limit(10)
                    .toArray(),
                [] // 默认空数组
            );

            const result = {
                roleId,
                timeRange: { startTime, endTime },
                actionStats: stats,
                recentScores: recentScores.map(score => ({
                    score: score.score,
                    timestamp: score.timestamp,
                    context: score.context
                })),
                summary: {
                    totalActions: behaviorLogs.length,
                    avgScore: recentScores.length > 0 ? 
                        recentScores.reduce((sum, s) => sum + s.score, 0) / recentScores.length : 0,
                    mostActiveAction: stats.mostActive,
                    activityTrend: this.calculateActivityTrend(behaviorLogs)
                }
            };

            return createSuccessResponse(result, '行为统计获取成功');

        } catch (error) {
            console.error('Get behavior stats failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    // ===== 私有方法 =====

    /**
     * 加载默认配置
     * @private
     */
    async loadDefaultConfig() {
        const db = getDB();
        
        // 检查是否已有全局配置
        let globalConfig = await db.globalSettings.get('behavior_global_config');
        
        if (!globalConfig) {
            // 创建默认全局配置
            globalConfig = {
                id: 'behavior_global_config',
                config: DEFAULT_BEHAVIOR_CONFIG,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            await db.globalSettings.add(globalConfig);
        }
        
        this.configCache = globalConfig.config;
    }

    /**
     * 获取行为配置（内部方法）
     * @param {string} roleId 角色ID
     * @returns {Promise<Object>} 行为配置
     * @private
     */
    async getBehaviorConfigInternal(roleId) {
        if (this.configCache) {
            return this.configCache;
        }

        const db = getDB();
        
        // 尝试获取角色特定配置
        let roleConfig = await db.globalSettings.get(`behavior_config_${roleId}`);
        
        if (roleConfig) {
            return roleConfig.config;
        }

        // 使用全局默认配置
        await this.loadDefaultConfig();
        return this.configCache;
    }

    /**
     * 设置事件监听器
     * @private
     */
    setupEventListeners() {
        // 监听聊天消息事件，触发行为评估
        eventBus.on(EventTypes.CHAT_MESSAGE_SENT, this.handleChatMessage.bind(this));
        
        // 监听记忆形成事件
        eventBus.on(EventTypes.MEMORY_FORMED, this.handleMemoryFormed.bind(this));
    }

    /**
     * 处理聊天消息事件
     * @param {Object} data 消息数据
     * @private
     */
    async handleChatMessage(data) {
        try {
            const { chatId, senderId } = data;
            
            // 如果是AI发送的消息，记录行为执行
            if (senderId === 'ai') {
                await this.recordBehaviorExecution(chatId, BehaviorActionTypes.CHAT_REPLY, {
                    success: true,
                    messageData: data
                });
            }
            
        } catch (error) {
            console.error('Handle chat message failed:', error);
        }
    }

    /**
     * 处理记忆形成事件
     * @param {Object} data 记忆数据
     * @private
     */
    async handleMemoryFormed(data) {
        try {
            const { roleId } = data;
            
            await this.recordBehaviorExecution(roleId, BehaviorActionTypes.MEMORY_FORMATION, {
                success: true,
                memoryData: data
            });
            
        } catch (error) {
            console.error('Handle memory formed failed:', error);
        }
    }

    /**
     * 记录评分历史
     * @param {string} roleId 角色ID
     * @param {Object} scoreResult 评分结果
     * @private
     */
    async recordScoreHistory(roleId, scoreResult) {
        try {            
            const scoreRecord = {
                id: `score_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                roleId,
                score: scoreResult.score,
                breakdown: scoreResult.breakdown,
                context: scoreResult.context,
                timestamp: scoreResult.timestamp
            };

            await this.safeDbOperation(
                'behaviorScores',
                table => table.add(scoreRecord),
                null // 不记录时返回null
            );
            
        } catch (error) {
            console.error('Record score history failed:', error);
        }
    }

    /**
     * 获取频率倍数
     * @param {string} actionType 行为类型
     * @param {Object} config 配置
     * @returns {number} 频率倍数
     * @private
     */
    getFrequencyMultiplier(actionType, config) {
        switch (actionType) {
            case BehaviorActionTypes.CHAT_REPLY:
                return config.frequencies.chatReply || 1.0;
            case BehaviorActionTypes.MOMENT_POST:
            case BehaviorActionTypes.MOMENT_COMMENT:
            case BehaviorActionTypes.MOMENT_LIKE:
                return config.frequencies.momentActivity || 1.0;
            case BehaviorActionTypes.PROACTIVE_CHAT:
                return config.frequencies.proactiveChat || 0.3;
            default:
                return 1.0;
        }
    }

    /**
     * 计算时间因子评分
     * @param {string} roleId 角色ID
     * @param {string} actionType 行为类型
     * @returns {Promise<number>} 时间评分
     * @private
     */
    async calculateTimeScore(roleId, actionType) {
        const currentTime = Date.now();
        
        // 安全获取最后一次同类型行为
        const lastAction = await this.safeDbOperation(
            'behaviorLogs',
            table => table
                .where(['roleId', 'actionType']).equals([roleId, actionType])
                .reverse()
                .first(),
            null // 没有记录时返回null
        );

        if (!lastAction) {
            return 1.0; // 没有历史行为，给高分
        }

        const timeSinceLastAction = currentTime - lastAction.timestamp;
        const hoursElapsed = timeSinceLastAction / (60 * 60 * 1000);
        
        // 时间越长，评分越高 (最大6小时到满分)
        return Math.min(hoursElapsed / 6, 1.0);
    }

    /**
     * 计算情境修正因子
     * @param {string} actionType 行为类型
     * @param {Object} context 上下文
     * @returns {number} 修正因子
     * @private
     */
    calculateContextModifier(actionType, context) {
        let modifier = 1.0;
        
        // 时间段修正
        const hour = new Date().getHours();
        if (hour >= 9 && hour <= 22) {
            modifier *= 1.2; // 活跃时间段
        } else {
            modifier *= 0.8; // 休息时间段
        }
        
        // 用户活跃度修正
        if (context.userActivityLevel === 'high') modifier *= 1.3;
        if (context.userActivityLevel === 'low') modifier *= 0.7;
        
        // 行为类型特定修正
        if (actionType === BehaviorActionTypes.PROACTIVE_CHAT) {
            modifier *= 0.8; // 主动聊天更谨慎
        }
        
        return modifier;
    }

    /**
     * 深度合并配置
     * @param {Object} target 目标配置
     * @param {Object} source 源配置
     * @returns {Object} 合并后的配置
     * @private
     */
    mergeConfig(target, source) {
        const result = { ...target };
        
        Object.keys(source).forEach(key => {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                result[key] = this.mergeConfig(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        });
        
        return result;
    }

    /**
     * 分析行为日志
     * @param {Array} logs 行为日志
     * @returns {Object} 统计结果
     * @private
     */
    analyzeBehaviorLogs(logs) {
        const actionCounts = {};
        const actionTypes = Object.values(BehaviorActionTypes);
        
        // 初始化计数器
        actionTypes.forEach(type => {
            actionCounts[type] = 0;
        });
        
        // 统计各类型行为
        logs.forEach(log => {
            if (actionCounts.hasOwnProperty(log.actionType)) {
                actionCounts[log.actionType]++;
            }
        });
        
        // 找出最活跃的行为类型
        const mostActive = Object.keys(actionCounts).reduce((a, b) =>
            actionCounts[a] > actionCounts[b] ? a : b
        );
        
        return {
            actionCounts,
            mostActive,
            totalActions: logs.length
        };
    }

    /**
     * 计算活跃度趋势
     * @param {Array} logs 行为日志
     * @returns {string} 趋势描述
     * @private
     */
    calculateActivityTrend(logs) {
        if (logs.length < 2) return 'insufficient_data';
        
        // 将日志按时间排序并分组
        const sortedLogs = logs.sort((a, b) => a.timestamp - b.timestamp);
        const midPoint = Math.floor(sortedLogs.length / 2);
        
        const firstHalf = sortedLogs.slice(0, midPoint);
        const secondHalf = sortedLogs.slice(midPoint);
        
        if (secondHalf.length > firstHalf.length) return 'increasing';
        if (secondHalf.length < firstHalf.length) return 'decreasing';
        return 'stable';
    }
}

/**
 * 行为评分计算器
 */
class BehaviorScoreCalculator {
    constructor() {
        this.lastBreakdown = null;
    }

    // 安全DB操作（独立于服务实例）
    async safeDbOperation(tableName, operation, fallbackValue = null) {
        try {
            const db = getDB();
            if (!db[tableName]) {
                return fallbackValue;
            }
            return await operation(db[tableName]);
        } catch (error) {
            return fallbackValue;
        }
    }

    /**
     * 计算综合行为评分
     * @param {Object} context 评分上下文
     * @returns {Promise<number>} 评分 0-1
     */
    async calculateScore(context) {
        const {
            roleId,
            chatId,
            timeWindow = 24 * 60 * 60 * 1000, // 24小时
            currentTime = Date.now(),
            config
        } = context;

        const weights = config.scoreWeights;

        // 1. 计算互动频率评分
        const interactionScore = await this.calculateInteractionScore(
            chatId, timeWindow, currentTime
        );

        // 2. 计算时间因子评分
        const timeScore = await this.calculateTimeScore(
            roleId, currentTime
        );

        // 3. 计算情境相关性评分
        const contextScore = this.calculateContextScore(context);

        // 4. 计算用户活跃度评分
        const activityScore = await this.calculateActivityScore(
            chatId, timeWindow, currentTime
        );

        // 5. 加权综合评分
        const totalScore = 
            interactionScore * weights.interactionFrequency +
            timeScore * weights.timeSinceLastAction +
            contextScore * weights.contextRelevance +
            activityScore * weights.userActivity;

        // 保存评分明细
        this.lastBreakdown = {
            interactionScore,
            timeScore,
            contextScore,
            activityScore,
            weights,
            totalScore: Math.min(totalScore, 1.0)
        };

        return Math.min(totalScore, 1.0);
    }

    /**
     * 获取评分明细
     * @returns {Object} 评分明细
     */
    getScoreBreakdown() {
        return this.lastBreakdown;
    }

    /**
     * 计算互动频率评分
     * @param {string} chatId 聊天ID
     * @param {number} timeWindow 时间窗口
     * @param {number} currentTime 当前时间
     * @returns {Promise<number>} 频率评分
     */
    async calculateInteractionScore(chatId, timeWindow, currentTime) {
        const startTime = currentTime - timeWindow;

        try {
            // 从聊天内嵌消息统计
            const db = getDB();
            const chat = await db.chats.get(chatId);
            const withinWindow = (chat?.messages || []).filter(m => {
                const ts = typeof m.timestamp === 'string' ? new Date(m.timestamp).getTime() : m.timestamp;
                return ts >= startTime;
            });
            const messageCount = withinWindow.length;

            // 计算每小时平均消息数
            const hoursInWindow = timeWindow / (60 * 60 * 1000);
            const messagesPerHour = messageCount / hoursInWindow;

            // 标准化评分 (假设5条消息/小时为高活跃)
            return Math.min(messagesPerHour / 5, 1.0);

        } catch (error) {
            console.error('Calculate interaction score failed:', error);
            return 0.5; // 默认中等评分
        }
    }

    /**
     * 计算时间因子评分
     * @param {string} roleId 角色ID
     * @param {number} currentTime 当前时间
     * @returns {Promise<number>} 时间评分
     */
    async calculateTimeScore(roleId, currentTime) {
        try {
            // 安全获取最后一次行为时间
            const lastBehavior = await this.safeDbOperation(
                'behaviorLogs',
                table => table
                    .where('roleId').equals(roleId)
                    .reverse()
                    .first(),
                null
            );

            if (!lastBehavior) {
                return 1.0; // 没有历史行为，给高分
            }

            const timeSinceLastAction = currentTime - lastBehavior.timestamp;
            const hoursElapsed = timeSinceLastAction / (60 * 60 * 1000);

            // 时间越长，评分越高 (最大6小时到满分)
            return Math.min(hoursElapsed / 6, 1.0);

        } catch (error) {
            console.error('Calculate time score failed:', error);
            return 0.5; // 默认中等评分
        }
    }

    /**
     * 计算情境相关性评分
     * @param {Object} context 上下文
     * @returns {number} 情境评分
     */
    calculateContextScore(context) {
        let score = 0;

        // 时间段相关性
        const hour = new Date().getHours();
        if (hour >= 9 && hour <= 22) {
            score += 0.5; // 活跃时间段
        } else {
            score += 0.1; // 休息时间段
        }

        // 上下文关键词匹配
        const contextKeywords = context.keywords || [];
        const relevantKeywords = ['聊天', '分享', '互动', '有趣'];
        const matches = contextKeywords.filter(keyword =>
            relevantKeywords.some(relevant => 
                keyword.includes(relevant)
            )
        );
        score += Math.min(matches.length * 0.1, 0.3);

        // 用户情绪状态
        if (context.userMood === 'positive') score += 0.2;
        if (context.userMood === 'neutral') score += 0.1;

        return Math.min(score, 1.0);
    }

    /**
     * 计算用户活跃度评分
     * @param {string} chatId 聊天ID
     * @param {number} timeWindow 时间窗口
     * @param {number} currentTime 当前时间
     * @returns {Promise<number>} 活跃度评分
     */
    async calculateActivityScore(chatId, timeWindow, currentTime) {
        const startTime = currentTime - timeWindow;

        try {
            // 获取用户消息 (非AI消息) - 从聊天内嵌消息中读取
            const db = getDB();
            const chat = await db.chats.get(chatId);
            const userMessages = (chat?.messages || []).filter(m => {
                const ts = typeof m.timestamp === 'string' ? new Date(m.timestamp).getTime() : m.timestamp;
                return ts >= startTime && m.senderId !== 'ai';
            });

            if (userMessages.length === 0) {
                return 0.1; // 用户不活跃，给低分
            }

            // 计算消息时间分布的均匀度
            const messageIntervals = [];
            for (let i = 1; i < userMessages.length; i++) {
                const interval = userMessages[i].timestamp - userMessages[i-1].timestamp;
                messageIntervals.push(interval);
            }

            if (messageIntervals.length === 0) {
                return 0.5;
            }

            // 计算平均间隔 (间隔越小，活跃度越高)
            const avgInterval = messageIntervals.reduce((a, b) => a + b, 0) / messageIntervals.length;
            const hoursInterval = avgInterval / (60 * 60 * 1000);

            // 标准化评分 (2小时内回复为高活跃)
            return Math.max(0.1, Math.min(2 / hoursInterval, 1.0));

        } catch (error) {
            console.error('Calculate activity score failed:', error);
            return 0.3; // 默认低等评分
        }
    }
}

/**
 * 行为冷却管理器
 */
class BehaviorCooldownManager {
    constructor() {
        this.defaultCooldowns = DEFAULT_BEHAVIOR_CONFIG.cooldowns;
    }

    // 安全DB操作（独立于服务实例）
    async safeDbOperation(tableName, operation, fallbackValue = null) {
        try {
            const db = getDB();
            if (!db[tableName]) {
                return fallbackValue;
            }
            return await operation(db[tableName]);
        } catch (error) {
            return fallbackValue;
        }
    }

    /**
     * 初始化冷却管理器
     * @returns {Promise<void>}
     */
    async initialize() {
        // 加载自定义冷却配置
        await this.loadCustomCooldowns();
        console.log('Behavior cooldown manager initialized');
    }

    /**
     * 检查行为是否在冷却期
     * @param {string} roleId 角色ID
     * @param {string} actionType 行为类型
     * @returns {Promise<Object>} 冷却状态
     */
    async checkCooldown(roleId, actionType) {
        const currentTime = Date.now();

        try {
            // 安全获取最后一次该类型行为
            const lastAction = await this.safeDbOperation(
                'behaviorLogs',
                table => table
                    .where(['roleId', 'actionType']).equals([roleId, actionType])
                    .reverse()
                    .first(),
                null
            );

            if (!lastAction) {
                return { 
                    inCooldown: false, 
                    remainingTime: 0,
                    canExecute: true
                };
            }

            const cooldownDuration = this.getCooldownDuration(actionType);
            const timeSinceLastAction = currentTime - lastAction.timestamp;

            if (timeSinceLastAction >= cooldownDuration) {
                return {
                    inCooldown: false,
                    remainingTime: 0,
                    canExecute: true
                };
            } else {
                return {
                    inCooldown: true,
                    remainingTime: cooldownDuration - timeSinceLastAction,
                    canExecute: false
                };
            }

        } catch (error) {
            console.error('Check cooldown failed:', error);
            return {
                inCooldown: false,
                remainingTime: 0,
                canExecute: true
            };
        }
    }

    /**
     * 应用行为冷却
     * @param {string} roleId 角色ID
     * @param {string} actionType 行为类型
     * @param {Object} actionData 行为数据
     * @returns {Promise<void>}
     */
    async applyCooldown(roleId, actionType, actionData = {}) {
        const db = getDB();
        const timestamp = Date.now();

        try {
            // 记录行为日志
            const behaviorLog = {
                id: `behavior_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
                roleId,
                actionType,
                timestamp,
                actionData,
                success: actionData.success !== false
            };

            await this.safeDbOperation(
                'behaviorLogs',
                table => table.add(behaviorLog),
                null // 无法记录时静默失败
            );

            // 发送冷却应用事件
            await eventBus.emit('behavior.cooldown-applied', {
                roleId,
                actionType,
                timestamp,
                cooldownDuration: this.getCooldownDuration(actionType)
            });

        } catch (error) {
            console.error('Apply cooldown failed:', error);
        }
    }

    /**
     * 获取行为冷却时长
     * @param {string} actionType 行为类型
     * @returns {number} 冷却时长(毫秒)
     */
    getCooldownDuration(actionType) {
        return this.defaultCooldowns[actionType] || 30 * 60 * 1000; // 默认30分钟
    }

    /**
     * 更新冷却配置
     * @param {Object} cooldownConfig 冷却配置
     * @returns {Promise<void>}
     */
    async updateCooldownConfig(cooldownConfig) {
        Object.assign(this.defaultCooldowns, cooldownConfig);

        // 保存配置到数据库
        const db = getDB();
        await db.globalSettings.put({
            id: 'behavior_cooldown_config',
            config: this.defaultCooldowns,
            updatedAt: new Date().toISOString()
        });
    }

    /**
     * 加载自定义冷却配置
     * @private
     */
    async loadCustomCooldowns() {
        const db = getDB();
        
        try {
            const customConfig = await db.globalSettings.get('behavior_cooldown_config');
            
            if (customConfig && customConfig.config) {
                Object.assign(this.defaultCooldowns, customConfig.config);
            }
            
        } catch (error) {
            console.error('Load custom cooldowns failed:', error);
        }
    }
}

// 创建全局行为服务实例
export const behaviorService = new BehaviorService();

// 导出服务类
export { BehaviorService };