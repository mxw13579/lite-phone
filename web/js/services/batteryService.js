/**
 * 电池管理服务模块 - services/batteryService.js
 * 提供电池状态监控、电量显示更新、低电量提醒等功能
 * 
 * 主要功能：
 * - 电池电量监控
 * - 低电量分级提醒（40%、20%、10%）
 * - 充电状态检测
 * - 电池显示UI更新
 * 
 * @module BatteryService
 * @version 1.0.0
 */

let lastKnownBatteryLevel = 1;
let alertFlags = {hasShown40: false, hasShown20: false, hasShown10: false};
let batteryAlertTimeout;

// 显示电池提醒
export function showBatteryAlert(imageUrl, text) {
    clearTimeout(batteryAlertTimeout);
    
    const batteryAlertModal = document.getElementById('battery-alert-modal');
    const batteryAlertImage = document.getElementById('battery-alert-image');
    const batteryAlertText = document.getElementById('battery-alert-text');
    
    if (!batteryAlertModal || !batteryAlertImage || !batteryAlertText) {
        console.warn('电池提醒元素不存在');
        return;
    }
    
    batteryAlertImage.src = imageUrl;
    batteryAlertText.textContent = text;
    batteryAlertModal.classList.add('visible');
    
    const closeAlert = () => {
        batteryAlertModal.classList.remove('visible');
        batteryAlertModal.removeEventListener('click', closeAlert);
    };
    
    batteryAlertModal.addEventListener('click', closeAlert);
    batteryAlertTimeout = setTimeout(closeAlert, 2000);
}

// 更新电池显示
export function updateBatteryDisplay(battery) {
    const batteryContainer = document.getElementById('status-bar-battery');
    if (!batteryContainer) return;
    
    const batteryLevelEl = batteryContainer.querySelector('.battery-level');
    const batteryTextEl = batteryContainer.querySelector('.battery-text');
    
    if (!batteryLevelEl || !batteryTextEl) return;
    
    const level = Math.floor(battery.level * 100);
    batteryLevelEl.style.width = `${level}%`;
    batteryTextEl.textContent = `${level}%`;
    
    if (battery.charging) {
        batteryContainer.classList.add('charging');
    } else {
        batteryContainer.classList.remove('charging');
    }
}

// 处理电池状态变化
export function handleBatteryChange(battery) {
    updateBatteryDisplay(battery);
    const level = battery.level;
    
    if (!battery.charging) {
        if (level <= 0.4 && lastKnownBatteryLevel > 0.4 && !alertFlags.hasShown40) {
            showBatteryAlert('https://i.postimg.cc/T2yKJ0DV/40.jpg', '有点饿了，可以去找充电器惹');
            alertFlags.hasShown40 = true;
        }
        if (level <= 0.2 && lastKnownBatteryLevel > 0.2 && !alertFlags.hasShown20) {
            showBatteryAlert('https://i.postimg.cc/qB9zbKs9/20.jpg', '赶紧的充电，要饿死了');
            alertFlags.hasShown20 = true;
        }
        if (level <= 0.1 && lastKnownBatteryLevel > 0.1 && !alertFlags.hasShown10) {
            showBatteryAlert('https://i.postimg.cc/ThMMVfW4/10.jpg', '已阵亡，还有30秒爆炸');
            alertFlags.hasShown10 = true;
        }
    }
    
    // 重置提醒标志
    if (level > 0.4) alertFlags.hasShown40 = false;
    if (level > 0.2) alertFlags.hasShown20 = false;
    if (level > 0.1) alertFlags.hasShown10 = false;
    
    lastKnownBatteryLevel = level;
}

// 初始化电池管理器
export async function initBatteryManager() {
    if ('getBattery' in navigator) {
        try {
            const battery = await navigator.getBattery();
            lastKnownBatteryLevel = battery.level;
            handleBatteryChange(battery);
            
            battery.addEventListener('levelchange', () => handleBatteryChange(battery));
            battery.addEventListener('chargingchange', () => {
                handleBatteryChange(battery);
                if (battery.charging) {
                    showBatteryAlert('https://i.postimg.cc/3NDQ0dWG/image.jpg', '窝爱泥，电量吃饱饱');
                }
            });
            
            console.log('电池管理器初始化成功');
        } catch (err) {
            console.error("无法获取电池信息:", err);
            const batteryText = document.querySelector('.battery-text');
            if (batteryText) {
                batteryText.textContent = 'ᗜωᗜ';
            }
        }
    } else {
        console.log("浏览器不支持电池状态API。");
        const batteryText = document.querySelector('.battery-text');
        if (batteryText) {
            batteryText.textContent = 'ᗜωᗜ';
        }
    }
}

// 获取当前电池状态信息
export function getBatteryStatus() {
    return {
        lastKnownLevel: lastKnownBatteryLevel,
        alertFlags: {...alertFlags}
    };
}

console.log('电池管理服务模块已初始化');