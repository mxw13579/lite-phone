// PersonaList组件 - 左侧角色列表
// 负责显示Persona和UserRole的列表，支持搜索、筛选和批量操作

import type { 
  PersonaListEvents,
  PersonaListItem,
  FilterOptions,
  SearchOptions,
  ComponentState
} from '../types/ComponentTypes';

import type { Persona, UserRole } from '../types/PersonaTypes';
import { PersonaService } from '../services/PersonaService';
import { UserRoleService } from '../services/UserRoleService';

export class PersonaListComponent {
  private container: HTMLElement;
  private personaService: PersonaService;
  private userRoleService: UserRoleService;
  private events: PersonaListEvents;
  private state: ComponentState;
  
  private currentFilter: FilterOptions = { type: 'all' };
  private searchTerm: string = '';
  private selectedItems: Set<string> = new Set();
  
  // 事件处理器引用，用于正确清理
  private searchInputHandler?: (event: Event) => void;
  private clearButtonHandler?: (event: Event) => void;

  constructor(container: HTMLElement, events: PersonaListEvents) {
    this.container = container;
    this.events = events;
    this.personaService = new PersonaService();
    this.userRoleService = new UserRoleService();
    
    this.state = {
      loading: false,
      error: undefined,
      data: null,
      selectedItems: this.selectedItems,
      editMode: false
    };
  }

  async render(): Promise<void> {
    try {
      this.state.loading = true;
      this.renderLoading();

      const [personas, userRoles] = await Promise.all([
        this.personaService.getAll(),
        this.userRoleService.getAll()
      ]);

      const items = this.buildListItems(personas, userRoles);
      this.state.data = { personas, userRoles, items };
      this.state.loading = false;
      this.state.error = undefined;

      this.renderContent();
      this.attachEventListeners();
    } catch (error) {
      console.error('PersonaList渲染失败:', error);
      this.state.loading = false;
      this.state.error = error instanceof Error ? error.message : '加载失败';
      this.renderError();
    }
  }

  // 搜索功能
  async search(term: string): Promise<void> {
    this.searchTerm = term.trim();
    await this.refreshList();
  }

  // 筛选功能
  async filter(options: FilterOptions): Promise<void> {
    this.currentFilter = { ...options };
    await this.refreshList();
  }

  // 刷新列表
  private async refreshList(): Promise<void> {
    if (!this.state.data) return;

    try {
      this.state.loading = true;
      this.updateLoadingState();

      let filteredPersonas: Persona[] = [];
      let filteredUserRoles: UserRole[] = [];

      if (this.searchTerm) {
        // 有搜索词时使用搜索
        const searchOptions: SearchOptions = {
          term: this.searchTerm,
          filters: this.currentFilter
        };

        if (this.currentFilter.type !== 'user') {
          filteredPersonas = await this.personaService.search(searchOptions);
        }
        if (this.currentFilter.type !== 'ai') {
          filteredUserRoles = await this.userRoleService.search(searchOptions);
        }
      } else {
        // 无搜索词时直接筛选
        if (this.currentFilter.type !== 'user') {
          filteredPersonas = this.applyFilters(this.state.data.personas, this.currentFilter);
        }
        if (this.currentFilter.type !== 'ai') {
          filteredUserRoles = this.applyFilters(this.state.data.userRoles, this.currentFilter);
        }
      }

      const items = this.buildListItems(filteredPersonas, filteredUserRoles);
      this.state.loading = false;
      
      // 将渲染结果写回DOM，避免一直显示加载中
      const content = this.container.querySelector('.persona-list-content');
      if (content) {
        content.innerHTML = this.renderListItems(items);
      }
    } catch (error) {
      console.error('刷新列表失败:', error);
      this.state.loading = false;
      this.state.error = '刷新失败';
      this.updateErrorState();
    }
  }

  // 选择项目
  selectItem(id: string, type: 'ai' | 'user'): void {
    // 清除之前的选择
    this.clearSelection();
    
    // 设置新选择
    this.selectedItems.add(id);
    this.updateItemSelection(id, true);
    
    // 触发事件
    this.events.onSelect(id, type);
  }

  // 切换选择状态（用于多选）
  toggleItemSelection(id: string): void {
    if (this.selectedItems.has(id)) {
      this.selectedItems.delete(id);
      this.updateItemSelection(id, false);
    } else {
      this.selectedItems.add(id);
      this.updateItemSelection(id, true);
    }
  }

  // 清除选择
  clearSelection(): void {
    this.selectedItems.forEach(id => {
      this.updateItemSelection(id, false);
    });
    this.selectedItems.clear();
  }

  // 加载数据（用于外部刷新）
  async loadData(): Promise<void> {
    await this.render();
  }

