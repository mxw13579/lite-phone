/**
 * 世界书管理视图层
 */

import { 
    getAllWorldBooks,
    getWorldBookDetail,
    createWorldBook,
    updateWorldBook,
    deleteWorldBook,
    searchWorldBooks,
    getWorldBookStats
} from './store.js';
import { $, byId, createElement, show, hide, setContent, addEventListener } from '../../utils/dom.js';
import { showToast, showSuccess, showError, showWarning } from '../../utils/notify.js';
import { validateRequired, validateLength } from '../../utils/validation.js';
import { routeManager } from '../../core/router.js';

// 页面元素和状态
let elements = {};
let editingBookId = null;

/**
 * 初始化世界书管理界面
 */
export async function initializeWorldBookView() {
    try {
        // 缓存页面元素
        cacheElements();
        
        // 绑定事件
        bindEvents();
        
        console.log('World book view initialized');
    } catch (error) {
        console.error('Failed to initialize world book view:', error);
        showError('世界书界面初始化失败');
    }
}

/**
 * 缓存页面元素
 */
function cacheElements() {
    elements = {
        // 世界书列表页面
        worldBookList: byId('world-book-list'),
        addWorldBookBtn: byId('add-world-book-btn'),
        
        // 世界书编辑器页面
        worldBookNameInput: byId('world-book-name-input'),
        worldBookContentInput: byId('world-book-content-input'),
        saveWorldBookBtn: byId('save-world-book-btn')
    };
}

/**
 * 绑定事件处理器
 */
function bindEvents() {
    // 添加世界书按钮
    if (elements.addWorldBookBtn) {
        addEventListener(elements.addWorldBookBtn, 'click', handleAddWorldBook);
    }
    
    // 保存世界书按钮
    if (elements.saveWorldBookBtn) {
        addEventListener(elements.saveWorldBookBtn, 'click', handleSaveWorldBook);
    }
}

/**
 * 渲染世界书列表界面
 */
export async function renderWorldBookScreen() {
    try {
        const [worldBooks, stats] = await Promise.all([
            getAllWorldBooks(),
            getWorldBookStats()
        ]);
        
        renderWorldBooksList(worldBooks, stats);
        
        console.log('World book screen rendered');
    } catch (error) {
        console.error('Failed to render world book screen:', error);
        showError('加载世界书列表失败');
    }
}

/**
 * 渲染世界书列表
 * @param {Array} worldBooks 世界书数组
 * @param {Object} stats 统计信息
 */
function renderWorldBooksList(worldBooks, stats) {
    if (!elements.worldBookList) return;
    
    let content = '';
    
    // 添加统计信息
    if (stats) {
        content += `
            <div class="world-book-stats">
                <div class="stats-item">
                    <span class="stats-label">总数量:</span>
                    <span class="stats-value">${stats.total}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-label">总字数:</span>
                    <span class="stats-value">${stats.totalWords}</span>
                </div>
                <div class="stats-item">
                    <span class="stats-label">平均字数:</span>
                    <span class="stats-value">${stats.averageWords}</span>
                </div>
            </div>
        `;
    }
    
    if (worldBooks.length === 0) {
        content += '<div class="no-world-books">暂无世界书</div>';
    } else {
        const worldBookItems = worldBooks.map(book => createWorldBookItem(book));
        content += worldBookItems.join('');
    }
    
    setContent(elements.worldBookList, content, true);
    
    // 绑定世界书项事件
    bindWorldBookItemEvents();
}

/**
 * 创建世界书项HTML
 * @param {Object} worldBook 世界书数据
 * @returns {string} HTML字符串
 */
