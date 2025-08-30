// 数据管理服务 - 数据统计、备份导出、导入还原
// 从services/index.ts中提取的DataService类

import type { Chat, MusicLibrary, PersonaPreset, UserSticker } from '../state';

// === 类型定义 ===
interface ModalOptions {
  confirmText?: string;
  confirmButtonClass?: string;
}

interface DataStats {
  chats: number;
  userStickers: number;
  worldBooks: number;
  personaPresets: number;
  totalMessages: number;
  dataSize: number;
}

interface Track {
  name: string;
  artist: string;
  src: string | Blob;
  isLocal: boolean;
  requiresReupload?: boolean;
}

interface DatabaseManager {
  db: any; // Dexie数据库实例
}

export class DataService {
  // 导出数据
  async exportData(): Promise<void> {
    try {
      const win = window as any;
      const db: DatabaseManager = win.DB;
      if (!db?.db) {
        throw new Error('数据库实例未初始化');
      }

      let globalSettings = await db.db.globalSettings.get('main') || {};
      if (!globalSettings.id) globalSettings.id = "main";
      if (!globalSettings.wallpaper) globalSettings.wallpaper = "linear-gradient(135deg, #89f7fe, #66a6ff)";

      const backupData = {
        chats: await db.db.chats.toArray(),
        apiConfig: await db.db.apiConfig.get('main') || {},
        globalSettings: globalSettings,
        userStickers: await db.db.userStickers.toArray(),
        worldBooks: await db.db.worldBooks.toArray(),
        musicLibrary: await db.db.musicLibrary.get('main') || {playlist: []},
        personaPresets: await db.db.personaPresets.toArray()
      };

      // 处理本地音乐文件
      if (backupData.musicLibrary.playlist) {
        backupData.musicLibrary.playlist = backupData.musicLibrary.playlist.map((track: Track) => {
          if (track.isLocal) {
            return {...track, src: null, isLocal: true, requiresReupload: true};
          }
          return track;
        });
      }

      const jsonString = JSON.stringify(backupData);
      const dataBlob = new Blob([jsonString]);

      // 使用Gzip压缩数据
      const compressionStream = new CompressionStream('gzip');
      const compressedStream = dataBlob.stream().pipeThrough(compressionStream);
      const compressedBlob = await new Response(compressedStream).blob();

      const url = URL.createObjectURL(compressedBlob);
      const a = document.createElement('a');
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
      a.href = url;
      a.download = `EPhone_backup_${date}_${time}.phone`; // 使用.phone扩展名
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (win.showCustomAlert) {
        win.showCustomAlert("导出成功", "所有数据已成功压缩并导出为.phone文件。");
      }
      console.log('数据导出成功');
    } catch (error: any) {
      console.error("导出失败:", error);
      const win = window as any;
      if (win.showCustomAlert) {
        win.showCustomAlert("导出失败", `发生错误: ${error.message}`);
      } else {
        alert(`导出失败: ${error.message}`);
      }
    }
  }

