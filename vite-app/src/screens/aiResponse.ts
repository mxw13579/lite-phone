// 优化版：AI响应处理模块 - TypeScript
// 关键改动：抽取纯函数、早期返回、统一URL规范化、健壮错误处理、消息构建工厂、解析器优化

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

interface Constants {
  DEFAULT_PROMPT_IMAGE: string;
  DEFAULT_PROMPT_VOICE: string;
  DEFAULT_PROMPT_TRANSFER: string;
  DEFAULT_PROMPT_SINGLE: string;
  DEFAULT_PROMPT_GROUP: string;
  STICKER_REGEX: RegExp;
}

type MsgPayload = { role: Role; content: any } | null;

const nowTs = () => Date.now();
const buildMessageId = () => `msg_${nowTs()}_${Math.random()}`;
const toStr = (v: any) => String(v ?? '');

function getWin(): any {
  return window as any;
}

function normalizeProxyUrl(url?: string): string | null {
  if (!url) return null;
  let u = url.trim();
  if (!u) return null;
  // 去尾斜杠
  if (u.endsWith('/')) u = u.slice(0, -1);
  // 去重 /v1
  if (u.endsWith('/v1')) u = u.slice(0, -3);
  return u;
}

function shouldUseAddress(flag: boolean, addr: string) {
  return flag && addr !== '位置未知' && addr !== '位置获取失败';
}

function joinWorldBookContent(chat: Chat, state: StateManager): string {
  const ids = chat.settings.linkedWorldBookIds;
  if (!ids || ids.length === 0) return '';
  const books = state.state.worldBooks;
  const parts: string[] = [];
  for (const bookId of ids) {
    const wb = books.find(w => w.id === bookId);
    if (wb?.content) {
      parts.push(`\n\n## 世界书: ${wb.name}\n${wb.content}`);
    }
  }
  return parts.length
      ? `\n\n# 核心世界观设定 (必须严格遵守以下所有设定)\n${parts.join('')}\n`
      : '';
}

function buildMusicContext(music: MusicState | undefined, chatId: string): string {
  if (!music?.isActive || music.activeChatId !== chatId || music.currentIndex < 0)
    return '';
  const track = music.playlist[music.currentIndex];
  if (!track) return '';
  return `\n\n# 当前情景\n你正在和用户一起听歌。当前播放的歌曲是：${track.name} - ${track.artist}。请在对话中自然地融入这个情境。\n`;
}

function getIsViewingChat(chatId: string, state: StateManager): boolean {
  const screen = document.getElementById('chat-interface-screen');
  return Boolean(screen?.classList.contains('active') && state.state.activeChatId === chatId);
}

function getStickerRegex(): RegExp {
  return CONSTANTS?.STICKER_REGEX || /^(https:\/\/i\.postimg\.cc\/.+|data:image)/;
}

function safeJsonParse<T = any>(text: string): { ok: true; value: T } | { ok: false } {
  try {
    const v = JSON.parse(text);
    return { ok: true, value: v };
  } catch {
    return { ok: false };
  }
}

// 更健壮解析：先整体 JSON，再宽松匹配首个 JSON 数组/对象代码块，再行分行回退
export function parseAiResponse(content: string): any[] {
  if (!content || typeof content !== 'string') return [content];

  // 策略1: 直接整体 JSON
  const full = safeJsonParse<any>(content);
  if (full.ok) return Array.isArray(full.value) ? full.value : [full.value];

  // 策略2: 捕获第一个 JSON 数组/对象片段（非贪婪，支持跨行）
  const jsonBlock = content.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonBlock) {
    const part = safeJsonParse<any>(jsonBlock[0]);
    if (part.ok) return Array.isArray(part.value) ? part.value : [part.value];
  }

  // 策略3: 按行拆分（去空白）
  const lines = content.split('\n').map(s => s.trim()).filter(Boolean);
  if (lines.length > 1) return lines;

  // 策略4: 原样
  return [content];
}

