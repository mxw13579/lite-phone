/**
 * 数据管理模块
 * 负责整合backupService，提供统一的数据导入导出功能
 */

import { backupService } from '../services/backup.js';
import { showSuccess, showError, showWarning } from '../utils/notify.js';
import { eventBus, EventTypes } from '../core/event-bus.js';
import { escapeHtml } from '../utils/security.js'; // 🔒 安全修复：导入HTML转义函数

// 备份历史记录
let backupHistory = [];

/**
 * 初始化数据管理功能
 */
export function initializeDataManagement() {
    // 绑定新的按钮事件
    bindNewDataManagementEvents();
    
    // 绑定兼容的旧按钮事件
    bindLegacyDataManagementEvents();
    
    // 初始化备份历史
    loadBackupHistory();

    console.log('Data management initialized');
}

/**
 * 绑定新的数据管理事件
 */
function bindNewDataManagementEvents() {
    // 完整备份
    const fullBackupBtn = document.getElementById('export-full-backup-btn');
    if (fullBackupBtn) {
        fullBackupBtn.addEventListener('click', handleFullBackup);
    }

    // 增量备份
    const incrementalBackupBtn = document.getElementById('export-incremental-backup-btn');
    if (incrementalBackupBtn) {
        incrementalBackupBtn.addEventListener('click', handleIncrementalBackup);
    }

    // 选择性备份
    const selectiveBackupBtn = document.getElementById('export-selective-backup-btn');
    if (selectiveBackupBtn) {
        selectiveBackupBtn.addEventListener('click', handleSelectiveBackup);
    }

    // 完整恢复
    const fullRestoreBtn = document.getElementById('import-full-restore-btn');
    if (fullRestoreBtn) {
        fullRestoreBtn.addEventListener('click', () => triggerFileInput('import-data-input'));
    }

    // 选择性恢复
    const selectiveRestoreBtn = document.getElementById('import-selective-restore-btn');
    if (selectiveRestoreBtn) {
        selectiveRestoreBtn.addEventListener('click', () => triggerFileInput('import-selective-input'));
    }

    // 刷新备份历史
    const refreshBtn = document.getElementById('refresh-backup-history-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadBackupHistory);
    }

    // 文件输入处理
    const fullRestoreInput = document.getElementById('import-data-input');
    if (fullRestoreInput) {
        fullRestoreInput.addEventListener('change', (e) => handleDataImport(e, false));
    }

    const selectiveRestoreInput = document.getElementById('import-selective-input');
    if (selectiveRestoreInput) {
        selectiveRestoreInput.addEventListener('change', (e) => handleDataImport(e, true));
    }
}

/**
 * 绑定兼容的旧数据管理事件
 */
function bindLegacyDataManagementEvents() {
    // 绑定导出按钮
    const exportBtn = document.getElementById('export-data-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', handleDataExport);
    }

    // 绑定导入触发按钮
    const importTriggerBtn = document.getElementById('import-data-trigger-btn');
    if (importTriggerBtn) {
        importTriggerBtn.addEventListener('click', () => {
            const fileInput = document.getElementById('import-data-input');
            if (fileInput) {
                fileInput.click();
            }
        });
    }
}

/**
 * 处理完整备份
 */
