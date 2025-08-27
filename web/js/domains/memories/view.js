/**
 * 记忆管理视图层
 * 
 * 功能概述：
 * - 记忆管理界面渲染和用户交互
 * - 记忆详情查看和编辑功能
 * - 记忆设置管理界面
 * 
 * @fileoverview 记忆管理视图，遵循Store-View模式和SOLID原则
 */

import { memoryStore } from './store.js';
import { $, byId, createElement } from '../../utils/dom.js';
import { showToast, showSuccess, showError } from '../../utils/notify.js';
import { formatDate, formatRelativeTime } from '../../utils/format.js';
import { routeManager } from '../../core/router.js';
import { eventBus, EventTypes } from '../../core/event-bus.js';

let currentMemoryId = null;
let currentFilter = 'all';
let isInitialized = false;

/**
 * 初始化记忆管理视图
 * @returns {Promise<void>}
 */
export async function initializeMemoriesView() {
    if (isInitialized) return;
    
    try {
        // 初始化存储
        const result = await memoryStore.initialize();
        if (!result.success) {
            throw new Error(result.message);
        }
        
        // 绑定事件处理器
        bindEvents();
        
        // 设置事件监听
        setupEventListeners();
        
        isInitialized = true;
        console.log('✅ Memory view initialized successfully');
        
    } catch (error) {
        console.error('❌ Memory view initialization failed:', error);
        showError('记忆管理初始化失败: ' + error.message);
    }
}

/**
 * 绑定事件处理器
 * @private
 */
function bindEvents() {
    // 记忆类型筛选器
    const filterTabs = document.querySelectorAll('.filter-tab[data-memory-type]');
    filterTabs.forEach(tab => {
        tab.addEventListener('click', handleFilterChange);
    });
    
    // 记忆设置按钮
    const settingsBtn = byId('memory-settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            routeManager.navigateTo('memory-settings-screen');
        });
    }
    
    // 记忆详情删除按钮
    const deleteBtn = byId('delete-memory-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', handleDeleteMemory);
    }
    
    // 记忆设置保存按钮
    const saveSettingsBtn = byId('save-memory-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', handleSaveSettings);
    }
    
    // 记忆设置操作按钮
    bindSettingsActions();
}

/**
 * 绑定记忆设置相关操作
 * @private
 */
function bindSettingsActions() {
    const actions = {
        'manual-compression-btn': handleManualCompression,
        'export-memories-btn': handleExportMemories,
        'clear-all-memories-btn': handleClearAllMemories
    };
    
    Object.entries(actions).forEach(([id, handler]) => {
        const element = byId(id);
        if (element) {
            element.addEventListener('click', handler);
        }
    });
}

/**
 * 设置事件监听器
 * @private
 */
function setupEventListeners() {
    // 监听记忆形成事件
    eventBus.on(EventTypes.MEMORY_FORMED, handleMemoryFormed);
    
    // 监听记忆删除事件
    eventBus.on('memory.deleted', handleMemoryDeleted);
    
    // 监听路由变化，刷新界面
    eventBus.on('route.changed', handleRouteChanged);
}

/**
 * 处理记忆筛选变化
 * @param {Event} event 点击事件
 */
async function handleFilterChange(event) {
    const tab = event.target;
    const newFilter = tab.dataset.memoryType;
    
    if (newFilter === currentFilter) return;
    
    // 更新激活状态
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    currentFilter = newFilter;
    
    // 重新加载记忆列表
    await loadMemoryList();
}

/**
 * 处理记忆删除
 */
