/**
 * 备份服务层
 * 统一管理数据的导入导出、版本控制和压缩功能
 * 
 * @fileoverview 备份服务实现，遵循BackupServiceContract规范
 * @version 1.1
 * @author EPhone Development Team
 * @implements {BackupServiceContract}
 */

import { getDB } from '../core/db.js';
import { eventBus, EventTypes } from '../core/event-bus.js';
import { showSuccess, showError, showWarning, showInfo } from '../utils/notify.js';
import { formatDate } from '../utils/format.js';
import { createSuccessResponse, createErrorResponse, contractCompliant } from './contracts.js';

/**
 * 备份配置常量
 */
const BACKUP_CONFIG = {
    version: '1.1',
    maxFileSize: 50 * 1024 * 1024, // 50MB最大备份文件大小
    compressionLevel: 6, // 压缩级别(0-9)
    chunkSize: 1024 * 1024, // 1MB分块大小
    supportedFormats: ['json', 'zip'],
    dataTypes: [
        'plugins',
        'memories', 
        'chats',
        'messages',
        'presets',
        'worldBooks',
        'globalSettings'
    ]
};

/**
 * 数据结构版本映射
 */
const SCHEMA_VERSIONS = {
    '1.0': {
        plugins: 'v1',
        memories: 'v1', 
        chats: 'v1',
        messages: 'v1',
        presets: 'v1',
        worldBooks: 'v1',
        globalSettings: 'v1'
    },
    '1.1': {
        plugins: 'v2',
        memories: 'v2',
        chats: 'v1', 
        messages: 'v1',
        presets: 'v2',
        worldBooks: 'v1',
        globalSettings: 'v1'
    }
};

/**
 * 备份服务类
 */
class BackupService {
    constructor() {
        this.currentVersion = BACKUP_CONFIG.version;
        this.isProcessing = false;
        this.abortController = null;
    }

    /**
     * 初始化备份服务
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            console.log('Initializing backup service...');
            
            // 检查本地存储权限
            if (typeof localStorage === 'undefined') {
                throw new Error('localStorage is not available');
            }
            
            // 初始化备份历史
            if (!localStorage.getItem('backupHistory')) {
                localStorage.setItem('backupHistory', JSON.stringify([]));
            }
            
            console.log('Backup service initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize backup service:', error);
            throw error;
        }
    }

    /**
     * 创建完整备份
     * @param {Object} options 备份选项
     * @returns {Promise<Object>} 备份结果
     */
    async createFullBackup(options = {}) {
        if (this.isProcessing) {
            throw new Error('Backup is already in progress');
        }

        const {
            includeTypes = BACKUP_CONFIG.dataTypes,
            compress = true,
            filename = null,
            excludeMessages = false
        } = options;

        this.isProcessing = true;
        this.abortController = new AbortController();

        try {
            // 发送开始事件
            await eventBus.emit(EventTypes.BACKUP_STARTED, {
                type: 'full',
                includeTypes,
                timestamp: Date.now()
            });

            // 创建备份数据结构
            const backupData = await this.gatherBackupData(includeTypes, excludeMessages);
            
            // 验证数据完整性
            await this.validateBackupData(backupData);

            // 压缩（如果需要）
            let finalData = backupData;
            if (compress) {
                finalData = await this.compressBackup(backupData);
            }

            // 生成文件名
            const finalFilename = filename || this.generateBackupFilename('full', compress);

            // 创建下载
            const downloadUrl = await this.createDownloadUrl(finalData, compress);

            // 发送完成事件
            await eventBus.emit(EventTypes.BACKUP_COMPLETED, {
                type: 'full',
                filename: finalFilename,
                size: this.getDataSize(finalData),
                compressed: compress,
                timestamp: Date.now()
            });

            showSuccess('完整备份创建成功');

            return {
                success: true,
                filename: finalFilename,
                downloadUrl,
                size: this.getDataSize(finalData),
                dataTypes: includeTypes,
                compressed: compress
            };

        } catch (error) {
            await this.handleBackupError('full', error);
            throw error;

        } finally {
            this.isProcessing = false;
            this.abortController = null;
        }
    }

