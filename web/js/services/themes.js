/**
 * 主题服务层
 * 
 * 安全策略：
 * - 远程主题功能已禁用，仅支持本地主题自定义
 * - 所有CSS内容必须来自本地模板或用户导入
 * - 不支持从网络URL加载CSS或主题配置
 * 
 * @fileoverview 主题服务实现，遵循安全第一原则
 * @version 1.2
 * @author EPhone Development Team
 * @implements {ThemeServiceContract}
 */

import { getDB } from '../core/db.js';
import { eventBus, EventTypes } from '../core/event-bus.js';
import { showSuccess, showError, showWarning } from '../utils/notify.js';
import { apiService } from './api.js';
import { createSuccessResponse, createErrorResponse } from './contracts.js';

/**
 * 主题配置常量
 */
const THEME_CONFIG = {
    cssTypes: ['global', 'user', 'ai'],
    templateCategories: ['global', 'user', 'ai'],
    variablePrefix: '--ephone-',
    // remoteThemeTimeout: 禁用远程主题功能
    maxCssSize: 1024 * 1024 // 本地导入CSS大小限制
};

/**
 * CSS变量定义
 */
const CSS_VARIABLES = {
    // 颜色变量
    colors: {
        primary: '--ephone-primary-color',
        secondary: '--ephone-secondary-color',
        background: '--ephone-bg-color',
        surface: '--ephone-surface-color',
        text: '--ephone-text-color',
        textSecondary: '--ephone-text-secondary-color',
        border: '--ephone-border-color',
        success: '--ephone-success-color',
        warning: '--ephone-warning-color',
        error: '--ephone-error-color'
    },
    
    // 尺寸变量
    dimensions: {
        borderRadius: '--ephone-border-radius',
        spacing: '--ephone-spacing',
        fontSize: '--ephone-font-size',
        lineHeight: '--ephone-line-height'
    },
    
    // 动画变量
    animations: {
        duration: '--ephone-transition-duration',
        easing: '--ephone-transition-easing'
    }
};

/**
 * 预定义主题模板
 */
const BUILT_IN_TEMPLATES = {
    // 全局主题
    'global-dark': {
        name: '暗黑主题',
        category: 'global',
        css: `
/* 暗黑主题 */
:root {
    ${CSS_VARIABLES.colors.primary}: #6366f1;
    ${CSS_VARIABLES.colors.secondary}: #8b5cf6;
    ${CSS_VARIABLES.colors.background}: linear-gradient(135deg, #1e1e2e 0%, #2d2d42 100%);
    ${CSS_VARIABLES.colors.surface}: rgba(30, 30, 46, 0.95);
    ${CSS_VARIABLES.colors.text}: #f5f5f5;
    ${CSS_VARIABLES.colors.textSecondary}: #a1a1aa;
    ${CSS_VARIABLES.colors.border}: #374151;
}

body {
    background: var(${CSS_VARIABLES.colors.background});
    color: var(${CSS_VARIABLES.colors.text});
}

#phone-screen {
    background: var(${CSS_VARIABLES.colors.surface});
    border-color: var(${CSS_VARIABLES.colors.border});
}

.form-button, .action-button, .btn {
    background: linear-gradient(135deg, var(${CSS_VARIABLES.colors.primary}), var(${CSS_VARIABLES.colors.secondary}));
    color: var(${CSS_VARIABLES.colors.text});
}`
    },

    'global-light': {
        name: '明亮主题',
        category: 'global',
        css: `
/* 明亮主题 */
:root {
    ${CSS_VARIABLES.colors.primary}: #3b82f6;
    ${CSS_VARIABLES.colors.secondary}: #1d4ed8;
    ${CSS_VARIABLES.colors.background}: linear-gradient(135deg, #fef7ff 0%, #f0f9ff 100%);
    ${CSS_VARIABLES.colors.surface}: rgba(255, 255, 255, 0.98);
    ${CSS_VARIABLES.colors.text}: #1f2937;
    ${CSS_VARIABLES.colors.textSecondary}: #6b7280;
    ${CSS_VARIABLES.colors.border}: #e5e7eb;
}

body {
    background: var(${CSS_VARIABLES.colors.background});
    color: var(${CSS_VARIABLES.colors.text});
}

#phone-screen {
    background: var(${CSS_VARIABLES.colors.surface});
    border-color: var(${CSS_VARIABLES.colors.border});
}

.form-button, .action-button, .btn {
    background: linear-gradient(135deg, var(${CSS_VARIABLES.colors.primary}), var(${CSS_VARIABLES.colors.secondary}));
    color: white;
}`
    },

    // 用户消息主题
    'user-classic': {
        name: '经典蓝色',
        category: 'user',
        css: `
.message-bubble.user {
    background: linear-gradient(135deg, #007bff, #0056b3);
    color: white;
    border-radius: 18px 18px 4px 18px;
    box-shadow: 0 2px 8px rgba(0, 123, 255, 0.3);
}

.message-bubble.user::before {
    border-left-color: #0056b3;
}`
    },

    'user-gradient': {
        name: '渐变紫色',
        category: 'user', 
        css: `
.message-bubble.user {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 20px 20px 6px 20px;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}`
    },

    // AI消息主题
    'ai-modern': {
        name: '现代灰色',
        category: 'ai',
        css: `
.message-bubble.ai {
    background: linear-gradient(135deg, #f8f9fa, #e9ecef);
    color: #495057;
    border-radius: 18px 18px 18px 4px;
    border-left: 3px solid #6c757d;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.message-bubble.ai .sender-name {
    color: #6c757d;
    font-weight: 600;
}`
    }
};

