/**
 * 记忆服务层
 * 
 * 功能概述：
 * - 从聊天对话中智能抽取重要记忆
 * - 基于重要性评分管理记忆存储
 * - 提供记忆压缩和配额管理机制
 * - 为聊天生成提供相关记忆注入
 * 
 * @fileoverview 记忆服务实现，遵循SOLID原则和标准契约
 * @version 1.0
 * @author EPhone Development Team
 * @implements {ServiceContract}
 */

import { getDB } from '../core/db.js';
import { eventBus, EventTypes } from '../core/event-bus.js';
import { createSuccessResponse, createErrorResponse, ErrorTypes } from './contracts.js';
import { getChatMessages } from '../domains/chats/controller.js';

/**
 * 记忆服务配置常量
 */
const MEMORY_CONFIG = {
    // 重要性评分配置
    importanceThresholds: {
        veryHigh: 0.8,      // 非常重要
        high: 0.6,          // 重要
        medium: 0.4,        // 一般
        low: 0.2            // 较低
    },
    
    // 压缩策略配置
    compression: {
        maxMemoriesPerRole: 1000,    // 每个角色最大记忆数
        lowImportanceThreshold: 0.3,  // 低重要性阈值
        timeWindowDays: 30,           // 时间窗口（天）
        similarityThreshold: 0.7      // 相似度阈值
    },
    
    // 预算注入配置
    injection: {
        defaultTokenBudget: 10000,    // 默认Token预算
        memoryTokenRatio: 0.3,        // 记忆占总预算比例
        maxMemoriesPerContext: 20,    // 每次上下文最大记忆数
        tokenEstimateRate: 4          // Token估算倍率（中文）
    },
    
    // 记忆类型定义
    memoryTypes: {
        EPISODIC: 'episodic',    // 情节记忆 - 具体事件和经历
        SEMANTIC: 'semantic',     // 语义记忆 - 事实和知识
        SOCIAL: 'social',         // 社交记忆 - 人际关系信息
        GENERAL: 'general'        // 一般记忆 - 其他信息
    }
};

/**
 * 记忆服务类
 * 实现完整的AI记忆管理功能
 */
class MemoryService {
    constructor() {
        this.compressionManager = new MemoryCompressionManager();
        this.injectionManager = new MemoryInjectionManager();
        this.extractionManager = new MemoryExtractionManager();
    }

    /**
     * 初始化记忆服务
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            console.log('Initializing memory service...');
            
            // 确保数据库表结构正确
            const db = getDB();
            if (!db || !db.memories) {
                throw new Error('Memory table not available in database');
            }
            
            // 注册事件监听器
            this.registerEventListeners();
            
            console.log('Memory service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize memory service:', error);
            throw error;
        }
    }

    /**
     * 注册事件监听器
     * @private
     */
    registerEventListeners() {
        // 监听聊天消息发送事件，自动抽取记忆
        eventBus.on(EventTypes.CHAT_MESSAGE_SENT, async (data) => {
            try {
                await this.extractMemoriesFromChat(data.chatId, 5);
            } catch (error) {
                console.warn('Auto memory extraction failed:', error);
            }
        });

        // 监听记忆压缩请求
        eventBus.on('memory.compress-request', async (data) => {
            try {
                await this.compressMemoriesByImportance(data.roleId, data.options);
            } catch (error) {
                console.error('Memory compression failed:', error);
            }
        });
    }

    // ===== 核心API接口 =====

