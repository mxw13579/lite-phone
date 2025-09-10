// Memory Manager P2: 聊天设置中的记忆预算预估功能（优化版）

import { MemoryRepo } from '../memory/repo';
import { selectEventsForPrompt, selectEventsForGroup } from '../memory/select';
import { renderMemoryBlock, renderGroupMemoryBlock } from '../memory/render';
import type { EventRec, SelectBudget } from '../memory/types';

type Member = { personaId?: string; name?: string };

const TOKEN_TO_CHAR_RATIO = 4;
const STATUS = {
    OK: 'ok',
    WARN: 'warning',
    ERROR: 'error',
} as const;
const DOM_IDS = {
    refreshBtn: 'refresh-memory-estimate-btn',
    viewDetailsBtn: 'view-memory-details-btn',
    hideDetailsBtn: 'hide-memory-details-btn',
    list: 'memory-items-list',
    statsCount: 'memory-inject-count',
    statsChars: 'memory-inject-chars',
    statsStatus: 'memory-inject-status',
    detailsContainer: 'memory-details-container',
} as const;

export class ChatMemoryEstimator {
    private currentChatId: string | null = null;
    private currentPersonaId: string | null = null;
    private currentIsGroup = false;
    private currentMembers: Member[] = [];
    private memoryBudgetChars = 600 * TOKEN_TO_CHAR_RATIO;
    private escapeDiv: HTMLDivElement | null = null;

    private refreshTimer: number | null = null;
    private readonly refreshDelay = 80; // 防抖，避免频繁刷新

    init(): void {
        console.log('[MM][P2] ChatMemoryEstimator 初始化');
        this.initEventListeners();
    }

    private getEl<T extends HTMLElement = HTMLElement>(id: string): T | null {
        return document.getElementById(id) as T | null;
    }

