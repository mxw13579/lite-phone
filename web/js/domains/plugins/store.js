/**
 * 插件管理存储层
 * 负责插件数据的 CRUD 操作、状态管理和错误处理
 */

import { getDB } from '../../core/db.js';
import { formatDate } from '../../utils/format.js';

/**
 * 确保默认插件存在
 * @returns {Promise<void>}
 */
export async function ensureDefaultPlugins() {
    try {
        const db = getDB();
        if (!db) return;

        // 检查是否已存在插件
        const existingPlugins = await db.plugins.count();
        if (existingPlugins > 0) {
            console.log('Default plugins already exist');
            return;
        }

        // 创建默认插件
        const defaultPlugins = [
            {
                id: 'plugin_memory_manager',
                name: '记忆管理器',
                description: '自动管理和优化AI的记忆存储，定期清理冗余记忆，提供完整的记忆管理功能',
                version: '1.0.0',
                enabled: true,
                errors: 0,
                maxErrors: 5,
                configSnapshot: {
                    autoClean: true,
                    maxMemories: 1000,
                    cleanInterval: 7, // 天
                    enableCompression: true,
                    backupBeforeClean: true
                },
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
            },
            {
                id: 'plugin_moment_generator',
                name: '朋友圈动态生成器',
                description: '根据聊天内容和用户行为自动生成朋友圈动态',
                version: '1.0.0',
                enabled: true,
                errors: 0,
                maxErrors: 3,
                configSnapshot: {
                    autoGenerate: false,
                    generateInterval: 24, // 小时
                    contentTypes: ['mood', 'activity', 'thought']
                },
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
            },
            {
                id: 'plugin_smart_reply',
                name: '智能回复增强',
                description: '基于上下文和用户偏好优化AI回复质量',
                version: '1.0.0',
                enabled: false,
                errors: 0,
                maxErrors: 10,
                configSnapshot: {
                    enableContextAnalysis: true,
                    enableSentimentAnalysis: false,
                    replyToneAdjustment: 'auto'
                },
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
            },
            {
                id: 'plugin_notification_manager',
                name: '通知管理器',
                description: '智能管理系统通知，避免打扰并优化提醒时机',
                version: '1.0.0',
                enabled: true,
                errors: 0,
                maxErrors: 5,
                configSnapshot: {
                    quietHours: {
                        enabled: true,
                        start: '22:00',
                        end: '08:00'
                    },
                    priority: 'medium',
                    groupByType: true
                },
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
            }
        ];

        await db.plugins.bulkAdd(defaultPlugins);
        console.log('Default plugins created successfully');

    } catch (error) {
        console.error('Failed to create default plugins:', error);
        throw error;
    }
}

/**
 * 获取所有插件
 * @returns {Promise<Array>} 插件列表
 */
export async function getAllPlugins() {
    try {
        const db = getDB();
        if (!db) return [];

        const plugins = await db.plugins.orderBy('name').toArray();
        return plugins.map(plugin => ({
            ...plugin,
            hasErrors: plugin.errors > 0,
            isDisabled: plugin.errors >= plugin.maxErrors,
            formattedUpdatedAt: formatDate(plugin.updatedAt, 'MM-DD HH:mm')
        }));

    } catch (error) {
        console.error('Failed to get plugins:', error);
        return [];
    }
}

/**
 * 获取插件统计信息
 * @returns {Promise<Object>} 统计信息
 */
export async function getPluginStats() {
    try {
        const db = getDB();
        if (!db) {
            return { total: 0, enabled: 0, disabled: 0, withErrors: 0 };
        }

        const plugins = await db.plugins.toArray();
        
        return {
            total: plugins.length,
            enabled: plugins.filter(p => p.enabled).length,
            disabled: plugins.filter(p => !p.enabled).length,
            withErrors: plugins.filter(p => p.errors > 0).length
        };

    } catch (error) {
        console.error('Failed to get plugin stats:', error);
        return { total: 0, enabled: 0, disabled: 0, withErrors: 0 };
    }
}

