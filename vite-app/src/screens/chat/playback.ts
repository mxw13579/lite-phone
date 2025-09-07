// 语音回放模块 - 优化版
// 改进点：依赖注入、私有状态、取消控制、缓存设置/voices、减少 DOM 查询、统一错误处理、去模块级可变全局

import type { Message, Chat } from '../../state';
import DB from '../../database';
import { showError, showOperationError } from '../../services/errorHandling';

type Renderer = {
  appendMessage?: (msg: Message, chat: Chat) => void;
  renderChatList?: () => void;
};

interface StateManager {
  state: {
    chats: Record<string, Chat>;
    activeChatId: string | null;
  };
}

const SELECTORS = {
  waveform: '.voice-waveform',
  duration: '.voice-duration',
  voiceBody: '.voice-message-body',
  messageBubble: '.message-bubble',
} as const;

const DATA_KEYS = {
  text: 'data-text',
  timestamp: 'timestamp',
} as const;

interface VoicePlaybackState {
  isPlaying: boolean;
  currentElement: HTMLElement | null;
  playingTimestamp: number | null;
}

type VoiceSettings = {
  rate: number;
  pitch: number;
  volume: number;
  lang: string;
};

const DEFAULT_SETTINGS: VoiceSettings = {
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  lang: 'zh-CN',
};

function safeNow(): number {
  return performance.now ? Math.floor(performance.timeOrigin + performance.now()) : Date.now();
}

function genId(): string {
  // 更低冲突概率
  return `${safeNow()}-${Math.random().toString(36).slice(2, 10)}`;
}

function calcDurationFromText(text: string): string {
  const seconds = Math.max(1, Math.round(text.trim().length / 5));
  return `0:${String(seconds).padStart(2, '0')}''`;
}

export class VoicePlaybackModule {
  private stateMgr?: StateManager;
  private renderer?: Renderer;

  // 播放状态（私有，去除模块级可变全局）
  private playback: VoicePlaybackState = {
    isPlaying: false,
    currentElement: null,
    playingTimestamp: null,
  };

  // 取消控制
  private abortCtrl: AbortController | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  // 缓存
  private cachedSettings: VoiceSettings | null = null;
  private cachedVoices: SpeechSynthesisVoice[] | null = null;

  private inited = false;

  constructor(opts?: { state?: StateManager; renderer?: Renderer }) {
    this.stateMgr = opts?.state ?? (window as any).STATE;
    this.renderer = opts?.renderer ?? (window as any)?.CHAT_MODULES?.renderModule;
  }

  // 发送语音消息
  async sendVoiceMessage(content: string): Promise<void> {
    const state = this.stateMgr;
    if (!state?.state?.activeChatId) {
      showError('请先选择一个聊天');
      return;
    }

    const chat = state.state.chats[state.state.activeChatId];
    if (!chat) {
      showError('聊天不存在或已被删除');
      return;
    }

    const timestamp = safeNow();
    const msg: Message = {
      id: genId(),
      sender: 'user',
      role: 'user',
      type: 'voice_message',
      content,
      timestamp,
    };

    try {
      chat.history.push(msg);
      await DB.saveChat(chat);
    } catch (e) {
      showOperationError('保存语音消息失败', e);
      return;
    }

    try {
      this.renderer?.appendMessage?.(msg, chat);
      this.renderer?.renderChatList?.();
    } catch (e) {
      // 渲染失败不影响主流程
      console.warn('渲染语音消息失败:', e);
    }
  }

