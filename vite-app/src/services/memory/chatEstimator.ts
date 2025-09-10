// Memory Manager P2: 聊天设置中的记忆预算预估功能
// 为P1实现的Memory Manager添加UI界面

import { MemoryRepo } from '../memory/repo';
import { selectEventsForPrompt, selectEventsForGroup, allocateBudget, estimateChars, estimateTokensRough, estimateEventChars } from '../memory/select';
import { renderMemoryBlock, renderGroupMemoryBlock } from '../memory/render';
import type { EventRec, SelectBudget } from '../memory/types';

export class ChatMemoryEstimator {
    private currentChatId: string | null = null;
    private currentPersonaId: string | null = null;
    private currentIsGroup: boolean = false;
    private currentMembers: any[] = [];
    private memoryBudget: number = 600 * 4; // 默认600 token = 2400字符

    // 初始化聊天记忆预估功能
    init(): void {
        console.log('[MM][P2] ChatMemoryEstimator 初始化');
        this.initEventListeners();
    }

    // 初始化事件监听器
    private initEventListeners(): void {
        // 刷新预估按钮
        document.getElementById('refresh-memory-estimate-btn')?.addEventListener('click', () => {
            this.refreshEstimate();
        });

        // 查看详情按钮
        document.getElementById('view-memory-details-btn')?.addEventListener('click', () => {
            this.toggleMemoryDetails(true);
        });

        // 隐藏详情按钮
        document.getElementById('hide-memory-details-btn')?.addEventListener('click', () => {
            this.toggleMemoryDetails(false);
        });
    }

    // 设置当前聊天上下文
    async setChatContext(
        chatId: string, 
        personaId: string | null, 
        isGroup: boolean = false, 
        members: any[] = [],
        memoryTokenBudget: number = 600  // 新增参数：记忆token预算
    ): Promise<void> {
        this.currentChatId = chatId;
        this.currentPersonaId = personaId;
        this.currentIsGroup = isGroup;
        this.currentMembers = members;
        this.memoryBudget = memoryTokenBudget * 4; // token转换为字符数
        
        console.log('[MM][P2] 设置聊天上下文:', { 
            chatId, 
            personaId, 
            isGroup, 
            memberCount: members.length,
            memoryTokenBudget,
            memoryCharBudget: this.memoryBudget
        });
        
        // 自动刷新预估
        await this.refreshEstimate();
    }

    // 刷新记忆预算预估
    async refreshEstimate(): Promise<void> {
        try {
            console.log('[MM][P2] 刷新记忆预算预估');
            
            if (!this.currentPersonaId) {
                this.displayEmptyState();
                return;
            }

            let events: EventRec[] = [];
            let totalChars = 0;
            let status = 'ok';
            let statusText = '正常';

            if (this.currentIsGroup && this.currentMembers.length > 1) {
                // 群聊模式：使用群聊选择算法
                const personaIds = this.currentMembers.map(m => m.personaId).filter(Boolean);
                if (personaIds.length > 0) {
                    const result = await selectEventsForGroup(MemoryRepo, personaIds, this.memoryBudget);
                    events = [...result.global];
                    for (const personaEvents of Object.values(result.perPersona)) {
                        events.push(...personaEvents);
                    }
                }
            } else {
                // 单聊模式：使用单人选择算法
                const budget: SelectBudget = { maxChars: this.memoryBudget };
                events = await selectEventsForPrompt(MemoryRepo, this.currentPersonaId, budget);
            }

            // 计算总字符数
            totalChars = events.reduce((sum, event) => sum + estimateEventChars(event), 0);

            // 状态评估
            if (totalChars > this.memoryBudget * 0.9) {
                status = 'warning';
                statusText = '接近上限';
            } else if (totalChars > this.memoryBudget) {
                status = 'error';
                statusText = '超出预算';
            }

            // 更新显示
            this.updateMemoryStats(events.length, totalChars, status, statusText);
            this.updateMemoryDetails(events);

        } catch (error) {
            console.error('[MM][P2] 刷新预估失败:', error);
            this.displayError('刷新失败');
        }
    }