  // 销毁组件
  destroy(): void {
    // 清理全局事件处理器
    delete (window as any).handleItemClick;
    delete (window as any).handleItemAction;
    
    // 清理DOM事件监听器 - 保存引用以便正确移除
    if (this.searchInputHandler) {
      const searchInput = this.container.querySelector('#persona-search') as HTMLInputElement;
      if (searchInput) {
        searchInput.removeEventListener('input', this.searchInputHandler);
      }
    }
    
    if (this.clearButtonHandler) {
      const clearBtn = this.container.querySelector('#clear-search');
      if (clearBtn) {
        clearBtn.removeEventListener('click', this.clearButtonHandler);
      }
    }
    
    this.container.innerHTML = '';
  }

  // 删除项目
  private async deleteItem(id: string, type: 'ai' | 'user'): Promise<void> {
    try {
      if (type === 'ai') {
        await this.personaService.delete(id);
      } else {
        await this.userRoleService.delete(id);
      }
      
      // 刷新列表
      await this.render();
      
      // 触发删除事件
      this.events.onDelete(id, type);
    } catch (error) {
      console.error('删除失败:', error);
      this.showError(error instanceof Error ? error.message : '删除失败');
    }
  }

  // 构建列表项数据
  private buildListItems(personas: Persona[], userRoles: UserRole[]): PersonaListItem[] {
    const items: PersonaListItem[] = [];

    // 添加AI角色
    personas.forEach(persona => {
      items.push({
        id: persona.id,
        name: persona.name,
        type: 'ai',
        tags: persona.tags,
        lastUsedAt: persona.lastUsedAt
      });
    });

    // 添加用户角色
    userRoles.forEach(userRole => {
      items.push({
        id: userRole.id,
        name: userRole.name,
        type: 'user',
        tags: userRole.tags,
        lastUsedAt: userRole.lastUsedAt
      });
    });

    // 排序：按最近使用时间排序
    return items.sort((a, b) => {
      return b.lastUsedAt - a.lastUsedAt;
    });
  }

  // 应用筛选器
  private applyFilters<T extends Persona | UserRole>(items: T[], filters: FilterOptions): T[] {
    let filtered = items;

    // 按类型筛选
    if (filters.type && filters.type !== 'all') {
      // 这里实际上不需要再次按type筛选，因为调用时已经分开处理了
    }

    // 按标签筛选
    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(item => 
        filters.tags!.some(tag => item.tags.includes(tag))
      );
    }

