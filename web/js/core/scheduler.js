/**
 * 任务调度器系统
 * 提供定时任务执行、补偿机制和聚合评估功能
 * 
 * 功能扩展：
 * - 支持AI行为决策任务调度
 * - 定期评估行为机会
 * - 集成行为服务决策流程
 */

import { eventBus, EventTypes } from './event-bus.js';
import { getDB } from './db.js';

/**
 * 扩展的调度器类
 * 支持AI行为决策任务调度
 */
class EnhancedScheduler {
    constructor() {
        this.tasks = new Map();
        this.intervals = new Map();
        this.isRunning = false;
        this.tickInterval = 60000; // 60秒一次主tick
        this.maxMissedTicks = 3; // 最大允许错过的tick次数
        this.lastTickTime = Date.now();
        this.tickCounter = 0;
        this.evaluationInterval = 5 * 60 * 1000; // 5分钟聚合评估
        this.lastEvaluationTime = Date.now();
        
        // 行为决策相关属性
        this.behaviorService = null;
        this.isBehaviorInitialized = false;
    }

    /**
     * 启动调度器
     */
    start() {
        if (this.isRunning) {
            console.warn('Scheduler is already running');
            return;
        }

        this.isRunning = true;
        this.lastTickTime = Date.now();
        
        // 启动主tick定时器
        this.mainTimer = setInterval(() => {
            this.performTick();
        }, this.tickInterval);

        // 启动聚合评估定时器
        this.evaluationTimer = setInterval(() => {
            this.performEvaluation();
        }, this.evaluationInterval);
        
        // 初始化行为决策支持（通过任务系统统一调度）
        this.initializeBehaviorSupport().catch(error => {
            console.error('Failed to initialize behavior support:', error);
        });

        console.log('Scheduler started');
        eventBus.emit(EventTypes.SCHEDULER_TICK, { type: 'start', timestamp: Date.now() });
    }

    /**
     * 停止调度器
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        
        if (this.mainTimer) {
            clearInterval(this.mainTimer);
            this.mainTimer = null;
        }

        if (this.evaluationTimer) {
            clearInterval(this.evaluationTimer);
            this.evaluationTimer = null;
        }

        // 清理所有任务的定时器
        for (const intervalId of this.intervals.values()) {
            clearInterval(intervalId);
        }
        this.intervals.clear();

        console.log('Scheduler stopped');
    }

    /**
     * 执行主tick
     */
    async performTick() {
        const now = Date.now();
        const timeSinceLastTick = now - this.lastTickTime;
        
        try {
            // 检查是否需要补偿tick
            const missedTicks = Math.floor(timeSinceLastTick / this.tickInterval) - 1;
            if (missedTicks > 0 && missedTicks <= this.maxMissedTicks) {
                console.log(`Performing ${missedTicks} compensation ticks`);
                for (let i = 0; i < missedTicks; i++) {
                    await this.executeTick('compensation');
                }
            }

            // 执行正常tick
            await this.executeTick('normal');
            
            this.lastTickTime = now;
            this.tickCounter++;

        } catch (error) {
            console.error('Scheduler tick error:', error);
            eventBus.emit(EventTypes.SCHEDULER_ERROR, { 
                type: 'tick', 
                error: error.message,
                timestamp: now 
            });
        }
    }

    /**
     * 执行单次tick
     * @param {string} type tick类型
     */
    async executeTick(type) {
        const tickData = {
            type,
            timestamp: Date.now(),
            counter: this.tickCounter
        };

        // 发送tick事件
        await eventBus.emit(EventTypes.SCHEDULER_TICK, tickData);

        // 执行需要在tick时运行的任务
        await this.executeTasks('tick');
    }

    /**
     * 执行聚合评估
     */
    async performEvaluation() {
        const now = Date.now();
        
        try {
            const evaluationData = {
                timestamp: now,
                timeSinceLastEvaluation: now - this.lastEvaluationTime,
                totalTicks: this.tickCounter,
                activeTasks: this.tasks.size,
                systemStats: await this.getSystemStats()
            };

            console.log('Performing 5-minute aggregated evaluation', evaluationData);
            
            // 发送评估事件
            await eventBus.emit('scheduler.evaluation', evaluationData);
            
            // 执行需要在评估时运行的任务
            await this.executeTasks('evaluation');
            
            this.lastEvaluationTime = now;

        } catch (error) {
            console.error('Scheduler evaluation error:', error);
            eventBus.emit(EventTypes.SCHEDULER_ERROR, { 
                type: 'evaluation', 
                error: error.message,
                timestamp: now 
            });
        }
    }

