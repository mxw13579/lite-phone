// 壁纸屏幕模块 - screens/wallpaper.js
// 处理壁纸预览、上传、保存和应用功能

// 当前新壁纸的base64数据
let newWallpaperBase64 = null;

// 渲染壁纸屏幕
export function renderWallpaperScreen() {
    const preview = document.getElementById('wallpaper-preview');
    const state = window.STATE?.state;
    
    if (!preview || !state) {
        console.error('壁纸渲染：缺少必要的元素或状态');
        return;
    }
    
    // 显示当前壁纸或新上传的壁纸
    const bg = newWallpaperBase64 || state.globalSettings.wallpaper;
    
    if (bg && bg.startsWith('data:image')) {
        preview.style.backgroundImage = `url(${bg})`;
        preview.textContent = '';
    } else if (bg) {
        preview.style.backgroundImage = bg;
        preview.textContent = '当前为渐变色';
    } else {
        preview.style.backgroundImage = 'linear-gradient(135deg, #89f7fe, #66a6ff)';
        preview.textContent = '默认渐变背景';
    }
    
    console.log('壁纸屏幕已渲染');
}

// 处理壁纸上传
export async function handleWallpaperUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
        
        // 保存新壁纸数据
        newWallpaperBase64 = dataUrl;
        
        // 重新渲染预览
        renderWallpaperScreen();
        
        console.log('壁纸上传成功，已更新预览');
    } catch (error) {
        console.error('壁纸上传失败:', error);
        alert('上传失败，请重试');
    }
}

// 保存并应用壁纸
export async function saveWallpaper() {
    if (!newWallpaperBase64) {
        alert('请先上传一张新壁纸。');
        return;
    }
    
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db) {
        console.error('保存壁纸失败：状态或数据库不可用');
        return;
    }
    
    try {
        // 保存壁纸到全局设置
        state.globalSettings.wallpaper = newWallpaperBase64;
        await db.globalSettings.put(state.globalSettings);
        
        // 应用壁纸到主屏幕
        applyGlobalWallpaper();
        
        // 清除临时数据
        newWallpaperBase64 = null;
        
        alert('壁纸已保存并应用！');
        
        // 返回主屏幕
        if (window.showScreen) {
            window.showScreen('home-screen');
        }
        
        console.log('壁纸已保存并应用');
    } catch (error) {
        console.error('保存壁纸失败:', error);
        alert('保存失败，请重试');
    }
}

// 应用全局壁纸到主屏幕
export function applyGlobalWallpaper() {
    const homeScreen = document.getElementById('home-screen');
    const state = window.STATE?.state;
    
    if (!homeScreen || !state) return;
    
    const wallpaper = state.globalSettings.wallpaper;
    
    if (wallpaper && wallpaper.startsWith('data:image')) {
        // Base64图片壁纸
        homeScreen.style.backgroundImage = `url(${wallpaper})`;
    } else if (wallpaper) {
        // CSS渐变或其他样式
        homeScreen.style.backgroundImage = wallpaper;
    } else {
        // 默认渐变背景
        homeScreen.style.backgroundImage = 'linear-gradient(135deg, #89f7fe, #66a6ff)';
    }
    
    console.log('全局壁纸已应用');
}

// 重置壁纸为默认
export async function resetWallpaper() {
    const state = window.STATE?.state;
    const db = window.DB?.db;
    
    if (!state || !db) return;
    
    const confirmed = confirm('确定要重置为默认壁纸吗？');
    if (!confirmed) return;
    
    try {
        // 重置为默认渐变
        const defaultWallpaper = 'linear-gradient(135deg, #89f7fe, #66a6ff)';
        state.globalSettings.wallpaper = defaultWallpaper;
        await db.globalSettings.put(state.globalSettings);
        
        // 清除临时数据
        newWallpaperBase64 = null;
        
        // 应用默认壁纸
        applyGlobalWallpaper();
        
        // 重新渲染预览
        renderWallpaperScreen();
        
        alert('已重置为默认壁纸');
        console.log('壁纸已重置为默认');
    } catch (error) {
        console.error('重置壁纸失败:', error);
        alert('重置失败，请重试');
    }
}

// 获取当前壁纸信息
export function getCurrentWallpaperInfo() {
    const state = window.STATE?.state;
    if (!state) return null;
    
    const wallpaper = state.globalSettings.wallpaper;
    const isImage = wallpaper && wallpaper.startsWith('data:image');
    const isGradient = wallpaper && wallpaper.startsWith('linear-gradient');
    
    return {
        wallpaper,
        isImage,
        isGradient,
        hasNewWallpaper: !!newWallpaperBase64
    };
}

// 清除临时壁纸数据
export function clearTempWallpaper() {
    newWallpaperBase64 = null;
    console.log('临时壁纸数据已清除');
}

// 预览临时壁纸（不保存）
export function previewTempWallpaper() {
    if (newWallpaperBase64) {
        const homeScreen = document.getElementById('home-screen');
        if (homeScreen) {
            homeScreen.style.backgroundImage = `url(${newWallpaperBase64})`;
        }
    }
}

// 取消预览，恢复原壁纸
export function cancelPreview() {
    applyGlobalWallpaper();
}

// 初始化壁纸模块事件监听器
export function initWallpaperListeners() {
    // 壁纸上传输入框
    const uploadInput = document.getElementById('wallpaper-upload-input');
    if (uploadInput) {
        uploadInput.addEventListener('change', handleWallpaperUpload);
    }
    
    // 保存壁纸按钮
    const saveBtn = document.getElementById('save-wallpaper-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveWallpaper);
    }
    
    // 重置壁纸按钮（如果存在）
    const resetBtn = document.getElementById('reset-wallpaper-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetWallpaper);
    }
    
    // 预览按钮（如果存在）
    const previewBtn = document.getElementById('preview-wallpaper-btn');
    if (previewBtn) {
        previewBtn.addEventListener('click', previewTempWallpaper);
    }
    
    // 取消预览按钮（如果存在）
    const cancelBtn = document.getElementById('cancel-preview-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', cancelPreview);
    }
    
    console.log('壁纸模块事件监听器已初始化');
}

// 初始化壁纸模块（在应用启动时调用）
export async function initWallpaperModule() {
    // 确保默认壁纸设置存在
    const state = window.STATE?.state;
    if (state && !state.globalSettings.wallpaper) {
        state.globalSettings.wallpaper = 'linear-gradient(135deg, #89f7fe, #66a6ff)';
    }
    
    // 应用当前壁纸
    applyGlobalWallpaper();
    
    console.log('壁纸模块数据初始化完成');
}