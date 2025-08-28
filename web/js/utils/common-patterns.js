/**
 * 通用代码复用工具库
 * 消除项目中的重复代码模式，提供统一的工具函数
 * 遵循DRY原则和SOLID设计原则
 */

import { getDB } from '../core/db.js';
import { eventBus } from '../core/event-bus.js';
import { createSuccessResponse, createErrorResponse } from '../services/contracts.js';
import { showError, showWarning, showSuccess } from './notify.js';

/**
 * 通用异步操作包装器
 * 统一处理try-catch、错误日志和服务响应格式
 */
export class AsyncOperationWrapper {
    /**
     * 包装异步操作，统一错误处理
     * @param {Function} operation 异步操作函数
     * @param {Object} options 配置选项
     * @returns {Promise<Object>} 服务响应格式
     */
    static async execute(operation, options = {}) {
        const {
            operationName = 'Unknown Operation',
            errorType = 'OPERATION_ERROR',
            showUserError = false,
            logError = true,
            emitEvent = false,
            eventName = null,
            timeout = 30000 // 30秒超时
        } = options;
        
        const startTime = performance.now();
        
        try {
            // 设置超时
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Operation timeout')), timeout);
            });
            
            // 执行操作
            const result = await Promise.race([
                operation(),
                timeoutPromise
            ]);
            
            const duration = Math.round(performance.now() - startTime);
            
            // 发送成功事件
            if (emitEvent && eventName) {
                eventBus.emit(`${eventName}.success`, {
                    result,
                    duration,
                    operationName,
                    timestamp: Date.now()
                });
            }
            
            // 返回成功响应
            if (result && typeof result === 'object' && result.success !== undefined) {
                return result; // 已经是服务响应格式
            }
            
            return createSuccessResponse(result, `${operationName}执行成功`, {
                duration,
                operationName
            });
            
        } catch (error) {
            const duration = Math.round(performance.now() - startTime);
            
            // 记录错误日志
            if (logError) {
                console.error(`❌ ${operationName} failed:`, error);
            }
            
            // 显示用户错误提示
            if (showUserError) {
                showError(`${operationName}失败: ${error.message}`);
            }
            
            // 发送错误事件
            if (emitEvent && eventName) {
                eventBus.emit(`${eventName}.error`, {
                    error: error.message,
                    duration,
                    operationName,
                    timestamp: Date.now()
                });
            }
            
            return createErrorResponse(error.message, errorType, {
                duration,
                operationName,
                stack: error.stack
            });
        }
    }
    
    /**
     * 批量执行异步操作
     * @param {Array} operations 操作数组
     * @param {Object} options 配置选项
     * @returns {Promise<Array>} 结果数组
     */
    static async executeBatch(operations, options = {}) {
        const {
            concurrency = 5,
            failFast = false,
            operationName = 'Batch Operations'
        } = options;
        
        const results = [];
        const chunks = this.chunkArray(operations, concurrency);
        
        for (const chunk of chunks) {
            const chunkPromises = chunk.map(async (op, index) => {
                try {
                    const result = await this.execute(op.operation, {
                        ...options,
                        operationName: op.name || `${operationName} ${index + 1}`
                    });
                    return { index: op.index || index, result, success: true };
                } catch (error) {
                    if (failFast) throw error;
                    return { index: op.index || index, error, success: false };
                }
            });
            
            const chunkResults = await Promise.all(chunkPromises);
            results.push(...chunkResults);
        }
        
        return results;
    }
    
    /**
     * 数组分块工具
     */
    static chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }
}

/**
 * 数据库操作通用包装器
 * 统一数据库连接检查、事务处理和错误处理
 */
