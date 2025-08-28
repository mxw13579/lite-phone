/**
 * 权限服务 - 时间线可见性控制系统
 * 管理朋友圈、聊天记录等内容的访问权限
 */

import { createSuccessResponse, createErrorResponse, ErrorTypes } from './contracts.js';
import { getDB } from '../core/db.js';
import { eventBus, EventTypes } from '../core/event-bus.js';
import { validateInput } from '../utils/validation.js';

/**
 * 可见性级别
 */
export const VisibilityLevels = {
    PRIVATE: 'private',           // 仅自己可见
    FRIENDS: 'friends',           // 朋友可见
    PUBLIC: 'public',             // 公开可见
    CUSTOM: 'custom'              // 自定义可见性
};

/**
 * 内容类型
 */
export const ContentTypes = {
    MOMENT: 'moment',             // 朋友圈动态
    CHAT_MESSAGE: 'chat_message', // 聊天消息
    TIMELINE: 'timeline',         // 时间线
    PROFILE: 'profile',           // 个人资料
    MEMORY: 'memory'              // AI记忆
};

/**
 * 用户角色
 */
export const UserRoles = {
    SELF: 'self',                 // 用户自己
    AI_FRIEND: 'ai_friend',       // AI朋友
    AI_STRANGER: 'ai_stranger',   // AI陌生人
    SYSTEM: 'system'              // 系统
};

/**
 * 权限服务类
 */
export class PermissionService {
    constructor() {
        this.permissionRules = new Map();
        this.visibilityCache = new Map();
        this.defaultPermissions = this.getDefaultPermissions();
        this.initializeEventHandlers();
    }

    /**
     * 初始化事件处理器
     */
    initializeEventHandlers() {
        // 监听内容创建事件，自动设置权限
        eventBus.on(EventTypes.CONTENT_CREATED, async (data) => {
            await this.setDefaultContentPermission(data);
        });

        // 监听用户设置变更，更新权限规则
        eventBus.on(EventTypes.SETTINGS_UPDATED, async (data) => {
            if (data.section === 'privacy') {
                await this.updatePermissionRules(data.settings);
            }
        });

        // 定期清理过期的权限缓存
        setInterval(() => {
            this.cleanupPermissionCache();
        }, 5 * 60 * 1000); // 每5分钟清理一次
    }

    /**
     * 获取默认权限配置
     */
    getDefaultPermissions() {
        return {
            [ContentTypes.MOMENT]: VisibilityLevels.FRIENDS,
            [ContentTypes.CHAT_MESSAGE]: VisibilityLevels.PRIVATE,
            [ContentTypes.TIMELINE]: VisibilityLevels.FRIENDS,
            [ContentTypes.PROFILE]: VisibilityLevels.PUBLIC,
            [ContentTypes.MEMORY]: VisibilityLevels.PRIVATE
        };
    }

    /**
     * 检查用户对内容的访问权限
     * @param {string} contentId 内容ID
     * @param {string} contentType 内容类型
     * @param {string} requesterId 请求者ID
     * @param {string} requesterRole 请求者角色
     * @returns {Promise<Object>} 权限检查结果
     */
    async checkPermission(contentId, contentType, requesterId, requesterRole = UserRoles.AI_FRIEND) {
        const validationResult = validateInput({
            contentId: { value: contentId, required: true, type: 'string' },
            contentType: { value: contentType, required: true, type: 'string' },
            requesterId: { value: requesterId, required: true, type: 'string' },
            requesterRole: { value: requesterRole, required: true, type: 'string' }
        });

        if (!validationResult.isValid) {
            return createErrorResponse(
                `权限检查参数无效: ${validationResult.errors.join(', ')}`,
                ErrorTypes.VALIDATION_ERROR
            );
        }

        try {
            // 检查缓存
            const cacheKey = `${contentId}:${requesterId}:${requesterRole}`;
            if (this.visibilityCache.has(cacheKey)) {
                const cached = this.visibilityCache.get(cacheKey);
                if (Date.now() - cached.timestamp < 60000) { // 1分钟缓存
                    return createSuccessResponse(cached.result, '权限检查完成（缓存）');
                }
            }

            // 获取内容权限配置
            const permission = await this.getContentPermission(contentId, contentType);
            if (!permission.success) {
                return permission;
            }

            const permissionData = permission.data;
            const result = this.evaluatePermission(permissionData, requesterId, requesterRole);

            // 更新缓存
            this.visibilityCache.set(cacheKey, {
                result,
                timestamp: Date.now()
            });

            // 记录访问事件
            await eventBus.emit('permission.access-checked', {
                contentId,
                contentType,
                requesterId,
                requesterRole,
                granted: result.granted,
                reason: result.reason,
                timestamp: Date.now()
            });

            return createSuccessResponse(result, '权限检查完成');

        } catch (error) {
            console.error('权限检查失败:', error);
            return createErrorResponse(
                `权限检查失败: ${error.message}`,
                ErrorTypes.INTERNAL_ERROR
            );
        }
    }

