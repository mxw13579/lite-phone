// Memory Management Screen Module
// 记忆管理面板 - 树状显示、批量操作、状态筛选

import type { EventRec, EventStatus, PersonaMemorySettings } from '../../services/memory/types';
import { MemoryRepo } from '../../services/memory/repo';
import { renderEventPreview } from '../../services/memory/render';
import { compressOldEvents, selectCompressionCandidates, previewCompress } from '../../services/memory/mcp';
import STATE from '../../state';
import DB from '../../database';

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

    // 缓存DOM元素
    private screenEl: HTMLElement | null = null;
    private toolbarEl: HTMLElement | null = null;
    private filterEl: HTMLElement | null = null;
    private eventListEl: HTMLElement | null = null;
    private batchToolbarEl: HTMLElement | null = null;
    private compressSectionEl: HTMLElement | null = null;

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
        this.initializeDOMCache();
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
            // 设置初始状态
            this.currentPersonaId = options.personaId || null;
            this.currentFilter = options.initialFilter || 'all';
            this.selectedEventIds.clear();

            // 确保DOM存在
            if (!this.screenEl) {
                await this.createMemoryScreenDOM();
            }

            // 加载数据并渲染
            await this.loadMemoryData();
            this.renderMemoryScreen();
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
                // 加载所有记忆（按角色分组）
                // 由于getAllPersonas方法可能不存在，我们用另一种方式获取所有角色的记忆
                const allEvents = await MemoryRepo.getAllEvents();
                this.events = allEvents;
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

    private async createMemoryScreenDOM(): Promise<void> {
        const existingScreen = document.getElementById('memory-management-screen');
        if (existingScreen) {
            existingScreen.remove();
        }

        const screenHTML = `
            <div id=\"memory-management-screen\" class=\"screen\" role=\"application\" aria-label=\"记忆管理\"> 
                <header class=\"header\" role=\"banner\">
                    <button class=\"back-btn\" onclick=\"window.showScreen && window.showScreen('home-screen')\" aria-label=\"返回主屏幕\">
                        <span aria-hidden=\"true\">‹</span>
                    </button>
                    <h1 class=\"header-title\"><span class=\"title-icon\">🧠</span>记忆管理</h1>
                    <div style=\"width: 30px;\"></div>
                </header>

                <!-- 筛选栏 -->
                <div id="memory-filter" class="memory-filter">
                    <select id="memory-persona-select" aria-label="选择角色">
                        <option value="">所有角色</option>
                    </select>
                    <select id="memory-status-filter" aria-label="状态筛选">
                        <option value="all">全部状态</option>
                        <option value="open">进行中</option>
                        <option value="done">已完成</option>
                        <option value="note">笔记</option>
                        <option value="cancelled">已取消</option>
                    </select>
                </div>

                <!-- 事件列表 -->
                <div id="memory-event-list" class="memory-event-list" role="list">
                    <!-- 动态生成的事件条目 -->
                </div>

                <!-- 压缩管理区域 -->
                <div id="memory-compress-section" class="memory-compress-section">
                    <div class="compress-header">
                        <h3>📦 压缩管理</h3>
                        <p class="compress-description">压缩旧事件可节省存储空间，同时保留关键信息摘要</p>
                    </div>
                    <div class="compress-controls">
                        <div class="compress-info">
                            <span id="compress-candidate-count">检查中...</span>
                        </div>
                        <div class="compress-actions">
                            <button id="compress-preview-btn" class="btn-secondary" disabled>
                                <span>👁️</span>
                                <span>压缩预览</span>
                            </button>
                            <button id="compress-execute-btn" class="btn-primary" disabled>
                                <span>🗜️</span>
                                <span>执行压缩</span>
                            </button>
                            <button id="export-events-btn" class="btn-secondary">
                                <span>📤</span>
                                <span>导出备份</span>
                            </button>
                            <label class="force-compress-toggle" style="margin-left:12px;display:inline-flex;align-items:center;gap:6px;">
                                <input type="checkbox" id="force-compress-open-due" />
                                <span>允许强制压缩进行中/临期</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- 批量操作工具栏 -->
                <div id="memory-batch-toolbar" class="memory-batch-toolbar" style="display: none;">
                    <div class="batch-info">
                        <span id="memory-selected-count">0</span> 项已选中
                    </div>
                    <div class="batch-actions">
                        <button id="memory-batch-complete" class="btn-primary">标记完成</button>
                        <button id="memory-batch-cancel" class="btn-secondary">标记取消</button>
                        <button id="memory-batch-delete" class="btn-danger">删除</button>
                    </div>
                </div>
            </div>
        `;

        // 将记忆管理屏幕挂载到与其他屏幕一致的容器内（#phone-screen）
        const phoneScreen = document.getElementById('phone-screen');
        if (phoneScreen) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = screenHTML;
            // 仅附加实际 screen 根节点，避免多余文本节点
            const screenRoot = wrapper.firstElementChild as HTMLElement;
            if (screenRoot) phoneScreen.appendChild(screenRoot);
        } else {
            // 兜底：若未找到容器则挂到 body（不影响功能，但可能样式与切屏不一致）
            document.body.insertAdjacentHTML('beforeend', screenHTML);
        }
        this.initializeDOMCache();
    }

    private renderMemoryScreen(): void {
        this.renderPersonaSelector();
        this.renderEventList();
        this.updateBatchToolbar();
    }

    private async renderPersonaSelector(): Promise<void> {
        const selector = document.getElementById('memory-persona-select') as HTMLSelectElement;
        if (!selector) return;

        // 清空现有选项
        while (selector.firstChild) {
            selector.removeChild(selector.firstChild);
        }

        // 安全添加默认选项
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '所有角色';
        selector.appendChild(defaultOption);

        try {
            // 从STATE获取角色信息
            const win = window as any;
            const state = win.STATE?.state || win.state;
            if (state && state.chats) {
                const personas = new Map<string, string>();

                // 从聊天记录中提取角色信息（兼容对象或数组）
                const chatsArr = Array.isArray(state.chats) ? state.chats : Object.values(state.chats);
                chatsArr.forEach((chat: any) => {
                    if (chat?.personaId && !personas.has(chat.personaId)) {
                        personas.set(chat.personaId, chat.name || chat.personaId);
                    }
                });

                personas.forEach((name, id) => {
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = name;
                    if (id === this.currentPersonaId) {
                        option.selected = true;
                    }
                    selector.appendChild(option);
                });
            }
        } catch (error) {
            console.error('[Memory] 渲染角色选择器失败:', error);
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

        const isSelected = this.selectedEventIds.has(event.id);
        if (isSelected) {
            eventEl.classList.add('selected');
        }

        // 状态样式
        eventEl.classList.add(`status-${event.status}`);
        if (event.compressed) {
            eventEl.classList.add('compressed');
        }

        const preview = renderEventPreview(event, 120);
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
        editBtn.className = 'btn-sm btn-secondary event-edit-btn';
        editBtn.setAttribute('aria-label', '编辑');
        editBtn.textContent = '编辑';

        const detailBtn = document.createElement('button');
        detailBtn.className = 'btn-sm btn-secondary event-detail-btn';
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
            const win = window as any;
            const state = win.STATE?.state || win.state;
            if (state && state.chats) {
                const chat = state.chats.find((c: any) => c.personaId === personaId);
                return chat?.name || personaId;
            }
        } catch (error) {
            console.error('[Memory] 获取角色名称失败:', error);
        }
        return personaId;
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

    private bindEventListeners(): void {
        // 统一头部后，不绑定自定义返回/刷新按钮

        // 角色选择器
        const personaSelect = document.getElementById('memory-persona-select') as HTMLSelectElement;
        personaSelect?.addEventListener('change', (e) => {
            this.currentPersonaId = (e.target as HTMLSelectElement).value || null;
            this.refreshMemoryData();
        });

        // 状态筛选器
        const statusFilter = document.getElementById('memory-status-filter') as HTMLSelectElement;
        statusFilter?.addEventListener('change', (e) => {
            this.currentFilter = (e.target as HTMLSelectElement).value as EventStatus | 'all';
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

    private goBack(): void {
        // 返回到前一个屏幕（通常是设置或角色中心）
        const win = window as any;
        if (win.showScreen) {
            win.showScreen('persona-center-screen');
        }
    }

    // === 占位方法，后续实现 ===

    private async editEvent(eventId: string): Promise<void> {
        try {
            const event = await MemoryRepo.getEventById(eventId);
            if (!event) return;
            const newTitle = prompt('编辑标题:', event.title);
            if (newTitle != null && newTitle !== event.title) {
                await MemoryRepo.updateEvent(eventId, { title: newTitle, updatedAt: Date.now() });
                await this.refreshMemoryData();
            }
            const newContent = prompt('编辑内容:', event.content);
            if (newContent != null && newContent !== event.content) {
                await MemoryRepo.updateEvent(eventId, { content: newContent, updatedAt: Date.now() });
                await this.refreshMemoryData();
            }
        } catch (e) {
            console.error('[Memory] 编辑事件失败:', e);
            this.showAlert('错误', '编辑失败');
        }
    }

    private async showEventDetail(eventId: string): Promise<void> {
        try {
            const event = await MemoryRepo.getEventById(eventId);
            if (!event) return;
            const detail = `ID: ${event.id}\n类型: ${event.typeKey}\n状态: ${this.getStatusText(event.status)}\n创建: ${new Date(event.createdAt).toLocaleString()}\n更新: ${new Date(event.updatedAt).toLocaleString()}\n截止: ${event.dueAt ? new Date(event.dueAt).toLocaleString() : '无'}\n参与者: ${(event.participants||[]).join(', ')}\n标题: ${event.title}\n内容: ${event.content}`;
            alert(detail);
        } catch (e) {
            console.error('[Memory] 显示详情失败:', e);
        }
    }

    private async batchCompleteEvents(): Promise<void> {
        const ids = Array.from(this.selectedEventIds);
        if (ids.length === 0) return;
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
            this.showAlert('错误', '批量完成失败');
        }
    }

    private async batchCancelEvents(): Promise<void> {
        const ids = Array.from(this.selectedEventIds);
        if (ids.length === 0) return;
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
            this.showAlert('错误', '批量取消失败');
        }
    }

    private async batchDeleteEvents(): Promise<void> {
        const ids = Array.from(this.selectedEventIds);
        if (ids.length === 0) return;
        const ok = await this.showConfirm('删除确认', `将删除 ${ids.length} 条事件，此操作不可恢复，是否继续？`);
        if (!ok) return;
        try {
            await MemoryRepo.removeEvents(ids);
            await this.refreshMemoryData();
            this.selectedEventIds.clear();
            this.updateBatchToolbar();
        } catch (e) {
            console.error('[Memory] 批量删除失败:', e);
            this.showAlert('错误', '批量删除失败');
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
            this.showAlert('提示', '当前没有可压缩的事件');
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
            this.showAlert('错误', '压缩预览功能暂时不可用');
        }
    }

    /**
     * 执行压缩操作
     */
    private async executeCompression(): Promise<void> {
        if (this.compressionCandidates.length === 0) {
            this.showAlert('提示', '当前没有可压缩的事件');
            return;
        }

        const confirmed = await this.showConfirm(
            '确认压缩',
            `即将压缩 ${this.compressionCandidates.length} 个事件。压缩后原事件将被替换为摘要，此操作不可逆。是否继续？`
        );

        if (!confirmed) return;

        try {
            // 获取API配置
            const apiConfig = await this.getApiConfig();
            if (!apiConfig) {
                this.showAlert('错误', '请先配置API设置');
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

            this.showAlert('成功', `已压缩 ${result.compressedIds.length} 个事件，生成 1 个摘要事件`);

        } catch (error) {
            console.error('[Memory] 压缩执行失败:', error);
            this.showAlert('错误', '压缩失败: ' + (error as Error).message);
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
                this.showAlert('提示', '没有可导出的事件');
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

            // 创建并下载文件
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                type: 'application/json'
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `memory-events-${this.currentPersonaId || 'all'}-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showAlert('成功', `已导出 ${exportEvents.length} 个事件`);

        } catch (error) {
            console.error('[Memory] 导出失败:', error);
            this.showAlert('错误', '导出失败: ' + (error as Error).message);
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
            collapsed.textContent = renderEventPreview(event, 180);
            const expanded = this.createSafeElement('div', 'text-expanded');
            expanded.textContent = `${event.title || ''}${event.content ? ' - ' + event.content : ''}`;
            expanded.style.display = 'none';

            const toggleBtn = this.createSafeElement('button', 'toggle-btn', '展开');
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
        exportBtn.className = 'btn-secondary';
        const exportIcon = this.createSafeElement('span', '', '📤');
        const exportText = this.createSafeElement('span', '', '先导出备份');
        exportBtn.appendChild(exportIcon);
        exportBtn.appendChild(exportText);

        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancel-compression';
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = '取消';

        const confirmBtn = document.createElement('button');
        confirmBtn.id = 'confirm-compression';
        confirmBtn.className = 'btn-danger';
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

    /**
     * 显示确认对话框
     */
    private async showConfirm(title: string, message: string): Promise<boolean> {
        return new Promise((resolve) => {
            const confirmed = confirm(`${title}\n\n${message}`);
            resolve(confirmed);
        });
    }

    /**
     * 显示提示框
     */
    private showAlert(title: string, message: string): void {
        alert(`${title}\n\n${message}`);
    }

    // 新增：导出当前压缩候选集
    private async exportCompressionCandidates(): Promise<void> {
        try {
            if (this.compressionCandidates.length === 0) {
                this.showAlert('提示', '当前没有可导出的候选');
                return;
            }
            const exportData = {
                version: '1.0.0',
                exportTime: new Date().toISOString(),
                personaId: this.currentPersonaId || 'unknown',
                candidateCount: this.compressionCandidates.length,
                candidates: this.compressionCandidates
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `memory-compress-candidates-${this.currentPersonaId || 'all'}-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showAlert('成功', `已导出 ${this.compressionCandidates.length} 个候选`);
        } catch (error) {
            console.error('[Memory] 导出候选失败:', error);
            this.showAlert('错误', '导出候选失败: ' + (error as Error).message);
        }
    }
}

// 单例导出
export const memoryScreenModule = new MemoryScreenModule();
