/**
 * DOM 操作工具函数
 * 提供常用的 DOM 选择、操作和事件绑定功能
 * 已加强XSS防护 - 修复安全漏洞
 */

import { escapeHtml, setInnerHTMLSafely, createSafeElement } from './security.js';
import { MemoryUtils } from './memory-manager.js';

/**
 * 安全的 DOM 元素选择器
 * @param {string} selector CSS选择器
 * @param {Element} context 上下文元素，默认为 document
 * @returns {Element|null} 选中的元素
 */
export function $(selector, context = document) {
    try {
        return context.querySelector(selector);
    } catch (error) {
        console.error(`Invalid selector: ${selector}`, error);
        return null;
    }
}

/**
 * 选择多个元素
 * @param {string} selector CSS选择器
 * @param {Element} context 上下文元素，默认为 document
 * @returns {NodeList} 选中的元素列表
 */
export function $$(selector, context = document) {
    try {
        return context.querySelectorAll(selector);
    } catch (error) {
        console.error(`Invalid selector: ${selector}`, error);
        return [];
    }
}

/**
 * 通过 ID 选择元素
 * @param {string} id 元素ID
 * @returns {Element|null} 选中的元素
 */
export function byId(id) {
    return document.getElementById(id);
}

/**
 * 创建元素
 * @param {string} tag 标签名
 * @param {Object} attributes 属性对象
 * @param {string|Element[]} content 内容
 * @returns {Element} 创建的元素
 */
export function createElement(tag, attributes = {}, content = '') {
    const element = document.createElement(tag);
    
    // 设置属性
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'innerHTML') {
            // 🚨 XSS风险修复：使用安全的HTML设置方法
            console.warn('使用innerHTML可能存在XSS风险，已自动转换为安全处理');
            setInnerHTMLSafely(element, value, true); // 允许基础标签
        } else if (key === 'textContent') {
            element.textContent = value;
        } else if (key.startsWith('data-')) {
            element.setAttribute(key, value);
        } else {
            element[key] = value;
        }
    });
    
    // 设置内容 - 只有在没有设置innerHTML的情况下才设置content
    if (typeof content === 'string' && content && !attributes.innerHTML) {
        element.textContent = content;
    } else if (Array.isArray(content)) {
        content.forEach(child => {
            if (typeof child === 'string') {
                element.appendChild(document.createTextNode(child));
            } else if (child instanceof Element) {
                element.appendChild(child);
            }
        });
    } else if (content instanceof Element) {
        element.appendChild(content);
    }
    
    return element;
}

/**
 * 内存安全的事件绑定
 * @param {Element|string} elementOrSelector 元素或选择器
 * @param {string} eventType 事件类型
 * @param {Function} handler 事件处理函数
 * @param {Object} options 事件选项
 * @returns {Function|null} 清理函数
 */
export function addEventListener(elementOrSelector, eventType, handler, options = {}) {
    try {
        const element = typeof elementOrSelector === 'string' 
            ? $(elementOrSelector) 
            : elementOrSelector;
            
        if (!element) {
            console.warn(`Element not found for selector: ${elementOrSelector}`);
            return null;
        }
        
        const wrappedHandler = (event) => {
            try {
                return handler(event);
            } catch (error) {
                console.error(`Event handler error for ${eventType}:`, error);
            }
        };
        
        // 使用内存管理器跟踪事件监听器
        return MemoryUtils.addEventListener(element, eventType, wrappedHandler, options);
        
    } catch (error) {
        console.error(`Failed to add event listener:`, error);
        return null;
    }
}

/**
 * 批量事件绑定
 * @param {Array} bindings 绑定配置数组 [{selector, event, handler, options}]
 * @returns {Function} 清理所有绑定的函数
 */
export function addEventListeners(bindings) {
    const cleanupFunctions = [];
    
    bindings.forEach(({selector, event, handler, options}) => {
        const cleanup = addEventListener(selector, event, handler, options);
        if (cleanup) {
            cleanupFunctions.push(cleanup);
        }
    });
    
    return () => {
        cleanupFunctions.forEach(cleanup => cleanup());
    };
}

/**
 * 显示元素
 * @param {Element|string} elementOrSelector 元素或选择器
 * @param {string} displayType 显示类型，默认为 'block'
 */
export function show(elementOrSelector, displayType = 'block') {
    const element = typeof elementOrSelector === 'string' 
        ? $(elementOrSelector) 
        : elementOrSelector;
        
    if (element) {
        element.style.display = displayType;
    }
}

/**
 * 隐藏元素
 * @param {Element|string} elementOrSelector 元素或选择器
 */
export function hide(elementOrSelector) {
    const element = typeof elementOrSelector === 'string' 
        ? $(elementOrSelector) 
        : elementOrSelector;
        
    if (element) {
        element.style.display = 'none';
    }
}