    /**
     * 评估权限
     * @param {Object} permissionData 权限数据
     * @param {string} requesterId 请求者ID
     * @param {string} requesterRole 请求者角色
     * @returns {Object} 评估结果
     */
    evaluatePermission(permissionData, requesterId, requesterRole) {
        const { ownerId, visibility, customRules = [] } = permissionData;

        // 自己总是有权限
        if (requesterId === ownerId || requesterRole === UserRoles.SELF) {
            return {
                granted: true,
                reason: 'OWNER_ACCESS',
                level: 'full'
            };
        }

        // 系统权限
        if (requesterRole === UserRoles.SYSTEM) {
            return {
                granted: true,
                reason: 'SYSTEM_ACCESS',
                level: 'full'
            };
        }

        // 根据可见性级别判断
        switch (visibility) {
            case VisibilityLevels.PRIVATE:
                return {
                    granted: false,
                    reason: 'PRIVATE_CONTENT',
                    level: 'none'
                };

            case VisibilityLevels.PUBLIC:
                return {
                    granted: true,
                    reason: 'PUBLIC_CONTENT',
                    level: 'read'
                };

            case VisibilityLevels.FRIENDS:
                if (requesterRole === UserRoles.AI_FRIEND) {
                    return {
                        granted: true,
                        reason: 'FRIEND_ACCESS',
                        level: 'read'
                    };
                }
                return {
                    granted: false,
                    reason: 'FRIENDS_ONLY',
                    level: 'none'
                };

            case VisibilityLevels.CUSTOM:
                return this.evaluateCustomRules(customRules, requesterId, requesterRole);

            default:
                return {
                    granted: false,
                    reason: 'UNKNOWN_VISIBILITY',
                    level: 'none'
                };
        }
    }

    /**
     * 评估自定义权限规则
     * @param {Array} customRules 自定义规则
     * @param {string} requesterId 请求者ID
     * @param {string} requesterRole 请求者角色
     * @returns {Object} 评估结果
     */
    evaluateCustomRules(customRules, requesterId, requesterRole) {
        for (const rule of customRules) {
            if (this.matchesRule(rule, requesterId, requesterRole)) {
                return {
                    granted: rule.action === 'allow',
                    reason: 'CUSTOM_RULE',
                    level: rule.level || 'read',
                    ruleId: rule.id
                };
            }
        }

        // 默认拒绝
        return {
            granted: false,
            reason: 'NO_MATCHING_RULE',
            level: 'none'
        };
    }

    /**
     * 检查是否匹配规则
     * @param {Object} rule 权限规则
     * @param {string} requesterId 请求者ID
     * @param {string} requesterRole 请求者角色
     * @returns {boolean} 是否匹配
     */
    matchesRule(rule, requesterId, requesterRole) {
        // 检查用户ID匹配
        if (rule.userIds && rule.userIds.includes(requesterId)) {
            return true;
        }

        // 检查角色匹配
        if (rule.roles && rule.roles.includes(requesterRole)) {
            return true;
        }

        // 检查标签匹配（如果有用户标签系统）
        if (rule.tags && this.userHasTags(requesterId, rule.tags)) {
            return true;
        }

        return false;
    }

    /**
     * 获取内容权限配置
     * @param {string} contentId 内容ID
     * @param {string} contentType 内容类型
     * @returns {Promise<Object>} 权限配置
     */
    async getContentPermission(contentId, contentType) {
        try {
            const db = getDB();
            let content;

            // 根据内容类型从不同表获取数据
            switch (contentType) {
                case ContentTypes.MOMENT:
                    content = await db.moments.get(contentId);
                    break;
                case ContentTypes.CHAT_MESSAGE:
                    content = await db.messages.get(contentId);
                    break;
                case ContentTypes.MEMORY:
                    content = await db.memories.get(contentId);
                    break;
                default:
                    // 尝试从通用权限表获取
                    content = await db.permissions?.get(contentId);
            }

            if (!content) {
                return createErrorResponse(
                    '内容不存在',
                    ErrorTypes.NOT_FOUND
                );
            }

            // 构建权限数据
            const permissionData = {
                contentId,
                contentType,
                ownerId: content.authorId || content.userId || 'system',
                visibility: content.visibility || this.defaultPermissions[contentType] || VisibilityLevels.PRIVATE,
                customRules: content.permissionRules || [],
                createdAt: content.createdAt || Date.now(),
                updatedAt: content.updatedAt || Date.now()
            };

            return createSuccessResponse(permissionData, '权限配置获取成功');

        } catch (error) {
            console.error('获取内容权限失败:', error);
            return createErrorResponse(
                `获取内容权限失败: ${error.message}`,
                ErrorTypes.DATABASE_ERROR
            );
        }
    }

