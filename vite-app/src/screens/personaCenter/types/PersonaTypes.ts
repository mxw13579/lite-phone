// 角色中心类型定义
// 定义Persona、UserRole和相关接口

// BaselineRecord - 与记忆系统对齐
export interface BaselineRecord {
  kind: 'baseline.preference' | 'baseline.skill' | 'baseline.style' | 'baseline.value' | 'baseline.background';
  topicKey: string;
  domain?: string;
  subdomain?: string;
  value?: string;
  text?: string;
  tags?: string[];
  pinned?: boolean;
  order?: number;
}

// WorldBookLink - WorldBook关联配置
export interface WorldBookLink {
  worldBookId: string;
  enabled: boolean;
  order: number;
}

// Persona - AI角色定义
export interface Persona {
  id: string;
  name: string;
  avatar: string;
  type: 'ai';
  tags: string[];
  prompt: {
    // 统一为“角色设定”，兼容旧字段
    definition?: string;
    // 兼容字段（读取时作回退，不在UI中展示）
    system?: string;
    style?: string;
    safety?: string;
  };
  baseline?: BaselineRecord[];
  worldBookLinks: WorldBookLink[];
  status: 'draft' | 'published';
  version: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
  publishedAt?: number;
}

// UserRole - 用户扮演角色定义
export interface UserRole {
  id: string;
  name: string;
  avatar: string;
  type: 'user';
  tags: string[];
  prompt: {
    // 统一为“角色设定”，兼容旧字段
    definition?: string;
    // 兼容字段（读取时作回退，不在UI中展示）
    persona?: string;
    style?: string;
  };
  archived: boolean;
  isGlobalDefault: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
}

// 创建Persona的输入类型
export type CreatePersonaInput = Omit<Persona, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt' | 'publishedAt' | 'version'> & {
  version?: number;
};

// 更新Persona的输入类型
export type UpdatePersonaInput = Partial<Omit<Persona, 'id' | 'createdAt'>>;

// 创建UserRole的输入类型
export type CreateUserRoleInput = Omit<UserRole, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt'>;

// 更新UserRole的输入类型
export type UpdateUserRoleInput = Partial<Omit<UserRole, 'id' | 'createdAt'>>;

// 筛选选项
export interface FilterOptions {
  type?: 'ai' | 'user' | 'all';
  tags?: string[];
}

// 搜索选项
export interface SearchOptions {
  term: string;
  fields?: ('name' | 'tags' | 'prompt.system' | 'prompt.style' | 'prompt.safety')[];
  filters?: FilterOptions;
}

// 导入导出相关类型
export interface ImportExportMeta {
  schemaVersion: number;
  entityType: 'persona' | 'userRole' | 'mixed';
  exportedAt: number;
  sourceApp: string;
  appVersion: string;
}

export interface PersonaExportData {
  meta: ImportExportMeta;
  personas?: Persona[];
  userRoles?: UserRole[];
}

// 冲突处理策略
export type ConflictStrategy = 'preserve' | 'override' | 'regenId';

export interface ImportResult {
  success: boolean;
  imported: {
    personas: number;
    userRoles: number;
  };
  skipped: {
    personas: number;
    userRoles: number;
  };
  errors: string[];
}

// 合成配置
export interface CompositionConfig {
  separator: string;
  showSectionTitles: boolean;
  includeWorldBookTitles: boolean;
  previewIncludeMemory: boolean;
  memoryTokenBudget: number;
  runtimeMode: 'preview' | 'send';
}

// 默认配置常量
export const DEFAULT_COMPOSITION_CONFIG: CompositionConfig = {
  separator: '----',
  showSectionTitles: true,
  includeWorldBookTitles: true,
  previewIncludeMemory: false,
  memoryTokenBudget: 600,
  runtimeMode: 'preview'
};

// Persona Center 屏幕状态
export interface PersonaCenterState {
  loading: boolean;
  error: string | null;
  selectedPersonaId: string | null;
  selectedUserRoleId: string | null;
  viewMode: 'list' | 'detail';
  searchTerm: string;
  filterOptions: FilterOptions;
  activeMenu?: 'overview' | 'ai' | 'user' | 'worldbook' | 'import' | 'settings';
}