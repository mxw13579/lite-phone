// 角色详情组件 - 右侧详情面板
// 支持AI角色和用户角色的详情编辑，提供多标签页界面

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

export class PersonaDetailComponent {
  private container: HTMLElement;
  private events: PersonaDetailEvents;
  private state: PersonaDetailState;
  
  private personaService: PersonaService;
  private userRoleService: UserRoleService;
  private compositionService: CompositionService;
  
  private currentWorldBooks: Record<string, WorldBook> = {};

  constructor(
    container: HTMLElement, 
    events: PersonaDetailEvents,
    worldBooks: Record<string, WorldBook> = {}
  ) {
    this.container = container;
    this.events = events;
    this.currentWorldBooks = worldBooks;
    
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
    // 不在初始化时立即渲染，等待外部调用showCreatePersona或showPersona
    this.attachEventListeners();
    
    // 如果容器为空，显示初始加载状态
    if (this.container && this.container.innerHTML.trim() === '') {
      this.container.innerHTML = `
        <div class="persona-detail-loading">
          <div style="padding: 20px; text-align: center;">
            <div>正在初始化角色编辑器...</div>
          </div>
        </div>
      `;
    }
  }

  // 显示角色详情
  async showPersona(persona: Persona): Promise<void> {
    this.state.currentData = { type: 'persona', data: persona };
    this.state.activeTab = 'basic';
    this.state.isDirty = false;
    this.state.isEditing = false;
    this.clearValidationErrors();
    
    await this.render();
    this.events.onPersonaSelected?.(persona);
  }

  // 显示用户角色详情
  async showUserRole(userRole: UserRole): Promise<void> {
    this.state.currentData = { type: 'userRole', data: userRole };
    this.state.activeTab = 'basic';
    this.state.isDirty = false;
    this.state.isEditing = false;
    this.clearValidationErrors();
    
    await this.render();
    this.events.onUserRoleSelected?.(userRole);
  }

  // 显示创建新角色界面
  async showCreatePersona(): Promise<void> {
    const newPersona: Partial<Persona> = {
      name: '',
      avatar: '',
      tags: [],
      prompt: {
        definition: ''
      },
      worldBookLinks: [],
      status: 'draft',
      archived: false
    };
    
    console.log('showCreatePersona: Setting up new persona...', newPersona);
    this.state.currentData = { type: 'persona', data: newPersona as Persona };
    this.state.activeTab = 'basic';
    this.state.isDirty = false;
    this.state.isEditing = true;
    this.clearValidationErrors();
    
    console.log('showCreatePersona: Current state after setup:', this.state);
    await this.render();
    console.log('showCreatePersona: Render completed');
  }

  // 显示创建新用户角色界面
  async showCreateUserRole(): Promise<void> {
    const newUserRole: Partial<UserRole> = {
      name: '',
      avatar: '',
      tags: [],
      prompt: {
        definition: ''
      },
      archived: false,
      isGlobalDefault: false
    };
    
    this.state.currentData = { type: 'userRole', data: newUserRole as UserRole };
    this.state.activeTab = 'basic';
    this.state.isDirty = false;
    this.state.isEditing = true;
    this.clearValidationErrors();
    
    await this.render();
  }

  // 清空显示
  clear(): void {
    this.state.currentData = null;
    this.state.isDirty = false;
    this.state.isEditing = false;
    this.clearValidationErrors();
    this.render();
  }

  // 切换标签页
  switchTab(tabId: string): void {
    if (this.state.isDirty) {
      const confirmed = confirm('当前有未保存的更改，确定要切换标签页吗？');
      if (!confirmed) return;
    }
    
    this.state.activeTab = tabId;
    this.render();
  }

  // 开始编辑
  startEdit(): void {
    this.state.isEditing = true;
    this.render();
  }

  // 取消编辑
  cancelEdit(): void {
    if (this.state.isDirty) {
      const confirmed = confirm('确定要取消编辑吗？所有未保存的更改将丢失。');
      if (!confirmed) return;
    }
    
    this.state.isEditing = false;
    this.state.isDirty = false;
    this.clearValidationErrors();
    this.render();
  }

