/**
 * 行为设置视图层
 * 
 * 功能概述：
 * - 行为参数控制界面渲染和用户交互
 * - 行为统计数据展示功能
 * - 行为测试和调试界面
 * 
 * @fileoverview 行为设置视图，遵循Store-View模式和SOLID原则
 */

import { behaviorSettingsStore } from './store.js';
import { $, byId, createElement } from '../../utils/dom.js';
import { showToast, showSuccess, showError, showWarning } from '../../utils/notify.js';
import { formatDate, formatRelativeTime } from '../../utils/format.js';
import { routeManager } from '../../core/router.js';
import { eventBus, EventTypes } from '../../core/event-bus.js';

let isInitialized = false;
let currentRoleId = 'default';
let currentStats = null;
let testResults = null;

/**
 * 初始化行为设置视图
 * @returns {Promise<void>}
 */
export async function initializeBehaviorSettingsView() {
    if (isInitialized) return;
    
    try {
        // 初始化存储
        const result = await behaviorSettingsStore.initialize();
        if (!result.success) {
            throw new Error(result.message);
        }
        
        // 绑定事件处理器
        bindEvents();
        
        // 设置事件监听
        setupEventListeners();
        
        isInitialized = true;
        console.log('✅ Behavior settings view initialized successfully');
        
    } catch (error) {
        console.error('❌ Behavior settings view initialization failed:', error);
        showError('行为设置初始化失败: ' + error.message);
    }
}

/**
 * 绑定事件处理器
 * @private
 */
function bindEvents() {
    // 配置选项卡切换事件
    const configTabs = document.querySelectorAll('.config-tab');
    configTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = e.target.dataset.tab;
            switchConfigTab(targetTab);
        });
    });
    
    // 行为设置保存按钮
    const saveBtn = byId('save-behavior-config');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSaveConfig);
    }
    
    // 重置配置按钮
    const resetBtn = byId('reset-behavior-config');
    if (resetBtn) {
        resetBtn.addEventListener('click', handleResetConfig);
    }
    
    // 测试行为评分按钮
    const testScoreBtn = byId('test-behavior-score');
    if (testScoreBtn) {
        testScoreBtn.addEventListener('click', handleTestBehaviorScore);
    }
    
    // 测试行为概率按钮
    const testProbabilityBtn = byId('test-action-probability');
    if (testProbabilityBtn) {
        testProbabilityBtn.addEventListener('click', handleTestActionProbability);
    }
    
    // 刷新统计按钮
    const refreshStatsBtn = byId('refresh-behavior-stats');
    if (refreshStatsBtn) {
        refreshStatsBtn.addEventListener('click', handleRefreshStats);
    }
    
    // 频率滑块事件绑定
    bindFrequencySliders();
    
    // 冷却时间输入事件绑定
    bindCooldownInputs();
    
    // 权重滑块事件绑定
    bindWeightSliders();
    
    // 阈值滑块事件绑定
    bindThresholdSliders();
}

/**
 * 绑定频率控制滑块
 * @private
 */
function bindFrequencySliders() {
    const sliders = [
        { slider: 'chat-reply-freq', display: 'chat-reply-freq-value', suffix: 'x' },
        { slider: 'moment-activity', display: 'moment-activity-value', suffix: 'x' },
        { slider: 'proactive-chat', display: 'proactive-chat-value', suffix: '%', multiplier: 100 }
    ];
    
    sliders.forEach(({ slider, display, suffix, multiplier = 1 }) => {
        const sliderElement = byId(slider);
        const displayElement = byId(display);
        
        if (sliderElement && displayElement) {
            sliderElement.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                const displayValue = (value * multiplier).toFixed(multiplier === 100 ? 0 : 1);
                displayElement.textContent = `${displayValue}${suffix}`;
            });
        }
    });
}

/**
 * 绑定冷却时间输入框
 * @private
 */
function bindCooldownInputs() {
    const cooldownInputs = [
        'chat-cooldown',
        'moment-post-cooldown',
        'moment-comment-cooldown',
        'moment-like-cooldown',
        'proactive-cooldown'
    ];
    
    cooldownInputs.forEach(inputId => {
        const input = byId(inputId);
        if (input) {
            input.addEventListener('change', (e) => {
                const value = parseInt(e.target.value);
                if (value < 1) {
                    e.target.value = 1;
                    showWarning('冷却时间不能少于1分钟');
                } else if (value > 1440) { // 24小时
                    e.target.value = 1440;
                    showWarning('冷却时间不能超过24小时');
                }
            });
        }
    });
}

/**
 * 绑定权重滑块
 * @private
 */
