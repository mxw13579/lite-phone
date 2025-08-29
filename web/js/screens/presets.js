// 预设屏幕模块 - screens/presets.js
// 处理AI预设的列表显示、编辑、创建、删除和激活功能

// 当前编辑的预设ID
let editingPresetId = null;

// 渲染预设列表屏幕
export async function renderPresetListScreen() {
    const listEl = document.getElementById('preset-list');
    const state = window.STATE?.state;
    
    if (!listEl || !state) {
        console.error('预设列表渲染：缺少必要的元素或状态');
        return;
    }
    
    listEl.innerHTML = '';
    
    if (state.presets.length === 0) {
        // 如果没有预设，先尝试初始化默认预设
        await initPresetsData();
        // 初始化后重新检查
        if (state.presets.length === 0) {
            listEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 创建你的第一个预设</p>';
            return;
        }
    }
    
    state.presets.forEach(preset => {
        const isActive = preset.id === state.globalSettings.activePresetId;
        const item = document.createElement('div');
        item.className = 'preset-list-item';
        if (isActive) {
            item.classList.add('active');
        }
        item.innerHTML = `
            <div class="preset-info" data-preset-id="${preset.id}">
                <div class="preset-name">
                    ${isActive ? '<span class="active-indicator">★</span>' : ''}
                    ${preset.name}
                </div>
                <div class="preset-remark">${preset.remark || '无备注'}</div>
            </div>
            <div class="preset-actions">
                <button class="action-btn-small edit-preset-btn" data-preset-id="${preset.id}">编辑</button>
                <button class="action-btn-small set-active-preset-btn" data-preset-id="${preset.id}" ${isActive ? 'disabled' : ''}>设为当前</button>
                ${state.presets.length > 1 ? `<button class="action-btn-small delete-preset-list-btn" data-preset-id="${preset.id}" style="color: #d9534f;">删除</button>` : ''}
            </div>
        `;
        listEl.appendChild(item);
    });
    
    console.log('预设列表屏幕已渲染，共', state.presets.length, '个预设');
}

// 打开预设编辑器
export function openPresetEditor(presetId) {
    editingPresetId = presetId;
    const editorTitle = document.getElementById('preset-editor-title');
    const deleteBtn = document.getElementById('delete-preset-btn');
    const state = window.STATE?.state;
    const constants = window.CONSTANTS;
    
    if (!state || !constants) {
        console.error('打开预设编辑器失败：缺少必要的状态或常量');
        return;
    }

    if (presetId) { 
        // 编辑现有预设
        const preset = state.presets.find(p => p.id === presetId);
        if (!preset) return;
        
        editorTitle.textContent = `编辑预设: ${preset.name}`;
        document.getElementById('preset-name-input').value = preset.name;
        document.getElementById('preset-remark-input').value = preset.remark;
        document.getElementById('prompt-image-input').value = preset.promptImage;
        document.getElementById('prompt-voice-input').value = preset.promptVoice;
        document.getElementById('prompt-transfer-input').value = preset.promptTransfer;
        document.getElementById('prompt-single-input').value = preset.promptSingle;
        document.getElementById('prompt-group-input').value = preset.promptGroup;
        deleteBtn.style.display = 'block';
    } else { 
        // 新增预设
        editorTitle.textContent = '新增预设';
        document.getElementById('preset-name-input').value = '';
        document.getElementById('preset-remark-input').value = '';
        // 使用默认值填充
        document.getElementById('prompt-image-input').value = constants.DEFAULT_PROMPT_IMAGE;
        document.getElementById('prompt-voice-input').value = constants.DEFAULT_PROMPT_VOICE;
        document.getElementById('prompt-transfer-input').value = constants.DEFAULT_PROMPT_TRANSFER;
        document.getElementById('prompt-single-input').value = constants.DEFAULT_PROMPT_SINGLE;
        document.getElementById('prompt-group-input').value = constants.DEFAULT_PROMPT_GROUP;
        deleteBtn.style.display = 'none';
    }
    
    if (window.showScreen) {
        window.showScreen('preset-editor-screen');
    }
    
    console.log('打开预设编辑器：', presetId ? '编辑' : '新增');
}

