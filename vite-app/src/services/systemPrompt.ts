// 系统提示生成服务
// 集成CompositionService，替换原有的字符串模板系统

import type { Chat, Message, WorldBook } from '../state/index';
import type { Persona, UserRole } from '../screens/personaCenter/types/PersonaTypes';
import { CompositionService } from '../screens/personaCenter/services/CompositionService';
import { PersonaService } from '../screens/personaCenter/services/PersonaService';
import { UserRoleService } from '../screens/personaCenter/services/UserRoleService';

export class SystemPromptService {
  private compositionService: CompositionService;
  private personaService: PersonaService;  
  private userRoleService: UserRoleService;

  constructor() {
    this.compositionService = new CompositionService();
    this.personaService = new PersonaService();
    this.userRoleService = new UserRoleService();
  }

  // 生成完整的系统提示（替换原有的triggerAiResponse中的逻辑）
  async generateSystemPrompt(
    chat: Chat,
    worldBooks: Record<string, WorldBook> = {},
    memoryPack?: string
  ): Promise<{
    systemPrompt: string;
    compositionHash: string;
  }> {
    // 获取Persona（优先使用chat.personaId，否则回退到settings.aiPersona）
    let persona: Persona | null = null;
    if (chat.personaId) {
      persona = await this.personaService.getById(chat.personaId);
      if (!persona) {
        console.warn(`Persona ${chat.personaId} 不存在，回退到默认处理`);
      }
    }

    // 如果有有效的Persona，使用CompositionService生成
    if (persona) {
      const systemPrompt = this.compositionService.composeSystemPrompt(
        persona, 
        worldBooks,
        memoryPack,
        this.compositionService.createSendConfig()
      );
      
      // 计算合成哈希（简单方式）
      const compositionHash = this.calculateCompositionHash(persona, worldBooks, memoryPack);
      
      return { systemPrompt, compositionHash };
    }

    // 回退到原有的字符串模板模式
    return this.generateLegacySystemPrompt(chat, worldBooks, memoryPack);
  }

  // 注入UserRole块到用户消息
  async injectUserRoleBlock(
    message: Message,
    chat: Chat
  ): Promise<string> {
    // 优先使用消息级userRoleId，否则使用聊天默认
    const userRoleId = message.userRoleId || chat.defaultUserRoleId;
    
    if (!userRoleId) {
      return message.content;
    }

    const userRole = await this.userRoleService.getById(userRoleId);
    if (!userRole) {
      console.warn(`UserRole ${userRoleId} 不存在`);
      return message.content;
    }

    const userRoleBlock = this.compositionService.injectUserRoleBlock(userRole);
    
    if (userRoleBlock) {
      return `${userRoleBlock}\n\n${message.content}`;
    }

    return message.content;
  }

  // 回退到原有的字符串模板系统（保持兼容性）
  private async generateLegacySystemPrompt(
    chat: Chat, 
    worldBooks: Record<string, WorldBook> = {},
    memoryPack?: string
  ): Promise<{ systemPrompt: string; compositionHash: string }> {
    // 这里保持原有的字符串替换逻辑
    // 获取预设和常量
    const state = (window as any).STATE || (window as any).state;
    const constants = (window as any).CONSTANTS;
    
    const activePreset = state?.presets?.find((p: any) => p.id === state.globalSettings?.activePresetId);
    
    const DEFAULT_PROMPT_SINGLE = constants?.DEFAULT_PROMPT_SINGLE || '默认单聊提示词';
    const DEFAULT_PROMPT_GROUP = constants?.DEFAULT_PROMPT_GROUP || '默认群聊提示词';

    // 获取各种上下文
    const myAddress = state?.myAddress || '';
    const currentTime = new Date().toLocaleString('zh-CN');
    const worldBookContent = Object.values(worldBooks).map(wb => wb.content).join('\n\n');
    
    // 地理位置处理
    const enableGeolocation = state?.globalSettings?.enableGeolocation;
    const addressForTemplate = enableGeolocation ? myAddress : '[地理位置已禁用]';

    let systemPrompt: string;
    
    if (chat.isGroup) {
      const basGroupPrompt = activePreset?.promptGroup || DEFAULT_PROMPT_GROUP;
      const membersList = chat.members?.map(m => `- **${m.name}**: ${m.persona}`).join('\n') || '';
      const myNickname = chat.settings.myGroupNickname || '我';
      
      systemPrompt = basGroupPrompt
        .replace('{myAddress}', addressForTemplate)
        .replace('{worldBookContent}', worldBookContent)
        .replace('{currentTime}', currentTime)
        .replace('{chat.settings.myPersona}', chat.settings.myPersona || '')
        .replace(/{myNickname}/g, myNickname)
        .replace('{membersList}', membersList);
    } else {
      const baseSinglePrompt = activePreset?.promptSingle || DEFAULT_PROMPT_SINGLE;
      
      systemPrompt = baseSinglePrompt
        .replace('{myAddress}', addressForTemplate)
        .replace(/{chat.name}/g, chat.name)
        .replace(/{currentTime}/g, currentTime)
        .replace('{worldBookContent}', worldBookContent)
        .replace(/{chat.settings.aiPersona}/g, chat.settings.aiPersona || '')
        .replace(/{chat.settings.myPersona}/g, chat.settings.myPersona || '');
    }

    // 添加记忆包
    if (memoryPack) {
      systemPrompt += `\n\n[记忆上下文]\n${memoryPack}`;
    }

    const compositionHash = this.calculateLegacyHash(systemPrompt);
    
    return { systemPrompt, compositionHash };
  }

  // 计算Persona模式的合成哈希
  private calculateCompositionHash(
    persona: Persona,
    worldBooks: Record<string, WorldBook>,
    memoryPack?: string
  ): string {
    const hashInput = [
      persona.id,
      persona.version.toString(),
      persona.prompt.system,
      persona.prompt.style || '',
      persona.prompt.safety || '',
      JSON.stringify(persona.worldBookLinks),
      Object.keys(worldBooks).sort().join(','),
      memoryPack || ''
    ].join('|');
    
    // 简单哈希（生产环境可以使用更复杂的哈希算法）
    return btoa(hashInput).substring(0, 16);
  }

  // 计算Legacy模式的合成哈希
  private calculateLegacyHash(systemPrompt: string): string {
    return btoa(systemPrompt).substring(0, 16);
  }

  // 验证合成哈希一致性
  async validateCompositionHash(chat: Chat, expectedHash?: string): Promise<boolean> {
    if (!expectedHash || !chat.compositionHash) {
      return true; // 没有哈希时跳过验证
    }
    
    return chat.compositionHash === expectedHash;
  }

  // 获取合成配置的预览
  async generatePreview(chat: Chat): Promise<string> {
    if (!chat.personaId) {
      return '使用传统模板模式，无预览功能';
    }

    const persona = await this.personaService.getById(chat.personaId);
    if (!persona) {
      return '角色不存在';
    }

    // 获取世界书
    const worldBooks: Record<string, WorldBook> = {};
    // TODO: 实际获取WorldBooks

    const preview = this.compositionService.generatePreview(persona, worldBooks);
    return preview.systemPrompt;
  }
}