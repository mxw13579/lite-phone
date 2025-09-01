// 屏幕模块统一入口 - TypeScript版本
// 整合世界书、预设、API设置、壁纸、聊天五个屏幕的管理功能
// Phase 4: 统一错误处理，消除alert调用

// 导入类型定义
import type { WorldBook, Preset, ApiConfig, GlobalSettings } from '../state';
import { showError, showSuccess, showValidationError, showOperationError, showNetworkError } from '../services/errorHandling';

// 聊天模块导入 - 使用拆分后的模块
import { chatScreenModule, ChatScreenModule } from './chat/';
import { aiResponseModule } from './aiResponse';

// === 类型定义 ===
export interface ScreenModule {
  render(): void;
  initListeners(): void;
  cleanup?(): void;
}

export interface WallpaperInfo {
  wallpaper: string;
  isImage: boolean;
  isGradient: boolean;
  hasNewWallpaper: boolean;
}

// === 全局状态变量 ===
let editingWorldBookId: string | null = null;
let editingPresetId: string | null = null;
let newWallpaperBase64: string | null = null;

// === 世界书屏幕模块 ===
export class WorldBookScreen implements ScreenModule {
  render(): void {
    this.renderWorldBookScreen();
  }

  initListeners(): void {
    this.initWorldBookListeners();
  }

  // 渲染世界书列表屏幕
  renderWorldBookScreen(): void {
    const listEl = document.getElementById('world-book-list');
    const state = (window as any).state;
    
    if (!state || !listEl) {
      console.error('世界书渲染：缺少必要的状态或DOM元素');
      return;
    }
    
    // 安全：清空列表内容
    while (listEl.firstChild) {
      listEl.removeChild(listEl.firstChild);
    }
    
    if (state.worldBooks.length === 0) {
      // 安全：使用DOM构建替代innerHTML
      const emptyMsg = document.createElement('p');
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = '#8a8a8a';
      emptyMsg.style.marginTop = '50px';
      emptyMsg.textContent = '点击右上角 "+" 创建你的第一本世界书';
      listEl.appendChild(emptyMsg);
      return;
    }
    
    state.worldBooks.forEach((book: WorldBook) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.dataset.bookId = book.id;
      
      const span = document.createElement('span');
      span.textContent = book.name; // 安全：使用textContent避免XSS
      item.appendChild(span);
      
      // 点击事件：打开编辑器
      item.addEventListener('click', () => this.openWorldBookEditor(book.id));
      
      // 长按删除事件
      let longPressTimer: number;
      item.addEventListener('mousedown', () => {
        longPressTimer = window.setTimeout(async () => {
          const confirmed = await this.showCustomConfirm('删除世界书', `确定要删除世界书 "${book.name}" 吗？`, { confirmButtonClass: 'btn-danger' });
          if (confirmed) {
            await this.deleteWorldBook(book.id);
          }
        }, 800);
      });
      
      item.addEventListener('mouseup', () => clearTimeout(longPressTimer));
      item.addEventListener('mouseleave', () => clearTimeout(longPressTimer));
      
      listEl.appendChild(item);
    });
    
