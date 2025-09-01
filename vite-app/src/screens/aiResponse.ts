// AI响应处理模块 - TypeScript版本
// 处理AI聊天响应的核心逻辑
// Phase 4: 使用统一错误处理

import type { Message, Chat, StateManager, DatabaseManager, ApiConfig, MusicState, Preset } from '../state';
import DB from '../database';
import { showApiConfigError } from '../services/errorHandling';
import { SystemPromptService } from '../services/systemPrompt';

interface Constants {
  DEFAULT_PROMPT_IMAGE: string;
  DEFAULT_PROMPT_VOICE: string;
  DEFAULT_PROMPT_TRANSFER: string;
  DEFAULT_PROMPT_SINGLE: string;
  DEFAULT_PROMPT_GROUP: string;
  STICKER_REGEX: RegExp;
}

export class AiResponseModule {
  private systemPromptService: SystemPromptService;

  constructor() {
    this.systemPromptService = new SystemPromptService();
  }

  // 触发AI响应
  async triggerAiResponse(): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    const musicState: MusicState = win.STATE?.musicState;
    // 修复：通过函数调用获取地址
    const myAddress: string = (typeof win.myAddress === 'function' ? win.myAddress() : win.STATE?.myAddress) || '位置未知';

    console.log('=== AI响应触发调试 ===');
    console.log('myAddress函数类型:', typeof win.myAddress);
    console.log('STATE.myAddress:', win.STATE?.myAddress);
    console.log('最终地址值:', myAddress);

    if (!state?.state?.activeChatId) return;

