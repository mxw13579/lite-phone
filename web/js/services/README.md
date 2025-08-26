# EPhone 服务层文档

## 概述

服务层是 EPhone 应用架构中的核心层，负责统一管理业务逻辑、数据操作、外部API调用等功能。本文档描述了服务层的设计原则、架构模式和使用方法。

## 设计原则

### SOLID 原则应用

1. **单一职责原则 (SRP)**：每个服务类只负责一个特定领域的功能
   - `ApiService`: 专注于HTTP请求和API调用
   - `BackupService`: 专注于数据备份和恢复
   - `ThemeService`: 专注于主题和样式管理

2. **开放/封闭原则 (OCP)**：服务通过契约接口扩展功能，无需修改现有代码
   - 通过 `contracts.js` 定义标准接口
   - 使用拦截器模式扩展API功能

3. **里氏替换原则 (LSP)**：所有服务实现都遵循相同的契约规范
   - 统一的 `ServiceResponse` 返回格式
   - 一致的错误处理模式

4. **接口隔离原则 (ISP)**：提供专门化的服务接口，避免胖接口
   - 细粒度的服务方法
   - 按功能领域分离接口

5. **依赖倒置原则 (DIP)**：依赖抽象契约而非具体实现
   - 通过契约定义服务接口
   - 使用依赖注入模式

### DRY 原则

- 公共功能抽象到契约层：`createSuccessResponse`、`createErrorResponse`
- 统一的错误处理和响应格式化
- 共享的工具函数和类型定义

### KISS 原则

- 简洁明确的方法命名
- 直观的参数结构
- 最小化复杂度的实现

### YAGNI 原则

- 仅实现当前需要的功能
- 避免过度设计和预留未使用的特性

## 架构结构

```
web/js/services/
├── contracts.js      # 服务契约和类型定义
├── api.js           # HTTP API 服务
├── backup.js        # 数据备份服务  
├── themes.js        # 主题样式服务
└── README.md        # 服务层文档
```

## 服务契约系统

### 契约定义

所有服务都遵循在 `contracts.js` 中定义的标准契约：

```javascript
/**
 * 通用响应结构
 * @typedef {Object} ServiceResponse
 * @property {boolean} success - 操作是否成功
 * @property {*} [data] - 响应数据（成功时）
 * @property {string} [error] - 错误信息（失败时）
 * @property {string} [message] - 操作消息
 * @property {number} [timestamp] - 时间戳
 * @property {Object} [metadata] - 额外元数据
 */
```

### 标准化响应

所有服务方法都返回标准化的 `ServiceResponse` 对象：

```javascript
// 成功响应
{
  success: true,
  data: { /* 实际数据 */ },
  message: "操作成功",
  timestamp: 1693000000000,
  metadata: { /* 额外信息 */ }
}

// 错误响应
{
  success: false,
  error: "错误描述",
  type: "ERROR_TYPE",
  timestamp: 1693000000000
}
```

### 错误类型

服务层定义了标准化的错误类型：

- `VALIDATION_ERROR`: 参数验证错误
- `NETWORK_ERROR`: 网络连接错误
- `DATABASE_ERROR`: 数据库操作错误
- `AUTH_ERROR`: 认证授权错误
- `NOT_FOUND`: 资源不存在
- `QUOTA_EXCEEDED`: 配额超限
- `TIMEOUT`: 操作超时
- `INTERNAL_ERROR`: 内部错误

## 核心服务

### 1. API 服务 (api.js)

负责统一管理所有 HTTP 请求和外部 API 调用。

**主要功能：**
- HTTP 请求封装（GET、POST、PUT、DELETE）
- 请求/响应拦截器支持
- 自动重试机制
- 超时控制
- 并发限制
- 错误处理

**核心方法：**
```javascript
// 基础请求方法
apiService.request(options)
apiService.get(url, config)
apiService.post(url, data, config)

// 配置和拦截器
apiService.setConfig(config)
apiService.addRequestInterceptor(interceptor)
apiService.addResponseInterceptor(interceptor)
```

**使用示例：**
```javascript
import { apiService } from './services/api.js';

// 简单 GET 请求
const response = await apiService.get('/api/data');

// 带配置的 POST 请求
const result = await apiService.post('/api/save', {
  data: 'example'
}, {
  timeout: 5000,
  headers: { 'Custom-Header': 'value' }
});
```

### 2. 备份服务 (backup.js)

负责数据的导入导出、版本控制和压缩功能。

**主要功能：**
- 完整备份/增量备份/选择性备份
- 数据恢复和历史管理
- 版本兼容性处理
- 数据压缩和校验
- 备份统计信息