/**
 * 切换元素显示状态
 * @param {Element|string} elementOrSelector 元素或选择器
 * @param {string} displayType 显示类型，默认为 'block'
 */
export function toggle(elementOrSelector, displayType = 'block') {
    const element = typeof elementOrSelector === 'string' 
        ? $(elementOrSelector) 
        : elementOrSelector;
        
    if (element) {
        const isVisible = element.style.display !== 'none' && 
                         getComputedStyle(element).display !== 'none';
        element.style.display = isVisible ? 'none' : displayType;
    }
}

/**
 * 添加 CSS 类
 * @param {Element|string} elementOrSelector 元素或选择器
 * @param {...string} classNames 类名
 */
export function addClass(elementOrSelector, ...classNames) {
    const element = typeof elementOrSelector === 'string' 
        ? $(elementOrSelector) 
        : elementOrSelector;
        
    if (element) {
        element.classList.add(...classNames);
    }
}

/**
 * 移除 CSS 类
 * @param {Element|string} elementOrSelector 元素或选择器
 * @param {...string} classNames 类名
 */
export function removeClass(elementOrSelector, ...classNames) {
    const element = typeof elementOrSelector === 'string' 
        ? $(elementOrSelector) 
        : elementOrSelector;
        
    if (element) {
        element.classList.remove(...classNames);
    }
}

/**
 * 切换 CSS 类
 * @param {Element|string} elementOrSelector 元素或选择器
 * @param {string} className 类名
 * @returns {boolean} 切换后的状态
 */
export function toggleClass(elementOrSelector, className) {
    const element = typeof elementOrSelector === 'string' 
        ? $(elementOrSelector) 
        : elementOrSelector;
        
    if (element) {
        return element.classList.toggle(className);
    }
    return false;
}

/**
 * 检查是否有指定的 CSS 类
 * @param {Element|string} elementOrSelector 元素或选择器
 * @param {string} className 类名
 * @returns {boolean} 是否包含该类
 */
export function hasClass(elementOrSelector, className) {
    const element = typeof elementOrSelector === 'string' 
        ? $(elementOrSelector) 
        : elementOrSelector;
        
    return element ? element.classList.contains(className) : false;
}

/**
 * 清空元素内容
 * @param {Element|string} elementOrSelector 元素或选择器
 */
export function empty(elementOrSelector) {
    const element = typeof elementOrSelector === 'string' 
        ? $(elementOrSelector) 
        : elementOrSelector;
        
    if (element) {
        element.innerHTML = '';
    }
}

/**
 * 设置元素内容
 * @param {Element|string} elementOrSelector 元素或选择器
 * @param {string|Element} content 内容
 * @param {boolean} isHTML 是否为 HTML 内容
 */
export function setContent(elementOrSelector, content, isHTML = false) {
    const element = typeof elementOrSelector === 'string' 
        ? $(elementOrSelector) 
        : elementOrSelector;
        
    if (element) {
        if (isHTML && typeof content === 'string') {
            // 🔒 XSS安全修复：使用安全的HTML设置方法
            setInnerHTMLSafely(element, content, true);
        } else if (content instanceof Element) {
            empty(element);
            element.appendChild(content);
        } else {
            element.textContent = String(content);
        }
    }
}

/**
 * 获取表单数据
 * @param {Element|string} formOrSelector 表单元素或选择器
 * @returns {Object} 表单数据对象
 */
export function getFormData(formOrSelector) {
    const form = typeof formOrSelector === 'string' 
        ? $(formOrSelector) 
        : formOrSelector;
        
    if (!form) return {};
    
    const formData = new FormData(form);
    const data = {};
    
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }
    
    return data;
}

/**
 * 设置表单数据
 * @param {Element|string} formOrSelector 表单元素或选择器
 * @param {Object} data 数据对象
 */
export function setFormData(formOrSelector, data) {
    const form = typeof formOrSelector === 'string' 
        ? $(formOrSelector) 
        : formOrSelector;
        
    if (!form || !data) return;
    
    Object.entries(data).forEach(([key, value]) => {
        const element = form.querySelector(`[name="${key}"]`);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = Boolean(value);
            } else if (element.type === 'radio') {
                const radioButton = form.querySelector(`[name="${key}"][value="${value}"]`);
                if (radioButton) {
                    radioButton.checked = true;
                }
            } else {
                element.value = value;
            }
        }
    });
}

/**
 * 滚动到元素位置
 * @param {Element|string} elementOrSelector 元素或选择器
 * @param {Object} options 滚动选项
 */
export function scrollToElement(elementOrSelector, options = {}) {
    const element = typeof elementOrSelector === 'string' 
        ? $(elementOrSelector) 
        : elementOrSelector;
        
    if (element) {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            ...options
        });
    }
}