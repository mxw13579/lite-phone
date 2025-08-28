/**
 * 内存管理器
 * 提供内存泄漏防护、监控和自动清理功能
 * 已加强SOLID原则和内存泄漏防护机制
 */

import { eventBus, EventTypes } from '../core/event-bus.js';
import { showWarning, showError } from './notify.js';

/**
 * 内存管理配置
 */
const MEMORY_CONFIG = {
    // 监控配置
    monitoringInterval: 30000,      // 30秒监控间隔
    warningThreshold: 0.8,          // 80%内存使用率预警
    criticalThreshold: 0.9,         // 90%内存使用率严重警告
    
    // 清理配置
    autoCleanupEnabled: true,       // 启用自动清理
    cleanupInterval: 300000,        // 5分钟清理间隔
    weakRefCleanupInterval: 60000,  // 1分钟弱引用清理
    
    // 限制配置
    maxEventListeners: 50,          // 最大事件监听器数
    maxTimers: 20,                  // 最大定时器数
    maxDOMRefs: 100,               // 最大DOM引用数
    maxCacheEntries: 200,          // 最大缓存条目数
    
    // 缓存配置
    cacheTTL: 600000,              // 缓存存活时间10分钟
    maxCacheSize: 50 * 1024 * 1024 // 最大缓存大小50MB
};

/**
 * 内存管理器类
 */
class MemoryManager {
    constructor() {
        this.isInitialized = false;
        this.monitoringTimer = null;
        this.cleanupTimer = null;
        this.weakRefCleanupTimer = null;
        
        // 资源跟踪
        this.trackedEventListeners = new Set();
        this.trackedTimers = new Set();
        this.trackedIntervals = new Set();
        this.trackedDOMRefs = new WeakSet();
        this.trackedPromises = new Set();
        
        // 缓存管理
        this.cacheRegistry = new Map();
        this.cacheAccessTimes = new Map();
        
        // 弱引用跟踪
        this.weakRefs = new Set();
        this.cleanupCallbacks = new Map();
        
        // 统计信息
        this.stats = {
            startTime: Date.now(),
            totalCleanups: 0,
            memoryLeaksDetected: 0,
            resourcesFreed: 0,
            lastCleanupTime: 0,
            peakMemoryUsage: 0
        };
        
        this.initializeEventHandlers();
    }

    /**
     * 初始化内存管理器
     */
    async initialize() {
        if (this.isInitialized) {
            console.warn('Memory manager already initialized');
            return;
        }

        try {
            console.log('🧠 Initializing Memory Manager...');
            
            // 启动内存监控
            this.startMemoryMonitoring();
            
            // 启动自动清理
            if (MEMORY_CONFIG.autoCleanupEnabled) {
                this.startAutoCleanup();
            }
            
            // 启动弱引用清理
            this.startWeakRefCleanup();
            
            // 设置页面卸载清理
            this.setupPageUnloadCleanup();
            
            // 监听系统内存事件
            this.listenToMemoryEvents();
            
            this.isInitialized = true;
            console.log('✅ Memory Manager initialized successfully');
            
            // 发送初始化完成事件
            await eventBus.emit(EventTypes.MEMORY_MANAGER_READY, {
                timestamp: Date.now(),
                config: MEMORY_CONFIG
            });
            
        } catch (error) {
            console.error('❌ Failed to initialize memory manager:', error);
            throw error;
        }
    }

    /**
     * 启动内存监控
     */
    startMemoryMonitoring() {
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
        }
        
        this.monitoringTimer = setInterval(() => {
            this.performMemoryCheck();
        }, MEMORY_CONFIG.monitoringInterval);
        