function bindWeightSliders() {
    const weights = [
        'interaction-frequency-weight',
        'time-since-action-weight',
        'context-relevance-weight',
        'user-activity-weight'
    ];
    
    weights.forEach(weightId => {
        const slider = byId(weightId);
        const display = byId(weightId.replace('-weight', '-weight-value'));
        
        if (slider && display) {
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                display.textContent = value.toFixed(1);
            });
        }
    });
}

/**
 * 绑定阈值滑块
 * @private
 */
function bindThresholdSliders() {
    const thresholds = [
        'chat-reply-threshold',
        'moment-post-threshold',
        'moment-comment-threshold',
        'moment-like-threshold',
        'proactive-chat-threshold'
    ];
    
    thresholds.forEach(thresholdId => {
        const slider = byId(thresholdId);
        const display = byId(thresholdId.replace('-threshold', '-threshold-value'));
        
        if (slider && display) {
            slider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                display.textContent = `${(value * 100).toFixed(0)}%`;
            });
        }
    });
}

/**
 * 设置事件监听器
 * @private
 */
function setupEventListeners() {
    // 监听配置更新事件
    eventBus.on('behavior-settings.config-updated', handleConfigUpdated);
    
    // 监听测试完成事件
    eventBus.on('behavior-settings.score-tested', handleScoreTested);
    eventBus.on('behavior-settings.probability-tested', handleProbabilityTested);
    
    // 监听路由变化
    eventBus.on('route.changed', handleRouteChanged);
}

/**
 * 处理配置保存
 */
async function handleSaveConfig() {
    try {
        showToast('正在保存行为配置...', 'info');
        
        const config = collectConfigFromForm();
        const result = await behaviorSettingsStore.saveBehaviorConfig(config, currentRoleId);
        
        if (result.success) {
            showSuccess('行为配置保存成功');
            
            // 刷新统计数据
            await loadBehaviorStats();
            
        } else {
            showError(`保存失败: ${result.error}`);
        }
        
    } catch (error) {
        console.error('Save config failed:', error);
        showError('保存配置时发生错误: ' + error.message);
    }
}

/**
 * 处理配置重置
 */
async function handleResetConfig() {
    if (!confirm('确定要重置所有行为配置到默认值吗？此操作无法撤销。')) {
        return;
    }
    
    try {
        showToast('正在重置行为配置...', 'info');
        
        const result = await behaviorSettingsStore.resetBehaviorConfig(currentRoleId);
        
        if (result.success) {
            showSuccess('行为配置已重置到默认值');
            
            // 重新加载和显示配置
            await loadAndDisplayConfig();
            
        } else {
            showError(`重置失败: ${result.error}`);
        }
        
    } catch (error) {
        console.error('Reset config failed:', error);
        showError('重置配置时发生错误: ' + error.message);
    }
}

/**
 * 处理行为评分测试
 */
async function handleTestBehaviorScore() {
    try {
        showToast('正在测试行为评分...', 'info');
        
        const testContext = {
            chatId: currentRoleId,
            timeWindow: 4 * 60 * 60 * 1000, // 4小时
            keywords: ['测试', '对话', '互动', '有趣'],
            userActivityLevel: 'medium',
            userMood: 'positive'
        };
        
        const result = await behaviorSettingsStore.testBehaviorScore(currentRoleId, testContext);
        
        if (result.success) {
            testResults = result.data;
            displayTestResults('score', result.data);
            showSuccess('行为评分测试完成');
        } else {
            showError(`测试失败: ${result.error}`);
        }
        
    } catch (error) {
        console.error('Test behavior score failed:', error);
        showError('测试行为评分时发生错误: ' + error.message);
    }
}

/**
 * 处理行为概率测试
 */
async function handleTestActionProbability() {
    try {
        showToast('正在测试行为概率...', 'info');
        
        const actionType = 'chat_reply'; // 可以从界面选择
        const testContext = {
            roleId: currentRoleId,
            behaviorScore: 0.75,
            userActivityLevel: 'high',
            keywords: ['测试', '概率']
        };
        
        const result = await behaviorSettingsStore.testActionProbability(actionType, testContext);
        
        if (result.success) {
            testResults = result.data;
            displayTestResults('probability', result.data);
            showSuccess('行为概率测试完成');
        } else {
            showError(`测试失败: ${result.error}`);
        }
        
    } catch (error) {
        console.error('Test action probability failed:', error);
        showError('测试行为概率时发生错误: ' + error.message);
    }
}

/**
 * 处理统计数据刷新
 */