    console.log('世界书屏幕已渲染，共', state.worldBooks.length, '本');
  }

  // 打开世界书编辑器
  openWorldBookEditor(bookId: string): void {
    const state = (window as any).state;
    if (!state) return;
    
    editingWorldBookId = bookId;
    const book = state.worldBooks.find((wb: WorldBook) => wb.id === bookId);
    if (!book) return;
    
    // 设置编辑器内容
    const titleEl = document.getElementById('world-book-editor-title');
    const nameInput = document.getElementById('world-book-name-input') as HTMLInputElement;
    const contentInput = document.getElementById('world-book-content-input') as HTMLTextAreaElement;
    
    if (titleEl) titleEl.textContent = book.name;
    if (nameInput) nameInput.value = book.name;
    if (contentInput) contentInput.value = book.content;
    
    // 切换到编辑器屏幕
    const showScreen = (window as any).showScreen;
    if (showScreen) {
      showScreen('world-book-editor-screen');
    }
    
    console.log('打开世界书编辑器：', book.name);
  }

  // 创建新的世界书
  async createWorldBook(): Promise<void> {
    const name = await this.showCustomPrompt('创建世界书', '请输入书名');
    if (!name || !name.trim()) return;
    
    const newBook: WorldBook = {
      id: 'wb_' + Date.now(),
      name: name.trim(),
      content: ''
    };
    
    try {
      // 保存到数据库
      const saveWorldBook = (window as any).saveWorldBook;
      if (saveWorldBook) {
        await saveWorldBook(newBook);
      }
      
      // 更新状态
      const addWorldBook = (window as any).addWorldBook;
      if (addWorldBook) {
        addWorldBook(newBook);
      }
      
      // 重新渲染列表
      this.renderWorldBookScreen();
      
      // 打开编辑器
      this.openWorldBookEditor(newBook.id);
      
      console.log('创建新世界书：', newBook.name);
    } catch (error) {
      console.error('创建世界书失败：', error);
      showOperationError('创建世界书', error as Error);
    }
  }

  // 保存世界书
  async saveWorldBook(): Promise<void> {
    if (!editingWorldBookId) return;
    
    const state = (window as any).state;
    if (!state) return;
    
    const book = state.worldBooks.find((wb: WorldBook) => wb.id === editingWorldBookId);
    if (!book) return;
    
    // 获取输入内容
    const nameInput = document.getElementById('world-book-name-input') as HTMLInputElement;
    const contentInput = document.getElementById('world-book-content-input') as HTMLTextAreaElement;
    
    if (!nameInput || !contentInput) return;
    
    const newName = nameInput.value.trim();
    if (!newName) {
      showValidationError('世界书名称');
      return;
    }
    
    // 更新书籍数据
    book.name = newName;
    book.content = contentInput.value;
    
    try {
      // 保存到数据库
      const saveWorldBook = (window as any).saveWorldBook;
      if (saveWorldBook) {
        await saveWorldBook(book);
      }
      
      // 更新标题显示
      const titleEl = document.getElementById('world-book-editor-title');
      if (titleEl) titleEl.textContent = newName;
      
      // 清除编辑状态
      editingWorldBookId = null;
      
      // 重新渲染列表并返回
      this.renderWorldBookScreen();
      const showScreen = (window as any).showScreen;
      if (showScreen) {
        showScreen('world-book-screen');
      }
      
      console.log('保存世界书：', newName);
    } catch (error) {
      console.error('保存世界书失败：', error);
      showOperationError('保存世界书', error as Error);
    }
  }

  // 删除世界书
  async deleteWorldBook(bookId: string): Promise<void> {
    const state = (window as any).state;
    if (!state) return;
    
    try {
      // 从数据库删除
      const deleteWorldBook = (window as any).deleteWorldBook;
      if (deleteWorldBook) {
        await deleteWorldBook(bookId);
      }
      
      // 从状态中移除
      const removeWorldBook = (window as any).removeWorldBook;
      if (removeWorldBook) {
        removeWorldBook(bookId);
      }
      
      // 重新渲染
      this.renderWorldBookScreen();
      
      console.log('删除世界书：', bookId);
    } catch (error) {
      console.error('删除世界书失败：', error);
      showOperationError('删除世界书', error as Error);
    }
  }

  // 初始化世界书模块事件监听器
  initWorldBookListeners(): void {
    // 添加世界书按钮
    const addBtn = document.getElementById('add-world-book-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.createWorldBook());
    }
    
    // 保存世界书按钮
    const saveBtn = document.getElementById('save-world-book-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveWorldBook());
    }
    
    console.log('世界书模块事件监听器已初始化');
  }

  // 辅助函数
  private showCustomPrompt(title: string, placeholder: string): Promise<string | null> {
    const fn = (window as any).showCustomPrompt;
    return fn ? fn(title, placeholder) : Promise.resolve(prompt(title + ': ' + placeholder));
  }

  private showCustomConfirm(title: string, message: string, options: any = {}): Promise<boolean> {
    const fn = (window as any).showCustomConfirm;
    return fn ? fn(title, message, options) : Promise.resolve(confirm(title + ': ' + message));
  }
}

// === 预设屏幕模块 ===
export class PresetScreen implements ScreenModule {
  render(): void {
    this.renderPresetListScreen();
  }

  initListeners(): void {
    this.initPresetsListeners();
  }

  // 渲染预设列表屏幕
  async renderPresetListScreen(): Promise<void> {
    const listEl = document.getElementById('preset-list');
    const state = (window as any).state;
    
    if (!listEl || !state) {
      console.error('预设列表渲染：缺少必要的元素或状态');
      return;
    }
    
    // 安全：清空预设列表内容
    while (listEl.firstChild) {
      listEl.removeChild(listEl.firstChild);
    }
    
    if (state.presets.length === 0) {
      // 如果没有预设，先尝试初始化默认预设
      await this.initPresetsData();
      // 初始化后重新检查
      if (state.presets.length === 0) {
        // 安全：使用DOM构建替代innerHTML
        const emptyMsg = document.createElement('p');
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = '#8a8a8a';
        emptyMsg.style.marginTop = '50px';
        emptyMsg.textContent = '点击右上角 "+" 创建你的第一个预设';
        listEl.appendChild(emptyMsg);
        return;
      }
    }
    
    state.presets.forEach((preset: Preset) => {
      const isActive = preset.id === state.globalSettings.activePresetId;
      const item = document.createElement('div');
      item.className = 'preset-list-item';
      if (isActive) {
        item.classList.add('active');
      }
      
      // 安全：使用DOM构建替代innerHTML模板
      const presetInfo = document.createElement('div');
      presetInfo.className = 'preset-info';
      presetInfo.dataset.presetId = preset.id;
      
      const presetNameDiv = document.createElement('div');
      presetNameDiv.className = 'preset-name';
      
      if (isActive) {
        const activeIndicator = document.createElement('span');
        activeIndicator.className = 'active-indicator';
        activeIndicator.textContent = '★';
        presetNameDiv.appendChild(activeIndicator);
      }
      
      const nameText = document.createTextNode(preset.name);
      presetNameDiv.appendChild(nameText);
      
      const presetRemarkDiv = document.createElement('div');
      presetRemarkDiv.className = 'preset-remark';
      presetRemarkDiv.textContent = preset.remark || '无备注';
      
      presetInfo.appendChild(presetNameDiv);
      presetInfo.appendChild(presetRemarkDiv);
      
      const presetActions = document.createElement('div');
      presetActions.className = 'preset-actions';
      
      // 编辑按钮
      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn-small edit-preset-btn';
      editBtn.dataset.presetId = preset.id;
      editBtn.textContent = '编辑';
      presetActions.appendChild(editBtn);
      
      // 设为当前按钮
      const setActiveBtn = document.createElement('button');
      setActiveBtn.className = 'action-btn-small set-active-preset-btn';
      setActiveBtn.dataset.presetId = preset.id;
      setActiveBtn.textContent = '设为当前';
      if (isActive) {
        setActiveBtn.disabled = true;
      }
      presetActions.appendChild(setActiveBtn);
      
      // 删除按钮（当预设数量大于1时才显示）
      if (state.presets.length > 1) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn-small delete-preset-list-btn';
        deleteBtn.dataset.presetId = preset.id;
        deleteBtn.style.color = '#d9534f';
        deleteBtn.textContent = '删除';
        presetActions.appendChild(deleteBtn);
      }
      
      item.appendChild(presetInfo);
      item.appendChild(presetActions);
      listEl.appendChild(item);
    });
    