function createWorldBookItem(worldBook) {
    return `
        <div class="world-book-item" data-book-id="${worldBook.id}">
            <div class="world-book-header">
                <div class="world-book-info">
                    <h3 class="world-book-name">${worldBook.name}</h3>
                    <p class="world-book-preview">${worldBook.contentPreview}</p>
                    <div class="world-book-meta">
                        <span class="word-count">${worldBook.wordCount} 字</span>
                        <span class="updated-time">更新：${worldBook.formattedUpdatedAt}</span>
                    </div>
                </div>
            </div>
            <div class="world-book-actions">
                <button class="btn btn-primary world-book-edit-btn" data-book-id="${worldBook.id}" data-action="edit">
                    编辑
                </button>
                <button class="btn btn-secondary world-book-details-btn" data-book-id="${worldBook.id}" data-action="details">
                    详情
                </button>
                <button class="btn btn-secondary duplicate-btn" data-book-id="${worldBook.id}">
                    复制
                </button>
                <button class="btn btn-danger delete-btn" data-book-id="${worldBook.id}">
                    删除
                </button>
            </div>
        </div>
    `;
}

/**
 * 绑定世界书项事件
 */
function bindWorldBookItemEvents() {
    if (!elements.worldBookList) return;
    
    // 使用事件委托处理所有按钮点击
    addEventListener(elements.worldBookList, 'click', (event) => {
        const button = event.target.closest('button[data-book-id]');
        if (!button) return;
        
        const bookId = button.dataset.bookId;
        const action = button.dataset.action;
        
        if (button.classList.contains('duplicate-btn')) {
            handleDuplicateWorldBook(event);
        } else if (button.classList.contains('delete-btn')) {
            handleDeleteWorldBookFromList(event);
        } else if (action === 'edit') {
            handleEditWorldBook(bookId);
        } else if (action === 'details') {
            handleShowWorldBookDetail(bookId);
        }
    });
}

/**
 * 处理添加世界书
 */
function handleAddWorldBook() {
    editingBookId = null;
    clearWorldBookForm();
    showScreen('world-book-editor-screen');
    
    // 更新标题
    const title = byId('world-book-editor-title');
    if (title) title.textContent = '新建世界书';
}

/**
 * 编辑世界书
 * @param {string} bookId 世界书ID
 */
async function handleEditWorldBook(bookId) {
    try {
        const worldBook = await getWorldBookDetail(bookId);
        
        if (!worldBook) {
            showError('世界书不存在');
            return;
        }
        
        editingBookId = bookId;
        fillWorldBookForm(worldBook);
        showScreen('world-book-editor-screen');
        
        // 更新标题
        const title = byId('world-book-editor-title');
        if (title) title.textContent = '编辑世界书';
        
    } catch (error) {
        console.error('Failed to edit world book:', error);
        showError('加载世界书失败');
    }
};

/**
 * 显示世界书详情
 * @param {string} bookId 世界书ID
 */
async function handleShowWorldBookDetail(bookId) {
    try {
        const worldBook = await getWorldBookDetail(bookId);
        
        if (!worldBook) {
            showError('世界书不存在');
            return;
        }
        
        // 创建详情对话框
        const detailsModal = createWorldBookDetailsModal(worldBook);
        document.body.appendChild(detailsModal);
        
        // 显示对话框
        detailsModal.style.display = 'flex';
        
        // 绑定关闭事件
        const closeBtn = detailsModal.querySelector('.close-details-btn');
        addEventListener(closeBtn, 'click', () => detailsModal.remove());
        
    } catch (error) {
        console.error('Failed to show world book details:', error);
        showError('加载世界书详情失败');
    }
};

/**
 * 创建世界书详情模态框
 * @param {Object} worldBook 世界书数据
 * @returns {Element} 模态框元素
 */
