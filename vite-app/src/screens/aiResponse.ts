// vite-app/src/screens/aiResponse.ts
// AI响应处理模块 - TypeScript优化版
// 变更要点：并发保护、音乐索引越界保护、模板替换正则转义、未知类型安全处理、解析器非贪婪、错误处理健壮化、类型接口细化

import type {
  Message,
  Chat,
  StateManager,
  MusicState,
  ApiConfig,
  WorldBook,
} from '../state';
import DB from '../database';
import CONSTANTS from '../constants';
import { showApiConfigError } from '../services/errorHandling';
import { SystemPromptService } from '../services/systemPrompt';
import { MemoryRepo, selectEventsForPrompt, selectEventsForGroup, renderMemoryBlock, renderGroupMemoryBlock, maybeExtractAndRecord, chatMemoryEstimator } from '../services/memory';

type Role = 'system' | 'user' | 'assistant';

interface Constants {
  DEFAULT_PROMPT_IMAGE: string;
  DEFAULT_PROMPT_VOICE: string;
  DEFAULT_PROMPT_TRANSFER: string;
  DEFAULT_PROMPT_SINGLE: string;
  DEFAULT_PROMPT_GROUP: string;
  STICKER_REGEX: RegExp;
}

type MsgPayload = { role: Role; content: any } | null;

// 更具体的扩展消息类型（提升类型安全）
interface VoiceMessage extends Message {
  type: 'voice_message';
  senderName: string;
}
interface AiImageMessage extends Message {
  type: 'ai_image';
  content: string; // description
  senderName: string;
}
interface TransferMessage extends Message {
  type: 'transfer';
  content: '';
  senderName: string;
  receiverName: string;
  amount: number;
  note: string;
}

const nowTs = () => Date.now();
const buildMessageId = () => `msg_${nowTs()}_${Math.random()}`;
const toStr = (v: any) => String(v ?? '');
const getWin = () => window as any;

// 并发保护：每个 chatId 仅允许一个 trigger 在跑
const runningMap = new Map<string, boolean>();

export function normalizeProxyUrl(url?: string): string | null {
  if (!url) return null;
  let u = url.trim();
  if (!u) return null;
  if (u.endsWith('/')) u = u.slice(0, -1);
  if (u.endsWith('/v1')) u = u.slice(0, -3);
  return u;
}

function shouldUseAddress(flag: boolean, addr: string) {
  return flag && addr !== '位置未知' && addr !== '位置获取失败';
}

function joinWorldBookContent(chat: Chat, state: StateManager): string {
  const ids = chat.settings.linkedWorldBookIds;
  if (!ids?.length) return '';
  const books = state.state.worldBooks;
  const parts: string[] = [];
  for (const id of ids) {
    const wb = books.find(w => w.id === id);
    if (wb?.content) parts.push(`\n\n## 世界书: ${wb.name}\n${wb.content}`);
  }
  return parts.length
      ? `\n\n# 核心世界观设定 (必须严格遵守以下所有设定)\n${parts.join('')}\n`
      : '';
}

// 修复：索引上下界检查，守卫 track，避免越界 TypeError
function buildMusicContext(music: MusicState | undefined, chatId: string): string {
  if (!music?.isActive || music.activeChatId !== chatId) return '';
  const idx = music.currentIndex ?? -1;
  const list = music.playlist ?? [];
  if (idx < 0 || idx >= list.length) return '';
  const track = list[idx];
  if (!track) return '';
  return `\n\n# 当前情景\n你正在和用户一起听歌。当前播放的歌曲是：${track.name} - ${track.artist}。请在对话中自然地融入这个情境。\n`;
}

function getIsViewingChat(chatId: string, state?: StateManager): boolean {
  if (!state) return false;
  const screen = document.getElementById('chat-interface-screen');
  return Boolean(screen?.classList.contains('active') && state.state.activeChatId === chatId);
}

function getStickerRegex(): RegExp {
  return CONSTANTS?.STICKER_REGEX || /^(https:\/\/i\.postimg\.cc\/.+|data:image)/;
}

