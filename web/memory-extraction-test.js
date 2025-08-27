/**
 * 记忆抽取算法测试 - 浏览器兼容版
 */

// 测试数据
const TEST_MESSAGES = [
    {
        content: "记住我的生日是3月15日，很重要！",
        expectedScoreRange: [0.7, 1.0],
        expectedType: "semantic",
        description: "重要个人信息"
    },
    {
        content: "今天天气不错",
        expectedScoreRange: [0.0, 0.4],
        expectedType: "general",
        description: "日常对话"
    },
    {
        content: "我叫张三，在北京工作",
        expectedScoreRange: [0.6, 1.0],
        expectedType: "semantic",
        description: "身份和工作信息"
    },
    {
        content: "你喜欢什么音乐？",
        expectedScoreRange: [0.4, 0.7],
        expectedType: "social",
        description: "兴趣爱好询问"
    },
    {
        content: "昨天我们去了电影院",
        expectedScoreRange: [0.5, 0.8],
        expectedType: "episodic",
        description: "时间+活动记录"
    },
    {
        content: "嗯",
        expectedScoreRange: [0.0, 0.2],
        expectedType: "general",
        description: "极简回复"
    },
    {
        content: "明天有个重要会议，记得提醒我",
        expectedScoreRange: [0.7, 1.0],
        expectedType: "episodic",
        description: "重要+时间+任务"
    }
];

/**
 * 测试重要性评分算法
 */
async function testImportanceScoring() {
    console.log('=== 重要性评分算法测试 ===');
    
    let passedTests = 0;
    const totalTests = TEST_MESSAGES.length;
    
    try {
        // 获取记忆服务实例
        if (!window.memoryService) {
            console.error('❌ memoryService未在全局作用域中找到');
            return false;
        }
        
        const extractionManager = window.memoryService.extractionManager;
        
        for (let i = 0; i < TEST_MESSAGES.length; i++) {
            const test = TEST_MESSAGES[i];
            
            console.log(`\n测试 ${i + 1}: ${test.description}`);
            console.log(`输入: "${test.content}"`);
            
            // 计算重要性评分
            const score = extractionManager.calculateImportanceScore(test.content, {
                timestamp: Date.now()
            });
            
            // 分类记忆类型
            const type = extractionManager.classifyMemoryType(test.content, {
                timestamp: Date.now()
            });
            
            console.log(`实际评分: ${score.toFixed(3)}`);
            console.log(`预期范围: [${test.expectedScoreRange[0]}, ${test.expectedScoreRange[1]}]`);
            console.log(`实际类型: ${type}`);
            console.log(`预期类型: ${test.expectedType}`);
            
            // 验证评分是否在预期范围内
            const scoreValid = score >= test.expectedScoreRange[0] && score <= test.expectedScoreRange[1];
            const typeValid = type === test.expectedType;
            const testPassed = scoreValid && typeValid;
            
            console.log(`评分验证: ${scoreValid ? '✅' : '❌'}`);
            console.log(`类型验证: ${typeValid ? '✅' : '❌'}`);
            console.log(`测试结果: ${testPassed ? '通过' : '失败'}`);
            
            if (testPassed) {
                passedTests++;
            }
        }
        
        console.log(`\n=== 重要性评分测试总结 ===`);
        console.log(`通过测试: ${passedTests}/${totalTests}`);
        console.log(`通过率: ${(passedTests / totalTests * 100).toFixed(1)}%`);
        
        return passedTests >= Math.ceil(totalTests * 0.8); // 80%通过率即为成功
        
    } catch (error) {
        console.error('测试执行异常:', error);
        return false;
    }
}

/**
 * 测试记忆分类算法
 */
async function testMemoryClassification() {
    console.log('\n=== 记忆分类算法测试 ===');
    
    const classificationTests = [
        { content: "今天是2024年3月15日", expectedType: "episodic" },
        { content: "我的名字是李明", expectedType: "semantic" },
        { content: "你好吗？", expectedType: "social" },
        { content: "天气不错", expectedType: "general" },
        { content: "昨天去了北京", expectedType: "episodic" },
        { content: "我喜欢音乐", expectedType: "semantic" }
    ];
    
    let passedTests = 0;
    
    try {
        const extractionManager = window.memoryService.extractionManager;
        
        for (let i = 0; i < classificationTests.length; i++) {
            const test = classificationTests[i];
            
            console.log(`\n分类测试 ${i + 1}: "${test.content}"`);
            
            const actualType = extractionManager.classifyMemoryType(test.content);
            const typeMatches = actualType === test.expectedType;
            
            console.log(`预期类型: ${test.expectedType}`);
            console.log(`实际类型: ${actualType}`);
            console.log(`结果: ${typeMatches ? '✅ 通过' : '❌ 失败'}`);
            
            if (typeMatches) {
                passedTests++;
            }
        }
        
        console.log(`\n=== 分类测试总结 ===`);
        console.log(`通过测试: ${passedTests}/${classificationTests.length}`);
        console.log(`通过率: ${(passedTests / classificationTests.length * 100).toFixed(1)}%`);
        
        return passedTests >= Math.ceil(classificationTests.length * 0.7); // 70%通过率
        
    } catch (error) {
        console.error('分类测试异常:', error);
        return false;
    }
}

