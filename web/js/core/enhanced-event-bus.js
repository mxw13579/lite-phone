/**
 * 使用方法：增强版事件总线，集成了类型验证和时间一致性检查
 * 替换原有的event-bus.js中的EventBus类
 */

import { validateEventPayload, createEventPayload } from '../types/events.js';

/**
 * 增强版事件总线类
 */
export class EnhancedEventBus {
    constructor() {
        this.events = new Map();
        this.wildcardHandlers = new Map();
        this.maxListeners = 50;
        this.debugMode = false;
        this.validationEnabled = true; // 类型验证开关
    }

    /**
     * 发布事件（增强版，支持类型验证）
     * @param {string} eventName 事件名称
     * @param {any} data 事件数据
     * @param {Object} options 选项
     * @returns {Promise<Array>} 处理结果数组
     */
    async emit(eventName, data, options = {}) {
        const { sync = false, timeout = 5000, skipValidation = false } = options;
        const results = [];
        const startTime = performance.now();

        // 类型验证（可选）
        if (this.validationEnabled && !skipValidation) {
            // 从事件名称提取事件类型
            const eventType = this.extractEventType(eventName);
            if (eventType && !validateEventPayload(eventType, data)) {
                console.warn(`[EventBus] Event validation failed for ${eventName}`);
                // 不阻止事件发布，但记录警告
            }
        }

        // 时间戳标准化
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            data.timestamp = data.timestamp || Date.now();
            
            // 检查时间戳格式一致性
            if (typeof data.timestamp === 'string') {
                try {
                    data.timestamp = new Date(data.timestamp).getTime();
                    console.warn(`[EventBus] Converted timestamp from string to number for ${eventName}`);
                } catch (e) {
                    console.warn(`[EventBus] Invalid timestamp format for ${eventName}:`, data.timestamp);
                }
            }
        }

        this.debug(`Event emitted: ${eventName}`, data);

        try {
            // 获取所有匹配的处理函数
            const matchedHandlers = this.getMatchedHandlers(eventName);
            
            if (matchedHandlers.length === 0) {
                this.debug(`No handlers found for event: ${eventName}`);
                return results;
            }

            // 执行处理函数
            const promises = matchedHandlers.map(async (eventInfo, index) => {
                try {
                    const result = await this.executeHandler(eventInfo, eventName, data, timeout);
                    return { index, success: true, result };
                } catch (error) {
                    console.error(`Event handler failed for ${eventName}:`, error);
                    return { index, success: false, error: error.message };
                }
            });

            if (sync) {
                // 同步执行（按优先级顺序）
                for (const promise of promises) {
                    results.push(await promise);
                }
            } else {
                // 异步并发执行
                results.push(...(await Promise.allSettled(promises)).map((result, index) => ({
                    index,
                    success: result.status === 'fulfilled',
                    result: result.status === 'fulfilled' ? result.value : result.reason,
                    error: result.status === 'rejected' ? result.reason?.message : null
                })));
            }

            const duration = performance.now() - startTime;
            this.debug(`Event processed: ${eventName} (${duration.toFixed(2)}ms, ${results.length} handlers)`);

        } catch (error) {
            console.error(`Failed to emit event ${eventName}:`, error);
            throw error;
        }