    /**
     * 从聊天中抽取记忆
     * @param {string} chatId 聊天ID
     * @param {number} messageCount 处理消息数量
     * @returns {Promise<ServiceResponse>}
     */
    async extractMemoriesFromChat(chatId, messageCount = 50) {
        try {
            if (!chatId) {
                return createErrorResponse('chatId不能为空', ErrorTypes.VALIDATION_ERROR);
            }

            // 获取聊天消息
            const messages = await getChatMessages(chatId, messageCount);
            if (!messages || messages.length === 0) {
                return createSuccessResponse([], '无消息可处理');
            }

            // 获取聊天基本信息
            const db = getDB();
            const chat = await db.chats.get(chatId);
            if (!chat) {
                return createErrorResponse('聊天不存在', ErrorTypes.NOT_FOUND);
            }

            // 抽取记忆
            const extractedMemories = await this.extractionManager.extractFromMessages(
                messages, 
                chat, 
                chatId
            );

            // 保存新记忆到数据库
            const savedMemories = [];
            for (const memoryData of extractedMemories) {
                const memory = {
                    id: `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    roleId: chatId, // 使用chatId作为角色ID
                    chatId: chatId,
                    type: memoryData.type,
                    content: memoryData.content,
                    importance: memoryData.importance,
                    context: memoryData.context,
                    tags: memoryData.tags || [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                await db.memories.add(memory);
                savedMemories.push(memory);
            }

            // 发送记忆形成事件
            if (savedMemories.length > 0) {
                await eventBus.emit(EventTypes.MEMORY_FORMED, {
                    chatId,
                    memoriesCount: savedMemories.length,
                    memories: savedMemories
                });
            }

            return createSuccessResponse(savedMemories, `成功抽取${savedMemories.length}个记忆`);

        } catch (error) {
            console.error('Extract memories from chat failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 创建新记忆
     * @param {Object} memoryData 记忆数据
     * @returns {Promise<ServiceResponse>}
     */
    async createMemory(memoryData) {
        try {
            const { roleId, chatId, content, type, importance, context, tags } = memoryData;

            // 参数验证
            if (!roleId || !content) {
                return createErrorResponse('roleId和content不能为空', ErrorTypes.VALIDATION_ERROR);
            }

            if (!Object.values(MEMORY_CONFIG.memoryTypes).includes(type)) {
                return createErrorResponse('无效的记忆类型', ErrorTypes.VALIDATION_ERROR);
            }

            if (importance < 0 || importance > 1) {
                return createErrorResponse('重要性评分必须在0-1之间', ErrorTypes.VALIDATION_ERROR);
            }

            const db = getDB();
            const memory = {
                id: `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                roleId,
                chatId: chatId || roleId,
                type,
                content,
                importance,
                context: context || {},
                tags: tags || [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await db.memories.add(memory);

            // 发送记忆创建事件
            await eventBus.emit('memory.created', {
                memory,
                roleId
            });

            return createSuccessResponse(memory, '记忆创建成功');

        } catch (error) {
            console.error('Create memory failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 压缩角色记忆
     * @param {string} roleId 角色ID
     * @param {Object} options 压缩选项
     * @returns {Promise<ServiceResponse>}
     */
    async compressMemoriesByImportance(roleId, options = {}) {
        try {
            if (!roleId) {
                return createErrorResponse('roleId不能为空', ErrorTypes.VALIDATION_ERROR);
            }

            const result = await this.compressionManager.compressMemories(roleId, options);
            
            // 发送压缩完成事件
            await eventBus.emit('memory.compressed', {
                roleId,
                ...result
            });

            return createSuccessResponse(result, '记忆压缩完成');

        } catch (error) {
            console.error('Compress memories failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 为提示词注入相关记忆
     * @param {string} roleId 角色ID
     * @param {Object} context 上下文信息
     * @returns {Promise<ServiceResponse>}
     */
    async injectMemoriesIntoPrompt(roleId, context) {
        try {
            if (!roleId) {
                return createErrorResponse('roleId不能为空', ErrorTypes.VALIDATION_ERROR);
            }

            const result = await this.injectionManager.injectMemories(roleId, context);
            
            return createSuccessResponse(result, '记忆注入成功');

        } catch (error) {
            console.error('Inject memories failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    /**
     * 搜索相关记忆
     * @param {string} query 查询条件
     * @param {Object} filters 过滤条件
     * @returns {Promise<ServiceResponse>}
     */
    async searchRelevantMemories(query, filters = {}) {
        try {
            const db = getDB();
            let baseQuery = db.memories.orderBy('importance').reverse();

            // 应用过滤条件
            if (filters.roleId) {
                baseQuery = baseQuery.filter(m => m.roleId === filters.roleId);
            }
            if (filters.type) {
                baseQuery = baseQuery.filter(m => m.type === filters.type);
            }
            if (filters.minImportance) {
                baseQuery = baseQuery.filter(m => m.importance >= filters.minImportance);
            }

            const allMemories = await baseQuery.toArray();

            // 文本搜索过滤
            let filteredMemories = allMemories;
            if (query && query.trim()) {
                const keywords = query.toLowerCase().split(/\s+/);
                filteredMemories = allMemories.filter(memory => {
                    const content = memory.content.toLowerCase();
                    return keywords.some(keyword => content.includes(keyword));
                });
            }

            // 分页处理
            const limit = filters.limit || 50;
            const offset = filters.offset || 0;
            const paginatedMemories = filteredMemories.slice(offset, offset + limit);

            return createSuccessResponse({
                memories: paginatedMemories,
                total: filteredMemories.length,
                query,
                filters
            }, `找到${filteredMemories.length}个相关记忆`);

        } catch (error) {
            console.error('Search memories failed:', error);
            return createErrorResponse(error.message, ErrorTypes.INTERNAL_ERROR);
        }
    }

    // ===== 辅助方法 =====

    /**
     * 获取角色的所有记忆
     * @param {string} roleId 角色ID
     * @returns {Promise<Array>} 记忆列表
     */
    async getAllMemoriesByRole(roleId) {
        try {
            const db = getDB();
            return await db.memories
                .where('roleId')
                .equals(roleId)
                .orderBy('importance')
                .reverse()
                .toArray();
        } catch (error) {
            console.error('Get all memories by role failed:', error);
            return [];
        }
    }

    /**
     * 获取记忆统计信息
     * @param {string} roleId 角色ID
     * @returns {Promise<Object>} 统计信息
     */
    async getMemoryStats(roleId) {
        try {
            const memories = await this.getAllMemoriesByRole(roleId);
            
            const stats = {
                total: memories.length,
                byType: {},
                byImportance: {
                    veryHigh: 0,
                    high: 0,
                    medium: 0,
                    low: 0
                },
                avgImportance: 0,
                oldestMemory: null,
                newestMemory: null
            };

            // 按类型统计
            Object.values(MEMORY_CONFIG.memoryTypes).forEach(type => {
                stats.byType[type] = memories.filter(m => m.type === type).length;
            });

            // 按重要性统计
            let totalImportance = 0;
            memories.forEach(memory => {
                totalImportance += memory.importance;
                
                if (memory.importance >= MEMORY_CONFIG.importanceThresholds.veryHigh) {
                    stats.byImportance.veryHigh++;
                } else if (memory.importance >= MEMORY_CONFIG.importanceThresholds.high) {
                    stats.byImportance.high++;
                } else if (memory.importance >= MEMORY_CONFIG.importanceThresholds.medium) {
                    stats.byImportance.medium++;
                } else {
                    stats.byImportance.low++;
                }
            });

            // 平均重要性
            stats.avgImportance = memories.length > 0 ? totalImportance / memories.length : 0;

            // 最老和最新记忆
            if (memories.length > 0) {
                const sortedByTime = memories.sort((a, b) => 
                    new Date(a.createdAt) - new Date(b.createdAt)
                );
                stats.oldestMemory = sortedByTime[0];
                stats.newestMemory = sortedByTime[sortedByTime.length - 1];
            }

            return stats;
        } catch (error) {
            console.error('Get memory stats failed:', error);
            return null;
        }
    }
}

/**
 * 记忆抽取管理器
 * 负责从聊天消息中抽取重要记忆
 */
class MemoryExtractionManager {
    /**
     * 从消息列表中抽取记忆
     * @param {Array} messages 消息列表
     * @param {Object} chat 聊天对象
     * @param {string} chatId 聊天ID
     * @returns {Promise<Array>} 抽取的记忆列表
     */
    async extractFromMessages(messages, chat, chatId) {
        const extractedMemories = [];

        for (const message of messages) {
            try {
                // 跳过系统消息和空消息
                if (!message.content || typeof message.content !== 'string') {
                    continue;
                }

                // 构建消息上下文
                const context = {
                    senderId: message.senderId,
                    timestamp: new Date(message.timestamp).getTime(),
                    isGroupChat: chat.isGroup,
                    hasPersonalInfo: this.hasPersonalInfo(message.content),
                    isDirectQuestion: this.isDirectQuestion(message.content),
                    hasEmotionalContent: this.hasEmotionalContent(message.content)
                };

                // 计算重要性评分
                const importance = this.calculateImportanceScore(message.content, context);

                // 只有重要性超过阈值的消息才形成记忆
                if (importance >= MEMORY_CONFIG.compression.lowImportanceThreshold) {
                    const memoryType = this.classifyMemoryType(message.content, context);
                    const tags = this.extractTags(message.content);

                    extractedMemories.push({
                        content: message.content,
                        type: memoryType,
                        importance,
                        context,
                        tags,
                        sourceMessageId: message.id
                    });
                }
            } catch (error) {
                console.warn('Failed to extract memory from message:', error);
            }
        }

        return extractedMemories;
    }

    /**
     * 计算重要性评分算法（优化版）
     * @param {string} content 消息内容
     * @param {Object} context 上下文信息
     * @returns {number} 重要性评分 0-1
     */
    calculateImportanceScore(content, context = {}) {
        let score = 0;
        const contentLower = content.toLowerCase();

        // 1. 重要性指示词权重 (0.25)
        const importanceIndicators = {
            critical: ['重要', '千万', '一定要', '必须', '务必'],
            memory: ['记住', '别忘了', '要记得', '牢记'],
            attention: ['注意', '小心', '当心', '留意']
        };
        
        let importanceScore = 0;
        Object.entries(importanceIndicators).forEach(([category, keywords]) => {
            const matches = keywords.filter(keyword => content.includes(keyword)).length;
            if (category === 'critical') importanceScore += matches * 0.12;
            else if (category === 'memory') importanceScore += matches * 0.10;
            else importanceScore += matches * 0.08;
        });
        score += Math.min(importanceScore, 0.25);

        // 2. 个人信息识别权重 (0.3)
        const personalInfoPatterns = {
            identity: ['名字', '姓名', '叫什么', '叫做', '我是'],
            contact: ['电话', '手机', '微信', '联系方式', '地址'],
            personal: ['生日', '年龄', '家人', '父母', '孩子', '配偶'],
            work: ['工作', '职业', '公司', '单位', '学校', '专业'],
            preference: ['喜欢', '讨厌', '爱好', '兴趣', '习惯']
        };
        
        let personalScore = 0;
        Object.entries(personalInfoPatterns).forEach(([category, keywords]) => {
            const matches = keywords.filter(keyword => content.includes(keyword)).length;
            if (matches > 0) {
                if (category === 'identity' || category === 'contact') {
                    personalScore += 0.08; // 身份和联系方式最重要
                } else {
                    personalScore += 0.06; // 其他个人信息
                }
            }
        });
        score += Math.min(personalScore, 0.3);

        // 3. 情感和交互强度权重 (0.2)
        let emotionScore = 0;
        
        // 情感标点符号
        const emotionPunctuation = content.match(/[!？?]{1,3}|[。]{2,}|[~]{1,}/g) || [];
        emotionScore += Math.min(emotionPunctuation.length * 0.03, 0.08);
        
        // 情感强化词
        const intensifiers = ['很', '非常', '特别', '超级', '极其', '相当', '十分'];
        const intensifierCount = intensifiers.filter(word => content.includes(word)).length;
        emotionScore += Math.min(intensifierCount * 0.02, 0.06);
        
        // 表情符号 (使用安全的匹配方式)
        const emojiCount = (content.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/gu) || []).length;
        emotionScore += Math.min(emojiCount * 0.02, 0.06);
        
        score += Math.min(emotionScore, 0.2);

        // 4. 对话结构权重 (0.15)
        let structureScore = 0;
        
        // 问句识别
        if (content.includes('?') || content.includes('？') || 
            /什么|怎么|为什么|哪里|谁|何时|如何/.test(content)) {
            structureScore += 0.05;
        }
        
        // 陈述句完整性
        if (content.length > 20 && /[。！？]$/.test(content)) {
            structureScore += 0.03;
        }
        
        // 引用和回复
        if (content.includes('@') || content.includes('回复') || 
            content.includes('你说的') || content.includes('刚才')) {
            structureScore += 0.04;
        }
        
        // 时态识别（计划或回忆）
        if (/明天|后天|下周|下个月|打算|计划|将要/.test(content) ||
            /昨天|前天|上周|上个月|以前|记得|想起/.test(content)) {
            structureScore += 0.03;
        }
        
        score += Math.min(structureScore, 0.15);

        // 5. 上下文关联权重 (0.1)
        let contextScore = 0;
        
        // 时间相关性
        if (context.timestamp) {
            const hoursSinceMessage = (Date.now() - context.timestamp) / (1000 * 60 * 60);
            if (hoursSinceMessage < 1) contextScore += 0.04; // 1小时内
            else if (hoursSinceMessage < 24) contextScore += 0.02; // 24小时内
        }
        
        // 消息发送者重要性
        if (context.senderId === 'user') contextScore += 0.02; // 用户消息更重要
        
        // 群聊vs私聊
        if (context.isGroupChat && content.includes('@')) {
            contextScore += 0.02; // 群聊中的@消息
        } else if (!context.isGroupChat) {
            contextScore += 0.02; // 私聊消息基础权重
        }
        
        score += Math.min(contextScore, 0.1);

        return Math.min(score, 1.0);
    }

    /**
     * 记忆类型分类（优化版）
     * @param {string} content 内容
     * @param {Object} context 上下文
     * @returns {string} 记忆类型
     */
    classifyMemoryType(content, context = {}) {
        const typeScores = {
            [MEMORY_CONFIG.memoryTypes.EPISODIC]: 0,
            [MEMORY_CONFIG.memoryTypes.SEMANTIC]: 0,
            [MEMORY_CONFIG.memoryTypes.SOCIAL]: 0,
            [MEMORY_CONFIG.memoryTypes.GENERAL]: 0
        };

        // 情节记忆特征检测
        const episodicPatterns = {
            timeMarkers: ['今天', '昨天', '前天', '刚才', '刚刚', '刚才', '最近'],
            datePatterns: /\d{1,2}[月日]|\d{4}年|上周|下周|这周|本周|上个月|下个月/,
            eventMarkers: ['发生', '经历', '遇到', '碰到', '去了', '来了', '做了'],
            storyMarkers: ['然后', '接着', '后来', '最后', '结果']
        };
        
        episodicPatterns.timeMarkers.forEach(marker => {
            if (content.includes(marker)) typeScores[MEMORY_CONFIG.memoryTypes.EPISODIC] += 0.25;
        });
        if (episodicPatterns.datePatterns.test(content)) {
            typeScores[MEMORY_CONFIG.memoryTypes.EPISODIC] += 0.3;
        }
        episodicPatterns.eventMarkers.forEach(marker => {
            if (content.includes(marker)) typeScores[MEMORY_CONFIG.memoryTypes.EPISODIC] += 0.15;
        });
        episodicPatterns.storyMarkers.forEach(marker => {
            if (content.includes(marker)) typeScores[MEMORY_CONFIG.memoryTypes.EPISODIC] += 0.1;
        });

        // 语义记忆特征检测
        const semanticPatterns = {
            factMarkers: ['是', '叫', '名字', '住在', '来自', '毕业于'],
            knowledgeMarkers: ['知道', '了解', '学习', '专业', '技能', '能力'],
            definitionMarkers: ['什么是', '意思是', '定义', '概念'],
            attributeMarkers: ['性格', '特点', '习惯', '爱好', '喜欢', '讨厌']
        };
        
        Object.values(semanticPatterns).forEach(patterns => {
            patterns.forEach(pattern => {
                if (content.includes(pattern)) {
                    typeScores[MEMORY_CONFIG.memoryTypes.SEMANTIC] += 0.2;
                }
            });
        });

        // 社交记忆特征检测
        const socialPatterns = {
            relationshipMarkers: ['朋友', '家人', '同事', '同学', '邻居', '亲戚'],
            socialActions: ['认识', '介绍', '见面', '聚会', '约会', '合作'],
            groupMarkers: ['我们', '大家', '团队', '一起', '共同'],
            communicationMarkers: ['说', '告诉', '聊天', '交流', '沟通']
        };
        
        Object.values(socialPatterns).forEach(patterns => {
            patterns.forEach(pattern => {
                if (content.includes(pattern)) {
                    typeScores[MEMORY_CONFIG.memoryTypes.SOCIAL] += 0.2;
                }
            });
        });
        
        // 群聊环境额外加分
        if (context.isGroupChat) {
            typeScores[MEMORY_CONFIG.memoryTypes.SOCIAL] += 0.3;
        }

        // 找出得分最高的类型
        const maxScore = Math.max(...Object.values(typeScores));
        if (maxScore < 0.3) {
            return MEMORY_CONFIG.memoryTypes.GENERAL; // 如果没有明显特征，归类为一般记忆
        }
        
        return Object.keys(typeScores).find(type => typeScores[type] === maxScore) || 
               MEMORY_CONFIG.memoryTypes.GENERAL;
    }

    /**
     * 提取内容标签（优化版）
     * @param {string} content 内容
     * @param {Object} context 上下文信息
     * @returns {Array<string>} 标签列表
     */
    extractTags(content, context = {}) {
        const tags = new Set();
        
        // 1. 个人信息标签
        const personalTags = {
            '身份信息': ['名字', '姓名', '叫什么', '我是'],
            '生日': ['生日', '出生', '几号生日', '生日是'],
            '联系方式': ['电话', '手机', '微信', '联系', '地址'],
            '家庭': ['家人', '父母', '爸爸', '妈妈', '孩子', '配偶', '老婆', '老公'],
            '工作': ['工作', '职业', '公司', '单位', '上班'],
            '学习': ['学校', '专业', '学习', '毕业', '同学'],
            '爱好': ['喜欢', '爱好', '兴趣', '擅长', '喜好']
        };
        
        Object.entries(personalTags).forEach(([tag, keywords]) => {
            if (keywords.some(keyword => content.includes(keyword))) {
                tags.add(tag);
            }
        });

        // 2. 情感标签
        const emotionTags = {
            '开心': ['开心', '高兴', '快乐', '兴奋', '激动', '😊', '😄', '😁'],
            '难过': ['难过', '伤心', '沮丧', '失落', '😢', '😭', '😞'],
            '生气': ['生气', '愤怒', '气愤', '恼火', '😠', '😡'],
            '担心': ['担心', '焦虑', '紧张', '害怕', '😰', '😨'],
            '惊喜': ['惊喜', '惊讶', '意外', '没想到', '😲', '😮']
        };
        
        Object.entries(emotionTags).forEach(([tag, keywords]) => {
            if (keywords.some(keyword => content.includes(keyword))) {
                tags.add(tag);
            }
        });

        // 3. 时间标签
        const timeTags = {
            '今日': ['今天', '今日'],
            '近期': ['最近', '这几天', '这周'],
            '过去': ['昨天', '前天', '以前', '之前'],
            '未来': ['明天', '后天', '以后', '将来', '计划']
        };
        
        Object.entries(timeTags).forEach(([tag, keywords]) => {
            if (keywords.some(keyword => content.includes(keyword))) {
                tags.add(tag);
            }
        });

        // 4. 活动标签
        const activityTags = {
            '运动': ['运动', '跑步', '游泳', '健身', '球类', '瑜伽'],
            '学习': ['学习', '读书', '考试', '课程', '培训'],
            '工作': ['工作', '会议', '项目', '任务', '出差'],
            '娱乐': ['看电影', '听音乐', '游戏', '旅游', '聚会'],
            '购物': ['购物', '买东西', '逛街', '网购']
        };
        
        Object.entries(activityTags).forEach(([tag, keywords]) => {
            if (keywords.some(keyword => content.includes(keyword))) {
                tags.add(tag);
            }
        });

        // 5. 位置标签
        const locationTags = {
            '家里': ['在家', '家里', '家中'],
            '公司': ['公司', '办公室', '单位'],
            '学校': ['学校', '教室', '图书馆'],
            '户外': ['外面', '街上', '公园', '商场']
        };
        
        Object.entries(locationTags).forEach(([tag, keywords]) => {
            if (keywords.some(keyword => content.includes(keyword))) {
                tags.add(tag);
            }
        });

        // 6. 上下文相关标签
        if (context.isGroupChat) {
            tags.add('群聊');
        } else {
            tags.add('私聊');
        }
        
        if (context.hasEmotionalContent) {
            tags.add('情感表达');
        }
        
        if (context.isDirectQuestion) {
            tags.add('问题');
        }

        // 7. 数字和日期提取
        const dateMatches = content.match(/\d{1,2}[月日]|\d{4}年|\d{1,2}[:-]\d{1,2}/g);
        if (dateMatches) {
            tags.add('日期信息');
        }
        
        const phoneMatches = content.match(/1[3-9]\d{9}|\d{3,4}[-]?\d{7,8}/g);
        if (phoneMatches) {
            tags.add('电话号码');
        }

        return Array.from(tags).slice(0, 8); // 限制最多8个标签，避免过度标记
    }

    /**
     * 检查是否包含个人信息
     * @param {string} content 内容
     * @returns {boolean}
     */
    hasPersonalInfo(content) {
        const personalKeywords = ['名字', '生日', '电话', '地址', '工作', '学校', '家人'];
        return personalKeywords.some(keyword => content.includes(keyword));
    }

    /**
     * 检查是否是直接问题
     * @param {string} content 内容
     * @returns {boolean}
     */
    isDirectQuestion(content) {
        return content.includes('?') || content.includes('？') || 
               content.includes('什么') || content.includes('怎么') ||
               content.includes('为什么') || content.includes('哪里');
    }

    /**
     * 检查是否有情感内容
     * @param {string} content 内容
     * @returns {boolean}
     */
    hasEmotionalContent(content) {
        const emotionWords = ['喜欢', '讨厌', '开心', '难过', '生气', '激动', '感动', '害怕'];
        return emotionWords.some(word => content.includes(word)) || 
               /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(content);
    }
}

/**
 * 记忆压缩管理器
 * 负责记忆的压缩和存储优化
 */
class MemoryCompressionManager {
    /**
     * 执行记忆压缩（优化版）
     * @param {string} roleId 角色ID
     * @param {Object} options 压缩选项
     * @returns {Promise<Object>} 压缩结果
     */
    async compressMemories(roleId, options = {}) {
        const {
            maxMemories = MEMORY_CONFIG.compression.maxMemoriesPerRole,
            importanceThreshold = MEMORY_CONFIG.compression.lowImportanceThreshold,
            timeWindowDays = MEMORY_CONFIG.compression.timeWindowDays,
            forceCompress = false // 强制压缩标志
        } = options;

        try {
            const db = getDB();
            const startTime = Date.now();
            
            // 1. 获取所有记忆并按重要性排序
            const memories = await db.memories
                .where('roleId')
                .equals(roleId)
                .orderBy('importance')
                .reverse()
                .toArray();

            console.log(`开始压缩记忆 - 角色: ${roleId}, 当前记忆数: ${memories.length}`);

            // 检查是否需要压缩
            if (!forceCompress && memories.length <= maxMemories * 0.8) {
                return {
                    compressed: 0,
                    message: '记忆数量未达到压缩阈值',
                    details: {
                        currentCount: memories.length,
                        threshold: Math.floor(maxMemories * 0.8),
                        processingTime: Date.now() - startTime
                    }
                };
            }

            let totalCompressed = 0;
            const compressionLog = [];

            // 2. 第一阶段：低重要性记忆清理
            const lowImportanceCount = await this.removeLowImportanceMemories(
                roleId, importanceThreshold
            );
            totalCompressed += lowImportanceCount;
            if (lowImportanceCount > 0) {
                compressionLog.push(`清理低重要性记忆: ${lowImportanceCount}个`);
            }

            // 3. 第二阶段：相似记忆智能合并
            const mergeCount = await this.mergeSimilarMemories(roleId);
            totalCompressed += mergeCount;
            if (mergeCount > 0) {
                compressionLog.push(`合并相似记忆: ${mergeCount}个`);
            }

            // 4. 第三阶段：时间衰减处理
            const decayCount = await this.applyTimeDecay(roleId, timeWindowDays);
            totalCompressed += decayCount;
            if (decayCount > 0) {
                compressionLog.push(`时间衰减清理: ${decayCount}个`);
            }

            // 5. 第四阶段：类型平衡调整
            const balanceCount = await this.balanceMemoryTypes(roleId, maxMemories);
            totalCompressed += balanceCount;
            if (balanceCount > 0) {
                compressionLog.push(`类型平衡调整: ${balanceCount}个`);
            }

            // 6. 获取压缩后的统计信息
            const finalMemories = await db.memories.where('roleId').equals(roleId).toArray();
            const processingTime = Date.now() - startTime;

            const compressionResult = {
                compressed: totalCompressed,
                message: `记忆压缩完成，处理耗时 ${processingTime}ms`,
                details: {
                    initialCount: memories.length,
                    finalCount: finalMemories.length,
                    compressionRate: totalCompressed > 0 ? 
                        ((totalCompressed / memories.length) * 100).toFixed(1) + '%' : '0%',
                    processingTime,
                    operations: compressionLog,
                    breakdown: {
                        lowImportanceRemoved: lowImportanceCount,
                        similarMerged: mergeCount,
                        timeDecayed: decayCount,
                        typeBalanced: balanceCount
                    }
                }
            };

            // 7. 记录压缩历史
            await this.recordCompressionHistory(roleId, compressionResult);

            console.log('记忆压缩完成:', compressionResult);
            return compressionResult;

        } catch (error) {
            console.error('Memory compression failed:', error);
            throw error;
        }
    }

    /**
     * 清理低重要性记忆（优化版）
     * @param {string} roleId 角色ID
     * @param {number} threshold 重要性阈值
     * @returns {Promise<number>} 清理数量
     */
    async removeLowImportanceMemories(roleId, threshold) {
        try {
            const db = getDB();
            
            // 获取低重要性记忆，但保留每种类型的最重要记忆
            const allMemories = await db.memories
                .where('roleId')
                .equals(roleId)
                .toArray();

            // 按类型分组
            const memoriesByType = {};
            allMemories.forEach(memory => {
                if (!memoriesByType[memory.type]) {
                    memoriesByType[memory.type] = [];
                }
                memoriesByType[memory.type].push(memory);
            });

            const toDelete = [];
            
            // 对每种类型的记忆进行智能清理
            Object.entries(memoriesByType).forEach(([type, memories]) => {
                // 按重要性排序
                memories.sort((a, b) => b.importance - a.importance);
                
                // 保留每种类型至少1个重要记忆
                const minKeep = 1;
                const lowImportanceInType = memories.filter((m, index) => 
                    index >= minKeep && m.importance < threshold
                );
                
                toDelete.push(...lowImportanceInType);
            });

            // 批量删除
            if (toDelete.length > 0) {
                await db.transaction('rw', db.memories, async () => {
                    for (const memory of toDelete) {
                        await db.memories.delete(memory.id);
                    }
                });
            }

            return toDelete.length;
        } catch (error) {
            console.error('Remove low importance memories failed:', error);
            return 0;
        }
    }

    /**
     * 智能合并相似记忆（优化版）
     * @param {string} roleId 角色ID
     * @returns {Promise<number>} 合并数量
     */
    async mergeSimilarMemories(roleId) {
        try {
            const db = getDB();
            const memories = await db.memories
                .where('roleId')
                .equals(roleId)
                .toArray();

            if (memories.length < 2) return 0;

            const processed = new Set();
            let mergeCount = 0;
            const mergeGroups = [];

            // 使用更智能的相似度检测
            for (let i = 0; i < memories.length; i++) {
                if (processed.has(memories[i].id)) continue;
                
                const currentGroup = [memories[i]];
                processed.add(memories[i].id);

                for (let j = i + 1; j < memories.length; j++) {
                    if (processed.has(memories[j].id)) continue;

                    const similarity = this.calculateAdvancedSimilarity(
                        memories[i], memories[j]
                    );

                    // 相似度阈值和类型匹配
                    if (similarity > MEMORY_CONFIG.compression.similarityThreshold && 
                        memories[i].type === memories[j].type) {
                        
                        currentGroup.push(memories[j]);
                        processed.add(memories[j].id);
                    }
                }

                // 如果组内有多个记忆，进行合并
                if (currentGroup.length > 1) {
                    mergeGroups.push(currentGroup);
                }
            }

            // 执行合并操作
            for (const group of mergeGroups) {
                const mergedMemory = await this.mergeMemoryGroup(group);
                if (mergedMemory) {
                    mergeCount += group.length - 1; // 合并后减少的记忆数
                }
            }

            return mergeCount;
        } catch (error) {
            console.error('Merge similar memories failed:', error);
            return 0;
        }
    }

    /**
     * 计算高级相似度
     * @param {Object} memory1 记忆1
     * @param {Object} memory2 记忆2
     * @returns {number} 相似度评分 0-1
     */
    calculateAdvancedSimilarity(memory1, memory2) {
        let similarity = 0;

        // 1. 内容相似度 (40%)
        const contentSim = this.calculateTextSimilarity(memory1.content, memory2.content);
        similarity += contentSim * 0.4;

        // 2. 标签重叠度 (30%)
        const tags1 = new Set(memory1.tags || []);
        const tags2 = new Set(memory2.tags || []);
        const tagIntersection = new Set([...tags1].filter(x => tags2.has(x)));
        const tagUnion = new Set([...tags1, ...tags2]);
        const tagSim = tagUnion.size > 0 ? tagIntersection.size / tagUnion.size : 0;
        similarity += tagSim * 0.3;

        // 3. 时间接近度 (20%)
        const time1 = new Date(memory1.createdAt).getTime();
        const time2 = new Date(memory2.createdAt).getTime();
        const timeDiff = Math.abs(time1 - time2);
        const maxTimeDiff = 7 * 24 * 60 * 60 * 1000; // 7天
        const timeSim = Math.max(0, 1 - timeDiff / maxTimeDiff);
        similarity += timeSim * 0.2;

        // 4. 重要性相似度 (10%)
        const importanceDiff = Math.abs(memory1.importance - memory2.importance);
        const importanceSim = 1 - importanceDiff;
        similarity += importanceSim * 0.1;

        return Math.min(similarity, 1);
    }

    /**
     * 合并记忆组
     * @param {Array} memoryGroup 记忆组
     * @returns {Promise<Object>} 合并后的记忆
     */
    async mergeMemoryGroup(memoryGroup) {
        try {
            const db = getDB();
            
            // 按重要性排序，选择主记忆
            memoryGroup.sort((a, b) => b.importance - a.importance);
            const primaryMemory = memoryGroup[0];
            const secondaryMemories = memoryGroup.slice(1);

            // 合并内容
            const mergedContent = this.createMergedContent(primaryMemory, secondaryMemories);
            
            // 合并标签
            const allTags = new Set();
            memoryGroup.forEach(memory => {
                (memory.tags || []).forEach(tag => allTags.add(tag));
            });

            // 计算合并后的重要性（取最高值并略微提升）
            const maxImportance = Math.max(...memoryGroup.map(m => m.importance));
            const mergedImportance = Math.min(1.0, maxImportance * 1.1);

            // 更新主记忆
            await db.memories.update(primaryMemory.id, {
                content: mergedContent,
                importance: mergedImportance,
                tags: Array.from(allTags),
                updatedAt: new Date().toISOString(),
                mergedFrom: secondaryMemories.map(m => m.id) // 记录合并来源
            });

            // 删除次要记忆
            await db.transaction('rw', db.memories, async () => {
                for (const memory of secondaryMemories) {
                    await db.memories.delete(memory.id);
                }
            });

            return primaryMemory;
        } catch (error) {
            console.error('Merge memory group failed:', error);
            return null;
        }
    }

    /**
     * 创建合并内容
     * @param {Object} primary 主记忆
     * @param {Array} secondaries 次要记忆数组
     * @returns {string} 合并后内容
     */
    createMergedContent(primary, secondaries) {
        let mergedContent = primary.content;
        
        // 如果次要记忆有独特信息，进行智能合并
        secondaries.forEach((secondary, index) => {
            const uniqueParts = this.extractUniqueContent(primary.content, secondary.content);
            if (uniqueParts.length > 0) {
                const summary = uniqueParts.join('；');
                if (summary.length > 10) { // 避免合并过短的内容
                    mergedContent += ` [补充${index + 1}: ${summary.substring(0, 100)}]`;
                }
            }
        });

        return mergedContent.substring(0, 600); // 限制总长度
    }

    /**
     * 提取独特内容
     * @param {string} mainContent 主内容
     * @param {string} additionalContent 附加内容
     * @returns {Array} 独特内容片段
     */
    extractUniqueContent(mainContent, additionalContent) {
        const mainWords = new Set(mainContent.toLowerCase().split(/\s+/));
        const additionalWords = additionalContent.toLowerCase().split(/\s+/);
        
        const uniqueWords = additionalWords.filter(word => 
            !mainWords.has(word) && word.length > 2
        );

        // 将独特词汇重新组合成有意义的片段
        return this.reconstructMeaningfulPhrases(uniqueWords, additionalContent);
    }

    /**
     * 重构有意义的短语
     * @param {Array} uniqueWords 独特词汇
     * @param {string} originalContent 原始内容
     * @returns {Array} 有意义的短语数组
     */
    reconstructMeaningfulPhrases(uniqueWords, originalContent) {
        const phrases = [];
        const sentences = originalContent.split(/[。！？]/);
        
        sentences.forEach(sentence => {
            const hasUniqueWords = uniqueWords.some(word => 
                sentence.toLowerCase().includes(word)
            );
            if (hasUniqueWords && sentence.trim().length > 5) {
                phrases.push(sentence.trim());
            }
        });
        
        return phrases.slice(0, 3); // 最多3个短语
    }

    /**
     * 智能时间衰减处理（优化版）
     * @param {string} roleId 角色ID
     * @param {number} timeWindowDays 时间窗口天数
     * @returns {Promise<number>} 衰减记忆数
     */
    async applyTimeDecay(roleId, timeWindowDays) {
        try {
            const db = getDB();
            const now = new Date();
            const cutoffTime = new Date(now.getTime() - timeWindowDays * 24 * 60 * 60 * 1000);

            const oldMemories = await db.memories
                .where('roleId')
                .equals(roleId)
                .and(memory => new Date(memory.createdAt) < cutoffTime)
                .toArray();

            if (oldMemories.length === 0) return 0;

            let decayCount = 0;
            const decayOperations = [];

            for (const memory of oldMemories) {
                const memoryAge = now.getTime() - new Date(memory.createdAt).getTime();
                const ageDays = memoryAge / (1000 * 60 * 60 * 24);
                
                // 分层衰减策略
                let decayFactor;
                if (memory.importance >= MEMORY_CONFIG.importanceThresholds.veryHigh) {
                    // 极重要记忆：轻微衰减
                    decayFactor = Math.max(0.95, 1 - ageDays / (365 * 2)); // 2年缓慢衰减
                } else if (memory.importance >= MEMORY_CONFIG.importanceThresholds.high) {
                    // 重要记忆：中等衰减
                    decayFactor = Math.max(0.85, 1 - ageDays / 365); // 1年衰减
                } else if (memory.importance >= MEMORY_CONFIG.importanceThresholds.medium) {
                    // 中等记忆：正常衰减
                    decayFactor = Math.max(0.7, 1 - ageDays / 180); // 6个月衰减
                } else {
                    // 低重要性记忆：快速衰减
                    decayFactor = Math.max(0.5, 1 - ageDays / 90); // 3个月衰减
                }

                const newImportance = memory.importance * decayFactor;
                
                // 决定是删除还是更新
                if (newImportance < MEMORY_CONFIG.compression.lowImportanceThreshold) {
                    decayOperations.push({ type: 'delete', memory });
                    decayCount++;
                } else if (Math.abs(newImportance - memory.importance) > 0.05) {
                    // 只有显著变化才更新
                    decayOperations.push({ 
                        type: 'update', 
                        memory, 
                        newImportance 
                    });
                }
            }

            // 批量执行衰减操作
            if (decayOperations.length > 0) {
                await db.transaction('rw', db.memories, async () => {
                    for (const operation of decayOperations) {
                        if (operation.type === 'delete') {
                            await db.memories.delete(operation.memory.id);
                        } else if (operation.type === 'update') {
                            await db.memories.update(operation.memory.id, {
                                importance: operation.newImportance,
                                updatedAt: new Date().toISOString()
                            });
                        }
                    }
                });
            }

            return decayCount;
        } catch (error) {
            console.error('Apply time decay failed:', error);
            return 0;
        }
    }

    /**
     * 记忆类型平衡调整
     * @param {string} roleId 角色ID
     * @param {number} maxMemories 最大记忆数
     * @returns {Promise<number>} 调整数量
     */
    async balanceMemoryTypes(roleId, maxMemories) {
        try {
            const db = getDB();
            const allMemories = await db.memories.where('roleId').equals(roleId).toArray();
            
            if (allMemories.length <= maxMemories * 0.9) return 0;

            // 按类型分组统计
            const typeStats = {};
            const typeMemories = {};
            
            Object.values(MEMORY_CONFIG.memoryTypes).forEach(type => {
                typeStats[type] = 0;
                typeMemories[type] = [];
            });

            allMemories.forEach(memory => {
                const type = memory.type || MEMORY_CONFIG.memoryTypes.GENERAL;
                typeStats[type]++;
                typeMemories[type].push(memory);
            });

            // 计算理想分配
            const totalMemories = allMemories.length;
            const idealDistribution = {
                [MEMORY_CONFIG.memoryTypes.SEMANTIC]: 0.4,   // 知识记忆40%
                [MEMORY_CONFIG.memoryTypes.EPISODIC]: 0.3,   // 事件记忆30%
                [MEMORY_CONFIG.memoryTypes.SOCIAL]: 0.2,     // 社交记忆20%
                [MEMORY_CONFIG.memoryTypes.GENERAL]: 0.1     // 一般记忆10%
            };

            let balanceCount = 0;
            const toDelete = [];

            // 找出过量的记忆类型并标记删除
            Object.entries(typeStats).forEach(([type, count]) => {
                const idealCount = Math.floor(maxMemories * (idealDistribution[type] || 0.1));
                if (count > idealCount * 1.5) { // 超出理想值50%时进行平衡
                    const excess = count - idealCount;
                    const typeMemoriesSorted = typeMemories[type]
                        .sort((a, b) => a.importance - b.importance); // 按重要性升序
                    
                    // 删除重要性最低的过量记忆
                    toDelete.push(...typeMemoriesSorted.slice(0, excess));
                    balanceCount += excess;
                }
            });

            // 批量删除
            if (toDelete.length > 0) {
                await db.transaction('rw', db.memories, async () => {
                    for (const memory of toDelete) {
                        await db.memories.delete(memory.id);
                    }
                });
            }

            return balanceCount;
        } catch (error) {
            console.error('Balance memory types failed:', error);
            return 0;
        }
    }

    /**
     * 记录压缩历史
     * @param {string} roleId 角色ID
     * @param {Object} compressionResult 压缩结果
     * @returns {Promise<void>}
     */
    async recordCompressionHistory(roleId, compressionResult) {
        try {
            const db = getDB();
            const historyRecord = {
                id: `compression_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                roleId,
                timestamp: new Date().toISOString(),
                result: compressionResult,
                type: 'auto_compression'
            };

            // 保存到全局设置中的压缩历史
            let globalSettings = await db.globalSettings.get('main');
            if (!globalSettings) {
                globalSettings = { id: 'main', compressionHistory: [] };
            }
            if (!globalSettings.compressionHistory) {
                globalSettings.compressionHistory = [];
            }

            globalSettings.compressionHistory.unshift(historyRecord);
            
            // 只保留最近50条历史记录
            if (globalSettings.compressionHistory.length > 50) {
                globalSettings.compressionHistory = globalSettings.compressionHistory.slice(0, 50);
            }

            await db.globalSettings.put(globalSettings);
        } catch (error) {
            console.warn('Failed to record compression history:', error);
        }
    }
}

/**
 * 记忆注入管理器
 * 负责为提示词注入相关记忆
 */
class MemoryInjectionManager {
    constructor() {
        this.DEFAULT_TOKEN_BUDGET = MEMORY_CONFIG.injection.defaultTokenBudget;
        this.MEMORY_TOKEN_RATIO = MEMORY_CONFIG.injection.memoryTokenRatio;
    }

    /**
     * 为提示词注入记忆（优化版）
     * @param {string} roleId 角色ID
     * @param {Object} context 聊天上下文
     * @returns {Promise<Object>} 注入结果
     */
    async injectMemories(roleId, context = {}) {
        const startTime = Date.now();
        const {
            tokenBudget = this.DEFAULT_TOKEN_BUDGET,
            maxMemories = MEMORY_CONFIG.injection.maxMemoriesPerContext,
            contextKeywords = [],
            currentMessage = '',
            chatHistory = [],
            preferredTypes = [],
            urgencyLevel = 'normal' // low, normal, high, critical
        } = context;

        try {
            console.log(`开始记忆注入 - 角色: ${roleId}, 预算: ${tokenBudget} tokens`);

            // 1. 动态预算分配
            const budgetAllocation = this.calculateDynamicBudget(
                tokenBudget, urgencyLevel, context
            );

            // 2. 多维度记忆检索
            const relevantMemories = await this.findRelevantMemoriesAdvanced(
                roleId, {
                    keywords: contextKeywords,
                    currentMessage,
                    chatHistory,
                    preferredTypes,
                    limit: maxMemories * 3 // 增加候选池
                }
            );

            console.log(`检索到 ${relevantMemories.length} 个候选记忆`);

            // 3. 智能相关性排序
            const rankedMemories = await this.rankMemoriesAdvanced(
                relevantMemories, context, budgetAllocation
            );

            // 4. 预算感知选择
            const selectedMemories = await this.selectMemoriesWithBudgetOptimization(
                rankedMemories, budgetAllocation
            );

            // 5. 上下文感知格式化
            const memoryText = this.formatMemoriesContextAware(
                selectedMemories, context
            );

            const estimatedTokens = this.estimateTokenCount(memoryText);
            const processingTime = Date.now() - startTime;

            // 6. 生成详细的注入报告
            const injectionReport = {
                memoryText,
                usedMemories: selectedMemories.length,
                estimatedTokens,
                remainingBudget: budgetAllocation.total - estimatedTokens,
                processingTime,
                budgetUtilization: (estimatedTokens / budgetAllocation.total * 100).toFixed(1) + '%',
                memoryDistribution: this.analyzeMemoryDistribution(selectedMemories),
                relevanceScores: selectedMemories.map(m => ({
                    id: m.id,
                    content: m.content.substring(0, 50) + '...',
                    relevance: m.contextScore || 0,
                    importance: m.importance,
                    type: m.type
                }))
            };

            // 7. 记录注入历史
            await this.recordInjectionHistory(roleId, injectionReport);

            console.log(`记忆注入完成 - 使用 ${selectedMemories.length} 个记忆, ${estimatedTokens} tokens, 耗时 ${processingTime}ms`);

            return injectionReport;

        } catch (error) {
            console.error('Advanced inject memories failed:', error);
            return {
                memoryText: '',
                usedMemories: 0,
                estimatedTokens: 0,
                remainingBudget: tokenBudget * this.MEMORY_TOKEN_RATIO,
                error: error.message,
                processingTime: Date.now() - startTime
            };
        }
    }

    /**
     * 动态预算分配计算（优化版）
     * @param {number} totalBudget 总预算
     * @param {string} urgencyLevel 紧急程度
     * @param {Object} context 上下文信息
     * @returns {Object} 预算分配结果
     */
    calculateDynamicBudget(totalBudget, urgencyLevel = 'normal', context = {}) {
        const baseMemoryRatio = this.MEMORY_TOKEN_RATIO;
        let memoryBudget = Math.floor(totalBudget * baseMemoryRatio);
        
        // 根据紧急程度调整预算
        const urgencyMultipliers = {
            'low': 0.8,      // 低优先级减少预算
            'normal': 1.0,   // 正常情况
            'high': 1.3,     // 高优先级增加预算
            'critical': 1.5  // 关键情况大幅增加
        };
        
        const urgencyMultiplier = urgencyMultipliers[urgencyLevel] || 1.0;
        memoryBudget = Math.floor(memoryBudget * urgencyMultiplier);
        
        // 根据上下文动态调整
        let contextBonus = 0;
        
        // 如果有历史对话，增加预算
        if (context.chatHistory && context.chatHistory.length > 5) {
            contextBonus += Math.floor(memoryBudget * 0.1);
        }
        
        // 如果有特定关键词，增加预算
        if (context.contextKeywords && context.contextKeywords.length > 3) {
            contextBonus += Math.floor(memoryBudget * 0.15);
        }
        
        // 如果有偏好类型，稍微增加预算
        if (context.preferredTypes && context.preferredTypes.length > 0) {
            contextBonus += Math.floor(memoryBudget * 0.05);
        }
        
        const finalMemoryBudget = Math.min(
            memoryBudget + contextBonus,
            totalBudget * 0.6 // 记忆最多占总预算60%
        );
        
        return {
            total: finalMemoryBudget,
            base: memoryBudget,
            bonus: contextBonus,
            urgencyLevel,
            utilization: (finalMemoryBudget / totalBudget * 100).toFixed(1) + '%',
            breakdown: {
                urgencyMultiplier,
                contextBonus,
                finalRatio: finalMemoryBudget / totalBudget
            }
        };
    }

    /**
     * 高级多维度记忆检索
     * @param {string} roleId 角色ID
     * @param {Object} options 检索选项
     * @returns {Promise<Array>} 相关记忆列表
     */
    async findRelevantMemoriesAdvanced(roleId, options = {}) {
        const {
            keywords = [],
            currentMessage = '',
            chatHistory = [],
            preferredTypes = [],
            limit = 40
        } = options;

        try {
            const db = getDB();
            const allMemories = await db.memories
                .where('roleId')
                .equals(roleId)
                .toArray();

            if (allMemories.length === 0) return [];

            // 1. 关键词匹配记忆
            const keywordMemories = this.findMemoriesByKeywords(allMemories, keywords);
            
            // 2. 语义相似记忆（基于当前消息）
            const semanticMemories = this.findMemoriesBySemantic(allMemories, currentMessage);
            
            // 3. 历史关联记忆（基于对话历史）
            const historyMemories = this.findMemoriesByHistory(allMemories, chatHistory);
            
            // 4. 类型偏好记忆
            const typeMemories = preferredTypes.length > 0 ? 
                allMemories.filter(m => preferredTypes.includes(m.type)) : [];
            
            // 5. 时间相关记忆（最近的重要记忆）
            const recentMemories = this.findRecentImportantMemories(allMemories);
            
            // 合并去重，保留最相关的记忆
            const combinedMemories = this.combineAndDeduplicateMemories([
                keywordMemories,
                semanticMemories, 
                historyMemories,
                typeMemories,
                recentMemories
            ]);
            
            // 初步筛选限制数量
            return combinedMemories.slice(0, limit);
            
        } catch (error) {
            console.error('Advanced memory retrieval failed:', error);
            return [];
        }
    }

    /**
     * 基于关键词匹配记忆
     * @param {Array} memories 记忆列表
     * @param {Array} keywords 关键词数组
     * @returns {Array} 匹配的记忆
     */
    findMemoriesByKeywords(memories, keywords) {
        if (!keywords.length) return [];
        
        return memories
            .map(memory => {
                const content = memory.content.toLowerCase();
                let score = 0;
                let matchedKeywords = 0;
                
                keywords.forEach(keyword => {
                    const normalizedKeyword = keyword.toLowerCase();
                    if (content.includes(normalizedKeyword)) {
                        matchedKeywords++;
                        // 完全匹配得分更高
                        if (content.indexOf(normalizedKeyword) === 0) {
                            score += 2;
                        } else {
                            score += 1;
                        }
                    }
                });
                
                return {
                    ...memory,
                    keywordScore: score,
                    keywordMatchRatio: matchedKeywords / keywords.length
                };
            })
            .filter(memory => memory.keywordScore > 0)
            .sort((a, b) => (b.keywordScore + b.importance) - (a.keywordScore + a.importance));
    }

    /**
     * 基于语义相似度匹配记忆
     * @param {Array} memories 记忆列表
     * @param {string} currentMessage 当前消息
     * @returns {Array} 语义相关的记忆
     */
    findMemoriesBySemantic(memories, currentMessage) {
        if (!currentMessage.trim()) return [];
        
        const messageWords = new Set(
            currentMessage.toLowerCase()
                .split(/[\s\u4e00-\u9fff]+/)
                .filter(word => word.length > 1)
        );
        
        return memories
            .map(memory => {
                const memoryWords = new Set(
                    memory.content.toLowerCase()
                        .split(/[\s\u4e00-\u9fff]+/)
                        .filter(word => word.length > 1)
                );
                
                const intersection = new Set([...messageWords].filter(x => memoryWords.has(x)));
                const union = new Set([...messageWords, ...memoryWords]);
                
                const similarity = union.size > 0 ? intersection.size / union.size : 0;
                
                return {
                    ...memory,
                    semanticScore: similarity * memory.importance
                };
            })
            .filter(memory => memory.semanticScore > 0.1)
            .sort((a, b) => b.semanticScore - a.semanticScore);
    }

    /**
     * 基于对话历史匹配记忆
     * @param {Array} memories 记忆列表
     * @param {Array} chatHistory 对话历史
     * @returns {Array} 历史相关的记忆
     */
    findMemoriesByHistory(memories, chatHistory) {
        if (!chatHistory.length) return [];
        
        // 提取历史对话中的关键词
        const historyText = chatHistory
            .slice(-5) // 只考虑最近5条消息
            .map(msg => msg.content || '')
            .join(' ')
            .toLowerCase();
        
        if (!historyText.trim()) return [];
        
        const historyKeywords = historyText
            .split(/[\s\u4e00-\u9fff]+/)
            .filter(word => word.length > 1)
            .slice(0, 20); // 限制关键词数量
        
        return this.findMemoriesByKeywords(memories, historyKeywords)
            .map(memory => ({
                ...memory,
                historyScore: memory.keywordScore * 0.7 // 历史关联权重稍低
            }));
    }

    /**
     * 查找最近的重要记忆
     * @param {Array} memories 记忆列表
     * @returns {Array} 最近重要记忆
     */
    findRecentImportantMemories(memories) {
        const now = Date.now();
        const oneDayMs = 24 * 60 * 60 * 1000;
        const oneWeekMs = 7 * oneDayMs;
        
        return memories
            .filter(memory => {
                const memoryTime = new Date(memory.createdAt).getTime();
                const age = now - memoryTime;
                
                // 一天内的重要记忆 或 一周内的极重要记忆
                return (
                    (age < oneDayMs && memory.importance > 0.6) ||
                    (age < oneWeekMs && memory.importance > 0.8)
                );
            })
            .map(memory => {
                const age = now - new Date(memory.createdAt).getTime();
                const recencyScore = Math.max(0, 1 - age / oneWeekMs);
                
                return {
                    ...memory,
                    recencyScore: recencyScore * memory.importance
                };
            })
            .sort((a, b) => b.recencyScore - a.recencyScore);
    }

    /**
     * 合并并去重记忆
     * @param {Array<Array>} memoryGroups 记忆组数组
     * @returns {Array} 合并后的记忆列表
     */
    combineAndDeduplicateMemories(memoryGroups) {
        const memoryMap = new Map();
        const scoreMap = new Map();
        
        // 合并所有记忆，记录最高分数
        memoryGroups.forEach((group, groupIndex) => {
            group.forEach(memory => {
                const id = memory.id;
                
                if (!memoryMap.has(id)) {
                    memoryMap.set(id, memory);
                    scoreMap.set(id, {
                        groups: [groupIndex],
                        scores: {
                            keywordScore: memory.keywordScore || 0,
                            semanticScore: memory.semanticScore || 0,
                            historyScore: memory.historyScore || 0,
                            recencyScore: memory.recencyScore || 0
                        }
                    });
                } else {
                    // 记忆在多个组中出现，增加权重
                    const existing = scoreMap.get(id);
                    existing.groups.push(groupIndex);
                    
                    // 合并分数
                    existing.scores.keywordScore = Math.max(
                        existing.scores.keywordScore, 
                        memory.keywordScore || 0
                    );
                    existing.scores.semanticScore = Math.max(
                        existing.scores.semanticScore,
                        memory.semanticScore || 0
                    );
                    existing.scores.historyScore = Math.max(
                        existing.scores.historyScore,
                        memory.historyScore || 0
                    );
                    existing.scores.recencyScore = Math.max(
                        existing.scores.recencyScore,
                        memory.recencyScore || 0
                    );
                }
            });
        });
        
        // 计算综合分数并排序
        const rankedMemories = Array.from(memoryMap.entries())
            .map(([id, memory]) => {
                const stats = scoreMap.get(id);
                const groupBonus = stats.groups.length > 1 ? 0.2 : 0; // 多组匹配加分
                
                const compositeScore = 
                    stats.scores.keywordScore * 0.3 +
                    stats.scores.semanticScore * 0.3 +
                    stats.scores.historyScore * 0.2 +
                    stats.scores.recencyScore * 0.2 +
                    memory.importance * 0.5 +
                    groupBonus;
                
                return {
                    ...memory,
                    compositeScore,
                    groupCount: stats.groups.length,
                    detailedScores: stats.scores
                };
            })
            .sort((a, b) => b.compositeScore - a.compositeScore);
        
        return rankedMemories;
    }

    /**
     * 高级记忆排名算法
     * @param {Array} memories 记忆列表
     * @param {Object} context 上下文信息
     * @param {Object} budgetAllocation 预算分配
     * @returns {Array} 排序后的记忆
     */
    async rankMemoriesAdvanced(memories, context, budgetAllocation) {
        if (!memories.length) return [];
        
        const rankedMemories = await Promise.all(
            memories.map(async memory => {
                // 1. 基础上下文相关性
                const contextScore = this.calculateAdvancedContextRelevance(memory, context);
                
                // 2. 预算效率评分
                const budgetEfficiency = this.calculateBudgetEfficiency(
                    memory, budgetAllocation
                );
                
                // 3. 记忆新鲜度评分
                const freshnessScore = this.calculateFreshnessScore(memory);
                
                // 4. 记忆互补性评分（与已选记忆的互补程度）
                const complementScore = await this.calculateComplementScore(
                    memory, memories
                );
                
                // 5. 综合评分计算
                const finalScore = this.calculateFinalRankingScore({
                    memory,
                    contextScore,
                    budgetEfficiency,
                    freshnessScore,
                    complementScore,
                    urgencyLevel: context.urgencyLevel || 'normal'
                });
                
                return {
                    ...memory,
                    rankingScores: {
                        contextScore,
                        budgetEfficiency,
                        freshnessScore,
                        complementScore,
                        finalScore
                    },
                    finalScore
                };
            })
        );
        
        return rankedMemories.sort((a, b) => b.finalScore - a.finalScore);
    }
    
    /**
     * 计算高级上下文相关性
     * @param {Object} memory 记忆对象
     * @param {Object} context 上下文
     * @returns {number} 相关性评分
     */
    calculateAdvancedContextRelevance(memory, context) {
        let score = 0;
        
        // 1. 时间相关性（30%）
        const timeRelevance = this.calculateTimeRelevance(memory, context);
        score += timeRelevance * 0.3;
        
        // 2. 类型匹配（25%）
        const typeRelevance = this.calculateTypeRelevance(memory, context);
        score += typeRelevance * 0.25;
        
        // 3. 标签匹配（25%）
        const tagRelevance = this.calculateTagRelevance(memory, context);
        score += tagRelevance * 0.25;
        
        // 4. 内容语义相关性（20%）
        const semanticRelevance = this.calculateSemanticRelevance(memory, context);
        score += semanticRelevance * 0.2;
        
        return Math.min(score, 1.0);
    }
    
    /**
     * 计算预算效率评分
     * @param {Object} memory 记忆对象
     * @param {Object} budgetAllocation 预算分配
     * @returns {number} 效率评分
     */
    calculateBudgetEfficiency(memory, budgetAllocation) {
        const memoryTokens = this.estimateTokenCount(memory.content);
        const efficiency = memory.importance / Math.max(memoryTokens, 1);
        
        // 根据预算紧张程度调整权重
        const budgetPressure = budgetAllocation.breakdown.finalRatio;
        let efficiencyWeight = 1.0;
        
        if (budgetPressure > 0.5) {
            efficiencyWeight = 1.5; // 预算紧张时更看重效率
        } else if (budgetPressure < 0.3) {
            efficiencyWeight = 0.8; // 预算宽松时效率权重降低
        }
        
        return Math.min(efficiency * efficiencyWeight, 1.0);
    }
    
    /**
     * 计算记忆新鲜度评分
     * @param {Object} memory 记忆对象
     * @returns {number} 新鲜度评分
     */
    calculateFreshnessScore(memory) {
        const now = Date.now();
        const memoryTime = new Date(memory.createdAt).getTime();
        const age = now - memoryTime;
        
        // 24小时内：完全新鲜 (1.0)
        // 7天内：中等新鲜 (0.6-0.9) 
        // 30天内：较低新鲜 (0.3-0.6)
        // 更久：基础新鲜度 (0.1-0.3)
        
        const dayMs = 24 * 60 * 60 * 1000;
        const weekMs = 7 * dayMs;
        const monthMs = 30 * dayMs;
        
        if (age < dayMs) {
            return 1.0 - (age / dayMs) * 0.1; // 0.9-1.0
        } else if (age < weekMs) {
            return 0.9 - ((age - dayMs) / (weekMs - dayMs)) * 0.3; // 0.6-0.9
        } else if (age < monthMs) {
            return 0.6 - ((age - weekMs) / (monthMs - weekMs)) * 0.3; // 0.3-0.6
        } else {
            return Math.max(0.1, 0.3 - (age - monthMs) / (monthMs * 12) * 0.2); // 0.1-0.3
        }
    }
    
    /**
     * 计算记忆互补性评分
     * @param {Object} memory 当前记忆
     * @param {Array} allMemories 所有记忆
     * @returns {Promise<number>} 互补性评分
     */
    async calculateComplementScore(memory, allMemories) {
        // 简化版本的互补性计算
        // 实际应用中可以使用更复杂的语义分析
        
        const memoryType = memory.type;
        const memoryTags = new Set(memory.tags || []);
        
        // 检查类型多样性
        const typeDistribution = {};
        allMemories.forEach(m => {
            typeDistribution[m.type] = (typeDistribution[m.type] || 0) + 1;
        });
        
        const totalMemories = allMemories.length;
        const typeRatio = (typeDistribution[memoryType] || 0) / totalMemories;
        
        // 类型稀缺性加分（稀缺的类型得分更高）
        const typeComplementScore = Math.max(0, 1 - typeRatio * 2);
        
        // 标签独特性加分
        let uniqueTagsCount = 0;
        const allTags = new Set();
        allMemories.forEach(m => {
            (m.tags || []).forEach(tag => allTags.add(tag));
        });
        
        memoryTags.forEach(tag => {
            const tagFreq = allMemories.filter(m => 
                (m.tags || []).includes(tag)
            ).length;
            if (tagFreq / totalMemories < 0.3) { // 低频标签加分
                uniqueTagsCount++;
            }
        });
        
        const uniqueTagsRatio = memoryTags.size > 0 ? 
            uniqueTagsCount / memoryTags.size : 0;
        
        return (typeComplementScore * 0.6 + uniqueTagsRatio * 0.4);
    }
    
    /**
     * 计算最终排名评分
     * @param {Object} params 评分参数
     * @returns {number} 最终评分
     */
    calculateFinalRankingScore(params) {
        const {
            memory,
            contextScore,
            budgetEfficiency, 
            freshnessScore,
            complementScore,
            urgencyLevel
        } = params;
        
        // 基础权重配置
        let weights = {
            importance: 0.35,    // 重要性权重
            context: 0.25,       // 上下文相关性
            efficiency: 0.15,    // 预算效率
            freshness: 0.15,     // 新鲜度
            complement: 0.10     // 互补性
        };
        
        // 根据紧急程度调整权重
        switch (urgencyLevel) {
            case 'critical':
                weights.importance = 0.45;
                weights.context = 0.35;
                weights.efficiency = 0.10;
                weights.freshness = 0.05;
                weights.complement = 0.05;
                break;
            case 'high':
                weights.importance = 0.40;
                weights.context = 0.30;
                weights.efficiency = 0.12;
                weights.freshness = 0.10;
                weights.complement = 0.08;
                break;
            case 'low':
                weights.importance = 0.25;
                weights.context = 0.20;
                weights.efficiency = 0.20;
                weights.freshness = 0.20;
                weights.complement = 0.15;
                break;
            // 'normal' 使用默认权重
        }
        
        const finalScore = 
            memory.importance * weights.importance +
            contextScore * weights.context +
            budgetEfficiency * weights.efficiency +
            freshnessScore * weights.freshness +
            complementScore * weights.complement;
        
        return Math.min(finalScore, 1.0);
    }

    /**
     * 时间相关性计算
     * @param {Object} memory 记忆对象
     * @param {Object} context 上下文
     * @returns {number} 时间相关性评分
     */
    calculateTimeRelevance(memory, context) {
        const now = Date.now();
        const memoryTime = new Date(memory.createdAt).getTime();
        const age = now - memoryTime;
        
        // 基础时间衰减
        const dayMs = 24 * 60 * 60 * 1000;
        let timeScore = Math.max(0, 1 - age / (30 * dayMs)); // 30天线性衰减
        
        // 上下文时间因素
        if (context.currentTime) {
            const contextTime = new Date(context.currentTime).getTime();
            const timeDiff = Math.abs(memoryTime - contextTime);
            if (timeDiff < dayMs) {
                timeScore *= 1.5; // 时间接近加成
            }
        }
        
        return Math.min(timeScore, 1.0);
    }
    
    /**
     * 类型相关性计算
     * @param {Object} memory 记忆对象
     * @param {Object} context 上下文
     * @returns {number} 类型相关性评分
     */
    calculateTypeRelevance(memory, context) {
        const { preferredTypes = [], urgencyLevel = 'normal' } = context;
        
        // 如果有明确偏好类型
        if (preferredTypes.includes(memory.type)) {
            return 1.0;
        }
        
        // 根据紧急程度调整类型权重
        const typeWeights = {
            'critical': {
                'semantic': 0.9,  // 关键时刻优先知识记忆
                'episodic': 0.7,
                'social': 0.5,
                'general': 0.3
            },
            'normal': {
                'semantic': 0.7,
                'episodic': 0.8,
                'social': 0.6,
                'general': 0.5
            },
            'low': {
                'semantic': 0.6,
                'episodic': 0.5,
                'social': 0.8,    // 低优先级时社交记忆更重要
                'general': 0.7
            }
        };
        
        const weights = typeWeights[urgencyLevel] || typeWeights['normal'];
        return weights[memory.type] || 0.5;
    }
    
    /**
     * 标签相关性计算
     * @param {Object} memory 记忆对象
     * @param {Object} context 上下文
     * @returns {number} 标签相关性评分
     */
    calculateTagRelevance(memory, context) {
        const memoryTags = new Set(memory.tags || []);
        const contextTags = new Set(context.tags || []);
        
        if (memoryTags.size === 0) return 0.5; // 无标签时中等分数
        if (contextTags.size === 0) return 0.5;
        
        // 计算标签重叠度
        const intersection = new Set([...memoryTags].filter(x => contextTags.has(x)));
        const union = new Set([...memoryTags, ...contextTags]);
        
        const jaccardSimilarity = intersection.size / union.size;
        
        // 考虑标签权重（某些标签可能更重要）
        const importantTags = new Set(['重要', '生日', '工作', '家人', '爱好']);
        let importantMatches = 0;
        
        intersection.forEach(tag => {
            if (importantTags.has(tag)) {
                importantMatches++;
            }
        });
        
        const importantBonus = importantMatches * 0.2;
        
        return Math.min(jaccardSimilarity + importantBonus, 1.0);
    }
    
    /**
     * 语义相关性计算
     * @param {Object} memory 记忆对象
     * @param {Object} context 上下文
     * @returns {number} 语义相关性评分
     */
    calculateSemanticRelevance(memory, context) {
        const { currentMessage = '', contextKeywords = [] } = context;
        
        if (!currentMessage.trim() && !contextKeywords.length) {
            return 0.5; // 无语义信息时中等分数
        }
        
        let semanticScore = 0;
        
        // 关键词匹配
        if (contextKeywords.length > 0) {
            const memoryContent = memory.content.toLowerCase();
            const matchedKeywords = contextKeywords.filter(keyword =>
                memoryContent.includes(keyword.toLowerCase())
            ).length;
            
            semanticScore += (matchedKeywords / contextKeywords.length) * 0.6;
        }
        
        // 当前消息语义匹配
        if (currentMessage.trim()) {
            const messageWords = new Set(
                currentMessage.toLowerCase()
                    .split(/\s+/)
                    .filter(word => word.length > 1)
            );
            
            const memoryWords = new Set(
                memory.content.toLowerCase()
                    .split(/\s+/)
                    .filter(word => word.length > 1)
            );
            
            const intersection = new Set([...messageWords].filter(x => memoryWords.has(x)));
            const similarity = messageWords.size > 0 ? intersection.size / messageWords.size : 0;
            
            semanticScore += similarity * 0.4;
        }
        
        return Math.min(semanticScore, 1.0);
    }

    /**
     * 预算感知的记忆选择优化算法
     * @param {Array} memories 排序后的记忆列表
     * @param {Object} budgetAllocation 预算分配
     * @returns {Array} 选中的记忆
     */
    async selectMemoriesWithBudgetOptimization(memories, budgetAllocation) {
        if (!memories.length) return [];
        
        const { total: totalBudget } = budgetAllocation;
        const selected = [];
        let usedTokens = 0;
        
        // 1. 贪心算法：按价值密度排序
        const valueMemories = memories
            .map(memory => {
                const tokens = this.estimateTokenCount(memory.content);
                const valueDensity = memory.finalScore / Math.max(tokens, 1);
                return { ...memory, tokens, valueDensity };
            })
            .sort((a, b) => b.valueDensity - a.valueDensity);
        
        // 2. 动态规划优化选择（简化版）
        for (const memory of valueMemories) {
            const memoryTokens = memory.tokens;
            
            // 检查预算约束
            if (usedTokens + memoryTokens <= totalBudget) {
                selected.push(memory);
                usedTokens += memoryTokens;
                
                // 限制最大记忆数量
                if (selected.length >= MEMORY_CONFIG.injection.maxMemoriesPerContext) {
                    break;
                }
            } else {
                // 尝试选择更小的记忆来填充剩余空间
                const remainingBudget = totalBudget - usedTokens;
                const smallMemory = valueMemories
                    .filter(m => !selected.includes(m))
                    .find(m => m.tokens <= remainingBudget);
                
                if (smallMemory) {
                    selected.push(smallMemory);
                    usedTokens += smallMemory.tokens;
                }
                break;
            }
        }
        
        // 3. 后处理优化：确保类型多样性
        const optimizedSelection = this.ensureMemoryDiversity(selected, budgetAllocation);
        
        console.log(`预算优化选择完成 - 选中 ${optimizedSelection.length} 个记忆，使用 ${usedTokens}/${totalBudget} tokens`);
        
        return optimizedSelection;
    }
    
    /**
     * 确保记忆类型多样性
     * @param {Array} selectedMemories 已选记忆
     * @param {Object} budgetAllocation 预算分配
     * @returns {Array} 优化后的记忆选择
     */
    ensureMemoryDiversity(selectedMemories, budgetAllocation) {
        if (selectedMemories.length <= 3) return selectedMemories;
        
        // 统计类型分布
        const typeDistribution = {};
        selectedMemories.forEach(memory => {
            typeDistribution[memory.type] = (typeDistribution[memory.type] || 0) + 1;
        });
        
        const types = Object.keys(typeDistribution);
        const totalMemories = selectedMemories.length;
        
        // 如果类型过于集中，进行调整
        const dominantType = types.reduce((a, b) => 
            typeDistribution[a] > typeDistribution[b] ? a : b
        );
        
        const dominantRatio = typeDistribution[dominantType] / totalMemories;
        
        // 如果某种类型占比超过70%，尝试调整
        if (dominantRatio > 0.7 && types.length > 1) {
            return this.rebalanceMemoryTypes(selectedMemories, budgetAllocation);
        }
        
        return selectedMemories;
    }
    
    /**
     * 重新平衡记忆类型
     * @param {Array} memories 记忆列表
     * @param {Object} budgetAllocation 预算分配
     * @returns {Array} 平衡后的记忆
     */
    rebalanceMemoryTypes(memories, budgetAllocation) {
        const typeGroups = {};
        memories.forEach(memory => {
            if (!typeGroups[memory.type]) typeGroups[memory.type] = [];
            typeGroups[memory.type].push(memory);
        });
        
        const rebalanced = [];
        let remainingBudget = budgetAllocation.total;
        
        // 每种类型至少选择一个高质量记忆
        Object.entries(typeGroups).forEach(([type, typeMemories]) => {
            const bestMemory = typeMemories
                .sort((a, b) => b.finalScore - a.finalScore)[0];
            
            if (this.estimateTokenCount(bestMemory.content) <= remainingBudget) {
                rebalanced.push(bestMemory);
                remainingBudget -= this.estimateTokenCount(bestMemory.content);
            }
        });
        
        // 按分数填充剩余记忆
        const remaining = memories
            .filter(m => !rebalanced.includes(m))
            .sort((a, b) => b.finalScore - a.finalScore);
        
        for (const memory of remaining) {
            const tokens = this.estimateTokenCount(memory.content);
            if (tokens <= remainingBudget && 
                rebalanced.length < MEMORY_CONFIG.injection.maxMemoriesPerContext) {
                rebalanced.push(memory);
                remainingBudget -= tokens;
            }
        }
        
        return rebalanced;
    }
    
    /**
     * 上下文感知的记忆格式化
     * @param {Array} memories 选中的记忆
     * @param {Object} context 上下文信息
     * @returns {string} 格式化的记忆文本
     */
    formatMemoriesContextAware(memories, context) {
        if (!memories.length) return '';
        
        const { urgencyLevel = 'normal', currentMessage = '' } = context;
        
        // 根据紧急程度选择格式化模式
        if (urgencyLevel === 'critical') {
            return this.formatMemoriesCompact(memories);
        } else if (urgencyLevel === 'low') {
            return this.formatMemoriesDetailed(memories, context);
        } else {
            return this.formatMemoriesStandard(memories, context);
        }
    }
    
    /**
     * 紧凑格式化（关键场景）
     * @param {Array} memories 记忆列表
     * @returns {string} 紧凑格式的记忆文本
     */
    formatMemoriesCompact(memories) {
        let formatted = '\n# 关键记忆\n';
        
        memories
            .slice(0, 5) // 限制数量
            .forEach((memory, index) => {
                const truncatedContent = memory.content.length > 50 ? 
                    memory.content.substring(0, 50) + '...' : memory.content;
                formatted += `${index + 1}. ${truncatedContent}\n`;
            });
        
        return formatted;
    }
    
    /**
     * 详细格式化（低优先级场景）
     * @param {Array} memories 记忆列表
     * @param {Object} context 上下文
     * @returns {string} 详细格式的记忆文本
     */
    formatMemoriesDetailed(memories, context) {
        const memoryGroups = this.groupMemoriesByType(memories);
        let formatted = '\n# 相关记忆详情\n';
        
        Object.entries(memoryGroups).forEach(([type, typeMemories]) => {
            const typeName = {
                'episodic': '📅 经历记忆',
                'semantic': '🧠 知识记忆',
                'social': '👥 社交记忆',
                'general': '💡 一般记忆'
            }[type] || '📝 其他记忆';
            
            formatted += `\n## ${typeName}\n`;
            typeMemories.forEach((memory, index) => {
                const timeInfo = memory.createdAt ? 
                    new Date(memory.createdAt).toLocaleDateString('zh-CN') : '未知时间';
                const importance = `重要度: ${(memory.importance * 100).toFixed(0)}%`;
                const relevance = memory.rankingScores?.contextScore ? 
                    ` 相关度: ${(memory.rankingScores.contextScore * 100).toFixed(0)}%` : '';
                
                formatted += `${index + 1}. **${memory.content}**\n`;
                formatted += `   _(${timeInfo} | ${importance}${relevance})_\n\n`;
            });
        });
        
        return formatted;
    }
    
    /**
     * 标准格式化（正常场景）
     * @param {Array} memories 记忆列表
     * @param {Object} context 上下文
     * @returns {string} 标准格式的记忆文本
     */
    formatMemoriesStandard(memories, context) {
        const memoryGroups = this.groupMemoriesByType(memories);
        let formatted = '\n# 相关记忆\n';
        
        // 按重要性排序类型
        const sortedTypes = Object.entries(memoryGroups)
            .sort(([,a], [,b]) => {
                const avgImportanceA = a.reduce((sum, m) => sum + m.importance, 0) / a.length;
                const avgImportanceB = b.reduce((sum, m) => sum + m.importance, 0) / b.length;
                return avgImportanceB - avgImportanceA;
            });
        
        sortedTypes.forEach(([type, typeMemories]) => {
            const typeName = {
                'episodic': '经历记忆',
                'semantic': '知识记忆',
                'social': '社交记忆',
                'general': '一般记忆'
            }[type] || '其他记忆';
            
            formatted += `\n## ${typeName}\n`;
            typeMemories.forEach((memory, index) => {
                const timeInfo = memory.createdAt ? 
                    ` (${new Date(memory.createdAt).toLocaleDateString()})` : '';
                formatted += `${index + 1}. ${memory.content}${timeInfo}\n`;
            });
        });
        
        // 添加记忆质量摘要
        const avgImportance = memories.reduce((sum, m) => sum + m.importance, 0) / memories.length;
        const avgRelevance = memories.reduce((sum, m) => sum + (m.rankingScores?.contextScore || 0), 0) / memories.length;
        
        formatted += `\n_记忆质量: 平均重要度 ${(avgImportance * 100).toFixed(0)}%`;
        if (avgRelevance > 0) {
            formatted += `, 平均相关度 ${(avgRelevance * 100).toFixed(0)}%`;
        }
        formatted += `_\n`;
        
        return formatted;
    }
    
    /**
     * 分析记忆分布
     * @param {Array} memories 记忆列表
     * @returns {Object} 分布分析结果
     */
    analyzeMemoryDistribution(memories) {
        const distribution = {
            byType: {},
            byImportance: {
                high: 0,    // > 0.7
                medium: 0,  // 0.4-0.7
                low: 0      // < 0.4
            },
            byAge: {
                recent: 0,  // < 7天
                medium: 0,  // 7-30天
                old: 0      // > 30天
            },
            totalTokens: 0
        };
        
        const now = Date.now();
        const dayMs = 24 * 60 * 60 * 1000;
        
        memories.forEach(memory => {
            // 类型分布
            distribution.byType[memory.type] = 
                (distribution.byType[memory.type] || 0) + 1;
            
            // 重要性分布
            if (memory.importance > 0.7) {
                distribution.byImportance.high++;
            } else if (memory.importance > 0.4) {
                distribution.byImportance.medium++;
            } else {
                distribution.byImportance.low++;
            }
            
            // 年龄分布
            const age = now - new Date(memory.createdAt).getTime();
            if (age < 7 * dayMs) {
                distribution.byAge.recent++;
            } else if (age < 30 * dayMs) {
                distribution.byAge.medium++;
            } else {
                distribution.byAge.old++;
            }
            
            // Token统计
            distribution.totalTokens += this.estimateTokenCount(memory.content);
        });
        
        return distribution;
    }
    
    /**
     * 记录注入历史
     * @param {string} roleId 角色ID
     * @param {Object} injectionReport 注入报告
     * @returns {Promise<void>}
     */
    async recordInjectionHistory(roleId, injectionReport) {
        try {
            const db = getDB();
            const historyRecord = {
                id: `injection_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                roleId,
                timestamp: new Date().toISOString(),
                report: {
                    usedMemories: injectionReport.usedMemories,
                    estimatedTokens: injectionReport.estimatedTokens,
                    budgetUtilization: injectionReport.budgetUtilization,
                    processingTime: injectionReport.processingTime,
                    memoryDistribution: injectionReport.memoryDistribution
                },
                type: 'injection'
            };
            
            // 保存到全局设置中的注入历史
            let globalSettings = await db.globalSettings.get('main');
            if (!globalSettings) {
                globalSettings = { id: 'main', injectionHistory: [] };
            }
            if (!globalSettings.injectionHistory) {
                globalSettings.injectionHistory = [];
            }
            
            globalSettings.injectionHistory.unshift(historyRecord);
            
            // 只保留最近20条历史记录
            if (globalSettings.injectionHistory.length > 20) {
                globalSettings.injectionHistory = globalSettings.injectionHistory.slice(0, 20);
            }
            
            await db.globalSettings.put(globalSettings);
        } catch (error) {
            console.warn('Failed to record injection history:', error);
        }
    }

    /**
     * 格式化记忆为提示词
     * @param {Array} memories 记忆列表
     * @returns {string} 格式化的记忆文本
     */
    formatMemoriesForPrompt(memories) {
        if (!memories.length) return '';

        const memoryGroups = this.groupMemoriesByType(memories);
        let formatted = '\n# 相关记忆\n';

        // 按类型组织记忆
        Object.entries(memoryGroups).forEach(([type, typeMemories]) => {
            const typeName = {
                'episodic': '经历记忆',
                'semantic': '知识记忆', 
                'social': '社交记忆',
                'general': '一般记忆'
            }[type] || '其他记忆';

            formatted += `\n## ${typeName}\n`;
            typeMemories.forEach((memory, index) => {
                const timeInfo = memory.createdAt ? 
                    ` (${new Date(memory.createdAt).toLocaleDateString()})` : '';
                formatted += `${index + 1}. ${memory.content}${timeInfo}\n`;
            });
        });

        return formatted;
    }

    /**
     * 按类型分组记忆
     * @param {Array} memories 记忆列表
     * @returns {Object} 分组后的记忆
     */
    groupMemoriesByType(memories) {
        return memories.reduce((groups, memory) => {
            const type = memory.type || 'general';
            if (!groups[type]) groups[type] = [];
            groups[type].push(memory);
            return groups;
        }, {});
    }

    /**
     * 估算Token数量
     * @param {string} text 文本
     * @returns {number} 估算的Token数
     */
    estimateTokenCount(text) {
        if (!text) return 0;
        // 中文Token估算：平均每个字符约等于1个Token
        return Math.ceil(text.length * MEMORY_CONFIG.injection.tokenEstimateRate / 4);
    }
}

// 创建全局记忆服务实例
export const memoryService = new MemoryService();

// 导出服务类和配置
export { 
    MemoryService, 
    MemoryExtractionManager, 
    MemoryCompressionManager, 
    MemoryInjectionManager,
    MEMORY_CONFIG 
};