    /**
     * 设置内容权限
     * @param {string} contentId 内容ID
     * @param {string} contentType 内容类型
     * @param {Object} permissionConfig 权限配置
     * @returns {Promise<Object>} 设置结果
     */
    async setContentPermission(contentId, contentType, permissionConfig) {
        const validationResult = validateInput({
            contentId: { value: contentId, required: true, type: 'string' },
            contentType: { value: contentType, required: true, type: 'string' },
            visibility: { value: permissionConfig.visibility, required: true, type: 'string' }
        });

        if (!validationResult.isValid) {
            return createErrorResponse(
                `权限设置参数无效: ${validationResult.errors.join(', ')}`,
                ErrorTypes.VALIDATION_ERROR
            );
        }

        try {
            const db = getDB();
            const updateData = {
                visibility: permissionConfig.visibility,
                permissionRules: permissionConfig.customRules || [],
                updatedAt: Date.now()
            };

            // 根据内容类型更新不同表
            switch (contentType) {
                case ContentTypes.MOMENT:
                    await db.moments.update(contentId, updateData);
                    break;
                case ContentTypes.CHAT_MESSAGE:
                    await db.messages.update(contentId, updateData);
                    break;
                case ContentTypes.MEMORY:
                    await db.memories.update(contentId, updateData);
                    break;
                default:
                    // 更新通用权限表
                    if (db.permissions) {
                        await db.permissions.put({
                            id: contentId,
                            contentType,
                            ...updateData
                        });
                    }
            }

            // 清除相关缓存
            this.clearRelatedCache(contentId);

            // 发送权限更新事件
            await eventBus.emit('permission.updated', {
                contentId,
                contentType,
                oldVisibility: permissionConfig.oldVisibility,
                newVisibility: permissionConfig.visibility,
                timestamp: Date.now()
            });

            return createSuccessResponse(
                { contentId, visibility: permissionConfig.visibility },
                '权限设置成功'
            );

        } catch (error) {
            console.error('设置内容权限失败:', error);
            return createErrorResponse(
                `设置内容权限失败: ${error.message}`,
                ErrorTypes.DATABASE_ERROR
            );
        }
    }

    /**
     * 批量检查权限
     * @param {Array} contentItems 内容项列表
     * @param {string} requesterId 请求者ID
     * @param {string} requesterRole 请求者角色
     * @returns {Promise<Object>} 批量检查结果
     */
    async batchCheckPermissions(contentItems, requesterId, requesterRole = UserRoles.AI_FRIEND) {
        try {
            const results = [];
            const errors = [];

            for (const item of contentItems) {
                const { contentId, contentType } = item;
                const result = await this.checkPermission(contentId, contentType, requesterId, requesterRole);
                
                if (result.success) {
                    results.push({
                        contentId,
                        contentType,
                        permission: result.data
                    });
                } else {
                    errors.push({
                        contentId,
                        contentType,
                        error: result.error
                    });
                }
            }

            return createSuccessResponse(
                { results, errors },
                `批量权限检查完成：${results.length}项成功，${errors.length}项失败`
            );

        } catch (error) {
            console.error('批量权限检查失败:', error);
            return createErrorResponse(
                `批量权限检查失败: ${error.message}`,
                ErrorTypes.INTERNAL_ERROR
            );
        }
    }

    /**
     * 过滤可访问内容
     * @param {Array} contentList 内容列表
     * @param {string} requesterId 请求者ID
     * @param {string} requesterRole 请求者角色
     * @returns {Promise<Object>} 过滤结果
     */
    async filterAccessibleContent(contentList, requesterId, requesterRole = UserRoles.AI_FRIEND) {
        try {
            const accessible = [];
            const denied = [];

            for (const content of contentList) {
                const contentType = this.detectContentType(content);
                const contentId = content.id;
                
                const permissionResult = await this.checkPermission(contentId, contentType, requesterId, requesterRole);
                
                if (permissionResult.success && permissionResult.data.granted) {
                    accessible.push({
                        ...content,
                        accessLevel: permissionResult.data.level
                    });
                } else {
                    denied.push({
                        id: contentId,
                        type: contentType,
                        reason: permissionResult.data?.reason || permissionResult.error
                    });
                }
            }

            return createSuccessResponse(
                { accessible, denied },
                `内容过滤完成：${accessible.length}项可访问，${denied.length}项被拒绝`
            );

        } catch (error) {
            console.error('内容访问过滤失败:', error);
            return createErrorResponse(
                `内容访问过滤失败: ${error.message}`,
                ErrorTypes.INTERNAL_ERROR
            );
        }
    }

