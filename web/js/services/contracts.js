/**
 * 服务层契约定义
 * 统一定义所有服务接口的输入输出规范，确保类型安全和一致性
 * 
 * @fileoverview 服务层契约和类型定义
 * @version 1.0
 * @author EPhone Development Team
 */

/**
 * 通用响应结构
 * @typedef {Object} ServiceResponse
 * @property {boolean} success - 操作是否成功
 * @property {*} [data] - 响应数据（成功时）
 * @property {string} [error] - 错误信息（失败时）
 * @property {string} [message] - 操作消息
 * @property {number} [timestamp] - 时间戳
 * @property {Object} [metadata] - 额外元数据
 */

/**
 * 分页参数
 * @typedef {Object} PaginationOptions
 * @property {number} [page=1] - 页码
 * @property {number} [limit=20] - 每页数量
 * @property {string} [sortBy] - 排序字段
 * @property {string} [sortOrder='desc'] - 排序方向 (asc/desc)
 */

/**
 * 分页响应
 * @typedef {Object} PaginatedResponse
 * @property {Array} items - 数据项
 * @property {number} total - 总数量
 * @property {number} page - 当前页码
 * @property {number} limit - 每页数量
 * @property {number} totalPages - 总页数
 * @property {boolean} hasNext - 是否有下一页
 * @property {boolean} hasPrev - 是否有上一页
 */

// ===== API 服务契约 =====

/**
 * API 服务接口契约
 */
export const ApiServiceContract = {
    /**
     * 发送聊天请求
     * @param {Object} request 请求参数
     * @param {string} request.message - 用户消息
     * @param {string} [request.model] - 模型名称
     * @param {Object} [request.settings] - 请求设置
     * @param {Array} [request.history] - 对话历史
     * @param {function} [request.onProgress] - 进度回调
     * @returns {Promise<ServiceResponse>} 响应结果
     */
    sendChatRequest: (request) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 获取模型列表
     * @param {Object} [options] 选项
     * @param {boolean} [options.includeDisabled=false] - 包含已禁用的模型
     * @returns {Promise<ServiceResponse>} 模型列表
     */
    getModels: (options = {}) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 验证API密钥
     * @param {string} apiKey - API密钥
     * @param {string} [provider] - 提供商名称
     * @returns {Promise<ServiceResponse>} 验证结果
     */
    validateApiKey: (apiKey, provider) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 获取API使用统计
     * @param {Object} [timeRange] 时间范围
     * @param {Date} [timeRange.startDate] - 开始时间
     * @param {Date} [timeRange.endDate] - 结束时间
     * @returns {Promise<ServiceResponse>} 统计数据
     */
    getUsageStats: (timeRange = {}) => Promise.resolve(/** @type {ServiceResponse} */ ({}))
};

// ===== 备份服务契约 =====

/**
 * 备份选项
 * @typedef {Object} BackupOptions
 * @property {Array<string>} [includeTypes] - 包含的数据类型
 * @property {boolean} [compress=true] - 是否压缩
 * @property {string} [filename] - 文件名
 * @property {boolean} [excludeMessages=false] - 排除消息内容
 */

/**
 * 备份元数据
 * @typedef {Object} BackupMetadata
 * @property {string} version - 备份版本
 * @property {number} timestamp - 创建时间戳
 * @property {string} type - 备份类型 ('full'|'incremental'|'selective')
 * @property {Array<string>} dataTypes - 包含的数据类型
 * @property {number} size - 数据大小（字节）
 * @property {boolean} compressed - 是否压缩
 * @property {string} checksum - 数据校验和
 */

/**
 * 备份服务接口契约
 */
export const BackupServiceContract = {
    /**
     * 创建完整备份
     * @param {BackupOptions} [options] 备份选项
     * @returns {Promise<ServiceResponse>} 备份结果
     */
    exportFullBackup: (options = {}) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 创建增量备份
     * @param {Date} [since] 起始时间
     * @param {BackupOptions} [options] 备份选项
     * @returns {Promise<ServiceResponse>} 备份结果
     */
    exportIncrementalBackup: (since, options = {}) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 创建选择性备份
     * @param {Array<string>} categories 数据类别
     * @param {BackupOptions} [options] 备份选项
     * @returns {Promise<ServiceResponse>} 备份结果
     */
    exportSelectiveBackup: (categories, options = {}) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 导入完整备份
     * @param {string|Object} backupData 备份数据
     * @param {Object} [options] 导入选项
     * @returns {Promise<ServiceResponse>} 导入结果
     */
    importFullBackup: (backupData, options = {}) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 导入选择性备份
     * @param {string|Object} backupData 备份数据
     * @param {Array<string>} categories 要导入的类别
     * @param {Object} [options] 导入选项
     * @returns {Promise<ServiceResponse>} 导入结果
     */
    importSelectiveBackup: (backupData, categories, options = {}) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 获取系统统计信息
     * @returns {Promise<ServiceResponse>} 统计信息
     */
    getSystemStats: () => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 获取备份历史
     * @param {PaginationOptions} [options] 分页选项
     * @returns {Promise<ServiceResponse>} 备份历史列表
     */
    getBackupHistory: (options = {}) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 从历史恢复备份
     * @param {string} backupId 备份ID
     * @param {Object} [options] 恢复选项
     * @returns {Promise<ServiceResponse>} 恢复结果
     */
    restoreFromHistory: (backupId, options = {}) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 删除备份历史记录
     * @param {string} backupId 备份ID
     * @returns {Promise<ServiceResponse>} 删除结果
     */
    deleteBackupHistory: (backupId) => Promise.resolve(/** @type {ServiceResponse} */ ({}))
};

