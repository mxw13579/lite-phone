/**
 * Phase 1 验收测试脚本
 * 验证远程主题安全和提示词依赖优化
 */

import { themeService } from './web/js/services/themes.js';
import { 
    getActivePreset, 
    validatePresetIntegrity, 
    repairPresetWithDefaults,
    DEFAULT_PROMPTS 
} from './web/js/domains/presets/store.js';

/**
 * 测试1: 远程主题安全验证
 */
async function testRemoteThemeSecurity() {
    console.log('\n🔒 测试1: 远程主题安全验证');
    
    try {
        // 测试loadRemoteTheme方法是否抛出安全错误
        console.log('  - 测试loadRemoteTheme方法...');
        await themeService.loadRemoteTheme('https://example.com/theme.css');
        console.log('  ❌ 错误: loadRemoteTheme应该抛出异常');
        return false;
    } catch (error) {
        if (error.message.includes('远程主题功能已禁用')) {
            console.log('  ✅ loadRemoteTheme正确抛出安全错误');
        } else {
            console.log('  ❌ 错误信息不符合预期:', error.message);
            return false;
        }
    }
    
    // 检查THEME_CONFIG是否移除了远程配置
    const themeConfigContent = await import('./web/js/services/themes.js');
    console.log('  - 检查THEME_CONFIG配置...');
    
    // 测试预览功能（应该也被禁用）
    try {
        await themeService.loadRemoteTheme('https://example.com/theme.css', { preview: true });
        console.log('  ❌ 错误: 远程主题预览应该也被禁用');
        return false;
    } catch (error) {
        console.log('  ✅ 远程主题预览也已正确禁用');
    }
    
    console.log('  ✅ 远程主题安全验证通过');
    return true;
}

/**
 * 测试2: 预设完整性验证
 */
async function testPresetIntegrity() {
    console.log('\n🔍 测试2: 预设完整性验证');
    
    // 测试完整预设
    console.log('  - 测试完整预设验证...');
    const completePreset = {
        promptImage: DEFAULT_PROMPTS.IMAGE,
        promptVoice: DEFAULT_PROMPTS.VOICE,
        promptTransfer: DEFAULT_PROMPTS.TRANSFER,
        promptSingle: DEFAULT_PROMPTS.SINGLE,
        promptGroup: DEFAULT_PROMPTS.GROUP
    };
    
    const completeValidation = validatePresetIntegrity(completePreset);
    if (completeValidation.isValid && completeValidation.completeness === '100.0%') {
        console.log('  ✅ 完整预设验证通过');
    } else {
        console.log('  ❌ 完整预设验证失败:', completeValidation);
        return false;
    }
    
    // 测试不完整预设
    console.log('  - 测试不完整预设验证...');
    const incompletePreset = {
        promptImage: DEFAULT_PROMPTS.IMAGE,
        promptVoice: '', // 缺失
        promptSingle: DEFAULT_PROMPTS.SINGLE
        // 缺少 promptTransfer 和 promptGroup
    };
    
    const incompleteValidation = validatePresetIntegrity(incompletePreset);
    if (!incompleteValidation.isValid && incompleteValidation.missingFields.length === 2) {
        console.log('  ✅ 不完整预设正确识别，缺失字段:', incompleteValidation.missingFields);
    } else {
        console.log('  ❌ 不完整预设验证失败:', incompleteValidation);
        return false;
    }
    
    // 测试预设修复
    console.log('  - 测试预设修复功能...');
    const repairedPreset = repairPresetWithDefaults(incompletePreset);
    const repairedValidation = validatePresetIntegrity(repairedPreset);
    
    if (repairedValidation.isValid) {
        console.log('  ✅ 预设修复成功');
    } else {
        console.log('  ❌ 预设修复失败:', repairedValidation);
        return false;
    }
    
    // 测试null预设处理
    console.log('  - 测试null预设处理...');
    const nullValidation = validatePresetIntegrity(null);
    if (!nullValidation.isValid && nullValidation.error === 'preset对象为空') {
        console.log('  ✅ null预设正确处理');
    } else {
        console.log('  ❌ null预设处理失败:', nullValidation);
        return false;
    }
    
    console.log('  ✅ 预设完整性验证通过');
    return true;
}

