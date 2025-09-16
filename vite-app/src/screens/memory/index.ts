// Memory Management Screen Module
// 记忆管理面板 - 树状显示、批量操作、状态筛选

import type { EventRec, EventStatus, PersonaMemorySettings } from '../../services/memory/types';
import { MemoryRepo } from '../../services/memory/repo';
import { renderEventPreview } from '../../services/memory/render';
import { compressOldEvents, selectCompressionCandidates } from '../../services/memory/mcp';
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
            <div id="memory-management-screen" class="screen" role="application" aria-label="记忆管理">
                <!-- 顶部工具栏 -->
                <div id="memory-toolbar" class="memory-toolbar">
                    <div class="toolbar-section">
                        <button id="memory-back-btn" class="btn-secondary" aria-label="返回">
                            <span>←</span>
                        </button>
                        <h1 class="screen-title">记忆管理</h1>
                    </div>
                    <div class="toolbar-section">
                        <button id="memory-refresh-btn" class="btn-secondary" aria-label="刷新">
                            <span>🔄</span>
                        </button>
                        <button id="memory-settings-btn" class="btn-secondary" aria-label="设置">
                            <span>⚙️</span>
                        </button>
                    </div>
                </div>

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

        document.body.insertAdjacentHTML('beforeend', screenHTML);
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
        selector.innerHTML = '<option value="">所有角色</option>';

        try {
            // 从STATE获取角色信息
            const win = window as any;
            const state = win.STATE?.state || win.state;
            if (state && state.chats) {
                const personas = new Map<string, string>();

                // 从聊天记录中提取角色信息
                state.chats.forEach((chat: any) => {
                    if (chat.personaId && !personas.has(chat.personaId)) {
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
        listEl.innerHTML = '';

        if (this.events.length === 0) {
            listEl.innerHTML = `
                <div class="memory-empty-state">
                    <p>暂无记忆条目</p>
                    <p class="text-muted">记忆条目将在AI对话中自动创建</p>
                </div>
            `;
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
        headerEl.innerHTML = `
            <h3 class="persona-name" data-persona-id="${personaId}">
                ${this.getPersonaName(personaId)}
            </h3>
            <span class="event-count">${events.length} 条记忆</span>
        `;
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

        const preview = renderEventPreview(event, false);
        const timeStr = new Date(event.updatedAt).toLocaleString();

        eventEl.innerHTML = `
            <div class="event-content">
                <div class="event-header">
                    <input type="checkbox" class="event-checkbox" ${isSelected ? 'checked' : ''}
                           aria-label="选择事件">
                    <span class="event-status status-${event.status}">${this.getStatusText(event.status)}</span>
                    <span class="event-type">${event.typeKey}</span>
                    ${event.compressed ? '<span class="compressed-badge">已压缩</span>' : ''}
                </div>
                <div class="event-preview">${preview}</div>
                <div class="event-meta">
                    <span class="event-time">${timeStr}</span>
                    ${event.dueAt ? `<span class="event-due">截止: ${new Date(event.dueAt).toLocaleDateString()}</span>` : ''}
                    ${event.parentEventId ? '<span class="child-badge">子事件</span>' : ''}
                </div>
            </div>
            <div class="event-actions">
                <button class="btn-sm btn-secondary event-edit-btn" aria-label="编辑">编辑</button>
                <button class="btn-sm btn-secondary event-detail-btn" aria-label="详情">详情</button>
            </div>
        `;

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
        // 返回按钮
        const backBtn = document.getElementById('memory-back-btn');
        backBtn?.addEventListener('click', () => this.goBack());

        // 刷新按钮
        const refreshBtn = document.getElementById('memory-refresh-btn');
        refreshBtn?.addEventListener('click', () => this.refreshMemoryData());

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
        console.log('[Memory] 编辑事件:', eventId);
        // TODO: 实现事件编辑功能
    }

    private async showEventDetail(eventId: string): Promise<void> {
        console.log('[Memory] 显示事件详情:', eventId);
        // TODO: 实现事件详情显示
    }

    private async batchCompleteEvents(): Promise<void> {
        console.log('[Memory] 批量完成事件:', Array.from(this.selectedEventIds));
        // TODO: 实现批量完成功能
    }

    private async batchCancelEvents(): Promise<void> {
        console.log('[Memory] 批量取消事件:', Array.from(this.selectedEventIds));
        // TODO: 实现批量取消功能
    }

    private async batchDeleteEvents(): Promise<void> {
        console.log('[Memory] 批量删除事件:', Array.from(this.selectedEventIds));
        // TODO: 实现批量删除功能
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

            // 使用现有的selectCompressionCandidates函数
            const candidateIds = await selectCompressionCandidates(this.currentPersonaId);

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

        // 生成候选事件的预览
        const candidateList = this.compressionCandidates.map((event, index) => {
            const timeStr = new Date(event.updatedAt).toLocaleString();
            const preview = renderEventPreview(event, false);
            return `
                <div class="candidate-item">
                    <div class="candidate-header">
                        <span class="candidate-index">#${index + 1}</span>
                        <span class="candidate-status status-${event.status}">${this.getStatusText(event.status)}</span>
                        <span class="candidate-time">${timeStr}</span>
                    </div>
                    <div class="candidate-preview">${preview}</div>
                </div>
            `;
        }).join('');

        const modalHTML = `
            <div id="compression-preview-modal" class="modal compression-modal" style="display: block;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>📦 压缩预览</h2>
                        <button class="modal-close-btn" id="close-preview-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="preview-info">
                            <p><strong>压缩说明：</strong></p>
                            <ul>
                                <li>将压缩 ${this.compressionCandidates.length} 个旧事件</li>
                                <li>使用AI生成简洁摘要保留关键信息</li>
                                <li>原事件将被删除，仅保留摘要（不可逆）</li>
                                <li>建议在压缩前导出备份</li>
                            </ul>
                        </div>
                        <div class="candidate-list">
                            <h3>待压缩事件：</h3>
                            ${candidateList}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="export-before-compress" class="btn-secondary">
                            <span>📤</span>
                            <span>先导出备份</span>
                        </button>
                        <button id="cancel-compression" class="btn-secondary">取消</button>
                        <button id="confirm-compression" class="btn-danger">
                            <span>🗜️</span>
                            <span>确认压缩</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // 绑定事件
        document.getElementById('close-preview-modal')?.addEventListener('click', () => this.closeCompressionPreview());
        document.getElementById('cancel-compression')?.addEventListener('click', () => this.closeCompressionPreview());
        document.getElementById('export-before-compress')?.addEventListener('click', () => this.exportEventsToFile());
        document.getElementById('confirm-compression')?.addEventListener('click', async () => {
            this.closeCompressionPreview();
            await this.executeCompression();
        });

        // 点击背景关闭
        const modal = document.getElementById('compression-preview-modal');
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) {
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
}

// 单例导出
export const memoryScreenModule = new MemoryScreenModule();