// ===== 数据服务契约 =====

/**
 * 分页查询选项
 * @typedef {Object} PaginationOptions
 * @property {number} [page=1] - 页码
 * @property {number} [limit=10] - 每页条数
 * @property {string} [orderBy='createdAt'] - 排序字段
 * @property {boolean} [reverse=true] - 是否倒序
 * @property {Object} [filters={}] - 过滤条件
 */

/**
 * 分页查询结果
 * @typedef {Object} PaginationResult
 * @property {Array} items - 数据项数组
 * @property {number} totalCount - 总数据量
 * @property {number} totalPages - 总页数
 * @property {number} currentPage - 当前页码
 * @property {boolean} hasNext - 是否有下一页
 * @property {boolean} hasPrev - 是否有上一页
 */

/**
 * 数据操作
 * @typedef {Object} DataOperation
 * @property {string} type - 操作类型 (create/update/delete)
 * @property {Object} [data] - 操作数据
 * @property {string} [id] - 记录ID (更新/删除时使用)
 */

/**
 * 数据服务接口契约
 */
export const DataServiceContract = {
    /**
     * 获取数据统计信息
     * @param {string} tableName - 表名
     * @param {Object} options - 统计选项
     * @returns {Promise<ServiceResponse>} 统计结果
     */
    getStats: (tableName, options) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 分页查询数据
     * @param {string} tableName - 表名
     * @param {PaginationOptions} options - 分页选项
     * @returns {Promise<ServiceResponse>} 分页结果
     */
    getPaginated: (tableName, options) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 创建数据记录
     * @param {string} tableName - 表名
     * @param {Object} data - 数据对象
     * @returns {Promise<ServiceResponse>} 创建结果
     */
    createRecord: (tableName, data) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 更新数据记录
     * @param {string} tableName - 表名
     * @param {string} id - 记录ID
     * @param {Object} updates - 更新数据
     * @returns {Promise<ServiceResponse>} 更新结果
     */
    updateRecord: (tableName, id, updates) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 删除数据记录
     * @param {string} tableName - 表名
     * @param {string} id - 记录ID
     * @returns {Promise<ServiceResponse>} 删除结果
     */
    deleteRecord: (tableName, id) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 批量操作
     * @param {string} tableName - 表名
     * @param {DataOperation[]} operations - 操作数组
     * @returns {Promise<ServiceResponse>} 批量操作结果
     */
    batchOperation: (tableName, operations) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 清空表数据
     * @param {string} tableName - 表名
     * @returns {Promise<ServiceResponse>} 清空结果
     */
    clearTable: (tableName) => Promise.resolve(/** @type {ServiceResponse} */ ({}))
};

// ===== 主题服务契约 =====

/**
 * 主题配置
 * @typedef {Object} ThemeConfig
 * @property {string} id - 主题ID
 * @property {string} name - 主题名称
 * @property {string} [description] - 主题描述
 * @property {Object} variables - CSS变量定义
 * @property {Object} [customCSS] - 自定义CSS规则
 * @property {boolean} [isDark] - 是否为深色主题
 */

/**
 * 主题服务接口契约
 */
export const ThemeServiceContract = {
    /**
     * 获取所有可用主题
     * @returns {Promise<ServiceResponse>} 主题列表
     */
    getAvailableThemes: () => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 获取当前主题
     * @returns {Promise<ServiceResponse>} 当前主题配置
     */
    getCurrentTheme: () => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 应用主题
     * @param {string} themeId 主题ID
     * @param {Object} [options] 应用选项
     * @returns {Promise<ServiceResponse>} 应用结果
     */
    applyTheme: (themeId, options = {}) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 创建自定义主题
     * @param {ThemeConfig} themeConfig 主题配置
     * @returns {Promise<ServiceResponse>} 创建结果
     */
    createCustomTheme: (themeConfig) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 更新主题配置
     * @param {string} themeId 主题ID
     * @param {Partial<ThemeConfig>} updates 更新内容
     * @returns {Promise<ServiceResponse>} 更新结果
     */
    updateTheme: (themeId, updates) => Promise.resolve(/** @type {ServiceResponse} */ ({})),

    /**
     * 删除自定义主题
     * @param {string} themeId 主题ID
     * @returns {Promise<ServiceResponse>} 删除结果
     */
    deleteCustomTheme: (themeId) => Promise.resolve(/** @type {ServiceResponse} */ ({}))
};

