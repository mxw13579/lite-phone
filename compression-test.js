/**
 * 记忆压缩策略测试
 * 验证4阶段压缩管道的逻辑和效果
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 模拟数据库操作
class MockDB {
    constructor() {
        this.memories = new Map();
        this.nextId = 1;
    }

    // 添加记忆
    async addMemory(memory) {
        const id = `mem_${this.nextId++}`;
        this.memories.set(id, { ...memory, id, createdAt: new Date().toISOString() });
        return id;
    }

    // 获取角色的所有记忆
    async getMemoriesByRole(roleId) {
        return Array.from(this.memories.values())
            .filter(m => m.roleId === roleId)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // 删除记忆
    async deleteMemory(id) {
        return this.memories.delete(id);
    }

    // 更新记忆
    async updateMemory(id, updates) {
        const memory = this.memories.get(id);
        if (memory) {
            Object.assign(memory, updates);
            return true;
        }
        return false;
    }

    // 获取记忆数量
    async getMemoryCount(roleId) {
        return Array.from(this.memories.values())
            .filter(m => m.roleId === roleId).length;
    }
}

// 简化的记忆压缩管理器
class MemoryCompressionManager {
    constructor(db) {
        this.db = db;
    }

    /**
     * 4阶段压缩策略
     */
    async compressMemories(roleId, options = {}) {
        const startTime = Date.now();
        const {
            maxMemories = 100,
            importanceThreshold = 0.3,
            timeWindowDays = 30,
            forceCompress = false
        } = options;

        console.log(`\n=== 记忆压缩策略测试 - 角色: ${roleId} ===`);
        
        // 1. 获取当前记忆状态
        const memories = await this.db.getMemoriesByRole(roleId);
        console.log(`压缩前记忆数量: ${memories.length}`);
        
        if (!forceCompress && memories.length <= maxMemories * 0.8) {
            console.log('记忆数量未达到压缩阈值，跳过压缩');
            return {
                compressed: 0,
                message: '记忆数量未达到压缩阈值',
                details: {
                    currentCount: memories.length,
                    threshold: Math.floor(maxMemories * 0.8)
                }
            };
        }

        let totalCompressed = 0;
        const compressionLog = [];

        // 2. 第一阶段：低重要性记忆清理
        console.log('\n--- 第一阶段：低重要性记忆清理 ---');
        const lowImportanceCount = await this.removeLowImportanceMemories(roleId, importanceThreshold);
        totalCompressed += lowImportanceCount;
        if (lowImportanceCount > 0) {
            compressionLog.push(`清理低重要性记忆: ${lowImportanceCount}个`);
        }
        console.log(`清理低重要性记忆: ${lowImportanceCount}个`);

        // 3. 第二阶段：相似记忆智能合并
        console.log('\n--- 第二阶段：相似记忆智能合并 ---');
        const mergeCount = await this.mergeSimilarMemories(roleId);
        totalCompressed += mergeCount;
        if (mergeCount > 0) {
            compressionLog.push(`合并相似记忆: ${mergeCount}个`);
        }
        console.log(`合并相似记忆: ${mergeCount}个`);

        // 4. 第三阶段：时间衰减处理
        console.log('\n--- 第三阶段：时间衰减处理 ---');
        const decayCount = await this.applyTimeDecay(roleId, timeWindowDays);
        totalCompressed += decayCount;
        if (decayCount > 0) {
            compressionLog.push(`时间衰减清理: ${decayCount}个`);
        }
        console.log(`时间衰减清理: ${decayCount}个`);

        // 5. 第四阶段：类型平衡调整
        console.log('\n--- 第四阶段：类型平衡调整 ---');
        const balanceCount = await this.balanceMemoryTypes(roleId, maxMemories);
        totalCompressed += balanceCount;
        if (balanceCount > 0) {
            compressionLog.push(`类型平衡调整: ${balanceCount}个`);
        }
        console.log(`类型平衡调整: ${balanceCount}个`);

        // 6. 获取压缩后的统计信息
        const finalMemories = await this.db.getMemoriesByRole(roleId);
        const processingTime = Date.now() - startTime;

        const result = {
            compressed: totalCompressed,
            message: `记忆压缩完成，处理耗时 ${processingTime}ms`,
            details: {
                initialCount: memories.length,
                finalCount: finalMemories.length,
                compressionRate: totalCompressed > 0 ? 
                    ((totalCompressed / memories.length) * 100).toFixed(1) + '%' : '0%',
                processingTime,
                operations: compressionLog
            }
        };

        console.log(`\n压缩完成 - 初始: ${memories.length}, 最终: ${finalMemories.length}, 压缩率: ${result.details.compressionRate}`);
        return result;
    }

    // 第一阶段：清理低重要性记忆
    async removeLowImportanceMemories(roleId, threshold) {
        const memories = await this.db.getMemoriesByRole(roleId);
        
        // 按类型分组，确保每种类型至少保留1个重要记忆
        const memoriesByType = {};
        memories.forEach(memory => {
            if (!memoriesByType[memory.type]) {
                memoriesByType[memory.type] = [];
            }
            memoriesByType[memory.type].push(memory);
        });

        let deletedCount = 0;

        for (const [type, typeMemories] of Object.entries(memoriesByType)) {
            // 按重要性排序
            typeMemories.sort((a, b) => b.importance - a.importance);
            
            // 保留每种类型至少1个重要记忆
            const minKeep = 1;
            const toDelete = typeMemories.filter((m, index) => 
                index >= minKeep && m.importance < threshold
            );
            
            for (const memory of toDelete) {
                await this.db.deleteMemory(memory.id);
                deletedCount++;
            }
        }

        return deletedCount;
    }

    // 第二阶段：合并相似记忆
    async mergeSimilarMemories(roleId) {
        const memories = await this.db.getMemoriesByRole(roleId);
        const similarityThreshold = 0.7;
        let mergedCount = 0;

        // 按类型分组处理
        const memoriesByType = {};
        memories.forEach(memory => {
            if (!memoriesByType[memory.type]) {
                memoriesByType[memory.type] = [];
            }
            memoriesByType[memory.type].push(memory);
        });

        for (const [type, typeMemories] of Object.entries(memoriesByType)) {
            const processed = new Set();

            for (let i = 0; i < typeMemories.length; i++) {
                if (processed.has(typeMemories[i].id)) continue;

                const memory1 = typeMemories[i];
                const similarMemories = [];

                for (let j = i + 1; j < typeMemories.length; j++) {
                    if (processed.has(typeMemories[j].id)) continue;

                    const memory2 = typeMemories[j];
                    const similarity = this.calculateSimilarity(memory1.content, memory2.content);

                    if (similarity > similarityThreshold) {
                        similarMemories.push(memory2);
                        processed.add(memory2.id);
                    }
                }

                if (similarMemories.length > 0) {
                    // 合并记忆
                    const mergedContent = this.mergeMemoryContents(memory1, similarMemories);
                    const mergedImportance = Math.min(1.0, 
                        memory1.importance + similarMemories.reduce((sum, m) => sum + m.importance, 0) * 0.3
                    );

                    // 更新主记忆
                    await this.db.updateMemory(memory1.id, {
                        content: mergedContent,
                        importance: mergedImportance,
                        updatedAt: new Date().toISOString()
                    });

                    // 删除被合并的记忆
                    for (const similar of similarMemories) {
                        await this.db.deleteMemory(similar.id);
                        mergedCount++;
                    }

                    processed.add(memory1.id);
                }
            }
        }

        return mergedCount;
    }

    // 第三阶段：时间衰减处理
    async applyTimeDecay(roleId, timeWindowDays) {
        const memories = await this.db.getMemoriesByRole(roleId);
        const cutoffTime = new Date();
        cutoffTime.setDate(cutoffTime.getDate() - timeWindowDays);

        let decayedCount = 0;

        for (const memory of memories) {
            const memoryDate = new Date(memory.createdAt);
            
            if (memoryDate < cutoffTime) {
                // 应用时间衰减
                const daysPassed = Math.floor((Date.now() - memoryDate.getTime()) / (1000 * 60 * 60 * 24));
                const decayFactor = Math.max(0.1, Math.exp(-daysPassed / 30)); // 指数衰减
                const decayedImportance = memory.importance * decayFactor;

                if (decayedImportance < 0.2) {
                    // 重要性过低，删除记忆
                    await this.db.deleteMemory(memory.id);
                    decayedCount++;
                } else {
                    // 更新重要性
                    await this.db.updateMemory(memory.id, {
                        importance: decayedImportance,
                        updatedAt: new Date().toISOString()
                    });
                }
            }
        }

        return decayedCount;
    }

    // 第四阶段：类型平衡调整
    async balanceMemoryTypes(roleId, maxMemories) {
        const memories = await this.db.getMemoriesByRole(roleId);
        
        // 理想的记忆类型分布
        const idealDistribution = {
            semantic: 0.4,   // 语义记忆 40%
            episodic: 0.3,   // 情节记忆 30%
            social: 0.2,     // 社交记忆 20%
            general: 0.1     // 一般记忆 10%
        };

        // 统计当前分布
        const currentDistribution = {};
        const memoriesByType = {};
        
        memories.forEach(memory => {
            currentDistribution[memory.type] = (currentDistribution[memory.type] || 0) + 1;
            if (!memoriesByType[memory.type]) {
                memoriesByType[memory.type] = [];
            }
            memoriesByType[memory.type].push(memory);
        });

        let balancedCount = 0;

        // 检查并平衡过度的类型
        for (const [type, currentCount] of Object.entries(currentDistribution)) {
            const idealCount = Math.floor(maxMemories * idealDistribution[type]);
            const overageThreshold = idealCount * 1.5; // 超出理想值50%才进行平衡

            if (currentCount > overageThreshold) {
                const excessCount = currentCount - idealCount;
                const typeMemories = memoriesByType[type];
                
                // 按重要性排序，删除低重要性的记忆
                typeMemories.sort((a, b) => a.importance - b.importance);
                
                const toDelete = typeMemories.slice(0, Math.min(excessCount, typeMemories.length - 1));
                
                for (const memory of toDelete) {
                    await this.db.deleteMemory(memory.id);
                    balancedCount++;
                }
            }
        }

        return balancedCount;
    }

    // 计算内容相似度
    calculateSimilarity(content1, content2) {
        if (!content1 || !content2) return 0;
        
        const words1 = content1.toLowerCase().split(/\s+/);
        const words2 = content2.toLowerCase().split(/\s+/);
        
        const commonWords = words1.filter(word => words2.includes(word));
        const totalWords = new Set([...words1, ...words2]).size;
        
        return commonWords.length / totalWords;
    }

    // 合并记忆内容
    mergeMemoryContents(mainMemory, similarMemories) {
        const contents = [mainMemory.content, ...similarMemories.map(m => m.content)];
        const uniqueInfo = [...new Set(contents.flatMap(c => c.split('。').map(s => s.trim())))];
        
        return uniqueInfo.filter(info => info.length > 0).join('。');
    }
}

