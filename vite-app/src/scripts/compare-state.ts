/**
 * 状态对比工具 - PR10: 双跑对比与验证
 * 用于验证Vite+TS版本与原始ES6版本的功能等价性
 */

// 全局类型扩展
declare global {
  interface Window {
    STATE: any;
    DB: any;
    CONSTANTS: any;
    getCurrentScreen(): string;
    SCREEN_IDS: any;
    showCustomModal: Function;
    initBatteryManager: Function;
    exportData: Function;
    togglePlayPause: Function;
    openPersonaLibrary: Function;
    setActiveChatId: Function;
    updateGlobalSettings: Function;
    loadAllDataFromDB: Function;
    navigateToChat: Function;
    getFullState: Function;
    db: any;
    showScreen: Function;
    viteAppSnapshot: any;
    originalAppSnapshot: any;
    executeStateComparison: Function;
    captureOriginalSnapshot: Function;
    captureStateSnapshot: Function;
    exportSnapshot: Function;
    importSnapshot: Function;
    runValidationMatrix: Function;
    generateComparisonReport: Function;
    printComparisonReport: Function;
    initializeDatabase: Function;
  }
}

// 等待两个版本的状态数据加载完成
function waitForStates(): Promise<void> {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (window.STATE && window.DB && window.CONSTANTS) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });
}

// 获取完整状态快照
function captureStateSnapshot() {
  const state = window.STATE?.getFullState?.() || {};
  
  return {
    // 核心状态
    chats: state.state?.chats || {},
    activeChatId: state.state?.activeChatId || null,
    globalSettings: state.state?.globalSettings || {},
    apiConfig: state.state?.apiConfig || {},
    
    // 辅助状态
    myAddress: typeof state.myAddress === 'function' ? state.myAddress() : (state.myAddress || '位置未知'),
    musicState: state.musicState || {},
    editStates: state.editStates || {},
    renderState: state.renderState || {},
    
    // 数据集合
    userStickers: state.state?.userStickers || [],
    worldBooks: state.state?.worldBooks || [],
    personaPresets: state.state?.personaPresets || [],
    presets: state.state?.presets || [],
    
    // 全局常量验证
    constants: {
      count: window.CONSTANTS ? Object.keys(window.CONSTANTS).length : 0,
      hasDefaultPrompts: !!(window.CONSTANTS?.DEFAULT_PROMPT_SINGLE),
      hasDefaultAvatars: !!(window.CONSTANTS?.DEFAULT_AVATAR)
    },
    
    // 数据库连接状态
    database: {
      isConnected: !!(window.DB?.db),
      tablesCount: window.DB?.db?.tables?.length || 0,
      hasInitialized: typeof window.initializeDatabase === 'function'
    },
    
    // 路由状态
    router: {
      currentScreen: window.getCurrentScreen?.() || 'unknown',
      hasScreenIds: !!(window.SCREEN_IDS),
      screenIdsCount: window.SCREEN_IDS ? Object.keys(window.SCREEN_IDS).length : 0
    },
    
    // 服务状态
    services: {
      hasUIService: typeof window.showCustomModal === 'function',
      hasBatteryService: typeof window.initBatteryManager === 'function',
      hasDataService: typeof window.exportData === 'function',
      hasMusicService: typeof window.togglePlayPause === 'function',
      hasPersonaService: typeof window.openPersonaLibrary === 'function'
    }
  };
}

// 深度比较两个对象
function deepCompare(obj1: any, obj2: any, path = '', differences: any[] = []) {
  const keys1 = Object.keys(obj1 || {});
  const keys2 = Object.keys(obj2 || {});
  const allKeys = new Set([...keys1, ...keys2]);
  
  for (const key of allKeys) {
    const currentPath = path ? `${path}.${key}` : key;
    
    if (!(key in obj1)) {
      differences.push({
        path: currentPath,
        type: 'missing_in_first',
        firstValue: undefined,
        secondValue: obj2[key]
      });
    } else if (!(key in obj2)) {
      differences.push({
        path: currentPath,
        type: 'missing_in_second',
        firstValue: obj1[key],
        secondValue: undefined
      });
    } else if (typeof obj1[key] !== typeof obj2[key]) {
      differences.push({
        path: currentPath,
        type: 'type_mismatch',
        firstValue: typeof obj1[key],
        secondValue: typeof obj2[key]
      });
    } else if (obj1[key] !== null && obj2[key] !== null && 
               typeof obj1[key] === 'object' && typeof obj2[key] === 'object') {
      if (Array.isArray(obj1[key]) && Array.isArray(obj2[key])) {
        if (obj1[key].length !== obj2[key].length) {
          differences.push({
            path: currentPath + '.length',
            type: 'array_length_mismatch',
            firstValue: obj1[key].length,
            secondValue: obj2[key].length
          });
        }
        // 简化数组比较，只比较长度和前几项
        const minLength = Math.min(obj1[key].length, obj2[key].length, 5);
        for (let i = 0; i < minLength; i++) {
          deepCompare(obj1[key][i], obj2[key][i], `${currentPath}[${i}]`, differences);
        }
      } else {
        deepCompare(obj1[key], obj2[key], currentPath, differences);
      }
    } else if (obj1[key] !== obj2[key]) {
      // 忽略一些预期会不同的值
      if (!shouldIgnoreDifference(currentPath, obj1[key], obj2[key])) {
        differences.push({
          path: currentPath,
          type: 'value_mismatch',
          firstValue: obj1[key],
          secondValue: obj2[key]
        });
      }
    }
  }
  
  return differences;
}

