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

// 便捷API
import { MemoryRepo } from './repo';
import { selectEventsForPrompt } from './select';
import { renderMemoryBlock } from './render';
import type { SelectBudget } from './types';

export class MemoryManager {
  static async getMemoryForChat(
    personaId: string, 
    budget: SelectBudget, 
    includeIds = true
  ): Promise<string> {
    const events = await selectEventsForPrompt(MemoryRepo, personaId, budget);
    return renderMemoryBlock(events, includeIds);
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