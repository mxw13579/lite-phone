/**
 * 使用方法：
 * import { EventPayloadTypes, validateEventPayload } from './types/events.js';
 * 
 * // 在发送事件时验证
 * const payload = { chatId: '123', message: {...} };
 * if (validateEventPayload('CHAT_MESSAGE_SENT', payload)) {
 *   eventBus.emit(EventTypes.CHAT_MESSAGE_SENT, payload);
 * }
 */

/**
 * 事件载荷类型定义
 * 所有时间字段统一使用毫秒时间戳(number)
 */
export const EventPayloadTypes = {
    // 应用生命周期事件
    APP_INIT: {
        timestamp: 'number',
        version: 'string?',
        environment: 'string?'
    },

    APP_READY: {
        timestamp: 'number',
        loadTime: 'number',
        modules: 'array?'
    },

    APP_ERROR: {
        timestamp: 'number',
        error: 'string',
        stack: 'string?',
        context: 'object?'
    },

    // 聊天相关事件
    CHAT_CREATED: {
        timestamp: 'number',
        chatId: 'string',
        name: 'string',
        isGroup: 'boolean'
    },

    CHAT_UPDATED: {
        timestamp: 'number',
        chatId: 'string',
        changes: 'object'
    },

    CHAT_MESSAGE_SENT: {
        timestamp: 'number',
        chatId: 'string',
        message: 'object',
        senderId: 'string'
    },

    MESSAGE_RECEIVED: {
        timestamp: 'number',
        chatId: 'string',
        message: 'object',
        senderId: 'string'
    },

    // 记忆系统事件
    MEMORY_FORMED: {
        timestamp: 'number',
        memoryId: 'string',
        roleId: 'string',
        chatId: 'string',
        type: 'string', // 'episodic' | 'semantic' | 'social'
        importance: 'number', // 0-1
        content: 'string'
    },

    // 预设相关事件
    PRESET_ACTIVATED: {
        timestamp: 'number',
        presetId: 'string',
        presetName: 'string'
    },

    PRESET_UPDATED: {
        timestamp: 'number',
        presetId: 'string',
        changes: 'object'
    },

    // 插件相关事件
    PLUGIN_ENABLED: {
        timestamp: 'number',
        pluginId: 'string',
        pluginName: 'string'
    },

    PLUGIN_DISABLED: {
        timestamp: 'number',
        pluginId: 'string',
        pluginName: 'string'
    },

    PLUGIN_ERROR: {
        timestamp: 'number',
        pluginId: 'string',
        error: 'string',
        context: 'object?'
    },

    // UI相关事件
    SCREEN_CHANGED: {
        timestamp: 'number',
        fromScreen: 'string?',
        toScreen: 'string',
        params: 'object?'
    },

    THEME_CHANGED: {
        timestamp: 'number',
        themeId: 'string',
        themeName: 'string'
    },

    // 系统相关事件
    SYSTEM_ERROR: {
        timestamp: 'number',
        type: 'string', // 'database' | 'network' | 'memory' | 'unknown'
        error: 'string',
        details: 'object?'
    },

    MEMORY_LOW: {
        timestamp: 'number',
        used: 'number',
        limit: 'number',
        percentage: 'number'
    },

    // 调度器相关事件
    SCHEDULER_TICK: {
        timestamp: 'number',
        type: 'string', // 'normal' | 'compensation' | 'start'
        counter: 'number?'
    },

    SCHEDULER_ERROR: {
        timestamp: 'number',
        type: 'string', // 'tick' | 'task' | 'evaluation'
        error: 'string',
        taskId: 'string?',
        taskName: 'string?'
    },

    // API相关事件
    API_REQUEST_START: {
        timestamp: 'number',
        requestId: 'string',
        method: 'string',
        url: 'string'
    },

    API_REQUEST_SUCCESS: {
        timestamp: 'number',
        requestId: 'string',
        duration: 'number',
        status: 'number'
    },

    API_REQUEST_ERROR: {
        timestamp: 'number',
        requestId: 'string',
        duration: 'number',
        error: 'string',
        status: 'number?'
    },

    // 行为系统事件
    'behavior.action-suggested': {
        timestamp: 'number',
        chatId: 'string',
        actionType: 'string', // 'chat_reply' | 'proactive_chat' | 'moment_post' | 'moment_comment'
        probability: 'number', // 0-1
        behaviorScore: 'number', // 0-1
        context: 'object?',
        suggestedBy: 'string' // 'scheduler' | 'user_trigger' | 'auto'
    },

    'behavior.opportunities-evaluated': {
        timestamp: 'number',
        totalChats: 'number',
        successfulEvaluations: 'number',
        evaluationWindow: 'number' // 毫秒
    }
};

