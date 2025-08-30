// 电池管理服务 - 电池状态监控和事件处理
// 从services/index.ts中提取的BatteryService类

// === 类型定义 ===
interface BatteryInfo {
  level: number;
  charging: boolean;
}

export class BatteryService {
  private lastKnownBatteryLevel = 1;
  private alertFlags = {hasShown40: false, hasShown20: false, hasShown10: false};
  private batteryAlertTimeout: number | null = null;

  // 显示电池提醒
  showBatteryAlert(imageUrl: string, text: string): void {
    if (this.batteryAlertTimeout) {
      clearTimeout(this.batteryAlertTimeout);
    }
    
    const batteryAlertModal = document.getElementById('battery-alert-modal');
    const batteryAlertImage = document.getElementById('battery-alert-image') as HTMLImageElement;
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
    this.batteryAlertTimeout = window.setTimeout(closeAlert, 2000);
  }

  // 更新电池显示
  updateBatteryDisplay(battery: BatteryInfo): void {
    const batteryContainer = document.getElementById('status-bar-battery');
    if (!batteryContainer) return;
    
    const batteryLevelEl = batteryContainer.querySelector('.battery-level') as HTMLElement;
    const batteryTextEl = batteryContainer.querySelector('.battery-text') as HTMLElement;
    
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
  handleBatteryChange(battery: BatteryInfo): void {
    this.updateBatteryDisplay(battery);
    const level = battery.level;
    
    if (!battery.charging) {
      if (level <= 0.4 && this.lastKnownBatteryLevel > 0.4 && !this.alertFlags.hasShown40) {
        this.showBatteryAlert('https://i.postimg.cc/T2yKJ0DV/40.jpg', '有点饿了，可以去找充电器惹');
        this.alertFlags.hasShown40 = true;
      }
      if (level <= 0.2 && this.lastKnownBatteryLevel > 0.2 && !this.alertFlags.hasShown20) {
        this.showBatteryAlert('https://i.postimg.cc/qB9zbKs9/20.jpg', '赶紧的充电，要饿死了');
        this.alertFlags.hasShown20 = true;
      }
      if (level <= 0.1 && this.lastKnownBatteryLevel > 0.1 && !this.alertFlags.hasShown10) {
        this.showBatteryAlert('https://i.postimg.cc/ThMMVfW4/10.jpg', '已阵亡，还有30秒爆炸');
        this.alertFlags.hasShown10 = true;
      }
    }
    
    // 重置提醒标志
    if (level > 0.4) this.alertFlags.hasShown40 = false;
    if (level > 0.2) this.alertFlags.hasShown20 = false;
    if (level > 0.1) this.alertFlags.hasShown10 = false;
    
    this.lastKnownBatteryLevel = level;
  }

  // 初始化电池管理器
  async initBatteryManager(): Promise<void> {
    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        this.lastKnownBatteryLevel = battery.level;
        this.handleBatteryChange(battery);
        
        battery.addEventListener('levelchange', () => this.handleBatteryChange(battery));
        battery.addEventListener('chargingchange', () => {
          this.handleBatteryChange(battery);
          if (battery.charging) {
            this.showBatteryAlert('https://i.postimg.cc/3NDQ0dWG/image.jpg', '窝爱泥，电量吃饱饱');
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
  getBatteryStatus() {
    return {
      lastKnownLevel: this.lastKnownBatteryLevel,
      alertFlags: {...this.alertFlags}
    };
  }
}

// 导出服务实例
export const batteryService = new BatteryService();