// PersonaList组件 - 左侧角色列表（优化版：本地删除刷新 + 精简事件委托 + 只读tags修复）
import type {
  PersonaListEvents,
  PersonaListItem,
  FilterOptions,
  SearchOptions
} from '../types/ComponentTypes';
import type { Persona, UserRole } from '../types/PersonaTypes';
import { PersonaService } from '../services/PersonaService';
import { UserRoleService } from '../services/UserRoleService';

type ItemType = 'ai' | 'user';
type GroupedItems = { ai: PersonaListItem[]; user: PersonaListItem[] };

const TEXT = {
  loading: '加载中...',
  retry: '重试',
  searchPlaceholder: '搜索角色...',
  emptyIcon: '🎭',
  groupAI: 'AI角色',
  groupUser: '用户角色',
  empty: (typeText: string) => `暂无${typeText}`,
  emptySub: (typeText: string) => `创建您的第一个${typeText}开始使用`,
  createRole: '新建角色',
  btnEdit: '编辑',
  btnDelete: '删除',
  confirmDelete: '确定要删除这个角色吗？此操作无法撤销。',
  errorLoad: '加载失败',
  errorRefresh: '刷新失败'
};

export class PersonaListComponent {
  private container: HTMLElement;
  private personaService: PersonaService;
  private userRoleService: UserRoleService;
  private events: PersonaListEvents;

  // 状态
  private loading = false;
  private error?: string;
  private data: {
    personas: Persona[];
    userRoles: UserRole[];
    items: PersonaListItem[];
  } | null = null;

  private currentFilter: FilterOptions = { type: 'all' };
  private searchTerm = '';
  private selectedItems: Set<string> = new Set();

  // 事件/资源清理
  private searchInputHandler?: (event: Event) => void;
  private clearButtonHandler?: (event: Event) => void;
  private listDelegateHandler?: (event: Event) => void;
  private headerCreateHandler?: (event: Event) => void;
  private retryHandler?: (event: Event) => void;
  private searchDebounceTimer: number | null = null;
  private lastQueryToken = 0;

  constructor(container: HTMLElement, events: PersonaListEvents) {
    this.container = container;
    this.events = events;
    this.personaService = new PersonaService();
    this.userRoleService = new UserRoleService();
  }

  async render(): Promise<void> {
    try {
      this.setLoading(true);
      this.renderLoading();

      const [personas, userRoles] = await Promise.all([
        this.personaService.getAll(),
        this.userRoleService.getAll()
      ]);

      const items = this.buildListItems(personas, userRoles);
      this.data = { personas, userRoles, items };
      this.setLoading(false);
      this.error = undefined;

      this.renderContent(items);
      this.attachEventListeners();
    } catch (err) {
      console.error('PersonaList渲染失败:', err);
      this.setLoading(false);
      this.error = err instanceof Error ? err.message : TEXT.errorLoad;
      this.renderError();
    }
  }

  async search(term: string): Promise<void> {
    this.searchTerm = term.trim();
    await this.refreshList();
  }

  async filter(options: FilterOptions): Promise<void> {
    this.currentFilter = { ...options };
    await this.refreshList();
  }

  async loadData(): Promise<void> {
    await this.render();
  }

  destroy(): void {
    // 事件解绑
    const searchInput = this.container.querySelector('#persona-search') as HTMLInputElement | null;
    searchInput?.removeEventListener('input', this.searchInputHandler as EventListener);

    const clearBtn = this.container.querySelector('#clear-search');
    clearBtn?.removeEventListener('click', this.clearButtonHandler as EventListener);

    const list = this.container.querySelector('.persona-list-content');
    list?.removeEventListener('click', this.listDelegateHandler as EventListener);

    const createBtn = this.container.querySelector('.create-new-btn');
    createBtn?.removeEventListener('click', this.headerCreateHandler as EventListener);

    const retryBtn = this.container.querySelector('.retry-btn');
    retryBtn?.removeEventListener('click', this.retryHandler as EventListener);

    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }

