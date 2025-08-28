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
import { escapeHtml } from '../../utils/security.js'; // 🔒 安全修复：导入HTML转义函数
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
    
    // 构建HTML内容 - 🔒 安全修复：对所有动态内容进行HTML转义
    item.innerHTML = `
        <div class="memory-item-header">
            <span class="memory-type-badge ${memory.type}">${escapeHtml(getTypeDisplayName(memory.type))}</span>
            <span class="importance-score ${getImportanceLevel(memory.importance)}">${escapeHtml((memory.importance * 100).toFixed(0))}</span>
        </div>
        <div class="memory-content-preview">${escapeHtml(memory.content)}</div>
        <div class="memory-meta-info">
            <span class="memory-time">${escapeHtml(formatRelativeTime(memory.createdAt))}</span>
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

// ===== 记忆注入预览功能 =====

/**
 * 显示记忆注入预览界面
 */
export async function showMemoryInjectionPreview() {
    try {
        console.log('🔍 Showing memory injection preview...');
        
        // 获取当前聊天列表
        const chatsResult = await loadAvailableChats();
        if (!chatsResult.success) {
            throw new Error('无法加载聊天列表: ' + chatsResult.message);
        }
        
        // 获取可注入的记忆列表
        const memoriesResult = await loadInjectableMemories();
        if (!memoriesResult.success) {
            throw new Error('无法加载记忆列表: ' + memoriesResult.message);
        }
        
        // 渲染预览界面
        renderInjectionPreviewModal(chatsResult.data, memoriesResult.data);
        
        // 更新状态
        injectionPreview.isVisible = true;
        
        // 显示模态框
        const modal = byId('memory-injection-preview-modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('show');
        }
        
        showSuccess('记忆注入预览已打开');
        
    } catch (error) {
        console.error('❌ Failed to show injection preview:', error);
        showError('打开注入预览失败: ' + error.message);
    }
}

/**
 * 隐藏记忆注入预览界面
 */
function hideMemoryInjectionPreview() {
    const modal = byId('memory-injection-preview-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300); // 动画延迟
    }
    
    // 重置状态
    injectionPreview = {
        isVisible: false,
        selectedMemories: [],
        targetChatId: null,
        previewMode: 'simple',
        autoRefresh: true
    };
    
    console.log('📖 Memory injection preview closed');
}

/**
 * 渲染注入预览模态框
 * @param {Array} chats 聊天列表
 * @param {Array} memories 记忆列表
 */
function renderInjectionPreviewModal(chats, memories) {
    const modalContent = byId('injection-preview-content');
    if (!modalContent) return;
    
    modalContent.innerHTML = `
        <div class="injection-preview-header">
            <h3>📝 记忆注入预览</h3>
            <button id="close-injection-preview-btn" class="close-btn">×</button>
        </div>
        
        <div class="injection-preview-controls">
            <div class="control-group">
                <label for="injection-target-chat">目标聊天:</label>
                <select id="injection-target-chat" class="form-select">
                    <option value="">选择聊天...</option>
                    ${chats.map(chat => 
                        `<option value="${chat.id}">${escapeHtml(chat.name || '未命名聊天')}</option>`
                    ).join('')}
                </select>
            </div>
            
            <div class="control-group">
                <label>预览模式:</label>
                <div class="radio-group">
                    <label><input type="radio" name="preview-mode" value="simple" checked> 简洁</label>
                    <label><input type="radio" name="preview-mode" value="detailed"> 详细</label>
                    <label><input type="radio" name="preview-mode" value="raw"> 原始</label>
                </div>
            </div>
            
            <div class="control-group">
                <label>
                    <input type="checkbox" id="auto-refresh-preview" checked>
                    自动刷新预览
                </label>
            </div>
        </div>
        
        <div class="injection-preview-body">
            <div class="memory-selection-panel">
                <h4>选择记忆 (${memories.length}条)</h4>
                <div class="memory-list-injectable">
                    ${memories.map(memory => createInjectableMemoryItem(memory)).join('')}
                </div>
            </div>
            
            <div class="injection-preview-panel">
                <h4>注入预览</h4>
                <div id="injection-preview-result" class="preview-result">
                    <div class="preview-placeholder">
                        <p>👆 请选择聊天和记忆来预览注入效果</p>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="injection-preview-footer">
            <div class="injection-stats">
                <span id="selected-count">已选择: 0条记忆</span>
                <span id="estimated-tokens">预估令牌: 0</span>
            </div>
            <div class="injection-actions">
                <button id="refresh-preview-btn" class="btn btn-secondary">🔄 刷新预览</button>
                <button id="confirm-memory-injection-btn" class="btn btn-primary" disabled>✅ 确认注入</button>
            </div>
        </div>
    `;
    
    // 重新绑定事件
    bindInjectionPreviewEvents();
}

/**
 * 创建可注入记忆项
 * @param {Object} memory 记忆对象
 * @returns {string} HTML字符串
 */
function createInjectableMemoryItem(memory) {
    const importanceClass = getImportanceLevel(memory.importance);
    const typeDisplayName = getTypeDisplayName(memory.type);
    
    return `
        <div class="injectable-memory-item" data-memory-id="${memory.id}">
            <div class="memory-item-header">
                <label class="memory-select-label">
                    <input type="checkbox" class="memory-inject-checkbox" value="${memory.id}">
                    <span class="memory-type-badge ${memory.type}">${typeDisplayName}</span>
                    <span class="importance-score ${importanceClass}">${(memory.importance * 100).toFixed(0)}</span>
                </label>
            </div>
            <div class="memory-content-preview">
                ${escapeHtml(memory.content.length > 100 ? memory.content.substring(0, 100) + '...' : memory.content)}
            </div>
            <div class="memory-meta-info">
                <span class="memory-time">${formatRelativeTime(memory.createdAt)}</span>
                <span class="token-estimate">${estimateTokens(memory.content)}tokens</span>
            </div>
        </div>
    `;
}

/**
 * 处理预览模式变化
 * @param {Event} event 变化事件
 */
function handlePreviewModeChange(event) {
    injectionPreview.previewMode = event.target.value;
    
    if (injectionPreview.autoRefresh) {
        updateInjectionPreview();
    }
    
    console.log('📊 Preview mode changed to:', injectionPreview.previewMode);
}

/**
 * 处理自动刷新切换
 * @param {Event} event 变化事件
 */
function handleAutoRefreshToggle(event) {
    injectionPreview.autoRefresh = event.target.checked;
    
    if (injectionPreview.autoRefresh) {
        updateInjectionPreview();
    }
    
    console.log('🔄 Auto refresh:', injectionPreview.autoRefresh ? 'enabled' : 'disabled');
}

/**
 * 处理记忆选择变化
 * @param {Event} event 变化事件
 */
function handleMemorySelectionChange(event) {
    const memoryId = event.target.value;
    const isSelected = event.target.checked;
    
    if (isSelected) {
        injectionPreview.selectedMemories.push(memoryId);
    } else {
        const index = injectionPreview.selectedMemories.indexOf(memoryId);
        if (index > -1) {
            injectionPreview.selectedMemories.splice(index, 1);
        }
    }
    
    // 更新统计显示
    updateInjectionStats();
    
    // 自动刷新预览
    if (injectionPreview.autoRefresh) {
        updateInjectionPreview();
    }
    
    console.log('✅ Memory selection updated:', injectionPreview.selectedMemories);
}

/**
 * 处理目标聊天变化
 * @param {Event} event 变化事件
 */
function handleTargetChatChange(event) {
    injectionPreview.targetChatId = event.target.value;
    
    // 自动刷新预览
    if (injectionPreview.autoRefresh && injectionPreview.targetChatId) {
        updateInjectionPreview();
    }
    
    console.log('💬 Target chat changed to:', injectionPreview.targetChatId);
}

/**
 * 更新注入预览
 */
async function updateInjectionPreview() {
    const previewResult = byId('injection-preview-result');
    if (!previewResult) return;
    
    if (!injectionPreview.targetChatId || injectionPreview.selectedMemories.length === 0) {
        previewResult.innerHTML = `
            <div class="preview-placeholder">
                <p>👆 请选择聊天和记忆来预览注入效果</p>
            </div>
        `;
        return;
    }
    
    try {
        // 显示加载状态
        previewResult.innerHTML = '<div class="preview-loading">🔄 正在生成预览...</div>';
        
        // 获取选中记忆的详细信息
        const memoriesResult = await memoryStore.getMemoriesByIds(injectionPreview.selectedMemories);
        if (!memoriesResult.success) {
            throw new Error(memoriesResult.message);
        }
        
        const memories = memoriesResult.data;
        
        // 根据预览模式生成不同格式的预览
        let previewHtml = '';
        switch (injectionPreview.previewMode) {
            case 'simple':
                previewHtml = generateSimplePreview(memories);
                break;
            case 'detailed':
                previewHtml = generateDetailedPreview(memories);
                break;
            case 'raw':
                previewHtml = generateRawPreview(memories);
                break;
            default:
                previewHtml = generateSimplePreview(memories);
        }
        
        previewResult.innerHTML = previewHtml;
        
    } catch (error) {
        console.error('❌ Failed to update injection preview:', error);
        previewResult.innerHTML = `
            <div class="preview-error">
                <p>❌ 预览生成失败: ${escapeHtml(error.message)}</p>
            </div>
        `;
    }
}

/**
 * 生成简洁预览
 * @param {Array} memories 记忆列表
 * @returns {string} HTML字符串
 */
function generateSimplePreview(memories) {
    const sortedMemories = memories.sort((a, b) => b.importance - a.importance);
    
    return `
        <div class="preview-simple">
            <div class="preview-header">
                <h5>📋 将注入 ${memories.length} 条记忆</h5>
                <small>按重要性排序</small>
            </div>
            <div class="memory-preview-list">
                ${sortedMemories.map((memory, index) => `
                    <div class="memory-preview-item">
                        <div class="item-index">${index + 1}</div>
                        <div class="item-content">
                            <div class="item-header">
                                <span class="memory-type-badge ${memory.type}">${getTypeDisplayName(memory.type)}</span>
                                <span class="importance-score ${getImportanceLevel(memory.importance)}">${(memory.importance * 100).toFixed(0)}</span>
                            </div>
                            <div class="item-text">${escapeHtml(memory.content.length > 80 ? memory.content.substring(0, 80) + '...' : memory.content)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * 生成详细预览
 * @param {Array} memories 记忆列表
 * @returns {string} HTML字符串
 */
function generateDetailedPreview(memories) {
    const sortedMemories = memories.sort((a, b) => b.importance - a.importance);
    
    return `
        <div class="preview-detailed">
            <div class="preview-header">
                <h5>📋 详细注入预览 (${memories.length} 条记忆)</h5>
            </div>
            <div class="memory-preview-detailed">
                ${sortedMemories.map((memory, index) => `
                    <div class="memory-preview-card">
                        <div class="card-header">
                            <span class="item-index">#${index + 1}</span>
                            <span class="memory-type-badge ${memory.type}">${getTypeDisplayName(memory.type)}</span>
                            <span class="importance-score ${getImportanceLevel(memory.importance)}">重要性: ${(memory.importance * 100).toFixed(1)}%</span>
                        </div>
                        <div class="card-body">
                            <div class="memory-full-content">${escapeHtml(memory.content)}</div>
                            <div class="memory-metadata">
                                <span class="meta-item">🕐 ${formatRelativeTime(memory.createdAt)}</span>
                                <span class="meta-item">📝 ~${estimateTokens(memory.content)} tokens</span>
                                ${memory.chatId ? '<span class="meta-item">💬 来自聊天</span>' : '<span class="meta-item">🤖 系统记忆</span>'}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * 生成原始预览
 * @param {Array} memories 记忆列表
 * @returns {string} HTML字符串
 */
function generateRawPreview(memories) {
    const sortedMemories = memories.sort((a, b) => b.importance - a.importance);
    const rawText = sortedMemories.map(memory => memory.content).join('\n\n---\n\n');
    
    return `
        <div class="preview-raw">
            <div class="preview-header">
                <h5>🔧 原始文本预览</h5>
                <small>这是将要注入到AI上下文中的原始文本</small>
            </div>
            <div class="raw-text-container">
                <pre class="raw-text">${escapeHtml(rawText)}</pre>
            </div>
            <div class="raw-stats">
                <span>总字符数: ${rawText.length}</span>
                <span>预估令牌: ${estimateTokens(rawText)}</span>
            </div>
        </div>
    `;
}

/**
 * 更新注入统计信息
 */
function updateInjectionStats() {
    const selectedCountElement = byId('selected-count');
    const estimatedTokensElement = byId('estimated-tokens');
    const confirmBtn = byId('confirm-memory-injection-btn');
    
    const selectedCount = injectionPreview.selectedMemories.length;
    const canConfirm = selectedCount > 0 && injectionPreview.targetChatId;
    
    if (selectedCountElement) {
        selectedCountElement.textContent = `已选择: ${selectedCount}条记忆`;
    }
    
    if (estimatedTokensElement) {
        // 这里应该从实际记忆内容计算，简化处理
        const estimatedTokens = selectedCount * 50; // 简化估算
        estimatedTokensElement.textContent = `预估令牌: ${estimatedTokens}`;
    }
    
    if (confirmBtn) {
        confirmBtn.disabled = !canConfirm;
    }
}

/**
 * 处理确认注入
 */
async function handleConfirmInjection() {
    if (!injectionPreview.targetChatId || injectionPreview.selectedMemories.length === 0) {
        showError('请选择目标聊天和要注入的记忆');
        return;
    }
    
    if (!confirm(`确定要向聊天注入 ${injectionPreview.selectedMemories.length} 条记忆吗？`)) {
        return;
    }
    
    try {
        console.log('💉 Starting memory injection...');
        
        const result = await memoryStore.injectMemoriesToChat(
            injectionPreview.targetChatId,
            injectionPreview.selectedMemories
        );
        
        if (result.success) {
            showSuccess(`成功注入 ${injectionPreview.selectedMemories.length} 条记忆`);
            hideMemoryInjectionPreview();
            
            // 触发记忆注入完成事件
            eventBus.emit('memory.injection-completed', {
                chatId: injectionPreview.targetChatId,
                memoryIds: injectionPreview.selectedMemories,
                count: injectionPreview.selectedMemories.length
            });
        } else {
            throw new Error(result.message);
        }
        
    } catch (error) {
        console.error('❌ Memory injection failed:', error);
        showError('记忆注入失败: ' + error.message);
    }
}

/**
 * 加载可用聊天列表
 * @returns {Promise<Object>} 服务契约响应
 */
async function loadAvailableChats() {
    try {
        // 这里应该从chats域获取聊天列表
        // 临时模拟数据
        const mockChats = [
            { id: 'chat1', name: '助手聊天' },
            { id: 'chat2', name: '朋友聊天' },
            { id: 'chat3', name: '群聊讨论' }
        ];
        
        return {
            success: true,
            data: mockChats,
            message: 'Chats loaded successfully'
        };
        
    } catch (error) {
        return {
            success: false,
            data: null,
            message: error.message
        };
    }
}

/**
 * 加载可注入记忆列表
 * @returns {Promise<Object>} 服务契约响应
 */
async function loadInjectableMemories() {
    try {
        return await memoryStore.getMemoryList({
            type: 'all',
            limit: 100,
            sortBy: 'importance',
            sortOrder: 'desc'
        });
        
    } catch (error) {
        return {
            success: false,
            data: null,
            message: error.message
        };
    }
}

/**
 * 估算文本令牌数量
 * @param {string} text 文本内容
 * @returns {number} 估算令牌数
 */
function estimateTokens(text) {
    // 简化的令牌估算：中文约1.5字符/令牌，英文约4字符/令牌
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

// 兼容性导出 - 不重复导出已导出的函数
export { initializeMemoriesView as initializeMemoryView };