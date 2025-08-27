/**
 * 使用方法：第一阶段基础架构完善验证脚本
 * 验证组件系统、事件验证和消息表优化是否正常工作
 */

// 验证组件系统
async function validateComponentSystem() {
    console.log('🔍 验证组件系统...');
    
    try {
        // 动态导入组件
        const { Button, Card, Modal, Form, Tag, Loading } = await import('../js/components/index.js');
        
        // 测试按钮组件
        const testBtn = Button({ 
            text: '测试按钮', 
            type: 'primary',
            onClick: () => console.log('Button clicked!')
        });
        
        if (!testBtn || testBtn.tagName !== 'BUTTON') {
            throw new Error('Button component failed');
        }
        
        // 测试卡片组件
        const testCard = Card({
            title: '测试卡片',
            content: '这是测试内容'
        });
        
        if (!testCard || !testCard.querySelector('.card-title')) {
            throw new Error('Card component failed');
        }
        
        // 测试表单组件
        const testForm = Form({
            fields: [
                { name: 'test', label: '测试字段', type: 'text' }
            ]
        });
        
        if (!testForm || !testForm.querySelector('.form-group')) {
            throw new Error('Form component failed');
        }
        
        console.log('✅ 组件系统验证通过');
        return true;
        
    } catch (error) {
        console.error('❌ 组件系统验证失败:', error);
        return false;
    }
}

// 验证事件类型系统
async function validateEventTypeSystem() {
    console.log('🔍 验证事件类型系统...');
    
    try {
        // 动态导入事件类型
        const { validateEventPayload, createEventPayload } = await import('../js/types/events.js');
        
        // 测试有效载荷
        const validPayload = {
            timestamp: Date.now(),
            chatId: 'test_chat',
            message: { content: 'test' },
            senderId: 'user'
        };
        
        if (!validateEventPayload('CHAT_MESSAGE_SENT', validPayload)) {
            throw new Error('Valid payload validation failed');
        }
        
        // 测试无效载荷
        const invalidPayload = {
            chatId: 123, // 应该是string
            message: 'invalid', // 应该是object
        };
        
        if (validateEventPayload('CHAT_MESSAGE_SENT', invalidPayload)) {
            throw new Error('Invalid payload should not validate');
        }
        
        // 测试创建标准载荷
        const standardPayload = createEventPayload('APP_INIT', {
            version: '1.0.0',
            environment: 'development'
        });
        
        if (!standardPayload.timestamp || typeof standardPayload.timestamp !== 'number') {
            throw new Error('Standard payload creation failed');
        }
        
        console.log('✅ 事件类型系统验证通过');
        return true;
        
    } catch (error) {
        console.error('❌ 事件类型系统验证失败:', error);
        return false;
    }
}

// 验证增强事件总线
async function validateEnhancedEventBus() {
    console.log('🔍 验证增强事件总线...');
    
    try {
        const { EnhancedEventBus } = await import('../js/core/enhanced-event-bus.js');
        
        const eventBus = new EnhancedEventBus();
        let eventReceived = false;
        
        // 测试事件监听
        eventBus.on('test.event', (data) => {
            if (data.test === 'value') {
                eventReceived = true;
            }
        });
        
        // 测试事件发布
        await eventBus.emit('test.event', { test: 'value' });
        
        if (!eventReceived) {
            throw new Error('Event not received');
        }
        
        // 测试类型验证
        eventBus.setValidationEnabled(true);
        
        // 这应该产生警告但不阻止事件
        await eventBus.emit('app.init', { invalidField: true });
        
        console.log('✅ 增强事件总线验证通过');
        return true;
        
    } catch (error) {
        console.error('❌ 增强事件总线验证失败:', error);
        return false;
    }
}

// 验证数据库升级和消息服务
async function validateDatabaseUpgrade() {
    console.log('🔍 验证数据库升级...');
    
    try {
        // 检查是否可以导入新的数据库模块
        const { initializeDB, getMessageService } = await import('../js/core/db-v13.js');
        
        if (typeof initializeDB !== 'function') {
            throw new Error('Database initialization function not found');
        }
        
        if (typeof getMessageService !== 'function') {
            throw new Error('Message service getter not found');
        }
        
        // 检查消息服务类
        const { MessageService } = await import('../js/core/message-service.js');
        
        if (typeof MessageService !== 'function') {
            throw new Error('MessageService class not found');
        }
        
        // 检查控制器更新
        const controllerV13 = await import('../js/domains/chats/controller-v13.js');
        
        if (!controllerV13.sendMessage || !controllerV13.getChatMessages) {
            throw new Error('Updated controller functions not found');
        }
        
        console.log('✅ 数据库升级验证通过');
        return true;
        
    } catch (error) {
        console.error('❌ 数据库升级验证失败:', error);
        return false;
    }
}

// 验证CSS组件样式
function validateComponentStyles() {
    console.log('🔍 验证组件样式...');
    
    try {
        // 检查CSS文件是否可以加载
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = './js/components/components.css';
        
        return new Promise((resolve) => {
            link.onload = () => {
                console.log('✅ 组件样式验证通过');
                resolve(true);
            };
            
            link.onerror = () => {
                console.error('❌ 组件样式加载失败');
                resolve(false);
            };
            
            document.head.appendChild(link);
            
            // 超时处理
            setTimeout(() => {
                console.error('❌ 组件样式加载超时');
                resolve(false);
            }, 5000);
        });
        
    } catch (error) {
        console.error('❌ 组件样式验证失败:', error);
        return false;
    }
}

// 运行所有验证
async function runPhase1Validation() {
    console.log('🚀 开始第一阶段基础架构验证...');
    
    const results = [];
    
    // 验证各个组件
    results.push(await validateComponentSystem());
    results.push(await validateEventTypeSystem());
    results.push(await validateEnhancedEventBus());
    results.push(await validateDatabaseUpgrade());
    results.push(await validateComponentStyles());
    
    const passCount = results.filter(r => r).length;
    const totalCount = results.length;
    
    console.log(`\n📊 验证结果: ${passCount}/${totalCount} 项通过`);
    
    if (passCount === totalCount) {
        console.log('🎉 第一阶段基础架构完善验证全部通过！');
        return true;
    } else {
        console.log('⚠️ 部分验证未通过，需要检查失败项');
        return false;
    }
}

// 导出验证函数
export {
    runPhase1Validation,
    validateComponentSystem,
    validateEventTypeSystem,
    validateEnhancedEventBus,
    validateDatabaseUpgrade,
    validateComponentStyles
};

// 如果直接运行此脚本
if (typeof window !== 'undefined') {
    window.runPhase1Validation = runPhase1Validation;
    console.log('Phase 1 validation script loaded. Run: runPhase1Validation()');
}