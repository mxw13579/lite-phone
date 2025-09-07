// 数据管理服务 - 数据统计、备份导出、导入还原（修复 MusicLibrary.id 字面量类型）
import type {
  Chat,
  MusicLibrary,
  PersonaPreset,
  UserSticker,
  Track,
  ApiConfig,
  GlobalSettings,
  WorldBook,
} from '../state';
import DB from '../database';

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
type BackupData = {
  chats: Chat[];
  apiConfig: ApiConfig;
  globalSettings: GlobalSettings;
  userStickers: UserSticker[];
  worldBooks: WorldBook[];
  musicLibrary?: MusicLibrary;
  personaPresets: PersonaPreset[];
};

const DEFAULT_WALLPAPER = 'linear-gradient(135deg, #89f7fe, #66a6ff)';
const MUSIC_LIBRARY_ID: MusicLibrary['id'] = 'main'; // 关键：与类型保持一致

const getWin = () => window as any;

function ensureGlobalSettings(input?: Partial<GlobalSettings> | null): GlobalSettings {
  const def: GlobalSettings = {
    id: 'main',
    wallpaper: DEFAULT_WALLPAPER,
    enableGeolocation: false,
    remoteThemeUrl: '',
    activePresetId: '',
  } as GlobalSettings;
  return { ...def, ...(input ?? {}) };
}

function ensureApiConfig(input?: Partial<ApiConfig> | null): ApiConfig {
  const def: ApiConfig = {
    proxyUrl: '',
    apiKey: '',
    model: '',
  };
  return { ...def, ...(input ?? {}) };
}

function emptyMusicLibrary(): MusicLibrary {
  // 使用声明好的字面量以匹配类型系统
  return {
    id: MUSIC_LIBRARY_ID,
    playlist: [] as Track[],
  };
}

function stripLocalTracksForExport(library?: MusicLibrary): MusicLibrary | undefined {
  if (!library) return library;
  const playlist: Track[] = (library.playlist ?? []).map((t) =>
      t.isLocal
          ? {
            ...t,
            src: '', // 用空字符串表示需重传，避免向 Track 注入新字段
          }
          : t
  );
  return { ...library, playlist };
}

function splitMusicLibraryByReupload(library?: MusicLibrary): {
  toImport?: MusicLibrary;
  reuploadCount: number;
} {
  if (!library) return { toImport: library, reuploadCount: 0 };
  const list = library.playlist ?? [];
  const toImportList: Track[] = list.filter((t) => !(typeof t.src === 'string' && t.src === ''));
  const reuploadCount = list.length - toImportList.length;
  return {
    toImport: { ...library, playlist: toImportList },
    reuploadCount,
  };
}

