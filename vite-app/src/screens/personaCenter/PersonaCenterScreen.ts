// PersonaCenterScreen - 角色中心主屏幕控制器
// 负责整合PersonaList和PersonaDetail组件，管理它们之间的通信和数据流

import type { 
  Persona, 
  UserRole, 
  PersonaListEvents, 
  PersonaDetailEvents,
  SearchOptions,
  FilterOptions,
  PersonaCenterState
} from './types/PersonaTypes.js';

import type { WorldBook } from '../../state/index.js';
import { PersonaService } from './services/PersonaService.js';
import { UserRoleService } from './services/UserRoleService.js';
import { ImportExportService } from './services/ImportExportService.js';
import { PersonaListComponent } from './components/PersonaList.js';
import { PersonaDetailComponent } from './components/PersonaDetail.js';

export class PersonaCenterScreen {
  private container: HTMLElement;
  private state: PersonaCenterState;
  
  // 服务层
  private personaService: PersonaService;
  private userRoleService: UserRoleService;
  private importExportService: ImportExportService;
  
  // 组件
  private personaList: PersonaListComponent | null = null;
  private personaDetail: PersonaDetailComponent | null = null;
  
  // 容器元素
  private leftPanel: HTMLElement | null = null;
  private rightPanel: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    
    this.personaService = new PersonaService();
    this.userRoleService = new UserRoleService();
    this.importExportService = new ImportExportService();
    