async function handleRefreshStats() {
    try {
        showToast('正在刷新统计数据...', 'info');
        await loadBehaviorStats();
        showSuccess('统计数据刷新成功');
    } catch (error) {
        console.error('Refresh stats failed:', error);
        showError('刷新统计数据时发生错误: ' + error.message);
    }
}

/**
 * 处理配置更新事件
 * @param {Object} data 配置更新数据
 */
function handleConfigUpdated(data) {
    console.log('🔧 Behavior config updated:', data);
    
    // 如果更新的是当前角色，刷新显示
    if (data.roleId === currentRoleId) {
        // 延迟刷新，确保数据已保存
        setTimeout(() => {
            loadAndDisplayConfig();
        }, 100);
    }
}

/**
 * 处理评分测试完成事件
 * @param {Object} data 测试数据
 */
function handleScoreTested(data) {
    console.log('📊 Behavior score tested:', data);
}

/**
 * 处理概率测试完成事件
 * @param {Object} data 测试数据
 */
function handleProbabilityTested(data) {
    console.log('🎯 Action probability tested:', data);
}

/**
 * 处理路由变化
 * @param {Object} data 路由数据
 */
function handleRouteChanged(data) {
    if (data.to === 'behavior-settings-screen') {
        renderBehaviorSettingsScreen();
    }
}

/**
 * 渲染行为设置界面
 */
export async function renderBehaviorSettingsScreen() {
    console.log('🎨 Rendering behavior settings screen...');
    
    try {
        // 显示加载状态
        showLoadingState();
        
        // 加载配置和统计数据
        await loadAndDisplayConfig();
        await loadBehaviorStats();
        
        // 隐藏加载状态
        hideLoadingState();
        
        console.log('✅ Behavior settings screen rendered');
        
    } catch (error) {
        console.error('❌ Failed to render behavior settings screen:', error);
        showError('加载行为设置界面失败: ' + error.message);
        hideLoadingState();
    }
}

/**
 * 加载和显示配置
 */