function createWorldBookDetailsModal(worldBook) {
    return createElement('div', {
        className: 'world-book-details-modal',
        innerHTML: `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h2>世界书详情：${worldBook.name}</h2>
                </div>
                <div class="modal-body">
                    <div class="world-book-detail-info">
                        <div class="detail-row">
                            <label>名称：</label>
                            <span>${worldBook.name}</span>
                        </div>
                        <div class="detail-row">
                            <label>字数：</label>
                            <span>${worldBook.wordCount} 字</span>
                        </div>
                        <div class="detail-row">
                            <label>段落数：</label>
                            <span>${worldBook.paragraphCount} 段</span>
                        </div>
                        <div class="detail-row">
                            <label>创建时间：</label>
                            <span>${worldBook.formattedCreatedAt}</span>
                        </div>
                        <div class="detail-row">
                            <label>更新时间：</label>
                            <span>${worldBook.formattedUpdatedAt}</span>
                        </div>
                        <div class="detail-row full-width">
                            <label>内容预览：</label>
                            <div class="content-preview">
                                ${worldBook.content ? worldBook.content.slice(0, 500) + (worldBook.content.length > 500 ? '...' : '') : '暂无内容'}
                            </div>
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
 * 清空世界书表单
 */
function clearWorldBookForm() {
    if (elements.worldBookNameInput) elements.worldBookNameInput.value = '';
    if (elements.worldBookContentInput) elements.worldBookContentInput.value = '';
}

/**
 * 填充世界书表单
 * @param {Object} worldBook 世界书数据
 */
function fillWorldBookForm(worldBook) {
    if (elements.worldBookNameInput) elements.worldBookNameInput.value = worldBook.name;
    if (elements.worldBookContentInput) elements.worldBookContentInput.value = worldBook.content || '';
}

/**
 * 处理保存世界书
 */
async function handleSaveWorldBook() {
    try {
        // 获取表单数据
        const formData = getWorldBookFormData();
        
        // 验证数据
        const validation = validateWorldBookData(formData);
        if (!validation.valid) {
            showError(validation.error);
            return;
        }
        
        let result;
        if (editingBookId) {
            // 更新现有世界书
            result = await updateWorldBook(editingBookId, formData);
        } else {
            // 创建新世界书
            result = await createWorldBook(formData);
        }
        
        if (result.success) {
            showToast(result.message, 'success');
            editingBookId = null;
            showScreen('world-book-screen');
            await renderWorldBookScreen(); // 刷新列表
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to save world book:', error);
        showError('保存世界书失败');
    }
}

/**
 * 获取世界书表单数据
 * @returns {Object} 表单数据
 */
function getWorldBookFormData() {
    return {
        name: elements.worldBookNameInput?.value.trim() || '',
        content: elements.worldBookContentInput?.value.trim() || ''
    };
}

/**
 * 验证世界书数据
 * @param {Object} data 世界书数据
 * @returns {Object} 验证结果
 */
function validateWorldBookData(data) {
    // 验证名称
    const nameValidation = validateRequired(data.name, '世界书名称');
    if (!nameValidation.valid) {
        return nameValidation;
    }
    
    const lengthValidation = validateLength(data.name, 1, 100);
    if (!lengthValidation.valid) {
        return lengthValidation;
    }
    
    return { valid: true };
}

/**
 * 处理复制世界书
 * @param {Event} event 事件对象
 */
async function handleDuplicateWorldBook(event) {
    const bookId = event.target.dataset.bookId;
    
    try {
        const originalBook = await getWorldBookDetail(bookId);
        
        if (!originalBook) {
            showError('世界书不存在');
            return;
        }
        
        const duplicateData = {
            name: `${originalBook.name} (副本)`,
            content: originalBook.content
        };
        
        const result = await createWorldBook(duplicateData);
        
        if (result.success) {
            showToast('世界书复制成功', 'success');
            await renderWorldBookScreen(); // 刷新列表
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to duplicate world book:', error);
        showError('复制世界书失败');
    }
}

/**
 * 处理从列表删除世界书
 * @param {Event} event 事件对象
 */
async function handleDeleteWorldBookFromList(event) {
    const bookId = event.target.dataset.bookId;
    
    if (confirm('确定要删除这个世界书吗？此操作无法撤销。')) {
        try {
            const result = await deleteWorldBook(bookId);
            
            if (result.success) {
                showToast(result.message, 'success');
                await renderWorldBookScreen(); // 刷新列表
            } else {
                showError(result.error);
            }
            
        } catch (error) {
            console.error('Failed to delete world book:', error);
            showError('删除世界书失败');
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
