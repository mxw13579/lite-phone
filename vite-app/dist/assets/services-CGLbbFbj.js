class UIUtilsService {
  constructor() {
    this.modalResolve = null;
    this.notificationTimeout = null;
  }
  // 显示自定义模态框
  showCustomModal() {
    const modalOverlay = document.getElementById("custom-modal-overlay");
    if (modalOverlay) {
      modalOverlay.classList.add("visible");
    }
  }
  hideCustomModal() {
    const modalOverlay = document.getElementById("custom-modal-overlay");
    const modalConfirmBtn = document.getElementById("custom-modal-confirm");
    if (modalOverlay) {
      modalOverlay.classList.remove("visible");
    }
    if (modalConfirmBtn) {
      modalConfirmBtn.classList.remove("btn-danger");
    }
    if (this.modalResolve) {
      this.modalResolve(null);
    }
  }
  // 显示确认对话框
  showCustomConfirm(title, message, options = {}) {
    return new Promise((resolve) => {
      this.modalResolve = resolve;
      const modalTitle = document.getElementById("custom-modal-title");
      const modalBody = document.getElementById("custom-modal-body");
      const modalCancelBtn = document.getElementById("custom-modal-cancel");
      const modalConfirmBtn = document.getElementById("custom-modal-confirm");
      if (!modalTitle || !modalBody || !modalCancelBtn || !modalConfirmBtn) {
        console.error("Modal elements not found");
        resolve(false);
        return;
      }
      modalTitle.textContent = title;
      modalBody.innerHTML = `<p>${message}</p>`;
      modalCancelBtn.style.display = "block";
      modalConfirmBtn.textContent = options.confirmText || "确定";
      if (options.confirmButtonClass) {
        modalConfirmBtn.classList.add(options.confirmButtonClass);
      }
      modalConfirmBtn.onclick = () => {
        resolve(true);
        this.hideCustomModal();
      };
      modalCancelBtn.onclick = () => {
        resolve(false);
        this.hideCustomModal();
      };
      this.showCustomModal();
    });
  }
  showCustomAlert(title, message) {
    return new Promise((resolve) => {
      this.modalResolve = resolve;
      const modalTitle = document.getElementById("custom-modal-title");
      const modalBody = document.getElementById("custom-modal-body");
      const modalCancelBtn = document.getElementById("custom-modal-cancel");
      const modalConfirmBtn = document.getElementById("custom-modal-confirm");
      if (!modalTitle || !modalBody || !modalCancelBtn || !modalConfirmBtn) {
        console.error("Modal elements not found");
        resolve(true);
        return;
      }
      modalTitle.textContent = title;
      modalBody.innerHTML = `<p style="text-align: left; white-space: pre-wrap;">${message}</p>`;
      modalCancelBtn.style.display = "none";
      modalConfirmBtn.textContent = "好的";
      modalConfirmBtn.onclick = () => {
        modalCancelBtn.style.display = "block";
        modalConfirmBtn.textContent = "确定";
        resolve(true);
        this.hideCustomModal();
      };
      this.showCustomModal();
    });
  }
  showCustomPrompt(title, placeholder, initialValue = "", type = "text") {
    return new Promise((resolve) => {
      this.modalResolve = resolve;
      const modalTitle = document.getElementById("custom-modal-title");
      const modalBody = document.getElementById("custom-modal-body");
      const modalConfirmBtn = document.getElementById("custom-modal-confirm");
      const modalCancelBtn = document.getElementById("custom-modal-cancel");
      if (!modalTitle || !modalBody || !modalConfirmBtn || !modalCancelBtn) {
        console.error("Modal elements not found");
        resolve(null);
        return;
      }
      modalTitle.textContent = title;
      modalBody.innerHTML = `<input type="${type}" id="custom-prompt-input" placeholder="${placeholder}" value="${initialValue}">`;
      const input = document.getElementById("custom-prompt-input");
      modalConfirmBtn.textContent = "确定";
      modalConfirmBtn.onclick = () => {
        resolve(input ? input.value : null);
        this.hideCustomModal();
      };
      modalCancelBtn.onclick = () => {
        resolve(null);
        this.hideCustomModal();
      };
      this.showCustomModal();
      setTimeout(() => {
        if (input) input.focus();
      }, 100);
    });
  }
  // 通知管理
  showNotification(chatId, messageContent) {
    const win = window;
    const state = win.STATE;
    if (!state?.state || !state.state.chats[chatId]) return;
    if (this.notificationTimeout) {
      clearTimeout(this.notificationTimeout);
    }
    const chat = state.state.chats[chatId];
    const bar = document.getElementById("notification-bar");
    if (!bar) return;
    const avatar = document.getElementById("notification-avatar");
    const nameEl = document.getElementById("notification-content")?.querySelector(".name");
    const messageEl = document.getElementById("notification-content")?.querySelector(".message");
    if (avatar) {
      const constants = win.CONSTANTS;
      const defaultAvatar = constants?.DEFAULT_AVATAR || "https://i.postimg.cc/PxZrFFFL/o-o-1.jpg";
      avatar.src = chat.settings.aiAvatar || chat.settings.groupAvatar || defaultAvatar;
    }
    if (nameEl) nameEl.textContent = chat.name;
    if (messageEl) messageEl.textContent = messageContent;
    const newBar = bar.cloneNode(true);
    bar.parentNode?.replaceChild(newBar, bar);
    newBar.addEventListener("click", () => {
      const chatModule = win.ChatModule;
      if (chatModule?.openChat) {
        chatModule.openChat(chatId);
      }
      newBar.classList.remove("visible");
    });
    newBar.classList.add("visible");
    this.notificationTimeout = window.setTimeout(() => {
      newBar.classList.remove("visible");
    }, 4e3);
  }
  // 时钟管理
  updateClock() {
    const now = /* @__PURE__ */ new Date();
    const timeString = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
    const dateString = now.toLocaleDateString("zh-CN", { weekday: "long", month: "long", day: "numeric" });
    const mainTime = document.getElementById("main-time");
    const statusBarTime = document.getElementById("status-bar-time");
    const mainDate = document.getElementById("main-date");
    if (mainTime) mainTime.textContent = timeString;
    if (statusBarTime) statusBarTime.textContent = timeString;
    if (mainDate) mainDate.textContent = dateString;
  }
  // 初始化时钟（定期更新）
  initClock() {
    this.updateClock();
    setInterval(() => this.updateClock(), 1e3 * 30);
  }
  // 主题列表模态框管理
  closeThemeListModal() {
    const themeListModal = document.getElementById("theme-list-modal");
    const themeListContainer = document.getElementById("theme-list-container");
    if (themeListModal) {
      themeListModal.classList.remove("visible");
    }
    if (themeListContainer) {
      themeListContainer.innerHTML = "";
    }
  }
  async openThemeListModal(jsonUrl, title) {
    const themeListModal = document.getElementById("theme-list-modal");
    const themeListModalTitle = document.getElementById("theme-list-modal-title");
    const themeListContainer = document.getElementById("theme-list-container");
    if (!themeListModal || !themeListContainer) return;
    if (themeListModalTitle) {
      themeListModalTitle.textContent = title;
    }
    themeListModal.classList.add("visible");
    themeListContainer.innerHTML = "<p>正在加载主题列表...</p>";
    try {
      const response = await fetch(jsonUrl);
      if (!response.ok) {
        throw new Error(`网络请求失败: ${response.status}`);
      }
      const themes = await response.json();
      if (!Array.isArray(themes) || themes.length === 0) {
        themeListContainer.innerHTML = "<p>未找到有效的主题或列表为空。</p>";
        return;
      }
      themeListContainer.innerHTML = "";
      themes.forEach((theme, index) => {
        const themeId = `theme-option-${index}`;
        const themeItem = document.createElement("div");
        themeItem.className = "theme-item";
        themeItem.innerHTML = `
          <div class="theme-item-header">
              <input type="radio" id="${themeId}" name="theme-selection" value="${theme.css_url}">
              <label for="${themeId}">${theme.description || "无标题"}</label>
          </div>
          <div class="theme-item-details">
              <span>作者: ${theme.author || "未知"}</span>
              <span>版本: ${theme.version || "未知"}</span>
          </div>
          <p class="theme-item-remark">${theme.remark || "无备注"}</p>
        `;
        themeListContainer.appendChild(themeItem);
      });
    } catch (error) {
      console.error("加载主题列表失败:", error);
      themeListContainer.innerHTML = `<p style="color: red;">加载失败: ${error.message}</p>`;
    }
  }
  async confirmThemeSelection() {
    const selectedRadio = document.querySelector('input[name="theme-selection"]:checked');
    if (!selectedRadio) {
      alert("请先选择一个主题！");
      return;
    }
    const url = selectedRadio.value;
    const stylesheet = document.getElementById("main-stylesheet");
    const win = window;
    const state = win.STATE;
    const db = win.DB;
    if (stylesheet) {
      if (url && url.trim() !== "") {
        stylesheet.href = url + "?v=" + Date.now();
      } else {
        stylesheet.href = "./unified-style.css";
      }
    }
    if (state?.state && db?.db) {
      state.state.globalSettings.remoteThemeUrl = url;
      await db.db.globalSettings.put(state.state.globalSettings);
    }
    this.showCustomAlert("主题已更新", "新主题已应用并保存。");
    this.closeThemeListModal();
  }
  // 初始化模态框事件监听器
  initModalListeners() {
    const modalCancelBtn = document.getElementById("custom-modal-cancel");
    const modalOverlay = document.getElementById("custom-modal-overlay");
    if (modalCancelBtn) {
      modalCancelBtn.addEventListener("click", () => this.hideCustomModal());
    }
    if (modalOverlay) {
      modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) {
          this.hideCustomModal();
        }
      });
    }
  }
}
class BatteryService {
  constructor() {
    this.lastKnownBatteryLevel = 1;
    this.alertFlags = { hasShown40: false, hasShown20: false, hasShown10: false };
    this.batteryAlertTimeout = null;
  }
  // 显示电池提醒
  showBatteryAlert(imageUrl, text) {
    if (this.batteryAlertTimeout) {
      clearTimeout(this.batteryAlertTimeout);
    }
    const batteryAlertModal = document.getElementById("battery-alert-modal");
    const batteryAlertImage = document.getElementById("battery-alert-image");
    const batteryAlertText = document.getElementById("battery-alert-text");
    if (!batteryAlertModal || !batteryAlertImage || !batteryAlertText) {
      console.warn("电池提醒元素不存在");
      return;
    }
    batteryAlertImage.src = imageUrl;
    batteryAlertText.textContent = text;
    batteryAlertModal.classList.add("visible");
    const closeAlert = () => {
      batteryAlertModal.classList.remove("visible");
      batteryAlertModal.removeEventListener("click", closeAlert);
    };
    batteryAlertModal.addEventListener("click", closeAlert);
    this.batteryAlertTimeout = window.setTimeout(closeAlert, 2e3);
  }
  // 更新电池显示
  updateBatteryDisplay(battery) {
    const batteryContainer = document.getElementById("status-bar-battery");
    if (!batteryContainer) return;
    const batteryLevelEl = batteryContainer.querySelector(".battery-level");
    const batteryTextEl = batteryContainer.querySelector(".battery-text");
    if (!batteryLevelEl || !batteryTextEl) return;
    const level = Math.floor(battery.level * 100);
    batteryLevelEl.style.width = `${level}%`;
    batteryTextEl.textContent = `${level}%`;
    if (battery.charging) {
      batteryContainer.classList.add("charging");
    } else {
      batteryContainer.classList.remove("charging");
    }
  }
  // 处理电池状态变化
  handleBatteryChange(battery) {
    this.updateBatteryDisplay(battery);
    const level = battery.level;
    if (!battery.charging) {
      if (level <= 0.4 && this.lastKnownBatteryLevel > 0.4 && !this.alertFlags.hasShown40) {
        this.showBatteryAlert("https://i.postimg.cc/T2yKJ0DV/40.jpg", "有点饿了，可以去找充电器惹");
        this.alertFlags.hasShown40 = true;
      }
      if (level <= 0.2 && this.lastKnownBatteryLevel > 0.2 && !this.alertFlags.hasShown20) {
        this.showBatteryAlert("https://i.postimg.cc/qB9zbKs9/20.jpg", "赶紧的充电，要饿死了");
        this.alertFlags.hasShown20 = true;
      }
      if (level <= 0.1 && this.lastKnownBatteryLevel > 0.1 && !this.alertFlags.hasShown10) {
        this.showBatteryAlert("https://i.postimg.cc/ThMMVfW4/10.jpg", "已阵亡，还有30秒爆炸");
        this.alertFlags.hasShown10 = true;
      }
    }
    if (level > 0.4) this.alertFlags.hasShown40 = false;
    if (level > 0.2) this.alertFlags.hasShown20 = false;
    if (level > 0.1) this.alertFlags.hasShown10 = false;
    this.lastKnownBatteryLevel = level;
  }
  // 初始化电池管理器
  async initBatteryManager() {
    if ("getBattery" in navigator) {
      try {
        const battery = await navigator.getBattery();
        this.lastKnownBatteryLevel = battery.level;
        this.handleBatteryChange(battery);
        battery.addEventListener("levelchange", () => this.handleBatteryChange(battery));
        battery.addEventListener("chargingchange", () => {
          this.handleBatteryChange(battery);
          if (battery.charging) {
            this.showBatteryAlert("https://i.postimg.cc/3NDQ0dWG/image.jpg", "窝爱泥，电量吃饱饱");
          }
        });
        console.log("电池管理器初始化成功");
      } catch (err) {
        console.error("无法获取电池信息:", err);
        const batteryText = document.querySelector(".battery-text");
        if (batteryText) {
          batteryText.textContent = "ᗜωᗜ";
        }
      }
    } else {
      console.log("浏览器不支持电池状态API。");
      const batteryText = document.querySelector(".battery-text");
      if (batteryText) {
        batteryText.textContent = "ᗜωᗜ";
      }
    }
  }
  // 获取当前电池状态信息
  getBatteryStatus() {
    return {
      lastKnownLevel: this.lastKnownBatteryLevel,
      alertFlags: { ...this.alertFlags }
    };
  }
}
class DataService {
  // 导出数据
  async exportData() {
    try {
      const win = window;
      const db = win.DB;
      if (!db?.db) {
        throw new Error("数据库实例未初始化");
      }
      let globalSettings = await db.db.globalSettings.get("main") || {};
      if (!globalSettings.id) globalSettings.id = "main";
      if (!globalSettings.wallpaper) globalSettings.wallpaper = "linear-gradient(135deg, #89f7fe, #66a6ff)";
      const backupData = {
        chats: await db.db.chats.toArray(),
        apiConfig: await db.db.apiConfig.get("main") || {},
        globalSettings,
        userStickers: await db.db.userStickers.toArray(),
        worldBooks: await db.db.worldBooks.toArray(),
        musicLibrary: await db.db.musicLibrary.get("main") || { playlist: [] },
        personaPresets: await db.db.personaPresets.toArray()
      };
      if (backupData.musicLibrary.playlist) {
        backupData.musicLibrary.playlist = backupData.musicLibrary.playlist.map((track) => {
          if (track.isLocal) {
            return { ...track, src: null, isLocal: true, requiresReupload: true };
          }
          return track;
        });
      }
      const jsonString = JSON.stringify(backupData);
      const dataBlob = new Blob([jsonString]);
      const compressionStream = new CompressionStream("gzip");
      const compressedStream = dataBlob.stream().pipeThrough(compressionStream);
      const compressedBlob = await new Response(compressedStream).blob();
      const url = URL.createObjectURL(compressedBlob);
      const a = document.createElement("a");
      const now = /* @__PURE__ */ new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
      a.href = url;
      a.download = `EPhone_backup_${date}_${time}.phone`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      if (win.showCustomAlert) {
        win.showCustomAlert("导出成功", "所有数据已成功压缩并导出为.phone文件。");
      }
      console.log("数据导出成功");
    } catch (error) {
      console.error("导出失败:", error);
      const win = window;
      if (win.showCustomAlert) {
        win.showCustomAlert("导出失败", `发生错误: ${error.message}`);
      } else {
        alert(`导出失败: ${error.message}`);
      }
    }
  }
  // 导入数据
  async importData(file) {
    if (!file) return;
    const confirmed = await this.showConfirm(
      "确认导入",
      "警告：导入数据将覆盖当前所有聊天记录和设置。此操作不可撤销。确定要继续吗？",
      { confirmButtonClass: "btn-danger", confirmText: "我确定，导入" }
    );
    if (!confirmed) {
      return;
    }
    try {
      const win = window;
      const db = win.DB;
      if (!db?.db) {
        throw new Error("数据库实例未初始化");
      }
      const decompressionStream = new DecompressionStream("gzip");
      const decompressedStream = file.stream().pipeThrough(decompressionStream);
      const jsonString = await new Response(decompressedStream).text();
      const backupData = JSON.parse(jsonString);
      if (!backupData.chats || !backupData.apiConfig || !backupData.globalSettings) {
        throw new Error("备份文件格式无效或已损坏。");
      }
      if (!backupData.globalSettings.id) {
        backupData.globalSettings.id = "main";
      }
      if (!backupData.globalSettings.wallpaper) {
        backupData.globalSettings.wallpaper = "linear-gradient(135deg, #89f7fe, #66a6ff)";
      }
      await db.db.transaction("rw", db.db.tables, async () => {
        await Promise.all(db.db.tables.map((table) => table.clear()));
        if (backupData.chats && backupData.chats.length > 0) await db.db.chats.bulkAdd(backupData.chats);
        if (backupData.userStickers && backupData.userStickers.length > 0) await db.db.userStickers.bulkAdd(backupData.userStickers);
        if (backupData.worldBooks && backupData.worldBooks.length > 0) await db.db.worldBooks.bulkAdd(backupData.worldBooks);
        if (backupData.personaPresets && backupData.personaPresets.length > 0) await db.db.personaPresets.bulkAdd(backupData.personaPresets);
        await db.db.apiConfig.put(backupData.apiConfig);
        await db.db.globalSettings.put(backupData.globalSettings);
        if (backupData.musicLibrary) {
          const playlist = backupData.musicLibrary.playlist.filter((t) => !t.requiresReupload);
          await db.db.musicLibrary.put({ id: "main", playlist });
          const reuploadCount = backupData.musicLibrary.playlist.length - playlist.length;
          if (reuploadCount > 0) {
            if (win.showCustomAlert) {
              win.showCustomAlert("部分导入", `${reuploadCount}首本地歌曲需要您重新手动添加。`);
            }
          }
        }
      });
      if (win.showCustomAlert) {
        await win.showCustomAlert("导入成功", "数据已成功恢复。应用即将刷新。");
      }
      window.location.reload();
    } catch (error) {
      console.error("导入失败:", error);
      const win = window;
      if (win.showCustomAlert) {
        await win.showCustomAlert("导入失败", `解压或解析文件时发生错误: ${error.message}`);
      } else {
        alert(`导入失败: ${error.message}`);
      }
    }
  }
  // 处理文件导入事件
  handleImportDataEvent(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (file) {
      this.importData(file).finally(() => {
        input.value = "";
      });
    }
  }
  // 数据清理工具
  async clearAllData() {
    const confirmed = await this.showConfirm(
      "清空所有数据",
      "警告：此操作将删除所有聊天记录、设置和用户数据。此操作不可撤销！确定要继续吗？",
      { confirmButtonClass: "btn-danger", confirmText: "我确定，清空" }
    );
    if (!confirmed) return;
    try {
      const win = window;
      const db = win.DB;
      if (!db?.db) {
        throw new Error("数据库实例未初始化");
      }
      await db.db.transaction("rw", db.db.tables, async () => {
        await Promise.all(db.db.tables.map((table) => table.clear()));
      });
      if (win.showCustomAlert) {
        await win.showCustomAlert("清空成功", "所有数据已清空。应用即将刷新。");
      }
      window.location.reload();
    } catch (error) {
      console.error("清空数据失败:", error);
      const win = window;
      if (win.showCustomAlert) {
        win.showCustomAlert("清空失败", `发生错误: ${error.message}`);
      } else {
        alert(`清空失败: ${error.message}`);
      }
    }
  }
  // 获取数据统计信息
  async getDataStats() {
    try {
      const win = window;
      const db = win.DB;
      if (!db?.db) {
        throw new Error("数据库实例未初始化");
      }
      const stats = {
        chats: await db.db.chats.count(),
        userStickers: await db.db.userStickers.count(),
        worldBooks: await db.db.worldBooks.count(),
        personaPresets: await db.db.personaPresets.count(),
        totalMessages: 0,
        dataSize: 0
      };
      const chats = await db.db.chats.toArray();
      stats.totalMessages = chats.reduce((total, chat) => total + (chat.history?.length || 0), 0);
      const allData = {
        chats,
        userStickers: await db.db.userStickers.toArray(),
        worldBooks: await db.db.worldBooks.toArray(),
        personaPresets: await db.db.personaPresets.toArray()
      };
      stats.dataSize = JSON.stringify(allData).length;
      return stats;
    } catch (error) {
      console.error("获取数据统计失败:", error);
      return {
        chats: 0,
        userStickers: 0,
        worldBooks: 0,
        personaPresets: 0,
        totalMessages: 0,
        dataSize: 0
      };
    }
  }
  // 辅助函数
  showConfirm(title, message, options = {}) {
    const win = window;
    if (win.showCustomConfirm) {
      return win.showCustomConfirm(title, message, options);
    }
    return Promise.resolve(confirm(message));
  }
}
class MusicService {
  // 音乐播放控制
  togglePlayPause() {
    const audioPlayer = document.getElementById("audio-player");
    const win = window;
    const musicState = win.STATE?.musicState;
    if (!audioPlayer || !musicState) return;
    if (audioPlayer.paused) {
      if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
        this.playSong(0);
      } else if (musicState.currentIndex > -1) {
        audioPlayer.play();
      }
    } else {
      audioPlayer.pause();
    }
  }
  // 播放指定歌曲
  playSong(index) {
    const win = window;
    const musicState = win.STATE?.musicState;
    const audioPlayer = document.getElementById("audio-player");
    if (!musicState || !audioPlayer || index < 0 || index >= musicState.playlist.length) return;
    musicState.currentIndex = index;
    const track = musicState.playlist[index];
    if (track.isLocal && track.src instanceof Blob) {
      audioPlayer.src = URL.createObjectURL(track.src);
    } else if (!track.isLocal) {
      audioPlayer.src = track.src;
    } else {
      console.error("本地歌曲源错误:", track);
      return;
    }
    audioPlayer.play();
    this.updatePlaylistUI();
    this.updatePlayerUI();
  }
  // 播放下一首
  playNext() {
    const win = window;
    const musicState = win.STATE?.musicState;
    if (!musicState || musicState.playlist.length === 0) return;
    let nextIndex;
    switch (musicState.playMode) {
      case "random":
        nextIndex = Math.floor(Math.random() * musicState.playlist.length);
        break;
      case "single":
        this.playSong(musicState.currentIndex);
        return;
      case "order":
      default:
        nextIndex = (musicState.currentIndex + 1) % musicState.playlist.length;
        break;
    }
    this.playSong(nextIndex);
  }
  // 播放上一首
  playPrev() {
    const win = window;
    const musicState = win.STATE?.musicState;
    if (!musicState || musicState.playlist.length === 0) return;
    const newIndex = (musicState.currentIndex - 1 + musicState.playlist.length) % musicState.playlist.length;
    this.playSong(newIndex);
  }
  // 切换播放模式
  changePlayMode() {
    const win = window;
    const musicState = win.STATE?.musicState;
    if (!musicState) return;
    const modes = ["order", "random", "single"];
    const currentModeIndex = modes.indexOf(musicState.playMode);
    musicState.playMode = modes[(currentModeIndex + 1) % modes.length];
    const modeBtn = document.getElementById("music-mode-btn");
    if (modeBtn) {
      modeBtn.textContent = {
        "order": "顺序",
        "random": "随机",
        "single": "单曲"
      }[musicState.playMode];
    }
  }
  // 从URL添加歌曲
  async addSongFromURL() {
    const win = window;
    const musicState = win.STATE?.musicState;
    if (!musicState) return;
    const url = await this.showCustomPrompt("添加网络歌曲", "请输入歌曲的URL", "", "url");
    if (!url) return;
    const name = await this.showCustomPrompt("歌曲信息", "请输入歌名");
    if (!name) return;
    const artist = await this.showCustomPrompt("歌曲信息", "请输入歌手名");
    if (!artist) return;
    musicState.playlist.push({ name, artist, src: url, isLocal: false });
    await this.saveGlobalPlaylist();
    this.updatePlaylistUI();
    if (musicState.currentIndex === -1) {
      musicState.currentIndex = musicState.playlist.length - 1;
      this.updatePlayerUI();
    }
  }
  // 从本地添加歌曲
  async addSongFromLocal(files) {
    const win = window;
    const musicState = win.STATE?.musicState;
    if (!musicState || !files.length) return;
    for (const file of Array.from(files)) {
      const name = await this.showCustomPrompt("歌曲信息", "请输入歌名", "");
      if (name === null) continue;
      const artist = await this.showCustomPrompt("歌曲信息", "请输入歌手名", "");
      if (artist === null) continue;
      musicState.playlist.push({ name, artist, src: file, isLocal: true });
    }
    await this.saveGlobalPlaylist();
    this.updatePlaylistUI();
    if (musicState.currentIndex === -1 && musicState.playlist.length > 0) {
      musicState.currentIndex = 0;
      this.updatePlayerUI();
    }
  }
  // 删除曲目
  async deleteTrack(index) {
    const win = window;
    const musicState = win.STATE?.musicState;
    const audioPlayer = document.getElementById("audio-player");
    if (!musicState || !audioPlayer || index < 0 || index >= musicState.playlist.length) return;
    const track = musicState.playlist[index];
    const wasPlaying = musicState.isPlaying && musicState.currentIndex === index;
    if (track.isLocal && audioPlayer.src.startsWith("blob:") && musicState.currentIndex === index) {
      URL.revokeObjectURL(audioPlayer.src);
    }
    musicState.playlist.splice(index, 1);
    await this.saveGlobalPlaylist();
    if (musicState.playlist.length === 0) {
      if (musicState.isPlaying) audioPlayer.pause();
      audioPlayer.src = "";
      musicState.currentIndex = -1;
      musicState.isPlaying = false;
    } else {
      if (wasPlaying) {
        this.playNext();
      } else {
        if (musicState.currentIndex >= index) {
          musicState.currentIndex = Math.max(0, musicState.currentIndex - 1);
        }
      }
    }
    this.updatePlayerUI();
    this.updatePlaylistUI();
  }
  // 更新播放器UI
  updatePlayerUI() {
    const win = window;
    const musicState = win.STATE?.musicState;
    if (!musicState) return;
    this.updateListenTogetherIcon(musicState.activeChatId);
    this.updateElapsedTimeDisplay();
    const titleEl = document.getElementById("music-player-song-title");
    const artistEl = document.getElementById("music-player-artist");
    const playPauseBtn = document.getElementById("music-play-pause-btn");
    if (titleEl && artistEl) {
      if (musicState.currentIndex > -1 && musicState.playlist.length > 0) {
        const track = musicState.playlist[musicState.currentIndex];
        titleEl.textContent = track.name;
        artistEl.textContent = track.artist;
      } else {
        titleEl.textContent = "请添加歌曲";
        artistEl.textContent = "...";
      }
    }
    if (playPauseBtn) {
      playPauseBtn.textContent = musicState.isPlaying ? "❚❚" : "▶";
    }
  }
  // 更新播放时间显示
  updateElapsedTimeDisplay() {
    const win = window;
    const musicState = win.STATE?.musicState;
    if (!musicState) return;
    const timeCounter = document.getElementById("music-time-counter");
    if (timeCounter) {
      const hours = (musicState.totalElapsedTime / 3600).toFixed(1);
      timeCounter.textContent = `已经一起听了${hours}小时`;
    }
  }
  // 更新播放列表UI
  updatePlaylistUI() {
    const win = window;
    const musicState = win.STATE?.musicState;
    if (!musicState) return;
    const playlistBody = document.getElementById("playlist-body");
    if (!playlistBody) return;
    playlistBody.innerHTML = "";
    if (musicState.playlist.length === 0) {
      playlistBody.innerHTML = '<p style="text-align:center; padding: 20px; color: #888;">播放列表是空的~</p>';
      return;
    }
    musicState.playlist.forEach((track, index) => {
      const item = document.createElement("div");
      item.className = "playlist-item";
      if (index === musicState.currentIndex) item.classList.add("playing");
      item.innerHTML = `
        <div class="playlist-item-info">
            <div class="title">${track.name}</div>
            <div class="artist">${track.artist}</div>
        </div>
        <span class="delete-track-btn" data-index="${index}">&times;</span>
      `;
      item.querySelector(".playlist-item-info").addEventListener("click", () => this.playSong(index));
      item.querySelector(".delete-track-btn").addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = await this.showCustomConfirm("删除歌曲", `确定要从播放列表中删除《${track.name}》吗？`);
        if (confirmed) this.deleteTrack(index);
      });
      playlistBody.appendChild(item);
    });
  }
  // "一起听"功能 - 开始会话
  async startListenTogetherSession(chatId) {
    const win = window;
    const musicState = win.STATE?.musicState;
    const state = win.STATE;
    if (!musicState || !state?.state) return;
    const chat = state.state.chats[chatId];
    if (!chat) return;
    musicState.totalElapsedTime = chat.musicData?.totalTime || 0;
    musicState.isActive = true;
    musicState.activeChatId = chatId;
    if (musicState.playlist.length > 0) {
      musicState.currentIndex = 0;
    } else {
      musicState.currentIndex = -1;
    }
    if (musicState.timerId) clearInterval(musicState.timerId);
    musicState.timerId = window.setInterval(() => {
      if (musicState.isPlaying) {
        musicState.totalElapsedTime++;
        this.updateElapsedTimeDisplay();
      }
    }, 1e3);
    this.updatePlayerUI();
    this.updatePlaylistUI();
    const musicPlayerOverlay = document.getElementById("music-player-overlay");
    if (musicPlayerOverlay) {
      musicPlayerOverlay.classList.add("visible");
    }
  }
  // "一起听"功能 - 结束会话
  async endListenTogetherSession(saveState = true) {
    const win = window;
    const musicState = win.STATE?.musicState;
    const state = win.STATE;
    const audioPlayer = document.getElementById("audio-player");
    if (!musicState || !musicState.isActive) return;
    const oldChatId = musicState.activeChatId;
    if (musicState.timerId) clearInterval(musicState.timerId);
    if (musicState.isPlaying && audioPlayer) {
      audioPlayer.pause();
    }
    if (saveState && oldChatId && state?.state.chats[oldChatId]) {
      const chat = state.state.chats[oldChatId];
      if (!chat.musicData) chat.musicData = { totalTime: 0 };
      chat.musicData.totalTime = musicState.totalElapsedTime;
      await win.DB.db.chats.put(chat);
    }
    musicState.isActive = false;
    musicState.activeChatId = null;
    musicState.totalElapsedTime = 0;
    musicState.timerId = null;
    const musicPlayerOverlay = document.getElementById("music-player-overlay");
    const musicPlaylistPanel = document.getElementById("music-playlist-panel");
    if (musicPlayerOverlay) {
      musicPlayerOverlay.classList.remove("visible");
    }
    if (musicPlaylistPanel) {
      musicPlaylistPanel.classList.remove("visible");
    }
    this.updateListenTogetherIcon(oldChatId, true);
  }
  // 更新"一起听"图标
  updateListenTogetherIcon(chatId, forceReset = false) {
    const win = window;
    const musicState = win.STATE?.musicState;
    const iconImg = document.querySelector("#listen-together-btn img");
    if (!iconImg) return;
    if (forceReset || !musicState?.isActive || musicState.activeChatId !== chatId) {
      iconImg.src = "https://i.postimg.cc/8kYShvrJ/90-UI-2.png";
      iconImg.className = "";
      return;
    }
    iconImg.src = "https://i.postimg.cc/vBN7GnQ9/3-FC8-D1596-C5-CFB200-FCB1-D8-C3-A37-A370.png";
    iconImg.classList.add("rotating");
    if (musicState.isPlaying) {
      iconImg.classList.remove("paused");
    } else {
      iconImg.classList.add("paused");
    }
  }
  // 处理"一起听"点击
  async handleListenTogetherClick() {
    const win = window;
    const state = win.STATE;
    const musicState = win.STATE?.musicState;
    if (!state?.state || !musicState) return;
    const targetChatId = state.state.activeChatId;
    if (!targetChatId) return;
    if (!musicState.isActive) {
      this.startListenTogetherSession(targetChatId);
      return;
    }
    if (musicState.activeChatId === targetChatId) {
      const musicPlayerOverlay = document.getElementById("music-player-overlay");
      if (musicPlayerOverlay) {
        musicPlayerOverlay.classList.add("visible");
      }
    } else {
      const oldChatName = state.state.chats[musicState.activeChatId]?.name || "未知";
      const newChatName = state.state.chats[targetChatId]?.name || "当前";
      const confirmed = await this.showCustomConfirm(
        "切换听歌对象",
        `您正和「${oldChatName}」听歌。要结束并开始和「${newChatName}」的新会话吗？`,
        { confirmButtonClass: "btn-danger" }
      );
      if (confirmed) {
        await this.endListenTogetherSession(true);
        await new Promise((resolve) => setTimeout(resolve, 50));
        this.startListenTogetherSession(targetChatId);
      }
    }
  }
  // 保存全局播放列表
  async saveGlobalPlaylist() {
    const win = window;
    const musicState = win.STATE?.musicState;
    const db = win.DB;
    if (musicState && db?.db) {
      await db.db.musicLibrary.put({ id: "main", playlist: musicState.playlist });
    }
  }
  // 辅助函数
  showCustomPrompt(title, placeholder, initialValue = "", type = "text") {
    const win = window;
    if (win.showCustomPrompt) {
      return win.showCustomPrompt(title, placeholder, initialValue, type);
    }
    return Promise.resolve(prompt(title));
  }
  showCustomConfirm(title, message, options = {}) {
    const win = window;
    if (win.showCustomConfirm) {
      return win.showCustomConfirm(title, message, options);
    }
    return Promise.resolve(confirm(message));
  }
}
class PersonaService {
  constructor() {
    this.editingPersonaPresetId = null;
  }
  // 获取默认头像
  getDefaultAvatar() {
    const win = window;
    return win.CONSTANTS?.DEFAULT_AVATAR || "https://i.postimg.cc/PxZrFFFL/o-o-1.jpg";
  }
  // 打开人设库
  openPersonaLibrary() {
    this.renderPersonaLibrary();
    const personaLibraryModal = document.getElementById("persona-library-modal");
    if (personaLibraryModal) {
      personaLibraryModal.classList.add("visible");
    }
  }
  // 关闭人设库
  closePersonaLibrary() {
    const personaLibraryModal = document.getElementById("persona-library-modal");
    if (personaLibraryModal) {
      personaLibraryModal.classList.remove("visible");
    }
  }
  // 渲染人设库
  renderPersonaLibrary() {
    const win = window;
    const state = win.STATE;
    if (!state?.state) return;
    const grid = document.getElementById("persona-library-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (state.state.personaPresets.length === 0) {
      grid.innerHTML = '<p style="color: var(--text-secondary); grid-column: 1 / -1; text-align: center; margin-top: 20px;">空空如也~ 点击右上角"添加"来创建你的第一个人设预设吧！</p>';
      return;
    }
    state.state.personaPresets.forEach((preset) => {
      const item = document.createElement("div");
      item.className = "persona-preset-item";
      item.style.backgroundImage = `url(${preset.avatar})`;
      item.dataset.presetId = preset.id;
      item.addEventListener("click", () => this.applyPersonaPreset(preset.id));
      this.addLongPressListener(item, () => this.showPresetActions(preset.id));
      grid.appendChild(item);
    });
  }
  // 应用人设预设
  applyPersonaPreset(presetId) {
    const win = window;
    const state = win.STATE;
    if (!state?.state) return;
    const preset = state.state.personaPresets.find((p) => p.id === presetId);
    if (preset) {
      const myAvatarPreview = document.getElementById("my-avatar-preview");
      const myPersona = document.getElementById("my-persona");
      if (myAvatarPreview) {
        myAvatarPreview.src = preset.avatar;
      }
      if (myPersona) {
        myPersona.value = preset.persona;
      }
    }
    this.closePersonaLibrary();
  }
  // 显示预设操作菜单
  showPresetActions(presetId) {
    this.editingPersonaPresetId = presetId;
    const presetActionsModal = document.getElementById("preset-actions-modal");
    if (presetActionsModal) {
      presetActionsModal.classList.add("visible");
    }
  }
  // 隐藏预设操作菜单
  hidePresetActions() {
    const presetActionsModal = document.getElementById("preset-actions-modal");
    if (presetActionsModal) {
      presetActionsModal.classList.remove("visible");
    }
    this.editingPersonaPresetId = null;
  }
  // 打开人设编辑器（创建模式）
  openPersonaEditorForCreate() {
    this.editingPersonaPresetId = null;
    const personaEditorTitle = document.getElementById("persona-editor-title");
    const presetAvatarPreview = document.getElementById("preset-avatar-preview");
    const presetPersonaInput = document.getElementById("preset-persona-input");
    const personaEditorModal = document.getElementById("persona-editor-modal");
    if (personaEditorTitle) {
      personaEditorTitle.textContent = "添加人设预设";
    }
    if (presetAvatarPreview) {
      presetAvatarPreview.src = this.getDefaultAvatar();
    }
    if (presetPersonaInput) {
      presetPersonaInput.value = "";
    }
    if (personaEditorModal) {
      personaEditorModal.classList.add("visible");
    }
  }
  // 打开人设编辑器（编辑模式）
  openPersonaEditorForEdit() {
    if (!this.editingPersonaPresetId) return;
    const win = window;
    const state = win.STATE;
    if (!state?.state) return;
    const preset = state.state.personaPresets.find((p) => p.id === this.editingPersonaPresetId);
    if (!preset) return;
    const personaEditorTitle = document.getElementById("persona-editor-title");
    const presetAvatarPreview = document.getElementById("preset-avatar-preview");
    const presetPersonaInput = document.getElementById("preset-persona-input");
    const presetActionsModal = document.getElementById("preset-actions-modal");
    const personaEditorModal = document.getElementById("persona-editor-modal");
    if (personaEditorTitle) {
      personaEditorTitle.textContent = "编辑人设预设";
    }
    if (presetAvatarPreview) {
      presetAvatarPreview.src = preset.avatar;
    }
    if (presetPersonaInput) {
      presetPersonaInput.value = preset.persona;
    }
    if (presetActionsModal) {
      presetActionsModal.classList.remove("visible");
    }
    if (personaEditorModal) {
      personaEditorModal.classList.add("visible");
    }
  }
  // 删除人设预设
  async deletePersonaPreset() {
    if (!this.editingPersonaPresetId) return;
    const confirmed = await this.showCustomConfirm(
      "删除预设",
      "确定要删除这个人设预设吗？此操作不可恢复。",
      { confirmButtonClass: "btn-danger" }
    );
    if (confirmed) {
      const win = window;
      const state = win.STATE;
      const db = win.DB;
      if (state?.state && db?.db) {
        await db.db.personaPresets.delete(this.editingPersonaPresetId);
        state.state.personaPresets = state.state.personaPresets.filter((p) => p.id !== this.editingPersonaPresetId);
        this.hidePresetActions();
        this.renderPersonaLibrary();
      }
    }
  }
  // 关闭人设编辑器
  closePersonaEditor() {
    const personaEditorModal = document.getElementById("persona-editor-modal");
    if (personaEditorModal) {
      personaEditorModal.classList.remove("visible");
    }
    this.editingPersonaPresetId = null;
  }
  // 保存人设预设
  async savePersonaPreset() {
    const win = window;
    const state = win.STATE;
    const db = win.DB;
    if (!state?.state || !db?.db) return;
    const presetAvatarPreview = document.getElementById("preset-avatar-preview");
    const presetPersonaInput = document.getElementById("preset-persona-input");
    if (!presetAvatarPreview || !presetPersonaInput) return;
    const avatar = presetAvatarPreview.src;
    const persona = presetPersonaInput.value.trim();
    const defaultAvatar = this.getDefaultAvatar();
    if (avatar === defaultAvatar && !persona) {
      alert("头像和人设不能都为空哦！");
      return;
    }
    if (this.editingPersonaPresetId) {
      const preset = state.state.personaPresets.find((p) => p.id === this.editingPersonaPresetId);
      if (preset) {
        preset.avatar = avatar;
        preset.persona = persona;
        await db.db.personaPresets.put(preset);
      }
    } else {
      const newPreset = {
        id: "preset_" + Date.now(),
        avatar,
        persona
      };
      await db.db.personaPresets.add(newPreset);
      state.state.personaPresets.push(newPreset);
    }
    this.renderPersonaLibrary();
    this.closePersonaEditor();
  }
  // 群成员管理相关
  openMemberEditor(memberId) {
    const win = window;
    const state = win.STATE;
    if (!state?.state?.activeChatId) return;
    const chat = state.state.chats[state.state.activeChatId];
    if (!chat || !chat.isGroup) return;
    const member = chat.members?.find((m) => m.id === memberId);
    if (!member) return;
    const memberNameInput = document.getElementById("member-name-input");
    const memberPersonaInput = document.getElementById("member-persona-input");
    const memberPatSuffixInput = document.getElementById("member-pat-suffix-input");
    const memberAvatarPreview = document.getElementById("member-avatar-preview");
    const memberSettingsModal = document.getElementById("member-settings-modal");
    if (memberNameInput) memberNameInput.value = member.name;
    if (memberPersonaInput) memberPersonaInput.value = member.persona;
    if (memberPatSuffixInput) memberPatSuffixInput.value = member.patSuffix || "";
    if (memberAvatarPreview) {
      const defaultGroupMemberAvatar = win.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || "https://i.postimg.cc/VkQfgzGJ/1.jpg";
      memberAvatarPreview.src = member.avatar || defaultGroupMemberAvatar;
    }
    if (memberSettingsModal) {
      memberSettingsModal.classList.add("visible");
    }
    win._editingMemberId = memberId;
  }
  // 渲染群成员设置
  renderGroupMemberSettings(members) {
    const container = document.getElementById("group-members-settings");
    if (!container) return;
    const win = window;
    const defaultGroupMemberAvatar = win.CONSTANTS?.DEFAULT_GROUP_MEMBER_AVATAR || "https://i.postimg.cc/VkQfgzGJ/1.jpg";
    container.innerHTML = "";
    members.forEach((member) => {
      const item = document.createElement("div");
      item.className = "member-editor";
      item.dataset.memberId = member.id;
      item.innerHTML = `
        <div class="member-avatar-container">
            <img src="${member.avatar || defaultGroupMemberAvatar}" alt="${member.name}">
            <div class="delete-member-btn" title="删除该成员">&times;</div>
        </div>
        <span class="member-name">${member.name}</span>
      `;
      const avatarImg = item.querySelector("img");
      avatarImg.addEventListener("click", () => this.openMemberEditor(member.id));
      const deleteBtn = item.querySelector(".delete-member-btn");
      deleteBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = await this.showCustomConfirm(
          "删除成员",
          `确定要删除成员 "${member.name}" 吗？`,
          { confirmButtonClass: "btn-danger" }
        );
        if (confirmed) {
          const state = win.STATE;
          if (state?.state?.activeChatId) {
            const chat = state.state.chats[state.state.activeChatId];
            if (chat.members) {
              chat.members = chat.members.filter((m) => m.id !== member.id);
              this.renderGroupMemberSettings(chat.members);
            }
          }
        }
      });
      container.appendChild(item);
    });
  }
  // 初始化人设预设事件监听器
  initPersonaPresetListeners() {
    const openPersonaLibraryBtn = document.getElementById("open-persona-library-btn");
    const closePersonaLibraryBtn = document.getElementById("close-persona-library-btn");
    const addPersonaPresetBtn = document.getElementById("add-persona-preset-btn");
    const cancelPersonaEditorBtn = document.getElementById("cancel-persona-editor-btn");
    const savePersonaPresetBtn = document.getElementById("save-persona-preset-btn");
    const presetActionEdit = document.getElementById("preset-action-edit");
    const presetActionDelete = document.getElementById("preset-action-delete");
    const presetActionCancel = document.getElementById("preset-action-cancel");
    if (openPersonaLibraryBtn) {
      openPersonaLibraryBtn.addEventListener("click", () => this.openPersonaLibrary());
    }
    if (closePersonaLibraryBtn) {
      closePersonaLibraryBtn.addEventListener("click", () => this.closePersonaLibrary());
    }
    if (addPersonaPresetBtn) {
      addPersonaPresetBtn.addEventListener("click", () => this.openPersonaEditorForCreate());
    }
    if (cancelPersonaEditorBtn) {
      cancelPersonaEditorBtn.addEventListener("click", () => this.closePersonaEditor());
    }
    if (savePersonaPresetBtn) {
      savePersonaPresetBtn.addEventListener("click", () => this.savePersonaPreset());
    }
    if (presetActionEdit) {
      presetActionEdit.addEventListener("click", () => this.openPersonaEditorForEdit());
    }
    if (presetActionDelete) {
      presetActionDelete.addEventListener("click", () => this.deletePersonaPreset());
    }
    if (presetActionCancel) {
      presetActionCancel.addEventListener("click", () => this.hidePresetActions());
    }
    console.log("人设预设事件监听器已初始化");
  }
  // 辅助函数
  addLongPressListener(element, callback) {
    const win = window;
    if (win.ChatModule?.addLongPressListener) {
      return win.ChatModule.addLongPressListener(element, callback);
    }
    let pressTimer;
    const startPress = () => {
      pressTimer = window.setTimeout(callback, 500);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    element.addEventListener("mousedown", startPress);
    element.addEventListener("mouseup", cancelPress);
    element.addEventListener("mouseleave", cancelPress);
    element.addEventListener("touchstart", startPress, { passive: true });
    element.addEventListener("touchend", cancelPress);
  }
  showCustomConfirm(title, message, options = {}) {
    const win = window;
    if (win.showCustomConfirm) {
      return win.showCustomConfirm(title, message, options);
    }
    return Promise.resolve(confirm(message));
  }
  // 获取当前编辑的人设预设ID
  getEditingPersonaPresetId() {
    return this.editingPersonaPresetId;
  }
}
const uiUtilsService = new UIUtilsService();
const batteryService = new BatteryService();
const dataService = new DataService();
const musicService = new MusicService();
const personaService = new PersonaService();
class ServiceManager {
  constructor() {
    this.uiUtils = uiUtilsService;
    this.battery = batteryService;
    this.data = dataService;
    this.music = musicService;
    this.persona = personaService;
  }
  // 初始化所有服务
  async initAllServices() {
    this.uiUtils.initClock();
    this.uiUtils.initModalListeners();
    await this.battery.initBatteryManager();
    this.persona.initPersonaPresetListeners();
    console.log("所有服务模块已初始化完成");
  }
  // 获取服务实例
  getService(serviceName) {
    return this[serviceName];
  }
}
const serviceManager = new ServiceManager();
if (typeof window !== "undefined") {
  const win = window;
  win.ServiceManager = serviceManager;
  win.UIService = uiUtilsService;
  win.BatteryService = batteryService;
  win.DataService = dataService;
  win.MusicService = musicService;
  win.PersonaService = personaService;
  win.showCustomModal = () => uiUtilsService.showCustomModal();
  win.hideCustomModal = () => uiUtilsService.hideCustomModal();
  win.showCustomConfirm = (title, message, options) => uiUtilsService.showCustomConfirm(title, message, options);
  win.showCustomAlert = (title, message) => uiUtilsService.showCustomAlert(title, message);
  win.showCustomPrompt = (title, placeholder, initialValue, type) => uiUtilsService.showCustomPrompt(title, placeholder, initialValue, type);
  win.showNotification = (chatId, messageContent) => uiUtilsService.showNotification(chatId, messageContent);
  win.updateClock = () => uiUtilsService.updateClock();
  win.initClock = () => uiUtilsService.initClock();
  win.openThemeListModal = (jsonUrl, title) => uiUtilsService.openThemeListModal(jsonUrl, title);
  win.closeThemeListModal = () => uiUtilsService.closeThemeListModal();
  win.confirmThemeSelection = () => uiUtilsService.confirmThemeSelection();
  win.showBatteryAlert = (imageUrl, text) => batteryService.showBatteryAlert(imageUrl, text);
  win.updateBatteryDisplay = (battery) => batteryService.updateBatteryDisplay(battery);
  win.handleBatteryChange = (battery) => batteryService.handleBatteryChange(battery);
  win.initBatteryManager = () => batteryService.initBatteryManager();
  win.getBatteryStatus = () => batteryService.getBatteryStatus();
  win.exportData = () => dataService.exportData();
  win.importData = (file) => dataService.importData(file);
  win.handleImportDataEvent = (event) => dataService.handleImportDataEvent(event);
  win.clearAllData = () => dataService.clearAllData();
  win.getDataStats = () => dataService.getDataStats();
  win.togglePlayPause = () => musicService.togglePlayPause();
  win.playSong = (index) => musicService.playSong(index);
  win.playNext = () => musicService.playNext();
  win.playPrev = () => musicService.playPrev();
  win.changePlayMode = () => musicService.changePlayMode();
  win.addSongFromURL = () => musicService.addSongFromURL();
  win.addSongFromLocal = (files) => musicService.addSongFromLocal(files);
  win.deleteTrack = (index) => musicService.deleteTrack(index);
  win.updatePlayerUI = () => musicService.updatePlayerUI();
  win.updatePlaylistUI = () => musicService.updatePlaylistUI();
  win.startListenTogetherSession = (chatId) => musicService.startListenTogetherSession(chatId);
  win.endListenTogetherSession = (saveState) => musicService.endListenTogetherSession(saveState);
  win.handleListenTogetherClick = () => musicService.handleListenTogetherClick();
  win.openPersonaLibrary = () => personaService.openPersonaLibrary();
  win.closePersonaLibrary = () => personaService.closePersonaLibrary();
  win.renderPersonaLibrary = () => personaService.renderPersonaLibrary();
  win.applyPersonaPreset = (presetId) => personaService.applyPersonaPreset(presetId);
  win.openPersonaEditorForCreate = () => personaService.openPersonaEditorForCreate();
  win.openPersonaEditorForEdit = () => personaService.openPersonaEditorForEdit();
  win.savePersonaPreset = () => personaService.savePersonaPreset();
  win.deletePersonaPreset = () => personaService.deletePersonaPreset();
  win.closePersonaEditor = () => personaService.closePersonaEditor();
  win.openMemberEditor = (memberId) => personaService.openMemberEditor(memberId);
  win.renderGroupMemberSettings = (members) => personaService.renderGroupMemberSettings(members);
  win.initPersonaPresetListeners = () => personaService.initPersonaPresetListeners();
}
var services_default = {
  serviceManager,
  uiUtilsService,
  batteryService,
  dataService,
  musicService,
  personaService,
  UIUtilsService,
  BatteryService,
  DataService,
  MusicService,
  PersonaService,
  ServiceManager
};
console.log("服务模块(TypeScript版)已初始化");
const SERVICES = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BatteryService,
  DataService,
  MusicService,
  PersonaService,
  ServiceManager,
  UIUtilsService,
  batteryService,
  dataService,
  default: services_default,
  musicService,
  personaService,
  serviceManager,
  uiUtilsService
}, Symbol.toStringTag, { value: "Module" }));
export {
  SERVICES as S,
  batteryService as b,
  dataService as d,
  musicService as m,
  personaService as p,
  serviceManager as s,
  uiUtilsService as u
};