/**
 * 主题服务类
 */
class ThemeService {
    constructor() {
        this.currentTheme = 'default';
        this.appliedCss = new Map();
        this.themeCache = new Map();
        this.styleElements = new Map();
    }

    /**
     * 初始化主题服务
     */
    async initialize() {
        try {
            // 创建样式元素
            this.createStyleElements();
            
            // 加载当前主题配置
            await this.loadCurrentTheme();
            
            console.log('Theme service initialized');
            
        } catch (error) {
            console.error('Failed to initialize theme service:', error);
            throw error;
        }
    }

    /**
     * 创建样式元素
     */
    createStyleElements() {
        THEME_CONFIG.cssTypes.forEach(type => {
            const styleElement = document.createElement('style');
            styleElement.id = `ephone-theme-${type}`;
            styleElement.setAttribute('data-theme-type', type);
            document.head.appendChild(styleElement);
            this.styleElements.set(type, styleElement);
        });
    }

    /**
     * 获取CSS配置
     * @param {string} type CSS类型
     * @returns {Promise<string>} CSS内容
     */
    async getCSSConfig(type) {
        try {
            const db = getDB();
            if (!db) throw new Error('Database not available');

            const config = await db.globalSettings.get('main');
            const cssConfig = config?.cssConfig || {};
            
            return cssConfig[type] || '';

        } catch (error) {
            console.error(`Failed to get CSS config for ${type}:`, error);
            return '';
        }
    }