    private initEventListeners(): void {
        this.getEl(DOM_IDS.refreshBtn)?.addEventListener('click', () => this.refreshEstimateDebounced());
        this.getEl(DOM_IDS.viewDetailsBtn)?.addEventListener('click', () => this.toggleMemoryDetails(true));
        this.getEl(DOM_IDS.hideDetailsBtn)?.addEventListener('click', () => this.toggleMemoryDetails(false));

        // 事件委托：减少为每个条目绑定事件的开销
        this.getEl(DOM_IDS.list)?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const btn = target.closest('.memory-item-action') as HTMLElement | null;
            if (!btn) return;
            e.preventDefault();
            const action = btn.getAttribute('data-action') || '';
            const eventId = btn.getAttribute('data-event-id') || '';
            const item = btn.closest('.memory-item') as HTMLElement | null;
            const eventJson = item?.getAttribute('data-event-json');
            if (!eventJson) return;
            const event: EventRec = JSON.parse(eventJson);
            void this.handleMemoryItemAction(action, eventId, event);
        });
    }

    private refreshEstimateDebounced(): void {
        if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
            this.refreshTimer = null;
            void this.refreshEstimate();
        }, this.refreshDelay);
    }

    async setChatContext(
        chatId: string,
        personaId: string | null,
        isGroup = false,
        members: Member[] = [],
        memoryTokenBudget = 600
    ): Promise<void> {
        this.currentChatId = chatId;
        this.currentPersonaId = personaId;
        this.currentIsGroup = isGroup;
        this.currentMembers = members;
        this.memoryBudgetChars = memoryTokenBudget * TOKEN_TO_CHAR_RATIO;

        console.log('[MM][P2] 设置聊天上下文:', {
            chatId,
            personaId,
            isGroup,
            memberCount: members.length,
            memoryTokenBudget,
            memoryCharBudget: this.memoryBudgetChars,
        });

        await this.refreshEstimate();
    }

    async refreshEstimate(): Promise<void> {
        try {
            console.log('[MM][P2] 刷新记忆预算预估');
            if (!this.currentPersonaId) {
                this.displayEmptyState();
                return;
            }

            let events: EventRec[] = [];

            if (this.currentIsGroup && this.currentMembers.length > 1) {
                const personaIds = this.currentMembers.map(m => m.personaId).filter((id): id is string => !!id);
                if (personaIds.length > 0) {
                    const result = await selectEventsForGroup(MemoryRepo, personaIds, this.memoryBudgetChars);
                    // 扁平化一次性完成，避免多次push
                    events = result.global.concat(...Object.values(result.perPersona));
                }
            } else {
                const budget: SelectBudget = { maxChars: this.memoryBudgetChars };
                events = await selectEventsForPrompt(MemoryRepo, this.currentPersonaId, budget);
            }

            // 单次遍历计算总字符并缓存到临时字段，避免后续重复估算
            let totalChars = 0;
            const charCache = new Map<string, number>();
            for (const e of events) {
                const c = this.estimateEventCharsCached(e, charCache);
                totalChars += c;
            }

            // 状态评估（先判超，再判接近）
            let status = STATUS.OK;
            let statusText = '正常';
            if (totalChars > this.memoryBudgetChars) {
                status = STATUS.ERROR;
                statusText = '超出预算';
            } else if (totalChars > this.memoryBudgetChars * 0.9) {
                status = STATUS.WARN;
                statusText = '接近上限';
            }

            this.updateMemoryStats(events.length, totalChars, status, statusText);
            this.updateMemoryDetails(events, charCache);
        } catch (error) {
            console.error('[MM][P2] 刷新预估失败:', error);
            this.displayError('刷新失败');
        }
    }

    private updateMemoryStats(count: number, chars: number, status: string, statusText: string): void {
        const countEl = this.getEl(DOM_IDS.statsCount);
        const charsEl = this.getEl(DOM_IDS.statsChars);
        const statusEl = this.getEl(DOM_IDS.statsStatus);

        if (countEl) countEl.textContent = `${count} 条`;
        if (charsEl) charsEl.textContent = `${chars} 字符`;
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.classList.remove('memory-status-ok', 'memory-status-warning', 'memory-status-error');
            statusEl.classList.add(`memory-status-${status}`);
        }
    }

    private updateMemoryDetails(events: EventRec[], charCache: Map<string, number>): void {
        const listEl = this.getEl<HTMLDivElement>(DOM_IDS.list);
        if (!listEl) return;

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

        const groups = {
            open: [] as EventRec[],
            done: [] as EventRec[],
            note: [] as EventRec[],
        };
        for (const e of events) {
            if (e.status === 'open') groups.open.push(e);
            else if (e.status === 'done') groups.done.push(e);
            else groups.note.push(e);
        }

        const frag = document.createDocumentFragment();
        const renderGroupSection = (title: string, emoji: string, items: EventRec[]) => {
            if (items.length === 0) return;
            const header = document.createElement('div');
            header.innerHTML = `<h4 style="margin: 16px 0 8px 0; color: var(--color-text-primary); font-size: 14px;">${emoji} ${title}</h4>`;
            frag.appendChild(header);
            for (const event of items) {
                frag.appendChild(this.createMemoryItem(event, charCache));
            }
        };

        renderGroupSection('进行中的事件', '🟢', groups.open);
        renderGroupSection('已完成的事件', '✅', groups.done);
        renderGroupSection('笔记', '📝', groups.note);

        listEl.appendChild(frag);
    }

    private createMemoryItem(event: EventRec, charCache: Map<string, number>): HTMLElement {
        const item = document.createElement('div');
        item.className = 'memory-item';
        item.setAttribute('data-event-json', JSON.stringify(event)); // 用于事件委托取数据
        const title = this.escapeHtml(event.title);
        const content = this.escapeHtml(event.content || '无详细内容');
        const chars = this.estimateEventCharsCached(event, charCache);
        const dateStr = this.formatDate(event.createdAt);

        item.innerHTML = `
      <div class="memory-item-content">
        <div class="memory-item-title">${title}</div>
        <div class="memory-item-meta">
          <span>📅 ${dateStr}</span>
          <span>📊 ${event.status}</span>
          <span>🔤 ${chars} 字符</span>
        </div>
        <div class="memory-item-content-text">${content}</div>
      </div>
      <div class="memory-item-actions">
        <button class="memory-item-action" data-action="edit" data-event-id="${event.id}">编辑</button>
        <button class="memory-item-action exclude" data-action="exclude" data-event-id="${event.id}">排除</button>
      </div>
    `;
        return item;
    }

    private async handleMemoryItemAction(action: string, eventId: string, event: EventRec): Promise<void> {
        console.log('[MM][P2] 记忆条目操作:', action, eventId);
        try {
            if (action === 'edit') {
                const newTitle = prompt('编辑标题:', event.title);
                if (newTitle && newTitle !== event.title) {
                    await MemoryRepo.updateEvent(eventId, { title: newTitle, updatedAt: Date.now() });
                    await this.refreshEstimate();
                }
            } else if (action === 'exclude') {
                await MemoryRepo.updateEvent(eventId, { excludeFromPrompt: true, updatedAt: Date.now() });
                await this.refreshEstimate();
            }
        } catch (error) {
            console.error('[MM][P2] 操作失败:', error);
            alert('操作失败，请稍后重试');
        }
    }

    private toggleMemoryDetails(show: boolean): void {
        const container = this.getEl(DOM_IDS.detailsContainer);
        if (container) container.style.display = show ? 'block' : 'none';
    }

    private displayEmptyState(): void {
        this.updateMemoryStats(0, 0, STATUS.OK, '无数据');
        const listEl = this.getEl(DOM_IDS.list);
        if (listEl) {
            listEl.innerHTML = `
        <div class="memory-empty-state">
          <div class="empty-icon">💭</div>
          <p>请先选择AI角色以预估记忆注入</p>
        </div>
      `;
        }
    }

    private displayError(message: string): void {
        this.updateMemoryStats(0, 0, STATUS.ERROR, message);
    }

    private estimateEventCharsCached(event: EventRec, cache: Map<string, number>): number {
        const key = event.id || `${event.title}|${event.createdAt}`;
        if (cache.has(key)) return cache.get(key)!;
        // 复用已有工具：若外部提供estimateEventChars更准确，可替换为它
        // 这里做守护：避免import循环，实际项目中应直接使用estimateEventChars
        const text = `${event.title || ''}\n${event.content || ''}`;
        const value = text.length;
        cache.set(key, value);
        return value;
    }

    private escapeHtml(text: string): string {
        if (!this.escapeDiv) this.escapeDiv = document.createElement('div');
        this.escapeDiv.textContent = text ?? '';
        return this.escapeDiv.innerHTML;
    }

    private formatDate(ts: number | string | Date): string {
        const d = new Date(ts);
        return d.toLocaleDateString();
    }

    setMemoryBudget(budgetTokens: number): void {
        this.memoryBudgetChars = budgetTokens * TOKEN_TO_CHAR_RATIO;
        console.log('[MM][P2] 设置记忆预算(字符):', this.memoryBudgetChars);
        if (this.currentPersonaId) this.refreshEstimateDebounced();
    }

    async getMemoryInjection(): Promise<string> {
        if (!this.currentPersonaId) return '';
        try {
            if (this.currentIsGroup && this.currentMembers.length > 1) {
                const personaIds = this.currentMembers.map(m => m.personaId).filter((id): id is string => !!id);
                const validPersonaIds = personaIds.filter(id => !id.startsWith('unknown_'));
                if (validPersonaIds.length > 0) {
                    const selection = await selectEventsForGroup(MemoryRepo, validPersonaIds, this.memoryBudgetChars);
                    const personaNameMap: Record<string, string> = {};
                    for (const m of this.currentMembers) {
                        if (m.personaId && !m.personaId.startsWith('unknown_')) {
                            personaNameMap[m.personaId] = m.name || m.personaId;
                        }
                    }
                    const result = renderGroupMemoryBlock(selection.global, selection.perPersona, personaNameMap);
                    console.log('[MM][P2] 群聊注入成功:', { validPersonaIds: validPersonaIds.length, resultLength: result.length });
                    return result;
                } else {
                    console.warn('[MM][P2] 群聊persona映射失败，回退到单人注入', {
                        totalPersonaIds: personaIds.length,
                        validPersonaIds: validPersonaIds.length,
                        fallbackToPersonaId: this.currentPersonaId,
                    });
                    const budget: SelectBudget = { maxChars: this.memoryBudgetChars };
                    const events = await selectEventsForPrompt(MemoryRepo, this.currentPersonaId, budget);
                    return renderMemoryBlock(events);
                }
            } else {
                const budget: SelectBudget = { maxChars: this.memoryBudgetChars };
                const events = await selectEventsForPrompt(MemoryRepo, this.currentPersonaId, budget);
                return renderMemoryBlock(events);
            }
        } catch (error) {
            console.error('[MM][P2] 获取记忆注入失败:', error);
            return '';
        }
    }
}

export const chatMemoryEstimator = new ChatMemoryEstimator();