// 保存预设
export async function savePreset() {
    const name = document.getElementById('preset-name-input').value.trim();
    if (!name) {
        alert('预设名称不能为空！');
        return;
    }
    
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db) {
        console.error('保存预设失败：状态或数据库不可用');
        return;
    }
    
    const presetData = {
        name: name,
        remark: document.getElementById('preset-remark-input').value.trim(),
        promptImage: document.getElementById('prompt-image-input').value,
        promptVoice: document.getElementById('prompt-voice-input').value,
        promptTransfer: document.getElementById('prompt-transfer-input').value,
        promptSingle: document.getElementById('prompt-single-input').value,
        promptGroup: document.getElementById('prompt-group-input').value
    };
    
    try {
        if (editingPresetId) { 
            // 更新现有预设
            const index = state.presets.findIndex(p => p.id === editingPresetId);
            state.presets[index] = { ...state.presets[index], ...presetData };
            await db.presets.put(state.presets[index]);
        } else { 
            // 新增预设
            const newPreset = { id: 'preset_' + Date.now(), ...presetData };
            state.presets.push(newPreset);
            await db.presets.add(newPreset);
        }
        
        editingPresetId = null;
        await renderPresetListScreen();
        
        if (window.showScreen) {
            window.showScreen('preset-list-screen');
        }
        
        console.log('预设保存成功：', name);
    } catch (error) {
        console.error('保存预设失败：', error);
        alert('保存失败，请重试');
    }
}

