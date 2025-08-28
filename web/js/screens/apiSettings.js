// API设置屏幕模块 - screens/apiSettings.js
// 处理API配置、地理位置、主题设置等功能

// 渲染API设置屏幕
export function renderApiSettingsScreen() {
    const state = window.STATE?.state;
    if (!state) {
        console.error('API设置渲染：状态管理模块未初始化');
        return;
    }
    
    // 填充API配置信息
    document.getElementById('proxy-url').value = state.apiConfig.proxyUrl || '';
    document.getElementById('api-key').value = state.apiConfig.apiKey || '';
    
    // 设置地理位置开关状态
    const geoToggle = document.getElementById('geolocation-toggle');
    if (geoToggle) {
        geoToggle.checked = state.globalSettings.enableGeolocation || false;
    }
    
    // 设置远程主题URL
    document.getElementById('remote-theme-url').value = state.globalSettings.remoteThemeUrl || '';
    
    console.log('API设置屏幕已渲染');
}

// 保存API设置
export async function saveApiSettings() {
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db) {
        console.error('保存API设置失败：状态或数据库不可用');
        return;
    }
    
    try {
        // 获取表单数据
        state.apiConfig.proxyUrl = document.getElementById('proxy-url').value.trim();
        state.apiConfig.apiKey = document.getElementById('api-key').value.trim();
        state.apiConfig.model = document.getElementById('model-select').value;
        
        // 保存到数据库
        await db.apiConfig.put(state.apiConfig);
        
        alert('API设置已保存!');
        console.log('API设置已保存');
    } catch (error) {
        console.error('保存API设置失败:', error);
        alert('保存失败，请重试');
    }
}

// 获取可用模型列表
export async function fetchModels() {
    let url = document.getElementById('proxy-url').value.trim();
    const key = document.getElementById('api-key').value.trim();
    
    if (!url || !key) {
        alert('请先填写反代地址和密钥');
        return;
    }

    // 处理URL格式
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    if (url.endsWith('/v1')) {
        url = url.slice(0, -3);
    }

    try {
        const response = await fetch(`${url}/v1/models`, {
            headers: { 'Authorization': `Bearer ${key}` }
        });
        
        if (!response.ok) {
            throw new Error('无法获取模型列表');
        }
        
        const data = await response.json();
        const modelSelect = document.getElementById('model-select');
        const state = window.STATE?.state;
        
        // 清空现有选项
        modelSelect.innerHTML = '';
        
        // 添加模型选项
        data.data.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            
            // 保持当前选中状态
            if (model.id === state?.apiConfig?.model) {
                option.selected = true;
            }
            
            modelSelect.appendChild(option);
        });
        
        alert('模型列表已更新');
        console.log('模型列表更新完成，共', data.data.length, '个模型');
    } catch (error) {
        console.error('拉取模型失败:', error);
        alert(`拉取模型失败: ${error.message}`);
    }
}

// 更新地理位置设置
export async function updateGeolocationSetting(enabled) {
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db) return;
    
    try {
        state.globalSettings.enableGeolocation = enabled;
        await db.globalSettings.put(state.globalSettings);
        
        // 立即更新地理位置
        await updateGeolocation();
        
        console.log('地理位置设置已更新:', enabled);
    } catch (error) {
        console.error('更新地理位置设置失败:', error);
    }
}

// 地理位置获取函数
async function updateGeolocation() {
    const state = window.STATE?.state;
    if (!state) return;
    
    const toggle = document.getElementById('geolocation-toggle');
    let myAddress = window.STATE?.myAddress || '位置未知';
    
    if (!state.globalSettings.enableGeolocation) {
        myAddress = '位置未知';
        if (toggle) toggle.checked = false;
        
        // 更新全局地址
        if (window.STATE?.setMyAddress) {
            window.STATE.setMyAddress(myAddress);
        }
        return;
    }
    
    if (toggle) toggle.checked = true;

    try {
        // 使用ipinfo.io获取地理位置
        const geoResponse = await fetch(`https://ipinfo.io/json`);
        if (!geoResponse.ok) throw new Error('ipinfo.io request failed');
        
        const geoData = await geoResponse.json();

        if (geoData.city && geoData.region) {
            myAddress = `${geoData.country}, ${geoData.region}, ${geoData.city}`;
        } else {
            throw new Error('无法从ipinfo.io获取地理位置');
        }
    } catch (error) {
        console.error('Geolocation Error:', error);
        myAddress = '位置获取失败';
    }
    
    // 更新全局地址
    if (window.STATE?.setMyAddress) {
        window.STATE.setMyAddress(myAddress);
    }
}

