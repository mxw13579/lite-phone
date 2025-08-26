/**
 * 数据服务层
 * 提供通用的数据库操作和统计功能
 * 支持内存、朋友圈等数据密集型模块
 */

import { getDB } from '../core/db.js';
import { eventBus, EventTypes } from '../core/event-bus.js';
import { createSuccessResponse, createErrorResponse, contractCompliant } from './contracts.js';

/**
 * 通用数据服务类
 */
class DataService {
    constructor() {
        this.db = null;
        this.isInitialized = false;
    }

    /**
     * 初始化服务
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            this.db = getDB();
            this.isInitialized = true;
            console.log('Data service initialized');
        } catch (error) {
            console.error('Failed to initialize data service:', error);
            throw error;
        }
    }

    /**
     * 获取数据统计信息
     * @param {string} tableName 表名
     * @param {Object} options 选项
     * @returns {Promise<Object>} 统计信息
     */
    async getStats(tableName, options = {}) {
        try {
            await this.initialize();
            if (!this.db || !this.db[tableName]) {
                return createErrorResponse('数据表不存在', 'TABLE_NOT_FOUND');
            }

            const { 
                countField = null, 
                dateField = 'createdAt',
                recentDays = 7,
                highThreshold = null
            } = options;

            const now = new Date();
            const recentDate = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);

            // 基础统计
            const queries = [
                this.db[tableName].count() // 总数
            ];

            // 最近记录数
            if (dateField) {
                queries.push(
                    this.db[tableName].where(dateField).above(recentDate.toISOString()).count()
                );
            }

            // 高重要性记录（如果有阈值）
            if (highThreshold && countField) {
                queries.push(
                    this.db[tableName].where(countField).above(highThreshold).count()
                );
            }

            const results = await Promise.all(queries);
            
            const stats = {
                total: results[0] || 0,
                recent: results[1] || 0
            };

            if (highThreshold) {
                stats.high = results[2] || 0;
            }

            return createSuccessResponse(stats);

        } catch (error) {
            console.error(`Failed to get ${tableName} stats:`, error);
            return createErrorResponse('获取统计信息失败', 'STATS_FAILED');
        }
    }

    /**
     * 分页查询数据
     * @param {string} tableName 表名
     * @param {Object} options 分页选项
     * @returns {Promise<Object>} 分页结果
     */
    async getPaginated(tableName, options = {}) {
        try {
            await this.initialize();
            if (!this.db || !this.db[tableName]) {
                return createErrorResponse('数据表不存在', 'TABLE_NOT_FOUND');
            }

            const { 
                page = 1, 
                limit = 10, 
                orderBy = 'createdAt',
                reverse = true,
                filters = {}
            } = options;

            // 构建查询
            let query = this.db[tableName];
            
            // 应用过滤器
            for (const [field, value] of Object.entries(filters)) {
                if (value !== null && value !== undefined) {
                    query = query.where(field).equals(value);
                }
            }

            // 获取总数
            const totalCount = await query.count();
            const totalPages = Math.ceil(totalCount / limit);
            const offset = (page - 1) * limit;

            // 执行分页查询
            let dataQuery = query.orderBy(orderBy);
            if (reverse) {
                dataQuery = dataQuery.reverse();
            }

            const items = await dataQuery.offset(offset).limit(limit).toArray();

            const result = {
                items,
                totalCount,
                totalPages,
                currentPage: page,
                hasNext: page < totalPages,
                hasPrev: page > 1
            };

            return createSuccessResponse(result);

        } catch (error) {
            console.error(`Failed to get paginated ${tableName}:`, error);
            return createErrorResponse('分页查询失败', 'PAGINATION_FAILED');
        }
    }

    /**
     * 创建数据记录
     * @param {string} tableName 表名
     * @param {Object} data 数据对象
     * @returns {Promise<Object>} 创建结果
     */
    async createRecord(tableName, data) {
        try {
            await this.initialize();
            if (!this.db || !this.db[tableName]) {
                return createErrorResponse('数据表不存在', 'TABLE_NOT_FOUND');
            }

            const timestamp = new Date().toISOString();
            const recordData = {
                ...data,
                id: data.id || crypto.randomUUID(),
                createdAt: timestamp,
                updatedAt: timestamp
            };

            const id = await this.db[tableName].add(recordData);
            
            // 发送创建事件
            await eventBus.emit(EventTypes.DATA_CREATED, {
                table: tableName,
                id: id,
                data: recordData
            });

            return createSuccessResponse(
                { id, ...recordData },
                `${tableName}记录创建成功`
            );

        } catch (error) {
            console.error(`Failed to create ${tableName} record:`, error);
            return createErrorResponse('创建记录失败', 'CREATE_FAILED');
        }
    }

    /**
     * 更新数据记录
     * @param {string} tableName 表名
     * @param {string} id 记录ID
     * @param {Object} updates 更新数据
     * @returns {Promise<Object>} 更新结果
     */
    async updateRecord(tableName, id, updates) {
        try {
            await this.initialize();
            if (!this.db || !this.db[tableName]) {
                return createErrorResponse('数据表不存在', 'TABLE_NOT_FOUND');
            }

            const updateData = {
                ...updates,
                updatedAt: new Date().toISOString()
            };

            const updateCount = await this.db[tableName].update(id, updateData);
            
            if (updateCount === 0) {
                return createErrorResponse('记录不存在', 'RECORD_NOT_FOUND');
            }

            // 发送更新事件
            await eventBus.emit(EventTypes.DATA_UPDATED, {
                table: tableName,
                id: id,
                updates: updateData
            });

            return createSuccessResponse(
                { id, ...updateData },
                `${tableName}记录更新成功`
            );

        } catch (error) {
            console.error(`Failed to update ${tableName} record:`, error);
            return createErrorResponse('更新记录失败', 'UPDATE_FAILED');
        }
    }

    /**
     * 删除数据记录
     * @param {string} tableName 表名
     * @param {string} id 记录ID
     * @returns {Promise<Object>} 删除结果
     */
    async deleteRecord(tableName, id) {
        try {
            await this.initialize();
            if (!this.db || !this.db[tableName]) {
                return createErrorResponse('数据表不存在', 'TABLE_NOT_FOUND');
            }

            const deleteCount = await this.db[tableName].delete(id);
            
            if (deleteCount === 0) {
                return createErrorResponse('记录不存在', 'RECORD_NOT_FOUND');
            }

            // 发送删除事件
            await eventBus.emit(EventTypes.DATA_DELETED, {
                table: tableName,
                id: id
            });

            return createSuccessResponse(null, `${tableName}记录删除成功`);

        } catch (error) {
            console.error(`Failed to delete ${tableName} record:`, error);
            return createErrorResponse('删除记录失败', 'DELETE_FAILED');
        }
    }

    /**
     * 批量操作
     * @param {string} tableName 表名
     * @param {Array} operations 操作数组
     * @returns {Promise<Object>} 批量操作结果
     */
    async batchOperation(tableName, operations) {
        try {
            await this.initialize();
            if (!this.db || !this.db[tableName]) {
                return createErrorResponse('数据表不存在', 'TABLE_NOT_FOUND');
            }

            const results = [];
            
            await this.db.transaction('rw', this.db[tableName], async () => {
                for (const op of operations) {
                    const { type, data, id } = op;
                    
                    try {
                        switch (type) {
                            case 'create':
                                const createResult = await this.createRecord(tableName, data);
                                results.push({ operation: op, result: createResult });
                                break;
                            case 'update':
                                const updateResult = await this.updateRecord(tableName, id, data);
                                results.push({ operation: op, result: updateResult });
                                break;
                            case 'delete':
                                const deleteResult = await this.deleteRecord(tableName, id);
                                results.push({ operation: op, result: deleteResult });
                                break;
                            default:
                                results.push({ 
                                    operation: op, 
                                    result: createErrorResponse('不支持的操作类型', 'INVALID_OPERATION') 
                                });
                        }
                    } catch (error) {
                        results.push({ 
                            operation: op, 
                            result: createErrorResponse(error.message, 'OPERATION_FAILED') 
                        });
                    }
                }
            });

            return createSuccessResponse(results, '批量操作完成');

        } catch (error) {
            console.error(`Failed to perform batch operations on ${tableName}:`, error);
            return createErrorResponse('批量操作失败', 'BATCH_FAILED');
        }
    }

    /**
     * 清空表数据
     * @param {string} tableName 表名
     * @returns {Promise<Object>} 清空结果
     */
    async clearTable(tableName) {
        try {
            await this.initialize();
            if (!this.db || !this.db[tableName]) {
                return createErrorResponse('数据表不存在', 'TABLE_NOT_FOUND');
            }

            await this.db[tableName].clear();
            
            // 发送清空事件
            await eventBus.emit(EventTypes.DATA_CLEARED, {
                table: tableName
            });

            return createSuccessResponse(null, `${tableName}数据已清空`);

        } catch (error) {
            console.error(`Failed to clear ${tableName} table:`, error);
            return createErrorResponse('清空数据失败', 'CLEAR_FAILED');
        }
    }
}

// 创建数据服务实例
export const dataService = new DataService();

// 导出主要方法的简化接口
export const {
    getStats,
    getPaginated,
    createRecord,
    updateRecord,
    deleteRecord,
    batchOperation,
    clearTable
} = dataService;

// 使数据服务契约兼容
contractCompliant(dataService);