export class DatabaseOperationWrapper {
    /**
     * 执行数据库查询操作
     * @param {Function} operation 数据库操作函数
     * @param {Object} options 配置选项
     * @returns {Promise<Object>} 服务响应格式
     */
    static async query(operation, options = {}) {
        const {
            operationName = 'Database Query',
            useTransaction = false,
            transactionMode = 'rw',
            tables = []
        } = options;
        
        return await AsyncOperationWrapper.execute(async () => {
            const db = getDB();
            if (!db) {
                throw new Error('Database not available');
            }
            
            if (useTransaction && tables.length > 0) {
                return await db.transaction(transactionMode, tables, async () => {
                    return await operation(db);
                });
            } else {
                return await operation(db);
            }
        }, {
            ...options,
            operationName,
            errorType: 'DATABASE_ERROR'
        });
    }
    
    /**
     * 执行数据库写入操作
     * @param {Function} operation 写入操作函数
     * @param {Object} options 配置选项
     * @returns {Promise<Object>} 服务响应格式
     */
    static async write(operation, options = {}) {
        return await this.query(operation, {
            ...options,
            useTransaction: true,
            transactionMode: 'rw',
            operationName: options.operationName || 'Database Write'
        });
    }
    
    /**
     * 执行数据库读取操作
     * @param {Function} operation 读取操作函数
     * @param {Object} options 配置选项
     * @returns {Promise<Object>} 服务响应格式
     */
    static async read(operation, options = {}) {
        return await this.query(operation, {
            ...options,
            useTransaction: false,
            operationName: options.operationName || 'Database Read'
        });
    }
    
    /**
     * 通用的分页查询
     * @param {string} tableName 表名
     * @param {Object} options 查询选项
     * @returns {Promise<Object>} 分页结果
     */
    static async paginate(tableName, options = {}) {
        const {
            page = 1,
            limit = 20,
            orderBy = null,
            where = null,
            orderDirection = 'asc'
        } = options;
        
        return await this.read(async (db) => {
            let query = db[tableName];
            
            // 应用where条件
            if (where) {
                if (Array.isArray(where) && where.length === 2) {
                    query = query.where(where[0]).equals(where[1]);
                } else if (typeof where === 'object') {
                    const [field, value] = Object.entries(where)[0];
                    query = query.where(field).equals(value);
                }
            }
            
            // 应用排序
            if (orderBy) {
                query = query.orderBy(orderBy);
                if (orderDirection === 'desc') {
                    query = query.reverse();
                }
            }
            
            // 计算偏移量
            const offset = (page - 1) * limit;
            
            // 获取总数和分页数据
            const [total, items] = await Promise.all([
                where ? query.count() : db[tableName].count(),
                query.offset(offset).limit(limit).toArray()
            ]);
            
            return {
                items,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    hasNext: page * limit < total,
                    hasPrev: page > 1
                }
            };
        }, {
            operationName: `Paginate ${tableName}`,
            ...options
        });
    }
    
    /**
     * 通用的批量插入
     * @param {string} tableName 表名
     * @param {Array} items 要插入的项目
     * @param {Object} options 配置选项
     * @returns {Promise<Object>} 插入结果
     */
    static async bulkInsert(tableName, items, options = {}) {
        const { batchSize = 100 } = options;
        
        return await this.write(async (db) => {
            const results = [];
            const batches = AsyncOperationWrapper.chunkArray(items, batchSize);
            
            for (const batch of batches) {
                const batchResult = await db[tableName].bulkAdd(batch);
                results.push(...batchResult);
            }
            
            return {
                insertedCount: results.length,
                insertedIds: results
            };
        }, {
            operationName: `Bulk Insert ${tableName}`,
            tables: [tableName],
            ...options
        });
    }
    
    /**
     * 通用的软删除（标记为已删除）
     * @param {string} tableName 表名
     * @param {string} id 项目ID
     * @param {Object} options 配置选项
     * @returns {Promise<Object>} 删除结果
     */
    static async softDelete(tableName, id, options = {}) {
        return await this.write(async (db) => {
            const item = await db[tableName].get(id);
            if (!item) {
                throw new Error(`Item with id ${id} not found in ${tableName}`);
            }
            
            await db[tableName].update(id, {
                deletedAt: new Date().toISOString(),
                isDeleted: true
            });
            
            return { id, deletedAt: new Date().toISOString() };
        }, {
            operationName: `Soft Delete ${tableName}`,
            tables: [tableName],
            ...options
        });
    }
}

