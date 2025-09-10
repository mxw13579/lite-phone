import type { EventRec } from './types';

const toDate = (ts?: number) => ts ? new Date(ts).toLocaleDateString('zh-CN') : '';

const toDueStatus = (event: EventRec, now = Date.now()) => {
  if (!event.dueAt) return '';
  
  const dueDate = new Date(event.dueAt);
  const today = new Date(now);
  const diffDays = Math.ceil((event.dueAt - now) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return '(已逾期)';
  if (diffDays === 0) return '(今日到期)';
  if (diffDays === 1) return '(明日到期)';
  if (diffDays <= 3) return `(${diffDays}天后到期)`;
  return '';
};

export function renderMemoryBlock(events: EventRec[], includeIds = true): string {
  if (!events || events.length === 0) return '';
  
  const open = events.filter(e => e.status === 'open');
  const done = events.filter(e => e.status === 'done');
  const note = events.filter(e => e.status === 'note');
  const cancelled = events.filter(e => e.status === 'cancelled');
  
  const toLines = (arr: EventRec[]) => 
    arr.map(e => {
      const date = toDate(e.createdAt);
      const dueStatus = e.status === 'open' ? toDueStatus(e) : '';
      const title = e.title || '';
      const content = e.content ? `：${e.content}` : '';
      const eventId = includeIds && e.id ? ` #evt:${e.id}` : '';
      
      return `- ${date} ${title}${content}${dueStatus}${eventId}`;
    }).join('\n');
  
  let out = '';
  
  if (open.length) {
    out += `\n[事件记忆·进行中]\n${toLines(open)}\n`;
  }
  
  if (done.length) {
    out += `\n[事件记忆·已完成]\n${toLines(done)}\n`;
  }
  
  if (note.length) {
    out += `\n[事件记忆·笔记]\n${toLines(note)}\n`;
  }
  
  if (cancelled.length) {
    out += `\n[事件记忆·已取消]\n${toLines(cancelled)}\n`;
  }
  
  return out.trim();
}

export function renderGroupMemoryBlock(
  globalEvents: EventRec[], 
  perPersona: Record<string, EventRec[]>, 
  personaNameMap: Record<string, string>,
  includeIds = true
): string {
  let out = '';
  
  // 全局事件段
  if (globalEvents.length) {
    out += renderMemoryBlock(globalEvents, includeIds);
  }
  
  // 每个persona的事件段
  for (const [personaId, events] of Object.entries(perPersona)) {
    if (!events?.length) continue;
    
    const personaName = personaNameMap[personaId] || personaId;
    const personaBlock = renderPersonaEventsOnly(events, includeIds);
    
    if (personaBlock.trim()) {
      out += `\n\n[事件记忆·${personaName}]\n${personaBlock}`;
    }
  }
  
  return out.trim();
}

// 仅渲染事件列表，不包含分段标题（用于组聊中的个人段落）
function renderPersonaEventsOnly(events: EventRec[], includeIds = true): string {
  if (!events || events.length === 0) return '';
  
  // 按状态和时间排序，但不分段
  const sortedEvents = events.sort((a, b) => {
    // 优先级：open > done > note > cancelled
    const statusPriority: Record<string, number> = { 'open': 0, 'done': 1, 'note': 2, 'cancelled': 3 };
    const aPriority = statusPriority[a.status] ?? 4;
    const bPriority = statusPriority[b.status] ?? 4;
    
    if (aPriority !== bPriority) return aPriority - bPriority;
    
    // 同状态按创建时间排序
    if (a.status === 'open' && a.dueAt && b.status === 'open' && b.dueAt) {
      return a.dueAt - b.dueAt; // 临期的优先
    }
    
    return b.createdAt - a.createdAt; // 最新的优先
  });
  
  return sortedEvents.map(e => {
    const date = toDate(e.createdAt);
    const dueStatus = e.status === 'open' ? toDueStatus(e) : '';
    const title = e.title || '';
    const content = e.content ? `：${e.content}` : '';
    const eventId = includeIds && e.id ? ` #evt:${e.id}` : '';
    const statusPrefix = getStatusPrefix(e.status);
    
    return `- ${date} ${statusPrefix}${title}${content}${dueStatus}${eventId}`;
  }).join('\n');
}

function getStatusPrefix(status: string): string {
  switch (status) {
    case 'open': return '进行：';
    case 'done': return '完成：';
    case 'note': return '笔记：';
    case 'cancelled': return '取消：';
    default: return '';
  }
}

// 预览渲染（用于UI显示，不包含eventId）
export function renderEventPreview(event: EventRec, maxLength = 100): string {
  const date = toDate(event.createdAt);
  const dueStatus = event.status === 'open' ? toDueStatus(event) : '';
  const statusPrefix = getStatusPrefix(event.status);
  const title = event.title || '';
  const content = event.content || '';
  
  let preview = `${date} ${statusPrefix}${title}`;
  if (content && preview.length < maxLength - 10) {
    const remainingLength = maxLength - preview.length - 3; // 留3个字符给省略号
    if (content.length > remainingLength) {
      preview += `：${content.slice(0, remainingLength)}...`;
    } else {
      preview += `：${content}`;
    }
  }
  
  if (dueStatus) {
    preview += dueStatus;
  }
  
  return preview;
}

// 计算渲染后的字符数（用于预算估算）
export function estimateRenderedChars(events: EventRec[], includeIds = true): number {
  return renderMemoryBlock(events, includeIds).length;
}

// 验证事件是否适合渲染
export function validateEventForRender(event: EventRec): { valid: boolean; issues?: string[] } {
  const issues: string[] = [];
  
  if (!event.title && !event.content) {
    issues.push('事件标题和内容都为空');
  }
  
  if (event.title && event.title.length > 80) {
    issues.push('标题过长');
  }
  
  if (event.content && event.content.length > 300) {
    issues.push('内容过长');
  }
  
  if (event.status === 'open' && event.dueAt && event.dueAt < Date.now() - 30 * 24 * 60 * 60 * 1000) {
    issues.push('进行中事件已逾期超过30天');
  }
  
  return {
    valid: issues.length === 0,
    issues: issues.length > 0 ? issues : undefined
  };
}