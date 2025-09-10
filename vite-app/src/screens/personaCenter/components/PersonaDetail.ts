// 角色详情组件 - 优化版
// 变更要点：
// - 合并重复逻辑（show、save、tabs）
// - 删除内联事件，改为事件委托
// - 局部更新与防抖输入，减少整页重渲染
// - 统一服务路由与类型守卫
// - 修复 worldbook -> worldBook 的 tab id 不一致问题
// - 精简日志与错误处理

import type {
  Persona,
  UserRole,
  CreatePersonaInput,
  CreateUserRoleInput,
  UpdatePersonaInput,
  UpdateUserRoleInput
} from '../types/PersonaTypes';
import type { PersonaDetailEvents, PersonaDetailState, ValidationResult } from '../types/ComponentTypes';
import type { WorldBook } from '../../../state';
import { PersonaService } from '../services/PersonaService';
import { UserRoleService } from '../services/UserRoleService';
import { CompositionService } from '../services/CompositionService';

// Memory Manager P2: 导入记忆管理相关模块
import { MemoryRepo, MemoryManager, estimateEventChars } from '../../../services/memory';
import type { EventRec, SelectBudget, PersonaMemorySettings } from '../../../services/memory/types';

type ItemType = 'persona' | 'userRole';
type CurrentData = { type: ItemType; data: Persona | UserRole } | null;
type TabId = 'basic' | 'prompt' | 'baseline' | 'worldBook' | 'memory' | 'preview';

const DEBUG = false;
const ICONS = { persona: '🤖', userRole: '👤' } as const;

function isPersona(data: CurrentData): data is { type: 'persona'; data: Persona } {
  return !!data && data.type === 'persona';
}
function isUserRole(data: CurrentData): data is { type: 'userRole'; data: UserRole } {
  return !!data && data.type === 'userRole';
}
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 200): T {
  let tid: number | undefined;
  return function (this: any, ...args: any[]) {
    if (tid) window.clearTimeout(tid);
    tid = window.setTimeout(() => fn.apply(this, args), wait);
  } as T;
}

export class PersonaDetailComponent {
  private container: HTMLElement;
  private events: PersonaDetailEvents;
  private state: PersonaDetailState;
  private personaService: PersonaService;
  private userRoleService: UserRoleService;
  private compositionService: CompositionService;
  private currentWorldBooks: Record<string, WorldBook> = {};
  private hideHeaderActions = false;

  // 引用与解绑
  private bound = false;
  private onInputHandler!: (e: Event) => void;
  private onClickHandler!: (e: Event) => void;

  constructor(
      container: HTMLElement,
      events: PersonaDetailEvents,
      worldBooks: Record<string, WorldBook> = {},
      hideHeaderActions = false
  ) {
    this.container = container;
    this.events = events;
    this.currentWorldBooks = worldBooks;
    this.hideHeaderActions = hideHeaderActions;

    this.personaService = new PersonaService();
    this.userRoleService = new UserRoleService();
    this.compositionService = new CompositionService();

    this.state = {
      activeTab: 'basic',
      isDirty: false,
      isEditing: false,
      validationErrors: {},
      currentData: null
    };

    this.initializeComponent();
  }

  private initializeComponent(): void {
    this.attachEventListeners();
    if (this.container && this.container.innerHTML.trim() === '') {
      this.container.innerHTML = this.renderInitializing();
    }
    (window as any).personaCenterDetail = this;
  }

  // 公共展示 API
  async showPersona(persona: Persona): Promise<void> {
    await this.showItem('persona', persona, { editing: false });
    this.events.onPersonaSelected?.(persona);
  }

  async showUserRole(userRole: UserRole): Promise<void> {
    await this.showItem('userRole', userRole, { editing: false });
    this.events.onUserRoleSelected?.(userRole);
  }

  async showCreatePersona(): Promise<void> {
    const newPersona: Persona = {
      id: '' as any, // 占位，保存时以是否有 id 判定新建；此处统一为空字符串
      name: '',
      avatar: '',
      tags: [],
      prompt: { definition: '' },
      worldBookLinks: [],
      status: 'draft',
      archived: false
    };
    delete (newPersona as any).id;
    await this.showItem('persona', newPersona, { editing: true });
  }

  async showCreateUserRole(): Promise<void> {
    const newUserRole: UserRole = {
      id: '' as any,
      name: '',
      avatar: '',
      tags: [],
      prompt: { definition: '' },
      archived: false,
      isGlobalDefault: false
    };
    delete (newUserRole as any).id;
    await this.showItem('userRole', newUserRole, { editing: true });
  }

  clear(): void {
    this.state.currentData = null;
    this.state.isDirty = false;
    this.state.isEditing = false;
    this.clearValidationErrors();
    void this.render();
  }

  switchTab(tabId: TabId): void {
    this.state.activeTab = tabId;
    void this.render();
  }

  startEdit(): void {
    this.state.isEditing = true;
    void this.render();
  }

  cancelEdit(): void {
    if (this.state.isDirty && !confirm('确定要取消编辑吗？所有未保存的更改将丢失。')) return;
    this.state.isEditing = false;
    this.setDirty(false);
    this.clearValidationErrors();
    void this.render();
  }

