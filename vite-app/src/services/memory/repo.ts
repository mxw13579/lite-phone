import { db, ensureDbInitialized } from '../../database';
import Dexie from 'dexie';
import type { EventRec, MemoryType, PersonaMemorySettings } from './types';

const TITLE_MAX = 80;
const CONTENT_MAX = 300;
const ARR_MAX = 8;
const WINDOW_7D = 7 * 24 * 60 * 60 * 1000;

// 若 schema 已定义 [personaId+createdAt]，可设为 true 以启用高效路径
const USE_PERSONA_CREATEDAT_INDEX = false;

// Dexie 范围端点（回退到 +-Infinity 以兼容环境）
const MIN_KEY: any = (Dexie as any).minKey ?? -Infinity;
const MAX_KEY: any = (Dexie as any).maxKey ?? Infinity;

async function ensure() { await ensureDbInitialized(); }

// ---------- 清洗工具 ----------
function truncateStr(v: unknown, max: number): string | undefined {
  if (v == null) return undefined;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}
function clampArr<T>(arr: T[] | undefined, max: number): T[] | undefined {
  if (!arr) return undefined;
  return arr.length > max ? arr.slice(0, max) : arr;
}
function sanitizeEvent(e: EventRec): EventRec {
  return {
    ...e,
    title: truncateStr(e.title, TITLE_MAX) ?? '',
    content: truncateStr(e.content, CONTENT_MAX) ?? '',
    participants: clampArr(e.participants, ARR_MAX),
    tags: clampArr(e.tags, ARR_MAX),
  };
}
function sanitizePatch(patch: Partial<EventRec>): Partial<EventRec> {
  const out: Partial<EventRec> = { ...patch };
  if (out.title != null) out.title = truncateStr(out.title, TITLE_MAX);
  if (out.content != null) out.content = truncateStr(out.content, CONTENT_MAX);
  if (out.participants != null) out.participants = clampArr(out.participants, ARR_MAX);
  if (out.tags != null) out.tags = clampArr(out.tags, ARR_MAX);
  return out;
}

// ---------- 规范化与哈希 ----------
function normalizeTitle(title: string): string {
  return title.toLowerCase()
      .replace(/[\s\u3000]+/g, ' ')
      .replace(/[，、。\.\-_/！？!?]+/g, ' ')
      .replace(/\d{4}-\d{2}-\d{2}/g, 'DATE')
      .replace(/\d+/g, 'NUM')
      .trim();
}

// FNV-1a 32-bit
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash >>> 0) * 0x01000193;
    hash >>>= 0;
  }
  return hash >>> 0;
}

export function computeFingerprint(event: { personaId: string, typeKey: string, title: string, participants?: string[] }): string {
  const titleNorm = normalizeTitle(event.title).slice(0, 64);
  const participantsSet = (event.participants || []).slice().sort().join('|');
  const raw = `${event.personaId}|${event.typeKey}|${titleNorm}|${participantsSet}`;
  return fnv1a32(raw).toString(36).slice(0, 12);
}

// ---------- 相似度 ----------
function shingles(str: string, k = 5): Set<string> {
  const s = str.toLowerCase().replace(/\s+/g, ' ').trim();
  if (s.length <= k) return new Set([s]);
  const set = new Set<string>();
  for (let i = 0; i <= s.length - k; i++) set.add(s.slice(i, i + k));
  return set;
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const v of small) if (large.has(v)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}
function calculateContentSimilarity(c1: string, c2: string): number {
  return jaccard(shingles(c1, 5), shingles(c2, 5));
}
function calculateTitleSimilarity(t1: string, t2: string): number {
  const norm = (s: string) =>
      s.toLowerCase().replace(/[，、。！？]/g, ' ').split(/\s+/).filter(Boolean);
  return jaccard(new Set(norm(t1)), new Set(norm(t2)));
}