/**
 * 类型验证器映射
 */
const TypeValidators = {
    'string': (value) => typeof value === 'string',
    'number': (value) => typeof value === 'number' && !isNaN(value),
    'boolean': (value) => typeof value === 'boolean',
    'object': (value) => typeof value === 'object' && value !== null && !Array.isArray(value),
    'array': (value) => Array.isArray(value),
    'string?': (value) => value === undefined || typeof value === 'string',
    'number?': (value) => value === undefined || (typeof value === 'number' && !isNaN(value)),
    'boolean?': (value) => value === undefined || typeof value === 'boolean',
    'object?': (value) => value === undefined || (typeof value === 'object' && value !== null && !Array.isArray(value)),
    'array?': (value) => value === undefined || Array.isArray(value)
};

/**
 * 验证事件载荷
 * @param {string} eventType 事件类型
 * @param {any} payload 载荷数据
 * @returns {boolean} 是否有效
 */
export function validateEventPayload(eventType, payload) {
    // 获取事件类型定义
    const typeDefinition = EventPayloadTypes[eventType];
    
    if (!typeDefinition) {
        console.warn(`[EventValidation] Unknown event type: ${eventType}`);
        return false;
    }

    if (!payload || typeof payload !== 'object') {
        console.warn(`[EventValidation] Invalid payload for ${eventType}: must be object`);
        return false;
    }

    // 验证每个字段
    const errors = [];
    
    for (const [field, expectedType] of Object.entries(typeDefinition)) {
        const value = payload[field];
        const validator = TypeValidators[expectedType];
        
        if (!validator) {
            console.warn(`[EventValidation] Unknown type: ${expectedType}`);
            continue;
        }
        
        if (!validator(value)) {
            // 必需字段检查
            if (!expectedType.endsWith('?')) {
                errors.push(`Field '${field}' is required and must be ${expectedType}`);
            } else if (value !== undefined) {
                errors.push(`Field '${field}' must be ${expectedType} (optional)`);
            }
        }
    }

    // 时间戳统一性检查
    if (payload.timestamp && typeof payload.timestamp === 'string') {
        console.warn(`[EventValidation] timestamp should be number (milliseconds), got string: ${payload.timestamp}`);
        // 自动转换ISO字符串为毫秒时间戳
        try {
            payload.timestamp = new Date(payload.timestamp).getTime();
        } catch (e) {
            errors.push('timestamp must be valid date in milliseconds');
        }
    }

    if (errors.length > 0) {
        console.warn(`[EventValidation] Validation failed for ${eventType}:`, errors);
        return false;
    }

    return true;
}

/**
 * 创建标准化的事件载荷
 * @param {string} eventType 事件类型
 * @param {object} data 事件数据
 * @returns {object} 标准化载荷
 */
export function createEventPayload(eventType, data = {}) {
    const payload = {
        timestamp: Date.now(),
        ...data
    };
    
    if (!validateEventPayload(eventType, payload)) {
        throw new Error(`Invalid event payload for ${eventType}`);
    }
    
    return payload;
}

/**
 * 获取事件类型的字段定义
 * @param {string} eventType 事件类型
 * @returns {object|null} 字段定义
 */
export function getEventSchema(eventType) {
    return EventPayloadTypes[eventType] || null;
}

/**
 * 列出所有支持的事件类型
 * @returns {string[]} 事件类型列表
 */
export function getSupportedEventTypes() {
    return Object.keys(EventPayloadTypes);
}