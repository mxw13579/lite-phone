/**
 * 朋友圈视图层
 */

import { getMomentsPaginated, publishMoment } from './store.js';
import { addEventListener, byId } from '../../utils/dom.js';
import { showToast, showError } from '../../utils/notify.js';

let elements = {};

/**
 * 初始化朋友圈视图
 */
export function initializeMomentsView() {
    cacheElements();
    bindEvents();
    console.log('Moments view initialized');
}

/**
 * 缓存页面元素
 */
function cacheElements() {
    elements = {
        postMomentModal: byId('post-moment-modal'),
        momentContent: byId('moment-content'),
        momentImageInput: byId('moment-image-input'),
        momentImagePreview: byId('moment-image-preview')
    };
}

/**
 * 绑定事件处理器
 */
function bindEvents() {
    // 发布朋友圈模态框事件
    if (elements.postMomentModal) {
        addEventListener(elements.postMomentModal, 'click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            
            const action = button.dataset.action;
            
            switch (action) {
                case 'close-post-moment':
                    closePostMomentModal();
                    break;
                case 'publish-moment':
                    handlePublishMoment();
                    break;
                default:
                    console.warn('Unknown moment action:', action);
            }
        });
    }
    
    // 图片上传区域点击事件（已通过全局导航系统处理）
    // 图片上传文件变化事件
    if (elements.momentImageInput) {
        addEventListener(elements.momentImageInput, 'change', handleImageUpload);
    }
}

/**
 * 关闭发布朋友圈模态框
 */
function closePostMomentModal() {
    if (elements.postMomentModal) {
        elements.postMomentModal.style.display = 'none';
        clearMomentForm();
    }
}

/**
 * 清空朋友圈表单
 */
function clearMomentForm() {
    if (elements.momentContent) elements.momentContent.value = '';
    if (elements.momentImagePreview) {
        elements.momentImagePreview.innerHTML = '<span class="upload-hint">点击添加图片</span>';
    }
    if (elements.momentImageInput) elements.momentImageInput.value = '';
}

/**
 * 处理图片上传
 */
function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        if (elements.momentImagePreview) {
            elements.momentImagePreview.innerHTML = `<img src="${e.target.result}" alt="预览图片" style="max-width: 100%; max-height: 200px; object-fit: cover;">`;
        }
    };
    reader.readAsDataURL(file);
}

/**
 * 处理发布朋友圈
 */
async function handlePublishMoment() {
    if (!elements.momentContent) return;
    
    const content = elements.momentContent.value.trim();
    if (!content) {
        showError('请输入动态内容');
        return;
    }
    
    try {
        const momentData = {
            content,
            visibility: document.querySelector('input[name="moment-visibility"]:checked')?.value || 'user_only',
            image: null // TODO: 处理图片上传
        };
        
        const result = await publishMoment(momentData);
        
        if (result.success) {
            showToast('朋友圈发布成功', 'success');
            closePostMomentModal();
            await renderMomentsScreen(); // 刷新列表
        } else {
            showError(result.error);
        }
        
    } catch (error) {
        console.error('Failed to publish moment:', error);
        showError('发布朋友圈失败');
    }
}

export async function renderMomentsScreen() {
    console.log('Rendering moments screen...');
    
    try {
        const momentsData = await getMomentsPaginated(1, 10);
        renderMomentsList(momentsData.moments);
        
        console.log('Moments screen rendered');
    } catch (error) {
        console.error('Failed to render moments screen:', error);
    }
}

function renderMomentsList(moments) {
    const momentsList = document.getElementById('moments-list');
    if (!momentsList) return;
    
    if (moments.length === 0) {
        momentsList.innerHTML = '<div class="no-moments">还没有发布任何朋友圈</div>';
        return;
    }
    
    const momentItems = moments.map(moment => `
        <div class="moment-item">
            <div class="moment-author">${moment.authorId === 'user' ? '我' : moment.authorId}</div>
            <div class="moment-content">${moment.content}</div>
            <div class="moment-time">${moment.formattedTime}</div>
        </div>
    `).join('');
    
    momentsList.innerHTML = momentItems;
}