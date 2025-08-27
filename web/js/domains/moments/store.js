/**
 * 朋友圈管理存储层
 */

import { getDB } from '../../core/db.js';

/**
 * 获取时间线（带可见性过滤）
 * @param {number} page 页码
 * @param {number} limit 每页数量
 * @param {string} visibilityFilter 可见性过滤: 'private'|'friends'|'public'|'all'
 */
export async function getMomentsPaginated(page = 1, limit = 10, visibilityFilter = 'all') {
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

        const moments = await baseQuery
            .offset(offset)
            .limit(limit)
            .toArray();

        // 聚合统计（点赞与评论）
        const momentsWithStats = await Promise.all(moments.map(async moment => {
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

export async function publishMoment({ content, visibility = 'private', image = null }) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const moment = {
            id: `moment_${Date.now()}`,
            authorId: 'user',
            content,
            visibility: visibility === 'friends' || visibility === 'public' ? visibility : 'private',
            image,
            aiGenerated: false,
            createdAt: new Date().toISOString(),
            likes: 0,
            comments: []
        };

        await db.moments.add(moment);
        return { success: true, moment };

    } catch (error) {
        console.error('Failed to publish moment:', error);
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