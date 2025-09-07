// 优化且修复后的屏幕模块统一入口 - TypeScript
// 修复点：dataset 正确赋值；长按删除与点击打开的并发冲突；其余维持上版性能与可维护性优化

import type { WorldBook, Preset, ApiConfig } from '../state';
import { showError, showSuccess, showValidationError, showOperationError, showNetworkError } from '../services/errorHandling';
import { chatScreenModule, ChatScreenModule } from './chat/';
import { aiResponseModule } from './aiResponse';

// ============ 通用工具 ============

type Win = typeof window & {
  STATE?: any;
  state?: any;
  DB?: any;
  CONSTANTS?: any;
  saveWorldBook?: (wb: WorldBook) => Promise<void>;
  deleteWorldBook?: (id: string) => Promise<void>;
  addWorldBook?: (wb: WorldBook) => void;
  removeWorldBook?: (id: string) => void;

  savePreset?: (p: Preset) => Promise<void>;
  deletePreset?: (id: string) => Promise<void>;

  saveApiConfig?: (cfg: Partial<ApiConfig>) => Promise<void>;
  updateApiConfig?: (cfg: Partial<ApiConfig>) => Promise<void>;
  updateGlobalSettings?: (s: any) => Promise<void>;

  showScreen?: (id: string) => void;
  showCustomPrompt?: (title: string, placeholder: string) => Promise<string | null>;
  showCustomConfirm?: (title: string, message: string, options?: any) => Promise<boolean>;
  showCustomAlert?: (title: string, message: string) => Promise<void>;
  openThemeListModal?: (url: string, title: string) => void;
};

const win = () => (window as Win);

// DOM helpers
const qs = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T | null;
const clear = (el: HTMLElement) => { while (el.firstChild) el.removeChild(el.firstChild); };
const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Partial<HTMLElementTagNameMap[K]> = {},
    children: (Node | string)[] = []
) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const ch of children) node.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
  return node;
};
const mountFragment = (parent: HTMLElement, nodes: HTMLElement[]) => {
  const frag = document.createDocumentFragment();
  nodes.forEach(n => frag.appendChild(n));
  parent.appendChild(frag);
};

const tryWrap = async <T>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
  try { return await fn(); } catch (e) {
    console.error(`${label} 失败:`, e);
    showOperationError(label, e as Error);
    return undefined;
  }
};

const normalizeApiBase = (url: string) => {
  let u = url.trim();
  if (!u) return '';
  if (u.endsWith('/')) u = u.slice(0, -1);
  if (u.endsWith('/v1')) u = u.slice(0, -3);
  return u;
};

// ============ 类型定义 ============

export interface ScreenModule {
  render(): void | Promise<void>;
  initListeners(): void;
  cleanup?(): void;
}

export interface WallpaperInfo {
  wallpaper: string;
  isImage: boolean;
  isGradient: boolean;
  hasNewWallpaper: boolean;
}

// ============ 世界书模块 ============

export class WorldBookScreen implements ScreenModule {
  render(): void {
    this.renderWorldBookScreen();
  }

  initListeners(): void {
    qs('add-world-book-btn')?.addEventListener('click', () => this.createWorldBook());
    qs('save-world-book-btn')?.addEventListener('click', () => this.saveWorldBook());

    const list = qs('world-book-list');
    if (list) {
      list.addEventListener('mousedown', (e) => this.onListMouseDown(e as MouseEvent));
      list.addEventListener('mouseup', (e) => this.onListMouseUp(e as MouseEvent));
      list.addEventListener('mouseleave', (e) => this.onListMouseLeave(e as MouseEvent));
      list.addEventListener('click', (e) => this.onListClick(e as MouseEvent));
    }
  }

  // 长按/点击互斥状态
  private longPressTimer: number | null = null;
  private longPressFired = false;

  private getItemIdFromEvent(e: Event): string | null {
    const item = (e.target as HTMLElement).closest('.list-item') as HTMLElement | null;
    return item?.dataset.bookId ?? null;
  }