// 创建测试数据
function createTestMemories() {
    const testMemories = [
        // 高重要性记忆
        { roleId: 'user_1', content: '记住我的生日是3月15日', type: 'semantic', importance: 0.8 },
        { roleId: 'user_1', content: '我叫张三，在北京工作', type: 'semantic', importance: 0.7 },
        
        // 中等重要性记忆
        { roleId: 'user_1', content: '今天去了电影院看电影', type: 'episodic', importance: 0.5 },
        { roleId: 'user_1', content: '你喜欢什么音乐？', type: 'social', importance: 0.4 },
        { roleId: 'user_1', content: '明天有重要会议', type: 'episodic', importance: 0.6 },
        
        // 低重要性记忆
        { roleId: 'user_1', content: '今天天气不错', type: 'general', importance: 0.2 },
        { roleId: 'user_1', content: '嗯', type: 'general', importance: 0.1 },
        { roleId: 'user_1', content: '好的', type: 'general', importance: 0.15 },
        
        // 相似记忆（测试合并）
        { roleId: 'user_1', content: '我喜欢听音乐', type: 'semantic', importance: 0.5 },
        { roleId: 'user_1', content: '我很喜欢听各种音乐', type: 'semantic', importance: 0.45 },
        
        // 旧记忆（测试时间衰减）
        { roleId: 'user_1', content: '很久以前的事情', type: 'episodic', importance: 0.3, createdAt: '2024-01-01T00:00:00.000Z' },
        
        // 过多的某种类型记忆（测试类型平衡）
        { roleId: 'user_1', content: '一般对话1', type: 'general', importance: 0.25 },
        { roleId: 'user_1', content: '一般对话2', type: 'general', importance: 0.22 },
        { roleId: 'user_1', content: '一般对话3', type: 'general', importance: 0.28 },
        { roleId: 'user_1', content: '一般对话4', type: 'general', importance: 0.26 },
    ];

    return testMemories;
}

