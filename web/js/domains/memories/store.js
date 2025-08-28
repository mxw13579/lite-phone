/**
 * 记忆管理数据存储
 * 
 * 功能概述：
 * - 记忆数据的本地存储管理
 * - 记忆设置的持久化
 * - 记忆统计数据缓存
 * 
 * @fileoverview 记忆管理数据存储，实现SOLID原则和标准契约
 */

import { getDB } from '../../core/db.js';
import { eventBus, EventTypes } from '../../core/event-bus.js';
import { createSuccessResponse, createErrorResponse, ServiceErrorTypes } from '../../services/contracts.js';
import { memoryService } from '../../services/memory.js';
import { AsyncOp, DatabaseOp, FormOp, Logger } from '../../utils/common-patterns.js';

/**
 * 记忆管理存储类
 * 负责记忆管理界面的数据存储和状态管理
 */
class MemoryStore {
    constructor() {
        this.currentFilter = 'all';
        this.currentMemories = [];
        this.memoryStats = null;
        this.settings = null;
        this.isLoading = false;
    }

    /**
     * 初始化记忆存储
     * @returns {Promise<ServiceResponse>}
     */
    async initialize() {
        return await AsyncOp.execute(async () => {
            // 加载记忆设置
            await this.loadMemorySettings();
            
            // 注册事件监听
            this.registerEventListeners();
            
            Logger.info('MemoryStore', '记忆存储初始化成功');
            
            // 🔧 修复：显式返回成功响应
            return { success: true, message: '记忆存储初始化成功' };
        }, {
            operationName: 'Initialize Memory Store',
            logError: true,
            showUserError: false
        }).then(response => {
            if (response.success) {
                return createSuccessResponse(null, '记忆存储初始化成功');
            } else {
                return createErrorResponse(response.error, ServiceErrorTypes.INTERNAL_ERROR);
            }
        });
    }

    /**
     * 注册事件监听器
     * @private
     */
    registerEventListeners() {
        // 监听记忆形成事件，更新统计数据
        eventBus.on(EventTypes.MEMORY_FORMED, async () => {
            await this.refreshMemoryStats();
        });

        // 监听记忆压缩事件，刷新数据
        eventBus.on('memory.compressed', async () => {
            await this.refreshCurrentMemories();
            await this.refreshMemoryStats();
        });
    }

