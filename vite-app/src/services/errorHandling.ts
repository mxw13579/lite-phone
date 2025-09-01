// Phase 4: 错误处理统一工具函数
// 统一替换alert调用为类型安全的错误处理

// 基础错误提示函数
export function showError(message: string): void {
  const win = window as any;
  if (win.showCustomAlert) {
    win.showCustomAlert('错误', message);
  } else {
    console.error(message);
  }
}

// 基础成功提示函数
export function showSuccess(message: string): void {
  const win = window as any;
  if (win.showCustomAlert) {
    win.showCustomAlert('成功', message);
  } else {
    console.log(message);
  }
}

// 基础信息提示函数
export function showInfo(message: string): void {
  const win = window as any;
  if (win.showCustomAlert) {
    win.showCustomAlert('提示', message);
  } else {
    console.info(message);
  }
}

// 确认对话框函数
export function showConfirm(message: string): boolean {
  const win = window as any;
  if (win.showCustomConfirm) {
    return win.showCustomConfirm('确认', message);
  } else {
    return confirm(message);
  }
}

// 输入对话框函数
export function showPrompt(message: string, defaultValue = ''): string | null {
  return prompt(message, defaultValue);
}

// 字段验证错误处理
export function showValidationError(field: string): void {
  showError(`${field}不能为空！`);
}

// 操作失败错误处理  
export function showOperationError(operation: string, error?: Error): void {
  const message = error ? `${operation}失败：${error.message}` : `${operation}失败，请重试`;
  showError(message);
}

// 操作成功提示
export function showOperationSuccess(operation: string, detail?: string): void {
  const message = detail ? `${operation}成功！${detail}` : `${operation}成功！`;
  showSuccess(message);
}

// 网络错误统一处理
export function showNetworkError(operation: string, error: Error): void {
  console.error(`${operation}网络错误:`, error);
  showError(`${operation}失败，请检查网络连接并重试`);
}

// API配置错误提示
export function showApiConfigError(): void {
  showError('请先在API设置中配置反代地址、密钥并选择模型。');
}