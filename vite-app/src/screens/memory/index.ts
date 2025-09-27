// Memory Management Screen Module
// 记忆管理面板 - 树状显示、批量操作、状态筛选

import type { EventRec, EventStatus, PersonaMemorySettings } from '../../services/memory/types';
import { MemoryRepo } from '../../services/memory/repo';
import { renderEventPreview, getEventDisplayText } from '../../services/memory/render';
import { compressOldEvents, selectCompressionCandidates, previewCompress } from '../../services/memory/mcp';
import { PersonaService } from '../personaCenter/services/PersonaService';
import STATE from '../../state';
import DB from '../../database';
import { downloadJsonAs } from '../../services/utils/download';

export interface MemoryScreenOptions {
    personaId?: string;         // 指定角色，为空时显示所有
    initialFilter?: EventStatus; // 初始状态筛选
    allowBatchOperations?: boolean; // 是否启用批量操作
}

export class MemoryScreenModule {
    private currentPersonaId: string | null = null;
    private currentFilter: EventStatus | 'all' = 'all';
    private selectedEventIds: Set<string> = new Set();
    private events: EventRec[] = [];
    private personas: any[] = []; // 缓存的角色列表
    private personaService: PersonaService; // 角色服务实例

    // 缓存DOM元素
    private screenEl: HTMLElement | null = null;
    private toolbarEl: HTMLElement | null = null;
    private filterEl: HTMLElement | null = null;
    private eventListEl: HTMLElement | null = null;
    private batchToolbarEl: HTMLElement | null = null;
    private compressSectionEl: HTMLElement | null = null;

    // 防止重复绑定标志
    private keydownBound: boolean = false;

    // 工具方法 - 安全的HTML转义
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 工具方法 - 安全创建元素
    private createSafeElement(tag: string, className?: string, textContent?: string): HTMLElement {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (textContent) element.textContent = textContent;
        return element;
    }

    // 压缩相关状态
    private compressionCandidates: EventRec[] = [];
    private isCompressPreviewOpen: boolean = false;

    constructor() {
        this.personaService = new PersonaService();
        this.initializeDOMCache();
        // 从localStorage恢复状态
        this.restoreState();
    }

    // 状态保持相关方法
    private saveState(): void {
        try {
            const state = {
                selectedPersonaId: this.currentPersonaId,
                currentFilter: this.currentFilter
            };
            localStorage.setItem('memory-screen-state', JSON.stringify(state));
        } catch (error) {
            console.warn('[Memory] 保存状态失败:', error);
        }
    }

    private restoreState(): void {
        try {
            const saved = localStorage.getItem('memory-screen-state');
            if (saved) {
                const state = JSON.parse(saved);
                this.currentPersonaId = state.selectedPersonaId || null;
                this.currentFilter = state.currentFilter || 'all';
            }
        } catch (error) {
            console.warn('[Memory] 恢复状态失败:', error);
            // 使用默认状态
            this.currentPersonaId = null;
            this.currentFilter = 'all';
        }
    }

    private initializeDOMCache(): void {
        this.screenEl = document.getElementById('memory-management-screen');
        this.toolbarEl = document.getElementById('memory-toolbar');
        this.filterEl = document.getElementById('memory-filter');
        this.eventListEl = document.getElementById('memory-event-list');
        this.batchToolbarEl = document.getElementById('memory-batch-toolbar');
        this.compressSectionEl = document.getElementById('memory-compress-section');
    }

    // === 公共API ===

    /**
     * 显示记忆管理面板
     */
    async showMemoryScreen(options: MemoryScreenOptions = {}): Promise<void> {
        try {
            // 设置初始状态 - 只有明确传入personaId时才覆盖恢复的状态
            if (options.personaId !== undefined) {
                this.currentPersonaId = options.personaId;
            }
            // 如果没有传入且也没有恢复的状态，则设为null
            if (this.currentPersonaId === undefined) {
                this.currentPersonaId = null;
            }

            this.currentFilter = options.initialFilter || 'all';
            this.selectedEventIds.clear();

            // 确保DOM存在
            if (!this.screenEl) {
                const phoneScreen = document.getElementById('phone-screen');
                const root = buildMemoryScreenRootForMemoryModule();
                if (phoneScreen) phoneScreen.appendChild(root);
                else document.body.appendChild(root);
                this.initializeDOMCache();
            }

            // 加载数据并渲染
            await this.loadMemoryData();
            await this.renderMemoryScreen();
            await this.loadCompressionCandidates();
            this.bindEventListeners();

            // 显示屏幕
            this.showScreen();

        } catch (error) {
            console.error('[Memory] 显示记忆管理面板失败:', error);
            throw error;
        }
    }

    /**
     * 刷新记忆数据
     */
    async refreshMemoryData(): Promise<void> {
        await this.loadMemoryData();
        this.renderEventList();
        await this.loadCompressionCandidates();
        this.updateBatchToolbar();
    }

    // === 私有实现方法 ===

    private async loadMemoryData(): Promise<void> {
        try {
            if (this.currentPersonaId) {
                // 加载特定角色的记忆
                this.events = await MemoryRepo.getEventsByPersona(this.currentPersonaId);
            } else {
                // 未选择persona时不加载事件，保持空状态（懒加载策略）
                this.events = [];
            }

            // 按状态筛选
            if (this.currentFilter !== 'all') {
                this.events = this.events.filter(event => event.status === this.currentFilter);
            }

            // 按时间排序（最新的在前）
            this.events.sort((a, b) => b.updatedAt - a.updatedAt);

        } catch (error) {
            console.error('[Memory] 加载记忆数据失败:', error);
            this.events = [];
        }
    }

    private async renderMemoryScreen(): Promise<void> {
        // 渲染左侧角色列表（新架构）
        await this.renderPersonaList();

        // 绑定角色列表事件
        this.bindPersonaListEvents();

        // 恢复筛选器状态
        const statusFilter = document.getElementById('memory-status-filter') as HTMLSelectElement;
        if (statusFilter) {
            statusFilter.value = this.currentFilter;
        }

        // 根据是否选中角色来显示内容
        if (this.currentPersonaId) {
            this.toggleMemoryPanelVisibility(true);
            this.renderEventList();

            // 恢复角色选中状态
            const selectedPersona = document.querySelector(`.persona-list-item[data-persona-id="${this.currentPersonaId}"]`);
            if (selectedPersona) {
                selectedPersona.classList.add('selected');
                selectedPersona.setAttribute('aria-selected', 'true');
            }
        } else {
            this.toggleMemoryPanelVisibility(false);
        }

        this.updateBatchToolbar();
    }

