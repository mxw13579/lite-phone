/**
 * 主题管理视图层
 * 负责美化中心界面的渲染和CSS编辑功能
 */

import { 
    getCSSConfig,
    saveCSSConfig,
    resetCSSConfig,
    getCSSTemplate,
    applyCSSTemplate,
    exportAllCSSConfig,
    importCSSConfig,
    resetAllCSS
} from './store.js';
import { $, byId, createElement, show, hide, setContent, addEventListener } from '../../utils/dom.js';
import { showToast, showSuccess, showError, showWarning } from '../../utils/notify.js';

// 页面元素和状态
let elements = {};
let currentEditor = 'global';
let previewStyleElement = null;

/**
 * 初始化主题管理界面
 */
export async function initializeThemesView() {
    try {
        // 缓存页面元素
        cacheElements();
        
        // 绑定事件
        bindEvents();
        
        // 创建预览样式元素
        createPreviewStyleElement();
        
        console.log('Themes view initialized');
    } catch (error) {
        console.error('Failed to initialize themes view:', error);
        showError('主题管理界面初始化失败');
    }
}

/**
 * 缓存页面元素
 */
function cacheElements() {
    elements = {
        // CSS编辑器标签
        cssTabs: document.querySelectorAll('.css-tab'),
        
        // 编辑器区域
        globalEditor: byId('global-css-editor'),
        userEditor: byId('user-css-editor'),
        aiEditor: byId('ai-css-editor'),
        
        // 文本区域
        globalTextarea: byId('global-css-editor-textarea'),
        userTextarea: byId('user-css-editor-textarea'),
        aiTextarea: byId('ai-css-editor-textarea'),
        
        // 预览窗口
        previewWindow: byId('css-preview-window'),
        
        // 按钮
        resetAllBtn: byId('reset-all-css-btn'),
        exportBtn: byId('export-css-config-btn'),
        importBtn: byId('import-css-config-btn'),
        importInput: byId('import-css-config-input')
    };
}

/**
 * 绑定事件处理器
 */
function bindEvents() {
    // CSS编辑器标签切换
    elements.cssTabs.forEach(tab => {
        addEventListener(tab, 'click', handleTabSwitch);
    });
    
    // 文本区域实时预览
    if (elements.globalTextarea) {
        addEventListener(elements.globalTextarea, 'input', () => updatePreview('global'));
    }
    if (elements.userTextarea) {
        addEventListener(elements.userTextarea, 'input', () => updatePreview('user'));
    }
    if (elements.aiTextarea) {
        addEventListener(elements.aiTextarea, 'input', () => updatePreview('ai'));
    }
    
    // 模板按钮
    const templateBtns = document.querySelectorAll('.template-btn');
    templateBtns.forEach(btn => {
        addEventListener(btn, 'click', handleApplyTemplate);
    });
    
    // CSS编辑器操作按钮（使用事件委托）
    const themesScreen = byId('themes-screen');
    if (themesScreen) {
        addEventListener(themesScreen, 'click', (event) => {
            const button = event.target.closest('button[data-css-action]');
            if (button) {
                const action = button.dataset.cssAction;
                const type = button.dataset.cssType;
                handleCSSAction(action, type);
            }
        });
    }
    
    // CSS配置管理按钮
    if (themesScreen) {
        addEventListener(themesScreen, 'click', (event) => {
            const button = event.target.closest('button[data-css-config-action]');
            if (button) {
                const action = button.dataset.cssConfigAction;
                handleCSSConfigAction(action);
            }
        });
    }
    
    // 操作按钮
    if (elements.resetAllBtn) {
        addEventListener(elements.resetAllBtn, 'click', handleResetAllCSS);
    }
    if (elements.exportBtn) {
        addEventListener(elements.exportBtn, 'click', handleExportCSS);
    }
    if (elements.importBtn) {
        addEventListener(elements.importBtn, 'click', () => elements.importInput?.click());
    }
    if (elements.importInput) {
        addEventListener(elements.importInput, 'change', handleImportCSS);
    }
}