    /**
     * 获取系统统计信息
     * @returns {Object} 系统统计
     */
    async getSystemStats() {
        return {
            memory: this.getMemoryUsage(),
            eventBus: eventBus.getStats(),
            timestamp: Date.now()
        };
    }

    /**
     * 获取内存使用情况
     * @returns {Object} 内存信息
     */
    getMemoryUsage() {
        if (performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit
            };
        }
        return { used: 0, total: 0, limit: 0 };
    }

    /**
     * 添加定时任务
     * @param {string} taskId 任务ID
     * @param {Object} taskConfig 任务配置
     * @returns {boolean} 是否添加成功
     */
    addTask(taskId, taskConfig) {
        if (this.tasks.has(taskId)) {
            console.warn(`Task ${taskId} already exists`);
            return false;
        }

        const task = {
            id: taskId,
            name: taskConfig.name || taskId,
            handler: taskConfig.handler,
            schedule: taskConfig.schedule || 'tick', // 'tick', 'evaluation', 'interval'
            interval: taskConfig.interval || 60000, // 用于interval类型
            enabled: taskConfig.enabled !== false,
            maxRetries: taskConfig.maxRetries || 3,
            retryDelay: taskConfig.retryDelay || 1000,
            timeout: taskConfig.timeout || 30000,
            priority: taskConfig.priority || 0,
            createdAt: Date.now(),
            lastRunAt: null,
            lastError: null,
            runCount: 0,
            errorCount: 0
        };

        this.tasks.set(taskId, task);

        // 如果是间隔任务，创建定时器
        if (task.schedule === 'interval' && task.enabled) {
            this.createIntervalTask(task);
        }

        console.log(`Task added: ${taskId}`, task);
        return true;
    }

    /**
     * 创建间隔任务
     * @param {Object} task 任务对象
     */
    createIntervalTask(task) {
        if (this.intervals.has(task.id)) {
            clearInterval(this.intervals.get(task.id));
        }

        const intervalId = setInterval(async () => {
            if (task.enabled) {
                await this.executeTask(task);
            }
        }, task.interval);

        this.intervals.set(task.id, intervalId);
    }

    /**
     * 移除任务
     * @param {string} taskId 任务ID
     * @returns {boolean} 是否移除成功
     */
    removeTask(taskId) {
        if (!this.tasks.has(taskId)) {
            return false;
        }

        // 清理定时器
        if (this.intervals.has(taskId)) {
            clearInterval(this.intervals.get(taskId));
            this.intervals.delete(taskId);
        }

        this.tasks.delete(taskId);
        console.log(`Task removed: ${taskId}`);
        return true;
    }

    /**
     * 启用/禁用任务
     * @param {string} taskId 任务ID
     * @param {boolean} enabled 是否启用
     * @returns {boolean} 是否操作成功
     */
    toggleTask(taskId, enabled) {
        const task = this.tasks.get(taskId);
        if (!task) {
            return false;
        }

        task.enabled = enabled;

        if (task.schedule === 'interval') {
            if (enabled) {
                this.createIntervalTask(task);
            } else {
                if (this.intervals.has(taskId)) {
                    clearInterval(this.intervals.get(taskId));
                    this.intervals.delete(taskId);
                }
            }
        }

        console.log(`Task ${taskId} ${enabled ? 'enabled' : 'disabled'}`);
        return true;
    }

    /**
     * 执行指定类型的任务
     * @param {string} scheduleType 调度类型
     */
    async executeTasks(scheduleType) {
        const tasksToRun = Array.from(this.tasks.values())
            .filter(task => task.schedule === scheduleType && task.enabled)
            .sort((a, b) => b.priority - a.priority);

        const promises = tasksToRun.map(task => this.executeTask(task));
        await Promise.allSettled(promises);
    }

    /**
     * 执行单个任务
     * @param {Object} task 任务对象
     * @returns {Promise} 执行结果
     */
    async executeTask(task) {
        if (!task.enabled) {
            return;
        }

        const startTime = Date.now();
        let attempt = 0;

        while (attempt <= task.maxRetries) {
            try {
                console.log(`Executing task: ${task.name} (attempt ${attempt + 1})`);

                // 🔒 稳定性修复：使用AbortController确保任务可以真正取消
                const abortController = new AbortController();
                let timeoutId = null;

                // 创建超时Promise with cleanup
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        abortController.abort();
                        reject(new Error('Task timeout'));
                    }, task.timeout);
                });

                // 执行任务，传递abort signal
                const taskPromise = Promise.resolve(task.handler({
                    taskId: task.id,
                    attempt: attempt + 1,
                    timestamp: startTime,
                    signal: abortController.signal // 允许任务响应取消信号
                })).finally(() => {
                    // 清理超时定时器
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                });

                await Promise.race([taskPromise, timeoutPromise]);

                // 成功执行
                task.lastRunAt = Date.now();
                task.runCount++;
                task.lastError = null;

                const duration = Date.now() - startTime;
                console.log(`Task ${task.name} completed in ${duration}ms`);

                return { success: true, duration, attempt: attempt + 1 };

            } catch (error) {
                attempt++;
                task.errorCount++;
                task.lastError = {
                    message: error.message,
                    timestamp: Date.now(),
                    attempt
                };

                console.error(`Task ${task.name} failed (attempt ${attempt}):`, error);

                if (attempt <= task.maxRetries) {
                    console.log(`Retrying task ${task.name} in ${task.retryDelay}ms...`);
                    await this.sleep(task.retryDelay);
                } else {
                    console.error(`Task ${task.name} failed after ${task.maxRetries} attempts`);
                    eventBus.emit(EventTypes.SCHEDULER_ERROR, {
                        type: 'task',
                        taskId: task.id,
                        taskName: task.name,
                        error: error.message,
                        attempts: attempt,
                        timestamp: Date.now()
                    });
                    return { success: false, error: error.message, attempts: attempt };
                }
            }
        }
    }

    /**
     * 立即执行任务
     * @param {string} taskId 任务ID
     * @returns {Promise} 执行结果
     */
    async runTaskNow(taskId) {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        return await this.executeTask(task);
    }

    /**
     * 获取任务列表
     * @returns {Array} 任务列表
     */
    getTasks() {
        return Array.from(this.tasks.values()).map(task => ({
            ...task,
            // 不返回handler函数，避免序列化问题
            handler: typeof task.handler
        }));
    }

    /**
     * 获取调度器状态
     * @returns {Object} 状态信息
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            tickCounter: this.tickCounter,
            lastTickTime: this.lastTickTime,
            lastEvaluationTime: this.lastEvaluationTime,
            tasksCount: this.tasks.size,
            enabledTasksCount: Array.from(this.tasks.values()).filter(t => t.enabled).length,
            intervalTasksCount: this.intervals.size,
            uptime: this.isRunning ? Date.now() - this.lastTickTime : 0
        };
    }

    /**
     * 初始化行为决策支持
     * @returns {Promise<void>}
     */
    async initializeBehaviorSupport() {
        try {
            // 动态导入行为服务
            const { behaviorService } = await import('../services/behavior.js');
            this.behaviorService = behaviorService;
            
            // 初始化行为服务
            const initResult = await this.behaviorService.initialize();
            if (!initResult.success) {
                throw new Error(`Behavior service initialization failed: ${initResult.error}`);
            }
            
            // 注册行为决策任务
            this.addTask('behavior_evaluation', {
                name: 'AI行为决策评估',
                schedule: 'interval',
                interval: 5 * 60 * 1000, // 5分钟评估一次
                handler: this.evaluateBehaviorOpportunities.bind(this),
                priority: 5,
                maxRetries: 2,
                timeout: 30000
            });
            
            this.isBehaviorInitialized = true;
            console.log('✅ Behavior decision support initialized in scheduler');
            
        } catch (error) {
            console.error('❌ Failed to initialize behavior support:', error);
            this.isBehaviorInitialized = false;
        }
    }
    
    
    /**
     * 评估行为机会
     * @returns {Promise<void>}
     */
    async evaluateBehaviorOpportunities() {
        if (!this.behaviorService) {
            console.warn('Behavior service not available for evaluation');
            return;
        }
        
        try {
            const db = getDB();
            const currentTime = Date.now();
            const evaluationWindow = 24 * 60 * 60 * 1000; // 24小时窗口
            
            console.log('🔍 Evaluating behavior opportunities...');
            
            // 获取所有活跃的聊天（24小时内有活动）
            const activeChats = await db.chats
                .where('updatedAt')
                .above(currentTime - evaluationWindow)
                .toArray();
            
            console.log(`📊 Found ${activeChats.length} active chats for behavior evaluation`);
            
            // 为每个活跃聊天评估行为机会
            const evaluationPromises = activeChats.map(chat => 
                this.evaluateChatBehavior(chat).catch(error => {
                    console.error(`Chat behavior evaluation failed for ${chat.id}:`, error);
                    return null;
                })
            );
            
            const results = await Promise.allSettled(evaluationPromises);
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
            
            console.log(`✅ Completed behavior evaluation for ${successCount}/${activeChats.length} chats`);
            
            // 发送评估结果事件
            await eventBus.emit('behavior.opportunities-evaluated', {
                totalChats: activeChats.length,
                successfulEvaluations: successCount,
                timestamp: currentTime,
                evaluationWindow
            });
            
        } catch (error) {
            console.error('Failed to evaluate behavior opportunities:', error);
            throw error;
        }
    }
    
    /**
     * 评估特定聊天的行为机会
     * @param {Object} chat 聊天对象
     * @returns {Promise<Object|null>} 评估结果
     */
    async evaluateChatBehavior(chat) {
        if (!this.behaviorService) return null;
        
        try {
            const context = {
                roleId: chat.id,
                chatId: chat.id,
                timeWindow: 4 * 60 * 60 * 1000, // 4小时窗口
                keywords: await this.extractRecentKeywords(chat.id),
                userActivityLevel: await this.calculateUserActivityLevel(chat.id)
            };
            
            // 计算行为评分
            const scoreResult = await this.behaviorService.calculateBehaviorScore(
                chat.id, context
            );
            
            if (!scoreResult.success) {
                console.warn(`Behavior score calculation failed for chat ${chat.id}:`, scoreResult.error);
                return null;
            }
            
            const behaviorScore = scoreResult.data.score;
            console.log(`📈 Chat ${chat.id} behavior score: ${(behaviorScore * 100).toFixed(1)}%`);
            
            // 如果评分足够高，考虑执行行为
            if (behaviorScore > 0.6) {
                return await this.considerBehaviorActions(chat, behaviorScore, context);
            }
            
            return { chatId: chat.id, score: behaviorScore, actionConsidered: false };
            
        } catch (error) {
            console.error(`Failed to evaluate chat behavior for ${chat.id}:`, error);
            return null;
        }
    }
    
    /**
     * 考虑执行行为动作
     * @param {Object} chat 聊天对象
     * @param {number} score 行为评分
     * @param {Object} context 上下文
     * @returns {Promise<Object>} 考虑结果
     */
    async considerBehaviorActions(chat, score, context) {
        const actionTypes = [
            'chat_reply',
            'proactive_chat',
            'moment_post',
            'moment_comment'
        ];
        
        const consideredActions = [];
        
        for (const actionType of actionTypes) {
            try {
                // 检查冷却状态
                const cooldownResult = await this.behaviorService.applyCooldown(
                    chat.id, actionType
                );
                
                if (!cooldownResult.success || !cooldownResult.data.canExecute) {
                    console.log(`❄️ Action ${actionType} for chat ${chat.id} is in cooldown`);
                    continue;
                }
                
                // 评估具体行为概率
                const probabilityResult = await this.behaviorService.assessActionProbability(
                    actionType, { ...context, behaviorScore: score }
                );
                
                if (!probabilityResult.success) {
                    console.warn(`Probability assessment failed for ${actionType}:`, probabilityResult.error);
                    continue;
                }
                
                const { probability, threshold, shouldExecute } = probabilityResult.data;
                
                console.log(`🎯 Action ${actionType}: ${(probability * 100).toFixed(1)}% (threshold: ${(threshold * 100).toFixed(1)}%)`);
                
                consideredActions.push({
                    actionType,
                    probability,
                    threshold,
                    shouldExecute
                });
                
                // 如果应该执行，发送行为建议事件
                if (shouldExecute) {
                    await eventBus.emit('behavior.action-suggested', {
                        chatId: chat.id,
                        actionType,
                        probability,
                        behaviorScore: score,
                        context,
                        timestamp: Date.now(),
                        suggestedBy: 'scheduler'
                    });
                    
                    console.log(`🚀 Suggested action ${actionType} for chat ${chat.id}`);
                }
                
            } catch (error) {
                console.error(`Failed to consider action ${actionType} for chat ${chat.id}:`, error);
            }
        }
        
        return {
            chatId: chat.id,
            score,
            actionConsidered: true,
            consideredActions,
            suggestedActionsCount: consideredActions.filter(a => a.shouldExecute).length
        };
    }
    
    /**
     * 提取最近的关键词
     * @param {string} chatId 聊天ID
     * @returns {Promise<Array>} 关键词列表
     */
    async extractRecentKeywords(chatId) {
        try {
            const db = getDB();
            const recentTimeWindow = 2 * 60 * 60 * 1000; // 2小时内
            
            const chat = await db.chats.get(chatId);
            const cutoff = Date.now() - recentTimeWindow;
            const recentMessages = (chat?.messages || [])
                .filter(m => {
                    const ts = typeof m.timestamp === 'string' ? new Date(m.timestamp).getTime() : m.timestamp;
                    return ts > cutoff;
                })
                .slice(-10)
                .reverse();
            
            // 简单的关键词提取
            const keywords = [];
            recentMessages.forEach(message => {
                if (message.content) {
                    const words = message.content
                        .replace(/[^\u4e00-\u9fa5\w\s]/g, ' ')
                        .split(/\s+/)
                        .filter(word => word.length > 1);
                    keywords.push(...words);
                }
            });
            
            // 去重并返回前10个
            return [...new Set(keywords)].slice(0, 10);
            
        } catch (error) {
            console.error(`Failed to extract keywords for chat ${chatId}:`, error);
            return [];
        }
    }
    
    /**
     * 计算用户活跃度等级
     * @param {string} chatId 聊天ID
     * @returns {Promise<string>} 活跃度等级
     */
    async calculateUserActivityLevel(chatId) {
        try {
            const db = getDB();
            const timeWindow = 24 * 60 * 60 * 1000; // 24小时窗口
            
            const chat = await db.chats.get(chatId);
            const cutoff = Date.now() - timeWindow;
            const userMessages = (chat?.messages || []).filter(m => {
                const ts = typeof m.timestamp === 'string' ? new Date(m.timestamp).getTime() : m.timestamp;
                return ts > cutoff && m.senderId !== 'ai';
            }).length;
            
            if (userMessages >= 20) return 'high';
            if (userMessages >= 5) return 'medium';
            return 'low';
            
        } catch (error) {
            console.error(`Failed to calculate user activity for chat ${chatId}:`, error);
            return 'low';
        }
    }
    
    /**
     * 获取行为决策状态
     * @returns {Object} 行为决策状态
     */
    getBehaviorStatus() {
        return {
            isInitialized: this.isBehaviorInitialized,
            hasBehaviorService: !!this.behaviorService,
            behaviorTasksCount: Array.from(this.tasks.values()).filter(task => task.name.includes('行为')).length
        };
    }
    
    /**
     * 延迟函数
     * @param {number} ms 毫秒数
     * @returns {Promise} Promise
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 创建全局增强调度器实例
export const scheduler = new EnhancedScheduler();

// 导出类供自定义实例使用
export { EnhancedScheduler as Scheduler, EnhancedScheduler };

// 预定义的常用任务
export const BuiltInTasks = {
    // 内存清理任务
    MEMORY_CLEANUP: {
        name: '内存清理',
        schedule: 'evaluation',
        handler: async () => {
            if (window.gc && typeof window.gc === 'function') {
                window.gc();
            }
            
            const memUsage = performance.memory;
            if (memUsage && memUsage.usedJSHeapSize > memUsage.jsHeapSizeLimit * 0.8) {
                eventBus.emit(EventTypes.MEMORY_LOW, {
                    used: memUsage.usedJSHeapSize,
                    limit: memUsage.jsHeapSizeLimit,
                    percentage: (memUsage.usedJSHeapSize / memUsage.jsHeapSizeLimit * 100).toFixed(2)
                });
            }
        }
    },

    // 数据库健康检查
    DB_HEALTH_CHECK: {
        name: '数据库健康检查',
        schedule: 'evaluation',
        handler: async () => {
            const { checkDatabaseHealth } = await import('./db.js');
            const health = await checkDatabaseHealth();
            
            if (!health.healthy) {
                eventBus.emit(EventTypes.SYSTEM_ERROR, {
                    type: 'database',
                    error: health.error,
                    details: health
                });
            }
            
            return health;
        }
    },

    // 事件总线统计
    EVENT_BUS_STATS: {
        name: '事件总线统计',
        schedule: 'evaluation', 
        handler: async () => {
            const stats = eventBus.getStats();
            console.log('Event Bus Stats:', stats);
            return stats;
        }
    },
    
    // AI行为决策评估 (现在由增强调度器动态添加)
    BEHAVIOR_EVALUATION: {
        name: 'AI行为决策评估',
        schedule: 'interval',
        interval: 5 * 60 * 1000, // 5分钟
        handler: async (context) => {
            // 这个处理器会被增强调度器的方法替换
            console.log('Behavior evaluation task triggered', context);
        },
        priority: 5,
        maxRetries: 2
    }
};