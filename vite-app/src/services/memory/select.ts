import type { EventRec, SelectBudget } from './types';
import { MemoryRepo } from './repo';

export function estimateChars(texts: string[]): number {
  return texts.reduce((n, t) => n + (t?.length || 0), 0);
}

export function estimateTokensRough(texts: string[]): number {
  return Math.ceil(estimateChars(texts) / 4);
}

export function estimateEventChars(event: EventRec): number {
  const titleChars = event.title?.length || 0;
  const contentChars = event.content?.length || 0;
  const metadataChars = 16; // 日期和格式字符的粗略估算
  return titleChars + contentChars + metadataChars;
}

export async function selectEventsForPrompt(
  repo: typeof MemoryRepo, 
  personaId: string, 
  budget: SelectBudget, 
  now = Date.now()
): Promise<EventRec[]> {
  
  const all = (await repo.getEventsByPersona(personaId)).filter(e => !e.excludeFromPrompt);
  
  // 按优先级分组
  const open = all.filter(e => e.status === 'open');
  const dueSoon = open.filter(e => e.dueAt && e.dueAt > now)
    .sort((a, b) => (a.dueAt! - b.dueAt!)); // 最近到期的优先
  const openNoDue = open.filter(e => !e.dueAt);
  const done = all.filter(e => e.status === 'done')
    .sort((a, b) => b.createdAt - a.createdAt); // 最新完成的优先
  const note = all.filter(e => e.status === 'note')
    .sort((a, b) => b.createdAt - a.createdAt); // 最新笔记优先
  const cancelled = all.filter(e => e.status === 'cancelled')
    .sort((a, b) => b.createdAt - a.createdAt);
  
  // 排序：进行中(临期→无到期) → 已完成 → 笔记 → 已取消
  const ordered = [...dueSoon, ...openNoDue, ...done, ...note, ...cancelled];
  
  const picked: EventRec[] = [];
  let totalChars = 0;
  
  for (const event of ordered) {
    const eventChars = estimateEventChars(event);
    
    // 检查预算约束
    if (budget.topN && picked.length >= budget.topN) {
      break;
    }
    if (totalChars + eventChars > budget.maxChars) {
      break;
    }
    
    picked.push(event);
    totalChars += eventChars;
  }
  
  return picked;
}

// 组聊预算分配
export function allocateBudget(maxChars: number, personaIds: string[]): Map<string | '_global', number> {
  if (personaIds.length <= 1) {
    return new Map([[personaIds[0] ?? '_global', maxChars]]);
  }
  
  const global = Math.floor(maxChars * 0.4);
  const rest = maxChars - global;
  const per = Math.ceil(rest / personaIds.length);
  
  const out = new Map<string | '_global', number>([['_global', global]]);
  personaIds.forEach(id => out.set(id, per));
  
  return out;
}

// 组聊选择逻辑
export async function selectEventsForGroup(
  repo: typeof MemoryRepo, 
  personaIds: string[], 
  maxChars: number,
  now = Date.now()
): Promise<{ global: EventRec[]; perPersona: Record<string, EventRec[]> }> {
  
  const budget = allocateBudget(maxChars, personaIds);
  const global: EventRec[] = [];
  const perPersona: Record<string, EventRec[]> = {};
  
  // 全局优先：收集所有persona的进行中和临期事件
  const globalBudget = budget.get('_global') || 0;
  if (globalBudget > 0) {
    const allOpenEvents: EventRec[] = [];
    
    for (const personaId of personaIds) {
      const openEvents = await repo.getOpenByPersona(personaId);
      const dueSoonEvents = await repo.getDueSoonByPersona(personaId, now);
      allOpenEvents.push(...openEvents, ...dueSoonEvents);
    }
    
    // 去重并按重要度排序
    const uniqueGlobalEvents = Array.from(
      new Map(allOpenEvents.map(e => [e.id, e])).values()
    ).sort((a, b) => {
      // 临期优先，然后按创建时间
      if (a.dueAt && b.dueAt) return a.dueAt - b.dueAt;
      if (a.dueAt && !b.dueAt) return -1;
      if (!a.dueAt && b.dueAt) return 1;
      return b.createdAt - a.createdAt;
    });
    
    // 按全局预算选择
    let globalChars = 0;
    for (const event of uniqueGlobalEvents) {
      const eventChars = estimateEventChars(event);
      if (globalChars + eventChars > globalBudget) break;
      global.push(event);
      globalChars += eventChars;
    }
  }
  
  // 为每个persona分配剩余预算
  for (const personaId of personaIds) {
    const personaBudget = budget.get(personaId) || 0;
    if (personaBudget <= 0) continue;
    
    const events = await selectEventsForPrompt(repo, personaId, { maxChars: personaBudget }, now);
    // 排除已在全局中选择的事件
    const globalIds = new Set(global.map(e => e.id));
    perPersona[personaId] = events.filter(e => !globalIds.has(e.id));
  }
  
  return { global, perPersona };
}

// 预算检查和建议
export interface BudgetEstimate {
  estimatedChars: number;
  estimatedTokens: number;
  exceedsLimit: boolean;
  suggestedActions?: string[];
}

export function estimateInjectionBudget(events: EventRec[], budget: SelectBudget): BudgetEstimate {
  const estimatedChars = events.reduce((total, e) => total + estimateEventChars(e), 0);
  const estimatedTokens = estimateTokensRough([events.map(e => e.title + e.content).join('')]);
  const exceedsLimit = estimatedChars > budget.maxChars;
  
  const result: BudgetEstimate = {
    estimatedChars,
    estimatedTokens,
    exceedsLimit
  };
  
  if (exceedsLimit) {
    result.suggestedActions = [];
    
    const overageChars = estimatedChars - budget.maxChars;
    const percentageOver = Math.round((overageChars / budget.maxChars) * 100);
    
    if (percentageOver > 50) {
      result.suggestedActions.push('考虑压缩早期事件');
      result.suggestedActions.push('增加预算上限');
    } else if (percentageOver > 20) {
      result.suggestedActions.push('排除部分非关键事件');
      result.suggestedActions.push('使用更严格的TopN限制');
    } else {
      result.suggestedActions.push('排除1-2个最长的事件');
    }
  }
  
  return result;
}