    return filtered;
  }

  // 渲染内容
  private renderContent(): void {
    if (!this.state.data) return;

    const items = this.state.data.items;
    
    this.container.innerHTML = `
      <div class="persona-list-container">
        <div class="persona-list-header">
          <div class="search-container">
            <input type="text" id="persona-search" placeholder="搜索角色..." value="${this.searchTerm}">
            <button id="clear-search" class="clear-btn" ${this.searchTerm ? '' : 'style="display:none"'}>✕</button>
          </div>
          <div class="filter-container"></div>
        </div>
        <div class="persona-list-content">
          ${this.renderListItems(items)}
        </div>
      </div>
    `;
  }

  // 渲染列表项
  private renderListItems(items: PersonaListItem[]): string {
    if (items.length === 0) {
      const currentType = this.currentFilter.type;
      const typeText = currentType === 'ai' ? 'AI角色' : currentType === 'user' ? '用户角色' : '角色';
      const createHandler = currentType === 'user' ? 'window.personaCenterScreen?.createNewUserRole()' : 'window.personaCenterScreen?.createNewPersona()';
      
      return `
        <div class="empty-state">
          <div class="empty-icon">🎭</div>
          <h4>暂无${typeText}</h4>
          <p>创建您的第一个${typeText}开始使用</p>
          <button class="btn btn-primary" onclick="${createHandler}">新建${typeText === 'AI角色' ? '角色' : typeText}</button>
        </div>
      `;
    }

    const groupedItems = this.groupItemsByType(items);
    const activeType = this.currentFilter.type === 'ai' ? 'ai' : this.currentFilter.type === 'user' ? 'user' : 'all';
    let html = '';

    const renderGroup = (title: string, list: PersonaListItem[], type: 'ai'|'user') => `
      <div class="item-group">
        <div class="group-title">
          <span>${title} (${list.length})</span>
        </div>
        ${list.map(item => this.renderListItem(item)).join('')}
      </div>`;

    if (activeType === 'all' || activeType === 'ai') {
      if (groupedItems.ai.length > 0) html += renderGroup('AI角色', groupedItems.ai, 'ai');
    }
    if (activeType === 'all' || activeType === 'user') {
      if (groupedItems.user.length > 0) html += renderGroup('用户角色', groupedItems.user, 'user');
    }

    return html;
  }

  // 渲染单个列表项
  private renderListItem(item: PersonaListItem): string {
    const isSelected = this.selectedItems.has(item.id);
    const lastUsedText = this.formatLastUsed(item.lastUsedAt);
    
    return `
      <div class="list-item ${isSelected ? 'selected' : ''}" 
           data-id="${item.id}" data-type="${item.type}">
        <div class="item-content" onclick="handleItemClick('${item.id}', '${item.type}')">
          <div class="item-main">
            <span class="item-name">${this.escapeHtml(item.name)}</span>
            <span class="item-type-badge ${item.type}">${item.type === 'ai' ? 'AI' : '用户'}</span>
          </div>
          <div class="item-meta">
            <span class="item-tags">${item.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}</span>
            <span class="item-last-used">${lastUsedText}</span>
          </div>
        </div>
        <div class="item-actions">
          <button class="action-btn small" onclick="handleItemAction('${item.id}', '${item.type}', 'edit')">编辑</button>
          <button class="action-btn small danger" onclick="handleItemAction('${item.id}', '${item.type}', 'delete')">删除</button>
        </div>
      </div>
    `;
  }

  // 按类型分组
  private groupItemsByType(items: PersonaListItem[]): { ai: PersonaListItem[], user: PersonaListItem[] } {
    return items.reduce((groups, item) => {
      groups[item.type].push(item);
      return groups;
    }, { ai: [] as PersonaListItem[], user: [] as PersonaListItem[] });
  }

  // 格式化最后使用时间
  private formatLastUsed(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 2592000000) return `${Math.floor(diff / 86400000)}天前`;
    
    return new Date(timestamp).toLocaleDateString();
  }

  // 渲染加载状态
  private renderLoading(): void {
    this.container.innerHTML = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    `;
  }

  // 渲染错误状态
  private renderError(): void {
    this.container.innerHTML = `
      <div class="error-state">
        <p class="error-message">${this.state.error}</p>
        <button onclick="this.render()" class="retry-btn">重试</button>
      </div>
    `;
  }

  // 更新加载状态
  private updateLoadingState(): void {
    const content = this.container.querySelector('.persona-list-content');
    if (content) {
      content.innerHTML = '<div class="loading-spinner small"></div>';
    }
  }

  // 更新错误状态
  private updateErrorState(): void {
    const content = this.container.querySelector('.persona-list-content');
    if (content) {
      content.innerHTML = `<div class="error-message">${this.state.error}</div>`;
    }
  }

  // 更新选择状态
  private updateItemSelection(id: string, selected: boolean): void {
    const item = this.container.querySelector(`[data-id="${id}"]`);
    if (item) {
      item.classList.toggle('selected', selected);
    }
  }

  // 显示错误信息
  private showError(message: string): void {
    // 这里可以集成到全局错误处理系统
    console.error('PersonaList Error:', message);
    // 可以显示toast通知或其他用户友好的错误提示
  }

  // 事件监听器
  private attachEventListeners(): void {
    // 搜索输入
    const searchInput = this.container.querySelector('#persona-search') as HTMLInputElement;
    if (searchInput) {
      let searchTimeout: number;
      this.searchInputHandler = () => {
        clearTimeout(searchTimeout);
        searchTimeout = window.setTimeout(() => {
          this.search(searchInput.value);
        }, 300);
      };
      searchInput.addEventListener('input', this.searchInputHandler);
    }

    // 清除搜索
    const clearBtn = this.container.querySelector('#clear-search');
    if (clearBtn) {
      this.clearButtonHandler = () => {
        if (searchInput) {
          searchInput.value = '';
        }
        this.search('');
      };
      clearBtn.addEventListener('click', this.clearButtonHandler);
    }

    // 类型筛选
    // 顶部已分AI/用户，不再提供二次筛选

    // 状态筛选
    // 去除状态筛选（不再需要）

    // 新建按钮移至页面头部，不在列表中重复提供

    // 顶部新增"新建"按钮（与列表同级）- 检查是否已存在以避免重复
    const header = this.container.querySelector('.persona-list-header');
    if (header) {
      // 检查是否已经存在新建按钮，避免重复添加
      const existingBtn = header.querySelector('.create-new-btn');
      if (!existingBtn) {
        const btn = document.createElement('button');
        // 使用常规按钮样式，避免 icon 按钮的固定宽度导致文字竖排
        btn.className = 'btn btn-primary create-new-btn';
        btn.textContent = '新建角色';
        btn.style.marginLeft = 'auto';
        btn.addEventListener('click', () => {
          if (this.currentFilter.type === 'user') {
            this.events.onCreate('user');
          } else {
            this.events.onCreate('ai');
          }
        });
        header.appendChild(btn);
      }
    }

    // 全局事件处理函数
    (window as any).handleItemClick = (id: string, type: 'ai' | 'user') => {
      this.selectItem(id, type);
    };

    (window as any).handleItemAction = async (id: string, type: 'ai' | 'user', action: string) => {
      switch (action) {
        case 'edit':
          this.selectItem(id, type);
          break;
        case 'delete':
          if (confirm('确定要删除这个角色吗？此操作无法撤销。')) {
            await this.deleteItem(id, type);
          }
          break;
      }
    };
  }

  // HTML转义
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}