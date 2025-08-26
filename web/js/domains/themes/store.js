/**
 * 主题管理存储层
 * 负责主题数据的管理和CSS配置
 * 现已集成至themes服务层，提供兼容性接口
 */

import { getDB } from '../../core/db.js';
import { themeService } from '../../services/themes.js';

/**
 * 获取CSS配置
 * @param {string} type CSS类型 (global, user, ai)
 * @returns {Promise<string>} CSS内容
 */
export async function getCSSConfig(type) {
    return await themeService.getCSSConfig(type);
}

/**
 * 保存CSS配置
 * @param {string} type CSS类型
 * @param {string} cssContent CSS内容
 * @returns {Promise<Object>} 操作结果
 */
export async function saveCSSConfig(type, cssContent) {
    return await themeService.saveCSSConfig(type, cssContent);
}

/**
 * 重置CSS配置
 * @param {string} type CSS类型
 * @returns {Promise<Object>} 操作结果
 */
export async function resetCSSConfig(type) {
    return await themeService.resetCSSConfig(type);
}

/**
 * 获取CSS模板
 * @param {string} templateId 模板ID
 * @returns {string} 模板内容
 */
export function getCSSTemplate(templateId) {
    return themeService.getCSSTemplate(templateId);
}

/**
 * 应用CSS模板
 * @param {string} type CSS类型
 * @param {string} templateId 模板ID
 * @returns {Promise<Object>} 操作结果
 */
export async function applyCSSTemplate(type, templateId) {
    return await themeService.applyCSSTemplate(type, templateId);
}

/**
 * 导出所有CSS配置
 * @returns {Promise<Object>} 导出结果
 */
export async function exportAllCSSConfig() {
    return await themeService.exportAllCSSConfig();
}

/**
 * 导入CSS配置
 * @param {Object} importData 导入数据
 * @returns {Promise<Object>} 导入结果
 */
export async function importCSSConfig(importData) {
    return await themeService.importCSSConfig(importData);
}

/**
 * 重置所有CSS配置
 * @returns {Promise<Object>} 操作结果
 */
export async function resetAllCSS() {
    return await themeService.resetAllCSS();
}