  private onListMouseDown(e: MouseEvent) {
    const id = this.getItemIdFromEvent(e);
    if (!id) return;
    // 启动长按
    this.longPressFired = false;
    this.longPressTimer = window.setTimeout(async () => {
      this.longPressFired = true;
      // 长按触发删除
      const state = win().state;
      const name = state?.worldBooks.find((wb: WorldBook) => wb.id === id)?.name ?? '';
      const confirmed = await this.showCustomConfirm('删除世界书', `确定要删除世界书 "${name}" 吗？`, { confirmButtonClass: 'btn-danger' });
      if (confirmed) await this.deleteWorldBook(id);
    }, 800);
  }

  private clearLongPressTimer() {
    if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
  }

  private onListMouseUp(_: MouseEvent) { this.clearLongPressTimer(); }
  private onListMouseLeave(_: MouseEvent) { this.clearLongPressTimer(); }

  private onListClick(e: MouseEvent) {
    // 若刚刚触发过长按，则吞掉这次点击，避免“删除后又进入编辑”
    if (this.longPressFired) {
      this.longPressFired = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const id = this.getItemIdFromEvent(e);
    if (!id) return;
    this.openWorldBookEditor(id);
  }

  renderWorldBookScreen(): void {
    const listEl = qs('world-book-list');
    const state = win().state;
    if (!state || !listEl) return console.error('世界书渲染：缺少必要的状态或DOM元素');

    clear(listEl);

    if (!state.worldBooks.length) {
      listEl.appendChild(el('p', { style: 'text-align:center;color:#8a8a8a;margin-top:50px' as any }, ['点击右上角 "+" 创建你的第一本世界书']));
      return;
    }

    const nodes: HTMLElement[] = state.worldBooks.map((book: WorldBook) => {
      const item = el('div', { className: 'list-item' });
      item.dataset.bookId = book.id; // 正确设置 dataset
      item.appendChild(el('span', {}, [book.name]));
      return item;
    });
    mountFragment(listEl, nodes);
  }

  openWorldBookEditor(bookId: string): void {
    const state = win().state;
    const book = state?.worldBooks.find((wb: WorldBook) => wb.id === bookId);
    if (!book) return;

    // 复用全局编辑态
    state.editingWorldBookId = bookId;

    const title = qs<HTMLDivElement>('world-book-editor-title');
    const nameInput = qs<HTMLInputElement>('world-book-name-input');
    const contentInput = qs<HTMLTextAreaElement>('world-book-content-input');

    if (title) title.textContent = book.name;
    if (nameInput) nameInput.value = book.name;
    if (contentInput) contentInput.value = book.content;

    win().showScreen?.('world-book-editor-screen');
  }

  async createWorldBook(): Promise<void> {
    const name = await this.showCustomPrompt('创建世界书', '请输入书名');
    if (!name?.trim()) return;

    const newBook: WorldBook = { id: `wb_${Date.now()}`, name: name.trim(), content: '' };

    await tryWrap('创建世界书', async () => {
      await win().saveWorldBook?.(newBook);
      win().addWorldBook?.(newBook);
      this.renderWorldBookScreen();
      this.openWorldBookEditor(newBook.id);
    });
  }

  async saveWorldBook(): Promise<void> {
    const state = win().state;
    const editingId: string | null = state?.editingWorldBookId ?? null;
    if (!editingId) return;

    const nameInput = qs<HTMLInputElement>('world-book-name-input');
    const contentInput = qs<HTMLTextAreaElement>('world-book-content-input');
    if (!nameInput || !contentInput) return;

    const newName = nameInput.value.trim();
    if (!newName) return showValidationError('世界书名称');

    const book = state.worldBooks.find((wb: WorldBook) => wb.id === editingId);
    if (!book) return;

    book.name = newName;
    book.content = contentInput.value;

    await tryWrap('保存世界书', async () => {
      await win().saveWorldBook?.(book);
      const titleEl = qs('world-book-editor-title'); if (titleEl) titleEl.textContent = newName;
      state.editingWorldBookId = null;
      this.renderWorldBookScreen();
      win().showScreen?.('world-book-screen');
    });
  }

  async deleteWorldBook(bookId: string): Promise<void> {
    await tryWrap('删除世界书', async () => {
      await win().deleteWorldBook?.(bookId);
      win().removeWorldBook?.(bookId);
      this.renderWorldBookScreen();
    });
  }

  private showCustomPrompt(title: string, placeholder: string): Promise<string | null> {
    const w = win();
    return w.showCustomPrompt ? w.showCustomPrompt(title, placeholder) : Promise.resolve(prompt(`${title}: ${placeholder}`));
  }
  private showCustomConfirm(title: string, message: string, options: any = {}): Promise<boolean> {
    const w = win();
    return w.showCustomConfirm ? w.showCustomConfirm(title, message, options) : Promise.resolve(confirm(`${title}: ${message}`));
  }
}

// ============ 预设模块 ============

export class PresetScreen implements ScreenModule {
  render(): void {
    void this.renderPresetListScreen();
  }

