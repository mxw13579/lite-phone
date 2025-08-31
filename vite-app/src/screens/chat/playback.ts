// 语音回放模块 - 负责语音录制、停止、语音消息播放和播放状态UI同步
// 提取自 chat.ts 的语音处理相关功能

import type { Message, Chat } from '../../state';

// === 类型定义 ===
interface StateManager {
  state: {
    chats: Record<string, Chat>;
    activeChatId: string | null;
  };
}

interface DatabaseManager {
  db: {
    chats: {
      put: (chat: Chat) => Promise<void>;
    };
  };
}

// === 语音播放状态 ===
interface VoicePlaybackState {
  isPlaying: boolean;
  currentElement: HTMLElement | null;
  currentAudio: HTMLAudioElement | null;
  playingTimestamp: number | null;
}

// === 模块状态变量 ===
let voicePlaybackState: VoicePlaybackState = {
  isPlaying: false,
  currentElement: null,
  currentAudio: null,
  playingTimestamp: null
};

// === 语音回放模块类 ===
export class VoicePlaybackModule {
  // 发送语音消息
  async sendVoiceMessage(content: string): Promise<void> {
    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    
    if (!state?.state?.activeChatId) {
      alert('请先选择一个聊天');
      return;
    }
    
    const chat = state.state.chats[state.state.activeChatId];
    if (!chat) return;
    
    const msg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      role: 'user',
      type: 'voice_message',
      content,
      timestamp: Date.now()
    };
    
    chat.history.push(msg);
    await db.db.chats.put(chat);
    