  // 播放语音消息
  async playVoiceMessage(element: HTMLElement, text: string, timestamp: number): Promise<void> {
    if (!this.isVoicePlaybackSupported()) {
      showError('当前浏览器不支持语音播放');
      return;
    }

    // 同一条：切换停止
    if (this.playback.isPlaying && this.playingSame(timestamp)) {
      this.stopVoicePlayback();
      return;
    }

    // 不同条：先停止
    if (this.playback.isPlaying && !this.playingSame(timestamp)) {
      this.stopVoicePlayback();
    }

    // 启动新播放
    this.abortCtrl = new AbortController();
    const signal = this.abortCtrl.signal;
    this.playback = {
      isPlaying: true,
      currentElement: element,
      playingTimestamp: timestamp,
    };

    // 更新 UI
    this.updateVoiceElementUI(element, 'playing');

    try {
      const utter = await this.createUtterance(text);
      this.currentUtterance = utter;

      const endPromise = new Promise<void>((resolve, reject) => {
        utter.onend = () => resolve();
        utter.onerror = (err) => reject(err);
        utter.onpause = () => {}; // 预留
        utter.onresume = () => {};
        // speechSynthesis.cancel() 触发 onend
      });

      // 支持取消
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      signal.addEventListener('abort', () => {
        try {
          window.speechSynthesis?.cancel();
        } catch {}
      });

      window.speechSynthesis!.speak(utter);
      await endPromise;
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        console.error('语音播放失败:', e);
        showError('语音播放失败，请检查系统音频设置');
      }
    } finally {
      // 若仍是当前播放，复位
      if (this.playingSame(timestamp)) {
        this.resetPlaybackUI();
        this.resetState();
      }
    }
  }

  // 停止语音播放
  stopVoicePlayback(): void {
    if (!this.playback.isPlaying) return;
    this.abortCtrl?.abort();
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    this.resetPlaybackUI();
    this.resetState();
  }

  // 录制语音功能（模拟实现）
  async startVoiceRecording(): Promise<void> {
    const text = prompt('请输入要转换为语音的文字内容:');
    if (!text?.trim()) return;
    await this.sendVoiceMessage(text.trim());
  }

  // 检查语音播放支持
  isVoicePlaybackSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  // 获取可用的语音列表（带缓存）
  getAvailableVoices(): SpeechSynthesisVoice[] {
    if (!this.isVoicePlaybackSupported()) return [];
    if (this.cachedVoices && this.cachedVoices.length) return this.cachedVoices;
    const voices = window.speechSynthesis.getVoices();
    // 某些浏览器异步加载 voices
    if (!voices.length) {
      window.speechSynthesis.onvoiceschanged = () => {
        this.cachedVoices = window.speechSynthesis.getVoices();
      };
    }
    this.cachedVoices = voices;
    return voices;
  }

  // 设置语音参数（持久化 + 内存缓存）
  setVoiceSettings(settings: Partial<VoiceSettings>): void {
    const merged = { ...this.getVoiceSettings(), ...settings };
    this.cachedSettings = merged;
    try {
      localStorage.setItem('voiceSettings', JSON.stringify(merged));
    } catch (e) {
      console.warn('保存语音设置失败:', e);
    }
  }

  // 获取语音设置（带缓存）
  getVoiceSettings(): VoiceSettings {
    if (this.cachedSettings) return this.cachedSettings;
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const saved = localStorage.getItem('voiceSettings');
      this.cachedSettings = saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch (e) {
      console.warn('读取语音设置失败:', e);
      this.cachedSettings = DEFAULT_SETTINGS;
    }
    return this.cachedSettings!;
  }

  // 获取当前播放状态（快照）
  getPlaybackState(): VoicePlaybackState {
    return { ...this.playback };
  }

  // 暂停所有语音播放
  pauseAllVoicePlayback(): void {
    try {
      window.speechSynthesis?.pause();
    } catch {}
  }

  // 恢复语音播放
  resumeVoicePlayback(): void {
    try {
      window.speechSynthesis?.resume();
    } catch {}
  }

  // 初始化语音功能（防重复）
  initVoicePlayback(): void {
    if (this.inited) return;
    this.inited = true;

    // 绑定语音消息点击事件（事件委托）
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const voiceBody = target.closest(SELECTORS.voiceBody) as HTMLElement | null;
      if (!voiceBody) return;

      e.preventDefault();
      const text = voiceBody.getAttribute(DATA_KEYS.text) || '';
      const bubble = voiceBody.closest(SELECTORS.messageBubble) as HTMLElement | null;
      const tsRaw = bubble?.dataset?.[DATA_KEYS.timestamp] ?? '0';
      const timestamp = Number.parseInt(tsRaw, 10);

      if (!text || !Number.isFinite(timestamp) || timestamp <= 0) return;
      void this.playVoiceMessage(voiceBody, text, timestamp);
    });

    // 页面卸载时停止所有播放
    window.addEventListener('beforeunload', () => this.stopVoicePlayback());

    // 页面可见性变化
    document.addEventListener('visibilitychange', () => {
      if (!this.playback.isPlaying) return;
      if (document.hidden) this.pauseAllVoicePlayback();
      else this.resumeVoicePlayback();
    });

    // 预热 voices
    this.getAvailableVoices();

    console.log('语音播放功能已初始化');
  }

  // 私有工具

  private playingSame(ts: number): boolean {
    return this.playback.playingTimestamp === ts && this.playback.isPlaying;
  }

  private resetState(): void {
    this.playback = {
      isPlaying: false,
      currentElement: null,
      playingTimestamp: null,
    };
    this.abortCtrl = null;
    this.currentUtterance = null;
  }

  private resetPlaybackUI(): void {
    const el = this.playback.currentElement;
    if (el) this.updateVoiceElementUI(el, 'stopped');
  }

  private async createUtterance(text: string): Promise<SpeechSynthesisUtterance> {
    if (!this.isVoicePlaybackSupported()) throw new Error('浏览器不支持语音合成');

    const utterance = new SpeechSynthesisUtterance(text);
    const settings = this.getVoiceSettings();

    utterance.lang = settings.lang;
    utterance.rate = settings.rate;
    utterance.pitch = settings.pitch;
    utterance.volume = settings.volume;

    // 选择匹配的 voice（若存在）
    const voices = this.getAvailableVoices();
    if (voices.length) {
      const match = voices.find(v => v.lang === settings.lang) || voices[0];
      if (match) utterance.voice = match;
    }

    return utterance;
  }

  // 更新语音元素UI状态
  private updateVoiceElementUI(element: HTMLElement, state: 'playing' | 'stopped'): void {
    const waveform = element.querySelector(SELECTORS.waveform) as HTMLElement | null;
    const duration = element.querySelector(SELECTORS.duration) as HTMLElement | null;

    if (state === 'playing') {
      element.classList.add('playing');
      waveform?.classList.add('animate');
      if (duration) duration.textContent = '播放中...';
      return;
    }

    // stopped
    element.classList.remove('playing');
    waveform?.classList.remove('animate');
    if (duration) {
      // 避免在 DOM 树上做多次查找，复用 element.parent 关系
      const text = (element.getAttribute(DATA_KEYS.text) || '').trim();
      duration.textContent = calcDurationFromText(text);
    }
  }
}

// === 全局单例实例 ===
export const voicePlaybackModule = new VoicePlaybackModule();

// === 默认导出 ===
export default voicePlaybackModule;
