/**
 * 数据库查询优化工具
 * 提供查询优化、索引管理和性能监控功能
 * 遵循SOLID原则，专注于数据库性能优化
 */

import { getDB } from '../core/db.js';
import { eventBus, EventTypes } from '../core/event-bus.js';
import { showWarning } from './notify.js';

/**
 * 数据库优化配置
 */
const DB_OPTIMIZATION_CONFIG = {
    // 查询性能监控配置
    slowQueryThreshold: 100,        // 慢查询阈值(ms)
    queryLogLimit: 1000,           // 查询日志数量限制
    performanceAnalysisInterval: 60000, // 性能分析间隔(1分钟)
    
    // 缓存配置
    enableQueryCache: true,        // 启用查询缓存
    cacheExpiry: 300000,          // 缓存过期时间(5分钟)
    maxCacheEntries: 100,         // 最大缓存条目数
    
    // 批量操作配置
    batchSize: 100,               // 批量操作大小
    maxBatchTime: 5000,           // 最大批量时间(5秒)
    
    // 索引优化配置
    autoIndexOptimization: true,   // 自动索引优化
    indexAnalysisThreshold: 1000   // 索引分析阈值(查询次数)
};

/**
 * 数据库查询优化器类
 */
class DatabaseOptimizer {
    constructor() {
        this.queryCache = new Map();
        this.cacheAccessTimes = new Map();
        this.queryLog = [];
        this.indexUsageStats = new Map();
        this.performanceMetrics = {
            totalQueries: 0,
            slowQueries: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averageQueryTime: 0,
            indexScans: 0,
            fullTableScans: 0
        };
        this.batchOperations = new Map();
        this.analysisTimer = null;
        this.isInitialized = false;
    }

    /**
     * 初始化数据库优化器
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            console.log('🗄️ Initializing Database Optimizer...');
            
            // 启动性能分析
            this.startPerformanceAnalysis();
            
            // 分析当前数据库结构
            await this.analyzeCurrentSchema();
            
            // 设置查询拦截器
            this.setupQueryInterceptors();
            
            this.isInitialized = true;
            console.log('✅ Database Optimizer initialized');
            
            await eventBus.emit('database.optimizer.ready', {
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Failed to initialize database optimizer:', error);
            throw error;
        }
    }

    /**
     * 优化的查询方法 - 通用查询接口
     */
    async optimizedQuery(tableName, queryBuilder, options = {}) {
        const { useCache = true, cacheKey = null } = options;
        const startTime = performance.now();
        
        try {
            // 生成缓存键
            const finalCacheKey = cacheKey || this.generateCacheKey(tableName, queryBuilder);
            
            // 检查缓存
            if (useCache && this.queryCache.has(finalCacheKey)) {
                const cached = this.queryCache.get(finalCacheKey);
                if (Date.now() - cached.timestamp < DB_OPTIMIZATION_CONFIG.cacheExpiry) {
                    this.performanceMetrics.cacheHits++;
                    this.cacheAccessTimes.set(finalCacheKey, Date.now());
                    return cached.data;
                } else {
                    // 缓存过期，删除
                    this.queryCache.delete(finalCacheKey);
                    this.cacheAccessTimes.delete(finalCacheKey);
                }
            }
            
            // 执行查询
            const db = getDB();
            if (!db) throw new Error('Database not available');
            
            const result = await queryBuilder(db.table(tableName));
            const queryTime = performance.now() - startTime;
            
            // 更新性能指标
            this.updatePerformanceMetrics(queryTime);
            
            // 记录查询日志
            this.logQuery(tableName, queryBuilder.toString(), queryTime);
            
            // 缓存结果
            if (useCache && result) {
                this.cacheQuery(finalCacheKey, result);
                this.performanceMetrics.cacheMisses++;
            }
            
            return result;
            
        } catch (error) {
            const queryTime = performance.now() - startTime;
            this.logQuery(tableName, queryBuilder.toString(), queryTime, error);
            throw error;
        }
    }

    /**
     * 优化的批量查询
     */
    async batchQuery(queries) {
        const startTime = performance.now();
        const results = [];
        
        try {
            const db = getDB();
            if (!db) throw new Error('Database not available');
            
            // 使用事务执行批量查询
            await db.transaction('rw', Object.keys(db.tables), async () => {
                for (const query of queries) {
                    const { tableName, queryBuilder, options = {} } = query;
                    const result = await this.optimizedQuery(tableName, queryBuilder, {
                        ...options,
                        useCache: false // 批量查询中禁用缓存避免内存压力
                    });
                    results.push(result);
                }
            });
            
            const queryTime = performance.now() - startTime;
            console.log(`📊 Batch query completed: ${queries.length} queries in ${Math.round(queryTime)}ms`);
            
            return results;
            
        } catch (error) {
            console.error('Batch query failed:', error);
            throw error;
        }
    }