    /**
     * 加载记忆设置
     * @returns {Promise<ServiceResponse>}
     */
    async loadMemorySettings() {
        const response = await DatabaseOp.read(async (db) => {
            let settings = await db.globalSettings.get('memory_settings');
            
            if (!settings) {
                // 创建默认设置
                settings = {
                    id: 'memory_settings',
                    enabled: true,
                    maxMemoriesPerRole: 1000,
                    importanceThreshold: 0.3,
                    autoCompressionEnabled: true,
                    compressionTimeWindow: 30,
                    similarityThreshold: 0.7,
                    tokenBudget: 10000,
                    tokenRatio: 0.3,
                    maxMemoriesPerContext: 20,
                    injectionPreviewEnabled: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                // 保存默认设置
                await DatabaseOp.write(async (db) => {
                    return await db.globalSettings.add(settings);
                }, {
                    operationName: 'Save Default Memory Settings',
                    tables: ['globalSettings']
                });
            }
            
            this.settings = settings;
            return settings;
        }, {
            operationName: 'Load Memory Settings'
        });
        
        if (response.success) {
            return createSuccessResponse(response.data, '记忆设置加载成功');
        } else {
            return createErrorResponse(response.error, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 保存记忆设置
     * @param {Object} newSettings 新设置
     * @returns {Promise<ServiceResponse>}
     */
    async saveMemorySettings(newSettings) {
        const response = await DatabaseOp.write(async (db) => {
            const updatedSettings = {
                ...this.settings,
                ...newSettings,
                updatedAt: new Date().toISOString()
            };
            
            await db.globalSettings.put(updatedSettings);
            this.settings = updatedSettings;
            
            // 发送设置更新事件
            await eventBus.emit('memory.settings-updated', updatedSettings);
            
            return updatedSettings;
        }, {
            operationName: 'Save Memory Settings',
            tables: ['globalSettings']
        });
        
        if (response.success) {
            return createSuccessResponse(response.data, '记忆设置保存成功');
        } else {
            return createErrorResponse(response.error, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 获取记忆统计数据
     * @param {string} roleId 角色ID（可选，为空则获取全局统计）
     * @returns {Promise<ServiceResponse>}
     */
    async getMemoryStats(roleId = null) {
        return await DatabaseOp.read(async (db) => {
            let query = db.memories;
            if (roleId) {
                query = query.where('roleId').equals(roleId);
            }
            
            const memories = await query.toArray();
            
            const stats = {
                total: memories.length,
                byType: {
                    semantic: 0,
                    episodic: 0,
                    social: 0,
                    general: 0
                },
                byImportance: {
                    high: 0,      // > 0.7
                    medium: 0,    // 0.4-0.7
                    low: 0        // < 0.4
                },
                avgImportance: 0,
                recentCount: 0, // 最近7天
                compressionInfo: {
                    lastCompression: null,
                    totalCompressed: 0
                }
            };
            
            let totalImportance = 0;
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            
            // 统计分析
            memories.forEach(memory => {
                // 按类型统计
                if (stats.byType.hasOwnProperty(memory.type)) {
                    stats.byType[memory.type]++;
                }
                
                // 按重要性统计
                if (memory.importance > 0.7) {
                    stats.byImportance.high++;
                } else if (memory.importance > 0.4) {
                    stats.byImportance.medium++;
                } else {
                    stats.byImportance.low++;
                }
                
                totalImportance += memory.importance;
                
                // 最近记忆统计
                const memoryDate = new Date(memory.createdAt);
                if (memoryDate > weekAgo) {
                    stats.recentCount++;
                }
            });
            
            stats.avgImportance = memories.length > 0 ? 
                (totalImportance / memories.length) : 0;
            
            // 获取压缩历史信息
            const globalSettings = await db.globalSettings.get('main');
            if (globalSettings && globalSettings.compressionHistory) {
                const recentCompression = globalSettings.compressionHistory[0];
                if (recentCompression) {
                    stats.compressionInfo.lastCompression = recentCompression.timestamp;
                    stats.compressionInfo.totalCompressed = 
                        globalSettings.compressionHistory.reduce(
                            (sum, record) => sum + (record.result?.compressed || 0), 0
                        );
                }
            }
            
            this.memoryStats = stats;
            return stats;
        }, {
            operationName: 'Get Memory Stats'
        }).then(response => {
            if (response.success) {
                return createSuccessResponse(response.data, '记忆统计获取成功');
            } else {
                return createErrorResponse(response.error, ServiceErrorTypes.INTERNAL_ERROR);
            }
        });
    }

    /**
     * 获取记忆列表
     * @param {Object} options 查询选项
     * @returns {Promise<ServiceResponse>}
     */
    async getMemoryList(options = {}) {
        return await AsyncOp.execute(async () => {
            this.isLoading = true;
            
            const {
                roleId = null,
                type = 'all',
                limit = 50,
                offset = 0,
                sortBy = 'createdAt',
                sortOrder = 'desc'
            } = options;
            
            const response = await memoryService.searchRelevantMemories('', {
                roleId,
                type: type === 'all' ? null : type,
                limit,
                offset
            });
            
            if (response.success === false) {
                throw new Error(response.error || 'Failed to search memories');
            }
            
            let memories = response.data.memories || [];
            
            // 排序处理
            memories.sort((a, b) => {
                const aValue = a[sortBy];
                const bValue = b[sortBy];
                
                if (sortOrder === 'desc') {
                    return bValue > aValue ? 1 : -1;
                } else {
                    return aValue > bValue ? 1 : -1;
                }
            });
            
            this.currentMemories = memories;
            this.currentFilter = type;
            
            return {
                memories,
                total: response.data.total,
                currentFilter: type
            };
        }, {
            operationName: 'Get Memory List',
            logError: true,
            showUserError: false,
            onFinally: () => {
                this.isLoading = false;
            }
        }).then(response => {
            if (response.success) {
                return createSuccessResponse(response.data, '记忆列表获取成功');
            } else {
                return createErrorResponse(response.error, ServiceErrorTypes.INTERNAL_ERROR);
            }
        });
    }

    /**
     * 获取单个记忆详情
     * @param {string} memoryId 记忆ID
     * @returns {Promise<ServiceResponse>}
     */
    async getMemoryDetail(memoryId) {
        try {
            const db = getDB();
            const memory = await db.memories.get(memoryId);
            
            if (!memory) {
                return createErrorResponse('记忆不存在', ServiceErrorTypes.NOT_FOUND);
            }
            
            // 获取关联聊天信息
            let chatInfo = null;
            if (memory.chatId) {
                const chat = await db.chats.get(memory.chatId);
                if (chat) {
                    chatInfo = {
                        id: chat.id,
                        name: chat.name || '未命名聊天',
                        isGroup: chat.isGroup
                    };
                }
            }
            
            const detailData = {
                ...memory,
                chatInfo,
                formattedCreatedAt: new Date(memory.createdAt).toLocaleString('zh-CN'),
                importanceLevel: this.getImportanceLevel(memory.importance),
                typeDisplayName: this.getTypeDisplayName(memory.type)
            };
            
            return createSuccessResponse(detailData, '记忆详情获取成功');
            
        } catch (error) {
            console.error('Get memory detail failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 删除记忆
     * @param {string} memoryId 记忆ID
     * @returns {Promise<ServiceResponse>}
     */
    async deleteMemory(memoryId) {
        try {
            const db = getDB();
            const deletedCount = await db.memories.delete(memoryId);
            
            if (deletedCount === 0) {
                return createErrorResponse('记忆不存在', ServiceErrorTypes.NOT_FOUND);
            }
            
            // 刷新当前列表
            await this.refreshCurrentMemories();
            await this.refreshMemoryStats();
            
            // 发送删除事件
            await eventBus.emit('memory.deleted', { memoryId });
            
            return createSuccessResponse({ deletedCount }, '记忆删除成功');
            
        } catch (error) {
            console.error('Delete memory failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 手动触发记忆压缩
     * @param {string} roleId 角色ID（可选）
     * @returns {Promise<ServiceResponse>}
     */
    async manualCompression(roleId = null) {
        try {
            if (!roleId) {
                return createErrorResponse('需要指定角色ID', ServiceErrorTypes.VALIDATION_ERROR);
            }
            
            const response = await memoryService.compressMemoriesByImportance(roleId, {
                forceCompress: true
            });
            
            if (response.success !== false) {
                // 刷新数据
                await this.refreshCurrentMemories();
                await this.refreshMemoryStats();
            }
            
            return response;
            
        } catch (error) {
            console.error('Manual compression failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 导出记忆数据
     * @param {Object} options 导出选项
     * @returns {Promise<ServiceResponse>}
     */
    async exportMemories(options = {}) {
        try {
            const {
                roleId = null,
                format = 'json',
                includeMetadata = true
            } = options;
            
            const db = getDB();
            let query = db.memories;
            
            if (roleId) {
                query = query.where('roleId').equals(roleId);
            }
            
            const memories = await query.toArray();
            
            const exportData = {
                metadata: includeMetadata ? {
                    exportTime: new Date().toISOString(),
                    totalCount: memories.length,
                    version: '1.0'
                } : undefined,
                memories: memories
            };
            
            // 生成下载文件
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `memories_export_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            
            URL.revokeObjectURL(url);
            
            return createSuccessResponse({
                exportedCount: memories.length,
                format
            }, '记忆数据导出成功');
            
        } catch (error) {
            console.error('Export memories failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 清空所有记忆
     * @returns {Promise<ServiceResponse>}
     */
    async clearAllMemories() {
        try {
            const db = getDB();
            const deletedCount = await db.memories.clear();
            
            // 重置状态
            this.currentMemories = [];
            this.memoryStats = null;
            
            // 发送事件
            await eventBus.emit('memory.all-cleared', { deletedCount });
            
            return createSuccessResponse({ deletedCount }, `已清空 ${deletedCount} 个记忆`);
            
        } catch (error) {
            console.error('Clear all memories failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    // ===== 辅助方法 =====

    /**
     * 刷新当前记忆列表
     * @private
     */
    async refreshCurrentMemories() {
        if (this.currentFilter) {
            await this.getMemoryList({ type: this.currentFilter });
        }
    }

    /**
     * 刷新记忆统计数据
     * @private
     */
    async refreshMemoryStats() {
        await this.getMemoryStats();
    }

    /**
     * 获取重要性等级显示名称
     * @param {number} importance 重要性评分
     * @returns {string} 等级显示名称
     */
    getImportanceLevel(importance) {
        if (importance >= 0.7) return '高';
        if (importance >= 0.4) return '中';
        return '低';
    }

    /**
     * 获取记忆类型显示名称
     * @param {string} type 记忆类型
     * @returns {string} 类型显示名称
     */
    getTypeDisplayName(type) {
        const typeNames = {
            semantic: '知识记忆',
            episodic: '情节记忆',
            social: '社交记忆',
            general: '一般记忆'
        };
        return typeNames[type] || '未知类型';
    }

    /**
     * 获取当前状态快照
     * @returns {Object} 状态快照
     */
    getStateSnapshot() {
        return {
            currentFilter: this.currentFilter,
            memoriesCount: this.currentMemories.length,
            isLoading: this.isLoading,
            hasStats: this.memoryStats !== null,
            settings: this.settings
        };
    }

    // ===== 记忆注入预览功能 =====
    
    /**
     * 根据ID列表获取记忆详情
     * @param {Array<string>} memoryIds 记忆ID列表
     * @returns {Promise<ServiceResponse>}
     */
    async getMemoriesByIds(memoryIds) {
        try {
            if (!Array.isArray(memoryIds) || memoryIds.length === 0) {
                return createErrorResponse('记忆ID列表不能为空', ServiceErrorTypes.VALIDATION_ERROR);
            }
            
            const db = getDB();
            const memories = await db.memories
                .where('id')
                .anyOf(memoryIds)
                .toArray();
            
            return createSuccessResponse(memories, '记忆详情获取成功');
            
        } catch (error) {
            console.error('Get memories by IDs failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }
    
    /**
     * 将选中记忆注入到指定聊天
     * @param {string} chatId 目标聊天ID
     * @param {Array<string>} memoryIds 要注入的记忆ID列表
     * @returns {Promise<ServiceResponse>}
     */
    async injectMemoriesToChat(chatId, memoryIds) {
        try {
            if (!chatId || !Array.isArray(memoryIds) || memoryIds.length === 0) {
                return createErrorResponse('参数不完整', ServiceErrorTypes.VALIDATION_ERROR);
            }
            
            // 获取记忆详情
            const memoriesResult = await this.getMemoriesByIds(memoryIds);
            if (!memoriesResult.success) {
                return memoriesResult;
            }
            
            const memories = memoriesResult.data;
            
            // 验证目标聊天是否存在
            const db = getDB();
            const chat = await db.chats.get(chatId);
            if (!chat) {
                return createErrorResponse('目标聊天不存在', ServiceErrorTypes.NOT_FOUND);
            }
            
            // 生成注入标记和记录
            const injectionRecord = {
                id: `injection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                chatId: chatId,
                memoryIds: memoryIds,
                injectedMemories: memories.map(m => ({
                    id: m.id,
                    type: m.type,
                    content: m.content,
                    importance: m.importance,
                    injectedAt: new Date().toISOString()
                })),
                totalMemories: memories.length,
                totalTokens: this.estimateMemoriesTokens(memories),
                createdAt: new Date().toISOString()
            };
            
            // 保存注入记录（可选，用于追踪）
            try {
                await db.memoryInjections.add(injectionRecord);
            } catch (tableError) {
                // 如果表不存在，先创建表
                console.warn('Memory injections table may not exist, creating record in memory:', injectionRecord);
            }
            
            // 触发记忆注入事件
            await eventBus.emit('memory.injection-started', {
                chatId: chatId,
                memoryIds: memoryIds,
                injectionId: injectionRecord.id
            });
            
            return createSuccessResponse({
                injectionId: injectionRecord.id,
                injectedCount: memories.length,
                estimatedTokens: injectionRecord.totalTokens,
                targetChat: {
                    id: chat.id,
                    name: chat.name || '未命名聊天'
                }
            }, '记忆注入成功');
            
        } catch (error) {
            console.error('Inject memories to chat failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }
    
    /**
     * 估算记忆列表的令牌数量
     * @param {Array} memories 记忆列表
     * @returns {number} 估算令牌数
     */
    estimateMemoriesTokens(memories) {
        return memories.reduce((total, memory) => {
            // 简化的令牌估算：中文约1.5字符/令牌，英文约4字符/令牌
            const content = memory.content || '';
            const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
            const otherChars = content.length - chineseChars;
            return total + Math.ceil(chineseChars / 1.5 + otherChars / 4);
        }, 0);
    }
    
    /**
     * 获取记忆注入历史
     * @param {string} chatId 聊天ID（可选）
     * @returns {Promise<ServiceResponse>}
     */
    async getInjectionHistory(chatId = null) {
        try {
            const db = getDB();
            
            let query = db.memoryInjections;
            if (chatId) {
                query = query.where('chatId').equals(chatId);
            }
            
            const injections = await query
                .orderBy('createdAt')
                .reverse()
                .limit(50)
                .toArray();
                
            return createSuccessResponse(injections, '注入历史获取成功');
            
        } catch (error) {
            console.error('Get injection history failed:', error);
            // 如果表不存在，返回空列表
            return createSuccessResponse([], '暂无注入历史记录');
        }
    }
    
    /**
     * 清理注入历史记录
     * @param {number} keepDays 保留天数，默认30天
     * @returns {Promise<ServiceResponse>}
     */
    async cleanupInjectionHistory(keepDays = 30) {
        try {
            const db = getDB();
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - keepDays);
            
            const deletedCount = await db.memoryInjections
                .where('createdAt')
                .below(cutoffDate.toISOString())
                .delete();
                
            return createSuccessResponse({ deletedCount }, `清理了${deletedCount}条历史记录`);
            
        } catch (error) {
            console.error('Cleanup injection history failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }
}

// 创建全局存储实例
export const memoryStore = new MemoryStore();

// 导出类和实例
export { MemoryStore };

// 兼容旧接口（渐进式重构）
export async function getMemoryStats() {
    const response = await memoryStore.getMemoryStats();
    if (response.success) {
        const stats = response.data;
        return {
            total: stats.total,
            high: stats.byImportance.high,
            recent: stats.recentCount,
            storage: Math.min((stats.total / 10000 * 100), 100).toFixed(1) + '%'
        };
    }
    return { total: 0, high: 0, recent: 0, storage: '0%' };
}

export async function getMemoriesPaginated(page = 1, limit = 20, filters = {}) {
    const response = await memoryStore.getMemoryList({
        limit,
        offset: (page - 1) * limit,
        type: filters.type || 'all'
    });
    
    if (response.success) {
        const { memories, total } = response.data;
        return {
            memories: memories.map(memory => ({
                ...memory,
                formattedCreatedAt: new Date(memory.createdAt).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit', 
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                importanceLevel: memoryStore.getImportanceLevel(memory.importance),
                contentPreview: memory.content ? memory.content.slice(0, 100) + '...' : ''
            })),
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            totalCount: total
        };
    }
    
    return { memories: [], totalPages: 0, currentPage: 1, totalCount: 0 };
}

export async function createMemory(memoryData) {
    return await memoryService.createMemory(memoryData);
}

export async function updateMemory(memoryId, updates) {
    const db = getDB();
    const updated = await db.memories.update(memoryId, {
        ...updates,
        updatedAt: new Date().toISOString()
    });
    return { success: updated > 0 };
}

export async function deleteMemory(memoryId) {
    return await memoryStore.deleteMemory(memoryId);
}

export async function clearAllMemories() {
    return await memoryStore.clearAllMemories();
}

export async function batchMemoryOperation(operations) {
    try {
        if (!Array.isArray(operations) || operations.length === 0) {
            return createErrorResponse('无有效批量操作', ServiceErrorTypes.VALIDATION_ERROR);
        }
        const db = getDB();
        let affected = 0;
        await db.transaction('rw', db.memories, async () => {
            for (const op of operations) {
                const { type, id, updates } = op || {};
                if (!id) continue;
                if (type === 'delete') {
                    const res = await db.memories.delete(id);
                    if (res !== 0) affected++;
                } else if (type === 'update' && updates) {
                    const res = await db.memories.update(id, {
                        ...updates,
                        updatedAt: new Date().toISOString()
                    });
                    if (res > 0) affected++;
                }
            }
        });
        await eventBus.emit('memory.batch-operation', { affected });
        return createSuccessResponse({ affected }, '批量操作完成');
    } catch (error) {
        console.error('Batch memory operation failed:', error);
        return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
    }
}