    const chatId = state.state.activeChatId;
    const chat = state.state.chats[chatId];

    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.style.display = 'block';
    }

    const apiConfig: ApiConfig = state.state.apiConfig;
    const {proxyUrl: rawProxyUrl, apiKey, model} = apiConfig;

    if (!rawProxyUrl || !apiKey || !model) {
      showApiConfigError();
      if (typingIndicator) {
        typingIndicator.style.display = 'none';
      }
      return;
    }

    // 处理/v1/v1问题
    let proxyUrl = rawProxyUrl ? rawProxyUrl.trim() : '';
    if (proxyUrl.endsWith('/')) {
      proxyUrl = proxyUrl.slice(0, -1);
    }
    if (proxyUrl.endsWith('/v1')) {
      proxyUrl = proxyUrl.slice(0, -3);
    }

    const now = new Date();
    const currentTime = now.toLocaleTimeString('zh-CN', {hour: 'numeric', minute: 'numeric', hour12: true});

    // 获取地理位置信息用于替换
    let addressForTemplate = '';
    if (state.state.globalSettings.enableGeolocation && myAddress !== '位置未知' && myAddress !== '位置获取失败') {
      addressForTemplate = myAddress; // 直接用城市名称
    }

    let myAddressInfo = '';
    if (state.state.globalSettings.enableGeolocation && myAddress !== '位置未知' && myAddress !== '位置获取失败') {
      myAddressInfo = `- **用户的当前位置**: ${myAddress}。\n`;
    }

    let worldBookContent = '';
    if (chat.settings.linkedWorldBookIds && chat.settings.linkedWorldBookIds.length > 0) {
      const linkedContents = chat.settings.linkedWorldBookIds.map(bookId => {
        const worldBook = state.state.worldBooks.find(wb => wb.id === bookId);
        return worldBook && worldBook.content ? `\n\n## 世界书: ${worldBook.name}\n${worldBook.content}` : '';
      }).filter(Boolean).join('');
      if (linkedContents) {
        worldBookContent = `\n\n# 核心世界观设定 (必须严格遵守以下所有设定)\n${linkedContents}\n`;
      }
    }

    let musicContext = '';
    if (musicState?.isActive && musicState.activeChatId === chatId && musicState.currentIndex > -1) {
      const currentTrack = musicState.playlist[musicState.currentIndex];
      musicContext = `\n\n# 当前情景\n你正在和用户一起听歌。当前播放的歌曲是：${currentTrack.name} - ${currentTrack.artist}。请在对话中自然地融入这个情境。\n`;
    }

    // === 系统提示生成：使用新的SystemPromptService ===
    let systemPrompt: string;
    let compositionHash: string;
    
    try {
      // 使用SystemPromptService生成系统提示
      const promptResult = await this.systemPromptService.generateSystemPrompt(
        chat, 
        {}, // worldBooksMap由SystemPromptService内部根据persona.worldBookLinks处理
        undefined // TODO: 记忆包集成
      );
      
      systemPrompt = promptResult.systemPrompt;
      compositionHash = promptResult.compositionHash;
      
      // 更新chat的compositionHash（用于版本一致性检查）
      if (chat.compositionHash !== compositionHash) {
        chat.compositionHash = compositionHash;
        await win.saveChat(chat);
      }
      
      console.log('✅ 使用新的SystemPromptService生成系统提示');
      
    } catch (error) {
      console.error('SystemPromptService失败，回退到原有逻辑:', error);
      
      // === 原有的系统提示生成逻辑（回退方案） ===
      const activePreset = win.getActivePreset();
      const constants: Constants = win.CONSTANTS;
      const DEFAULT_PROMPT_SINGLE = constants?.DEFAULT_PROMPT_SINGLE || '默认单聊提示词';
      const DEFAULT_PROMPT_GROUP = constants?.DEFAULT_PROMPT_GROUP || '默认群聊提示词';

      if (chat.isGroup) {
        const basGroupPrompt = activePreset?.promptGroup || DEFAULT_PROMPT_GROUP;
        systemPrompt = basGroupPrompt
          .replace('{myAddress}', addressForTemplate)
          .replace('{worldBookContent}', worldBookContent)
          .replace('{musicContext}', musicContext)
          .replace('{currentTime}', currentTime)
          .replace('{chat.settings.myPersona}', chat.settings.myPersona || '');
      } else {
        const baseSinglePrompt = activePreset?.promptSingle || DEFAULT_PROMPT_SINGLE;
        systemPrompt = baseSinglePrompt
          .replace('{myAddress}', addressForTemplate)
          .replace(/{chat.name}/g, chat.name)
          .replace(/{currentTime}/g, currentTime)
          .replace('{worldBookContent}', worldBookContent)
          .replace('{musicContext}', musicContext)
          .replace(/{chat.settings.aiPersona}/g, chat.settings.aiPersona || '')
          .replace(/{chat.settings.myPersona}/g, chat.settings.myPersona || '');
      }
    }

    // === 消息负载处理（保持现有逻辑） ===
    let messagesPayload: Array<{role: string, content: any}>;
    const maxMemory = parseInt(String(chat.settings.maxMemory)) || 10;
    const historySlice = chat.history.slice(-maxMemory);

    // 处理消息：普通消息处理 + UserRole注入
    messagesPayload = await Promise.all(historySlice.map(async msg => {
      // 处理特殊消息类型
      if (msg.type === 'pat') {
        return {role: 'user', content: `[拍一拍 ${msg.content}]`};
      }
      if (msg.type === 'user_photo') {
        return {
          role: 'user',
          content: `[你收到了一张用户描述的照片，照片内容是：'${msg.content}']`
        };
      }
      if (msg.type === 'ai_image') {
        return {
          role: 'assistant',
          content: JSON.stringify({type: 'ai_image', description: msg.content})
        };
      }
      if (msg.type === 'voice_message') {
        if (msg.role === 'user') {
          return {
            role: 'user',
            content: `[用户发来一条语音消息，内容是：'${msg.content}']`
          };
        } else {
          return {
            role: 'assistant',
            content: JSON.stringify({type: 'voice_message', content: msg.content})
          };
        }
      }
      if (msg.type === 'transfer') {
        if (msg.role === 'user') {
          return {
            role: 'user',
            content: `[你收到了来自用户的转账: ${(msg as any).amount}元, 备注: ${(msg as any).note}]`
          };
        } else {
          return {
            role: 'assistant',
            content: JSON.stringify({type: 'transfer', amount: (msg as any).amount, note: (msg as any).note})
          };
        }
      }
      if (msg.role === 'user' && (msg as any).meaning) {
        return {
          role: 'user',
          content: `[用户发送了一个表情，意思是：'${(msg as any).meaning}']`
        };
      }

      // 处理普通文本消息，并注入UserRole块
      if (msg.role === 'user' && (typeof msg.content === 'string' || Array.isArray(msg.content))) {
        try {
          const processedContent = await this.systemPromptService.injectUserRoleBlock(msg, chat);
          return {
            role: 'user',
            content: processedContent
          };
        } catch (error) {
          console.warn('UserRole注入失败，使用原始内容:', error);
          return {
            role: msg.role,
            content: msg.content
          };
        }
      }

      // 其他消息直接返回
      if (typeof msg.content === 'string' || Array.isArray(msg.content)) {
        return {
          role: msg.role,
          content: msg.content
        };
      }

      return null;
    }));
    
    // 过滤空消息
    messagesPayload = messagesPayload.filter(Boolean) as Array<{role: string, content: any}>;

    try {
      const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`},
        body: JSON.stringify({
          model: model,
          messages: [{role: 'system', content: systemPrompt}, ...messagesPayload],
          temperature: 0.8,
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const aiResponseContent = data.choices[0].message.content;
      const messagesArray = this.parseAiResponse(aiResponseContent);
      let notificationShown = false;
      const isViewingThisChat = document.getElementById('chat-interface-screen')?.classList.contains('active') && state.state.activeChatId === chatId;

      for (const msgData of messagesArray) {
        let aiMessage: Message;
        const senderName = chat.isGroup ? ((msgData as any).name || '未知') : chat.name;
        const receiverName = chat.isGroup ? ((msgData as any).receiver || '我') : '我';

        if (typeof msgData === 'object' && (msgData as any).type === 'voice_message') {
          aiMessage = {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: 'assistant',
            type: 'voice_message',
            content: (msgData as any).content,
            sender: senderName,
            timestamp: Date.now()
          } as any;
          (aiMessage as any).senderName = senderName;
        } else if (typeof msgData === 'object' && (msgData as any).type === 'ai_image') {
          aiMessage = {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: 'assistant',
            type: 'ai_image',
            content: (msgData as any).description,
            sender: senderName,
            timestamp: Date.now()
          } as any;
          (aiMessage as any).senderName = senderName;
        } else if (typeof msgData === 'object' && (msgData as any).type === 'transfer') {
          aiMessage = {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: 'assistant',
            type: 'transfer',
            content: '',
            sender: senderName,
            timestamp: Date.now()
          } as any;
          (aiMessage as any).senderName = senderName;
          (aiMessage as any).receiverName = receiverName;
          (aiMessage as any).amount = (msgData as any).amount;
          (aiMessage as any).note = (msgData as any).note;
        } else if (chat.isGroup) {
          if (typeof msgData === 'object' && (msgData as any).name && (msgData as any).message) {
            aiMessage = {
              id: `msg_${Date.now()}_${Math.random()}`,
              role: 'assistant',
              content: String((msgData as any).message),
              sender: (msgData as any).name,
              timestamp: Date.now()
            } as any;
            (aiMessage as any).senderName = (msgData as any).name;
          } else continue;
        } else {
          aiMessage = {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: 'assistant',
            content: String(msgData),
            sender: chat.name,
            timestamp: Date.now()
          };
        }

        chat.history.push(aiMessage);
        await DB.saveChat(chat);

        if (isViewingThisChat) {
          win.ChatModule.appendMessage(aiMessage, chat);
          await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 300));
        }

        if (!isViewingThisChat && !notificationShown) {
          let notificationText: string;
          const STICKER_REGEX = constants?.STICKER_REGEX || /^(https:\/\/i\.postimg\.cc\/.+|data:image)/;
          if (aiMessage.type === 'transfer') notificationText = `[收到一笔转账]`;
          else if (aiMessage.type === 'ai_image') notificationText = `[图片]`;
          else if (aiMessage.type === 'voice_message') notificationText = `[语音]`;
          else notificationText = STICKER_REGEX.test(String(aiMessage.content)) ? '[表情]' : String(aiMessage.content);
          const finalNotifText = chat.isGroup ? `${(aiMessage as any).senderName}: ${notificationText}` : notificationText;
          this.showNotification(chatId, finalNotifText);
          notificationShown = true;
        }
      }
    } catch (error: any) {
      const errorContent = `[出错了: ${error.message}]`;
      const errorMessage: Message = {
        id: `msg_${Date.now()}_${Math.random()}`,
        role: 'assistant',
        content: errorContent,
        sender: chat.name,
        timestamp: Date.now()
      };
      if (chat) {
        chat.history.push(errorMessage);
        await DB.saveChat(chat);

        if (document.getElementById('chat-interface-screen')?.classList.contains('active')) {
          win.ChatModule.appendMessage(errorMessage, chat);
        }
      }
      console.error(error);
    } finally {
      if (typingIndicator) {
        typingIndicator.style.display = 'none';
      }
      // 更新聊天列表
      win.ChatModule.renderChatList();
    }
  }

  // 解析AI响应内容
  parseAiResponse(content: string): any[] {
    if (!content || typeof content !== 'string') return [content];

    // 策略1: 直接JSON.parse
    try {
      const result = JSON.parse(content);
      if (Array.isArray(result)) return result;
      return [result];
    } catch (e) {}

    // 策略2: 正则匹配数组格式
    const arrayMatch = content.match(/\[(.*?)\]/s);
    if (arrayMatch) {
      try {
        const result = JSON.parse(arrayMatch[0]);
        if (Array.isArray(result)) return result;
        return [result];
      } catch (e) {}
    }

    // 策略3: 按行分割
    const lines = content.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length > 1) {
      return lines;
    }

    // 策略4: 返回原内容
    return [content];
  }

  // 显示通知
  private showNotification(chatId: string, messageContent: string): void {
    const win = window as any;
    if (win.showNotification) {
      win.showNotification(chatId, messageContent);
    }
  }
}

// === 全局单例实例 ===
export const aiResponseModule = new AiResponseModule();

// === 向后兼容：已统一迁移到init/compat.ts ===

// 默认导出
export default {
  aiResponseModule,
  AiResponseModule
};

console.log('AI响应模块(TypeScript版)已初始化');
