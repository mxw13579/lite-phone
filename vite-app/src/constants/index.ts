// 常量模块统一入口 - Barrel导出模式  
// 聚合所有常量模块，保持API兼容性

// === 导入所有常量模块 ===
export * from './prompts';
export * from './assets';
export * from './ui';

// === 导入常量集合 ===
import { AI_PROMPTS } from './prompts';
import { ASSET_CONSTANTS } from './assets';
import { UI_CONSTANTS } from './ui';

// === 向后兼容：提取单独的常量 ===
export const {
  DEFAULT_PROMPT_IMAGE,
  DEFAULT_PROMPT_VOICE,
  DEFAULT_PROMPT_TRANSFER,
  DEFAULT_PROMPT_SINGLE,
  DEFAULT_PROMPT_GROUP,
} = AI_PROMPTS;

export const {
  DEFAULT_AVATAR,
  DEFAULT_MY_GROUP_AVATAR,
  DEFAULT_GROUP_MEMBER_AVATAR,
  DEFAULT_GROUP_AVATAR,
} = ASSET_CONSTANTS;

export const {
  STICKER_REGEX,
  MESSAGE_RENDER_WINDOW,
} = UI_CONSTANTS;

// === 统一常量接口定义 ===
export interface Constants {
  // AI提示词
  DEFAULT_PROMPT_IMAGE: string;
  DEFAULT_PROMPT_VOICE: string;
  DEFAULT_PROMPT_TRANSFER: string;
  DEFAULT_PROMPT_SINGLE: string;
  DEFAULT_PROMPT_GROUP: string;
  // 资源常量
  DEFAULT_AVATAR: string;
  DEFAULT_MY_GROUP_AVATAR: string;
  DEFAULT_GROUP_MEMBER_AVATAR: string;
  DEFAULT_GROUP_AVATAR: string;
  // UI常量
  STICKER_REGEX: RegExp;
  MESSAGE_RENDER_WINDOW: number;
  // 扩展模块
  AI_PROMPTS: typeof AI_PROMPTS;
  ASSETS: typeof ASSET_CONSTANTS;
  UI: typeof UI_CONSTANTS;
}

// === 统一常量对象 (向后兼容) ===
export const CONSTANTS: Constants = {
  // AI提示词
  DEFAULT_PROMPT_IMAGE,
  DEFAULT_PROMPT_VOICE,
  DEFAULT_PROMPT_TRANSFER,
  DEFAULT_PROMPT_SINGLE,
  DEFAULT_PROMPT_GROUP,
  // 资源常量
  DEFAULT_AVATAR,
  DEFAULT_MY_GROUP_AVATAR,
  DEFAULT_GROUP_MEMBER_AVATAR,
  DEFAULT_GROUP_AVATAR,
  // UI常量
  STICKER_REGEX,
  MESSAGE_RENDER_WINDOW,
  // 扩展模块
  AI_PROMPTS,
  ASSETS: ASSET_CONSTANTS,
  UI: UI_CONSTANTS,
};

// === 向后兼容：window对象注入（类型声明移至init/compat.ts） ===

// 全局注入函数（可选调用，main.ts已统一处理）
export function injectConstantsToWindow(): void {
  if (typeof window !== 'undefined') {
    window.CONSTANTS = CONSTANTS;
  }
}

// 注意：不再自动注入，由main.ts统一管理全局注入

// === 默认导出 ===
export default CONSTANTS;