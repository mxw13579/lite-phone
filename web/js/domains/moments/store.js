/**
 * 朋友圈管理存储层
 */

import { getDB } from '../../core/db.js';

export async function getMomentsPaginated(page = 1, limit = 10) {
    try {
        const db = getDB();
        if (!db) return { moments: [], totalPages: 0 };

        const totalCount = await db.moments.count();
        const totalPages = Math.ceil(totalCount / limit);
        const offset = (page - 1) * limit;

        const moments = await db.moments
            .orderBy('createdAt')
            .reverse()
            .offset(offset)
            .limit(limit)
            .toArray();

        return {
            moments: moments.map(moment => ({
                ...moment,
                formattedTime: new Date(moment.createdAt).toLocaleDateString()
            })),
            totalPages,
            currentPage: page
        };

    } catch (error) {
        console.error('Failed to get moments:', error);
        return { moments: [], totalPages: 0 };
    }
}

export async function publishMoment(content, visibility = 'user_only', image = null) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const moment = {
            id: `moment_${Date.now()}`,
            authorId: 'user',
            content,
            visibility,
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