async function handleFullBackup() {
    const button = document.getElementById('export-full-backup-btn');
    const originalText = button?.textContent;
    
    try {
        if (button) {
            button.disabled = true;
            button.textContent = '备份中...';
        }

        const result = await backupService.exportFullBackup();
        
        if (result.success) {
            await downloadBackupFile(result.data, result.filename);
            showSuccess(`完整备份创建成功！文件：${result.filename}`);
            
            // 更新备份历史
            await updateBackupHistory();
        } else {
            showError(result.error || '完整备份失败');
        }
        
    } catch (error) {
        console.error('Full backup failed:', error);
        showError('完整备份过程中发生错误');
        
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

/**
 * 处理增量备份
 */
async function handleIncrementalBackup() {
    const button = document.getElementById('export-incremental-backup-btn');
    const originalText = button?.textContent;
    
    try {
        if (button) {
            button.disabled = true;
            button.textContent = '增量备份中...';
        }

        const result = await backupService.exportIncrementalBackup();
        
        if (result.success) {
            await downloadBackupFile(result.data, result.filename);
            showSuccess(`增量备份创建成功！文件：${result.filename}`);
            
            // 更新备份历史
            await updateBackupHistory();
        } else {
            showError(result.error || '增量备份失败');
        }
        
    } catch (error) {
        console.error('Incremental backup failed:', error);
        showError('增量备份过程中发生错误');
        
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

/**
 * 处理选择性备份
 */
async function handleSelectiveBackup() {
    try {
        const categories = await getDataCategories();
        const selectedCategories = await showSelectiveModal(categories, '选择要备份的数据');
        
        if (selectedCategories.length === 0) {
            showWarning('未选择任何数据类型');
            return;
        }

        const button = document.getElementById('export-selective-backup-btn');
        const originalText = button?.textContent;
        
        try {
            if (button) {
                button.disabled = true;
                button.textContent = '选择性备份中...';
            }

            const result = await backupService.exportSelectiveBackup(selectedCategories);
            
            if (result.success) {
                await downloadBackupFile(result.data, result.filename);
                showSuccess(`选择性备份创建成功！文件：${result.filename}`);
                
                // 更新备份历史
                await updateBackupHistory();
            } else {
                showError(result.error || '选择性备份失败');
            }
            
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
        
    } catch (error) {
        console.error('Selective backup failed:', error);
        showError('选择性备份过程中发生错误');
    }
}

/**
 * 处理数据导入（兼容旧版和新版）
 */
async function handleDataImport(event, isSelective = false) {
    const file = event.target.files[0];
    if (!file) return;

    const originalFileName = file.name;
    
    try {
        const fileContent = await readFileContent(file);
        
        if (isSelective) {
            // 选择性恢复
            const backupData = JSON.parse(fileContent);
            const categories = Object.keys(backupData.data || {});
            
            if (categories.length === 0) {
                showError('备份文件中没有可恢复的数据类型');
                return;
            }
            
            const selectedCategories = await showSelectiveModal(
                categories.map(cat => ({ id: cat, name: getDataCategoryName(cat) })),
                '选择要恢复的数据'
            );
            
            if (selectedCategories.length === 0) {
                showWarning('未选择任何数据类型进行恢复');
                return;
            }
            
            const result = await backupService.importSelectiveBackup(fileContent, selectedCategories);
            
            if (result.success) {
                showSuccess(`选择性恢复完成！已恢复 ${selectedCategories.length} 种数据类型`);
            } else {
                showError(result.error || '选择性恢复失败');
            }
        } else {
            // 完整恢复
            const result = await backupService.importFullBackup(fileContent);
            
            if (result.success) {
                showSuccess(`数据恢复完成！文件：${originalFileName}`);
                
                // 刷新页面以反映更改
                if (confirm('数据恢复成功！需要刷新页面以查看更改，是否立即刷新？')) {
                    window.location.reload();
                }
            } else {
                showError(result.error || '数据恢复失败');
            }
        }
        
    } catch (error) {
        console.error('Import failed:', error);
        showError('导入过程中发生错误：' + (error.message || '未知错误'));
        
    } finally {
        // 清空文件输入
        event.target.value = '';
    }
}

/**
 * 触发文件输入
 * @param {string} inputId 输入元素的ID
 */
function triggerFileInput(inputId) {
    const fileInput = document.getElementById(inputId);
    if (fileInput) {
        fileInput.click();
    } else {
        console.error(`File input with ID '${inputId}' not found`);
    }
}

/**
 * 读取文件内容
 * @param {File} file 文件对象
 * @returns {Promise<string>} 文件内容
 */
function readFileContent(file) {
    // 🔒 安全修复：添加文件大小限制
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB限制
    if (file.size > MAX_FILE_SIZE) {
        return Promise.reject(new Error('文件过大，请选择小于50MB的文件'));
    }
    
    // 🔒 安全修复：验证文件类型
    const allowedTypes = ['application/json', 'text/plain'];
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.json')) {
        return Promise.reject(new Error('不支持的文件类型，请选择JSON文件'));
    }
    
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsText(file);
    });
}

/**
 * 获取数据类别
 * @returns {Array} 数据类别列表
 */
function getDataCategories() {
    return [
        { id: 'chats', name: '聊天记录', description: '所有聊天对话数据' },
        { id: 'presets', name: '预设设置', description: '角色预设和系统配置' },
        { id: 'worldBooks', name: '世界书', description: '知识库和背景设定' },
        { id: 'settings', name: '应用设置', description: '界面和功能配置' },
        { id: 'metadata', name: '元数据', description: '应用版本和统计信息' }
    ];
}

/**
 * 获取数据类别名称
 * @param {string} categoryId 类别ID
 * @returns {string} 类别名称
 */
function getDataCategoryName(categoryId) {
    const categories = {
        'chats': '聊天记录',
        'presets': '预设设置',
        'worldBooks': '世界书',
        'settings': '应用设置',
        'metadata': '元数据'
    };
    return categories[categoryId] || categoryId;
}

/**
 * 显示选择性备份/恢复对话框
 * @param {Array} categories 数据类别列表
 * @param {string} title 对话框标题
 * @returns {Promise<Array>} 用户选择的类别ID数组
 */
function showSelectiveModal(categories, title) {
    return new Promise((resolve, reject) => {
        const modalId = `selective-modal-${Date.now()}`;
        
        // 移除已存在的对话框
        const existingModals = document.querySelectorAll('.selective-modal');
        existingModals.forEach(modal => modal.remove());
        
        // 根据数据格式标准化categories
        const normalizedCategories = Array.isArray(categories) && categories.length > 0
            ? (categories[0].id ? categories : categories.map(cat => ({ id: cat, name: getDataCategoryName(cat) })))
            : getDataCategories();
        
        // 定义取消处理函数
        const handleCancel = () => {
            cleanup();
            reject(new Error('用户取消'));
        };
        
        // 定义确认处理函数
        const handleConfirm = () => {
            const form = document.getElementById(`${modalId}-form`);
            if (!form) {
                cleanup();
                reject(new Error('表单未找到'));
                return;
            }
            
            const checkedBoxes = form.querySelectorAll('input[type="checkbox"]:checked');
            const selectedCategories = Array.from(checkedBoxes).map(cb => cb.value);
            
            if (selectedCategories.length === 0) {
                showError('请至少选择一个数据类别');
                return;
            }
            
            cleanup();
            resolve(selectedCategories);
        };
        
        // 清理函数
        const cleanup = () => {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.remove();
            }
        };
        
        // 创建对话框HTML - 🔒 安全修复：所有动态内容都进行HTML转义
        const modalHtml = `
            <div id="${modalId}" class="modal selective-modal" style="display: block;">
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h3>${escapeHtml(title || '选择数据类别')}</h3>
                        <span class="close" onclick="this.closest('.modal').dispatchEvent(new CustomEvent('cancel'))">&times;</span>
                    </div>
                    <div class="modal-body">
                        <p>请选择要处理的数据类别：</p>
                        <form id="${modalId}-form" style="margin: 15px 0;">
                            ${normalizedCategories.map(category => `
                                <label style="display: block; margin: 10px 0; cursor: pointer;">
                                    <input type="checkbox" value="${escapeHtml(category.id)}" checked style="margin-right: 8px;">
                                    <strong>${escapeHtml(category.name)}</strong>
                                    <div style="margin-left: 24px; color: #666; font-size: 0.9em;">${escapeHtml(category.description || '数据类别')}</div>
                                </label>
                            `).join('')}
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary cancel-btn">取消</button>
                        <button type="button" class="btn btn-primary confirm-btn">确认</button>
                    </div>
                </div>
            </div>
        `;
        
        // 添加到页面
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // 绑定事件监听器
        const modal = document.getElementById(modalId);
        if (modal) {
            // 绑定取消事件
            modal.addEventListener('cancel', handleCancel);
            modal.querySelector('.cancel-btn')?.addEventListener('click', handleCancel);
            
            // 绑定确认事件
            modal.querySelector('.confirm-btn')?.addEventListener('click', handleConfirm);
            
            // ESC键关闭
            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    handleCancel();
                    document.removeEventListener('keydown', handleKeydown);
                }
            };
            document.addEventListener('keydown', handleKeydown);
            
            // 点击背景关闭
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    handleCancel();
                }
            });
        }
    });
}

