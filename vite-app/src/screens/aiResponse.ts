// 修复与优化版：聚焦审查指出的4个问题，保持核心功能不变

import type {
  Message,
  Chat,
  StateManager,
  MusicState,
  ApiConfig,
} from '../state';
import DB from '../database';
import CONSTANTS from '../constants';
import { showApiConfigError } from '../services/errorHandling';
import { SystemPromptService } from '../services/systemPrompt';

type Role = 'system' | 'user' | 'assistant';
type MsgPayload = { role: Role; content: any } | null;

interface Constants {
  DEFAULT_PROMPT_IMAGE: string;
  DEFAULT_PROMPT_VOICE: string;
  DEFAULT_PROMPT_TRANSFER: string;
  DEFAULT_PROMPT_SINGLE: string;
  DEFAULT_PROMPT_GROUP: string;
  STICKER_REGEX: RegExp;
}

const nowTs = () => Date.now();
const buildMessageId = () => `msg_${nowTs()}_${Math.random()}`;
const toStr = (v: any) => String(v ?? '');
const getWin = () => window as any;

function normalizeProxyUrl(url?: string): string | null {
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

function buildMusicContext(music: MusicState | undefined, chatId: string): string {
  if (!music?.isActive || music.activeChatId !== chatId || music.currentIndex < 0) return '';
  const track = music.playlist[music.currentIndex];
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

// 修复3：非贪婪匹配 JSON 片段，避免跨越到最后一个 ] 或 }
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

// 统一模板多次替换（修复4：群聊与单聊一致全局替换）
function replaceAllPlaceholders(template: string, map: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(map)) {
    // 占位符如 {currentTime}
    const re = new RegExp(`\\{${k}\\}`, 'g');
    out = out.replace(re, v);
  }
  return out;
}

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
      const m: any = { ...base, type: 'voice_message', content: payload.content };
      m.senderName = base.sender;
      return m;
    }
    if (payload.type === 'ai_image') {
      const m: any = { ...base, type: 'ai_image', content: payload.description };
      m.senderName = base.sender;
      return m;
    }
    if (payload.type === 'transfer') {
      const m: any = { ...base, type: 'transfer', content: '' };
      m.senderName = base.sender;
      m.receiverName = receiverName || '我';
      m.amount = payload.amount;
      m.note = payload.note;
      return m;
    }
    if (chat.isGroup && payload.name && payload.message) {
      const m: any = { ...base, content: toStr(payload.message), sender: toStr(payload.name) };
      m.senderName = m.sender;
      return m as Message;
    }
  }

  return { ...base, content: toStr(payload) } as Message;
}

export class AiResponseModule {
  private systemPromptService: SystemPromptService;

  constructor() {
    this.systemPromptService = new SystemPromptService();
  }

  async triggerAiResponse(): Promise<void> {
    const win = getWin();
    const state: StateManager | undefined = win.STATE;
    const musicState: MusicState | undefined = state?.musicState;
    const typingIndicator = document.getElementById('typing-indicator');

    if (!state?.state?.activeChatId) return;

    const chatId = state.state.activeChatId;
    const chat: Chat = state.state.chats[chatId];

    const myAddress: string =
        (typeof win.myAddress === 'function' ? win.myAddress() : state?.myAddress) || '位置未知';

    if (typingIndicator) typingIndicator.style.display = 'block';

    try {
      const apiConfig: ApiConfig = state.state.apiConfig;
      const { proxyUrl: rawProxyUrl, apiKey, model } = apiConfig || ({} as ApiConfig);
      const proxyUrl = normalizeProxyUrl(rawProxyUrl);
      if (!proxyUrl || !apiKey || !model) {
        showApiConfigError();
        return;
      }

      const currentTime = new Date().toLocaleTimeString('zh-CN', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      });
      const addressForTemplate = shouldUseAddress(state.state.globalSettings.enableGeolocation, myAddress)
          ? myAddress
          : '';
      const worldBookContent = joinWorldBookContent(chat, state);
      const musicContext = buildMusicContext(musicState, chatId);

      // 系统提示生成（失败回退）
      let systemPrompt = '';
      let compositionHash = '';
      try {
        const promptResult = await this.systemPromptService.generateSystemPrompt(chat, {}, undefined);
        systemPrompt = promptResult.systemPrompt;
        compositionHash = promptResult.compositionHash;
        if (chat.compositionHash !== compositionHash) {
          chat.compositionHash = compositionHash;
          await win.saveChat(chat);
        }
      } catch {
        const activePreset = win.getActivePreset?.();
        const constants: Constants = win.CONSTANTS;
        const DEFAULT_PROMPT_SINGLE = constants?.DEFAULT_PROMPT_SINGLE || '默认单聊提示词';
        const DEFAULT_PROMPT_GROUP = constants?.DEFAULT_PROMPT_GROUP || '默认群聊提示词';

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

      // 消息窗口
      const maxMemory = Number.parseInt(String(chat.settings.maxMemory)) || 10;
      const historySlice = chat.history.slice(-Math.max(1, maxMemory));

      // 构造消息载荷
      const messagesPayload: Array<{ role: Role; content: any }> = (
          await Promise.all(
              historySlice.map(async (msg): Promise<MsgPayload> => {
                const isStrOrArr = typeof msg.content === 'string' || Array.isArray(msg.content);

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
                    // 修复1：明确 if/else，避免“裸代码块”歧义
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
                  default:
                    break;
                }

                // 用户表情含义
                const anyMsg: any = msg;
                if (msg.role === 'user' && anyMsg?.meaning) {
                  return {
                    role: 'user',
                    content: `[用户发送了一个表情，意思是：'${anyMsg.meaning}']`,
                  };
                }

                // 用户文本注入 UserRole
                if (msg.role === 'user' && isStrOrArr) {
                  try {
                    const processed = await this.systemPromptService.injectUserRoleBlock(msg, chat);
                    return { role: 'user', content: processed };
                  } catch {
                    return { role: msg.role as Role, content: msg.content };
                  }
                }

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

      const isViewingThisChat = getIsViewingChat(chatId, state);
      let notified = false;

      for (const item of parsed) {
        const senderName = chat.isGroup ? (item?.name ?? '未知') : chat.name;
        const receiverName = chat.isGroup ? (item?.receiver ?? '我') : '我';

        const msg = buildAssistantMessage(chat, item, senderName, receiverName);
        chat.history.push(msg);
        await DB.saveChat(chat);

        if (isViewingThisChat) {
          win.ChatModule.appendMessage(msg, chat);
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
        // 修复2：移除非空断言，增加空值保护
        if (getIsViewingChat(chat.id, state)) {
          win.ChatModule.appendMessage(errMsg, chat);
        }
      }
      console.error(error);
    } finally {
      if (typingIndicator) typingIndicator.style.display = 'none';
      getWin().ChatModule.renderChatList();
    }
  }

  private showNotification(chatId: string, messageContent: string): void {
    const win = getWin();
    if (typeof win.showNotification === 'function') {
      win.showNotification(chatId, messageContent);
    }
  }
}

export const aiResponseModule = new AiResponseModule();

export default {
  aiResponseModule,
  AiResponseModule,
};

console.log('AI响应模块(TypeScript版)已初始化-修复审查问题');
