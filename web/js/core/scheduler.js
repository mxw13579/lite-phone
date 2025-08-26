/**
 * 任务调度器系统
 * 提供定时任务执行、补偿机制和聚合评估功能
 */

import { eventBus, EventTypes } from './event-bus.js';

/**
 * 调度器类
 */
class Scheduler {
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

                // 创建超时Promise
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Task timeout')), task.timeout);
                });

                // 执行任务
                const taskPromise = Promise.resolve(task.handler({
                    taskId: task.id,
                    attempt: attempt + 1,
                    timestamp: startTime
                }));

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
     * 延迟函数
     * @param {number} ms 毫秒数
     * @returns {Promise} Promise
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 创建全局调度器实例
export const scheduler = new Scheduler();

// 导出Scheduler类供自定义实例使用
export { Scheduler };

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
    }
};