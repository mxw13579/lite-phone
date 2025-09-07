// 安全DOM构建器 - 替换innerHTML的安全构建函数
// Phase 4: 安全与一致性加固 - 统一安全渲染

import type { Message } from '../../state';

// === 常量与工具 ===
const STICKER_REGEX = /^https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|gif|webp)(?:\?.*)?$/i;
const SAFE_IMAGE_FALLBACK = 'https://i.postimg.cc/KYr2qRCK/1.jpg';
const VOICE_WAVE_COUNT = 5;

function escapeHtml(unsafe: string): string {
  return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

// 仅对可注入文本的属性使用
function sanitizeTextAttr(value: string): string {
  return escapeHtml(value);
}

// 基础 URL 安全检查（协议白名单 + 无控制字符）
function basicIsSafeUrl(url: string): boolean {
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// DOM 辅助
function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    opts?: { className?: string; attrs?: Record<string, string>; text?: string }
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts?.className) node.className = opts.className;
  if (opts?.text != null) node.textContent = opts.text;
  if (opts?.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) {
      node.setAttribute(k, v);
    }
  }
  return node;
}
function txt(text: string): Text {
  return document.createTextNode(text);
}

// === 图片消息构建器 ===
export function buildImageBubble(description: string, isUserPhoto = false): HTMLElement {
  const img = el('img', { className: 'ai-generated-image' });
  img.src = SAFE_IMAGE_FALLBACK; // 固定的安全图片URL
  img.alt = isUserPhoto ? '用户描述的照片' : 'AI生成的图片';
  img.setAttribute('data-description', sanitizeTextAttr(description));
  return img;
}

// === 语音消息构建器 ===
export function buildVoiceBubble(content: string): HTMLElement {
  const container = el('div', { className: 'voice-message-body' });
  container.setAttribute('data-text', sanitizeTextAttr(content));

  // 波形
  const waveform = el('div', { className: 'voice-waveform' });
  const wavesFrag = document.createDocumentFragment();
  for (let i = 0; i < VOICE_WAVE_COUNT; i++) {
    wavesFrag.appendChild(document.createElement('div'));
  }
  waveform.appendChild(wavesFrag);

  // 时长
  const textLen = content?.length ?? 0;
  const duration = Math.max(1, Math.round(textLen / 5));
  const durationFormatted = `0:${String(duration).padStart(2, '0')}''`;
  const durationSpan = el('span', {
    className: 'voice-duration',
    text: durationFormatted,
  });

  container.appendChild(waveform);
  container.appendChild(durationSpan);
  return container;
}

// === 转账消息构建器 ===
function createHeartIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'currentColor');
  (svg.style as CSSStyleDeclaration).verticalAlign = 'middle';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
      'd',
      'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
  );
  svg.appendChild(path);
  return svg;
}

type TransferMessage = Message & { amount: number; note?: string };

export function buildTransferCard(data: { amount: number; note?: string }, isUser = false): HTMLElement {
  const container = el('div', { className: 'transfer-card' });

  // 标题
  const title = el('div', { className: 'transfer-title' });
  title.appendChild(createHeartIcon());
  title.appendChild(txt(` ${isUser ? '转账给Ta' : '收到一笔转账'}`));

  // 金额
  const amount = el('div', {
    className: 'transfer-amount',
    text: `¥ ${Number(data.amount).toFixed(2)}`,
  });

  // 备注
  const note = el('div', {
    className: 'transfer-note',
    text: data.note || '对方没有留下备注哦~',
  });

  const frag = document.createDocumentFragment();
  frag.appendChild(title);
  frag.appendChild(amount);
  frag.appendChild(note);
  container.appendChild(frag);
  return container;
}

// === 表情包构建器 ===
export function buildStickerBubble(imageUrl: string, meaning = 'Sticker'): HTMLElement {
  const img = el('img', { className: 'sticker-image' });
  img.alt = sanitizeTextAttr(meaning);
  img.src = basicIsSafeUrl(imageUrl) ? imageUrl : SAFE_IMAGE_FALLBACK;
  return img;
}

// === 用户图片构建器 ===
export function buildUserImageBubble(imageUrl: string): HTMLElement {
  const img = el('img', { className: 'chat-image' });
  img.alt = 'User uploaded image';
  img.src = basicIsSafeUrl(imageUrl) ? imageUrl : SAFE_IMAGE_FALLBACK;
  return img;
}

// === 文本消息构建器 ===
export function buildTextContent(textContent: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const safe = escapeHtml(textContent);
  const parts = safe.split('\n');
  for (let i = 0; i < parts.length; i++) {
    if (i) fragment.appendChild(document.createElement('br'));
    fragment.appendChild(txt(parts[i]));
  }
  return fragment;
}

// === 消息内容构建器主函数 ===
export function buildMessageContent(msg: Message, isUser = false): HTMLElement | DocumentFragment {
  switch (msg.type) {
    case 'user_photo':
    case 'ai_image':
      return buildImageBubble(String(msg.content), msg.type === 'user_photo');

    case 'voice_message':
      return buildVoiceBubble(String(msg.content ?? ''));

    case 'transfer': {
      const m = msg as unknown as TransferMessage;
      return buildTransferCard({ amount: m.amount, note: m.note }, isUser);
    }

    default: {
      // 表情包链接
      if (typeof msg.content === 'string' && STICKER_REGEX.test(msg.content)) {
        const meaning = (msg as Partial<{ meaning: string }>).meaning ?? 'Sticker';
        return buildStickerBubble(msg.content, meaning);
      }
      // 用户上传图片（数组格式）
      if (Array.isArray(msg.content) && msg.content[0]?.type === 'image_url') {
        const imageUrl = msg.content[0].image_url.url;
        return buildUserImageBubble(imageUrl);
      }
      // 默认文本
      return buildTextContent(String(msg.content ?? ''));
    }
  }
}