// 删除预设
export async function deletePreset() {
    if (!editingPresetId) return;
    
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db) {
        console.error('删除预设失败：状态或数据库不可用');
        return;
    }
    
    if (state.presets.length <= 1) {
        alert('不能删除唯一的预设！');
        return;
    }
    
    const preset = state.presets.find(p => p.id === editingPresetId);
    if (!preset) return;
    
    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？此操作不可撤销。`, { confirmButtonClass: 'btn-danger' });
    if (!confirmed) return;
    
    try {
        await db.presets.delete(editingPresetId);
        
        // 如果删除的是当前激活的预设，先选择一个新的激活预设
        const needNewActivePreset = state.globalSettings.activePresetId === editingPresetId;
        let newActivePresetId = null;
        
        if (needNewActivePreset) {
            // 找到第一个不是要删除的预设
            newActivePresetId = state.presets.find(p => p.id !== editingPresetId)?.id;
        }
        
        // 从状态中移除预设
        state.presets = state.presets.filter(p => p.id !== editingPresetId);
        
        // 如果需要，设置新的激活预设
        if (needNewActivePreset && newActivePresetId) {
            await setActivePreset(newActivePresetId);
        }

        editingPresetId = null;
        await renderPresetListScreen();
        
        if (window.showScreen) {
            window.showScreen('preset-list-screen');
        }
        
        console.log('预设删除成功：', preset.name);
    } catch (error) {
        console.error('删除预设失败：', error);
        if (window.showCustomAlert) {
            window.showCustomAlert('删除失败', '删除预设时发生错误，请重试。');
        } else {
            alert('删除失败，请重试');
        }
    }
}

// 从列表页面删除预设（不需要editingPresetId）
async function deletePresetFromList(presetId) {
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db || !presetId) {
        console.error('删除预设失败：缺少必要参数');
        return;
    }
    
    if (state.presets.length <= 1) {
        if (window.showCustomAlert) {
            window.showCustomAlert('无法删除', '至少需要保留一个预设！');
        } else {
            alert('不能删除唯一的预设！');
        }
        return;
    }
    
    const preset = state.presets.find(p => p.id === presetId);
    if (!preset) {
        console.error('删除预设失败：预设不存在');
        return;
    }
    
    const confirmed = await showCustomConfirm('删除预设', `确定要删除预设 "${preset.name}" 吗？此操作不可撤销。`, { confirmButtonClass: 'btn-danger' });
    if (!confirmed) return;
    
    try {
        await db.presets.delete(presetId);
        
        // 如果删除的是当前激活的预设，先选择一个新的激活预设
        const needNewActivePreset = state.globalSettings.activePresetId === presetId;
        let newActivePresetId = null;
        
        if (needNewActivePreset) {
            // 找到第一个不是要删除的预设
            newActivePresetId = state.presets.find(p => p.id !== presetId)?.id;
        }
        
        // 从状态中移除预设
        state.presets = state.presets.filter(p => p.id !== presetId);
        
        // 如果需要，设置新的激活预设
        if (needNewActivePreset && newActivePresetId) {
            await setActivePreset(newActivePresetId);
        }

        // 重新渲染列表
        await renderPresetListScreen();
        
        console.log('预设删除成功：', preset.name);
        
        // 显示成功消息
        if (window.showCustomAlert) {
            window.showCustomAlert('删除成功', `预设 "${preset.name}" 已删除`);
        }
    } catch (error) {
        console.error('删除预设失败：', error);
        if (window.showCustomAlert) {
            window.showCustomAlert('删除失败', '删除预设时发生错误，请重试。');
        } else {
            alert('删除失败，请重试');
        }
    }
}

// 设置激活的预设
export async function setActivePreset(presetId) {
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db) {
        console.error('设置激活预设失败：状态或数据库不可用');
        return;
    }
    
    try {
        state.globalSettings.activePresetId = presetId;
        await db.globalSettings.put(state.globalSettings);
        await renderPresetListScreen();
        
        console.log('激活预设成功：', presetId);
    } catch (error) {
        console.error('设置激活预设失败：', error);
        alert('设置失败，请重试');
    }
}

// 恢复预设默认值
export async function restorePresetDefaults() {
    const constants = window.CONSTANTS;
    if (!constants) {
        console.error('恢复默认值失败：常量不可用');
        return;
    }
    
    const confirmed = await showCustomConfirm('恢复默认值', '确定要将当前编辑的所有提示词恢复为系统默认值吗？');
    if (!confirmed) return;
    
    try {
        document.getElementById('prompt-image-input').value = constants.DEFAULT_PROMPT_IMAGE;
        document.getElementById('prompt-voice-input').value = constants.DEFAULT_PROMPT_VOICE;
        document.getElementById('prompt-transfer-input').value = constants.DEFAULT_PROMPT_TRANSFER;
        document.getElementById('prompt-single-input').value = constants.DEFAULT_PROMPT_SINGLE;
        document.getElementById('prompt-group-input').value = constants.DEFAULT_PROMPT_GROUP;
        
        console.log('预设默认值已恢复');
    } catch (error) {
        console.error('恢复预设默认值失败：', error);
        alert('恢复失败，请重试');
    }
}

// 获取当前激活的预设
export function getActivePreset() {
    const state = window.STATE?.state;
    if (!state) return null;
    
    return state.presets.find(p => p.id === state.globalSettings.activePresetId) || state.presets[0];
}

// 获取预设信息
export function getPresetById(presetId) {
    const state = window.STATE?.state;
    if (!state) return null;
    
    return state.presets.find(p => p.id === presetId);
}

// 获取所有预设
export function getAllPresets() {
    const state = window.STATE?.state;
    return state ? state.presets : [];
}

// 初始化预设数据（确保至少有一个默认预设）
export async function initPresetsData() {
    const state = window.STATE?.state;
    const db = window.DB?.db;
    const constants = window.CONSTANTS;
    
    if (!state || !db || !constants) {
        console.error('初始化预设数据失败：缺少必要依赖');
        return;
    }
    
    // 确保数据库已初始化
    try {
        await window.DB?.initializeDatabase?.();
    } catch (error) {
        console.warn('数据库初始化警告:', error);
    }
    
    // 检查数据库表是否可用
    if (!db.presets) {
        console.error('初始化预设数据失败：presets表不可用');
        return;
    }
    
    try {
        // 处理预设初始化逻辑
        if (state.presets.length === 0) {
            // 如果数据库中一个预设都没有，创建一个默认的
            const defaultPreset = {
                id: 'preset_' + Date.now(),
                name: '默认预设',
                remark: '系统内置的默认AI行为预设。',
                promptImage: constants.DEFAULT_PROMPT_IMAGE,
                promptVoice: constants.DEFAULT_PROMPT_VOICE,
                promptTransfer: constants.DEFAULT_PROMPT_TRANSFER,
                promptSingle: constants.DEFAULT_PROMPT_SINGLE,
                promptGroup: constants.DEFAULT_PROMPT_GROUP
            };
            
            state.presets.push(defaultPreset);
            await db.presets.add(defaultPreset);
            state.globalSettings.activePresetId = defaultPreset.id;
            await db.globalSettings.put(state.globalSettings);
            
            console.log('创建默认预设：', defaultPreset.name);
        } else if (!state.globalSettings.activePresetId || !state.presets.find(p => p.id === state.globalSettings.activePresetId)) {
            // 如果有预设但没有激活的，或者激活的ID无效，则激活第一个
            state.globalSettings.activePresetId = state.presets[0].id;
            await db.globalSettings.put(state.globalSettings);
            
            console.log('激活第一个预设：', state.presets[0].name);
        }
        
        console.log('预设数据初始化完成，共', state.presets.length, '个预设');
    } catch (error) {
        console.error('初始化预设数据失败：', error);
    }
}

// 导出预设数据
export function exportPresets() {
    const presets = getAllPresets();
    const activePresetId = window.STATE?.state?.globalSettings?.activePresetId;
    
    const exportData = {
        presets,
        activePresetId,
        exportTime: new Date().toISOString()
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `presets_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('预设数据已导出');
}

