/**
 * 使用方法：安全插件管理器，集成配额监控和仪表盘
 * import { SecurePluginManager } from './secure-plugin-manager.js';
 * 
 * const manager = new SecurePluginManager();
 * await manager.executePlugin('memory-extract', code, input);
 */

import { SecurePluginRuntime } from './secure-runtime.js';
import { eventBus, EventTypes } from '../../core/event-bus.js';
import { getDB } from '../../core/db-v13.js';

/**
 * 插件配置模板
 */
const PLUGIN_CONFIGS = {
    'memory-extract': {
        allowedAPIs: ['storage.get', 'storage.set', 'log.info', 'time.now'],
        quotas: {
            maxWallTimeMs: 3000,
            maxRequests: 5,
            maxMemoryBytes: 8 * 1024 * 1024
        }
    },
    'behavior-analyzer': {
        allowedAPIs: ['storage.get', 'events.emit', 'log.info', 'time.now'],
        quotas: {
            maxWallTimeMs: 5000,
            maxRequests: 10,
            maxMemoryBytes: 16 * 1024 * 1024
        }
    },
    'moment-generator': {
        allowedAPIs: ['storage.get', 'http.get', 'events.emit', 'log.info'],
        quotas: {
            maxWallTimeMs: 10000,
            maxRequests: 15,
            maxNetworkRequests: 3,
            maxMemoryBytes: 32 * 1024 * 1024
        }
    },
    'chat-responder': {
        allowedAPIs: ['storage.get', 'http.post', 'events.emit', 'log.info', 'time.now'],
        quotas: {
            maxWallTimeMs: 8000,
            maxRequests: 20,
            maxNetworkRequests: 5,
            maxMemoryBytes: 24 * 1024 * 1024
        }
    }
};

/**
 * 安全插件管理器
 */
export class SecurePluginManager {
    constructor() {
        this.runtimes = new Map();
        this.executionHistory = [];
        this.stats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalExecutionTime: 0,
            lastReset: Date.now()
        };
        
