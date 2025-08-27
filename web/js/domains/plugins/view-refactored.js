/**
 * 使用方法：重构后的插件管理视图，使用组件系统替代ad-hoc DOM创建
 * 这是对 plugins/view.js 中模态框部分的重构示例
 */

import { Button, Modal, Form, Card, Tag, Loading } from '../../components/index.js';
import {
    getAllPlugins,
    getPluginStats,
    togglePluginStatus,
    updatePluginConfig,
    resetPluginErrors,
    getPluginDetail
} from './store.js';
import { showToast, showSuccess, showError, showWarning } from '../../utils/notify.js';
import { formatDate, formatRelativeTime } from '../../utils/format.js';

/**
 * 显示插件配置模态框（重构版）
 * @param {string} pluginId 插件ID
 */
export async function showPluginConfig(pluginId) {
    try {
        // 获取插件详情
        const plugin = await getPluginDetail(pluginId);
        if (!plugin.success) {
            showError(plugin.error || '获取插件配置失败');
            return;
        }

        const pluginData = plugin.data;
        
        // 构建表单字段
        const formFields = Object.entries(pluginData.configSnapshot).map(([key, value]) => {
            const fieldType = typeof value === 'boolean' ? 'checkbox' :
                            typeof value === 'number' ? 'number' : 'text';
            
            return {
                id: `config-${key}`,
                name: key,
                type: fieldType,
                label: key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()),
                value: fieldType === 'checkbox' ? undefined : value,
                checked: fieldType === 'checkbox' ? value : undefined,
                required: false,
                help: getFieldHelp(key, fieldType)
            };
        });

        // 创建表单
        const configForm = Form({
            fields: formFields,
            onSubmit: async (formData) => {
                // 处理表单数据类型转换
                const processedData = {};
                Object.entries(formData).forEach(([key, value]) => {
                    const originalValue = pluginData.configSnapshot[key];
                    if (typeof originalValue === 'boolean') {
                        processedData[key] = value === 'on';
                    } else if (typeof originalValue === 'number') {
                        processedData[key] = Number(value);
                    } else {
                        processedData[key] = value;
                    }
                });

                await handleConfigSave(pluginId, processedData, modal);
            }
        });

        // 创建操作按钮
        const saveBtn = Button({
            text: '保存配置',
            type: 'primary',
            onClick: () => configForm.dispatchEvent(new Event('submit'))
        });

        const cancelBtn = Button({
            text: '取消',
            type: 'secondary',
            onClick: () => modal.hide()
        });

        // 创建模态框
        const modal = Modal({
            title: `配置插件：${pluginData.name}`,
            content: configForm,
            actions: [cancelBtn, saveBtn],
            closable: true
        });

        modal.show();

    } catch (error) {
        console.error('Show plugin config failed:', error);
        showError('显示插件配置失败');
    }
}

/**
 * 显示插件详情模态框（重构版）
 * @param {string} pluginId 插件ID
 */
