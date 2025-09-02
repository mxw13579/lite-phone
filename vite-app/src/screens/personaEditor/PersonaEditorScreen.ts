// PersonaEditorScreen - 独立的角色编辑器屏幕
// 提供统一的顶部导航栏，包含返回按钮和标题

import type { Persona, UserRole } from '../personaCenter/types/PersonaTypes';
import type { PersonaDetailEvents } from '../personaCenter/types/ComponentTypes';
import type { WorldBook } from '../../state';
import { PersonaDetailComponent } from '../personaCenter/components/PersonaDetail';
import { PersonaService } from '../personaCenter/services/PersonaService';
import { UserRoleService } from '../personaCenter/services/UserRoleService';

export class PersonaEditorScreen {
  private container: HTMLElement;
  private personaDetail: PersonaDetailComponent | null = null;
  private personaService: PersonaService;
  private userRoleService: UserRoleService;
  private editorMode: 'persona' | 'user' = 'persona';
  private currentData: Persona | UserRole | null = null;
  
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
          </h1>
          <div class="header-actions">
            <button class="btn btn-primary" onclick="window.personaEditorScreen?.saveAndReturn()" id="save-persona-btn">
              保存
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
      onWorldBookChange: (links: any[]) => { /* 暂不处理 */ }
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

  // 返回上一页面
  goBack(): void {
    try {
      // 清理全局状态
      const win = window as any;
      delete win._personaEditorMode;
      delete win._selectedPersonaForEdit;
      delete win._selectedUserRoleForEdit;
      
      // 优先尝试历史后退，如果无历史记录则返回角色中心
      if (window.history.length > 1) {
        window.history.back();
      } else {
        // 无历史记录时，导入路由模块并返回角色中心
        import('../../router/index').then(({ showScreen, SCREEN_IDS }) => {
          showScreen(SCREEN_IDS.PERSONA_CENTER);
        }).catch(error => {
          console.error('返回导航失败:', error);
          // 降级处理，直接显示角色中心
          if (window.showScreen) {
            window.showScreen('persona-center-screen');
          }
        });
      }
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
  }

  private detachEventListeners(): void {
    delete (window as any).personaEditorScreen;
  }
}