    // 更新记忆统计显示
    private updateMemoryStats(count: number, chars: number, status: string, statusText: string): void {
        const countEl = document.getElementById('memory-inject-count');
        const charsEl = document.getElementById('memory-inject-chars');
        const statusEl = document.getElementById('memory-inject-status');

        if (countEl) countEl.textContent = `${count} 条`;
        if (charsEl) charsEl.textContent = `${chars} 字符`;
        
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.className = `memory-status-${status}`;
        }
    }

    // 更新记忆详情显示
    private updateMemoryDetails(events: EventRec[]): void {
        const listEl = document.getElementById('memory-items-list');
        if (!listEl) return;

        // 清空现有内容
        listEl.innerHTML = '';

        if (events.length === 0) {
            listEl.innerHTML = `
                <div class="memory-empty-state">
                    <div class="empty-icon">📝</div>
                    <p>当前没有需要注入的记忆内容</p>
                </div>
            `;
            return;
        }

        // 按状态分组显示
        const groups = {
            open: events.filter(e => e.status === 'open'),
            done: events.filter(e => e.status === 'done'),
            note: events.filter(e => e.status === 'note')
        };

        const createMemoryItem = (event: EventRec): HTMLElement => {
            const item = document.createElement('div');
            item.className = 'memory-item';
            item.innerHTML = `
                <div class="memory-item-content">
                    <div class="memory-item-title">${this.escapeHtml(event.title)}</div>
                    <div class="memory-item-meta">
                        <span>📅 ${new Date(event.createdAt).toLocaleDateString()}</span>
                        <span>📊 ${event.status}</span>
                        <span>🔤 ${estimateEventChars(event)} 字符</span>
                    </div>
                    <div class="memory-item-content-text">${this.escapeHtml(event.content || '无详细内容')}</div>
                </div>
                <div class="memory-item-actions">
                    <button class="memory-item-action" data-action="edit" data-event-id="${event.id}">编辑</button>
                    <button class="memory-item-action exclude" data-action="exclude" data-event-id="${event.id}">排除</button>
                </div>
            `;

            // 添加动作事件监听器
            const actions = item.querySelectorAll('.memory-item-action');
            actions.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const action = btn.getAttribute('data-action');
                    const eventId = btn.getAttribute('data-event-id');
                    this.handleMemoryItemAction(action!, eventId!, event);
                });
            });

            return item;
        };

        // 渲染各个分组
        if (groups.open.length > 0) {
            const header = document.createElement('div');
            header.innerHTML = '<h4 style="margin: 0 0 8px 0; color: var(--color-text-primary); font-size: 14px;">🟢 进行中的事件</h4>';
            listEl.appendChild(header);
            groups.open.forEach(event => listEl.appendChild(createMemoryItem(event)));
        }

        if (groups.done.length > 0) {
            const header = document.createElement('div');
            header.innerHTML = '<h4 style="margin: 16px 0 8px 0; color: var(--color-text-primary); font-size: 14px;">✅ 已完成的事件</h4>';
            listEl.appendChild(header);
            groups.done.forEach(event => listEl.appendChild(createMemoryItem(event)));
        }

        if (groups.note.length > 0) {
            const header = document.createElement('div');
            header.innerHTML = '<h4 style="margin: 16px 0 8px 0; color: var(--color-text-primary); font-size: 14px;">📝 笔记</h4>';
            listEl.appendChild(header);
            groups.note.forEach(event => listEl.appendChild(createMemoryItem(event)));
        }
    }

    // 处理记忆条目操作
    private async handleMemoryItemAction(action: string, eventId: string, event: EventRec): Promise<void> {
        console.log('[MM][P2] 记忆条目操作:', action, eventId);

        switch (action) {
            case 'edit':
                // 打开编辑对话框（暂时用简单提示）
                const newTitle = prompt('编辑标题:', event.title);
                if (newTitle && newTitle !== event.title) {
                    try {
                        await MemoryRepo.updateEvent(eventId, { title: newTitle, updatedAt: Date.now() });
                        await this.refreshEstimate();
                    } catch (error) {
                        console.error('[MM][P2] 更新事件失败:', error);
                        alert('更新失败，请稍后重试');
                    }
                }
                break;

            case 'exclude':
                // 临时排除此次注入
                try {
                    await MemoryRepo.updateEvent(eventId, { excludeFromPrompt: true, updatedAt: Date.now() });
                    await this.refreshEstimate();
                } catch (error) {
                    console.error('[MM][P2] 排除事件失败:', error);
                    alert('操作失败，请稍后重试');
                }
                break;
        }
    }

    // 切换记忆详情显示
    private toggleMemoryDetails(show: boolean): void {
        const container = document.getElementById('memory-details-container');
        if (container) {
            container.style.display = show ? 'block' : 'none';
        }
    }

    // 显示空状态
    private displayEmptyState(): void {
        this.updateMemoryStats(0, 0, 'ok', '无数据');
        const listEl = document.getElementById('memory-items-list');
        if (listEl) {
            listEl.innerHTML = `
                <div class="memory-empty-state">
                    <div class="empty-icon">💭</div>
                    <p>请先选择AI角色以预估记忆注入</p>
                </div>
            `;
        }
    }

    // 显示错误状态
    private displayError(message: string): void {
        this.updateMemoryStats(0, 0, 'error', message);
    }

    // HTML转义工具函数
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 设置记忆预算
    setMemoryBudget(budget: number): void {
        this.memoryBudget = budget;
        console.log('[MM][P2] 设置记忆预算:', budget);
        // 自动刷新预估
        if (this.currentPersonaId) {
            this.refreshEstimate();
        }
    }

    // 获取预估的记忆注入字符串（用于实际注入）
    async getMemoryInjection(): Promise<string> {
        if (!this.currentPersonaId) return '';

        try {
            let result = '';

            if (this.currentIsGroup && this.currentMembers.length > 1) {
                // 群聊模式
                const personaIds = this.currentMembers.map(m => m.personaId).filter(Boolean);
                // 过滤掉unknown_*的无效personaId
                const validPersonaIds = personaIds.filter(id => !id.startsWith('unknown_'));
                
                if (validPersonaIds.length > 0) {
                    const selection = await selectEventsForGroup(MemoryRepo, validPersonaIds, this.memoryBudget);
                    const personaNameMap: Record<string, string> = {};
                    this.currentMembers.forEach(m => {
                        if (m.personaId && !m.personaId.startsWith('unknown_')) {
                            personaNameMap[m.personaId] = m.name || m.personaId;
                        }
                    });
                    result = renderGroupMemoryBlock(selection.global, selection.perPersona, personaNameMap);
                    console.log('[MM][P2] 群聊注入成功:', { validPersonaIds: validPersonaIds.length, resultLength: result.length });
                } else {
                    // 回退到单人注入
                    console.warn('[MM][P2] 群聊persona映射失败，回退到单人注入', { 
                        totalPersonaIds: personaIds.length, 
                        validPersonaIds: validPersonaIds.length,
                        fallbackToPersonaId: this.currentPersonaId
                    });
                    const budget: SelectBudget = { maxChars: this.memoryBudget };
                    const events = await selectEventsForPrompt(MemoryRepo, this.currentPersonaId, budget);
                    result = renderMemoryBlock(events);
                }
            } else {
                // 单聊模式
                const budget: SelectBudget = { maxChars: this.memoryBudget };
                const events = await selectEventsForPrompt(MemoryRepo, this.currentPersonaId, budget);
                result = renderMemoryBlock(events);
            }

            return result;
        } catch (error) {
            console.error('[MM][P2] 获取记忆注入失败:', error);
            return '';
        }
    }
}

// 创建全局单例
export const chatMemoryEstimator = new ChatMemoryEstimator();