  initListeners(): void {
    qs('add-preset-btn')?.addEventListener('click', () => this.openPresetEditor(null));
    qs('save-preset-btn')?.addEventListener('click', () => this.savePreset());

    const list = qs('preset-list');
    if (list) {
      list.addEventListener('click', (e) => this.onPresetListClick(e as MouseEvent));
    }
  }

  private onPresetListClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const presetId = target.dataset.presetId
        ?? (target.closest('[data-preset-id]') as HTMLElement | null)?.dataset.presetId
        ?? null;

    if (!presetId) return;

    if (target.classList.contains('edit-preset-btn')) {
      this.openPresetEditor(presetId);
      win().showScreen?.('preset-editor-screen');
    } else if (target.classList.contains('set-active-preset-btn')) {
      void this.setActivePreset(presetId);
    } else if (target.classList.contains('delete-preset-list-btn')) {
      void this.deletePreset(presetId);
    }
  }

  async renderPresetListScreen(): Promise<void> {
    const listEl = qs('preset-list');
    const state = win().state;
    if (!listEl || !state) return console.error('预设列表渲染：缺少必要的元素或状态');

    clear(listEl);

    if (!state.presets.length) {
      await this.initPresetsData();
      if (!state.presets.length) {
        listEl.appendChild(el('p', { style: 'text-align:center;color:#8a8a8a;margin-top:50px' as any }, ['点击右上角 "+" 创建你的第一个预设']));
        return;
      }
    }

    const activeId = state.globalSettings.activePresetId;
    const nodes: HTMLElement[] = state.presets.map((preset: Preset) => {
      const isActive = preset.id === activeId;
      const item = el('div', { className: `preset-list-item${isActive ? ' active' : ''}` });

      const info = el('div', { className: 'preset-info' });
      info.dataset.presetId = preset.id; // 正确设置 dataset

      const nameDiv = el('div', { className: 'preset-name' }, [
        ...(isActive ? [el('span', { className: 'active-indicator' }, ['★'])] : []),
        document.createTextNode(preset.name),
      ]);
      const remarkDiv = el('div', { className: 'preset-remark' }, [preset.remark || '无备注']);
      info.appendChild(nameDiv);
      info.appendChild(remarkDiv);

      const actions = el('div', { className: 'preset-actions' });
      const editBtn = el('button', { className: 'action-btn-small edit-preset-btn' }) as HTMLButtonElement;
      editBtn.textContent = '编辑';
      editBtn.dataset.presetId = preset.id;

      const setBtn = el('button', { className: 'action-btn-small set-active-preset-btn' }) as HTMLButtonElement;
      setBtn.textContent = '设为当前';
      setBtn.dataset.presetId = preset.id;
      setBtn.disabled = isActive;

      actions.appendChild(editBtn);
      actions.appendChild(setBtn);

      if (state.presets.length > 1) {
        const delBtn = el('button', { className: 'action-btn-small delete-preset-list-btn' }) as HTMLButtonElement;
        delBtn.textContent = '删除';
        delBtn.style.color = '#d9534f';
        delBtn.dataset.presetId = preset.id;
        actions.appendChild(delBtn);
      }

      item.appendChild(info);
      item.appendChild(actions);
      return item;
    });

    mountFragment(listEl, nodes);
  }

