/**
 * API设置视图层
 * 负责API设置界面的渲染和用户交互
 */

import { 
    getApiConfig, 
    saveApiConfig, 
    testApiConnection, 
    getAvailableModels, 
    getApiProviders,
    resetApiConfig 
} from './store.js';
import { showSuccess, showError, showWarning } from '../../utils/notify.js';
import { getDataStats, displayDataManagementStatus } from '../../utils/data-management.js';

/**
 * 初始化API设置视图
 */
export async function initializeApiSettingsView() {
    try {
        console.log('API settings view initialized');
    } catch (error) {
        console.error('Failed to initialize API settings view:', error);
    }
}

/**
 * 渲染API设置界面
 */
export async function renderApiSettingsScreen() {
    console.log('Rendering API settings screen...');
    
    try {
        // 加载当前配置和提供商列表
        const [currentConfig, providers] = await Promise.all([
            getApiConfig(),
            Promise.resolve(getApiProviders())
        ]);

        // 渲染界面
        await renderApiSettingsUI(currentConfig, providers);
        
        // 绑定事件
        bindApiSettingsEvents();
        
        // 加载并显示数据管理状态
        try {
            const dataStats = await getDataStats();
            displayDataManagementStatus(dataStats);
        } catch (error) {
            console.warn('Failed to load data stats:', error);
        }
        
    } catch (error) {
        console.error('Failed to render API settings screen:', error);
        showError(`加载API设置失败: ${error.message}`);
    }
}

/**
 * 渲染API设置界面UI
 * @param {Object} config 当前配置
 * @param {Array} providers 提供商列表
 */
