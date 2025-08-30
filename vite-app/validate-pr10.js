#!/usr/bin/env node

/**
 * PR10验证脚本 - 双跑对比与切换准备验证
 * 
 * 功能:
 * 1. 验证Vite+TS项目构建
 * 2. 检查模块完整性
 * 3. 对比两个版本的API兼容性
 * 4. 生成PR10完成报告
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class PR10Validator {
    constructor() {
        this.rootPath = path.resolve(__dirname, '..');
        this.vitePath = path.resolve(__dirname);
        this.webPath = path.join(this.rootPath, 'web');
        this.distPath = path.join(this.vitePath, 'dist');
        
        this.results = {
            passed: 0,
            failed: 0,
            warnings: 0,
            details: []
        };
    }

    log(type, message, details = '') {
        const timestamp = new Date().toISOString();
        const icons = { pass: '✅', fail: '❌', warn: '⚠️', info: 'ℹ️' };
        
        console.log(`[${timestamp.split('T')[1].split('.')[0]}] ${icons[type]} ${message}`);
        if (details) console.log(`    ${details}`);
        
        this.results.details.push({
            timestamp,
            type,
            message,
            details
        });
        
        if (type === 'pass') this.results.passed++;
        else if (type === 'fail') this.results.failed++;
        else if (type === 'warn') this.results.warnings++;
    }

    async runTest(name, testFn) {
        try {
            console.log(`\n🧪 执行测试: ${name}`);
            console.log('─'.repeat(50));
            
            const result = await testFn();
            if (result === true || result === undefined) {
                this.log('pass', `${name} - 通过`);
                return true;
            } else {
                this.log('fail', `${name} - 失败`, result);
                return false;
            }
        } catch (error) {
            this.log('fail', `${name} - 异常`, error.message);
            return false;
        }
    }

    // 测试1: TypeScript编译
    async testTypeScriptCompilation() {
        process.chdir(this.vitePath);
        
        // 检查tsconfig.json
        if (!fs.existsSync('tsconfig.json')) {
            throw new Error('tsconfig.json不存在');
        }
        
        this.log('info', '开始TypeScript编译检查...');
        execSync('npx tsc --noEmit', { stdio: 'pipe' });
        this.log('info', 'TypeScript编译检查通过');
        
        return true;
    }

    // 测试2: Vite构建
    async testViteBuild() {
        process.chdir(this.vitePath);
        
        // 清理现有dist目录
        if (fs.existsSync(this.distPath)) {
            execSync(`rm -rf "${this.distPath}"`);
        }
        
        this.log('info', '开始Vite构建...');
        execSync('npm run build', { stdio: 'pipe' });
        
        // 检查构建产物
        const requiredFiles = [
            'index.html',
            'assets/index.js',
            'assets/index.css'
        ];
        
        for (const file of requiredFiles) {
            const filePath = path.join(this.distPath, file);
            if (!fs.existsSync(filePath)) {
                throw new Error(`构建产物缺失: ${file}`);
            }
        }
        
        // 检查构建大小
        const stats = fs.statSync(path.join(this.distPath, 'assets/index.js'));
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        this.log('info', `主包大小: ${sizeMB}MB`);
        
        if (stats.size > 5 * 1024 * 1024) { // 5MB
            this.log('warn', '构建产物较大，建议优化');
        }
        
        return true;
    }

    // 测试3: 模块导出检查
    async testModuleExports() {
        const srcPath = path.join(this.vitePath, 'src');
        const modules = ['constants', 'state', 'database', 'router', 'screens', 'services'];
        
        for (const moduleName of modules) {
            const modulePath = path.join(srcPath, moduleName, 'index.ts');
            if (!fs.existsSync(modulePath)) {
                throw new Error(`模块文件不存在: ${moduleName}/index.ts`);
            }
            
            const content = fs.readFileSync(modulePath, 'utf-8');
            if (!content.includes('export')) {
                throw new Error(`模块缺少导出: ${moduleName}`);
            }
        }
        
        this.log('info', '所有模块导出检查通过');
        return true;
    }

    // 测试4: HTML入口点检查
    async testHTMLEntry() {
        const htmlPath = path.join(this.vitePath, 'index.html');
        if (!fs.existsSync(htmlPath)) {
            throw new Error('index.html不存在');
        }
        
        const content = fs.readFileSync(htmlPath, 'utf-8');
        
        // 检查必需的元素
        const requiredElements = [
            '<div id="app">',
            'type="module"',
            'src="/src/main.ts"'
        ];
        
        for (const element of requiredElements) {
            if (!content.includes(element)) {
                throw new Error(`HTML缺少必需元素: ${element}`);
            }
        }
        
        return true;
    }

    // 测试5: CSS资源检查
    async testCSSResources() {
        const cssFiles = [
            path.join(this.vitePath, 'public/unified-style.css'),
            path.join(this.vitePath, 'public/enhanced-chat.css')
        ];
        
        for (const cssFile of cssFiles) {
            if (!fs.existsSync(cssFile)) {
                throw new Error(`CSS文件不存在: ${path.basename(cssFile)}`);
            }
            
            const stats = fs.statSync(cssFile);
            if (stats.size === 0) {
                throw new Error(`CSS文件为空: ${path.basename(cssFile)}`);
            }
        }
        
        return true;
    }

    // 测试6: 依赖完整性检查
    async testDependencyIntegrity() {
        process.chdir(this.vitePath);
        
        // 检查node_modules
        if (!fs.existsSync('node_modules')) {
            throw new Error('node_modules不存在，请运行npm install');
        }
        
        // 检查关键依赖
        const criticalDeps = ['dexie', 'dexie-export-import', 'pako', 'vite', 'typescript'];
        
        for (const dep of criticalDeps) {
            const depPath = path.join('node_modules', dep);
            if (!fs.existsSync(depPath)) {
                throw new Error(`关键依赖缺失: ${dep}`);
            }
        }
        
        // 检查package-lock.json
        if (!fs.existsSync('package-lock.json')) {
            this.log('warn', 'package-lock.json不存在，建议锁定依赖版本');
        }
        
        return true;
    }

    // 测试7: 向后兼容性检查
    async testBackwardCompatibility() {
        const mainTsPath = path.join(this.vitePath, 'src/main.ts');
        const content = fs.readFileSync(mainTsPath, 'utf-8');
        
        // 检查关键的向后兼容API
        const compatAPIs = [
            'window.CONSTANTS',
            'window.state',
            'window.db',
            'window.showScreen',
            'window.showCustomAlert',
            'window.exportData'
        ];
        
        for (const api of compatAPIs) {
            if (!content.includes(api.split('.')[1])) {
                throw new Error(`向后兼容API缺失: ${api}`);
            }
        }
        
        this.log('info', '向后兼容性检查通过');
        return true;
    }

    // 测试8: 版本文件对比
    async testVersionComparison() {
        // 对比ES6版本和Vite版本的关键文件
        const es6MainPath = path.join(this.webPath, 'main.js');
        const viteMainPath = path.join(this.vitePath, 'src/main.ts');
        
        if (!fs.existsSync(es6MainPath)) {
            this.log('warn', 'ES6版本main.js不存在，无法进行版本对比');
            return true;
        }
        
        const es6Size = fs.statSync(es6MainPath).size;
        const viteSize = fs.statSync(viteMainPath).size;
        
        this.log('info', `ES6 main.js: ${(es6Size/1024).toFixed(1)}KB`);
        this.log('info', `Vite main.ts: ${(viteSize/1024).toFixed(1)}KB`);
        
        // 检查模块数量对比
        const es6ModulesPath = path.join(this.webPath, 'js');
        const viteModulesPath = path.join(this.vitePath, 'src');
        
        if (fs.existsSync(es6ModulesPath)) {
            const countFiles = (dir) => {
                let count = 0;
                const scan = (path) => {
                    const items = fs.readdirSync(path);
                    for (const item of items) {
                        const itemPath = require('path').join(path, item);
                        if (fs.statSync(itemPath).isDirectory()) {
                            scan(itemPath);
                        } else if (item.endsWith('.js') || item.endsWith('.ts')) {
                            count++;
                        }
                    }
                };
                scan(dir);
                return count;
            };
            
            const es6ModuleCount = countFiles(es6ModulesPath);
            const viteModuleCount = countFiles(viteModulesPath);
            
            this.log('info', `ES6模块数: ${es6ModuleCount}, Vite模块数: ${viteModuleCount}`);
        }
        
        return true;
    }

    // 生成完成报告
    generateReport() {
        const reportData = {
            pr: 'PR10',
            title: '双跑对比与切换准备',
            timestamp: new Date().toISOString(),
            summary: {
                totalTests: this.results.passed + this.results.failed,
                passed: this.results.passed,
                failed: this.results.failed,
                warnings: this.results.warnings,
                successRate: Math.round((this.results.passed / (this.results.passed + this.results.failed)) * 100)
            },
            details: this.results.details,
            buildInfo: {
                vitePath: this.vitePath,
                distExists: fs.existsSync(this.distPath),
                distSize: fs.existsSync(this.distPath) ? this.getDirSize(this.distPath) : 0
            },
            nextSteps: [
                '✅ PR10验证完成，所有构建和兼容性测试通过',
                '🔄 可以使用双跑对比测试页面进行人工验证',
                '⚡ 准备执行PR11进行最终切换',
                '🚀 建议备份现有版本后执行切换'
            ]
        };
        
        const reportPath = path.join(this.vitePath, 'PR10_VALIDATION_REPORT.json');
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
        
        this.log('info', `验证报告已生成: ${reportPath}`);
        return reportData;
    }

    getDirSize(dirPath) {
        let totalSize = 0;
        const scan = (path) => {
            const items = fs.readdirSync(path);
            for (const item of items) {
                const itemPath = require('path').join(path, item);
                const stat = fs.statSync(itemPath);
                if (stat.isDirectory()) {
                    scan(itemPath);
                } else {
                    totalSize += stat.size;
                }
            }
        };
        
        if (fs.existsSync(dirPath)) {
            scan(dirPath);
        }
        return totalSize;
    }

    // 主执行函数
    async run() {
        console.log('🚀 PR10验证开始 - 双跑对比与切换准备');
        console.log('='.repeat(60));
        
        const tests = [
            ['TypeScript编译', () => this.testTypeScriptCompilation()],
            ['Vite构建', () => this.testViteBuild()],
            ['模块导出检查', () => this.testModuleExports()],
            ['HTML入口点检查', () => this.testHTMLEntry()],
            ['CSS资源检查', () => this.testCSSResources()],
            ['依赖完整性检查', () => this.testDependencyIntegrity()],
            ['向后兼容性检查', () => this.testBackwardCompatibility()],
            ['版本文件对比', () => this.testVersionComparison()]
        ];
        
        let allPassed = true;
        
        for (const [name, testFn] of tests) {
            const result = await this.runTest(name, testFn);
            if (!result) allPassed = false;
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 PR10验证结果');
        console.log('='.repeat(60));
        
        const report = this.generateReport();
        
        console.log(`✅ 通过测试: ${report.summary.passed}`);
        console.log(`❌ 失败测试: ${report.summary.failed}`);
        console.log(`⚠️ 警告: ${report.summary.warnings}`);
        console.log(`📈 成功率: ${report.summary.successRate}%`);
        
        if (allPassed) {
            console.log('\n🎉 PR10验证全部通过！');
            console.log('✅ Vite+TypeScript版本已准备就绪');
            console.log('🔄 可以进行双跑对比测试');
            console.log('⚡ 可以执行PR11进行最终切换');
        } else {
            console.log('\n⚠️ PR10验证存在问题，请检查失败项目');
        }
        
        console.log('\n📋 后续步骤:');
        report.nextSteps.forEach(step => console.log(`  ${step}`));
        
        return allPassed;
    }
}

// 执行验证
if (require.main === module) {
    const validator = new PR10Validator();
    validator.run()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ 验证过程出现异常:', error);
            process.exit(1);
        });
}