/**
 * 现代化路由管理系统
 * 替代全局 onclick 处理，提供模块化的事件管理
 */

import { eventBus, EventTypes } from './event-bus.js';

/**
 * 路由管理器类
 */
class RouteManager {
    constructor() {
        this.currentScreen = 'home-screen';
        this.screenHistory = ['home-screen'];
        this.maxHistoryLength = 10;
        this.routes = new Map();
        this.middlewares = [];
        this.isInitialized = false;
    }

    /**
     * 初始化路由管理器
     */
    initialize() {
        if (this.isInitialized) {
            return;
        }

        // 绑定全局事件
        this.bindGlobalEvents();
        
        // 注册默认路由
        this.registerDefaultRoutes();
        
        // 处理浏览器后退按钮（如果需要）
        this.handlePopState();
        
        this.isInitialized = true;
        console.log('Route manager initialized');
    }

    /**
     * 绑定全局事件
     */
    bindGlobalEvents() {
        // 绑定所有带有 data-route 或 data-nav-screen 属性的元素
        document.addEventListener('click', (event) => {
            const target = event.target.closest('[data-route], [data-nav-screen]');
            if (target) {
                event.preventDefault();
                const route = target.getAttribute('data-route') || target.getAttribute('data-nav-screen');
                if (route) {
                    this.navigateToScreen(route);
                }
            }
        });

        // 绑定返回按钮 (只对没有data-nav-screen属性的back-btn生效)
        document.addEventListener('click', (event) => {
            const backBtn = event.target.closest('.back-btn');
            if (backBtn && !backBtn.hasAttribute('data-nav-screen') && !backBtn.hasAttribute('data-route')) {
                event.preventDefault();
                this.goBack();
            }
        });

        // 绑定键盘导航
        document.addEventListener('keydown', (event) => {
            this.handleKeyNavigation(event);
        });
    }

    /**
     * 注册路由
     * @param {string} screenId 屏幕ID
     * @param {Object} config 路由配置
     */
    registerRoute(screenId, config) {
        this.routes.set(screenId, {
            title: config.title || screenId,
            beforeEnter: config.beforeEnter || null,
            afterEnter: config.afterEnter || null,
            beforeLeave: config.beforeLeave || null,
            afterLeave: config.afterLeave || null,
            renderer: config.renderer || null,
            requireAuth: config.requireAuth || false,
            metadata: config.metadata || {}
        });
    }

    /**
     * 注册默认路由
     */
    registerDefaultRoutes() {
        const defaultRoutes = [
            { id: 'home-screen', title: '主屏幕' },
            { id: 'chat-list-screen', title: '聊天列表' },
            { id: 'chat-interface-screen', title: '聊天界面' },
            { id: 'preset-list-screen', title: '预设管理' },
            { id: 'preset-editor-screen', title: '预设编辑器' },
            { id: 'world-book-screen', title: '世界书' },
            { id: 'world-book-editor-screen', title: '世界书编辑器' },
            { id: 'api-settings-screen', title: 'API设置' },
            { id: 'wallpaper-screen', title: '壁纸设置' },
            { id: 'moments-screen', title: '朋友圈' },
            { id: 'plugins-screen', title: '插件管理' },
            { id: 'themes-screen', title: '美化中心' }
        ];

        defaultRoutes.forEach(route => {
            this.registerRoute(route.id, { title: route.title });
        });
    }

    /**
     * 导航到指定屏幕
     * @param {string} screenId 屏幕ID
     * @param {Object} options 选项
     * @returns {Promise<boolean>} 导航是否成功
     */
    async navigateToScreen(screenId, options = {}) {
        if (!screenId || screenId === this.currentScreen) {
            return false;
        }

        const { replace = false, skipHistory = false } = options;
        const route = this.routes.get(screenId);
        
        try {
            // 执行中间件
            for (const middleware of this.middlewares) {
                const result = await middleware(screenId, this.currentScreen);
                if (result === false) {
                    return false; // 中间件阻止导航
                }
            }

            // 执行当前路由的 beforeLeave 钩子
            const currentRoute = this.routes.get(this.currentScreen);
            if (currentRoute?.beforeLeave) {
                const canLeave = await currentRoute.beforeLeave();
                if (canLeave === false) {
                    return false;
                }
            }

            // 执行目标路由的 beforeEnter 钩子
            if (route?.beforeEnter) {
                const canEnter = await route.beforeEnter();
                if (canEnter === false) {
                    return false;
                }
            }

            // 执行屏幕切换
            const success = this.switchScreen(screenId);
            if (!success) {
                return false;
            }

            // 更新历史记录
            if (!skipHistory) {
                if (replace) {
                    this.screenHistory[this.screenHistory.length - 1] = screenId;
                } else {
                    this.screenHistory.push(screenId);
                    // 限制历史记录长度
                    if (this.screenHistory.length > this.maxHistoryLength) {
                        this.screenHistory = this.screenHistory.slice(-this.maxHistoryLength);
                    }
                }
            }

            // 更新当前屏幕
            const previousScreen = this.currentScreen;
            this.currentScreen = screenId;

            // 发送路由变更事件
            await eventBus.emit(EventTypes.SCREEN_CHANGED, {
                from: previousScreen,
                to: screenId,
                timestamp: Date.now(),
                route: route || null
            });

            // 执行路由钩子
            if (currentRoute?.afterLeave) {
                currentRoute.afterLeave();
            }
            
            if (route?.renderer) {
                await route.renderer();
            }
            
            if (route?.afterEnter) {
                route.afterEnter();
            }

            // 更新页面标题和无障碍性
            this.updatePageTitle(route?.title || screenId);
            this.updateAccessibility(screenId);

            console.log(`Navigated to: ${screenId}`);
            return true;

        } catch (error) {
            console.error(`Navigation to ${screenId} failed:`, error);
            return false;
        }
    }