/**
 * 表单操作通用包装器
 * 统一表单验证、数据处理和提交逻辑
 */
export class FormOperationWrapper {
    /**
     * 处理表单提交
     * @param {HTMLFormElement|Object} formOrData 表单元素或数据对象
     * @param {Object} options 配置选项
     * @returns {Promise<Object>} 处理结果
     */
    static async handleSubmit(formOrData, options = {}) {
        const {
            validator = null,
            processor = null,
            submitHandler = null,
            successMessage = '操作成功',
            showSuccessToast = true,
            resetForm = false
        } = options;
        
        return await AsyncOperationWrapper.execute(async () => {
            // 获取表单数据
            let formData;
            let formElement = null;
            
            if (formOrData instanceof HTMLFormElement) {
                formElement = formOrData;
                formData = new FormData(formElement);
                const dataObj = {};
                for (const [key, value] of formData.entries()) {
                    dataObj[key] = value;
                }
                formData = dataObj;
            } else {
                formData = formOrData;
            }
            
            // 数据验证
            if (validator) {
                const validationResult = await validator(formData);
                if (!validationResult.valid) {
                    throw new Error(validationResult.error || '数据验证失败');
                }
                formData = validationResult.data || formData;
            }
            
            // 数据处理
            if (processor) {
                formData = await processor(formData);
            }
            
            // 提交处理
            let result = formData;
            if (submitHandler) {
                result = await submitHandler(formData);
            }
            
            // 成功后处理
            if (showSuccessToast) {
                showSuccess(successMessage);
            }
            
            if (resetForm && formElement) {
                formElement.reset();
            }
            
            return result;
            
        }, {
            operationName: 'Form Submit',
            errorType: 'FORM_ERROR',
            showUserError: true,
            ...options
        });
    }
    
    /**
     * 处理表单字段变更
     * @param {HTMLInputElement} field 字段元素
     * @param {Object} options 配置选项
     */
    static handleFieldChange(field, options = {}) {
        const {
            validator = null,
            debounceMs = 300,
            onValid = null,
            onInvalid = null
        } = options;
        
        let timeoutId = null;
        
        const validateField = async () => {
            if (!validator) return;
            
            try {
                const result = await validator(field.value);
                
                if (result.valid) {
                    field.classList.remove('invalid');
                    field.classList.add('valid');
                    if (onValid) onValid(result);
                } else {
                    field.classList.remove('valid');
                    field.classList.add('invalid');
                    if (onInvalid) onInvalid(result);
                }
            } catch (error) {
                field.classList.remove('valid');
                field.classList.add('invalid');
                if (onInvalid) onInvalid({ valid: false, error: error.message });
            }
        };
        
        field.addEventListener('input', () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(validateField, debounceMs);
        });
        
        field.addEventListener('blur', validateField);
    }
}

/**
 * API操作通用包装器
 * 统一API调用、错误处理和响应格式化
 */