    console.log('预设列表屏幕已渲染，共', state.presets.length, '个预设');
  }

  // 打开预设编辑器
  openPresetEditor(presetId: string | null): void {
    editingPresetId = presetId;
    const editorTitle = document.getElementById('preset-editor-title');
    const deleteBtn = document.getElementById('delete-preset-btn') as HTMLButtonElement;
    const state = (window as any).state;
    const constants = (window as any).CONSTANTS;
    
    if (!state || !constants) {
      console.error('打开预设编辑器失败：缺少必要的状态或常量');
      return;
    }

    if (presetId) { 
      // 编辑现有预设
      const preset = state.presets.find((p: Preset) => p.id === presetId);
      if (!preset) return;
      
      if (editorTitle) editorTitle.textContent = `编辑预设: ${preset.name}`;
      (document.getElementById('preset-name-input') as HTMLInputElement).value = preset.name;
      (document.getElementById('preset-remark-input') as HTMLTextAreaElement).value = preset.remark;
      (document.getElementById('prompt-image-input') as HTMLTextAreaElement).value = preset.promptImage;
      (document.getElementById('prompt-voice-input') as HTMLTextAreaElement).value = preset.promptVoice;
      (document.getElementById('prompt-transfer-input') as HTMLTextAreaElement).value = preset.promptTransfer;
      (document.getElementById('prompt-single-input') as HTMLTextAreaElement).value = preset.promptSingle;
      (document.getElementById('prompt-group-input') as HTMLTextAreaElement).value = preset.promptGroup;
      if (deleteBtn) deleteBtn.style.display = 'block';
    } else { 
      // 新增预设
      if (editorTitle) editorTitle.textContent = '新增预设';
      (document.getElementById('preset-name-input') as HTMLInputElement).value = '';
      (document.getElementById('preset-remark-input') as HTMLTextAreaElement).value = '';
      // 使用默认值填充
      (document.getElementById('prompt-image-input') as HTMLTextAreaElement).value = constants.DEFAULT_PROMPT_IMAGE;
      (document.getElementById('prompt-voice-input') as HTMLTextAreaElement).value = constants.DEFAULT_PROMPT_VOICE;
      (document.getElementById('prompt-transfer-input') as HTMLTextAreaElement).value = constants.DEFAULT_PROMPT_TRANSFER;
      (document.getElementById('prompt-single-input') as HTMLTextAreaElement).value = constants.DEFAULT_PROMPT_SINGLE;
      (document.getElementById('prompt-group-input') as HTMLTextAreaElement).value = constants.DEFAULT_PROMPT_GROUP;
      if (deleteBtn) deleteBtn.style.display = 'none';
    }
    
    const showScreen = (window as any).showScreen;
    if (showScreen) {
      showScreen('preset-editor-screen');
    }
    
    console.log('打开预设编辑器：', presetId ? '编辑' : '新增');
  }

  // 保存预设
  async savePreset(): Promise<void> {
    const name = (document.getElementById('preset-name-input') as HTMLInputElement).value.trim();
    if (!name) {
      showValidationError('预设名称');
      return;
    }
    
    const state = (window as any).state;
    const savePreset = (window as any).savePreset;
    
    if (!state || !savePreset) {
      console.error('保存预设失败：状态或数据库不可用');
      return;
    }
    
    const presetData: Omit<Preset, 'id'> = {
      name: name,
      remark: (document.getElementById('preset-remark-input') as HTMLTextAreaElement).value.trim(),
      promptImage: (document.getElementById('prompt-image-input') as HTMLTextAreaElement).value,
      promptVoice: (document.getElementById('prompt-voice-input') as HTMLTextAreaElement).value,
      promptTransfer: (document.getElementById('prompt-transfer-input') as HTMLTextAreaElement).value,
      promptSingle: (document.getElementById('prompt-single-input') as HTMLTextAreaElement).value,
      promptGroup: (document.getElementById('prompt-group-input') as HTMLTextAreaElement).value
    };
    
    try {
      let preset: Preset;
      if (editingPresetId) { 
        // 更新现有预设
        const index = state.presets.findIndex((p: Preset) => p.id === editingPresetId);
        preset = { ...state.presets[index], ...presetData };
        state.presets[index] = preset;
      } else { 
        // 新增预设
        preset = { id: 'preset_' + Date.now(), ...presetData };
        state.presets.push(preset);
      }
      
      await savePreset(preset);
      editingPresetId = null;
      await this.renderPresetListScreen();
      
      const showScreen = (window as any).showScreen;
      if (showScreen) {
        showScreen('preset-list-screen');
      }
      
      console.log('预设保存成功：', name);
    } catch (error) {
      console.error('保存预设失败：', error);
      showOperationError('保存预设', error as Error);
    }
  }

  // 初始化预设数据
  async initPresetsData(): Promise<void> {
    const state = (window as any).state;
    const savePreset = (window as any).savePreset;
    const constants = (window as any).CONSTANTS;
    
    if (!state || !savePreset || !constants) {
      console.error('初始化预设数据失败：缺少必要依赖');
      return;
    }
    
    try {
      if (state.presets.length === 0) {
        // 创建默认预设
        const defaultPreset: Preset = {
          id: 'preset_' + Date.now(),
          name: '默认预设',
          remark: '系统内置的默认AI行为预设。',
          promptImage: constants.DEFAULT_PROMPT_IMAGE,
          promptVoice: constants.DEFAULT_PROMPT_VOICE,
          promptTransfer: constants.DEFAULT_PROMPT_TRANSFER,
          promptSingle: constants.DEFAULT_PROMPT_SINGLE,
          promptGroup: constants.DEFAULT_PROMPT_GROUP
        };
        
        state.presets.push(defaultPreset);
        await savePreset(defaultPreset);
        
        // 设置为活跃预设
        const updateGlobalSettings = (window as any).updateGlobalSettings;
        if (updateGlobalSettings) {
          await updateGlobalSettings({ activePresetId: defaultPreset.id });
        }
        
        console.log('创建默认预设：', defaultPreset.name);
      }
      
      console.log('预设数据初始化完成，共', state.presets.length, '个预设');
    } catch (error) {
      console.error('初始化预设数据失败：', error);
    }
  }

  // 初始化预设模块事件监听器
  initPresetsListeners(): void {
    // 添加预设按钮
    const addBtn = document.getElementById('add-preset-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openPresetEditor(null));
    }
    
    // 保存预设按钮
    const saveBtn = document.getElementById('save-preset-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.savePreset());
    }

    // 使用事件委托处理预设列表中的动态按钮
    const presetList = document.getElementById('preset-list');
    if (presetList) {
      presetList.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        const presetId = target.dataset.presetId;
        
        if (!presetId) return;
        
        if (target.classList.contains('edit-preset-btn')) {
          // 编辑预设
          this.openPresetEditor(presetId);
          const showScreen = (window as any).showScreen;
          if (showScreen) {
            showScreen('preset-editor-screen');
          }
        } else if (target.classList.contains('set-active-preset-btn')) {
          // 设为当前预设
          await this.setActivePreset(presetId);
        } else if (target.classList.contains('delete-preset-list-btn')) {
          // 删除预设
          await this.deletePreset(presetId);
        }
      });
    }
    
    console.log('预设模块事件监听器已初始化');
  }

  // 设置活跃预设
  private async setActivePreset(presetId: string): Promise<void> {
    try {
      const state = (window as any).state;
      const updateGlobalSettings = (window as any).updateGlobalSettings;
      
      if (!state || !updateGlobalSettings) {
        console.error('设置活跃预设失败：缺少必要依赖');
        return;
      }
      
      await updateGlobalSettings({ activePresetId: presetId });
      await this.renderPresetListScreen(); // 重新渲染列表以更新UI状态
      
      console.log('已设置活跃预设：', presetId);
    } catch (error) {
      console.error('设置活跃预设失败：', error);
      showOperationError('设置活跃预设', error as Error);
    }
  }

  // 删除预设
  private async deletePreset(presetId: string): Promise<void> {
    try {
      const state = (window as any).state;
      const deletePreset = (window as any).deletePreset;
      const showCustomConfirm = (window as any).showCustomConfirm;
      
      if (!state || !deletePreset || !showCustomConfirm) {
        console.error('删除预设失败：缺少必要依赖');
        return;
      }
      
      // 防止删除最后一个预设
      if (state.presets.length <= 1) {
        showError('无法删除：至少需要保留一个预设');
        return;
      }
      
      const preset = state.presets.find((p: Preset) => p.id === presetId);
      if (!preset) {
        console.error('删除预设失败：找不到指定预设');
        return;
      }
      
      const confirmed = await showCustomConfirm(
        '删除预设',
        `确定要删除预设 "${preset.name}" 吗？此操作无法撤销。`,
        { confirmButtonClass: 'btn-danger' }
      );
      
      if (confirmed) {
        await deletePreset(presetId);
        
        // 如果删除的是当前活跃预设，需要设置新的活跃预设
        if (state.globalSettings.activePresetId === presetId) {
          const remainingPresets = state.presets.filter((p: Preset) => p.id !== presetId);
          if (remainingPresets.length > 0) {
            const updateGlobalSettings = (window as any).updateGlobalSettings;
            if (updateGlobalSettings) {
              await updateGlobalSettings({ activePresetId: remainingPresets[0].id });
            }
          }
        }
        
        await this.renderPresetListScreen(); // 重新渲染列表
        console.log('预设删除成功：', preset.name);
      }
    } catch (error) {
      console.error('删除预设失败：', error);
      showOperationError('删除预设', error as Error);
    }
  }

  // 导出预设数据
  exportPresets(): void {
    const state = (window as any).state;
    if (!state) {
      console.error('导出预设失败：状态管理模块未初始化');
      return;
    }

    const presets = state.presets;
    const activePresetId = state.globalSettings?.activePresetId;
    
    const exportData = {
      presets,
      activePresetId,
      exportTime: new Date().toISOString()
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `presets_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('预设数据已导出');
  }

  // 导入预设数据
  async importPresets(file: File): Promise<void> {
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      if (!importData.presets || !Array.isArray(importData.presets)) {
        throw new Error('导入文件格式错误');
      }
      
      const state = (window as any).state;
      const db = (window as any).DB?.db;
      
      if (!state || !db) {
        throw new Error('系统状态不可用');
      }
      
      // 合并预设数据
      const existingIds = new Set(state.presets.map((p: Preset) => p.id));
      const newPresets = importData.presets.filter((preset: Preset) => !existingIds.has(preset.id));
      
      // 添加新预设到状态和数据库
      for (const preset of newPresets) {
        state.presets.push(preset);
        await db.presets.put(preset);
      }
      
      // 如果导入的数据有活跃预设ID，并且该预设存在，则设为当前
      if (importData.activePresetId && state.presets.find((p: Preset) => p.id === importData.activePresetId)) {
        const updateGlobalSettings = (window as any).updateGlobalSettings;
        if (updateGlobalSettings) {
          await updateGlobalSettings({ activePresetId: importData.activePresetId });
        }
      }
      
      // 重新渲染列表
      await this.renderPresetListScreen();
      
      showSuccess(`成功导入 ${newPresets.length} 个新预设`);
      console.log('预设数据导入成功，新增预设：', newPresets.length);
    } catch (error) {
      console.error('导入预设失败：', error);
      showOperationError('导入预设', error as Error);
    }
  }
}

// === API设置屏幕模块 ===
export class ApiSettingsScreen implements ScreenModule {
  render(): void {
    this.renderApiSettingsScreen();
  }

  initListeners(): void {
    this.initApiSettingsListeners();
  }

  // 渲染API设置屏幕
  renderApiSettingsScreen(): void {
    const state = (window as any).state;
    if (!state) {
      console.error('API设置渲染：状态管理模块未初始化');
      return;
    }
    
    // 填充API配置信息
    (document.getElementById('proxy-url') as HTMLInputElement).value = state.apiConfig.proxyUrl || '';
    (document.getElementById('api-key') as HTMLInputElement).value = state.apiConfig.apiKey || '';
    
    // 设置地理位置开关状态
    const geoToggle = document.getElementById('geolocation-toggle') as HTMLInputElement;
    if (geoToggle) {
      geoToggle.checked = state.globalSettings.enableGeolocation || false;
    }
    
    // 设置远程主题URL
    const themeUrlInput = document.getElementById('remote-theme-url') as HTMLInputElement;
    if (themeUrlInput) {
      themeUrlInput.value = state.globalSettings.remoteThemeUrl || '';
    }
    
    console.log('API设置屏幕已渲染');
  }

  // 保存API设置
  async saveApiSettings(): Promise<void> {
    const updateApiConfig = (window as any).updateApiConfig;
    
    if (!updateApiConfig) {
      console.error('保存API设置失败：updateApiConfig函数不可用');
      return;
    }
    
    try {
      // 获取表单数据
      const apiConfig: Partial<ApiConfig> = {
        proxyUrl: (document.getElementById('proxy-url') as HTMLInputElement).value.trim(),
        apiKey: (document.getElementById('api-key') as HTMLInputElement).value.trim(),
        model: (document.getElementById('model-select') as HTMLSelectElement).value
      };
      
      // 使用统一的更新方法（同时更新内存状态和数据库）
      await updateApiConfig(apiConfig);
      
      showSuccess('API设置已保存！');
      console.log('API设置已保存并更新到状态');
    } catch (error) {
      console.error('保存API设置失败:', error);
      showOperationError('保存API设置', error as Error);
    }
  }

  // 获取模型列表
  async fetchModels(): Promise<void> {
    let url = (document.getElementById('proxy-url') as HTMLInputElement).value.trim();
    const key = (document.getElementById('api-key') as HTMLInputElement).value.trim();
    
    if (!url || !key) {
      showError('请先填写反代地址和密钥');
      return;
    }

    // 处理URL格式
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    if (url.endsWith('/v1')) {
      url = url.slice(0, -3);
    }

    try {
      const response = await fetch(`${url}/v1/models`, {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      
      if (!response.ok) {
        throw new Error('无法获取模型列表');
      }
      
      const data = await response.json();
      const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
      const state = (window as any).state;
      
      // 安全：清空现有选项
      while (modelSelect.firstChild) {
        modelSelect.removeChild(modelSelect.firstChild);
      }
      
      // 添加模型选项
      data.data.forEach((model: any) => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = model.id;
        
        // 保持当前选中状态
        if (model.id === state?.apiConfig?.model) {
          option.selected = true;
        }
        
        modelSelect.appendChild(option);
      });
      
      showSuccess('模型列表已更新');
      console.log('模型列表更新完成，共', data.data.length, '个模型');
    } catch (error) {
      console.error('拉取模型失败:', error);
      showNetworkError('拉取模型', error as Error);
    }
  }

  // 初始化API设置事件监听器
  initApiSettingsListeners(): void {
    // 保存API设置按钮
    const saveBtn = document.getElementById('save-api-settings-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveApiSettings());
    }
    
    // 拉取模型按钮
    const fetchBtn = document.getElementById('fetch-models-btn');
    if (fetchBtn) {
      fetchBtn.addEventListener('click', () => this.fetchModels());
    }
    
    // 地理位置开关
    const geoToggle = document.getElementById('geolocation-toggle');
    if (geoToggle) {
      geoToggle.addEventListener('change', async (e: Event) => {
        const target = e.target as HTMLInputElement;
        await this.updateGeolocationSetting(target.checked);
      });
    }
    
    // 远程主题相关按钮
    const applyThemeBtn = document.getElementById('apply-remote-theme-btn');
    if (applyThemeBtn) {
      applyThemeBtn.addEventListener('click', () => this.applyRemoteTheme());
    }
    
    const resetThemeBtn = document.getElementById('reset-remote-theme-btn');
    if (resetThemeBtn) {
      resetThemeBtn.addEventListener('click', () => this.resetThemeToDefault());
    }
    
    const loadRemoteBtn = document.getElementById('load-remote-library-btn');
    if (loadRemoteBtn) {
      loadRemoteBtn.addEventListener('click', () => this.loadRemoteThemeLibrary());
    }
    
    const loadBuiltinBtn = document.getElementById('open-builtin-themes-btn');
    if (loadBuiltinBtn) {
      loadBuiltinBtn.addEventListener('click', () => this.loadBuiltinThemes());
    }
    
    // 设置备份与导出相关按钮
    const exportSettingsBtn = document.getElementById('export-settings-btn');
    if (exportSettingsBtn) {
      exportSettingsBtn.addEventListener('click', () => this.exportSettings());
    }
    
    const importSettingsBtn = document.getElementById('import-settings-btn');
    if (importSettingsBtn) {
      importSettingsBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            this.importSettings(file);
          }
        };
        input.click();
      });
    }
    
    console.log('API设置模块事件监听器已初始化');
  }

  // 更新地理位置设置
  async updateGeolocationSetting(enabled: boolean): Promise<void> {
    const win = window as any;
    const state = win.STATE?.state;
    const updateGlobalSettings = win.updateGlobalSettings;
    
    if (!state || !updateGlobalSettings) return;
    
    try {
      state.globalSettings.enableGeolocation = enabled;
      await updateGlobalSettings({ enableGeolocation: enabled });
      
      // 立即更新地理位置
      await this.updateGeolocation();
      
      console.log('地理位置设置已更新:', enabled);
    } catch (error) {
      console.error('更新地理位置设置失败:', error);
    }
  }

  // 地理位置获取函数
  private async updateGeolocation(): Promise<void> {
    const win = window as any;
    const state = win.STATE?.state;
    if (!state) return;
    
    const toggle = document.getElementById('geolocation-toggle') as HTMLInputElement;
    let myAddress = win.STATE?.myAddress || '位置未知';
    
    if (!state.globalSettings.enableGeolocation) {
      myAddress = '位置未知';
      if (toggle) toggle.checked = false;
      
      // 更新全局地址
      if (win.STATE?.setMyAddress) {
        win.STATE.setMyAddress(myAddress);
      }
      return;
    }
    
    if (toggle) toggle.checked = true;

    try {
      // 使用ipinfo.io获取地理位置
      const geoResponse = await fetch('https://ipinfo.io/json');
      if (!geoResponse.ok) throw new Error('ipinfo.io request failed');
      
      const geoData = await geoResponse.json();

      if (geoData.city && geoData.region) {
        myAddress = `${geoData.country}, ${geoData.region}, ${geoData.city}`;
      } else {
        throw new Error('无法从ipinfo.io获取地理位置');
      }
    } catch (error) {
      console.error('Geolocation Error:', error);
      myAddress = '位置获取失败';
    }
    
    // 更新全局地址
    if (win.STATE?.setMyAddress) {
      win.STATE.setMyAddress(myAddress);
    }
  }

  // 主题相关函数
  async applyRemoteTheme(): Promise<void> {
    const url = (document.getElementById('remote-theme-url') as HTMLInputElement)?.value?.trim();
    if (!url) {
      showError('请输入远程主题的CSS URL');
      return;
    }
    
    const win = window as any;
    const state = win.STATE?.state;
    const updateGlobalSettings = win.updateGlobalSettings;
    
    if (!state || !updateGlobalSettings) return;
    
    try {
      // 应用主题
      this.switchStylesheet(url);
      
      // 保存设置
      state.globalSettings.remoteThemeUrl = url;
      await updateGlobalSettings({ remoteThemeUrl: url });
      
      if (win.showCustomAlert) {
        await win.showCustomAlert('主题已更新', '远程主题已应用并保存。');
      } else {
        showSuccess('主题已更新');
      }
      
      console.log('远程主题已应用:', url);
    } catch (error) {
      console.error('应用远程主题失败:', error);
      showError('应用主题失败，请检查URL是否有效');
    }
  }

  async resetThemeToDefault(): Promise<void> {
    const win = window as any;
    const state = win.STATE?.state;
    const updateGlobalSettings = win.updateGlobalSettings;
    
    if (!state || !updateGlobalSettings) return;
    
    try {
      // 清空主题URL输入框
      const remoteThemeUrlInput = document.getElementById('remote-theme-url') as HTMLInputElement;
      const remoteThemeLibraryUrlInput = document.getElementById('remote-theme-library-url') as HTMLInputElement;
      
      if (remoteThemeUrlInput) remoteThemeUrlInput.value = '';
      if (remoteThemeLibraryUrlInput) remoteThemeLibraryUrlInput.value = '';
      
      // 重置为默认样式
      this.switchStylesheet('');
      
      // 保存设置
      state.globalSettings.remoteThemeUrl = '';
      await updateGlobalSettings({ remoteThemeUrl: '' });
      
      if (win.showCustomAlert) {
        await win.showCustomAlert('主题已重置', '已恢复为默认主题。');
      } else {
        alert('主题已重置');
      }
      
      console.log('主题已重置为默认');
    } catch (error) {
      console.error('重置主题失败:', error);
      alert('重置主题失败，请重试');
    }
  }

  async loadRemoteThemeLibrary(): Promise<void> {
    const libraryUrl = (document.getElementById('remote-theme-library-url') as HTMLInputElement)?.value?.trim();
    if (!libraryUrl) {
      alert('请输入远程主题库的URL！');
      return;
    }
    
    // 调用全局的主题列表模态框函数
    const win = window as any;
    if (win.openThemeListModal) {
      win.openThemeListModal(libraryUrl, '选择远程主题');
    } else {
      alert('主题库功能不可用');
    }
  }

  async loadBuiltinThemes(): Promise<void> {
    const builtinThemeListUrl = 'https://fastly.jsdelivr.net/gh/mxw13579/phone@release-v1.0.0.7/myPhone/themeList.json';
    
    // 调用全局的主题列表模态框函数
    const win = window as any;
    if (win.openThemeListModal) {
      win.openThemeListModal(builtinThemeListUrl, '选择内置主题');
    } else {
      alert('内置主题功能不可用');
    }
  }

  // 切换样式表函数
  private switchStylesheet(url: string): void {
    const stylesheet = document.getElementById('main-stylesheet') as HTMLLinkElement;
    if (stylesheet) {
      if (url && url.trim() !== '') {
        stylesheet.href = url + '?v=' + Date.now();
      } else {
        stylesheet.href = './unified-style.css';
      }
    }
  }

  // 初始化API设置模块数据（在应用启动时调用）
  async initApiSettingsModule(): Promise<void> {
    // 在初始化时获取一次地理位置
    await this.updateGeolocation();
    console.log('API设置模块数据初始化完成');
  }

  // 导出设置备份
  exportSettings(): void {
    const win = window as any;
    const state = win.STATE?.state;
    
    if (!state) {
      console.error('导出设置失败：状态管理模块未初始化');
      return;
    }

    const exportData = {
      apiConfig: state.apiConfig,
      globalSettings: state.globalSettings,
      exportTime: new Date().toISOString(),
      version: '1.0.0'
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `settings_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('设置备份已导出');
  }

  // 导入设置备份
  async importSettings(file: File): Promise<void> {
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      if (!importData.apiConfig || !importData.globalSettings) {
        throw new Error('导入文件格式错误：缺少必要的设置数据');
      }
      
      const win = window as any;
      const state = win.STATE?.state;
      const db = win.DB?.db;
      
      if (!state || !db) {
        throw new Error('系统状态不可用');
      }
      
      // 确认导入操作
      const confirmed = await win.showCustomConfirm?.(
        '导入设置确认', 
        '确定要导入设置吗？这将覆盖当前的API配置和全局设置。'
      ) ?? confirm('确定要导入设置吗？这将覆盖当前的API配置和全局设置。');
      
      if (!confirmed) return;
      
      // 更新状态
      Object.assign(state.apiConfig, importData.apiConfig);
      Object.assign(state.globalSettings, importData.globalSettings);
      
      // 保存到数据库 - 使用正确的API
      const saveApiConfig = win.saveApiConfig;
      const updateGlobalSettings = win.updateGlobalSettings;
      
      if (saveApiConfig) {
        await saveApiConfig(state.apiConfig);
      }
      if (updateGlobalSettings) {
        await updateGlobalSettings(state.globalSettings);
      }
      
      // 重新渲染设置界面
      this.renderApiSettingsScreen();
      
      // 应用主题（如果有远程主题URL）
      if (importData.globalSettings.remoteThemeUrl) {
        this.switchStylesheet(importData.globalSettings.remoteThemeUrl);
      }
      
      alert('设置导入成功！');
      console.log('设置备份导入成功');
    } catch (error) {
      console.error('导入设置失败：', error);
      showOperationError('导入预设', error as Error);
    }
  }
}

