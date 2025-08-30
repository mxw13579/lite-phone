let isSelectionMode = false;
let selectedMessages = /* @__PURE__ */ new Set();
let isMessageEditMode = false;
let currentRenderedCount = 0;
class ChatScreenModule {
  // 初始化聊天模块事件监听器
  initListeners() {
    this.initSendButtonListeners();
    this.initInputListeners();
  }
  // 初始化发送按钮监听器
  initSendButtonListeners() {
    const sendBtn = document.getElementById("send-btn");
    const waitReplyBtn = document.getElementById("wait-reply-btn");
    if (sendBtn) {
      sendBtn.addEventListener("click", async () => {
        await this.handleSendMessage();
      });
    }
    if (waitReplyBtn) {
      waitReplyBtn.addEventListener("click", () => {
        this.triggerAiResponse();
        setTimeout(() => {
          const messagesContainer = document.getElementById("chat-messages");
          if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }, 50);
      });
    }
  }
  // 初始化输入框监听器
  initInputListeners() {
    const chatInput = document.getElementById("chat-input");
    if (chatInput) {
      chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          const sendBtn = document.getElementById("send-btn");
          if (sendBtn) {
            sendBtn.click();
          }
        }
      });
      chatInput.addEventListener("input", () => {
        chatInput.style.height = "auto";
        chatInput.style.height = chatInput.scrollHeight + "px";
      });
    }
  }
  // 处理发送消息逻辑
  async handleSendMessage() {
    const win = window;
    const state = win.STATE;
    const db = win.DB;
    const chatInput = document.getElementById("chat-input");
    if (!chatInput || !state || !db) return;
    const content = chatInput.value.trim();
    if (!content || !state.state.activeChatId) return;
    const chat = state.state.chats[state.state.activeChatId];
    if (!chat) return;
    const msg = {
      role: "user",
      content,
      timestamp: Date.now()
    };
    chat.history.push(msg);
    await db.db.chats.put(chat);
    this.appendMessage(msg, chat);
    this.renderChatList();
    chatInput.value = "";
    chatInput.style.height = "auto";
    chatInput.focus();
  }
  // 获取常量和默认值
  getConstants() {
    const win = window;
    return win.CONSTANTS || {};
  }
  getDefaultAvatars() {
    const constants = this.getConstants();
    return {
      defaultAvatar: constants.DEFAULT_AVATAR || "https://i.postimg.cc/PxZrFFFL/o-o-1.jpg",
      defaultMyGroupAvatar: constants.DEFAULT_MY_GROUP_AVATAR || "https://i.postimg.cc/cLPP10Vm/4.jpg",
      defaultGroupMemberAvatar: constants.DEFAULT_GROUP_MEMBER_AVATAR || "https://i.postimg.cc/VkQfgzGJ/1.jpg",
      defaultGroupAvatar: constants.DEFAULT_GROUP_AVATAR || "https://i.postimg.cc/gc3QYCDy/1-NINE7-Five.jpg"
    };
  }
  // 消息元素创建
  createMessageElement(msg, chat) {
    const constants = this.getConstants();
    const avatars = this.getDefaultAvatars();
    const STICKER_REGEX = constants.STICKER_REGEX || /^(https:\/\/i\.postimg\.cc\/.+|data:image)/;
    if (msg.type === "pat") {
      const wrapper2 = document.createElement("div");
      wrapper2.className = "system-message-container";
      wrapper2.innerHTML = `<span>${msg.content}</span>`;
      return wrapper2;
    }
    const isUser = msg.role === "user";
    const wrapper = document.createElement("div");
    wrapper.className = `message-wrapper ${isUser ? "user" : "ai"}`;
    if (chat.isGroup && !isUser) {
      const senderNameDiv = document.createElement("div");
      senderNameDiv.className = "sender-name";
      senderNameDiv.textContent = msg.senderName || "未知成员";
      wrapper.appendChild(senderNameDiv);
    }
    const bubble = document.createElement("div");
    bubble.className = `message-bubble ${isUser ? "user" : "ai"}`;
    bubble.dataset.timestamp = String(msg.timestamp);
    bubble.addEventListener("dblclick", () => {
      if (isMessageEditMode) return;
      this.handlePat(msg);
    });
    let avatarSrc;
    if (chat.isGroup) {
      if (isUser) {
        avatarSrc = chat.settings.myAvatar || avatars.defaultMyGroupAvatar;
      } else {
        const member = chat.members?.find((m) => m.name === msg.senderName);
        avatarSrc = member ? member.avatar : avatars.defaultGroupMemberAvatar;
      }
    } else {
      avatarSrc = isUser ? chat.settings.myAvatar || avatars.defaultAvatar : chat.settings.aiAvatar || avatars.defaultAvatar;
    }
    let contentHtml;
    if (msg.type === "user_photo" || msg.type === "ai_image") {
      bubble.classList.add("is-ai-image");
      const altText = msg.type === "user_photo" ? "用户描述的照片" : "AI生成的图片";
      contentHtml = `<img src="https://i.postimg.cc/KYr2qRCK/1.jpg" class="ai-generated-image" alt="${altText}" data-description="${msg.content}">`;
    } else if (msg.type === "voice_message") {
      bubble.classList.add("is-voice-message");
      const duration = Math.max(1, Math.round((String(msg.content) || "").length / 5));
      const durationFormatted = `0:${String(duration).padStart(2, "0")}''`;
      const waveformHTML = "<div></div><div></div><div></div><div></div><div></div>";
      contentHtml = `<div class="voice-message-body" data-text="${msg.content}"><div class="voice-waveform">${waveformHTML}</div><span class="voice-duration">${durationFormatted}</span></div>`;
    } else if (msg.type === "transfer") {
      bubble.classList.add("is-transfer");
      const titleText = isUser ? "转账给Ta" : "收到一笔转账";
      const heartIcon = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="vertical-align: middle;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>`;
      contentHtml = `<div class="transfer-card"><div class="transfer-title">${heartIcon} ${titleText}</div><div class="transfer-amount">¥ ${Number(msg.amount).toFixed(2)}</div><div class="transfer-note">${msg.note || "对方没有留下备注哦~"}</div></div>`;
    } else if (typeof msg.content === "string" && STICKER_REGEX.test(msg.content)) {
      bubble.classList.add("is-sticker");
      contentHtml = `<img src="${msg.content}" alt="${msg.meaning || "Sticker"}" class="sticker-image">`;
    } else if (Array.isArray(msg.content) && msg.content[0]?.type === "image_url") {
      bubble.classList.add("has-image");
      const imageUrl = msg.content[0].image_url.url;
      contentHtml = `<img src="${imageUrl}" class="chat-image" alt="User uploaded image">`;
    } else {
      contentHtml = String(msg.content || "").replace(/\n/g, "<br>");
    }
    bubble.innerHTML = `<div class="avatar-group"><img src="${avatarSrc}" class="avatar"><span class="timestamp">${this.formatTimestamp(msg.timestamp)}</span></div><div class="content">${contentHtml}</div>`;
    this.addLongPressListener(bubble, () => this.enterSelectionMode(msg.timestamp));
    bubble.addEventListener("click", () => {
      if (isSelectionMode) this.toggleMessageSelection(msg.timestamp);
    });
    wrapper.appendChild(bubble);
    return wrapper;
  }
  // 时间格式化函数
  formatTimestamp(timestamp) {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }
  // 长按监听器
  addLongPressListener(element, callback) {
    let pressTimer;
    const startPress = (e) => {
      if (isSelectionMode) return;
      pressTimer = window.setTimeout(() => callback(e), 500);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    element.addEventListener("mousedown", startPress);
    element.addEventListener("mouseup", cancelPress);
    element.addEventListener("mouseleave", cancelPress);
    element.addEventListener("touchstart", startPress, { passive: true });
    element.addEventListener("touchend", cancelPress);
    element.addEventListener("touchmove", cancelPress);
  }
  // 拍一拍功能
  async handlePat(msg) {
    const win = window;
    const state = win.STATE;
    const db = win.DB;
    if (isSelectionMode || !state?.state?.activeChatId) return;
    const chat = state.state.chats[state.state.activeChatId];
    const patterName = chat.isGroup ? chat.settings.myNickname || "我" : "你";
    let patteeName, patteeSuffix;
    if (msg.role === "user") {
      patteeName = chat.isGroup ? `自己` : "自己";
      patteeSuffix = chat.settings.myPatSuffix || "";
    } else {
      if (chat.isGroup) {
        const member = chat.members?.find((m) => m.name === msg.senderName);
        patteeName = `"${msg.senderName}"`;
        patteeSuffix = member ? member.patSuffix || "" : "";
      } else {
        patteeName = `"${chat.name}"`;
        patteeSuffix = chat.settings.aiPatSuffix || "";
      }
    }
    if (chat.isGroup && msg.role === "user" && chat.settings.myNickname === msg.senderName) {
      patteeName = "自己";
    }
    const patMessageContent = `${patterName}拍了拍${patteeName}${patteeSuffix || ""}`;
    const patMessage = {
      type: "pat",
      content: patMessageContent,
      timestamp: Date.now(),
      role: "user"
    };
    chat.history.push(patMessage);
    await db.db.chats.put(chat);
    this.appendMessage(patMessage, chat);
  }
  // 聊天列表渲染
  renderChatList() {
    const win = window;
    const state = win.STATE;
    const avatars = this.getDefaultAvatars();
    const constants = this.getConstants();
    const STICKER_REGEX = constants.STICKER_REGEX || /^(https:\/\/i\.postimg\.cc\/.+|data:image)/;
    if (!state?.state) {
      console.error("聊天列表渲染：状态管理不可用");
      return;
    }
    const chatListEl = document.getElementById("chat-list");
    if (!chatListEl) {
      console.error("聊天列表渲染：chat-list元素不存在");
      return;
    }
    chatListEl.innerHTML = "";
    if (Object.keys(state.state.chats).length === 0) {
      chatListEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 或群组图标添加聊天</p>';
      return;
    }
    Object.values(state.state.chats).sort((a, b) => (b.history.slice(-1)[0]?.timestamp || 0) - (a.history.slice(-1)[0]?.timestamp || 0)).forEach((chat) => {
      const lastMsgObj = chat.history.slice(-1)[0] || {};
      let lastMsgDisplay;
      if (lastMsgObj.type === "transfer") {
        lastMsgDisplay = "[转账]";
      } else if (lastMsgObj.type === "ai_image" || lastMsgObj.type === "user_photo") {
        lastMsgDisplay = "[照片]";
      } else if (lastMsgObj.type === "voice_message") {
        lastMsgDisplay = "[语音]";
      } else if (typeof lastMsgObj.content === "string" && STICKER_REGEX.test(lastMsgObj.content)) {
        lastMsgDisplay = lastMsgObj.meaning ? `[表情: ${lastMsgObj.meaning}]` : "[表情]";
      } else if (Array.isArray(lastMsgObj.content)) {
        lastMsgDisplay = `[图片]`;
      } else {
        lastMsgDisplay = String(lastMsgObj.content || "...").substring(0, 20);
      }
      if (chat.isGroup && lastMsgObj.senderName) {
        lastMsgDisplay = `${lastMsgObj.senderName}: ${lastMsgDisplay}`;
      }
      const item = document.createElement("div");
      item.className = "chat-list-item";
      item.dataset.chatId = chat.id;
      const avatar = chat.isGroup ? chat.settings.groupAvatar : chat.settings.aiAvatar;
      item.innerHTML = `<img src="${avatar || avatars.defaultAvatar}" class="avatar"><div class="info"><div class="name-line"><span class="name">${chat.name}</span>${chat.isGroup ? '<span class="group-tag">群聊</span>' : ""}</div><div class="last-msg">${lastMsgDisplay}</div></div>`;
      item.addEventListener("click", async () => {
        this.openChat(chat.id);
      });
      this.addLongPressListener(item, async (e) => {
        const confirmed = await this.showCustomConfirm("删除对话", `确定要删除与 "${chat.name}" 的整个对话吗？此操作不可撤销。`, { confirmButtonClass: "btn-danger" });
        if (confirmed) {
          try {
            const musicState = state.musicState;
            if (musicState?.isActive && musicState.activeChatId === chat.id) {
              await this.endListenTogetherSession(false);
            }
            delete state.state.chats[chat.id];
            if (state.state.activeChatId === chat.id) state.state.activeChatId = null;
            await win.DB.db.chats.delete(chat.id);
            this.renderChatList();
          } catch (error) {
            console.error("删除聊天失败:", error);
            alert("删除失败，请稍后再试。");
          }
        }
      });
      chatListEl.appendChild(item);
    });
    console.log("聊天列表已渲染，共", Object.keys(state.state.chats).length, "个聊天");
  }
  // 聊天界面渲染
  renderChatInterface(chatId) {
    const win = window;
    const state = win.STATE;
    const constants = this.getConstants();
    const MESSAGE_RENDER_WINDOW = constants.MESSAGE_RENDER_WINDOW || 50;
    if (!state?.state || !state.state.chats[chatId]) {
      console.error("聊天界面渲染：聊天不存在", chatId);
      return;
    }
    const chat = state.state.chats[chatId];
    this.exitSelectionMode();
    const messagesContainer = document.getElementById("chat-messages");
    if (!messagesContainer) {
      console.error("聊天界面渲染：chat-messages元素不存在");
      return;
    }
    messagesContainer.dataset.theme = chat.settings.theme || "default";
    const headerTitle = document.getElementById("chat-header-title");
    if (headerTitle) {
      headerTitle.textContent = chat.name;
    }
    messagesContainer.innerHTML = "";
    const chatScreen = document.getElementById("chat-interface-screen");
    if (chatScreen) {
      chatScreen.style.backgroundImage = chat.settings.background ? `url(${chat.settings.background})` : "none";
      chatScreen.style.backgroundColor = chat.settings.background ? "transparent" : "#f0f2f5";
    }
    const history = chat.history;
    const totalMessages = history.length;
    currentRenderedCount = 0;
    const initialMessages = history.slice(-MESSAGE_RENDER_WINDOW);
    initialMessages.forEach((msg) => this.appendMessage(msg, chat, true));
    currentRenderedCount = initialMessages.length;
    if (totalMessages > currentRenderedCount) {
      this.prependLoadMoreButton(messagesContainer);
    }
    const typingIndicator = document.createElement("div");
    typingIndicator.id = "typing-indicator";
    typingIndicator.style.display = "none";
    typingIndicator.textContent = "对方正在输入...";
    messagesContainer.appendChild(typingIndicator);
    setTimeout(() => messagesContainer.scrollTop = messagesContainer.scrollHeight, 0);
    console.log("聊天界面已渲染:", chat.name);
  }
  // 添加"加载更多"按钮
  prependLoadMoreButton(container) {
    const button = document.createElement("button");
    button.id = "load-more-btn";
    button.textContent = "加载更早的记录";
    button.addEventListener("click", () => this.loadMoreMessages());
    container.prepend(button);
  }
  // 加载更多消息
  loadMoreMessages() {
    const win = window;
    const state = win.STATE;
    const constants = this.getConstants();
    const MESSAGE_RENDER_WINDOW = constants.MESSAGE_RENDER_WINDOW || 50;
    const messagesContainer = document.getElementById("chat-messages");
    const chat = state?.state?.chats[state.state.activeChatId];
    if (!chat || !messagesContainer) return;
    const loadMoreBtn = document.getElementById("load-more-btn");
    if (loadMoreBtn) loadMoreBtn.remove();
    const totalMessages = chat.history.length;
    const nextSliceStart = totalMessages - currentRenderedCount - MESSAGE_RENDER_WINDOW;
    const nextSliceEnd = totalMessages - currentRenderedCount;
    const messagesToPrepend = chat.history.slice(Math.max(0, nextSliceStart), nextSliceEnd);
    const oldScrollHeight = messagesContainer.scrollHeight;
    messagesToPrepend.reverse().forEach((msg) => this.prependMessage(msg, chat));
    currentRenderedCount += messagesToPrepend.length;
    const newScrollHeight = messagesContainer.scrollHeight;
    messagesContainer.scrollTop += newScrollHeight - oldScrollHeight;
    if (totalMessages > currentRenderedCount) {
      this.prependLoadMoreButton(messagesContainer);
    }
  }
  // 前置添加消息
  prependMessage(msg, chat) {
    const messagesContainer = document.getElementById("chat-messages");
    if (!messagesContainer) return;
    const messageEl = this.createMessageElement(msg, chat);
    const loadMoreBtn = document.getElementById("load-more-btn");
    if (loadMoreBtn) {
      messagesContainer.insertBefore(messageEl, loadMoreBtn.nextSibling);
    } else {
      messagesContainer.prepend(messageEl);
    }
  }
  // 追加消息
  appendMessage(msg, chat, isInitialLoad = false) {
    const messagesContainer = document.getElementById("chat-messages");
    if (!messagesContainer) return;
    const messageEl = this.createMessageElement(msg, chat);
    const typingIndicator = document.getElementById("typing-indicator");
    messagesContainer.insertBefore(messageEl, typingIndicator);
    if (!isInitialLoad) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      currentRenderedCount++;
    }
  }
  // 打开聊天
  openChat(chatId) {
    const win = window;
    const state = win.STATE;
    if (!state) return;
    state.setActiveChatId(chatId);
    this.renderChatInterface(chatId);
    if (win.showScreen) {
      win.showScreen("chat-interface-screen");
    }
  }
  // AI响应解析
  parseAiResponse(content) {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
    }
    try {
      const match = content.match(/\[(.*?)\]/s);
      if (match && match[0]) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
    }
    const lines = content.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("```"));
    if (lines.length > 0) return lines;
    return [content];
  }
  // 选择模式管理
  enterSelectionMode(initialMsgTimestamp) {
    if (isMessageEditMode) {
      this.exitMessageEditMode(false);
    }
    if (isSelectionMode) return;
    isSelectionMode = true;
    const chatScreen = document.getElementById("chat-interface-screen");
    if (chatScreen) {
      chatScreen.classList.add("selection-mode");
    }
    this.toggleMessageSelection(initialMsgTimestamp);
  }
  exitSelectionMode() {
    if (!isSelectionMode) return;
    isSelectionMode = false;
    const chatScreen = document.getElementById("chat-interface-screen");
    if (chatScreen) {
      chatScreen.classList.remove("selection-mode");
    }
    selectedMessages.forEach((ts) => {
      const bubble = document.querySelector(`.message-bubble[data-timestamp="${ts}"]`);
      if (bubble) bubble.classList.remove("selected");
    });
    selectedMessages.clear();
  }
  toggleMessageSelection(timestamp) {
    const bubble = document.querySelector(`.message-bubble[data-timestamp="${timestamp}"]`);
    if (!bubble) return;
    if (selectedMessages.has(timestamp)) {
      selectedMessages.delete(timestamp);
      bubble.classList.remove("selected");
    } else {
      selectedMessages.add(timestamp);
      bubble.classList.add("selected");
    }
    const selectionCount = document.getElementById("selection-count");
    if (selectionCount) {
      selectionCount.textContent = `已选 ${selectedMessages.size} 条`;
    }
    if (selectedMessages.size === 0) {
      this.exitSelectionMode();
    }
  }
  // 消息编辑模式
  async exitMessageEditMode(shouldSave = false) {
    if (!isMessageEditMode) return;
    const editBtnImg = document.querySelector("#edit-messages-btn img");
    if (editBtnImg) {
      editBtnImg.src = "https://i.postimg.cc/V60TWbGr/image.png";
      editBtnImg.alt = "编辑";
    }
    const editBtn = document.querySelector("#edit-messages-btn");
    if (editBtn) {
      editBtn.title = "编辑消息";
    }
    const win = window;
    const state = win.STATE;
    const db = win.DB;
    let changesMade = false;
    if (shouldSave && state?.state && db) {
      const chat = state.state.chats[state.state.activeChatId];
      if (chat) {
        document.querySelectorAll(".message-bubble .content.editable").forEach((contentEl) => {
          const timestamp = parseInt(contentEl.closest(".message-bubble").dataset.timestamp, 10);
          const newContent = contentEl.innerHTML;
          const message = chat.history.find((msg) => msg.timestamp === timestamp);
          if (message && message.content !== newContent) {
            message.content = newContent;
            changesMade = true;
          }
        });
        if (changesMade) {
          await db.db.chats.put(chat);
          if (win.showCustomAlert) {
            win.showCustomAlert("保存成功", "消息已更新。");
          }
        }
      }
    }
    document.querySelectorAll(".message-bubble .content.editable").forEach((contentEl) => {
      contentEl.contentEditable = "false";
      contentEl.classList.remove("editable");
    });
    isMessageEditMode = false;
  }
  enterMessageEditMode() {
    if (isMessageEditMode) return;
    const editBtnImg = document.querySelector("#edit-messages-btn img");
    if (editBtnImg) {
      editBtnImg.src = "https://i.postimg.cc/GtrQTBZ1/image.png";
      editBtnImg.alt = "保存";
    }
    const editBtn = document.querySelector("#edit-messages-btn");
    if (editBtn) {
      editBtn.title = "保存编辑";
    }
    document.querySelectorAll(".message-bubble:not(.system-message-container) .content").forEach((contentEl) => {
      const bubble = contentEl.closest(".message-bubble");
      if (bubble && !bubble.classList.contains("is-sticker") && !bubble.classList.contains("is-voice-message") && !bubble.classList.contains("is-transfer") && !bubble.classList.contains("is-ai-image") && !bubble.classList.contains("has-image")) {
        contentEl.contentEditable = "true";
        contentEl.classList.add("editable");
      }
    });
    isMessageEditMode = true;
    const win = window;
    if (win.showCustomAlert) {
      win.showCustomAlert("进入编辑模式", '您现在可以点击消息气泡来编辑其内容。完成后，请再次点击"保存"按钮。');
    }
  }
  async toggleMessageEditMode() {
    const win = window;
    const state = win.STATE;
    if (!state?.state?.activeChatId) return;
    if (isMessageEditMode) {
      await this.exitMessageEditMode(true);
    } else {
      this.enterMessageEditMode();
    }
  }
  // 表情包面板渲染
  renderStickerPanel() {
    const win = window;
    const state = win.STATE;
    if (!state?.state) return;
    const grid = document.getElementById("sticker-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (state.state.userStickers.length === 0) {
      grid.innerHTML = '<p style="text-align:center; color: var(--text-secondary); grid-column: 1 / -1;">大人请点击右上角"添加"或"上传"来添加你的第一个表情吧！</p>';
      return;
    }
    state.state.userStickers.forEach((sticker) => {
      const item = document.createElement("div");
      item.className = "sticker-item";
      item.style.backgroundImage = `url(${sticker.url})`;
      item.title = sticker.name;
      item.addEventListener("click", () => this.sendSticker(sticker));
      this.addLongPressListener(item, () => {
        if (isSelectionMode) return;
        const existingDeleteBtn = item.querySelector(".delete-btn");
        if (existingDeleteBtn) return;
        const deleteBtn = document.createElement("div");
        deleteBtn.className = "delete-btn";
        deleteBtn.innerHTML = "&times;";
        deleteBtn.onclick = async (e) => {
          e.stopPropagation();
          const confirmed = await this.showCustomConfirm("删除表情", `确定要删除表情 "${sticker.name}" 吗？`, { confirmButtonClass: "btn-danger" });
          if (confirmed) {
            await win.DB.db.userStickers.delete(sticker.id);
            state.state.userStickers = state.state.userStickers.filter((s) => s.id !== sticker.id);
            this.renderStickerPanel();
          }
        };
        item.appendChild(deleteBtn);
        deleteBtn.style.display = "block";
        setTimeout(() => item.addEventListener("mouseleave", () => deleteBtn.remove(), { once: true }), 3e3);
      });
      grid.appendChild(item);
    });
  }
  // 发送表情
  async sendSticker(sticker) {
    const win = window;
    const state = win.STATE;
    const db = win.DB;
    if (!state?.state?.activeChatId) return;
    const chat = state.state.chats[state.state.activeChatId];
    const msg = {
      role: "user",
      content: sticker.url,
      meaning: sticker.name,
      timestamp: Date.now()
    };
    chat.history.push(msg);
    await db.db.chats.put(chat);
    this.appendMessage(msg, chat);
    this.renderChatList();
    const stickerPanel = document.getElementById("sticker-panel");
    if (stickerPanel) {
      stickerPanel.classList.remove("visible");
    }
  }
  // 发送用户转账
  async sendUserTransfer() {
    const win = window;
    const state = win.STATE;
    const db = win.DB;
    if (!state?.state?.activeChatId) return;
    const amountInput = document.getElementById("transfer-amount");
    const noteInput = document.getElementById("transfer-note");
    if (!amountInput || !noteInput) return;
    const amount = parseFloat(amountInput.value);
    const note = noteInput.value.trim();
    if (isNaN(amount) || amount < 0 || amount > 9999) {
      alert("请输入有效的金额 (0 到 9999 之间)！");
      return;
    }
    const chat = state.state.chats[state.state.activeChatId];
    const senderName = chat.isGroup ? chat.settings.myNickname || "我" : "我";
    const receiverName = chat.isGroup ? "群聊" : chat.name;
    const msg = {
      role: "user",
      type: "transfer",
      content: "",
      senderName,
      receiverName,
      timestamp: Date.now()
    };
    msg.amount = amount;
    msg.note = note;
    chat.history.push(msg);
    await db.db.chats.put(chat);
    this.appendMessage(msg, chat);
    this.renderChatList();
    const transferModal = document.getElementById("transfer-modal");
    if (transferModal) {
      transferModal.classList.remove("visible");
    }
    amountInput.value = "";
    noteInput.value = "";
  }
  // AI响应触发 - 委托给专用的AI响应模块
  async triggerAiResponse() {
    const win = window;
    console.log("Chat模块：委托给AI响应模块处理");
    if (win.SCREENS?.aiResponseModule?.triggerAiResponse) {
      return await win.SCREENS.aiResponseModule.triggerAiResponse();
    } else {
      console.error("AI响应模块未找到，请检查模块加载");
      alert("AI响应功能暂时不可用，请刷新页面重试");
    }
  }
  // 辅助函数
  async showCustomConfirm(title, message, options = {}) {
    const win = window;
    if (win.showCustomConfirm) {
      return win.showCustomConfirm(title, message, options);
    }
    return confirm(message);
  }
  showCustomAlert(title, message) {
    const win = window;
    if (win.showCustomAlert) {
      win.showCustomAlert(title, message);
    } else {
      alert(message);
    }
  }
  async endListenTogetherSession(saveState = true) {
    const win = window;
    if (win.endListenTogetherSession) {
      return win.endListenTogetherSession(saveState);
    }
  }
  showNotification(chatId, messageContent) {
    const win = window;
    if (win.UIService && win.UIService.showNotification) {
      win.UIService.showNotification(chatId, messageContent);
    }
  }
  // 模块状态访问器
  getIsSelectionMode() {
    return isSelectionMode;
  }
  getSelectedMessages() {
    return new Set(selectedMessages);
  }
  getIsMessageEditMode() {
    return isMessageEditMode;
  }
  getCurrentRenderedCount() {
    return currentRenderedCount;
  }
}
const chatScreenModule = new ChatScreenModule();
if (typeof window !== "undefined") {
  const win = window;
  win.ChatModule = chatScreenModule;
  win.renderChatList = () => chatScreenModule.renderChatList();
  win.renderChatInterface = (chatId) => chatScreenModule.renderChatInterface(chatId);
  win.openChat = (chatId) => chatScreenModule.openChat(chatId);
  win.createMessageElement = (msg, chat) => chatScreenModule.createMessageElement(msg, chat);
  win.appendMessage = (msg, chat, isInitialLoad) => chatScreenModule.appendMessage(msg, chat, isInitialLoad);
  win.formatTimestamp = (timestamp) => chatScreenModule.formatTimestamp(timestamp);
  win.triggerAiResponse = () => chatScreenModule.triggerAiResponse();
  win.parseAiResponse = (content) => chatScreenModule.parseAiResponse(content);
  win.handlePat = (msg) => chatScreenModule.handlePat(msg);
  win.enterSelectionMode = (timestamp) => chatScreenModule.enterSelectionMode(timestamp);
  win.exitSelectionMode = () => chatScreenModule.exitSelectionMode();
  win.toggleMessageSelection = (timestamp) => chatScreenModule.toggleMessageSelection(timestamp);
  win.enterMessageEditMode = () => chatScreenModule.enterMessageEditMode();
  win.exitMessageEditMode = (shouldSave) => chatScreenModule.exitMessageEditMode(shouldSave);
  win.toggleMessageEditMode = () => chatScreenModule.toggleMessageEditMode();
  win.renderStickerPanel = () => chatScreenModule.renderStickerPanel();
  win.sendSticker = (sticker) => chatScreenModule.sendSticker(sticker);
  win.sendUserTransfer = () => chatScreenModule.sendUserTransfer();
  win.getIsSelectionMode = () => chatScreenModule.getIsSelectionMode();
  win.getSelectedMessages = () => chatScreenModule.getSelectedMessages();
  win.getIsMessageEditMode = () => chatScreenModule.getIsMessageEditMode();
  win.getCurrentRenderedCount = () => chatScreenModule.getCurrentRenderedCount();
}
console.log("聊天模块(TypeScript版)已初始化");
class AiResponseModule {
  // 触发AI响应
  async triggerAiResponse() {
    const win = window;
    const state = win.STATE;
    const musicState = win.STATE?.musicState;
    const myAddress = (typeof win.myAddress === "function" ? win.myAddress() : win.STATE?.myAddress) || "位置未知";
    console.log("=== AI响应触发调试 ===");
    console.log("myAddress函数类型:", typeof win.myAddress);
    console.log("STATE.myAddress:", win.STATE?.myAddress);
    console.log("最终地址值:", myAddress);
    if (!state?.state?.activeChatId) return;
    const chatId = state.state.activeChatId;
    const chat = state.state.chats[chatId];
    const typingIndicator = document.getElementById("typing-indicator");
    if (typingIndicator) {
      typingIndicator.style.display = "block";
    }
    const apiConfig = state.state.apiConfig;
    const { proxyUrl: rawProxyUrl, apiKey, model } = apiConfig;
    if (!rawProxyUrl || !apiKey || !model) {
      alert("请先在API设置中配置反代地址、密钥并选择模型。");
      if (typingIndicator) {
        typingIndicator.style.display = "none";
      }
      return;
    }
    let proxyUrl = rawProxyUrl ? rawProxyUrl.trim() : "";
    if (proxyUrl.endsWith("/")) {
      proxyUrl = proxyUrl.slice(0, -1);
    }
    if (proxyUrl.endsWith("/v1")) {
      proxyUrl = proxyUrl.slice(0, -3);
    }
    const now = /* @__PURE__ */ new Date();
    const currentTime = now.toLocaleTimeString("zh-CN", { hour: "numeric", minute: "numeric", hour12: true });
    let addressForTemplate = "";
    if (state.state.globalSettings.enableGeolocation && myAddress !== "位置未知" && myAddress !== "位置获取失败") {
      addressForTemplate = myAddress;
    }
    if (state.state.globalSettings.enableGeolocation && myAddress !== "位置未知" && myAddress !== "位置获取失败") ;
    let worldBookContent = "";
    if (chat.settings.linkedWorldBookIds && chat.settings.linkedWorldBookIds.length > 0) {
      const linkedContents = chat.settings.linkedWorldBookIds.map((bookId) => {
        const worldBook = state.state.worldBooks.find((wb) => wb.id === bookId);
        return worldBook && worldBook.content ? `

## 世界书: ${worldBook.name}
${worldBook.content}` : "";
      }).filter(Boolean).join("");
      if (linkedContents) {
        worldBookContent = `

# 核心世界观设定 (必须严格遵守以下所有设定)
${linkedContents}
`;
      }
    }
    let musicContext = "";
    if (musicState?.isActive && musicState.activeChatId === chatId && musicState.currentIndex > -1) {
      const currentTrack = musicState.playlist[musicState.currentIndex];
      musicContext = `

# 当前情景
你正在和用户一起听歌。当前播放的歌曲是：${currentTrack.title} - ${currentTrack.artist}。请在对话中自然地融入这个情境。
`;
    }
    let systemPrompt;
    let messagesPayload;
    const maxMemory = parseInt(String(chat.settings.maxMemory)) || 10;
    const historySlice = chat.history.slice(-maxMemory);
    const activePreset = win.getActivePreset();
    const constants = win.CONSTANTS;
    const DEFAULT_PROMPT_IMAGE = constants?.DEFAULT_PROMPT_IMAGE || "默认图片提示词";
    const DEFAULT_PROMPT_VOICE = constants?.DEFAULT_PROMPT_VOICE || "默认语音提示词";
    const DEFAULT_PROMPT_TRANSFER = constants?.DEFAULT_PROMPT_TRANSFER || "默认转账提示词";
    const DEFAULT_PROMPT_SINGLE = constants?.DEFAULT_PROMPT_SINGLE || "默认单聊提示词";
    const DEFAULT_PROMPT_GROUP = constants?.DEFAULT_PROMPT_GROUP || "默认群聊提示词";
    const aiImageInstructions = activePreset?.promptImage || DEFAULT_PROMPT_IMAGE;
    const aiVoiceInstructions = activePreset?.promptVoice || DEFAULT_PROMPT_VOICE;
    const transferInstructions = activePreset?.promptTransfer || DEFAULT_PROMPT_TRANSFER;
    console.log("=== AI响应调试信息 ===");
    console.log("地理位置开关:", state.state.globalSettings.enableGeolocation);
    console.log("原始地址:", myAddress);
    console.log("模板地址:", addressForTemplate);
    console.log("聊天类型:", chat.isGroup ? "群聊" : "单聊");
    if (chat.isGroup && chat.members) {
      const membersList = chat.members.map((m) => `- **${m.name}**: ${m.persona}`).join("\n");
      const myNickname = chat.settings.myGroupNickname || "我";
      const groupAiImageInstructions = `
# 发送图片的能力
- 群成员无法真正发送图片文件。但当用户要求某位成员发送照片，或者某个成员想通过图片来表达时，该成员可以发送一张"文字描述的图片"。
- 若要发送图片，请在你的回复JSON数组中，为该角色单独发送一个特殊的对象，格式为：\`{"name": "角色名", "type": "ai_image", "description": "这里是对图片的详细文字描述..."}\`。描述应该符合该角色的性格和当时的语境。`;
      const groupAiVoiceInstructions = `
# 发送语音的能力
- 群成员同样可以发送"模拟语音消息"。
- 若要发送语音，请为该角色单独发送一个特殊的对象，格式为：\`{"name": "角色名", "type": "voice_message", "content": "这里是语音的文字内容..."}\`。当历史记录中出现 "[角色名 发送了一条语音，内容是：'xxx']" 时，代表该角色用语音说了'xxx'。其他角色应该对此内容做出回应。`;
      let baseGroupPrompt = activePreset?.promptGroup || DEFAULT_PROMPT_GROUP;
      console.log("myAddress:", addressForTemplate);
      systemPrompt = baseGroupPrompt.replace("{myAddress}", addressForTemplate).replace("{worldBookContent}", worldBookContent).replace("{musicContext}", musicContext).replace("{currentTime}", currentTime).replace("{chat.settings.myPersona}", chat.settings.myPersona || "").replace(/{myNickname}/g, myNickname).replace("{groupAiImageInstructions}", groupAiImageInstructions).replace("{groupAiVoiceInstructions}", groupAiVoiceInstructions).replace("{membersList}", membersList);
      messagesPayload = historySlice.map((msg) => {
        if (msg.type === "pat") {
          return { role: "user", content: `[拍一拍 ${msg.content}]` };
        }
        const sender = msg.role === "user" ? chat.settings.myGroupNickname || "我" : msg.senderName;
        let content;
        if (msg.type === "user_photo") content = `[${sender} 发送了一张描述的照片，内容是：'${msg.content}']`;
        else if (msg.type === "ai_image") content = `[${sender} 发送了一张图片]`;
        else if (msg.type === "voice_message") content = `[${sender} 发送了一条语音，内容是：'${msg.content}']`;
        else if (msg.type === "transfer") content = `[${msg.senderName}向${msg.receiverName}转账 ${msg.amount}元, 备注: ${msg.note}]`;
        else if (msg.meaning) content = `${sender}: [发送了一个表情，意思是: '${msg.meaning}']`;
        else if (Array.isArray(msg.content)) content = [...msg.content, { type: "text", text: `${sender}:` }];
        else content = `${sender}: ${msg.content}`;
        return { role: "user", content };
      });
    } else {
      let baseSinglePrompt = activePreset?.promptSingle || DEFAULT_PROMPT_SINGLE;
      systemPrompt = baseSinglePrompt.replace("{myAddress}", addressForTemplate).replace(/{chat.name}/g, chat.name).replace(/{currentTime}/g, currentTime).replace("{worldBookContent}", worldBookContent).replace("{musicContext}", musicContext).replace(/{chat.settings.aiPersona}/g, chat.settings.aiPersona || "").replace(/{chat.settings.myPersona}/g, chat.settings.myPersona || "").replace("{aiImageInstructions}", aiImageInstructions).replace("{aiVoiceInstructions}", aiVoiceInstructions).replace("{transferInstructions}", transferInstructions);
      messagesPayload = historySlice.map((msg) => {
        if (msg.type === "pat") {
          return { role: "user", content: `[拍一拍 ${msg.content}]` };
        }
        if (msg.type === "user_photo") return {
          role: "user",
          content: `[你收到了一张用户描述的照片，照片内容是：'${msg.content}']`
        };
        if (msg.type === "ai_image") return {
          role: "assistant",
          content: JSON.stringify({ type: "ai_image", description: msg.content })
        };
        if (msg.type === "voice_message") {
          if (msg.role === "user") return {
            role: "user",
            content: `[用户发来一条语音消息，内容是：'${msg.content}']`
          };
          else return {
            role: "assistant",
            content: JSON.stringify({ type: "voice_message", content: msg.content })
          };
        }
        if (msg.type === "transfer") {
          if (msg.role === "user") return {
            role: "user",
            content: `[你收到了来自用户的转账: ${msg.amount}元, 备注: ${msg.note}]`
          };
          else return {
            role: "assistant",
            content: JSON.stringify({ type: "transfer", amount: msg.amount, note: msg.note })
          };
        }
        if (msg.role === "user" && msg.meaning) return {
          role: "user",
          content: `[用户发送了一个表情，意思是：'${msg.meaning}']`
        };
        if (typeof msg.content === "string" || Array.isArray(msg.content)) return {
          role: msg.role,
          content: msg.content
        };
        return null;
      }).filter(Boolean);
    }
    try {
      const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, ...messagesPayload],
          temperature: 0.8,
          stream: false
        })
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API Error: ${response.status} - ${errorData.error?.message || "Unknown error"}`);
      }
      const data = await response.json();
      const aiResponseContent = data.choices[0].message.content;
      const messagesArray = this.parseAiResponse(aiResponseContent);
      let notificationShown = false;
      const isViewingThisChat = document.getElementById("chat-interface-screen")?.classList.contains("active") && state.state.activeChatId === chatId;
      for (const msgData of messagesArray) {
        let aiMessage;
        const senderName = chat.isGroup ? msgData.name || "未知" : chat.name;
        const receiverName = chat.isGroup ? msgData.receiver || "我" : "我";
        if (typeof msgData === "object" && msgData.type === "voice_message") {
          aiMessage = {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: "assistant",
            type: "voice_message",
            content: msgData.content,
            sender: senderName,
            timestamp: Date.now()
          };
          aiMessage.senderName = senderName;
        } else if (typeof msgData === "object" && msgData.type === "ai_image") {
          aiMessage = {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: "assistant",
            type: "ai_image",
            content: msgData.description,
            sender: senderName,
            timestamp: Date.now()
          };
          aiMessage.senderName = senderName;
        } else if (typeof msgData === "object" && msgData.type === "transfer") {
          aiMessage = {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: "assistant",
            type: "transfer",
            content: "",
            sender: senderName,
            timestamp: Date.now()
          };
          aiMessage.senderName = senderName;
          aiMessage.receiverName = receiverName;
          aiMessage.amount = msgData.amount;
          aiMessage.note = msgData.note;
        } else if (chat.isGroup) {
          if (typeof msgData === "object" && msgData.name && msgData.message) {
            aiMessage = {
              id: `msg_${Date.now()}_${Math.random()}`,
              role: "assistant",
              content: String(msgData.message),
              sender: msgData.name,
              timestamp: Date.now()
            };
            aiMessage.senderName = msgData.name;
          } else continue;
        } else {
          aiMessage = {
            id: `msg_${Date.now()}_${Math.random()}`,
            role: "assistant",
            content: String(msgData),
            sender: chat.name,
            timestamp: Date.now()
          };
        }
        chat.history.push(aiMessage);
        await win.DB.db.chats.put(chat);
        if (isViewingThisChat) {
          win.ChatModule.appendMessage(aiMessage, chat);
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 800 + 300));
        }
        if (!isViewingThisChat && !notificationShown) {
          let notificationText;
          const STICKER_REGEX = constants?.STICKER_REGEX || /^(https:\/\/i\.postimg\.cc\/.+|data:image)/;
          if (aiMessage.type === "transfer") notificationText = `[收到一笔转账]`;
          else if (aiMessage.type === "ai_image") notificationText = `[图片]`;
          else if (aiMessage.type === "voice_message") notificationText = `[语音]`;
          else notificationText = STICKER_REGEX.test(String(aiMessage.content)) ? "[表情]" : String(aiMessage.content);
          const finalNotifText = chat.isGroup ? `${aiMessage.senderName}: ${notificationText}` : notificationText;
          this.showNotification(chatId, finalNotifText);
          notificationShown = true;
        }
      }
    } catch (error) {
      const errorContent = `[出错了: ${error.message}]`;
      const errorMessage = {
        id: `msg_${Date.now()}_${Math.random()}`,
        role: "assistant",
        content: errorContent,
        sender: chat.name,
        timestamp: Date.now()
      };
      if (chat) {
        chat.history.push(errorMessage);
        await win.DB.db.chats.put(chat);
        if (document.getElementById("chat-interface-screen")?.classList.contains("active")) {
          win.ChatModule.appendMessage(errorMessage, chat);
        }
      }
      console.error(error);
    } finally {
      if (typingIndicator) {
        typingIndicator.style.display = "none";
      }
      win.ChatModule.renderChatList();
    }
  }
  // 解析AI响应内容
  parseAiResponse(content) {
    if (!content || typeof content !== "string") return [content];
    try {
      const result = JSON.parse(content);
      if (Array.isArray(result)) return result;
      return [result];
    } catch (e) {
    }
    const arrayMatch = content.match(/\[(.*?)\]/s);
    if (arrayMatch) {
      try {
        const result = JSON.parse(arrayMatch[0]);
        if (Array.isArray(result)) return result;
        return [result];
      } catch (e) {
      }
    }
    const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.length > 1) {
      return lines;
    }
    return [content];
  }
  // 显示通知
  showNotification(chatId, messageContent) {
    const win = window;
    if (win.showNotification) {
      win.showNotification(chatId, messageContent);
    }
  }
}
const aiResponseModule = new AiResponseModule();
if (typeof window !== "undefined") {
  const win = window;
  win.AiResponseModule = aiResponseModule;
  win.triggerAiResponse = () => aiResponseModule.triggerAiResponse();
  win.parseAiResponse = (content) => aiResponseModule.parseAiResponse(content);
}
console.log("AI响应模块(TypeScript版)已初始化");
let editingWorldBookId = null;
let editingPresetId = null;
let newWallpaperBase64 = null;
class WorldBookScreen {
  render() {
    this.renderWorldBookScreen();
  }
  initListeners() {
    this.initWorldBookListeners();
  }
  // 渲染世界书列表屏幕
  renderWorldBookScreen() {
    const listEl = document.getElementById("world-book-list");
    const state = window.state;
    if (!state || !listEl) {
      console.error("世界书渲染：缺少必要的状态或DOM元素");
      return;
    }
    listEl.innerHTML = "";
    if (state.worldBooks.length === 0) {
      listEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 创建你的第一本世界书</p>';
      return;
    }
    state.worldBooks.forEach((book) => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.dataset.bookId = book.id;
      item.innerHTML = `<span>${book.name}</span>`;
      item.addEventListener("click", () => this.openWorldBookEditor(book.id));
      let longPressTimer;
      item.addEventListener("mousedown", () => {
        longPressTimer = window.setTimeout(async () => {
          const confirmed = await this.showCustomConfirm("删除世界书", `确定要删除世界书 "${book.name}" 吗？`, { confirmButtonClass: "btn-danger" });
          if (confirmed) {
            await this.deleteWorldBook(book.id);
          }
        }, 800);
      });
      item.addEventListener("mouseup", () => clearTimeout(longPressTimer));
      item.addEventListener("mouseleave", () => clearTimeout(longPressTimer));
      listEl.appendChild(item);
    });
    console.log("世界书屏幕已渲染，共", state.worldBooks.length, "本");
  }
  // 打开世界书编辑器
  openWorldBookEditor(bookId) {
    const state = window.state;
    if (!state) return;
    editingWorldBookId = bookId;
    const book = state.worldBooks.find((wb) => wb.id === bookId);
    if (!book) return;
    const titleEl = document.getElementById("world-book-editor-title");
    const nameInput = document.getElementById("world-book-name-input");
    const contentInput = document.getElementById("world-book-content-input");
    if (titleEl) titleEl.textContent = book.name;
    if (nameInput) nameInput.value = book.name;
    if (contentInput) contentInput.value = book.content;
    const showScreen = window.showScreen;
    if (showScreen) {
      showScreen("world-book-editor-screen");
    }
    console.log("打开世界书编辑器：", book.name);
  }
  // 创建新的世界书
  async createWorldBook() {
    const name = await this.showCustomPrompt("创建世界书", "请输入书名");
    if (!name || !name.trim()) return;
    const newBook = {
      id: "wb_" + Date.now(),
      name: name.trim(),
      content: ""
    };
    try {
      const saveWorldBook = window.saveWorldBook;
      if (saveWorldBook) {
        await saveWorldBook(newBook);
      }
      const addWorldBook = window.addWorldBook;
      if (addWorldBook) {
        addWorldBook(newBook);
      }
      this.renderWorldBookScreen();
      this.openWorldBookEditor(newBook.id);
      console.log("创建新世界书：", newBook.name);
    } catch (error) {
      console.error("创建世界书失败：", error);
      alert("创建失败，请重试");
    }
  }
  // 保存世界书
  async saveWorldBook() {
    if (!editingWorldBookId) return;
    const state = window.state;
    if (!state) return;
    const book = state.worldBooks.find((wb) => wb.id === editingWorldBookId);
    if (!book) return;
    const nameInput = document.getElementById("world-book-name-input");
    const contentInput = document.getElementById("world-book-content-input");
    if (!nameInput || !contentInput) return;
    const newName = nameInput.value.trim();
    if (!newName) {
      alert("书名不能为空！");
      return;
    }
    book.name = newName;
    book.content = contentInput.value;
    try {
      const saveWorldBook = window.saveWorldBook;
      if (saveWorldBook) {
        await saveWorldBook(book);
      }
      const titleEl = document.getElementById("world-book-editor-title");
      if (titleEl) titleEl.textContent = newName;
      editingWorldBookId = null;
      this.renderWorldBookScreen();
      const showScreen = window.showScreen;
      if (showScreen) {
        showScreen("world-book-screen");
      }
      console.log("保存世界书：", newName);
    } catch (error) {
      console.error("保存世界书失败：", error);
      alert("保存失败，请重试");
    }
  }
  // 删除世界书
  async deleteWorldBook(bookId) {
    const state = window.state;
    if (!state) return;
    try {
      const deleteWorldBook = window.deleteWorldBook;
      if (deleteWorldBook) {
        await deleteWorldBook(bookId);
      }
      const removeWorldBook = window.removeWorldBook;
      if (removeWorldBook) {
        removeWorldBook(bookId);
      }
      this.renderWorldBookScreen();
      console.log("删除世界书：", bookId);
    } catch (error) {
      console.error("删除世界书失败：", error);
      alert("删除失败，请重试");
    }
  }
  // 初始化世界书模块事件监听器
  initWorldBookListeners() {
    const addBtn = document.getElementById("add-world-book-btn");
    if (addBtn) {
      addBtn.addEventListener("click", () => this.createWorldBook());
    }
    const saveBtn = document.getElementById("save-world-book-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.saveWorldBook());
    }
    console.log("世界书模块事件监听器已初始化");
  }
  // 辅助函数
  showCustomPrompt(title, placeholder) {
    const fn = window.showCustomPrompt;
    return fn ? fn(title, placeholder) : Promise.resolve(prompt(title + ": " + placeholder));
  }
  showCustomConfirm(title, message, options = {}) {
    const fn = window.showCustomConfirm;
    return fn ? fn(title, message, options) : Promise.resolve(confirm(title + ": " + message));
  }
}
class PresetScreen {
  render() {
    this.renderPresetListScreen();
  }
  initListeners() {
    this.initPresetsListeners();
  }
  // 渲染预设列表屏幕
  async renderPresetListScreen() {
    const listEl = document.getElementById("preset-list");
    const state = window.state;
    if (!listEl || !state) {
      console.error("预设列表渲染：缺少必要的元素或状态");
      return;
    }
    listEl.innerHTML = "";
    if (state.presets.length === 0) {
      await this.initPresetsData();
      if (state.presets.length === 0) {
        listEl.innerHTML = '<p style="text-align:center; color: #8a8a8a; margin-top: 50px;">点击右上角 "+" 创建你的第一个预设</p>';
        return;
      }
    }
    state.presets.forEach((preset) => {
      const isActive = preset.id === state.globalSettings.activePresetId;
      const item = document.createElement("div");
      item.className = "preset-list-item";
      if (isActive) {
        item.classList.add("active");
      }
      item.innerHTML = `
        <div class="preset-info" data-preset-id="${preset.id}">
          <div class="preset-name">
            ${isActive ? '<span class="active-indicator">★</span>' : ""}
            ${preset.name}
          </div>
          <div class="preset-remark">${preset.remark || "无备注"}</div>
        </div>
        <div class="preset-actions">
          <button class="action-btn-small edit-preset-btn" data-preset-id="${preset.id}">编辑</button>
          <button class="action-btn-small set-active-preset-btn" data-preset-id="${preset.id}" ${isActive ? "disabled" : ""}>设为当前</button>
          ${state.presets.length > 1 ? `<button class="action-btn-small delete-preset-list-btn" data-preset-id="${preset.id}" style="color: #d9534f;">删除</button>` : ""}
        </div>
      `;
      listEl.appendChild(item);
    });
    console.log("预设列表屏幕已渲染，共", state.presets.length, "个预设");
  }
  // 打开预设编辑器
  openPresetEditor(presetId) {
    editingPresetId = presetId;
    const editorTitle = document.getElementById("preset-editor-title");
    const deleteBtn = document.getElementById("delete-preset-btn");
    const state = window.state;
    const constants = window.CONSTANTS;
    if (!state || !constants) {
      console.error("打开预设编辑器失败：缺少必要的状态或常量");
      return;
    }
    if (presetId) {
      const preset = state.presets.find((p) => p.id === presetId);
      if (!preset) return;
      if (editorTitle) editorTitle.textContent = `编辑预设: ${preset.name}`;
      document.getElementById("preset-name-input").value = preset.name;
      document.getElementById("preset-remark-input").value = preset.remark;
      document.getElementById("prompt-image-input").value = preset.promptImage;
      document.getElementById("prompt-voice-input").value = preset.promptVoice;
      document.getElementById("prompt-transfer-input").value = preset.promptTransfer;
      document.getElementById("prompt-single-input").value = preset.promptSingle;
      document.getElementById("prompt-group-input").value = preset.promptGroup;
      if (deleteBtn) deleteBtn.style.display = "block";
    } else {
      if (editorTitle) editorTitle.textContent = "新增预设";
      document.getElementById("preset-name-input").value = "";
      document.getElementById("preset-remark-input").value = "";
      document.getElementById("prompt-image-input").value = constants.DEFAULT_PROMPT_IMAGE;
      document.getElementById("prompt-voice-input").value = constants.DEFAULT_PROMPT_VOICE;
      document.getElementById("prompt-transfer-input").value = constants.DEFAULT_PROMPT_TRANSFER;
      document.getElementById("prompt-single-input").value = constants.DEFAULT_PROMPT_SINGLE;
      document.getElementById("prompt-group-input").value = constants.DEFAULT_PROMPT_GROUP;
      if (deleteBtn) deleteBtn.style.display = "none";
    }
    const showScreen = window.showScreen;
    if (showScreen) {
      showScreen("preset-editor-screen");
    }
    console.log("打开预设编辑器：", presetId ? "编辑" : "新增");
  }
  // 保存预设
  async savePreset() {
    const name = document.getElementById("preset-name-input").value.trim();
    if (!name) {
      alert("预设名称不能为空！");
      return;
    }
    const state = window.state;
    const savePreset = window.savePreset;
    if (!state || !savePreset) {
      console.error("保存预设失败：状态或数据库不可用");
      return;
    }
    const presetData = {
      name,
      remark: document.getElementById("preset-remark-input").value.trim(),
      promptImage: document.getElementById("prompt-image-input").value,
      promptVoice: document.getElementById("prompt-voice-input").value,
      promptTransfer: document.getElementById("prompt-transfer-input").value,
      promptSingle: document.getElementById("prompt-single-input").value,
      promptGroup: document.getElementById("prompt-group-input").value
    };
    try {
      let preset;
      if (editingPresetId) {
        const index = state.presets.findIndex((p) => p.id === editingPresetId);
        preset = { ...state.presets[index], ...presetData };
        state.presets[index] = preset;
      } else {
        preset = { id: "preset_" + Date.now(), ...presetData };
        state.presets.push(preset);
      }
      await savePreset(preset);
      editingPresetId = null;
      await this.renderPresetListScreen();
      const showScreen = window.showScreen;
      if (showScreen) {
        showScreen("preset-list-screen");
      }
      console.log("预设保存成功：", name);
    } catch (error) {
      console.error("保存预设失败：", error);
      alert("保存失败，请重试");
    }
  }
  // 初始化预设数据
  async initPresetsData() {
    const state = window.state;
    const savePreset = window.savePreset;
    const constants = window.CONSTANTS;
    if (!state || !savePreset || !constants) {
      console.error("初始化预设数据失败：缺少必要依赖");
      return;
    }
    try {
      if (state.presets.length === 0) {
        const defaultPreset = {
          id: "preset_" + Date.now(),
          name: "默认预设",
          remark: "系统内置的默认AI行为预设。",
          promptImage: constants.DEFAULT_PROMPT_IMAGE,
          promptVoice: constants.DEFAULT_PROMPT_VOICE,
          promptTransfer: constants.DEFAULT_PROMPT_TRANSFER,
          promptSingle: constants.DEFAULT_PROMPT_SINGLE,
          promptGroup: constants.DEFAULT_PROMPT_GROUP
        };
        state.presets.push(defaultPreset);
        await savePreset(defaultPreset);
        const updateGlobalSettings = window.updateGlobalSettings;
        if (updateGlobalSettings) {
          await updateGlobalSettings({ activePresetId: defaultPreset.id });
        }
        console.log("创建默认预设：", defaultPreset.name);
      }
      console.log("预设数据初始化完成，共", state.presets.length, "个预设");
    } catch (error) {
      console.error("初始化预设数据失败：", error);
    }
  }
  // 初始化预设模块事件监听器
  initPresetsListeners() {
    const addBtn = document.getElementById("add-preset-btn");
    if (addBtn) {
      addBtn.addEventListener("click", () => this.openPresetEditor(null));
    }
    const saveBtn = document.getElementById("save-preset-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.savePreset());
    }
    const presetList = document.getElementById("preset-list");
    if (presetList) {
      presetList.addEventListener("click", async (e) => {
        const target = e.target;
        const presetId = target.dataset.presetId;
        if (!presetId) return;
        if (target.classList.contains("edit-preset-btn")) {
          this.openPresetEditor(presetId);
          const showScreen = window.showScreen;
          if (showScreen) {
            showScreen("preset-editor-screen");
          }
        } else if (target.classList.contains("set-active-preset-btn")) {
          await this.setActivePreset(presetId);
        } else if (target.classList.contains("delete-preset-list-btn")) {
          await this.deletePreset(presetId);
        }
      });
    }
    console.log("预设模块事件监听器已初始化");
  }
  // 设置活跃预设
  async setActivePreset(presetId) {
    try {
      const state = window.state;
      const updateGlobalSettings = window.updateGlobalSettings;
      if (!state || !updateGlobalSettings) {
        console.error("设置活跃预设失败：缺少必要依赖");
        return;
      }
      await updateGlobalSettings({ activePresetId: presetId });
      await this.renderPresetListScreen();
      console.log("已设置活跃预设：", presetId);
    } catch (error) {
      console.error("设置活跃预设失败：", error);
      alert("设置失败，请重试");
    }
  }
  // 删除预设
  async deletePreset(presetId) {
    try {
      const state = window.state;
      const deletePreset = window.deletePreset;
      const showCustomConfirm = window.showCustomConfirm;
      if (!state || !deletePreset || !showCustomConfirm) {
        console.error("删除预设失败：缺少必要依赖");
        return;
      }
      if (state.presets.length <= 1) {
        alert("无法删除：至少需要保留一个预设");
        return;
      }
      const preset = state.presets.find((p) => p.id === presetId);
      if (!preset) {
        console.error("删除预设失败：找不到指定预设");
        return;
      }
      const confirmed = await showCustomConfirm(
        "删除预设",
        `确定要删除预设 "${preset.name}" 吗？此操作无法撤销。`,
        { confirmButtonClass: "btn-danger" }
      );
      if (confirmed) {
        await deletePreset(presetId);
        if (state.globalSettings.activePresetId === presetId) {
          const remainingPresets = state.presets.filter((p) => p.id !== presetId);
          if (remainingPresets.length > 0) {
            const updateGlobalSettings = window.updateGlobalSettings;
            if (updateGlobalSettings) {
              await updateGlobalSettings({ activePresetId: remainingPresets[0].id });
            }
          }
        }
        await this.renderPresetListScreen();
        console.log("预设删除成功：", preset.name);
      }
    } catch (error) {
      console.error("删除预设失败：", error);
      alert("删除失败，请重试");
    }
  }
  // 导出预设数据
  exportPresets() {
    const state = window.state;
    if (!state) {
      console.error("导出预设失败：状态管理模块未初始化");
      return;
    }
    const presets = state.presets;
    const activePresetId = state.globalSettings?.activePresetId;
    const exportData = {
      presets,
      activePresetId,
      exportTime: (/* @__PURE__ */ new Date()).toISOString()
    };
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `presets_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("预设数据已导出");
  }
  // 导入预设数据
  async importPresets(file) {
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      if (!importData.presets || !Array.isArray(importData.presets)) {
        throw new Error("导入文件格式错误");
      }
      const state = window.state;
      const db = window.DB?.db;
      if (!state || !db) {
        throw new Error("系统状态不可用");
      }
      const existingIds = new Set(state.presets.map((p) => p.id));
      const newPresets = importData.presets.filter((preset) => !existingIds.has(preset.id));
      for (const preset of newPresets) {
        state.presets.push(preset);
        await db.presets.put(preset);
      }
      if (importData.activePresetId && state.presets.find((p) => p.id === importData.activePresetId)) {
        const updateGlobalSettings = window.updateGlobalSettings;
        if (updateGlobalSettings) {
          await updateGlobalSettings({ activePresetId: importData.activePresetId });
        }
      }
      await this.renderPresetListScreen();
      alert(`成功导入 ${newPresets.length} 个新预设`);
      console.log("预设数据导入成功，新增预设：", newPresets.length);
    } catch (error) {
      console.error("导入预设失败：", error);
      alert("导入失败：" + error.message);
    }
  }
}
class ApiSettingsScreen {
  render() {
    this.renderApiSettingsScreen();
  }
  initListeners() {
    this.initApiSettingsListeners();
  }
  // 渲染API设置屏幕
  renderApiSettingsScreen() {
    const state = window.state;
    if (!state) {
      console.error("API设置渲染：状态管理模块未初始化");
      return;
    }
    document.getElementById("proxy-url").value = state.apiConfig.proxyUrl || "";
    document.getElementById("api-key").value = state.apiConfig.apiKey || "";
    const geoToggle = document.getElementById("geolocation-toggle");
    if (geoToggle) {
      geoToggle.checked = state.globalSettings.enableGeolocation || false;
    }
    const themeUrlInput = document.getElementById("remote-theme-url");
    if (themeUrlInput) {
      themeUrlInput.value = state.globalSettings.remoteThemeUrl || "";
    }
    console.log("API设置屏幕已渲染");
  }
  // 保存API设置
  async saveApiSettings() {
    const saveApiConfig = window.saveApiConfig;
    if (!saveApiConfig) {
      console.error("保存API设置失败：保存函数不可用");
      return;
    }
    try {
      const apiConfig = {
        proxyUrl: document.getElementById("proxy-url").value.trim(),
        apiKey: document.getElementById("api-key").value.trim(),
        model: document.getElementById("model-select").value
      };
      await saveApiConfig(apiConfig);
      alert("API设置已保存!");
      console.log("API设置已保存");
    } catch (error) {
      console.error("保存API设置失败:", error);
      alert("保存失败，请重试");
    }
  }
  // 获取模型列表
  async fetchModels() {
    let url = document.getElementById("proxy-url").value.trim();
    const key = document.getElementById("api-key").value.trim();
    if (!url || !key) {
      alert("请先填写反代地址和密钥");
      return;
    }
    if (url.endsWith("/")) {
      url = url.slice(0, -1);
    }
    if (url.endsWith("/v1")) {
      url = url.slice(0, -3);
    }
    try {
      const response = await fetch(`${url}/v1/models`, {
        headers: { "Authorization": `Bearer ${key}` }
      });
      if (!response.ok) {
        throw new Error("无法获取模型列表");
      }
      const data = await response.json();
      const modelSelect = document.getElementById("model-select");
      const state = window.state;
      modelSelect.innerHTML = "";
      data.data.forEach((model) => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = model.id;
        if (model.id === state?.apiConfig?.model) {
          option.selected = true;
        }
        modelSelect.appendChild(option);
      });
      alert("模型列表已更新");
      console.log("模型列表更新完成，共", data.data.length, "个模型");
    } catch (error) {
      console.error("拉取模型失败:", error);
      alert(`拉取模型失败: ${error.message}`);
    }
  }
  // 初始化API设置事件监听器
  initApiSettingsListeners() {
    const saveBtn = document.getElementById("save-api-settings-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.saveApiSettings());
    }
    const fetchBtn = document.getElementById("fetch-models-btn");
    if (fetchBtn) {
      fetchBtn.addEventListener("click", () => this.fetchModels());
    }
    const geoToggle = document.getElementById("geolocation-toggle");
    if (geoToggle) {
      geoToggle.addEventListener("change", async (e) => {
        const target = e.target;
        await this.updateGeolocationSetting(target.checked);
      });
    }
    const applyThemeBtn = document.getElementById("apply-remote-theme-btn");
    if (applyThemeBtn) {
      applyThemeBtn.addEventListener("click", () => this.applyRemoteTheme());
    }
    const resetThemeBtn = document.getElementById("reset-remote-theme-btn");
    if (resetThemeBtn) {
      resetThemeBtn.addEventListener("click", () => this.resetThemeToDefault());
    }
    const loadRemoteBtn = document.getElementById("load-remote-library-btn");
    if (loadRemoteBtn) {
      loadRemoteBtn.addEventListener("click", () => this.loadRemoteThemeLibrary());
    }
    const loadBuiltinBtn = document.getElementById("open-builtin-themes-btn");
    if (loadBuiltinBtn) {
      loadBuiltinBtn.addEventListener("click", () => this.loadBuiltinThemes());
    }
    const exportSettingsBtn = document.getElementById("export-settings-btn");
    if (exportSettingsBtn) {
      exportSettingsBtn.addEventListener("click", () => this.exportSettings());
    }
    const importSettingsBtn = document.getElementById("import-settings-btn");
    if (importSettingsBtn) {
      importSettingsBtn.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = (e) => {
          const file = e.target.files?.[0];
          if (file) {
            this.importSettings(file);
          }
        };
        input.click();
      });
    }
    console.log("API设置模块事件监听器已初始化");
  }
  // 更新地理位置设置
  async updateGeolocationSetting(enabled) {
    const win = window;
    const state = win.STATE?.state;
    const updateGlobalSettings = win.updateGlobalSettings;
    if (!state || !updateGlobalSettings) return;
    try {
      state.globalSettings.enableGeolocation = enabled;
      await updateGlobalSettings({ enableGeolocation: enabled });
      await this.updateGeolocation();
      console.log("地理位置设置已更新:", enabled);
    } catch (error) {
      console.error("更新地理位置设置失败:", error);
    }
  }
  // 地理位置获取函数
  async updateGeolocation() {
    const win = window;
    const state = win.STATE?.state;
    if (!state) return;
    const toggle = document.getElementById("geolocation-toggle");
    let myAddress = win.STATE?.myAddress || "位置未知";
    if (!state.globalSettings.enableGeolocation) {
      myAddress = "位置未知";
      if (toggle) toggle.checked = false;
      if (win.STATE?.setMyAddress) {
        win.STATE.setMyAddress(myAddress);
      }
      return;
    }
    if (toggle) toggle.checked = true;
    try {
      const geoResponse = await fetch("https://ipinfo.io/json");
      if (!geoResponse.ok) throw new Error("ipinfo.io request failed");
      const geoData = await geoResponse.json();
      if (geoData.city && geoData.region) {
        myAddress = `${geoData.country}, ${geoData.region}, ${geoData.city}`;
      } else {
        throw new Error("无法从ipinfo.io获取地理位置");
      }
    } catch (error) {
      console.error("Geolocation Error:", error);
      myAddress = "位置获取失败";
    }
    if (win.STATE?.setMyAddress) {
      win.STATE.setMyAddress(myAddress);
    }
  }
  // 主题相关函数
  async applyRemoteTheme() {
    const url = document.getElementById("remote-theme-url")?.value?.trim();
    if (!url) {
      alert("请输入远程主题的CSS URL！");
      return;
    }
    const win = window;
    const state = win.STATE?.state;
    const updateGlobalSettings = win.updateGlobalSettings;
    if (!state || !updateGlobalSettings) return;
    try {
      this.switchStylesheet(url);
      state.globalSettings.remoteThemeUrl = url;
      await updateGlobalSettings({ remoteThemeUrl: url });
      if (win.showCustomAlert) {
        await win.showCustomAlert("主题已更新", "远程主题已应用并保存。");
      } else {
        alert("主题已更新");
      }
      console.log("远程主题已应用:", url);
    } catch (error) {
      console.error("应用远程主题失败:", error);
      alert("应用主题失败，请检查URL是否有效");
    }
  }
  async resetThemeToDefault() {
    const win = window;
    const state = win.STATE?.state;
    const updateGlobalSettings = win.updateGlobalSettings;
    if (!state || !updateGlobalSettings) return;
    try {
      const remoteThemeUrlInput = document.getElementById("remote-theme-url");
      const remoteThemeLibraryUrlInput = document.getElementById("remote-theme-library-url");
      if (remoteThemeUrlInput) remoteThemeUrlInput.value = "";
      if (remoteThemeLibraryUrlInput) remoteThemeLibraryUrlInput.value = "";
      this.switchStylesheet("");
      state.globalSettings.remoteThemeUrl = "";
      await updateGlobalSettings({ remoteThemeUrl: "" });
      if (win.showCustomAlert) {
        await win.showCustomAlert("主题已重置", "已恢复为默认主题。");
      } else {
        alert("主题已重置");
      }
      console.log("主题已重置为默认");
    } catch (error) {
      console.error("重置主题失败:", error);
      alert("重置主题失败，请重试");
    }
  }
  async loadRemoteThemeLibrary() {
    const libraryUrl = document.getElementById("remote-theme-library-url")?.value?.trim();
    if (!libraryUrl) {
      alert("请输入远程主题库的URL！");
      return;
    }
    const win = window;
    if (win.openThemeListModal) {
      win.openThemeListModal(libraryUrl, "选择远程主题");
    } else {
      alert("主题库功能不可用");
    }
  }
  async loadBuiltinThemes() {
    const builtinThemeListUrl = "https://fastly.jsdelivr.net/gh/mxw13579/phone@release-v1.0.0.7/myPhone/themeList.json";
    const win = window;
    if (win.openThemeListModal) {
      win.openThemeListModal(builtinThemeListUrl, "选择内置主题");
    } else {
      alert("内置主题功能不可用");
    }
  }
  // 切换样式表函数
  switchStylesheet(url) {
    const stylesheet = document.getElementById("main-stylesheet");
    if (stylesheet) {
      if (url && url.trim() !== "") {
        stylesheet.href = url + "?v=" + Date.now();
      } else {
        stylesheet.href = "./unified-style.css";
      }
    }
  }
  // 初始化API设置模块数据（在应用启动时调用）
  async initApiSettingsModule() {
    await this.updateGeolocation();
    console.log("API设置模块数据初始化完成");
  }
  // 导出设置备份
  exportSettings() {
    const win = window;
    const state = win.STATE?.state;
    if (!state) {
      console.error("导出设置失败：状态管理模块未初始化");
      return;
    }
    const exportData = {
      apiConfig: state.apiConfig,
      globalSettings: state.globalSettings,
      exportTime: (/* @__PURE__ */ new Date()).toISOString(),
      version: "1.0.0"
    };
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `settings_backup_${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("设置备份已导出");
  }
  // 导入设置备份
  async importSettings(file) {
    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      if (!importData.apiConfig || !importData.globalSettings) {
        throw new Error("导入文件格式错误：缺少必要的设置数据");
      }
      const win = window;
      const state = win.STATE?.state;
      const db = win.DB?.db;
      if (!state || !db) {
        throw new Error("系统状态不可用");
      }
      const confirmed = await win.showCustomConfirm?.(
        "导入设置确认",
        "确定要导入设置吗？这将覆盖当前的API配置和全局设置。"
      ) ?? confirm("确定要导入设置吗？这将覆盖当前的API配置和全局设置。");
      if (!confirmed) return;
      Object.assign(state.apiConfig, importData.apiConfig);
      Object.assign(state.globalSettings, importData.globalSettings);
      const saveApiConfig = win.saveApiConfig;
      const updateGlobalSettings = win.updateGlobalSettings;
      if (saveApiConfig) {
        await saveApiConfig(state.apiConfig);
      }
      if (updateGlobalSettings) {
        await updateGlobalSettings(state.globalSettings);
      }
      this.renderApiSettingsScreen();
      if (importData.globalSettings.remoteThemeUrl) {
        this.switchStylesheet(importData.globalSettings.remoteThemeUrl);
      }
      alert("设置导入成功！");
      console.log("设置备份导入成功");
    } catch (error) {
      console.error("导入设置失败：", error);
      alert("导入失败：" + error.message);
    }
  }
}
class WallpaperScreen {
  render() {
    this.renderWallpaperScreen();
  }
  initListeners() {
    this.initWallpaperListeners();
  }
  // 渲染壁纸屏幕
  renderWallpaperScreen() {
    const preview = document.getElementById("wallpaper-preview");
    const state = window.state;
    if (!preview || !state) {
      console.error("壁纸渲染：缺少必要的元素或状态");
      return;
    }
    const bg = newWallpaperBase64 || state.globalSettings.wallpaper;
    if (bg && bg.startsWith("data:image")) {
      preview.style.backgroundImage = `url(${bg})`;
      preview.textContent = "";
    } else if (bg) {
      preview.style.backgroundImage = bg;
      preview.textContent = "当前为渐变色";
    } else {
      preview.style.backgroundImage = "linear-gradient(135deg, #89f7fe, #66a6ff)";
      preview.textContent = "默认渐变背景";
    }
    console.log("壁纸屏幕已渲染");
  }
  // 处理壁纸上传
  async handleWallpaperUpload(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      newWallpaperBase64 = dataUrl;
      this.renderWallpaperScreen();
      console.log("壁纸上传成功，已更新预览");
    } catch (error) {
      console.error("壁纸上传失败:", error);
      alert("上传失败，请重试");
    }
  }
  // 保存并应用壁纸
  async saveWallpaper() {
    if (!newWallpaperBase64) {
      alert("请先上传一张新壁纸。");
      return;
    }
    const updateGlobalSettings = window.updateGlobalSettings;
    if (!updateGlobalSettings) {
      console.error("保存壁纸失败：更新函数不可用");
      return;
    }
    try {
      await updateGlobalSettings({ wallpaper: newWallpaperBase64 });
      this.applyGlobalWallpaper();
      newWallpaperBase64 = null;
      alert("壁纸已保存并应用！");
      const showScreen = window.showScreen;
      if (showScreen) {
        showScreen("home-screen");
      }
      console.log("壁纸已保存并应用");
    } catch (error) {
      console.error("保存壁纸失败:", error);
      alert("保存失败，请重试");
    }
  }
  // 应用全局壁纸到主屏幕
  applyGlobalWallpaper() {
    const homeScreen = document.getElementById("home-screen");
    const state = window.state;
    if (!homeScreen || !state) return;
    const wallpaper = state.globalSettings.wallpaper;
    if (wallpaper && wallpaper.startsWith("data:image")) {
      homeScreen.style.backgroundImage = `url(${wallpaper})`;
    } else if (wallpaper) {
      homeScreen.style.backgroundImage = wallpaper;
    } else {
      homeScreen.style.backgroundImage = "linear-gradient(135deg, #89f7fe, #66a6ff)";
    }
    console.log("全局壁纸已应用");
  }
  // 初始化壁纸模块事件监听器
  initWallpaperListeners() {
    const uploadInput = document.getElementById("wallpaper-upload-input");
    if (uploadInput) {
      uploadInput.addEventListener("change", (e) => this.handleWallpaperUpload(e));
    }
    const saveBtn = document.getElementById("save-wallpaper-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => this.saveWallpaper());
    }
    console.log("壁纸模块事件监听器已初始化");
  }
}
class ScreenModuleManager {
  constructor() {
    this.modules = /* @__PURE__ */ new Map();
    this.modules.set("world-book", new WorldBookScreen());
    this.modules.set("presets", new PresetScreen());
    this.modules.set("api-settings", new ApiSettingsScreen());
    this.modules.set("wallpaper", new WallpaperScreen());
  }
  // 渲染指定屏幕
  renderScreen(screenName) {
    const module = this.modules.get(screenName);
    if (module) {
      module.render();
    } else {
      console.warn("未找到屏幕模块:", screenName);
    }
  }
  // 初始化所有屏幕的事件监听器
  initAllListeners() {
    this.modules.forEach((module, name) => {
      console.log("初始化屏幕模块监听器:", name);
      module.initListeners();
    });
  }
  // 获取模块实例
  getModule(screenName) {
    return this.modules.get(screenName);
  }
}
const worldBookScreenModule = new WorldBookScreen();
const presetScreenModule = new PresetScreen();
const apiSettingsScreenModule = new ApiSettingsScreen();
const wallpaperScreenModule = new WallpaperScreen();
const screenManager = new ScreenModuleManager();
if (typeof window !== "undefined") {
  const win = window;
  win.screenManager = screenManager;
  win.renderWorldBookScreenProxy = () => screenManager.renderScreen("world-book");
  win.renderPresetListProxy = () => screenManager.renderScreen("presets");
  win.renderApiSettingsProxy = () => screenManager.renderScreen("api-settings");
  win.renderWallpaperScreenProxy = () => screenManager.renderScreen("wallpaper");
  win.openWorldBookEditor = (id) => {
    const worldBookScreen = screenManager.getModule("world-book");
    worldBookScreen?.openWorldBookEditor(id);
  };
  win.openPresetEditor = (id) => {
    const presetScreen = screenManager.getModule("presets");
    presetScreen?.openPresetEditor(id);
  };
}
var screens_default = {
  screenManager,
  WorldBookScreen,
  PresetScreen,
  ApiSettingsScreen,
  WallpaperScreen,
  ScreenModuleManager,
  chatScreenModule,
  ChatScreenModule,
  aiResponseModule
};
const SCREENS = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ApiSettingsScreen,
  ChatScreenModule,
  PresetScreen,
  ScreenModuleManager,
  WallpaperScreen,
  WorldBookScreen,
  aiResponseModule,
  apiSettingsScreenModule,
  chatScreenModule,
  default: screens_default,
  presetScreenModule,
  screenManager,
  wallpaperScreenModule,
  worldBookScreenModule
}, Symbol.toStringTag, { value: "Module" }));
export {
  SCREENS as S,
  aiResponseModule as a,
  apiSettingsScreenModule as b,
  chatScreenModule as c,
  wallpaperScreenModule as d,
  presetScreenModule as p,
  worldBookScreenModule as w
};