    /**
     * 渲染左侧角色列表
     */
    private async renderPersonaList(): Promise<void> {
        const contentEl = document.getElementById('persona-list-content');
        if (!contentEl) return;

        // 清空现有内容
        contentEl.textContent = '';

        try {
            // 获取所有角色
            this.personas = await this.personaService.getAll();

            if (this.personas.length === 0) {
                // 空态提示
                const emptyState = document.createElement('div');
                emptyState.className = 'persona-list-empty';

                const emptyIcon = document.createElement('div');
                emptyIcon.className = 'empty-icon';
                emptyIcon.textContent = '👤';

                const emptyText1 = document.createElement('p');
                emptyText1.textContent = '暂无角色';

                const emptyText2 = document.createElement('p');
                emptyText2.className = 'text-muted';
                emptyText2.textContent = '请先创建角色';

                emptyState.appendChild(emptyIcon);
                emptyState.appendChild(emptyText1);
                emptyState.appendChild(emptyText2);
                contentEl.appendChild(emptyState);
                return;
            }

            // 渲染角色列表项
            this.personas.forEach(persona => {
                const item = document.createElement('div');
                item.className = 'persona-list-item';
                item.setAttribute('data-persona-id', persona.id);
                item.setAttribute('tabindex', '0');
                item.setAttribute('role', 'button');
                item.setAttribute('aria-label', `选择角色：${persona.name}`);

                // 角色头像（使用首字母或表情符号）
                const avatar = document.createElement('div');
                avatar.className = 'persona-avatar';
                avatar.textContent = persona.avatar || persona.name?.charAt(0) || '?';

                // 角色信息
                const info = document.createElement('div');
                info.className = 'persona-info';

                const name = document.createElement('div');
                name.className = 'persona-name';
                name.textContent = persona.name || '未命名角色';

                const tags = document.createElement('div');
                tags.className = 'persona-tags';
                if (persona.tags && persona.tags.length > 0) {
                    tags.textContent = persona.tags.slice(0, 2).join(', ');
                }

                info.appendChild(name);
                if (tags.textContent) {
                    info.appendChild(tags);
                }

                // 记忆计数（可选）
                const memoryCount = document.createElement('div');
                memoryCount.className = 'persona-memory-count';
                memoryCount.textContent = ''; // 暂时留空，后续可以添加计数

                item.appendChild(avatar);
                item.appendChild(info);
                item.appendChild(memoryCount);

                // 添加选中状态
                if (persona.id === this.currentPersonaId) {
                    item.classList.add('selected');
                    item.setAttribute('aria-selected', 'true');
                }

                contentEl.appendChild(item);
            });

            // 异步更新各角色记忆计数（不阻塞首屏渲染）
            void this.updatePersonaMemoryCounts();

        } catch (error) {
            console.error('[Memory] 渲染角色列表失败:', error);
            const errorEl = document.createElement('div');
            errorEl.className = 'persona-list-error';
            errorEl.textContent = '加载角色列表失败';
            contentEl.appendChild(errorEl);
        }
    }

    /**
     * 异步统计并更新左侧角色的记忆条数
     */
    private async updatePersonaMemoryCounts(): Promise<void> {
        try {
            if (!this.personas || this.personas.length === 0) return;
            await Promise.all(this.personas.map(async (p) => {
                try {
                    const events = await MemoryRepo.getEventsByPersona(p.id);
                    const count = events.length;
                    const countEl = document.querySelector(
                        `.persona-list-item[data-persona-id="${p.id}"] .persona-memory-count`
                    ) as HTMLElement | null;
                    if (countEl) {
                        countEl.textContent = String(count);
                    }
                } catch (e) {
                    // 单个失败不影响整体
                }
            }));
        } catch (error) {
            console.warn('[Memory] 统计角色记忆条数失败:', error);
        }
    }