// === 壁纸屏幕模块 ===
export class WallpaperScreen implements ScreenModule {
  render(): void {
    this.renderWallpaperScreen();
  }

  initListeners(): void {
    this.initWallpaperListeners();
  }

  // 渲染壁纸屏幕
  renderWallpaperScreen(): void {
    const preview = document.getElementById('wallpaper-preview');
    const state = (window as any).state;
    
    if (!preview || !state) {
      console.error('壁纸渲染：缺少必要的元素或状态');
      return;
    }
    
    // 显示当前壁纸或新上传的壁纸
    const bg = newWallpaperBase64 || state.globalSettings.wallpaper;
    
    if (bg && bg.startsWith('data:image')) {
      preview.style.backgroundImage = `url(${bg})`;
      preview.textContent = '';
    } else if (bg) {
      preview.style.backgroundImage = bg;
      preview.textContent = '当前为渐变色';
    } else {
      preview.style.backgroundImage = 'linear-gradient(135deg, #89f7fe, #66a6ff)';
      preview.textContent = '默认渐变背景';
    }
    
    console.log('壁纸屏幕已渲染');
  }

  // 处理壁纸上传
  async handleWallpaperUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      
      // 保存新壁纸数据
      newWallpaperBase64 = dataUrl;
      
      // 重新渲染预览
      this.renderWallpaperScreen();
      