async function loadAndDisplayConfig() {
    try {
        const result = await behaviorSettingsStore.loadBehaviorConfig(currentRoleId);
        
        if (result.success) {
            populateConfigForm(result.data);
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        console.error('Load and display config failed:', error);
        showError('加载配置失败: ' + error.message);
    }
}

/**
 * 加载行为统计数据
 */
async function loadBehaviorStats() {
    try {
        const timeRange = {
            startTime: Date.now() - 7 * 24 * 60 * 60 * 1000, // 最近7天
            endTime: Date.now()
        };
        
        const result = await behaviorSettingsStore.getBehaviorStats(currentRoleId, timeRange);
        
        if (result.success) {
            currentStats = result.data;
            displayBehaviorStats(result.data);
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        console.error('Load behavior stats failed:', error);
        showError('加载统计数据失败: ' + error.message);
    }
}

/**
 * 从表单收集配置数据
 * @returns {Object} 配置对象
 */
function collectConfigFromForm() {
    return {
        enabled: byId('behavior-enabled')?.checked ?? true,
        frequencies: {
            chatReply: parseFloat(byId('chat-reply-freq')?.value) || 1.0,
            momentActivity: parseFloat(byId('moment-activity')?.value) || 1.0,
            proactiveChat: parseFloat(byId('proactive-chat')?.value) || 0.3
        },
        cooldowns: {
            chat_reply: (parseInt(byId('chat-cooldown')?.value) || 30) * 60 * 1000,
            moment_post: (parseInt(byId('moment-post-cooldown')?.value) || 120) * 60 * 1000,
            moment_comment: (parseInt(byId('moment-comment-cooldown')?.value) || 15) * 60 * 1000,
            moment_like: (parseInt(byId('moment-like-cooldown')?.value) || 5) * 60 * 1000,
            proactive_chat: (parseInt(byId('proactive-cooldown')?.value) || 60) * 60 * 1000
        },
        scoreWeights: {
            interactionFrequency: parseFloat(byId('interaction-frequency-weight')?.value) || 0.4,
            timeSinceLastAction: parseFloat(byId('time-since-action-weight')?.value) || 0.3,
            contextRelevance: parseFloat(byId('context-relevance-weight')?.value) || 0.2,
            userActivity: parseFloat(byId('user-activity-weight')?.value) || 0.1
        },
        probabilityThresholds: {
            chat_reply: parseFloat(byId('chat-reply-threshold')?.value) || 0.6,
            moment_post: parseFloat(byId('moment-post-threshold')?.value) || 0.8,
            moment_comment: parseFloat(byId('moment-comment-threshold')?.value) || 0.7,
            moment_like: parseFloat(byId('moment-like-threshold')?.value) || 0.5,
            proactive_chat: parseFloat(byId('proactive-chat-threshold')?.value) || 0.9
        }
    };
}

/**
 * 填充配置表单
 * @param {Object} config 配置数据
 */
function populateConfigForm(config) {
    // 填充基本开关
    const enabledCheckbox = byId('behavior-enabled');
    if (enabledCheckbox) {
        enabledCheckbox.checked = config.enabled;
    }
    
    // 填充频率设置
    if (config.frequencies) {
        updateSlider('chat-reply-freq', 'chat-reply-freq-value', config.frequencies.chatReply, 'x');
        updateSlider('moment-activity', 'moment-activity-value', config.frequencies.momentActivity, 'x');
        updateSlider('proactive-chat', 'proactive-chat-value', config.frequencies.proactiveChat, '%', 100);
    }
    
    // 填充冷却时间设置
    if (config.cooldowns) {
        updateInput('chat-cooldown', Math.round(config.cooldowns.chat_reply / (60 * 1000)));
        updateInput('moment-post-cooldown', Math.round(config.cooldowns.moment_post / (60 * 1000)));
        updateInput('moment-comment-cooldown', Math.round(config.cooldowns.moment_comment / (60 * 1000)));
        updateInput('moment-like-cooldown', Math.round(config.cooldowns.moment_like / (60 * 1000)));
        updateInput('proactive-cooldown', Math.round(config.cooldowns.proactive_chat / (60 * 1000)));
    }
    
    // 填充权重设置
    if (config.scoreWeights) {
        updateSlider('interaction-frequency-weight', 'interaction-frequency-weight-value', config.scoreWeights.interactionFrequency);
        updateSlider('time-since-action-weight', 'time-since-action-weight-value', config.scoreWeights.timeSinceLastAction);
        updateSlider('context-relevance-weight', 'context-relevance-weight-value', config.scoreWeights.contextRelevance);
        updateSlider('user-activity-weight', 'user-activity-weight-value', config.scoreWeights.userActivity);
    }
    
    // 填充概率阈值设置
    if (config.probabilityThresholds) {
        updateSlider('chat-reply-threshold', 'chat-reply-threshold-value', config.probabilityThresholds.chat_reply, '%', 100);
        updateSlider('moment-post-threshold', 'moment-post-threshold-value', config.probabilityThresholds.moment_post, '%', 100);
        updateSlider('moment-comment-threshold', 'moment-comment-threshold-value', config.probabilityThresholds.moment_comment, '%', 100);
        updateSlider('moment-like-threshold', 'moment-like-threshold-value', config.probabilityThresholds.moment_like, '%', 100);
        updateSlider('proactive-chat-threshold', 'proactive-chat-threshold-value', config.probabilityThresholds.proactive_chat, '%', 100);
    }
}

/**
 * 更新滑块值
 * @param {string} sliderId 滑块ID
 * @param {string} displayId 显示元素ID
 * @param {number} value 值
 * @param {string} suffix 后缀
 * @param {number} multiplier 倍数
 */
function updateSlider(sliderId, displayId, value, suffix = '', multiplier = 1) {
    const slider = byId(sliderId);
    const display = byId(displayId);
    
    if (slider) {
        slider.value = value;
    }
    
    if (display) {
        const displayValue = (value * multiplier).toFixed(multiplier === 100 ? 0 : 1);
        display.textContent = `${displayValue}${suffix}`;
    }
}

/**
 * 更新输入框值
 * @param {string} inputId 输入框ID
 * @param {number} value 值
 */
function updateInput(inputId, value) {
    const input = byId(inputId);
    if (input) {
        input.value = value;
    }
}

/**
 * 显示行为统计数据
 * @param {Object} stats 统计数据
 */
function displayBehaviorStats(stats) {
    // 更新总体统计
    updateElement('behavior-total-actions', stats.totalActions || 0);
    updateElement('behavior-avg-score', ((stats.avgScore || 0) * 100).toFixed(1) + '%');
    updateElement('behavior-most-active', stats.mostActiveAction || '暂无');
    updateElement('behavior-activity-trend', getActivityTrendText(stats.activityTrend));
    
    // 更新行为类型统计
    if (stats.actionStats && stats.actionStats.actionCounts) {
        Object.entries(stats.actionStats.actionCounts).forEach(([actionType, count]) => {
            updateElement(`stat-${actionType.replace('_', '-')}`, count);
        });
    }
    
    // 更新最近评分图表（如果有图表容器）
    if (stats.recentScores && stats.recentScores.length > 0) {
        displayScoreChart(stats.recentScores);
    }
}

/**
 * 显示测试结果
 * @param {string} type 测试类型
 * @param {Object} result 测试结果
 */
function displayTestResults(type, result) {
    const testResultContainer = byId('test-results');
    if (!testResultContainer) return;
    
    let html = '';
    
    if (type === 'score') {
        html = `
            <div class="test-result-item">
                <h4>🎯 行为评分测试结果</h4>
                <div class="result-score">
                    <span class="score-value">${(result.score * 100).toFixed(1)}%</span>
                    <span class="score-label">综合评分</span>
                </div>
                <div class="result-breakdown">
                    <h5>评分细节：</h5>
                    <ul>
                        <li>互动频率评分: ${(result.breakdown.interactionScore * 100).toFixed(1)}%</li>
                        <li>时间因子评分: ${(result.breakdown.timeScore * 100).toFixed(1)}%</li>
                        <li>情境相关性评分: ${(result.breakdown.contextScore * 100).toFixed(1)}%</li>
                        <li>用户活跃度评分: ${(result.breakdown.activityScore * 100).toFixed(1)}%</li>
                    </ul>
                </div>
            </div>
        `;
    } else if (type === 'probability') {
        html = `
            <div class="test-result-item">
                <h4>🎲 行为概率测试结果</h4>
                <div class="result-probability">
                    <span class="probability-value">${(result.probability * 100).toFixed(1)}%</span>
                    <span class="probability-label">执行概率</span>
                </div>
                <div class="result-details">
                    <p><strong>行为类型:</strong> ${result.actionType}</p>
                    <p><strong>概率阈值:</strong> ${(result.threshold * 100).toFixed(1)}%</p>
                    <p><strong>是否应执行:</strong> ${result.shouldExecute ? '是' : '否'}</p>
                </div>
                <div class="result-factors">
                    <h5>影响因子：</h5>
                    <ul>
                        <li>基础行为评分: ${(result.factors.behaviorScore * 100).toFixed(1)}%</li>
                        <li>频率倍数: ${result.factors.frequencyMultiplier.toFixed(2)}</li>
                        <li>时间评分: ${(result.factors.timeScore * 100).toFixed(1)}%</li>
                        <li>情境修正: ${result.factors.contextModifier.toFixed(2)}</li>
                    </ul>
                </div>
            </div>
        `;
    }
    
    testResultContainer.innerHTML = html;
    testResultContainer.style.display = 'block';
    
    // 滚动到测试结果
    testResultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * 显示评分图表
 * @param {Array} scores 评分数据
 */
function displayScoreChart(scores) {
    // 这里可以使用Chart.js或其他图表库
    // 暂时用简单的文本显示
    const chartContainer = byId('behavior-score-chart');
    if (chartContainer) {
        const recentScores = scores.slice(0, 5);
        const html = recentScores.map(score => `
            <div class="score-item">
                <span class="score-time">${formatRelativeTime(score.timestamp)}</span>
                <span class="score-value">${(score.score * 100).toFixed(1)}%</span>
            </div>
        `).join('');
        
        chartContainer.innerHTML = `
            <h5>最近评分记录</h5>
            <div class="score-list">${html}</div>
        `;
    }
}

// ===== 辅助函数 =====

/**
 * 切换配置选项卡
 * @param {string} tabName 选项卡名称
 */
function switchConfigTab(tabName) {
    // 切换选项卡激活状态
    const tabs = document.querySelectorAll('.config-tab');
    tabs.forEach(tab => {
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    // 切换面板显示状态
    const panels = document.querySelectorAll('.config-panel');
    panels.forEach(panel => {
        if (panel.id === `${tabName}-config`) {
            panel.classList.add('active');
        } else {
            panel.classList.remove('active');
        }
    });
}

/**
 * 更新元素内容
 * @param {string} elementId 元素ID
 * @param {any} value 值
 */
function updateElement(elementId, value) {
    const element = byId(elementId);
    if (element) {
        element.textContent = value;
    }
}

/**
 * 获取活跃度趋势文本
 * @param {string} trend 趋势
 * @returns {string} 趋势文本
 */
function getActivityTrendText(trend) {
    const trendTexts = {
        increasing: '📈 上升',
        decreasing: '📉 下降',
        stable: '📊 稳定',
        insufficient_data: '❓ 数据不足'
    };
    return trendTexts[trend] || '未知';
}

/**
 * 显示加载状态
 */
function showLoadingState() {
    const loadingElement = byId('behavior-settings-loading');
    if (loadingElement) {
        loadingElement.style.display = 'flex';
    }
}

/**
 * 隐藏加载状态
 */
function hideLoadingState() {
    const loadingElement = byId('behavior-settings-loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

// 函数已在定义时直接导出