/**
 * 处理CSS编辑器操作
 * @param {string} action 操作类型
 * @param {string} type CSS类型
 */
function handleCSSAction(action, type) {
    switch (action) {
        case 'format':
            handleFormatCSS(type);
            break;
        case 'clear':
            handleClearCSS(type);
            break;
        case 'reset':
            handleResetCSS(type);
            break;
        default:
            console.warn('Unknown CSS action:', action);
    }
}

/**
 * 处理CSS配置管理操作
 * @param {string} action 操作类型
 */
function handleCSSConfigAction(action) {
    switch (action) {
        case 'export':
            handleExportCSS();
            break;
        case 'import':
            elements.importInput?.click();
            break;
        case 'reset-all':
            handleResetAllCSS();
            break;
        default:
            console.warn('Unknown CSS config action:', action);
    }
}

/**
 * 创建预览样式元素
 */
function createPreviewStyleElement() {
    previewStyleElement = document.createElement('style');
    previewStyleElement.id = 'css-preview-styles';
    document.head.appendChild(previewStyleElement);
}

/**
 * 渲染主题管理界面
 */
export async function renderThemesScreen() {
    try {
        // 加载CSS配置
        await loadAllCSSConfigs();
        
        // 显示默认编辑器
        switchEditor('global');
        
        console.log('Themes screen rendered');
    } catch (error) {
        console.error('Failed to render themes screen:', error);
        showError('加载主题配置失败');
    }
}

/**
 * 加载所有CSS配置
 */
async function loadAllCSSConfigs() {
    try {
        const [globalCSS, userCSS, aiCSS] = await Promise.all([
            getCSSConfig('global'),
            getCSSConfig('user'),
            getCSSConfig('ai')
        ]);

        // 填充文本区域
        if (elements.globalTextarea) elements.globalTextarea.value = globalCSS;
        if (elements.userTextarea) elements.userTextarea.value = userCSS;
        if (elements.aiTextarea) elements.aiTextarea.value = aiCSS;

        // 更新预览
        updateAllPreviews();

    } catch (error) {
        console.error('Failed to load CSS configs:', error);
        showError('加载CSS配置失败');
    }
}

/**
 * 处理标签切换
 * @param {Event} event 事件对象
 */
function handleTabSwitch(event) {
    const tabType = event.target.dataset.tab;
    if (tabType) {
        switchEditor(tabType);
    }
}

/**
 * 切换编辑器
 * @param {string} editorType 编辑器类型
 */
function switchEditor(editorType) {
    currentEditor = editorType;

    // 更新标签状态
    elements.cssTabs.forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === editorType) {
            tab.classList.add('active');
        }
    });

    // 显示对应的编辑器
    const editors = ['global', 'user', 'ai'];
    editors.forEach(type => {
        const editor = elements[`${type}Editor`];
        if (editor) {
            editor.style.display = type === editorType ? 'block' : 'none';
        }
    });
}

/**
 * 更新预览
 * @param {string} type CSS类型
 */
function updatePreview(type) {
    const textarea = elements[`${type}Textarea`];
    if (!textarea) return;

    const cssContent = textarea.value;
    
    // 保存到数据库
    saveCSSConfig(type, cssContent).catch(error => {
        console.error(`Failed to save ${type} CSS:`, error);
    });

    // 更新预览样式
    updateAllPreviews();
}

/**
 * 更新所有预览
 */
function updateAllPreviews() {
    if (!previewStyleElement) return;

    const globalCSS = elements.globalTextarea?.value || '';
    const userCSS = elements.userTextarea?.value || '';
    const aiCSS = elements.aiTextarea?.value || '';

    // 组合所有CSS
    const combinedCSS = `
        ${globalCSS}
        ${userCSS}
        ${aiCSS}
    `;

    previewStyleElement.textContent = combinedCSS;
}