// 执行测试
async function runCompressionTests() {
    console.log('=== 记忆压缩策略完整测试 ===\n');
    
    const mockDB = new MockDB();
    const compressionManager = new MemoryCompressionManager(mockDB);
    
    // 1. 准备测试数据
    console.log('--- 准备测试数据 ---');
    const testMemories = createTestMemories();
    
    for (const memory of testMemories) {
        await mockDB.addMemory(memory);
    }
    
    const initialCount = await mockDB.getMemoryCount('user_1');
    console.log(`初始记忆数量: ${initialCount}`);
    
    // 2. 执行压缩测试
    const compressionResult = await compressionManager.compressMemories('user_1', {
        maxMemories: 10,
        importanceThreshold: 0.3,
        timeWindowDays: 30,
        forceCompress: true
    });
    
    // 3. 验证结果
    const finalCount = await mockDB.getMemoryCount('user_1');
    const compressionRate = ((initialCount - finalCount) / initialCount * 100).toFixed(1);
    
    console.log('\n=== 压缩测试结果 ===');
    console.log(`压缩前记忆数: ${initialCount}`);
    console.log(`压缩后记忆数: ${finalCount}`);
    console.log(`实际压缩率: ${compressionRate}%`);
    console.log(`处理时间: ${compressionResult.details.processingTime}ms`);
    console.log('执行的操作:', compressionResult.details.operations);
    
    // 4. 验证压缩效果
    const finalMemories = await mockDB.getMemoriesByRole('user_1');
    
    console.log('\n--- 最终记忆分析 ---');
    const typeDistribution = {};
    finalMemories.forEach(memory => {
        typeDistribution[memory.type] = (typeDistribution[memory.type] || 0) + 1;
    });
    
    console.log('类型分布:', typeDistribution);
    
    const avgImportance = finalMemories.reduce((sum, m) => sum + m.importance, 0) / finalMemories.length;
    console.log(`平均重要性: ${avgImportance.toFixed(3)}`);
    
    // 5. 测试评估
    const testPassed = {
        compressionRate: parseFloat(compressionRate) > 10, // 至少10%压缩率
        avgImportance: avgImportance > 0.3, // 保留的记忆平均重要性较高
        typeBalance: Object.keys(typeDistribution).length >= 2, // 保持类型多样性
        performant: compressionResult.details.processingTime < 100 // 处理时间合理
    };
    
    const overallPassed = Object.values(testPassed).every(Boolean);
    
    console.log('\n=== 测试验证 ===');
    console.log(`压缩效果: ${testPassed.compressionRate ? '✅' : '❌'} (${compressionRate}%)`);
    console.log(`质量保证: ${testPassed.avgImportance ? '✅' : '❌'} (平均重要性 ${avgImportance.toFixed(3)})`);
    console.log(`类型平衡: ${testPassed.typeBalance ? '✅' : '❌'} (保留 ${Object.keys(typeDistribution).length} 种类型)`);
    console.log(`性能指标: ${testPassed.performant ? '✅' : '❌'} (${compressionResult.details.processingTime}ms)`);
    
    console.log(`\n总体结果: ${overallPassed ? '✅ 全部通过' : '❌ 部分失败'}`);
    
    return {
        passed: overallPassed,
        results: testPassed,
        metrics: {
            initialCount,
            finalCount,
            compressionRate: parseFloat(compressionRate),
            avgImportance,
            processingTime: compressionResult.details.processingTime,
            typeDistribution
        }
    };
}

// 执行测试
runCompressionTests().catch(console.error);