export class ApiOperationWrapper {
    /**
     * 执行API调用
     * @param {Function} apiCall API调用函数
     * @param {Object} options 配置选项
     * @returns {Promise<Object>} 服务响应格式
     */
    static async call(apiCall, options = {}) {
        const {
            operationName = 'API Call',
            retries = 3,
            retryDelay = 1000,
            timeout = 30000
        } = options;
        
        let lastError = null;
        
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await AsyncOperationWrapper.execute(apiCall, {
                    ...options,
                    operationName: attempt > 0 ? `${operationName} (Retry ${attempt})` : operationName,
                    timeout,
                    errorType: 'API_ERROR'
                });
            } catch (error) {
                lastError = error;
                
                if (attempt < retries) {
                    console.warn(`⚠️ ${operationName} attempt ${attempt + 1} failed, retrying in ${retryDelay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
                }
            }
        }
        
        throw lastError;
    }
}

/**
 * 事件操作通用包装器
 * 统一事件处理、错误捕获和内存清理
 */
export class EventOperationWrapper {
    /**
     * 安全的事件处理器包装
     * @param {Function} handler 事件处理函数
     * @param {Object} options 配置选项
     * @returns {Function} 包装后的处理函数
     */
    static wrapHandler(handler, options = {}) {
        const {
            operationName = 'Event Handler',
            logErrors = true,
            preventDefault = false,
            stopPropagation = false
        } = options;
        
        return async (event) => {
            try {
                if (preventDefault) {
                    event.preventDefault();
                }
                
                if (stopPropagation) {
                    event.stopPropagation();
                }
                
                return await handler(event);
                
            } catch (error) {
                if (logErrors) {
                    console.error(`❌ ${operationName} error:`, error);
                }
                
                // 可选：显示用户友好错误
                if (options.showUserError) {
                    showError(`${operationName}执行失败`);
                }
            }
        };
    }
    
    /**
     * 批量添加事件监听器
     * @param {Array} bindings 绑定配置数组
     * @returns {Function} 清理函数
     */
    static addEventListeners(bindings) {
        const cleanupFunctions = [];
        
        for (const binding of bindings) {
            const { element, event, handler, options = {} } = binding;
            const wrappedHandler = this.wrapHandler(handler, options);
            
            element.addEventListener(event, wrappedHandler, options.eventOptions);
            
            cleanupFunctions.push(() => {
                element.removeEventListener(event, wrappedHandler, options.eventOptions);
            });
        }
        
        return () => {
            cleanupFunctions.forEach(cleanup => cleanup());
        };
    }
}

/**
 * 日志操作统一工具
 * 提供结构化日志记录和调试信息
 */
export class LoggerUtils {
    static logLevels = {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    };
    
    static currentLevel = LoggerUtils.logLevels.INFO;
    
    /**
     * 结构化日志记录
     * @param {string} level 日志级别
     * @param {string} operation 操作名称
     * @param {string} message 消息
     * @param {Object} metadata 元数据
     */
    static log(level, operation, message, metadata = {}) {
        const levelValue = this.logLevels[level.toUpperCase()] || this.logLevels.INFO;
        
        if (levelValue > this.currentLevel) return;
        
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            operation,
            message,
            ...metadata
        };
        
        const emoji = {
            ERROR: '❌',
            WARN: '⚠️',
            INFO: '💡',
            DEBUG: '🔍'
        }[level.toUpperCase()] || '📝';
        
        console.log(`${emoji} [${timestamp}] ${operation}: ${message}`, metadata);
        
        // 可选：发送到日志收集系统
        if (this.logCollector) {
            this.logCollector(logEntry);
        }
    }
    
    static error(operation, message, metadata = {}) {
        this.log('ERROR', operation, message, metadata);
    }
    
    static warn(operation, message, metadata = {}) {
        this.log('WARN', operation, message, metadata);
    }
    
    static info(operation, message, metadata = {}) {
        this.log('INFO', operation, message, metadata);
    }
    
    static debug(operation, message, metadata = {}) {
        this.log('DEBUG', operation, message, metadata);
    }
    
    /**
     * 设置日志收集器
     * @param {Function} collector 收集器函数
     */
    static setLogCollector(collector) {
        this.logCollector = collector;
    }
    
    /**
     * 设置日志级别
     * @param {string} level 日志级别
     */
    static setLevel(level) {
        this.currentLevel = this.logLevels[level.toUpperCase()] || this.logLevels.INFO;
    }
}

// 便捷导出
export const AsyncOp = AsyncOperationWrapper;
export const DatabaseOp = DatabaseOperationWrapper;
export const FormOp = FormOperationWrapper;
export const ApiOp = ApiOperationWrapper;
export const EventOp = EventOperationWrapper;
export const Logger = LoggerUtils;