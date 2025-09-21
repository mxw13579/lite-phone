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
 * @param context 可选的渲染上下文（用于模板变量替换）
 * @returns 格式化的内存文本
 */
export function renderMemoryBlock(
  events: EventRec[],
  includeIds: boolean = true,
  context?: { userName?: string; personaNameMap?: Record<string, string> }
): string {
  if (!events || events.length === 0) {
    return '';
  }

  const sections: string[] = [];

  // 按状态分组
  const groups = groupEventsByStatus(events);

  // 渲染进行中的事件
  if (groups.open && groups.open.length > 0) {
    sections.push(renderEventGroup('📋 进行中', groups.open, includeIds, context));
  }

  // 渲染已完成的事件
  if (groups.done && groups.done.length > 0) {
    sections.push(renderEventGroup('✅ 已完成', groups.done, includeIds, context));
  }

  // 渲染笔记事件
  if (groups.note && groups.note.length > 0) {
    sections.push(renderEventGroup('📝 笔记', groups.note, includeIds, context));
  }

  // 渲染已取消的事件
  if (groups.cancelled && groups.cancelled.length > 0) {
    sections.push(renderEventGroup('❌ 已取消', groups.cancelled, includeIds, context));
  }

  return sections.join('\n\n');
}

/**
 * 渲染群组内存块
 * @param globalEvents 全局事件
 * @param perPersonaEvents 每个角色的事件
 * @param includeIds 是否包含ID
 * @param personaNameMap 角色ID到名称的映射
 * @param userName 用户名称
 * @returns 格式化的群组内存文本
 */
export function renderGroupMemoryBlock(
  globalEvents: EventRec[],
  perPersonaEvents: Record<string, EventRec[]>,
  includeIds: boolean = true,
  personaNameMap?: Record<string, string>,
  userName?: string
): string {
  const sections: string[] = [];

  // 渲染全局重要事件
  if (globalEvents && globalEvents.length > 0) {
    sections.push('🌟 群聊重点事件:');
    sections.push(renderMemoryBlock(globalEvents, includeIds, { userName, personaNameMap }));
  }

  // 渲染每个角色的事件
  Object.entries(perPersonaEvents).forEach(([personaId, events]) => {
    if (events && events.length > 0) {
      const displayName = personaNameMap?.[personaId] || personaId;
      sections.push(`👤 ${displayName} 的记忆:`);
      sections.push(renderMemoryBlock(events, includeIds, { userName, personaNameMap }));
    }
  });

  return sections.join('\n\n');
}

/**
 * 估算渲染后的字符数
 * @param events 事件列表
 * @param includeIds 是否包含ID
 * @param context 可选的渲染上下文
 * @returns 字符数估算
 */
export function estimateRenderedChars(
  events: EventRec[],
  includeIds: boolean = true,
  context?: { userName?: string; personaNameMap?: Record<string, string> }
): number {
  if (!events || events.length === 0) return 0;

  const rendered = renderMemoryBlock(events, includeIds, context);
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
function renderEventGroup(
  title: string,
  events: EventRec[],
  includeIds: boolean,
  context?: { userName?: string; personaNameMap?: Record<string, string> }
): string {
  const lines: string[] = [title];

  events.forEach((event, index) => {
    let line = `${index + 1}. `;

    if (includeIds) {
      line += `[${event.id.substring(0, 8)}] `;
    }

    // 使用模板渲染获取显示文本
    const userName = context?.userName || '用户';
    const personaName = context?.personaNameMap?.[event.personaId] || event.personaId;
    const { title: displayTitle, content: displayContent } = getEventDisplayText(event, userName, personaName);

    if (displayTitle) {
      line += displayTitle;
    }

    if (displayContent && displayContent !== displayTitle) {
      line += ` - ${displayContent}`;
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

/**
 * 解析事件文本模板，替换{USER}/{PERSONA}变量
 * @param text 原始文本
 * @param template 可选模板文本
 * @param userName 用户名称
 * @param personaName 角色名称
 * @returns 解析后的文本
 */
export function resolveEventText(
  text: string,
  template: string | undefined,
  userName: string = '用户',
  personaName: string = 'AI'
): string {
  // 如果没有模板，返回原始文本
  if (!template) {
    return text;
  }

  // 替换模板中的变量
  let resolved = template;
  resolved = resolved.replace(/\{USER\}/g, userName);
  resolved = resolved.replace(/\{PERSONA\}/g, personaName);

  return resolved;
}

/**
 * 获取事件的最终显示文本（考虑模板）
 * @param event 事件对象
 * @param userName 用户名称
 * @param personaName 角色名称
 * @returns 解析后的标题和内容
 */
export function getEventDisplayText(
  event: EventRec,
  userName: string = '用户',
  personaName: string = 'AI'
): { title: string; content: string } {
  const title = resolveEventText(event.title, event.titleTpl, userName, personaName);
  const content = resolveEventText(event.content, event.contentTpl, userName, personaName);

  return { title, content };
}