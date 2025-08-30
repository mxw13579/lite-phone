// UI界面常量 - 集中管理UI配置、正则表达式等界面相关常量
// 从constants/index.ts中提取的UI配置定义

// === 正则表达式常量 ===
export const STICKER_REGEX = /^(https:\/\/i\.postimg\.cc\/.+|data:image)/;
export const URL_REGEX = /^https?:\/\/.+/;
export const IMAGE_REGEX = /\.(jpg|jpeg|png|gif|webp)$/i;

// === 界面配置常量 ===
export const MESSAGE_RENDER_WINDOW = 50;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const IMAGE_COMPRESSION_QUALITY = 0.8;
export const NOTIFICATION_TIMEOUT = 4000; // 4秒

// === 动画和定时器常量 ===
export const UI_TIMING = {
  CLOCK_UPDATE_INTERVAL: 30 * 1000, // 30秒
  BATTERY_ALERT_TIMEOUT: 2000, // 2秒
  NOTIFICATION_TIMEOUT: 4000, // 4秒
  MODAL_ANIMATION_DURATION: 300, // 300毫秒
  TYPING_DELAY: 100 // 打字延迟
};

// === 主题颜色常量 ===
export const THEME_COLORS = {
  primary: '#007AFF',
  secondary: '#34C759',
  danger: '#FF3B30',
  warning: '#FF9500',
  info: '#5AC8FA',
  light: '#F2F2F7',
  dark: '#1C1C1E'
};

// === 文件上传配置 ===
export const UPLOAD_CONFIG = {
  MAX_FILE_SIZE,
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  SUPPORTED_AUDIO_TYPES: ['audio/wav', 'audio/mp3', 'audio/m4a'],
  IMAGE_COMPRESSION_QUALITY
};

// === 聊天界面配置 ===
export const CHAT_CONFIG = {
  MESSAGE_RENDER_WINDOW,
  MAX_MESSAGE_LENGTH: 5000,
  MAX_MESSAGES_PER_RESPONSE: 8,
  MIN_MESSAGES_PER_RESPONSE: 3,
  TYPING_ANIMATION_DURATION: 1000
};

// === UI常量类型定义 ===
export interface UIConstants {
  STICKER_REGEX: RegExp;
  URL_REGEX: RegExp;
  IMAGE_REGEX: RegExp;
  MESSAGE_RENDER_WINDOW: number;
  MAX_FILE_SIZE: number;
  IMAGE_COMPRESSION_QUALITY: number;
  NOTIFICATION_TIMEOUT: number;
  UI_TIMING: typeof UI_TIMING;
  THEME_COLORS: typeof THEME_COLORS;
  UPLOAD_CONFIG: typeof UPLOAD_CONFIG;
  CHAT_CONFIG: typeof CHAT_CONFIG;
}

// === UI常量集合对象 ===
export const UI_CONSTANTS: UIConstants = {
  STICKER_REGEX,
  URL_REGEX,
  IMAGE_REGEX,
  MESSAGE_RENDER_WINDOW,
  MAX_FILE_SIZE,
  IMAGE_COMPRESSION_QUALITY,
  NOTIFICATION_TIMEOUT,
  UI_TIMING,
  THEME_COLORS,
  UPLOAD_CONFIG,
  CHAT_CONFIG,
};