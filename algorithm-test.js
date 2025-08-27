/**
 * 记忆抽取算法独立验证测试
 * 通过Node.js环境验证核心算法逻辑
 */

// 简化版的重要性评分算法（移除表情符号检测以避免兼容性问题）
function calculateImportanceScore(content, context = {}) {
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

    // 2. 个人信息识别权重 (0.3) - 调整检测逻辑
    const personalInfoPatterns = {
        identity: ['名字', '姓名', '叫什么', '叫做', '我是', '我叫'],
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
                personalScore += 0.15; // 大幅提高身份和联系方式权重
            } else if (category === 'personal') {
                personalScore += 0.12; // 提高个人信息权重
            } else {
                personalScore += 0.08; // 其他个人信息
            }
        }
    });
    score += Math.min(personalScore, 0.3);

    // 3. 情感和交互强度权重 (0.2) - 移除表情符号检测
    let emotionScore = 0;
    
    // 情感标点符号
    const emotionPunctuation = content.match(/[!？?]{1,3}|[。]{2,}|[~]{1,}/g) || [];
    emotionScore += Math.min(emotionPunctuation.length * 0.03, 0.08);
    
    // 情感强化词
    const intensifiers = ['很', '非常', '特别', '超级', '极其', '相当', '十分'];
    const intensifierCount = intensifiers.filter(word => content.includes(word)).length;
    emotionScore += Math.min(intensifierCount * 0.02, 0.06);
    
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
    
    score += Math.min(contextScore, 0.1);

    return Math.min(score, 1.0);
}

// 记忆分类算法 - 改进版
function classifyMemoryType(content, context = {}) {
    const contentLower = content.toLowerCase();

    // 社交记忆：关于对方或社交互动的内容 - 优先检查
    const socialPatterns = [
        /你.*怎么|你.*什么|你.*哪里|你.*喜欢|你.*觉得|你.*认为/,
        /朋友|家人|同事|室友|同学|老师|老板/,
        /关心|想念|担心|祝福|问候|聊天/,
        /什么.*音乐|什么.*电影|什么.*书|什么.*游戏/ // 兴趣询问
    ];
    
    const hasQuestionMark = content.includes('?') || content.includes('？');
    const isSocialInteraction = socialPatterns.some(pattern => pattern.test(content));
    
    if (hasQuestionMark || isSocialInteraction) {
        return 'social';
    }

    // 语义记忆：个人信息和事实 - 明确的个人信息
    const semanticPatterns = [
        /我叫|名字.*是|姓名|我是.*[人员]/,
        /住在|来自|家在|出生在/,
        /工作.*是|职业.*是|我在.*工作|我的工作/,
        /喜欢.*|爱好.*是|兴趣.*是|习惯.*|我.*喜欢/,
        /生日.*是|年龄.*是|我.*岁|属相/,
        /学校.*是|专业.*是|我学.*|我读.*学校/
    ];
    
    if (semanticPatterns.some(pattern => pattern.test(content))) {
        return 'semantic';
    }

    // 情节记忆：时间标记 + 活动/事件
    const timePatterns = [
        /今天|昨天|前天|明天|后天|刚才|刚刚|一会儿|等一下/,
        /\d+月\d+日|\d+号|周\d|星期\d/,
        /上午|下午|晚上|早上|中午|夜里/,
        /去年|明年|前年|后年|最近|以前/
    ];
    
    const activityPatterns = [
        /去了|做了|看了|买了|吃了|玩了|听了|说了/,
        /会议|聚会|约会|旅游|工作|学习|锻炼/,
        /有.*活动|有.*事情|需要.*|要.*做|计划.*|安排.*/
    ];
    
    const hasTimeMarker = timePatterns.some(pattern => pattern.test(content));
    const hasActivity = activityPatterns.some(pattern => pattern.test(content));
    
    if (hasTimeMarker && (hasActivity || content.length > 10)) {
        return 'episodic';
    }

    // 检查是否包含生日等明确语义信息（可能被时间模式误判）
    if (/生日.*是.*月.*日/.test(content)) {
        return 'semantic';
    }

    // 默认为一般记忆
    return 'general';
}

