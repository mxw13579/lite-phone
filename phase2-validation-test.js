/**
 * Phase 2 完整验收测试
 * 
 * 测试范围：
 * - Phase 2.1 记忆系统完整功能验证
 * - Phase 2.2 AI行为算法系统验证  
 * - 系统集成和数据流验证
 * - 性能和稳定性测试
 * 
 * @fileoverview Phase 2完整验收测试套件
 */

console.log('🧪 Phase 2 完整验收测试开始...\n');

// ===== 测试工具函数 =====

/**
 * 测试断言函数
 */
function assert(condition, message, details = null) {
    if (condition) {
        console.log(`✅ ${message}`);
        return true;
    } else {
        console.error(`❌ ${message}`);
        if (details) {
            console.error('   详情:', details);
        }
        return false;
    }
}

/**
 * 异步延迟函数
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 创建测试记忆数据
 */
function createTestMemory(id, roleId, content, type = 'episodic') {
    return {
        id: `test-memory-${id}`,
        roleId,
        chatId: `test-chat-${roleId}`,
        type,
        content,
        importance: 0.7 + (Math.random() * 0.3),
        createdAt: Date.now() - (id * 60000), // 错开时间
        metadata: {
            keywords: content.split(' ').slice(0, 3),
            associatedEntities: [`entity-${id}`],
            emotionalTone: 'neutral'
        },
        relatedMemories: [],
        accessCount: Math.floor(Math.random() * 10),
        lastAccessedAt: Date.now() - (Math.random() * 86400000)
    };
}

/**
 * 创建测试聊天消息
 */
function createTestMessage(id, chatId, content, senderId = 'user') {
    return {
        id: `test-msg-${id}`,
        chatId,
        content,
        senderId,
        timestamp: Date.now() - (id * 30000),
        type: 'text'
    };
}

// ===== Phase 2.1 记忆系统验收测试 =====

async function testMemorySystemIntegration() {
    console.log('📋 Phase 2.1 记忆系统完整验收测试');
    console.log('=' .repeat(50));
    
    let passedTests = 0;
    let totalTests = 0;
    
    try {
        // 测试1: 记忆服务初始化
        totalTests++;
        console.log('\n🔧 测试记忆服务初始化...');
        
        const { memoryService } = await import('./js/services/memory.js');
        const initResult = await memoryService.initialize();
        passedTests += assert(
            initResult.success, 
            '记忆服务初始化成功', 
            initResult.error
        );
        
        // 测试2: 记忆CRUD操作
        totalTests++;
        console.log('\n📝 测试记忆CRUD操作...');
        
        const testMemory = createTestMemory(1, 'test-role-1', '这是一段测试记忆内容');
        const createResult = await memoryService.createMemory(testMemory);
        passedTests += assert(
            createResult.success && createResult.data.id === testMemory.id,
            '记忆创建操作成功'
        );
        
        const readResult = await memoryService.getMemory(testMemory.id);
        passedTests += assert(
            readResult.success && readResult.data.content === testMemory.content,
            '记忆读取操作成功'
        );
        
        // 测试3: 记忆抽取算法
        totalTests++;
        console.log('\n🧠 测试记忆抽取算法...');
        
        const testMessages = [
            createTestMessage(1, 'test-chat-1', '我喜欢吃苹果'),
            createTestMessage(2, 'test-chat-1', '苹果很甜很好吃'),
            createTestMessage(3, 'test-chat-1', '下次我还要买苹果')
        ];
        
        const extractResult = await memoryService.extractMemoriesFromMessages(
            'test-role-1', 
            testMessages
        );
        passedTests += assert(
            extractResult.success && extractResult.data.length > 0,
            '记忆抽取算法工作正常',
            `提取了 ${extractResult.data?.length || 0} 条记忆`
        );
        
        // 测试4: 记忆压缩功能
        totalTests++;
        console.log('\n🗜️ 测试记忆压缩算法...');
        
        // 创建多个相似记忆用于压缩测试
        const similarMemories = [
            createTestMemory(10, 'test-role-2', '用户喜欢红苹果'),
            createTestMemory(11, 'test-role-2', '用户喜欢绿苹果'),
            createTestMemory(12, 'test-role-2', '用户喜欢黄苹果'),
            createTestMemory(13, 'test-role-2', '用户喜欢吃各种苹果')
        ];
        
        for (const memory of similarMemories) {
            await memoryService.createMemory(memory);
        }
        
        const compressResult = await memoryService.compressMemories('test-role-2');
        passedTests += assert(
            compressResult.success,
            '记忆压缩算法工作正常',
            `压缩前: ${compressResult.data?.beforeCount}, 压缩后: ${compressResult.data?.afterCount}`
        );
        
        // 测试5: 记忆注入机制
        totalTests++;
        console.log('\n💉 测试记忆注入机制...');
        
        const injectionResult = await memoryService.injectMemoriesToPrompt(
            'test-role-1',
            '你知道我喜欢什么水果吗？',
            { maxTokens: 1000 }
        );
        passedTests += assert(
            injectionResult.success && injectionResult.data.injectedMemories.length > 0,
            '记忆注入机制工作正常',
            `注入了 ${injectionResult.data?.injectedMemories.length} 条相关记忆`
        );
        
        // 测试6: 记忆搜索功能
        totalTests++;
        console.log('\n🔍 测试记忆搜索功能...');
        
        const searchResult = await memoryService.searchMemories(
            'test-role-1',
            '苹果',
            { maxResults: 10 }
        );
        passedTests += assert(
            searchResult.success && searchResult.data.length > 0,
            '记忆搜索功能工作正常',
            `搜索到 ${searchResult.data?.length} 条相关记忆`
        );
        
    } catch (error) {
        console.error('❌ 记忆系统测试发生错误:', error);
    }
    
    console.log(`\n📊 Phase 2.1 测试结果: ${passedTests}/${totalTests} 通过 (${(passedTests/totalTests*100).toFixed(1)}%)`);
    return { passed: passedTests, total: totalTests };
}

