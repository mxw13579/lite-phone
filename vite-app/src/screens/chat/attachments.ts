// 附件处理模块 - 负责图片选择、上传、压缩、文件校验和附件预览
// 提取自 chat.ts 的附件处理相关功能
// Phase 2+4: 使用DB仓库访问 + 统一错误处理

import type { Message, Chat } from '../../state';
import DB from '../../database';
import { showError, showSuccess, showValidationError, showOperationError } from '../../services/errorHandling';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_COMPRESS = { maxWidth: 800, maxHeight: 600, quality: 0.8 } as const;

const CLASSNAMES = {
  aiImage: 'ai-generated-image',
  chatImage: 'chat-image',
  stickerImage: 'sticker-image',
};

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRuntime() {
  const win = window as any;
  const state = win?.STATE as { state: { chats: Record<string, Chat>; activeChatId: string | null; userStickers: Array<{ id: string; url: string; name: string }> } } | undefined;
  const modules = win?.CHAT_MODULES as any | undefined;
  return { state, modules };
}

/** 创建文件输入控件并返回 Promise，解析用户选择的 FileList */
function createFileInput(options: { multiple: boolean; accept: string }): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept;
    input.multiple = options.multiple;

    const cleanup = () => {
      input.onchange = null;
      if (input.parentNode) input.parentNode.removeChild(input);
    };

    input.style.position = 'fixed';
    input.style.left = '-9999px';
    document.body.appendChild(input);

    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const files = target.files ?? null;
      cleanup();
      resolve(files);
    };

    input.click();
  });
}

/** 统一封装操作的错误提示，返回是否成功 */
async function withOperation(operationName: string, task: () => Promise<void>): Promise<boolean> {
  try {
    await task();
    return true;
  } catch (err) {
    console.error(`${operationName} 失败:`, err);
    showOperationError(operationName, err as Error);
    return false;
  }
}

interface StateManager {
  state: {
    chats: Record<string, Chat>;
    activeChatId: string | null;
    userStickers: Array<{ id: string; url: string; name: string }>;
  };
}

