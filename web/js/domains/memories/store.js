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
        try {
            // 加载记忆设置
            await this.loadMemorySettings();
            
            // 注册事件监听
            this.registerEventListeners();
            
            return createSuccessResponse(null, '记忆存储初始化成功');
        } catch (error) {
            console.error('Memory store initialization failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
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
        try {
            const db = getDB();
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
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                await db.globalSettings.add(settings);
            }
            
            this.settings = settings;
            return createSuccessResponse(settings, '记忆设置加载成功');
            
        } catch (error) {
            console.error('Load memory settings failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 保存记忆设置
     * @param {Object} newSettings 新设置
     * @returns {Promise<ServiceResponse>}
     */
    async saveMemorySettings(newSettings) {
        try {
            const db = getDB();
            
            const updatedSettings = {
                ...this.settings,
                ...newSettings,
                updatedAt: new Date().toISOString()
            };
            
            await db.globalSettings.put(updatedSettings);
            this.settings = updatedSettings;
            
            // 发送设置更新事件
            await eventBus.emit('memory.settings-updated', updatedSettings);
            
            return createSuccessResponse(updatedSettings, '记忆设置保存成功');
            
        } catch (error) {
            console.error('Save memory settings failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 获取记忆统计数据
     * @param {string} roleId 角色ID（可选，为空则获取全局统计）
     * @returns {Promise<ServiceResponse>}
     */
    async getMemoryStats(roleId = null) {
        try {
            const db = getDB();
            
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
            return createSuccessResponse(stats, '记忆统计获取成功');
            
        } catch (error) {
            console.error('Get memory stats failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 获取记忆列表
     * @param {Object} options 查询选项
     * @returns {Promise<ServiceResponse>}
     */
    async getMemoryList(options = {}) {
        try {
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
                return response;
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
            this.isLoading = false;
            
            return createSuccessResponse({
                memories,
                total: response.data.total,
                currentFilter: type
            }, '记忆列表获取成功');
            
        } catch (error) {
            this.isLoading = false;
            console.error('Get memory list failed:', error);
            return createErrorResponse(error.message, ServiceErrorTypes.INTERNAL_ERROR);
        }
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
    // TODO: 实现批量操作
    return createErrorResponse('批量操作暂未实现', ServiceErrorTypes.INTERNAL_ERROR);
}