    /**
     * 创建增量备份
     * @param {Date} since 起始时间
     * @param {Object} options 选项
     * @returns {Promise<Object>} 备份结果
     */
    async createIncrementalBackup(since, options = {}) {
        if (this.isProcessing) {
            throw new Error('Backup is already in progress');
        }

        const {
            includeTypes = BACKUP_CONFIG.dataTypes,
            compress = true,
            filename = null
        } = options;

        this.isProcessing = true;
        this.abortController = new AbortController();

        try {
            // 获取增量数据
            const incrementalData = await this.gatherIncrementalData(since, includeTypes);

            if (this.isEmpty(incrementalData)) {
                return {
                    success: true,
                    message: '没有需要备份的新数据',
                    empty: true
                };
            }

            // 创建增量备份结构
            const backupData = {
                version: this.currentVersion,
                type: 'incremental',
                since: since.toISOString(),
                timestamp: new Date().toISOString(),
                schemaVersion: SCHEMA_VERSIONS[this.currentVersion],
                data: incrementalData,
                stats: await this.generateBackupStats(incrementalData)
            };

            // 处理和下载
            let finalData = backupData;
            if (compress) {
                finalData = await this.compressBackup(backupData);
            }

            const finalFilename = filename || this.generateBackupFilename('incremental', compress);
            const downloadUrl = await this.createDownloadUrl(finalData, compress);

            showSuccess('增量备份创建成功');

            return {
                success: true,
                filename: finalFilename,
                downloadUrl,
                size: this.getDataSize(finalData),
                since: since.toISOString(),
                compressed: compress
            };

        } catch (error) {
            await this.handleBackupError('incremental', error);
            throw error;

        } finally {
            this.isProcessing = false;
            this.abortController = null;
        }
    }