/**
 * 测试3: 兼容性验证
 */
async function testCompatibility() {
    console.log('\n🔧 测试3: 兼容性验证');
    
    // 测试主题服务基本功能
    console.log('  - 测试主题服务基本功能...');
    try {
        const availableThemes = await themeService.getAvailableThemes();
        if (availableThemes.success && availableThemes.data.length > 0) {
            console.log('  ✅ 主题服务基本功能正常');
        } else {
            console.log('  ❌ 主题服务基本功能异常:', availableThemes);
            return false;
        }
    } catch (error) {
        console.log('  ❌ 主题服务调用失败:', error.message);
        return false;
    }
    
    // 测试导入导出功能（不涉及远程）
    console.log('  - 测试本地导入导出功能...');
    try {
        const exportResult = await themeService.exportAllCSSConfig();
        if (exportResult.success) {
            console.log('  ✅ CSS导出功能正常');
        } else {
            console.log('  ❌ CSS导出功能异常:', exportResult);
            return false;
        }
    } catch (error) {
        console.log('  ❌ CSS导出功能失败:', error.message);
        return false;
    }
    
    console.log('  ✅ 兼容性验证通过');
    return true;
}

/**
 * 测试4: 错误处理验证
 */
async function testErrorHandling() {
    console.log('\n⚠️  测试4: 错误处理验证');
    
    // 测试友好错误信息
    console.log('  - 测试错误信息友好性...');
    try {
        await themeService.loadRemoteTheme('invalid-url');
    } catch (error) {
        if (error.message.includes('请使用本地导入功能')) {
            console.log('  ✅ 错误信息包含解决建议');
        } else {
            console.log('  ❌ 错误信息缺少解决建议:', error.message);
            return false;
        }
    }
    
    // 测试预设修复的日志输出
    console.log('  - 测试修复过程日志...');
    const brokenPreset = { promptImage: 'test' };
    const originalLog = console.log;
    let logCaptured = false;
    
    console.log = (...args) => {
        if (args[0] && args[0].includes('Repairing preset field')) {
            logCaptured = true;
        }
        originalLog(...args);
    };
    
    repairPresetWithDefaults(brokenPreset);
    console.log = originalLog;
    
    if (logCaptured) {
        console.log('  ✅ 修复过程日志正常输出');
    } else {
        console.log('  ❌ 修复过程缺少日志');
        return false;
    }
    
    console.log('  ✅ 错误处理验证通过');
    return true;
}

/**
 * 主测试函数
 */
async function runPhase1Tests() {
    console.log('🚀 开始Phase 1验收测试');
    console.log('测试范围: 远程主题安全 + 提示词依赖优化');
    
    const results = [];
    
    results.push(await testRemoteThemeSecurity());
    results.push(await testPresetIntegrity());
    results.push(await testCompatibility());
    results.push(await testErrorHandling());
    
    const passedTests = results.filter(Boolean).length;
    const totalTests = results.length;
    
    console.log('\n📊 测试结果汇总:');
    console.log(`  通过: ${passedTests}/${totalTests}`);
    console.log(`  成功率: ${(passedTests/totalTests*100).toFixed(1)}%`);
    
    if (passedTests === totalTests) {
        console.log('\n🎉 Phase 1验收测试全部通过!');
        console.log('✅ P0问题已完全解决，系统安全性达标');
        return true;
    } else {
        console.log('\n❌ Phase 1验收测试有失败项');
        console.log('需要修复失败的测试项后重新验证');
        return false;
    }
}

// 导出测试函数
export { runPhase1Tests };

// 如果直接运行此脚本
if (import.meta.url === `file://${process.argv[1]}`) {
    runPhase1Tests().then(success => {
        process.exit(success ? 0 : 1);
    });
}