/**
 * 加载备份历史
 * @returns {Promise<Array>} 备份历史列表
 */
async function loadBackupHistory() {
    try {
        const history = await backupService.getBackupHistory();
        return history || [];
    } catch (error) {
        console.error('Failed to load backup history:', error);
        return [];
    }
}

/**
 * 更新备份历史显示
 * @param {Array} history 备份历史
 */
function updateBackupHistory(history) {
    const historyContainer = document.querySelector('.backup-history-list');
    if (!historyContainer) return;
    
    if (!history || history.length === 0) {
        historyContainer.innerHTML = '<div class="no-history">暂无备份历史</div>';
        return;
    }
    
    const historyHtml = history.map(item => `
        <div class="backup-history-item" data-id="${escapeHtml(item.id)}">
            <div class="backup-info">
                <div class="backup-name">${escapeHtml(item.name || '未命名备份')}</div>
                <div class="backup-time">${escapeHtml(new Date(item.timestamp).toLocaleString())}</div>
                <div class="backup-details">
                    <span class="backup-type">${escapeHtml(getBackupTypeName(item.type))}</span>
                    <span class="backup-size">${escapeHtml(formatFileSize(item.size))}</span>
                    ${item.categories ? `<span class="backup-categories">${escapeHtml(item.categories.map(getDataCategoryName).join(', '))}</span>` : ''}
                </div>
            </div>
            <div class="backup-actions">
                <button class="btn btn-small restore-btn" data-backup-id="${escapeHtml(item.id)}">恢复</button>
                <button class="btn btn-small btn-danger delete-btn" data-backup-id="${escapeHtml(item.id)}">删除</button>
            </div>
        </div>
    `).join('');
    
    historyContainer.innerHTML = historyHtml;
    
    // 绑定事件监听器
    bindBackupHistoryEvents(historyContainer);
}

