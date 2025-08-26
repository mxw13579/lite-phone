# EPhone 项目说明

本项目是一个纯前端（HTML/CSS/JS）的仿手机 AI 聊天应用，支持多域功能（聊天/预设/世界书/朋友圈/插件中心/主题/数据管理等），并采用 ES Modules 模块化架构（core/services/domains/utils/main）。

## 文档角色矩阵（当前基线）
- feature-decisions-confirmation.md：需求与决策的单一事实源（优先级/范围/约束/验收）。
- overall-design.md：整体架构与运行机制（事件总线、调度器、路由、数据与服务层抽象）。
- ui-ux-specification.md：UI/UX 统一规范（信息架构、流程、可访问性、响应式与视觉系统）。

说明：其余历史文档已清理，避免多源冲突。若需查阅历史阶段内容，请参考 Git 历史。

## 运行与结构概览
- 入口：web/index.html（使用 <script type="module" src="./js/main.js">）
- 模块：
  - core/：db（Dexie 单源）、state、event-bus、scheduler、router
  - services/：api（超时/重试/并发/拦截）、themes（CSS 变量/模板/远程主题/导出导入/预览）、backup（导出/导入/恢复/事件）
  - domains/：按功能域拆分的 store/view（主题/插件/记忆/朋友圈/预设/世界书/聊天/API 设置等）
  - utils/：dom/format/validation/notify（Toast）/navigation（全局导航委托）
  - main.js：应用启动、路由与渲染接管、兼容代理（render*Proxy）、回退保护（仅在失败时动态加载 legacy）

## 开发建议
- 需求/范围：以 docs/feature-decisions-confirmation.md 为准。
- 架构/落地：以 docs/overall-design.md 为准，新增功能优先接入 services 层，避免在 view 中直接发请求。
- UI/UX：以 docs/ui-ux-specification.md 为准，新增界面遵循无障碍与响应式规范；尽量使用 utils/notify 统一提示。
- 兼容与清理：逐步去除 window.* 暴露与 HTML 内联事件，统一使用模块事件绑定与全局导航委托。

## 常见入口
- 主题管理：web/js/domains/themes/{store,view}.js（经 services/themes.js）
- API 设置：web/js/domains/api-settings/{store,view}.js（经 services/api.js）
- 数据管理：web/js/utils/data-management.js（经 services/backup.js）

## 反馈与验收
- 事件与通知：服务层会在关键流程上报事件（API/备份/恢复/调度），前端通过 notify 统一反馈。
- 冒烟用例：路由切换、主题模板应用/预览、模型拉取/保存/测试连接、导出/导入/恢复、插件启停、记忆分页等。