// 获取当前编辑的预设ID
export function getEditingPresetId() {
    return editingPresetId;
}

// 设置编辑的预设ID（供外部调用）
export function setEditingPresetId(presetId) {
    editingPresetId = presetId;
}

// 初始化预设模块事件监听器
export function initPresetsListeners() {
    // 添加预设按钮
    const addBtn = document.getElementById('add-preset-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => openPresetEditor(null));
    }
    
    // 保存预设按钮
    const saveBtn = document.getElementById('save-preset-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', savePreset);
    }
    
    // 删除预设按钮
    const deleteBtn = document.getElementById('delete-preset-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', deletePreset);
    }
    
    // 恢复默认值按钮
    const restoreBtn = document.getElementById('restore-preset-defaults-btn');
    if (restoreBtn) {
        restoreBtn.addEventListener('click', restorePresetDefaults);
    }
    
    // 预设列表委托事件处理
    const presetList = document.getElementById('preset-list');
    if (presetList) {
        presetList.addEventListener('click', async (e) => {
            const editBtn = e.target.closest('.edit-preset-btn');
            const setActiveBtn = e.target.closest('.set-active-preset-btn');
            const deleteBtn = e.target.closest('.delete-preset-list-btn');
            
            if (editBtn) {
                openPresetEditor(editBtn.dataset.presetId);
            } else if (setActiveBtn && !setActiveBtn.disabled) {
                setActivePreset(setActiveBtn.dataset.presetId);
            } else if (deleteBtn) {
                await deletePresetFromList(deleteBtn.dataset.presetId);
            }
        });
    }
    
    console.log('预设模块事件监听器已初始化');
}

// 导出常用的全局函数引用（用于兼容现有代码）
function showCustomConfirm(title, message, options = {}) {
    return window.showCustomConfirm?.(title, message, options);
}