  openPresetEditor(presetId: string | null): void {
    const state = win().state;
    const cs = win().CONSTANTS;
    if (!state || !cs) return console.error('打开预设编辑器失败：缺少必要的状态或常量');

    state.editingPresetId = presetId;

    const title = qs('preset-editor-title');
    const deleteBtn = qs<HTMLButtonElement>('delete-preset-btn');

    const nameI = qs<HTMLInputElement>('preset-name-input');
    const remarkI = qs<HTMLTextAreaElement>('preset-remark-input');
    const imgI = qs<HTMLTextAreaElement>('prompt-image-input');
    const voiceI = qs<HTMLTextAreaElement>('prompt-voice-input');
    const transferI = qs<HTMLTextAreaElement>('prompt-transfer-input');
    const singleI = qs<HTMLTextAreaElement>('prompt-single-input');
    const groupI = qs<HTMLTextAreaElement>('prompt-group-input');

    if (presetId) {
      const preset = state.presets.find((p: Preset) => p.id === presetId);
      if (!preset) return;
      if (title) title.textContent = `编辑预设: ${preset.name}`;
      if (nameI) nameI.value = preset.name;
      if (remarkI) remarkI.value = preset.remark;
      if (imgI) imgI.value = preset.promptImage;
      if (voiceI) voiceI.value = preset.promptVoice;
      if (transferI) transferI.value = preset.promptTransfer;
      if (singleI) singleI.value = preset.promptSingle;
      if (groupI) groupI.value = preset.promptGroup;
      if (deleteBtn) deleteBtn.style.display = 'block';
    } else {
      if (title) title.textContent = '新增预设';
      if (nameI) nameI.value = '';
      if (remarkI) remarkI.value = '';
      if (imgI) imgI.value = cs.DEFAULT_PROMPT_IMAGE;
      if (voiceI) voiceI.value = cs.DEFAULT_PROMPT_VOICE;
      if (transferI) transferI.value = cs.DEFAULT_PROMPT_TRANSFER;
      if (singleI) singleI.value = cs.DEFAULT_PROMPT_SINGLE;
      if (groupI) groupI.value = cs.DEFAULT_PROMPT_GROUP;
      if (deleteBtn) deleteBtn.style.display = 'none';
    }

    win().showScreen?.('preset-editor-screen');
  }

  async savePreset(): Promise<void> {
    const name = qs<HTMLInputElement>('preset-name-input')?.value.trim() ?? '';
    if (!name) return showValidationError('预设名称');

    const state = win().state; const savePreset = win().savePreset;
    if (!state || !savePreset) return console.error('保存预设失败：状态或数据库不可用');

    const presetData: Omit<Preset, 'id'> = {
      name,
      remark: qs<HTMLTextAreaElement>('preset-remark-input')?.value.trim() ?? '',
      promptImage: qs<HTMLTextAreaElement>('prompt-image-input')?.value ?? '',
      promptVoice: qs<HTMLTextAreaElement>('prompt-voice-input')?.value ?? '',
      promptTransfer: qs<HTMLTextAreaElement>('prompt-transfer-input')?.value ?? '',
      promptSingle: qs<HTMLTextAreaElement>('prompt-single-input')?.value ?? '',
      promptGroup: qs<HTMLTextAreaElement>('prompt-group-input')?.value ?? ''
    };

    await tryWrap('保存预设', async () => {
      let preset: Preset;
      if (state.editingPresetId) {
        const idx = state.presets.findIndex((p: Preset) => p.id === state.editingPresetId);
        preset = { ...state.presets[idx], ...presetData };
        state.presets[idx] = preset;
      } else {
        preset = { id: `preset_${Date.now()}`, ...presetData };
        state.presets.push(preset);
      }
      await savePreset(preset);
      state.editingPresetId = null;
      await this.renderPresetListScreen();
      win().showScreen?.('preset-list-screen');
    });
  }

