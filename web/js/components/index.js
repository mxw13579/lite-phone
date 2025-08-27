/**
 * 使用方法：
 * import { Button, Card, Modal, Form } from './components/index.js';
 * const btn = Button({ text: '确定', type: 'primary', onClick: handler });
 */

import { createElement } from '../utils/dom.js';
import './components.css';

/**
 * 按钮组件
 * @param {Object} options - 按钮配置
 * @param {string} options.text - 按钮文本
 * @param {string} options.type - 按钮类型：primary, secondary, danger, icon
 * @param {boolean} options.disabled - 是否禁用
 * @param {Function} options.onClick - 点击事件处理器
 * @param {string} options.className - 额外类名
 * @param {string} options.icon - 图标类名
 * @returns {HTMLElement} 按钮元素
 */
export function Button({ 
    text = '', 
    type = 'primary', 
    disabled = false, 
    onClick = null,
    className = '',
    icon = '',
    ...attrs 
}) {
    const btn = createElement('button', {
        className: `btn btn-${type} ${className}`.trim(),
        disabled,
        ...attrs
    });

    if (icon) {
        const iconEl = createElement('i', { className: `icon ${icon}` });
        btn.appendChild(iconEl);
        if (text) {
            btn.appendChild(createElement('span', { textContent: text }));
        }
    } else {
        btn.textContent = text;
    }

    if (onClick) {
        btn.addEventListener('click', onClick);
    }

    return btn;
}

/**
 * 卡片组件
 * @param {Object} options - 卡片配置
 * @param {string} options.title - 卡片标题
 * @param {string} options.content - 卡片内容
 * @param {Array<HTMLElement>} options.actions - 操作按钮数组
 * @param {string} options.className - 额外类名
 * @returns {HTMLElement} 卡片元素
 */
export function Card({ 
    title = '', 
    content = '', 
    actions = [], 
    className = '',
    ...attrs 
}) {
    const card = createElement('div', {
        className: `card ${className}`.trim(),
        ...attrs
    });

    if (title) {
        const header = createElement('div', { className: 'card-header' });
        const titleEl = createElement('h3', { 
            className: 'card-title', 
            textContent: title 
        });
        header.appendChild(titleEl);
        card.appendChild(header);
    }

    if (content) {
        const body = createElement('div', { className: 'card-body' });
        if (typeof content === 'string') {
            body.innerHTML = content;
        } else {
            body.appendChild(content);
        }
        card.appendChild(body);
    }

    if (actions.length > 0) {
        const footer = createElement('div', { className: 'card-footer' });
        actions.forEach(action => footer.appendChild(action));
        card.appendChild(footer);
    }

    return card;
}

/**
 * 模态框组件
 * @param {Object} options - 模态框配置
 * @param {string} options.title - 标题
 * @param {HTMLElement|string} options.content - 内容
 * @param {Array<HTMLElement>} options.actions - 操作按钮
 * @param {boolean} options.closable - 是否可关闭
 * @param {Function} options.onClose - 关闭回调
 * @returns {HTMLElement} 模态框元素
 */
export function Modal({ 
    title = '', 
    content = '', 
    actions = [], 
    closable = true,
    onClose = null,
    className = '' 
}) {
    const modal = createElement('div', {
        className: `modal ${className}`.trim(),
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': title ? 'modal-title' : null
    });

    const overlay = createElement('div', { className: 'modal-overlay' });
    const dialog = createElement('div', { className: 'modal-dialog' });

    // 标题栏
    const header = createElement('div', { className: 'modal-header' });
    if (title) {
        const titleEl = createElement('h2', { 
            className: 'modal-title',
            id: 'modal-title',
            textContent: title 
        });
        header.appendChild(titleEl);
    }

    if (closable) {
        const closeBtn = Button({
            text: '×',
            type: 'icon',
            className: 'modal-close',
            onClick: () => closeModal()
        });
        closeBtn.setAttribute('aria-label', '关闭');
        header.appendChild(closeBtn);
    }

    // 内容区
    const body = createElement('div', { className: 'modal-body' });
    if (typeof content === 'string') {
        body.innerHTML = content;
    } else {
        body.appendChild(content);
    }

    // 操作栏
    let footer = null;
    if (actions.length > 0) {
        footer = createElement('div', { className: 'modal-footer' });
        actions.forEach(action => footer.appendChild(action));
    }

    dialog.appendChild(header);
    dialog.appendChild(body);
    if (footer) dialog.appendChild(footer);

    modal.appendChild(overlay);
    modal.appendChild(dialog);

    // 关闭功能
    function closeModal() {
        modal.remove();
        if (onClose) onClose();
    }

    // 点击遮罩关闭
    if (closable) {
        overlay.addEventListener('click', closeModal);
    }

    // ESC关闭
    const handleKeydown = (e) => {
        if (e.key === 'Escape' && closable) {
            closeModal();
            document.removeEventListener('keydown', handleKeydown);
        }
    };
    document.addEventListener('keydown', handleKeydown);

    // 显示模态框
    modal.show = () => {
        document.body.appendChild(modal);
        // 设置焦点
        const firstFocusable = modal.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (firstFocusable) {
            firstFocusable.focus();
        }
        return modal;
    };

    modal.hide = closeModal;

    return modal;
}