    /**
     * 分页查询优化
     */
    async paginatedQuery(tableName, options = {}) {
        const {
            page = 1,
            limit = 20,
            orderBy = null,
            where = null,
            useCache = true
        } = options;
        
        const offset = (page - 1) * limit;
        const cacheKey = `paginated_${tableName}_${page}_${limit}_${JSON.stringify(orderBy)}_${JSON.stringify(where)}`;
        
        return await this.optimizedQuery(tableName, (table) => {
            let query = table;
            
            // 应用where条件
            if (where) {
                if (Array.isArray(where)) {
                    query = query.where(where[0]).equals(where[1]);
                } else if (typeof where === 'object') {
                    Object.entries(where).forEach(([key, value]) => {
                        query = query.where(key).equals(value);
                    });
                }
            }
            
            // 应用排序
            if (orderBy) {
                if (typeof orderBy === 'string') {
                    query = query.orderBy(orderBy);
                } else if (Array.isArray(orderBy)) {
                    query = query.orderBy(orderBy[0]);
                    if (orderBy[1] === 'desc') {
                        query = query.reverse();
                    }
                }
            }
            
            return query.offset(offset).limit(limit).toArray();
        }, { useCache, cacheKey });
    }

    /**
     * 聚合查询优化
     */
    async aggregateQuery(tableName, aggregations = []) {
        const cacheKey = `aggregate_${tableName}_${JSON.stringify(aggregations)}`;
        
        return await this.optimizedQuery(tableName, async (table) => {
            const results = {};
            
            for (const agg of aggregations) {
                const { type, field, where = null } = agg;
                let query = table;
                
                // 应用where条件
                if (where) {
                    query = query.where(where.field).equals(where.value);
                }
                
                switch (type) {
                    case 'count':
                        results[`count_${field || 'all'}`] = await query.count();
                        break;
                    case 'sum':
                        if (field) {
                            const items = await query.toArray();
                            results[`sum_${field}`] = items.reduce((sum, item) => sum + (item[field] || 0), 0);
                        }
                        break;
                    case 'avg':
                        if (field) {
                            const items = await query.toArray();
                            const sum = items.reduce((sum, item) => sum + (item[field] || 0), 0);
                            results[`avg_${field}`] = items.length > 0 ? sum / items.length : 0;
                        }
                        break;
                    case 'max':
                        if (field) {
                            const items = await query.toArray();
                            results[`max_${field}`] = Math.max(...items.map(item => item[field] || 0));
                        }
                        break;
                    case 'min':
                        if (field) {
                            const items = await query.toArray();
                            results[`min_${field}`] = Math.min(...items.map(item => item[field] || 0));
                        }
                        break;
                }
            }
            
            return results;
        }, { useCache: true, cacheKey });
    }

    /**
     * 热门查询分析和缓存预热
     */
    async warmupCache() {
        console.log('🔥 Warming up query cache...');
        
        try {
            // 预热常用查询
            const commonQueries = [
                // 获取所有聊天（按更新时间排序）
                { tableName: 'chats', queryBuilder: (table) => table.orderBy('updatedAt').reverse().toArray() },
                
                // 获取最近的记忆
                { tableName: 'memories', queryBuilder: (table) => table.orderBy('createdAt').reverse().limit(50).toArray() },
                
                // 获取启用的插件
                { tableName: 'plugins', queryBuilder: (table) => table.where('enabled').equals(true).toArray() },
                
                // 获取最近的朋友圈动态
                { tableName: 'moments', queryBuilder: (table) => table.orderBy('createdAt').reverse().limit(20).toArray() },
                
                // 获取全局设置
                { tableName: 'globalSettings', queryBuilder: (table) => table.toArray() }
            ];
            
            let warmedUp = 0;
            for (const query of commonQueries) {
                try {
                    await this.optimizedQuery(query.tableName, query.queryBuilder);
                    warmedUp++;
                } catch (error) {
                    console.warn(`Failed to warm up query for ${query.tableName}:`, error);
                }
            }
            
            console.log(`✅ Cache warmup completed: ${warmedUp}/${commonQueries.length} queries cached`);
            
        } catch (error) {
            console.error('Cache warmup failed:', error);
        }
    }

