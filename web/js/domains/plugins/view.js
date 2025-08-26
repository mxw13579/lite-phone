/**
 * 插件管理视图层
 * 负责插件界面的渲染和用户交互
 */

import {
    getAllPlugins,
    getPluginStats,
    togglePluginStatus,
    updatePluginConfig,
    resetPluginErrors,
    getPluginDetail,
    ensureDefaultPlugins
} from './store.js';
import { $, byId, createElement, show, hide, setContent, addEventListener } from '../../utils/dom.js';
import { formatDate, formatRelativeTime } from '../../utils/format.js';
import { showToast, showSuccess, showError, showWarning } from '../../utils/notify.js';

// 页面元素缓存
let elements = {};

/**
 * 初始化插件管理界面
 */
export async function initializePluginsView() {
    try {
        // 缓存页面元素
        cacheElements();

        // 绑定事件
        bindEvents();

        // 确保默认插件存在
        await ensureDefaultPlugins();

        // 渲染界面
        await renderPluginsScreen();

        console.log('Plugins view initialized');
    } catch (error) {
        console.error('Failed to initialize plugins view:', error);
        showError('插件管理界面初始化失败');
    }
}

/**
 * 缓存页面元素
 */
function cacheElements() {
    elements = {
        pluginsList: byId('plugins-list'),
        pluginsLoading: byId('plugins-loading'),
        pluginsEmpty: byId('plugins-empty'),
        refreshBtn: byId('refresh-plugins-btn'),
        totalCount: byId('total-plugins-count'),
        enabledCount: byId('enabled-plugins-count'),
        disabledCount: byId('disabled-plugins-count')
    };
}

/**
 * 绑定事件处理器
 */
function bindEvents() {
    // 刷新按钮
    if (elements.refreshBtn) {
        addEventListener(elements.refreshBtn, 'click', handleRefreshPlugins);
    }
}

/**
 * 渲染插件管理主界面
 */
export async function renderPluginsScreen() {
    showLoading(true);

    try {
        // 并行加载数据
        const [plugins, stats] = await Promise.all([
            getAllPlugins(),
            getPluginStats()
        ]);

        // 更新统计信息
        updateStatsDisplay(stats);

        // 渲染插件列表
        renderPluginsList(plugins);

        showLoading(false);

    } catch (error) {
        console.error('Failed to render plugins screen:', error);
        showLoading(false);
        showError('加载插件列表失败');
    }
}

/**
 * 更新统计信息显示
 * @param {Object} stats 统计信息
 */
function updateStatsDisplay(stats) {
    if (elements.totalCount) elements.totalCount.textContent = stats.total;
    if (elements.enabledCount) elements.enabledCount.textContent = stats.enabled;
    if (elements.disabledCount) elements.disabledCount.textContent = stats.disabled;
}

/**
 * 渲染插件列表
 * @param {Array} plugins 插件数组
 */
function renderPluginsList(plugins) {
    if (!elements.pluginsList) return;

    if (plugins.length === 0) {
        show(elements.pluginsEmpty);
        hide(elements.pluginsList);
        return;
    }

    hide(elements.pluginsEmpty);
    show(elements.pluginsList, 'block');

    const pluginItems = plugins.map(plugin => createPluginItem(plugin));
    setContent(elements.pluginsList, pluginItems.join(''), true);

    // 绑定插件项事件
    bindPluginItemEvents();
}

/**
 * 创建插件项HTML
 * @param {Object} plugin 插件数据
 * @returns {string} HTML字符串
 */
