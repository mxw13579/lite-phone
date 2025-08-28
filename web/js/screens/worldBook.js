// 世界书屏幕模块 - screens/worldBook.js
// 处理世界书的显示、编辑、创建和删除功能

// 当前编辑的世界书ID
let editingWorldBookId = null;

// 渲染世界书列表屏幕
export function renderWorldBookScreen() {
    const listEl = document.getElementById('world-book-list');
    const state = window.STATE?.state;
    
    if (!state || !listEl) {
        console.error('世界书渲染：缺少必要的状态或DOM元素');
        return;
    }
    
    listEl.innerHTML = '';
    
    if (state.worldBooks.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 创建你的第一本世界书</p>';
        return;
    }
    
    state.worldBooks.forEach(book => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.dataset.bookId = book.id;
        item.innerHTML = `<span>${book.name}</span>`;
        
        // 点击事件：打开编辑器
        item.addEventListener('click', () => openWorldBookEditor(book.id));
        
        // 长按删除事件
        let longPressTimer;
        item.addEventListener('mousedown', () => {
            longPressTimer = setTimeout(async () => {
                const confirmed = await showCustomConfirm('删除世界书', `确定要删除世界书 "${book.name}" 吗？`, { confirmButtonClass: 'btn-danger' });
                if (confirmed) {
                    await deleteWorldBook(book.id);
                }
            }, 800);
        });
        
        item.addEventListener('mouseup', () => clearTimeout(longPressTimer));
        item.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
        
        listEl.appendChild(item);
    });
    
    console.log('世界书屏幕已渲染，共', state.worldBooks.length, '本');
}

// 打开世界书编辑器
export function openWorldBookEditor(bookId) {
    const state = window.STATE?.state;
    if (!state) return;
    
    editingWorldBookId = bookId;
    const book = state.worldBooks.find(wb => wb.id === bookId);
    if (!book) return;
    
    // 设置编辑器内容
    const titleEl = document.getElementById('world-book-editor-title');
    const nameInput = document.getElementById('world-book-name-input');
    const contentInput = document.getElementById('world-book-content-input');
    
    if (titleEl) titleEl.textContent = book.name;
    if (nameInput) nameInput.value = book.name;
    if (contentInput) contentInput.value = book.content;
    
    // 切换到编辑器屏幕
    if (window.showScreen) {
        window.showScreen('world-book-editor-screen');
    }
    
    console.log('打开世界书编辑器：', book.name);
}

// 创建新的世界书
export async function createWorldBook() {
    const name = await showCustomPrompt('创建世界书', '请输入书名');
    if (!name || !name.trim()) return;
    
    const newBook = {
        id: 'wb_' + Date.now(),
        name: name.trim(),
        content: ''
    };
    
    try {
        // 保存到数据库
        const db = window.DB?.db;
        if (db) {
            await db.worldBooks.add(newBook);
        }
        
        // 更新状态
        const state = window.STATE?.state;
        if (state) {
            state.worldBooks.push(newBook);
        }
        
        // 重新渲染列表
        renderWorldBookScreen();
        
        // 打开编辑器
        openWorldBookEditor(newBook.id);
        
        console.log('创建新世界书：', newBook.name);
    } catch (error) {
        console.error('创建世界书失败：', error);
        alert('创建失败，请重试');
    }
}

// 保存世界书
export async function saveWorldBook() {
    if (!editingWorldBookId) return;
    
    const state = window.STATE?.state;
    if (!state) return;
    
    const book = state.worldBooks.find(wb => wb.id === editingWorldBookId);
    if (!book) return;
    
    // 获取输入内容
    const nameInput = document.getElementById('world-book-name-input');
    const contentInput = document.getElementById('world-book-content-input');
    
    if (!nameInput || !contentInput) return;
    
    const newName = nameInput.value.trim();
    if (!newName) {
        alert('书名不能为空！');
        return;
    }
    
    // 更新书籍数据
    book.name = newName;
    book.content = contentInput.value;
    
    try {
        // 保存到数据库
        const db = window.DB?.db;
        if (db) {
            await db.worldBooks.put(book);
        }
        
        // 更新标题显示
        const titleEl = document.getElementById('world-book-editor-title');
        if (titleEl) titleEl.textContent = newName;
        
        // 清除编辑状态
        editingWorldBookId = null;
        
        // 重新渲染列表并返回
        renderWorldBookScreen();
        if (window.showScreen) {
            window.showScreen('world-book-screen');
        }
        
        console.log('保存世界书：', newName);
    } catch (error) {
        console.error('保存世界书失败：', error);
        alert('保存失败，请重试');
    }
}

// 删除世界书
export async function deleteWorldBook(bookId) {
    const state = window.STATE?.state;
    if (!state) return;
    
    try {
        // 从数据库删除
        const db = window.DB?.db;
        if (db) {
            await db.worldBooks.delete(bookId);
        }
        
        // 从状态中移除
        state.worldBooks = state.worldBooks.filter(wb => wb.id !== bookId);
        
        // 重新渲染
        renderWorldBookScreen();
        
        console.log('删除世界书：', bookId);
    } catch (error) {
        console.error('删除世界书失败：', error);
        alert('删除失败，请重试');
    }
}

// 世界书选择显示更新（用于聊天设置）
export function updateWorldBookSelectionDisplay(containerSelector = '#world-book-checkboxes-container') {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    
    const checkedBoxes = container.querySelectorAll('input:checked');
    const displayText = document.querySelector('.selected-options-text');
    
    if (!displayText) return;
    
    if (checkedBoxes.length === 0) {
        displayText.textContent = '-- 点击选择 --';
    } else if (checkedBoxes.length > 2) {
        displayText.textContent = `已选择 ${checkedBoxes.length} 项`;
    } else {
        displayText.textContent = Array.from(checkedBoxes)
            .map(cb => cb.parentElement.textContent.trim())
            .join(', ');
    }
}

// 获取当前编辑的世界书ID
export function getEditingWorldBookId() {
    return editingWorldBookId;
}

// 设置编辑的世界书ID（供外部调用）
export function setEditingWorldBookId(bookId) {
    editingWorldBookId = bookId;
}

// 初始化世界书模块事件监听器
export function initWorldBookListeners() {
    // 添加世界书按钮
    const addBtn = document.getElementById('add-world-book-btn');
    if (addBtn) {
        addBtn.addEventListener('click', createWorldBook);
    }
    
    // 保存世界书按钮
    const saveBtn = document.getElementById('save-world-book-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveWorldBook);
    }
    
    console.log('世界书模块事件监听器已初始化');
}

// 导出常用的全局函数引用（用于兼容现有代码）
function showCustomPrompt(title, placeholder, initialValue = '', type = 'text') {
    return window.showCustomPrompt?.(title, placeholder, initialValue, type);
}

function showCustomConfirm(title, message, options = {}) {
    return window.showCustomConfirm?.(title, message, options);
}