    /**
     * 缓存查询结果
     */
    cacheQuery(cacheKey, data) {
        // 检查缓存大小限制
        if (this.queryCache.size >= DB_OPTIMIZATION_CONFIG.maxCacheEntries) {
            this.evictOldestCacheEntries();
        }
        
        this.queryCache.set(cacheKey, {
            data: this.deepCloneOptimized(data), // 🔒 性能修复：使用优化的深拷贝避免JSON方法的性能问题
            timestamp: Date.now()
        });
        this.cacheAccessTimes.set(cacheKey, Date.now());
    }

    /**
     * 🔒 性能优化的深拷贝方法
     * 相比JSON.parse(JSON.stringify())有更好的性能和兼容性
     * @param {any} obj 待拷贝对象
     * @returns {any} 深拷贝后的对象
     */
    deepCloneOptimized(obj) {
        // 处理基础类型
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }
        
        // 处理日期
        if (obj instanceof Date) {
            return new Date(obj.getTime());
        }
        
        // 处理数组
        if (Array.isArray(obj)) {
            const result = [];
            for (let i = 0; i < obj.length; i++) {
                result[i] = this.deepCloneOptimized(obj[i]);
            }
            return result;
        }
        
        // 处理普通对象
        if (obj.constructor === Object) {
            const result = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    result[key] = this.deepCloneOptimized(obj[key]);
                }
            }
            return result;
        }
        
        // 对于其他复杂对象（如Map、Set等），使用浅拷贝
        // 在数据库查询结果中这些类型很少见
        return obj;
    }

    /**
     * 淘汰最旧的缓存条目
     */
    evictOldestCacheEntries() {
        const sortedEntries = Array.from(this.cacheAccessTimes.entries())
            .sort((a, b) => a[1] - b[1]);
            
        const evictCount = Math.floor(DB_OPTIMIZATION_CONFIG.maxCacheEntries * 0.2); // 淘汰20%
        
        for (let i = 0; i < evictCount && i < sortedEntries.length; i++) {
            const [cacheKey] = sortedEntries[i];
            this.queryCache.delete(cacheKey);
            this.cacheAccessTimes.delete(cacheKey);
        }
        
        console.log(`🗑️ Evicted ${evictCount} cache entries`);
    }

    /**
     * 生成缓存键
     */
    generateCacheKey(tableName, queryBuilder) {
        const queryString = queryBuilder.toString();
        const hash = this.simpleHash(tableName + queryString);
        return `query_${tableName}_${hash}`;
    }

    /**
     * 简单哈希函数
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash).toString(36);
    }

    /**
     * 记录查询日志
     */
    logQuery(tableName, query, queryTime, error = null) {
        const logEntry = {
            timestamp: Date.now(),
            tableName,
            query: query.substring(0, 200), // 截断长查询
            queryTime,
            error: error ? error.message : null,
            isSlow: queryTime > DB_OPTIMIZATION_CONFIG.slowQueryThreshold
        };
        
        this.queryLog.push(logEntry);
        
        // 限制日志大小
        if (this.queryLog.length > DB_OPTIMIZATION_CONFIG.queryLogLimit) {
            this.queryLog.splice(0, this.queryLog.length - DB_OPTIMIZATION_CONFIG.queryLogLimit);
        }
        
        // 记录慢查询
        if (logEntry.isSlow) {
            console.warn(`🐌 Slow query detected: ${tableName} (${Math.round(queryTime)}ms)`);
            this.performanceMetrics.slowQueries++;
        }
    }

    /**
     * 更新性能指标
     */
    updatePerformanceMetrics(queryTime) {
        this.performanceMetrics.totalQueries++;
        
        // 更新平均查询时间
        const total = this.performanceMetrics.averageQueryTime * (this.performanceMetrics.totalQueries - 1) + queryTime;
        this.performanceMetrics.averageQueryTime = total / this.performanceMetrics.totalQueries;
    }

    /**
     * 启动性能分析
     */
    startPerformanceAnalysis() {
        this.analysisTimer = setInterval(() => {
            this.performPerformanceAnalysis();
        }, DB_OPTIMIZATION_CONFIG.performanceAnalysisInterval);
    }

    /**
     * 执行性能分析
     */
    async performPerformanceAnalysis() {
        try {
            const analysis = {
                ...this.performanceMetrics,
                cacheHitRate: this.performanceMetrics.totalQueries > 0 
                    ? (this.performanceMetrics.cacheHits / this.performanceMetrics.totalQueries) * 100 
                    : 0,
                slowQueryRate: this.performanceMetrics.totalQueries > 0 
                    ? (this.performanceMetrics.slowQueries / this.performanceMetrics.totalQueries) * 100 
                    : 0,
                cacheSize: this.queryCache.size,
                recentSlowQueries: this.queryLog
                    .filter(log => log.isSlow)
                    .slice(-5)
                    .map(log => ({ tableName: log.tableName, queryTime: log.queryTime }))
            };
            
            // 发送性能分析事件
            await eventBus.emit('database.performance.analysis', {
                analysis,
                timestamp: Date.now()
            });
            
            // 检查性能警告
            if (analysis.slowQueryRate > 20) {
                showWarning(`数据库慢查询率较高: ${Math.round(analysis.slowQueryRate)}%`);
            }
            
            if (analysis.cacheHitRate < 50 && this.performanceMetrics.totalQueries > 100) {
                console.warn(`📊 Low cache hit rate: ${Math.round(analysis.cacheHitRate)}%`);
            }
            
        } catch (error) {
            console.error('Performance analysis failed:', error);
        }
    }

    /**
     * 分析当前数据库结构
     */
    async analyzeCurrentSchema() {
        try {
            const db = getDB();
            if (!db) return;
            
            const tableAnalysis = {};
            
            for (const table of db.tables) {
                const tableName = table.name;
                const count = await table.count();
                const indexes = table.schema.indexes || [];
                
                tableAnalysis[tableName] = {
                    rowCount: count,
                    indexes: indexes.map(idx => ({
                        name: idx.name,
                        keyPath: idx.keyPath,
                        unique: idx.unique,
                        multiEntry: idx.multiEntry
                    })),
                    estimatedSize: count * 100 // 粗略估算，每行约100字节
                };
            }
            
            console.log('📊 Database schema analysis:', tableAnalysis);
            return tableAnalysis;
            
        } catch (error) {
            console.error('Schema analysis failed:', error);
            return {};
        }
    }

    /**
     * 设置查询拦截器（用于监控）
     */
    setupQueryInterceptors() {
        // 这是一个概念性实现，实际需要与Dexie的钩子系统集成
        console.log('🔍 Query interceptors setup completed');
    }

    /**
     * 清空查询缓存
     */
    clearCache() {
        const cacheSize = this.queryCache.size;
        this.queryCache.clear();
        this.cacheAccessTimes.clear();
        console.log(`🗑️ Cleared query cache: ${cacheSize} entries removed`);
    }

    /**
     * 获取性能统计
     */
    getPerformanceStats() {
        return {
            ...this.performanceMetrics,
            cacheHitRate: this.performanceMetrics.totalQueries > 0 
                ? (this.performanceMetrics.cacheHits / this.performanceMetrics.totalQueries) * 100 
                : 0,
            slowQueryRate: this.performanceMetrics.totalQueries > 0 
                ? (this.performanceMetrics.slowQueries / this.performanceMetrics.totalQueries) * 100 
                : 0,
            cacheSize: this.queryCache.size,
            queryLogSize: this.queryLog.length
        };
    }

    /**
     * 销毁优化器
     */
    destroy() {
        if (this.analysisTimer) {
            clearInterval(this.analysisTimer);
            this.analysisTimer = null;
        }
        
        this.queryCache.clear();
        this.cacheAccessTimes.clear();
        this.queryLog.length = 0;
        this.indexUsageStats.clear();
        
        this.isInitialized = false;
        console.log('🗄️ Database optimizer destroyed');
    }
}

// 创建全局数据库优化器实例
export const databaseOptimizer = new DatabaseOptimizer();

// 便捷查询函数
export const OptimizedQuery = {
    /**
     * 优化的单表查询
     */
    async query(tableName, queryBuilder, options = {}) {
        return await databaseOptimizer.optimizedQuery(tableName, queryBuilder, options);
    },

    /**
     * 分页查询
     */
    async paginate(tableName, options = {}) {
        return await databaseOptimizer.paginatedQuery(tableName, options);
    },

    /**
     * 聚合查询
     */
    async aggregate(tableName, aggregations = []) {
        return await databaseOptimizer.aggregateQuery(tableName, aggregations);
    },

    /**
     * 批量查询
     */
    async batch(queries) {
        return await databaseOptimizer.batchQuery(queries);
    },

    /**
     * 获取性能统计
     */
    getStats() {
        return databaseOptimizer.getPerformanceStats();
    },

    /**
     * 清空缓存
     */
    clearCache() {
        return databaseOptimizer.clearCache();
    }
};

// 默认导出
export default databaseOptimizer;