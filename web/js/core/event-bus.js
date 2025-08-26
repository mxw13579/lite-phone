/**
 * 事件总线系统
 * 提供发布订阅模式的事件通信机制
 */

/**
 * 事件总线类
 */
class EventBus {
    constructor() {
        this.events = new Map();
        this.wildcardHandlers = new Map();
        this.maxListeners = 50; // 防止内存泄漏
        this.debugMode = false;
    }

    /**
     * 订阅事件
     * @param {string} eventName 事件名称，支持通配符 (例如: 'user.*', 'chat.message.*')
     * @param {Function} handler 事件处理函数
     * @param {Object} options 选项
     * @returns {Function} 取消订阅的函数
     */
    on(eventName, handler, options = {}) {
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
            // 处理通配符事件
            if (!this.wildcardHandlers.has(eventName)) {
                this.wildcardHandlers.set(eventName, []);
            }
            this.wildcardHandlers.get(eventName).push(eventInfo);
            
            // 按优先级排序
            this.wildcardHandlers.get(eventName).sort((a, b) => b.priority - a.priority);
        } else {
            // 处理普通事件
            if (!this.events.has(eventName)) {
                this.events.set(eventName, []);
            }
            
            const handlers = this.events.get(eventName);
            if (handlers.length >= this.maxListeners) {
                console.warn(`Too many listeners for event: ${eventName}`);
            }
            
            handlers.push(eventInfo);
            // 按优先级排序
            handlers.sort((a, b) => b.priority - a.priority);
        }

        this.debug(`Event registered: ${eventName}`, eventInfo);