function createPluginItem(plugin) {
    const statusClass = plugin.enabled ? 'enabled' : 'disabled';
    const errorBadge = plugin.hasErrors ? `<span class="error-badge">${plugin.errors} 错误</span>` : '';
    const disabledReason = plugin.isDisabled ? '<span class="disabled-reason">因错误过多已禁用</span>' : '';

    return `
        <div class="plugin-item ${statusClass}" data-plugin-id="${plugin.id}">
            <div class="plugin-header">
                <div class="plugin-info">
                    <h3 class="plugin-name">${plugin.name}</h3>
                    <p class="plugin-description">${plugin.description}</p>
                    <div class="plugin-meta">
                        <span class="plugin-version">v${plugin.version}</span>
                        <span class="plugin-updated">更新：${plugin.formattedUpdatedAt}</span>
                        ${errorBadge}
                        ${disabledReason}
                    </div>
                </div>
                <div class="plugin-controls">
                    <div class="toggle-switch">
                        <input type="checkbox" 
                               id="toggle-${plugin.id}" 
                               ${plugin.enabled ? 'checked' : ''}
                               ${plugin.isDisabled ? 'disabled' : ''}
                               data-plugin-id="${plugin.id}">
                        <label for="toggle-${plugin.id}" class="toggle-slider"></label>
                    </div>
                </div>
            </div>
            <div class="plugin-actions">
                <button class="btn btn-secondary plugin-config-btn" data-plugin-id="${plugin.id}" data-action="config">
                    配置
                </button>
                <button class="btn btn-secondary plugin-details-btn" data-plugin-id="${plugin.id}" data-action="details">
                    详情
                </button>
                ${plugin.hasErrors ? `
                    <button class="btn btn-warning plugin-reset-errors-btn" data-plugin-id="${plugin.id}" data-action="reset-errors">
                        重置错误
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * 绑定插件项事件
 */
function bindPluginItemEvents() {
    // 切换插件状态
    const toggleSwitches = elements.pluginsList.querySelectorAll('.toggle-switch input[type="checkbox"]');
    toggleSwitches.forEach(toggle => {
        addEventListener(toggle, 'change', handleTogglePlugin);
    });

    // 使用事件委托处理插件操作按钮
    addEventListener(elements.pluginsList, 'click', (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;

        const pluginId = button.dataset.pluginId;
        const action = button.dataset.action;

        switch (action) {
            case 'config':
                showPluginConfig(pluginId);
                break;
            case 'details':
                showPluginDetails(pluginId);
                break;
            case 'reset-errors':
                handleResetPluginErrors(pluginId);
                break;
        }
    });
}

/**
 * 处理插件状态切换
 * @param {Event} event 事件对象
 */
async function handleTogglePlugin(event) {
    const pluginId = event.target.dataset.pluginId;
    const checkbox = event.target;

    // 临时禁用以防止重复点击
    checkbox.disabled = true;

    try {
        const result = await togglePluginStatus(pluginId);

        if (result.success) {
            showToast(result.message, 'success');
            // 更新界面状态
            const pluginItem = checkbox.closest('.plugin-item');
            pluginItem.classList.toggle('enabled', result.enabled);
            pluginItem.classList.toggle('disabled', !result.enabled);
        } else {
            // 恢复原状态
            checkbox.checked = !checkbox.checked;
            showToast(result.error, 'error');
        }

    } catch (error) {
        console.error('Toggle plugin failed:', error);
        checkbox.checked = !checkbox.checked;
        showToast('操作失败，请重试', 'error');
    } finally {
        checkbox.disabled = false;
    }
}

/**
 * 处理刷新插件列表
 */
async function handleRefreshPlugins() {
    await renderPluginsScreen();
    showToast('插件列表已刷新', 'success');
}

/**
 * 显示插件配置对话框
 * @param {string} pluginId 插件ID
 */
async function showPluginConfig(pluginId) {
    try {
        const plugin = await getPluginDetail(pluginId);
        if (!plugin) {
            showToast('插件不存在', 'error');
            return;
        }

        // 创建配置对话框
        const configModal = createConfigModal(plugin);
        document.body.appendChild(configModal);

        // 显示对话框
        configModal.style.display = 'flex';

        // 使用直接查询的方式绑定事件，等待微任务队列
        requestAnimationFrame(() => {
            // 绑定保存事件
            const saveBtn = configModal.querySelector('.save-config-btn');
            if (saveBtn) {
                addEventListener(saveBtn, 'click', () => handleSaveConfig(plugin.id, configModal));
            } else {
                console.error('Save button not found in config modal');
            }

            // 绑定取消事件
            const cancelBtn = configModal.querySelector('.cancel-config-btn');
            if (cancelBtn) {
                addEventListener(cancelBtn, 'click', () => closeConfigModal(configModal));
            } else {
                console.error('Cancel button not found in config modal');
            }

            // 绑定背景点击关闭事件
            const backdrop = configModal.querySelector('.modal-backdrop');
            if (backdrop) {
                addEventListener(backdrop, 'click', () => closeConfigModal(configModal));
            }
        });

    } catch (error) {
        console.error('Failed to show plugin config:', error);
        showToast('无法加载插件配置', 'error');
    }
}

/**
 * 创建配置模态框
 * @param {Object} plugin 插件数据
 * @returns {Element} 模态框元素
 */
function createConfigModal(plugin) {
    // 直接创建DOM元素而不使用createElement函数
    const modal = document.createElement('div');
    modal.className = 'plugin-config-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;';
    
    const configFields = Object.entries(plugin.configSnapshot).map(([key, value]) => {
        const fieldType = typeof value === 'boolean' ? 'checkbox' :
                         typeof value === 'number' ? 'number' : 'text';

        if (fieldType === 'checkbox') {
            return `
                <div class="config-field">
                    <label>
                        <input type="checkbox" name="${key}" ${value ? 'checked' : ''}> 
                        ${formatConfigKey(key)}
                    </label>
                </div>
            `;
        } else {
            return `
                <div class="config-field">
                    <label for="config-${key}">${formatConfigKey(key)}</label>
                    <input type="${fieldType}" id="config-${key}" name="${key}" value="${value}">
                </div>
            `;
        }
    }).join('');

    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content" style="background: white; padding: 20px; border-radius: 8px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h2>配置插件：${plugin.name}</h2>
            </div>
            <div class="modal-body">
                <form class="plugin-config-form">
                    ${configFields}
                </form>
            </div>
            <div class="modal-footer" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-secondary cancel-config-btn" style="padding: 8px 16px; border: 1px solid #ccc; background: #f5f5f5; border-radius: 4px; cursor: pointer;">取消</button>
                <button class="btn btn-primary save-config-btn" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">保存</button>
            </div>
        </div>
    `;

    return modal;
}

/**
 * 格式化配置键名
 * @param {string} key 配置键
 * @returns {string} 格式化后的名称
 */
function formatConfigKey(key) {
    const keyMap = {
        // 记忆管理器
        autoClean: '自动清理',
        maxMemories: '最大记忆数',
        cleanInterval: '清理间隔(天)',
        enableCompression: '启用压缩',
        backupBeforeClean: '清理前备份',
        
        // 朋友圈动态生成器
        autoGenerate: '自动生成',
        generateInterval: '生成间隔(小时)',
        contentTypes: '内容类型',
        
        // 智能回复增强
        enableContextAnalysis: '启用上下文分析',
        enableSentimentAnalysis: '启用情感分析',
        replyToneAdjustment: '回复语调调整',
        
        // 通知管理器
        quietHours: '免打扰时段',
        priority: '优先级',
        groupByType: '按类型分组'
    };

    return keyMap[key] || key;
}

/**
 * 处理保存配置
 * @param {string} pluginId 插件ID
 * @param {Element} modal 模态框元素
 */
async function handleSaveConfig(pluginId, modal) {
    try {
        const form = modal.querySelector('.plugin-config-form');
        const formData = new FormData(form);
        const config = {};

        // 处理表单数据
        for (const [key, value] of formData.entries()) {
            const input = form.querySelector(`[name="${key}"]`);
            if (input.type === 'checkbox') {
                config[key] = input.checked;
            } else if (input.type === 'number') {
                config[key] = parseFloat(value) || 0;
            } else {
                config[key] = value;
            }
        }

        const result = await updatePluginConfig(pluginId, config);

        if (result.success) {
            showToast(result.message, 'success');
            closeConfigModal(modal);
        } else {
            showToast(result.error, 'error');
        }

    } catch (error) {
        console.error('Failed to save plugin config:', error);
        showToast('保存配置失败', 'error');
    }
}

/**
 * 关闭配置模态框
 * @param {Element} modal 模态框元素
 */
function closeConfigModal(modal) {
    modal.remove();
}

/**
 * 显示插件详情
 * @param {string} pluginId 插件ID
 */
async function showPluginDetails(pluginId) {
    try {
        const plugin = await getPluginDetail(pluginId);
        if (!plugin) {
            showToast('插件不存在', 'error');
            return;
        }

        // 创建详情对话框
        const detailsModal = createDetailsModal(plugin);
        document.body.appendChild(detailsModal);

        // 显示对话框
        detailsModal.style.display = 'flex';

        // 使用直接查询的方式绑定事件，等待微任务队列
        requestAnimationFrame(() => {
            // 绑定关闭事件
            const closeBtn = detailsModal.querySelector('.close-details-btn');
            if (closeBtn) {
                addEventListener(closeBtn, 'click', () => detailsModal.remove());
            } else {
                console.error('Close button not found in details modal');
            }

            // 绑定背景点击关闭事件
            const backdrop = detailsModal.querySelector('.modal-backdrop');
            if (backdrop) {
                addEventListener(backdrop, 'click', () => detailsModal.remove());
            }
        });

    } catch (error) {
        console.error('Failed to show plugin details:', error);
        showToast('无法加载插件详情', 'error');
    }
}

/**
 * 创建详情模态框
 * @param {Object} plugin 插件数据
 * @returns {Element} 模态框元素
 */
function createDetailsModal(plugin) {
    // 直接创建DOM元素
    const modal = document.createElement('div');
    modal.className = 'plugin-details-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000;';
    
    modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-content" style="background: white; padding: 20px; border-radius: 8px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto;">
            <div class="modal-header">
                <h2>插件详情：${plugin.name}</h2>
            </div>
            <div class="modal-body">
                <div class="plugin-detail-info">
                    <div class="detail-row" style="margin-bottom: 12px;">
                        <label style="font-weight: bold; display: inline-block; width: 80px;">名称：</label>
                        <span>${plugin.name}</span>
                    </div>
                    <div class="detail-row" style="margin-bottom: 12px;">
                        <label style="font-weight: bold; display: inline-block; width: 80px;">版本：</label>
                        <span>${plugin.version}</span>
                    </div>
                    <div class="detail-row" style="margin-bottom: 12px;">
                        <label style="font-weight: bold; display: inline-block; width: 80px;">描述：</label>
                        <span>${plugin.description}</span>
                    </div>
                    <div class="detail-row" style="margin-bottom: 12px;">
                        <label style="font-weight: bold; display: inline-block; width: 80px;">状态：</label>
                        <span class="status-badge ${plugin.enabled ? 'enabled' : 'disabled'}" style="padding: 2px 8px; border-radius: 4px; font-size: 12px; ${plugin.enabled ? 'background: #d4edda; color: #155724;' : 'background: #f8d7da; color: #721c24;'}">
                            ${plugin.enabled ? '已启用' : '已禁用'}
                        </span>
                    </div>
                    <div class="detail-row" style="margin-bottom: 12px;">
                        <label style="font-weight: bold; display: inline-block; width: 80px;">错误计数：</label>
                        <span>${plugin.errors} / ${plugin.maxErrors}</span>
                    </div>
                    <div class="detail-row" style="margin-bottom: 12px;">
                        <label style="font-weight: bold; display: inline-block; width: 80px;">创建时间：</label>
                        <span>${plugin.formattedCreatedAt || new Date(plugin.createdAt).toLocaleString()}</span>
                    </div>
                    <div class="detail-row" style="margin-bottom: 12px;">
                        <label style="font-weight: bold; display: inline-block; width: 80px;">更新时间：</label>
                        <span>${plugin.formattedUpdatedAt || new Date(plugin.updatedAt).toLocaleString()}</span>
                    </div>
                </div>
            </div>
            <div class="modal-footer" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-primary close-details-btn" style="padding: 8px 16px; border: none; background: #007bff; color: white; border-radius: 4px; cursor: pointer;">关闭</button>
            </div>
        </div>
    `;

    return modal;
}

/**
 * 重置插件错误计数
 * @param {string} pluginId 插件ID
 */
async function handleResetPluginErrors(pluginId) {
    try {
        const result = await resetPluginErrors(pluginId);

        if (result.success) {
            showToast(result.message, 'success');
            await renderPluginsScreen();
        } else {
            showToast(result.error, 'error');
        }

    } catch (error) {
        console.error('Failed to reset plugin errors:', error);
        showToast('重置失败，请重试', 'error');
    }
}

/**
 * 显示加载状态
 * @param {boolean} loading 是否显示加载
 */
function showLoading(loading) {
    if (elements.pluginsLoading) {
        elements.pluginsLoading.style.display = loading ? 'block' : 'none';
    }
    if (elements.pluginsList) {
        elements.pluginsList.style.display = loading ? 'none' : 'block';
    }
}

