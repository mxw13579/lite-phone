// PersonaEditorScreen - 独立的角色编辑器屏幕
// 提供统一的顶部导航栏，包含返回按钮和标题

import type { Persona, UserRole } from '../personaCenter/types/PersonaTypes';
import type { PersonaDetailEvents } from '../personaCenter/types/ComponentTypes';
import type { WorldBook } from '../../state';
import { PersonaDetailComponent } from '../personaCenter/components/PersonaDetail';
import { PersonaService } from '../personaCenter/services/PersonaService';
import { UserRoleService } from '../personaCenter/services/UserRoleService';
import { setBeforeNavigateGuard, type ScreenId } from '../../router/index';

export class PersonaEditorScreen {
  private container: HTMLElement;
  private personaDetail: PersonaDetailComponent | null = null;
  private personaService: PersonaService;
  private userRoleService: UserRoleService;
  private editorMode: 'persona' | 'user' = 'persona';
  private currentData: Persona | UserRole | null = null;
  
  // 事件处理器引用，用于正确解绑
  private onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);
  private onBeforeUnload = (event: BeforeUnloadEvent) => this.handleBeforeUnload(event);
  private updateButtonTimer: number | null = null;
  
  constructor(container: HTMLElement) {
    this.container = container;
    this.personaService = new PersonaService();
    this.userRoleService = new UserRoleService();
  }

  // 初始化编辑器
  async initialize(): Promise<void> {
    try {
      // 从全局变量获取编辑模式和数据
      const win = window as any;
      this.editorMode = win._personaEditorMode || 'persona';
      this.currentData = win._selectedPersonaForEdit || win._selectedUserRoleForEdit || null;
      
      console.log('PersonaEditorScreen初始化:', { mode: this.editorMode, hasData: !!this.currentData });
      
      await this.render();
      await this.initializeComponents();
      this.attachEventListeners();
      this.registerNavigationGuard();
      
    } catch (error) {
      console.error('PersonaEditorScreen初始化失败:', error);
      this.renderError(error instanceof Error ? error.message : '初始化失败');
    }
  }

  // 销毁编辑器
  destroy(): void {
    this.personaDetail?.destroy();
    this.personaDetail = null;
    this.detachEventListeners();
    this.unregisterNavigationGuard();
    console.log('PersonaEditorScreen已销毁');
  }

  // 渲染基础布局（统一的顶部导航）
  private async render(): Promise<void> {
    const isEditing = !!this.currentData;
    const title = isEditing 
      ? `编辑${this.editorMode === 'persona' ? 'AI角色' : '用户角色'}` 
      : `新建${this.editorMode === 'persona' ? 'AI角色' : '用户角色'}`;

    this.container.innerHTML = `
      <div class="persona-editor-screen">
        <header class="header" role="banner">
          <button class="back-btn" onclick="window.personaEditorScreen?.goBack()" aria-label="返回角色中心">
            <span aria-hidden="true">‹</span>
          </button>
          <h1 class="header-title">
            <span class="title-icon">${this.editorMode === 'persona' ? '🤖' : '👤'}</span>
            ${title}
            <span class="unsaved-badge" id="unsaved-badge" style="display: none;">未保存更改</span>
          </h1>
          <div class="header-actions">
            <button class="btn btn-primary" onclick="window.personaEditorScreen?.saveAndReturn()" id="save-persona-btn">
              <span id="save-btn-text">保存</span>
            </button>
          </div>
        </header>
        
        <div class="persona-editor-content" id="persona-detail-container">
          <!-- PersonaDetail组件将挂载到这里 -->
        </div>
      </div>
    `;
  }

  // 初始化组件
  private async initializeComponents(): Promise<void> {
    const detailContainer = this.container.querySelector('#persona-detail-container') as HTMLElement;
    if (!detailContainer) {
      throw new Error('找不到角色详情容器');
    }

    // 获取世界书数据
    const worldBooks = await this.getWorldBooks();

    // 创建PersonaDetail组件的事件处理器
    const detailEvents: PersonaDetailEvents = {
      onSave: (data: Persona | UserRole) => this.handleSave(data),
      onCancel: () => this.goBack(),
      onDelete: (id: string) => this.handleDelete(id),
      onPreview: (data: Persona) => this.handlePreview(data),
      onWorldBookChange: (links: any[]) => { /* 暂不处理 */ },
      onDirtyChange: (isDirty: boolean) => this.updateSaveButtonState() // 脏状态变更时更新按钮
    };

    // 创建PersonaDetail组件实例
    this.personaDetail = new PersonaDetailComponent(detailContainer, detailEvents, worldBooks);

    // 如果有数据，加载到组件中
    if (this.currentData) {
      await this.personaDetail.loadData(
        this.currentData,
        this.editorMode === 'persona' ? 'persona' : 'user'
      );
    } else {
      // 创建新角色的默认数据
      const defaultData = this.editorMode === 'persona' 
        ? this.createDefaultPersona() 
        : this.createDefaultUserRole();
      
      await this.personaDetail.loadData(
        defaultData,
        this.editorMode === 'persona' ? 'persona' : 'user'
      );
      
      // 设置为编辑模式
      this.personaDetail.setEditing(true);
    }

    // 渲染组件
    await this.personaDetail.render();
  }

  // 创建默认AI角色数据
  private createDefaultPersona(): Persona {
    return {
      id: '',
      name: '',
      prompt: '',
      avatar: '',
      tags: [],
      archived: false,
      published: false,
      baselineConfig: {
        enabled: false,
        content: '',
        strength: 0.5,
        insertionPosition: 'after_scenario'
      },
      worldBookLinks: [],
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      usageCount: 0
    };
  }

  // 创建默认用户角色数据  
  private createDefaultUserRole(): UserRole {
    return {
      id: '',
      name: '',
      prompt: '',
      avatar: '',
      tags: [],
      archived: false,
      isGlobalDefault: false,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      usageCount: 0
    };
  }

  // 保存并返回
  async saveAndReturn(): Promise<void> {
    if (!this.personaDetail) return;
    
    try {
      // 触发保存
      await this.personaDetail.saveChanges();
      
      // 保存成功后返回
      this.goBack();
    } catch (error) {
      console.error('保存失败:', error);
      alert(`保存失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 处理保存事件
  private async handleSave(data: Persona | UserRole): Promise<void> {
    try {
      const isNew = !data.id;
      
      if (this.editorMode === 'persona') {
        const persona = data as Persona;
        if (isNew) {
          await this.personaService.create(persona);
          console.log('新AI角色创建成功:', persona.name);
        } else {
          await this.personaService.update(persona.id, persona);
          console.log('AI角色更新成功:', persona.name);
        }
      } else {
        const userRole = data as UserRole;
        if (isNew) {
          await this.userRoleService.create(userRole);
          console.log('新用户角色创建成功:', userRole.name);
        } else {
          await this.userRoleService.update(userRole.id, userRole);
          console.log('用户角色更新成功:', userRole.name);
        }
      }
      
      // 保存成功提示
      this.showSuccessMessage(`${isNew ? '创建' : '更新'}成功！`);
      
    } catch (error) {
      console.error('保存失败:', error);
      throw new Error(`保存失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 处理删除事件
  private async handleDelete(id: string): Promise<void> {
    if (!confirm('确定要删除这个角色吗？此操作无法撤销。')) {
      return;
    }

    try {
      if (this.editorMode === 'persona') {
        await this.personaService.delete(id);
      } else {
        await this.userRoleService.delete(id);
      }
      
      this.showSuccessMessage('删除成功！');
      this.goBack();
      
    } catch (error) {
      console.error('删除失败:', error);
      alert(`删除失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  // 处理预览事件（暂时简单处理）
  private handlePreview(data: Persona): void {
    console.log('预览角色:', data);
    // TODO: 实现预览功能
    alert('预览功能暂未实现');
  }

  // 注册导航守卫
  private registerNavigationGuard(): void {
    // 设置路由导航守卫
    setBeforeNavigateGuard((from: ScreenId, to: ScreenId) => {
      return this.handleBeforeNavigate(from, to);
    });
    
    // 设置浏览器关闭/刷新拦截
    window.addEventListener('beforeunload', this.onBeforeUnload);
    
    console.log('PersonaEditor: 导航守卫已注册');
  }

  // 取消导航守卫
  private unregisterNavigationGuard(): void {
    setBeforeNavigateGuard(null);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    console.log('PersonaEditor: 导航守卫已清除');
  }

  // 处理导航前拦截
  private handleBeforeNavigate(from: ScreenId, to: ScreenId): boolean {
    if (!this.personaDetail?.isDirty()) {
      return true; // 无更改，直接放行
    }
    
    // 有未保存更改，显示确认对话框
    const choice = this.showLeaveConfirmDialog();
    
    switch (choice) {
      case 'save':
        // 保存后离开 - 注意：这里应该是同步保存
        try {
          // 异步保存，但由于守卫需要同步返回，这里需要特殊处理
          // 暂时阻止导航，然后异步保存完成后再手动触发导航
          this.saveAndNavigate(to);
          return false; // 先阻止，保存成功后手动导航
        } catch (error) {
          console.error('PersonaEditor: 保存失败，阻止导航', error);
          return false;
        }
      case 'discard':
        // 不保存，直接离开
        return true;
      case 'cancel':
      default:
        // 取消离开
        return false;
    }
  }

  // 保存并导航到目标屏幕
  private async saveAndNavigate(targetScreen: ScreenId): Promise<void> {
    try {
      await this.personaDetail?.saveChanges();
      console.log('PersonaEditor: 保存成功，执行导航');
      
      // 暂时清除守卫，避免递归调用
      setBeforeNavigateGuard(null);
      
      // 执行导航
      const { showScreen } = await import('../../router/index');
      showScreen(targetScreen);
      
    } catch (error) {
      console.error('PersonaEditor: 保存失败', error);
      alert(`保存失败：${error instanceof Error ? error.message : '未知错误'}`);
      
      // 保存失败，恢复守卫
      this.registerNavigationGuard();
    }
  }

  // 处理浏览器关闭/刷新拦截
  private handleBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.personaDetail?.isDirty()) {
      event.preventDefault();
      event.returnValue = '您有未保存的更改，确定要离开吗？';
    }
  }

  // 显示离开确认对话框
  private showLeaveConfirmDialog(): 'save' | 'discard' | 'cancel' {
    const message = '您有未保存的更改，请选择：\n\n1. 保存更改 (确定)\n2. 不保存离开 (取消后选择"不保存")\n3. 继续编辑 (取消)';
    
    if (confirm(message)) {
      return 'save';
    } else {
      // 用户点击取消后，再次询问是否不保存离开
      if (confirm('确定要丢弃所有更改并离开吗？')) {
        return 'discard';
      } else {
        return 'cancel';
      }
    }
  }

  // 更新保存按钮状态
  private updateSaveButtonState(): void {
    const saveBtn = document.getElementById('save-persona-btn') as HTMLButtonElement;
    const saveBtnText = document.getElementById('save-btn-text');
    const unsavedBadge = document.getElementById('unsaved-badge');
    
    if (saveBtn && saveBtnText) {
      const isDirty = this.personaDetail?.isDirty() || false;
      
      if (isDirty) {
        saveBtn.disabled = false;
        saveBtn.classList.remove('disabled');
        saveBtnText.textContent = '保存';
        
        // 显示未保存更改徽标
        if (unsavedBadge) {
          unsavedBadge.style.display = 'inline-block';
        }
      } else {
        saveBtn.disabled = true;
        saveBtn.classList.add('disabled');
        saveBtnText.textContent = '已保存';
        
        // 隐藏未保存更改徽标
        if (unsavedBadge) {
          unsavedBadge.style.display = 'none';
        }
      }
    }
  }

  // 返回上一页面
  goBack(): void {
    try {
      // 清理全局状态
      const win = window as any;
      delete win._personaEditorMode;
      delete win._selectedPersonaForEdit;
      delete win._selectedUserRoleForEdit;
      
      // 使用路由系统的goBack，这样会经过导航守卫
      import('../../router/index').then(({ goBack, showScreen, SCREEN_IDS }) => {
        if (!goBack()) {
          // 无历史记录时，返回角色中心
          showScreen(SCREEN_IDS.PERSONA_CENTER);
        }
      }).catch(error => {
        console.error('返回导航失败:', error);
        // 降级处理，直接显示角色中心
        if (window.showScreen) {
          window.showScreen('persona-center-screen');
        }
      });
    } catch (error) {
      console.error('返回操作失败:', error);
    }
  }

  // 获取世界书数据
  private async getWorldBooks(): Promise<Record<string, WorldBook>> {
    try {
      const state = (window as any).state;
      if (state?.worldBooks) {
        const worldBooksArray = state.worldBooks as WorldBook[];
        const worldBooksMap: Record<string, WorldBook> = {};
        worldBooksArray.forEach(wb => {
          worldBooksMap[wb.id] = wb;
        });
        return worldBooksMap;
      }
      return {};
    } catch (error) {
      console.error('获取WorldBooks失败:', error);
      return {};
    }
  }

  // 渲染错误状态
  private renderError(message: string): void {
    this.container.innerHTML = `
      <div class="persona-editor-screen error">
        <header class="header" role="banner">
          <button class="back-btn" onclick="window.personaEditorScreen?.goBack()">
            <span>‹</span>
          </button>
          <h1 class="header-title">角色编辑器</h1>
          <div style="width: 60px;"></div>
        </header>
        
        <div class="error-content">
          <div class="error-message">
            <div class="error-icon">❌</div>
            <h3>加载失败</h3>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="window.personaEditorScreen?.initialize()">重试</button>
          </div>
        </div>
      </div>
    `;
  }

  // 显示成功消息
  private showSuccessMessage(message: string): void {
    // 简单的成功提示，可以后续改进为toast组件
    const existingToast = document.querySelector('.success-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'success-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 24px;
      border-radius: 4px;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // 事件监听器
  private attachEventListeners(): void {
    // 暴露到全局供模板调用
    (window as any).personaEditorScreen = this;
    
    // 添加键盘快捷键支持
    document.addEventListener('keydown', this.onKeyDown);
    
    // 初始化保存按钮状态
    this.updateSaveButtonState();
  }

  private detachEventListeners(): void {
    delete (window as any).personaEditorScreen;
    document.removeEventListener('keydown', this.onKeyDown);
  }

  // 处理键盘快捷键
  private handleKeyDown(event: KeyboardEvent): void {
    // Ctrl+S 或 Cmd+S 保存
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      this.saveAndReturn();
    }
  }
}