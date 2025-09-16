// Memory Manager P4: 代码格式和安全规范标准化工具
// 统一代码风格、安全检查和最佳实践验证

export interface CodeIssue {
  file: string;
  line: number;
  type: 'security' | 'format' | 'style' | 'performance';
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
  autoFixable: boolean;
}

export interface FormatOptions {
  // 字符串格式
  preferSingleQuotes: boolean;
  maxLineLength: number;

  // 缩进设置
  indentSize: number;
  useSpaces: boolean;

  // 安全检查
  strictSecurityChecks: boolean;
  checkConsoleUsage: boolean;

  // 代码风格
  enforceTrailingComma: boolean;
  enforceSemicolons: boolean;
}

export class CodeFormatter {
  private options: FormatOptions;

  constructor(options: Partial<FormatOptions> = {}) {
    this.options = {
      preferSingleQuotes: true,
      maxLineLength: 100,
      indentSize: 2,
      useSpaces: true,
      strictSecurityChecks: true,
      checkConsoleUsage: true,
      enforceTrailingComma: true,
      enforceSemicolons: true,
      ...options
    };
  }

  analyzeCode(content: string, filename: string): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // 安全检查
      issues.push(...this.checkSecurity(line, lineNumber, filename));

      // 格式检查
      issues.push(...this.checkFormat(line, lineNumber, filename));

      // 风格检查
      issues.push(...this.checkStyle(line, lineNumber, filename));