/**
 * 测试标签提取功能
 */
async function testTagExtraction() {
    console.log('\n=== 标签提取测试 ===');
    
    const tagTests = [
        {
            content: "我叫李明，是程序员，住在上海",
            expectedTags: ["个人信息", "职业", "地理位置"],
            description: "综合个人信息"
        },
        {
            content: "昨天和朋友聚餐很开心",
            expectedTags: ["时间", "社交", "情感"],
            description: "社交活动"
        },
        {
            content: "明天要开会，很重要",
            expectedTags: ["时间", "工作"],
            description: "工作安排"
        }
    ];
    
    let passedTests = 0;
    
    try {
        const extractionManager = window.memoryService.extractionManager;
        
        for (let i = 0; i < tagTests.length; i++) {
            const test = tagTests[i];
            
            console.log(`\n标签测试 ${i + 1}: ${test.description}`);
            console.log(`输入: "${test.content}"`);
            
            const extractedTags = extractionManager.extractTags(test.content);
            
            console.log(`提取标签: [${extractedTags.join(', ')}]`);
            console.log(`预期包含: [${test.expectedTags.join(', ')}]`);
            
            // 检查标签覆盖率
            let matchCount = 0;
            test.expectedTags.forEach(expectedTag => {
                if (extractedTags.some(tag => 
                    tag.toLowerCase().includes(expectedTag.toLowerCase()) || 
                    expectedTag.toLowerCase().includes(tag.toLowerCase())
                )) {
                    matchCount++;
                }
            });
            
            const coverage = matchCount / test.expectedTags.length;
            const testPassed = coverage >= 0.5; // 50%覆盖率
            
            console.log(`覆盖率: ${matchCount}/${test.expectedTags.length} (${(coverage * 100).toFixed(1)}%)`);
            console.log(`结果: ${testPassed ? '✅ 通过' : '❌ 失败'}`);
            
            if (testPassed) {
                passedTests++;
            }
        }
        
        console.log(`\n=== 标签提取总结 ===`);
        console.log(`通过测试: ${passedTests}/${tagTests.length}`);
        console.log(`通过率: ${(passedTests / tagTests.length * 100).toFixed(1)}%`);
        
        return passedTests >= Math.ceil(tagTests.length * 0.6); // 60%通过率
        
    } catch (error) {
        console.error('标签提取测试异常:', error);
        return false;
    }
}

/**
 * 运行所有记忆抽取算法测试
 */
async function runMemoryExtractionTests() {
    console.log('🧪 开始记忆抽取算法验证测试...\n');
    
    const results = {
        importanceScoring: false,
        memoryClassification: false,
        tagExtraction: false
    };
    
    try {
        // 执行各项测试
        results.importanceScoring = await testImportanceScoring();
        results.memoryClassification = await testMemoryClassification();  
        results.tagExtraction = await testTagExtraction();
        
        // 汇总结果
        const passedTests = Object.values(results).filter(passed => passed).length;
        const totalTests = Object.keys(results).length;
        
        console.log('\n' + '='.repeat(50));
        console.log('📊 记忆抽取算法测试完整报告');
        console.log('='.repeat(50));
        console.log(`重要性评分测试: ${results.importanceScoring ? '✅ 通过' : '❌ 失败'}`);
        console.log(`记忆分类测试: ${results.memoryClassification ? '✅ 通过' : '❌ 失败'}`);
        console.log(`标签提取测试: ${results.tagExtraction ? '✅ 通过' : '❌ 失败'}`);
        console.log('-'.repeat(30));
        console.log(`总体通过率: ${passedTests}/${totalTests} (${(passedTests / totalTests * 100).toFixed(1)}%)`);
        
        const allPassed = passedTests === totalTests;
        console.log(`最终结果: ${allPassed ? '✅ 全部通过' : '⚠️ 部分失败'}`);
        
        return allPassed;
        
    } catch (error) {
        console.error('❌ 测试套件执行失败:', error);
        return false;
    }
}

// 暴露测试函数到全局作用域
if (typeof window !== 'undefined') {
    window.runMemoryExtractionTests = runMemoryExtractionTests;
    window.testImportanceScoring = testImportanceScoring;
    window.testMemoryClassification = testMemoryClassification;
    window.testTagExtraction = testTagExtraction;
}

console.log('记忆抽取算法测试脚本已加载。可以调用:');
console.log('- runMemoryExtractionTests() // 运行完整测试套件'); 
console.log('- testImportanceScoring() // 单独测试重要性评分');
console.log('- testMemoryClassification() // 单独测试记忆分类');
console.log('- testTagExtraction() // 单独测试标签提取');