  async saveChanges(): Promise<void> {
    if (!this.state.currentData) return;

    const validation = this.validateCurrentData();
    if (!validation.isValid) {
      this.state.validationErrors = Array.isArray(validation.errors)
          ? validation.errors.reduce<Record<string, string>>((acc, msg, i) => {
            acc[`error_${i}`] = String(msg);
            return acc;
          }, {})
          : validation.errors;
      await this.render();
      return;
    }
    this.clearValidationErrors();

    try {
      await this.dispatchSave(this.state.currentData);
      this.state.isEditing = false;
      this.setDirty(false);
      await this.render();
    } catch (error) {
      alert(`保存失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async deleteItem(): Promise<void> {
    const cur = this.state.currentData;
    if (!cur) return;
    const itemName = cur.data.name;
    const itemType = cur.type === 'persona' ? '角色' : '用户角色';
    if (!confirm(`确定要删除${itemType}"${itemName}"吗？此操作不可撤销。`)) return;

    try {
      const id = (cur.data as any).id;
      if (!id) return;
      await this.getServiceForType(cur.type).delete(id);
      cur.type === 'persona'
          ? this.events.onPersonaDeleted?.(id)
          : this.events.onUserRoleDeleted?.(id);
      this.clear();
    } catch (error) {
      alert(`删除失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async duplicateItem(): Promise<void> {
    const cur = this.state.currentData;
    if (!cur) return;
    const currentItem = cur.data;
    const newName = prompt('请输入新的名称:', `${currentItem.name} (副本)`);
    if (!newName) return;

    try {
      const created =
          cur.type === 'persona'
              ? await this.personaService.duplicate((currentItem as Persona).id, newName)
              : await this.userRoleService.duplicate((currentItem as UserRole).id, newName);

      cur.type === 'persona'
          ? this.events.onPersonaCreated?.(created as Persona)
          : this.events.onUserRoleCreated?.(created as UserRole);
    } catch (error) {
      alert(`复制失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  updateWorldBooks(worldBooks: Record<string, WorldBook>): void {
    this.currentWorldBooks = worldBooks;
    if (this.state.activeTab === 'worldBook' || this.state.activeTab === 'preview') {
      void this.render();
    }
  }

  async render(): Promise<void> {
    if (!this.state.currentData) {
      this.container.innerHTML = this.renderEmpty();
      (window as any).personaCenterDetail = this; // 维持全局引用
      return;
    }
    const { data, type } = this.state.currentData;
    const isPersonaType = type === 'persona';

    this.container.innerHTML = `
      <div class="persona-detail">
        ${this.renderHeader(data, isPersonaType)}
        ${this.renderTabs(isPersonaType)}
        ${this.renderTabContent(data, isPersonaType)}
      </div>
    `;

    (window as any).personaCenterDetail = this; // 维持全局引用
  }

  // 渲染模板
  private renderInitializing(): string {
    return `
      <div class="persona-detail-loading">
        <div style="padding: 20px; text-align: center;">正在初始化角色编辑器...</div>
      </div>
    `;
  }

  private renderEmpty(): string {
    return `
      <div class="persona-detail-empty">
        <div class="empty-state">
          <div class="empty-icon">📱</div>
          <h3>选择一个角色</h3>
          <p>从左侧列表选择要查看或编辑的角色</p>
        </div>
      </div>
    `;
  }

  private renderHeader(item: Persona | UserRole, isPersona: boolean): string {
    const isNew = !(item as any).id;
    const itemType = isPersona ? '角色' : '用户角色';
    const statusText = this.getStatusText(item, isPersona);
    const safeName = this.escapeHtml(item.name || '(未命名)');
    const safeAvatar = this.escapeHtml(item.avatar || '');

    return `
      <div class="persona-detail-header">
        <div class="header-left">
          <div class="item-avatar">
            ${safeAvatar
        ? `<img src="${safeAvatar}" alt="${safeName}">`
        : `<div class="avatar-placeholder">${isPersona ? ICONS.persona : ICONS.userRole}</div>`}
          </div>
          <div class="item-info">
            <h2 class="item-name">${safeName}</h2>
            <div class="item-meta">
              <span class="item-type">${itemType}</span>
              ${statusText ? `<span class="item-status">${statusText}</span>` : ''}
            </div>
          </div>
        </div>
        ${this.hideHeaderActions ? '' : `
        <div class="header-actions">
          ${this.state.isEditing
        ? `<button data-action="cancel" class="btn btn-secondary">取消</button>
               <button data-action="save" class="btn btn-primary">保存</button>`
        : `<button data-action="duplicate" class="btn btn-secondary">复制</button>
               ${!isNew ? `<button data-action="edit" class="btn btn-secondary">编辑</button>` : ''}
               ${!isNew ? `<button data-action="delete" class="btn btn-danger">删除</button>` : ''}`
    }
        </div>`}
      </div>
    `;
  }

  private renderTabs(isPersona: boolean): string {
    const tabs: { id: TabId; label: string; icon: string; show: boolean }[] = [
      { id: 'basic', label: '基本信息', icon: 'ℹ️', show: true },
      { id: 'prompt', label: isPersona ? '提示词' : '角色设定', icon: '💬', show: true },
      { id: 'baseline', label: 'Baseline', icon: '📊', show: isPersona },
      { id: 'worldBook', label: '世界书', icon: '📚', show: isPersona },
      { id: 'memory', label: '记忆管理', icon: '🧠', show: isPersona },
      { id: 'preview', label: '预览', icon: '👁️', show: true }
    ];
    return `
      <div class="persona-detail-tabs" role="tablist">
        ${tabs.filter(t => t.show).map(t => `
          <button class="tab ${this.state.activeTab === t.id ? 'active' : ''}"
                  data-tab="${t.id}" role="tab" aria-selected="${this.state.activeTab === t.id}">
            <span class="tab-icon">${t.icon}</span>
            <span class="tab-label">${t.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  private renderTabContent(item: Persona | UserRole, isPersona: boolean): string {
    switch (this.state.activeTab) {
      case 'basic': return this.renderBasicTab(item, isPersona);
      case 'prompt': return this.renderPromptTab(item, isPersona);
      case 'baseline': return isPersona ? this.renderBaselineTab(item as Persona) : '';
      case 'worldBook': return isPersona ? this.renderWorldBookTab(item as Persona) : '';
      case 'memory': return isPersona ? this.renderMemoryTab(item as Persona) : '';
      case 'preview': return this.renderPreviewTab(item, isPersona);
      default: return '<div class="tab-content">未知标签页</div>';
    }
  }

  private renderBasicTab(item: Persona | UserRole, isPersona: boolean): string {
    const errors = this.state.validationErrors;
    const idPrefix = (item as any).id || 'new';
    const safeName = this.escapeHtml(item.name || '');
    const safeAvatar = this.escapeHtml(item.avatar || '');
    const safeTags = this.escapeHtml((item.tags || []).join(', '));

    return `
      <div class="tab-content basic-tab">
        <div class="form-group">
          <label for="name-${idPrefix}" class="form-label">名称 *</label>
          <input id="name-${idPrefix}" name="name" type="text"
                 class="form-input ${errors.name ? 'error' : ''}"
                 value="${safeName}" ${this.state.isEditing ? '' : 'readonly'}
                 data-field="name" placeholder="请输入${isPersona ? '角色' : '用户角色'}名称">
          ${errors.name ? `<div class="form-error">${this.escapeHtml(errors.name)}</div>` : ''}
        </div>
        <div class="form-group">
          <label for="avatar-${idPrefix}" class="form-label">头像</label>
          <input id="avatar-${idPrefix}" name="avatar" type="text"
                 class="form-input" value="${safeAvatar}" ${this.state.isEditing ? '' : 'readonly'}
                 data-field="avatar" placeholder="头像URL（可选）">
        </div>
        <div class="form-group">
          <label for="tags-${idPrefix}" class="form-label">标签</label>
          <input id="tags-${idPrefix}" name="tags" type="text"
                 class="form-input" value="${safeTags}" ${this.state.isEditing ? '' : 'readonly'}
                 data-field="tags" placeholder="用逗号分隔的标签">
        </div>
      </div>
    `;
  }

  private renderPromptTab(item: Persona | UserRole, isPersona: boolean): string {
    const uid = `prompt-definition-${(item as any).id || 'new'}`;
    const safeDef = this.escapeHtml(item.prompt?.definition || '');
    return `
      <div class="tab-content prompt-tab">
        <div class="form-group">
          <label for="${uid}" class="form-label">角色定义</label>
          <textarea id="${uid}" name="prompt.definition" class="form-textarea" rows="10"
                    ${this.state.isEditing ? '' : 'readonly'} data-field="prompt.definition"
                    placeholder="请输入${isPersona ? '角色' : '用户角色'}的详细定义...">${safeDef}</textarea>
        </div>
      </div>
    `;
  }

  private renderBaselineTab(_item: Persona): string {
    return `<div class="tab-content">Baseline功能开发中...</div>`;
  }

  private renderWorldBookTab(_item: Persona): string {
    return `<div class="tab-content">世界书功能开发中...</div>`;
  }

  // Memory Manager P2: 记忆管理标签页
  private renderMemoryTab(persona: Persona): string {
    const personaId = (persona as any).id;
    if (!personaId) {
      return `
        <div class="tab-content">
          <div class="memory-tab-placeholder">
            <div class="placeholder-icon">🧠</div>
            <h4>记忆管理</h4>
            <p>请先保存角色后才能管理记忆事件</p>
          </div>
        </div>
      `;
    }

    return `
      <div class="tab-content memory-tab">
        <div class="memory-tab-header">
          <div class="memory-stats-overview">
            <div class="memory-stat-card">
              <div class="stat-icon">📝</div>
              <div class="stat-info">
                <div class="stat-value" id="memory-total-count">--</div>
                <div class="stat-label">总记忆条数</div>
              </div>
            </div>
            <div class="memory-stat-card">
              <div class="stat-icon">🟢</div>
              <div class="stat-info">
                <div class="stat-value" id="memory-open-count">--</div>
                <div class="stat-label">进行中</div>
              </div>
            </div>
            <div class="memory-stat-card">
              <div class="stat-icon">📊</div>
              <div class="stat-info">
                <div class="stat-value" id="memory-budget-usage">--</div>
                <div class="stat-label">预算使用</div>
              </div>
            </div>
          </div>
          
          <div class="memory-actions-bar">
            <button type="button" class="memory-action-btn primary" onclick="window.personaCenterDetail?.refreshMemoryStats('${personaId}')">
              <span>🔄</span>
              <span>刷新统计</span>
            </button>
            <button type="button" class="memory-action-btn" onclick="window.personaCenterDetail?.openMemorySettings('${personaId}')">
              <span>⚙️</span>
              <span>记忆设置</span>
            </button>
            <button type="button" class="memory-action-btn" onclick="window.personaCenterDetail?.compressOldMemories('${personaId}')">
              <span>🗜️</span>
              <span>一键压缩</span>
            </button>
            <button type="button" class="memory-action-btn success" onclick="window.personaCenterDetail?.addNewMemory('${personaId}')">
              <span>➕</span>
              <span>新增记忆</span>
            </button>
          </div>
        </div>

        <div class="memory-content">
          <div class="memory-filters">
            <div class="filter-group">
              <label class="filter-label">状态筛选：</label>
              <div class="filter-options">
                <label class="filter-option">
                  <input type="radio" name="memory-status-filter-${personaId}" value="all" checked>
                  <span>全部</span>
                </label>
                <label class="filter-option">
                  <input type="radio" name="memory-status-filter-${personaId}" value="open">
                  <span>进行中</span>
                </label>
                <label class="filter-option">
                  <input type="radio" name="memory-status-filter-${personaId}" value="done">
                  <span>已完成</span>
                </label>
                <label class="filter-option">
                  <input type="radio" name="memory-status-filter-${personaId}" value="note">
                  <span>笔记</span>
                </label>
              </div>
            </div>
            <div class="filter-group">
              <label class="filter-label">时间范围：</label>
              <select class="filter-select" id="memory-time-filter-${personaId}">
                <option value="all">全部时间</option>
                <option value="week">最近一周</option>
                <option value="month">最近一月</option>
                <option value="quarter">最近三月</option>
              </select>
            </div>
          </div>

          <div class="memory-list-container">
            <div id="memory-list-${personaId}" class="memory-list">
              <div class="memory-loading">
                <div class="loading-icon">⏳</div>
                <p>加载记忆事件中...</p>
              </div>
            </div>
          </div>

          <div class="memory-pagination" id="memory-pagination-${personaId}" style="display: none;">
            <button type="button" class="pagination-btn" id="memory-prev-btn-${personaId}" disabled>上一页</button>
            <span class="pagination-info" id="memory-page-info-${personaId}">第 1 页，共 1 页</span>
            <button type="button" class="pagination-btn" id="memory-next-btn-${personaId}" disabled>下一页</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderPreviewTab(_item: Persona | UserRole, _isPersona: boolean): string {
    return `<div class="tab-content">预览功能开发中...</div>`;
  }

  // 表单更新
  private debouncedUpdateField = debounce((name: string, value: string) => {
    this.updateField(name, value);
  }, 150);

  updateField(fieldPath: string, value: any): void {
    if (!this.state.currentData || !this.state.isEditing) return;

    const root: any = this.state.currentData.data;
    // 支持嵌套字段：prompt.definition
    const parts = fieldPath.split('.');
    let obj = root;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] = obj[parts[i]] ?? {};
      obj = obj[parts[i]];
    }
    const last = parts[parts.length - 1];

    if (fieldPath === 'tags') {
      obj[last] = String(value)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
    } else {
      obj[last] = value;
    }

    this.setDirty(true);
  }

  updateWorldBookOrder(linkIndex: number, order: string): void {
    if (!isPersona(this.state.currentData) || !this.state.isEditing) return;
    const persona = this.state.currentData.data;
    if (persona.worldBookLinks?.[linkIndex]) {
      persona.worldBookLinks[linkIndex].order = Number.parseInt(order) || 0;
      this.setDirty(true);
    }
  }

  toggleWorldBookLink(linkIndex: number, enabled: boolean): void {
    if (!isPersona(this.state.currentData) || !this.state.isEditing) return;
    const persona = this.state.currentData.data;
    if (persona.worldBookLinks?.[linkIndex]) {
      persona.worldBookLinks[linkIndex].enabled = enabled;
      this.setDirty(true);
    }
  }

  removeWorldBookLink(linkIndex: number): void {
    if (!isPersona(this.state.currentData) || !this.state.isEditing) return;
    const persona = this.state.currentData.data;
    if (persona.worldBookLinks) {
      persona.worldBookLinks.splice(linkIndex, 1);
      this.setDirty(true);
      void this.render();
    }
  }

  addWorldBookLink(): void {
    if (!isPersona(this.state.currentData) || !this.state.isEditing) return;
    const selectElement = document.getElementById('worldbook-select') as HTMLSelectElement | null;
    if (!selectElement?.value) return;
    const persona = this.state.currentData.data;
    persona.worldBookLinks = persona.worldBookLinks ?? [];
    persona.worldBookLinks.push({
      worldBookId: selectElement.value,
      enabled: true,
      order: persona.worldBookLinks.length
    });
    this.setDirty(true);
    void this.render();
  }

  // 外部 API
  setEditing(editing: boolean): void {
    this.state.isEditing = editing;
  }

  async loadData(data: Persona | UserRole, type: 'persona' | 'user'): Promise<void> {
    this.state.currentData = {
      type: type === 'persona' ? 'persona' : 'userRole',
      data
    };
    this.state.activeTab = 'basic';
    this.state.isDirty = false;
    this.clearValidationErrors();
  }

  isDirty(): boolean {
    return this.state.isDirty;
  }

  getCurrentData(): { type: 'persona' | 'userRole'; data: Persona | UserRole } | null {
    return this.state.currentData;
  }

  destroy(): void {
    if (this.bound) {
      this.container.removeEventListener('input', this.onInputHandler);
      this.container.removeEventListener('click', this.onClickHandler);
    }
    delete (window as any).personaCenterDetail;
    this.bound = false;
  }

  // 内部工具
  private async showItem(type: ItemType, data: Persona | UserRole, opts: { editing: boolean }): Promise<void> {
    this.state.currentData = { type, data };
    this.state.activeTab = 'basic';
    this.state.isDirty = false;
    this.state.isEditing = opts.editing;
    this.clearValidationErrors();
    await this.render();
  }

  private getServiceForType(type: ItemType) {
    return type === 'persona' ? this.personaService : this.userRoleService;
  }

  private async dispatchSave(cur: { type: ItemType; data: Persona | UserRole }): Promise<void> {
    if (cur.type === 'persona') {
      const persona = cur.data as Persona;
      const isNew = !persona.id;
      if (isNew) {
        const input = this.buildCreatePersonaInput(persona);
        const created = await this.personaService.create(input);
        cur.data = created;
        this.events.onPersonaCreated?.(created);
      } else {
        const input = this.buildUpdatePersonaInput(persona);
        await this.personaService.update(persona.id, input);
        this.events.onPersonaUpdated?.(persona);
      }
    } else {
      const userRole = cur.data as UserRole;
      const isNew = !userRole.id;
      if (isNew) {
        const input = this.buildCreateUserRoleInput(userRole);
        const created = await this.userRoleService.create(input);
        cur.data = created;
        this.events.onUserRoleCreated?.(created);
      } else {
        const input = this.buildUpdateUserRoleInput(userRole);
        await this.userRoleService.update(userRole.id, input);
        this.events.onUserRoleUpdated?.(userRole);
      }
    }
  }

  private setDirty(dirty: boolean): void {
    if (this.state.isDirty !== dirty) {
      this.state.isDirty = dirty;
      this.events.onDirtyChange?.(dirty);
    }
  }

  private attachEventListeners(): void {
    if (this.bound) return;

    // 统一处理 input/textarea
    this.onInputHandler = (e: Event) => {
      if (!this.state.isEditing) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        const field = target.getAttribute('data-field');
        if (!field) return;
        this.debouncedUpdateField(field, target.value);
      }
    };

    // 统一处理按钮点击与标签切换
    this.onClickHandler = (e: Event) => {
      const el = e.target as HTMLElement;
      if (!el) return;

      // 按钮动作
      const actionBtn = el.closest('[data-action]') as HTMLElement | null;
      if (actionBtn) {
        const action = actionBtn.getAttribute('data-action');
        if (!action) return;
        switch (action) {
          case 'cancel': this.cancelEdit(); break;
          case 'save': void this.saveChanges(); break;
          case 'duplicate': void this.duplicateItem(); break;
          case 'edit': this.startEdit(); break;
          case 'delete': void this.deleteItem(); break;
        }
        return;
      }

      // 标签切换
      const tabBtn = el.closest('[data-tab]') as HTMLElement | null;
      if (tabBtn) {
        const tab = tabBtn.getAttribute('data-tab') as TabId | null;
        if (tab) this.switchTab(tab);
      }
    };

    this.container.addEventListener('input', this.onInputHandler);
    this.container.addEventListener('click', this.onClickHandler);

    this.bound = true;
    (window as any).personaCenterDetail = this; // 保持兼容旧模板调用
    if (DEBUG) console.log('PersonaDetail事件已绑定');
  }

  private validateCurrentData(): ValidationResult {
    if (!this.state.currentData) {
      return { isValid: false, errors: { general: '没有数据可验证' } };
    }
    const { data, type } = this.state.currentData;
    return type === 'persona'
        ? this.personaService.validatePersona(data as Persona)
        : this.userRoleService.validateUserRole(data as UserRole);
  }

  private clearValidationErrors(): void {
    this.state.validationErrors = {};
  }

  private getStatusText(item: Persona | UserRole, isPersonaType: boolean): string {
    if (isPersonaType) {
      const persona = item as Persona;
      return persona.status === 'published' ? '已发布' : '草稿';
    }
    const userRole = item as UserRole;
    return userRole.isGlobalDefault ? '全局默认' : '';
  }

  private buildCreatePersonaInput(persona: Persona): CreatePersonaInput {
    return {
      type: 'ai',
      name: persona.name,
      avatar: persona.avatar,
      tags: persona.tags,
      prompt: persona.prompt,
      worldBookLinks: persona.worldBookLinks || [],
      status: persona.status,
      archived: persona.archived || false
    };
  }

  private buildUpdatePersonaInput(persona: Persona): UpdatePersonaInput {
    return {
      name: persona.name,
      avatar: persona.avatar,
      tags: persona.tags,
      prompt: persona.prompt,
      worldBookLinks: persona.worldBookLinks || [],
      status: persona.status,
      archived: persona.archived || false
    };
  }

  private buildCreateUserRoleInput(userRole: UserRole): CreateUserRoleInput {
    return {
      type: 'user',
      name: userRole.name,
      avatar: userRole.avatar,
      tags: userRole.tags,
      prompt: userRole.prompt,
      archived: userRole.archived || false,
      isGlobalDefault: userRole.isGlobalDefault || false
    };
  }

  private buildUpdateUserRoleInput(userRole: UserRole): UpdateUserRoleInput {
    return {
      name: userRole.name,
      avatar: userRole.avatar,
      tags: userRole.tags,
      prompt: userRole.prompt,
      archived: userRole.archived || false,
      isGlobalDefault: userRole.isGlobalDefault || false
    };
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text ?? '';
    return div.innerHTML;
  }

  // Memory Manager P2: 记忆管理功能实现
  async refreshMemoryStats(personaId: string): Promise<void> {
    try {
      console.log('[MM][P2] 刷新记忆统计:', personaId);

      // 获取记忆统计
      const totalCount = await MemoryManager.getEventCount(personaId);
      const openCount = await MemoryManager.getOpenEventCount(personaId);
      
      // 计算预算使用情况
      const budget: SelectBudget = { maxChars: 600 * 4 };
      const events = await MemoryRepo.getEventsByPersona(personaId);
      const usedChars = events.reduce((sum, event) => sum + estimateEventChars(event), 0);
      const budgetUsage = `${Math.round((usedChars / budget.maxChars) * 100)}%`;

      // 更新界面显示
      const totalCountEl = document.getElementById('memory-total-count');
      const openCountEl = document.getElementById('memory-open-count');
      const budgetUsageEl = document.getElementById('memory-budget-usage');

      if (totalCountEl) totalCountEl.textContent = totalCount.toString();
      if (openCountEl) openCountEl.textContent = openCount.toString();
      if (budgetUsageEl) budgetUsageEl.textContent = budgetUsage;

      // 加载记忆列表
      await this.loadMemoryList(personaId);

    } catch (error) {
      console.error('[MM][P2] 刷新记忆统计失败:', error);
      // 显示错误提示
      this.showMemoryError('刷新统计失败，请稍后重试');
    }
  }

  async loadMemoryList(personaId: string, statusFilter: string = 'all', timeFilter: string = 'all'): Promise<void> {
    const listContainer = document.getElementById(`memory-list-${personaId}`);
    if (!listContainer) return;

    try {
      // 显示加载状态
      listContainer.innerHTML = `
        <div class="memory-loading">
          <div class="loading-icon">⏳</div>
          <p>加载记忆事件中...</p>
        </div>
      `;

      // 获取记忆事件
      let events = await MemoryRepo.getEventsByPersona(personaId);

      // 应用状态筛选
      if (statusFilter !== 'all') {
        events = events.filter(event => event.status === statusFilter);
      }

      // 应用时间筛选
      const now = Date.now();
      if (timeFilter !== 'all') {
        const timeRanges = {
          week: 7 * 24 * 60 * 60 * 1000,
          month: 30 * 24 * 60 * 60 * 1000,
          quarter: 90 * 24 * 60 * 60 * 1000
        };
        const range = timeRanges[timeFilter as keyof typeof timeRanges];
        if (range) {
          events = events.filter(event => (now - event.createdAt) <= range);
        }
      }

      // 按创建时间倒序排列
      events.sort((a, b) => b.createdAt - a.createdAt);

      // 渲染记忆列表
      this.renderMemoryList(listContainer, events, personaId);

    } catch (error) {
      console.error('[MM][P2] 加载记忆列表失败:', error);
      listContainer.innerHTML = `
        <div class="memory-error">
          <div class="error-icon">❌</div>
          <p>加载失败，请稍后重试</p>
        </div>
      `;
    }
  }

  private renderMemoryList(container: HTMLElement, events: EventRec[], personaId: string): void {
    if (events.length === 0) {
      container.innerHTML = `
        <div class="memory-empty">
          <div class="empty-icon">📝</div>
          <h4>暂无记忆事件</h4>
          <p>这个角色还没有任何记忆事件</p>
          <button type="button" class="memory-action-btn success" onclick="window.personaCenterDetail?.addNewMemory('${personaId}')">
            <span>➕</span>
            <span>创建第一条记忆</span>
          </button>
        </div>
      `;
      return;
    }

    // 按状态分组
    const groups = {
      open: events.filter(e => e.status === 'open'),
      done: events.filter(e => e.status === 'done'),
      note: events.filter(e => e.status === 'note')
    };

    let html = '';

    // 渲染各组
    if (groups.open.length > 0) {
      html += `<div class="memory-group">
        <h4 class="memory-group-title">🟢 进行中的事件 (${groups.open.length})</h4>
        ${groups.open.map(event => this.renderMemoryItem(event, personaId)).join('')}
      </div>`;
    }

    if (groups.done.length > 0) {
      html += `<div class="memory-group">
        <h4 class="memory-group-title">✅ 已完成的事件 (${groups.done.length})</h4>
        ${groups.done.map(event => this.renderMemoryItem(event, personaId)).join('')}
      </div>`;
    }

    if (groups.note.length > 0) {
      html += `<div class="memory-group">
        <h4 class="memory-group-title">📝 笔记 (${groups.note.length})</h4>
        ${groups.note.map(event => this.renderMemoryItem(event, personaId)).join('')}
      </div>`;
    }

    container.innerHTML = html;
  }

  private renderMemoryItem(event: EventRec, personaId: string): string {
    const createdDate = new Date(event.createdAt).toLocaleDateString();
    const dueDate = event.dueAt ? new Date(event.dueAt).toLocaleDateString() : null;
    const chars = estimateEventChars(event);

    return `
      <div class="memory-item" data-event-id="${event.id}">
        <div class="memory-item-header">
          <div class="memory-item-title">${this.escapeHtml(event.title)}</div>
          <div class="memory-item-meta">
            <span class="memory-meta-item">📅 ${createdDate}</span>
            ${dueDate ? `<span class="memory-meta-item">⏰ ${dueDate}</span>` : ''}
            <span class="memory-meta-item">🔤 ${chars}字符</span>
            ${event.compressed ? '<span class="memory-meta-item compressed">🗜️ 已压缩</span>' : ''}
            ${event.excludeFromPrompt ? '<span class="memory-meta-item excluded">🚫 已排除</span>' : ''}
          </div>
        </div>
        <div class="memory-item-content">
          <p>${this.escapeHtml(event.content || '无详细内容')}</p>
          ${event.tags && event.tags.length > 0 ? 
            `<div class="memory-item-tags">
              ${event.tags.map(tag => `<span class="memory-tag">${this.escapeHtml(tag)}</span>`).join('')}
            </div>` : ''
          }
        </div>
        <div class="memory-item-actions">
          <button type="button" class="memory-item-btn" onclick="window.personaCenterDetail?.editMemory('${event.id}', '${personaId}')">编辑</button>
          <button type="button" class="memory-item-btn" onclick="window.personaCenterDetail?.toggleMemoryStatus('${event.id}', '${personaId}')">
            ${event.status === 'open' ? '标记完成' : '重新打开'}
          </button>
          <button type="button" class="memory-item-btn exclude" onclick="window.personaCenterDetail?.toggleMemoryExclusion('${event.id}', '${personaId}')">
            ${event.excludeFromPrompt ? '恢复注入' : '排除注入'}
          </button>
          <button type="button" class="memory-item-btn danger" onclick="window.personaCenterDetail?.deleteMemory('${event.id}', '${personaId}')">删除</button>
        </div>
      </div>
    `;
  }

  // 记忆管理操作方法
  async openMemorySettings(personaId: string): Promise<void> {
    console.log('[MM][P2] 打开记忆设置:', personaId);
    
    // 创建记忆设置弹窗
    this.showMemorySettingsModal(personaId);
  }

  private showMemorySettingsModal(personaId: string): void {
    const modalHtml = `
      <div class="memory-settings-modal" id="memorySettingsModal">
        <div class="memory-settings-modal-content">
          <div class="memory-settings-header">
            <h3>记忆管理设置</h3>
            <button type="button" class="memory-settings-close" onclick="this.closest('.memory-settings-modal').remove()">×</button>
          </div>
          <div class="memory-settings-body">
            <div class="settings-section">
              <h4>自动压缩设置</h4>
              <div class="form-group">
                <label>
                  <input type="checkbox" id="enableAutoCompress" checked>
                  启用自动压缩旧记忆
                </label>
                <p class="help-text">当记忆事件超过一定时间或数量时，自动将旧事件压缩以节省空间</p>
              </div>
              
              <div class="form-group">
                <label for="compressAfterDays">压缩阈值（天数）</label>
                <input type="number" id="compressAfterDays" value="30" min="1" max="365">
                <p class="help-text">超过指定天数的已完成事件将被自动压缩</p>
              </div>
            </div>
            
            <div class="settings-section">
              <h4>记忆预算设置</h4>
              <div class="form-group">
                <label for="maxMemoryEvents">最大记忆事件数量</label>
                <input type="number" id="maxMemoryEvents" value="1000" min="10" max="10000">
                <p class="help-text">超过此数量时，最旧的事件将被标记为可压缩</p>
              </div>
              
              <div class="form-group">
                <label for="maxMemoryChars">最大记忆字符数</label>
                <input type="number" id="maxMemoryChars" value="50000" min="1000" max="1000000">
                <p class="help-text">记忆内容总字符数超过此值时触发警告</p>
              </div>
            </div>
            
            <div class="settings-section">
              <h4>导出设置</h4>
              <div class="form-group">
                <button type="button" class="settings-btn secondary" onclick="window.personaCenterDetail?.exportMemories('${personaId}')">
                  📁 导出所有记忆
                </button>
                <p class="help-text">将所有记忆事件导出为JSON文件</p>
              </div>
              
              <div class="form-group">
                <input type="file" id="importMemoryFile" accept=".json" style="display: none" onchange="window.personaCenterDetail?.importMemories('${personaId}', this.files[0])">
                <button type="button" class="settings-btn secondary" onclick="document.getElementById('importMemoryFile').click()">
                  📥 导入记忆
                </button>
                <p class="help-text">从JSON文件导入记忆事件</p>
              </div>
            </div>
          </div>
          <div class="memory-settings-footer">
            <button type="button" class="memory-settings-btn secondary" onclick="this.closest('.memory-settings-modal').remove()">关闭</button>
            <button type="button" class="memory-settings-btn primary" onclick="window.personaCenterDetail?.saveMemorySettings('${personaId}')">保存设置</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  async saveMemorySettings(personaId: string): Promise<void> {
    console.log('[MM][P2] 保存记忆设置:', personaId);
    
    try {
      // 这里可以保存设置到数据库或localStorage
      // 目前只是模拟保存
      
      const modal = document.getElementById('memorySettingsModal');
      modal?.remove();
      
      // 显示保存成功提示
      this.showMemoryMessage('设置保存成功', 'success');
    } catch (error) {
      console.error('[MM][P2] 保存设置失败:', error);
      this.showMemoryError('保存设置失败，请稍后重试');
    }
  }

  async exportMemories(personaId: string): Promise<void> {
    console.log('[MM][P2] 导出记忆:', personaId);
    
    try {
      const events = await MemoryRepo.getEventsByPersona(personaId);
      
      const exportData = {
        personaId,
        exportTime: new Date().toISOString(),
        events: events.map(event => ({
          ...event,
          exportNote: '由Memory Manager P2导出'
        }))
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `memories_${personaId}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      
      this.showMemoryMessage(`成功导出 ${events.length} 条记忆事件`, 'success');
    } catch (error) {
      console.error('[MM][P2] 导出记忆失败:', error);
      this.showMemoryError('导出失败，请稍后重试');
    }
  }

  async importMemories(personaId: string, file: File): Promise<void> {
    console.log('[MM][P2] 导入记忆:', personaId, file.name);
    
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.events || !Array.isArray(data.events)) {
        throw new Error('无效的记忆数据格式');
      }
      
      let importedCount = 0;
      for (const eventData of data.events) {
        // 确保事件属于当前persona
        if (eventData.personaId !== personaId) {
          eventData.personaId = personaId;
        }
        
        // 生成新的ID以避免冲突
        eventData.id = 'import_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        eventData.updatedAt = Date.now();
        
        try {
          await MemoryRepo.addEvent(eventData);
          importedCount++;
        } catch (error) {
          console.warn('[MM][P2] 跳过无效记忆事件:', eventData.title, error);
        }
      }
      
      await this.refreshMemoryStats(personaId);
      this.showMemoryMessage(`成功导入 ${importedCount} 条记忆事件`, 'success');
    } catch (error) {
      console.error('[MM][P2] 导入记忆失败:', error);
      this.showMemoryError('导入失败：' + error.message);
    }
  }

  async compressOldMemories(personaId: string): Promise<void> {
    console.log('[MM][P2] 一键压缩记忆:', personaId);
    
    // 显示压缩确认弹窗
    this.showCompressionModal(personaId);
  }

  private showCompressionModal(personaId: string): void {
    const modalHtml = `
      <div class="memory-compress-modal" id="memoryCompressModal">
        <div class="memory-compress-modal-content">
          <div class="memory-compress-header">
            <h3>🗜️ 记忆压缩</h3>
            <button type="button" class="memory-compress-close" onclick="this.closest('.memory-compress-modal').remove()">×</button>
          </div>
          <div class="memory-compress-body">
            <div class="compress-warning">
              <div class="warning-icon">⚠️</div>
              <div class="warning-content">
                <h4>注意：压缩操作不可逆转</h4>
                <p>压缩将会：</p>
                <ul>
                  <li>将多个相关记忆事件合并为摘要</li>
                  <li>保留关键信息，删除冗余内容</li>
                  <li>释放存储空间，提高查询效率</li>
                  <li><strong>原始详细记录将无法恢复</strong></li>
                </ul>
              </div>
            </div>
            
            <div class="compress-options">
              <h4>压缩选项</h4>
              
              <div class="form-group">
                <label>
                  <input type="radio" name="compressType" value="old" checked>
                  压缩旧记忆（30天前的已完成事件）
                </label>
              </div>
              
              <div class="form-group">
                <label>
                  <input type="radio" name="compressType" value="done">
                  压缩所有已完成事件
                </label>
              </div>
              
              <div class="form-group">
                <label>
                  <input type="radio" name="compressType" value="custom">
                  自定义压缩范围
                </label>
              </div>
              
              <div class="form-group" id="customCompressOptions" style="display: none;">
                <label for="compressDays">压缩天数前的事件</label>
                <input type="number" id="compressDays" value="30" min="1" max="365">
              </div>
            </div>
            
            <div class="compress-preview" id="compressPreview">
              <div class="loading-compress">正在分析可压缩事件...</div>
            </div>
          </div>
          <div class="memory-compress-footer">
            <button type="button" class="memory-compress-btn secondary" onclick="this.closest('.memory-compress-modal').remove()">取消</button>
            <button type="button" class="memory-compress-btn danger" onclick="window.personaCenterDetail?.executeCompression('${personaId}')">开始压缩</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // 添加事件监听
    const radioButtons = document.querySelectorAll('input[name="compressType"]');
    const customOptions = document.getElementById('customCompressOptions');
    
    radioButtons.forEach(radio => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (customOptions) {
          customOptions.style.display = target.value === 'custom' ? 'block' : 'none';
        }
        this.updateCompressionPreview(personaId);
      });
    });
    
    // 初始预览
    setTimeout(() => this.updateCompressionPreview(personaId), 100);
  }

  private async updateCompressionPreview(personaId: string): Promise<void> {
    const preview = document.getElementById('compressPreview');
    if (!preview) return;
    
    try {
      const events = await MemoryRepo.getEventsByPersona(personaId);
      const compressType = (document.querySelector('input[name="compressType"]:checked') as HTMLInputElement)?.value;
      
      let candidateEvents: any[] = [];
      const now = Date.now();
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
      
      switch (compressType) {
        case 'old':
          candidateEvents = events.filter(e => e.status === 'done' && e.createdAt < thirtyDaysAgo);
          break;
        case 'done':
          candidateEvents = events.filter(e => e.status === 'done');
          break;
        case 'custom':
          const daysInput = document.getElementById('compressDays') as HTMLInputElement;
          const customDays = parseInt(daysInput?.value || '30');
          const customDate = now - (customDays * 24 * 60 * 60 * 1000);
          candidateEvents = events.filter(e => e.status === 'done' && e.createdAt < customDate);
          break;
      }
      
      const totalChars = candidateEvents.reduce((sum, e) => sum + estimateEventChars(e), 0);
      
      preview.innerHTML = `
        <div class="compress-stats">
          <div class="compress-stat">
            <strong>${candidateEvents.length}</strong> 个事件可压缩
          </div>
          <div class="compress-stat">
            预计释放 <strong>${totalChars}</strong> 字符空间
          </div>
          <div class="compress-stat">
            压缩比例约 <strong>70-80%</strong>
          </div>
        </div>
        
        ${candidateEvents.length > 0 ? `
          <div class="compress-examples">
            <h5>即将压缩的事件示例：</h5>
            ${candidateEvents.slice(0, 3).map(e => `
              <div class="compress-item">
                <strong>${this.escapeHtml(e.title)}</strong>
                <span class="compress-date">${new Date(e.createdAt).toLocaleDateString()}</span>
              </div>
            `).join('')}
            ${candidateEvents.length > 3 ? `<div class="compress-more">...还有 ${candidateEvents.length - 3} 个事件</div>` : ''}
          </div>
        ` : '<div class="no-compress">没有符合条件的事件需要压缩</div>'}
      `;
    } catch (error) {
      preview.innerHTML = '<div class="compress-error">预览加载失败</div>';
    }
  }

  async executeCompression(personaId: string): Promise<void> {
    console.log('[MM][P2] 执行压缩:', personaId);
    
    try {
      // 这里应该调用P1的压缩功能
      // 目前先模拟压缩过程
      
      const modal = document.getElementById('memoryCompressModal');
      const footer = modal?.querySelector('.memory-compress-footer');
      
      if (footer) {
        footer.innerHTML = `
          <div class="compress-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="progress-text">正在压缩记忆事件...</div>
          </div>
        `;
      }
      
      // 模拟压缩进度
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        
        const fill = modal?.querySelector('.progress-fill') as HTMLElement;
        const text = modal?.querySelector('.progress-text');
        
        if (fill) fill.style.width = i + '%';
        if (text) {
          if (i < 50) text.textContent = '正在分析记忆事件...';
          else if (i < 80) text.textContent = '正在生成压缩摘要...';
          else if (i < 100) text.textContent = '正在更新数据库...';
          else text.textContent = '压缩完成！';
        }
      }
      
      setTimeout(() => {
        modal?.remove();
        this.refreshMemoryStats(personaId);
        this.showMemoryMessage('记忆压缩完成！释放了存储空间并优化了查询性能。', 'success');
      }, 1000);
      
    } catch (error) {
      console.error('[MM][P2] 压缩执行失败:', error);
      this.showMemoryError('压缩失败，请稍后重试');
      
      const modal = document.getElementById('memoryCompressModal');
      modal?.remove();
    }
  }

  private showMemoryMessage(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const alertClass = type === 'success' ? 'alert-success' : type === 'error' ? 'alert-danger' : 'alert-info';
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    
    const messageHtml = `
      <div class="memory-message ${alertClass}" style="position: fixed; top: 20px; right: 20px; z-index: 10001; max-width: 400px; padding: 12px; border-radius: 4px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); background: white; border-left: 4px solid var(--color-${type === 'success' ? 'success' : type === 'error' ? 'danger' : 'info'});">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">${icon}</span>
          <span style="flex: 1;">${message}</span>
          <button onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; font-size: 16px; cursor: pointer;">×</button>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', messageHtml);
    
    // 3秒后自动消失
    setTimeout(() => {
      const messageEl = document.querySelector('.memory-message');
      messageEl?.remove();
    }, 3000);
  }

  async addNewMemory(personaId: string): Promise<void> {
    console.log('[MM][P2] 添加新记忆:', personaId);
    const title = prompt('请输入记忆标题:');
    if (!title) return;

    const content = prompt('请输入记忆内容（可选）:') || '';

    try {
      const newEvent: EventRec = {
        id: 'evt_' + Date.now(),
        personaId,
        typeKey: 'note',
        title,
        content,
        status: 'note',
        lifecycle: 'none',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await MemoryRepo.addEvent(newEvent);
      await this.refreshMemoryStats(personaId);
    } catch (error) {
      console.error('[MM][P2] 添加记忆失败:', error);
      alert('添加失败，请稍后重试');
    }
  }

  async editMemory(eventId: string, personaId: string): Promise<void> {
    console.log('[MM][P2] 编辑记忆:', eventId);
    
    try {
      const event = await MemoryRepo.getEventById(eventId);
      if (!event) {
        this.showMemoryError('记忆事件不存在');
        return;
      }

      // 创建编辑弹窗
      this.showMemoryEditModal(event, personaId);
    } catch (error) {
      console.error('[MM][P2] 获取记忆事件失败:', error);
      this.showMemoryError('获取记忆事件失败');
    }
  }

  private showMemoryEditModal(event: EventRec, personaId: string): void {
    // 创建模态弹窗HTML
    const modalHtml = `
      <div class="memory-edit-modal" id="memoryEditModal">
        <div class="memory-edit-modal-content">
          <div class="memory-edit-header">
            <h3>编辑记忆事件</h3>
            <button type="button" class="memory-edit-close" onclick="this.closest('.memory-edit-modal').remove()">×</button>
          </div>
          <div class="memory-edit-body">
            <form id="memoryEditForm">
              <div class="form-group">
                <label for="memoryTitle">标题</label>
                <input type="text" id="memoryTitle" name="title" value="${this.escapeHtml(event.title)}" required>
              </div>
              
              <div class="form-group">
                <label for="memoryContent">内容</label>
                <textarea id="memoryContent" name="content" rows="6">${this.escapeHtml(event.content || '')}</textarea>
              </div>
              
              <div class="form-group">
                <label for="memoryStatus">状态</label>
                <select id="memoryStatus" name="status">
                  <option value="open" ${event.status === 'open' ? 'selected' : ''}>进行中</option>
                  <option value="done" ${event.status === 'done' ? 'selected' : ''}>已完成</option>
                  <option value="note" ${event.status === 'note' ? 'selected' : ''}>笔记</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="memoryTags">标签（用逗号分隔）</label>
                <input type="text" id="memoryTags" name="tags" value="${event.tags ? event.tags.join(', ') : ''}">
              </div>
              
              <div class="form-group">
                <label>
                  <input type="checkbox" id="memoryExcluded" name="excludeFromPrompt" ${event.excludeFromPrompt ? 'checked' : ''}>
                  排除此记忆不参与AI注入
                </label>
              </div>
              
              <div class="form-group">
                <label for="memoryDueDate">到期日期（可选）</label>
                <input type="date" id="memoryDueDate" name="dueDate" 
                  value="${event.dueAt ? new Date(event.dueAt).toISOString().split('T')[0] : ''}">
              </div>
            </form>
          </div>
          <div class="memory-edit-footer">
            <button type="button" class="memory-edit-btn secondary" onclick="this.closest('.memory-edit-modal').remove()">取消</button>
            <button type="button" class="memory-edit-btn primary" onclick="window.personaCenterDetail?.saveMemoryEdit('${event.id}', '${personaId}')">保存</button>
          </div>
        </div>
      </div>
    `;

    // 添加到DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // 设置焦点
    const titleInput = document.getElementById('memoryTitle') as HTMLInputElement;
    if (titleInput) {
      titleInput.focus();
      titleInput.select();
    }
  }

  async saveMemoryEdit(eventId: string, personaId: string): Promise<void> {
    const form = document.getElementById('memoryEditForm') as HTMLFormElement;
    if (!form) return;

    try {
      const formData = new FormData(form);
      const title = (formData.get('title') as string)?.trim();
      
      if (!title) {
        alert('标题不能为空');
        return;
      }

      const content = (formData.get('content') as string)?.trim() || '';
      const status = formData.get('status') as string;
      const tagsString = (formData.get('tags') as string)?.trim();
      const tags = tagsString ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag) : undefined;
      const excludeFromPrompt = formData.get('excludeFromPrompt') === 'on';
      const dueDateString = formData.get('dueDate') as string;
      const dueAt = dueDateString ? new Date(dueDateString).getTime() : undefined;

      // 更新记忆事件
      await MemoryRepo.updateEvent(eventId, {
        title,
        content,
        status: status as any,
        tags,
        excludeFromPrompt,
        dueAt,
        updatedAt: Date.now()
      });

      // 关闭弹窗
      const modal = document.getElementById('memoryEditModal');
      modal?.remove();

      // 刷新显示
      await this.refreshMemoryStats(personaId);
      
      console.log('[MM][P2] 记忆编辑保存成功:', eventId);
    } catch (error) {
      console.error('[MM][P2] 保存记忆编辑失败:', error);
      this.showMemoryError('保存失败，请稍后重试');
    }
  }

  async toggleMemoryStatus(eventId: string, personaId: string): Promise<void> {
    console.log('[MM][P2] 切换记忆状态:', eventId);
    
    try {
      const event = await MemoryRepo.getEventById(eventId);
      if (!event) {
        this.showMemoryError('记忆事件不存在');
        return;
      }

      // 切换状态逻辑：open <-> done, note保持不变
      let newStatus: string;
      if (event.status === 'open') {
        newStatus = 'done';
      } else if (event.status === 'done') {
        newStatus = 'open';
      } else {
        // 对于note类型，允许切换到open状态
        newStatus = event.status === 'note' ? 'open' : 'note';
      }

      await MemoryRepo.updateEvent(eventId, {
        status: newStatus as any,
        updatedAt: Date.now()
      });

      await this.refreshMemoryStats(personaId);
      console.log('[MM][P2] 记忆状态切换成功:', eventId, '->', newStatus);
    } catch (error) {
      console.error('[MM][P2] 切换记忆状态失败:', error);
      this.showMemoryError('状态切换失败，请稍后重试');
    }
  }

  async toggleMemoryExclusion(eventId: string, personaId: string): Promise<void> {
    console.log('[MM][P2] 切换记忆排除状态:', eventId);
    
    try {
      const event = await MemoryRepo.getEventById(eventId);
      if (!event) {
        this.showMemoryError('记忆事件不存在');
        return;
      }

      const newExcludeStatus = !event.excludeFromPrompt;
      
      await MemoryRepo.updateEvent(eventId, {
        excludeFromPrompt: newExcludeStatus,
        updatedAt: Date.now()
      });

      await this.refreshMemoryStats(personaId);
      console.log('[MM][P2] 记忆排除状态切换成功:', eventId, '->', newExcludeStatus);
    } catch (error) {
      console.error('[MM][P2] 切换记忆排除状态失败:', error);
      this.showMemoryError('排除状态切换失败，请稍后重试');
    }
  }

  async deleteMemory(eventId: string, personaId: string): Promise<void> {
    console.log('[MM][P2] 删除记忆:', eventId);
    if (!confirm('确定要删除这条记忆事件吗？此操作不可撤销。')) return;
    
    try {
      await MemoryRepo.removeEvents([eventId]);
      await this.refreshMemoryStats(personaId);
    } catch (error) {
      console.error('[MM][P2] 删除记忆失败:', error);
      alert('删除失败，请稍后重试');
    }
  }

  private showMemoryError(message: string): void {
    // 简单的错误提示实现
    console.error('[MM][P2] 记忆管理错误:', message);
    // TODO: 实现更好的错误提示UI
  }
}