    this.container.innerHTML = '';
  }

  selectItem(id: string, type: ItemType): void {
    this.clearSelection(); // 单选逻辑保持
    this.selectedItems.add(id);
    this.updateItemSelection(id, true);
    this.events.onSelect(id, type);
  }

  toggleItemSelection(id: string): void {
    const selected = this.selectedItems.has(id);
    if (selected) {
      this.selectedItems.delete(id);
    } else {
      this.selectedItems.add(id);
    }
    this.updateItemSelection(id, !selected);
  }

  clearSelection(): void {
    if (this.selectedItems.size === 0) return;
    const ids = Array.from(this.selectedItems);
    this.selectedItems.clear();
    const selector = ids.map(id => `[data-id="${CSS.escape(id)}"]`).join(',');
    const nodes = this.container.querySelectorAll(selector);
    nodes.forEach(node => node.classList.remove('selected'));
  }

  // 内部方法
  private async refreshList(): Promise<void> {
    if (!this.data) return;
    try {
      this.setLoading(true);
      this.updateLoadingState();
      const token = ++this.lastQueryToken;

      let filteredPersonas: Persona[] = [];
      let filteredUserRoles: UserRole[] = [];

      const type = this.currentFilter.type ?? 'all';
      const needAI = type !== 'user';
      const needUser = type !== 'ai';

      if (this.searchTerm) {
        const searchOptions: SearchOptions = { term: this.searchTerm, filters: this.currentFilter };
        const tasks: Promise<void>[] = [];

        if (needAI) {
          tasks.push(
              this.personaService.search(searchOptions).then(r => {
                if (token === this.lastQueryToken) filteredPersonas = r;
              })
          );
        }
        if (needUser) {
          tasks.push(
              this.userRoleService.search(searchOptions).then(r => {
                if (token === this.lastQueryToken) filteredUserRoles = r;
              })
          );
        }
        await Promise.all(tasks);
        if (token !== this.lastQueryToken) return; // 过期请求丢弃
      } else {
        if (needAI) filteredPersonas = this.applyFilters(this.data.personas, this.currentFilter);
        if (needUser) filteredUserRoles = this.applyFilters(this.data.userRoles, this.currentFilter);
      }

      const items = this.buildListItems(filteredPersonas, filteredUserRoles);
      this.setLoading(false);
      this.error = undefined;

      const content = this.container.querySelector('.persona-list-content');
      if (content) {
        content.innerHTML = this.renderListItems(items);
      }
    } catch (err) {
      console.error('刷新列表失败:', err);
      this.setLoading(false);
      this.error = TEXT.errorRefresh;
      this.updateErrorState();
    }
  }

  // 本地更新删除（避免全量重拉）
  private async deleteItem(id: string, type: ItemType): Promise<void> {
    try {
      if (type === 'ai') {
        await this.personaService.delete(id);
        if (this.data) {
          this.data.personas = this.data.personas.filter(p => p.id !== id);
        }
      } else {
        await this.userRoleService.delete(id);
        if (this.data) {
          this.data.userRoles = this.data.userRoles.filter(u => u.id !== id);
        }
      }

      await this.refreshList();
      this.events.onDelete(id, type);
    } catch (err) {
      console.error('删除失败:', err);
      this.showError(err instanceof Error ? err.message : TEXT.errorRefresh);
    }
  }

  private buildListItems(personas: Persona[], userRoles: UserRole[]): PersonaListItem[] {
    // 修复：将只读 tags 拷贝为可变数组，满足 PersonaListItem.tags: string[]
    const aiItems: PersonaListItem[] = personas.map(p => ({
      id: p.id,
      name: p.name,
      type: 'ai',
      tags: Array.from(p.tags as readonly string[]),
      lastUsedAt: p.lastUsedAt
    }));

    const userItems: PersonaListItem[] = userRoles.map(u => ({
      id: u.id,
      name: u.name,
      type: 'user',
      tags: Array.from(u.tags as readonly string[]),
      lastUsedAt: u.lastUsedAt
    }));

    const all = aiItems.concat(userItems);
    all.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    return all;
  }

  private applyFilters<T extends Persona | UserRole>(items: T[], filters: FilterOptions): T[] {
    if (!filters.tags || filters.tags.length === 0) return items;
    const tagsSet = new Set(filters.tags);
    return items.filter(item => {
      const tags = item.tags as readonly string[];
      return tags.some(tag => tagsSet.has(tag));
    });
  }

  private renderContent(items: PersonaListItem[]): void {
    const search = this.escapeHtml(this.searchTerm);
    this.container.innerHTML = `
      <div class="persona-list-container">
        <div class="persona-list-header">
          <div class="search-container">
            <input type="text" id="persona-search" placeholder="${TEXT.searchPlaceholder}" value="${search}">
            <button id="clear-search" class="clear-btn" ${this.searchTerm ? '' : 'style="display:none"'}>✕</button>
          </div>
          <div class="filter-container"></div>
          <button class="btn btn-primary create-new-btn" style="margin-left:auto">${TEXT.createRole}</button>
        </div>
        <div class="persona-list-content">
          ${this.renderListItems(items)}
        </div>
      </div>
    `;
  }

  private renderListItems(items: PersonaListItem[]): string {
    const type = this.currentFilter.type ?? 'all';
    if (items.length === 0) {
      const typeText = type === 'ai' ? TEXT.groupAI : type === 'user' ? TEXT.groupUser : '角色';
      const createText = typeText === TEXT.groupAI ? '角色' : typeText;
      return `
        <div class="empty-state">
          <div class="empty-icon">${TEXT.emptyIcon}</div>
          <h4>${TEXT.empty(typeText)}</h4>
          <p>${TEXT.emptySub(typeText)}</p>
          <button class="btn btn-primary create-empty-btn" data-empty-create="${type === 'user' ? 'user' : 'ai'}">新建${createText}</button>
        </div>
      `;
    }

    const grouped = this.groupItemsByType(items);
    const activeType: 'ai' | 'user' | 'all' = type === 'ai' || type === 'user' ? type : 'all';

    const renderGroup = (title: string, list: PersonaListItem[]) => `
      <div class="item-group">
        <div class="group-title">
          <span>${title} (${list.length})</span>
        </div>
        ${list.map(i => this.renderListItem(i)).join('')}
      </div>`;

    let html = '';
    if (activeType === 'all' || activeType === 'ai') {
      if (grouped.ai.length) html += renderGroup(TEXT.groupAI, grouped.ai);
    }
    if (activeType === 'all' || activeType === 'user') {
      if (grouped.user.length) html += renderGroup(TEXT.groupUser, grouped.user);
    }
    return html;
  }

  private renderListItem(item: PersonaListItem): string {
    const isSelected = this.selectedItems.has(item.id);
    const lastUsedText = this.formatLastUsed(item.lastUsedAt);
    const safeName = this.escapeHtml(item.name);
    const tags = item.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('');

    return `
      <div class="list-item ${isSelected ? 'selected' : ''}" data-id="${this.escapeAttr(item.id)}" data-type="${item.type}">
        <div class="item-content" data-action="select">
          <div class="item-main">
            <span class="item-name">${safeName}</span>
            <span class="item-type-badge ${item.type}">${item.type === 'ai' ? 'AI' : '用户'}</span>
          </div>
          <div class="item-meta">
            <span class="item-tags">${tags}</span>
            <span class="item-last-used">${lastUsedText}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="action-btn small" data-action="edit">${TEXT.btnEdit}</button>
          <button class="action-btn small danger" data-action="delete">${TEXT.btnDelete}</button>
        </div>
      </div>
    `;
  }

  private groupItemsByType(items: PersonaListItem[]): GroupedItems {
    const groups: GroupedItems = { ai: [], user: [] };
    for (const it of items) groups[it.type].push(it);
    return groups;
  }

  private formatLastUsed(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
    if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}天前`;
    return new Date(timestamp).toLocaleDateString();
  }

  private renderLoading(): void {
    this.container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>${TEXT.loading}</p>
      </div>
    `;
  }

  private renderError(): void {
    this.container.innerHTML = `
      <div class="error-state">
        <p class="error-message">${this.escapeHtml(this.error || TEXT.errorLoad)}</p>
        <button class="retry-btn">${TEXT.retry}</button>
      </div>
    `;
    const retryBtn = this.container.querySelector('.retry-btn')!;
    this.retryHandler = () => this.render();
    retryBtn.addEventListener('click', this.retryHandler);
  }

  private updateLoadingState(): void {
    const content = this.container.querySelector('.persona-list-content');
    if (content) content.innerHTML = '<div class="loading-spinner small"></div>';
  }

  private updateErrorState(): void {
    const content = this.container.querySelector('.persona-list-content');
    if (content) content.innerHTML = `<div class="error-message">${this.escapeHtml(this.error || TEXT.errorRefresh)}</div>`;
  }

  private updateItemSelection(id: string, selected: boolean): void {
    const item = this.container.querySelector(`[data-id="${CSS.escape(id)}"]`);
    item?.classList.toggle('selected', selected);
  }

  private showError(message: string): void {
    console.error('PersonaList Error:', message);
    // 可接入全局toast
  }

  private attachEventListeners(): void {
    // 搜索输入 + 防抖
    const searchInput = this.container.querySelector('#persona-search') as HTMLInputElement | null;
    if (searchInput) {
      this.searchInputHandler = () => {
        if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = window.setTimeout(() => {
          this.search(searchInput.value);
        }, 300);
      };
      searchInput.addEventListener('input', this.searchInputHandler);
    }

    // 清除搜索
    const clearBtn = this.container.querySelector('#clear-search');
    if (clearBtn) {
      this.clearButtonHandler = () => {
        if (searchInput) searchInput.value = '';
        this.search('');
        clearBtn.setAttribute('style', 'display:none');
      };
      clearBtn.addEventListener('click', this.clearButtonHandler);
    }

    // 创建按钮（头部）
    const createBtn = this.container.querySelector('.create-new-btn');
    if (createBtn) {
      this.headerCreateHandler = () => {
        const t = this.currentFilter.type === 'user' ? 'user' : 'ai';
        this.events.onCreate(t);
      };
      createBtn.addEventListener('click', this.headerCreateHandler);
    }

    // 列表事件委托（精简版）
    const list = this.container.querySelector('.persona-list-content');
    if (list) {
      this.listDelegateHandler = async (e: Event) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        // 空状态新建
        const emptyBtn = target.closest<HTMLButtonElement>('.create-empty-btn');
        if (emptyBtn) {
          const t = (emptyBtn.dataset.emptyCreate as ItemType) || 'ai';
          this.events.onCreate(t);
          return;
        }

        // 统一处理 data-action
        const actionEl = target.closest<HTMLElement>('[data-action]');
        if (!actionEl) return;

        const itemEl = actionEl.closest<HTMLElement>('.list-item');
        if (!itemEl) return;

        const id = itemEl.dataset.id as string | undefined;
        const type = (itemEl.dataset.type as ItemType | undefined) || 'ai';
        if (!id) return;

        const action = actionEl.dataset.action;
        switch (action) {
          case 'select':
          case 'edit':
            this.selectItem(id, type);
            break;
          case 'delete':
            if (confirm(TEXT.confirmDelete)) {
              await this.deleteItem(id, type);
            }
            break;
        }
      };
      list.addEventListener('click', this.listDelegateHandler);
    }
  }

  private setLoading(v: boolean): void {
    this.loading = v;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeAttr(text: string): string {
    return this.escapeHtml(text);
  }
}
