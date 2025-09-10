import { db, ensureDbInitialized } from '../../database';
import type { EventRec, MemoryType, PersonaMemorySettings } from './types';

export const MemoryRepo = {
  async getEventsByPersona(personaId: string): Promise<EventRec[]> {
    await ensureDbInitialized();
    return db.events.where('personaId').equals(personaId).sortBy('createdAt') as Promise<EventRec[]>;
  },

  async getOpenByPersona(personaId: string): Promise<EventRec[]> {
    await ensureDbInitialized();
    return db.events.where('[personaId+status]').equals([personaId, 'open']).toArray() as Promise<EventRec[]>;
  },

  async getOldDoneOrNote(personaId: string, before: number, limit: number): Promise<EventRec[]> {
    await ensureDbInitialized();
    
    // 修正：先筛选条件，再按时间升序排列（最旧的在前），最后限制数量
    const allMatching = await db.events
      .where('personaId').equals(personaId)
      .and(e => {
        // 状态必须是done或note
        if (e.status !== 'done' && e.status !== 'note') return false;
        
        // 对于done事件，检查完成时间(updatedAt)；对于note事件，检查创建时间(createdAt)
        const relevantTime = e.status === 'done' ? (e.updatedAt || e.createdAt) : e.createdAt;
        return relevantTime < before;
      })
      .toArray();
    
    // 按相关时间升序排序（最旧的在前），然后取前limit个
    return (allMatching
      .sort((a, b) => {
        const timeA = a.status === 'done' ? (a.updatedAt || a.createdAt) : a.createdAt;
        const timeB = b.status === 'done' ? (b.updatedAt || b.createdAt) : b.createdAt;
        return timeA - timeB; // 升序：旧的在前，确保"最旧N条"语义
      })
      .slice(0, limit)) as EventRec[];
  },

  async addEvent(e: EventRec): Promise<string> {
    await ensureDbInitialized();
    
    // 数据清洗和约束
    const cleanEvent: EventRec = {
      ...e,
      title: String(e.title || '').slice(0, 80),
      content: String(e.content || '').slice(0, 300),
      participants: e.participants?.slice(0, 8),
      tags: e.tags?.slice(0, 8)
    };

    return db.events.put(cleanEvent) as Promise<string>;
  },

  async updateEvent(id: string, patch: Partial<EventRec>): Promise<void> {
    await ensureDbInitialized();
    
    // 数据清洗
    if (patch.title) {
      patch.title = String(patch.title).slice(0, 80);
    }
    if (patch.content) {
      patch.content = String(patch.content).slice(0, 300);
    }
    if (patch.participants) {
      patch.participants = patch.participants.slice(0, 8);
    }
    if (patch.tags) {
      patch.tags = patch.tags.slice(0, 8);
    }
    
    await db.events.update(id, { ...patch, updatedAt: Date.now() });
  },

  async tx<T>(fn: () => Promise<T>): Promise<T> {
    await ensureDbInitialized();
    return db.transaction('rw', db.events, fn);
  },

  // Memory Types
  async getTypeRegistry(): Promise<MemoryType[]> {
    await ensureDbInitialized();
    return db.memory_types.toArray() as Promise<MemoryType[]>;
  },

  async saveType(t: MemoryType): Promise<void> {
    await ensureDbInitialized();
    await db.memory_types.put(t);
  },

  // Memory Settings
  async getSettings(personaId: string): Promise<PersonaMemorySettings> {
    await ensureDbInitialized();
    const settings = await db.memory_settings.get(personaId);
    return settings || {
      personaId,
      maxEvents: 50,
      overflowPolicy: 'compress_oldest',
      compressBatchSize: 10
    };
  },

  async saveSettings(s: PersonaMemorySettings): Promise<void> {
    await ensureDbInitialized();
    await db.memory_settings.put(s);
  },

  // 辅助方法
  async getDueSoonByPersona(personaId: string, now: number): Promise<EventRec[]> {
    await ensureDbInitialized();
    return db.events
      .where('[personaId+dueAt]')
      .between([personaId, now], [personaId, now + 7 * 24 * 60 * 60 * 1000])
      .toArray() as Promise<EventRec[]>;
  },

  async getRecentByPersona(personaId: string, limit: number = 20): Promise<EventRec[]> {
    await ensureDbInitialized();
    // 修正：直接sortBy然后slice，避免.reverse()冗余操作
    return db.events
      .where('personaId').equals(personaId)
      .sortBy('createdAt')
      .then(events => events.slice(-limit).reverse()) as Promise<EventRec[]>;
  },

  async removeEvents(ids: string[]): Promise<void> {
    await ensureDbInitialized();
    await db.events.bulkDelete(ids);
  }
};

