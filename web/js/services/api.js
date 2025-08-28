/**
 * API服务层
 * 统一管理所有外部API调用，提供错误处理、重试机制、超时控制
 * 
 * @fileoverview API服务实现，遵循ServiceContract规范
 * @version 1.1
 * @author EPhone Development Team
 * @implements {ApiServiceContract}
 */

import { eventBus, EventTypes } from '../core/event-bus.js';
import { showError, showWarning } from '../utils/notify.js';
import { createSuccessResponse, createErrorResponse, contractCompliant } from './contracts.js';
import { ApiOp, Logger } from '../utils/common-patterns.js';

/**
 * API配置
 */
const API_CONFIG = {
    timeout: 30000, // 30秒超时
    retries: 3, // 重试次数
    retryDelay: 1000, // 重试延迟
    maxConcurrent: 5 // 最大并发请求数
};

/**
 * 活跃请求队列
 */
const activeRequests = new Map();
let requestCounter = 0;

/**
 * API服务类
 */
class ApiService {
    constructor() {
        this.config = { ...API_CONFIG };
        this.interceptors = {
            request: [],
            response: [],
            error: []
        };
    }

    /**
     * 设置API配置
     * @param {Object} config 配置对象
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }

    /**
     * 添加请求拦截器
     * @param {Function} interceptor 拦截器函数
     */
    addRequestInterceptor(interceptor) {
        this.interceptors.request.push(interceptor);
    }

    /**
     * 添加响应拦截器
     * @param {Function} interceptor 拦截器函数
     */
    addResponseInterceptor(interceptor) {
        this.interceptors.response.push(interceptor);
    }

    /**
     * 添加错误拦截器
     * @param {Function} interceptor 拦截器函数
     */
    addErrorInterceptor(interceptor) {
        this.interceptors.error.push(interceptor);
    }

    /**
     * 执行HTTP请求
     * @param {Object} options 请求选项
     * @returns {Promise<any>} 响应数据
     */
    async request(options) {
        const requestId = `req_${++requestCounter}`;
        
        return await ApiOp.call(async () => {
            // 检查并发限制
            if (activeRequests.size >= this.config.maxConcurrent) {
                throw new Error('Too many concurrent requests');
            }

            // 处理请求选项
            const processedOptions = await this.processRequestOptions(options);
            
            // 记录活跃请求
            activeRequests.set(requestId, {
                url: processedOptions.url,
                method: processedOptions.method,
                startTime: Date.now()
            });

            // 发送请求事件
            await eventBus.emit(EventTypes.API_REQUEST_START, {
                requestId,
                url: processedOptions.url,
                method: processedOptions.method
            });

            // 执行请求（带重试）
            const response = await this.executeWithRetry(processedOptions);
            
            // 处理响应
            const processedResponse = await this.processResponse(response);

            // 发送成功事件
            await eventBus.emit(EventTypes.API_REQUEST_SUCCESS, {
                requestId,
                url: processedOptions.url,
                duration: Date.now() - activeRequests.get(requestId).startTime
            });

            return processedResponse;
        }, {
            operationName: 'HTTP Request',
            retries: this.config.retries,
            retryDelay: this.config.retryDelay,
            timeout: this.config.timeout,
            onError: (error) => this.handleError(error, options, requestId)
        }).finally(() => {
            // 清理活跃请求
            activeRequests.delete(requestId);
        });
    }

    /**
     * 处理请求选项
     * @param {Object} options 原始选项
     * @returns {Promise<Object>} 处理后的选项
     */
    async processRequestOptions(options) {
        let processedOptions = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: this.config.timeout,
            ...options
        };

        // 执行请求拦截器
        for (const interceptor of this.interceptors.request) {
            processedOptions = await interceptor(processedOptions);
        }