/**
 * 切换插件启用状态
 * @param {string} pluginId 插件ID
 * @returns {Promise<Object>} 操作结果
 */
export async function togglePluginStatus(pluginId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const plugin = await db.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }

        // 检查是否因错误过多而被禁用
        if (plugin.errors >= plugin.maxErrors) {
            throw new Error('插件错误次数过多，请先重置错误计数');
        }

        const newEnabled = !plugin.enabled;
        await db.plugins.update(pluginId, {
            enabled: newEnabled,
            updatedAt: new Date().toISOString()
        });

        return {
            success: true,
            enabled: newEnabled,
            message: `插件已${newEnabled ? '启用' : '禁用'}`
        };

    } catch (error) {
        console.error('Failed to toggle plugin status:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 更新插件配置
 * @param {string} pluginId 插件ID
 * @param {Object} config 新配置
 * @returns {Promise<Object>} 操作结果
 */
export async function updatePluginConfig(pluginId, config) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const plugin = await db.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }

        const newConfig = { ...plugin.configSnapshot, ...config };
        await db.plugins.update(pluginId, {
            configSnapshot: newConfig,
            updatedAt: new Date().toISOString()
        });

        return {
            success: true,
            config: newConfig,
            message: '插件配置已更新'
        };

    } catch (error) {
        console.error('Failed to update plugin config:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 记录插件错误
 * @param {string} pluginId 插件ID
 * @param {string} errorMessage 错误信息
 * @returns {Promise<Object>} 操作结果
 */
export async function recordPluginError(pluginId, errorMessage) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const plugin = await db.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }

        const newErrorCount = plugin.errors + 1;
        const shouldDisable = newErrorCount >= plugin.maxErrors;

        await db.plugins.update(pluginId, {
            errors: newErrorCount,
            enabled: shouldDisable ? false : plugin.enabled,
            lastError: {
                message: errorMessage,
                timestamp: new Date().toISOString()
            },
            updatedAt: new Date().toISOString()
        });

        return {
            success: true,
            errorCount: newErrorCount,
            disabled: shouldDisable,
            message: shouldDisable ? '插件因错误过多已自动禁用' : '错误已记录'
        };

    } catch (error) {
        console.error('Failed to record plugin error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 重置插件错误计数
 * @param {string} pluginId 插件ID
 * @returns {Promise<Object>} 操作结果
 */
export async function resetPluginErrors(pluginId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const plugin = await db.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }

        await db.plugins.update(pluginId, {
            errors: 0,
            lastError: null,
            updatedAt: new Date().toISOString()
        });

        return {
            success: true,
            message: '错误计数已重置'
        };

    } catch (error) {
        console.error('Failed to reset plugin errors:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 获取特定插件详情
 * @param {string} pluginId 插件ID
 * @returns {Promise<Object|null>} 插件详情
 */
export async function getPluginDetail(pluginId) {
    try {
        const db = getDB();
        if (!db) return null;

        const plugin = await db.plugins.get(pluginId);
        if (!plugin) return null;

        return {
            ...plugin,
            hasErrors: plugin.errors > 0,
            isDisabled: plugin.errors >= plugin.maxErrors,
            formattedUpdatedAt: formatDate(plugin.updatedAt, 'YYYY-MM-DD HH:mm:ss'),
            formattedCreatedAt: formatDate(plugin.createdAt, 'YYYY-MM-DD HH:mm:ss'),
            errorRate: plugin.maxErrors > 0 ? (plugin.errors / plugin.maxErrors * 100).toFixed(1) : 0
        };

    } catch (error) {
        console.error('Failed to get plugin detail:', error);
        return null;
    }
}

/**
 * 删除插件
 * @param {string} pluginId 插件ID
 * @returns {Promise<Object>} 操作结果
 */
export async function deletePlugin(pluginId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const plugin = await db.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }

        await db.plugins.delete(pluginId);

        return {
            success: true,
            message: '插件已删除'
        };

    } catch (error) {
        console.error('Failed to delete plugin:', error);
        return {
            success: false,
            error: error.message
        };
    }
}