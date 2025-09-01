// 安全DOM构建器 - 替换innerHTML的安全构建函数
// Phase 4: 安全与一致性加固 - 统一安全渲染

import type { Message } from '../../state';

// === 安全转义函数 ===
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

// === 图片消息构建器 ===
export function buildImageBubble(description: string, isUserPhoto = false): HTMLElement {
  const img = document.createElement('img');
  img.src = 'https://i.postimg.cc/KYr2qRCK/1.jpg'; // 固定的安全图片URL
  img.className = 'ai-generated-image';
  img.alt = isUserPhoto ? '用户描述的照片' : 'AI生成的图片';
  img.setAttribute('data-description', sanitizeAttribute(description));
  return img;
}

// === 语音消息构建器 ===
export function buildVoiceBubble(content: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'voice-message-body';
  container.setAttribute('data-text', sanitizeAttribute(content));
  
  // 创建波形显示
  const waveform = document.createElement('div');
  waveform.className = 'voice-waveform';
  for (let i = 0; i < 5; i++) {
    const wave = document.createElement('div');
    waveform.appendChild(wave);
  }
  
  // 创建时长显示
  const duration = Math.max(1, Math.round((String(content) || '').length / 5));
  const durationFormatted = `0:${String(duration).padStart(2, '0')}''`;
  const durationSpan = document.createElement('span');
  durationSpan.className = 'voice-duration';
  durationSpan.textContent = durationFormatted;
  
  container.appendChild(waveform);
  container.appendChild(durationSpan);
  return container;
}

// === 转账消息构建器 ===
export function buildTransferCard(data: { amount: number; note?: string }, isUser = false): HTMLElement {
  const container = document.createElement('div');
  container.className = 'transfer-card';
  
  // 创建标题
  const title = document.createElement('div');
  title.className = 'transfer-title';
  
  const heartIcon = document.createElement('svg');
  heartIcon.setAttribute('viewBox', '0 0 24 24');
  heartIcon.setAttribute('width', '20');
  heartIcon.setAttribute('height', '20');
  heartIcon.setAttribute('fill', 'currentColor');
  heartIcon.style.cssText = 'vertical-align: middle;';
  
  const heartPath = document.createElement('path');
  heartPath.setAttribute('d', 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z');
  heartIcon.appendChild(heartPath);
  
  const titleText = document.createTextNode(` ${isUser ? '转账给Ta' : '收到一笔转账'}`);
  title.appendChild(heartIcon);
  title.appendChild(titleText);
  
  // 创建金额
  const amount = document.createElement('div');
  amount.className = 'transfer-amount';
  amount.textContent = `¥ ${Number(data.amount).toFixed(2)}`;
  
  // 创建备注
  const note = document.createElement('div');
  note.className = 'transfer-note';
  note.textContent = data.note || '对方没有留下备注哦~';
  
  container.appendChild(title);
  container.appendChild(amount);
  container.appendChild(note);
  return container;
}

// === 表情包构建器 ===
export function buildStickerBubble(imageUrl: string, meaning = 'Sticker'): HTMLElement {
  const img = document.createElement('img');
  img.src = sanitizeAttribute(imageUrl);
  img.alt = sanitizeAttribute(meaning);
  img.className = 'sticker-image';
  return img;
}

// === 用户图片构建器 ===
export function buildUserImageBubble(imageUrl: string): HTMLElement {
  const img = document.createElement('img');
  img.src = sanitizeAttribute(imageUrl);
  img.className = 'chat-image';
  img.alt = 'User uploaded image';
  return img;
}

// === 文本消息构建器 ===
export function buildTextContent(textContent: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const lines = escapeHtml(textContent).split('\n');
  
  lines.forEach((line, index) => {
    if (index > 0) {
      fragment.appendChild(document.createElement('br'));
    }
    fragment.appendChild(document.createTextNode(line));
  });
  
  return fragment;
}

// === 消息内容构建器主函数 ===
export function buildMessageContent(msg: Message, isUser = false): HTMLElement | DocumentFragment {
  if (msg.type === 'user_photo' || msg.type === 'ai_image') {
    return buildImageBubble(String(msg.content), msg.type === 'user_photo');
  }
  
  if (msg.type === 'voice_message') {
    return buildVoiceBubble(String(msg.content));
  }
  
  if (msg.type === 'transfer') {
    const transferData = msg as any;
    return buildTransferCard({
      amount: transferData.amount,
      note: transferData.note
    }, isUser);
  }
  
  // 检查是否为表情包
  const STICKER_REGEX = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
  if (typeof msg.content === 'string' && STICKER_REGEX.test(msg.content)) {
    return buildStickerBubble(msg.content, (msg as any).meaning);
  }
  
  // 检查是否为用户上传的图片（数组格式）
  if (Array.isArray(msg.content) && msg.content[0]?.type === 'image_url') {
    const imageUrl = msg.content[0].image_url.url;
    return buildUserImageBubble(imageUrl);
  }
  
  // 默认文本处理
  return buildTextContent(String(msg.content || ''));
}