      // 性能检查
      issues.push(...this.checkPerformance(line, lineNumber, filename));
    });

    return issues;
  }

  private checkSecurity(line: string, lineNumber: number, filename: string): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // 检查危险的 DOM 操作
    if (line.includes('innerHTML') || line.includes('outerHTML')) {
      issues.push({
        file: filename,
        line: lineNumber,
        type: 'security',
        severity: 'error',
        message: '使用 innerHTML 可能导致 XSS 漏洞',
        suggestion: '使用 textContent 或 createElement 代替',
        autoFixable: false
      });
    }

    if (line.includes('insertAdjacentHTML')) {
      issues.push({
        file: filename,
        line: lineNumber,
        type: 'security',
        severity: 'warning',
        message: 'insertAdjacentHTML 可能存在安全风险',
        suggestion: '确保内容已正确转义或使用 createElement',
        autoFixable: false
      });
    }

    // 检查 eval 使用
    if (line.includes('eval(')) {
      issues.push({
        file: filename,
        line: lineNumber,
        type: 'security',
        severity: 'error',
        message: '使用 eval() 是严重的安全风险',
        suggestion: '使用更安全的替代方法，如 JSON.parse',
        autoFixable: false
      });
    }

    // 检查 Function 构造函数
    if (line.match(/new\s+Function\s*\(/)) {
      issues.push({
        file: filename,
        line: lineNumber,
        type: 'security',
        severity: 'error',
        message: 'Function 构造函数可能导致代码注入',
        suggestion: '使用常规函数声明或表达式',
        autoFixable: false
      });
    }

    return issues;
  }

  private checkFormat(line: string, lineNumber: number, filename: string): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // 检查行长度
    if (line.length > this.options.maxLineLength) {
      issues.push({
        file: filename,
        line: lineNumber,
        type: 'format',
        severity: 'warning',
        message: `行长度超过 ${this.options.maxLineLength} 字符 (当前: ${line.length})`,
        suggestion: '考虑分行或重构',
        autoFixable: false
      });
    }

    // 检查混合缩进
    const leadingWhitespace = line.match(/^[\s]*/)?.[0] || '';
    const hasSpaces = leadingWhitespace.includes(' ');
    const hasTabs = leadingWhitespace.includes('\t');

    if (hasSpaces && hasTabs) {
      issues.push({
        file: filename,
        line: lineNumber,
        type: 'format',
        severity: 'error',
        message: '混合使用空格和制表符进行缩进',
        suggestion: this.options.useSpaces ? '统一使用空格' : '统一使用制表符',
        autoFixable: true
      });
    }

    // 检查尾随空格
    if (line.endsWith(' ') || line.endsWith('\t')) {
      issues.push({
        file: filename,
        line: lineNumber,
        type: 'format',
        severity: 'info',
        message: '行末有尾随空格',
        suggestion: '移除尾随空格',
        autoFixable: true
      });
    }

    return issues;
  }

  private checkStyle(line: string, lineNumber: number, filename: string): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // 检查字符串引号一致性
    if (this.options.preferSingleQuotes) {
      // 检查双引号（排除模板字符串和已转义的引号）
      if (line.match(/"[^"]*"/) && !line.includes('`') && !line.includes('\\"')) {
        issues.push({
          file: filename,
          line: lineNumber,
          type: 'style',
          severity: 'info',
          message: '推荐使用单引号而不是双引号',
          suggestion: '将双引号改为单引号',
          autoFixable: true
        });
      }
    }

    // 检查分号使用
    if (this.options.enforceSemicolons) {
      // 简单检查语句结尾的分号（不完整，但覆盖常见情况）
      const trimmed = line.trim();
      if (trimmed &&
          !trimmed.startsWith('//') &&
          !trimmed.startsWith('*') &&
          !trimmed.startsWith('/*') &&
          !trimmed.endsWith(';') &&
          !trimmed.endsWith('{') &&
          !trimmed.endsWith('}') &&
          !trimmed.endsWith(',') &&
          (trimmed.includes('=') || trimmed.includes('return') || trimmed.includes('throw'))) {
        issues.push({
          file: filename,
          line: lineNumber,
          type: 'style',
          severity: 'info',
          message: '缺少分号',
          suggestion: '在语句末尾添加分号',
          autoFixable: true
        });
      }
    }

    // 检查 console 语句（生产环境警告）
    if (this.options.checkConsoleUsage && line.includes('console.')) {
      issues.push({
        file: filename,
        line: lineNumber,
        type: 'style',
        severity: 'info',
        message: '包含 console 语句',
        suggestion: '考虑在生产环境中移除或使用日志库',
        autoFixable: false
      });
    }

    return issues;
  }

  private checkPerformance(line: string, lineNumber: number, filename: string): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // 检查低效的字符串拼接
    if (line.includes('+') && line.match(/"[^"]*"\s*\+\s*[^+]/)) {
      issues.push({
        file: filename,
        line: lineNumber,
        type: 'performance',
        severity: 'info',
        message: '频繁的字符串拼接可能影响性能',
        suggestion: '考虑使用模板字符串或数组 join',
        autoFixable: false
      });
    }

    // 检查在循环中使用 querySelector
    if (line.includes('document.querySelector') &&
        (line.includes('for') || line.includes('while') || line.includes('forEach'))) {
      issues.push({
        file: filename,
        line: lineNumber,
        type: 'performance',
        severity: 'warning',
        message: '在循环中使用 DOM 查询可能影响性能',
        suggestion: '考虑在循环外缓存 DOM 元素',
        autoFixable: false
      });
    }

    return issues;
  }

  generateReport(issues: CodeIssue[]): string {
    const lines: string[] = [];
    lines.push('=== Code Quality Report ===\n');

    // 按严重程度分组
    const errorIssues = issues.filter(i => i.severity === 'error');
    const warningIssues = issues.filter(i => i.severity === 'warning');
    const infoIssues = issues.filter(i => i.severity === 'info');

    lines.push(`总问题数: ${issues.length}`);
    lines.push(`错误: ${errorIssues.length}`);
    lines.push(`警告: ${warningIssues.length}`);
    lines.push(`信息: ${infoIssues.length}`);
    lines.push('');

    // 按文件分组显示
    const byFile = new Map<string, CodeIssue[]>();
    for (const issue of issues) {
      const fileIssues = byFile.get(issue.file) || [];
      fileIssues.push(issue);
      byFile.set(issue.file, fileIssues);
    }

    for (const [file, fileIssues] of byFile.entries()) {
      lines.push(`📁 ${file} (${fileIssues.length} 个问题):`);

      for (const issue of fileIssues) {
        const icon = this.getSeverityIcon(issue.severity);
        lines.push(`  ${icon} 第${issue.line}行 [${issue.type}] ${issue.message}`);
        if (issue.suggestion) {
          lines.push(`     💡 建议: ${issue.suggestion}`);
        }
        if (issue.autoFixable) {
          lines.push(`     🔧 可自动修复`);
        }
      }
      lines.push('');
    }

    // 统计信息
    const autoFixableCount = issues.filter(i => i.autoFixable).length;
    if (autoFixableCount > 0) {
      lines.push(`🔧 ${autoFixableCount} 个问题可以自动修复`);
    }

    // 安全建议
    const securityIssues = issues.filter(i => i.type === 'security');
    if (securityIssues.length > 0) {
      lines.push('');
      lines.push('🔐 安全建议:');
      lines.push('- 及时修复所有安全相关问题');
      lines.push('- 对用户输入进行适当的验证和转义');
      lines.push('- 避免使用危险的 DOM 操作方法');
    }

    return lines.join('\n');
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '•';
    }
  }

  autoFix(content: string, issues: CodeIssue[]): string {
    let fixedContent = content;
    const lines = fixedContent.split('\n');

    // 按行号倒序处理，避免行号偏移问题
    const autoFixableIssues = issues
      .filter(i => i.autoFixable)
      .sort((a, b) => b.line - a.line);

    for (const issue of autoFixableIssues) {
      const lineIndex = issue.line - 1;
      if (lineIndex >= 0 && lineIndex < lines.length) {
        lines[lineIndex] = this.fixLine(lines[lineIndex], issue);
      }
    }

    return lines.join('\n');
  }

  private fixLine(line: string, issue: CodeIssue): string {
    switch (issue.type) {
      case 'format':
        if (issue.message.includes('尾随空格')) {
          return line.trimEnd();
        }
        if (issue.message.includes('混合使用')) {
          // 转换为统一的缩进方式
          const indent = line.match(/^[\s]*/)?.[0] || '';
          const content = line.slice(indent.length);
          const indentLevel = Math.ceil(indent.length / this.options.indentSize);
          const newIndent = this.options.useSpaces
            ? ' '.repeat(indentLevel * this.options.indentSize)
            : '\t'.repeat(indentLevel);
          return newIndent + content;
        }
        break;

      case 'style':
        if (issue.message.includes('单引号') && this.options.preferSingleQuotes) {
          // 简单的双引号到单引号转换（不处理复杂情况）
          return line.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, "'$1'");
        }
        if (issue.message.includes('分号')) {
          return line.trimEnd() + ';';
        }
        break;
    }

    return line;
  }
}

