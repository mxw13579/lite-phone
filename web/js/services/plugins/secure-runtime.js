/**
 * 使用方法：增强版插件安全隔离系统
 * import { SecurePluginRuntime, PluginAPIProxy } from './secure-plugin-runtime.js';
 * 
 * const runtime = new SecurePluginRuntime({
 *   quotas: { maxMemory: 32*1024*1024, maxRequests: 10 },
 *   allowedAPIs: ['storage.get', 'storage.set', 'http.get']
 * });
 */

import { eventBus, EventTypes } from '../../core/event-bus.js';
import { getDB } from '../../core/db-v13.js';

/**
 * 默认配额配置
 */
const DEFAULT_QUOTAS = {
    maxWallTimeMs: 5000,        // 最大执行时间 5秒
    maxMemoryBytes: 16 * 1024 * 1024, // 最大内存 16MB
    maxRequests: 10,            // 最大请求数
    maxStorageKeys: 100,        // 最大存储键数
    maxStorageBytes: 1024 * 1024, // 最大存储空间 1MB
    maxNetworkRequests: 5,      // 最大网络请求数
    requestsPerMinute: 30       // 每分钟请求限制
};

/**
 * 白名单API定义
 */
const WHITELISTED_APIS = {
    // 存储API
    'storage.get': { category: 'storage', quota: 'maxStorageKeys' },
    'storage.set': { category: 'storage', quota: 'maxStorageKeys' },
    'storage.delete': { category: 'storage', quota: 'maxStorageKeys' },
    'storage.clear': { category: 'storage', quota: 'maxStorageKeys' },
    
    // 网络API
    'http.get': { category: 'network', quota: 'maxNetworkRequests' },
    'http.post': { category: 'network', quota: 'maxNetworkRequests' },
    
    // 事件API
    'events.emit': { category: 'events', quota: 'maxRequests' },
    'events.on': { category: 'events', quota: 'maxRequests' },
    
    // 日志API
    'log.info': { category: 'logging', quota: null },
    'log.warn': { category: 'logging', quota: null },
    'log.error': { category: 'logging', quota: null },
    
    // 时间API
    'time.now': { category: 'time', quota: null },
    'time.format': { category: 'time', quota: null }
};

/**
 * 主线程API代理
 * 负责处理插件的API调用，实施安全控制和配额管理
 */
export class PluginAPIProxy {
    constructor(pluginId, quotas = {}, allowedAPIs = []) {
        this.pluginId = pluginId;
        this.quotas = { ...DEFAULT_QUOTAS, ...quotas };
        this.allowedAPIs = new Set(allowedAPIs);
        
        // 配额使用统计
        this.usage = {
            requests: 0,
            networkRequests: 0,
            storageKeys: new Set(),
            storageBytes: 0,
            startTime: Date.now(),
            requestHistory: [] // 用于速率限制
        };
        
        // 存储API
        this.storage = new Map();
    }

    /**
     * 处理API调用
     * @param {string} apiName API名称
     * @param {Array} args 参数
     * @returns {Promise<any>} 调用结果
     */
    async handleAPICall(apiName, args = []) {
        // 检查API是否在白名单中
        if (!this.allowedAPIs.has(apiName) || !WHITELISTED_APIS[apiName]) {
            throw new Error(`API '${apiName}' is not allowed for plugin ${this.pluginId}`);
        }

        // 检查配额
        await this.checkQuotas(apiName);
        
        // 记录请求
        this.recordRequest(apiName);
        
        try {
            const result = await this.executeAPI(apiName, args);
            
            // 记录成功调用
            await eventBus.emit(EventTypes.PLUGIN_API_CALL, {
                pluginId: this.pluginId,
                apiName,
                success: true,
                timestamp: Date.now()
            });
            
            return result;
            
        } catch (error) {
            // 记录失败调用
            await eventBus.emit(EventTypes.PLUGIN_ERROR, {
                pluginId: this.pluginId,
                error: error.message,
                context: { apiName, args },
                timestamp: Date.now()
            });
            
            throw error;
        }
    }

