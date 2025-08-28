/**
 * API设置管理存储层
 * 负责API配置的CRUD操作和模型管理
 */

import { getDB } from '../../core/db.js';
import { apiService } from '../../services/api.js';
import { eventBus, EventTypes } from '../../core/event-bus.js';
import { showSuccess, showError, showWarning } from '../../utils/notify.js';
import { AsyncOp, DatabaseOp, Logger } from '../../utils/common-patterns.js';

/**
 * 默认API配置
 */
const DEFAULT_API_CONFIG = {
    provider: 'openai',
    apiKey: '',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    maxTokens: 1000,
    timeout: 30000,
    retries: 3
};

/**
 * 支持的API提供商配置
 */
const API_PROVIDERS = {
    openai: {
        name: 'OpenAI',
        baseURL: 'https://api.openai.com/v1',
        models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo-preview'],
        requiresKey: true
    },
    claude: {
        name: 'Anthropic Claude',
        baseURL: 'https://api.anthropic.com/v1',
        models: ['claude-3-sonnet-20240229', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
        requiresKey: true
    },
    local: {
        name: '本地API',
        baseURL: 'http://localhost:1234/v1',
        models: ['local-model'],
        requiresKey: false
    }
};

/**
 * 获取API配置
 * @returns {Promise<Object>} API配置
 */
export async function getApiConfig() {
    const response = await DatabaseOp.read(async (db) => {
        const config = await db.globalSettings.get('main');
        return {
            ...DEFAULT_API_CONFIG,
            ...config?.apiConfig
        };
    }, {
        operationName: 'Get API Config'
    });
    
    if (response.success) {
        return response.data;
    } else {
        Logger.error('ApiSettingsStore', 'Failed to get API config:', response.error);
        return DEFAULT_API_CONFIG;
    }
}

/**
 * 保存API配置
 * @param {Object} apiConfig API配置
 * @returns {Promise<Object>} 操作结果
 */
export async function saveApiConfig(apiConfig) {
    const response = await AsyncOp.execute(async () => {
        // 验证配置
        const validationResult = validateApiConfig(apiConfig);
        if (!validationResult.valid) {
            throw new Error(validationResult.error);
        }

        const saveResult = await DatabaseOp.write(async (db) => {
            let config = await db.globalSettings.get('main');
            if (!config) {
                config = { id: 'main' };
            }

            // 保存配置
            config.apiConfig = {
                ...DEFAULT_API_CONFIG,
                ...apiConfig,
                updatedAt: new Date().toISOString()
            };

            await db.globalSettings.put(config);
            return config.apiConfig;
        }, {
            operationName: 'Save API Config',
            tables: ['globalSettings']
        });
        
        if (!saveResult.success) {
            throw new Error(saveResult.error);
        }

        // 发送配置更新事件
        await eventBus.emit(EventTypes.DATA_CHANGED, {
            type: 'apiConfig',
            timestamp: Date.now()
        });

        return {
            success: true,
            message: 'API配置保存成功'
        };
    }, {
        operationName: 'Save API Config',
        logError: true,
        showUserError: true
    });
    
    if (response.success) {
        return response.data;
    } else {
        return {
            success: false,
            error: response.error
        };
    }
}

/**
 * 验证API配置
 * @param {Object} config API配置
 * @returns {Object} 验证结果
 */
function validateApiConfig(config) {
    if (!config) {
        return { valid: false, error: 'API配置不能为空' };
    }

    if (!config.provider || !API_PROVIDERS[config.provider]) {
        return { valid: false, error: '无效的API提供商' };
    }

    const provider = API_PROVIDERS[config.provider];
    
    if (provider.requiresKey && !config.apiKey?.trim()) {
        return { valid: false, error: 'API Key不能为空' };
    }

    if (!config.baseURL?.trim()) {
        return { valid: false, error: 'API地址不能为空' };
    }

    // 验证URL格式
    try {
        new URL(config.baseURL);
    } catch (e) {
        return { valid: false, error: 'API地址格式无效' };
    }

    if (!config.model?.trim()) {
        return { valid: false, error: '模型不能为空' };
    }

    if (config.temperature < 0 || config.temperature > 2) {
        return { valid: false, error: '温度值应在0-2之间' };
    }

    if (config.maxTokens < 1 || config.maxTokens > 32000) {
        return { valid: false, error: '最大Token数应在1-32000之间' };
    }

    if (config.timeout < 5000 || config.timeout > 300000) {
        return { valid: false, error: '超时时间应在5-300秒之间' };
    }

    return { valid: true };
}

/**
 * 测试API连接
 * @param {Object} config API配置（可选，不提供则使用已保存的配置）
 * @returns {Promise<Object>} 测试结果
 */
export async function testApiConnection(config = null) {
    try {
        const testConfig = config || await getApiConfig();
        
        // 设置API服务的临时配置
        const originalConfig = apiService.config;
        apiService.setConfig({
            timeout: testConfig.timeout,
            retries: 1 // 测试时减少重试次数
        });

        // 构造测试请求
        const testData = {
            model: testConfig.model,
            messages: [{ role: 'user', content: '你好，这是一个连接测试' }],
            max_tokens: 10,
            temperature: 0
        };

        const headers = {
            'Content-Type': 'application/json'
        };

        // 根据提供商添加认证头
        if (testConfig.provider === 'openai' || testConfig.provider === 'local') {
            headers['Authorization'] = `Bearer ${testConfig.apiKey}`;
        } else if (testConfig.provider === 'claude') {
            headers['x-api-key'] = testConfig.apiKey;
            headers['anthropic-version'] = '2023-06-01';
        }

        // 发送测试请求
        const startTime = Date.now();
        const response = await apiService.post(
            `${testConfig.baseURL}/chat/completions`,
            testData,
            { headers }
        );

        const responseTime = Date.now() - startTime;

        // 恢复原配置
        apiService.setConfig(originalConfig);

        return {
            success: true,
            message: '连接测试成功',
            responseTime,
            modelInfo: response?.model || testConfig.model
        };

    } catch (error) {
        // 恢复原配置
        apiService.setConfig(originalConfig);
        
        console.error('API connection test failed:', error);
        
        let errorMessage = '连接测试失败';
        if (error.message.includes('timeout')) {
            errorMessage = '连接超时，请检查网络或API地址';
        } else if (error.message.includes('401')) {
            errorMessage = 'API Key无效，请检查认证信息';
        } else if (error.message.includes('404')) {
            errorMessage = 'API地址无效，请检查服务地址';
        } else if (error.message.includes('NetworkError')) {
            errorMessage = '网络连接失败，请检查网络连接';
        }

        return {
            success: false,
            error: errorMessage,
            details: error.message
        };
    }
}

/**
 * 获取可用模型列表
 * @param {string} provider 提供商（可选）
 * @param {boolean} forceRefresh 强制刷新（跳过缓存）
 * @returns {Promise<Object>} 模型列表结果
 */
export async function getAvailableModels(provider = null, forceRefresh = false) {
    try {
        const config = await getApiConfig();
        const targetProvider = provider || config.provider;
        
        if (!API_PROVIDERS[targetProvider]) {
            throw new Error(`不支持的提供商: ${targetProvider}`);
        }

        const providerConfig = API_PROVIDERS[targetProvider];
        
        // 如果不强制刷新且有默认模型列表，直接返回
        if (!forceRefresh && providerConfig.models && providerConfig.models.length > 0) {
            return {
                success: true,
                models: providerConfig.models.map(model => ({
                    id: model,
                    name: model,
                    provider: targetProvider
                }))
            };
        }

        // 尝试动态获取模型列表
        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            // 添加认证头
            if (providerConfig.requiresKey) {
                if (!config.apiKey?.trim()) {
                    throw new Error('API Key未配置，无法获取模型列表');
                }

                if (targetProvider === 'openai' || targetProvider === 'local') {
                    headers['Authorization'] = `Bearer ${config.apiKey}`;
                } else if (targetProvider === 'claude') {
                    headers['x-api-key'] = config.apiKey;
                    headers['anthropic-version'] = '2023-06-01';
                }
            }

            const apiUrl = `${config.baseURL || providerConfig.baseURL}/models`;
            console.log(`Fetching models from: ${apiUrl}`);
            
            const response = await apiService.get(apiUrl, { 
                headers, 
                timeout: 15000 // 增加超时时间
            });

            let models = [];
            if (response && response.data) {
                models = response.data.map(model => ({
                    id: model.id || model,
                    name: model.id || model,
                    provider: targetProvider
                }));
            } else if (Array.isArray(response)) {
                models = response.map(model => ({
                    id: model.id || model,
                    name: model.id || model,
                    provider: targetProvider
                }));
            }

            if (models.length > 0) {
                return {
                    success: true,
                    models,
                    source: 'api'
                };
            } else {
                throw new Error('API返回的模型列表为空');
            }

        } catch (apiError) {
            console.warn('Failed to fetch models from API, using defaults:', apiError);
            
            // API调用失败，返回默认模型列表
            if (providerConfig.models && providerConfig.models.length > 0) {
                return {
                    success: true,
                    models: providerConfig.models.map(model => ({
                        id: model,
                        name: model,
                        provider: targetProvider
                    })),
                    source: 'default',
                    warning: `无法从API获取模型列表: ${apiError.message}`
                };
            } else {
                throw apiError;
            }
        }

    } catch (error) {
        console.error('Failed to get available models:', error);
        return {
            success: false,
            error: error.message,
            models: []
        };
    }
}