async function handleDeleteMemory() {
    if (!currentMemoryId) {
        showError('没有选中的记忆');
        return;
    }
    
    if (!confirm('确定要删除这条记忆吗？此操作无法撤销。')) {
        return;
    }
    
    try {
        const result = await memoryStore.deleteMemory(currentMemoryId);
        
        if (result.success) {
            showSuccess('记忆删除成功');
            routeManager.navigateTo('memory-management-screen');
            await loadMemoryList(); // 刷新列表
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('Delete memory failed:', error);
        showError('删除记忆失败: ' + error.message);
    }
}

/**
 * 处理设置保存
 */
async function handleSaveSettings() {
    try {
        const settings = collectSettingsFromForm();
        
        const result = await memoryStore.saveMemorySettings(settings);
        
        if (result.success) {
            showSuccess('设置保存成功');
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('Save settings failed:', error);
        showError('设置保存失败: ' + error.message);
    }
}

/**
 * 从表单收集设置数据
 * @returns {Object} 设置对象
 */
function collectSettingsFromForm() {
    return {
        enabled: byId('memory-enabled')?.checked ?? true,
        maxMemoriesPerRole: parseInt(byId('max-memories-per-role')?.value) || 1000,
        importanceThreshold: parseFloat(byId('memory-importance-threshold')?.value) || 0.3,
        autoCompressionEnabled: byId('auto-compression-enabled')?.checked ?? true,
        compressionTimeWindow: parseInt(byId('compression-time-window')?.value) || 30,
        similarityThreshold: parseFloat(byId('similarity-threshold')?.value) || 0.7,
        tokenBudget: parseInt(byId('memory-token-budget')?.value) || 10000,
        tokenRatio: parseFloat(byId('memory-token-ratio')?.value) || 0.3,
        maxMemoriesPerContext: parseInt(byId('max-memories-per-context')?.value) || 20
    };
}

/**
 * 处理手动压缩
 */
async function handleManualCompression() {
    if (!confirm('确定要手动压缩记忆吗？这可能需要一些时间。')) {
        return;
    }
    
    try {
        // TODO: 获取当前角色ID
        const roleId = 'default'; // 临时使用默认角色
        
        const result = await memoryStore.manualCompression(roleId);
        
        if (result.success) {
            showSuccess('记忆压缩完成');
            await renderMemoryManagementScreen(); // 刷新界面
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('Manual compression failed:', error);
        showError('记忆压缩失败: ' + error.message);
    }
}

/**
 * 处理导出记忆
 */
async function handleExportMemories() {
    try {
        const result = await memoryStore.exportMemories({
            format: 'json',
            includeMetadata: true
        });
        
        if (result.success) {
            showSuccess(`成功导出 ${result.data.exportedCount} 条记忆`);
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('Export memories failed:', error);
        showError('导出记忆失败: ' + error.message);
    }
}

/**
 * 处理清空所有记忆
 */
async function handleClearAllMemories() {
    if (!confirm('⚠️ 警告：此操作将删除所有记忆数据，无法撤销！\n\n确定要继续吗？')) {
        return;
    }
    
    if (!confirm('请再次确认：真的要清空所有记忆吗？')) {
        return;
    }
    
    try {
        const result = await memoryStore.clearAllMemories();
        
        if (result.success) {
            showSuccess(result.message);
            await renderMemoryManagementScreen(); // 刷新界面
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('Clear all memories failed:', error);
        showError('清空记忆失败: ' + error.message);
    }
}

/**
 * 处理记忆形成事件
 * @param {Object} data 记忆数据
 */
async function handleMemoryFormed(data) {
    console.log('💭 Memory formed:', data);
    
    // 如果当前在记忆管理界面，刷新显示
    if (routeManager.getCurrentScreen() === 'memory-management-screen') {
        await loadMemoryList();
        await updateStatsDisplay();
    }
}

/**
 * 处理记忆删除事件
 * @param {Object} data 删除事件数据
 */
async function handleMemoryDeleted(data) {
    console.log('🗑️ Memory deleted:', data);
    
    // 刷新界面
    if (routeManager.getCurrentScreen() === 'memory-management-screen') {
        await loadMemoryList();
        await updateStatsDisplay();
    }
}

/**
 * 处理路由变化
 * @param {Object} data 路由数据
 */
async function handleRouteChanged(data) {
    if (data.to === 'memory-management-screen') {
        await renderMemoryManagementScreen();
    } else if (data.to === 'memory-settings-screen') {
        await renderMemorySettingsScreen();
    }
}

/**
 * 渲染记忆管理主界面
 */
export async function renderMemoryManagementScreen() {
    console.log('🎨 Rendering memory management screen...');
    
    try {
        // 显示加载状态
        showLoadingState();
        
        // 加载统计数据
        await updateStatsDisplay();
        
        // 加载记忆列表
        await loadMemoryList();
        
        // 隐藏加载状态
        hideLoadingState();
        
        console.log('✅ Memory management screen rendered');
        
    } catch (error) {
        console.error('❌ Failed to render memory management screen:', error);
        showError('加载记忆管理界面失败: ' + error.message);
        hideLoadingState();
    }
}

/**
 * 更新统计显示
 */
async function updateStatsDisplay() {
    try {
        const result = await memoryStore.getMemoryStats();
        
        if (!result.success) {
            throw new Error(result.message);
        }
        
        const stats = result.data;
        
        // 更新统计卡片
        const elements = {
            'total-memories': stats.total,
            'important-memories': stats.byImportance.high,
            'avg-importance': stats.avgImportance.toFixed(1)
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = byId(id);
            if (element) {
                element.textContent = value;
            }
        });
        
    } catch (error) {
        console.error('Update stats display failed:', error);
        showError('更新统计数据失败: ' + error.message);
    }
}

/**
 * 加载记忆列表
 */
async function loadMemoryList() {
    try {
        const result = await memoryStore.getMemoryList({
            type: currentFilter,
            limit: 50,
            sortBy: 'createdAt',
            sortOrder: 'desc'
        });
        
        if (!result.success) {
            throw new Error(result.message);
        }
        
        const { memories } = result.data;
        renderMemoryList(memories);
        
    } catch (error) {
        console.error('Load memory list failed:', error);
        showError('加载记忆列表失败: ' + error.message);
    }
}

/**
 * 渲染记忆列表
 * @param {Array} memories 记忆数组
 */
function renderMemoryList(memories) {
    const memoryList = byId('memory-list');
    const emptyState = byId('memory-list-empty');
    
    if (!memoryList) return;
    
    // 清空现有内容
    memoryList.innerHTML = '';
    
    if (memories.length === 0) {
        // 显示空状态
        if (emptyState) {
            emptyState.style.display = 'flex';
        }
        return;
    }
    
    // 隐藏空状态
    if (emptyState) {
        emptyState.style.display = 'none';
    }
    
    // 渲染记忆项
    memories.forEach(memory => {
        const memoryElement = createMemoryItem(memory);
        memoryList.appendChild(memoryElement);
    });
}

/**
 * 创建记忆项元素
 * @param {Object} memory 记忆数据
 * @returns {HTMLElement} 记忆项DOM元素
 */
function createMemoryItem(memory) {
    const item = createElement('div', { className: 'memory-item' });
    
    // 设置点击事件
    item.addEventListener('click', () => {
        currentMemoryId = memory.id;
        showMemoryDetail(memory);
    });
    
    // 构建HTML内容
    item.innerHTML = `
        <div class="memory-item-header">
            <span class="memory-type-badge ${memory.type}">${getTypeDisplayName(memory.type)}</span>
            <span class="importance-score ${getImportanceLevel(memory.importance)}">${(memory.importance * 100).toFixed(0)}</span>
        </div>
        <div class="memory-content-preview">${escapeHtml(memory.content)}</div>
        <div class="memory-meta-info">
            <span class="memory-time">${formatRelativeTime(memory.createdAt)}</span>
            <span class="memory-chat">${memory.chatId ? '来自聊天' : '系统记忆'}</span>
        </div>
    `;
    
    return item;
}

/**
 * 显示记忆详情
 * @param {Object} memory 记忆数据
 */
async function showMemoryDetail(memory) {
    try {
        // 获取完整记忆详情
        const result = await memoryStore.getMemoryDetail(memory.id);
        
        if (!result.success) {
            throw new Error(result.message);
        }
        
        const detailData = result.data;
        
        // 设置当前记忆ID
        currentMemoryId = memory.id;
        
        // 填充详情界面
        populateMemoryDetail(detailData);
        
        // 导航到详情界面
        routeManager.navigateTo('memory-detail-screen');
        
    } catch (error) {
        console.error('Show memory detail failed:', error);
        showError('加载记忆详情失败: ' + error.message);
    }
}

/**
 * 填充记忆详情界面
 * @param {Object} memory 记忆详情数据
 */
function populateMemoryDetail(memory) {
    // 记忆内容
    const contentElement = byId('memory-detail-content');
    if (contentElement) {
        contentElement.textContent = memory.content;
    }
    
    // 记忆类型
    const typeElement = byId('memory-detail-type');
    if (typeElement) {
        typeElement.textContent = memory.typeDisplayName;
        typeElement.className = `meta-value memory-type-badge ${memory.type}`;
    }
    
    // 重要性评分
    const importanceElement = byId('memory-detail-importance');
    if (importanceElement) {
        importanceElement.textContent = (memory.importance * 100).toFixed(1);
        importanceElement.className = `meta-value importance-score ${memory.importanceLevel}`;
    }
    
    // 创建时间
    const createdElement = byId('memory-detail-created');
    if (createdElement) {
        createdElement.textContent = memory.formattedCreatedAt;
    }
    
    // 所属聊天
    const chatElement = byId('memory-detail-chat');
    if (chatElement) {
        chatElement.textContent = memory.chatInfo ? memory.chatInfo.name : '系统记忆';
    }
    
    // 相关标签
    const tagsElement = byId('memory-detail-tags');
    if (tagsElement && memory.tags) {
        tagsElement.innerHTML = memory.tags.map(tag => 
            `<span class="memory-tag">${escapeHtml(tag)}</span>`
        ).join('');
    }
    
    // 上下文信息
    populateContextInfo(memory);
}

/**
 * 填充上下文信息
 * @param {Object} memory 记忆数据
 */
function populateContextInfo(memory) {
    const contextMap = {
        'context-sender': memory.senderType || 'unknown',
        'context-personal': memory.hasPersonalInfo ? '是' : '否',
        'context-emotional': memory.isEmotional ? '是' : '否',
        'context-group': memory.isGroupMessage ? '是' : '否'
    };
    
    Object.entries(contextMap).forEach(([id, value]) => {
        const element = byId(id);
        if (element) {
            element.textContent = value;
        }
    });
}

/**
 * 渲染记忆设置界面
 */
export async function renderMemorySettingsScreen() {
    try {
        // 加载当前设置
        const result = await memoryStore.loadMemorySettings();
        
        if (!result.success) {
            throw new Error(result.message);
        }
        
        const settings = result.data;
        
        // 填充设置表单
        populateSettingsForm(settings);
        
    } catch (error) {
        console.error('Render memory settings screen failed:', error);
        showError('加载记忆设置失败: ' + error.message);
    }
}

/**
 * 填充设置表单
 * @param {Object} settings 设置数据
 */
function populateSettingsForm(settings) {
    const fieldMap = {
        'memory-enabled': settings.enabled,
        'max-memories-per-role': settings.maxMemoriesPerRole,
        'memory-importance-threshold': settings.importanceThreshold,
        'auto-compression-enabled': settings.autoCompressionEnabled,
        'compression-time-window': settings.compressionTimeWindow,
        'similarity-threshold': settings.similarityThreshold,
        'memory-token-budget': settings.tokenBudget,
        'memory-token-ratio': settings.tokenRatio,
        'max-memories-per-context': settings.maxMemoriesPerContext
    };
    
    Object.entries(fieldMap).forEach(([id, value]) => {
        const element = byId(id);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = value;
            } else {
                element.value = value;
            }
        }
    });
    
    // 更新范围输入显示值
    updateRangeDisplays();
}

/**
 * 更新范围输入显示值
 */
function updateRangeDisplays() {
    const ranges = [
        { input: 'memory-importance-threshold', display: 'importance-threshold-value' },
        { input: 'similarity-threshold', display: 'similarity-threshold-value' },
        { input: 'memory-token-ratio', display: 'memory-token-ratio-value' }
    ];
    
    ranges.forEach(({ input, display }) => {
        const inputElement = byId(input);
        const displayElement = byId(display);
        
        if (inputElement && displayElement) {
            displayElement.textContent = inputElement.value;
            
            inputElement.addEventListener('input', () => {
                displayElement.textContent = inputElement.value;
            });
        }
    });
}

/**
 * 显示加载状态
 */
function showLoadingState() {
    const loadingElement = byId('memory-list-loading');
    if (loadingElement) {
        loadingElement.style.display = 'flex';
    }
}

/**
 * 隐藏加载状态
 */
function hideLoadingState() {
    const loadingElement = byId('memory-list-loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

// ===== 辅助函数 =====

/**
 * 获取记忆类型显示名称
 * @param {string} type 记忆类型
 * @returns {string} 显示名称
 */
function getTypeDisplayName(type) {
    const typeNames = {
        semantic: '知识记忆',
        episodic: '情节记忆', 
        social: '社交记忆',
        general: '一般记忆'
    };
    return typeNames[type] || '未知类型';
}

/**
 * 获取重要性等级
 * @param {number} importance 重要性评分
 * @returns {string} 等级字符串
 */
function getImportanceLevel(importance) {
    if (importance >= 0.7) return 'high';
    if (importance >= 0.4) return 'medium';
    return 'low';
}

/**
 * HTML转义
 * @param {string} text 待转义文本
 * @returns {string} 转义后的文本
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 兼容性导出 - 不重复导出已导出的函数
export { initializeMemoriesView as initializeMemoryView };