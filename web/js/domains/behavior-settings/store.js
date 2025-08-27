/**
 * 行为设置数据存储
 * 
 * 功能概述：
 * - 行为参数配置管理
 * - 行为统计数据查询
 * - 行为测试和调试功能
 * 
 * @fileoverview 行为设置存储，遵循Store-View模式和SOLID原则
 */

import { getDB } from '../../core/db.js';
import { eventBus, EventTypes } from '../../core/event-bus.js';
import { createSuccessResponse, createErrorResponse, ServiceErrorTypes } from '../../services/contracts.js';
import { validateRequired, validateRange } from '../../utils/validation.js';

/**
 * 临时数字验证函数，用于替代缺失的validateNumber
 * @param {*} value 要验证的值
 * @param {string} fieldName 字段名
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {Object} 验证结果
 */
function validateNumber(value, fieldName, min = -Infinity, max = Infinity) {
    const rangeResult = validateRange(value, min, max);
    return {
        isValid: rangeResult.valid,
        error: rangeResult.error || `${fieldName}必须是有效数字`
    };
}

/**
 * 行为设置存储类
 */
class BehaviorSettingsStore {
    constructor() {
        this.behaviorService = null;
        this.isInitialized = false;
        this.currentConfig = null;
        this.configCache = new Map();
    }

