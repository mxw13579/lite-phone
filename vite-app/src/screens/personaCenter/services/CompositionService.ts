// Prompt合成服务
// 实现Persona的System Prompt合成和UserRole注入功能

import type { 
  Persona, 
  UserRole, 
  CompositionConfig, 
  DEFAULT_COMPOSITION_CONFIG 
} from '../types/PersonaTypes.js';

import type { WorldBook } from '../../../state/index.js';

export class CompositionService {
  // 合成System Prompt
  composeSystemPrompt(
    persona: Persona,
    worldBooks: Record<string, WorldBook>,
    memoryPack?: string,
    config: Partial<CompositionConfig> = {}
  ): string {
    const finalConfig = { ...DEFAULT_COMPOSITION_CONFIG, ...config };
    const parts: string[] = [];

    // 辅助函数：添加段落
    const addSection = (title: string, content?: string) => {
      if (!content?.trim()) return;
      
      if (finalConfig.showSectionTitles) {
        parts.push(`[${title}]`);
      }
      parts.push(content.trim());
    };

    // 1. System Prompt (必有)
    addSection('System', persona.prompt.system);

    // 2. Safety Prompt (可选)
    addSection('Safety', persona.prompt.safety);

    // 3. Style Prompt (可选) 
    addSection('Style', persona.prompt.style);

    // 4. WorldBook 内容（按order排序，仅启用的）
    if (persona.worldBookLinks && persona.worldBookLinks.length > 0) {
      const enabledLinks = persona.worldBookLinks
        .filter(link => link.enabled)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      if (enabledLinks.length > 0) {
        const worldBookTexts = enabledLinks
          .map(link => {
            const worldBook = worldBooks[link.worldBookId];
            if (!worldBook) return null;
            
            if (finalConfig.includeWorldBookTitles) {
              return `# ${worldBook.name}\n${worldBook.content}`;
            }
            return worldBook.content;
          })
          .filter(text => text !== null);

        if (worldBookTexts.length > 0) {
          const combinedWorldBookText = worldBookTexts.join(`\n${finalConfig.separator}\n`);
          addSection('WorldBook', combinedWorldBookText);
        }
      }
    }

    // 5. Memory Context (仅在发送时或预览配置启用时添加)
    if (memoryPack && (finalConfig.previewIncludeMemory || finalConfig.runtimeMode === 'send')) {
      // 应用token预算限制
      let finalMemoryPack = memoryPack;
      if (finalConfig.memoryTokenBudget > 0) {
        // 简单的token近似：4个字符约等于1个token
        const maxChars = finalConfig.memoryTokenBudget * 4;
        if (memoryPack.length > maxChars) {
          finalMemoryPack = '...' + memoryPack.slice(-(maxChars - 3));
        }
      }
      addSection('Memory', finalMemoryPack);
    }

    // 拼接所有段落
    return parts.join(`\n${finalConfig.separator}\n`);
  }

  // 注入UserRole块
  injectUserRoleBlock(
    userRole?: UserRole,
    config: Partial<CompositionConfig> = {}
  ): string | undefined {
    if (!userRole) return undefined;

    const finalConfig = { ...DEFAULT_COMPOSITION_CONFIG, ...config };
    const lines: string[] = [];

    if (finalConfig.showSectionTitles) {
      lines.push('[User Role]');
    }

    lines.push(`角色名: ${userRole.name}`);

    if (userRole.prompt.style?.trim()) {
      lines.push(`风格: ${userRole.prompt.style.trim()}`);
    }

    if (userRole.prompt.persona?.trim()) {
      lines.push(`说明: ${userRole.prompt.persona.trim()}`);
    }

    return lines.join('\n');
  }

  // 生成预览文本（用于预览Tab）
  generatePreview(
    persona: Persona,
    worldBooks: Record<string, WorldBook> = {},
    config: Partial<CompositionConfig> = {}
  ): {
    systemPrompt: string;
    tokenCount: number;
    sections: Array<{ title: string; content: string; enabled: boolean }>;
  } {
    const previewConfig: CompositionConfig = {
      ...DEFAULT_COMPOSITION_CONFIG,
      ...config,
      runtimeMode: 'preview'
    };

    // 生成System Prompt
    const systemPrompt = this.composeSystemPrompt(persona, worldBooks, undefined, previewConfig);

    // 计算大致的token数量（4个字符约等于1个token）
    const tokenCount = Math.ceil(systemPrompt.length / 4);

    // 分析各个段落信息
    const sections = this.analyzeSections(persona, worldBooks, previewConfig);

    return {
      systemPrompt,
      tokenCount,
      sections
    };
  }