      console.log('壁纸上传成功，已更新预览');
    } catch (error) {
      console.error('壁纸上传失败:', error);
      alert('上传失败，请重试');
    }
  }

  // 保存并应用壁纸
  async saveWallpaper(): Promise<void> {
    if (!newWallpaperBase64) {
      alert('请先上传一张新壁纸。');
      return;
    }
    
    const updateGlobalSettings = (window as any).updateGlobalSettings;
    
    if (!updateGlobalSettings) {
      console.error('保存壁纸失败：更新函数不可用');
      return;
    }
    
    try {
      // 保存壁纸到全局设置
      await updateGlobalSettings({ wallpaper: newWallpaperBase64 });
      
      // 应用壁纸到主屏幕
      this.applyGlobalWallpaper();
      
      // 清除临时数据
      newWallpaperBase64 = null;
      
      alert('壁纸已保存并应用！');
      
      // 返回主屏幕
      const showScreen = (window as any).showScreen;
      if (showScreen) {
        showScreen('home-screen');
      }
      
      console.log('壁纸已保存并应用');
    } catch (error) {
      console.error('保存壁纸失败:', error);
      alert('保存失败，请重试');
    }
  }

  // 应用全局壁纸到主屏幕
  applyGlobalWallpaper(): void {
    const homeScreen = document.getElementById('home-screen');
    const state = (window as any).state;
    
    if (!homeScreen || !state) return;
    
    const wallpaper = state.globalSettings.wallpaper;
    
    if (wallpaper && wallpaper.startsWith('data:image')) {
      // Base64图片壁纸
      homeScreen.style.backgroundImage = `url(${wallpaper})`;
    } else if (wallpaper) {
      // CSS渐变或其他样式
      homeScreen.style.backgroundImage = wallpaper;
    } else {
      // 默认渐变背景
      homeScreen.style.backgroundImage = 'linear-gradient(135deg, #89f7fe, #66a6ff)';
    }
    
    console.log('全局壁纸已应用');
  }

  // 初始化壁纸模块事件监听器
  initWallpaperListeners(): void {
    // 壁纸上传输入框
    const uploadInput = document.getElementById('wallpaper-upload-input');
    if (uploadInput) {
      uploadInput.addEventListener('change', (e) => this.handleWallpaperUpload(e));
    }
    
    // 保存壁纸按钮
    const saveBtn = document.getElementById('save-wallpaper-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveWallpaper());
    }
    
    console.log('壁纸模块事件监听器已初始化');
  }
}

