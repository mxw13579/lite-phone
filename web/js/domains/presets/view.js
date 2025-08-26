/**
 * 预设管理视图层
 * 负责预设界面的渲染和用户交互
 */

import { 
    getAllPresets,
    getActivePreset,
    setActivePreset,
    createPreset,
    updatePreset,
    deletePreset,
    restorePresetDefaults,
    ensureDefaultPreset,
    DEFAULT_PROMPTS
} from './store.js';
import { $, byId, createElement, show, hide, setContent, addEventListener } from '../../utils/dom.js';
import { showToast, showSuccess, showError, showWarning } from '../../utils/notify.js';
import { validateRequired, validateLength } from '../../utils/validation.js';
import { routeManager } from '../../core/router.js';

// 页面元素和状态
let elements = {};
let editingPresetId = null;

/**
 * 初始化预设管理界面
 */
export async function initializePresetsView() {
    try {
        // 缓存页面元素
        cacheElements();
        
        // 绑定事件
        bindEvents();
        
        // 确保默认预设存在
        await ensureDefaultPreset();
        
        console.log('Presets view initialized');
    } catch (error) {
        console.error('Failed to initialize presets view:', error);
        showError('预设管理界面初始化失败');
    }
}

/**
 * 缓存页面元素
 */
function cacheElements() {
    elements = {
        // 预设列表页面
        presetList: byId('preset-list'),
        addPresetBtn: byId('add-preset-btn'),
        
        // 预设编辑器页面
        presetNameInput: byId('preset-name-input'),
        presetRemarkInput: byId('preset-remark-input'),
        promptImageInput: byId('prompt-image-input'),
        promptVoiceInput: byId('prompt-voice-input'),
        promptTransferInput: byId('prompt-transfer-input'),
        promptSingleInput: byId('prompt-single-input'),
        promptGroupInput: byId('prompt-group-input'),
        savePresetBtn: byId('save-preset-btn'),
        restoreDefaultsBtn: byId('restore-preset-defaults-btn'),
        deletePresetBtn: byId('delete-preset-btn')
    };
}

/**
 * 绑定事件处理器
 */
function bindEvents() {
    // 添加预设按钮
    if (elements.addPresetBtn) {
        addEventListener(elements.addPresetBtn, 'click', handleAddPreset);
    }
    
    // 保存预设按钮
    if (elements.savePresetBtn) {
        addEventListener(elements.savePresetBtn, 'click', handleSavePreset);
    }
    
    // 恢复默认值按钮
    if (elements.restoreDefaultsBtn) {
        addEventListener(elements.restoreDefaultsBtn, 'click', handleRestoreDefaults);
    }
    
    // 删除预设按钮
    if (elements.deletePresetBtn) {
        addEventListener(elements.deletePresetBtn, 'click', handleDeletePreset);
    }
}

/**
 * 渲染预设列表界面
 */
export async function renderPresetListScreen() {
    try {
        const presets = await getAllPresets();
        renderPresetsList(presets);
        
        console.log('Preset list rendered');
    } catch (error) {
        console.error('Failed to render preset list screen:', error);
        showError('加载预设列表失败');
    }
}

/**
 * 渲染预设列表
 * @param {Array} presets 预设数组
 */
function renderPresetsList(presets) {
    if (!elements.presetList) return;
    
    if (presets.length === 0) {
        elements.presetList.innerHTML = '<div class="no-presets">暂无预设</div>';
        return;
    }
    
    const presetItems = presets.map(preset => createPresetItem(preset));
    setContent(elements.presetList, presetItems.join(''), true);
    
    // 绑定预设项事件
    bindPresetItemEvents();
}

/**
 * 创建预设项HTML
 * @param {Object} preset 预设数据
 * @returns {string} HTML字符串
 */
