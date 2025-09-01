// PersonaCenterScreen - 角色中心主屏幕控制器
// 负责整合PersonaList和PersonaDetail组件，管理它们之间的通信和数据流

import type { 
  Persona, 
  UserRole, 
  SearchOptions,
  FilterOptions,
  PersonaCenterState
} from './types/PersonaTypes';

import type { 
  PersonaListEvents, 
  PersonaDetailEvents
} from './types/ComponentTypes';

import type { WorldBook } from '../../state';
import { PersonaService } from './services/PersonaService';
import { UserRoleService } from './services/UserRoleService';
import { ImportExportService } from './services/ImportExportService';
import { PersonaListComponent } from './components/PersonaList';
import { PersonaDetailComponent } from './components/PersonaDetail';

export class PersonaCenterScreen {
  private container: HTMLElement;
  private state: PersonaCenterState;
  private isDetailVisible: boolean = false;
  
  // 服务层
  private personaService: PersonaService;
  private userRoleService: UserRoleService;
  private importExportService: ImportExportService;
  
  // 组件
  private personaList: PersonaListComponent | null = null;
  private personaDetail: PersonaDetailComponent | null = null;
  
  // 容器元素  
  private leftPanel: HTMLElement | null = null;

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
      },
      activeMenu: 'ai'
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
        <header class="header" role="banner">
          <button class="back-btn" onclick="window.showScreen && window.showScreen('home-screen')" aria-label="返回主屏幕">
            <span aria-hidden="true">‹</span>
          </button>
          <h1 class="header-title">
            <span class="title-icon">🎭</span>
            角色中心
          </h1>
          <div style="width: 30px;"></div>
        </header>
        <nav class="pc-nav" role="tablist" aria-label="角色中心功能菜单">
          <button class="nav-item" data-menu="ai" onclick="window.personaCenterScreen?.switchMenu('ai')">AI角色</button>
          <button class="nav-item" data-menu="user" onclick="window.personaCenterScreen?.switchMenu('user')">用户角色</button>
        </nav>

        

        <div class="persona-center-content">
          <div class="main-panel" id="persona-list-container"></div>
        </div>
      </div>
    `;

    // 直接从容器内查找面板元素，避免时序问题
    this.leftPanel = this.container.querySelector('#persona-list-container') as HTMLElement;
    this.updateNavActive();
  }

  // 初始化组件
  private async initializeComponents(): Promise<void> {
    if (!this.leftPanel) {
      console.error('查找失败 - leftPanel:', !!this.leftPanel);
      throw new Error('面板容器未找到');
    }

    // 获取世界书数据
    const worldBooks = await this.getWorldBooks();

    // 初始化PersonaList组件
    const listEvents: PersonaListEvents = {
      onSelect: (id: string, type: 'ai' | 'user') => {
        if (type === 'ai') {
          this.personaService.getById(id).then(persona => {
            if (persona) this.handlePersonaSelected(persona);
          });
        } else {
          this.userRoleService.getById(id).then(userRole => {
            if (userRole) this.handleUserRoleSelected(userRole);
          });
        }
      },
      onCreate: (type: 'ai' | 'user') => {
        if (type === 'ai') this.createNewPersona();
        else this.createNewUserRole();
      },
      onDelete: (id: string, type: 'ai' | 'user') => {
        if (type === 'ai') this.handlePersonaDeleted(id);
        else this.handleUserRoleDeleted(id);
      },
      onArchive: (id: string, archived: boolean) => {
        // 根据需要实现归档逻辑
      },
      onSearch: (options: SearchOptions) => this.handleSearchChange(options.term),
      onFilter: (filters: FilterOptions) => this.handleFilterChange(filters)
    };

    this.personaList = new PersonaListComponent(this.leftPanel, listEvents);

    // 渲染组件（这会自动加载数据）
    await this.personaList.render();
    // 默认进入AI角色菜单
    this.switchMenu(this.state.activeMenu || 'ai');
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
    
    // 在角色中心列表页，选择角色后跳转到编辑页面
    try {
      const { showScreen, SCREEN_IDS } = await import('../../router');
      const win = window as any;
      win._selectedPersonaForEdit = persona;
      showScreen(SCREEN_IDS.PERSONA_EDITOR);
    } catch (error) {
      console.error('跳转到编辑页面失败:', error);
    }
    
    // 更新PersonaService的最后使用时间
    this.personaService.updateLastUsedAt(persona.id).catch(console.error);
  }

  private async handleUserRoleSelected(userRole: UserRole): Promise<void> {
    this.state.selectedUserRoleId = userRole.id;
    this.state.selectedPersonaId = null;
    
    // 在角色中心列表页，选择用户角色后跳转到编辑页面
    try {
      const { showScreen, SCREEN_IDS } = await import('../../router');
      const win = window as any;
      win._selectedUserRoleForEdit = userRole;
      showScreen(SCREEN_IDS.PERSONA_EDITOR);
    } catch (error) {
      console.error('跳转到编辑页面失败:', error);
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
    
    // 角色列表页不需要更新详情视图，列表数据刷新已足够
  }

  private async handleUserRoleUpdated(userRole: UserRole): Promise<void> {
    // 刷新列表
    if (this.personaList) {
      await this.personaList.loadData();
    }
    
    // 角色列表页不需要更新详情视图，列表数据刷新已足够
  }

  private async handlePersonaDeleted(personaId: string): Promise<void> {
    // 刷新列表
    if (this.personaList) {
      await this.personaList.loadData();
    }
    
    // 清空选中状态
    if (this.state.selectedPersonaId === personaId) {
      this.state.selectedPersonaId = null;
    }
  }

  private async handleUserRoleDeleted(userRoleId: string): Promise<void> {
    // 刷新列表
    if (this.personaList) {
      await this.personaList.loadData();
    }
    
    // 清空选中状态
    if (this.state.selectedUserRoleId === userRoleId) {
      this.state.selectedUserRoleId = null;
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
    // 跳转到专用的编辑界面
    try {
      const { showScreen } = await import('../../router');
      const win = window as any;
      
      // 设置编辑模式
      win._personaEditorMode = 'persona';
      console.log('createNewPersona: Setting editor mode to persona and navigating...');
      
      // 直接使用字符串ID而不是通过SCREEN_IDS常量
      const personaEditorScreenId = 'persona-editor-screen';
      console.log('即将跳转到:', personaEditorScreenId);
      
      showScreen(personaEditorScreenId as any);
      return;
    } catch (error) {
      console.error('跳转失败:', error);
      alert('无法打开角色编辑页面，请检查路由配置');
    }
  }

  async createNewUserRole(): Promise<void> {
    // 跳转到专用的编辑界面
    try {
      const { showScreen } = await import('../../router');
      const win = window as any;
      
      // 设置编辑模式  
      win._personaEditorMode = 'user';
      console.log('createNewUserRole: Setting editor mode to user and navigating...');
      
      // 直接使用字符串ID
      const personaEditorScreenId = 'persona-editor-screen';
      console.log('即将跳转到:', personaEditorScreenId);
      
      showScreen(personaEditorScreenId as any);
      return;
    } catch (error) {
      console.error('跳转失败:', error);
      alert('无法打开用户角色编辑页面，请检查路由配置');
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
          if (this.state.activeMenu === 'ai') this.createNewPersona();
          if (this.state.activeMenu === 'user') this.createNewUserRole();
          break;
      }
    }
  };

  // 状态访问方法
  getState(): PersonaCenterState {
    return { ...this.state };
  }

  // 世界书数据更新（角色列表页无需处理）
  async updateWorldBooks(): Promise<void> {
    // 角色中心列表页无需更新世界书数据
    console.log('角色中心列表页无需更新世界书数据');
  }

  // ====== 功能菜单与面板渲染 ======
  switchMenu(menu: 'overview' | 'ai' | 'user' | 'worldbook' | 'import' | 'settings'): void {
    this.state.activeMenu = menu;
    this.updateNavActive();

    if (!this.leftPanel) return;

    // 左侧列表仅在 AI/用户 里显示
    if (menu === 'ai' || menu === 'user') {
      this.leftPanel.style.display = '';
      // 过滤列表
      const type = menu === 'ai' ? 'ai' : 'user';
      this.personaList?.filter({ ...this.state.filterOptions, type });
      return;
    }

    // 其它菜单暂时隐藏列表
    this.leftPanel.style.display = 'none';
  }

  // 返回上一级
  goBack(): void {
    try { 
      import('../../router/index').then(({ goBack }) => {
        goBack();
      });
    } catch { /* ignore */ }
  }

  private updateNavActive(): void {
    const active = this.state.activeMenu || 'overview';
    const navItems = this.container.querySelectorAll('.pc-nav .nav-item');
    navItems.forEach(btn => {
      const menu = (btn as HTMLElement).dataset.menu as string;
      if (menu === active) {
        btn.classList.add('active');
        (btn as HTMLElement).setAttribute('aria-selected', 'true');
      } else {
        btn.classList.remove('active');
        (btn as HTMLElement).setAttribute('aria-selected', 'false');
      }
    });
  }

  // 移除右侧面板相关的渲染方法，角色中心只保留列表功能
}