async function renderApiSettingsUI(config, providers) {
    const container = document.getElementById('api-settings-screen');
    if (!container) {
        console.error('API settings container not found');
        return;
    }

    // 生成提供商选项
    const providerOptions = providers.map(provider => 
        `<option value="${provider.id}" ${config.provider === provider.id ? 'selected' : ''}>${provider.name}</option>`
    ).join('');

    // 生成模型选项
    const currentProvider = providers.find(p => p.id === config.provider);
    const modelOptions = currentProvider?.models.map(model => 
        `<option value="${model}" ${config.model === model ? 'selected' : ''}>${model}</option>`
    ).join('') || '';

    container.innerHTML = `
        <div class="screen-content">
            <div class="api-settings-container">
                <h2>API设置</h2>
                
                <!-- API提供商选择 -->
                <div class="form-group">
                    <label for="api-provider">API提供商</label>
                    <select id="api-provider" class="form-control">
                        ${providerOptions}
                    </select>
                </div>

                <!-- API Key -->
                <div class="form-group" id="api-key-group" style="${!currentProvider?.requiresKey ? 'display: none;' : ''}">
                    <label for="api-key">API Key</label>
                    <div class="input-group">
                        <input type="password" id="api-key" class="form-control" 
                               value="${config.apiKey || ''}" 
                               placeholder="请输入API Key">
                        <button type="button" class="btn btn-outline-secondary" id="toggle-api-key">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>

                <!-- API地址 -->
                <div class="form-group">
                    <label for="api-base-url">API地址</label>
                    <input type="url" id="api-base-url" class="form-control" 
                           value="${config.baseURL || ''}" 
                           placeholder="https://api.openai.com/v1">
                </div>

                <!-- 模型选择 -->
                <div class="form-group">
                    <label for="api-model">模型</label>
                    <div class="input-group">
                        <select id="api-model" class="form-control">
                            ${modelOptions}
                        </select>
                        <button type="button" class="btn btn-outline-secondary" id="refresh-models">
                            <i class="fas fa-refresh"></i>
                        </button>
                    </div>
                </div>

                <!-- 高级设置 -->
                <div class="advanced-settings">
                    <h3>
                        <i class="fas fa-cog"></i> 高级设置
                        <button type="button" class="btn-link" id="toggle-advanced">
                            <i class="fas fa-chevron-down"></i>
                        </button>
                    </h3>
                    
                    <div class="advanced-content" style="display: none;">
                        <!-- 温度 -->
                        <div class="form-group">
                            <label for="api-temperature">温度 (${config.temperature || 0.7})</label>
                            <input type="range" id="api-temperature" class="form-range" 
                                   min="0" max="2" step="0.1" 
                                   value="${config.temperature || 0.7}">
                            <small class="form-text">控制回复的创造性，0=保守，2=创造</small>
                        </div>

                        <!-- 最大Token数 -->
                        <div class="form-group">
                            <label for="api-max-tokens">最大Token数</label>
                            <input type="number" id="api-max-tokens" class="form-control" 
                                   value="${config.maxTokens || 1000}" 
                                   min="1" max="32000">
                            <small class="form-text">单次对话最大长度</small>
                        </div>

                        <!-- 超时时间 -->
                        <div class="form-group">
                            <label for="api-timeout">超时时间（秒）</label>
                            <input type="number" id="api-timeout" class="form-control" 
                                   value="${(config.timeout || 30000) / 1000}" 
                                   min="5" max="300">
                            <small class="form-text">请求超时时间</small>
                        </div>

                        <!-- 重试次数 -->
                        <div class="form-group">
                            <label for="api-retries">重试次数</label>
                            <input type="number" id="api-retries" class="form-control" 
                                   value="${config.retries || 3}" 
                                   min="0" max="10">
                            <small class="form-text">失败时自动重试次数</small>
                        </div>
                    </div>
                </div>

                <!-- 操作按钮 -->
                <div class="form-actions">
                    <button type="button" class="btn btn-primary" id="save-api-config">
                        <i class="fas fa-save"></i> 保存配置
                    </button>
                    
                    <button type="button" class="btn btn-secondary" id="test-api-connection">
                        <i class="fas fa-plug"></i> 测试连接
                    </button>
                    
                    <button type="button" class="btn btn-outline-warning" id="reset-api-config">
                        <i class="fas fa-undo"></i> 重置默认
                    </button>
                </div>

                <!-- 连接状态 -->
                <div class="api-status" id="api-status" style="display: none;">
                    <div class="status-content">
                        <i class="status-icon"></i>
                        <span class="status-text"></span>
                        <small class="status-details"></small>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * 绑定API设置事件
 */
function bindApiSettingsEvents() {
    // 提供商切换事件
    document.getElementById('api-provider')?.addEventListener('change', handleProviderChange);
    
    // API Key显示/隐藏切换
    document.getElementById('toggle-api-key')?.addEventListener('click', toggleApiKeyVisibility);
    
    // 刷新模型列表
    document.getElementById('refresh-models')?.addEventListener('click', handleRefreshModels);
    
    // 高级设置展开/收起
    document.getElementById('toggle-advanced')?.addEventListener('click', toggleAdvancedSettings);
    
    // 温度滑块实时更新
    document.getElementById('api-temperature')?.addEventListener('input', updateTemperatureLabel);
    
    // 保存配置
    document.getElementById('save-api-config')?.addEventListener('click', handleSaveConfig);
    
    // 测试连接
    document.getElementById('test-api-connection')?.addEventListener('click', handleTestConnection);
    
    // 重置配置
    document.getElementById('reset-api-config')?.addEventListener('click', handleResetConfig);
}

/**
 * 处理提供商切换
 */
async function handleProviderChange(event) {
    const providerId = event.target.value;
    const providers = getApiProviders();
    const provider = providers.find(p => p.id === providerId);
    
    if (!provider) return;

    // 更新API地址
    const baseUrlInput = document.getElementById('api-base-url');
    if (baseUrlInput) {
        baseUrlInput.value = provider.baseURL;
    }

    // 显示/隐藏API Key字段
    const apiKeyGroup = document.getElementById('api-key-group');
    if (apiKeyGroup) {
        apiKeyGroup.style.display = provider.requiresKey ? 'block' : 'none';
    }

    // 更新模型列表
    await updateModelOptions(provider.models);
    
    showWarning(`已切换到${provider.name}，请检查配置并保存`);
}

/**
 * 切换API Key可见性
 */
function toggleApiKeyVisibility() {
    const input = document.getElementById('api-key');
    const icon = document.querySelector('#toggle-api-key i');
    
    if (!input || !icon) return;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}

/**
 * 刷新模型列表
 */
async function handleRefreshModels() {
    const button = document.getElementById('refresh-models');
    const icon = button?.querySelector('i');
    
    if (!button || !icon) return;
    
    // 显示加载状态
    button.disabled = true;
    icon.className = 'fas fa-spinner fa-spin';
    
    try {
        const provider = document.getElementById('api-provider')?.value;
        const result = await getAvailableModels(provider);
        
        if (result.success) {
            await updateModelOptions(result.models.map(m => m.id));
            showSuccess(`成功获取${result.models.length}个模型`);
        } else {
            showError(`获取模型列表失败: ${result.error}`);
        }
        
    } catch (error) {
        console.error('Failed to refresh models:', error);
        showError(`刷新模型列表失败: ${error.message}`);
        
    } finally {
        // 恢复按钮状态
        button.disabled = false;
        icon.className = 'fas fa-refresh';
    }
}

/**
 * 更新模型选项
 * @param {Array} models 模型列表
 */
async function updateModelOptions(models) {
    const select = document.getElementById('api-model');
    if (!select || !models) return;
    
    const currentValue = select.value;
    
    select.innerHTML = models.map(model => 
        `<option value="${model}">${model}</option>`
    ).join('');
    
    // 尝试保留当前选择
    if (models.includes(currentValue)) {
        select.value = currentValue;
    }
}

/**
 * 切换高级设置展开状态
 */
function toggleAdvancedSettings() {
    const content = document.querySelector('.advanced-content');
    const icon = document.querySelector('#toggle-advanced i');
    
    if (!content || !icon) return;
    
    const isVisible = content.style.display !== 'none';
    
    content.style.display = isVisible ? 'none' : 'block';
    icon.className = isVisible ? 'fas fa-chevron-down' : 'fas fa-chevron-up';
}

/**
 * 更新温度标签
 */
function updateTemperatureLabel(event) {
    const value = event.target.value;
    const label = document.querySelector('label[for="api-temperature"]');
    
    if (label) {
        label.textContent = `温度 (${value})`;
    }
}

/**
 * 处理保存配置
 */
async function handleSaveConfig() {
    const button = document.getElementById('save-api-config');
    const originalText = button?.textContent;
    
    if (!button) return;
    
    try {
        // 显示保存状态
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 保存中...';
        
        // 收集表单数据
        const config = {
            provider: document.getElementById('api-provider')?.value || 'openai',
            apiKey: document.getElementById('api-key')?.value || '',
            baseURL: document.getElementById('api-base-url')?.value || '',
            model: document.getElementById('api-model')?.value || 'gpt-3.5-turbo',
            temperature: parseFloat(document.getElementById('api-temperature')?.value || 0.7),
            maxTokens: parseInt(document.getElementById('api-max-tokens')?.value || 1000),
            timeout: parseInt(document.getElementById('api-timeout')?.value || 30) * 1000,
            retries: parseInt(document.getElementById('api-retries')?.value || 3)
        };
        
        // 保存配置
        const result = await saveApiConfig(config);
        
        if (result.success) {
            showSuccess(result.message);
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to save API config:', error);
        showError(`保存配置失败: ${error.message}`);
        
    } finally {
        // 恢复按钮状态
        button.disabled = false;
        button.innerHTML = originalText || '<i class="fas fa-save"></i> 保存配置';
    }
}

/**
 * 处理测试连接
 */
async function handleTestConnection() {
    const button = document.getElementById('test-api-connection');
    const status = document.getElementById('api-status');
    const originalText = button?.textContent;
    
    if (!button || !status) return;
    
    try {
        // 显示测试状态
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 测试中...';
        
        // 收集当前配置进行测试
        const config = {
            provider: document.getElementById('api-provider')?.value || 'openai',
            apiKey: document.getElementById('api-key')?.value || '',
            baseURL: document.getElementById('api-base-url')?.value || '',
            model: document.getElementById('api-model')?.value || 'gpt-3.5-turbo',
            temperature: 0,
            maxTokens: 10,
            timeout: parseInt(document.getElementById('api-timeout')?.value || 30) * 1000,
            retries: 1
        };
        
        // 执行连接测试
        const result = await testApiConnection(config);
        
        // 显示测试结果
        updateApiStatus(result);
        
    } catch (error) {
        console.error('Failed to test API connection:', error);
        updateApiStatus({
            success: false,
            error: `测试失败: ${error.message}`
        });
        
    } finally {
        // 恢复按钮状态
        button.disabled = false;
        button.innerHTML = originalText || '<i class="fas fa-plug"></i> 测试连接';
    }
}

/**
 * 更新API状态显示
 * @param {Object} result 测试结果
 */
function updateApiStatus(result) {
    const status = document.getElementById('api-status');
    const icon = status?.querySelector('.status-icon');
    const text = status?.querySelector('.status-text');
    const details = status?.querySelector('.status-details');
    
    if (!status || !icon || !text || !details) return;
    
    status.style.display = 'block';
    
    if (result.success) {
        status.className = 'api-status success';
        icon.className = 'fas fa-check-circle status-icon';
        text.textContent = result.message || '连接成功';
        details.textContent = result.responseTime ? 
            `响应时间: ${result.responseTime}ms` : '';
    } else {
        status.className = 'api-status error';
        icon.className = 'fas fa-exclamation-circle status-icon';
        text.textContent = result.error || '连接失败';
        details.textContent = result.details || '';
    }
    
    // 5秒后自动隐藏状态
    setTimeout(() => {
        status.style.display = 'none';
    }, 5000);
}

/**
 * 处理重置配置
 */
async function handleResetConfig() {
    if (!confirm('确定要重置所有API设置为默认值吗？此操作不可撤销。')) {
        return;
    }
    
    try {
        const result = await resetApiConfig();
        
        if (result.success) {
            showSuccess(result.message);
            // 重新渲染界面
            setTimeout(() => {
                renderApiSettingsScreen();
            }, 500);
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to reset API config:', error);
        showError(`重置配置失败: ${error.message}`);
    }
}