        return processedOptions;
    }

    /**
     * 处理响应数据
     * @param {Response} response 原始响应
     * @returns {Promise<any>} 处理后的响应
     */
    async processResponse(response) {
        let data;
        
        // 根据Content-Type解析响应
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else if (contentType.includes('text/')) {
            data = await response.text();
        } else {
            data = await response.blob();
        }

        // 检查HTTP状态
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // 执行响应拦截器
        let processedData = data;
        for (const interceptor of this.interceptors.response) {
            processedData = await interceptor(processedData, response);
        }

        return processedData;
    }

    /**
     * 带重试的请求执行
     * @param {Object} options 请求选项
     * @returns {Promise<Response>} 响应对象
     */
    async executeWithRetry(options) {
        return await ApiOp.call(async () => {
            return await this.executeRequest(options);
        }, {
            operationName: `API Request ${options.method} ${options.url}`,
            retries: this.config.retries,
            retryDelay: this.config.retryDelay,
            timeout: options.timeout || this.config.timeout
        });
    }

    /**
     * 执行单次请求
     * @param {Object} options 请求选项
     * @returns {Promise<Response>} 响应对象
     */
    async executeRequest(options) {
        return await AsyncOp.execute(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), options.timeout);

            try {
                const response = await fetch(options.url, {
                    method: options.method,
                    headers: options.headers,
                    body: options.body,
                    signal: controller.signal
                });

                return response;
            } finally {
                clearTimeout(timeoutId);
            }
        }, {
            operationName: `Execute ${options.method} Request`,
            timeout: options.timeout,
            logError: false // 让上层处理错误日志
        });
    }

    /**
     * 处理请求错误
     * @param {Error} error 错误对象
     * @param {Object} options 原始请求选项
     * @param {string} requestId 请求ID
     */
    async handleError(error, options, requestId) {
        // 执行错误拦截器
        let processedError = error;
        for (const interceptor of this.interceptors.error) {
            processedError = await interceptor(processedError, options);
        }

        // 发送错误事件
        await eventBus.emit(EventTypes.API_REQUEST_ERROR, {
            requestId,
            url: options.url,
            error: processedError.message
        });

        // 根据错误类型显示不同提示
        if (processedError.name === 'AbortError') {
            showWarning('请求超时，请稍后重试');
        } else if (processedError.message.includes('NetworkError')) {
            showError('网络连接失败，请检查网络连接');
        } else {
            console.error('API请求失败:', processedError);
        }
    }

    /**
     * GET请求
     * @param {string} url 请求URL
     * @param {Object} config 请求配置
     * @returns {Promise<any>} 响应数据
     */
    async get(url, config = {}) {
        return this.request({
            url,
            method: 'GET',
            ...config
        });
    }

    /**
     * POST请求
     * @param {string} url 请求URL
     * @param {any} data 请求数据
     * @param {Object} config 请求配置
     * @returns {Promise<any>} 响应数据
     */
    async post(url, data, config = {}) {
        return this.request({
            url,
            method: 'POST',
            body: JSON.stringify(data),
            ...config
        });
    }

    /**
     * PUT请求
     * @param {string} url 请求URL
     * @param {any} data 请求数据
     * @param {Object} config 请求配置
     * @returns {Promise<any>} 响应数据
     */
    async put(url, data, config = {}) {
        return this.request({
            url,
            method: 'PUT',
            body: JSON.stringify(data),
            ...config
        });
    }

    /**
     * DELETE请求
     * @param {string} url 请求URL
     * @param {Object} config 请求配置
     * @returns {Promise<any>} 响应数据
     */
    async delete(url, config = {}) {
        return this.request({
            url,
            method: 'DELETE',
            ...config
        });
    }

    /**
     * 取消所有活跃请求
     */
    cancelAllRequests() {
        const count = activeRequests.size;
        activeRequests.clear();
        
        if (count > 0) {
            console.log(`Cancelled ${count} active requests`);
        }
    }

    /**
     * 获取活跃请求统计
     * @returns {Object} 统计信息
     */
    getStats() {
        return {
            activeRequests: activeRequests.size,
            requestDetails: Array.from(activeRequests.entries()).map(([id, req]) => ({
                id,
                url: req.url,
                method: req.method,
                duration: Date.now() - req.startTime
            }))
        };
    }

    /**
     * 延迟函数
     * @param {number} ms 延迟毫秒数
     * @returns {Promise} Promise对象
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 创建默认API服务实例
export const apiService = new ApiService();

// AI聊天API相关方法（为未来功能预留）
export class ChatApiService {
    constructor(baseService = apiService) {
        this.api = baseService;
        this.models = new Map();
    }

    /**
     * 发送聊天消息
     * @param {Object} chatData 聊天数据
     * @returns {Promise<Object>} 响应结果
     */
    async sendMessage(chatData) {
        // TODO: 实现具体的AI API调用
        // 这里预留接口，后续可以集成OpenAI、Claude等API
        
        return this.api.post('/api/chat/completions', {
            model: chatData.model || 'gpt-3.5-turbo',
            messages: chatData.messages,
            max_tokens: chatData.maxTokens || 1000,
            temperature: chatData.temperature || 0.7
        });
    }

    /**
     * 获取可用模型列表
     * @returns {Promise<Array>} 模型列表
     */
    async getModels() {
        // TODO: 实现模型列表获取
        return this.api.get('/api/models');
    }

    /**
     * 流式聊天（未来功能）
     * @param {Object} chatData 聊天数据
     * @param {Function} onChunk 数据块回调
     * @returns {Promise<void>} Promise对象
     */
    async streamChat(chatData, onChunk) {
        // TODO: 实现流式响应
        console.log('Stream chat not implemented yet');
    }
}

// 创建聊天API服务实例
export const chatApiService = new ChatApiService();

// 导出API服务类供自定义实例使用
export { ApiService };