// ===== 错误类型定义 =====

/**
 * 服务错误类型
 * @enum {string}
 */
export const ErrorTypes = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    DATABASE_ERROR: 'DATABASE_ERROR',
    AUTH_ERROR: 'AUTH_ERROR',
    NOT_FOUND: 'NOT_FOUND',
    DUPLICATE: 'DUPLICATE',
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    TIMEOUT: 'TIMEOUT',
    INTERNAL_ERROR: 'INTERNAL_ERROR'
};

// 为向后兼容性保留旧名称
export const ServiceErrorTypes = ErrorTypes;

/**
 * 标准化错误结构
 * @typedef {Object} ServiceError
 * @property {string} type - 错误类型
 * @property {string} message - 错误信息
 * @property {string} [code] - 错误代码
 * @property {Object} [details] - 错误详情
 * @property {Error} [originalError] - 原始错误对象
 * @property {number} [timestamp] - 错误时间戳
 */

// ===== 工具函数 =====

/**
 * 创建标准化成功响应
 * @param {*} data 响应数据
 * @param {string} [message] 成功信息
 * @param {Object} [metadata] 元数据
 * @returns {ServiceResponse} 标准响应对象
 */
export function createSuccessResponse(data, message = '操作成功', metadata = {}) {
    return {
        success: true,
        data,
        message,
        timestamp: Date.now(),
        metadata
    };
}

/**
 * 创建标准化错误响应
 * @param {string|ServiceError} error 错误信息或错误对象
 * @param {string} [type] 错误类型
 * @param {Object} [details] 错误详情
 * @returns {ServiceResponse} 标准响应对象
 */
export function createErrorResponse(error, type = ErrorTypes.INTERNAL_ERROR, details = {}) {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    return {
        success: false,
        error: errorMessage,
        type,
        details,
        timestamp: Date.now()
    };
}

/**
 * 验证服务响应结构
 * @param {*} response 响应对象
 * @returns {boolean} 是否有效
 */
export function isValidServiceResponse(response) {
    return (
        typeof response === 'object' &&
        response !== null &&
        typeof response.success === 'boolean' &&
        (response.success ? 'data' in response : 'error' in response)
    );
}

/**
 * 格式化分页响应
 * @param {Array} items 数据项
 * @param {number} total 总数量
 * @param {PaginationOptions} options 分页选项
 * @returns {PaginatedResponse} 分页响应对象
 */
export function formatPaginatedResponse(items, total, options) {
    const { page = 1, limit = 20 } = options;
    const totalPages = Math.ceil(total / limit);
    
    return {
        items,
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
    };
}

// ===== 契约验证器 =====

/**
 * 验证 API 请求参数
 * @param {Object} params 请求参数
 * @param {Object} schema 参数架构
 * @throws {Error} 验证失败时抛出错误
 */
export function validateApiParams(params, schema) {
    // 实现参数验证逻辑
    // 这里可以集成 Joi、Yup 等验证库
    for (const [key, rules] of Object.entries(schema)) {
        if (rules.required && !(key in params)) {
            throw new Error(`Missing required parameter: ${key}`);
        }
        
        if (key in params && rules.type && typeof params[key] !== rules.type) {
            throw new Error(`Invalid type for parameter ${key}: expected ${rules.type}, got ${typeof params[key]}`);
        }
    }
}

/**
 * 契约合规性检查装饰器
 * @param {Object} contract 契约对象
 * @returns {Function} 装饰器函数
 */
export function contractCompliant(contract) {
    return function(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function(...args) {
            try {
                // 执行原方法
                const result = await originalMethod.apply(this, args);
                
                // 验证返回值是否符合契约
                if (!isValidServiceResponse(result)) {
                    console.warn(`Method ${propertyKey} returned non-compliant response structure`);
                }
                
                return result;
                
            } catch (error) {
                // 确保错误响应也符合契约
                return createErrorResponse(error);
            }
        };
        
        return descriptor;
    };
}

// 导出契约集合
export const ServiceContracts = {
    Api: ApiServiceContract,
    Backup: BackupServiceContract,
    Theme: ThemeServiceContract,
    Data: DataServiceContract
};

// 版本信息
export const CONTRACT_VERSION = '1.0.0';
export const LAST_UPDATED = '2025-08-26';