async function downloadBlobAs(blob: Blob, fileName: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class DataService {
  async exportData(): Promise<void> {
    const win = getWin();

    try {
      const [
        chats,
        apiConfigRaw,
        globalSettingsRaw,
        userStickers,
        worldBooks,
        musicLibraryRaw,
        personaPresets,
      ] = await Promise.all([
        DB.getAllChats(),
        DB.getApiConfig(),
        DB.getGlobalSettings(),
        DB.getAllUserStickers(),
        DB.getAllWorldBooks(),
        DB.getMusicLibrary(),
        DB.getAllPersonaPresets(),
      ]);

      const backupData: BackupData = {
        chats,
        apiConfig: ensureApiConfig(apiConfigRaw as Partial<ApiConfig> | null),
        globalSettings: ensureGlobalSettings(globalSettingsRaw as Partial<GlobalSettings> | null),
        userStickers,
        worldBooks,
        musicLibrary: stripLocalTracksForExport((musicLibraryRaw as MusicLibrary | undefined) ?? emptyMusicLibrary()),
        personaPresets,
      };

      const gzip = new CompressionStream('gzip');
      const readable = new Response(JSON.stringify(backupData)).body!;
      const compressedStream = readable.pipeThrough(gzip);
      const compressedBlob = await new Response(compressedStream).blob();

      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
      await downloadBlobAs(compressedBlob, `EPhone_backup_${date}_${time}.phone`);

      win?.showCustomAlert?.('导出成功', '所有数据已成功压缩并导出为.phone文件。');
    } catch (error: any) {
      console.error('导出失败:', error);
      getWin()?.showCustomAlert?.('导出失败', `发生错误: ${error.message}`);
    }
  }

  async importData(file: File): Promise<void> {
    if (!file) return;

    const confirmed = await this.showConfirm(
        '确认导入',
        '警告：导入数据将覆盖当前所有聊天记录和设置。此操作不可撤销。确定要继续吗？',
        { confirmButtonClass: 'btn-danger', confirmText: '我确定，导入' }
    );
    if (!confirmed) return;

    const win = getWin();

    try {
      if (!win?.DB?.db) throw new Error('数据库实例未初始化');

      const decompressionStream = new DecompressionStream('gzip');
      const decompressedStream = file.stream().pipeThrough(decompressionStream);
      const backupData = (await new Response(decompressedStream).json()) as BackupData;

      if (!backupData?.chats || !backupData?.apiConfig || !backupData?.globalSettings) {
        throw new Error('备份文件格式无效或已损坏。');
      }

      const normalizedGlobal = ensureGlobalSettings(backupData.globalSettings);
      const { toImport, reuploadCount } = splitMusicLibraryByReupload(
          backupData.musicLibrary ?? emptyMusicLibrary()
      );

      await DB.importAllData({
        chats: backupData.chats,
        userStickers: backupData.userStickers,
        worldBooks: backupData.worldBooks,
        personaPresets: backupData.personaPresets,
        apiConfig: ensureApiConfig(backupData.apiConfig),
        globalSettings: normalizedGlobal,
        musicLibrary: toImport,
      });

      if (reuploadCount > 0) {
        win?.showCustomAlert?.('部分导入', `${reuploadCount}首本地歌曲需要您重新手动添加。`);
      }

      await win?.showCustomAlert?.('导入成功', '数据已成功恢复。应用即将刷新。');
      window.location.reload();
    } catch (error: any) {
      console.error('导入失败:', error);
      await getWin()?.showCustomAlert?.('导入失败', `解压或解析文件时发生错误: ${error.message}`);
    }
  }

  handleImportDataEvent(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importData(file).finally(() => {
      input.value = '';
    });
  }

  async clearAllData(): Promise<void> {
    const confirmed = await this.showConfirm(
        '清空所有数据',
        '警告：此操作将删除所有聊天记录、设置和用户数据。此操作不可撤销！确定要继续吗？',
        { confirmButtonClass: 'btn-danger', confirmText: '我确定，清空' }
    );
    if (!confirmed) return;

    try {
      await DB.clearAllTables();
      const win = getWin();
      await win?.showCustomAlert?.('清空成功', '所有数据已清空。应用即将刷新。');
      window.location.reload();
    } catch (error: any) {
      console.error('清空数据失败:', error);
      getWin()?.showCustomAlert?.('清空失败', `发生错误: ${error.message}`);
    }
  }

  async getDataStats(): Promise<DataStats> {
    try {
      const [
        chatsCount,
        stickersCount,
        worldBooksCount,
        personaPresetsCount,
        chats,
        userStickers,
        worldBooks,
        personaPresets,
      ] = await Promise.all([
        DB.getChatsCount(),
        DB.getUserStickersCount(),
        DB.getWorldBooksCount(),
        DB.getPersonaPresetsCount(),
        DB.getAllChats(),
        DB.getAllUserStickers(),
        DB.getAllWorldBooks(),
        DB.getAllPersonaPresets(),
      ]);

      const totalMessages = chats.reduce((total: number, chat: Chat) => total + (chat.history?.length || 0), 0);
      const allData = { chats, userStickers, worldBooks, personaPresets };
      const dataSize = JSON.stringify(allData).length;

      return {
        chats: chatsCount,
        userStickers: stickersCount,
        worldBooks: worldBooksCount,
        personaPresets: personaPresetsCount,
        totalMessages,
        dataSize,
      };
    } catch (error) {
      console.error('获取数据统计失败:', error);
      return { chats: 0, userStickers: 0, worldBooks: 0, personaPresets: 0, totalMessages: 0, dataSize: 0 };
    }
  }

  private showConfirm(title: string, message: string, options: ModalOptions = {}): Promise<boolean> {
    const win = getWin();
    if (win?.showCustomConfirm) return win.showCustomConfirm(title, message, options);
    return Promise.resolve(confirm(message));
  }
}

export const dataService = new DataService();