    /**
     * 绑定角色列表事件
     */
    private bindPersonaListEvents(): void {
        const contentEl = document.getElementById('persona-list-content');
        if (!contentEl) return;

        // 使用事件委托处理点击事件
        contentEl.addEventListener('click', (e) => {
            const item = (e.target as Element).closest('.persona-list-item');
            if (!item) return;

            const personaId = item.getAttribute('data-persona-id');
            if (personaId) {
                this.selectPersona(personaId);
            }
        });

        // 键盘导航支持
        contentEl.addEventListener('keydown', (e) => {
            const item = e.target as Element;
            if (!item.classList.contains('persona-list-item')) return;

            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const personaId = item.getAttribute('data-persona-id');
                if (personaId) {
                    this.selectPersona(personaId);
                }
            }
        });
    }

    /**
     * 选择角色
     */
    private async selectPersona(personaId: string): Promise<void> {
        // 更新选中状态
        const oldSelected = document.querySelector('.persona-list-item.selected');
        if (oldSelected) {
            oldSelected.classList.remove('selected');
            oldSelected.setAttribute('aria-selected', 'false');
        }

        const newSelected = document.querySelector(`.persona-list-item[data-persona-id="${personaId}"]`);
        if (newSelected) {
            newSelected.classList.add('selected');
            newSelected.setAttribute('aria-selected', 'true');
        }

        // 更新当前角色ID
        this.currentPersonaId = personaId;

        // 保存状态到localStorage
        this.saveState();

        // 显示/隐藏相关区域
        this.toggleMemoryPanelVisibility(true);

        // 重新加载记忆数据
        await this.loadMemoryData();
        this.renderEventList();
        await this.loadCompressionCandidates();
    }

    /**
     * 控制记忆面板的显示/隐藏
     */
    private toggleMemoryPanelVisibility(hasSelectedPersona: boolean): void {
        const emptyState = document.getElementById('memory-empty-state');
        const eventList = document.getElementById('memory-event-list');
        const compressSection = document.getElementById('memory-compress-section');

        if (hasSelectedPersona) {
            // 隐藏空态，显示内容
            if (emptyState) emptyState.style.display = 'none';
            if (eventList) eventList.style.display = 'block';
            if (compressSection) compressSection.style.display = 'block';
        } else {
            // 显示空态，隐藏内容
            if (emptyState) emptyState.style.display = 'block';
            if (eventList) eventList.style.display = 'none';
            if (compressSection) compressSection.style.display = 'none';
        }
    }

    private renderEventList(): void {
        const listEl = this.eventListEl;
        if (!listEl) return;

        // 清空现有内容
        while (listEl.firstChild) {
            listEl.removeChild(listEl.firstChild);
        }

        if (this.events.length === 0) {
            // 安全创建空状态
            const emptyStateEl = this.createSafeElement('div', 'memory-empty-state');

            const mainText = this.createSafeElement('p', '', '暂无记忆条目');
            const hintText = this.createSafeElement('p', 'text-muted', '记忆条目将在AI对话中自动创建');

            emptyStateEl.appendChild(mainText);
            emptyStateEl.appendChild(hintText);
            listEl.appendChild(emptyStateEl);
            return;
        }

        // 按角色分组显示
        const eventsByPersona = this.groupEventsByPersona();

        Object.entries(eventsByPersona).forEach(([personaId, events]) => {
            const groupEl = this.createPersonaGroup(personaId, events);
            listEl.appendChild(groupEl);
        });
    }

    private groupEventsByPersona(): Record<string, EventRec[]> {
        const groups: Record<string, EventRec[]> = {};

        this.events.forEach(event => {
            if (!groups[event.personaId]) {
                groups[event.personaId] = [];
            }
            groups[event.personaId].push(event);
        });

        return groups;
    }

    private createPersonaGroup(personaId: string, events: EventRec[]): HTMLElement {
        const groupEl = document.createElement('div');
        groupEl.className = 'memory-persona-group';

        // 角色组标题
        const headerEl = document.createElement('div');
        headerEl.className = 'memory-persona-header';

        // 安全创建角色名标题
        const titleEl = this.createSafeElement('h3', 'persona-name');
        titleEl.setAttribute('data-persona-id', personaId);
        titleEl.textContent = this.getPersonaName(personaId);

        // 安全创建事件计数
        const countEl = this.createSafeElement('span', 'event-count', `${events.length} 条记忆`);

        headerEl.appendChild(titleEl);
        headerEl.appendChild(countEl);
        groupEl.appendChild(headerEl);

        // 事件列表
        const eventsEl = document.createElement('div');
        eventsEl.className = 'memory-events';

        events.forEach(event => {
            const eventEl = this.createEventElement(event);
            eventsEl.appendChild(eventEl);
        });

        groupEl.appendChild(eventsEl);
        return groupEl;
    }

    private createEventElement(event: EventRec): HTMLElement {
        const eventEl = document.createElement('div');
        eventEl.className = 'memory-event-item';
        eventEl.setAttribute('data-event-id', event.id);
        eventEl.setAttribute('role', 'listitem');

        // 增强的ARIA标签
        const preview = this.renderEventPreviewWithTemplate(event, 120);
        const statusText = this.getStatusText(event.status);
        const ariaLabel = `${statusText}事件：${preview}，${event.compressed ? '已压缩，' : ''}更新时间：${new Date(event.updatedAt).toLocaleString()}`;
        eventEl.setAttribute('aria-label', ariaLabel);
        eventEl.setAttribute('aria-describedby', `event-meta-${event.id}`);

        const isSelected = this.selectedEventIds.has(event.id);
        if (isSelected) {
            eventEl.classList.add('selected');
            eventEl.setAttribute('aria-selected', 'true');
        } else {
            eventEl.setAttribute('aria-selected', 'false');
        }

        // 状态样式
        eventEl.classList.add(`status-${event.status}`);
        if (event.compressed) {
            eventEl.classList.add('compressed');
        }

        const timeStr = new Date(event.updatedAt).toLocaleString();

        // 安全创建事件内容
        const contentEl = this.createSafeElement('div', 'event-content');

        // 创建事件头部
        const headerEl = this.createSafeElement('div', 'event-header');

        // 复选框
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'event-checkbox';
        checkbox.checked = isSelected;
        checkbox.setAttribute('aria-label', '选择事件');

        // 状态标签
        const statusEl = this.createSafeElement('span', `event-status status-${event.status}`, this.getStatusText(event.status));

        // 类型标签
        const typeEl = this.createSafeElement('span', 'event-type', event.typeKey);

        headerEl.appendChild(checkbox);
        headerEl.appendChild(statusEl);
        headerEl.appendChild(typeEl);

        // 压缩标记
        if (event.compressed) {
            const compressedBadge = this.createSafeElement('span', 'compressed-badge', '已压缩');
            headerEl.appendChild(compressedBadge);
        }

        // 预览内容 - 使用textContent确保安全
        const previewEl = this.createSafeElement('div', 'event-preview');
        previewEl.textContent = preview; // 这里使用textContent而不是innerHTML确保安全

        // 元数据
        const metaEl = this.createSafeElement('div', 'event-meta');
        metaEl.id = `event-meta-${event.id}`;

        const timeEl = this.createSafeElement('span', 'event-time', timeStr);
        metaEl.appendChild(timeEl);

        if (event.dueAt) {
            const dueEl = this.createSafeElement('span', 'event-due', `截止: ${new Date(event.dueAt).toLocaleDateString()}`);
            metaEl.appendChild(dueEl);
        }

        if (event.parentEventId) {
            const childBadge = this.createSafeElement('span', 'child-badge', '子事件');
            metaEl.appendChild(childBadge);
        }

        // 组装内容元素
        contentEl.appendChild(headerEl);
        contentEl.appendChild(previewEl);
        contentEl.appendChild(metaEl);

        // 创建操作按钮
        const actionsEl = this.createSafeElement('div', 'event-actions');

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-secondary event-edit-btn';
        editBtn.setAttribute('aria-label', '编辑');
        editBtn.textContent = '编辑';

        const detailBtn = document.createElement('button');
        detailBtn.className = 'btn btn-sm btn-secondary event-detail-btn';
        detailBtn.setAttribute('aria-label', '详情');
        detailBtn.textContent = '详情';

        actionsEl.appendChild(editBtn);
        actionsEl.appendChild(detailBtn);

        // 组装最终元素
        eventEl.appendChild(contentEl);
        eventEl.appendChild(actionsEl);

        return eventEl;
    }

    private getPersonaName(personaId: string): string {
        try {
            // 只使用缓存的角色列表，避免异步调用
            const persona = this.personas.find(p => p.id === personaId);
            if (persona?.name) {
                return persona.name;
            }

            // 兜底：返回personaId
            return personaId;
        } catch (error) {
            console.error('[Memory] 获取角色名称失败:', error);
            return personaId;
        }
    }

    private getUserName(): string {
        try {
            const win = window as any;
            const state = win.STATE?.state || win.state;

            // 尝试从UserRoles中获取默认用户角色名称
            if (state && state.userRoles && Array.isArray(state.userRoles)) {
                const defaultUserRole = state.userRoles.find((role: any) => role.isGlobalDefault);
                if (defaultUserRole?.name) {
                    return defaultUserRole.name;
                }

                // 如果没有默认角色，使用第一个用户角色
                if (state.userRoles.length > 0 && state.userRoles[0].name) {
                    return state.userRoles[0].name;
                }
            }

            // 兜底：尝试从globalSettings获取（虽然这个字段可能不存在）
            if (state && state.globalSettings && state.globalSettings.userName) {
                return state.globalSettings.userName;
            }
        } catch (error) {
            console.error('[Memory] 获取用户名称失败:', error);
        }
        return '用户';
    }

    // 生成事件的渲染预览文本，支持模板变量
    private renderEventPreviewWithTemplate(event: EventRec, maxLength: number = 120): string {
        const userName = this.getUserName();
        const personaName = this.getPersonaName(event.personaId);

        // 获取经过模板渲染的标题和内容
        const { title, content } = getEventDisplayText(event, userName, personaName);

        // 创建临时事件对象使用渲染后的文本
        const displayEvent = { ...event, title, content };

        return renderEventPreview(displayEvent, maxLength);
    }

    private getStatusText(status: EventStatus): string {
        const statusMap = {
            'open': '进行中',
            'done': '已完成',
            'note': '笔记',
            'cancelled': '已取消'
        };
        return statusMap[status] || status;
    }

    private handleGlobalKeydown(e: KeyboardEvent): void {
        // Esc键关闭Modal
        if (e.key === 'Escape') {
            const win = window as any;
            // 检查是否有自定义Modal打开（检测overlay的visible类）
            const customModalOverlay = document.getElementById('custom-modal-overlay');
            if (customModalOverlay && customModalOverlay.classList.contains('visible')) {
                e.preventDefault();
                win.hideCustomModal && win.hideCustomModal();
                return;
            }

            // 检查是否有压缩预览Modal打开
            const compressionModal = document.getElementById('compression-preview-modal');
            if (compressionModal && compressionModal.style.display === 'block') {
                e.preventDefault();
                this.closeCompressionPreview();
                return;
            }
        }
    }

    private bindEventListeners(): void {
        // 统一头部后，不绑定自定义返回/刷新按钮

        // 全局键盘事件处理 - 防止重复绑定
        if (!this.keydownBound) {
            document.addEventListener('keydown', (e) => this.handleGlobalKeydown(e));
            this.keydownBound = true;
        }

        // 状态筛选器
        const statusFilter = document.getElementById('memory-status-filter') as HTMLSelectElement;
        statusFilter?.addEventListener('change', (e) => {
            this.currentFilter = (e.target as HTMLSelectElement).value as EventStatus | 'all';
            this.saveState(); // 保存状态
            this.refreshMemoryData();
        });

        // 事件列表事件委托
        this.eventListEl?.addEventListener('click', (e) => this.handleEventListClick(e));
        this.eventListEl?.addEventListener('change', (e) => this.handleEventListChange(e));

        // 批量操作按钮
        document.getElementById('memory-batch-complete')?.addEventListener('click', () => this.batchCompleteEvents());
        document.getElementById('memory-batch-cancel')?.addEventListener('click', () => this.batchCancelEvents());
        document.getElementById('memory-batch-delete')?.addEventListener('click', () => this.batchDeleteEvents());

        // 压缩管理按钮
        document.getElementById('compress-preview-btn')?.addEventListener('click', () => this.showCompressionPreview());
        document.getElementById('compress-execute-btn')?.addEventListener('click', () => this.executeCompression());
        document.getElementById('export-events-btn')?.addEventListener('click', () => this.exportEventsToFile());

        const forceToggle = document.getElementById('force-compress-open-due');
        forceToggle?.addEventListener('change', () => {
            // 开关变化时，重新加载候选
            void this.loadCompressionCandidates();
        });
    }

    private handleEventListClick(e: Event): void {
        const target = e.target as HTMLElement;
        const eventEl = target.closest('.memory-event-item') as HTMLElement;
        if (!eventEl) return;

        const eventId = eventEl.getAttribute('data-event-id');
        if (!eventId) return;

        if (target.classList.contains('event-edit-btn')) {
            this.editEvent(eventId);
        } else if (target.classList.contains('event-detail-btn')) {
            this.showEventDetail(eventId);
        }
    }

    private handleEventListChange(e: Event): void {
        const target = e.target as HTMLInputElement;
        if (!target.classList.contains('event-checkbox')) return;

        const eventEl = target.closest('.memory-event-item') as HTMLElement;
        if (!eventEl) return;

        const eventId = eventEl.getAttribute('data-event-id');
        if (!eventId) return;

        if (target.checked) {
            this.selectedEventIds.add(eventId);
            eventEl.classList.add('selected');
        } else {
            this.selectedEventIds.delete(eventId);
            eventEl.classList.remove('selected');
        }

        this.updateBatchToolbar();
    }

    private updateBatchToolbar(): void {
        const toolbar = this.batchToolbarEl;
        const countEl = document.getElementById('memory-selected-count');

        if (!toolbar || !countEl) return;

        const selectedCount = this.selectedEventIds.size;
        countEl.textContent = selectedCount.toString();

        if (selectedCount > 0) {
            toolbar.style.display = 'flex';
        } else {
            toolbar.style.display = 'none';
        }
    }

    private showScreen(): void {
        // 隐藏其他屏幕
        document.querySelectorAll('.screen.active').forEach(screen => {
            screen.classList.remove('active');
        });

        // 显示记忆管理屏幕
        this.screenEl?.classList.add('active');
    }

    // === 占位方法，后续实现 ===

    private async editEvent(eventId: string): Promise<void> {
        try {
            const event = await MemoryRepo.getEventById(eventId);
            if (!event) return;

            const win = window as any;

            // 使用统一Modal显示编辑表单
            const titleEl = document.getElementById('custom-modal-title');
            const bodyEl = document.getElementById('custom-modal-body');
            const cancelBtn = document.getElementById('custom-modal-cancel') as HTMLButtonElement;
            const confirmBtn = document.getElementById('custom-modal-confirm') as HTMLButtonElement;

            if (!titleEl || !bodyEl || !cancelBtn || !confirmBtn) {
                console.error('[Memory] Modal elements not found');
                return;
            }

            // 设置Modal标题
            titleEl.textContent = '编辑记忆';

            // 清空body并构建编辑表单
            bodyEl.textContent = '';

            const form = document.createElement('form');
            form.className = 'event-edit-form';

            // 标题输入，使用模板渲染后的文本作为初始值
            const { title: displayTitle, content: displayContent } = getEventDisplayText(event, this.getUserName(), this.getPersonaName(event.personaId));

            const titleGroup = document.createElement('div');
            titleGroup.className = 'form-group';
            const titleLabel = document.createElement('label');
            titleLabel.htmlFor = 'edit-event-title';
            titleLabel.textContent = '标题';
            const titleInput = document.createElement('input');
            titleInput.type = 'text';
            titleInput.id = 'edit-event-title';
            titleInput.className = 'form-input';
            titleInput.value = displayTitle;
            titleInput.maxLength = 80;
            titleGroup.appendChild(titleLabel);
            titleGroup.appendChild(titleInput);

            // 内容输入，使用模板渲染后的文本作为初始值
            const contentGroup = document.createElement('div');
            contentGroup.className = 'form-group';
            const contentLabel = document.createElement('label');
            contentLabel.htmlFor = 'edit-event-content';
            contentLabel.textContent = '内容';
            const contentTextarea = document.createElement('textarea');
            contentTextarea.id = 'edit-event-content';
            contentTextarea.className = 'form-textarea';
            contentTextarea.value = displayContent;
            contentTextarea.rows = 4;
            contentTextarea.maxLength = 300;
            contentGroup.appendChild(contentLabel);
            contentGroup.appendChild(contentTextarea);

            // 状态选择
            const statusGroup = document.createElement('div');
            statusGroup.className = 'form-group';
            const statusLabel = document.createElement('label');
            statusLabel.htmlFor = 'edit-event-status';
            statusLabel.textContent = '状态';
            const statusSelect = document.createElement('select');
            statusSelect.id = 'edit-event-status';
            statusSelect.className = 'form-select';

            const statusOptions = [
                { value: 'open', text: '开放' },
                { value: 'done', text: '完成' },
                { value: 'cancelled', text: '取消' },
                { value: 'note', text: '笔记' }
            ];

            statusOptions.forEach(option => {
                const optionEl = document.createElement('option');
                optionEl.value = option.value;
                optionEl.textContent = option.text;
                optionEl.selected = event.status === option.value;
                statusSelect.appendChild(optionEl);
            });

            statusGroup.appendChild(statusLabel);
            statusGroup.appendChild(statusSelect);

            // 截止时间输入
            const dueGroup = document.createElement('div');
            dueGroup.className = 'form-group';
            const dueLabel = document.createElement('label');
            dueLabel.htmlFor = 'edit-event-due';
            dueLabel.textContent = '截止时间（可选）';
            const dueInput = document.createElement('input');
            dueInput.type = 'datetime-local';
            dueInput.id = 'edit-event-due';
            dueInput.className = 'form-input';
            if (event.dueAt) {
                // 生成本地时间的YYYY-MM-DDTHH:mm格式，避免时区偏移
                const date = new Date(event.dueAt);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                dueInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
            }
            dueGroup.appendChild(dueLabel);
            dueGroup.appendChild(dueInput);

            // 标签输入
            const tagsGroup = document.createElement('div');
            tagsGroup.className = 'form-group';
            const tagsLabel = document.createElement('label');
            tagsLabel.htmlFor = 'edit-event-tags';
            tagsLabel.textContent = '标签（可选，逗号分隔）';
            const tagsInput = document.createElement('input');
            tagsInput.type = 'text';
            tagsInput.id = 'edit-event-tags';
            tagsInput.className = 'form-input';
            tagsInput.placeholder = '例如：重要,工作,个人';
            tagsInput.value = event.tags ? event.tags.join(', ') : '';
            tagsGroup.appendChild(tagsLabel);
            tagsGroup.appendChild(tagsInput);

            // 排除注入选项
            const excludeGroup = document.createElement('div');
            excludeGroup.className = 'form-group';
            const excludeLabel = document.createElement('label');
            excludeLabel.htmlFor = 'edit-event-exclude';
            excludeLabel.textContent = '排除注入';
            const excludeCheckbox = document.createElement('input');
            excludeCheckbox.type = 'checkbox';
            excludeCheckbox.id = 'edit-event-exclude';
            excludeCheckbox.className = 'form-checkbox';
            excludeCheckbox.checked = !!event.excludeFromPrompt;
            excludeGroup.appendChild(excludeCheckbox);
            excludeGroup.appendChild(excludeLabel);

            // 组装表单
            form.appendChild(titleGroup);
            form.appendChild(contentGroup);
            form.appendChild(statusGroup);
            form.appendChild(dueGroup);
            form.appendChild(tagsGroup);
            form.appendChild(excludeGroup);

            bodyEl.appendChild(form);

            // 设置按钮
            cancelBtn.style.display = 'block';
            cancelBtn.textContent = '取消';
            cancelBtn.className = 'btn btn-secondary';
            confirmBtn.textContent = '保存';
            confirmBtn.className = 'btn btn-primary';

            // 绑定保存事件
            const handleSave = async () => {
                const title = titleInput.value.trim();
                if (!title) {
                    await (window as any).showCustomAlert('验证错误', '标题不能为空');
                    titleInput.focus();
                    return;
                }

                const updateData: Partial<typeof event> = {
                    title,
                    content: contentTextarea.value.trim(),
                    status: statusSelect.value as any,
                    excludeFromPrompt: excludeCheckbox.checked,
                    updatedAt: Date.now()
                };

                // 处理标签
                const tagsText = tagsInput.value.trim();
                if (tagsText) {
                    updateData.tags = tagsText.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
                } else {
                    updateData.tags = [];
                }

                if (dueInput.value) {
                    updateData.dueAt = new Date(dueInput.value).getTime();
                } else {
                    updateData.dueAt = undefined;
                }

                try {
                    await MemoryRepo.updateEvent(eventId, updateData);
                    await this.refreshMemoryData();
                    win.hideCustomModal();
                } catch (error) {
                    console.error('[Memory] 保存编辑失败:', error);
                    await (window as any).showCustomAlert('错误', '保存失败，请重试');
                }
            };

            // 绑定取消事件
            const handleCancel = () => {
                win.hideCustomModal();
            };

            confirmBtn.onclick = handleSave;
            cancelBtn.onclick = handleCancel;

            // 支持回车提交（在非textarea时）
            form.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target !== contentTextarea) {
                    e.preventDefault();
                    handleSave();
                }
            });

            // 显示Modal并聚焦
            win.showCustomModal();
            titleInput.focus();
            titleInput.select();

        } catch (e) {
            console.error('[Memory] 编辑事件失败:', e);
            await (window as any).showCustomAlert('错误', '编辑失败');
        }
    }

    private async showEventDetail(eventId: string): Promise<void> {
        try {
            const event = await MemoryRepo.getEventById(eventId);
            if (!event) return;

            const win = window as any;

            // 使用统一Modal显示结构化详情
            const titleEl = document.getElementById('custom-modal-title');
            const bodyEl = document.getElementById('custom-modal-body');
            const cancelBtn = document.getElementById('custom-modal-cancel') as HTMLButtonElement;
            const confirmBtn = document.getElementById('custom-modal-confirm') as HTMLButtonElement;

            if (!titleEl || !bodyEl || !cancelBtn || !confirmBtn) {
                console.error('[Memory] Modal elements not found');
                return;
            }

            // 设置Modal标题
            titleEl.textContent = '记忆详情';

            // 清空body并构建详情内容
            bodyEl.textContent = '';

            // 创建详情列表
            const detailList = document.createElement('dl');
            detailList.className = 'event-detail-list';

            const addDetailItem = (label: string, value: string) => {
                const dt = document.createElement('dt');
                dt.textContent = label;
                const dd = document.createElement('dd');
                dd.textContent = value;
                detailList.appendChild(dt);
                detailList.appendChild(dd);
            };

            // 添加各项详情
            addDetailItem('ID', event.id);
            addDetailItem('类型', event.typeKey || '未知');
            addDetailItem('状态', this.getStatusText(event.status));
            addDetailItem('创建时间', new Date(event.createdAt).toLocaleString());
            addDetailItem('更新时间', new Date(event.updatedAt).toLocaleString());
            addDetailItem('截止时间', event.dueAt ? new Date(event.dueAt).toLocaleString() : '无');
            addDetailItem('参与者', (event.participants || []).join(', ') || '无');
            addDetailItem('是否压缩', event.compressed ? '是' : '否');
            addDetailItem('排除注入', event.excludeFromPrompt ? '是' : '否');

            // 标题和内容单独处理，支持换行，使用模板渲染
            const { title: displayTitle, content: displayContent } = getEventDisplayText(event, this.getUserName(), this.getPersonaName(event.personaId));

            const titleSection = document.createElement('div');
            const titleDt = document.createElement('dt');
            titleDt.textContent = '标题';
            const titleDd = document.createElement('dd');
            titleDd.style.whiteSpace = 'pre-wrap';
            titleDd.textContent = displayTitle;
            titleSection.appendChild(titleDt);
            titleSection.appendChild(titleDd);

            const contentSection = document.createElement('div');
            const contentDt = document.createElement('dt');
            contentDt.textContent = '内容';
            const contentDd = document.createElement('dd');
            contentDd.style.whiteSpace = 'pre-wrap';
            contentDd.style.maxHeight = '200px';
            contentDd.style.overflowY = 'auto';
            contentDd.textContent = displayContent;
            contentSection.appendChild(contentDt);
            contentSection.appendChild(contentDd);

            bodyEl.appendChild(detailList);
            bodyEl.appendChild(titleSection);
            bodyEl.appendChild(contentSection);

            // 隐藏取消按钮，设置确定按钮
            cancelBtn.style.display = 'none';
            confirmBtn.textContent = '好的';
            confirmBtn.className = 'btn btn-primary';

            // 绑定关闭事件
            confirmBtn.onclick = () => {
                cancelBtn.style.display = 'block'; // 恢复默认状态
                confirmBtn.textContent = '确定';
                win.hideCustomModal();
            };

            // 显示Modal并聚焦
            win.showCustomModal();
            confirmBtn.focus();

        } catch (e) {
            console.error('[Memory] 显示详情失败:', e);
            await (window as any).showCustomAlert('错误', '无法显示记忆详情');
        }
    }

    private async batchCompleteEvents(): Promise<void> {
        const ids = Array.from(this.selectedEventIds);
        if (ids.length === 0) return;
        const ok = await (window as any).showCustomConfirm('完成确认', `将标记 ${ids.length} 条事件为已完成，是否继续？`, { confirmButtonClass: 'btn-primary' });
        if (!ok) return;
        try {
            const now = Date.now();
            for (const id of ids) {
                await MemoryRepo.updateEvent(id, { status: 'done', updatedAt: now, lastUsedAt: now });
            }
            await this.refreshMemoryData();
            this.selectedEventIds.clear();
            this.updateBatchToolbar();
        } catch (e) {
            console.error('[Memory] 批量完成失败:', e);
            (window as any).showCustomAlert('错误', '批量完成失败');
        }
    }

    private async batchCancelEvents(): Promise<void> {
        const ids = Array.from(this.selectedEventIds);
        if (ids.length === 0) return;
        const ok = await (window as any).showCustomConfirm('取消确认', `将标记 ${ids.length} 条事件为已取消，是否继续？`, { confirmButtonClass: 'btn-secondary' });
        if (!ok) return;
        try {
            const now = Date.now();
            for (const id of ids) {
                await MemoryRepo.updateEvent(id, { status: 'cancelled', updatedAt: now, lastUsedAt: now });
            }
            await this.refreshMemoryData();
            this.selectedEventIds.clear();
            this.updateBatchToolbar();
        } catch (e) {
            console.error('[Memory] 批量取消失败:', e);
            (window as any).showCustomAlert('错误', '批量取消失败');
        }
    }

    private async batchDeleteEvents(): Promise<void> {
        const ids = Array.from(this.selectedEventIds);
        if (ids.length === 0) return;
        const ok = await (window as any).showCustomConfirm('删除确认', `将删除 ${ids.length} 条事件，此操作不可恢复，是否继续？`, { confirmButtonClass: 'btn-danger' });
        if (!ok) return;
        try {
            await MemoryRepo.removeEvents(ids);
            await this.refreshMemoryData();
            this.selectedEventIds.clear();
            this.updateBatchToolbar();
        } catch (e) {
            console.error('[Memory] 批量删除失败:', e);
            (window as any).showCustomAlert('错误', '批量删除失败');
        }
    }

    // === 压缩和导出功能 ===

    /**
     * 加载压缩候选事件
     */
    private async loadCompressionCandidates(): Promise<void> {
        try {
            if (!this.currentPersonaId) {
                this.compressionCandidates = [];
                this.updateCompressionUI();
                return;
            }

            // 读取强制压缩开关
            const forceToggle = document.getElementById('force-compress-open-due') as HTMLInputElement | null;
            const allowForce = Boolean(forceToggle?.checked);

            // 使用现有的selectCompressionCandidates函数（支持强制开关）
            const candidateIds = await selectCompressionCandidates(
                this.currentPersonaId,
                undefined,
                allowForce ? { forceIncludeOpen: true, includeDueSoon: true } : undefined
            );

            // 获取候选事件的详细信息
            this.compressionCandidates = await Promise.all(
                candidateIds.map(id => MemoryRepo.getEventById(id))
            );

            this.updateCompressionUI();

        } catch (error) {
            console.error('[Memory] 加载压缩候选失败:', error);
            this.compressionCandidates = [];
            this.updateCompressionUI();
        }
    }

    /**
     * 更新压缩UI状态
     */
    private updateCompressionUI(): void {
        const countEl = document.getElementById('compress-candidate-count');
        const previewBtn = document.getElementById('compress-preview-btn') as HTMLButtonElement;
        const executeBtn = document.getElementById('compress-execute-btn') as HTMLButtonElement;

        if (!countEl || !previewBtn || !executeBtn) return;

        const count = this.compressionCandidates.length;

        if (count === 0) {
            countEl.textContent = '无需压缩';
            previewBtn.disabled = true;
            executeBtn.disabled = true;
        } else {
            countEl.textContent = `${count} 个事件可压缩`;
            previewBtn.disabled = false;
            executeBtn.disabled = false;
        }
    }

    /**
     * 显示压缩预览
     */
    private async showCompressionPreview(): Promise<void> {
        if (this.compressionCandidates.length === 0) {
            (window as any).showCustomAlert('提示', '当前没有可压缩的事件');
            return;
        }

        try {
            // 创建压缩预览模态框
            await this.createCompressionPreviewModal();
            this.isCompressPreviewOpen = true;

            // 追加：调用干跑预览（AI优先，失败回退本地）并渲染摘要与节省估计
            const apiConfig = await this.getApiConfig();
            const candidateIds = this.compressionCandidates.map(e => e.id);
            const preview = await previewCompress(
                this.currentPersonaId!,
                candidateIds,
                '仅保留可复用事实；给出时间范围与核心动作列表；避免命令式语气',
                apiConfig?.proxyUrl,
                apiConfig?.apiKey,
                apiConfig?.model
            );

            const body = document.querySelector('#compression-preview-modal .modal-body');
            if (body) {
                const summaryBox = document.createElement('div');
                summaryBox.className = 'compress-summary-preview';
                const title = document.createElement('h3');
                title.textContent = 'AI 摘要预览';
                const pTitle = document.createElement('p');
                pTitle.textContent = `标题：${preview.title}`;
                const pContent = document.createElement('p');
                pContent.textContent = `内容：${preview.content}`;
                const pStats = document.createElement('p');
                const est = preview.estimates?.chars ?? 0;
                const saving = preview.expectedSavingsChars ?? (preview.baselineChars - (est as number) || 0);
                pStats.textContent = `原始约 ${preview.baselineChars} 字符 → 摘要约 ${est} 字符，预计节省 ${saving} 字符`;
                summaryBox.appendChild(title);
                summaryBox.appendChild(pTitle);
                summaryBox.appendChild(pContent);
                summaryBox.appendChild(pStats);
                body.appendChild(summaryBox);
            }

        } catch (error) {
            console.error('[Memory] 压缩预览失败:', error);
            (window as any).showCustomAlert('错误', '压缩预览功能暂时不可用');
        }
    }

    /**
     * 执行压缩操作
     */
    private async executeCompression(): Promise<void> {
        if (this.compressionCandidates.length === 0) {
            (window as any).showCustomAlert('提示', '当前没有可压缩的事件');
            return;
        }

        const confirmed = await (window as any).showCustomConfirm(
            '确认压缩',
            `即将压缩 ${this.compressionCandidates.length} 个事件。压缩后原事件将被替换为摘要，此操作不可逆。是否继续？`,
            { confirmButtonClass: 'btn-danger' }
        );

        if (!confirmed) return;

        try {
            // 获取API配置
            const apiConfig = await this.getApiConfig();
            if (!apiConfig) {
                (window as any).showCustomAlert('错误', '请先配置API设置');
                return;
            }

            // 显示加载状态
            const executeBtn = document.getElementById('compress-execute-btn') as HTMLButtonElement;
            const originalText = executeBtn.textContent;
            executeBtn.textContent = '压缩中...';
            executeBtn.disabled = true;

            // 执行压缩
            const candidateIds = this.compressionCandidates.map(e => e.id);
            const result = await compressOldEvents(
                this.currentPersonaId!,
                candidateIds,
                '自动压缩旧事件以节省空间',
                apiConfig.proxyUrl,
                apiConfig.apiKey,
                apiConfig.model
            );

            // 刷新数据
            await this.refreshMemoryData();

            (window as any).showCustomAlert('成功', `已压缩 ${result.compressedIds.length} 个事件，生成 1 个摘要事件`);

        } catch (error) {
            console.error('[Memory] 压缩执行失败:', error);
            (window as any).showCustomAlert('错误', '压缩失败: ' + (error as Error).message);
        } finally {
            // 恢复按钮状态
            const executeBtn = document.getElementById('compress-execute-btn') as HTMLButtonElement;
            executeBtn.textContent = '🗜️ 执行压缩';
            executeBtn.disabled = false;
        }
    }

    /**
     * 导出事件到文件
     */
    private async exportEventsToFile(): Promise<void> {
        try {
            let exportEvents: EventRec[];

            if (this.currentPersonaId) {
                exportEvents = await MemoryRepo.getEventsByPersona(this.currentPersonaId);
            } else {
                exportEvents = await MemoryRepo.getAllEvents();
            }

            if (exportEvents.length === 0) {
                (window as any).showCustomAlert('提示', '没有可导出的事件');
                return;
            }

            // 生成导出数据
            const exportData = {
                version: '1.0.0',
                exportTime: new Date().toISOString(),
                personaId: this.currentPersonaId || 'all',
                eventCount: exportEvents.length,
                events: exportEvents
            };

            // 创建并下载文件（统一工具）
            await downloadJsonAs(
                `memory-events-${this.currentPersonaId || 'all'}-${Date.now()}.json`,
                exportData
            );

            (window as any).showCustomAlert('成功', `已导出 ${exportEvents.length} 个事件`);

        } catch (error) {
            console.error('[Memory] 导出失败:', error);
            (window as any).showCustomAlert('错误', '导出失败: ' + (error as Error).message);
        }
    }

    // === 压缩预览模态框 ===

    /**
     * 创建压缩预览模态框
     */
    private async createCompressionPreviewModal(): Promise<void> {
        // 移除已存在的模态框
        const existingModal = document.getElementById('compression-preview-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // 安全创建模态框
        const modal = document.createElement('div');
        modal.id = 'compression-preview-modal';
        modal.className = 'modal compression-modal';
        modal.style.display = 'block';

        const modalContent = this.createSafeElement('div', 'modal-content');

        // 创建模态框头部
        const header = this.createSafeElement('div', 'modal-header');
        const title = this.createSafeElement('h2', '', '📦 压缩预览');
        const closeBtn = document.createElement('button');
        closeBtn.className = 'modal-close-btn';
        closeBtn.id = 'close-preview-modal';
        closeBtn.textContent = '×';

        header.appendChild(title);
        header.appendChild(closeBtn);

        // 创建模态框主体
        const body = this.createSafeElement('div', 'modal-body');

        // 添加压缩说明（修正文案）
        const previewInfo = this.createSafeElement('div', 'preview-info');
        const infoTitle = this.createSafeElement('p');
        const strongEl = this.createSafeElement('strong', '', '压缩说明：');
        infoTitle.appendChild(strongEl);

        const infoList = document.createElement('ul');
        const infoItems = [
            `将压缩 ${this.compressionCandidates.length} 个旧事件`,
            '使用AI生成简洁摘要保留关键信息',
            '原事件正文将被清空并排除注入（不可还原）', // 修正误导性文案
            '建议在压缩前导出备份'
        ];

        infoItems.forEach(text => {
            const li = document.createElement('li');
            li.textContent = text;
            infoList.appendChild(li);
        });

        previewInfo.appendChild(infoTitle);
        previewInfo.appendChild(infoList);

        // 创建候选事件列表
        const candidateSection = this.createSafeElement('div', 'candidate-list');
        const candidateTitle = this.createSafeElement('h3', '', '待压缩事件：');
        candidateSection.appendChild(candidateTitle);

        // 安全创建每个候选事件
        this.compressionCandidates.forEach((event, index) => {
            const candidateItem = this.createSafeElement('div', 'candidate-item');

            // 候选事件头部
            const candidateHeader = this.createSafeElement('div', 'candidate-header');

            const indexSpan = this.createSafeElement('span', 'candidate-index', `#${index + 1}`);
            const statusSpan = this.createSafeElement('span', `candidate-status status-${event.status}`, this.getStatusText(event.status));
            const timeSpan = this.createSafeElement('span', 'candidate-time', new Date(event.updatedAt).toLocaleString());

            candidateHeader.appendChild(indexSpan);
            candidateHeader.appendChild(statusSpan);
            candidateHeader.appendChild(timeSpan);

            // 候选事件预览 - 支持展开/收起长文，使用textContent确保安全
            const previewDiv = this.createSafeElement('div', 'candidate-preview');
            const collapsed = this.createSafeElement('div', 'text-collapsed');
            collapsed.textContent = this.renderEventPreviewWithTemplate(event, 180);
            const expanded = this.createSafeElement('div', 'text-expanded');
            const { title, content } = getEventDisplayText(event, this.getUserName(), this.getPersonaName(event.personaId));
            expanded.textContent = `${title || ''}${content ? ' - ' + content : ''}`;
            expanded.style.display = 'none';

            const toggleBtn = this.createSafeElement('button', 'btn btn-sm btn-secondary toggle-btn', '展开');
            toggleBtn.addEventListener('click', () => {
                const isCollapsed = expanded.style.display === 'none';
                expanded.style.display = isCollapsed ? 'block' : 'none';
                collapsed.style.display = isCollapsed ? 'none' : 'block';
                toggleBtn.textContent = isCollapsed ? '收起' : '展开';
            });

            previewDiv.appendChild(collapsed);
            previewDiv.appendChild(expanded);
            previewDiv.appendChild(toggleBtn);

            candidateItem.appendChild(candidateHeader);
            candidateItem.appendChild(previewDiv);
            candidateSection.appendChild(candidateItem);
        });

        body.appendChild(previewInfo);
        body.appendChild(candidateSection);

        // 创建模态框底部
        const footer = this.createSafeElement('div', 'modal-footer');

        const exportBtn = document.createElement('button');
        exportBtn.id = 'export-before-compress';
        exportBtn.className = 'btn btn-secondary';
        const exportIcon = this.createSafeElement('span', '', '📤');
        const exportText = this.createSafeElement('span', '', '先导出备份');
        exportBtn.appendChild(exportIcon);
        exportBtn.appendChild(exportText);

        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancel-compression';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.textContent = '取消';

        const confirmBtn = document.createElement('button');
        confirmBtn.id = 'confirm-compression';
        confirmBtn.className = 'btn btn-danger';
        const confirmIcon = this.createSafeElement('span', '', '🗜️');
        const confirmText = this.createSafeElement('span', '', '确认压缩');
        confirmBtn.appendChild(confirmIcon);
        confirmBtn.appendChild(confirmText);

        footer.appendChild(exportBtn);
        footer.appendChild(cancelBtn);
        footer.appendChild(confirmBtn);

        // 组装模态框
        modalContent.appendChild(header);
        modalContent.appendChild(body);
        modalContent.appendChild(footer);
        modal.appendChild(modalContent);

        // 添加到页面
        document.body.appendChild(modal);

        // 绑定事件
        document.getElementById('close-preview-modal')?.addEventListener('click', () => this.closeCompressionPreview());
        document.getElementById('cancel-compression')?.addEventListener('click', () => this.closeCompressionPreview());
        document.getElementById('export-before-compress')?.addEventListener('click', () => this.exportCompressionCandidates());
        document.getElementById('confirm-compression')?.addEventListener('click', async () => {
            this.closeCompressionPreview();
            await this.executeCompression();
        });

        // 点击背景关闭
        const modalElement = document.getElementById('compression-preview-modal');
        modalElement?.addEventListener('click', (e) => {
            if (e.target === modalElement) {
                this.closeCompressionPreview();
            }
        });
    }

    /**
     * 关闭压缩预览模态框
     */
    private closeCompressionPreview(): void {
        const modal = document.getElementById('compression-preview-modal');
        if (modal) {
            modal.remove();
        }
        this.isCompressPreviewOpen = false;
    }

    // === 工具方法 ===

    /**
     * 获取API配置
     */
    private async getApiConfig(): Promise<{proxyUrl: string, apiKey: string, model: string} | null> {
        try {
            const win = window as any;
            const state = win.STATE?.state || win.state;
            const apiConfig = state?.apiConfig;

            if (!apiConfig?.proxyUrl || !apiConfig?.apiKey) {
                return null;
            }

            return {
                proxyUrl: apiConfig.proxyUrl,
                apiKey: apiConfig.apiKey,
                model: apiConfig.model || 'gpt-3.5-turbo'
            };
        } catch (error) {
            console.error('[Memory] 获取API配置失败:', error);
            return null;
        }
    }

    // 新增：导出当前压缩候选集
    private async exportCompressionCandidates(): Promise<void> {
        try {
            if (this.compressionCandidates.length === 0) {
                (window as any).showCustomAlert('提示', '当前没有可导出的候选');
                return;
            }
            const exportData = {
                version: '1.0.0',
                exportTime: new Date().toISOString(),
                personaId: this.currentPersonaId || 'unknown',
                candidateCount: this.compressionCandidates.length,
                candidates: this.compressionCandidates
            };
            await downloadJsonAs(
                `memory-compress-candidates-${this.currentPersonaId || 'all'}-${Date.now()}.json`,
                exportData
            );
            (window as any).showCustomAlert('成功', `已导出 ${this.compressionCandidates.length} 个候选`);
        } catch (error) {
            console.error('[Memory] 导出候选失败:', error);
            (window as any).showCustomAlert('错误', '导出候选失败: ' + (error as Error).message);
        }
    }
}