        this.initializeEventHandlers();
    }

    /**
     * 初始化事件处理器
     */
    initializeEventHandlers() {
        // 监听插件错误事件
        eventBus.on(EventTypes.PLUGIN_ERROR, (data) => {
            this.handlePluginError(data);
        });

        // 监听插件API调用事件
        eventBus.on(EventTypes.PLUGIN_API_CALL, (data) => {
            this.recordAPICall(data);
        });

        // 定期清理过期的运行时
        setInterval(() => {
            this.cleanupExpiredRuntimes();
        }, 60000); // 每分钟清理一次
    }

    /**
     * 执行插件
     * @param {string} pluginId 插件ID
     * @param {string} code 插件代码
     * @param {any} input 输入参数
     * @returns {Promise<Object>} 执行结果
     */
    async executePlugin(pluginId, code, input = null) {
        const startTime = Date.now();
        let runtime = null;

        try {
            // 获取或创建运行时
            runtime = this.getOrCreateRuntime(pluginId);
            
            // 检查插件是否已被熔断
            if (await this.isPluginCircuitBreaker(pluginId)) {
                throw new Error(`Plugin ${pluginId} is in circuit breaker state`);
            }

            // 执行插件
            const result = await runtime.execute(code, input);
            
            const executionTime = Date.now() - startTime;
            
            // 记录成功执行
            const execution = {
                pluginId,
                timestamp: startTime,
                executionTime,
                success: true,
                result,
                stats: runtime.getStats()
            };
            
            this.recordExecution(execution);
            this.stats.successfulExecutions++;
            
            // 发送成功事件
            await eventBus.emit('plugin.execution.success', {
                pluginId,
                executionTime,
                timestamp: Date.now()
            });

            return {
                success: true,
                result,
                executionTime,
                stats: runtime.getStats()
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // 记录失败执行
            const execution = {
                pluginId,
                timestamp: startTime,
                executionTime,
                success: false,
                error: error.message,
                stats: runtime ? runtime.getStats() : null
            };
            
            this.recordExecution(execution);
            this.stats.failedExecutions++;
            
            // 检查是否需要熔断
            await this.evaluateCircuitBreaker(pluginId);
            
            // 发送失败事件
            await eventBus.emit('plugin.execution.failed', {
                pluginId,
                error: error.message,
                executionTime,
                timestamp: Date.now()
            });

            return {
                success: false,
                error: error.message,
                executionTime,
                stats: runtime ? runtime.getStats() : null
            };

        } finally {
            this.stats.totalExecutions++;
            this.stats.totalExecutionTime += Date.now() - startTime;
        }
    }

    /**
     * 获取或创建插件运行时
     * @param {string} pluginId 插件ID
     * @returns {SecurePluginRuntime} 运行时实例
     */
    getOrCreateRuntime(pluginId) {
        if (!this.runtimes.has(pluginId)) {
            const config = PLUGIN_CONFIGS[pluginId] || this.getDefaultConfig();
            const runtime = new SecurePluginRuntime(pluginId, config);
            this.runtimes.set(pluginId, runtime);
        }
        
        return this.runtimes.get(pluginId);
    }

    /**
     * 获取默认配置
     * @returns {Object} 默认配置
     */
    getDefaultConfig() {
        return {
            allowedAPIs: ['log.info', 'time.now'],
            quotas: {
                maxWallTimeMs: 2000,
                maxRequests: 3,
                maxMemoryBytes: 8 * 1024 * 1024
            }
        };
    }

    /**
     * 记录执行历史
     * @param {Object} execution 执行记录
     */
    recordExecution(execution) {
        this.executionHistory.push(execution);
        
        // 保留最近1000条记录
        if (this.executionHistory.length > 1000) {
            this.executionHistory = this.executionHistory.slice(-1000);
        }
    }

    /**
     * 检查插件是否处于熔断状态
     * @param {string} pluginId 插件ID
     * @returns {Promise<boolean>} 是否熔断
     */
    async isPluginCircuitBreaker(pluginId) {
        try {
            const db = getDB();
            const plugin = await db.plugins.get(pluginId);
            
            if (!plugin || !plugin.circuitBreaker) {
                return false;
            }
            
            const now = Date.now();
            const breakerInfo = plugin.circuitBreaker;
            
            // 检查是否还在熔断时间内
            if (breakerInfo.until && now < breakerInfo.until) {
                return true;
            }
            
            // 熔断时间已过，重置状态
            if (breakerInfo.until && now >= breakerInfo.until) {
                await db.plugins.update(pluginId, {
                    circuitBreaker: null
                });
                return false;
            }
            
            return false;
            
        } catch (error) {
            console.error('Failed to check circuit breaker:', error);
            return false;
        }
    }

    /**
     * 评估是否需要熔断插件
     * @param {string} pluginId 插件ID
     */
    async evaluateCircuitBreaker(pluginId) {
        try {
            const recentExecutions = this.executionHistory
                .filter(e => e.pluginId === pluginId)
                .slice(-10); // 最近10次执行
            
            if (recentExecutions.length < 5) {
                return; // 执行次数不足，不进行熔断判断
            }
            
            const failureRate = recentExecutions.filter(e => !e.success).length / recentExecutions.length;
            
            // 失败率超过60%，进行熔断
            if (failureRate > 0.6) {
                const breakerDuration = this.calculateBreakerDuration(pluginId);
                const breakerUntil = Date.now() + breakerDuration;
                
                const db = getDB();
                await db.plugins.update(pluginId, {
                    circuitBreaker: {
                        activatedAt: Date.now(),
                        until: breakerUntil,
                        reason: `High failure rate: ${(failureRate * 100).toFixed(1)}%`,
                        failureCount: recentExecutions.filter(e => !e.success).length
                    }
                });
                
                console.warn(`Plugin ${pluginId} circuit breaker activated until ${new Date(breakerUntil).toLocaleString()}`);
                
                await eventBus.emit('plugin.circuit-breaker.activated', {
                    pluginId,
                    failureRate,
                    until: breakerUntil,
                    timestamp: Date.now()
                });
            }
            
        } catch (error) {
            console.error('Failed to evaluate circuit breaker:', error);
        }
    }

    /**
     * 计算熔断持续时间
     * @param {string} pluginId 插件ID
     * @returns {number} 熔断时间（毫秒）
     */
    calculateBreakerDuration(pluginId) {
        const baseTime = 5 * 60 * 1000; // 基础5分钟
        const previousBreakers = this.executionHistory
            .filter(e => e.pluginId === pluginId && e.circuitBreaker)
            .length;
        
        // 每次熔断时间翻倍，最多1小时
        return Math.min(baseTime * Math.pow(2, previousBreakers), 60 * 60 * 1000);
    }

    /**
     * 处理插件错误
     * @param {Object} errorData 错误数据
     */
    async handlePluginError(errorData) {
        const { pluginId, error, context } = errorData;
        
        try {
            const db = getDB();
            const plugin = await db.plugins.get(pluginId);
            
            if (plugin) {
                const errorRecord = {
                    message: error,
                    timestamp: Date.now(),
                    context
                };
                
                const updatedErrors = [...(plugin.errors || []), errorRecord].slice(-50); // 保留最近50个错误
                
                await db.plugins.update(pluginId, {
                    errors: updatedErrors,
                    lastError: errorRecord
                });
            }
            
        } catch (e) {
            console.error('Failed to record plugin error:', e);
        }
    }

    /**
     * 记录API调用
     * @param {Object} callData API调用数据
     */
    recordAPICall(callData) {
        // 这里可以添加API调用的统计逻辑
        // 目前只是记录到控制台
        if (callData.success) {
            console.log(`Plugin ${callData.pluginId} successfully called ${callData.apiName}`);
        }
    }

    /**
     * 清理过期的运行时
     */
    cleanupExpiredRuntimes() {
        const now = Date.now();
        const maxIdleTime = 10 * 60 * 1000; // 10分钟无活动则清理
        
        for (const [pluginId, runtime] of this.runtimes.entries()) {
            if (!runtime.isRunning && (now - runtime.lastActivity) > maxIdleTime) {
                runtime.cleanup();
                this.runtimes.delete(pluginId);
                console.log(`Cleaned up idle runtime for plugin: ${pluginId}`);
            }
        }
    }

    /**
     * 获取插件管理器统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        const runtimeStats = {};
        for (const [pluginId, runtime] of this.runtimes.entries()) {
            runtimeStats[pluginId] = runtime.getStats();
        }
        
        return {
            global: this.stats,
            runtimes: runtimeStats,
            executionHistory: this.executionHistory.slice(-50), // 最近50条
            activeRuntimes: this.runtimes.size
        };
    }

    /**
     * 重置插件的熔断状态
     * @param {string} pluginId 插件ID
     * @returns {Promise<boolean>} 是否成功
     */
    async resetCircuitBreaker(pluginId) {
        try {
            const db = getDB();
            await db.plugins.update(pluginId, {
                circuitBreaker: null
            });
            
            console.log(`Circuit breaker reset for plugin: ${pluginId}`);
            
            await eventBus.emit('plugin.circuit-breaker.reset', {
                pluginId,
                timestamp: Date.now()
            });
            
            return true;
            
        } catch (error) {
            console.error('Failed to reset circuit breaker:', error);
            return false;
        }
    }

    /**
     * 重置插件配额
     * @param {string} pluginId 插件ID
     * @returns {boolean} 是否成功
     */
    resetPluginQuotas(pluginId) {
        const runtime = this.runtimes.get(pluginId);
        if (runtime) {
            runtime.apiProxy.resetQuotas();
            return true;
        }
        return false;
    }

    /**
     * 终止所有运行中的插件
     */
    abortAllPlugins() {
        for (const [pluginId, runtime] of this.runtimes.entries()) {
            if (runtime.isRunning) {
                runtime.abort();
                console.log(`Aborted running plugin: ${pluginId}`);
            }
        }
    }

    /**
     * 清理所有资源
     */
    cleanup() {
        this.abortAllPlugins();
        
        for (const runtime of this.runtimes.values()) {
            runtime.cleanup();
        }
        
        this.runtimes.clear();
        this.executionHistory = [];
    }
}

// 创建全局插件管理器实例
export const pluginManager = new SecurePluginManager();