// 判断是否应该忽略某些差异
function shouldIgnoreDifference(path: string, value1: any, value2: any): boolean {
  // 忽略时间戳类差异
  if (path.includes('timestamp') || path.includes('time') || path.includes('Time')) {
    return true;
  }
  
  // 忽略ID类差异（可能包含时间戳）
  if (path.includes('.id') && (
    String(value1).startsWith('chat_') || 
    String(value1).startsWith('preset_') ||
    String(value1).startsWith('wb_')
  )) {
    return true;
  }
  
  // 忽略函数引用差异
  if (typeof value1 === 'function' && typeof value2 === 'function') {
    return true;
  }
  
  return false;
}

// 生成比较报告
function generateComparisonReport(snapshot1: any, snapshot2: any, label1 = 'Version 1', label2 = 'Version 2') {
  const differences = deepCompare(snapshot1, snapshot2);
  
  const report = {
    timestamp: new Date().toISOString(),
    versions: { first: label1, second: label2 },
    summary: {
      totalDifferences: differences.length,
      criticalDifferences: differences.filter(d => d.type !== 'value_mismatch' || !shouldIgnoreDifference(d.path, d.firstValue, d.secondValue)).length,
      comparisonPassed: differences.length === 0,
      healthScore: Math.max(0, 100 - differences.length * 2)
    },
    stateOverview: {
      [label1]: {
        chatsCount: Object.keys(snapshot1.chats || {}).length,
        userStickersCount: (snapshot1.userStickers || []).length,
        worldBooksCount: (snapshot1.worldBooks || []).length,
        presetsCount: (snapshot1.presets || []).length,
        constantsCount: snapshot1.constants?.count || 0,
        servicesHealthy: Object.values(snapshot1.services || {}).filter(Boolean).length
      },
      [label2]: {
        chatsCount: Object.keys(snapshot2.chats || {}).length,
        userStickersCount: (snapshot2.userStickers || []).length,
        worldBooksCount: (snapshot2.worldBooks || []).length,
        presetsCount: (snapshot2.presets || []).length,
        constantsCount: snapshot2.constants?.count || 0,
        servicesHealthy: Object.values(snapshot2.services || {}).filter(Boolean).length
      }
    },
    differences: differences,
    recommendations: [] as string[]
  };
  
  // 生成建议
  if (report.summary.criticalDifferences > 0) {
    report.recommendations.push('发现关键差异，需要进一步检查模块一致性');
  }
  if (report.stateOverview[label1].constantsCount !== report.stateOverview[label2].constantsCount) {
    report.recommendations.push('常量数量不匹配，检查constants模块');
  }
  if (report.stateOverview[label1].servicesHealthy < 5) {
    report.recommendations.push('服务模块可能未完全初始化');
  }
  
  if (report.recommendations.length === 0) {
    report.recommendations.push('状态对比通过，两版本功能等价性验证成功！');
  }
  
  return report;
}

// 在控制台美化打印报告
function printComparisonReport(report: any) {
  console.log('\n🔍 EPhone 状态对比验证报告');
  console.log('='.repeat(50));
  console.log(`📊 健康评分: ${report.summary.healthScore}/100`);
  console.log(`✅ 比较结果: ${report.summary.comparisonPassed ? '通过' : '需要关注'}`);
  console.log(`📈 总差异数: ${report.summary.totalDifferences}`);
  console.log(`⚠️  关键差异: ${report.summary.criticalDifferences}`);
  
  console.log('\n📋 状态概览对比:');
  console.table(report.stateOverview);
  
  if (report.differences.length > 0) {
    console.log('\n🔧 发现的差异:');
    report.differences.forEach((diff: any, index: number) => {
      if (index < 10) { // 只显示前10个差异
        console.log(`${index + 1}. ${diff.path} (${diff.type})`);
        if (diff.firstValue !== undefined) console.log(`   版本1: ${JSON.stringify(diff.firstValue)}`);
        if (diff.secondValue !== undefined) console.log(`   版本2: ${JSON.stringify(diff.secondValue)}`);
      }
    });
    if (report.differences.length > 10) {
      console.log(`   ... 还有 ${report.differences.length - 10} 个差异未显示`);
    }
  }
  
  console.log('\n💡 建议:');
  report.recommendations.forEach((rec: string, index: number) => {
    console.log(`${index + 1}. ${rec}`);
  });
  
  console.log('\n' + '='.repeat(50));
  return report;
}

