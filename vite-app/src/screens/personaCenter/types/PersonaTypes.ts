// 类型与常量优化：强约束、抽公、可扩展、提高可读性

// ========= 基础枚举与常量 =========
export const RoleType = {
  AI: 'ai',
  USER: 'user',
} as const;
export type RoleType = typeof RoleType[keyof typeof RoleType];

export const PublishStatus = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
} as const;
export type PublishStatus = typeof PublishStatus[keyof typeof PublishStatus];

export const ConflictStrategy = {
  PRESERVE: 'preserve',
  OVERRIDE: 'override',
  REGEN_ID: 'regenId',
} as const;
export type ConflictStrategy = typeof ConflictStrategy[keyof typeof ConflictStrategy];

export const EntityType = {
  PERSONA: 'persona',
  USER_ROLE: 'userRole',
  MIXED: 'mixed',
} as const;
export type EntityType = typeof EntityType[keyof typeof EntityType];

export const RuntimeMode = {
  PREVIEW: 'preview',
  SEND: 'send',
} as const;
export type RuntimeMode = typeof RuntimeMode[keyof typeof RuntimeMode];

export const BaselineKind = {
  PREFERENCE: 'baseline.preference',
  SKILL: 'baseline.skill',
  STYLE: 'baseline.style',
  VALUE: 'baseline.value',
  BACKGROUND: 'baseline.background',
} as const;
export type BaselineKind = typeof BaselineKind[keyof typeof BaselineKind];

// ========= 基础工具与公共接口 =========
type ReadonlyArrayOf<T> = readonly T[];

interface Timestamped {
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number;
}

interface Identifiable {
  id: string;
  name: string;
  avatar: string;
  tags: ReadonlyArrayOf<string>;
  archived: boolean;
}

type WithType<T extends RoleType> = { type: T };

type OptionalRecord<K extends string, V> = {
  [P in K]?: V;
};

// Prompt 统一与兼容字段（仅存储，UI 不展示兼容字段）
interface BasePrompt {
  definition?: string; // 统一字段
  style?: string;
}

// 旧字段兼容，不在 UI 展示
interface AIPromptCompat {
  system?: string;
  safety?: string;
}
interface UserPromptCompat {
  persona?: string;
}

// ========= 领域模型 =========
export interface BaselineRecord {
  kind: BaselineKind;
  topicKey: string;
  domain?: string;
  subdomain?: string;
  value?: string;
  text?: string;
  tags?: ReadonlyArrayOf<string>;
  pinned?: boolean;
  order?: number;
}

export interface WorldBookLink {
  worldBookId: string;
  enabled: boolean;
  order: number;
}

// Persona
export interface Persona
    extends Identifiable,
        Timestamped,
        WithType<typeof RoleType.AI> {
  prompt: BasePrompt & AIPromptCompat;
  baseline?: ReadonlyArrayOf<BaselineRecord>;
  worldBookLinks: ReadonlyArrayOf<WorldBookLink>;
  status: PublishStatus;
  version: number;
  publishedAt?: number;
}

// UserRole
export interface UserRole
    extends Identifiable,
        Timestamped,
        WithType<typeof RoleType.USER> {
  prompt: BasePrompt & UserPromptCompat;
  isGlobalDefault: boolean;
}

// ========= 输入类型工厂（避免重复 Omit/Partial） =========
type CreateInput<T, K extends keyof T = never> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'lastUsedAt' | K> &
    OptionalRecord<'id', string>; // 允许外部自带 id（可选）

type UpdateInput<T> = Partial<Omit<T, 'id' | 'createdAt'>>;

export type CreatePersonaInput = Omit<
    CreateInput<Persona, 'publishedAt' | 'version'>,
    'type'
> & {
  type?: typeof RoleType.AI;
  version?: number;
};

export type UpdatePersonaInput = UpdateInput<Persona>;

export type CreateUserRoleInput = Omit<CreateInput<UserRole>, 'type'> & {
  type?: typeof RoleType.USER;
};

export type UpdateUserRoleInput = UpdateInput<UserRole>;

// ========= 筛选 / 搜索 =========
export interface FilterOptions {
  type?: RoleType | 'all';
  status?: PublishStatus | 'all';
  archived?: boolean;
  tags?: ReadonlyArrayOf<string>;
}

// 键路径工具：从对象类型安全推导可搜索字段
type DotPath<T, Prev extends string = ''> = {
  [K in keyof T & string]:
  T[K] extends string | ReadonlyArrayOf<string>
      ? `${Prev}${K}`
      : T[K] extends object
          ? DotPath<T[K], `${Prev}${K}.`>
          : never;
}[keyof T & string];

// 允许搜索 Persona/UserRole 公共字段以及 AI 兼容 Prompt 字段
type CommonSearchable = 'name' | 'tags';
type AIPromptSearchable = DotPath<AIPromptCompat | BasePrompt>;
export type SearchField = CommonSearchable | Extract<AIPromptSearchable, 'prompt.system' | 'prompt.style' | 'prompt.safety' | 'prompt.definition'>;

export interface SearchOptions {
  term: string;
  fields?: ReadonlyArrayOf<SearchField>;
  filters?: FilterOptions;
}

// ========= 导入导出 =========
export interface ImportExportMeta {
  schemaVersion: number;
  entityType: EntityType;
  exportedAt: number;
  sourceApp: string;
  appVersion: string;
}

export interface PersonaExportData {
  meta: ImportExportMeta;
  personas?: ReadonlyArrayOf<Persona>;
  userRoles?: ReadonlyArrayOf<UserRole>;
}

export interface ImportResultSummary {
  personas: number;
  userRoles: number;
}

export const ImportErrorCode = {
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  DUPLICATE_ID: 'DUPLICATE_ID',
  CONFLICT: 'CONFLICT',
  UNKNOWN: 'UNKNOWN',
} as const;
export type ImportErrorCode = typeof ImportErrorCode[keyof typeof ImportErrorCode];

export interface ImportError {
  code: ImportErrorCode;
  message: string;
  entityId?: string;
}

export interface ImportResult {
  success: boolean;
  imported: ImportResultSummary;
  skipped: ImportResultSummary;
  errors: ReadonlyArrayOf<ImportError>;
}

// ========= 合成配置 =========
export interface CompositionConfig {
  separator: string;
  showSectionTitles: boolean;
  includeWorldBookTitles: boolean;
  previewIncludeMemory: boolean;
  memoryTokenBudget: number;
  runtimeMode: RuntimeMode;
}

export const DEFAULT_COMPOSITION_CONFIG: Readonly<CompositionConfig> = Object.freeze({
  separator: '----',
  showSectionTitles: true,
  includeWorldBookTitles: true,
  previewIncludeMemory: false,
  memoryTokenBudget: 600,
  runtimeMode: RuntimeMode.PREVIEW,
});

// ========= UI 状态 =========
export type PersonaCenterMenu = 'overview' | 'ai' | 'user' | 'worldbook' | 'import' | 'settings';

export interface PersonaCenterState {
  loading: boolean;
  error: string | null;
  selectedPersonaId: string | null;
  selectedUserRoleId: string | null;
  viewMode: 'list' | 'detail';
  searchTerm: string;
  filterOptions: FilterOptions;
  activeMenu?: PersonaCenterMenu;
}