    /**
     * 执行屏幕切换的DOM操作
     * @param {string} screenId 目标屏幕ID
     * @returns {boolean} 是否切换成功
     */
    switchScreen(screenId) {
        const targetScreen = document.getElementById(screenId);
        if (!targetScreen) {
            console.error(`Screen not found: ${screenId}`);
            return false;
        }

        // 隐藏所有屏幕
        const allScreens = document.querySelectorAll('.screen');
        allScreens.forEach(screen => {
            // 移除焦点从隐藏的屏幕中的元素
            const focusedElement = screen.querySelector(':focus');
            if (focusedElement) {
                focusedElement.blur();
            }
            
            screen.classList.remove('active');
            screen.setAttribute('aria-hidden', 'true');
        });

        // 显示目标屏幕
        targetScreen.classList.add('active');
        targetScreen.setAttribute('aria-hidden', 'false');
        
        // 设置焦点到主要内容
        const focusTarget = targetScreen.querySelector('[autofocus]') || 
                           targetScreen.querySelector('h1, h2, .header-title') ||
                           targetScreen;
        
        if (focusTarget && focusTarget.focus) {
            setTimeout(() => focusTarget.focus(), 100);
        }

        return true;
    }

    /**
     * 返回上一页
     * @returns {boolean} 是否成功返回
     */
    goBack() {
        if (this.screenHistory.length <= 1) {
            return this.navigateToScreen('home-screen');
        }

        // 移除当前页面
        this.screenHistory.pop();
        // 获取上一页面
        const previousScreen = this.screenHistory[this.screenHistory.length - 1];
        
        return this.navigateToScreen(previousScreen, { skipHistory: true });
    }

    /**
     * 处理键盘导航
     * @param {KeyboardEvent} event 键盘事件
     */
    handleKeyNavigation(event) {
        // ESC键返回
        if (event.key === 'Escape') {
            const modal = document.querySelector('.modal[style*="flex"]');
            if (modal) {
                // 关闭模态框
                modal.style.display = 'none';
            } else {
                // 返回上一页
                this.goBack();
            }
            event.preventDefault();
        }

        // Alt + 左箭头返回
        if (event.altKey && event.key === 'ArrowLeft') {
            this.goBack();
            event.preventDefault();
        }

        // Tab键循环焦点
        if (event.key === 'Tab') {
            this.handleTabNavigation(event);
        }

        // 回车键激活元素
        if (event.key === 'Enter') {
            const focused = document.activeElement;
            if (focused && focused.getAttribute('data-route')) {
                const route = focused.getAttribute('data-route');
                this.navigateToScreen(route);
                event.preventDefault();
            }
        }
    }

    /**
     * 处理Tab导航
     * @param {KeyboardEvent} event 键盘事件
     */
    handleTabNavigation(event) {
        const currentScreen = document.getElementById(this.currentScreen);
        if (!currentScreen) return;

        const focusableElements = currentScreen.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey && document.activeElement === firstElement) {
            lastElement?.focus();
            event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
            firstElement?.focus();
            event.preventDefault();
        }
    }

    /**
     * 处理浏览器后退
     */
    handlePopState() {
        window.addEventListener('popstate', (event) => {
            if (event.state?.screenId) {
                this.navigateToScreen(event.state.screenId, { skipHistory: true });
            }
        });
    }

    /**
     * 更新页面标题
     * @param {string} title 页面标题
     */
    updatePageTitle(title) {
        document.title = `EPhone - ${title}`;
    }

    /**
     * 更新无障碍性
     * @param {string} screenId 屏幕ID
     */
    updateAccessibility(screenId) {
        // 更新aria-label
        const phoneScreen = document.getElementById('phone-screen');
        if (phoneScreen) {
            phoneScreen.setAttribute('aria-label', `当前页面: ${screenId}`);
        }

        // 宣布页面变更
        this.announceScreenChange(screenId);
    }

    /**
     * 宣布屏幕变更（屏幕阅读器）
     * @param {string} screenId 屏幕ID
     */
    announceScreenChange(screenId) {
        const route = this.routes.get(screenId);
        const announcement = `已切换到${route?.title || screenId}`;
        
        // 创建或更新宣告元素
        let announcer = document.getElementById('screen-announcer');
        if (!announcer) {
            announcer = document.createElement('div');
            announcer.id = 'screen-announcer';
            announcer.setAttribute('aria-live', 'polite');
            announcer.setAttribute('aria-atomic', 'true');
            announcer.style.cssText = `
                position: absolute;
                left: -10000px;
                width: 1px;
                height: 1px;
                overflow: hidden;
            `;
            document.body.appendChild(announcer);
        }
        
        announcer.textContent = announcement;
    }

    /**
     * 添加中间件
     * @param {Function} middleware 中间件函数
     */
    use(middleware) {
        if (typeof middleware === 'function') {
            this.middlewares.push(middleware);
        }
    }

    /**
     * 获取当前屏幕
     * @returns {string} 当前屏幕ID
     */
    getCurrentScreen() {
        return this.currentScreen;
    }

    /**
     * 获取屏幕历史
     * @returns {Array} 屏幕历史数组
     */
    getHistory() {
        return [...this.screenHistory];
    }

    /**
     * 清空历史记录
     */
    clearHistory() {
        this.screenHistory = [this.currentScreen];
    }

    /**
     * 检查是否可以返回
     * @returns {boolean} 是否可以返回
     */
    canGoBack() {
        return this.screenHistory.length > 1 || this.currentScreen !== 'home-screen';
    }
}

// 创建全局路由管理器实例
export const routeManager = new RouteManager();

// 导出RouteManager类供自定义实例使用
export { RouteManager };