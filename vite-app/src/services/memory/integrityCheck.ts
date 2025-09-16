// Memory Manager P3: parentEventId 完整性检查和修复工具
// 检查和修复孤儿事件、循环引用、无效父事件引用等问题

import { MemoryRepo } from './repo';
import type { EventRec } from './types';

export interface IntegrityReport {
  totalEvents: number;
  orphanEvents: EventRec[];          // 父事件不存在的子事件
  circularReferences: EventRec[];    // 循环引用的事件
  invalidParentRefs: EventRec[];     // parentEventId无效的事件
  multipleChildren: Map<string, EventRec[]>; // 有多个子事件的父事件
  repairActions: RepairAction[];
}

export interface RepairAction {
  type: 'remove_parent_ref' | 'delete_orphan' | 'break_cycle';
  eventId: string;
  description: string;
  originalParentId?: string;
}

export class MemoryIntegrityChecker {
  async checkAll(): Promise<IntegrityReport> {
    console.log('[MM][Integrity] 开始完整性检查...');

    const allEvents = await MemoryRepo.getAllEvents();
    console.log('[MM][Integrity] 加载了', allEvents.length, '个事件');

    const report: IntegrityReport = {
      totalEvents: allEvents.length,
      orphanEvents: [],
      circularReferences: [],
      invalidParentRefs: [],
      multipleChildren: new Map(),
      repairActions: []
    };

    // 创建事件映射表以便快速查找
    const eventMap = new Map<string, EventRec>();
    const childrenMap = new Map<string, EventRec[]>();

    for (const event of allEvents) {
      eventMap.set(event.id, event);

      // 建立父子关系映射
      if (event.parentEventId) {
        const children = childrenMap.get(event.parentEventId) || [];
        children.push(event);
        childrenMap.set(event.parentEventId, children);
      }
    }

    // 检查有多个子事件的父事件
    for (const [parentId, children] of childrenMap.entries()) {
      if (children.length > 1) {
        report.multipleChildren.set(parentId, children);
      }
    }

    // 检查所有有parentEventId的事件
    for (const event of allEvents) {
      if (!event.parentEventId) continue;

      // 检查父事件是否存在
      const parentEvent = eventMap.get(event.parentEventId);
      if (!parentEvent) {
        report.orphanEvents.push(event);
        report.repairActions.push({
          type: 'remove_parent_ref',
          eventId: event.id,
          description: `事件 "${event.title}" 的父事件 ${event.parentEventId} 不存在，建议移除父事件引用`,
          originalParentId: event.parentEventId
        });
        continue;
      }

      // 检查循环引用
      if (this.hasCircularReference(event.id, eventMap)) {
        report.circularReferences.push(event);
        report.repairActions.push({
          type: 'break_cycle',
          eventId: event.id,
          description: `事件 "${event.title}" 存在循环引用，建议断开父事件链接`,
          originalParentId: event.parentEventId
        });
      }
    }

    console.log('[MM][Integrity] 检查完成:', {
      orphans: report.orphanEvents.length,
      cycles: report.circularReferences.length,
      multipleChildren: report.multipleChildren.size
    });

    return report;
  }

  async checkPersona(personaId: string): Promise<IntegrityReport> {
    console.log('[MM][Integrity] 检查角色:', personaId);

    const events = await MemoryRepo.getEventsByPersona(personaId);
    const allEvents = await MemoryRepo.getAllEvents();

    const report: IntegrityReport = {
      totalEvents: events.length,
      orphanEvents: [],
      circularReferences: [],
      invalidParentRefs: [],
      multipleChildren: new Map(),
      repairActions: []
    };

    const eventMap = new Map<string, EventRec>();
    for (const event of allEvents) {
      eventMap.set(event.id, event);
    }

    for (const event of events) {
      if (!event.parentEventId) continue;

      const parentEvent = eventMap.get(event.parentEventId);
      if (!parentEvent) {
        report.orphanEvents.push(event);
        report.repairActions.push({
          type: 'remove_parent_ref',
          eventId: event.id,
          description: `事件 "${event.title}" 的父事件不存在`,
          originalParentId: event.parentEventId
        });
      } else if (parentEvent.personaId !== personaId) {
        report.invalidParentRefs.push(event);
        report.repairActions.push({
          type: 'remove_parent_ref',
          eventId: event.id,
          description: `事件 "${event.title}" 的父事件属于不同角色 (${parentEvent.personaId})`,
          originalParentId: event.parentEventId
        });
      } else if (this.hasCircularReference(event.id, eventMap)) {
        report.circularReferences.push(event);
        report.repairActions.push({
          type: 'break_cycle',
          eventId: event.id,
          description: `事件 "${event.title}" 存在循环引用`,
          originalParentId: event.parentEventId
        });
      }
    }

    return report;
  }

  private hasCircularReference(startEventId: string, eventMap: Map<string, EventRec>): boolean {
    const visited = new Set<string>();
    let currentId: string | undefined = startEventId;

    while (currentId) {
      if (visited.has(currentId)) {
        return true; // 发现循环
      }

      visited.add(currentId);
      const event = eventMap.get(currentId);
      currentId = event?.parentEventId;

      // 防止无限循环，设置最大深度
      if (visited.size > 100) {
        console.warn('[MM][Integrity] 检测到可能的深层次循环引用，停止检查');
        return true;
      }
    }

    return false;
  }

