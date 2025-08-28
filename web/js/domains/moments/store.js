/**
 * 朋友圈管理存储层
 */

import { getDB } from '../../core/db.js';
import { permissionService, VisibilityLevels, ContentTypes, UserRoles } from '../../services/permissions.js';
import { eventBus, EventTypes } from '../../core/event-bus.js';

/**
 * 获取时间线（带权限过滤）
 * @param {number} page 页码
 * @param {number} limit 每页数量
 * @param {string} requesterId 请求者ID
 * @param {string} requesterRole 请求者角色
 * @param {string} visibilityFilter 可见性过滤: 'private'|'friends'|'public'|'all'
 */
export async function getMomentsPaginated(page = 1, limit = 10, requesterId = 'user', requesterRole = UserRoles.SELF, visibilityFilter = 'all') {
    try {
        const db = getDB();
        if (!db) return { moments: [], totalPages: 0 };

        const totalCount = await db.moments.count();
        const totalPages = Math.ceil(totalCount / limit);
        const offset = (page - 1) * limit;

        let baseQuery = db.moments
            .orderBy('createdAt')
            .reverse();

        if (visibilityFilter !== 'all') {
            baseQuery = baseQuery.filter(m => m.visibility === visibilityFilter);
        }

        const allMoments = await baseQuery
            .offset(offset)
            .limit(limit * 2) // 获取更多数据用于权限过滤
            .toArray();

        // 权限过滤
        const accessibleMoments = [];
        for (const moment of allMoments) {
            const permissionResult = await permissionService.checkPermission(
                moment.id,
                ContentTypes.MOMENT,
                requesterId,
                requesterRole
            );
            
            if (permissionResult.success && permissionResult.data.granted) {
                accessibleMoments.push(moment);
            }
            
            // 达到所需数量就停止
            if (accessibleMoments.length >= limit) break;
        }

        // 聚合统计（点赞与评论）
        const momentsWithStats = await Promise.all(accessibleMoments.slice(0, limit).map(async moment => {
            const likesCount = await db.reactions
                .where('momentId').equals(moment.id)
                .and(r => r.type === 'like')
                .count();
            const commentsCount = await db.comments
                .where('momentId').equals(moment.id)
                .count();
            return {
                ...moment,
                formattedTime: new Date(moment.createdAt).toLocaleDateString(),
                likesCount,
                commentsCount
            };
        }));

        return {
            moments: momentsWithStats,
            totalPages,
            currentPage: page
        };

    } catch (error) {
        console.error('Failed to get moments:', error);
        return { moments: [], totalPages: 0 };
    }
}