// 导出默认实例
export const codeFormatter = new CodeFormatter();

// 便捷函数
export async function analyzeMemoryModule(): Promise<CodeIssue[]> {
  // 这里应该读取实际的文件内容
  // 为了演示，我们返回一个空数组
  console.log('[MM][CodeFormatter] Memory module analysis not implemented in browser environment');
  return [];
}

export function generateStyleGuide(): string {
  return `
=== Memory Manager 代码风格指南 ===

## 安全规范

1. **DOM 操作安全**
   ❌ 避免: element.innerHTML = userInput
   ✅ 使用: element.textContent = userInput 或 createElement

2. **数据验证**
   - 对所有外部输入进行验证
   - 使用 TypeScript 类型检查
   - 实施边界检查

3. **错误处理**
   - 使用 try-catch 包装异步操作
   - 提供有意义的错误消息
   - 避免暴露敏感信息

## 代码格式

1. **缩进和空格**
   - 使用 2 个空格缩进
   - 行末不留尾随空格
   - 最大行长度 100 字符

2. **引号使用**
   - 优先使用单引号
   - 模板字符串使用反引号
   - 保持一致性

3. **分号和逗号**
   - 语句末尾添加分号
   - 对象和数组最后一项添加尾随逗号

## 命名约定

1. **变量和函数**
   - 使用 camelCase
   - 使用描述性名称
   - 避免缩写

2. **常量**
   - 使用 UPPER_SNAKE_CASE
   - 集中定义在文件顶部

3. **类和接口**
   - 使用 PascalCase
   - 接口以 I 开头（可选）

## 注释规范

1. **函数注释**
   - 使用 JSDoc 格式
   - 说明参数和返回值
   - 包含使用示例

2. **复杂逻辑**
   - 解释算法思路
   - 标注性能考虑
   - 说明边界情况

## 性能最佳实践

1. **DOM 操作**
   - 缓存 DOM 查询结果
   - 使用 DocumentFragment 批量操作
   - 避免在循环中查询 DOM

2. **内存管理**
   - 及时清理事件监听器
   - 避免内存泄漏
   - 使用 WeakMap/WeakSet 适当场景

3. **异步操作**
   - 使用 async/await 而不是 Promise 链
   - 实施适当的错误处理
   - 考虑并发控制

## 测试规范

1. **单元测试**
   - 测试纯函数
   - 覆盖边界条件
   - 使用描述性测试名称

2. **集成测试**
   - 测试模块交互
   - 验证数据流
   - 检查错误处理

这些规范确保代码的一致性、安全性和可维护性。
`;
}