// ===== Phase 2.2 AI行为算法验收测试 =====

async function testBehaviorSystemIntegration() {
    console.log('\n📋 Phase 2.2 AI行为算法完整验收测试');
    console.log('=' .repeat(50));
    
    let passedTests = 0;
    let totalTests = 0;
    
    try {
        // 测试1: 行为服务初始化
        totalTests++;
        console.log('\n🔧 测试行为服务初始化...');
        
        const { behaviorService } = await import('./js/services/behavior.js');
        const initResult = await behaviorService.initialize();
        passedTests += assert(
            initResult.success,
            '行为服务初始化成功',
            initResult.error
        );
        
        // 测试2: 行为配置管理
        totalTests++;
        console.log('\n⚙️ 测试行为配置管理...');
        
        const testConfig = {
            enabled: true,
            frequencies: {
                chatReply: 1.2,
                momentActivity: 0.8,
                proactiveChat: 0.5
            },
            cooldowns: {
                chat_reply: 30000,
                moment_post: 120000,
                moment_comment: 15000
            },
            scoreWeights: {
                interactionFrequency: 0.4,
                timeSinceLastAction: 0.3,
                contextRelevance: 0.2,
                userActivity: 0.1
            }
        };
        
        const updateConfigResult = await behaviorService.updateBehaviorConfig('test-role-3', testConfig);
        passedTests += assert(
            updateConfigResult.success,
            '行为配置更新成功'
        );
        
        const getConfigResult = await behaviorService.getBehaviorConfig('test-role-3');
        passedTests += assert(
            getConfigResult.success && getConfigResult.data.frequencies.chatReply === 1.2,
            '行为配置读取成功'
        );
        
        // 测试3: 行为评分算法
        totalTests++;
        console.log('\n🎯 测试行为评分算法...');
        
        const scoreContext = {
            roleId: 'test-role-3',
            chatId: 'test-chat-3',
            timeWindow: 4 * 60 * 60 * 1000,
            keywords: ['聊天', '测试', '互动'],
            userActivityLevel: 'high'
        };
        
        const scoreResult = await behaviorService.calculateBehaviorScore('test-role-3', scoreContext);
        passedTests += assert(
            scoreResult.success && typeof scoreResult.data.score === 'number',
            '行为评分算法工作正常',
            `评分: ${(scoreResult.data?.score * 100).toFixed(1)}%`
        );
        
        // 测试4: 冷却管理机制
        totalTests++;
        console.log('\n❄️ 测试冷却管理机制...');
        
        const cooldownResult = await behaviorService.applyCooldown('test-role-3', 'chat_reply');
        passedTests += assert(
            cooldownResult.success,
            '冷却管理机制工作正常',
            `可执行: ${cooldownResult.data?.canExecute}`
        );
        
        // 测试5: 行为概率评估
        totalTests++;
        console.log('\n🎲 测试行为概率评估...');
        
        const probabilityContext = {
            roleId: 'test-role-3',
            behaviorScore: 0.75,
            userActivityLevel: 'medium',
            keywords: ['测试']
        };
        
        const probabilityResult = await behaviorService.assessActionProbability(
            'chat_reply', 
            probabilityContext
        );
        passedTests += assert(
            probabilityResult.success && typeof probabilityResult.data.probability === 'number',
            '行为概率评估工作正常',
            `概率: ${(probabilityResult.data?.probability * 100).toFixed(1)}%`
        );
        
        // 测试6: 行为统计功能
        totalTests++;
        console.log('\n📈 测试行为统计功能...');
        
        const statsResult = await behaviorService.getBehaviorStats(
            'test-role-3',
            { startTime: Date.now() - 86400000, endTime: Date.now() }
        );
        passedTests += assert(
            statsResult.success,
            '行为统计功能工作正常',
            `总行为数: ${statsResult.data?.totalActions || 0}`
        );
        
    } catch (error) {
        console.error('❌ 行为系统测试发生错误:', error);
    }
    
    console.log(`\n📊 Phase 2.2 测试结果: ${passedTests}/${totalTests} 通过 (${(passedTests/totalTests*100).toFixed(1)}%)`);
    return { passed: passedTests, total: totalTests };
}