    /**
     * 检查配额限制
     * @param {string} apiName API名称
     */
    async checkQuotas(apiName) {
        const apiInfo = WHITELISTED_APIS[apiName];
        
        // 检查总请求数
        if (this.usage.requests >= this.quotas.maxRequests) {
            throw new Error(`Plugin ${this.pluginId} exceeded max requests quota`);
        }
        
        // 检查速率限制
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const recentRequests = this.usage.requestHistory.filter(time => time > oneMinuteAgo);
        
        if (recentRequests.length >= this.quotas.requestsPerMinute) {
            throw new Error(`Plugin ${this.pluginId} exceeded rate limit`);
        }
        
        // 特定配额检查
        if (apiInfo.quota) {
            const quotaKey = apiInfo.quota;
            if (apiInfo.category === 'network' && this.usage.networkRequests >= this.quotas.maxNetworkRequests) {
                throw new Error(`Plugin ${this.pluginId} exceeded network requests quota`);
            }
            
            if (apiInfo.category === 'storage' && this.usage.storageKeys.size >= this.quotas.maxStorageKeys) {
                throw new Error(`Plugin ${this.pluginId} exceeded storage keys quota`);
            }
        }
        
        // 检查执行时间
        const executionTime = now - this.usage.startTime;
        if (executionTime > this.quotas.maxWallTimeMs) {
            throw new Error(`Plugin ${this.pluginId} exceeded execution time quota`);
        }
    }

    /**
     * 记录请求
     * @param {string} apiName API名称
     */
    recordRequest(apiName) {
        this.usage.requests++;
        this.usage.requestHistory.push(Date.now());
        
        // 清理旧的请求历史
        const oneMinuteAgo = Date.now() - 60000;
        this.usage.requestHistory = this.usage.requestHistory.filter(time => time > oneMinuteAgo);
        
        // 按类别统计
        const apiInfo = WHITELISTED_APIS[apiName];
        if (apiInfo.category === 'network') {
            this.usage.networkRequests++;
        }
    }

    /**
     * 执行具体的API调用
     * @param {string} apiName API名称
     * @param {Array} args 参数
     * @returns {Promise<any>} 执行结果
     */
    async executeAPI(apiName, args) {
        const [category, method] = apiName.split('.');
        
        switch (category) {
            case 'storage':
                return await this.handleStorageAPI(method, args);
            case 'http':
                return await this.handleNetworkAPI(method, args);
            case 'events':
                return await this.handleEventsAPI(method, args);
            case 'log':
                return this.handleLoggingAPI(method, args);
            case 'time':
                return this.handleTimeAPI(method, args);
            default:
                throw new Error(`Unknown API category: ${category}`);
        }
    }

    /**
     * 处理存储API
     */
    async handleStorageAPI(method, args) {
        const [key, value] = args;
        
        switch (method) {
            case 'get':
                return this.storage.get(key) || null;
                
            case 'set':
                if (typeof key !== 'string') {
                    throw new Error('Storage key must be string');
                }
                
                const serializedValue = JSON.stringify(value);
                const newBytes = new Blob([serializedValue]).size;
                
                // 检查存储大小限制
                if (this.usage.storageBytes + newBytes > this.quotas.maxStorageBytes) {
                    throw new Error('Storage quota exceeded');
                }
                
                this.usage.storageKeys.add(key);
                this.usage.storageBytes += newBytes;
                this.storage.set(key, value);
                
                return true;
                
            case 'delete':
                if (this.storage.has(key)) {
                    const oldValue = this.storage.get(key);
                    const oldBytes = new Blob([JSON.stringify(oldValue)]).size;
                    this.usage.storageBytes -= oldBytes;
                    this.usage.storageKeys.delete(key);
                }
                this.storage.delete(key);
                return true;
                
            case 'clear':
                this.storage.clear();
                this.usage.storageKeys.clear();
                this.usage.storageBytes = 0;
                return true;
                
            default:
                throw new Error(`Unknown storage method: ${method}`);
        }
    }

