/**
 * 权限管理视图组件
 * 提供权限设置界面和可见性控制
 */

import { permissionService, VisibilityLevels, ContentTypes, PermissionUtils } from '../services/permissions.js';
import { eventBus, EventTypes } from '../core/event-bus.js';
import { Button, Card, Modal } from '../components/index.js';
import { createNotification } from '../utils/notify.js';

/**
 * 权限管理器类
 */
export class PermissionManager {
    constructor() {
        this.currentSettings = null;
        this.initializeEventHandlers();
    }

    /**
     * 初始化事件处理器
     */
    initializeEventHandlers() {
        eventBus.on('permission.updated', (data) => {
            this.onPermissionUpdated(data);
        });

        eventBus.on('settings.privacy-opened', () => {
            this.renderPrivacySettings();
        });
    }

    /**
     * 渲染隐私设置页面
     * @param {HTMLElement} container 容器元素
     */
    async renderPrivacySettings(container) {
        if (!container) {
            container = document.querySelector('#privacy-settings') || document.body;
        }

        try {
            // 获取当前权限设置
            const stats = permissionService.getPermissionStats();
            
            const settingsHTML = `
                <div class="permission-settings">
                    <div class="settings-header">
                        <h2>隐私权限设置</h2>
                        <p>控制不同内容的可见性和访问权限</p>
                    </div>

                    <div class="settings-sections">
                        <!-- 默认可见性设置 -->
                        <div class="settings-section">
                            <h3>默认可见性</h3>
                            <p class="section-desc">设置新创建内容的默认可见性级别</p>
                            
                            <div class="visibility-controls">
                                ${Object.entries(ContentTypes).map(([key, type]) => `
                                    <div class="control-group">
                                        <label>${this.getContentTypeName(type)}</label>
                                        <select class="visibility-select" data-content-type="${type}">
                                            ${Object.entries(VisibilityLevels).map(([levelKey, level]) => `
                                                <option value="${level}" 
                                                    ${stats.defaultPermissions[type] === level ? 'selected' : ''}>
                                                    ${PermissionUtils.getVisibilityName(level)}
                                                </option>
                                            `).join('')}
                                        </select>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 朋友圈权限设置 -->
                        <div class="settings-section">
                            <h3>朋友圈权限</h3>
                            <p class="section-desc">控制AI朋友对朋友圈内容的访问权限</p>
                            
                            <div class="permission-options">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="allow-ai-comment" checked>
                                    允许AI朋友评论我的动态
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="allow-ai-like" checked>
                                    允许AI朋友点赞我的动态
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="auto-generate-moments">
                                    允许AI自动生成朋友圈动态
                                </label>
                            </div>
                        </div>

                        <!-- 聊天记录权限 -->
                        <div class="settings-section">
                            <h3>聊天记录权限</h3>
                            <p class="section-desc">控制不同AI角色对聊天历史的访问</p>
                            
                            <div class="chat-permissions">
                                <div class="control-group">
                                    <label>AI朋友可查看聊天历史</label>
                                    <select id="ai-friend-chat-access">
                                        <option value="none">不可查看</option>
                                        <option value="recent">最近7天</option>
                                        <option value="month" selected>最近30天</option>
                                        <option value="all">全部历史</option>
                                    </select>
                                </div>
                                <div class="control-group">
                                    <label>AI陌生人可查看聊天历史</label>
                                    <select id="ai-stranger-chat-access">
                                        <option value="none" selected>不可查看</option>
                                        <option value="current">仅当前对话</option>
                                        <option value="recent">最近3天</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- 内存访问权限 -->
                        <div class="settings-section">
                            <h3>AI记忆权限</h3>
                            <p class="section-desc">控制AI对个人记忆和学习数据的访问</p>
                            
                            <div class="memory-permissions">
                                <label class="checkbox-label">
                                    <input type="checkbox" id="allow-memory-share" checked>
                                    允许不同AI角色间共享记忆
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="allow-personality-learning" checked>
                                    允许AI学习和记录我的个性特征
                                </label>
                                <label class="checkbox-label">
                                    <input type="checkbox" id="allow-behavior-analysis">
                                    允许AI分析我的行为模式
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="settings-actions">
                        <button class="btn btn-primary" id="save-privacy-settings">保存设置</button>
                        <button class="btn btn-secondary" id="reset-privacy-settings">重置为默认</button>
                        <button class="btn btn-info" id="export-privacy-settings">导出设置</button>
                    </div>
                </div>
            `;

            container.innerHTML = settingsHTML;
            this.bindPrivacySettingsEvents(container);
            
        } catch (error) {
            console.error('渲染隐私设置失败:', error);
            container.innerHTML = `<div class="error-message">加载隐私设置失败: ${error.message}</div>`;
        }
    }

    /**
     * 绑定隐私设置事件
     * @param {HTMLElement} container 容器
     */
    bindPrivacySettingsEvents(container) {
        // 可见性选择器变更
        container.querySelectorAll('.visibility-select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.onVisibilityChanged(e.target.dataset.contentType, e.target.value);
            });
        });

        // 保存设置
        container.querySelector('#save-privacy-settings')?.addEventListener('click', () => {
            this.savePrivacySettings(container);
        });

        // 重置设置
        container.querySelector('#reset-privacy-settings')?.addEventListener('click', () => {
            this.resetPrivacySettings(container);
        });

        // 导出设置
        container.querySelector('#export-privacy-settings')?.addEventListener('click', () => {
            this.exportPrivacySettings();
        });

        // 复选框变更
        container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.onCheckboxChanged(e.target.id, e.target.checked);
            });
        });

        // 选择器变更
        container.querySelectorAll('select').forEach(select => {
            select.addEventListener('change', (e) => {
                this.onSelectChanged(e.target.id, e.target.value);
            });
        });
    }

    /**
     * 渲染权限控制组件
     * @param {string} contentId 内容ID
     * @param {string} contentType 内容类型
     * @param {string} currentVisibility 当前可见性
     * @returns {HTMLElement} 权限控制组件
     */
    renderPermissionControl(contentId, contentType, currentVisibility = VisibilityLevels.FRIENDS) {
        const controlDiv = document.createElement('div');
        controlDiv.className = 'permission-control';
        controlDiv.innerHTML = `
            <div class="permission-selector">
                <label class="permission-label">
                    <i class="icon-privacy"></i>
                    可见性
                </label>
                <select class="permission-select" data-content-id="${contentId}" data-content-type="${contentType}">
                    ${Object.entries(VisibilityLevels).map(([key, level]) => `
                        <option value="${level}" ${level === currentVisibility ? 'selected' : ''}>
                            ${PermissionUtils.getVisibilityName(level)}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;

        // 绑定事件
        const select = controlDiv.querySelector('.permission-select');
        select.addEventListener('change', async (e) => {
            const newVisibility = e.target.value;
            await this.updateContentPermission(contentId, contentType, newVisibility);
        });

        return controlDiv;
    }

    /**
     * 更新内容权限
     * @param {string} contentId 内容ID
     * @param {string} contentType 内容类型
     * @param {string} newVisibility 新可见性
     */
    async updateContentPermission(contentId, contentType, newVisibility) {
        try {
            const result = await permissionService.setContentPermission(contentId, contentType, {
                visibility: newVisibility
            });

            if (result.success) {
                createNotification('success', '权限设置已更新');
                
                // 发送权限变更事件
                await eventBus.emit('permission.content-updated', {
                    contentId,
                    contentType,
                    newVisibility,
                    timestamp: Date.now()
                });
            } else {
                createNotification('error', `权限更新失败: ${result.error}`);
            }

        } catch (error) {
            console.error('更新内容权限失败:', error);
            createNotification('error', '权限更新失败');
        }
    }

    /**
     * 渲染批量权限设置对话框
     * @param {Array} contentList 内容列表
     */
    renderBatchPermissionDialog(contentList) {
        const modal = Modal({
            title: '批量权限设置',
            size: 'medium',
            content: `
                <div class="batch-permission-dialog">
                    <div class="selected-content">
                        <h4>已选择 ${contentList.length} 项内容</h4>
                        <div class="content-preview">
                            ${contentList.slice(0, 5).map(item => `
                                <div class="content-item">
                                    <span class="content-type">${this.getContentTypeName(item.type)}</span>
                                    <span class="content-title">${item.title || item.content?.substring(0, 30) + '...'}</span>
                                </div>
                            `).join('')}
                            ${contentList.length > 5 ? `<div class="more-items">... 还有 ${contentList.length - 5} 项</div>` : ''}
                        </div>
                    </div>
                    
                    <div class="batch-settings">
                        <div class="control-group">
                            <label>设置可见性为</label>
                            <select id="batch-visibility">
                                ${Object.entries(VisibilityLevels).map(([key, level]) => `
                                    <option value="${level}">${PermissionUtils.getVisibilityName(level)}</option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <div class="batch-options">
                            <label class="checkbox-label">
                                <input type="checkbox" id="apply-to-similar">
                                同时应用到相同类型的其他内容
                            </label>
                        </div>
                    </div>
                </div>
            `,
            actions: [
                Button({ 
                    text: '应用', 
                    type: 'primary',
                    onClick: () => this.applyBatchPermissions(contentList, modal)
                }),
                Button({ 
                    text: '取消', 
                    type: 'secondary',
                    onClick: () => modal.close()
                })
            ]
        });

        document.body.appendChild(modal);
        modal.show();
    }

    /**
     * 应用批量权限设置
     * @param {Array} contentList 内容列表
     * @param {HTMLElement} modal 模态框
     */
    async applyBatchPermissions(contentList, modal) {
        try {
            const visibility = modal.querySelector('#batch-visibility').value;
            const applyToSimilar = modal.querySelector('#apply-to-similar').checked;

            let targetList = contentList;
            
            if (applyToSimilar) {
                // 扩展到相同类型的内容（这里需要从数据库查询）
                // 暂时只应用到已选择的内容
            }

            const results = [];
            const errors = [];

            for (const content of targetList) {
                const result = await permissionService.setContentPermission(
                    content.id, 
                    content.type, 
                    { visibility }
                );

                if (result.success) {
                    results.push(content);
                } else {
                    errors.push({ content, error: result.error });
                }
            }

            modal.close();

            if (results.length > 0) {
                createNotification('success', `成功更新 ${results.length} 项内容的权限`);
            }
            
            if (errors.length > 0) {
                createNotification('warning', `${errors.length} 项内容权限更新失败`);
            }

            // 触发权限批量更新事件
            await eventBus.emit('permission.batch-updated', {
                updated: results,
                errors,
                visibility,
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('批量权限设置失败:', error);
            createNotification('error', '批量权限设置失败');
        }
    }

    /**
     * 可见性变更处理
     * @param {string} contentType 内容类型
     * @param {string} visibility 可见性
     */
    onVisibilityChanged(contentType, visibility) {
        console.log(`${contentType} 默认可见性更改为: ${visibility}`);
        // 这里可以实时预览变更效果
    }

    /**
     * 复选框变更处理
     * @param {string} checkboxId 复选框ID
     * @param {boolean} checked 是否选中
     */
    onCheckboxChanged(checkboxId, checked) {
        console.log(`${checkboxId} 设置为: ${checked}`);
    }

    /**
     * 选择器变更处理
     * @param {string} selectId 选择器ID
     * @param {string} value 选中值
     */
    onSelectChanged(selectId, value) {
        console.log(`${selectId} 设置为: ${value}`);
    }

    /**
     * 保存隐私设置
     * @param {HTMLElement} container 容器
     */
    async savePrivacySettings(container) {
        try {
            const settings = {
                defaultVisibility: {},
                permissions: {},
                options: {}
            };

            // 收集默认可见性设置
            container.querySelectorAll('.visibility-select').forEach(select => {
                const contentType = select.dataset.contentType;
                settings.defaultVisibility[contentType] = select.value;
            });

            // 收集权限选项
            container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                settings.options[checkbox.id] = checkbox.checked;
            });

            // 收集选择器设置
            container.querySelectorAll('select').forEach(select => {
                if (select.id && !select.dataset.contentType) {
                    settings.permissions[select.id] = select.value;
                }
            });

            // 更新权限规则
            await permissionService.updatePermissionRules(settings);

            // 发送设置更新事件
            await eventBus.emit(EventTypes.SETTINGS_UPDATED, {
                section: 'privacy',
                settings,
                timestamp: Date.now()
            });

            createNotification('success', '隐私设置已保存');

        } catch (error) {
            console.error('保存隐私设置失败:', error);
            createNotification('error', '保存隐私设置失败');
        }
    }

    /**
     * 重置隐私设置
     * @param {HTMLElement} container 容器
     */
    resetPrivacySettings(container) {
        // 重新渲染设置页面
        this.renderPrivacySettings(container);
        createNotification('info', '隐私设置已重置为默认值');
    }

    /**
     * 导出隐私设置
     */
    async exportPrivacySettings() {
        try {
            const stats = permissionService.getPermissionStats();
            const exportData = {
                version: '1.0',
                timestamp: Date.now(),
                settings: stats,
                description: 'EPhone 隐私权限设置导出'
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `privacy-settings-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            createNotification('success', '隐私设置导出成功');

        } catch (error) {
            console.error('导出隐私设置失败:', error);
            createNotification('error', '导出隐私设置失败');
        }
    }

    /**
     * 权限更新事件处理
     * @param {Object} data 事件数据
     */
    onPermissionUpdated(data) {
        console.log('权限已更新:', data);
        
        // 更新相关UI
        const permissionControls = document.querySelectorAll(`[data-content-id="${data.contentId}"]`);
        permissionControls.forEach(control => {
            if (control.tagName === 'SELECT') {
                control.value = data.newVisibility;
            }
        });
    }

    /**
     * 获取内容类型名称
     * @param {string} contentType 内容类型
     * @returns {string} 中文名称
     */
    getContentTypeName(contentType) {
        const names = {
            [ContentTypes.MOMENT]: '朋友圈动态',
            [ContentTypes.CHAT_MESSAGE]: '聊天消息',
            [ContentTypes.TIMELINE]: '时间线',
            [ContentTypes.PROFILE]: '个人资料',
            [ContentTypes.MEMORY]: 'AI记忆'
        };
        return names[contentType] || '未知内容';
    }
}

// 创建全局权限管理器实例
export const permissionManager = new PermissionManager();

// 导出便捷函数
export const PermissionUI = {
    /**
     * 创建权限控制组件
     */
    createPermissionControl(contentId, contentType, currentVisibility) {
        return permissionManager.renderPermissionControl(contentId, contentType, currentVisibility);
    },

    /**
     * 显示批量权限设置对话框
     */
    showBatchPermissionDialog(contentList) {
        permissionManager.renderBatchPermissionDialog(contentList);
    },

    /**
     * 渲染隐私设置页面
     */
    renderPrivacySettings(container) {
        return permissionManager.renderPrivacySettings(container);
    }
};