export async function showPluginDetails(pluginId) {
    try {
        const plugin = await getPluginDetail(pluginId);
        if (!plugin.success) {
            showError(plugin.error || '获取插件详情失败');
            return;
        }

        const pluginData = plugin.data;
        
        // 状态标签
        const statusTag = Tag({
            text: pluginData.enabled ? '已启用' : '已禁用',
            type: pluginData.enabled ? 'success' : 'secondary'
        });

        // 类别标签
        const categoryTag = Tag({
            text: pluginData.category === 'builtin' ? '内置' : '自定义',
            type: pluginData.category === 'builtin' ? 'info' : 'warning'
        });

        // 构建详情内容
        const detailsContent = document.createElement('div');
        detailsContent.className = 'plugin-details';
        
        // 基本信息卡片
        const basicInfo = Card({
            title: '基本信息',
            content: `
                <div class="info-grid">
                    <div class="info-item">
                        <label>名称：</label>
                        <span>${pluginData.name}</span>
                    </div>
                    <div class="info-item">
                        <label>版本：</label>
                        <span>${pluginData.version || '1.0.0'}</span>
                    </div>
                    <div class="info-item">
                        <label>状态：</label>
                        <div class="tags">${statusTag.outerHTML}${categoryTag.outerHTML}</div>
                    </div>
                    <div class="info-item">
                        <label>描述：</label>
                        <span>${pluginData.description || '暂无描述'}</span>
                    </div>
                </div>
            `
        });

        // 统计信息卡片
        const statsInfo = Card({
            title: '运行统计',
            content: `
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-value">${pluginData.stats?.executionCount || 0}</div>
                        <div class="stat-label">执行次数</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${pluginData.stats?.successCount || 0}</div>
                        <div class="stat-label">成功次数</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${(pluginData.stats?.avgExecutionTime || 0).toFixed(2)}ms</div>
                        <div class="stat-label">平均耗时</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${pluginData.errors?.length || 0}</div>
                        <div class="stat-label">错误次数</div>
                    </div>
                </div>
            `
        });

        // 错误历史卡片（如果有错误）
        let errorHistory = null;
        if (pluginData.errors && pluginData.errors.length > 0) {
            const errorList = pluginData.errors
                .slice(-5) // 显示最近5个错误
                .map(error => `
                    <div class="error-item">
                        <div class="error-time">${formatRelativeTime(error.timestamp)}</div>
                        <div class="error-message">${error.message}</div>
                    </div>
                `).join('');

            errorHistory = Card({
                title: '最近错误',
                content: `<div class="error-history">${errorList}</div>`
            });
        }

        // 组装内容
        detailsContent.appendChild(basicInfo);
        detailsContent.appendChild(statsInfo);
        if (errorHistory) {
            detailsContent.appendChild(errorHistory);
        }

        // 操作按钮
        const configBtn = Button({
            text: '配置插件',
            type: 'primary',
            onClick: () => {
                modal.hide();
                showPluginConfig(pluginId);
            }
        });

        const resetBtn = Button({
            text: '重置错误',
            type: 'warning',
            onClick: async () => {
                const result = await resetPluginErrors(pluginId);
                if (result.success) {
                    showSuccess('错误记录已重置');
                    modal.hide();
                    // 刷新插件列表
                    await renderPluginsScreen();
                } else {
                    showError(result.error || '重置错误失败');
                }
            }
        });

        const closeBtn = Button({
            text: '关闭',
            type: 'secondary',
            onClick: () => modal.hide()
        });

        const actions = [closeBtn, resetBtn, configBtn];

        // 创建模态框
        const modal = Modal({
            title: `插件详情：${pluginData.name}`,
            content: detailsContent,
            actions,
            closable: true,
            className: 'plugin-details-modal'
        });

        modal.show();

    } catch (error) {
        console.error('Show plugin details failed:', error);
        showError('显示插件详情失败');
    }
}

/**
 * 处理配置保存
 * @param {string} pluginId 插件ID
 * @param {Object} configData 配置数据
 * @param {HTMLElement} modal 模态框元素
 */
async function handleConfigSave(pluginId, configData, modal) {
    // 显示保存中状态
    const loadingEl = Loading({ text: '保存中...' });
    modal.querySelector('.modal-body').appendChild(loadingEl);

    try {
        const result = await updatePluginConfig(pluginId, configData);
        
        if (result.success) {
            showSuccess('插件配置已保存');
            modal.hide();
            // 刷新插件列表
            await renderPluginsScreen();
        } else {
            showError(result.error || '保存配置失败');
        }
    } catch (error) {
        console.error('Save plugin config failed:', error);
        showError('保存配置失败');
    } finally {
        // 移除加载状态
        loadingEl.remove();
    }
}

/**
 * 获取字段帮助文本
 * @param {string} key 字段名
 * @param {string} type 字段类型
 * @returns {string} 帮助文本
 */
function getFieldHelp(key, type) {
    const helpTexts = {
        'maxRetries': '插件执行失败时的最大重试次数',
        'timeout': '插件执行超时时间（毫秒）',
        'enabled': '是否启用此插件',
        'priority': '插件执行优先级（数字越大优先级越高）',
        'interval': '定时执行间隔（毫秒）'
    };

    return helpTexts[key] || '';
}

// 为了演示目的，这里需要一个占位的渲染函数
async function renderPluginsScreen() {
    // 这是一个占位函数，实际实现会在主要重构中完成
    console.log('Rendering plugins screen...');
}