    /**
     * 检测内容类型
     * @param {Object} content 内容对象
     * @returns {string} 内容类型
     */
    detectContentType(content) {
        if (content.type) return content.type;
        if (content.momentId || content.authorId) return ContentTypes.MOMENT;
        if (content.chatId || content.senderId) return ContentTypes.CHAT_MESSAGE;
        if (content.memoryType) return ContentTypes.MEMORY;
        return 'unknown';
    }

    /**
     * 设置默认内容权限
     * @param {Object} contentData 内容数据
     */
    async setDefaultContentPermission(contentData) {
        const { contentId, contentType, authorId } = contentData;
        const defaultVisibility = this.defaultPermissions[contentType] || VisibilityLevels.PRIVATE;
        
        await this.setContentPermission(contentId, contentType, {
            visibility: defaultVisibility,
            ownerId: authorId
        });
    }

    /**
     * 更新权限规则
     * @param {Object} privacySettings 隐私设置
     */
    async updatePermissionRules(privacySettings) {
        try {
            // 更新默认权限
            if (privacySettings.defaultVisibility) {
                Object.assign(this.defaultPermissions, privacySettings.defaultVisibility);
            }

            // 清除所有缓存
            this.visibilityCache.clear();

            await eventBus.emit('permission.rules-updated', {
                settings: privacySettings,
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('更新权限规则失败:', error);
        }
    }

    /**
     * 检查用户是否有指定标签
     * @param {string} userId 用户ID
     * @param {Array} tags 标签列表
     * @returns {boolean} 是否有标签
     */
    userHasTags(userId, tags) {
        // 这里可以扩展用户标签系统
        return false;
    }

    /**
     * 清除相关缓存
     * @param {string} contentId 内容ID
     */
    clearRelatedCache(contentId) {
        for (const [key] of this.visibilityCache.entries()) {
            if (key.startsWith(contentId + ':')) {
                this.visibilityCache.delete(key);
            }
        }
    }

    /**
     * 清理权限缓存
     */
    cleanupPermissionCache() {
        const now = Date.now();
        const cacheTimeout = 5 * 60 * 1000; // 5分钟超时

        for (const [key, value] of this.visibilityCache.entries()) {
            if (now - value.timestamp > cacheTimeout) {
                this.visibilityCache.delete(key);
            }
        }
    }

    /**
     * 获取权限统计信息
     * @returns {Object} 统计信息
     */
    getPermissionStats() {
        return {
            cacheSize: this.visibilityCache.size,
            defaultPermissions: this.defaultPermissions,
            supportedContentTypes: Object.values(ContentTypes),
            supportedVisibilityLevels: Object.values(VisibilityLevels),
            supportedUserRoles: Object.values(UserRoles)
        };
    }
}

// 创建全局权限服务实例
export const permissionService = new PermissionService();

// 导出工具函数
export const PermissionUtils = {
    /**
     * 检查内容是否对指定角色可见
     */
    isVisibleToRole(visibility, role) {
        switch (visibility) {
            case VisibilityLevels.PRIVATE:
                return role === UserRoles.SELF;
            case VisibilityLevels.FRIENDS:
                return role === UserRoles.SELF || role === UserRoles.AI_FRIEND;
            case VisibilityLevels.PUBLIC:
                return true;
            default:
                return false;
        }
    },

    /**
     * 获取角色的中文名称
     */
    getRoleName(role) {
        const names = {
            [UserRoles.SELF]: '自己',
            [UserRoles.AI_FRIEND]: 'AI朋友',
            [UserRoles.AI_STRANGER]: 'AI陌生人',
            [UserRoles.SYSTEM]: '系统'
        };
        return names[role] || '未知角色';
    },

    /**
     * 获取可见性级别的中文名称
     */
    getVisibilityName(level) {
        const names = {
            [VisibilityLevels.PRIVATE]: '仅自己可见',
            [VisibilityLevels.FRIENDS]: '朋友可见',
            [VisibilityLevels.PUBLIC]: '公开可见',
            [VisibilityLevels.CUSTOM]: '自定义可见'
        };
        return names[level] || '未知可见性';
    }
};