/**
 * 获取API提供商列表
 * @returns {Array} 提供商列表
 */
export function getApiProviders() {
    return Object.entries(API_PROVIDERS).map(([id, config]) => ({
        id,
        name: config.name,
        baseURL: config.baseURL,
        requiresKey: config.requiresKey,
        models: config.models || []
    }));
}

/**
 * 重置API配置为默认值
 * @returns {Promise<Object>} 操作结果
 */
export async function resetApiConfig() {
    try {
        const result = await saveApiConfig(DEFAULT_API_CONFIG);
        
        if (result.success) {
            return {
                success: true,
                message: 'API配置已重置为默认值'
            };
        }
        
        return result;

    } catch (error) {
        console.error('Failed to reset API config:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 导出API配置
 * @returns {Promise<Object>} 导出结果
 */
export async function exportApiConfig() {
    try {
        const config = await getApiConfig();
        
        // 移除敏感信息
        const exportConfig = {
            ...config,
            apiKey: config.apiKey ? '***已隐藏***' : ''
        };

        return {
            success: true,
            data: {
                apiConfig: exportConfig,
                exportedAt: new Date().toISOString(),
                version: '1.0'
            },
            message: 'API配置导出成功'
        };

    } catch (error) {
        console.error('Failed to export API config:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 导入API配置
 * @param {Object} importData 导入数据
 * @returns {Promise<Object>} 导入结果
 */
export async function importApiConfig(importData) {
    try {
        if (!importData?.apiConfig) {
            throw new Error('无效的API配置数据');
        }

        const { apiConfig } = importData;
        
        // 如果API Key被隐藏，保留原有的
        if (apiConfig.apiKey === '***已隐藏***') {
            const currentConfig = await getApiConfig();
            apiConfig.apiKey = currentConfig.apiKey;
        }

        const result = await saveApiConfig(apiConfig);
        
        if (result.success) {
            return {
                success: true,
                message: 'API配置导入成功'
            };
        }
        
        return result;

    } catch (error) {
        console.error('Failed to import API config:', error);
        return {
            success: false,
            error: error.message
        };
    }
}