// 工具函数：增强去重算法
export async function deduplicateEvents(personaId: string, typeKey: string, title: string): Promise<void> {
  await ensureDbInitialized();
  const normalizedTitle = normalizeTitle(title);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  
  const duplicates = await db.events
    .where('personaId').equals(personaId)
    .and(e => e.typeKey === typeKey && 
              normalizeTitle(e.title) === normalizedTitle &&
              e.createdAt > sevenDaysAgo)
    .toArray();
  
  if (duplicates.length > 1) {
    // 保留最新的，删除其他
    duplicates.sort((a, b) => b.createdAt - a.createdAt);
    const toDelete = duplicates.slice(1).map(e => e.id);
    await MemoryRepo.removeEvents(toDelete);
    console.log('[MM][dedup]', { kept: 1, removed: toDelete.length, title: normalizedTitle });
  }
}

// 标题归一化 - 更严格的处理
function normalizeTitle(title: string): string {
  return title.toLowerCase()
    .replace(/[\s\u3000]+/g, ' ') // 统一空白字符
    .replace(/[，、。\.\-_/！？!?]+/g, ' ') // 标点符号统一
    .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE') // 日期归一化
    .replace(/\d+/g, 'NUM') // 数字归一化
    .trim();
}

// 计算指纹 - 用于高级去重
export function computeFingerprint(event: {personaId: string, typeKey: string, title: string, participants?: string[]}): string {
  const titleNorm = normalizeTitle(event.title).slice(0, 64);
  const participantsSet = (event.participants || []).slice().sort().join('|');
  const rawFingerprint = `${event.personaId}|${event.typeKey}|${titleNorm}|${participantsSet}`;
  
  // 简化的哈希函数（替代btoa）
  let hash = 0;
  for (let i = 0; i < rawFingerprint.length; i++) {
    const char = rawFingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32位整数
  }
  
  return Math.abs(hash).toString(36).slice(0, 12);
}

// 近重复检测 - 基于内容相似度
export async function checkNearDuplicates(personaId: string, event: Partial<EventRec>): Promise<{isDuplicate: boolean, reason?: string}> {
  if (!event.title) return { isDuplicate: false };
  
  await ensureDbInitialized();
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  
  const recentEvents = await db.events
    .where('personaId').equals(personaId)
    .and(e => e.createdAt > sevenDaysAgo)
    .toArray();
  
  for (const existing of recentEvents) {
    // 1. 标题完全相同
    if (normalizeTitle(existing.title) === normalizeTitle(event.title)) {
      return { isDuplicate: true, reason: 'title_exact' };
    }
    
    // 2. 内容高度相似（如果都有内容）
    if (event.content && existing.content && 
        calculateContentSimilarity(event.content, existing.content) >= 0.8) {
      return { isDuplicate: true, reason: 'content_similar' };
    }
    
    // 3. 标题相似度很高
    if (calculateTitleSimilarity(existing.title, event.title) >= 0.85) {
      return { isDuplicate: true, reason: 'title_similar' };
    }
  }
  
  return { isDuplicate: false };
}

// 内容相似度计算（简化版编辑距离）
function calculateContentSimilarity(content1: string, content2: string): number {
  const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, ' ').trim();
  
  const text1 = normalize(content1);
  const text2 = normalize(content2);
  
  if (text1 === text2) return 1.0;
  if (text1.length === 0 || text2.length === 0) return 0;
  
  // 简化：基于公共子串
  let commonLength = 0;
  const shorter = text1.length < text2.length ? text1 : text2;
  const longer = text1.length >= text2.length ? text1 : text2;
  
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter.slice(i, i + 5))) { // 5字符窗口
      commonLength += 5;
    }
  }
  
  return commonLength / Math.max(text1.length, text2.length);
}

// 复用前面定义的标题相似度函数
function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalize = (str: string) => str.toLowerCase()
    .replace(/[，、。！？]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
  
  const words1 = new Set(normalize(title1));
  const words2 = new Set(normalize(title2));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// 批量去重工具 - 用于清理历史数据
export async function batchDeduplicate(personaId: string): Promise<{removed: number, kept: number}> {
  await ensureDbInitialized();
  const events = await db.events.where('personaId').equals(personaId).toArray();
  
  const fingerprintGroups = new Map<string, EventRec[]>();
  
  // 按指纹分组
  for (const event of events) {
    const fingerprint = computeFingerprint(event);
    if (!fingerprintGroups.has(fingerprint)) {
      fingerprintGroups.set(fingerprint, []);
    }
    fingerprintGroups.get(fingerprint)!.push(event);
  }
  
  let removed = 0;
  let kept = 0;
  
  // 处理每个指纹组
  for (const group of fingerprintGroups.values()) {
    if (group.length > 1) {
      // 保留最新的，删除其他
      group.sort((a, b) => b.createdAt - a.createdAt);
      const toDelete = group.slice(1).map(e => e.id);
      await MemoryRepo.removeEvents(toDelete);
      removed += toDelete.length;
      kept += 1;
    } else {
      kept += 1;
    }
  }
  
  console.log('[MM][batch-dedup]', { personaId, removed, kept });
  return { removed, kept };
}