    /**
     * 初始化行为设置存储
     * @returns {Promise<ServiceResponse>}
     */
    async initialize() {
        try {
            // 动态导入行为服务
            const { behaviorService } = await import('../../services/behavior.js');
            this.behaviorService = behaviorService;
            
            // 初始化行为服务
            const initResult = await this.behaviorService.initialize();
            if (!initResult.success) {
                throw new Error(initResult.message);
            }
            
            // 加载当前配置
            await this.loadCurrentConfig();
            
            this.isInitialized = true;
            return createSuccessResponse(null, '行为设置存储初始化成功');
            
        } catch (error) {
            console.error('Behavior settings store initialization failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 加载当前行为配置
     * @param {string} roleId 角色ID
     * @returns {Promise<ServiceResponse>}
     */
    async loadBehaviorConfig(roleId = 'default') {
        try {
            if (!this.behaviorService) {
                throw new Error('Behavior service not initialized');
            }

            const result = await this.behaviorService.getBehaviorConfig(roleId);
            
            if (result.success) {
                this.currentConfig = result.data;
                this.configCache.set(roleId, result.data);
            }
            
            return result;
            
        } catch (error) {
            console.error('Load behavior config failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 保存行为配置
     * @param {Object} config 配置对象
     * @param {string} roleId 角色ID
     * @returns {Promise<ServiceResponse>}
     */
    async saveBehaviorConfig(config, roleId = 'default') {
        try {
            // 验证配置数据
            const validationResult = this.validateBehaviorConfig(config);
            if (!validationResult.success) {
                return validationResult;
            }

            if (!this.behaviorService) {
                throw new Error('Behavior service not initialized');
            }

            const result = await this.behaviorService.updateBehaviorConfig(roleId, config);
            
            if (result.success) {
                this.currentConfig = result.data;
                this.configCache.set(roleId, result.data);
                
                // 发送配置更新事件
                await eventBus.emit('behavior-settings.config-updated', {
                    roleId,
                    config: result.data,
                    timestamp: Date.now()
                });
            }
            
            return result;
            
        } catch (error) {
            console.error('Save behavior config failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 获取行为统计数据
     * @param {string} roleId 角色ID
     * @param {Object} timeRange 时间范围
     * @returns {Promise<ServiceResponse>}
     */
    async getBehaviorStats(roleId = 'default', timeRange = {}) {
        try {
            if (!this.behaviorService) {
                throw new Error('Behavior service not initialized');
            }

            const result = await this.behaviorService.getBehaviorStats(roleId, timeRange);
            return result;
            
        } catch (error) {
            console.error('Get behavior stats failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 测试行为评分
     * @param {string} roleId 角色ID
     * @param {Object} testContext 测试上下文
     * @returns {Promise<ServiceResponse>}
     */
    async testBehaviorScore(roleId = 'default', testContext = {}) {
        try {
            if (!this.behaviorService) {
                throw new Error('Behavior service not initialized');
            }

            const context = {
                roleId,
                chatId: testContext.chatId || roleId,
                timeWindow: testContext.timeWindow || 4 * 60 * 60 * 1000,
                keywords: testContext.keywords || ['测试', '对话', '互动'],
                userActivityLevel: testContext.userActivityLevel || 'medium',
                userMood: testContext.userMood || 'neutral',
                ...testContext
            };

            const result = await this.behaviorService.calculateBehaviorScore(roleId, context);
            
            if (result.success) {
                // 发送测试完成事件
                await eventBus.emit('behavior-settings.score-tested', {
                    roleId,
                    context,
                    result: result.data,
                    timestamp: Date.now()
                });
            }
            
            return result;
            
        } catch (error) {
            console.error('Test behavior score failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 测试行为概率
     * @param {string} actionType 行为类型
     * @param {Object} testContext 测试上下文
     * @returns {Promise<ServiceResponse>}
     */
    async testActionProbability(actionType, testContext = {}) {
        try {
            if (!this.behaviorService) {
                throw new Error('Behavior service not initialized');
            }

            const context = {
                roleId: testContext.roleId || 'default',
                behaviorScore: testContext.behaviorScore || 0.7,
                userActivityLevel: testContext.userActivityLevel || 'medium',
                keywords: testContext.keywords || [],
                ...testContext
            };

            const result = await this.behaviorService.assessActionProbability(actionType, context);
            
            if (result.success) {
                // 发送概率测试完成事件
                await eventBus.emit('behavior-settings.probability-tested', {
                    actionType,
                    context,
                    result: result.data,
                    timestamp: Date.now()
                });
            }
            
            return result;
            
        } catch (error) {
            console.error('Test action probability failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 重置行为配置到默认值
     * @param {string} roleId 角色ID
     * @returns {Promise<ServiceResponse>}
     */
    async resetBehaviorConfig(roleId = 'default') {
        try {
            const db = getDB();
            
            // 删除角色特定配置
            await db.globalSettings.where('id').equals(`behavior_config_${roleId}`).delete();
            
            // 清除缓存
            this.configCache.delete(roleId);
            this.currentConfig = null;
            
            // 重新加载默认配置
            const result = await this.loadBehaviorConfig(roleId);
            
            if (result.success) {
                // 发送重置事件
                await eventBus.emit('behavior-settings.config-reset', {
                    roleId,
                    timestamp: Date.now()
                });
            }
            
            return createSuccessResponse(result.data, '行为配置已重置到默认值');
            
        } catch (error) {
            console.error('Reset behavior config failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 获取行为类型列表
     * @returns {Array} 行为类型列表
     */
    getBehaviorActionTypes() {
        return [
            {
                id: 'chat_reply',
                name: '聊天回复',
                description: '在聊天中回复消息的行为',
                category: 'communication'
            },
            {
                id: 'moment_post',
                name: '朋友圈发布',
                description: '主动发布朋友圈动态',
                category: 'social'
            },
            {
                id: 'moment_comment',
                name: '朋友圈评论',
                description: '对朋友圈动态进行评论',
                category: 'social'
            },
            {
                id: 'moment_like',
                name: '朋友圈点赞',
                description: '对朋友圈动态点赞',
                category: 'social'
            },
            {
                id: 'proactive_chat',
                name: '主动聊天',
                description: '主动发起聊天对话',
                category: 'communication'
            },
            {
                id: 'memory_formation',
                name: '记忆形成',
                description: '从对话中提取记忆',
                category: 'learning'
            }
        ];
    }

    /**
     * 获取行为频率档位选项
     * @returns {Array} 频率档位列表
     */
    getFrequencyLevels() {
        return [
            { value: 0.1, label: '极低', description: '很少触发行为' },
            { value: 0.3, label: '低', description: '较少触发行为' },
            { value: 0.5, label: '中等', description: '正常频率' },
            { value: 1.0, label: '标准', description: '标准频率' },
            { value: 1.5, label: '高', description: '较频繁触发' },
            { value: 2.0, label: '极高', description: '非常频繁' }
        ];
    }

    /**
     * 获取冷却时间选项
     * @returns {Array} 冷却时间列表
     */
    getCooldownOptions() {
        return [
            { value: 5 * 60 * 1000, label: '5分钟', category: 'short' },
            { value: 15 * 60 * 1000, label: '15分钟', category: 'short' },
            { value: 30 * 60 * 1000, label: '30分钟', category: 'medium' },
            { value: 60 * 60 * 1000, label: '1小时', category: 'medium' },
            { value: 2 * 60 * 60 * 1000, label: '2小时', category: 'long' },
            { value: 4 * 60 * 60 * 1000, label: '4小时', category: 'long' },
            { value: 8 * 60 * 60 * 1000, label: '8小时', category: 'very-long' },
            { value: 24 * 60 * 60 * 1000, label: '24小时', category: 'very-long' }
        ];
    }

    /**
     * 验证行为配置
     * @param {Object} config 配置对象
     * @returns {ServiceResponse} 验证结果
     * @private
     */
    validateBehaviorConfig(config) {
        try {
            const errors = [];

            // 验证基本结构
            if (!config || typeof config !== 'object') {
                return createErrorResponse('配置对象无效', ServiceErrorTypes.VALIDATION_ERROR);
            }

            // 验证enabled字段
            if (config.hasOwnProperty('enabled')) {
                if (typeof config.enabled !== 'boolean') {
                    errors.push('enabled: 必须是布尔值（true/false）');
                }
            }

            // 验证frequencies字段
            if (config.frequencies) {
                const freqFields = ['chatReply', 'momentActivity', 'proactiveChat'];
                freqFields.forEach(field => {
                    if (config.frequencies[field] !== undefined) {
                        const validation = validateNumber(config.frequencies[field], field, 0.1, 5.0);
                        if (!validation.isValid) {
                            errors.push(`frequencies.${field}: ${validation.error}`);
                        }
                    }
                });
            }

            // 验证cooldowns字段
            if (config.cooldowns) {
                Object.keys(config.cooldowns).forEach(actionType => {
                    const cooldown = config.cooldowns[actionType];
                    const validation = validateNumber(cooldown, `cooldowns.${actionType}`, 1000, 24 * 60 * 60 * 1000);
                    if (!validation.isValid) {
                        errors.push(`cooldowns.${actionType}: ${validation.error}`);
                    }
                });
            }

            // 验证scoreWeights字段
            if (config.scoreWeights) {
                const weightFields = ['interactionFrequency', 'timeSinceLastAction', 'contextRelevance', 'userActivity'];
                weightFields.forEach(field => {
                    if (config.scoreWeights[field] !== undefined) {
                        const validation = validateNumber(config.scoreWeights[field], field, 0.0, 1.0);
                        if (!validation.isValid) {
                            errors.push(`scoreWeights.${field}: ${validation.error}`);
                        }
                    }
                });
            }

            // 验证probabilityThresholds字段
            if (config.probabilityThresholds) {
                Object.keys(config.probabilityThresholds).forEach(actionType => {
                    const threshold = config.probabilityThresholds[actionType];
                    const validation = validateNumber(threshold, `probabilityThresholds.${actionType}`, 0.0, 1.0);
                    if (!validation.isValid) {
                        errors.push(`probabilityThresholds.${actionType}: ${validation.error}`);
                    }
                });
            }

            if (errors.length > 0) {
                return createErrorResponse(
                    `配置验证失败: ${errors.join(', ')}`,
                    ServiceErrorTypes.VALIDATION_ERROR,
                    { validationErrors: errors }
                );
            }

            return createSuccessResponse(config, '配置验证通过');
            
        } catch (error) {
            console.error('Config validation failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 加载当前配置
     * @private
     */
    async loadCurrentConfig() {
        const result = await this.loadBehaviorConfig('default');
        if (result.success) {
            this.currentConfig = result.data;
        }
    }

    /**
     * 获取当前配置
     * @returns {Object|null} 当前配置
     */
    getCurrentConfig() {
        return this.currentConfig;
    }

    /**
     * 清除配置缓存
     * @param {string} roleId 角色ID，不传则清除所有缓存
     */
    clearConfigCache(roleId = null) {
        if (roleId) {
            this.configCache.delete(roleId);
        } else {
            this.configCache.clear();
        }
    }
}

// 创建全局行为设置存储实例
export const behaviorSettingsStore = new BehaviorSettingsStore();

// 导出类供测试使用
export { BehaviorSettingsStore };