function safeJsonParse<T = any>(text: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

// 非贪婪片段提取，避免跨越到最后一个 ] 或 }
export function parseAiResponse(content: string): any[] {
  if (!content || typeof content !== 'string') return [content];

  // 1) 整体 JSON
  const full = safeJsonParse<any>(content);
  if (full.ok) return Array.isArray(full.value) ? full.value : [full.value];

  // 2) 非贪婪 JSON 片段（数组或对象）
  const jsonBlock = content.match(/(\[[\s\S]*?\]|\{[\s\S]*?\})/);
  if (jsonBlock) {
    const part = safeJsonParse<any>(jsonBlock[0]);
    if (part.ok) return Array.isArray(part.value) ? part.value : [part.value];
  }

  // 3) 按行分割（去空）
  const lines = content.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  // 4) 原样
  return [content];
}

// 正则键名转义，避免潜在注入/匹配异常
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function replaceAllPlaceholders(template: string, map: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(map)) {
    const re = new RegExp(`\\{${escapeRegExp(k)}\\}`, 'g');
    out = out.replace(re, v);
  }
  return out;
}

// 统一构造助手消息，按扩展类型归一；使用更具体类型减少 any
function buildAssistantMessage(
    chat: Chat,
    payload: any,
    senderName?: string,
    receiverName?: string
): Message {
  const base = {
    id: buildMessageId(),
    role: 'assistant' as const,
    sender: senderName || chat.name,
    timestamp: nowTs(),
  };

  if (payload && typeof payload === 'object') {
    if (payload.type === 'voice_message') {
      return {
        ...base,
        type: 'voice_message',
        content: payload.content,
        senderName: base.sender,
      } as VoiceMessage;
    }
    if (payload.type === 'ai_image') {
      return {
        ...base,
        type: 'ai_image',
        content: payload.description,
        senderName: base.sender,
      } as AiImageMessage;
    }
    if (payload.type === 'transfer') {
      return {
        ...base,
        type: 'transfer',
        content: '',
        senderName: base.sender,
        receiverName: receiverName || '我',
        amount: payload.amount,
        note: payload.note,
      } as TransferMessage;
    }
    if (chat.isGroup && payload.name && payload.message) {
      return {
        ...base,
        content: toStr(payload.message),
        sender: toStr(payload.name),
        senderName: toStr(payload.name),
      } as Message;
    }
  }

  return { ...base, content: toStr(payload) } as Message;
}

export class AiResponseModule {
  private systemPromptService: SystemPromptService;

  constructor() {
    this.systemPromptService = new SystemPromptService();
  }