// 统一构造助手消息对象，按各种扩展类型归一
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
    // 声音
    if (payload.type === 'voice_message') {
      const m: any = {
        ...base,
        type: 'voice_message',
        content: payload.content,
      };
      m.senderName = base.sender;
      return m;
    }
    // 图片
    if (payload.type === 'ai_image') {
      const m: any = {
        ...base,
        type: 'ai_image',
        content: payload.description,
      };
      m.senderName = base.sender;
      return m;
    }
    // 转账
    if (payload.type === 'transfer') {
      const m: any = {
        ...base,
        type: 'transfer',
        content: '',
      };
      m.senderName = base.sender;
      m.receiverName = receiverName || '我';
      m.amount = payload.amount;
      m.note = payload.note;
      return m;
    }
    // 群聊结构化 {name,message}
    if (chat.isGroup && payload.name && payload.message) {
      const m: any = {
        ...base,
        content: toStr(payload.message),
        sender: toStr(payload.name),
      };
      m.senderName = m.sender;
      return m as Message;
    }
  }

  // 普通文本
  return {
    ...base,
    content: toStr(payload),
  } as Message;
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

    // 取地址：优先函数调用
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

      // 系统提示
      let systemPrompt = '';
      let compositionHash = '';
      try {
        const promptResult = await this.systemPromptService.generateSystemPrompt(
            chat,
            {},
            undefined
        );
        systemPrompt = promptResult.systemPrompt;
        compositionHash = promptResult.compositionHash;

        if (chat.compositionHash !== compositionHash) {
          chat.compositionHash = compositionHash;
          await win.saveChat(chat);
        }
      } catch (e) {
        // 回退旧逻辑
        const activePreset = win.getActivePreset?.();
        const constants: Constants = win.CONSTANTS;
        const DEFAULT_PROMPT_SINGLE =
            constants?.DEFAULT_PROMPT_SINGLE || '默认单聊提示词';
        const DEFAULT_PROMPT_GROUP =
            constants?.DEFAULT_PROMPT_GROUP || '默认群聊提示词';

        if (chat.isGroup) {
          const baseGroup = activePreset?.promptGroup || DEFAULT_PROMPT_GROUP;
          systemPrompt = baseGroup
              .replace('{myAddress}', addressForTemplate)
              .replace('{worldBookContent}', worldBookContent)
              .replace('{musicContext}', musicContext)
              .replace('{currentTime}', currentTime)
              .replace('{chat.settings.myPersona}', chat.settings.myPersona || '');
        } else {
          const baseSingle = activePreset?.promptSingle || DEFAULT_PROMPT_SINGLE;
          systemPrompt = baseSingle
              .replace('{myAddress}', addressForTemplate)
              .replace(/{chat.name}/g, chat.name)
              .replace(/{currentTime}/g, currentTime)
              .replace('{worldBookContent}', worldBookContent)
              .replace('{musicContext}', musicContext)
              .replace(/{chat.settings.aiPersona}/g, chat.settings.aiPersona || '')
              .replace(/{chat.settings.myPersona}/g, chat.settings.myPersona || '');
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

                // 特殊类型归一
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
                    }
                    return {
                      role: 'assistant',
                      content: JSON.stringify({ type: 'voice_message', content: msg.content }),
                    };
                  case 'transfer':
                    if (msg.role === 'user') {
                      const m: any = msg;
                      return {
                        role: 'user',
                        content: `[你收到了来自用户的转账: ${m.amount}元, 备注: ${m.note}]`,
                      };
                    }
                  {
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

                // 用户文本：注入 UserRole
                if (msg.role === 'user' && isStrOrArr) {
                  try {
                    const processed = await this.systemPromptService.injectUserRoleBlock(msg, chat);
                    return { role: 'user', content: processed };
                  } catch {
                    return { role: msg.role as Role, content: msg.content };
                  }
                }

                // 表情含义
                const anyMsg: any = msg as any;
                if (msg.role === 'user' && anyMsg?.meaning) {
                  return {
                    role: 'user',
                    content: `[用户发送了一个表情，意思是：'${anyMsg.meaning}']`,
                  };
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
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
        } catch {
          // ignore
        }
        throw new Error(`API Error: ${reason}`);
      }

      const data = await response.json();
      const aiResponseContent = data?.choices?.[0]?.message?.content ?? '';
      const parsed = parseAiResponse(aiResponseContent);

      // 是否当前视图
      const isViewingThisChat = getIsViewingChat(chatId, state);

      // 通知控制
      let notified = false;
      const notifyOnce = (text: string) => {
        if (notified) return;
        const STICKER_REGEX = getStickerRegex();
        const notificationText = STICKER_REGEX.test(text) ? '[表情]' : text;
        this.showNotification(chatId, notificationText);
        notified = true;
      };

      for (const item of parsed) {
        const senderName = chat.isGroup ? (item?.name ?? '未知') : chat.name;
        const receiverName = chat.isGroup ? (item?.receiver ?? '我') : '我';

        const msg = buildAssistantMessage(chat, item, senderName, receiverName);
        chat.history.push(msg);
        await DB.saveChat(chat);

        if (isViewingThisChat) {
          win.ChatModule.appendMessage(msg, chat);
          // 轻量打字间隔，避免过长阻塞
          await new Promise(r => setTimeout(r, Math.random() * 300 + 200));
        } else if (!notified) {
          let tip = '';
          if ((msg as any).type === 'transfer') tip = `[收到一笔转账]`;
          else if ((msg as any).type === 'ai_image') tip = `[图片]`;
          else if ((msg as any).type === 'voice_message') tip = `[语音]`;
          else tip = toStr(msg.content);

          const finalTip = chat.isGroup ? `${(msg as any).senderName || senderName}: ${tip}` : tip;
          notifyOnce(finalTip);
        }
      }
    } catch (error: any) {
      const win = getWin();
      const state: StateManager | undefined = win.STATE;
      const chat = state?.state?.activeChatId
          ? state.state.chats[state.state.activeChatId]
          : undefined;

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
        if (getIsViewingChat(chat.id, state!)) {
          win.ChatModule.appendMessage(errMsg, chat);
        }
      }
      console.error(error);
    } finally {
      // UI 收尾
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

// 单例
export const aiResponseModule = new AiResponseModule();

export default {
  aiResponseModule,
  AiResponseModule,
};

console.log('AI响应模块(TypeScript版)已初始化-优化');
