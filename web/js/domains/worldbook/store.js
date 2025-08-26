/**
 * 世界书管理存储层
 * 负责世界书数据的 CRUD 操作
 */

import { getDB } from '../../core/db.js';
import { formatDate } from '../../utils/format.js';
import { backupService } from '../../services/backup.js';

/**
 * 获取所有世界书
 * @returns {Promise<Array>} 世界书列表
 */
export async function getAllWorldBooks() {
    try {
        const db = getDB();
        if (!db) return [];

        const worldBooks = await db.worldBooks.orderBy('updatedAt').reverse().toArray();
        return worldBooks.map(book => ({
            ...book,
            formattedUpdatedAt: formatDate(book.updatedAt, 'MM-DD HH:mm'),
            contentPreview: book.content ? book.content.slice(0, 100) + (book.content.length > 100 ? '...' : '') : '暂无内容',
            wordCount: book.content ? book.content.length : 0
        }));

    } catch (error) {
        console.error('Failed to get world books:', error);
        return [];
    }
}

/**
 * 获取世界书详情
 * @param {string} bookId 世界书ID
 * @returns {Promise<Object|null>} 世界书详情
 */
export async function getWorldBookDetail(bookId) {
    try {
        const db = getDB();
        if (!db) return null;

        const worldBook = await db.worldBooks.get(bookId);
        if (!worldBook) return null;

        return {
            ...worldBook,
            formattedCreatedAt: formatDate(worldBook.createdAt, 'YYYY-MM-DD HH:mm:ss'),
            formattedUpdatedAt: formatDate(worldBook.updatedAt, 'YYYY-MM-DD HH:mm:ss'),
            wordCount: worldBook.content ? worldBook.content.length : 0,
            paragraphCount: worldBook.content ? worldBook.content.split('\n').filter(p => p.trim()).length : 0
        };

    } catch (error) {
        console.error('Failed to get world book detail:', error);
        return null;
    }
}

/**
 * 创建新世界书
 * @param {Object} bookData 世界书数据
 * @returns {Promise<Object>} 操作结果
 */
export async function createWorldBook(bookData) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const worldBook = {
            id: `worldbook_${Date.now()}`,
            name: bookData.name || '新世界书',
            content: bookData.content || '',
            tags: bookData.tags || [],
            isActive: bookData.isActive || false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await db.worldBooks.add(worldBook);

        return {
            success: true,
            worldBook,
            message: '世界书创建成功'
        };

    } catch (error) {
        console.error('Failed to create world book:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 更新世界书
 * @param {string} bookId 世界书ID
 * @param {Object} updateData 更新数据
 * @returns {Promise<Object>} 操作结果
 */
export async function updateWorldBook(bookId, updateData) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const worldBook = await db.worldBooks.get(bookId);
        if (!worldBook) {
            throw new Error(`World book not found: ${bookId}`);
        }

        const updatedData = {
            ...updateData,
            updatedAt: new Date().toISOString()
        };

        await db.worldBooks.update(bookId, updatedData);

        return {
            success: true,
            message: '世界书更新成功'
        };

    } catch (error) {
        console.error('Failed to update world book:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 删除世界书
 * @param {string} bookId 世界书ID
 * @returns {Promise<Object>} 操作结果
 */
export async function deleteWorldBook(bookId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const worldBook = await db.worldBooks.get(bookId);
        if (!worldBook) {
            throw new Error(`World book not found: ${bookId}`);
        }

        await db.worldBooks.delete(bookId);

        return {
            success: true,
            message: '世界书删除成功'
        };

    } catch (error) {
        console.error('Failed to delete world book:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 搜索世界书
 * @param {string} keyword 关键词
 * @returns {Promise<Array>} 搜索结果
 */
export async function searchWorldBooks(keyword) {
    try {
        const db = getDB();
        if (!db) return [];

        if (!keyword.trim()) {
            return await getAllWorldBooks();
        }

        const allBooks = await getAllWorldBooks();
        const searchTerm = keyword.toLowerCase().trim();

        return allBooks.filter(book => 
            book.name.toLowerCase().includes(searchTerm) ||
            book.content.toLowerCase().includes(searchTerm) ||
            (book.tags && book.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
        );

    } catch (error) {
        console.error('Failed to search world books:', error);
        return [];
    }
}

/**
 * 导出世界书数据
 * @returns {Promise<Object>} 导出结果
 */
export async function exportWorldBooks() {
    return await backupService.exportData('worldBooks', {
        table: 'worldBooks',
        transform: (book) => ({
            name: book.name,
            content: book.content,
            tags: book.tags,
            createdAt: book.createdAt,
            updatedAt: book.updatedAt
        })
    });
}

/**
 * 导入世界书数据
 * @param {Object} importData 导入数据
 * @returns {Promise<Object>} 导入结果
 */
export async function importWorldBooks(importData) {
    return await backupService.importData('worldBooks', importData, {
        transform: (book, index) => ({
            ...book,
            id: `worldbook_imported_${Date.now()}_${index}`,
            isActive: false,
            createdAt: book.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
        })
    });
}

/**
 * 获取世界书统计信息
 * @returns {Promise<Object>} 统计信息
 */
export async function getWorldBookStats() {
    try {
        const db = getDB();
        if (!db) {
            return { total: 0, totalWords: 0, averageWords: 0 };
        }

        const worldBooks = await db.worldBooks.toArray();
        const totalWords = worldBooks.reduce((sum, book) => sum + (book.content ? book.content.length : 0), 0);

        return {
            total: worldBooks.length,
            totalWords,
            averageWords: worldBooks.length > 0 ? Math.round(totalWords / worldBooks.length) : 0
        };

    } catch (error) {
        console.error('Failed to get world book stats:', error);
        return { total: 0, totalWords: 0, averageWords: 0 };
    }
}