// === 屏幕模块管理器 ===
export class ScreenModuleManager {
  private modules: Map<string, ScreenModule> = new Map();

  constructor() {
    this.modules.set('world-book', new WorldBookScreen());
    this.modules.set('presets', new PresetScreen());
    this.modules.set('api-settings', new ApiSettingsScreen());
    this.modules.set('wallpaper', new WallpaperScreen());
  }

  // 渲染指定屏幕
  renderScreen(screenName: string): void {
    const module = this.modules.get(screenName);
    if (module) {
      module.render();
    } else {
      console.warn('未找到屏幕模块:', screenName);
    }
  }

  // 初始化所有屏幕的事件监听器
  initAllListeners(): void {
    this.modules.forEach((module, name) => {
      console.log('初始化屏幕模块监听器:', name);
      module.initListeners();
    });
  }

  // 获取模块实例
  getModule(screenName: string): ScreenModule | undefined {
    return this.modules.get(screenName);
  }
}

// === 导出所有屏幕模块 ===
export { chatScreenModule, ChatScreenModule, aiResponseModule };

// === 创建屏幕模块实例 ===
export const worldBookScreenModule = new WorldBookScreen();
export const presetScreenModule = new PresetScreen();
export const apiSettingsScreenModule = new ApiSettingsScreen();
export const wallpaperScreenModule = new WallpaperScreen();

// === 全局单例实例 ===
export const screenManager = new ScreenModuleManager();

// 注意：全局window注入已迁移到 init/compat.ts，避免重复定义

// 默认导出
export default {
  screenManager,
  WorldBookScreen,
  PresetScreen, 
  ApiSettingsScreen,
  WallpaperScreen,
  ScreenModuleManager,
  chatScreenModule,
  ChatScreenModule,
  aiResponseModule
};