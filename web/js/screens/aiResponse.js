// AI响应处理模块 - screens/aiResponse.js
// 处理AI聊天响应的核心逻辑

// 触发AI响应
export async function triggerAiResponse() {
    const state = window.STATE?.state;
    const musicState = window.STATE?.musicState;
    const myAddress = window.STATE?.myAddress || '位置未知';
    
    if (!state?.activeChatId) return;
    
    const chatId = state.activeChatId;
    const chat = state.chats[chatId];
    
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.style.display = 'block';
    }

    const {proxyUrl: rawProxyUrl, apiKey, model} = state.apiConfig;

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
    let myAddressInfo = '';
    if (state.globalSettings.enableGeolocation && myAddress !== '位置未知' && myAddress !== '位置获取失败') {
        myAddressInfo = `- **用户的当前位置**: ${myAddress}。\n`;
    }
    
    let worldBookContent = '';
    if (chat.settings.linkedWorldBookIds && chat.settings.linkedWorldBookIds.length > 0) {
        const linkedContents = chat.settings.linkedWorldBookIds.map(bookId => {
            const worldBook = state.worldBooks.find(wb => wb.id === bookId);
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
    
    let systemPrompt, messagesPayload;
    const maxMemory = parseInt(chat.settings.maxMemory) || 10;
    const historySlice = chat.history.slice(-maxMemory);
    const activePreset = window.STATE.getActivePreset();
    
    const constants = window.CONSTANTS;
    const DEFAULT_PROMPT_IMAGE = constants?.DEFAULT_PROMPT_IMAGE || '默认图片提示词';
    const DEFAULT_PROMPT_VOICE = constants?.DEFAULT_PROMPT_VOICE || '默认语音提示词';
    const DEFAULT_PROMPT_TRANSFER = constants?.DEFAULT_PROMPT_TRANSFER || '默认转账提示词';
    const DEFAULT_PROMPT_SINGLE = constants?.DEFAULT_PROMPT_SINGLE || '默认单聊提示词';
    const DEFAULT_PROMPT_GROUP = constants?.DEFAULT_PROMPT_GROUP || '默认群聊提示词';
    
    const aiImageInstructions = activePreset?.promptImage || DEFAULT_PROMPT_IMAGE;
    const aiVoiceInstructions = activePreset?.promptVoice || DEFAULT_PROMPT_VOICE;
    const transferInstructions = activePreset?.promptTransfer || DEFAULT_PROMPT_TRANSFER;
    
    if (chat.isGroup) {
        const membersList = chat.members.map(m => `- **${m.name}**: ${m.persona}`).join('\n');
        const myNickname = chat.settings.myNickname || '我';
        const groupAiImageInstructions = `\n# 发送图片的能力\n- 群成员无法真正发送图片文件。但当用户要求某位成员发送照片，或者某个成员想通过图片来表达时，该成员可以发送一张"文字描述的图片"。\n- 若要发送图片，请在你的回复JSON数组中，为该角色单独发送一个特殊的对象，格式为：\`{"name": "角色名", "type": "ai_image", "description": "这里是对图片的详细文字描述..."}\`。描述应该符合该角色的性格和当时的语境。`;
        const groupAiVoiceInstructions = `\n# 发送语音的能力\n- 群成员同样可以发送"模拟语音消息"。\n- 若要发送语音，请为该角色单独发送一个特殊的对象，格式为：\`{"name": "角色名", "type": "voice_message", "content": "这里是语音的文字内容..."}\`。当历史记录中出现 "[角色名 发送了一条语音，内容是：'xxx']" 时，代表该角色用语音说了'xxx'。其他角色应该对此内容做出回应。`;
        let baseGroupPrompt = activePreset?.promptGroup || DEFAULT_PROMPT_GROUP;
        systemPrompt = baseGroupPrompt
            .replace('{myAddress}', myAddressInfo)
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
            const sender = msg.role === 'user' ? (chat.settings.myNickname || '我') : msg.senderName;
            let content;
            if (msg.type === 'user_photo') content = `[${sender} 发送了一张描述的照片，内容是：'${msg.content}']`;
            else if (msg.type === 'ai_image') content = `[${sender} 发送了一张图片]`;
            else if (msg.type === 'voice_message') content = `[${sender} 发送了一条语音，内容是：'${msg.content}']`;
            else if (msg.type === 'transfer') content = `[${msg.senderName}向${msg.receiverName}转账 ${msg.amount}元, 备注: ${msg.note}]`;
            else if (msg.meaning) content = `${sender}: [发送了一个表情，意思是: '${msg.meaning}']`;
            else if (Array.isArray(msg.content)) content = [...msg.content, {type: 'text', text: `${sender}:`}];
            else content = `${sender}: ${msg.content}`;
            return {role: 'user', content: content};
        });
    } else {
        let baseSinglePrompt = activePreset?.promptSingle || DEFAULT_PROMPT_SINGLE;
        systemPrompt = baseSinglePrompt
            .replace('{myAddress}', myAddressInfo)
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
                    content: `[你收到了来自用户的转账: ${msg.amount}元, 备注: ${msg.note}]`
                };
                else return {
                    role: 'assistant',
                    content: JSON.stringify({type: 'transfer', amount: msg.amount, note: msg.note})
                };
            }
            if (msg.role === 'user' && msg.meaning) return {
                role: 'user',
                content: `[用户发送了一个表情，意思是：'${msg.meaning}']`
            };
            if (typeof msg.content === 'string' || Array.isArray(msg.content)) return {
                role: msg.role,
                content: msg.content
            };
            return null;
        }).filter(Boolean);
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
            throw new Error(`API Error: ${response.status} - ${errorData.error.message}`);
        }
        
        const data = await response.json();
        const aiResponseContent = data.choices[0].message.content;
        const messagesArray = parseAiResponse(aiResponseContent);
        let notificationShown = false;
        const isViewingThisChat = document.getElementById('chat-interface-screen')?.classList.contains('active') && state.activeChatId === chatId;
        
        for (const msgData of messagesArray) {
            let aiMessage;
            const senderName = chat.isGroup ? (msgData.name || '未知') : chat.name;
            const receiverName = chat.isGroup ? (msgData.receiver || '我') : '我';
            
            if (typeof msgData === 'object' && msgData.type === 'voice_message') {
                aiMessage = {
                    role: 'assistant',
                    type: 'voice_message',
                    content: msgData.content,
                    senderName: senderName,
                    timestamp: Date.now()
                };
            } else if (typeof msgData === 'object' && msgData.type === 'ai_image') {
                aiMessage = {
                    role: 'assistant',
                    type: 'ai_image',
                    content: msgData.description,
                    senderName: senderName,
                    timestamp: Date.now()
                };
            } else if (typeof msgData === 'object' && msgData.type === 'transfer') {
                aiMessage = {
                    role: 'assistant',
                    type: 'transfer',
                    amount: msgData.amount,
                    note: msgData.note,
                    senderName: senderName,
                    receiverName: receiverName,
                    timestamp: Date.now()
                };
            } else if (chat.isGroup) {
                if (typeof msgData === 'object' && msgData.name && msgData.message) aiMessage = {
                    role: 'assistant',
                    senderName: msgData.name,
                    content: String(msgData.message),
                    timestamp: Date.now()
                }; else continue;
            } else {
                aiMessage = {role: 'assistant', content: String(msgData), timestamp: Date.now()};
            }
            
            chat.history.push(aiMessage);
            await window.DB.db.chats.put(chat);
            
            if (isViewingThisChat) {
                // 使用全局暴露的ChatModule
                window.ChatModule.appendMessage(aiMessage, chat);
                await new Promise(resolve => setTimeout(resolve, Math.random() * 800 + 300));
            }
            
            if (!isViewingThisChat && !notificationShown) {
                let notificationText;
                const STICKER_REGEX = window.CONSTANTS?.STICKER_REGEX || /^(https:\/\/i\.postimg\.cc\/.+|data:image)/;
                if (aiMessage.type === 'transfer') notificationText = `[收到一笔转账]`; 
                else if (aiMessage.type === 'ai_image') notificationText = `[图片]`; 
                else if (aiMessage.type === 'voice_message') notificationText = `[语音]`; 
                else notificationText = STICKER_REGEX.test(aiMessage.content) ? '[表情]' : String(aiMessage.content);
                const finalNotifText = chat.isGroup ? `${aiMessage.senderName}: ${notificationText}` : notificationText;
                showNotification(chatId, finalNotifText);
                notificationShown = true;
            }
        }
    } catch (error) {
        const errorContent = `[出错了: ${error.message}]`;
        const errorMessage = {role: 'assistant', content: errorContent, timestamp: Date.now()};
        if (chat) {
            chat.history.push(errorMessage);
            await window.DB.db.chats.put(chat);
            
            if (document.getElementById('chat-interface-screen')?.classList.contains('active')) {
                window.ChatModule.appendMessage(errorMessage, chat);
            }
        }
        console.error(error);
    } finally {
        if (typingIndicator) {
            typingIndicator.style.display = 'none';
        }
        // 更新聊天列表
        window.ChatModule.renderChatList();
    }
}

// AI响应解析函数
function parseAiResponse(content) {
    try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) return parsed;
    } catch (e) {
        // JSON解析失败，继续尝试其他方法
    }
    
    try {
        const match = content.match(/\[(.*?)\]/s);
        if (match && match[0]) {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        // 正则匹配JSON解析失败
    }
    
    const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('```'));
    if (lines.length > 0) return lines;
    
    return [content];
}

// 显示通知
function showNotification(chatId, messageContent) {
    if (window.UIService && window.UIService.showNotification) {
        window.UIService.showNotification(chatId, messageContent);
    }
}

export { parseAiResponse };

console.log('AI响应处理模块已初始化');