        // 返回取消订阅函数
        return () => this.off(eventName, eventInfo.id);
    }

    /**
     * 订阅一次性事件
     * @param {string} eventName 事件名称
     * @param {Function} handler 事件处理函数
     * @param {Object} options 选项
     * @returns {Function} 取消订阅的函数
     */
    once(eventName, handler, options = {}) {
        return this.on(eventName, handler, { ...options, once: true });
    }

    /**
     * 取消订阅事件
     * @param {string} eventName 事件名称
     * @param {string|Function} handlerOrId 处理函数或事件ID
     */
    off(eventName, handlerOrId) {
        if (eventName.includes('*')) {
            // 处理通配符事件
            const handlers = this.wildcardHandlers.get(eventName);
            if (handlers) {
                this.removeHandler(handlers, handlerOrId);
                if (handlers.length === 0) {
                    this.wildcardHandlers.delete(eventName);
                }
            }
        } else {
            // 处理普通事件
            const handlers = this.events.get(eventName);
            if (handlers) {
                this.removeHandler(handlers, handlerOrId);
                if (handlers.length === 0) {
                    this.events.delete(eventName);
                }
            }
        }

        this.debug(`Event unregistered: ${eventName}`);
    }

    /**
     * 发布事件
     * @param {string} eventName 事件名称
     * @param {*} data 事件数据
     * @param {Object} options 选项
     * @returns {Promise<Array>} 处理结果数组
     */
    async emit(eventName, data, options = {}) {
        const { sync = false, timeout = 5000 } = options;
        const results = [];
        const startTime = performance.now();

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
                    
                    // 如果是一次性事件，移除处理函数
                    if (eventInfo.once) {
                        this.off(eventName, eventInfo.id);
                    }
                    
                    return { index, success: true, result, handler: eventInfo };
                } catch (error) {
                    console.error(`Event handler error for ${eventName}:`, error);
                    return { index, success: false, error, handler: eventInfo };
                }
            });

            if (sync) {
                // 同步执行（按顺序）
                for (const promise of promises) {
                    const result = await promise;
                    results.push(result);
                }
            } else {
                // 异步执行（并行）
                const promiseResults = await Promise.allSettled(promises);
                results.push(...promiseResults.map(r => r.value || { success: false, error: r.reason }));
            }

            const duration = performance.now() - startTime;
            this.debug(`Event ${eventName} completed in ${duration.toFixed(2)}ms`, {
                handlersCount: matchedHandlers.length,
                successCount: results.filter(r => r.success).length,
                errorCount: results.filter(r => !r.success).length
            });

            return results;

        } catch (error) {
            console.error(`Event emission error for ${eventName}:`, error);
            return [{ success: false, error }];
        }
    }

    /**
     * 同步发布事件
     * @param {string} eventName 事件名称
     * @param {*} data 事件数据
     * @returns {Promise<Array>} 处理结果数组
     */
    async emitSync(eventName, data) {
        return this.emit(eventName, data, { sync: true });
    }

    /**
     * 获取匹配的事件处理函数
     * @param {string} eventName 事件名称
     * @returns {Array} 匹配的处理函数数组
     */
    getMatchedHandlers(eventName) {
        const handlers = [];

        // 获取精确匹配的处理函数
        const exactHandlers = this.events.get(eventName) || [];
        handlers.push(...exactHandlers);

        // 获取通配符匹配的处理函数
        for (const [pattern, patternHandlers] of this.wildcardHandlers) {
            if (this.matchWildcard(pattern, eventName)) {
                handlers.push(...patternHandlers);
            }
        }

        // 按优先级排序
        return handlers.sort((a, b) => b.priority - a.priority);
    }

    /**
     * 通配符匹配
     * @param {string} pattern 通配符模式
     * @param {string} eventName 事件名称
     * @returns {boolean} 是否匹配
     */
    matchWildcard(pattern, eventName) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        return regex.test(eventName);
    }

    /**
     * 执行事件处理函数
     * @param {Object} eventInfo 事件信息
     * @param {string} eventName 事件名称
     * @param {*} data 事件数据
     * @param {number} timeout 超时时间
     * @returns {Promise<*>} 处理结果
     */
    async executeHandler(eventInfo, eventName, data, timeout) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Event handler timeout for ${eventName}`));
            }, timeout);

            try {
                const result = eventInfo.handler(data, eventName);
                
                if (result instanceof Promise) {
                    result
                        .then(res => {
                            clearTimeout(timer);
                            resolve(res);
                        })
                        .catch(err => {
                            clearTimeout(timer);
                            reject(err);
                        });
                } else {
                    clearTimeout(timer);
                    resolve(result);
                }
            } catch (error) {
                clearTimeout(timer);
                reject(error);
            }
        });
    }

    /**
     * 移除处理函数
     * @param {Array} handlers 处理函数数组
     * @param {string|Function} handlerOrId 处理函数或ID
     */
    removeHandler(handlers, handlerOrId) {
        if (typeof handlerOrId === 'string') {
            // 按ID移除
            const index = handlers.findIndex(h => h.id === handlerOrId);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        } else if (typeof handlerOrId === 'function') {
            // 按函数引用移除
            const index = handlers.findIndex(h => h.handler === handlerOrId);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    /**
     * 生成事件ID
     * @returns {string} 唯一ID
     */
    generateEventId() {
        return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取事件统计信息
     * @returns {Object} 统计信息
     */
    getStats() {
        let totalHandlers = 0;
        const eventStats = {};

        // 统计普通事件
        for (const [eventName, handlers] of this.events) {
            eventStats[eventName] = handlers.length;
            totalHandlers += handlers.length;
        }

        // 统计通配符事件
        for (const [pattern, handlers] of this.wildcardHandlers) {
            eventStats[pattern] = handlers.length;
            totalHandlers += handlers.length;
        }

        return {
            totalEvents: this.events.size + this.wildcardHandlers.size,
            totalHandlers,
            events: eventStats,
            maxListeners: this.maxListeners
        };
    }

    /**
     * 清除所有事件监听器
     */
    clear() {
        this.events.clear();
        this.wildcardHandlers.clear();
        this.debug('All event listeners cleared');
    }

    /**
     * 设置调试模式
     * @param {boolean} enabled 是否启用调试
     */
    setDebug(enabled) {
        this.debugMode = enabled;
    }

    /**
     * 调试日志
     * @param {string} message 消息
     * @param {*} data 数据
     */
    debug(message, data) {
        if (this.debugMode) {
            console.log(`[EventBus] ${message}`, data);
        }
    }
}

// 创建全局事件总线实例
export const eventBus = new EventBus();

// 导出EventBus类供自定义实例使用
export { EventBus };

// 预定义的常用事件类型
export const EventTypes = {
    // 应用生命周期
    APP_INIT: 'app.init',
    APP_READY: 'app.ready',
    APP_ERROR: 'app.error',

    // 数据变更
    DATA_CHANGED: 'data.changed',
    DATA_LOADED: 'data.loaded',
    DATA_SAVED: 'data.saved',

    // 聊天相关
    CHAT_CREATED: 'chat.created',
    CHAT_UPDATED: 'chat.updated',
    CHAT_DELETED: 'chat.deleted',
    MESSAGE_SENT: 'chat.message.sent',
    MESSAGE_RECEIVED: 'chat.message.received',

    // 预设相关
    PRESET_ACTIVATED: 'preset.activated',
    PRESET_UPDATED: 'preset.updated',

    // 插件相关
    PLUGIN_ENABLED: 'plugin.enabled',
    PLUGIN_DISABLED: 'plugin.disabled',
    PLUGIN_ERROR: 'plugin.error',

    // UI相关
    SCREEN_CHANGED: 'ui.screen.changed',
    THEME_CHANGED: 'ui.theme.changed',
    MODAL_OPENED: 'ui.modal.opened',
    MODAL_CLOSED: 'ui.modal.closed',

    // 系统相关
    SYSTEM_ERROR: 'system.error',
    SYSTEM_WARNING: 'system.warning',
    MEMORY_LOW: 'system.memory.low',
    
    // 定时任务
    SCHEDULER_TICK: 'scheduler.tick',
    SCHEDULER_ERROR: 'scheduler.error',
    
    // API相关
    API_REQUEST_START: 'api.request.start',
    API_REQUEST_SUCCESS: 'api.request.success', 
    API_REQUEST_ERROR: 'api.request.error',
    
    // 主题相关
    THEME_UPDATED: 'theme.updated',
    THEME_APPLIED: 'theme.applied',
    THEME_RESET: 'theme.reset',
    
    // 备份相关
    BACKUP_STARTED: 'backup.started',
    BACKUP_COMPLETED: 'backup.completed',
    BACKUP_ERROR: 'backup.error',
    RESTORE_STARTED: 'restore.started',
    RESTORE_COMPLETED: 'restore.completed',
    RESTORE_ERROR: 'restore.error'
};