    /**
     * 恢复备份数据
     * @param {File|Object} backupData 备份文件或数据对象
     * @param {Object} options 恢复选项
     * @returns {Promise<Object>} 恢复结果
     */
    async restoreBackup(backupData, options = {}) {
        if (this.isProcessing) {
            throw new Error('Another backup operation is in progress');
        }

        const {
            overwrite = false,
            selectiveRestore = null,
            createBackupBeforeRestore = true
        } = options;

        this.isProcessing = true;

        try {
            // 解析备份数据
            let parsedData;
            if (backupData instanceof File) {
                parsedData = await this.parseBackupFile(backupData);
            } else {
                parsedData = backupData;
            }

            // 验证备份数据
            await this.validateRestoreData(parsedData);

            // 创建预恢复备份（如果需要）
            let preRestoreBackup = null;
            if (createBackupBeforeRestore) {
                preRestoreBackup = await this.createPreRestoreBackup();
            }

            // 发送开始事件
            await eventBus.emit(EventTypes.RESTORE_STARTED, {
                version: parsedData.version,
                type: parsedData.type || 'full',
                timestamp: Date.now()
            });

            // 执行恢复
            const restoreResult = await this.executeRestore(parsedData, {
                overwrite,
                selectiveRestore
            });

            // 发送完成事件
            await eventBus.emit(EventTypes.RESTORE_COMPLETED, {
                restoredTypes: Object.keys(restoreResult.restored),
                timestamp: Date.now()
            });

            showSuccess('数据恢复完成');

            return {
                success: true,
                restored: restoreResult.restored,
                preRestoreBackup,
                version: parsedData.version,
                message: '数据恢复成功'
            };

        } catch (error) {
            await this.handleRestoreError(error);
            throw error;

        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * 收集备份数据
     * @param {Array} includeTypes 包含的数据类型
     * @param {boolean} excludeMessages 是否排除消息
     * @returns {Promise<Object>} 备份数据
     */
    async gatherBackupData(includeTypes, excludeMessages = false) {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const data = {};
        const stats = {};

        for (const type of includeTypes) {
            // 排除消息（如果指定）
            if (excludeMessages && type === 'messages') {
                continue;
            }

            try {
                const collection = db[type];
                if (collection) {
                    const items = await collection.toArray();
                    data[type] = items;
                    stats[type] = {
                        count: items.length,
                        size: this.getDataSize(items)
                    };

                    // 检查是否需要中断
                    if (this.abortController?.signal.aborted) {
                        throw new Error('Backup cancelled by user');
                    }
                }
            } catch (error) {
                console.warn(`Failed to backup ${type}:`, error);
                stats[type] = { error: error.message };
            }
        }

        return {
            version: this.currentVersion,
            type: 'full',
            timestamp: new Date().toISOString(),
            schemaVersion: SCHEMA_VERSIONS[this.currentVersion],
            data,
            stats: {
                totalTypes: includeTypes.length,
                exportedTypes: Object.keys(data).length,
                details: stats,
                totalSize: this.getDataSize(data)
            }
        };
    }

    /**
     * 收集增量数据
     * @param {Date} since 起始时间
     * @param {Array} includeTypes 包含的数据类型
     * @returns {Promise<Object>} 增量数据
     */
    async gatherIncrementalData(since, includeTypes) {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const data = {};
        const sinceISOString = since.toISOString();

        for (const type of includeTypes) {
            try {
                const collection = db[type];
                if (collection) {
                    // 查询修改时间晚于指定时间的记录
                    const items = await collection
                        .where('updatedAt')
                        .above(sinceISOString)
                        .toArray();
                    
                    if (items.length > 0) {
                        data[type] = items;
                    }
                }
            } catch (error) {
                console.warn(`Failed to get incremental data for ${type}:`, error);
            }
        }

        return data;
    }

    /**
     * 压缩备份数据
     * @param {Object} data 原始数据
     * @returns {Promise<Blob>} 压缩后的数据
     */
    async compressBackup(data) {
        // 注意：这里使用简单的JSON压缩
        // 在实际应用中，可以使用pako或其他压缩库
        
        const jsonString = JSON.stringify(data, null, 0);
        
        // 模拟压缩（实际中应该使用真正的压缩算法）
        const compressedString = this.simpleCompress(jsonString);
        
        return new Blob([compressedString], { 
            type: 'application/json' 
        });
    }

    /**
     * 简单压缩算法（占位，实际应使用专业压缩库）
     * @param {string} str 输入字符串
     * @returns {string} 压缩后字符串
     */
    simpleCompress(str) {
        // 这是一个占位实现
        // 在生产环境中应该使用pako、lz4或其他压缩库
        return str.replace(/\s+/g, ' ').trim();
    }

    /**
     * 解析备份文件
     * @param {File} file 备份文件
     * @returns {Promise<Object>} 解析后的数据
     */
    async parseBackupFile(file) {
        if (file.size > BACKUP_CONFIG.maxFileSize) {
            throw new Error(`文件太大，最大支持 ${BACKUP_CONFIG.maxFileSize / 1024 / 1024}MB`);
        }

        const text = await file.text();
        
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error('备份文件格式无效');
        }
    }

    /**
     * 执行数据恢复
     * @param {Object} backupData 备份数据
     * @param {Object} options 恢复选项
     * @returns {Promise<Object>} 恢复结果
     */
    async executeRestore(backupData, options = {}) {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const { overwrite, selectiveRestore } = options;
        const restored = {};
        const errors = {};

        const dataToRestore = selectiveRestore ? 
            this.filterSelectiveData(backupData.data, selectiveRestore) : 
            backupData.data;

        for (const [type, items] of Object.entries(dataToRestore)) {
            try {
                const collection = db[type];
                if (!collection) {
                    errors[type] = 'Collection not found';
                    continue;
                }

                if (overwrite) {
                    // 清空现有数据
                    await collection.clear();
                    // 批量插入
                    await collection.bulkAdd(items);
                } else {
                    // 逐个处理，避免ID冲突
                    const addedCount = await this.mergeRestoreData(collection, items);
                    restored[type] = { added: addedCount };
                }

                restored[type] = { 
                    count: items.length,
                    mode: overwrite ? 'overwrite' : 'merge'
                };

            } catch (error) {
                console.error(`Failed to restore ${type}:`, error);
                errors[type] = error.message;
            }
        }

        if (Object.keys(errors).length > 0) {
            console.warn('Some data types failed to restore:', errors);
        }

        return { restored, errors };
    }

    /**
     * 合并恢复数据（避免ID冲突）
     * @param {Object} collection 数据库集合
     * @param {Array} items 要恢复的项目
     * @returns {Promise<number>} 成功添加的数量
     */
    async mergeRestoreData(collection, items) {
        let addedCount = 0;

        for (const item of items) {
            try {
                // 检查是否已存在
                const existing = await collection.get(item.id);
                
                if (!existing) {
                    await collection.add(item);
                    addedCount++;
                } else {
                    // 可以选择更新或跳过
                    // 这里选择更新
                    await collection.put(item);
                }
            } catch (error) {
                console.warn(`Failed to restore item ${item.id}:`, error);
            }
        }

        return addedCount;
    }

    /**
     * 创建预恢复备份
     * @returns {Promise<Object>} 备份信息
     */
    async createPreRestoreBackup() {
        const filename = `pre-restore-${Date.now()}.json`;
        
        return await this.createFullBackup({
            filename,
            compress: false
        });
    }

    /**
     * 验证备份数据
     * @param {Object} data 备份数据
     */
    async validateBackupData(data) {
        if (!data.version) {
            throw new Error('备份数据缺少版本信息');
        }

        if (!data.timestamp) {
            throw new Error('备份数据缺少时间戳');
        }

        if (!data.data || typeof data.data !== 'object') {
            throw new Error('备份数据格式无效');
        }

        // 检查数据完整性
        const totalItems = Object.values(data.data).reduce((sum, items) => {
            return sum + (Array.isArray(items) ? items.length : 0);
        }, 0);

        if (totalItems === 0) {
            showWarning('备份数据为空');
        }
    }

    /**
     * 验证恢复数据
     * @param {Object} data 恢复数据
     */
    async validateRestoreData(data) {
        await this.validateBackupData(data);

        // 检查版本兼容性
        if (this.compareVersions(data.version, this.currentVersion) > 0) {
            throw new Error('备份版本过高，请升级应用程序');
        }

        // 检查架构版本
        if (data.schemaVersion) {
            await this.validateSchemaVersion(data.schemaVersion);
        }
    }

    /**
     * 验证架构版本
     * @param {Object} schemaVersion 架构版本信息
     */
    async validateSchemaVersion(schemaVersion) {
        const currentSchema = SCHEMA_VERSIONS[this.currentVersion];
        
        for (const [type, version] of Object.entries(schemaVersion)) {
            if (currentSchema[type] && currentSchema[type] !== version) {
                showWarning(`数据类型 ${type} 的架构版本不匹配，可能影响恢复结果`);
            }
        }
    }

    /**
     * 生成备份文件名
     * @param {string} type 备份类型
     * @param {boolean} compressed 是否压缩
     * @returns {string} 文件名
     */
    generateBackupFilename(type, compressed = false) {
        const timestamp = formatDate(new Date(), 'yyyyMMdd-HHmmss');
        const extension = compressed ? 'zip' : 'json';
        return `ephone-backup-${type}-${timestamp}.${extension}`;
    }

    /**
     * 创建下载URL
     * @param {Object|Blob} data 数据
     * @param {boolean} isCompressed 是否已压缩
     * @returns {string} 下载URL
     */
    async createDownloadUrl(data, isCompressed = false) {
        let blob;
        
        if (data instanceof Blob) {
            blob = data;
        } else {
            const jsonString = JSON.stringify(data, null, 2);
            blob = new Blob([jsonString], { type: 'application/json' });
        }

        return URL.createObjectURL(blob);
    }

    /**
     * 获取数据大小
     * @param {any} data 数据对象
     * @returns {number} 大小（字节）
     */
    getDataSize(data) {
        return new Blob([JSON.stringify(data)]).size;
    }

    /**
     * 检查数据是否为空
     * @param {Object} data 数据对象
     * @returns {boolean} 是否为空
     */
    isEmpty(data) {
        return Object.keys(data).length === 0 || 
               Object.values(data).every(arr => !Array.isArray(arr) || arr.length === 0);
    }

    /**
     * 过滤选择性数据
     * @param {Object} data 原始数据
     * @param {Array} selected 选中的类型
     * @returns {Object} 过滤后的数据
     */
    filterSelectiveData(data, selected) {
        const filtered = {};
        
        for (const type of selected) {
            if (data[type]) {
                filtered[type] = data[type];
            }
        }

        return filtered;
    }

    /**
     * 生成备份统计信息
     * @param {Object} data 备份数据
     * @returns {Object} 统计信息
     */
    async generateBackupStats(data) {
        const stats = {};
        let totalItems = 0;
        let totalSize = 0;

        for (const [type, items] of Object.entries(data)) {
            const itemCount = Array.isArray(items) ? items.length : 0;
            const itemSize = this.getDataSize(items);
            
            stats[type] = {
                count: itemCount,
                size: itemSize,
                sizeFormatted: this.formatBytes(itemSize)
            };

            totalItems += itemCount;
            totalSize += itemSize;
        }

        stats.summary = {
            totalItems,
            totalSize,
            totalSizeFormatted: this.formatBytes(totalSize),
            dataTypes: Object.keys(data).length
        };

        return stats;
    }

    /**
     * 格式化字节大小
     * @param {number} bytes 字节数
     * @returns {string} 格式化后的大小
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * 比较版本号
     * @param {string} v1 版本1
     * @param {string} v2 版本2
     * @returns {number} 比较结果 (-1, 0, 1)
     */
    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        const maxLength = Math.max(parts1.length, parts2.length);

        for (let i = 0; i < maxLength; i++) {
            const part1 = parts1[i] || 0;
            const part2 = parts2[i] || 0;

            if (part1 < part2) return -1;
            if (part1 > part2) return 1;
        }

        return 0;
    }