  // 保存更改
  async saveChanges(): Promise<void> {
    if (!this.state.currentData) return;
    
    try {
      const validation = this.validateCurrentData();
      if (!validation.isValid) {
        this.state.validationErrors = validation.errors;
        this.render();
        return;
      }
      
      this.clearValidationErrors();
      
      if (this.state.currentData.type === 'persona') {
        await this.savePersona();
      } else {
        await this.saveUserRole();
      }
      
      this.state.isEditing = false;
      this.state.isDirty = false;
      this.render();
      
    } catch (error) {
      console.error('保存失败:', error);
      alert(`保存失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async savePersona(): Promise<void> {
    if (!this.state.currentData || this.state.currentData.type !== 'persona') return;
    
    const persona = this.state.currentData.data;
    const isNew = !persona.id;
    
    if (isNew) {
      const input = this.buildCreatePersonaInput(persona);
      const created = await this.personaService.create(input);
      this.state.currentData.data = created;
      this.events.onPersonaCreated?.(created);
    } else {
      const input = this.buildUpdatePersonaInput(persona);
      await this.personaService.update(persona.id, input);
      this.events.onPersonaUpdated?.(persona);
    }
  }

  private async saveUserRole(): Promise<void> {
    if (!this.state.currentData || this.state.currentData.type !== 'userRole') return;
    
    const userRole = this.state.currentData.data;
    const isNew = !userRole.id;
    
    if (isNew) {
      const input = this.buildCreateUserRoleInput(userRole);
      const created = await this.userRoleService.create(input);
      this.state.currentData.data = created;
      this.events.onUserRoleCreated?.(created);
    } else {
      const input = this.buildUpdateUserRoleInput(userRole);
      await this.userRoleService.update(userRole.id, input);
      this.events.onUserRoleUpdated?.(userRole);
    }
  }

  // 删除当前项
  async deleteItem(): Promise<void> {
    if (!this.state.currentData) return;
    
    const itemName = this.state.currentData.data.name;
    const itemType = this.state.currentData.type === 'persona' ? '角色' : '用户角色';
    
    const confirmed = confirm(`确定要删除${itemType}"${itemName}"吗？此操作不可撤销。`);
    if (!confirmed) return;
    
    try {
      if (this.state.currentData.type === 'persona') {
        await this.personaService.delete(this.state.currentData.data.id);
        this.events.onPersonaDeleted?.(this.state.currentData.data.id);
      } else {
        await this.userRoleService.delete(this.state.currentData.data.id);
        this.events.onUserRoleDeleted?.(this.state.currentData.data.id);
      }
      
      this.clear();
    } catch (error) {
      console.error('删除失败:', error);
      alert(`删除失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 复制当前项
  async duplicateItem(): Promise<void> {
    if (!this.state.currentData) return;
    
    const currentItem = this.state.currentData.data;
    const newName = prompt('请输入新的名称:', `${currentItem.name} (副本)`);
    if (!newName) return;
    
    try {
      if (this.state.currentData.type === 'persona') {
        const duplicated = await this.personaService.duplicate(currentItem.id, newName);
        this.events.onPersonaCreated?.(duplicated);
      } else {
        const duplicated = await this.userRoleService.duplicate(currentItem.id, newName);
        this.events.onUserRoleCreated?.(duplicated);
      }
    } catch (error) {
      console.error('复制失败:', error);
      alert(`复制失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 更新世界书数据
  updateWorldBooks(worldBooks: Record<string, WorldBook>): void {
    this.currentWorldBooks = worldBooks;
    if (this.state.activeTab === 'worldbook' || this.state.activeTab === 'preview') {
      this.render();
    }
  }

  // 渲染组件
  async render(): Promise<void> {
    console.log('render: Starting render with state:', this.state);
    
    if (!this.state.currentData) {
      console.log('render: No currentData, showing empty state');
      this.container.innerHTML = `
        <div class="persona-detail-empty">
          <div class="empty-state">
            <div class="empty-icon">📱</div>
            <h3>选择一个角色</h3>
            <p>从左侧列表选择要查看或编辑的角色</p>
          </div>
        </div>
      `;
      return;
    }
    
    console.log('render: Rendering with data:', this.state.currentData);
    const currentItem = this.state.currentData.data;
    const isPersona = this.state.currentData.type === 'persona';
    
    this.container.innerHTML = `
      <div class="persona-detail">
        ${this.renderHeader(currentItem, isPersona)}
        ${this.renderTabs(isPersona)}
        ${this.renderTabContent(currentItem, isPersona)}
      </div>
    `;
    
    console.log('render: Render completed, DOM updated');
  }

  private renderHeader(item: Persona | UserRole, isPersona: boolean): string {
    const isNew = !item.id;
    const itemType = isPersona ? '角色' : '用户角色';
    const statusText = this.getStatusText(item, isPersona);
    
    return `
      <div class="persona-detail-header">
        <div class="header-left">
          <div class="item-avatar">
            ${item.avatar ? `<img src="${item.avatar}" alt="${item.name}">` : 
              `<div class="avatar-placeholder">${isPersona ? '🤖' : '👤'}</div>`}
          </div>
          <div class="item-info">
            <h2 class="item-name">${item.name || '(未命名)'}</h2>
            <div class="item-meta">
              <span class="item-type">${itemType}</span>
              ${statusText ? `<span class="item-status">${statusText}</span>` : ''}
            </div>
          </div>
        </div>
        
        <div class="header-actions">
          ${this.state.isEditing ? `
            <button class="btn btn-secondary" onclick="window.personaCenterDetail?.cancelEdit()">取消</button>
            <button class="btn btn-primary" onclick="window.personaCenterDetail?.saveChanges()">保存</button>
          ` : `
            <button class="btn btn-secondary" onclick="window.personaCenterDetail?.duplicateItem()">复制</button>
            ${!isNew ? `<button class="btn btn-secondary" onclick="window.personaCenterDetail?.startEdit()">编辑</button>` : ''}
            ${!isNew ? `<button class="btn btn-danger" onclick="window.personaCenterDetail?.deleteItem()">删除</button>` : ''}
          `}
        </div>
      </div>
    `;
  }

  private renderTabContent(item: Persona | UserRole, isPersona: boolean): string {
    switch (this.state.activeTab) {
      case 'basic':
        return this.renderBasicTab(item, isPersona);
      case 'prompt':
        return this.renderPromptTab(item, isPersona);
      case 'baseline':
        return isPersona ? this.renderBaselineTab(item as Persona) : '';
      case 'worldbook':
        return isPersona ? this.renderWorldBookTab(item as Persona) : '';
      case 'preview':
        return this.renderPreviewTab(item, isPersona);
      default:
        return '<div class="tab-content">未知标签页</div>';
    }
  }

  private renderBasicTab(item: Persona | UserRole, isPersona: boolean): string {
    const errors = this.state.validationErrors;
    return `
      <div class="tab-content basic-tab">
        <div class="form-group">
          <label class="form-label">名称 *</label>
          <input 
            type="text" 
            class="form-input ${errors.name ? 'error' : ''}" 
            value="${item.name || ''}"
            ${this.state.isEditing ? '' : 'readonly'}
            oninput="window.personaCenterDetail?.updateField('name', this.value)"
            placeholder="请输入${isPersona ? '角色' : '用户角色'}名称"
          >
          ${errors.name ? `<div class="form-error">${errors.name}</div>` : ''}
        </div>
        
        <div class="form-group">
          <label class="form-label">头像</label>
          <input 
            type="text" 
            class="form-input" 
            value="${item.avatar || ''}"
            ${this.state.isEditing ? '' : 'readonly'}
            oninput="window.personaCenterDetail?.updateField('avatar', this.value)"
            placeholder="头像URL（可选）"
          >
        </div>
        
        <div class="form-group">
          <label class="form-label">标签</label>
          <input 
            type="text" 
            class="form-input" 
            value="${(item.tags || []).join(', ')}"
            ${this.state.isEditing ? '' : 'readonly'}
            oninput="window.personaCenterDetail?.updateTags(this.value)"
            placeholder="用逗号分隔的标签"
          >
        </div>
      </div>
    `;
  }

  private renderPromptTab(item: Persona | UserRole, isPersona: boolean): string {
    return `
      <div class="tab-content prompt-tab">
        <div class="form-group">
          <label class="form-label">角色定义</label>
          <textarea 
            class="form-textarea" 
            rows="10"
            ${this.state.isEditing ? '' : 'readonly'}
            oninput="window.personaCenterDetail?.updatePromptField('definition', this.value)"
            placeholder="请输入${isPersona ? '角色' : '用户角色'}的详细定义..."
          >${(item.prompt?.definition || '')}</textarea>
        </div>
      </div>
    `;
  }

  private renderBaselineTab(item: Persona): string {
    return `<div class="tab-content">Baseline功能开发中...</div>`;
  }

  private renderWorldBookTab(item: Persona): string {
    return `<div class="tab-content">世界书功能开发中...</div>`;
  }

  private renderPreviewTab(item: Persona | UserRole, isPersona: boolean): string {
    return `<div class="tab-content">预览功能开发中...</div>`;
  }

  // 添加缺失的辅助方法
  updateTags(value: string): void {
    if (!this.state.currentData || !this.state.isEditing) return;
    
    const tags = value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    this.state.currentData.data.tags = tags;
    this.state.isDirty = true;
  }

  private renderTabs(isPersona: boolean): string {
    const tabs = [
      { id: 'basic', label: '基本信息', icon: 'ℹ️' },
      { id: 'prompt', label: isPersona ? '提示词' : '角色设定', icon: '💬' },
      ...(isPersona ? [
        { id: 'baseline', label: 'Baseline', icon: '📊' },
        { id: 'worldbook', label: '世界书', icon: '📚' }
      ] : []),
      { id: 'preview', label: '预览', icon: '👁️' }
    ];
    
    return `
      <div class="persona-detail-tabs">
        ${tabs.map(tab => `
          <button 
            class="tab ${this.state.activeTab === tab.id ? 'active' : ''}"
            onclick="window.personaCenterDetail?.switchTab('${tab.id}')"
          >
            <span class="tab-icon">${tab.icon}</span>
            <span class="tab-label">${tab.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  private renderTabContent(item: Persona | UserRole, isPersona: boolean): string {
    switch (this.state.activeTab) {
      case 'basic':
        return this.renderBasicTab(item, isPersona);
      case 'prompt':
        return this.renderPromptTab(item, isPersona);
      case 'baseline':
        return isPersona ? this.renderBaselineTab(item as Persona) : '';
      case 'worldbook':
        return isPersona ? this.renderWorldBookTab(item as Persona) : '';
      case 'preview':
        return this.renderPreviewTab(item, isPersona);
      default:
        return '<div class="tab-content">未知标签页</div>';
    }
  }

  private renderBasicTab(item: Persona | UserRole, isPersona: boolean): string {
    const errors = this.state.validationErrors;
    
    return `
      <div class="tab-content basic-tab">
        <div class="form-group">
          <label class="form-label">名称 *</label>
          <input 
            type="text" 
            class="form-input ${errors.name ? 'error' : ''}" 
            value="${item.name || ''}"
            ${this.state.isEditing ? '' : 'readonly'}
            oninput="window.personaCenterDetail?.updateField('name', this.value)"
            placeholder="请输入${isPersona ? '角色' : '用户角色'}名称"
          >
          ${errors.name ? `<div class="form-error">${errors.name}</div>` : ''}
        </div>
        
        <div class="form-group">
          <label class="form-label">头像</label>
          <input 
            type="text" 
            class="form-input" 
            value="${item.avatar || ''}"
            ${this.state.isEditing ? '' : 'readonly'}
            oninput="window.personaCenterDetail?.updateField('avatar', this.value)"
            placeholder="头像URL（可选）"
          >
        </div>
        
        <div class="form-group">
          <label class="form-label">标签</label>
          <input 
            type="text" 
            class="form-input" 
            value="${item.tags.join(', ')}"
            ${this.state.isEditing ? '' : 'readonly'}
            oninput="window.personaCenterDetail?.updateTags(this.value)"
            placeholder="用逗号分隔的标签"
          >
        </div>
        
        ${isPersona && (item as Persona).status ? `
          <div class="form-group">
            <label class="form-label">状态</label>
            <select 
              class="form-select" 
              ${this.state.isEditing ? '' : 'disabled'}
              onchange="window.personaCenterDetail?.updateField('status', this.value)"
            >
              <option value="draft" ${(item as Persona).status === 'draft' ? 'selected' : ''}>草稿</option>
              <option value="published" ${(item as Persona).status === 'published' ? 'selected' : ''}>已发布</option>
            </select>
          </div>
        ` : ''}
        
        ${!isPersona ? `
          <div class="form-group">
            <label class="form-checkbox">
              <input 
                type="checkbox" 
                ${(item as UserRole).isGlobalDefault ? 'checked' : ''}
                ${this.state.isEditing ? '' : 'disabled'}
                onchange="window.personaCenterDetail?.updateField('isGlobalDefault', this.checked)"
              >
              <span class="checkbox-label">设为全局默认用户角色</span>
            </label>
          </div>
        ` : ''}
        
        <div class="form-group">
          <label class="form-checkbox">
            <input 
              type="checkbox" 
              ${item.archived ? 'checked' : ''}
              ${this.state.isEditing ? '' : 'disabled'}
              onchange="window.personaCenterDetail?.updateField('archived', this.checked)"
            >
            <span class="checkbox-label">已归档</span>
          </label>
        </div>
      </div>
    `;
  }

  private renderPromptTab(item: Persona | UserRole, isPersona: boolean): string {
    const errors = this.state.validationErrors;
    
    if (isPersona) {
      const persona = item as Persona;
      return `
        <div class="tab-content prompt-tab">
          <div class="form-group">
            <label class="form-label">角色设定 *</label>
            <textarea 
              class="form-textarea ${errors.system ? 'error' : ''}" 
              rows="8"
              ${this.state.isEditing ? '' : 'readonly'}
              oninput="window.personaCenterDetail?.updatePromptField('definition', this.value)"
              placeholder="请输入角色设定..."
            >${persona.prompt?.definition || persona.prompt?.system || ''}</textarea>
            ${errors.system ? `<div class="form-error">${errors.system}</div>` : ''}
          </div>
          
        </div>
      `;
    } else {
      const userRole = item as UserRole;
      return `
        <div class="tab-content prompt-tab">
          <div class="form-group">
            <label class="form-label">角色设定 *</label>
            <textarea 
              class="form-textarea ${errors.persona ? 'error' : ''}" 
              rows="6"
              ${this.state.isEditing ? '' : 'readonly'}
              oninput="window.personaCenterDetail?.updatePromptField('definition', this.value)"
              placeholder="请描述这个用户角色..."
            >${userRole.prompt?.definition || userRole.prompt?.persona || ''}</textarea>
            ${errors.persona ? `<div class="form-error">${errors.persona}</div>` : ''}
          </div>
          
        </div>
      `;
    }
  }

  private renderBaselineTab(persona: Persona): string {
    // TODO: 实现Baseline标签页
    return `
      <div class="tab-content baseline-tab">
        <div class="feature-placeholder">
          <div class="placeholder-icon">📊</div>
          <h4>Baseline功能</h4>
          <p>此功能将在后续版本中实现</p>
        </div>
      </div>
    `;
  }

  private renderWorldBookTab(persona: Persona): string {
    const worldBookLinks = persona.worldBookLinks || [];
    const availableWorldBooks = Object.values(this.currentWorldBooks);
    const linkedIds = new Set(worldBookLinks.map(link => link.worldBookId));
    
    return `
      <div class="tab-content worldbook-tab">
        <div class="worldbook-links">
          <h4>已关联的世界书</h4>
          ${worldBookLinks.length > 0 ? `
            <div class="linked-worldbooks">
              ${worldBookLinks.map((link, index) => {
                const worldBook = this.currentWorldBooks[link.worldBookId];
                return `
                  <div class="worldbook-link ${link.enabled ? '' : 'disabled'}">
                    <div class="link-info">
                      <span class="worldbook-name">${worldBook?.name || '未知世界书'}</span>
                      <span class="link-order">顺序: ${link.order || 0}</span>
                    </div>
                    <div class="link-actions">
                      <input 
                        type="number" 
                        class="order-input" 
                        value="${link.order || 0}"
                        ${this.state.isEditing ? '' : 'readonly'}
                        onchange="window.personaCenterDetail?.updateWorldBookOrder(${index}, this.value)"
                      >
                      <label class="toggle-switch">
                        <input 
                          type="checkbox" 
                          ${link.enabled ? 'checked' : ''}
                          ${this.state.isEditing ? '' : 'disabled'}
                          onchange="window.personaCenterDetail?.toggleWorldBookLink(${index}, this.checked)"
                        >
                        <span class="toggle-slider"></span>
                      </label>
                      ${this.state.isEditing ? `
                        <button class="btn btn-small btn-danger" onclick="window.personaCenterDetail?.removeWorldBookLink(${index})">移除</button>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="empty-worldbooks">
              <p>暂无关联的世界书</p>
            </div>
          `}
          
          ${this.state.isEditing && availableWorldBooks.length > 0 ? `
            <div class="add-worldbook">
              <h4>添加世界书</h4>
              <select class="form-select" id="worldbook-select">
                <option value="">选择要添加的世界书...</option>
                ${availableWorldBooks.filter(wb => !linkedIds.has(wb.id)).map(wb => 
                  `<option value="${wb.id}">${wb.name}</option>`
                ).join('')}
              </select>
              <button class="btn btn-primary" onclick="window.personaCenterDetail?.addWorldBookLink()">添加</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderPreviewTab(item: Persona | UserRole, isPersona: boolean): string {
    if (isPersona) {
      const persona = item as Persona;
      const preview = this.compositionService.generatePreview(persona, this.currentWorldBooks);
      
      return `
        <div class="tab-content preview-tab">
          <div class="preview-header">
            <h4>角色设定预览</h4>
            <div class="preview-stats">
              <span class="token-count">预估Token数: ${preview.tokenCount}</span>
            </div>
          </div>
          
          <div class="preview-content">
            <pre class="system-prompt-preview">${this.escapeHtml(preview.systemPrompt)}</pre>
          </div>
          
          <div class="preview-sections">
            <h4>组成部分</h4>
            ${preview.sections.map(section => `
              <div class="preview-section ${section.enabled ? '' : 'disabled'}">
                <div class="section-header">
                  <span class="section-title">${section.title}</span>
                  <span class="section-status">${section.enabled ? '启用' : '禁用'}</span>
                </div>
                <div class="section-content">${this.escapeHtml(section.content.substring(0, 200))}${section.content.length > 200 ? '...' : ''}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      const userRole = item as UserRole;
      const userRoleBlock = this.compositionService.injectUserRoleBlock(userRole);
      
      return `
        <div class="tab-content preview-tab">
          <div class="preview-header">
            <h4>用户角色预览</h4>
          </div>
          
          <div class="preview-content">
            <pre class="user-role-preview">${this.escapeHtml(userRoleBlock || '(无内容)')}</pre>
          </div>
        </div>
      `;
    }
  }

  // 事件监听器
  private attachEventListeners(): void {
    // 暴露组件实例到window对象，供模板中的onclick调用
    (window as any).personaCenterDetail = this;
  }

  // 字段更新方法
  updateField(fieldName: string, value: any): void {
    if (!this.state.currentData || !this.state.isEditing) return;
    
    (this.state.currentData.data as any)[fieldName] = value;
    this.state.isDirty = true;
  }

  updatePromptField(fieldName: string, value: string): void {
    if (!this.state.currentData || !this.state.isEditing) return;
    
    const item = this.state.currentData.data;
    if (!item.prompt) item.prompt = {} as any;
    (item.prompt as any)[fieldName] = value;
    this.state.isDirty = true;
  }

  updateTags(tagsString: string): void {
    if (!this.state.currentData || !this.state.isEditing) return;
    
    const tags = tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    this.state.currentData.data.tags = tags;
    this.state.isDirty = true;
  }

  // 世界书链接管理方法
  updateWorldBookOrder(linkIndex: number, order: string): void {
    if (!this.state.currentData || this.state.currentData.type !== 'persona' || !this.state.isEditing) return;
    
    const persona = this.state.currentData.data as Persona;
    if (persona.worldBookLinks && persona.worldBookLinks[linkIndex]) {
      persona.worldBookLinks[linkIndex].order = parseInt(order) || 0;
      this.state.isDirty = true;
    }
  }

  toggleWorldBookLink(linkIndex: number, enabled: boolean): void {
    if (!this.state.currentData || this.state.currentData.type !== 'persona' || !this.state.isEditing) return;
    
    const persona = this.state.currentData.data as Persona;
    if (persona.worldBookLinks && persona.worldBookLinks[linkIndex]) {
      persona.worldBookLinks[linkIndex].enabled = enabled;
      this.state.isDirty = true;
    }
  }

  removeWorldBookLink(linkIndex: number): void {
    if (!this.state.currentData || this.state.currentData.type !== 'persona' || !this.state.isEditing) return;
    
    const persona = this.state.currentData.data as Persona;
    if (persona.worldBookLinks) {
      persona.worldBookLinks.splice(linkIndex, 1);
      this.state.isDirty = true;
      this.render(); // 重新渲染以更新索引
    }
  }

  addWorldBookLink(): void {
    if (!this.state.currentData || this.state.currentData.type !== 'persona' || !this.state.isEditing) return;
    
    const selectElement = document.getElementById('worldbook-select') as HTMLSelectElement;
    if (!selectElement || !selectElement.value) return;
    
    const persona = this.state.currentData.data as Persona;
    if (!persona.worldBookLinks) persona.worldBookLinks = [];
    
    persona.worldBookLinks.push({
      worldBookId: selectElement.value,
      enabled: true,
      order: persona.worldBookLinks.length
    });
    
    this.state.isDirty = true;
    this.render(); // 重新渲染以显示新添加的链接
  }

  // 辅助方法
  private validateCurrentData(): ValidationResult {
    if (!this.state.currentData) {
      return { isValid: false, errors: { general: '没有数据可验证' } };
    }
    
    const item = this.state.currentData.data;
    const isPersona = this.state.currentData.type === 'persona';
    
    if (isPersona) {
      return this.personaService.validatePersona(item as Persona);
    } else {
      return this.userRoleService.validateUserRole(item as UserRole);
    }
  }

  private clearValidationErrors(): void {
    this.state.validationErrors = {};
  }

  private getStatusText(item: Persona | UserRole, isPersona: boolean): string {
    if (isPersona) {
      const persona = item as Persona;
      return persona.status === 'published' ? '已发布' : '草稿';
    } else {
      const userRole = item as UserRole;
      return userRole.isGlobalDefault ? '全局默认' : '';
    }
  }

  private buildCreatePersonaInput(persona: Persona): CreatePersonaInput {
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
    div.textContent = text;
    return div.innerHTML;
  }
}