export type EventStatus = 'open' | 'done' | 'cancelled' | 'note';
export type Lifecycle = 'none' | 'requiresCompletion';

export interface EventRec {
  id: string;
  personaId: string;
  chatId?: string;
  participants?: string[];
  typeKey: string;
  title: string;              // ≤80 chars
  content: string;            // ≤300 chars；压缩后摘要仍≤300
  titleTpl?: string;          // 可选模板，支持{USER}/{PERSONA}变量
  contentTpl?: string;        // 可选模板，支持{USER}/{PERSONA}变量
  status: EventStatus;
  lifecycle: Lifecycle;
  dueAt?: number;             // 仅承诺类可选
  parentEventId?: string;     // 子事件指向主事件
  tags?: string[];
  excludeFromPrompt?: boolean;
  compressed?: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  pii?: boolean;
}

export interface MemoryType {
  key: string;                // 'commitment' | 'note' | ...（用户自定义）
  displayName: string;
  description?: string;
  lifecycle: Lifecycle;
  extractionGuidelines?: string;
  examples?: { good: string[]; bad: string[] };
  retentionHints?: { rank?: number };
}

export interface PersonaMemorySettings {
  personaId: string;
  maxEvents: number;          // 每角色最大条数（含摘要事件）
  overflowPolicy: 'drop_oldest' | 'compress_oldest';
  compressBatchSize: number;  // 一次压缩抽取的旧事件数量建议
  memoryTokenBudget?: number; // 记忆token预算，可选配置
}

export interface SelectBudget { 
  maxChars: number; 
  topN?: number;
}

export interface MemoryRepo {
  getEventsByPersona(personaId: string): Promise<EventRec[]>;
  getOpenByPersona(personaId: string): Promise<EventRec[]>;
  getOldDoneOrNote(personaId: string, before: number, limit: number): Promise<EventRec[]>;
  getEventById(id: string): Promise<EventRec | undefined>;
  addEvent(e: EventRec): Promise<string>;
  updateEvent(id: string, patch: Partial<EventRec>): Promise<void>;
  tx<T>(fn: () => Promise<T>): Promise<T>;
  
  getTypeRegistry(): Promise<MemoryType[]>;
  saveType(t: MemoryType): Promise<void>;
  
  getSettings(personaId: string): Promise<PersonaMemorySettings>;
  saveSettings(s: PersonaMemorySettings): Promise<void>;
}