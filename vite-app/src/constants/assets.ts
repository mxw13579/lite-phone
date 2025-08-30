// 静态资源常量 - 集中管理默认头像和资源URL
// 从constants/index.ts中提取的静态资源定义

// === 默认头像常量 ===
export const DEFAULT_AVATAR = 'https://i.postimg.cc/PxZrFFFL/o-o-1.jpg';
export const DEFAULT_MY_GROUP_AVATAR = 'https://i.postimg.cc/cLPP10Vm/4.jpg';
export const DEFAULT_GROUP_MEMBER_AVATAR = 'https://i.postimg.cc/VkQfgzGJ/1.jpg';
export const DEFAULT_GROUP_AVATAR = 'https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg';

// === 电池状态图片资源 ===
export const BATTERY_ALERT_IMAGES = {
  LEVEL_40: 'https://i.postimg.cc/T2yKJ0DV/40.jpg',
  LEVEL_20: 'https://i.postimg.cc/qB9zbKs9/20.jpg', 
  LEVEL_10: 'https://i.postimg.cc/ThMMVfW4/10.jpg',
  CHARGING: 'https://i.postimg.cc/3NDQ0dWG/image.jpg'
};

// === 备用资源配置 ===
export const FALLBACK_ASSETS = {
  avatar: DEFAULT_AVATAR,
  groupAvatar: DEFAULT_GROUP_AVATAR,
  memberAvatar: DEFAULT_GROUP_MEMBER_AVATAR
};

// === 资源常量类型定义 ===
export interface AssetConstants {
  DEFAULT_AVATAR: string;
  DEFAULT_MY_GROUP_AVATAR: string;
  DEFAULT_GROUP_MEMBER_AVATAR: string;
  DEFAULT_GROUP_AVATAR: string;
  BATTERY_ALERT_IMAGES: typeof BATTERY_ALERT_IMAGES;
  FALLBACK_ASSETS: typeof FALLBACK_ASSETS;
}

// === 资源常量集合对象 ===
export const ASSET_CONSTANTS: AssetConstants = {
  DEFAULT_AVATAR,
  DEFAULT_MY_GROUP_AVATAR,
  DEFAULT_GROUP_MEMBER_AVATAR,
  DEFAULT_GROUP_AVATAR,
  BATTERY_ALERT_IMAGES,
  FALLBACK_ASSETS,
};