    /**
     * 处理网络API
     */
    async handleNetworkAPI(method, args) {
        const [url, options = {}] = args;
        
        // 验证URL安全性
        if (!this.isAllowedURL(url)) {
            throw new Error(`URL not allowed: ${url}`);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
        
        try {
            const fetchOptions = {
                method: method.toUpperCase(),
                signal: controller.signal,
                ...options
            };
            
            const response = await fetch(url, fetchOptions);
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
            
        } catch (error) {
            clearTimeout(timeoutId);
            throw new Error(`Network request failed: ${error.message}`);
        }
    }

    /**
     * 处理事件API
     */
    async handleEventsAPI(method, args) {
        switch (method) {
            case 'emit':
                const [eventName, eventData] = args;
                // 限制插件只能发布特定前缀的事件
                const pluginEventName = `plugin.${this.pluginId}.${eventName}`;
                await eventBus.emit(pluginEventName, {
                    ...eventData,
                    pluginId: this.pluginId,
                    timestamp: Date.now()
                });
                return true;
                
            case 'on':
                // 插件不允许直接监听事件，防止窃听
                throw new Error('Plugins cannot directly listen to events');
                
            default:
                throw new Error(`Unknown events method: ${method}`);
        }
    }

    /**
     * 处理日志API
     */
    handleLoggingAPI(method, args) {
        const message = args.join(' ');
        const logMessage = `[Plugin:${this.pluginId}] ${message}`;
        
        switch (method) {
            case 'info':
                console.log(logMessage);
                break;
            case 'warn':
                console.warn(logMessage);
                break;
            case 'error':
                console.error(logMessage);
                break;
            default:
                console.log(logMessage);
        }
        
        return true;
    }

    /**
     * 处理时间API
     */
    handleTimeAPI(method, args) {
        switch (method) {
            case 'now':
                return Date.now();
            case 'format':
                const [timestamp, format] = args;
                const date = new Date(timestamp || Date.now());
                return date.toLocaleString('zh-CN');
            default:
                throw new Error(`Unknown time method: ${method}`);
        }
    }

    /**
     * 检查URL是否被允许
     * @param {string} url URL地址
     * @returns {boolean} 是否允许
     */
    isAllowedURL(url) {
        try {
            const parsed = new URL(url);
            
            // 禁止本地网络访问
            const hostname = parsed.hostname.toLowerCase();
            if (hostname === 'localhost' || 
                hostname.startsWith('127.') || 
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                hostname.startsWith('172.')) {
                return false;
            }
            
            // 只允许HTTPS（除了开发环境）
            if (parsed.protocol !== 'https:' && window.location.protocol === 'https:') {
                return false;
            }
            
            return true;
            
        } catch (e) {
            return false;
        }
    }

    /**
     * 获取配额使用情况
     * @returns {Object} 使用统计
     */
    getUsageStats() {
        return {
            requests: this.usage.requests,
            networkRequests: this.usage.networkRequests,
            storageKeys: this.usage.storageKeys.size,
            storageBytes: this.usage.storageBytes,
            executionTime: Date.now() - this.usage.startTime,
            quotas: this.quotas
        };
    }

    /**
     * 重置配额
     */
    resetQuotas() {
        this.usage = {
            requests: 0,
            networkRequests: 0,
            storageKeys: new Set(),
            storageBytes: 0,
            startTime: Date.now(),
            requestHistory: []
        };
        this.storage.clear();
    }
}

/**
 * 安全插件运行时
 * 集成了API代理和配额管理的增强版插件运行时
 */
export class SecurePluginRuntime {
    constructor(pluginId, options = {}) {
        this.pluginId = pluginId;
        this.quotas = { ...DEFAULT_QUOTAS, ...options.quotas };
        this.allowedAPIs = options.allowedAPIs || [];
        
        // 创建API代理
        this.apiProxy = new PluginAPIProxy(pluginId, this.quotas, this.allowedAPIs);
        
        // 运行状态
        this.worker = null;
        this.abortController = new AbortController();
        this.isRunning = false;
    }

