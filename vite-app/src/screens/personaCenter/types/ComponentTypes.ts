// 组件接口类型定义
// 定义各个UI组件的接口和回调函数类型

import type { Persona, UserRole, FilterOptions, SearchOptions } from './PersonaTypes';

// 基础组件接口
export interface ComponentBase {
  render(): void;
  destroy?(): void;
}

// 列表项接口
export interface PersonaListItem {
  id: string;
  name: string;
  type: 'ai' | 'user';
  tags: string[];
  lastUsedAt: number;
  isActive?: boolean;
}

// 列表组件事件回调
export interface PersonaListEvents {
  onSelect: (id: string, type: 'ai' | 'user') => void;
  onCreate: (type: 'ai' | 'user') => void;
  onDelete: (id: string, type: 'ai' | 'user') => void;
  onArchive?: (id: string, archived: boolean) => void;
  onSearch: (options: SearchOptions) => void;
  onFilter: (options: FilterOptions) => void;
}

// 详情组件事件回调
export interface PersonaDetailEvents {
  onSave?: (data: Persona | UserRole) => void;
  onCancel?: () => void;
  onDelete?: (id: string) => void;
  onPreview?: (data: Persona) => void;
  onWorldBookChange?: (links: import('./PersonaTypes').WorldBookLink[]) => void;
  onDirtyChange?: (isDirty: boolean) => void; // 新增：脏状态变更回调
  onPersonaSelected?: (persona: Persona) => void;
  onPersonaCreated?: (persona: Persona) => void;
  onPersonaUpdated?: (persona: Persona) => void;
  onPersonaDeleted?: (personaId: string) => void;
  onUserRoleSelected?: (userRole: UserRole) => void;
  onUserRoleCreated?: (userRole: UserRole) => void;
  onUserRoleUpdated?: (userRole: UserRole) => void;
  onUserRoleDeleted?: (userRoleId: string) => void;
}

// Tab项接口
export interface TabItem {
  id: string;
  label: string;
  content: HTMLElement;
  isActive: boolean;
}

// 详情页Tab配置
export interface DetailTabConfig {
  basic: boolean;
  prompt: boolean;
  baseline: boolean;
  worldBook: boolean;
  preview: boolean;
}

// WorldBook选择器配置
export interface WorldBookSelectorConfig {
  allowMultiple: boolean;
  allowReorder: boolean;
  showToggle: boolean;
  maxSelection?: number;
}

// WorldBook选择项
export interface WorldBookSelectItem {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
  selected: boolean;
}

// 预览组件配置
export interface PreviewConfig {
  showSectionTitles: boolean;
  includeMemory: boolean;
  maxTokens: number;
  showTokenCount: boolean;
}

// 搜索组件配置
export interface SearchConfig {
  placeholder: string;
  debounceMs: number;
  minLength: number;
  showFilters: boolean;
}

// 批量操作选项
export interface BatchOperations {
  export: boolean;
  delete: boolean;
  tag: boolean;
}

// 列表视图配置
export interface ListViewConfig {
  virtualizeThreshold: number;
  itemHeight: number;
  showRecentFirst: boolean;
  groupByType: boolean;
  showStats: boolean;
}

// 组件状态接口
export interface ComponentState {
  loading: boolean;
  error?: string;
  data?: any;
  selectedItems?: Set<string>;
  editMode?: boolean;
}

// 表单验证结果
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string> | string[];
  warnings?: Record<string, string>;
}

// 详情组件状态
export interface PersonaDetailState {
  activeTab: 'basic' | 'prompt' | 'baseline' | 'worldBook' | 'preview';
  isDirty: boolean;
  isEditing: boolean;
  validationErrors: Record<string, string>;
  currentData: { type: 'persona' | 'userRole'; data: Persona | UserRole } | null;
}

// 便于从此模块引用基础过滤类型
export type { FilterOptions, SearchOptions };

// 快捷键配置
export interface ShortcutConfig {
  save: string;
  preview: string;
  search: string;
  escape: string;
  newPersona: string;
  newUserRole: string;
}

export const DEFAULT_SHORTCUTS: ShortcutConfig = {
  save: 'Ctrl+S',
  preview: 'Ctrl+P', 
  search: '/',
  escape: 'Escape',
  newPersona: 'Ctrl+N',
  newUserRole: 'Ctrl+Shift+N'
};

// 组件事件类型
export type ComponentEventType = 
  | 'select'
  | 'create'
  | 'update' 
  | 'delete'
  | 'search'
  | 'filter'
  | 'preview'
  | 'save'
  | 'cancel';

// 通用事件载荷
export interface ComponentEventPayload<T = any> {
  type: ComponentEventType;
  data?: T;
  source?: string;
  timestamp: number;
}