  // 分析各个段落的信息
  private analyzeSections(
    persona: Persona,
    worldBooks: Record<string, WorldBook>,
    config: CompositionConfig
  ): Array<{ title: string; content: string; enabled: boolean }> {
    const sections: Array<{ title: string; content: string; enabled: boolean }> = [];

    // System段
    if (persona.prompt.system?.trim()) {
      sections.push({
        title: 'System',
        content: persona.prompt.system.trim(),
        enabled: true
      });
    }

    // Safety段
    if (persona.prompt.safety?.trim()) {
      sections.push({
        title: 'Safety',
        content: persona.prompt.safety.trim(),
        enabled: true
      });
    }

    // Style段
    if (persona.prompt.style?.trim()) {
      sections.push({
        title: 'Style',
        content: persona.prompt.style.trim(),
        enabled: true
      });
    }

    // WorldBook段
    if (persona.worldBookLinks && persona.worldBookLinks.length > 0) {
      const enabledLinks = persona.worldBookLinks
        .filter(link => link.enabled)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      enabledLinks.forEach(link => {
        const worldBook = worldBooks[link.worldBookId];
        if (worldBook) {
          sections.push({
            title: `WorldBook: ${worldBook.name}`,
            content: worldBook.content,
            enabled: true
          });
        }
      });

      // 添加禁用的WorldBook信息
      const disabledLinks = persona.worldBookLinks
        .filter(link => !link.enabled)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      disabledLinks.forEach(link => {
        const worldBook = worldBooks[link.worldBookId];
        if (worldBook) {
          sections.push({
            title: `WorldBook: ${worldBook.name} (已禁用)`,
            content: worldBook.content,
            enabled: false
          });
        }
      });
    }

    // Memory段（预览中通常不包含）
    if (config.previewIncludeMemory) {
      sections.push({
        title: 'Memory',
        content: '(记忆内容将在实际发送时生成)',
        enabled: true
      });
    }

    return sections;
  }

  // 验证合成配置
  validateConfig(config: Partial<CompositionConfig>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.memoryTokenBudget !== undefined) {
      if (typeof config.memoryTokenBudget !== 'number' || config.memoryTokenBudget < 0) {
        errors.push('Memory token预算必须是非负数');
      }
      if (config.memoryTokenBudget > 4000) {
        errors.push('Memory token预算不应超过4000');
      }
    }

    if (config.separator !== undefined) {
      if (typeof config.separator !== 'string') {
        errors.push('分隔符必须是字符串');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // 计算Prompt的大致token数量
  estimateTokens(text: string): number {
    // 简单估算：4个字符约等于1个token
    // 对于中文可能需要调整比例
    const chineseCharCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherCharCount = text.length - chineseCharCount;
    
    // 中文字符约1.5个字符等于1个token，英文字符约4个字符等于1个token
    return Math.ceil(chineseCharCount / 1.5 + otherCharCount / 4);
  }

  // 获取默认配置
  getDefaultConfig(): CompositionConfig {
    return { ...DEFAULT_COMPOSITION_CONFIG };
  }

  // 创建发送时的配置
  createSendConfig(baseConfig?: Partial<CompositionConfig>): CompositionConfig {
    return {
      ...DEFAULT_COMPOSITION_CONFIG,
      ...baseConfig,
      runtimeMode: 'send',
      previewIncludeMemory: false // 发送时强制包含Memory
    };
  }

  // 创建预览时的配置
  createPreviewConfig(baseConfig?: Partial<CompositionConfig>): CompositionConfig {
    return {
      ...DEFAULT_COMPOSITION_CONFIG,
      ...baseConfig,
      runtimeMode: 'preview',
      previewIncludeMemory: baseConfig?.previewIncludeMemory ?? false
    };
  }
}