  async initPresetsData(): Promise<void> {
    const state = win().state;
    const savePreset = win().savePreset;
    const cs = win().CONSTANTS;
    if (!state || !savePreset || !cs) return console.error('初始化预设数据失败：缺少必要依赖');

    await tryWrap('初始化预设数据', async () => {
      if (!state.presets.length) {
        const defaultPreset: Preset = {
          id: `preset_${Date.now()}`,
          name: '默认预设',
          remark: '系统内置的默认AI行为预设。',
          promptImage: cs.DEFAULT_PROMPT_IMAGE,
          promptVoice: cs.DEFAULT_PROMPT_VOICE,
          promptTransfer: cs.DEFAULT_PROMPT_TRANSFER,
          promptSingle: cs.DEFAULT_PROMPT_SINGLE,
          promptGroup: cs.DEFAULT_PROMPT_GROUP
        };
        state.presets.push(defaultPreset);
        await savePreset(defaultPreset);
        await win().updateGlobalSettings?.({ activePresetId: defaultPreset.id });
      }
    });
  }

  private async setActivePreset(presetId: string): Promise<void> {
    await tryWrap('设置活跃预设', async () => {
      await win().updateGlobalSettings?.({ activePresetId: presetId });
      await this.renderPresetListScreen();
    });
  }

  private async deletePreset(presetId: string): Promise<void> {
    await tryWrap('删除预设', async () => {
      const state = win().state;
      const sp = win().showCustomConfirm;
      if (!state || !win().deletePreset || !sp) return;

      if (state.presets.length <= 1) return showError('无法删除：至少需要保留一个预设');

      const preset = state.presets.find((p: Preset) => p.id === presetId);
      if (!preset) return;

      const confirmed = await sp('删除预设', `确定要删除预设 "${preset.name}" 吗？此操作无法撤销。`, { confirmButtonClass: 'btn-danger' });
      if (!confirmed) return;

      await win().deletePreset(presetId);

      if (state.globalSettings.activePresetId === presetId) {
        const remaining = state.presets.filter((p: Preset) => p.id !== presetId);
        if (remaining.length) await win().updateGlobalSettings?.({ activePresetId: remaining[0].id });
      }

      state.presets = state.presets.filter((p: Preset) => p.id !== presetId);
      await this.renderPresetListScreen();
    });
  }

