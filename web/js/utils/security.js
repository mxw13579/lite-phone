/**
 * 安全工具库
 * 提供XSS防护、输入验证和安全处理功能
 */

/**
 * HTML转义函数 - 防止XSS注入
 * @param {string} text 需要转义的文本
 * @returns {string} 转义后的安全文本
 */
export function escapeHtml(text) {
    if (typeof text !== 'string') {
        return String(text);
    }
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * HTML反转义函数
 * @param {string} html 需要反转义的HTML
 * @returns {string} 反转义后的文本
 */
export function unescapeHtml(html) {
    if (typeof html !== 'string') {
        return String(html);
    }
    
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
}

/**
 * 安全的HTML内容设置
 * @param {Element} element DOM元素
 * @param {string} html HTML内容
 * @param {boolean} allowBasicTags 是否允许基础标签
 */
export function setInnerHTMLSafely(element, html, allowBasicTags = false) {
    if (!element || typeof html !== 'string') {
        return;
    }
    
    if (allowBasicTags) {
        // 允许基础安全标签
        const sanitized = sanitizeBasicHtml(html);
        element.innerHTML = sanitized;
    } else {
        // 完全转义，使用textContent
        element.textContent = html;
    }
}

/**
 * 🔒 安全的script标签移除（防ReDoS）
 * @param {string} html HTML内容
 * @returns {string} 移除script标签后的HTML
 */
function removeScriptTagsSafely(html) {
    // 使用状态机方法而非复杂正则表达式，避免ReDoS攻击
    let result = '';
    let i = 0;
    const len = html.length;
    
    while (i < len) {
        const scriptStart = html.toLowerCase().indexOf('<script', i);
        if (scriptStart === -1) {
            // 没有更多script标签，添加剩余内容
            result += html.slice(i);
            break;
        }
        
        // 添加script标签前的内容
        result += html.slice(i, scriptStart);
        
        // 寻找对应的</script>标签
        const scriptEndTag = '</script>';
        const scriptEnd = html.toLowerCase().indexOf(scriptEndTag, scriptStart);
        if (scriptEnd === -1) {
            // 没有找到结束标签，移除所有剩余内容
            break;
        }
        
        // 跳过整个script标签（包括结束标签）
        i = scriptEnd + scriptEndTag.length;
    }
    
    return result;
}

/**
 * 基础HTML标签清理（允许安全的基础标签）
 * @param {string} html 原始HTML
 * @returns {string} 清理后的HTML
 */
export function sanitizeBasicHtml(html) {
    if (typeof html !== 'string') {
        return '';
    }
    
    // 允许的安全标签和属性
    const allowedTags = ['b', 'i', 'em', 'strong', 'span', 'div', 'p', 'br'];
    const allowedAttributes = ['class', 'data-'];
    
    // 简单的标签清理（在没有DOMPurify的情况下）
    let cleaned = html;
    
    // 🔒 ReDoS修复：使用更安全的script标签移除逻辑
    // 避免嵌套量词和负向先行断言导致的ReDoS攻击
    cleaned = removeScriptTagsSafely(cleaned);
    
    // 移除事件属性
    cleaned = cleaned.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
    
    // 移除javascript: 协议
    cleaned = cleaned.replace(/javascript\s*:/gi, '');
    
    // 移除data: 协议（除了安全的data-属性）
    cleaned = cleaned.replace(/\bdata\s*:\s*[^;\s]+/gi, '');
    
    return cleaned;
}

/**
 * 输入验证和清理
 * @param {string} input 用户输入
 * @param {string} type 输入类型
 * @returns {string} 清理后的输入
 */
export function sanitizeInput(input, type = 'text') {
    if (typeof input !== 'string') {
        return '';
    }
    
    switch (type) {
        case 'html':
            return sanitizeBasicHtml(input);
        case 'url':
            return sanitizeUrl(input);
        case 'filename':
            return input.replace(/[^a-zA-Z0-9._\-\u4e00-\u9fff]/g, '');
        case 'number':
            return input.replace(/[^\d.-]/g, '');
        case 'email':
            return input.replace(/[^a-zA-Z0-9@._-]/g, '');
        default:
            return escapeHtml(input);
    }
}

/**
 * URL安全验证和清理
 * @param {string} url URL字符串
 * @returns {string} 安全的URL或空字符串
 */
export function sanitizeUrl(url) {
    if (typeof url !== 'string') {
        return '';
    }
    
    try {
        const urlObj = new URL(url);
        // 只允许http和https协议
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            return '';
        }
        return urlObj.href;
    } catch {
        return '';
    }
}

/**
 * 创建安全的DOM元素
 * @param {string} tag 标签名
 * @param {Object} attributes 属性对象
 * @param {string} content 内容
 * @returns {Element} DOM元素
 */
export function createSafeElement(tag, attributes = {}, content = '') {
    const element = document.createElement(tag);
    
    // 安全设置属性
    Object.entries(attributes).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = sanitizeInput(value, 'text');
        } else if (key === 'textContent') {
            element.textContent = sanitizeInput(value, 'text');
        } else if (key.startsWith('data-')) {
            element.setAttribute(key, sanitizeInput(value, 'text'));
        } else if (key === 'href' && tag.toLowerCase() === 'a') {
            const safeUrl = sanitizeUrl(value);
            if (safeUrl) {
                element.href = safeUrl;
            }
        } else if (key === 'src' && ['img', 'iframe'].includes(tag.toLowerCase())) {
            const safeUrl = sanitizeUrl(value);
            if (safeUrl) {
                element[key] = safeUrl;
            }
        } else if (['id', 'title', 'alt'].includes(key)) {
            element[key] = sanitizeInput(value, 'text');
        }
        // 忽略其他可能不安全的属性
    });
    
    // 安全设置内容
    if (content) {
        element.textContent = sanitizeInput(content, 'text');
    }
    
    return element;
}

/**
 * CSRF令牌管理
 */
export class CSRFProtection {
    static generateToken() {
        const token = crypto.randomUUID ? crypto.randomUUID() : 
                     Date.now().toString(36) + Math.random().toString(36);
        sessionStorage.setItem('csrf_token', token);
        return token;
    }
    
    static getToken() {
        return sessionStorage.getItem('csrf_token');
    }
    
    static validateToken(token) {
        const sessionToken = this.getToken();
        return token === sessionToken && sessionToken !== null;
    }
    
    static addTokenToForm(form) {
        const token = this.getToken() || this.generateToken();
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'csrf_token';
        input.value = token;
        form.appendChild(input);
    }
}

/**
 * 速率限制
 */
export class RateLimit {
    static limits = new Map();
    
    static check(key, limit = 10, window = 60000) {
        const now = Date.now();
        const requests = this.limits.get(key) || [];
        
        // 清理过期请求
        const validRequests = requests.filter(time => now - time < window);
        
        if (validRequests.length >= limit) {
            throw new Error('请求过于频繁，请稍后再试');
        }
        
        validRequests.push(now);
        this.limits.set(key, validRequests);
        
        return true;
    }
    
    static reset(key) {
        this.limits.delete(key);
    }
}

// 导出主要函数
export default {
    escapeHtml,
    unescapeHtml,
    setInnerHTMLSafely,
    sanitizeBasicHtml,
    sanitizeInput,
    sanitizeUrl,
    createSafeElement,
    CSRFProtection,
    RateLimit
};