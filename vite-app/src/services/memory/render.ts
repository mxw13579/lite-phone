// Memory Rendering Module
// 记忆模块渲染功能 - 格式化事件为文本、估算字符数等

import type { EventRec } from './types';

/**
 * 渲染事件为预览文本
 * @param event 事件对象
 * @param maxLength 最大长度（可选，默认100）
 * @returns 预览文本
 */
export function renderEventPreview(event: EventRec, maxLength: number = 100): string {
  if (!event) return '';

  const title = event.title || '';
  const content = event.content || '';

  // 组合标题和内容
  let preview = title;
  if (content && preview) {
    preview += ' - ' + content;
  } else if (content) {
    preview = content;
  }

  // 截断到指定长度
  if (preview.length > maxLength) {
    preview = preview.substring(0, maxLength - 3) + '...';
  }

  return preview;
}

/**
 * 渲染内存块为文本
 * @param events 事件列表
 * @param includeIds 是否包含事件ID
 * @returns 格式化的内存文本
 */
export function renderMemoryBlock(events: EventRec[], includeIds: boolean = true): string {
  if (!events || events.length === 0) {
    return '';
  }

  const sections: string[] = [];

  // 按状态分组
  const groups = groupEventsByStatus(events);

  // 渲染进行中的事件
  if (groups.open && groups.open.length > 0) {
    sections.push(renderEventGroup('📋 进行中', groups.open, includeIds));
  }

  // 渲染已完成的事件
  if (groups.done && groups.done.length > 0) {
    sections.push(renderEventGroup('✅ 已完成', groups.done, includeIds));
  }

  // 渲染笔记事件
  if (groups.note && groups.note.length > 0) {
    sections.push(renderEventGroup('📝 笔记', groups.note, includeIds));
  }

  // 渲染已取消的事件
  if (groups.cancelled && groups.cancelled.length > 0) {
    sections.push(renderEventGroup('❌ 已取消', groups.cancelled, includeIds));
  }

  return sections.join('\n\n');
}

/**
 * 渲染群组内存块
 * @param globalEvents 全局事件
 * @param perPersonaEvents 每个角色的事件
 * @param includeIds 是否包含ID
 * @returns 格式化的群组内存文本
 */
export function renderGroupMemoryBlock(
  globalEvents: EventRec[],
  perPersonaEvents: Record<string, EventRec[]>,
  includeIds: boolean = true,
  personaNameMap?: Record<string, string>
): string {
  const sections: string[] = [];

  // 渲染全局重要事件
  if (globalEvents && globalEvents.length > 0) {
    sections.push('🌟 群聊重点事件:');
    sections.push(renderMemoryBlock(globalEvents, includeIds));
  }

  // 渲染每个角色的事件
  Object.entries(perPersonaEvents).forEach(([personaId, events]) => {
    if (events && events.length > 0) {
      const displayName = personaNameMap?.[personaId] || personaId;
      sections.push(`👤 ${displayName} 的记忆:`);
      sections.push(renderMemoryBlock(events, includeIds));
    }
  });

  return sections.join('\n\n');
}

/**
 * 估算渲染后的字符数
 * @param events 事件列表
 * @param includeIds 是否包含ID
 * @returns 字符数估算
 */
export function estimateRenderedChars(events: EventRec[], includeIds: boolean = true): number {
  if (!events || events.length === 0) return 0;

  const rendered = renderMemoryBlock(events, includeIds);
  return rendered.length;
}

/**
 * 验证事件是否可以被渲染
 * @param event 事件对象
 * @returns 是否可以渲染
 */
export function validateEventForRender(event: EventRec): boolean {
  if (!event) return false;
  if (!event.id || !event.personaId) return false;
  if (!event.title && !event.content) return false;
  return true;
}

// === 私有辅助函数 ===

/**
 * 按状态分组事件
 */
function groupEventsByStatus(events: EventRec[]): Record<string, EventRec[]> {
  const groups: Record<string, EventRec[]> = {
    open: [],
    done: [],
    note: [],
    cancelled: []
  };

  events.forEach(event => {
    if (groups[event.status]) {
      groups[event.status].push(event);
    }
  });

  return groups;
}

/**
 * 渲染单个事件组
 */
function renderEventGroup(title: string, events: EventRec[], includeIds: boolean): string {
  const lines: string[] = [title];

  events.forEach((event, index) => {
    let line = `${index + 1}. `;

    if (includeIds) {
      line += `[${event.id.substring(0, 8)}] `;
    }

    if (event.title) {
      line += event.title;
    }

    if (event.content && event.content !== event.title) {
      line += ` - ${event.content}`;
    }

    if (event.dueAt) {
      const dueDate = new Date(event.dueAt).toLocaleDateString();
      line += ` (截止: ${dueDate})`;
    }

    // 行尾追加事件标识，便于 MCP 在完成闭环时精确关联父事件
    if (includeIds && event.id) {
      line += ` #evt:${event.id}`;
    }

    lines.push(line);
  });

  return lines.join('\n');
}