// 主题相关函数
export async function applyRemoteTheme() {
    const url = document.getElementById('remote-theme-url').value.trim();
    if (!url) {
        alert('请输入远程主题的CSS URL！');
        return;
    }
    
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db) return;
    
    try {
        // 应用主题
        switchStylesheet(url);
        
        // 保存设置
        state.globalSettings.remoteThemeUrl = url;
        await db.globalSettings.put(state.globalSettings);
        
        if (window.showCustomAlert) {
            await window.showCustomAlert("主题已更新", "远程主题已应用并保存。");
        } else {
            alert("主题已更新");
        }
        
        console.log('远程主题已应用:', url);
    } catch (error) {
        console.error('应用远程主题失败:', error);
        alert('应用主题失败，请检查URL是否有效');
    }
}

export async function resetThemeToDefault() {
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db) return;
    
    try {
        // 清空主题URL输入框
        document.getElementById('remote-theme-url').value = '';
        document.getElementById('remote-theme-library-url').value = '';
        
        // 重置为默认样式
        switchStylesheet('');
        
        // 保存设置
        state.globalSettings.remoteThemeUrl = '';
        await db.globalSettings.put(state.globalSettings);
        
        if (window.showCustomAlert) {
            await window.showCustomAlert("主题已重置", "已恢复为默认主题。");
        } else {
            alert("主题已重置");
        }
        
        console.log('主题已重置为默认');
    } catch (error) {
        console.error('重置主题失败:', error);
        alert('重置主题失败，请重试');
    }
}

export async function loadRemoteThemeLibrary() {
    const libraryUrl = document.getElementById('remote-theme-library-url').value.trim();
    if (!libraryUrl) {
        alert('请输入远程主题库的URL！');
        return;
    }
    
    // 调用全局的主题列表模态框函数
    if (window.openThemeListModal) {
        window.openThemeListModal(libraryUrl, '选择远程主题');
    } else {
        alert('主题库功能不可用');
    }
}

export async function loadBuiltinThemes() {
    const builtinThemeListUrl = 'https://fastly.jsdelivr.net/gh/mxw13579/phone@release-v1.0.0.7/myPhone/themeList.json';
    
    // 调用全局的主题列表模态框函数
    if (window.openThemeListModal) {
        window.openThemeListModal(builtinThemeListUrl, '选择内置主题');
    } else {
        alert('内置主题功能不可用');
    }
}

// 切换样式表函数
function switchStylesheet(url) {
    const stylesheet = document.getElementById('main-stylesheet');
    if (stylesheet) {
        if (url && url.trim() !== '') {
            stylesheet.href = url + '?v=' + Date.now();
        } else {
            stylesheet.href = './unified-style.css';
        }
    }
}

// 初始化API设置模块事件监听器
export function initApiSettingsListeners() {
    // 保存API设置按钮
    const saveBtn = document.getElementById('save-api-settings-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveApiSettings);
    }
    
    // 获取模型列表按钮
    const fetchBtn = document.getElementById('fetch-models-btn');
    if (fetchBtn) {
        fetchBtn.addEventListener('click', fetchModels);
    }
    
    // 地理位置开关
    const geoToggle = document.getElementById('geolocation-toggle');
    if (geoToggle) {
        geoToggle.addEventListener('change', async (e) => {
            await updateGeolocationSetting(e.target.checked);
        });
    }
    
    // 远程主题相关按钮
    const applyThemeBtn = document.getElementById('apply-remote-theme-btn');
    if (applyThemeBtn) {
        applyThemeBtn.addEventListener('click', applyRemoteTheme);
    }
    
    const resetThemeBtn = document.getElementById('reset-remote-theme-btn');
    if (resetThemeBtn) {
        resetThemeBtn.addEventListener('click', resetThemeToDefault);
    }
    
    const loadRemoteBtn = document.getElementById('load-remote-library-btn');
    if (loadRemoteBtn) {
        loadRemoteBtn.addEventListener('click', loadRemoteThemeLibrary);
    }
    
    const loadBuiltinBtn = document.getElementById('open-builtin-themes-btn');
    if (loadBuiltinBtn) {
        loadBuiltinBtn.addEventListener('click', loadBuiltinThemes);
    }
    
    console.log('API设置模块事件监听器已初始化');
}

// 初始化API设置模块数据（在应用启动时调用）
export async function initApiSettingsModule() {
    // 在初始化时获取一次地理位置
    await updateGeolocation();
    console.log('API设置模块数据初始化完成');
}