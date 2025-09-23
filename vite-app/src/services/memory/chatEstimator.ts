// Memory Manager P2: 聊天设置中的记忆预算预估功能（优化版）

import { MemoryRepo } from '../memory/repo';
import { selectEventsForPrompt, selectEventsForGroup } from '../memory/select';
import { renderMemoryBlock, renderGroupMemoryBlock } from '../memory/render';
import type { EventRec, SelectBudget } from '../memory/types';
import STATE from '../../state';

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
    private tempExcludedIds: Set<string> = new Set();

    private getContextForSingleChat(): { userName?: string; personaNameMap?: Record<string, string> } {
        if (!this.currentChatId || !this.currentPersonaId) {
            return {};
        }

        const chatMap = STATE.state?.chats || {} as Record<string, any>;
        const chat = chatMap[this.currentChatId];
        if (!chat) {
            return {};
        }

        const personas = STATE.state?.personas || [] as Array<{ id: string; name?: string }>;
        const personaName = personas.find(p => p.id === this.currentPersonaId)?.name || 'AI';

        return {
            userName: chat.settings?.myPersona || '用户',
            personaNameMap: { [this.currentPersonaId]: personaName }
        };
    }

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
        // 清除“仅本次排除”
        const clearBtn = this.getEl('clear-temp-excludes-btn');
        clearBtn?.addEventListener('click', () => { this.tempExcludedIds.clear(); this.refreshEstimateDebounced(); });
        // 恢复默认选择：清空临时排除并刷新
        const resetBtn = this.getEl('reset-memory-selection-btn');
        resetBtn?.addEventListener('click', () => { this.tempExcludedIds.clear(); this.refreshEstimateDebounced(); });

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
        const isSameChat = this.currentChatId === chatId;
        this.currentChatId = chatId;
        this.currentPersonaId = personaId;
        this.currentIsGroup = isGroup;
        this.currentMembers = members;
        this.memoryBudgetChars = memoryTokenBudget * TOKEN_TO_CHAR_RATIO;
        // 仅在切换聊天时清空临时排除；同一聊天保留
        if (!isSameChat) this.tempExcludedIds.clear();

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
                const validPersonaIds = personaIds.filter(id => !id.startsWith('unknown_'));
                if (validPersonaIds.length > 0) {
                    const result = await selectEventsForGroup(MemoryRepo, validPersonaIds, this.memoryBudgetChars);
                    // 扁平化一次性完成，避免多次push
                    events = result.global.concat(...Object.values(result.perPersona));
                } else {
                    console.warn('[MM][P2] 群聊persona映射失败，回退到单人模式', {
                        totalPersonaIds: personaIds.length,
                        validPersonaIds: validPersonaIds.length,
                        fallbackToPersonaId: this.currentPersonaId,
                    });
                    // 回退到单人模式
                    if (this.currentPersonaId) {
                        const budget: SelectBudget = { maxChars: this.memoryBudgetChars };
                        events = await selectEventsForPrompt(MemoryRepo, this.currentPersonaId, budget);
                    }
                }
            } else {
                const budget: SelectBudget = { maxChars: this.memoryBudgetChars };
                events = await selectEventsForPrompt(MemoryRepo, this.currentPersonaId, budget);
            }

            // 应用“仅本次排除”临时过滤
            if (this.tempExcludedIds.size > 0) {
                events = events.filter(e => !this.tempExcludedIds.has(e.id));
            }

            // 单次遍历计算总字符并缓存到临时字段，避免后续重复估算
            let totalChars = 0;
            const charCache = new Map<string, number>();
            for (const e of events) {
                const c = this.estimateEventCharsCached(e, charCache);
                totalChars += c;
            }

            // 状态评估（先判超，再判接近）
            let status: keyof typeof STATUS = 'OK';
            let statusText = '正常';
            if (totalChars > this.memoryBudgetChars) {
                status = 'ERROR';
                statusText = '超出预算';
            } else if (totalChars > this.memoryBudgetChars * 0.9) {
                status = 'WARN';
                statusText = '接近上限';
            }

            // 统计PII和过滤信息
            const piiCount = events.filter(e => e.pii === true).length;
            const excludedCount = events.filter(e => e.excludeFromPrompt === true).length;
            const compressedCount = events.filter(e => e.compressed === true).length;
            
            const filterStats = {
                piiCount,
                excludedCount,
                compressedCount
            };

            this.updateMemoryStats(events.length, totalChars, STATUS[status], statusText, filterStats);
            this.updateMemoryDetails(events, charCache);
        } catch (error) {
            console.error('[MM][P2] 刷新预估失败:', error);
            this.displayError('刷新失败');
        }
    }

    private updateMemoryStats(count: number, chars: number, status: string, statusText: string, filterStats?: { piiCount: number; excludedCount: number; compressedCount: number }): void {
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
        
        // 显示过滤统计信息
        if (filterStats) {
            this.updateFilterStats(filterStats);
        }
    }
    
    private updateFilterStats(stats: { piiCount: number; excludedCount: number; compressedCount: number }): void {
        const filterInfoEl = this.getEl('memory-filter-info');
        if (!filterInfoEl) return;

        // 清空现有内容 - 使用安全方式
        while (filterInfoEl.firstChild) {
            filterInfoEl.removeChild(filterInfoEl.firstChild);
        }

        const badges: HTMLElement[] = [];

        if (stats.piiCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'filter-badge pii-badge';
            badge.textContent = `🔒 敏感信息: ${stats.piiCount}`;
            badges.push(badge);
        }
        if (stats.excludedCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'filter-badge exclude-badge';
            badge.textContent = `🚫 已排除: ${stats.excludedCount}`;
            badges.push(badge);
        }
        if (stats.compressedCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'filter-badge compress-badge';
            badge.textContent = `📦 已压缩: ${stats.compressedCount}`;
            badges.push(badge);
        }

        if (badges.length > 0) {
            badges.forEach(badge => filterInfoEl.appendChild(badge));
        } else {
            const normalBadge = document.createElement('span');
            normalBadge.className = 'filter-badge normal';
            normalBadge.textContent = '✅ 无过滤项目';
            filterInfoEl.appendChild(normalBadge);
        }
    }

    private updateMemoryDetails(events: EventRec[], charCache: Map<string, number>): void {
        const listEl = this.getEl<HTMLDivElement>(DOM_IDS.list);
        if (!listEl) return;

        // 清空现有内容 - 使用安全方式
        while (listEl.firstChild) {
            listEl.removeChild(listEl.firstChild);
        }

        if (events.length === 0) {
            const emptyState = this.createEmptyStateElement();
            listEl.appendChild(emptyState);
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
            const header = this.createGroupHeader(emoji, title);
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

    private createEmptyStateElement(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'memory-empty-state';

        const icon = document.createElement('div');
        icon.className = 'empty-icon';
        icon.textContent = '📝';

        const text = document.createElement('p');
        text.textContent = '当前没有需要注入的记忆内容';

        container.appendChild(icon);
        container.appendChild(text);
        return container;
    }

    private createGroupHeader(emoji: string, title: string): HTMLElement {
        const header = document.createElement('div');
        const h4 = document.createElement('h4');
        h4.style.margin = '16px 0 8px 0';
        h4.style.color = 'var(--color-text-primary)';
        h4.style.fontSize = '14px';
        h4.textContent = `${emoji} ${title}`;
        header.appendChild(h4);
        return header;
    }

    private createMemoryItem(event: EventRec, charCache: Map<string, number>): HTMLElement {
        const item = document.createElement('div');
        item.className = 'memory-item';
        item.setAttribute('data-event-json', JSON.stringify(event)); // 用于事件委托取数据

        const chars = this.estimateEventCharsCached(event, charCache);
        const dateStr = this.formatDate(event.createdAt);

        // PII过滤状态检查
        const hasPII = event.pii === true;
        const isFiltered = hasPII || event.excludeFromPrompt === true;

        // 创建主内容容器
        const contentContainer = document.createElement('div');
        contentContainer.className = 'memory-item-content';

        // 创建标题
        const titleEl = document.createElement('div');
        titleEl.className = 'memory-item-title';
        titleEl.textContent = event.title;

        // 创建元数据容器
        const metaContainer = document.createElement('div');
        metaContainer.className = 'memory-item-meta';

        // 添加元数据项
        const metaItems = [
            { icon: '📅', text: dateStr },
            { icon: '📊', text: event.status },
            { icon: '🔤', text: `${chars} 字符` }
        ];

        metaItems.forEach(({ icon, text }) => {
            const span = document.createElement('span');
            span.textContent = `${icon} ${text}`;
            metaContainer.appendChild(span);
        });

        // 添加状态标签
        if (hasPII) {
            const badge = document.createElement('span');
            badge.className = 'memory-item-badge pii-badge';
            badge.title = '检测到敏感信息，已过滤处理';
            badge.textContent = '🔒 敏感信息';
            metaContainer.appendChild(badge);
        }
        if (isFiltered) {
            const badge = document.createElement('span');
            badge.className = 'memory-item-badge exclude-badge';
            badge.title = '已排除，不会注入到对话中';
            badge.textContent = '🚫 已排除';
            metaContainer.appendChild(badge);
        }
        // 临时排除徽标（仅本次注入有效）
        if (this.tempExcludedIds.has(event.id)) {
            const badge = document.createElement('span');
            badge.className = 'memory-item-badge temp-exclude-badge';
            badge.title = '临时排除：仅本次注入不包含';
            badge.textContent = '🧹 临时排除';
            metaContainer.appendChild(badge);
        }
        if (event.compressed) {
            const badge = document.createElement('span');
            badge.className = 'memory-item-badge compress-badge';
            badge.title = '已压缩，原始内容不可还原';
            badge.textContent = '📦 已压缩';
            metaContainer.appendChild(badge);
        }

        // 创建内容文本
        const contentText = document.createElement('div');
        contentText.className = 'memory-item-content-text';
        contentText.textContent = event.content || '无详细内容';

        // 创建操作按钮容器
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'memory-item-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'memory-item-action';
        editBtn.setAttribute('data-action', 'edit');
        editBtn.setAttribute('data-event-id', event.id);
        editBtn.textContent = '编辑';

        const excludeTempBtn = document.createElement('button');
        excludeTempBtn.className = 'memory-item-action exclude';
        excludeTempBtn.setAttribute('data-action', 'exclude_temp');
        excludeTempBtn.setAttribute('data-event-id', event.id);
        excludeTempBtn.textContent = '临时排除';

        const excludePermBtn = document.createElement('button');
        excludePermBtn.className = 'memory-item-action exclude';
        excludePermBtn.setAttribute('data-action', 'exclude_perm');
        excludePermBtn.setAttribute('data-event-id', event.id);
        excludePermBtn.textContent = '永久排除';

        // 组装元素
        contentContainer.appendChild(titleEl);
        contentContainer.appendChild(metaContainer);
        contentContainer.appendChild(contentText);

        actionsContainer.appendChild(editBtn);
        actionsContainer.appendChild(excludeTempBtn);
        actionsContainer.appendChild(excludePermBtn);

        item.appendChild(contentContainer);
        item.appendChild(actionsContainer);

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
            } else if (action === 'exclude_temp') {
                this.tempExcludedIds.add(eventId);
                await this.refreshEstimate();
            } else if (action === 'exclude_perm') {
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
            // 清空现有内容 - 使用安全方式
            while (listEl.firstChild) {
                listEl.removeChild(listEl.firstChild);
            }
            const emptyState = this.createEmptyStateElementForNoPersona();
            listEl.appendChild(emptyState);
        }
    }

    private createEmptyStateElementForNoPersona(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'memory-empty-state';

        const icon = document.createElement('div');
        icon.className = 'empty-icon';
        icon.textContent = '💭';

        const text = document.createElement('p');
        text.textContent = '请先选择AI角色以预估记忆注入';

        container.appendChild(icon);
        container.appendChild(text);
        return container;
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
            // 发送前提示：临时排除数量与预算接近度
            const tempExcludedCount = this.tempExcludedIds.size;
            if (tempExcludedCount > 0) {
                console.log('[MM][P2][inject-info] 本次注入已临时排除条目:', tempExcludedCount);
            }
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
                    // 应用临时排除：过滤 global 和 perPersona
                    const filteredGlobal = selection.global.filter(e => !this.tempExcludedIds.has(e.id));
                    const filteredPerPersona: Record<string, EventRec[]> = {};
                    Object.entries(selection.perPersona).forEach(([pid, list]) => {
                        filteredPerPersona[pid] = list.filter(e => !this.tempExcludedIds.has(e.id));
                    });
                    const result = renderGroupMemoryBlock(filteredGlobal, filteredPerPersona, true, personaNameMap);
                    console.log('[MM][P2] 群聊注入成功:', { validPersonaIds: validPersonaIds.length, resultLength: result.length });
                    return result;
                } else {
                    console.warn('[MM][P2] 群聊persona映射失败，回退到单人注入', {
                        totalPersonaIds: personaIds.length,
                        validPersonaIds: validPersonaIds.length,
                        fallbackToPersonaId: this.currentPersonaId,
                    });
                    const budget: SelectBudget = { maxChars: this.memoryBudgetChars };
                    let events = await selectEventsForPrompt(MemoryRepo, this.currentPersonaId, budget);
                    events = events.filter(e => !this.tempExcludedIds.has(e.id));
                    const context = this.getContextForSingleChat();
                    const text = renderMemoryBlock(events, true, context);
                    console.log('[MM][P2] 单人回退注入长度:', text.length);
                    return text;
                }
            } else {
                const budget: SelectBudget = { maxChars: this.memoryBudgetChars };
                let events = await selectEventsForPrompt(MemoryRepo, this.currentPersonaId, budget);
                events = events.filter(e => !this.tempExcludedIds.has(e.id));
                const context = this.getContextForSingleChat();
                const text = renderMemoryBlock(events, true, context);
                // 简单提示：接近预算的阈值
                const nearThreshold = Math.floor(this.memoryBudgetChars * 0.9);
                if (text.length >= nearThreshold) {
                    console.log('[MM][P2][inject-info] 注入内容接近预算上限:', { length: text.length, budget: this.memoryBudgetChars });
                }
                return text;
            }
        } catch (error) {
            console.error('[MM][P2] 获取记忆注入失败:', error);
            return '';
        }
    }
}

export const chatMemoryEstimator = new ChatMemoryEstimator();