  async repairAll(report: IntegrityReport, options: RepairOptions = {}): Promise<RepairResult> {
    console.log('[MM][Integrity] 开始修复，操作数量:', report.repairActions.length);

    const result: RepairResult = {
      success: 0,
      failed: 0,
      actions: []
    };

    for (const action of report.repairActions) {
      try {
        await this.executeRepairAction(action, options);
        result.success++;
        result.actions.push({ ...action, status: 'success' });
        console.log('[MM][Integrity] 修复成功:', action.description);
      } catch (error) {
        result.failed++;
        result.actions.push({
          ...action,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        });
        console.error('[MM][Integrity] 修复失败:', action.description, error);
      }
    }

    console.log('[MM][Integrity] 修复完成:', {
      success: result.success,
      failed: result.failed
    });

    return result;
  }

  private async executeRepairAction(action: RepairAction, options: RepairOptions): Promise<void> {
    switch (action.type) {
      case 'remove_parent_ref':
        if (options.removeParentRefs !== false) {
          await MemoryRepo.updateEvent(action.eventId, {
            parentEventId: undefined,
            updatedAt: Date.now()
          });
        }
        break;

      case 'delete_orphan':
        if (options.deleteOrphans === true) {
          await MemoryRepo.removeEvents([action.eventId]);
        }
        break;

      case 'break_cycle':
        if (options.breakCycles !== false) {
          await MemoryRepo.updateEvent(action.eventId, {
            parentEventId: undefined,
            updatedAt: Date.now()
          });
        }
        break;

      default:
        throw new Error(`未知的修复操作类型: ${(action as any).type}`);
    }
  }

  generateReport(report: IntegrityReport): string {
    const lines: string[] = [];
    lines.push('=== Memory Integrity Check Report ===');
    lines.push(`总事件数量: ${report.totalEvents}`);
    lines.push('');

    if (report.orphanEvents.length > 0) {
      lines.push(`🔗 孤儿事件 (${report.orphanEvents.length}个):`);
      for (const event of report.orphanEvents) {
        lines.push(`  - ${event.id}: "${event.title}" -> ${event.parentEventId}`);
      }
      lines.push('');
    }

    if (report.circularReferences.length > 0) {
      lines.push(`🔄 循环引用 (${report.circularReferences.length}个):`);
      for (const event of report.circularReferences) {
        lines.push(`  - ${event.id}: "${event.title}" -> ${event.parentEventId}`);
      }
      lines.push('');
    }

    if (report.invalidParentRefs.length > 0) {
      lines.push(`❌ 无效父事件引用 (${report.invalidParentRefs.length}个):`);
      for (const event of report.invalidParentRefs) {
        lines.push(`  - ${event.id}: "${event.title}" -> ${event.parentEventId}`);
      }
      lines.push('');
    }

    if (report.multipleChildren.size > 0) {
      lines.push(`👥 多子事件父事件 (${report.multipleChildren.size}个):`);
      for (const [parentId, children] of report.multipleChildren.entries()) {
        lines.push(`  - ${parentId}: ${children.length}个子事件`);
        for (const child of children) {
          lines.push(`    * ${child.id}: "${child.title}"`);
        }
      }
      lines.push('');
    }

    if (report.repairActions.length > 0) {
      lines.push(`🔧 建议修复操作 (${report.repairActions.length}个):`);
      for (const action of report.repairActions) {
        lines.push(`  - ${action.type}: ${action.description}`);
      }
    }

    if (report.orphanEvents.length === 0 &&
        report.circularReferences.length === 0 &&
        report.invalidParentRefs.length === 0) {
      lines.push('✅ 所有parentEventId引用都是有效的！');
    }

    return lines.join('\n');
  }
}

export interface RepairOptions {
  removeParentRefs?: boolean;  // 默认true：移除无效的父事件引用
  deleteOrphans?: boolean;     // 默认false：删除孤儿事件
  breakCycles?: boolean;       // 默认true：断开循环引用
}

export interface RepairResult {
  success: number;
  failed: number;
  actions: (RepairAction & { status: 'success' | 'failed'; error?: string })[];
}

// 导出单例实例
export const memoryIntegrityChecker = new MemoryIntegrityChecker();

// 便捷函数
export async function checkMemoryIntegrity(): Promise<IntegrityReport> {
  return memoryIntegrityChecker.checkAll();
}

export async function checkPersonaIntegrity(personaId: string): Promise<IntegrityReport> {
  return memoryIntegrityChecker.checkPersona(personaId);
}

export async function repairMemoryIntegrity(report: IntegrityReport, options?: RepairOptions): Promise<RepairResult> {
  return memoryIntegrityChecker.repairAll(report, options);
}

export async function generateIntegrityReport(): Promise<string> {
  const report = await checkMemoryIntegrity();
  return memoryIntegrityChecker.generateReport(report);
}