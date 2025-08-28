/**
 * 朋友圈视图层
 */

import { getMomentsPaginated, publishMoment, addComment, getComments, toggleReaction, getMomentStats } from './store.js';
import { addEventListener, byId } from '../../utils/dom.js';
import { showToast, showError } from '../../utils/notify.js';
import { escapeHtml } from '../../utils/security.js'; // 🔒 安全修复：导入HTML转义函数

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

    // 事件委托：点赞与评论
    const list = document.getElementById('moments-list');
    if (list) {
        addEventListener(list, 'click', async (event) => {
            const likeBtn = event.target.closest('[data-action="like"]');
            const commentBtn = event.target.closest('[data-action="comment"]');
            const submitBtn = event.target.closest('[data-action="submit-comment"]');
            const item = event.target.closest('.moment-item');
            const momentId = item?.dataset?.momentId;
            if (!momentId) return;

            if (likeBtn) {
                await toggleReaction(momentId, 'user', 'like');
                await refreshMomentStats(momentId, item);
            }
            if (commentBtn) {
                const input = item.querySelector('.comment-input');
                if (input) input.focus();
            }
            if (submitBtn) {
                const input = item.querySelector('.comment-input');
                const content = input?.value?.trim();
                if (content) {
                    await addComment(momentId, content, 'user');
                    input.value = '';
                    await renderComments(momentId, item);
                    await refreshMomentStats(momentId, item);
                }
            }
        });
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
        const visibility = document.querySelector('input[name="moment-visibility"]:checked')?.value || 'private';
        const result = await publishMoment({
            content,
            visibility,
            image: null
        });
        
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
        <div class="moment-item" data-moment-id="${moment.id}">
            <div class="moment-author">${moment.authorId === 'user' ? '我' : moment.authorId}</div>
            <div class="moment-content">${moment.content}</div>
            <div class="moment-time">${moment.formattedTime}</div>
            <div class="moment-actions" style="margin-top: 6px; display: flex; gap: 12px; align-items: center;">
                <button class="btn btn-light" data-action="like">👍 点赞 (<span class="likes-count">${moment.likesCount || 0}</span>)</button>
                <button class="btn btn-light" data-action="comment">💬 评论 (<span class="comments-count">${moment.commentsCount || 0}</span>)</button>
            </div>
            <div class="moment-comment-box" style="margin-top: 8px; display: flex; gap: 8px;">
                <input class="comment-input" placeholder="写下你的评论..." style="flex: 1; padding: 6px 8px;" />
                <button class="btn btn-primary" data-action="submit-comment">发送</button>
            </div>
            <div class="moment-comments" style="margin-top: 8px;"></div>
        </div>
    `).join('');
    
    momentsList.innerHTML = momentItems;

    // 初始加载每条动态的前几条评论
    moments.forEach(async m => {
        const item = document.querySelector(`.moment-item[data-moment-id="${m.id}"]`);
        if (item) {
            await renderComments(m.id, item);
        }
    });
}

async function renderComments(momentId, itemEl) {
    const container = itemEl.querySelector('.moment-comments');
    if (!container) return;
    const { comments } = await getComments(momentId, 1, 3);
    if (!comments.length) {
        container.innerHTML = '';
        return;
    }
    // 🔒 安全修复：对评论内容进行HTML转义
    container.innerHTML = comments.map(c => `
        <div class="comment-item">
            <span class="comment-author">${escapeHtml(c.authorId)}：</span>
            <span class="comment-content">${escapeHtml(c.content)}</span>
        </div>
    `).join('');
}

async function refreshMomentStats(momentId, itemEl) {
    const stats = await getMomentStats(momentId);
    const likes = itemEl.querySelector('.likes-count');
    const comments = itemEl.querySelector('.comments-count');
    if (likes) likes.textContent = stats.likes;
    if (comments) comments.textContent = stats.comments;
}