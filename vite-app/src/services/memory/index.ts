// Memory Manager 模块统一入口
// 提供记忆管理的完整API接口

export * from './types';
export {
  MemoryRepo,
  deduplicateEvents,
  checkNearDuplicates,
  computeFingerprint,
  batchDeduplicate
} from './repo';
export {
  selectEventsForPrompt,
  selectEventsForGroup,
  allocateBudget,
  estimateChars,
  estimateTokensRough,
  estimateEventChars,
  estimateInjectionBudget
} from './select';
export {
  renderMemoryBlock,
  renderGroupMemoryBlock,
  renderEventPreview,
  estimateRenderedChars,
  validateEventForRender
} from './render';
export {
  maybeExtractAndRecord,
  compressOldEvents,
  autoCompressPersonaEvents,
  completeEvent
} from './mcp';

// P2: 聊天设置中的记忆预估功能
export { chatMemoryEstimator, ChatMemoryEstimator } from './chatEstimator';

// P3: 完整性检查和修复工具
export {
  memoryIntegrityChecker,
  MemoryIntegrityChecker,
  checkMemoryIntegrity,
  checkPersonaIntegrity,
  repairMemoryIntegrity,
  generateIntegrityReport
} from './integrityCheck';
export type {
  IntegrityReport,
  RepairAction,
  RepairOptions,
  RepairResult
} from './integrityCheck';

// P4: 代码格式和安全规范工具
export {
  codeFormatter,
  CodeFormatter,
  analyzeMemoryModule,
  generateStyleGuide
} from './codeFormatter';
export type {
  CodeIssue,
  FormatOptions
} from './codeFormatter';

// 便捷API
import { MemoryRepo } from './repo';
import { selectEventsForPrompt } from './select';
import { renderMemoryBlock } from './render';
import STATE from '../../state';
import type { SelectBudget } from './types';

export class MemoryManager {
  static async getMemoryForChat(
    personaId: string,
    budget: SelectBudget,
    includeIds = true
  ): Promise<string> {
    const events = await selectEventsForPrompt(MemoryRepo, personaId, budget);
    // 传入上下文以启用模板渲染（{USER}/{PERSONA}）
    let userName = '用户';
    try {
      const roles = (STATE.state?.userRoles as any[]) || [];
      const defaultUserRole = roles.find((r: any) => r && r.isGlobalDefault);
      if (defaultUserRole?.name) userName = defaultUserRole.name;
    } catch {}

    let personaName = personaId;
    try {
      const personas = (STATE.state?.personas as any[]) || [];
      const p = personas.find((x: any) => x && x.id === personaId);
      if (p?.name) personaName = p.name;
    } catch {}

    const context = { userName, personaNameMap: { [personaId]: personaName } };
    return renderMemoryBlock(events, includeIds, context);
  }

  static async getEventCount(personaId: string): Promise<number> {
    const events = await MemoryRepo.getEventsByPersona(personaId);
    return events.length;
  }

  static async getOpenEventCount(personaId: string): Promise<number> {
    const openEvents = await MemoryRepo.getOpenByPersona(personaId);
    return openEvents.length;
  }
}