  exportPresets(): void {
    const state = win().state;
    if (!state) return console.error('导出预设失败：状态管理模块未初始化');

    const exportData = {
      presets: state.presets,
      activePresetId: state.globalSettings?.activePresetId,
      exportTime: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url }) as HTMLAnchorElement;
    a.download = `presets_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async importPresets(file: File): Promise<void> {
    await tryWrap('导入预设', async () => {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data?.presets)) throw new Error('导入文件格式错误');

      const state = win().state; const db = win().DB?.db;
      if (!state || !db) throw new Error('系统状态不可用');

      const existingIds = new Set(state.presets.map((p: Preset) => p.id));
      const newPresets: Preset[] = data.presets.filter((p: Preset) => !existingIds.has(p.id));

      for (const p of newPresets) state.presets.push(p);
      if (newPresets.length) await (db.presets.bulkPut ? db.presets.bulkPut(newPresets) : Promise.all(newPresets.map((p: Preset) => db.presets.put(p))));

      if (data.activePresetId && state.presets.some((p: Preset) => p.id === data.activePresetId)) {
        await win().updateGlobalSettings?.({ activePresetId: data.activePresetId });
      }

      await this.renderPresetListScreen();
      showSuccess(`成功导入 ${newPresets.length} 个新预设`);
    });
  }
}

// ============ API 设置模块（与上版一致的优化，不涉及本次审查点） ============

export class ApiSettingsScreen implements ScreenModule {
  render(): void { this.renderApiSettingsScreen(); }
  initListeners(): void {
    qs('save-api-settings-btn')?.addEventListener('click', () => this.saveApiSettings());
    qs('fetch-models-btn')?.addEventListener('click', () => this.fetchModels());
    qs('geolocation-toggle')?.addEventListener('change', (e) => this.updateGeolocationSetting((e.target as HTMLInputElement).checked));
    qs('apply-remote-theme-btn')?.addEventListener('click', () => this.applyRemoteTheme());
    qs('reset-remote-theme-btn')?.addEventListener('click', () => this.resetThemeToDefault());
    qs('load-remote-library-btn')?.addEventListener('click', () => this.loadRemoteThemeLibrary());
    qs('open-builtin-themes-btn')?.addEventListener('click', () => this.loadBuiltinThemes());
    qs('export-settings-btn')?.addEventListener('click', () => this.exportSettings());
    qs('import-settings-btn')?.addEventListener('click', () => {
      const input = el('input', { type: 'file' } as any) as HTMLInputElement;
      input.accept = '.json';
      input.onchange = (ev) => {
        const f = (ev.target as HTMLInputElement).files?.[0];
        if (f) void this.importSettings(f);
      };
      input.click();
    });
  }

  renderApiSettingsScreen(): void {
    const state = win().state;
    if (!state) return console.error('API设置渲染：状态管理模块未初始化');

    const { apiConfig, globalSettings } = state;
    const proxy = qs<HTMLInputElement>('proxy-url'); if (proxy) proxy.value = apiConfig.proxyUrl || '';
    const key = qs<HTMLInputElement>('api-key'); if (key) key.value = apiConfig.apiKey || '';
    const geo = qs<HTMLInputElement>('geolocation-toggle'); if (geo) geo.checked = !!globalSettings.enableGeolocation;
    const theme = qs<HTMLInputElement>('remote-theme-url'); if (theme) theme.value = globalSettings.remoteThemeUrl || '';
  }

  async saveApiSettings(): Promise<void> {
    await tryWrap('保存API设置', async () => {
      const apiConfig: Partial<ApiConfig> = {
        proxyUrl: qs<HTMLInputElement>('proxy-url')?.value.trim() ?? '',
        apiKey: qs<HTMLInputElement>('api-key')?.value.trim() ?? '',
        model: qs<HTMLSelectElement>('model-select')?.value ?? ''
      };
      await win().updateApiConfig?.(apiConfig);
      showSuccess('API设置已保存！');
    });
  }

  async fetchModels(): Promise<void> {
    let url = qs<HTMLInputElement>('proxy-url')?.value.trim() ?? '';
    const key = qs<HTMLInputElement>('api-key')?.value.trim() ?? '';
    if (!url || !key) return showError('请先填写反代地址和密钥');

    url = normalizeApiBase(url);

    try {
      const resp = await fetch(`${url}/v1/models`, { headers: { Authorization: `Bearer ${key}` } });
      if (!resp.ok) throw new Error('无法获取模型列表');
      const data = await resp.json();
      const select = qs<HTMLSelectElement>('model-select'); if (!select) return;

      clear(select);
      const state = win().state;
      const nodes = (data.data || []).map((m: any) => {
        const opt = el('option') as HTMLOptionElement;
        opt.value = m.id; opt.textContent = m.id;
        if (m.id === state?.apiConfig?.model) opt.selected = true;
        return opt;
      });
      mountFragment(select, nodes as unknown as HTMLElement[]);
      showSuccess('模型列表已更新');
    } catch (e) {
      console.error('拉取模型失败:', e);
      showNetworkError('拉取模型', e as Error);
    }
  }

  async updateGeolocationSetting(enabled: boolean): Promise<void> {
    const w = win(); const state = w.STATE?.state ?? w.state;
    if (!state || !w.updateGlobalSettings) return;
    await tryWrap('更新地理位置设置', async () => {
      state.globalSettings.enableGeolocation = enabled;
      await w.updateGlobalSettings({ enableGeolocation: enabled });
      await this.updateGeolocation();
    });
  }

  private async updateGeolocation(): Promise<void> {
    const w = win(); const state = w.STATE?.state ?? w.state;
    if (!state) return;
    const toggle = qs<HTMLInputElement>('geolocation-toggle');
    let myAddress = w.STATE?.myAddress || '位置未知';

    if (!state.globalSettings.enableGeolocation) {
      myAddress = '位置未知';
      if (toggle) toggle.checked = false;
      w.STATE?.setMyAddress?.(myAddress);
      return;
    }
    if (toggle) toggle.checked = true;

    try {
      const geoResponse = await fetch('https://ipinfo.io/json');
      if (!geoResponse.ok) throw new Error('ipinfo.io request failed');
      const geoData = await geoResponse.json();
      if (geoData.city && geoData.region) myAddress = `${geoData.country}, ${geoData.region}, ${geoData.city}`;
      else throw new Error('无法从ipinfo.io获取地理位置');
    } catch (e) {
      console.error('Geolocation Error:', e);
      myAddress = '位置获取失败';
    }
    w.STATE?.setMyAddress?.(myAddress);
  }

  async applyRemoteTheme(): Promise<void> {
    const url = qs<HTMLInputElement>('remote-theme-url')?.value?.trim();
    if (!url) return showError('请输入远程主题的CSS URL');

    const w = win(); const state = w.STATE?.state ?? w.state;
    if (!state || !w.updateGlobalSettings) return;

    await tryWrap('应用远程主题', async () => {
      this.switchStylesheet(url!);
      state.globalSettings.remoteThemeUrl = url!;
      await w.updateGlobalSettings({ remoteThemeUrl: url! });
      if (w.showCustomAlert) await w.showCustomAlert('主题已更新', '远程主题已应用并保存。');
      else showSuccess('主题已更新');
    });
  }

  async resetThemeToDefault(): Promise<void> {
    const w = win(); const state = w.STATE?.state ?? w.state;
    if (!state || !w.updateGlobalSettings) return;

    await tryWrap('重置主题', async () => {
      const themeUrl = qs<HTMLInputElement>('remote-theme-url'); if (themeUrl) themeUrl.value = '';
      const libUrl = qs<HTMLInputElement>('remote-theme-library-url'); if (libUrl) libUrl.value = '';
      this.switchStylesheet('');
      state.globalSettings.remoteThemeUrl = '';
      await w.updateGlobalSettings({ remoteThemeUrl: '' });
      if (w.showCustomAlert) await w.showCustomAlert('主题已重置', '已恢复为默认主题。'); else showSuccess('主题已重置');
    });
  }

  async loadRemoteThemeLibrary(): Promise<void> {
    const libraryUrl = qs<HTMLInputElement>('remote-theme-library-url')?.value?.trim();
    if (!libraryUrl) return showError('请输入远程主题库的URL！');
    win().openThemeListModal ? win().openThemeListModal(libraryUrl, '选择远程主题') : showError('主题库功能不可用');
  }

  async loadBuiltinThemes(): Promise<void> {
    const builtinThemeListUrl = 'https://fastly.jsdelivr.net/gh/mxw13579/phone@release-v1.0.0.7/myPhone/themeList.json';
    win().openThemeListModal ? win().openThemeListModal(builtinThemeListUrl, '选择内置主题') : showError('内置主题功能不可用');
  }

  private switchStylesheet(url: string): void {
    const link = qs<HTMLLinkElement>('main-stylesheet');
    if (!link) return;
    link.href = url?.trim() ? `${url}?v=${Date.now()}` : './unified-style.css';
  }

  async initApiSettingsModule(): Promise<void> { await this.updateGeolocation(); }

  exportSettings(): void {
    const w = win(); const state = w.STATE?.state ?? w.state;
    if (!state) return console.error('导出设置失败：状态管理模块未初始化');

    const exportData = {
      apiConfig: state.apiConfig,
      globalSettings: state.globalSettings,
      exportTime: new Date().toISOString(),
      version: '1.0.0'
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url }) as HTMLAnchorElement;
    a.download = `settings_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async importSettings(file: File): Promise<void> {
    await tryWrap('导入设置', async () => {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.apiConfig || !data.globalSettings) throw new Error('导入文件格式错误：缺少必要的设置数据');

      const w = win(); const state = w.STATE?.state ?? w.state; const db = w.DB?.db;
      if (!state || !db) throw new Error('系统状态不可用');

      const confirmed = await (w.showCustomConfirm?.('导入设置确认', '确定要导入设置吗？这将覆盖当前的API配置和全局设置。') ?? Promise.resolve(confirm('确定要导入设置吗？这将覆盖当前的API配置和全局设置。')));
      if (!confirmed) return;

      Object.assign(state.apiConfig, data.apiConfig);
      Object.assign(state.globalSettings, data.globalSettings);

      if (w.saveApiConfig) await w.saveApiConfig(state.apiConfig);
      if (w.updateGlobalSettings) await w.updateGlobalSettings(state.globalSettings);

      this.renderApiSettingsScreen();
      if (data.globalSettings.remoteThemeUrl) this.switchStylesheet(data.globalSettings.remoteThemeUrl);

      showSuccess('设置导入成功！');
    });
  }
}