    // 渲染消息
    if (win.CHAT_MODULES?.renderModule?.appendMessage) {
      win.CHAT_MODULES.renderModule.appendMessage(msg, chat);
    }
    if (win.CHAT_MODULES?.renderModule?.renderChatList) {
      win.CHAT_MODULES.renderModule.renderChatList();
    }
  }

  // 播放语音消息
  async playVoiceMessage(element: HTMLElement, text: string, timestamp: number): Promise<void> {
    // 如果当前正在播放其他语音，先停止
    if (voicePlaybackState.isPlaying && voicePlaybackState.playingTimestamp !== timestamp) {
      this.stopVoicePlayback();
    }
    
    // 如果点击的是当前正在播放的语音，则停止播放
    if (voicePlaybackState.isPlaying && voicePlaybackState.playingTimestamp === timestamp) {
      this.stopVoicePlayback();
      return;
    }
    
    try {
      // 开始播放
      voicePlaybackState.isPlaying = true;
      voicePlaybackState.currentElement = element;
      voicePlaybackState.playingTimestamp = timestamp;
      
      // 更新UI状态
      this.updateVoiceElementUI(element, 'playing');
      
      // 使用 Web Speech API 朗读文本
      await this.speakText(text);
      
      // 播放完成
      this.stopVoicePlayback();
      
    } catch (error) {
      console.error('语音播放失败:', error);
      this.stopVoicePlayback();
      alert('语音播放失败，请检查系统音频设置');
    }
  }

  // 停止语音播放
  stopVoicePlayback(): void {
    if (voicePlaybackState.currentAudio) {
      voicePlaybackState.currentAudio.pause();
      voicePlaybackState.currentAudio.currentTime = 0;
    }
    
    // 停止语音合成
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    
    if (voicePlaybackState.currentElement) {
      this.updateVoiceElementUI(voicePlaybackState.currentElement, 'stopped');
    }
    
    // 重置状态
    voicePlaybackState = {
      isPlaying: false,
      currentElement: null,
      currentAudio: null,
      playingTimestamp: null
    };
  }

  // 使用语音合成朗读文本
  private speakText(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.speechSynthesis) {
        reject(new Error('浏览器不支持语音合成'));
        return;
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // 设置语音参数
      utterance.lang = 'zh-CN';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      utterance.onend = () => {
        resolve();
      };
      
      utterance.onerror = (error) => {
        reject(error);
      };
      
      window.speechSynthesis.speak(utterance);
    });
  }

  // 更新语音元素UI状态
  private updateVoiceElementUI(element: HTMLElement, state: 'playing' | 'stopped'): void {
    const waveform = element.querySelector('.voice-waveform');
    const duration = element.querySelector('.voice-duration');
    
    if (state === 'playing') {
      element.classList.add('playing');
      if (waveform) {
        waveform.classList.add('animate');
      }
      if (duration) {
        duration.textContent = '播放中...';
      }
    } else {
      element.classList.remove('playing');
      if (waveform) {
        waveform.classList.remove('animate');
      }
      if (duration) {
        const voiceBody = element.closest('.voice-message-body');
        if (voiceBody) {
          const originalText = voiceBody.getAttribute('data-text') || '';
          const calculatedDuration = Math.max(1, Math.round(originalText.length / 5));
          const durationFormatted = `0:${String(calculatedDuration).padStart(2, '0')}''`;
          duration.textContent = durationFormatted;
        }
      }
    }
  }

  // 绑定语音消息点击事件
  bindVoiceMessageEvents(): void {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const voiceBody = target.closest('.voice-message-body') as HTMLElement;
      
      if (voiceBody) {
        e.preventDefault();
        const text = voiceBody.getAttribute('data-text') || '';
        const bubble = voiceBody.closest('.message-bubble') as HTMLElement;
        const timestamp = bubble ? parseInt(bubble.dataset.timestamp || '0', 10) : 0;
        
        if (text && timestamp) {
          this.playVoiceMessage(voiceBody, text, timestamp);
        }
      }
    });
  }

  // 录制语音功能（模拟实现）
  async startVoiceRecording(): Promise<void> {
    // 这里可以集成实际的录音功能
    // 目前使用文本输入模拟
    const text = prompt('请输入要转换为语音的文字内容:');
    if (!text || !text.trim()) return;
    
    await this.sendVoiceMessage(text.trim());
  }

  // 检查语音播放支持
  isVoicePlaybackSupported(): boolean {
    return 'speechSynthesis' in window;
  }

  // 获取可用的语音列表
  getAvailableVoices(): SpeechSynthesisVoice[] {
    if (!window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices();
  }

  // 设置语音参数
  setVoiceSettings(settings: {
    rate?: number;
    pitch?: number;
    volume?: number;
    lang?: string;
  }): void {
    // 这里可以保存语音设置，在下次播放时使用
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceSettings', JSON.stringify(settings));
    }
  }

  // 获取语音设置
  getVoiceSettings(): {
    rate: number;
    pitch: number;
    volume: number;
    lang: string;
  } {
    const defaultSettings = {
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      lang: 'zh-CN'
    };
    
    if (typeof window === 'undefined') return defaultSettings;
    
    try {
      const saved = localStorage.getItem('voiceSettings');
      if (saved) {
        return { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.warn('读取语音设置失败:', error);
    }
    
    return defaultSettings;
  }

  // 获取当前播放状态
  getPlaybackState(): VoicePlaybackState {
    return { ...voicePlaybackState };
  }

  // 暂停所有语音播放
  pauseAllVoicePlayback(): void {
    if (window.speechSynthesis) {
      window.speechSynthesis.pause();
    }
  }

  // 恢复语音播放
  resumeVoicePlayback(): void {
    if (window.speechSynthesis) {
      window.speechSynthesis.resume();
    }
  }

  // 初始化语音功能
  initVoicePlayback(): void {
    // 绑定语音消息点击事件
    this.bindVoiceMessageEvents();
    
    // 页面卸载时停止所有播放
    window.addEventListener('beforeunload', () => {
      this.stopVoicePlayback();
    });
    
    // 页面隐藏时暂停播放
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && voicePlaybackState.isPlaying) {
        this.pauseAllVoicePlayback();
      } else if (!document.hidden && voicePlaybackState.isPlaying) {
        this.resumeVoicePlayback();
      }
    });
    
    console.log('语音播放功能已初始化');
  }
}

// === 全局单例实例 ===
export const voicePlaybackModule = new VoicePlaybackModule();

// === 默认导出 ===
export default voicePlaybackModule;