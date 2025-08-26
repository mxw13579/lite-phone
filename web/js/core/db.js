/**
 * Dexie 数据库初始化与数据管理
 * 统一管理所有数据表的 schema 定义和迁移
 */

// 确保全局 Dexie 可用
if (typeof Dexie === 'undefined') {
    throw new Error('Dexie is not loaded. Make sure to include Dexie.js before this module.');
}

// 数据库实例
let db = null;

/**
 * 初始化数据库
 * @returns {Promise<Dexie>} 数据库实例
 */
export async function initializeDB() {
    if (db) {
        return db;
    }
    
    try {
        db = new Dexie('GeminiChatDB');
        
        // 升级到版本11 - EPhone v2.0 数据表
        db.version(11).stores({
            // 现有表保持不变
            chats: '&id, isGroup',
            apiConfig: '&id',
            globalSettings: '&id',
            userStickers: '&id, url, name',
            worldBooks: '&id, name',
            musicLibrary: '&id',
            personaPresets: '&id',
            presets: '&id, name',
            
            // 新增核心功能表
            memories: '&id, roleId, chatId, type, importance, createdAt, [roleId+createdAt]',
            moments: '&id, authorId, createdAt, visibility, aiGenerated',
            comments: '&id, momentId, createdAt, authorId, parentId',
            reactions: '&id, momentId, userId, type, [momentId+userId]',
            plugins: '&id, name, enabled, errors, configSnapshot, updatedAt',
            migrations: '&id, fromVersion, toVersion, appliedAt'
        }).upgrade(async tx => {
            console.log('Upgrading database to version 11...');
            // 记录迁移信息
            await tx.table('migrations').add({
                id: `migration_${Date.now()}`,
                fromVersion: 10,
                toVersion: 11,
                appliedAt: new Date().toISOString()
            });
        });

        // 保持版本10的升级逻辑用于向后兼容
        db.version(10).stores({
            chats: '&id, isGroup',
            apiConfig: '&id',
            globalSettings: '&id',
            userStickers: '&id, url, name',
            worldBooks: '&id, name',
            musicLibrary: '&id',
            personaPresets: '&id',
            presets: '&id, name'
        }).upgrade(async tx => {
            console.log('Upgrading database from version 10...');
            // 数据迁移逻辑：将旧的全局预设转换为新的预设条目
            const globalSettings = await tx.table('globalSettings').get('main');
            if (globalSettings && globalSettings.promptSingle) {
                const newPreset = {
                    id: 'preset_default_migrated',
                    name: '默认预设 (迁移)',
                    remark: '从旧版本迁移的默认预设',
                    promptSingle: globalSettings.promptSingle,
                    promptGroup: globalSettings.promptGroup || globalSettings.promptSingle,
                    promptImage: globalSettings.promptImage || '',
                    promptVoice: globalSettings.promptVoice || '',
                    promptTransfer: globalSettings.promptTransfer || '',
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                try {
                    await tx.table('presets').put(newPreset);
                    console.log('Successfully migrated default preset from globalSettings');
                } catch (error) {
                    console.error('Failed to migrate default preset:', error);
                }
            }
        });

        await db.open();
        console.log('Database initialized successfully:', db.name);
        return db;
        
    } catch (error) {
        console.error('Database initialization failed:', error);
        throw error;
    }
}

/**
 * 获取数据库实例
 * @returns {Dexie|null} 数据库实例
 */
export function getDB() {
    if (!db) {
        console.warn('Database not initialized. Call initializeDB() first.');
        return null;
    }
    return db;
}

/**
 * 数据库迁移失败回滚处理
 * @param {Error} error 迁移错误
 */
export async function handleMigrationFailure(error) {
    console.error('Database migration failed:', error);
    
    try {
        // 尝试关闭当前数据库连接
        if (db) {
            db.close();
        }
        
        // 尝试删除损坏的数据库
        await Dexie.delete('GeminiChatDB');
        console.log('Corrupted database deleted, will recreate on next initialization');
        
        // 重置数据库实例
        db = null;
        
        // 重新初始化
        return await initializeDB();
        
    } catch (rollbackError) {
        console.error('Database rollback failed:', rollbackError);
        throw rollbackError;
    }
}

/**
 * 检查数据库健康状态
 * @returns {Promise<Object>} 健康状态报告
 */
export async function checkDatabaseHealth() {
    try {
        const dbInstance = getDB();
        if (!dbInstance) {
            return { healthy: false, error: 'Database not initialized' };
        }
        
        // 检查基本表是否可访问
        const tableChecks = await Promise.allSettled([
            dbInstance.chats.limit(1).toArray(),
            dbInstance.globalSettings.limit(1).toArray(),
            dbInstance.presets.limit(1).toArray()
        ]);
        
        const failures = tableChecks.filter(result => result.status === 'rejected');
        
        if (failures.length > 0) {
            return {
                healthy: false,
                error: `Table access failures: ${failures.length}`,
                failures: failures.map(f => f.reason?.message)
            };
        }
        
        return {
            healthy: true,
            version: dbInstance.verno,
            tables: dbInstance.tables.map(t => t.name)
        };
        
    } catch (error) {
        return { healthy: false, error: error.message };
    }
}

// 默认导出数据库实例获取函数
export default getDB;