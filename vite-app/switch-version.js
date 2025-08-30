#!/usr/bin/env node

/**
 * EPhone版本切换脚本
 * PR10: 双跑对比与切换准备
 * 
 * 用法:
 *   node switch-version.js --to=vite     # 切换到Vite+TS版本
 *   node switch-version.js --to=es6      # 切换回ES6版本
 *   node switch-version.js --compare     # 显示对比信息
 *   node switch-version.js --status      # 显示当前状态
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class VersionSwitcher {
    constructor() {
        this.rootPath = path.resolve(__dirname, '..');
        this.webPath = path.join(this.rootPath, 'web');
        this.vitePath = path.join(this.rootPath, 'vite-app');
        this.backupPath = path.join(this.rootPath, '.version-backup');
    }

    // 检查当前版本状态
    checkCurrentVersion() {
        const webExists = fs.existsSync(path.join(this.webPath, 'index.html'));
        const viteBuilt = fs.existsSync(path.join(this.vitePath, 'dist', 'index.html'));
        const viteRunning = this.checkViteDevServer();

        return {
            webExists,
            viteBuilt,
            viteRunning,
            currentVersion: webExists ? 'es6' : (viteBuilt ? 'vite-built' : 'unknown')
        };
    }

    // 检查Vite开发服务器是否运行
    checkViteDevServer() {
        try {
            execSync('curl -s http://localhost:3000 > /dev/null', { stdio: 'ignore' });
            return true;
        } catch {
            return false;
        }
    }

    // 显示状态信息
    showStatus() {
        const status = this.checkCurrentVersion();
        
        console.log('\n🔍 EPhone版本状态检查');
        console.log('━'.repeat(50));
        console.log(`📁 ES6版本 (web/):        ${status.webExists ? '✅ 存在' : '❌ 不存在'}`);
        console.log(`⚡ Vite构建版本:          ${status.viteBuilt ? '✅ 已构建' : '❌ 未构建'}`);
        console.log(`🚀 Vite开发服务器:        ${status.viteRunning ? '✅ 运行中' : '❌ 未运行'}`);
        console.log(`🎯 当前活跃版本:          ${this.getVersionName(status.currentVersion)}`);
        
        if (status.viteRunning) {
            console.log('🌐 Vite开发地址:          http://localhost:3000');
        }
        
        console.log('━'.repeat(50));
    }

    // 获取版本友好名称
    getVersionName(version) {
        const names = {
            'es6': '🟡 ES6模块版本',
            'vite-built': '🟢 Vite+TypeScript构建版本',
            'unknown': '🔴 未知版本'
        };
        return names[version] || names.unknown;
    }

    // 显示版本对比信息
    showComparison() {
        console.log('\n📊 版本对比信息');
        console.log('━'.repeat(70));
        
        const comparisons = [
            ['特性', 'ES6版本', 'Vite+TS版本'],
            ['─'.repeat(20), '─'.repeat(20), '─'.repeat(20)],
            ['模块系统', 'ES6 Modules', 'Vite + ES6 Modules'],
            ['类型安全', '❌ 无', '✅ TypeScript'],
            ['构建工具', '❌ 无', '✅ Vite'],
            ['开发服务器', '❌ 需手动', '✅ 热重载'],
            ['代码分割', '❌ 无', '✅ 自动分割'],
            ['依赖管理', '🟡 CDN', '✅ npm/yarn'],
            ['源码映射', '❌ 无', '✅ 完整支持'],
            ['向后兼容', '✅ 原生', '✅ 100%兼容'],
            ['性能优化', '🟡 基础', '✅ 全面优化'],
            ['开发体验', '🟡 一般', '✅ 现代化']
        ];
        
        comparisons.forEach(row => {
            console.log(`${row[0].padEnd(15)} | ${row[1].padEnd(20)} | ${row[2]}`);
        });
        
        console.log('━'.repeat(70));
        console.log('💡 推荐：使用Vite+TS版本获得更好的开发体验和性能');
    }

    // 备份当前版本
    createBackup(version) {
        if (!fs.existsSync(this.backupPath)) {
            fs.mkdirSync(this.backupPath, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(this.backupPath, `${version}-${timestamp}`);
        
        console.log(`📦 创建备份: ${backupDir}`);
        
        if (version === 'es6' && fs.existsSync(this.webPath)) {
            execSync(`cp -r "${this.webPath}" "${backupDir}"`);
        } else if (version === 'vite' && fs.existsSync(this.vitePath)) {
            execSync(`cp -r "${this.vitePath}" "${backupDir}"`);
        }
        
        console.log('✅ 备份完成');
    }

    // 构建Vite版本
    buildViteVersion() {
        console.log('🔨 构建Vite+TypeScript版本...');
        process.chdir(this.vitePath);
        
        try {
            // 检查依赖
            if (!fs.existsSync(path.join(this.vitePath, 'node_modules'))) {
                console.log('📦 安装依赖...');
                execSync('npm install', { stdio: 'inherit' });
            }
            
            // 类型检查
            console.log('🔍 TypeScript类型检查...');
            execSync('npx tsc --noEmit', { stdio: 'inherit' });
            
            // 构建
            console.log('⚡ 构建应用...');
            execSync('npm run build', { stdio: 'inherit' });
            
            console.log('✅ Vite版本构建完成');
            return true;
        } catch (error) {
            console.error('❌ 构建失败:', error.message);
            return false;
        }
    }

    // 切换到Vite版本
    switchToVite() {
        console.log('\n🚀 切换到Vite+TypeScript版本');
        console.log('━'.repeat(50));
        
        // 1. 备份当前版本
        this.createBackup('es6');
        
        // 2. 构建Vite版本
        if (!this.buildViteVersion()) {
            console.log('❌ 切换失败：构建过程出错');
            return;
        }
        
        // 3. 检查构建结果
        const distPath = path.join(this.vitePath, 'dist');
        if (!fs.existsSync(path.join(distPath, 'index.html'))) {
            console.log('❌ 切换失败：构建产物不完整');
            return;
        }
        
        // 4. 复制构建结果到web目录
        console.log('📁 部署构建结果...');
        
        // 备份原web目录
        if (fs.existsSync(this.webPath)) {
            const webBackupPath = path.join(this.backupPath, 'web-replaced-' + Date.now());
            execSync(`mv "${this.webPath}" "${webBackupPath}"`);
            console.log(`📦 原web目录已备份到: ${webBackupPath}`);
        }
        
        // 复制dist到web目录
        execSync(`cp -r "${distPath}" "${this.webPath}"`);
        
        // 5. 创建切换标记文件
        const switchInfo = {
            switchedAt: new Date().toISOString(),
            fromVersion: 'es6',
            toVersion: 'vite',
            buildInfo: {
                vitePath: this.vitePath,
                buildTime: new Date().toISOString()
            }
        };
        
        fs.writeFileSync(
            path.join(this.webPath, '.version-info.json'),
            JSON.stringify(switchInfo, null, 2)
        );
        
        console.log('✅ 切换完成！');
        console.log('━'.repeat(50));
        console.log('🎉 现在可以通过web/index.html访问Vite+TypeScript版本');
        console.log('💡 建议使用HTTP服务器访问以避免CORS问题');
        console.log('🔍 查看 .version-info.json 了解切换详情');
    }

    // 切换回ES6版本
    switchToES6() {
        console.log('\n📁 切换回ES6版本');
        console.log('━'.repeat(50));
        
        // 查找最新的ES6备份
        if (!fs.existsSync(this.backupPath)) {
            console.log('❌ 切换失败：找不到ES6版本备份');
            return;
        }
        
        const backups = fs.readdirSync(this.backupPath)
            .filter(name => name.startsWith('es6-'))
            .sort()
            .reverse();
        
        if (backups.length === 0) {
            console.log('❌ 切换失败：找不到ES6版本备份');
            return;
        }
        
        const latestBackup = path.join(this.backupPath, backups[0]);
        console.log(`🔄 恢复ES6版本: ${latestBackup}`);
        
        // 备份当前Vite版本
        if (fs.existsSync(this.webPath)) {
            const viteBackupPath = path.join(this.backupPath, 'vite-replaced-' + Date.now());
            execSync(`mv "${this.webPath}" "${viteBackupPath}"`);
        }
        
        // 恢复ES6版本
        execSync(`cp -r "${latestBackup}" "${this.webPath}"`);
        
        console.log('✅ 已切换回ES6版本');
        console.log('💡 现在可以通过web/index.html访问原始ES6版本');
    }

    // 启动Vite开发服务器
    startViteDevServer() {
        console.log('🚀 启动Vite开发服务器...');
        process.chdir(this.vitePath);
        
        try {
            execSync('npm run dev', { stdio: 'inherit' });
        } catch (error) {
            console.log('⚠️ 开发服务器已停止');
        }
    }

    // 主处理函数
    run() {
        const args = process.argv.slice(2);
        const command = args.find(arg => arg.startsWith('--'));
        
        console.log('🔄 EPhone版本切换工具 - PR10');
        
        if (!command) {
            console.log('\n用法:');
            console.log('  node switch-version.js --status      # 显示当前状态');
            console.log('  node switch-version.js --compare     # 显示版本对比');
            console.log('  node switch-version.js --to=vite     # 切换到Vite版本');
            console.log('  node switch-version.js --to=es6      # 切换回ES6版本');
            console.log('  node switch-version.js --dev         # 启动Vite开发服务器');
            return;
        }
        
        switch (command) {
            case '--status':
                this.showStatus();
                break;
            case '--compare':
                this.showComparison();
                break;
            case '--to=vite':
                this.switchToVite();
                break;
            case '--to=es6':
                this.switchToES6();
                break;
            case '--dev':
                this.startViteDevServer();
                break;
            default:
                console.log(`❌ 未知命令: ${command}`);
        }
    }
}

// 执行
const switcher = new VersionSwitcher();
switcher.run();