  // 触发AI响应
  async triggerAiResponse(): Promise<void> {
    const win = getWin();
    const state: StateManager | undefined = win.STATE;
    const typingIndicator = document.getElementById('typing-indicator');

    if (!state?.state?.activeChatId) return;
    const chatId = state.state.activeChatId;

    // 并发保护（同一 chatId 重入直接忽略）
    if (runningMap.get(chatId)) {
      console.warn(`triggerAiResponse 已在处理: ${chatId}`);
      return;
    }
    runningMap.set(chatId, true);

    const musicState: MusicState | undefined = state?.musicState;
    const chat: Chat = state.state.chats[chatId];

    // 修复：通过函数调用获取地址
    const myAddress: string =
        (typeof win.myAddress === 'function' ? win.myAddress() : state?.myAddress) || '位置未知';

    // UI：显示打字指示器
    if (typingIndicator) typingIndicator.style.display = 'block';

    try {
      // 配置校验 + URL 规范化
      const apiConfig: ApiConfig = state.state.apiConfig;
      const { proxyUrl: rawProxyUrl, apiKey, model } = apiConfig || ({} as ApiConfig);
      const proxyUrl = normalizeProxyUrl(rawProxyUrl);
      if (!proxyUrl || !apiKey || !model) {
        showApiConfigError();
        return;
      }

      // 预构建上下文
      const currentTime = new Date().toLocaleTimeString('zh-CN', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      });
      const addrEnabled = shouldUseAddress(state.state.globalSettings.enableGeolocation, myAddress);
      const addressForTemplate = addrEnabled ? myAddress : '';
      const worldBookContent = joinWorldBookContent(chat, state);
      const musicContext = buildMusicContext(musicState, chatId);

      // Memory Manager P2: 使用统一的记忆注入API
      let memoryPack: string | undefined = undefined;
      let memoryTokenBudget = 600; // 默认预算
      
      try {
        // 设置当前聊天上下文到记忆预估器
        let members: any[] = [];
        if (chat.isGroup && chat.members) {
          // 创建name→personaId映射表，从全局personas中查找
          const personaMap = new Map<string, string>();
          
          // 修复：正确的personas访问路径
          const allPersonas = win.STATE?.state?.personas || win.state?.personas || [];
          
          for (const persona of allPersonas) {
            personaMap.set(persona.name, persona.id);
          }
          
          members = chat.members.map(member => {
            // 尝试从persona字段或name字段匹配personaId
            let personaId = (member as any).personaId;
            
            if (!personaId) {
              // 尝试从persona字段匹配
              if (member.persona) {
                personaId = personaMap.get(member.persona);
              }
              
              // 如果还没找到，尝试从name字段匹配
              if (!personaId && member.name) {
                personaId = personaMap.get(member.name);
              }
              
              // 如果仍然没有找到，记录警告并使用回退策略
              if (!personaId) {
                console.warn('[MM][persona-mapping-failed]', { 
                  memberName: member.name, 
                  memberPersona: member.persona,
                  availablePersonas: allPersonas.map(p => p.name)
                });
                personaId = 'unknown_' + (member.name || member.persona || 'member');
              }
            }
            
            return {
              personaId,
              name: member.name || member.persona || personaId
            };
          });
          
          // 检查是否所有成员都无法正确映射，如果是则回退到单人注入
          const validPersonaIds = members.filter(m => !m.personaId.startsWith('unknown_'));
          if (validPersonaIds.length === 0) {
            console.warn('[MM][group-fallback-single]', {
              message: '所有群组成员都无法映射到有效persona，回退到单人注入模式',
              originalMembersCount: members.length,
              availablePersonasCount: allPersonas.length,
              chatPersonaId: chat.personaId
            });
            members = []; // 清空members，让后续逻辑使用单人模式
          } else {
            console.log('[MM][group-personas] 解析群聊成员:', {
              members: members.map(m => ({ name: m.name, personaId: m.personaId })),
              validMapping: `${validPersonaIds.length}/${members.length}`
            });
          }
        }
        
        // 从多层级配置读取memoryTokenBudget
        try {
          if (chat.personaId) {
            const persona = await (win.STATE?.state?.personas || win.state?.personas || [])?.find(p => p.id === chat.personaId);
            if (persona) {
              // 优先级1：从PersonaMemorySettings读取
              try {
                const { MemoryRepo } = await import('../services/memory/repo');
                const memorySettings = await MemoryRepo.getSettings(chat.personaId);
                if (memorySettings && memorySettings.memoryTokenBudget) {
                  memoryTokenBudget = memorySettings.memoryTokenBudget;
                  console.log('[MM][budget] 从PersonaMemorySettings获取记忆token预算:', memoryTokenBudget);
                } else {
                  // 优先级2：从CompositionService获取
                  const { CompositionService } = await import('./personaCenter/services/CompositionService');
                  const compositionService = new CompositionService();
                  const sendConfig = compositionService.createSendConfig();
                  memoryTokenBudget = sendConfig.memoryTokenBudget;
                  console.log('[MM][budget] 从CompositionService获取记忆token预算:', memoryTokenBudget);
                }
              } catch (configError) {
                console.warn('[MM][budget-persona-config-failed]', configError);
                // 优先级3：使用默认配置
                const { DEFAULT_COMPOSITION_CONFIG } = await import('./personaCenter/types/PersonaTypes');
                memoryTokenBudget = DEFAULT_COMPOSITION_CONFIG.memoryTokenBudget;
                console.log('[MM][budget] 使用默认记忆token预算:', memoryTokenBudget);
              }
            }
          } else {
            // 如果没有personaId，使用全局默认配置
            const { DEFAULT_COMPOSITION_CONFIG } = await import('./personaCenter/types/PersonaTypes');
            memoryTokenBudget = DEFAULT_COMPOSITION_CONFIG.memoryTokenBudget;
            console.log('[MM][budget] 使用全局默认记忆token预算:', memoryTokenBudget);
          }
        } catch (e) {
          console.warn('[MM][budget-config-failed] 获取记忆预算配置失败，使用保险默认值600', e);
          memoryTokenBudget = 600; // 保险的硬编码回退值
        }
        
        await chatMemoryEstimator.setChatContext(
          chat.id,
          chat.personaId,
          chat.isGroup,
          members,
          memoryTokenBudget  // 传递动态配置的预算
        );

        // 获取记忆注入内容
        memoryPack = await chatMemoryEstimator.getMemoryInjection();

        // 兜底：若注入结果为空且是单聊，直接用仓库选择器快速生成一次
        if ((!memoryPack || !memoryPack.trim()) && chat.personaId) {
          try {
            const { MemoryRepo } = await import('../services/memory/repo');
            const { selectEventsForPrompt } = await import('../services/memory/select');
            const { renderMemoryBlock } = await import('../services/memory/render');
            const events = await selectEventsForPrompt(MemoryRepo as any, chat.personaId, { maxChars: memoryTokenBudget * 4 });

            // 获取用户和角色名称用于模板渲染
            const win = window as any;
            const state = win.STATE?.state || win.state;

            // 使用与memory模块一致的用户名获取逻辑
            let userName = '用户';
            try {
              if (state && state.userRoles && Array.isArray(state.userRoles)) {
                const defaultUserRole = state.userRoles.find((role: any) => role.isGlobalDefault);
                if (defaultUserRole?.name) {
                  userName = defaultUserRole.name;
                }
              }
            } catch (error) {
              console.error('[aiResponse] 获取用户名称失败:', error);
            }

            const personaName = chat.name || chat.personaId;
            const context = {
              userName,
              personaNameMap: { [chat.personaId]: personaName }
            };

            const fallbackPack = renderMemoryBlock(events, true, context);
            if (fallbackPack && fallbackPack.trim()) {
              memoryPack = fallbackPack;
              console.log('[MM][inject-fallback] 使用快速选择生成记忆注入');
            }
          } catch (e) {
            console.warn('[MM][inject-fallback-failed]', e);
          }
        }
        
      } catch (e) {
        console.warn('[MM][inject-failed]', e);
      }

      // 系统提示
      let systemPrompt = '';
      let compositionHash = '';
      try {
        // Persona 模式：构建 WorldBook 映射，传入合成服务
        let worldBooksMap: Record<string, WorldBook> = {};
        try {
          const linkedIds = chat.settings?.linkedWorldBookIds || [];
          const allWorldBooks: WorldBook[] = (state?.state?.worldBooks as WorldBook[]) || [];
          if (linkedIds.length && allWorldBooks.length) {
            worldBooksMap = linkedIds.reduce((acc: Record<string, WorldBook>, id: string) => {
              const wb = allWorldBooks.find(w => w.id === id);
              if (wb) acc[wb.id] = wb;
              return acc;
            }, {} as Record<string, WorldBook>);
          }
        } catch (e) {
          console.warn('[MM][worldbook-map-failed]', e);
          worldBooksMap = {} as Record<string, WorldBook>;
        }

        const promptResult = await this.systemPromptService.generateSystemPrompt(
          chat,
          worldBooksMap,
          memoryPack
        );
        systemPrompt = promptResult.systemPrompt;
        compositionHash = promptResult.compositionHash;

        // 若 hash 变化则保存
        if (chat.compositionHash !== compositionHash) {
          chat.compositionHash = compositionHash;
          await win.saveChat(chat);
        }
      } catch {
        // 回退旧逻辑：统一全局替换，保证一致性
        const activePreset = win.getActivePreset?.();
        const constants: Constants = win.CONSTANTS;
        const DEFAULT_PROMPT_SINGLE =
            constants?.DEFAULT_PROMPT_SINGLE || '默认单聊提示词';
        const DEFAULT_PROMPT_GROUP =
            constants?.DEFAULT_PROMPT_GROUP || '默认群聊提示词';

        if (chat.isGroup) {
          const baseGroup = activePreset?.promptGroup || DEFAULT_PROMPT_GROUP;
          systemPrompt = replaceAllPlaceholders(baseGroup, {
            myAddress: addressForTemplate,
            worldBookContent,
            musicContext,
            currentTime,
            'chat.settings.myPersona': chat.settings.myPersona || '',
          });
        } else {
          const baseSingle = activePreset?.promptSingle || DEFAULT_PROMPT_SINGLE;
          systemPrompt = replaceAllPlaceholders(baseSingle, {
            myAddress: addressForTemplate,
            'chat.name': chat.name,
            currentTime,
            worldBookContent,
            musicContext,
            'chat.settings.aiPersona': chat.settings.aiPersona || '',
            'chat.settings.myPersona': chat.settings.myPersona || '',
          });
        }
      }

      // 历史消息窗口
      const maxMemory = Number.parseInt(String(chat.settings.maxMemory)) || 10;
      const historySlice = chat.history.slice(-Math.max(1, maxMemory));

      // 构造消息载荷（异步注入 UserRole 块）
      const messagesPayload: Array<{ role: Role; content: any }> = (
          await Promise.all(
              historySlice.map(async (msg): Promise<MsgPayload> => {
                const isStrOrArr = typeof msg.content === 'string' || Array.isArray(msg.content);
                const anyMsg: any = msg;

                switch (msg.type) {
                  case 'pat':
                    return { role: 'user', content: `[拍一拍 ${msg.content}]` };
                  case 'user_photo':
                    return {
                      role: 'user',
                      content: `[你收到了一张用户描述的照片，照片内容是：'${msg.content}']`,
                    };
                  case 'ai_image':
                    return {
                      role: 'assistant',
                      content: JSON.stringify({ type: 'ai_image', description: msg.content }),
                    };
                  case 'voice_message':
                    if (msg.role === 'user') {
                      return {
                        role: 'user',
                        content: `[用户发来一条语音消息，内容是：'${msg.content}']`,
                      };
                    } else {
                      return {
                        role: 'assistant',
                        content: JSON.stringify({ type: 'voice_message', content: msg.content }),
                      };
                    }
                  case 'transfer':
                    // 明确 if/else，避免“裸代码块”歧义
                    if (msg.role === 'user') {
                      const m: any = msg;
                      return {
                        role: 'user',
                        content: `[你收到了来自用户的转账: ${m.amount}元, 备注: ${m.note}]`,
                      };
                    } else {
                      const m: any = msg;
                      return {
                        role: 'assistant',
                        content: JSON.stringify({
                          type: 'transfer',
                          amount: m.amount,
                          note: m.note,
                        }),
                      };
                    }
                  case undefined:
                  case null:
                    // 无类型：按兼容路径继续（可能是旧文本消息）
                    break;
                  default:
                    // 未知新类型：安全退化或忽略，避免后续 if 误处理
                    if (isStrOrArr) return { role: msg.role as Role, content: msg.content };
                    return null;
                }

                // 用户表情含义（仅在无明确类型时生效）
                if (msg.role === 'user' && anyMsg?.meaning) {
                  return {
                    role: 'user',
                    content: `[用户发送了一个表情，意思是：'${anyMsg.meaning}']`,
                  };
                }

                // 用户文本：注入 UserRole 块
                if (msg.role === 'user' && isStrOrArr) {
                  try {
                    const processed = await this.systemPromptService.injectUserRoleBlock(msg, chat);
                    return { role: 'user', content: processed };
                  } catch {
                    return { role: msg.role as Role, content: msg.content };
                  }
                }

                // 普通文本
                if (isStrOrArr) return { role: msg.role as Role, content: msg.content };
                return null;
              })
          )
      ).filter(Boolean) as Array<{ role: Role; content: any }>;

      // 请求 API
      const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, ...messagesPayload],
          temperature: 0.8,
          stream: false,
        }),
      });

      if (!response.ok) {
        let reason = `${response.status} ${response.statusText}`;
        try {
          const errJson = await response.json();
          if (errJson?.error?.message) reason = `${response.status} - ${errJson.error.message}`;
        } catch {}
        throw new Error(`API Error: ${reason}`);
      }

      const data = await response.json();
      const aiResponseContent = data?.choices?.[0]?.message?.content ?? '';
      const parsed = parseAiResponse(aiResponseContent);

      // 是否当前视图
      const isViewingThisChat = getIsViewingChat(chatId, state);

      // 通知控制：仅首条触发
      let notified = false;

      for (const item of parsed) {
        const senderName = chat.isGroup ? (item?.name ?? '未知') : chat.name;
        const receiverName = chat.isGroup ? (item?.receiver ?? '我') : '我';

        const msg = buildAssistantMessage(chat, item, senderName, receiverName);
        chat.history.push(msg);
        await DB.saveChat(chat);

        if (isViewingThisChat) {
          win.ChatModule.appendMessage(msg, chat);
          // 轻量打字间隔，避免长阻塞
          await new Promise(r => setTimeout(r, Math.random() * 300 + 200));
        } else if (!notified) {
          let tip = '';
          if ((msg as any).type === 'transfer') tip = `[收到一笔转账]`;
          else if ((msg as any).type === 'ai_image') tip = `[图片]`;
          else if ((msg as any).type === 'voice_message') tip = `[语音]`;
          else tip = toStr(msg.content);

          const finalTip = chat.isGroup ? `${(msg as any).senderName || senderName}: ${tip}` : tip;
          const STICKER_REGEX = getStickerRegex();
          const notifText = STICKER_REGEX.test(finalTip) ? '[表情]' : finalTip;
          this.showNotification(chatId, notifText);
          notified = true;
        }
      }
      
      // MCP 记忆提纯处理
      try {
        const win = getWin();
        const state = win.STATE;
        if (chat?.personaId && state?.state?.apiConfig) {
          const { proxyUrl, apiKey, model } = state.state.apiConfig;
          if (proxyUrl && apiKey && model) {
            // 获取最近的对话轮次
            const historySlice = chat.history.slice(-10); // 最近 10 条消息
            const recentTurns = historySlice
              .filter(m => m.role === 'user' || m.role === 'assistant')
              .slice(-4) // 最近 4 条（两轮对话）
              .map(m => ({ role: m.role as 'user' | 'assistant', text: String(m.content) }));
              
            if (recentTurns.length >= 1) {
              // 异步调用，不阻塞主流程
              maybeExtractAndRecord(
                chat.personaId, 
                recentTurns, 
                normalizeProxyUrl(proxyUrl) || proxyUrl,
                apiKey,
                model,
                chat.id,
                memoryPack  // 传递本次注入的记忆内容
              ).catch(e => {
                console.warn('[MM][extract-failed]', e);
              });
            }
          }
        }
      } catch (e) {
        console.warn('[MM][extract-setup-failed]', e);
      }
      
    } catch (error: any) {
      const win = getWin();
      const state: StateManager | undefined = win.STATE;
      const chat = state?.state?.activeChatId ? state.state.chats[state.state.activeChatId] : undefined;

      const errMsg: Message = {
        id: buildMessageId(),
        role: 'assistant',
        content: `[出错了: ${toStr(error?.message || error)}]`,
        sender: chat?.name || '系统',
        timestamp: nowTs(),
      };
      if (chat) {
        chat.history.push(errMsg);
        await DB.saveChat(chat);
        if (getIsViewingChat(chat.id, state)) {
          win.ChatModule.appendMessage(errMsg, chat);
        }
      }
      console.error(error);
    } finally {
      if (typingIndicator) typingIndicator.style.display = 'none';
      runningMap.delete(chatId); // 并发保护释放
      getWin().ChatModule.renderChatList();
    }
  }

  // 显示通知
  private showNotification(chatId: string, messageContent: string): void {
    const win = getWin();
    if (typeof win.showNotification === 'function') {
      win.showNotification(chatId, messageContent);
    }
  }
}

// === 全局单例实例 ===
export const aiResponseModule = new AiResponseModule();

// 默认导出
export default {
  aiResponseModule,
  AiResponseModule,
};

console.log('AI响应模块(TypeScript版)已初始化-并发/越界/正则转义/未知类型强化');