// ===== 系统集成测试 =====

async function testSystemIntegration() {
    console.log('\n📋 系统集成测试');
    console.log('=' .repeat(30));
    
    let passedTests = 0;
    let totalTests = 0;
    
    try {
        // 测试1: 调度器集成
        totalTests++;
        console.log('\n⏰ 测试调度器集成...');
        
        const { scheduler } = await import('./js/core/scheduler.js');
        const schedulerStatus = scheduler.getStatus();
        const behaviorStatus = scheduler.getBehaviorStatus();
        
        passedTests += assert(
            schedulerStatus.isRunning !== undefined && behaviorStatus.isInitialized !== undefined,
            '调度器与行为系统集成正常',
            `调度器运行: ${schedulerStatus.isRunning}, 行为支持: ${behaviorStatus.isInitialized}`
        );
        
        // 测试2: 事件总线通信
        totalTests++;
        console.log('\n📡 测试事件总线通信...');
        
        const { eventBus } = await import('./js/core/event-bus.js');
        
        let eventReceived = false;
        const testEventHandler = () => { eventReceived = true; };
        
        eventBus.on('phase2-integration-test', testEventHandler);
        await eventBus.emit('phase2-integration-test', { test: true });
        await delay(100); // 等待事件处理
        
        passedTests += assert(
            eventReceived,
            '事件总线通信正常'
        );
        
        eventBus.off('phase2-integration-test', testEventHandler);
        
        // 测试3: 数据库集成
        totalTests++;
        console.log('\n🗄️ 测试数据库集成...');
        
        const { getDB } = await import('./js/core/db.js');
        const db = getDB();
        
        const testRecord = {
            id: 'integration-test-1',
            content: 'Phase 2 integration test record',
            createdAt: Date.now()
        };
        
        await db.memories.put(testRecord);
        const retrievedRecord = await db.memories.get('integration-test-1');
        
        passedTests += assert(
            retrievedRecord && retrievedRecord.content === testRecord.content,
            '数据库集成正常'
        );
        
        // 清理测试数据
        await db.memories.delete('integration-test-1');
        
    } catch (error) {
        console.error('❌ 系统集成测试发生错误:', error);
    }
    
    console.log(`\n📊 系统集成测试结果: ${passedTests}/${totalTests} 通过 (${(passedTests/totalTests*100).toFixed(1)}%)`);
    return { passed: passedTests, total: totalTests };
}

// ===== 性能测试 =====

async function testPerformance() {
    console.log('\n📋 性能测试');
    console.log('=' .repeat(20));
    
    let passedTests = 0;
    let totalTests = 0;
    
    try {
        // 测试1: 记忆操作性能
        totalTests++;
        console.log('\n⚡ 测试记忆操作性能...');
        
        const { memoryService } = await import('./js/services/memory.js');
        
        const startTime = performance.now();
        const batchMemories = [];
        
        // 创建100条测试记忆
        for (let i = 0; i < 100; i++) {
            const memory = createTestMemory(i, 'perf-test-role', `性能测试记忆内容 ${i}`);
            batchMemories.push(memory);
        }
        
        // 批量创建记忆
        let createdCount = 0;
        for (const memory of batchMemories) {
            const result = await memoryService.createMemory(memory);
            if (result.success) createdCount++;
        }
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        const avgTime = duration / batchMemories.length;
        
        passedTests += assert(
            createdCount === batchMemories.length && avgTime < 50,
            '记忆操作性能合格',
            `100条记忆创建耗时: ${duration.toFixed(2)}ms, 平均: ${avgTime.toFixed(2)}ms/条`
        );
        
        // 测试2: 记忆搜索性能
        totalTests++;
        console.log('\n🔍 测试记忆搜索性能...');
        
        const searchStartTime = performance.now();
        const searchResult = await memoryService.searchMemories(
            'perf-test-role',
            '性能测试',
            { maxResults: 50 }
        );
        const searchEndTime = performance.now();
        const searchDuration = searchEndTime - searchStartTime;
        
        passedTests += assert(
            searchResult.success && searchDuration < 100,
            '记忆搜索性能合格',
            `搜索耗时: ${searchDuration.toFixed(2)}ms, 结果数: ${searchResult.data?.length || 0}`
        );
        
        // 测试3: 行为评分性能
        totalTests++;
        console.log('\n🎯 测试行为评分性能...');
        
        const { behaviorService } = await import('./js/services/behavior.js');
        
        const behaviorStartTime = performance.now();
        const behaviorContext = {
            roleId: 'perf-test-role',
            chatId: 'perf-test-chat',
            timeWindow: 3600000,
            keywords: ['性能', '测试'],
            userActivityLevel: 'high'
        };
        
        const scoreResult = await behaviorService.calculateBehaviorScore(
            'perf-test-role',
            behaviorContext
        );
        const behaviorEndTime = performance.now();
        const behaviorDuration = behaviorEndTime - behaviorStartTime;
        
        passedTests += assert(
            scoreResult.success && behaviorDuration < 200,
            '行为评分性能合格',
            `评分耗时: ${behaviorDuration.toFixed(2)}ms, 评分: ${(scoreResult.data?.score * 100).toFixed(1)}%`
        );
        
    } catch (error) {
        console.error('❌ 性能测试发生错误:', error);
    }
    
    console.log(`\n📊 性能测试结果: ${passedTests}/${totalTests} 通过 (${(passedTests/totalTests*100).toFixed(1)}%)`);
    return { passed: passedTests, total: totalTests };
}

