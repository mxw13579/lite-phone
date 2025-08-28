/**
 * 简化的插件管理器
 * 专门为内置插件设计，去除了复杂的沙箱和配额系统
 */

import { eventBus, EventTypes } from '../../core/event-bus.js';
import { getDB } from '../../core/db.js';

/**
 * 内置插件定义
 */
const BUILTIN_PLUGINS = {
    'memory-manager': {
        name: '记忆管理器',
        description: '自动管理和优化AI的记忆存储',
        execute: async (input) => {
            // 记忆管理逻辑
            return {
                success: true,
                message: '记忆管理完成',
                data: input
            };
        }
    },
    'moment-generator': {
        name: '朋友圈动态生成器',
        description: '根据聊天内容自动生成朋友圈动态',
        execute: async (input) => {
            // 动态生成逻辑
            return {
                success: true,
                message: '动态生成完成',
                data: input
            };
        }
    },
    'smart-reply': {
        name: '智能回复增强',
        description: '基于上下文优化AI回复质量',
        execute: async (input) => {
            // 智能回复逻辑
            return {
                success: true,
                message: '回复优化完成',
                data: input
            };
        }
    },
    'notification-manager': {
        name: '通知管理器',
        description: '智能管理系统通知',
        execute: async (input) => {
            // 通知管理逻辑
            return {
                success: true,
                message: '通知管理完成',
                data: input
            };
        }
    }
};

/**
 * 简化插件管理器
 */
export class PluginManager {
    constructor() {
        this.stats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalExecutionTime: 0,
            lastReset: Date.now()
        };
        
        this.executionHistory = [];
        this.initializeEventHandlers();
    }

    /**
     * 初始化事件处理器
     */
    initializeEventHandlers() {
        // 清理历史记录
        setInterval(() => {
            this.cleanupExecutionHistory();
        }, 300000); // 每5分钟清理一次
    }

    /**
     * 执行内置插件
     * @param {string} pluginId 插件ID
     * @param {any} input 输入参数
     * @returns {Promise<Object>} 执行结果
     */
    async executePlugin(pluginId, input = null) {
        const startTime = Date.now();
        this.stats.totalExecutions++;

        try {
            // 检查插件是否存在
            const plugin = BUILTIN_PLUGINS[pluginId];
            if (!plugin) {
                throw new Error(`Plugin not found: ${pluginId}`);
            }

            // 检查插件是否启用
            const db = getDB();
            const pluginConfig = await db?.plugins?.where('id').equals(`plugin_${pluginId.replace('-', '_')}`).first();
            
            if (pluginConfig && !pluginConfig.enabled) {
                throw new Error(`Plugin disabled: ${pluginId}`);
            }

            // 执行插件
            console.log(`Executing plugin: ${pluginId}`);
            const result = await plugin.execute(input);

            // 记录成功执行
            const executionTime = Date.now() - startTime;
            this.stats.successfulExecutions++;
            this.stats.totalExecutionTime += executionTime;

            // 记录执行历史
            this.executionHistory.push({
                pluginId,
                timestamp: startTime,
                executionTime,
                success: true,
                input: typeof input === 'object' ? JSON.stringify(input).substring(0, 100) : String(input).substring(0, 100)
            });

            // 发送成功事件
            eventBus.emit(EventTypes.PLUGIN_EXECUTION_SUCCESS, {
                pluginId,
                executionTime,
                result
            });

            return {
                success: true,
                data: result,
                executionTime,
                pluginId
            };

        } catch (error) {
            // 记录失败执行
            const executionTime = Date.now() - startTime;
            this.stats.failedExecutions++;

            // 记录执行历史
            this.executionHistory.push({
                pluginId,
                timestamp: startTime,
                executionTime,
                success: false,
                error: error.message,
                input: typeof input === 'object' ? JSON.stringify(input).substring(0, 100) : String(input).substring(0, 100)
            });

            // 发送错误事件
            eventBus.emit(EventTypes.PLUGIN_EXECUTION_ERROR, {
                pluginId,
                error: error.message,
                executionTime
            });

            console.error(`Plugin execution failed: ${pluginId}`, error);

            return {
                success: false,
                error: error.message,
                executionTime,
                pluginId
            };
        }
    }

    /**
     * 获取插件列表
     * @returns {Array} 插件列表
     */
    getAvailablePlugins() {
        return Object.entries(BUILTIN_PLUGINS).map(([id, plugin]) => ({
            id,
            name: plugin.name,
            description: plugin.description,
            builtin: true
        }));
    }

    /**
     * 获取执行统计
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            ...this.stats,
            averageExecutionTime: this.stats.successfulExecutions > 0 
                ? this.stats.totalExecutionTime / this.stats.successfulExecutions 
                : 0,
            successRate: this.stats.totalExecutions > 0 
                ? this.stats.successfulExecutions / this.stats.totalExecutions 
                : 0,
            recentExecutions: this.executionHistory.slice(-10)
        };
    }

    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            totalExecutionTime: 0,
            lastReset: Date.now()
        };
        this.executionHistory = [];
    }

    /**
     * 清理执行历史
     */
    cleanupExecutionHistory() {
        // 保留最近100条记录
        if (this.executionHistory.length > 100) {
            this.executionHistory = this.executionHistory.slice(-100);
        }
    }

    /**
     * 获取插件执行历史
     * @param {string} pluginId 插件ID（可选）
     * @param {number} limit 限制条数（默认20）
     * @returns {Array} 执行历史
     */
    getExecutionHistory(pluginId = null, limit = 20) {
        let history = [...this.executionHistory];
        
        if (pluginId) {
            history = history.filter(record => record.pluginId === pluginId);
        }
        
        return history
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }
}

// 导出全局实例
export const pluginManager = new PluginManager();