function createPresetItem(preset) {
    const activeClass = preset.isActive ? 'active' : '';
    const builtInBadge = preset.isBuiltIn ? '<span class="built-in-badge">内置</span>' : '';
    
    return `
        <div class="preset-item ${activeClass}" data-preset-id="${preset.id}">
            <div class="preset-header">
                <div class="preset-info">
                    <h3 class="preset-name">${preset.name} ${builtInBadge}</h3>
                    <p class="preset-remark">${preset.remark || '无描述'}</p>
                    <div class="preset-meta">
                        <span class="preset-updated">更新：${preset.formattedUpdatedAt}</span>
                    </div>
                </div>
                <div class="preset-controls">
                    ${preset.isActive ? 
                        '<span class="active-indicator">已激活</span>' : 
                        `<button class="btn btn-primary activate-btn" data-preset-id="${preset.id}">设为激活</button>`
                    }
                </div>
            </div>
            <div class="preset-actions">
                <button class="btn btn-secondary preset-edit-btn" data-preset-id="${preset.id}" data-action="edit">
                    编辑
                </button>
                <button class="btn btn-secondary preset-details-btn" data-preset-id="${preset.id}" data-action="details">
                    详情
                </button>
                ${!preset.isBuiltIn ? `
                    <button class="btn btn-secondary duplicate-btn" data-preset-id="${preset.id}">
                        复制
                    </button>
                    <button class="btn btn-danger delete-btn" data-preset-id="${preset.id}">
                        删除
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

/**
 * 绑定预设项事件
 */
function bindPresetItemEvents() {
    if (!elements.presetList) return;
    
    // 使用事件委托处理所有按钮点击
    addEventListener(elements.presetList, 'click', (event) => {
        const button = event.target.closest('button[data-preset-id]');
        if (!button) return;
        
        const presetId = button.dataset.presetId;
        const action = button.dataset.action;
        
        if (button.classList.contains('activate-btn')) {
            handleActivatePreset(event);
        } else if (button.classList.contains('duplicate-btn')) {
            handleDuplicatePreset(event);
        } else if (button.classList.contains('delete-btn')) {
            handleDeletePresetFromList(event);
        } else if (action === 'edit') {
            handleEditPreset(presetId);
        } else if (action === 'details') {
            handleShowPresetDetails(presetId);
        }
    });
}

/**
 * 处理添加预设
 */
function handleAddPreset() {
    editingPresetId = null;
    clearPresetForm();
    showScreen('preset-editor-screen');
    
    // 隐藏删除按钮
    if (elements.deletePresetBtn) {
        elements.deletePresetBtn.style.display = 'none';
    }
    
    // 更新标题
    const title = byId('preset-editor-title');
    if (title) title.textContent = '新建预设';
}

/**
 * 编辑预设
 * @param {string} presetId 预设ID
 */
async function handleEditPreset(presetId) {
    try {
        const presets = await getAllPresets();
        const preset = presets.find(p => p.id === presetId);
        
        if (!preset) {
            showError('预设不存在');
            return;
        }
        
        editingPresetId = presetId;
        fillPresetForm(preset);
        showScreen('preset-editor-screen');
        
        // 显示删除按钮（内置预设除外）
        if (elements.deletePresetBtn) {
            elements.deletePresetBtn.style.display = preset.isBuiltIn ? 'none' : 'inline-block';
        }
        
        // 更新标题
        const title = byId('preset-editor-title');
        if (title) title.textContent = '编辑预设';
        
    } catch (error) {
        console.error('Failed to edit preset:', error);
        showError('加载预设失败');
    }
};

/**
 * 显示预设详情
 * @param {string} presetId 预设ID
 */
async function handleShowPresetDetails(presetId) {
    try {
        const presets = await getAllPresets();
        const preset = presets.find(p => p.id === presetId);
        
        if (!preset) {
            showError('预设不存在');
            return;
        }
        
        // 创建详情对话框
        const detailsModal = createPresetDetailsModal(preset);
        document.body.appendChild(detailsModal);
        
        // 显示对话框
        detailsModal.style.display = 'flex';
        
        // 绑定关闭事件
        const closeBtn = detailsModal.querySelector('.close-details-btn');
        addEventListener(closeBtn, 'click', () => detailsModal.remove());
        
    } catch (error) {
        console.error('Failed to show preset details:', error);
        showError('加载预设详情失败');
    }
};

/**
 * 创建预设详情模态框
 * @param {Object} preset 预设数据
 * @returns {Element} 模态框元素
 */
function createPresetDetailsModal(preset) {
    return createElement('div', {
        className: 'preset-details-modal',
        innerHTML: `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>预设详情：${preset.name}</h2>
                </div>
                <div class="modal-body">
                    <div class="preset-detail-info">
                        <div class="detail-row">
                            <label>名称：</label>
                            <span>${preset.name}</span>
                        </div>
                        <div class="detail-row">
                            <label>描述：</label>
                            <span>${preset.remark || '无描述'}</span>
                        </div>
                        <div class="detail-row">
                            <label>状态：</label>
                            <span class="status-badge ${preset.isActive ? 'active' : 'inactive'}">
                                ${preset.isActive ? '已激活' : '未激活'}
                            </span>
                        </div>
                        <div class="detail-row">
                            <label>类型：</label>
                            <span>${preset.isBuiltIn ? '内置预设' : '自定义预设'}</span>
                        </div>
                        <div class="detail-row">
                            <label>创建时间：</label>
                            <span>${new Date(preset.createdAt).toLocaleString()}</span>
                        </div>
                        <div class="detail-row">
                            <label>更新时间：</label>
                            <span>${new Date(preset.updatedAt).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-primary close-details-btn">关闭</button>
                </div>
            </div>
        `
    });
}

/**
 * 清空预设表单
 */
function clearPresetForm() {
    if (elements.presetNameInput) elements.presetNameInput.value = '';
    if (elements.presetRemarkInput) elements.presetRemarkInput.value = '';
    if (elements.promptImageInput) elements.promptImageInput.value = DEFAULT_PROMPTS.IMAGE;
    if (elements.promptVoiceInput) elements.promptVoiceInput.value = DEFAULT_PROMPTS.VOICE;
    if (elements.promptTransferInput) elements.promptTransferInput.value = DEFAULT_PROMPTS.TRANSFER;
    if (elements.promptSingleInput) elements.promptSingleInput.value = DEFAULT_PROMPTS.SINGLE;
    if (elements.promptGroupInput) elements.promptGroupInput.value = DEFAULT_PROMPTS.GROUP;
}

/**
 * 填充预设表单
 * @param {Object} preset 预设数据
 */
function fillPresetForm(preset) {
    if (elements.presetNameInput) elements.presetNameInput.value = preset.name;
    if (elements.presetRemarkInput) elements.presetRemarkInput.value = preset.remark || '';
    if (elements.promptImageInput) elements.promptImageInput.value = preset.promptImage || DEFAULT_PROMPTS.IMAGE;
    if (elements.promptVoiceInput) elements.promptVoiceInput.value = preset.promptVoice || DEFAULT_PROMPTS.VOICE;
    if (elements.promptTransferInput) elements.promptTransferInput.value = preset.promptTransfer || DEFAULT_PROMPTS.TRANSFER;
    if (elements.promptSingleInput) elements.promptSingleInput.value = preset.promptSingle || DEFAULT_PROMPTS.SINGLE;
    if (elements.promptGroupInput) elements.promptGroupInput.value = preset.promptGroup || DEFAULT_PROMPTS.GROUP;
}

/**
 * 处理保存预设
 */
async function handleSavePreset() {
    try {
        // 获取表单数据
        const formData = getPresetFormData();
        
        // 验证数据
        const validation = validatePresetData(formData);
        if (!validation.valid) {
            showError(validation.error);
            return;
        }
        
        let result;
        if (editingPresetId) {
            // 更新现有预设
            result = await updatePreset(editingPresetId, formData);
        } else {
            // 创建新预设
            result = await createPreset(formData);
        }
        
        if (result.success) {
            showToast(result.message, 'success');
            editingPresetId = null;
            showScreen('preset-list-screen');
            await renderPresetListScreen(); // 刷新列表
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to save preset:', error);
        showError('保存预设失败');
    }
}

/**
 * 获取预设表单数据
 * @returns {Object} 表单数据
 */
function getPresetFormData() {
    return {
        name: elements.presetNameInput?.value.trim() || '',
        remark: elements.presetRemarkInput?.value.trim() || '',
        promptImage: elements.promptImageInput?.value.trim() || DEFAULT_PROMPTS.IMAGE,
        promptVoice: elements.promptVoiceInput?.value.trim() || DEFAULT_PROMPTS.VOICE,
        promptTransfer: elements.promptTransferInput?.value.trim() || DEFAULT_PROMPTS.TRANSFER,
        promptSingle: elements.promptSingleInput?.value.trim() || DEFAULT_PROMPTS.SINGLE,
        promptGroup: elements.promptGroupInput?.value.trim() || DEFAULT_PROMPTS.GROUP
    };
}

/**
 * 验证预设数据
 * @param {Object} data 预设数据
 * @returns {Object} 验证结果
 */
function validatePresetData(data) {
    // 验证预设名称
    const nameValidation = validateRequired(data.name, '预设名称');
    if (!nameValidation.valid) {
        return nameValidation;
    }
    
    const lengthValidation = validateLength(data.name, 1, 50);
    if (!lengthValidation.valid) {
        return lengthValidation;
    }
    
    return { valid: true };
}

/**
 * 处理激活预设
 * @param {Event} event 事件对象
 */
async function handleActivatePreset(event) {
    const presetId = event.target.dataset.presetId;
    
    try {
        const result = await setActivePreset(presetId);
        
        if (result.success) {
            showToast(result.message, 'success');
            await renderPresetListScreen(); // 刷新列表
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to activate preset:', error);
        showError('激活预设失败');
    }
}

/**
 * 处理复制预设
 * @param {Event} event 事件对象
 */
async function handleDuplicatePreset(event) {
    const presetId = event.target.dataset.presetId;
    
    try {
        const presets = await getAllPresets();
        const originalPreset = presets.find(p => p.id === presetId);
        
        if (!originalPreset) {
            showError('预设不存在');
            return;
        }
        
        const duplicateData = {
            name: `${originalPreset.name} (副本)`,
            remark: originalPreset.remark,
            promptImage: originalPreset.promptImage,
            promptVoice: originalPreset.promptVoice,
            promptTransfer: originalPreset.promptTransfer,
            promptSingle: originalPreset.promptSingle,
            promptGroup: originalPreset.promptGroup
        };
        
        const result = await createPreset(duplicateData);
        
        if (result.success) {
            showToast('预设复制成功', 'success');
            await renderPresetListScreen(); // 刷新列表
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to duplicate preset:', error);
        showError('复制预设失败');
    }
}

/**
 * 处理从列表删除预设
 * @param {Event} event 事件对象
 */
async function handleDeletePresetFromList(event) {
    const presetId = event.target.dataset.presetId;
    
    if (confirm('确定要删除这个预设吗？此操作无法撤销。')) {
        await handleDeletePresetById(presetId);
    }
}

/**
 * 处理删除预设
 */
async function handleDeletePreset() {
    if (!editingPresetId) return;
    
    if (confirm('确定要删除这个预设吗？此操作无法撤销。')) {
        await handleDeletePresetById(editingPresetId);
    }
}

/**
 * 根据ID删除预设
 * @param {string} presetId 预设ID
 */
async function handleDeletePresetById(presetId) {
    try {
        const result = await deletePreset(presetId);
        
        if (result.success) {
            showToast(result.message, 'success');
            editingPresetId = null;
            showScreen('preset-list-screen');
            await renderPresetListScreen(); // 刷新列表
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to delete preset:', error);
        showError('删除预设失败');
    }
}

/**
 * 处理恢复默认值
 */
async function handleRestoreDefaults() {
    if (!editingPresetId) return;
    
    if (confirm('确定要恢复为默认值吗？当前的修改将会丢失。')) {
        try {
            const result = await restorePresetDefaults(editingPresetId);
            
            if (result.success) {
                showToast('已恢复为默认值', 'success');
                // 重新加载表单数据
                const presets = await getAllPresets();
                const preset = presets.find(p => p.id === editingPresetId);
                if (preset) {
                    fillPresetForm(preset);
                }
            } else {
                showError(result.error);
            }
            
        } catch (error) {
            console.error('Failed to restore defaults:', error);
            showError('恢复默认值失败');
        }
    }
}

/**
 * 显示屏幕
 * @param {string} screenId 屏幕ID
 */
function showScreen(screenId) {
    try {
        routeManager.navigateToScreen(screenId);
    } catch (error) {
        console.error('Failed to navigate to screen:', screenId, error);
        // Fallback: try basic screen switching
        const screen = document.getElementById(screenId);
        if (screen) {
            document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
            screen.style.display = 'block';
        } else {
            console.warn('Screen not found:', screenId);
        }
    }
}