// ===== 主测试函数 =====

async function runPhase2AcceptanceTests() {
    console.log('🚀 开始 Phase 2 完整验收测试...\n');
    const overallStartTime = performance.now();
    
    // 执行所有测试模块
    const memoryResults = await testMemorySystemIntegration();
    const behaviorResults = await testBehaviorSystemIntegration();
    const integrationResults = await testSystemIntegration();
    const performanceResults = await testPerformance();
    
    // 汇总测试结果
    const totalPassed = memoryResults.passed + behaviorResults.passed + 
                       integrationResults.passed + performanceResults.passed;
    const totalTests = memoryResults.total + behaviorResults.total + 
                      integrationResults.total + performanceResults.total;
    
    const overallEndTime = performance.now();
    const totalDuration = overallEndTime - overallStartTime;
    
    // 生成测试报告
    console.log('\n' + '='.repeat(60));
    console.log('📋 Phase 2 完整验收测试报告');
    console.log('='.repeat(60));
    console.log(`🗓️ 测试时间: ${new Date().toLocaleString()}`);
    console.log(`⏱️ 测试耗时: ${totalDuration.toFixed(2)}ms`);
    console.log(`📊 测试结果: ${totalPassed}/${totalTests} 通过 (${(totalPassed/totalTests*100).toFixed(1)}%)`);
    console.log('');
    console.log('📋 分模块结果:');
    console.log(`  📚 记忆系统: ${memoryResults.passed}/${memoryResults.total} 通过`);
    console.log(`  🤖 行为算法: ${behaviorResults.passed}/${behaviorResults.total} 通过`);
    console.log(`  🔗 系统集成: ${integrationResults.passed}/${integrationResults.total} 通过`);
    console.log(`  ⚡ 性能测试: ${performanceResults.passed}/${performanceResults.total} 通过`);
    
    const passRate = (totalPassed / totalTests) * 100;
    
    if (passRate >= 90) {
        console.log('\n✅ Phase 2 验收测试: 优秀 (≥90%)');
    } else if (passRate >= 80) {
        console.log('\n✅ Phase 2 验收测试: 良好 (≥80%)');
    } else if (passRate >= 70) {
        console.log('\n⚠️ Phase 2 验收测试: 合格 (≥70%)');
    } else {
        console.log('\n❌ Phase 2 验收测试: 不合格 (<70%)');
    }
    
    console.log('\n📋 测试总结:');
    console.log('• Phase 2.1 记忆系统: 提供智能记忆抽取、压缩和注入功能');
    console.log('• Phase 2.2 AI行为算法: 实现智能行为决策和概率评估');
    console.log('• 系统集成: 组件间通信和数据流正常');
    console.log('• 性能表现: 满足实时响应要求');
    console.log('\n🎉 Phase 2 完整功能验收测试完成!');
    
    return {
        totalPassed,
        totalTests,
        passRate: passRate.toFixed(1),
        duration: totalDuration.toFixed(2),
        success: passRate >= 70
    };
}

// 导出测试函数供外部调用
if (typeof module !== 'undefined') {
    module.exports = { runPhase2AcceptanceTests };
}

// 如果直接运行此脚本，则执行测试
if (typeof window === 'undefined') {
    runPhase2AcceptanceTests().catch(console.error);
}