export async function publishMoment({ content, visibility = 'friends', image = null, authorId = 'user' }) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const moment = {
            id: `moment_${Date.now()}`,
            authorId,
            content,
            visibility: Object.values(VisibilityLevels).includes(visibility) ? visibility : VisibilityLevels.FRIENDS,
            image,
            aiGenerated: authorId !== 'user',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            likes: 0,
            comments: []
        };

        await db.moments.add(moment);

        // 设置权限
        await permissionService.setContentPermission(moment.id, ContentTypes.MOMENT, {
            visibility: moment.visibility,
            ownerId: authorId
        });

        // 发送内容创建事件
        await eventBus.emit(EventTypes.CONTENT_CREATED, {
            contentId: moment.id,
            contentType: ContentTypes.MOMENT,
            authorId,
            timestamp: Date.now()
        });

        return { success: true, moment };

    } catch (error) {
        console.error('Failed to publish moment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 更新动态权限
 * @param {string} momentId 动态ID
 * @param {string} newVisibility 新可见性
 */
export async function updateMomentVisibility(momentId, newVisibility) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        // 验证可见性级别
        if (!Object.values(VisibilityLevels).includes(newVisibility)) {
            throw new Error('Invalid visibility level');
        }

        // 更新数据库中的可见性
        await db.moments.update(momentId, {
            visibility: newVisibility,
            updatedAt: Date.now()
        });

        // 更新权限系统
        await permissionService.setContentPermission(momentId, ContentTypes.MOMENT, {
            visibility: newVisibility
        });

        return { success: true };

    } catch (error) {
        console.error('Failed to update moment visibility:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 批量更新动态权限
 * @param {Array} momentIds 动态ID列表
 * @param {string} newVisibility 新可见性
 */
export async function batchUpdateMomentsVisibility(momentIds, newVisibility) {
    try {
        const results = [];
        const errors = [];

        for (const momentId of momentIds) {
            const result = await updateMomentVisibility(momentId, newVisibility);
            if (result.success) {
                results.push(momentId);
            } else {
                errors.push({ momentId, error: result.error });
            }
        }

        return { 
            success: true, 
            updated: results, 
            errors,
            total: momentIds.length
        };

    } catch (error) {
        console.error('Failed to batch update moments visibility:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 撤回 (改为 retracted 状态，并进入回收站)
 */
export async function retractMoment(momentId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');
        await db.moments.update(momentId, {
            status: 'retracted',
            updatedAt: new Date().toISOString()
        });
        return { success: true };
    } catch (error) {
        console.error('Failed to retract moment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 软删除到回收站 (status: 'deleted')
 */
export async function softDeleteMoment(momentId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');
        await db.moments.update(momentId, {
            status: 'deleted',
            deletedAt: new Date().toISOString()
        });
        return { success: true };
    } catch (error) {
        console.error('Failed to soft delete moment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 从回收站恢复
 */
export async function restoreMoment(momentId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');
        await db.moments.update(momentId, {
            status: 'published',
            updatedAt: new Date().toISOString()
        });
        return { success: true };
    } catch (error) {
        console.error('Failed to restore moment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 彻底删除
 */
export async function permanentlyDeleteMoment(momentId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');
        await db.moments.delete(momentId);
        // 同时清理关联评论与反应
        const relatedComments = await db.comments.where('momentId').equals(momentId).toArray();
        const relatedReactions = await db.reactions.where('momentId').equals(momentId).toArray();
        await db.transaction('rw', db.comments, db.reactions, async () => {
            for (const c of relatedComments) await db.comments.delete(c.id);
            for (const r of relatedReactions) await db.reactions.delete(r.id);
        });
        return { success: true };
    } catch (error) {
        console.error('Failed to permanently delete moment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 添加评论
 * @param {string} momentId 动态ID
 * @param {string} content 评论内容
 * @param {string} authorId 作者ID，默认'user'
 */
export async function addComment(momentId, content, authorId = 'user') {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');
        if (!content || !content.trim()) throw new Error('评论内容不能为空');

        const comment = {
            id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            momentId,
            authorId,
            content: content.trim(),
            createdAt: new Date().toISOString(),
            parentId: null
        };

        await db.comments.add(comment);
        return { success: true, comment };
    } catch (error) {
        console.error('Failed to add comment:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 获取评论（分页）
 */
export async function getComments(momentId, page = 1, limit = 10) {
    try {
        const db = getDB();
        if (!db) return { comments: [], totalPages: 0, currentPage: page };

        const all = await db.comments
            .where('momentId').equals(momentId)
            .orderBy('createdAt')
            .reverse()
            .toArray();

        const totalPages = Math.ceil(all.length / limit);
        const offset = (page - 1) * limit;
        const pageItems = all.slice(offset, offset + limit);

        return {
            comments: pageItems,
            totalPages,
            currentPage: page
        };
    } catch (error) {
        console.error('Failed to get comments:', error);
        return { comments: [], totalPages: 0, currentPage: page };
    }
}

/**
 * 切换点赞（单用户单反应）
 */
export async function toggleReaction(momentId, userId = 'user', type = 'like') {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        // 查找该用户在该动态下是否已有反应
        const existing = await db.reactions
            .where('momentId').equals(momentId)
            .and(r => r.userId === userId)
            .first();

        if (existing && existing.type === type) {
            await db.reactions.delete(existing.id);
            return { success: true, liked: false };
        }

        const reaction = {
            id: `reaction_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            momentId,
            userId,
            type,
            createdAt: new Date().toISOString()
        };

        if (existing) {
            // 替换其他类型为当前类型
            await db.reactions.update(existing.id, { type, createdAt: reaction.createdAt });
        } else {
            await db.reactions.add(reaction);
        }

        return { success: true, liked: type === 'like' };
    } catch (error) {
        console.error('Failed to toggle reaction:', error);
        return { success: false, error: error.message };
    }
}

/**
 * 获取动态统计
 */
export async function getMomentStats(momentId) {
    try {
        const db = getDB();
        if (!db) return { likes: 0, comments: 0 };
        const [likes, comments] = await Promise.all([
            db.reactions.where('momentId').equals(momentId).and(r => r.type === 'like').count(),
            db.comments.where('momentId').equals(momentId).count()
        ]);
        return { likes, comments };
    } catch (error) {
        console.error('Failed to get moment stats:', error);
        return { likes: 0, comments: 0 };
    }
}