// 单例导出
function buildMemoryScreenRootForMemoryModule(): HTMLElement {
    const root = document.createElement('div');
    root.id = 'memory-management-screen';
    root.className = 'screen';
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', '记忆管理');

    // header
    const header = document.createElement('header');
    header.className = 'header';
    header.setAttribute('role', 'banner');
    const backBtn = document.createElement('button');
    backBtn.className = 'back-btn';
    backBtn.setAttribute('aria-label', '返回首页');
    backBtn.addEventListener('click', () => { const w = window as any; if (w.showScreen) w.showScreen('home-screen'); });
    const backIcon = document.createElement('span');
    backIcon.setAttribute('aria-hidden', 'true');
    backIcon.textContent = '‹';
    backBtn.appendChild(backIcon);
    const h1 = document.createElement('h1');
    h1.className = 'header-title';
    const icon = document.createElement('span');
    icon.className = 'title-icon';
    icon.textContent = '🧠';
    h1.appendChild(icon);
    h1.appendChild(document.createTextNode('记忆管理'));
    const spacer = document.createElement('div');
    spacer.style.width = '30px';
    header.appendChild(backBtn);
    header.appendChild(h1);
    header.appendChild(spacer);

    // layout
    const layout = document.createElement('div');
    layout.className = 'memory-layout';

    // left pane
    const aside = document.createElement('aside');
    aside.className = 'persona-list-pane';
    aside.id = 'memory-persona-pane';
    aside.setAttribute('role', 'navigation');
    aside.setAttribute('aria-label', '角色列表');
    const personaHeader = document.createElement('div');
    personaHeader.className = 'persona-list-header';
    const h2 = document.createElement('h2');
    h2.textContent = '选择角色';
    personaHeader.appendChild(h2);
    const personaContent = document.createElement('div');
    personaContent.className = 'persona-list-content';
    personaContent.id = 'persona-list-content';
    aside.appendChild(personaHeader);
    aside.appendChild(personaContent);

    // right panel
    const panel = document.createElement('section');
    panel.className = 'memory-panel';
    panel.id = 'memory-panel';
    panel.setAttribute('role', 'main');
    panel.setAttribute('aria-label', '记忆面板');

    const filterBar = document.createElement('div');
    filterBar.className = 'memory-filter';
    filterBar.id = 'memory-filter';
    const select = document.createElement('select');
    select.id = 'memory-status-filter';
    select.setAttribute('aria-label', '状态筛选');
    const makeOpt = (value: string, text: string) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
    select.appendChild(makeOpt('all', '全部状态'));
    select.appendChild(makeOpt('open', '进行中'));
    select.appendChild(makeOpt('done', '已完成'));
    select.appendChild(makeOpt('note', '笔记'));
    select.appendChild(makeOpt('cancelled', '已取消'));
    filterBar.appendChild(select);

    const contentArea = document.createElement('div');
    contentArea.className = 'memory-content-area';
    const empty = document.createElement('div');
    empty.className = 'memory-empty-state';
    empty.id = 'memory-empty-state';
    const emptyIcon = document.createElement('div');
    emptyIcon.className = 'empty-state-icon';
    emptyIcon.textContent = '🗂';
    const emptyH3 = document.createElement('h3');
    emptyH3.textContent = '尚未选择角色';
    const emptyP = document.createElement('p');
    emptyP.textContent = '请从左侧选择角色后查看记忆';
    empty.appendChild(emptyIcon);
    empty.appendChild(emptyH3);
    empty.appendChild(emptyP);
    const list = document.createElement('div');
    list.className = 'memory-event-list';
    list.id = 'memory-event-list';
    list.setAttribute('role', 'list');
    list.style.display = 'none';
    contentArea.appendChild(empty);
    contentArea.appendChild(list);

    const compress = document.createElement('div');
    compress.className = 'memory-compress-section';
    compress.id = 'memory-compress-section';
    compress.style.display = 'none';
    const ch = document.createElement('div');
    ch.className = 'compress-header';
    const ch3 = document.createElement('h3');
    ch3.textContent = '🧾 压缩管理';
    const cdesc = document.createElement('p');
    cdesc.className = 'compress-description';
    cdesc.textContent = '压缩旧事件可节省存储空间，同时保留关键信息摘要';
    ch.appendChild(ch3);
    ch.appendChild(cdesc);
    const cctrl = document.createElement('div');
    cctrl.className = 'compress-controls';
    const cinfo = document.createElement('div');
    cinfo.className = 'compress-info';
    const ccount = document.createElement('span');
    ccount.id = 'compress-candidate-count';
    ccount.textContent = '检查中...';
    cinfo.appendChild(ccount);
    const cact = document.createElement('div');
    cact.className = 'compress-actions';
    const prevBtn = document.createElement('button');
    prevBtn.id = 'compress-preview-btn';
    prevBtn.className = 'btn btn-secondary';
    prevBtn.disabled = true;
    prevBtn.textContent = '压缩预览';
    const execBtn = document.createElement('button');
    execBtn.id = 'compress-execute-btn';
    execBtn.className = 'btn btn-primary';
    execBtn.disabled = true;
    execBtn.textContent = '执行压缩';
    const exportBtn = document.createElement('button');
    exportBtn.id = 'export-events-btn';
    exportBtn.className = 'btn btn-secondary';
    exportBtn.textContent = '导出原事件';
    const lbl = document.createElement('label');
    lbl.className = 'force-compress-toggle';
    lbl.style.cssText = 'margin-left:12px;display:inline-flex;align-items:center;gap:6px;';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = 'force-compress-open-due';
    const ltxt = document.createElement('span');
    ltxt.textContent = '允许强制压缩进行中/临期';
    lbl.appendChild(chk);
    lbl.appendChild(ltxt);
    cact.appendChild(prevBtn);
    cact.appendChild(execBtn);
    cact.appendChild(exportBtn);
    cact.appendChild(lbl);
    cctrl.appendChild(cinfo);
    cctrl.appendChild(cact);
    compress.appendChild(ch);
    compress.appendChild(cctrl);

    const batch = document.createElement('div');
    batch.className = 'memory-batch-toolbar';
    batch.id = 'memory-batch-toolbar';
    batch.style.display = 'none';
    const binfo = document.createElement('div');
    binfo.className = 'batch-info';
    const selCount = document.createElement('span');
    selCount.id = 'memory-selected-count';
    selCount.textContent = '0';
    binfo.appendChild(selCount);
    binfo.appendChild(document.createTextNode(' 条已选择'));
    const bact = document.createElement('div');
    bact.className = 'batch-actions';
    const bdone = document.createElement('button');
    bdone.id = 'memory-batch-complete';
    bdone.className = 'btn btn-primary';
    bdone.textContent = '标记完成';
    const bcancel = document.createElement('button');
    bcancel.id = 'memory-batch-cancel';
    bcancel.className = 'btn btn-secondary';
    bcancel.textContent = '标记取消';
    const bdel = document.createElement('button');
    bdel.id = 'memory-batch-delete';
    bdel.className = 'btn btn-danger';
    bdel.textContent = '删除';
    bact.appendChild(bdone);
    bact.appendChild(bcancel);
    bact.appendChild(bdel);
    batch.appendChild(binfo);
    batch.appendChild(bact);

    panel.appendChild(filterBar);
    panel.appendChild(contentArea);
    panel.appendChild(compress);
    panel.appendChild(batch);
    layout.appendChild(aside);
    layout.appendChild(panel);

    root.appendChild(header);
    root.appendChild(layout);
    return root;
}

export const memoryScreenModule = new MemoryScreenModule();
