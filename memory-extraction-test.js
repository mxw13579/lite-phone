/**
 * 记忆抽取算法测试脚本
 * 验证重要性评分和记忆分类的准确性
 */

import { memoryService } from './js/services/memory.js';

// 测试用例数据
const testMessages = [
    {
        content: "记住我的生日是3月15日，很重要！",
        expectedScore: "> 0.7",
        expectedType: "semantic", 
        description: "包含重要性指示词+个人信息+感叹号"
    },
    {
        content: "今天天气不错",
        expectedScore: "< 0.4",
        expectedType: "general",
        description: "日常对话，无特殊信息"
    },
    {
        content: "我叫张三，在北京工作",
        expectedScore: "> 0.6", 
        expectedType: "semantic",
        description: "包含个人身份和工作信息"
    },
    {
        content: "你喜欢什么音乐？",
        expectedScore: "0.4-0.6",
        expectedType: "social",
        description: "社交问题，关于兴趣爱好"
    },
    {
        content: "昨天我们去了电影院看电影",
        expectedScore: "> 0.5",
        expectedType: "episodic", 
        description: "时间标记+活动记录"
    },
    {
        content: "我很开心😊",
        expectedScore: "> 0.5",
        expectedType: "social",
        description: "情感表达+表情符号"
    },
    {
        content: "嗯",
        expectedScore: "< 0.2",
        expectedType: "general",
        description: "极简回复"
    },
    {
        content: "明天有个重要会议，记得提醒我",
        expectedScore: "> 0.7",
        expectedType: "episodic",
        description: "重要性指示词+时间+任务"
    }
];

async function testImportanceScoring() {
    console.log('=== 重要性评分算法测试 ===\n');
    
    let passedTests = 0;
    const totalTests = testMessages.length;
    
    for (let i = 0; i < testMessages.length; i++) {
        const test = testMessages[i];
        console.log(`测试 ${i + 1}: ${test.description}`);
        console.log(`输入: "${test.content}"`);
        
        try {
            // 获取抽取管理器实例
            const extractionManager = memoryService.extractionManager;
            const score = extractionManager.calculateImportanceScore(test.content);
            const type = extractionManager.classifyMemoryType(test.content);
            
            console.log(`实际评分: ${score.toFixed(3)}`);
            console.log(`预期评分: ${test.expectedScore}`);
            console.log(`实际类型: ${type}`);
            console.log(`预期类型: ${test.expectedType}`);
            
            // 验证评分是否在预期范围
            let scoreValid = false;
            if (test.expectedScore.startsWith('> ')) {
                const threshold = parseFloat(test.expectedScore.substring(2));
                scoreValid = score > threshold;
            } else if (test.expectedScore.startsWith('< ')) {
                const threshold = parseFloat(test.expectedScore.substring(2));
                scoreValid = score < threshold;
            } else if (test.expectedScore.includes('-')) {
                const [min, max] = test.expectedScore.split('-').map(parseFloat);
                scoreValid = score >= min && score <= max;
            }
            
            const typeValid = type === test.expectedType;
            const testPassed = scoreValid && typeValid;
            
            console.log(`评分验证: ${scoreValid ? '✅' : '❌'}`);
            console.log(`类型验证: ${typeValid ? '✅' : '❌'}`);
            console.log(`测试结果: ${testPassed ? '通过' : '失败'}\n`);
            
            if (testPassed) passedTests++;
            
        } catch (error) {
            console.log(`❌ 测试执行失败: ${error.message}\n`);
        }
    }
    
    console.log(`=== 重要性评分测试总结 ===`);
    console.log(`通过测试: ${passedTests}/${totalTests}`);
    console.log(`通过率: ${(passedTests / totalTests * 100).toFixed(1)}%`);
    
    return passedTests === totalTests;
}

async function testTagExtraction() {
    console.log('\n=== 标签提取测试 ===\n');
    
    const tagTests = [
        {
            content: "我叫李明，是程序员，住在上海，喜欢打篮球",
            expectedTags: ["个人信息", "职业", "地理位置", "兴趣爱好"],
            description: "综合个人信息"
        },
        {
            content: "今天心情很好😊，天气晴朗",
            expectedTags: ["情感", "天气"],
            description: "情感和天气信息"
        },
        {
            content: "昨天和朋友们聚餐，玩得很开心",
            expectedTags: ["时间", "社交", "娱乐", "情感"],
            description: "社交活动记录"
        }
    ];
    
    let passedTests = 0;
    
    for (let i = 0; i < tagTests.length; i++) {
        const test = tagTests[i];
        console.log(`标签测试 ${i + 1}: ${test.description}`);
        console.log(`输入: "${test.content}"`);
        
        try {
            const extractionManager = memoryService.extractionManager;
            const tags = extractionManager.extractTags(test.content);
            
            console.log(`提取标签: [${tags.join(', ')}]`);
            console.log(`预期包含: [${test.expectedTags.join(', ')}]`);
            
            // 检查是否包含主要预期标签
            const matchedTags = test.expectedTags.filter(expectedTag => 
                tags.some(tag => tag.includes(expectedTag) || expectedTag.includes(tag))
            );
            
            const coverage = matchedTags.length / test.expectedTags.length;
            const testPassed = coverage >= 0.6; // 60%覆盖率即为通过
            
            console.log(`标签覆盖: ${matchedTags.length}/${test.expectedTags.length} (${(coverage * 100).toFixed(1)}%)`);
            console.log(`测试结果: ${testPassed ? '通过' : '失败'}\n`);
            
            if (testPassed) passedTests++;
            
        } catch (error) {
            console.log(`❌ 标签提取失败: ${error.message}\n`);
        }
    }
    
    console.log(`=== 标签提取测试总结 ===`);
    console.log(`通过测试: ${passedTests}/${tagTests.length}`);
    console.log(`通过率: ${(passedTests / tagTests.length * 100).toFixed(1)}%`);
    
    return passedTests === tagTests.length;
}

// 执行测试
async function runExtractionTests() {
    console.log('开始记忆抽取算法验证测试...\n');
    
    try {
        const scoreTestPassed = await testImportanceScoring();
        const tagTestPassed = await testTagExtraction();
        
        const allTestsPassed = scoreTestPassed && tagTestPassed;
        
        console.log('\n=== 记忆抽取算法测试完成 ===');
        console.log(`重要性评分测试: ${scoreTestPassed ? '✅ 通过' : '❌ 失败'}`);
        console.log(`标签提取测试: ${tagTestPassed ? '✅ 通过' : '❌ 失败'}`);
        console.log(`总体结果: ${allTestsPassed ? '✅ 全部通过' : '❌ 存在失败项'}`);
        
        return allTestsPassed;
        
    } catch (error) {
        console.error('测试执行异常:', error);
        return false;
    }
}

// 导出测试函数以便在浏览器中调用
if (typeof window !== 'undefined') {
    window.runExtractionTests = runExtractionTests;
}

export { runExtractionTests };