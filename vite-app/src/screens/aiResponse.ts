// AI响应处理模块 - TypeScript版本
// 处理AI聊天响应的核心逻辑

import type { Message, Chat, StateManager, DatabaseManager, ApiConfig, MusicState, Preset } from '../state';

interface Constants {
  DEFAULT_PROMPT_IMAGE: string;
  DEFAULT_PROMPT_VOICE: string;
  DEFAULT_PROMPT_TRANSFER: string;
  DEFAULT_PROMPT_SINGLE: string;
  DEFAULT_PROMPT_GROUP: string;
  STICKER_REGEX: RegExp;
}

export class AiResponseModule {
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
      alert('请先在API设置中配置反代地址、密钥并选择模型。');
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
      musicContext = `\n\n# 当前情景\n你正在和用户一起听歌。当前播放的歌曲是：${currentTrack.title} - ${currentTrack.artist}。请在对话中自然地融入这个情境。\n`;
    }

    let systemPrompt: string;
    let messagesPayload: Array<{role: string, content: any}>;
    const maxMemory = parseInt(String(chat.settings.maxMemory)) || 10;
    const historySlice = chat.history.slice(-maxMemory);
    const activePreset = win.getActivePreset();

    const constants: Constants = win.CONSTANTS;
    const DEFAULT_PROMPT_IMAGE = constants?.DEFAULT_PROMPT_IMAGE || '默认图片提示词';
    const DEFAULT_PROMPT_VOICE = constants?.DEFAULT_PROMPT_VOICE || '默认语音提示词';
    const DEFAULT_PROMPT_TRANSFER = constants?.DEFAULT_PROMPT_TRANSFER || '默认转账提示词';
    const DEFAULT_PROMPT_SINGLE = constants?.DEFAULT_PROMPT_SINGLE || '默认单聊提示词';
    const DEFAULT_PROMPT_GROUP = constants?.DEFAULT_PROMPT_GROUP || '默认群聊提示词';

    const aiImageInstructions = activePreset?.promptImage || DEFAULT_PROMPT_IMAGE;
    const aiVoiceInstructions = activePreset?.promptVoice || DEFAULT_PROMPT_VOICE;
    const transferInstructions = activePreset?.promptTransfer || DEFAULT_PROMPT_TRANSFER;
    
    console.log('=== AI响应调试信息 ===');
    console.log('地理位置开关:', state.state.globalSettings.enableGeolocation);
    console.log('原始地址:', myAddress);
    console.log('模板地址:', addressForTemplate);
    console.log('聊天类型:', chat.isGroup ? '群聊' : '单聊');

    if (chat.isGroup && chat.members) {
      const membersList = chat.members.map(m => `- **${m.name}**: ${m.persona}`).join('\n');
      const myNickname = chat.settings.myGroupNickname || '我';
      const groupAiImageInstructions = `\n# 发送图片的能力\n- 群成员无法真正发送图片文件。但当用户要求某位成员发送照片，或者某个成员想通过图片来表达时，该成员可以发送一张"文字描述的图片"。\n- 若要发送图片，请在你的回复JSON数组中，为该角色单独发送一个特殊的对象，格式为：\`{"name": "角色名", "type": "ai_image", "description": "这里是对图片的详细文字描述..."}\`。描述应该符合该角色的性格和当时的语境。`;
      const groupAiVoiceInstructions = `\n# 发送语音的能力\n- 群成员同样可以发送"模拟语音消息"。\n- 若要发送语音，请为该角色单独发送一个特殊的对象，格式为：\`{"name": "角色名", "type": "voice_message", "content": "这里是语音的文字内容..."}\`。当历史记录中出现 "[角色名 发送了一条语音，内容是：'xxx']" 时，代表该角色用语音说了'xxx'。其他角色应该对此内容做出回应。`;
      let baseGroupPrompt = activePreset?.promptGroup || DEFAULT_PROMPT_GROUP;
      console.log('myAddress:', addressForTemplate)
      systemPrompt = baseGroupPrompt
        .replace('{myAddress}', addressForTemplate)
        .replace('{worldBookContent}', worldBookContent)
        .replace('{musicContext}', musicContext)
        .replace('{currentTime}', currentTime)
        .replace('{chat.settings.myPersona}', chat.settings.myPersona || '')
        .replace(/{myNickname}/g, myNickname)
        .replace('{groupAiImageInstructions}', groupAiImageInstructions)
        .replace('{groupAiVoiceInstructions}', groupAiVoiceInstructions)
        .replace('{membersList}', membersList);
      messagesPayload = historySlice.map(msg => {
        if (msg.type === 'pat') {
          return {role: 'user', content: `[拍一拍 ${msg.content}]`};
        }
        const sender = msg.role === 'user' ? (chat.settings.myGroupNickname || '我') : (msg as any).senderName;
        let content: any;
        if (msg.type === 'user_photo') content = `[${sender} 发送了一张描述的照片，内容是：'${msg.content}']`;
        else if (msg.type === 'ai_image') content = `[${sender} 发送了一张图片]`;
        else if (msg.type === 'voice_message') content = `[${sender} 发送了一条语音，内容是：'${msg.content}']`;
        else if (msg.type === 'transfer') content = `[${(msg as any).senderName}向${(msg as any).receiverName}转账 ${(msg as any).amount}元, 备注: ${(msg as any).note}]`;
        else if ((msg as any).meaning) content = `${sender}: [发送了一个表情，意思是: '${(msg as any).meaning}']`;
        else if (Array.isArray(msg.content)) content = [...msg.content, {type: 'text', text: `${sender}:`}];
        else content = `${sender}: ${msg.content}`;
        return {role: 'user', content: content};
      });
    } else {
      let baseSinglePrompt = activePreset?.promptSingle || DEFAULT_PROMPT_SINGLE;
      systemPrompt = baseSinglePrompt
        .replace('{myAddress}', addressForTemplate)
        .replace(/{chat.name}/g, chat.name)
        .replace(/{currentTime}/g, currentTime)
        .replace('{worldBookContent}', worldBookContent)
        .replace('{musicContext}', musicContext)
        .replace(/{chat.settings.aiPersona}/g, chat.settings.aiPersona || '')
        .replace(/{chat.settings.myPersona}/g, chat.settings.myPersona || '')
        .replace('{aiImageInstructions}', aiImageInstructions)
        .replace('{aiVoiceInstructions}', aiVoiceInstructions)
        .replace('{transferInstructions}', transferInstructions);
      messagesPayload = historySlice.map(msg => {
        if (msg.type === 'pat') {
          return {role: 'user', content: `[拍一拍 ${msg.content}]`};
        }
        if (msg.type === 'user_photo') return {
          role: 'user',
          content: `[你收到了一张用户描述的照片，照片内容是：'${msg.content}']`
        };
        if (msg.type === 'ai_image') return {
          role: 'assistant',
          content: JSON.stringify({type: 'ai_image', description: msg.content})
        };
        if (msg.type === 'voice_message') {
          if (msg.role === 'user') return {
            role: 'user',
            content: `[用户发来一条语音消息，内容是：'${msg.content}']`
          };
          else return {
            role: 'assistant',
            content: JSON.stringify({type: 'voice_message', content: msg.content})
          };
        }
        if (msg.type === 'transfer') {
          if (msg.role === 'user') return {
            role: 'user',
            content: `[你收到了来自用户的转账: ${(msg as any).amount}元, 备注: ${(msg as any).note}]`
          };
          else return {
            role: 'assistant',
            content: JSON.stringify({type: 'transfer', amount: (msg as any).amount, note: (msg as any).note})
          };
        }
        if (msg.role === 'user' && (msg as any).meaning) return {
          role: 'user',
          content: `[用户发送了一个表情，意思是：'${(msg as any).meaning}']`
        };
        if (typeof msg.content === 'string' || Array.isArray(msg.content)) return {
          role: msg.role,
          content: msg.content
        };
        return null;
      }).filter(Boolean) as Array<{role: string, content: any}>;
    }

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
        await win.DB.db.chats.put(chat);

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
        await win.DB.db.chats.put(chat);

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

// === 向后兼容：注入到window对象 ===
// 注入到window对象，保持向后兼容性（简化类型声明）
if (typeof window !== 'undefined') {
  const win = window as any;

  // 主模块实例
  win.AiResponseModule = aiResponseModule;

  // AI响应核心API
  win.triggerAiResponse = () => aiResponseModule.triggerAiResponse();
  win.parseAiResponse = (content: string) => aiResponseModule.parseAiResponse(content);
}

// 默认导出
export default {
  aiResponseModule,
  AiResponseModule
};

console.log('AI响应模块(TypeScript版)已初始化');
