/**
 * 记忆管理视图层
 */

import { getMemoryStats, getMemoriesPaginated } from './store.js';
import { addEventListener } from '../../utils/dom.js';

let currentMemoryId = null;

/**
 * 初始化记忆管理视图
 */
export function initializeMemoryView() {
    bindEvents();
    console.log('Memory view initialized');
}

/**
 * 绑定事件处理器
 */
function bindEvents() {
    // 使用全局导航系统处理模态框关闭
    // data-close-modal 和 data-action 已经通过全局系统处理
    
    // 记忆详情模态框内的操作按钮
    const memoryDetailModal = document.getElementById('memory-detail-modal');
    if (memoryDetailModal) {
        addEventListener(memoryDetailModal, 'click', (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            
            const action = button.dataset.action;
            
            switch (action) {
                case 'close-memory-detail':
                    closeMemoryDetail();
                    break;
                case 'delete-memory':
                    deleteMemory();
                    break;
                default:
                    console.warn('Unknown memory action:', action);
            }
        });
    }
}

/**
 * 关闭记忆详情模态框
 */
function closeMemoryDetail() {
    const modal = document.getElementById('memory-detail-modal');
    if (modal) {
        modal.style.display = 'none';
        currentMemoryId = null;
    }
}

/**
 * 删除记忆
 */
async function deleteMemory() {
    if (!currentMemoryId) return;
    
    if (confirm('确定要删除这条记忆吗？此操作无法撤销。')) {
        try {
            // TODO: 实现删除记忆的功能
            console.log('Delete memory:', currentMemoryId);
            closeMemoryDetail();
            
            // 重新渲染记忆列表
            await renderMemoryManagementScreen();
            
        } catch (error) {
            console.error('Failed to delete memory:', error);
        }
    }
}

export async function renderMemoryManagementScreen() {
    console.log('Rendering memory management screen...');
    
    try {
        const stats = await getMemoryStats();
        const memoriesData = await getMemoriesPaginated(1, 20);
        
        // 更新统计显示
        updateMemoryStats(stats);
        
        // 渲染记忆列表
        renderMemoryList(memoriesData.memories);
        
        console.log('Memory management screen rendered');
    } catch (error) {
        console.error('Failed to render memory management screen:', error);
    }
}

function updateMemoryStats(stats) {
    const elements = {
        total: document.getElementById('total-memories-count'),
        high: document.getElementById('high-importance-count'),
        recent: document.getElementById('recent-memories-count'),
        storage: document.getElementById('memory-storage-usage')
    };
    
    if (elements.total) elements.total.textContent = stats.total;
    if (elements.high) elements.high.textContent = stats.high;
    if (elements.recent) elements.recent.textContent = stats.recent;
    if (elements.storage) elements.storage.textContent = stats.storage;
}

function renderMemoryList(memories) {
    const memoryList = document.getElementById('memory-list');
    if (!memoryList) return;
    
    if (memories.length === 0) {
        memoryList.innerHTML = '<div class="no-memories">暂无记忆数据</div>';
        return;
    }
    
    const memoryItems = memories.map(memory => `
        <div class="memory-item ${memory.importanceLevel}">
            <div class="memory-header">
                <span class="memory-type">${getTypeLabel(memory.type)}</span>
                <span class="memory-time">${memory.formattedCreatedAt}</span>
            </div>
            <div class="memory-content">${memory.content}</div>
            <div class="memory-importance">
                重要性: ${(memory.importance * 100).toFixed(1)}%
            </div>
        </div>
    `).join('');
    
    memoryList.innerHTML = memoryItems;
}

function getTypeLabel(type) {
    const typeMap = {
        episodic: '对话记忆',
        semantic: '语义记忆',
        social: '社交记忆'
    };
    return typeMap[type] || type;
}