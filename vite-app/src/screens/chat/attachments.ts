// 附件处理模块 - 负责图片选择、上传、压缩、文件校验和附件预览
// 提取自 chat.ts 的附件处理相关功能

import type { Message, Chat } from '../../state';

// === 类型定义 ===
interface StateManager {
  state: {
    chats: Record<string, Chat>;
    activeChatId: string | null;
    userStickers: Array<{ id: string; url: string; name: string }>;
  };
}

interface DatabaseManager {
  db: {
    chats: {
      put: (chat: Chat) => Promise<void>;
    };
    userStickers: {
      put: (sticker: any) => Promise<void>;
    };
  };
}

// === 附件处理模块类 ===
export class AttachmentHandlerModule {
  // 图片压缩函数
  compressImage(file: File, maxWidth = 800, maxHeight = 600, quality = 0.8): Promise<string> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      
      img.onload = () => {
        // 计算压缩后的尺寸
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width *= ratio;
          height *= ratio;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // 绘制并压缩
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  // 文件校验
  validateImageFile(file: File): { valid: boolean; error?: string } {
    // 检查文件类型
    if (!file.type.startsWith('image/')) {
      return { valid: false, error: '请选择图片文件' };
    }
    
    // 检查文件大小 (10MB 限制)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return { valid: false, error: '图片文件不能超过10MB' };
    }
    
    return { valid: true };
  }

  // 图片选择和处理
  async handleImageSelect(callback?: (imageDataUrl: string) => void): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = false;
    
    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (!target.files || target.files.length === 0) return;
      
      const file = target.files[0];
      const validation = this.validateImageFile(file);
      
      if (!validation.valid) {
        alert(validation.error);
        return;
      }
      
      try {
        // 压缩图片
        const compressedImage = await this.compressImage(file);
        
        if (callback) {
          callback(compressedImage);
        } else {
          // 默认行为：发送图片消息
          await this.sendImageMessage(compressedImage);
        }
      } catch (error) {
        console.error('图片处理失败:', error);
        alert('图片处理失败，请重试');
      }
    };
    
    input.click();
  }

  // 发送图片消息
  async sendImageMessage(imageDataUrl: string): Promise<void> {
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
      content: imageDataUrl,
      type: 'image',
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

  // 添加表情包
  async addStickerFromFile(): Promise<void> {
    await this.handleImageSelect(async (imageDataUrl: string) => {
      const name = prompt('请输入表情包名称:');
      if (!name || !name.trim()) {
        alert('表情包名称不能为空');
        return;
      }
      
      const win = window as any;
      const state: StateManager = win.STATE;
      const db: DatabaseManager = win.DB;
      
      const sticker = {
        id: Date.now().toString(),
        url: imageDataUrl,
        name: name.trim()
      };
      
      await db.db.userStickers.put(sticker);
      state.state.userStickers.push(sticker);
      
      // 重新渲染表情面板
      if (win.CHAT_MODULES?.composerModule?.renderStickerPanel) {
        win.CHAT_MODULES.composerModule.renderStickerPanel();
      }
      
      alert('表情包添加成功！');
    });
  }

  // 从URL添加表情包
  async addStickerFromUrl(): Promise<void> {
    const url = prompt('请输入图片链接:');
    if (!url || !url.trim()) return;
    
    const name = prompt('请输入表情包名称:');
    if (!name || !name.trim()) {
      alert('表情包名称不能为空');
      return;
    }
    
    // 验证URL格式
    try {
      new URL(url);
    } catch {
      alert('请输入有效的图片链接');
      return;
    }
    
    const win = window as any;
    const state: StateManager = win.STATE;
    const db: DatabaseManager = win.DB;
    
    const sticker = {
      id: Date.now().toString(),
      url: url.trim(),
      name: name.trim()
    };
    
    try {
      await db.db.userStickers.put(sticker);
      state.state.userStickers.push(sticker);
      
      // 重新渲染表情面板
      if (win.CHAT_MODULES?.composerModule?.renderStickerPanel) {
        win.CHAT_MODULES.composerModule.renderStickerPanel();
      }
      
      alert('表情包添加成功！');
    } catch (error) {
      console.error('添加表情包失败:', error);
      alert('添加表情包失败，请重试');
    }
  }

  // 附件预览功能
  showImagePreview(imageSrc: string, description?: string): void {
    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'image-preview-modal';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
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
    
    modal.appendChild(img);
    
    // 点击关闭
    modal.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
    
    // 阻止图片点击事件冒泡
    img.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    document.body.appendChild(modal);
  }

  // 绑定图片点击预览事件
  bindImagePreviewEvents(): void {
    // 为聊天界面中的图片绑定预览事件
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // AI生成的图片
      if (target.classList.contains('ai-generated-image')) {
        e.preventDefault();
        const description = target.getAttribute('data-description');
        this.showImagePreview(target.getAttribute('src')!, description || undefined);
      }
      
      // 聊天中的图片
      if (target.classList.contains('chat-image')) {
        e.preventDefault();
        this.showImagePreview(target.getAttribute('src')!);
      }
      
      // 表情包图片
      if (target.classList.contains('sticker-image')) {
        e.preventDefault();
        const meaning = target.getAttribute('alt');
        this.showImagePreview(target.getAttribute('src')!, meaning || undefined);
      }
    });
  }

  // 批量上传图片
  async handleBatchImageUpload(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    
    input.onchange = async (e) => {
      const target = e.target as HTMLInputElement;
      if (!target.files || target.files.length === 0) return;
      
      const files = Array.from(target.files);
      let successCount = 0;
      let failCount = 0;
      
      for (const file of files) {
        const validation = this.validateImageFile(file);
        
        if (!validation.valid) {
          console.warn(`文件 ${file.name} 校验失败:`, validation.error);
          failCount++;
          continue;
        }
        
        try {
          const compressedImage = await this.compressImage(file);
          await this.sendImageMessage(compressedImage);
          successCount++;
        } catch (error) {
          console.error(`处理文件 ${file.name} 失败:`, error);
          failCount++;
        }
      }
      
      // 显示结果
      if (successCount > 0) {
        alert(`成功发送 ${successCount} 张图片${failCount > 0 ? `，失败 ${failCount} 张` : ''}`);
      } else {
        alert('所有图片处理失败，请检查文件格式和大小');
      }
    };
    
    input.click();
  }

  // 获取图片元数据
  getImageMetadata(file: File): Promise<{ width: number; height: number; size: number; type: string; name: string }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight,
          size: file.size,
          type: file.type,
          name: file.name
        });
      };
      
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
}

// === 全局单例实例 ===
export const attachmentHandlerModule = new AttachmentHandlerModule();

// === 默认导出 ===
export default attachmentHandlerModule;