/**
 * 处理应用模板
 * @param {Event} event 事件对象
 */
async function handleApplyTemplate(event) {
    const templateId = event.target.dataset.template;
    const category = event.target.dataset.category;
    
    if (!templateId || !category) return;

    try {
        const result = await applyCSSTemplate(category, templateId);
        
        if (result.success) {
            showToast('模板应用成功', 'success');
            
            // 重新加载配置
            await loadAllCSSConfigs();
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to apply template:', error);
        showError('应用模板失败');
    }
}

/**
 * 格式化CSS
 * @param {string} type CSS类型
 */
function handleFormatCSS(type) {
    const textarea = elements[`${type}Textarea`];
    if (!textarea) return;

    try {
        // 简单的CSS格式化
        let css = textarea.value;
        
        // 移除多余空格和换行
        css = css.replace(/\s+/g, ' ').trim();
        
        // 在规则之间添加换行
        css = css.replace(/}/g, '}\n\n');
        
        // 在属性之间添加换行和缩进
        css = css.replace(/;/g, ';\n    ');
        
        // 在选择器后添加换行和缩进
        css = css.replace(/{/g, ' {\n    ');
        
        // 清理多余的空格
        css = css.replace(/\n\s*\n/g, '\n\n');
        css = css.replace(/^\s+/gm, (match) => match.replace(/ /g, '    '));

        textarea.value = css;
        updatePreview(type);
        
        showToast('CSS格式化完成', 'success');
        
    } catch (error) {
        console.error(`Failed to format ${type} CSS:`, error);
        showError('CSS格式化失败');
    }
};

/**
 * 清空CSS
 * @param {string} type CSS类型
 */
function handleClearCSS(type) {
    const textarea = elements[`${type}Textarea`];
    if (!textarea) return;

    if (confirm('确定要清空当前CSS吗？此操作无法撤销。')) {
        textarea.value = '';
        updatePreview(type);
        showToast('CSS已清空', 'success');
    }
};

/**
 * 重置CSS
 * @param {string} type CSS类型
 */
async function handleResetCSS(type) {
    if (confirm('确定要重置为默认CSS吗？当前修改将会丢失。')) {
        try {
            const result = await resetCSSConfig(type);
            
            if (result.success) {
                showToast('CSS已重置', 'success');
                
                // 重新加载配置
                await loadAllCSSConfigs();
            } else {
                showError(result.error);
            }
            
        } catch (error) {
            console.error(`Failed to reset ${type} CSS:`, error);
            showError('重置CSS失败');
        }
    }
};

/**
 * 处理重置所有CSS
 */
async function handleResetAllCSS() {
    if (confirm('确定要重置所有CSS配置吗？此操作无法撤销。')) {
        try {
            const result = await resetAllCSS();
            
            if (result.success) {
                showToast(result.message, 'success');
                
                // 重新加载配置
                await loadAllCSSConfigs();
            } else {
                showError(result.error);
            }
            
        } catch (error) {
            console.error('Failed to reset all CSS:', error);
            showError('重置所有CSS失败');
        }
    }
}

/**
 * 处理导出CSS配置
 */
async function handleExportCSS() {
    try {
        const result = await exportAllCSSConfig();
        
        if (result.success) {
            // 创建下载链接
            const dataStr = JSON.stringify(result.data, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `css-config-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showToast(result.message, 'success');
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to export CSS config:', error);
        showError('导出CSS配置失败');
    }
}

/**
 * 处理导入CSS配置
 * @param {Event} event 事件对象
 */
async function handleImportCSS(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const importData = JSON.parse(text);
        
        const result = await importCSSConfig(importData);
        
        if (result.success) {
            showToast(result.message, 'success');
            
            // 重新加载配置
            await loadAllCSSConfigs();
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to import CSS config:', error);
        showError('导入CSS配置失败');
    } finally {
        // 清空文件输入
        event.target.value = '';
    }
}