// ============ 壁纸模块（与上版一致，使用 state 的 newWallpaperBase64） ============

export class WallpaperScreen implements ScreenModule {
  render(): void { this.renderWallpaperScreen(); }
  initListeners(): void {
    qs('wallpaper-upload-input')?.addEventListener('change', (e) => this.handleWallpaperUpload(e));
    qs('save-wallpaper-btn')?.addEventListener('click', () => this.saveWallpaper());
  }

  renderWallpaperScreen(): void {
    const preview = qs('wallpaper-preview');
    const state = win().state;
    if (!preview || !state) return console.error('壁纸渲染：缺少必要的元素或状态');

    const bg: string | null = state.newWallpaperBase64 ?? state.globalSettings.wallpaper ?? null;

    if (bg && bg.startsWith('data:image')) {
      preview.style.backgroundImage = `url(${bg})`; preview.textContent = '';
    } else if (bg) {
      preview.style.backgroundImage = bg; preview.textContent = '当前为渐变色';
    } else {
      preview.style.backgroundImage = 'linear-gradient(135deg, #89f7fe, #66a6ff)'; preview.textContent = '默认渐变背景';
    }
  }

  async handleWallpaperUpload(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    await tryWrap('上传壁纸', async () => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const state = win().state;
      state.newWallpaperBase64 = dataUrl;
      this.renderWallpaperScreen();
    });
  }

  async saveWallpaper(): Promise<void> {
    const state = win().state;
    const data = state?.newWallpaperBase64 ?? null;
    if (!data) return showError('请先上传一张新壁纸。');

    await tryWrap('保存壁纸', async () => {
      await win().updateGlobalSettings?.({ wallpaper: data });
      this.applyGlobalWallpaper();
      state.newWallpaperBase64 = null;
      showSuccess('壁纸已保存并应用！');
      win().showScreen?.('home-screen');
    });
  }

  applyGlobalWallpaper(): void {
    const home = qs('home-screen'); const state = win().state;
    if (!home || !state) return;
    const wp = state.globalSettings.wallpaper;
    if (wp?.startsWith('data:image')) home.style.backgroundImage = `url(${wp})`;
    else if (wp) home.style.backgroundImage = wp;
    else home.style.backgroundImage = 'linear-gradient(135deg, #89f7fe, #66a6ff)';
  }
}

// ============ 屏幕模块管理器 ============

export class ScreenModuleManager {
  private modules: Map<string, ScreenModule> = new Map();
  constructor() {
    this.modules.set('world-book', new WorldBookScreen());
    this.modules.set('presets', new PresetScreen());
    this.modules.set('api-settings', new ApiSettingsScreen());
    this.modules.set('wallpaper', new WallpaperScreen());
  }
  renderScreen(screenName: string): void {
    const m = this.modules.get(screenName);
    if (m) void m.render(); else console.warn('未找到屏幕模块:', screenName);
  }
  initAllListeners(): void {
    this.modules.forEach((m, name) => {
      console.log('初始化屏幕模块监听器:', name);
      m.initListeners();
    });
  }
  getModule(screenName: string): ScreenModule | undefined {
    return this.modules.get(screenName);
  }
}

// ============ 导出 ============

export { chatScreenModule, ChatScreenModule, aiResponseModule };
export const worldBookScreenModule = new WorldBookScreen();
export const presetScreenModule = new PresetScreen();
export const apiSettingsScreenModule = new ApiSettingsScreen();
export const wallpaperScreenModule = new WallpaperScreen();
export const screenManager = new ScreenModuleManager();

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