  // 导入数据
  async importData(file: File): Promise<void> {
    if (!file) return;

    const confirmed = await this.showConfirm(
      '确认导入',
      '警告：导入数据将覆盖当前所有聊天记录和设置。此操作不可撤销。确定要继续吗？',
      {confirmButtonClass: 'btn-danger', confirmText: '我确定，导入'}
    );

    if (!confirmed) {
      return;
    }

    try {
      const win = window as any;
      const db: DatabaseManager = win.DB;
      if (!db?.db) {
        throw new Error('数据库实例未初始化');
      }

      // 解压文件流
      const decompressionStream = new DecompressionStream('gzip');
      const decompressedStream = file.stream().pipeThrough(decompressionStream);
      const jsonString = await new Response(decompressedStream).text();

      const backupData = JSON.parse(jsonString);

      if (!backupData.chats || !backupData.apiConfig || !backupData.globalSettings) {
        throw new Error("备份文件格式无效或已损坏。");
      }

      if (!backupData.globalSettings.id) {
        backupData.globalSettings.id = "main";
      }
      if (!backupData.globalSettings.wallpaper) {
        backupData.globalSettings.wallpaper = "linear-gradient(135deg, #89f7fe, #66a6ff)";
      }

      await db.db.transaction('rw', db.db.tables, async () => {
        await Promise.all(db.db.tables.map((table: any) => table.clear()));
        if (backupData.chats && backupData.chats.length > 0) await db.db.chats.bulkAdd(backupData.chats);
        if (backupData.userStickers && backupData.userStickers.length > 0) await db.db.userStickers.bulkAdd(backupData.userStickers);
        if (backupData.worldBooks && backupData.worldBooks.length > 0) await db.db.worldBooks.bulkAdd(backupData.worldBooks);
        if (backupData.personaPresets && backupData.personaPresets.length > 0) await db.db.personaPresets.bulkAdd(backupData.personaPresets);
        await db.db.apiConfig.put(backupData.apiConfig);
        await db.db.globalSettings.put(backupData.globalSettings);
        if (backupData.musicLibrary) {
          const playlist = backupData.musicLibrary.playlist.filter((t: Track) => !t.requiresReupload);
          await db.db.musicLibrary.put({id: 'main', playlist: playlist});
          const reuploadCount = backupData.musicLibrary.playlist.length - playlist.length;
          if (reuploadCount > 0) {
            if (win.showCustomAlert) {
              win.showCustomAlert("部分导入", `${reuploadCount}首本地歌曲需要您重新手动添加。`);
            }
          }
        }
      });

      if (win.showCustomAlert) {
        await win.showCustomAlert("导入成功", "数据已成功恢复。应用即将刷新。");
      }
      window.location.reload();

    } catch (error: any) {
      console.error("导入失败:", error);
      const win = window as any;
      if (win.showCustomAlert) {
        await win.showCustomAlert("导入失败", `解压或解析文件时发生错误: ${error.message}`);
      } else {
        alert(`导入失败: ${error.message}`);
      }
    }
  }

  // 处理文件导入事件
  handleImportDataEvent(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.importData(file).finally(() => {
        input.value = '';
      });
    }
  }

  // 数据清理工具
  async clearAllData(): Promise<void> {
    const confirmed = await this.showConfirm(
      '清空所有数据',
      '警告：此操作将删除所有聊天记录、设置和用户数据。此操作不可撤销！确定要继续吗？',
      {confirmButtonClass: 'btn-danger', confirmText: '我确定，清空'}
    );

    if (!confirmed) return;

    try {
      const win = window as any;
      const db: DatabaseManager = win.DB;
      if (!db?.db) {
        throw new Error('数据库实例未初始化');
      }

      await db.db.transaction('rw', db.db.tables, async () => {
        await Promise.all(db.db.tables.map((table: any) => table.clear()));
      });

      if (win.showCustomAlert) {
        await win.showCustomAlert("清空成功", "所有数据已清空。应用即将刷新。");
      }
      window.location.reload();
    } catch (error: any) {
      console.error("清空数据失败:", error);
      const win = window as any;
      if (win.showCustomAlert) {
        win.showCustomAlert("清空失败", `发生错误: ${error.message}`);
      } else {
        alert(`清空失败: ${error.message}`);
      }
    }
  }

  // 获取数据统计信息
  async getDataStats(): Promise<DataStats> {
    try {
      const win = window as any;
      const db: DatabaseManager = win.DB;
      if (!db?.db) {
        throw new Error('数据库实例未初始化');
      }

      const stats: DataStats = {
        chats: await db.db.chats.count(),
        userStickers: await db.db.userStickers.count(),
        worldBooks: await db.db.worldBooks.count(),
        personaPresets: await db.db.personaPresets.count(),
        totalMessages: 0,
        dataSize: 0
      };

      // 计算总消息数
      const chats = await db.db.chats.toArray();
      stats.totalMessages = chats.reduce((total: number, chat: Chat) => total + (chat.history?.length || 0), 0);

      // 估算数据大小（简单计算）
      const allData = {
        chats: chats,
        userStickers: await db.db.userStickers.toArray(),
        worldBooks: await db.db.worldBooks.toArray(),
        personaPresets: await db.db.personaPresets.toArray()
      };
      stats.dataSize = JSON.stringify(allData).length;

      return stats;
    } catch (error) {
      console.error("获取数据统计失败:", error);
      return {
        chats: 0,
        userStickers: 0,
        worldBooks: 0,
        personaPresets: 0,
        totalMessages: 0,
        dataSize: 0
      };
    }
  }

  // 辅助函数
  private showConfirm(title: string, message: string, options: ModalOptions = {}): Promise<boolean> {
    const win = window as any;
    if (win.showCustomConfirm) {
      return win.showCustomConfirm(title, message, options);
    }
    return Promise.resolve(confirm(message));
  }
}

// 导出服务实例
export const dataService = new DataService();