    /**
     * 创建安全的Worker
     * @param {string} code 插件代码
     * @returns {Worker} Worker实例
     */
    createSecureWorker(code) {
        const workerCode = `
            // 插件API包装器
            const api = {
                storage: {
                    get: (key) => callMainAPI('storage.get', [key]),
                    set: (key, value) => callMainAPI('storage.set', [key, value]),
                    delete: (key) => callMainAPI('storage.delete', [key]),
                    clear: () => callMainAPI('storage.clear', [])
                },
                http: {
                    get: (url, options) => callMainAPI('http.get', [url, options]),
                    post: (url, options) => callMainAPI('http.post', [url, options])
                },
                events: {
                    emit: (name, data) => callMainAPI('events.emit', [name, data])
                },
                log: {
                    info: (...args) => callMainAPI('log.info', args),
                    warn: (...args) => callMainAPI('log.warn', args),
                    error: (...args) => callMainAPI('log.error', args)
                },
                time: {
                    now: () => callMainAPI('time.now', []),
                    format: (timestamp, format) => callMainAPI('time.format', [timestamp, format])
                }
            };

            // API调用函数
            async function callMainAPI(apiName, args) {
                return new Promise((resolve, reject) => {
                    const callId = Math.random().toString(36);
                    
                    const timeout = setTimeout(() => {
                        reject(new Error('API call timeout'));
                    }, 5000);
                    
                    const handler = (e) => {
                        if (e.data.type === 'api_response' && e.data.callId === callId) {
                            clearTimeout(timeout);
                            self.removeEventListener('message', handler);
                            
                            if (e.data.success) {
                                resolve(e.data.result);
                            } else {
                                reject(new Error(e.data.error));
                            }
                        }
                    };
                    
                    self.addEventListener('message', handler);
                    self.postMessage({
                        type: 'api_call',
                        callId,
                        apiName,
                        args
                    });
                });
            }

            // 禁用危险的全局对象
            delete self.importScripts;
            delete self.XMLHttpRequest;
            delete self.fetch;
            
            // 插件主函数
            self.onmessage = async (e) => {
                if (e.data.type === 'execute') {
                    try {
                        const { code, input } = e.data;
                        const fn = new Function('api', 'input', code);
                        const result = await fn(api, input);
                        self.postMessage({ type: 'result', result });
                    } catch (error) {
                        self.postMessage({ type: 'error', error: error.message });
                    }
                }
            };
        `;
        
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        this.worker = new Worker(url);
        
        // 处理API调用
        this.worker.addEventListener('message', async (e) => {
            if (e.data.type === 'api_call') {
                const { callId, apiName, args } = e.data;
                
                try {
                    const result = await this.apiProxy.handleAPICall(apiName, args);
                    this.worker.postMessage({
                        type: 'api_response',
                        callId,
                        success: true,
                        result
                    });
                } catch (error) {
                    this.worker.postMessage({
                        type: 'api_response',
                        callId,
                        success: false,
                        error: error.message
                    });
                }
            }
        });
        
        URL.revokeObjectURL(url);
        return this.worker;
    }

    /**
     * 执行插件代码
     * @param {string} code 插件代码
     * @param {any} input 输入参数
     * @returns {Promise<any>} 执行结果
     */
    async execute(code, input = null) {
        if (this.isRunning) {
            throw new Error('Plugin is already running');
        }
        
        this.isRunning = true;
        
        try {
            const worker = this.createSecureWorker();
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.cleanup();
                    reject(new Error('Plugin execution timeout'));
                }, this.quotas.maxWallTimeMs);
                
                worker.addEventListener('message', (e) => {
                    if (e.data.type === 'result') {
                        clearTimeout(timeout);
                        this.cleanup();
                        resolve(e.data.result);
                    } else if (e.data.type === 'error') {
                        clearTimeout(timeout);
                        this.cleanup();
                        reject(new Error(e.data.error));
                    }
                });
                
                worker.addEventListener('error', (error) => {
                    clearTimeout(timeout);
                    this.cleanup();
                    reject(error);
                });
                
                // 开始执行
                worker.postMessage({
                    type: 'execute',
                    code,
                    input
                });
            });
            
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * 获取运行统计
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            pluginId: this.pluginId,
            isRunning: this.isRunning,
            usage: this.apiProxy.getUsageStats(),
            allowedAPIs: Array.from(this.allowedAPIs)
        };
    }

    /**
     * 清理资源
     */
    cleanup() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.isRunning = false;
    }

    /**
     * 终止执行
     */
    abort() {
        this.abortController.abort();
        this.cleanup();
    }
}