/**
 * 绑定备份历史事件
 * @param {Element} container 容器元素
 */
function bindBackupHistoryEvents(container) {
    // 使用事件委托处理按钮点击
    container.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-backup-id]');
        if (!button) return;
        
        const backupId = button.dataset.backupId;
        
        if (button.classList.contains('restore-btn')) {
            await handleRestoreFromHistory(backupId);
        } else if (button.classList.contains('delete-btn')) {
            await handleDeleteBackupHistory(backupId);
        }
    });
}

/**
 * 从历史恢复备份
 * @param {string} backupId 备份ID
 */
async function handleRestoreFromHistory(backupId) {
    if (!confirm('确定要恢复此备份吗？这将替换当前数据。')) {
        return;
    }
    
    try {
        const result = await backupService.restoreFromHistory(backupId);
        
        if (result.success) {
            showSuccess('备份恢复成功');
            setTimeout(() => {
                if (confirm('数据恢复完成，建议重新加载页面以确保所有数据生效。是否立即重新加载？')) {
                    window.location.reload();
                }
            }, 1000);
        } else {
            showError(`恢复失败: ${result.error}`);
        }
    } catch (error) {
        console.error('Restore from history failed:', error);
        showError(`恢复失败: ${error.message}`);
    }
}

/**
 * 删除备份历史
 * @param {string} backupId 备份ID
 */
async function handleDeleteBackupHistory(backupId) {
    if (!confirm('确定要删除此备份记录吗？此操作不可撤销。')) {
        return;
    }
    
    try {
        const result = await backupService.deleteBackupHistory(backupId);
        
        if (result.success) {
            showSuccess('备份记录已删除');
            // 刷新历史列表
            const history = await loadBackupHistory();
            updateBackupHistory(history);
        } else {
            showError(`删除失败: ${result.error}`);
        }
    } catch (error) {
        console.error('Delete backup history failed:', error);
        showError(`删除失败: ${error.message}`);
    }
}

/**
 * 获取备份类型名称
 * @param {string} type 备份类型
 * @returns {string} 类型名称
 */
function getBackupTypeName(type) {
    const types = {
        'full': '完整备份',
        'incremental': '增量备份',
        'selective': '选择性备份'
    };
    return types[type] || '未知类型';
}

/**
 * 处理数据导出
 */
