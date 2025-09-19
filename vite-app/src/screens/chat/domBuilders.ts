// 安全DOM构建器 - 类型修复与优化版

import type { Message } from '../../state';

// ========== 常量与工具 ==========
const STICKER_REGEX = /^https?:\/\/[^\s]+?\.(?:jpg|jpeg|png|gif|webp)(?:\?.*)?$/i;
const SAFE_IMAGE_FALLBACK = 'https://i.postimg.cc/KYr2qRCK/1.jpg' as const;
const VOICE_WAVE_COUNT = 5 as const;
const SVG_NS = 'http://www.w3.org/2000/svg' as const;
const HTTP_PROTOCOLS = new Set(['http:', 'https:'] as const);

function escapeHtml(unsafe: string): string {
  return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
}

function sanitizeTextAttr(value: string): string {
  return escapeHtml(value);
}

function basicIsSafeUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length === 0) return false;
  const lower = url.slice(0, 8).toLowerCase();
  if (!(lower.startsWith('http://') || lower.startsWith('https://'))) return false;
  try {
    const u = new URL(url, window.location.origin);
    return HTTP_PROTOCOLS.has(u.protocol as 'http:' | 'https:');
  } catch {
    return false;
  }
}

// DOM 工厂（增强）
type ElOpts = {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
};
function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    opts?: ElOpts
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (!opts) return node;
  const { className, text, attrs, dataset, style } = opts;
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v != null) node.setAttribute(k, v);
    }
  }
  if (dataset) {
    for (const k in dataset) {
      const v = dataset[k];
      if (v != null) (node.dataset as DOMStringMap)[k] = v;
    }
  }
  if (style) Object.assign(node.style, style);
  return node;
}

function elNS<K extends keyof SVGElementTagNameMap>(
    tag: K,
    ns: string = SVG_NS
): SVGElementTagNameMap[K] {
  // 显式断言为 SVG 元素映射的 K 对应类型，避免被推断为 Element
  return document.createElementNS(ns, tag) as SVGElementTagNameMap[K];
}

function txt(text: string): Text {
  return document.createTextNode(text);
}

// ========== 类型与守卫 ==========
type TransferMessage = Message & { type: 'transfer'; amount: number; note?: string };

// 对最小消息形态的补充，避免 never
type ContentArrayImage =
    | { type: 'image_url'; image_url: { url: string } }
    | { type: string; [k: string]: unknown };

function isStickerMessage(
    msg: Message
): msg is Message & { content: string; meaning?: string } {
  const c = (msg as any).content;
  return typeof c === 'string' && STICKER_REGEX.test(c);
}

function isUserImageMessage(
    msg: Message
): msg is Message & { content: ContentArrayImage[] } {
  const c = (msg as any).content;
  return Array.isArray(c) && c.length > 0 && c[0]?.type === 'image_url' && typeof c[0]?.image_url?.url === 'string';
}

// ========== 图片消息构建器 ==========
export function buildImageBubble(description: string, isUserPhoto = false): HTMLElement {
  const img = el('img', { className: 'ai-generated-image' });
  img.src = SAFE_IMAGE_FALLBACK;
  img.alt = isUserPhoto ? '用户描述的照片' : 'AI生成的图片';
  img.dataset.description = sanitizeTextAttr(description);
  return img;
}

// ========== 语音消息构建器 ==========
export function buildVoiceBubble(content: string): HTMLElement {
  const safeContent = content ?? '';
  const container = el('div', {
    className: 'voice-message-body',
    dataset: { text: sanitizeTextAttr(safeContent) },
  });

  const waveform = el('div', { className: 'voice-waveform' });
  const waveUnit = document.createElement('div');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < VOICE_WAVE_COUNT; i++) {
    frag.appendChild(waveUnit.cloneNode(false));
  }
  waveform.appendChild(frag);

  const textLen = safeContent.length;
  const duration = Math.max(1, Math.round(textLen / 5));
  const durationFormatted = `0:${String(duration).padStart(2, '0')}''`;
  const durationSpan = el('span', { className: 'voice-duration', text: durationFormatted });

  container.appendChild(waveform);
  container.appendChild(durationSpan);
  return container;
}

// ========== 转账消息构建器 ==========
function createHeartIcon(): SVGSVGElement {
  const svg = elNS('svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'currentColor');
  (svg.style as CSSStyleDeclaration).verticalAlign = 'middle';
  const path = elNS('path');
  path.setAttribute(
      'd',
      'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
  );
  svg.appendChild(path);
  return svg;
}

export function buildTransferCard(
    data: { amount: number; note?: string },
    isUser = false
): HTMLElement {
  const container = el('div', { className: 'transfer-card' });

  const title = el('div', { className: 'transfer-title' });
  title.appendChild(createHeartIcon());
  title.appendChild(txt(` ${isUser ? '转账给Ta' : '收到一笔转账'}`));

  const amount = el('div', {
    className: 'transfer-amount',
    text: `¥ ${Number(data.amount).toFixed(2)}`,
  });

  const noteText = data.note ? data.note : '对方没有留下备注哦~';
  const note = el('div', { className: 'transfer-note', text: noteText });

  const frag = document.createDocumentFragment();
  frag.appendChild(title);
  frag.appendChild(amount);
  frag.appendChild(note);
  container.appendChild(frag);
  return container;
}

// ========== 表情包构建器 ==========
export function buildStickerBubble(imageUrl: string, meaning = 'Sticker'): HTMLElement {
  const img = el('img', { className: 'sticker-image' });
  img.alt = sanitizeTextAttr(meaning);
  img.src = basicIsSafeUrl(imageUrl) ? imageUrl : SAFE_IMAGE_FALLBACK;
  return img;
}

// ========== 用户图片构建器 ==========
export function buildUserImageBubble(imageUrl: string): HTMLElement {
  const img = el('img', { className: 'chat-image' });
  img.alt = 'User uploaded image';
  img.src = basicIsSafeUrl(imageUrl) ? imageUrl : SAFE_IMAGE_FALLBACK;
  return img;
}

// ========== 文本消息构建器 ==========
export function buildTextContent(textContent: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const safe = escapeHtml(textContent ?? '');
  const lineBreak = document.createElement('br');
  const parts = safe.split('\n');
  for (let i = 0; i < parts.length; i++) {
    if (i) fragment.appendChild(lineBreak.cloneNode(false));
    fragment.appendChild(txt(parts[i]));
  }
  return fragment;
}

// ========== 消息内容构建器主函数 ==========
export function buildMessageContent(msg: Message, isUser = false): HTMLElement | DocumentFragment {
  switch (msg.type) {
    case 'user_photo':
    case 'ai_image':
      return buildImageBubble(String((msg as any).content), msg.type === 'user_photo');

    case 'voice_message':
      return buildVoiceBubble(String((msg as any).content ?? ''));

    case 'transfer': {
      const m = msg as TransferMessage;
      return buildTransferCard({ amount: m.amount, note: m.note }, isUser);
    }

    default: {
      if (isStickerMessage(msg)) {
        const meaning = (msg as Partial<{ meaning: string }>).meaning ?? 'Sticker';
        // isStickerMessage 保证 content 为 string
        return buildStickerBubble((msg as any).content, meaning);
      }
      if (isUserImageMessage(msg)) {
        const imageUrl = (msg as any).content[0].image_url.url as string;
        return buildUserImageBubble(imageUrl);
      }
      return buildTextContent(String((msg as any).content ?? ''));
    }
  }
}