/**
 * 表单组件
 * @param {Object} options - 表单配置
 * @param {Array} options.fields - 字段配置数组
 * @param {Function} options.onSubmit - 提交处理器
 * @param {Array<HTMLElement>} options.actions - 操作按钮
 * @returns {HTMLElement} 表单元素
 */
export function Form({ 
    fields = [], 
    onSubmit = null, 
    actions = [],
    className = '' 
}) {
    const form = createElement('form', {
        className: `form ${className}`.trim()
    });

    // 创建字段
    fields.forEach(field => {
        const group = createElement('div', { className: 'form-group' });

        if (field.label) {
            const label = createElement('label', {
                className: 'form-label',
                textContent: field.label
            });
            if (field.id) {
                label.setAttribute('for', field.id);
            }
            group.appendChild(label);
        }

        let input;
        if (field.type === 'textarea') {
            input = createElement('textarea', {
                className: 'form-control',
                id: field.id,
                name: field.name,
                placeholder: field.placeholder,
                required: field.required,
                rows: field.rows || 3
            });
        } else if (field.type === 'select') {
            input = createElement('select', {
                className: 'form-control',
                id: field.id,
                name: field.name,
                required: field.required
            });
            
            if (field.options) {
                field.options.forEach(option => {
                    const opt = createElement('option', {
                        value: option.value,
                        textContent: option.text,
                        selected: option.selected
                    });
                    input.appendChild(opt);
                });
            }
        } else {
            input = createElement('input', {
                type: field.type || 'text',
                className: 'form-control',
                id: field.id,
                name: field.name,
                placeholder: field.placeholder,
                value: field.value || '',
                required: field.required,
                min: field.min,
                max: field.max,
                step: field.step
            });
        }

        group.appendChild(input);

        if (field.help) {
            const help = createElement('small', {
                className: 'form-help',
                textContent: field.help
            });
            group.appendChild(help);
        }

        form.appendChild(group);
    });

    // 操作按钮
    if (actions.length > 0) {
        const actionsGroup = createElement('div', { className: 'form-actions' });
        actions.forEach(action => actionsGroup.appendChild(action));
        form.appendChild(actionsGroup);
    }

    // 提交处理
    if (onSubmit) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const data = Object.fromEntries(formData);
            onSubmit(data, form);
        });
    }

    return form;
}

/**
 * 标签组件
 * @param {Object} options - 标签配置
 * @param {string} options.text - 标签文本
 * @param {string} options.type - 标签类型：primary, success, warning, danger, info
 * @param {boolean} options.closable - 是否可关闭
 * @param {Function} options.onClose - 关闭回调
 * @returns {HTMLElement} 标签元素
 */
export function Tag({ 
    text = '', 
    type = 'primary', 
    closable = false, 
    onClose = null,
    className = '' 
}) {
    const tag = createElement('span', {
        className: `tag tag-${type} ${className}`.trim(),
        textContent: text
    });

    if (closable) {
        const closeBtn = createElement('button', {
            className: 'tag-close',
            textContent: '×',
            'aria-label': '删除标签'
        });
        
        closeBtn.addEventListener('click', () => {
            tag.remove();
            if (onClose) onClose();
        });
        
        tag.appendChild(closeBtn);
    }

    return tag;
}

/**
 * 加载指示器组件
 * @param {Object} options - 加载配置
 * @param {string} options.size - 大小：sm, md, lg
 * @param {string} options.text - 加载文本
 * @returns {HTMLElement} 加载元素
 */
export function Loading({ 
    size = 'md', 
    text = '加载中...',
    className = '' 
}) {
    const loading = createElement('div', {
        className: `loading loading-${size} ${className}`.trim(),
        role: 'status',
        'aria-label': text
    });

    const spinner = createElement('div', { className: 'loading-spinner' });
    loading.appendChild(spinner);

    if (text) {
        const textEl = createElement('div', { 
            className: 'loading-text',
            textContent: text 
        });
        loading.appendChild(textEl);
    }

    return loading;
}