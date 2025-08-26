/**
 * 全局导航事件处理模块
 * 统一处理页面中的导航和通用UI交互
 * 
 * 注意：屏幕导航现在由router.js统一处理，支持data-route和data-nav-screen
 */

import { addEventListener } from './dom.js';

/**
 * 初始化全局导航事件处理
 */
export function initializeGlobalNavigation() {
    // 使用事件委托处理非路由相关的UI交互
    document.addEventListener('click', (event) => {
        const target = event.target;
        
        // 处理文件上传触发按钮
        const uploadTrigger = target.closest('[data-upload-trigger]');
        if (uploadTrigger) {
            const targetInputId = uploadTrigger.dataset.uploadTrigger;
            const fileInput = document.getElementById(targetInputId);
            if (fileInput) {
                fileInput.click();
            }
            return;
        }
        
        // 处理模态框关闭按钮
        const closeBtn = target.closest('[data-close-modal]');
        if (closeBtn) {
            const modalId = closeBtn.dataset.closeModal;
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = 'none';
            }
            return;
        }
    });
    
    console.log('Global navigation initialized (screen navigation handled by router)');
}