    /**
     * 保存CSS配置
     * @param {string} type CSS类型
     * @param {string} cssContent CSS内容
     * @returns {Promise<Object>} 保存结果
     */
    async saveCSSConfig(type, cssContent) {
        try {
            // 验证CSS大小
            if (cssContent.length > THEME_CONFIG.maxCssSize) {
                throw new Error(`CSS content too large (max ${THEME_CONFIG.maxCssSize} bytes)`);
            }

            // 验证CSS语法（基础检查）
            this.validateCSS(cssContent);

            const db = getDB();
            if (!db) throw new Error('Database not available');

            let config = await db.globalSettings.get('main');
            if (!config) {
                config = { id: 'main', cssConfig: {} };
            }

            if (!config.cssConfig) {
                config.cssConfig = {};
            }

            // 保存配置
            config.cssConfig[type] = cssContent;
            config.updatedAt = new Date().toISOString();

            await db.globalSettings.put(config);

            // 实时应用CSS
            await this.applyCSS(type, cssContent);

            // 发送事件
            await eventBus.emit(EventTypes.THEME_UPDATED, {
                type,
                cssLength: cssContent.length,
                timestamp: Date.now()
            });

            return { success: true, message: 'CSS配置保存成功' };

        } catch (error) {
            console.error(`Failed to save CSS config for ${type}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 应用CSS样式
     * @param {string} type CSS类型
     * @param {string} cssContent CSS内容
     */
    async applyCSS(type, cssContent) {
        const styleElement = this.styleElements.get(type);
        if (styleElement) {
            styleElement.textContent = cssContent;
            this.appliedCss.set(type, cssContent);
        }
    }

    /**
     * 获取CSS模板
     * @param {string} templateIdOrCategory 模板ID或分类
     * @param {string} templateId 模板ID（可选，兼容双参数调用）
     * @returns {Object|string|null} 模板对象或CSS字符串
     */
    getCSSTemplate(templateIdOrCategory, templateId = null) {
        if (templateId === null) {
            // 单参数调用，返回CSS字符串（兼容原store层）
            const template = BUILT_IN_TEMPLATES[templateIdOrCategory];
            return template ? template.css : '';
        } else {
            // 双参数调用，返回模板对象
            const template = BUILT_IN_TEMPLATES[templateId];
            
            if (!template || template.category !== templateIdOrCategory) {
                return null;
            }

            return template;
        }
    }

    /**
     * 应用CSS模板
     * @param {string} typeOrCategory CSS类型或分类
     * @param {string} templateId 模板ID
     * @returns {Promise<Object>} 应用结果
     */
    async applyCSSTemplate(typeOrCategory, templateId) {
        try {
            let template;
            let cssType;

            if (THEME_CONFIG.cssTypes.includes(typeOrCategory)) {
                // 兼容原store层单参数调用：applyCSSTemplate(type, templateId)
                cssType = typeOrCategory;
                template = BUILT_IN_TEMPLATES[templateId];
            } else {
                // 新的双参数调用：applyCSSTemplate(category, templateId)
                template = this.getCSSTemplate(typeOrCategory, templateId);
                cssType = typeOrCategory;
            }
            
            if (!template) {
                throw new Error('模板不存在');
            }

            // 获取CSS内容
            const cssContent = typeof template === 'string' ? template : template.css;
            
            // 保存模板CSS
            const result = await this.saveCSSConfig(cssType, cssContent);
            
            if (result.success) {
                const templateName = typeof template === 'object' ? template.name : templateId;
                showSuccess(`模板"${templateName}"应用成功`);
                
                // 发送模板应用事件
                await eventBus.emit('theme.template-applied', {
                    category: cssType,
                    templateId,
                    templateName
                });
            }

            return result;

        } catch (error) {
            console.error('Failed to apply CSS template:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 重置CSS配置
     * @param {string} type CSS类型
     * @returns {Promise<Object>} 重置结果
     */
    async resetCSSConfig(type) {
        try {
            const defaultTemplate = this.getDefaultTemplate(type);
            const result = await this.saveCSSConfig(type, defaultTemplate);
            
            if (result.success) {
                return { success: true, message: `${type} CSS已重置为默认` };
            }
            
            return result;

        } catch (error) {
            console.error(`Failed to reset CSS config for ${type}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 重置所有CSS配置
     * @returns {Promise<Object>} 重置结果
     */
    async resetAllCSS() {
        try {
            const results = [];
            
            for (const type of THEME_CONFIG.cssTypes) {
                const result = await this.resetCSSConfig(type);
                results.push({ type, ...result });
            }

            const failedCount = results.filter(r => !r.success).length;
            
            if (failedCount === 0) {
                return { success: true, message: '所有CSS配置已重置' };
            } else {
                return { 
                    success: false, 
                    error: `${failedCount} 个配置重置失败`,
                    details: results
                };
            }

        } catch (error) {
            console.error('Failed to reset all CSS:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 导出所有CSS配置
     * @returns {Promise<Object>} 导出结果
     */
    async exportAllCSSConfig() {
        try {
            const exportData = {
                version: '1.0',
                timestamp: new Date().toISOString(),
                cssConfig: {}
            };

            for (const type of THEME_CONFIG.cssTypes) {
                exportData.cssConfig[type] = await this.getCSSConfig(type);
            }

            return {
                success: true,
                message: 'CSS配置导出成功',
                data: exportData
            };

        } catch (error) {
            console.error('Failed to export CSS config:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 导入CSS配置
     * @param {Object} importData 导入数据
     * @returns {Promise<Object>} 导入结果
     */
    async importCSSConfig(importData) {
        try {
            if (!importData || !importData.cssConfig) {
                throw new Error('无效的CSS配置数据');
            }

            const { cssConfig } = importData;
            const results = [];

            for (const [type, cssContent] of Object.entries(cssConfig)) {
                if (THEME_CONFIG.cssTypes.includes(type)) {
                    const result = await this.saveCSSConfig(type, cssContent);
                    results.push({ type, ...result });
                }
            }

            const failedCount = results.filter(r => !r.success).length;
            const successCount = results.length - failedCount;

            if (failedCount === 0) {
                return { 
                    success: true, 
                    message: `成功导入 ${successCount} 个CSS配置` 
                };
            } else {
                return { 
                    success: false, 
                    error: `${failedCount} 个配置导入失败`,
                    details: results
                };
            }

        } catch (error) {
            console.error('Failed to import CSS config:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * 从远程URL加载主题
     * @param {string} themeUrl 主题URL
     * @param {Object} options 选项
     * @returns {Promise<Object>} 加载结果
     */
    async loadRemoteTheme(themeUrl, options = {}) {
        throw new Error('远程主题功能已禁用，出于安全考虑不支持从网络加载主题。请使用本地导入功能或内置模板。');
    }

    /**
     * 预览主题（不保存）
     * @param {Object} themeData 主题数据
     */
    async previewTheme(themeData) {
        // 备份当前样式
        const backup = new Map();
        THEME_CONFIG.cssTypes.forEach(type => {
            const element = this.styleElements.get(type);
            if (element) {
                backup.set(type, element.textContent);
            }
        });

        // 应用预览样式
        const { cssConfig } = themeData;
        for (const [type, cssContent] of Object.entries(cssConfig)) {
            if (this.styleElements.has(type)) {
                await this.applyCSS(type, cssContent);
            }
        }

        // 设置恢复定时器（10秒后自动恢复）
        setTimeout(() => {
            backup.forEach((cssContent, type) => {
                this.applyCSS(type, cssContent);
            });
            showWarning('主题预览已结束');
        }, 10000);

        showSuccess('主题预览已开始，10秒后自动恢复');
    }

    /**
     * 加载当前主题
     */
    async loadCurrentTheme() {
        try {
            for (const type of THEME_CONFIG.cssTypes) {
                const cssContent = await this.getCSSConfig(type);
                await this.applyCSS(type, cssContent);
            }
        } catch (error) {
            console.error('Failed to load current theme:', error);
        }
    }

    /**
     * 获取默认模板
     * @param {string} type CSS类型
     * @returns {string} 默认CSS内容
     */
    getDefaultTemplate(type) {
        const defaultTemplates = {
            'global': BUILT_IN_TEMPLATES['global-light'].css,
            'user': BUILT_IN_TEMPLATES['user-classic'].css,
            'ai': BUILT_IN_TEMPLATES['ai-modern'].css
        };

        return defaultTemplates[type] || '';
    }

    /**
     * 验证CSS语法（基础检查）
     * @param {string} cssContent CSS内容
     */
    validateCSS(cssContent) {
        // 基础的CSS语法检查
        const braceStack = [];
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < cssContent.length; i++) {
            const char = cssContent[i];
            
            if (!inString) {
                if (char === '"' || char === "'") {
                    inString = true;
                    stringChar = char;
                } else if (char === '{') {
                    braceStack.push('{');
                } else if (char === '}') {
                    if (braceStack.length === 0) {
                        throw new Error('CSS语法错误：多余的}');
                    }
                    braceStack.pop();
                }
            } else {
                if (char === stringChar && cssContent[i - 1] !== '\\') {
                    inString = false;
                }
            }
        }

        if (braceStack.length > 0) {
            throw new Error('CSS语法错误：缺少}');
        }

        if (inString) {
            throw new Error('CSS语法错误：未闭合的字符串');
        }
    }

    /**
     * 获取内置模板列表
     * @param {string} category 分类（可选）
     * @returns {Array} 模板列表
     */
    getBuiltInTemplates(category = null) {
        const templates = Object.entries(BUILT_IN_TEMPLATES).map(([id, template]) => ({
            id,
            name: template.name,
            category: template.category
        }));

        if (category) {
            return templates.filter(t => t.category === category);
        }

        return templates;
    }

    /**
     * 获取CSS变量定义
     * @returns {Object} 变量定义
     */
    getCSSVariables() {
        return CSS_VARIABLES;
    }

    // ===== 契约遵循方法 =====

    /**
     * 获取所有可用主题 (契约方法)
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async getAvailableThemes() {
        try {
            const themes = [];

            // 内置模板主题
            const builtInTemplates = this.getBuiltInTemplates();
            themes.push(...builtInTemplates.map(template => ({
                id: template.id,
                name: template.name,
                type: 'built-in',
                category: template.category,
                source: 'internal'
            })));

            // 自定义主题（从数据库获取）
            try {
                const db = getDB();
                if (db && db.globalSettings) {
                    const config = await db.globalSettings.get('main');
                    const cssConfig = config?.cssConfig || {};
                    
                    Object.entries(cssConfig).forEach(([type, cssContent]) => {
                        if (cssContent && cssContent.trim()) {
                            themes.push({
                                id: `custom-${type}`,
                                name: `自定义${type}主题`,
                                type: 'custom',
                                category: type,
                                source: 'database'
                            });
                        }
                    });
                }
            } catch (error) {
                console.warn('Failed to load custom themes:', error);
            }

            return createSuccessResponse(themes, '主题列表获取成功', {
                totalThemes: themes.length,
                categories: [...new Set(themes.map(t => t.category))]
            });
        } catch (error) {
            return createErrorResponse(error.message, 'THEME_ERROR');
        }
    }

    /**
     * 获取当前主题 (契约方法)
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async getCurrentTheme() {
        try {
            const currentTheme = {
                id: this.currentTheme,
                appliedStyles: {},
                variables: CSS_VARIABLES
            };

            // 获取当前应用的CSS
            for (const type of THEME_CONFIG.cssTypes) {
                const cssContent = await this.getCSSConfig(type);
                currentTheme.appliedStyles[type] = {
                    content: cssContent,
                    length: cssContent.length,
                    lastModified: new Date().toISOString()
                };
            }

            return createSuccessResponse(currentTheme, '当前主题获取成功');
        } catch (error) {
            return createErrorResponse(error.message, 'THEME_ERROR');
        }
    }

    /**
     * 应用主题 (契约方法)
     * @param {string} themeId 主题ID
     * @param {Object} options 应用选项
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async applyTheme(themeId, options = {}) {
        try {
            const { preview = false, category = null } = options;

            // 查找主题
            let themeData;
            
            if (BUILT_IN_TEMPLATES[themeId]) {
                // 内置模板
                const template = BUILT_IN_TEMPLATES[themeId];
                themeData = {
                    cssConfig: {
                        [template.category]: template.css
                    }
                };
            } else if (themeId.startsWith('custom-')) {
                // 自定义主题
                const type = themeId.replace('custom-', '');
                const cssContent = await this.getCSSConfig(type);
                themeData = {
                    cssConfig: {
                        [type]: cssContent
                    }
                };
            } else {
                throw new Error('主题不存在');
            }

            if (preview) {
                await this.previewTheme(themeData);
                return createSuccessResponse(null, '主题预览已启动');
            } else {
                const result = await this.importCSSConfig(themeData);
                if (result.success) {
                    this.currentTheme = themeId;
                    return createSuccessResponse(null, '主题应用成功');
                } else {
                    return createErrorResponse(result.error, 'THEME_ERROR');
                }
            }
        } catch (error) {
            return createErrorResponse(error.message, 'THEME_ERROR');
        }
    }

    /**
     * 创建自定义主题 (契约方法)
     * @param {Object} themeConfig 主题配置
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async createCustomTheme(themeConfig) {
        try {
            const { id, name, description, variables, customCSS, isDark } = themeConfig;

            if (!id || !name) {
                throw new Error('主题ID和名称不能为空');
            }

            // 生成CSS内容
            let cssContent = '';

            // 添加变量定义
            if (variables) {
                cssContent += ':root {\n';
                Object.entries(variables).forEach(([key, value]) => {
                    const varName = key.startsWith('--') ? key : `--ephone-${key}`;
                    cssContent += `    ${varName}: ${value};\n`;
                });
                cssContent += '}\n\n';
            }

            // 添加自定义CSS
            if (customCSS) {
                cssContent += customCSS;
            }

            // 保存主题
            const category = isDark ? 'dark' : 'global';
            const result = await this.saveCSSConfig(category, cssContent);

            if (result.success) {
                // 保存主题元数据
                const db = getDB();
                if (db && db.globalSettings) {
                    let config = await db.globalSettings.get('main');
                    if (!config) config = { id: 'main' };
                    
                    if (!config.customThemes) config.customThemes = {};
                    config.customThemes[id] = {
                        name,
                        description,
                        category,
                        isDark,
                        createdAt: new Date().toISOString()
                    };
                    
                    await db.globalSettings.put(config);
                }

                return createSuccessResponse({ themeId: id }, '自定义主题创建成功');
            } else {
                return createErrorResponse(result.error, 'THEME_ERROR');
            }
        } catch (error) {
            return createErrorResponse(error.message, 'THEME_ERROR');
        }
    }

    /**
     * 更新主题配置 (契约方法)
     * @param {string} themeId 主题ID
     * @param {Object} updates 更新内容
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async updateTheme(themeId, updates) {
        try {
            if (BUILT_IN_TEMPLATES[themeId]) {
                return createErrorResponse('内置主题不能修改', 'VALIDATION_ERROR');
            }

            // 获取当前主题配置
            const currentTheme = await this.getCurrentTheme();
            if (!currentTheme.success) {
                throw new Error('无法获取当前主题配置');
            }

            // 应用更新
            const { variables, customCSS, name, description } = updates;
            
            let cssContent = '';
            
            // 更新变量
            if (variables) {
                cssContent += ':root {\n';
                Object.entries(variables).forEach(([key, value]) => {
                    const varName = key.startsWith('--') ? key : `--ephone-${key}`;
                    cssContent += `    ${varName}: ${value};\n`;
                });
                cssContent += '}\n\n';
            }

            // 更新自定义CSS
            if (customCSS) {
                cssContent += customCSS;
            }

            // 确定分类
            const category = themeId.startsWith('custom-') ? 
                themeId.replace('custom-', '') : 'global';

            const result = await this.saveCSSConfig(category, cssContent);

            if (result.success) {
                // 更新元数据
                if (name || description) {
                    const db = getDB();
                    if (db && db.globalSettings) {
                        let config = await db.globalSettings.get('main');
                        if (config && config.customThemes && config.customThemes[themeId]) {
                            if (name) config.customThemes[themeId].name = name;
                            if (description) config.customThemes[themeId].description = description;
                            config.customThemes[themeId].updatedAt = new Date().toISOString();
                            await db.globalSettings.put(config);
                        }
                    }
                }

                return createSuccessResponse(null, '主题更新成功');
            } else {
                return createErrorResponse(result.error, 'THEME_ERROR');
            }
        } catch (error) {
            return createErrorResponse(error.message, 'THEME_ERROR');
        }
    }

    /**
     * 删除自定义主题 (契约方法)
     * @param {string} themeId 主题ID
     * @returns {Promise<ServiceResponse>} 标准化响应
     */
    async deleteCustomTheme(themeId) {
        try {
            if (BUILT_IN_TEMPLATES[themeId]) {
                return createErrorResponse('内置主题不能删除', 'VALIDATION_ERROR');
            }

            if (!themeId.startsWith('custom-')) {
                return createErrorResponse('只能删除自定义主题', 'VALIDATION_ERROR');
            }

            const category = themeId.replace('custom-', '');

            // 重置CSS配置
            const result = await this.resetCSSConfig(category);
            
            if (result.success) {
                // 删除元数据
                const db = getDB();
                if (db && db.globalSettings) {
                    let config = await db.globalSettings.get('main');
                    if (config && config.customThemes) {
                        delete config.customThemes[themeId];
                        await db.globalSettings.put(config);
                    }
                }

                // 如果删除的是当前主题，切换到默认主题
                if (this.currentTheme === themeId) {
                    this.currentTheme = 'default';
                }

                return createSuccessResponse(null, '自定义主题删除成功');
            } else {
                return createErrorResponse(result.error, 'THEME_ERROR');
            }
        } catch (error) {
            return createErrorResponse(error.message, 'THEME_ERROR');
        }
    }
}

// 创建全局主题服务实例
export const themeService = new ThemeService();

// 导出服务类和常量
export { ThemeService, CSS_VARIABLES, BUILT_IN_TEMPLATES, THEME_CONFIG };