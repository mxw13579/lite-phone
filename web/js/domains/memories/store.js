/**
 * 记忆管理存储层
 * 负责记忆数据的 CRUD 操作和统计分析
 * 已接入统一数据服务层
 */

import { dataService } from '../../services/data.js';
import { formatDate } from '../../utils/format.js';

/**
 * 获取记忆统计信息
 */
export async function getMemoryStats() {
    try {
        const result = await dataService.getStats('memories', {
            countField: 'importance',
            dateField: 'createdAt',
            recentDays: 7,
            highThreshold: 0.7
        });

        if (result.success) {
            const { total, recent, high } = result.data;
            return {
                total,
                high: high || 0,
                recent,
                storage: Math.min((total / 10000 * 100), 100).toFixed(1) + '%'
            };
        } else {
            console.error('Failed to get memory stats:', result.error);
            return { total: 0, high: 0, recent: 0, storage: '0%' };
        }
    } catch (error) {
        console.error('Failed to get memory stats:', error);
        return { total: 0, high: 0, recent: 0, storage: '0%' };
    }
}

/**
 * 获取分页的记忆列表
 */
export async function getMemoriesPaginated(page = 1, limit = 20, filters = {}) {
    try {
        const result = await dataService.getPaginated('memories', {
            page,
            limit,
            orderBy: 'createdAt',
            reverse: true,
            filters
        });

        if (result.success) {
            const { items, totalPages, currentPage, totalCount } = result.data;
            
            // 格式化记忆数据
            const formattedMemories = items.map(memory => ({
                ...memory,
                formattedCreatedAt: formatDate(memory.createdAt, 'MM-DD HH:mm'),
                importanceLevel: getImportanceLevel(memory.importance),
                contentPreview: memory.content ? memory.content.slice(0, 100) + '...' : ''
            }));

            return {
                memories: formattedMemories,
                totalPages,
                currentPage,
                totalCount: totalCount || formattedMemories.length
            };
        } else {
            console.error('Failed to get paginated memories:', result.error);
            return { memories: [], totalPages: 0, currentPage: 1, totalCount: 0 };
        }
    } catch (error) {
        console.error('Failed to get paginated memories:', error);
        return { memories: [], totalPages: 0, currentPage: 1, totalCount: 0 };
    }
}

/**
 * 创建记忆
 * @param {Object} memoryData 记忆数据
 * @returns {Promise<Object>} 创建结果
 */
export async function createMemory(memoryData) {
    return await dataService.createRecord('memories', memoryData);
}

/**
 * 更新记忆
 * @param {string} memoryId 记忆ID
 * @param {Object} updates 更新数据
 * @returns {Promise<Object>} 更新结果
 */
export async function updateMemory(memoryId, updates) {
    return await dataService.updateRecord('memories', memoryId, updates);
}

/**
 * 删除记忆
 * @param {string} memoryId 记忆ID
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteMemory(memoryId) {
    return await dataService.deleteRecord('memories', memoryId);
}

/**
 * 批量操作记忆
 * @param {Array} operations 操作数组
 * @returns {Promise<Object>} 批量操作结果
 */
export async function batchMemoryOperation(operations) {
    return await dataService.batchOperation('memories', operations);
}

/**
 * 清空所有记忆
 * @returns {Promise<Object>} 清空结果
 */
export async function clearAllMemories() {
    return await dataService.clearTable('memories');
}

/**
 * 获取重要性等级
 * @param {number} importance 重要性值
 * @returns {string} 重要性等级
 */
function getImportanceLevel(importance) {
    if (importance >= 0.8) return 'very-high';
    if (importance >= 0.6) return 'high';
    if (importance >= 0.4) return 'medium';
    if (importance >= 0.2) return 'low';
    return 'very-low';
}