    /**
     * 处理备份错误
     * @param {string} type 备份类型
     * @param {Error} error 错误对象
     */
    async handleBackupError(type, error) {
        await eventBus.emit(EventTypes.BACKUP_ERROR, {
            type,
            error: error.message,
            timestamp: Date.now()
        });

        showError(`${type === 'full' ? '完整' : '增量'}备份失败: ${error.message}`);
    }

    /**
     * 处理恢复错误
     * @param {Error} error 错误对象
     */
    async handleRestoreError(error) {
        await eventBus.emit(EventTypes.RESTORE_ERROR, {
            error: error.message,
            timestamp: Date.now()
        });

        showError(`数据恢复失败: ${error.message}`);
    }

    /**
     * 取消当前操作
     */
    cancelCurrentOperation() {
        if (this.abortController) {
            this.abortController.abort();
            showInfo('操作已取消');
        }
    }

    /**
     * 获取处理状态
     * @returns {boolean} 是否正在处理
     */
    isProcessingBackup() {
        return this.isProcessing;
    }

    // ===== 契约遵循方法 =====

    /**
     * 导出完整备份 (契约方法)
     * @param {Object} options 备份选项
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async exportFullBackup(options = {}) {
        try {
            const result = await this.createFullBackup(options);
            return createSuccessResponse(result.downloadUrl, '完整备份创建成功', {
                filename: result.filename,
                size: result.size,
                compressed: result.compressed
            });
        } catch (error) {
            return createErrorResponse(error.message, 'BACKUP_ERROR');
        }
    }

    /**
     * 导出增量备份 (契约方法)
     * @param {Date} since 起始时间
     * @param {Object} options 备份选项
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async exportIncrementalBackup(since = new Date(Date.now() - 24 * 60 * 60 * 1000), options = {}) {
        try {
            const result = await this.createIncrementalBackup(since, options);
            if (result.empty) {
                return createSuccessResponse(null, '没有需要备份的新数据');
            }
            return createSuccessResponse(result.downloadUrl, '增量备份创建成功', {
                filename: result.filename,
                size: result.size,
                since: result.since
            });
        } catch (error) {
            return createErrorResponse(error.message, 'BACKUP_ERROR');
        }
    }

    /**
     * 导出选择性备份 (契约方法)
     * @param {Array<string>} categories 数据类别
     * @param {Object} options 备份选项
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async exportSelectiveBackup(categories, options = {}) {
        try {
            const selectiveOptions = {
                ...options,
                includeTypes: categories
            };
            const result = await this.createFullBackup(selectiveOptions);
            return createSuccessResponse(result.downloadUrl, '选择性备份创建成功', {
                filename: result.filename,
                categories,
                size: result.size
            });
        } catch (error) {
            return createErrorResponse(error.message, 'BACKUP_ERROR');
        }
    }

    /**
     * 导入完整备份 (契约方法)
     * @param {string|Object} backupData 备份数据
     * @param {Object} options 导入选项
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async importFullBackup(backupData, options = {}) {
        try {
            // 解析备份数据
            let parsedData;
            if (typeof backupData === 'string') {
                parsedData = JSON.parse(backupData);
            } else {
                parsedData = backupData;
            }

            const result = await this.restoreBackup(parsedData, {
                overwrite: true,
                ...options
            });

            return createSuccessResponse(result, '数据导入成功', {
                restored: result.restored,
                version: result.version
            });
        } catch (error) {
            return createErrorResponse(error.message, 'RESTORE_ERROR');
        }
    }

    /**
     * 导入选择性备份 (契约方法)
     * @param {string|Object} backupData 备份数据
     * @param {Array<string>} categories 要导入的类别
     * @param {Object} options 导入选项
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async importSelectiveBackup(backupData, categories, options = {}) {
        try {
            // 解析备份数据
            let parsedData;
            if (typeof backupData === 'string') {
                parsedData = JSON.parse(backupData);
            } else {
                parsedData = backupData;
            }

            const result = await this.restoreBackup(parsedData, {
                selectiveRestore: categories,
                overwrite: false,
                ...options
            });

            return createSuccessResponse(result, '选择性恢复成功', {
                restored: result.restored,
                categories
            });
        } catch (error) {
            return createErrorResponse(error.message, 'RESTORE_ERROR');
        }
    }

    /**
     * 获取系统统计信息 (契约方法)
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async getSystemStats() {
        try {
            const db = getDB();
            if (!db) {
                throw new Error('Database not available');
            }

            const stats = {
                tables: {},
                totalSize: 0,
                lastBackup: null,
                version: this.currentVersion
            };

            // 收集各表统计
            for (const dataType of BACKUP_CONFIG.dataTypes) {
                try {
                    const collection = db[dataType];
                    if (collection) {
                        const count = await collection.count();
                        const items = await collection.limit(1).toArray(); // 用于计算大小
                        const estimatedSize = count > 0 ? this.getDataSize(items) * count : 0;
                        
                        stats.tables[dataType] = count;
                        stats.totalSize += estimatedSize;
                    }
                } catch (error) {
                    console.warn(`Failed to get stats for ${dataType}:`, error);
                    stats.tables[dataType] = 0;
                }
            }

            // 获取最后备份时间（从localStorage获取）
            const lastBackupTime = localStorage.getItem('lastBackupTime');
            if (lastBackupTime) {
                stats.lastBackup = new Date(parseInt(lastBackupTime)).toLocaleString();
            }

            return createSuccessResponse(stats, '统计信息获取成功');
        } catch (error) {
            return createErrorResponse(error.message, 'DATABASE_ERROR');
        }
    }

    /**
     * 获取备份历史 (契约方法)
     * @param {Object} options 分页选项
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async getBackupHistory(options = {}) {
        try {
            // 从localStorage获取备份历史
            const historyStr = localStorage.getItem('backupHistory');
            let history = historyStr ? JSON.parse(historyStr) : [];

            const { page = 1, limit = 20 } = options;
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;

            // 按时间倒序排列
            history.sort((a, b) => b.timestamp - a.timestamp);

            const paginatedHistory = history.slice(startIndex, endIndex);
            const totalPages = Math.ceil(history.length / limit);

            return createSuccessResponse({
                items: paginatedHistory,
                total: history.length,
                page,
                limit,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1
            }, '备份历史获取成功');
        } catch (error) {
            return createErrorResponse(error.message, 'INTERNAL_ERROR');
        }
    }

    /**
     * 从历史恢复备份 (契约方法)
     * @param {string} backupId 备份ID
     * @param {Object} options 恢复选项
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async restoreFromHistory(backupId, options = {}) {
        try {
            // 从localStorage获取备份历史
            const historyStr = localStorage.getItem('backupHistory');
            const history = historyStr ? JSON.parse(historyStr) : [];
            
            const backupRecord = history.find(item => item.id === backupId);
            if (!backupRecord) {
                throw new Error('备份记录不存在');
            }

            if (!backupRecord.data) {
                throw new Error('备份数据不可用');
            }

            const result = await this.restoreBackup(backupRecord.data, options);
            
            return createSuccessResponse(result, '历史备份恢复成功', {
                backupId,
                backupTime: new Date(backupRecord.timestamp).toLocaleString()
            });
        } catch (error) {
            return createErrorResponse(error.message, 'RESTORE_ERROR');
        }
    }

    /**
     * 删除备份历史记录 (契约方法)
     * @param {string} backupId 备份ID
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async deleteBackupHistory(backupId) {
        try {
            // 从localStorage获取备份历史
            const historyStr = localStorage.getItem('backupHistory');
            let history = historyStr ? JSON.parse(historyStr) : [];
            
            const initialLength = history.length;
            history = history.filter(item => item.id !== backupId);
            
            if (history.length === initialLength) {
                throw new Error('备份记录不存在');
            }

            // 保存更新后的历史
            localStorage.setItem('backupHistory', JSON.stringify(history));
            
            return createSuccessResponse(null, '备份记录删除成功');
        } catch (error) {
            return createErrorResponse(error.message, 'INTERNAL_ERROR');
        }
    }

    /**
     * 保存备份到历史记录
     * @private
     * @param {Object} backupInfo 备份信息
     */
    async _saveToHistory(backupInfo) {
        try {
            const historyStr = localStorage.getItem('backupHistory');
            let history = historyStr ? JSON.parse(historyStr) : [];
            
            const historyRecord = {
                id: `backup_${Date.now()}`,
                name: backupInfo.filename,
                timestamp: Date.now(),
                type: backupInfo.type || 'full',
                size: backupInfo.size,
                categories: backupInfo.categories || null,
                data: backupInfo.data // 注意：实际应用中可能不保存完整数据，而是保存下载链接
            };
            
            history.unshift(historyRecord);
            
            // 限制历史记录数量（最多保存50个）
            if (history.length > 50) {
                history = history.slice(0, 50);
            }
            
            localStorage.setItem('backupHistory', JSON.stringify(history));
            localStorage.setItem('lastBackupTime', Date.now().toString());
        } catch (error) {
            console.warn('Failed to save backup to history:', error);
        }
    }
}

// 创建全局备份服务实例
export const backupService = new BackupService();

// 导出服务类和常量
export { BackupService, BACKUP_CONFIG, SCHEMA_VERSIONS };