    this.state = {
      loading: false,
      error: null,
      selectedPersonaId: null,
      selectedUserRoleId: null,
      viewMode: 'list', // 'list' | 'detail'
      searchTerm: '',
      filterOptions: {
        type: 'all',
        status: 'all',
        archived: false
      }
    };
  }

  // 初始化屏幕
  async initialize(): Promise<void> {
    try {
      this.state.loading = true;
      await this.render(); // 渲染loading状态
      
      // 设置为非loading状态并渲染主内容
      this.state.loading = false;
      await this.render(); // 渲染主内容
      
      await this.initializeComponents();
      await this.loadInitialData();
      this.attachGlobalEventListeners();
      
      console.log('PersonaCenterScreen initialized successfully');
    } catch (error) {
      console.error('PersonaCenterScreen initialization failed:', error);
      this.state.error = error instanceof Error ? error.message : '初始化失败';
      this.state.loading = false;
      this.render();
    } finally {
      this.state.loading = false;
    }
  }

  // 销毁屏幕
  destroy(): void {
    this.detachGlobalEventListeners();
    this.personaList?.destroy();
    this.personaDetail = null;
    this.personaList = null;
    console.log('PersonaCenterScreen destroyed');
  }

  // 渲染基础布局
  async render(): Promise<void> {
    if (this.state.loading) {
      this.container.innerHTML = `
        <div class="persona-center loading">
          <div class="loading-spinner">
            <div class="spinner"></div>
            <p>加载中...</p>
          </div>
        </div>
      `;
      return;
    }

    if (this.state.error) {
      this.container.innerHTML = `
        <div class="persona-center error">
          <div class="error-message">
            <div class="error-icon">❌</div>
            <h3>加载失败</h3>
            <p>${this.state.error}</p>
            <button class="btn btn-primary" onclick="window.personaCenterScreen?.retry()">重试</button>
          </div>
        </div>
      `;
      return;
    }

    this.container.innerHTML = `
      <div class="persona-center">
        <header class="persona-center-header">
          <div class="header-left">
            <h1 class="screen-title">
              <span class="title-icon">🎭</span>
              角色中心
            </h1>
            <div class="screen-subtitle">管理AI角色和用户角色</div>
          </div>
          
          <div class="header-actions">
            <button class="btn btn-secondary" onclick="window.personaCenterScreen?.showImportExport()">
              <span class="btn-icon">📁</span>
              导入导出
            </button>
            <div class="btn-group">
              <button class="btn btn-primary" onclick="window.personaCenterScreen?.createNewPersona()">
                <span class="btn-icon">🤖</span>
                新建AI角色
              </button>
              <button class="btn btn-primary" onclick="window.personaCenterScreen?.createNewUserRole()">
                <span class="btn-icon">👤</span>
                新建用户角色
              </button>
            </div>
          </div>
        </header>

        <div class="persona-center-content">
          <div class="left-panel" id="persona-list-container"></div>
          <div class="right-panel" id="persona-detail-container"></div>
        </div>
      </div>
    `;

    // 直接从容器内查找面板元素，避免时序问题
    this.leftPanel = this.container.querySelector('#persona-list-container') as HTMLElement;
    this.rightPanel = this.container.querySelector('#persona-detail-container') as HTMLElement;
  }

  // 初始化组件
  private async initializeComponents(): Promise<void> {
    if (!this.leftPanel || !this.rightPanel) {
      console.error('查找失败 - leftPanel:', !!this.leftPanel, 'rightPanel:', !!this.rightPanel);
      throw new Error('面板容器未找到');
    }

    // 获取世界书数据
    const worldBooks = await this.getWorldBooks();

    // 初始化PersonaList组件
    const listEvents: PersonaListEvents = {
      onPersonaSelected: (persona) => this.handlePersonaSelected(persona),
      onUserRoleSelected: (userRole) => this.handleUserRoleSelected(userRole),
      onPersonaCreated: (persona) => this.handlePersonaCreated(persona),
      onUserRoleCreated: (userRole) => this.handleUserRoleCreated(userRole),
      onPersonaUpdated: (persona) => this.handlePersonaUpdated(persona),
      onUserRoleUpdated: (userRole) => this.handleUserRoleUpdated(userRole),
      onPersonaDeleted: (personaId) => this.handlePersonaDeleted(personaId),
      onUserRoleDeleted: (userRoleId) => this.handleUserRoleDeleted(userRoleId),
      onSearchChange: (searchTerm) => this.handleSearchChange(searchTerm),
      onFilterChange: (filters) => this.handleFilterChange(filters)
    };

    this.personaList = new PersonaListComponent(this.leftPanel, listEvents);

    // 初始化PersonaDetail组件
    const detailEvents: PersonaDetailEvents = {
      onPersonaSelected: (persona) => this.handlePersonaSelected(persona),
      onUserRoleSelected: (userRole) => this.handleUserRoleSelected(userRole),
      onPersonaCreated: (persona) => this.handlePersonaCreated(persona),
      onUserRoleCreated: (userRole) => this.handleUserRoleCreated(userRole),
      onPersonaUpdated: (persona) => this.handlePersonaUpdated(persona),
      onUserRoleUpdated: (userRole) => this.handleUserRoleUpdated(userRole),
      onPersonaDeleted: (personaId) => this.handlePersonaDeleted(personaId),
      onUserRoleDeleted: (userRoleId) => this.handleUserRoleDeleted(userRoleId)
    };

    this.personaDetail = new PersonaDetailComponent(this.rightPanel, detailEvents, worldBooks);

    // 渲染组件（这会自动加载数据）
    await this.personaList.render();
  }

  // 加载初始数据
  private async loadInitialData(): Promise<void> {
    // PersonaList组件在render()时已经加载了数据，这里不需要额外操作
    console.log('初始数据加载完成');
  }

  // 事件处理方法
  private async handlePersonaSelected(persona: Persona): Promise<void> {
    this.state.selectedPersonaId = persona.id;
    this.state.selectedUserRoleId = null;
    
    if (this.personaDetail) {
      await this.personaDetail.showPersona(persona);
    }
    
    // 更新PersonaService的最后使用时间
    this.personaService.updateLastUsedAt(persona.id).catch(console.error);
  }

  private async handleUserRoleSelected(userRole: UserRole): Promise<void> {
    this.state.selectedUserRoleId = userRole.id;
    this.state.selectedPersonaId = null;
    
    if (this.personaDetail) {
      await this.personaDetail.showUserRole(userRole);
    }
    
    // 更新UserRoleService的最后使用时间
    this.userRoleService.updateLastUsedAt(userRole.id).catch(console.error);
  }

  private async handlePersonaCreated(persona: Persona): Promise<void> {
    // 刷新列表
    if (this.personaList) {
      await this.personaList.loadData();
    }
    
    // 选中新创建的角色
    await this.handlePersonaSelected(persona);
  }

  private async handleUserRoleCreated(userRole: UserRole): Promise<void> {
    // 刷新列表
    if (this.personaList) {
      await this.personaList.loadData();
    }
    
    // 选中新创建的用户角色
    await this.handleUserRoleSelected(userRole);
  }

  private async handlePersonaUpdated(persona: Persona): Promise<void> {
    // 刷新列表
    if (this.personaList) {
      await this.personaList.loadData();
    }
    
    // 如果当前选中的是这个角色，更新详情视图
    if (this.state.selectedPersonaId === persona.id && this.personaDetail) {
      await this.personaDetail.showPersona(persona);
    }
  }

  private async handleUserRoleUpdated(userRole: UserRole): Promise<void> {
    // 刷新列表
    if (this.personaList) {
      await this.personaList.loadData();
    }
    
    // 如果当前选中的是这个用户角色，更新详情视图
    if (this.state.selectedUserRoleId === userRole.id && this.personaDetail) {
      await this.personaDetail.showUserRole(userRole);
    }
  }

  private async handlePersonaDeleted(personaId: string): Promise<void> {
    // 刷新列表
    if (this.personaList) {
      await this.personaList.loadData();
    }
    
    // 如果删除的是当前选中的角色，清空详情视图
    if (this.state.selectedPersonaId === personaId) {
      this.state.selectedPersonaId = null;
      if (this.personaDetail) {
        this.personaDetail.clear();
      }
    }
  }

  private async handleUserRoleDeleted(userRoleId: string): Promise<void> {
    // 刷新列表
    if (this.personaList) {
      await this.personaList.loadData();
    }
    
    // 如果删除的是当前选中的用户角色，清空详情视图
    if (this.state.selectedUserRoleId === userRoleId) {
      this.state.selectedUserRoleId = null;
      if (this.personaDetail) {
        this.personaDetail.clear();
      }
    }
  }

  private handleSearchChange(searchTerm: string): void {
    this.state.searchTerm = searchTerm;
    console.log('Search changed:', searchTerm);
  }

  private handleFilterChange(filters: FilterOptions): void {
    this.state.filterOptions = { ...this.state.filterOptions, ...filters };
    console.log('Filters changed:', this.state.filterOptions);
  }

  // 公开方法
  async createNewPersona(): Promise<void> {
    if (this.personaDetail) {
      await this.personaDetail.showCreatePersona();
    }
    
    // 清除列表选中状态
    this.state.selectedPersonaId = null;
    this.state.selectedUserRoleId = null;
    if (this.personaList) {
      this.personaList.clearSelection();
    }
  }

  async createNewUserRole(): Promise<void> {
    if (this.personaDetail) {
      await this.personaDetail.showCreateUserRole();
    }
    
    // 清除列表选中状态
    this.state.selectedPersonaId = null;
    this.state.selectedUserRoleId = null;
    if (this.personaList) {
      this.personaList.clearSelection();
    }
  }

  async showImportExport(): Promise<void> {
    // TODO: 实现导入导出对话框
    const choice = prompt(
      '导入导出功能:\n1. 导出所有角色\n2. 导出所有用户角色\n3. 导出全部\n4. 导入\n\n请输入数字选择:'
    );
    
    switch (choice) {
      case '1':
        await this.exportPersonas();
        break;
      case '2':
        await this.exportUserRoles();
        break;
      case '3':
        await this.exportAll();
        break;
      case '4':
        await this.importData();
        break;
      default:
        return;
    }
  }

  private async exportPersonas(): Promise<void> {
    try {
      const data = await this.importExportService.exportPersonas();
      const filename = this.importExportService.generateFilename('persona');
      this.importExportService.downloadExport(data, filename);
      alert('导出成功！');
    } catch (error) {
      console.error('导出角色失败:', error);
      alert(`导出失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async exportUserRoles(): Promise<void> {
    try {
      const data = await this.importExportService.exportUserRoles();
      const filename = this.importExportService.generateFilename('userRole');
      this.importExportService.downloadExport(data, filename);
      alert('导出成功！');
    } catch (error) {
      console.error('导出用户角色失败:', error);
      alert(`导出失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async exportAll(): Promise<void> {
    try {
      const data = await this.importExportService.exportAll();
      const filename = this.importExportService.generateFilename('mixed');
      this.importExportService.downloadExport(data, filename);
      alert('导出成功！');
    } catch (error) {
      console.error('导出全部数据失败:', error);
      alert(`导出失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async importData(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const strategyChoice = prompt(
          '导入策略:\n1. preserve - 保留已有数据\n2. override - 覆盖已有数据\n3. regenId - 生成新ID\n\n请输入数字选择:'
        );
        
        let strategy: 'preserve' | 'override' | 'regenId' = 'preserve';
        switch (strategyChoice) {
          case '2':
            strategy = 'override';
            break;
          case '3':
            strategy = 'regenId';
            break;
          default:
            strategy = 'preserve';
        }
        
        const result = await this.importExportService.import(file, strategy);
        
        let message = '导入完成！\n';
        message += `角色: 导入 ${result.imported.personas} 个，跳过 ${result.skipped.personas} 个\n`;
        message += `用户角色: 导入 ${result.imported.userRoles} 个，跳过 ${result.skipped.userRoles} 个`;
        
        if (result.errors.length > 0) {
          message += `\n\n错误信息:\n${result.errors.join('\n')}`;
        }
        
        alert(message);
        
        // 刷新数据
        if (this.personaList) {
          await this.personaList.loadData();
        }
        
      } catch (error) {
        console.error('导入失败:', error);
        alert(`导入失败：${error instanceof Error ? error.message : '未知错误'}`);
      }
    };
    
    input.click();
  }

  async retry(): Promise<void> {
    this.state.error = null;
    await this.initialize();
  }

  // 辅助方法
  private async getWorldBooks(): Promise<Record<string, WorldBook>> {
    try {
      // 从全局状态或数据库获取WorldBook数据
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

  // 全局事件监听器
  private attachGlobalEventListeners(): void {
    // 暴露到全局window对象供模板调用
    (window as any).personaCenterScreen = this;
    
    // 监听窗口大小变化
    window.addEventListener('resize', this.handleWindowResize);
    
    // 监听键盘快捷键
    document.addEventListener('keydown', this.handleKeyDown);
  }

  private detachGlobalEventListeners(): void {
    window.removeEventListener('resize', this.handleWindowResize);
    document.removeEventListener('keydown', this.handleKeyDown);
    delete (window as any).personaCenterScreen;
  }

  private handleWindowResize = (): void => {
    // 处理窗口大小变化，如果需要的话
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    // 处理键盘快捷键
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'n':
          event.preventDefault();
          this.createNewPersona();
          break;
        case 'u':
          event.preventDefault();
          this.createNewUserRole();
          break;
        case 'i':
          event.preventDefault();
          this.showImportExport();
          break;
      }
    }
  };

  // 状态访问方法
  getState(): PersonaCenterState {
    return { ...this.state };
  }

  // 世界书数据更新
  async updateWorldBooks(): Promise<void> {
    const worldBooks = await this.getWorldBooks();
    if (this.personaDetail) {
      this.personaDetail.updateWorldBooks(worldBooks);
    }
  }
}