// 标签提取算法
function extractTags(content) {
    const tags = new Set();
    
    const tagPatterns = {
        '个人信息': /我叫|名字|姓名|我是|住在|来自/,
        '情感': /开心|难过|生气|激动|感动|害怕|喜欢|讨厌/,
        '时间': /今天|昨天|明天|刚才|一会儿|\d+月\d+日/,
        '地理位置': /住在|来自|去了.*地方|在.*市|在.*区/,
        '工作': /工作|职业|公司|单位|同事|上班/,
        '学习': /学校|专业|学习|考试|作业/,
        '家庭': /家人|父母|孩子|配偶|家里/,
        '社交': /朋友|聚会|聊天|见面|约会/,
        '娱乐': /电影|游戏|音乐|运动|旅游/,
        '健康': /身体|健康|医院|生病|锻炼/
    };
    
    Object.entries(tagPatterns).forEach(([tag, pattern]) => {
        if (pattern.test(content)) {
            tags.add(tag);
        }
    });
    
    return Array.from(tags).slice(0, 8); // 最多8个标签
}

// 测试用例
const TEST_CASES = [
    {
        content: "记住我的生日是3月15日，很重要！",
        expectedScore: { min: 0.7, max: 1.0 },
        expectedType: "semantic",
        description: "重要个人信息"
    },
    {
        content: "今天天气不错",
        expectedScore: { min: 0.0, max: 0.4 },
        expectedType: "general",
        description: "日常对话"
    },
    {
        content: "我叫张三，在北京工作",
        expectedScore: { min: 0.6, max: 1.0 },
        expectedType: "semantic",
        description: "身份和工作信息"
    },
    {
        content: "你喜欢什么音乐？",
        expectedScore: { min: 0.4, max: 0.7 },
        expectedType: "social",
        description: "兴趣爱好询问"
    },
    {
        content: "昨天我们去了电影院",
        expectedScore: { min: 0.5, max: 0.8 },
        expectedType: "episodic",
        description: "时间+活动记录"
    },
    {
        content: "嗯",
        expectedScore: { min: 0.0, max: 0.2 },
        expectedType: "general",
        description: "极简回复"
    },
    {
        content: "明天有个重要会议，记得提醒我",
        expectedScore: { min: 0.7, max: 1.0 },
        expectedType: "episodic",
        description: "重要+时间+任务"
    }
];

// 执行测试
function runAlgorithmTests() {
    console.log('=== 记忆抽取算法独立验证测试 ===\n');
    
    let passedTests = 0;
    const totalTests = TEST_CASES.length;
    
    console.log('测试环境: Node.js (独立验证)');
    console.log('测试时间:', new Date().toLocaleString('zh-CN'));
    console.log('测试用例数量:', totalTests);
    console.log('-'.repeat(50));
    
    TEST_CASES.forEach((test, index) => {
        console.log(`\n测试 ${index + 1}: ${test.description}`);
        console.log(`输入: "${test.content}"`);
        
        // 计算重要性评分
        const score = calculateImportanceScore(test.content, { timestamp: Date.now() });
        const scoreValid = score >= test.expectedScore.min && score <= test.expectedScore.max;
        
        console.log(`实际评分: ${score.toFixed(3)}`);
        console.log(`预期范围: [${test.expectedScore.min}, ${test.expectedScore.max}]`);
        console.log(`评分验证: ${scoreValid ? '✅' : '❌'}`);
        
        // 测试记忆分类
        const type = classifyMemoryType(test.content);
        const typeValid = type === test.expectedType;
        
        console.log(`实际类型: ${type}`);
        console.log(`预期类型: ${test.expectedType}`);
        console.log(`类型验证: ${typeValid ? '✅' : '❌'}`);
        
        // 测试标签提取
        const tags = extractTags(test.content);
        console.log(`提取标签: [${tags.join(', ')}]`);
        
        const testPassed = scoreValid && typeValid;
        console.log(`测试结果: ${testPassed ? '✅ 通过' : '❌ 失败'}`);
        
        if (testPassed) passedTests++;
    });
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 测试结果汇总');
    console.log('='.repeat(50));
    console.log(`通过测试: ${passedTests}/${totalTests}`);
    console.log(`通过率: ${(passedTests / totalTests * 100).toFixed(1)}%`);
    console.log(`测试状态: ${passedTests === totalTests ? '✅ 全部通过' : passedTests >= totalTests * 0.8 ? '⚠️ 大部分通过' : '❌ 多项失败'}`);
    
    return {
        passed: passedTests,
        total: totalTests,
        rate: passedTests / totalTests,
        success: passedTests >= totalTests * 0.8
    };
}

// 如果是Node.js环境，直接执行测试
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runAlgorithmTests, calculateImportanceScore, classifyMemoryType, extractTags };
    
    // 直接运行测试
    if (require.main === module) {
        runAlgorithmTests();
    }
} else if (typeof window !== 'undefined') {
    // 浏览器环境，暴露到全局
    window.runAlgorithmTests = runAlgorithmTests;
    window.calculateImportanceScore = calculateImportanceScore;
    window.classifyMemoryType = classifyMemoryType;
    window.extractTags = extractTags;
}