// 执行状态快照对比
async function executeStateComparison() {
  console.log('⏳ 等待应用状态初始化...');
  await waitForStates();
  
  console.log('📸 捕获当前状态快照...');
  const currentSnapshot = captureStateSnapshot();
  
  // 存储快照以供后续比较
  window.viteAppSnapshot = currentSnapshot;
  
  console.log('✅ Vite+TS 版本状态快照已创建');
  console.log('💾 快照数据已保存至 window.viteAppSnapshot');
  
  // 如果有原版快照则进行比较
  if (window.originalAppSnapshot) {
    console.log('🔄 开始与原版状态对比...');
    const report = generateComparisonReport(
      window.originalAppSnapshot, 
      currentSnapshot, 
      'ES6原版', 
      'Vite+TS版'
    );
    return printComparisonReport(report);
  } else {
    console.log('ℹ️  原版快照未找到，请先运行原版应用并执行状态捕获');
    console.log('📖 使用方法：');
    console.log('   1. 在原版(web/)应用中运行: captureOriginalSnapshot()');
    console.log('   2. 在Vite版本中运行: executeStateComparison()');
    return currentSnapshot;
  }
}

// 捕获原版快照的函数（在原版应用中使用）
function captureOriginalSnapshot() {
  console.log('📸 捕获ES6原版状态快照...');
  const snapshot = captureStateSnapshot();
  window.originalAppSnapshot = snapshot;
  console.log('✅ ES6原版状态快照已保存至 window.originalAppSnapshot');
  console.log('💿 请将此快照数据复制到Vite版本中进行对比');
  return snapshot;
}

// 导出快照到JSON文件
function exportSnapshot(snapshot: any, filename?: string) {
  const dataStr = JSON.stringify(snapshot, null, 2);
  const dataBlob = new Blob([dataStr], {type: 'application/json'});
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `ephone-snapshot-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  console.log(`📥 状态快照已导出为 ${link.download}`);
}

// 从JSON文件导入快照
function importSnapshot(file: File): Promise<any> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const snapshot = JSON.parse(e.target!.result as string);
        resolve(snapshot);
      } catch (error) {
        reject(new Error('JSON解析失败: ' + (error as Error).message));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}

// 验证矩阵：核心功能点验证
const VALIDATION_MATRIX = [
  { name: 'Constants模块', check: () => !!window.CONSTANTS && Object.keys(window.CONSTANTS).length >= 10 },
  { name: 'State管理', check: () => !!window.STATE && typeof window.getFullState === 'function' },
  { name: 'Database连接', check: () => !!window.DB && !!window.db },
  { name: 'Router系统', check: () => !!window.SCREEN_IDS && typeof window.showScreen === 'function' },
  { name: 'UI工具服务', check: () => typeof window.showCustomModal === 'function' },
  { name: '电池服务', check: () => typeof window.initBatteryManager === 'function' },
  { name: '数据服务', check: () => typeof window.exportData === 'function' },
  { name: '音乐服务', check: () => typeof window.togglePlayPause === 'function' },
  { name: '人设服务', check: () => typeof window.openPersonaLibrary === 'function' },
  { name: '全局API兼容', check: () => {
    const requiredAPIs = ['setActiveChatId', 'updateGlobalSettings', 'loadAllDataFromDB', 'navigateToChat'];
    return requiredAPIs.every(api => typeof (window as any)[api] === 'function');
  }}
];

// 执行验证矩阵检查
function runValidationMatrix() {
  console.log('\n🧪 执行功能验证矩阵...');
  const results = VALIDATION_MATRIX.map(test => ({
    name: test.name,
    passed: test.check(),
    status: test.check() ? '✅' : '❌'
  }));
  
  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;
  const passRate = Math.round((passedCount / totalCount) * 100);
  
  console.table(results);
  console.log(`\n📊 验证结果: ${passedCount}/${totalCount} 通过 (${passRate}%)`);
  
  if (passRate === 100) {
    console.log('🎉 所有验证通过！迁移质量优秀！');
  } else if (passRate >= 80) {
    console.log('⚠️  大部分验证通过，有少量问题需要处理');
  } else {
    console.log('❌ 多项验证失败，需要检查迁移实现');
  }
  
  return { results, passRate, passedCount, totalCount };
}

// 全局暴露函数
window.executeStateComparison = executeStateComparison;
window.captureOriginalSnapshot = captureOriginalSnapshot;
window.captureStateSnapshot = captureStateSnapshot;
window.exportSnapshot = exportSnapshot;
window.importSnapshot = importSnapshot;
window.runValidationMatrix = runValidationMatrix;
window.generateComparisonReport = generateComparisonReport;
window.printComparisonReport = printComparisonReport;

console.log('🔧 状态对比工具已加载');
console.log('📖 可用函数:');
console.log('   - executeStateComparison(): 执行完整状态对比');
console.log('   - captureOriginalSnapshot(): 捕获原版快照(在原版中使用)');
console.log('   - runValidationMatrix(): 运行功能验证矩阵');
console.log('   - exportSnapshot(snapshot, filename): 导出快照到文件');
console.log('   - importSnapshot(file): 从文件导入快照');

// 自动运行验证矩阵
setTimeout(runValidationMatrix, 1000);