        return results;
    }

    /**
     * 从事件名称提取事件类型
     * @param {string} eventName 事件名称
     * @returns {string|null} 事件类型
     */
    extractEventType(eventName) {
        // EventTypes中的映射
        const eventTypeMap = {
            'app.init': 'APP_INIT',
            'app.ready': 'APP_READY',
            'app.error': 'APP_ERROR',
            'chat.created': 'CHAT_CREATED',
            'chat.updated': 'CHAT_UPDATED',
            'chat.message.sent': 'CHAT_MESSAGE_SENT',
            'chat.message.received': 'MESSAGE_RECEIVED',
            'memory.formed': 'MEMORY_FORMED',
            'preset.activated': 'PRESET_ACTIVATED',
            'preset.updated': 'PRESET_UPDATED',
            'plugin.enabled': 'PLUGIN_ENABLED',
            'plugin.disabled': 'PLUGIN_DISABLED',
            'plugin.error': 'PLUGIN_ERROR',
            'ui.screen.changed': 'SCREEN_CHANGED',
            'ui.theme.changed': 'THEME_CHANGED',
            'system.error': 'SYSTEM_ERROR',
            'system.memory.low': 'MEMORY_LOW',
            'scheduler.tick': 'SCHEDULER_TICK',
            'scheduler.error': 'SCHEDULER_ERROR',
            'api.request.start': 'API_REQUEST_START',
            'api.request.success': 'API_REQUEST_SUCCESS',
            'api.request.error': 'API_REQUEST_ERROR'
        };

        return eventTypeMap[eventName] || null;
    }

    /**
     * 启用/禁用类型验证
     * @param {boolean} enabled 是否启用
     */
    setValidationEnabled(enabled) {
        this.validationEnabled = enabled;
        this.debug(`Type validation ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * 创建标准化事件数据
     * @param {string} eventName 事件名称
     * @param {object} data 事件数据
     * @returns {object} 标准化数据
     */
    createStandardPayload(eventName, data = {}) {
        const eventType = this.extractEventType(eventName);
        if (eventType) {
            return createEventPayload(eventType, data);
        } else {
            // 对于未定义的事件类型，只添加时间戳
            return {
                timestamp: Date.now(),
                ...data
            };
        }
    }

    /**
     * 发布标准化事件（推荐使用）
     * @param {string} eventName 事件名称
     * @param {object} data 事件数据
     * @param {object} options 选项
     * @returns {Promise<Array>} 处理结果
     */
    async emitStandard(eventName, data = {}, options = {}) {
        const standardPayload = this.createStandardPayload(eventName, data);
        return await this.emit(eventName, standardPayload, options);
    }

    // 继承原有的其他方法...
    on(eventName, handler, options = {}) {
        // 原有实现保持不变
        if (typeof handler !== 'function') {
            throw new Error('Event handler must be a function');
        }

        const { once = false, priority = 0 } = options;
        const eventInfo = {
            handler,
            once,
            priority,
            id: this.generateEventId(),
            createdAt: Date.now()
        };

        if (eventName.includes('*')) {
            if (!this.wildcardHandlers.has(eventName)) {
                this.wildcardHandlers.set(eventName, []);
            }
            this.wildcardHandlers.get(eventName).push(eventInfo);
            this.wildcardHandlers.get(eventName).sort((a, b) => b.priority - a.priority);
        } else {
            if (!this.events.has(eventName)) {
                this.events.set(eventName, []);
            }
            
            const handlers = this.events.get(eventName);
            if (handlers.length >= this.maxListeners) {
                console.warn(`Max listeners (${this.maxListeners}) exceeded for event: ${eventName}`);
            }
            
            handlers.push(eventInfo);
            handlers.sort((a, b) => b.priority - a.priority);
        }

        this.debug(`Event registered: ${eventName}`, { priority, once });
        
        return () => this.off(eventName, eventInfo.id);
    }

    // 其他方法保持不变，这里省略...
    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    debug(message, data) {
        if (this.debugMode) {
            console.log(`[EventBus] ${message}`, data);
        }
    }

    setDebug(enabled) {
        this.debugMode = enabled;
    }

    // 为了完整性，需要实现其他必要方法
    getMatchedHandlers(eventName) {
        const matched = [];
        
        // 精确匹配
        const exactHandlers = this.events.get(eventName);
        if (exactHandlers) {
            matched.push(...exactHandlers);
        }
        
        // 通配符匹配
        for (const [pattern, handlers] of this.wildcardHandlers) {
            if (this.matchesWildcard(eventName, pattern)) {
                matched.push(...handlers);
            }
        }
        
        // 按优先级排序
        matched.sort((a, b) => b.priority - a.priority);
        
        return matched;
    }

    matchesWildcard(eventName, pattern) {
        const regex = pattern.replace(/\*/g, '.*');
        return new RegExp(`^${regex}$`).test(eventName);
    }

    async executeHandler(eventInfo, eventName, data, timeout) {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Handler timeout')), timeout);
        });

        const handlerPromise = Promise.resolve(eventInfo.handler(data, eventName));
        const result = await Promise.race([handlerPromise, timeoutPromise]);

        if (eventInfo.once) {
            // 移除一次性监听器
            this.off(eventName, eventInfo.id);
        }

        return result;
    }

    off(eventName, handlerOrId) {
        // 简化实现
        if (eventName.includes('*')) {
            const handlers = this.wildcardHandlers.get(eventName);
            if (handlers) {
                this.removeHandler(handlers, handlerOrId);
                if (handlers.length === 0) {
                    this.wildcardHandlers.delete(eventName);
                }
            }
        } else {
            const handlers = this.events.get(eventName);
            if (handlers) {
                this.removeHandler(handlers, handlerOrId);
                if (handlers.length === 0) {
                    this.events.delete(eventName);
                }
            }
        }
    }

    removeHandler(handlers, handlerOrId) {
        const index = handlers.findIndex(info => 
            info.handler === handlerOrId || info.id === handlerOrId
        );
        if (index !== -1) {
            handlers.splice(index, 1);
        }
    }
}