**核心方法：**
```javascript
// 契约标准方法
backupService.exportFullBackup(options)
backupService.exportIncrementalBackup(since, options)
backupService.exportSelectiveBackup(categories, options)
backupService.importFullBackup(backupData, options)
backupService.getSystemStats()
backupService.getBackupHistory(options)
```

**使用示例：**
```javascript
import { backupService } from './services/backup.js';

// 创建完整备份
const backupResult = await backupService.exportFullBackup({
  includeTypes: ['chats', 'presets'],
  compress: true
});

if (backupResult.success) {
  console.log('备份成功:', backupResult.data);
}
```

### 3. 主题服务 (themes.js)

负责CSS主题、变量和模板的管理。

**主要功能：**
- 主题模板管理
- CSS变量定义和应用
- 自定义主题创建
- 远程主题加载
- 主题预览功能

**核心方法：**
```javascript
// 契约标准方法
themeService.getAvailableThemes()
themeService.getCurrentTheme()
themeService.applyTheme(themeId, options)
themeService.createCustomTheme(themeConfig)
themeService.updateTheme(themeId, updates)
themeService.deleteCustomTheme(themeId)
```

**使用示例：**
```javascript
import { themeService } from './services/themes.js';

// 获取可用主题
const themesResult = await themeService.getAvailableThemes();
const themes = themesResult.data;

// 应用主题
await themeService.applyTheme('global-dark', { preview: false });

// 创建自定义主题
await themeService.createCustomTheme({
  id: 'my-theme',
  name: '我的主题',
  variables: {
    'primary-color': '#ff6b6b'
  },
  customCSS: '.custom-style { color: red; }'
});
```

## 事件系统集成

服务层与事件总线紧密集成，提供响应式的状态更新：

```javascript
// 监听服务事件
eventBus.on(EventTypes.BACKUP_COMPLETED, (data) => {
  console.log('备份完成:', data);
});

eventBus.on(EventTypes.THEME_UPDATED, (data) => {
  console.log('主题已更新:', data);
});
```

## 最佳实践

### 1. 错误处理

始终使用 try-catch 包装服务调用：

```javascript
try {
  const result = await someService.someMethod();
  if (result.success) {
    // 处理成功结果
    handleSuccess(result.data);
  } else {
    // 处理业务错误
    handleError(result.error);
  }
} catch (error) {
  // 处理异常错误
  console.error('Unexpected error:', error);
}
```

### 2. 参数验证

在调用服务前验证参数：

```javascript
import { validateApiParams } from './services/contracts.js';

// 定义参数架构
const schema = {
  id: { required: true, type: 'string' },
  options: { required: false, type: 'object' }
};

// 验证参数
validateApiParams({ id: 'test', options: {} }, schema);
```

### 3. 响应处理

统一处理服务响应：

```javascript
function handleServiceResponse(response, onSuccess, onError) {
  if (response.success) {
    onSuccess?.(response.data, response.metadata);
  } else {
    onError?.(response.error, response.type);
  }
}
```

### 4. 服务组合

通过组合多个服务实现复杂功能：

```javascript
async function backupAndApplyTheme(themeId) {
  // 先备份当前配置
  const backupResult = await backupService.exportFullBackup();
  
  if (backupResult.success) {
    // 再应用新主题
    const themeResult = await themeService.applyTheme(themeId);
    
    return {
      backup: backupResult.data,
      theme: themeResult.success
    };
  }
  
  throw new Error('备份失败，无法应用主题');
}
```

## 性能优化

### 1. 缓存策略

服务层实现了多级缓存：
- 内存缓存：频繁访问的数据
- 本地存储缓存：持久化的配置
- 请求缓存：避免重复的API调用

### 2. 批量操作

支持批量操作减少网络开销：
```javascript
// 批量创建
await dataService.createBulk(items, { batchSize: 100 });

// 批量更新
await dataService.updateBulk(filters, updates);
```

### 3. 异步处理

使用异步模式避免阻塞：
```javascript
// 并行处理
const [backup, stats] = await Promise.all([
  backupService.exportFullBackup(),
  backupService.getSystemStats()
]);
```

## 扩展指南

### 添加新服务

1. 创建服务类文件
2. 在 `contracts.js` 中定义契约
3. 实现标准化的响应格式
4. 添加完整的 JSDoc 文档
5. 编写单元测试

### 扩展现有服务

1. 遵循现有的契约规范
2. 保持向后兼容性
3. 使用拦截器模式扩展功能
4. 更新相关文档

## 版本历史

- **v1.1** (2025-08-26): 添加完整的契约系统和标准化响应
- **v1.0** (2025-08-25): 初始服务层架构

## 相关文档

- [事件系统文档](../core/README.md)
- [数据库层文档](../core/db.js)
- [工具函数文档](../utils/README.md)