// ---------- 仓储 ----------
export const MemoryRepo = {
  async getEventsByPersona(personaId: string): Promise<EventRec[]> {
    await ensure();
    return db.events.where('personaId').equals(personaId).sortBy('createdAt');
  },

  async getOpenByPersona(personaId: string): Promise<EventRec[]> {
    await ensure();
    return db.events.where('[personaId+status]').equals([personaId, 'open']).toArray();
  },

  async getOldDoneOrNote(personaId: string, before: number, limit: number): Promise<EventRec[]> {
    await ensure();
    const doneQ = db.events.where('[personaId+status]').equals([personaId, 'done'])
        .and(e => (e.updatedAt ?? e.createdAt) < before);
    const noteQ = db.events.where('[personaId+status]').equals([personaId, 'note'])
        .and(e => e.createdAt < before);

    const [doneArr, noteArr] = await Promise.all([doneQ.toArray(), noteQ.toArray()]);
    const mapTime = (e: EventRec) => (e.status === 'done' ? (e.updatedAt ?? e.createdAt) : e.createdAt);

    doneArr.sort((a, b) => mapTime(a) - mapTime(b));
    noteArr.sort((a, b) => mapTime(a) - mapTime(b));

    const res: EventRec[] = [];
    let i = 0, j = 0;
    while (res.length < limit && (i < doneArr.length || j < noteArr.length)) {
      const next =
          j >= noteArr.length ? doneArr[i++] :
              i >= doneArr.length ? noteArr[j++] :
                  (mapTime(doneArr[i]) <= mapTime(noteArr[j]) ? doneArr[i++] : noteArr[j++]);
      res.push(next);
    }
    return res;
  },

  async addEvent(e: EventRec): Promise<string> {
    await ensure();
    return db.events.put(sanitizeEvent(e));
  },

  async getEventById(id: string): Promise<EventRec | undefined> {
    await ensure();
    return db.events.get(id);
  },

  async updateEvent(id: string, patch: Partial<EventRec>): Promise<void> {
    await ensure();
    await db.events.update(id, { ...sanitizePatch(patch), updatedAt: Date.now() });
  },

  async tx<T>(fn: () => Promise<T>): Promise<T> {
    await ensure();
    return db.transaction('rw', db.events, fn);
  },

  async getTypeRegistry(): Promise<MemoryType[]> {
    await ensure();
    return db.memory_types.toArray();
  },

  async saveType(t: MemoryType): Promise<void> {
    await ensure();
    await db.memory_types.put(t);
  },

  async getSettings(personaId: string): Promise<PersonaMemorySettings> {
    await ensure();
    const settings = await db.memory_settings.get(personaId);
    return settings ?? {
      personaId,
      maxEvents: 50,
      overflowPolicy: 'compress_oldest',
      compressBatchSize: 10,
    };
  },

  async saveSettings(s: PersonaMemorySettings): Promise<void> {
    await ensure();
    await db.memory_settings.put(s);
  },

  async getDueSoonByPersona(personaId: string, now: number): Promise<EventRec[]> {
    await ensure();
    const end = now + WINDOW_7D;
    return db.events
        .where('[personaId+dueAt]')
        .between([personaId, now], [personaId, end], true, true)
        .toArray();
  },

  async getRecentByPersona(personaId: string, limit = 20): Promise<EventRec[]> {
    await ensure();
    if (USE_PERSONA_CREATEDAT_INDEX) {
      return db.events
          .where('[personaId+createdAt]')
          .between([personaId, MIN_KEY], [personaId, MAX_KEY])
          .reverse()
          .limit(limit)
          .toArray();
    }
    return db.events
        .where('personaId').equals(personaId)
        .sortBy('createdAt')
        .then(events => events.slice(-limit).reverse());
  },

  async removeEvents(ids: string[]): Promise<void> {
    await ensure();
    if (!ids?.length) return;
    await db.events.bulkDelete(ids);
  }
};

// ---------- 去重与近重复 ----------
export async function deduplicateEvents(personaId: string, typeKey: string, title: string): Promise<void> {
  await ensure();
  const normalizedTitle = normalizeTitle(title);
  const sevenDaysAgo = Date.now() - WINDOW_7D;

  const candidates = await db.events
      .where('personaId').equals(personaId)
      .and(e => e.typeKey === typeKey && e.createdAt > sevenDaysAgo)
      .toArray();

  const duplicates = candidates.filter(e => normalizeTitle(e.title) === normalizedTitle);
  if (duplicates.length <= 1) return;

  duplicates.sort((a, b) => b.createdAt - a.createdAt);
  const toDelete = duplicates.slice(1).map(e => e.id);
  await MemoryRepo.removeEvents(toDelete);
}

export async function checkNearDuplicates(personaId: string, event: Partial<EventRec>): Promise<{ isDuplicate: boolean, reason?: string }> {
  if (!event.title) return { isDuplicate: false };

  await ensure();
  const sevenDaysAgo = Date.now() - WINDOW_7D;
  const titleNormNew = normalizeTitle(event.title);

  const recent = await db.events
      .where('personaId').equals(personaId)
      .and(e => e.createdAt > sevenDaysAgo)
      .toArray();

  for (const existing of recent) {
    // 标题完全相同（归一化后）
    if (normalizeTitle(existing.title) === titleNormNew) {
      return { isDuplicate: true, reason: 'title_exact' };
    }
    // 标题高相似度（快路径）
    if (calculateTitleSimilarity(existing.title, event.title!) >= 0.85) {
      return { isDuplicate: true, reason: 'title_similar' };
    }
    // 修复：与新事件内容比较，而非 existing 与自身
    if (event.content && existing.content &&
        calculateContentSimilarity(existing.content, event.content) >= 0.8) {
      return { isDuplicate: true, reason: 'content_similar' };
    }
  }
  return { isDuplicate: false };
}

export async function batchDeduplicate(personaId: string): Promise<{ removed: number, kept: number }> {
  await ensure();
  const events = await db.events.where('personaId').equals(personaId).toArray();

  const groups = new Map<string, EventRec[]>();
  for (const e of events) {
    const fp = computeFingerprint(e);
    const arr = groups.get(fp);
    if (arr) arr.push(e);
    else groups.set(fp, [e]);
  }

  let removed = 0;
  let kept = 0;

  for (const group of groups.values()) {
    if (group.length > 1) {
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