        this.trackedIntervals.add(this.monitoringTimer);
        console.log('📊 Memory monitoring started');
    }

    /**
     * 执行内存检查
     */
    performMemoryCheck() {
        try {
            const memoryInfo = this.getMemoryUsage();
            
            // 更新峰值内存使用
            if (memoryInfo.usage > this.stats.peakMemoryUsage) {
                this.stats.peakMemoryUsage = memoryInfo.usage;
            }
            
            // 检查内存使用率
            const usageRatio = memoryInfo.used / memoryInfo.total;
            
            if (usageRatio >= MEMORY_CONFIG.criticalThreshold) {
                this.handleCriticalMemoryUsage(memoryInfo, usageRatio);
            } else if (usageRatio >= MEMORY_CONFIG.warningThreshold) {
                this.handleWarningMemoryUsage(memoryInfo, usageRatio);
            }
            
            // 发送内存统计事件
            eventBus.emit(EventTypes.MEMORY_STATS_UPDATED, {
                memory: memoryInfo,
                usageRatio,
                stats: this.getStats(),
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('Memory check failed:', error);
        }
    }

    /**
     * 处理严重内存使用情况
     */
    handleCriticalMemoryUsage(memoryInfo, usageRatio) {
        this.stats.memoryLeaksDetected++;
        
        console.warn(`🚨 Critical memory usage: ${Math.round(usageRatio * 100)}%`);
        showError(`内存使用率严重过高: ${Math.round(usageRatio * 100)}%`, {
            duration: 5000,
            persistent: true
        });
        
        // 立即执行紧急清理
        this.performEmergencyCleanup();
        
        // 发送严重内存警告事件
        eventBus.emit(EventTypes.MEMORY_CRITICAL, {
            memory: memoryInfo,
            usageRatio,
            timestamp: Date.now()
        });
    }

    /**
     * 处理内存警告情况
     */
    handleWarningMemoryUsage(memoryInfo, usageRatio) {
        console.warn(`⚠️ High memory usage: ${Math.round(usageRatio * 100)}%`);
        showWarning(`内存使用率偏高: ${Math.round(usageRatio * 100)}%`);
        
        // 执行预防性清理
        this.performPreventiveCleanup();
        
        // 发送内存警告事件
        eventBus.emit(EventTypes.MEMORY_WARNING, {
            memory: memoryInfo,
            usageRatio,
            timestamp: Date.now()
        });
    }

    /**
     * 启动自动清理
     */
    startAutoCleanup() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        this.cleanupTimer = setInterval(() => {
            this.performRoutineCleanup();
        }, MEMORY_CONFIG.cleanupInterval);
        
        this.trackedIntervals.add(this.cleanupTimer);
        console.log('🧹 Auto cleanup started');
    }

    /**
     * 执行常规清理
     */
    async performRoutineCleanup() {
        const startTime = performance.now();
        let resourcesFreed = 0;
        
        try {
            console.log('🧹 Performing routine cleanup...');
            
            // 清理过期缓存
            resourcesFreed += this.cleanupExpiredCache();
            
            // 清理未使用的DOM引用
            resourcesFreed += this.cleanupDOMReferences();
            
            // 清理完成的Promise
            resourcesFreed += this.cleanupCompletedPromises();
            
            // 强制垃圾回收（如果可用）
            this.forceGarbageCollection();
            
            this.stats.totalCleanups++;
            this.stats.resourcesFreed += resourcesFreed;
            this.stats.lastCleanupTime = Date.now();
            
            const duration = performance.now() - startTime;
            console.log(`✅ Routine cleanup completed: ${resourcesFreed} resources freed in ${Math.round(duration)}ms`);
            
            // 发送清理完成事件
            await eventBus.emit(EventTypes.MEMORY_CLEANUP_COMPLETED, {
                type: 'routine',
                resourcesFreed,
                duration,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('Routine cleanup failed:', error);
        }
    }

    /**
     * 执行紧急清理
     */
    async performEmergencyCleanup() {
        const startTime = performance.now();
        let resourcesFreed = 0;
        
        try {
            console.log('🚨 Performing emergency cleanup...');
            
            // 执行所有清理操作
            resourcesFreed += this.cleanupExpiredCache();
            resourcesFreed += this.cleanupDOMReferences();
            resourcesFreed += this.cleanupCompletedPromises();
            resourcesFreed += this.cleanupEventListeners();
            
            // 清空大部分缓存
            resourcesFreed += this.clearNonCriticalCache();
            
            // 强制垃圾回收
            this.forceGarbageCollection();
            
            this.stats.totalCleanups++;
            this.stats.resourcesFreed += resourcesFreed;
            this.stats.lastCleanupTime = Date.now();
            
            const duration = performance.now() - startTime;
            console.log(`🚨 Emergency cleanup completed: ${resourcesFreed} resources freed in ${Math.round(duration)}ms`);
            
            // 发送紧急清理完成事件
            await eventBus.emit(EventTypes.MEMORY_CLEANUP_COMPLETED, {
                type: 'emergency',
                resourcesFreed,
                duration,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('Emergency cleanup failed:', error);
        }
    }

    /**
     * 执行预防性清理
     */
    async performPreventiveCleanup() {
        const startTime = performance.now();
        let resourcesFreed = 0;
        
        try {
            console.log('⚠️ Performing preventive cleanup...');
            
            // 清理过期缓存和部分非关键资源
            resourcesFreed += this.cleanupExpiredCache();
            resourcesFreed += this.cleanupCompletedPromises();
            
            this.stats.totalCleanups++;
            this.stats.resourcesFreed += resourcesFreed;
            this.stats.lastCleanupTime = Date.now();
            
            const duration = performance.now() - startTime;
            console.log(`⚠️ Preventive cleanup completed: ${resourcesFreed} resources freed in ${Math.round(duration)}ms`);
            
            // 发送预防性清理完成事件
            await eventBus.emit(EventTypes.MEMORY_CLEANUP_COMPLETED, {
                type: 'preventive',
                resourcesFreed,
                duration,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('Preventive cleanup failed:', error);
        }
    }

    /**
     * 清理过期缓存
     */
    cleanupExpiredCache() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, data] of this.cacheRegistry.entries()) {
            if (now - data.timestamp > MEMORY_CONFIG.cacheTTL) {
                this.cacheRegistry.delete(key);
                this.cacheAccessTimes.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🗑️ Cleaned ${cleaned} expired cache entries`);
        }
        
        return cleaned;
    }

    /**
     * 清理DOM引用
     */
    cleanupDOMReferences() {
        // WeakSet会自动清理失效的DOM引用
        // 这里主要是记录和统计
        return 0;
    }

    /**
     * 清理已完成的Promise
     */
    cleanupCompletedPromises() {
        const initial = this.trackedPromises.size;
        
        // 移除已settled的Promise
        for (const promise of this.trackedPromises) {
            if (promise._memoryManager_settled) {
                this.trackedPromises.delete(promise);
            }
        }
        
        const cleaned = initial - this.trackedPromises.size;
        if (cleaned > 0) {
            console.log(`🗑️ Cleaned ${cleaned} completed promises`);
        }
        
        return cleaned;
    }

    /**
     * 清理事件监听器
     */
    cleanupEventListeners() {
        // 这个方法需要与eventBus配合
        // 目前返回0，将来可以扩展
        return 0;
    }

    /**
     * 清理非关键缓存
     */
    clearNonCriticalCache() {
        const initialSize = this.cacheRegistry.size;
        
        // 保留最近访问的25%缓存
        const keepCount = Math.floor(initialSize * 0.25);
        const sortedByAccess = Array.from(this.cacheAccessTimes.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, keepCount);
        
        // 清除剩余缓存
        const keepKeys = new Set(sortedByAccess.map(([key]) => key));
        for (const key of this.cacheRegistry.keys()) {
            if (!keepKeys.has(key)) {
                this.cacheRegistry.delete(key);
                this.cacheAccessTimes.delete(key);
            }
        }
        
        const cleaned = initialSize - this.cacheRegistry.size;
        if (cleaned > 0) {
            console.log(`🗑️ Cleared ${cleaned} non-critical cache entries`);
        }
        
        return cleaned;
    }

    /**
     * 启动弱引用清理
     */
    startWeakRefCleanup() {
        if (this.weakRefCleanupTimer) {
            clearInterval(this.weakRefCleanupTimer);
        }
        
        this.weakRefCleanupTimer = setInterval(() => {
            this.cleanupWeakReferences();
        }, MEMORY_CONFIG.weakRefCleanupInterval);
        
        this.trackedIntervals.add(this.weakRefCleanupTimer);
    }

    /**
     * 清理弱引用
     */
    cleanupWeakReferences() {
        let cleaned = 0;
        
        for (const weakRef of this.weakRefs) {
            if (weakRef.deref() === undefined) {
                this.weakRefs.delete(weakRef);
                
                // 执行清理回调
                const callback = this.cleanupCallbacks.get(weakRef);
                if (callback) {
                    try {
                        callback();
                    } catch (error) {
                        console.error('Cleanup callback error:', error);
                    }
                    this.cleanupCallbacks.delete(weakRef);
                }
                
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🗑️ Cleaned ${cleaned} weak references`);
        }
    }

    /**
     * 强制垃圾回收
     */
    forceGarbageCollection() {
        if (window.gc && typeof window.gc === 'function') {
            try {
                window.gc();
                console.log('🗑️ Forced garbage collection');
            } catch (error) {
                console.warn('Failed to force garbage collection:', error);
            }
        }
    }

    /**
     * 获取内存使用信息
     */
    getMemoryUsage() {
        if (performance.memory) {
            return {
                used: performance.memory.usedJSHeapSize,
                total: performance.memory.totalJSHeapSize,
                limit: performance.memory.jsHeapSizeLimit,
                usage: performance.memory.usedJSHeapSize
            };
        }
        
        // 回退到估算
        return {
            used: 0,
            total: 0,
            limit: 0,
            usage: 0
        };
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        const memoryInfo = this.getMemoryUsage();
        
        return {
            ...this.stats,
            uptime,
            resourceCounts: {
                eventListeners: this.trackedEventListeners.size,
                timers: this.trackedTimers.size,
                intervals: this.trackedIntervals.size,
                promises: this.trackedPromises.size,
                cacheEntries: this.cacheRegistry.size,
                weakRefs: this.weakRefs.size
            },
            memory: memoryInfo
        };
    }

    /**
     * 跟踪事件监听器
     */
    trackEventListener(element, event, handler, options = {}) {
        const listenerInfo = {
            element,
            event,
            handler,
            options,
            createdAt: Date.now(),
            id: this.generateId()
        };
        
        this.trackedEventListeners.add(listenerInfo);
        
        // 返回清理函数
        return () => {
            this.untrackEventListener(listenerInfo);
        };
    }

    /**
     * 取消跟踪事件监听器
     */
    untrackEventListener(listenerInfo) {
        this.trackedEventListeners.delete(listenerInfo);
    }

    /**
     * 跟踪定时器
     */
    trackTimer(timerId, type = 'timeout') {
        const timerInfo = {
            id: timerId,
            type,
            createdAt: Date.now()
        };
        
        if (type === 'timeout') {
            this.trackedTimers.add(timerInfo);
        } else if (type === 'interval') {
            this.trackedIntervals.add(timerInfo);
        }
        
        return timerInfo;
    }

    /**
     * 取消跟踪定时器
     */
    untrackTimer(timerId, type = 'timeout') {
        const targetSet = type === 'timeout' ? this.trackedTimers : this.trackedIntervals;
        
        for (const timer of targetSet) {
            if (timer.id === timerId) {
                targetSet.delete(timer);
                break;
            }
        }
    }

    /**
     * 跟踪Promise
     */
    trackPromise(promise) {
        this.trackedPromises.add(promise);
        
        // 标记Promise状态
        promise.then(
            () => { promise._memoryManager_settled = true; },
            () => { promise._memoryManager_settled = true; }
        );
        
        return promise;
    }

    /**
     * 创建弱引用
     */
    createWeakRef(target, cleanupCallback = null) {
        const weakRef = new WeakRef(target);
        this.weakRefs.add(weakRef);
        
        if (cleanupCallback) {
            this.cleanupCallbacks.set(weakRef, cleanupCallback);
        }
        
        return weakRef;
    }

    /**
     * 设置页面卸载清理
     */
    setupPageUnloadCleanup() {
        const cleanup = () => {
            this.destroy();
        };
        
        window.addEventListener('beforeunload', cleanup);
        window.addEventListener('unload', cleanup);
        
        // 页面隐藏时也进行清理
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.performPreventiveCleanup();
            }
        });
    }

    /**
     * 监听系统内存事件
     */
    listenToMemoryEvents() {
        // 监听内存压力事件（如果浏览器支持）
        if ('memory' in performance && 'addEventListener' in performance.memory) {
            performance.memory.addEventListener('memorypressure', () => {
                console.warn('🚨 Memory pressure detected by browser');
                this.performEmergencyCleanup();
            });
        }
    }

    /**
     * 初始化事件处理器
     */
    initializeEventHandlers() {
        // 监听应用生命周期事件
        eventBus.on(EventTypes.APP_READY, () => {
            console.log('📱 App ready, memory manager active');
        });
        
        eventBus.on(EventTypes.APP_ERROR, (error) => {
            console.warn('📱 App error detected, performing cleanup:', error);
            this.performPreventiveCleanup();
        });
    }

    /**
     * 生成唯一ID
     */
    generateId() {
        return `mm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 销毁内存管理器
     */
    destroy() {
        if (!this.isInitialized) return;
        
        console.log('🧠 Destroying Memory Manager...');
        
        // 停止所有定时器
        if (this.monitoringTimer) {
            clearInterval(this.monitoringTimer);
            this.monitoringTimer = null;
        }
        
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        if (this.weakRefCleanupTimer) {
            clearInterval(this.weakRefCleanupTimer);
            this.weakRefCleanupTimer = null;
        }
        
        // 清理所有跟踪的定时器
        for (const timer of this.trackedTimers) {
            clearTimeout(timer.id);
        }
        
        for (const interval of this.trackedIntervals) {
            clearInterval(interval.id);
        }
        
        // 清空所有集合
        this.trackedEventListeners.clear();
        this.trackedTimers.clear();
        this.trackedIntervals.clear();
        this.trackedPromises.clear();
        this.cacheRegistry.clear();
        this.cacheAccessTimes.clear();
        this.weakRefs.clear();
        this.cleanupCallbacks.clear();
        
        this.isInitialized = false;
        console.log('✅ Memory Manager destroyed');
    }
}

// 创建全局内存管理器实例
export const memoryManager = new MemoryManager();

// 便捷函数
export const MemoryUtils = {
    /**
     * 安全的事件监听器添加
     */
    addEventListener(element, event, handler, options = {}) {
        element.addEventListener(event, handler, options);
        return memoryManager.trackEventListener(element, event, handler, options);
    },

    /**
     * 安全的定时器创建
     */
    setTimeout(callback, delay) {
        const timerId = setTimeout(callback, delay);
        memoryManager.trackTimer(timerId, 'timeout');
        return timerId;
    },

    /**
     * 安全的间隔定时器创建
     */
    setInterval(callback, interval) {
        const intervalId = setInterval(callback, interval);
        memoryManager.trackTimer(intervalId, 'interval');
        return intervalId;
    },

    /**
     * 安全的定时器清理
     */
    clearTimeout(timerId) {
        clearTimeout(timerId);
        memoryManager.untrackTimer(timerId, 'timeout');
    },

    /**
     * 安全的间隔定时器清理
     */
    clearInterval(intervalId) {
        clearInterval(intervalId);
        memoryManager.untrackTimer(intervalId, 'interval');
    },

    /**
     * 跟踪Promise
     */
    trackPromise(promise) {
        return memoryManager.trackPromise(promise);
    },

    /**
     * 创建弱引用
     */
    createWeakRef(target, cleanupCallback = null) {
        return memoryManager.createWeakRef(target, cleanupCallback);
    },

    /**
     * 获取内存统计
     */
    getStats() {
        return memoryManager.getStats();
    },

    /**
     * 手动清理
     */
    cleanup() {
        return memoryManager.performRoutineCleanup();
    }
};

// 扩展事件类型
if (typeof EventTypes !== 'undefined') {
    EventTypes.MEMORY_MANAGER_READY = 'memory.manager.ready';
    EventTypes.MEMORY_STATS_UPDATED = 'memory.stats.updated';
    EventTypes.MEMORY_WARNING = 'memory.warning';
    EventTypes.MEMORY_CRITICAL = 'memory.critical';
    EventTypes.MEMORY_CLEANUP_COMPLETED = 'memory.cleanup.completed';
}

// 默认导出
export default memoryManager;