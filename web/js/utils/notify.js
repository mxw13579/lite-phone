/**
 * 通知工具
 * 提供Toast提示功能，替代原始的全局通知系统
 */

/**
 * Toast消息类型
 */
export const ToastType = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info'
};

/**
 * Toast消息队列
 */
const toastQueue = [];
let toastContainer = null;

/**
 * 初始化Toast容器
 */
function initToastContainer() {
    if (toastContainer) return;
    
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container';
    toastContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        pointer-events: none;
    `;
    
    document.body.appendChild(toastContainer);
}

/**
 * 显示Toast消息
 * @param {string} message 消息内容
 * @param {string} type 消息类型
 * @param {number} duration 显示时长（毫秒）
 */
export function showToast(message, type = ToastType.INFO, duration = 3000) {
    initToastContainer();
    
    const toast = createToastElement(message, type);
    toastContainer.appendChild(toast);
    
    // 触发显示动画
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });
    
    // 自动隐藏
    setTimeout(() => {
        hideToast(toast);
    }, duration);
    
    // 记录到队列
    toastQueue.push({
        message,
        type,
        timestamp: Date.now()
    });
    
    // 限制队列长度
    if (toastQueue.length > 10) {
        toastQueue.splice(0, toastQueue.length - 10);
    }
}

/**
 * 创建Toast元素
 * @param {string} message 消息内容
 * @param {string} type 消息类型
 * @returns {Element} Toast元素
 */
function createToastElement(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // 根据类型设置图标和颜色
    const config = getToastConfig(type);
    
    toast.innerHTML = `
        <div class="toast-icon">${config.icon}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    `;
    
    toast.style.cssText = `
        display: flex;
        align-items: center;
        background: ${config.background};
        color: ${config.color};
        border: 1px solid ${config.border};
        border-radius: 6px;
        padding: 12px 16px;
        margin-bottom: 8px;
        min-width: 300px;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s ease;
        pointer-events: auto;
        font-size: 14px;
        line-height: 1.4;
    `;
    
    return toast;
}

/**
 * 获取Toast配置
 * @param {string} type 消息类型
 * @returns {Object} Toast配置
 */
function getToastConfig(type) {
    const configs = {
        [ToastType.SUCCESS]: {
            icon: '✓',
            background: '#f0f9ff',
            color: '#0c4a6e',
            border: '#7dd3fc'
        },
        [ToastType.ERROR]: {
            icon: '✕',
            background: '#fef2f2',
            color: '#991b1b',
            border: '#fca5a5'
        },
        [ToastType.WARNING]: {
            icon: '⚠',
            background: '#fffbeb',
            color: '#92400e',
            border: '#fcd34d'
        },
        [ToastType.INFO]: {
            icon: 'ⓘ',
            background: '#f8fafc',
            color: '#334155',
            border: '#cbd5e1'
        }
    };
    
    return configs[type] || configs[ToastType.INFO];
}

/**
 * 隐藏Toast消息
 * @param {Element} toast Toast元素
 */
function hideToast(toast) {
    toast.style.transform = 'translateX(100%)';
    toast.style.opacity = '0';
    
    setTimeout(() => {
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    }, 300);
}

/**
 * 清除所有Toast消息
 */
export function clearAllToasts() {
    if (toastContainer) {
        toastContainer.innerHTML = '';
    }
    toastQueue.length = 0;
}

/**
 * 获取Toast历史记录
 * @returns {Array} Toast历史
 */
export function getToastHistory() {
    return [...toastQueue];
}

/**
 * 显示成功消息
 * @param {string} message 消息内容
 * @param {number} duration 显示时长
 */
export function showSuccess(message, duration = 3000) {
    showToast(message, ToastType.SUCCESS, duration);
}

/**
 * 显示错误消息
 * @param {string} message 消息内容
 * @param {number} duration 显示时长
 */
export function showError(message, duration = 4000) {
    showToast(message, ToastType.ERROR, duration);
}

/**
 * 显示警告消息
 * @param {string} message 消息内容
 * @param {number} duration 显示时长
 */
export function showWarning(message, duration = 3500) {
    showToast(message, ToastType.WARNING, duration);
}

/**
 * 显示信息消息
 * @param {string} message 消息内容
 * @param {number} duration 显示时长
 */
export function showInfo(message, duration = 3000) {
    showToast(message, ToastType.INFO, duration);
}

// 兼容性：暴露到全局
if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.showSuccess = showSuccess;
    window.showError = showError;
    window.showWarning = showWarning;
    window.showInfo = showInfo;
}