export class AttachmentHandlerModule {
  async compressImage(
      file: File,
      maxWidth = DEFAULT_COMPRESS.maxWidth,
      maxHeight = DEFAULT_COMPRESS.maxHeight,
      quality = DEFAULT_COMPRESS.quality
  ): Promise<string> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const _img = new Image();
        _img.onload = () => resolve(_img);
        _img.onerror = reject;
        _img.src = objectUrl;
      });

      let { width, height } = img;
      const needScale = width > maxWidth || height > maxHeight;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D 上下文获取失败');

      if (needScale) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      return canvas.toDataURL('image/jpeg', quality);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  validateImageFile(file: File): { valid: boolean; error?: string } {
    if (!file.type || !file.type.startsWith('image/')) {
      return { valid: false, error: '请选择图片文件' };
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return { valid: false, error: '图片文件不能超过10MB' };
    }
    return { valid: true };
  }

  async handleImageSelect(callback?: (imageDataUrl: string) => void): Promise<void> {
    const files = await createFileInput({ multiple: false, accept: 'image/*' });
    if (!files || files.length === 0) return;

    const file = files[0];
    const validation = this.validateImageFile(file);
    if (!validation.valid) {
      showError(validation.error);
      return;
    }

    const ok = await withOperation('图片处理', async () => {
      const compressedImage = await this.compressImage(file);
      if (callback) {
        callback(compressedImage);
      } else {
        await this.sendImageMessage(compressedImage);
      }
    });
    // ok 为 boolean，不再触发 TS1345
    if (!ok) return;
  }

  async sendImageMessage(imageDataUrl: string): Promise<void> {
    const { state, modules } = getRuntime();
    if (!state?.state?.activeChatId) {
      showError('请先选择一个聊天');
      return;
    }
    const chat = state.state.chats[state.state.activeChatId];
    if (!chat) {
      showError('聊天不存在或已被删除');
      return;
    }

    const now = Date.now();
    const msg: Message = {
      id: createMessageId(),
      sender: 'user',
      role: 'user',
      content: imageDataUrl,
      type: 'image',
      timestamp: now,
    };

    chat.history.push(msg);
    await DB.saveChat(chat);

    modules?.renderModule?.appendMessage?.(msg, chat);
    modules?.renderModule?.renderChatList?.();
  }

  async addStickerFromFile(): Promise<void> {
    await this.handleImageSelect(async (imageDataUrl: string) => {
      const name = prompt('请输入表情包名称:');
      if (!name || !name.trim()) {
        showValidationError('表情包名称不能为空');
        return;
      }

      const { state, modules } = getRuntime();
      if (!state) return;

      const sticker = {
        id: createMessageId(),
        url: imageDataUrl,
        name: name.trim(),
      };

      const ok = await withOperation('添加表情包', async () => {
        await DB.saveUserSticker(sticker);
      });
      if (!ok) return;

      state.state.userStickers.push(sticker);
      modules?.composerModule?.renderStickerPanel?.();
      showSuccess('表情包添加成功！');
    });
  }

  async addStickerFromUrl(): Promise<void> {
    const url = prompt('请输入图片链接:');
    if (!url || !url.trim()) return;

    const name = prompt('请输入表情包名称:');
    if (!name || !name.trim()) {
      showValidationError('表情包名称不能为空');
      return;
    }

    try {
      new URL(url);
    } catch {
      showError('请输入有效的图片链接');
      return;
    }

    const { state, modules } = getRuntime();
    if (!state) return;

    const sticker = {
      id: createMessageId(),
      url: url.trim(),
      name: name.trim(),
    };

    const ok = await withOperation('添加表情包', async () => {
      await DB.saveUserSticker(sticker);
    });
    if (!ok) return;

    state.state.userStickers.push(sticker);
    modules?.composerModule?.renderStickerPanel?.();
    showSuccess('表情包添加成功！');
  }

  showImagePreview(imageSrc: string, description?: string): void {
    const modal = document.createElement('div');
    modal.className = 'image-preview-modal';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      cursor: pointer;
    `;

    const img = document.createElement('img');
    img.src = imageSrc;
    img.style.cssText = `
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
    `;
    if (description) {
      img.alt = description;
      img.title = description;
    }

    const close = () => {
      document.body.removeChild(modal);
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    modal.appendChild(img);
    modal.addEventListener('click', close);
    img.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('keydown', onKey);

    document.body.appendChild(modal);
  }

  bindImagePreviewEvents(): void {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const imgEl = target.closest('img');
      if (!imgEl) return;

      const classList = imgEl.classList;
      const isAi = classList.contains(CLASSNAMES.aiImage);
      const isChat = classList.contains(CLASSNAMES.chatImage);
      const isSticker = classList.contains(CLASSNAMES.stickerImage);
      if (!isAi && !isChat && !isSticker) return;

      e.preventDefault();
      const src = imgEl.getAttribute('src');
      if (!src) return;

      const desc =
          (isAi && imgEl.getAttribute('data-description')) ||
          (isSticker && imgEl.getAttribute('alt')) ||
          undefined;

      this.showImagePreview(src, desc || undefined);
    });
  }

  async handleBatchImageUpload(): Promise<void> {
    const files = await createFileInput({ multiple: true, accept: 'image/*' });
    if (!files || files.length === 0) return;

    const list = Array.from(files);
    const validFiles: File[] = [];
    let failCount = 0;

    for (const file of list) {
      const validation = this.validateImageFile(file);
      if (!validation.valid) {
        console.warn(`文件 ${file.name} 校验失败:`, validation.error);
        failCount++;
      } else {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      showError('所有图片处理失败，请检查文件格式和大小');
      return;
    }

    const results = await Promise.allSettled(
        validFiles.map(async (file) => {
          const img = await this.compressImage(file);
          await this.sendImageMessage(img);
        })
    );

    let successCount = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') successCount++;
      else failCount++;
    }

    if (successCount > 0) {
      showSuccess(`成功发送 ${successCount} 张图片${failCount > 0 ? `，失败 ${failCount} 张` : ''}`);
    } else {
      showError('所有图片处理失败，请检查文件格式和大小');
    }
  }

  async getImageMetadata(file: File): Promise<{ width: number; height: number; size: number; type: string; name: string }> {
    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const _img = new Image();
        _img.onload = () => resolve(_img);
        _img.onerror = reject;
        _img.src = objectUrl;
      });
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        size: file.size,
        type: file.type,
        name: file.name,
      };
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

export const attachmentHandlerModule = new AttachmentHandlerModule();
export default attachmentHandlerModule;