async function handleDataExport() {
    const button = document.getElementById('export-data-btn');
    const originalText = button?.textContent;
    
    try {
        // 显示导出状态
        if (button) {
            button.disabled = true;
            button.textContent = '导出中...';
        }

        // 执行全量导出
        const result = await backupService.exportFullBackup();
        
        if (result.success) {
            // 下载备份文件
            await downloadBackupFile(result.data, result.filename);
            showSuccess(`数据导出成功: ${result.message}`);
            
        } else {
            showError(`导出失败: ${result.error}`);
        }

    } catch (error) {
        console.error('Data export failed:', error);
        showError(`导出失败: ${error.message}`);
        
    } finally {
        // 恢复按钮状态
        if (button) {
            button.disabled = false;
            button.textContent = originalText || '导出数据';
        }
    }
}


/**
 * 下载备份文件
 * @param {Object} data 备份数据
 * @param {string} filename 文件名
 */
async function downloadBackupFile(data, filename) {
    try {
        // 创建Blob对象
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        
        // 触发下载
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // 释放URL对象
        URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Failed to download backup file:', error);
        throw new Error('文件下载失败');
    }
}

/**
 * 读取文件内容为文本
 * @param {File} file 文件对象
 * @returns {Promise<string>} 文件内容
 */
function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            resolve(e.target.result);
        };
        
        reader.onerror = function() {
            reject(new Error('文件读取失败'));
        };
        
        reader.readAsText(file);
    });
}

/**
 * 获取数据统计信息
 * @returns {Promise<Object>} 统计信息
 */
export async function getDataStats() {
    try {
        const stats = await backupService.getSystemStats();
        
        return {
            totalSize: formatFileSize(stats.totalSize),
            tables: stats.tables,
            lastBackup: stats.lastBackup || '从未备份',
            version: stats.version || '1.0'
        };
        
    } catch (error) {
        console.error('Failed to get data stats:', error);
        return {
            totalSize: '未知',
            tables: {},
            lastBackup: '获取失败',
            version: '未知'
        };
    }
}

/**
 * 格式化文件大小
 * @param {number} bytes 字节数
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
}

/**
 * 显示数据管理状态
 * @param {Object} stats 统计信息
 */
export function displayDataManagementStatus(stats) {
    const desc = document.querySelector('.data-management-desc');
    if (!desc) return;

    const originalText = desc.textContent;
    
    desc.innerHTML = `
        ${originalText}
        <div class="data-stats" style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 4px; font-size: 0.9em;">
            <div><strong>数据大小：</strong>${escapeHtml(stats.totalSize)}</div>
            <div><strong>上次备份：</strong>${escapeHtml(stats.lastBackup)}</div>
            <div style="margin-top: 5px; color: #666;">
                聊天记录: ${escapeHtml(String(stats.tables.chats || 0))} 条 | 
                预设: ${escapeHtml(String(stats.tables.presets || 0))} 个 | 
                世界书: ${escapeHtml(String(stats.tables.worldBooks || 0))} 个
            </div>
        </div>
    `;
}

/**
 * 监听备份相关事件
 */
export function setupBackupEventListeners() {
    // 监听备份开始事件
    eventBus.on(EventTypes.BACKUP_STARTED, (data) => {
        console.log('Backup started:', data);
        showWarning('数据备份已开始...');
    });

    // 监听备份完成事件
    eventBus.on(EventTypes.BACKUP_COMPLETED, (data) => {
        console.log('Backup completed:', data);
    });

    // 监听备份错误事件
    eventBus.on(EventTypes.BACKUP_ERROR, (data) => {
        console.error('Backup error:', data);
        showError(`备份失败: ${data.error}`);
    });

    // 监听恢复开始事件
    eventBus.on(EventTypes.RESTORE_STARTED, (data) => {
        console.log('Restore started:', data);
        showWarning('数据恢复已开始...');
    });

    // 监听恢复完成事件
    eventBus.on(EventTypes.RESTORE_COMPLETED, (data) => {
        console.log('Restore completed:', data);
    });

    // 监听恢复错误事件
    eventBus.on(EventTypes.RESTORE_ERROR, (data) => {
        console.error('Restore error:', data);
        showError(`恢复失败: ${data.error}`);
    });
}