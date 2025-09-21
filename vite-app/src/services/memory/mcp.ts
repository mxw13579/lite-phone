import type { EventRec } from './types';
import { MemoryRepo, deduplicateEvents, checkNearDuplicates } from './repo';

const COOLDOWN_MS = 5000;
// 使用Map存储各个persona的冷却时间，避免跨会话互相干扰
const lastExtractAtMap = new Map<string, number>();

// MCP 提示词模板
const SHOULD_EXTRACT_PROMPT = `你是 Memory Gatekeeper。输入是最近的对话轮次（user/assistant）。
任务：判断当前轮次是否需要"存证据型事件"。若拿不准，返回 allow=false。
输出严格 JSON：{"allow": boolean, "typeKey"?: string, "reasons"?: string[]}

可用事件类型：
- commitment（需完成的约定/承诺，含时间/对象可选 dueAt）
- note（一般性可复用事实/偏好表达/例外，条件可简述）

判断标准：
- 包含明确承诺/约定 → commitment
- 表达偏好/例外/重要事实 → note
- 普通闲聊/问答 → allow=false`;

const DISTILL_PROMPT = `你是 Memory Distiller。输入为一轮对话（user + assistant）。
任务：提纯出可复用的事件（title≤80, content≤300）。
- 仅保留事实，不要加入命令式语言；
- 如为承诺，优先提取时间（dueAt）与对象；
- 参与者以 persona:X / user:U 命名；
- 如果这是对已有事件的完成/更新，请返回 parentEventId（从contextMemory中的 #evt:xxx 标记提取）
- 注意：敏感信息（如电话号码、邮箱、身份证号等）和危险命令（如删除文件、执行脚本等）会被自动过滤
- 可选择性提供title/content模板，使用{USER}/{PERSONA}变量，用于在不同上下文中展示

contextMemory（本次注入的记忆内容，可能包含 #evt:xxx 标记）:
{CONTEXT_MEMORY}

输出严格 JSON：{"event":{"title":"...","content":"...","titleTpl"?:"{USER}做了某事","contentTpl"?:"{PERSONA}记录了{USER}的话","status":"open|done|cancelled|note","dueAt"?:number,"participants"?:[],"parentEventId"?:"evt_xxx"}}

状态选择：
- open：进行中的承诺/约定
- done：已完成的事情（如果有parentEventId则为子事件）
- cancelled：已取消的约定（如果有parentEventId则为子事件）
- note：一般性事实/偏好/笔记`;

export async function maybeExtractAndRecord(
  personaId: string, 
  recentTurns: {role:'user'|'assistant', text:string}[], 
  proxyUrl: string, 
  apiKey: string, 
  model: string,
  chatId?: string,
  contextMemory?: string  // 新增参数：本次注入的记忆内容
): Promise<void> {
  const now = Date.now();
  if (!personaId) return;
  
  // 使用personaId作为冷却key，避免跨persona的冷却干扰
  const cooldownKey = personaId;
  const lastExtractAt = lastExtractAtMap.get(cooldownKey) || 0;
  
  if (now - lastExtractAt < COOLDOWN_MS) {
    console.log('[MM][cooldown] 跳过提取，冷却中:', { personaId, cooldownKey, remaining: COOLDOWN_MS - (now - lastExtractAt) });
    return;
  }

  // 立即更新冷却时间，无论后续操作成功与否
  // 这样可以防止高频调用Gatekeeper，确保冷却机制生效
  lastExtractAtMap.set(cooldownKey, now);

  try {
    console.log('[MM][extract-start]', { personaId, turnsCount: recentTurns.length });

    // 步骤1：判断是否需要记忆
    const shouldResult = await callJsonTool(proxyUrl, apiKey, model, 'should_extract', { recentTurns });
    
    if (!shouldResult?.allow) {
      console.log('[MM][extract-skip]', shouldResult?.reasons);
      return;
    }

    console.log('[MM][extract-allow]', { typeKey: shouldResult.typeKey });

    // 步骤2：提纯事件
    const turn = { 
      user: recentTurns.find(t => t.role === 'user')?.text || '', 
      assistant: recentTurns.find(t => t.role === 'assistant')?.text || '' 
    };
    
    const distillResult = await callJsonTool(proxyUrl, apiKey, model, 'distill', { 
      turn, 
      typeKey: shouldResult.typeKey || 'note'
    }, contextMemory);  // 传递contextMemory参数

    const eventData = distillResult?.event;
    if (!eventData) {
      console.warn('[MM][distill-failed] No event data returned');
      return;
    }

    // 步骤3：构建EventRec并应用模板派生/参与者归一化
    const originalTitle = eventData.title || '';
    const originalContent = eventData.content || '';

    // 应用过滤并检测是否包含PII或命令式内容
    const filteredTitle = sanitizeText(originalTitle, 80);
    const filteredContent = sanitizeText(originalContent, 300);

    // 检测是否有内容被过滤
    const containsPII = (originalTitle !== filteredTitle &&
                        (filteredTitle.includes('[已过滤') || filteredTitle.includes('[已过滤敏感信息]'))) ||
                       (originalContent !== filteredContent &&
                        (filteredContent.includes('[已过滤') || filteredContent.includes('[已过滤敏感信息]')));

    // 应用模板派生和参与者归一化
    const processedEvent = applyTemplateDerivationAndNormalization({
        title: filteredTitle,
        content: filteredContent,
        titleTpl: eventData.titleTpl,
        contentTpl: eventData.contentTpl,
        participants: eventData.participants,
        personaId
    });

    const event: EventRec = {
      id: 'evt_' + now + '_' + Math.random().toString(36).slice(2, 8),
      personaId,
      chatId,
      typeKey: shouldResult.typeKey || 'note',
      title: processedEvent.title,
      content: processedEvent.content,
      titleTpl: processedEvent.titleTpl,
      contentTpl: processedEvent.contentTpl,
      status: validateStatus(eventData.status) || 'note',
      lifecycle: eventData.status === 'open' ? 'requiresCompletion' : 'none',
      dueAt: validateTimestamp(eventData.dueAt),
      parentEventId: eventData.parentEventId ? String(eventData.parentEventId) : undefined,
      participants: processedEvent.participants,
      pii: containsPII, // 标记是否包含已过滤的PII或敏感内容
      excludeFromPrompt: containsPII, // 包含敏感内容时默认排除注入
      createdAt: now,
      updatedAt: now
    };
    
    // 记录过滤统计
    if (containsPII) {
      console.log('[MM][filter-applied]', { 
        eventId: event.id, 
        originalTitleLength: originalTitle.length,
        originalContentLength: originalContent.length,
        filteredTitleLength: filteredTitle.length,
        filteredContentLength: filteredContent.length,
        autoExcluded: true
      });
    }

    // 步骤3.5：处理完成闭环 - 如果没有parentEventId但status是done/cancelled，尝试回退匹配
    if (!event.parentEventId && (event.status === 'done' || event.status === 'cancelled')) {
      const matchedParentId = await findPotentialParent(personaId, event);
      if (matchedParentId) {
        event.parentEventId = matchedParentId;
        console.log('[MM][parent-matched]', { childId: event.id, parentId: matchedParentId });
      } else {
        // 没有匹配到父事件，标记为待人工关联
        event.excludeFromPrompt = true;
        console.log('[MM][orphan-completion]', { eventId: event.id, title: event.title });
      }
    }

    // 特殊处理：如果有parentEventId，可以选择更新主事件状态而不是创建子事件
    if (event.parentEventId && (event.status === 'done' || event.status === 'cancelled')) {
      const shouldUpdateParent = await considerUpdatingParent(event);
      if (shouldUpdateParent) {
        await MemoryRepo.updateEvent(event.parentEventId, {
          status: event.status,
          content: event.content,
          updatedAt: now
        });
        console.log('[MM][parent-updated]', { parentId: event.parentEventId, newStatus: event.status });
        return; // 不创建子事件，直接更新父事件
      }
    }

    // 步骤4：近重复检测
    const duplicateCheck = await checkNearDuplicates(personaId, event);
    if (duplicateCheck.isDuplicate) {
      console.log('[MM][near-duplicate-skip]', { reason: duplicateCheck.reason, title: event.title });
      return;
    }

    // 步骤5：传统去重检查
    await deduplicateEvents(personaId, event.typeKey, event.title);

    // 步骤6：入库
    const savedId = await MemoryRepo.addEvent(event);
    console.log('[MM][record-success]', { id: savedId, title: event.title });

    // 步骤7：配额策略执行
    await enforceQuotaPolicy(personaId);

  } catch (e) {
    console.warn('[MM][extract-error]', e);
  }
}

const COMPRESS_PROMPT = `你是 Memory Compressor。输入是若干条旧事件（均为已完成/笔记类）。
任务：合成为一条"摘要事件"，保留时间范围与核心动作列表，避免命令式语气。
- 标题≤80；正文≤300；
- 语气中性，便于在对话生成时作为证据引用；
输出严格 JSON：{"summary":{"title":"...","content":"...","aggregatedCount":N,"timeRange":{"from":ts,"to":ts}},"estimates":{"chars":123}}`;

// AI工具调用封装
async function callJsonTool(
  proxyUrl: string, 
  apiKey: string, 
  model: string, 
  tool: 'should_extract' | 'distill' | 'compress', 
  payload: any,
  contextMemory?: string  // 新增参数
): Promise<any> {
  
  let systemPrompt = tool === 'should_extract' ? SHOULD_EXTRACT_PROMPT : 
                     tool === 'distill' ? DISTILL_PROMPT : COMPRESS_PROMPT;
                     
  // 如果是distill工具且有contextMemory，替换模板中的占位符
  if (tool === 'distill' && contextMemory) {
    systemPrompt = systemPrompt.replace('{CONTEXT_MEMORY}', contextMemory);
  } else if (tool === 'distill') {
    // 如果没有contextMemory，使用空内容
    systemPrompt = systemPrompt.replace('{CONTEXT_MEMORY}', '（本次无注入记忆内容）');
  }
  
  const userMessage = JSON.stringify(payload, null, 2);

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0,
    stream: false,
    max_tokens: 500
  };

  const response = await fetch(`${proxyUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`MCP API call failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || '';
  
  return await parseStrictJsonWithRetry(content);
}

// 严格JSON解析，支持重试（增强版，带指数退避）
async function parseStrictJsonWithRetry(text: string, maxRetries = 2): Promise<any> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 如果不是第一次尝试，添加延迟（指数退避）
      if (attempt > 0) {
        const delayMs = Math.pow(2, attempt - 1) * 400; // 400ms, 800ms
        console.log(`[MM][json-retry] 第${attempt}次重试，延迟${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      return parseStrictJson(text, attempt);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`[MM][json-parse-attempt-${attempt}]`, { 
        text: text.slice(0, 100), 
        error: lastError.message,
        remaining: maxRetries - attempt 
      });
    }
  }
  
  console.error('[MM][json-parse-exhausted]', { 
    text: text.slice(0, 200), 
    attempts: maxRetries + 1,
    finalError: lastError?.message 
  });
  
  return null;
}

// 严格JSON解析，支持重试（原版，保持兼容性）
function parseStrictJson(text: string, retryCount = 0): any {
  try {
    // 尝试直接解析
    return JSON.parse(text);
  } catch (firstError) {
    // 提取第一个JSON对象
    const match = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (secondError) {
        // 更宽松的正则
        const loosMatch = text.match(/\{[\s\S]*?\}/);
        if (loosMatch && retryCount < 1) {
          try {
            return JSON.parse(loosMatch[0]);
          } catch {
            // 最后尝试：清理常见问题
            const cleaned = loosMatch[0]
              .replace(/,\s*\}/g, '}') // 移除多余逗号
              .replace(/,\s*\]/g, ']'); // 移除多余逗号
            return parseStrictJson(cleaned, retryCount + 1);
          }
        }
      }
    }
    
    console.warn('[MM][json-parse-failed]', { text: text.slice(0, 200), error: firstError.message });
    return null;
  }
}

// 数据清洗和验证
function sanitizeText(text: string, maxLength: number): string {
  let cleanText = String(text || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 移除控制字符
    .replace(/\s+/g, ' ') // 压缩多余空白
    .trim();
    
  // 应用命令式短语过滤
  cleanText = filterImperativePhrases(cleanText);
  
  // 应用PII过滤
  cleanText = filterPII(cleanText);
  
  return cleanText.slice(0, maxLength);
}

// 命令式短语过滤器：移除危险命令和指令性语言
function filterImperativePhrases(text: string): string {
  const imperativePatterns = [
    // 系统命令类
    /删除.*?文件/gi,
    /运行.*?命令/gi,
    /执行.*?脚本/gi,
    /关闭.*?系统/gi,
    /重启.*?服务/gi,
    /安装.*?软件/gi,
    /卸载.*?程序/gi,
    
    // 数据操作类
    /清空.*?数据/gi,
    /格式化.*?硬盘/gi,
    /备份.*?删除/gi,
    /永久.*?销毁/gi,
    
    // 网络操作类
    /发送.*?到.*?服务器/gi,
    /下载.*?文件/gi,
    /上传.*?数据/gi,
    /连接.*?网络/gi,
    
    // 权限操作类
    /修改.*?权限/gi,
    /授予.*?访问/gi,
    /撤销.*?权限/gi,
    /提升.*?权限/gi,
    
    // AI工具调用类（新增）
    /你必须.*?(调用|执行|运行)/gi,
    /请.*?(立即|马上).*?(调用|执行)/gi,
    /使用工具.*?(执行|调用)/gi,
    /执行以下.*?(工具|函数)/gi,
    /调用.*?(API|接口|函数)/gi,
    
    // 直接命令词
    /^(立即|马上|现在|快速).*?(执行|运行|删除|关闭)/gi,
    /^请.*?(删除|清除|格式化|重置)/gi,
    /^(你需要|你应该|你必须).*?(调用|执行)/gi,
  ];
  
  let filteredText = text;
  
  // 逐个检查危险模式，用安全描述替换
  for (const pattern of imperativePatterns) {
    filteredText = filteredText.replace(pattern, '[已过滤命令性内容]');
  }
  
  // 清理连续的过滤标记
  filteredText = filteredText.replace(/\[已过滤命令性内容\]\s*\[已过滤命令性内容\]/g, '[已过滤命令性内容]');
  
  return filteredText;
}

// PII过滤器：移除个人敏感信息
function filterPII(text: string): string {
  let filteredText = text;
  
  // 中国大陆手机号 (更精确的匹配)
  filteredText = filteredText.replace(/(\+86[-\s]?)?1[3-9]\d{9}/g, '[已过滤电话号码]');
  filteredText = filteredText.replace(/(\+86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}/g, '[已过滤电话号码]');
  
  // 邮箱地址 (更严格的匹配)
  filteredText = filteredText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}/g, '[已过滤邮箱地址]');
  
  // 身份证号码 (18位中国身份证)
  filteredText = filteredText.replace(/[1-9]\d{5}(18|19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[1-2]\d|3[0-1])\d{3}[\dXx]/g, '[已过滤身份证号]');
  
  // 银行卡号码 (13-19位数字，增强检测)
  filteredText = filteredText.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{3,4}\b/g, '[已过滤卡号]');
  filteredText = filteredText.replace(/\b\d{13,19}\b/g, (match) => {
    return match.length >= 13 && match.length <= 19 ? '[已过滤卡号]' : match;
  });
  
  // IPv4地址
  filteredText = filteredText.replace(/(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)/g, '[已过滤IP地址]');
  
  // IPv6地址
  filteredText = filteredText.replace(/([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}/g, '[已过滤IP地址]');
  
  // MAC地址
  filteredText = filteredText.replace(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/g, '[已过滤MAC地址]');
  
  // 精确地址信息 (中国地址格式)
  filteredText = filteredText.replace(/([\u4e00-\u9fff]+省|[\u4e00-\u9fff]+市|[\u4e00-\u9fff]+区|[\u4e00-\u9fff]+县)[\u4e00-\u9fff\d\w\s-]{10,}/g, '[已过滤精确地址]');
  
  // QQ号码 (5-12位数字)
  filteredText = filteredText.replace(/\bQQ[:：\s]*[1-9]\d{4,11}\b/gi, '[已过滤QQ号]');
  
  // 微信号码
  filteredText = filteredText.replace(/\b微信[:：\s]*[a-zA-Z][a-zA-Z0-9_-]{5,19}\b/gi, '[已过滤微信号]');
  
  // 可能的密码/令牌模式 (连续20+位字母数字组合)
  filteredText = filteredText.replace(/\b[A-Za-z0-9]{20,}\b/g, '[已过滤令牌]');
  
  // 网址和敏感路径
  filteredText = filteredText.replace(/https?:\/\/[^\s]+/gi, '[已过滤网址]');
  filteredText = filteredText.replace(/[A-Z]:\\[^\\/:*?"<>|\r\n]+/gi, '[已过滤文件路径]');
  
  // Unix/Linux路径
  filteredText = filteredText.replace(/\/[a-zA-Z0-9._/-]{10,}/g, '[已过滤文件路径]');
  
  // 清理连续的过滤标记
  const piiMarkers = ['[已过滤电话号码]', '[已过滤邮箱地址]', '[已过滤身份证号]', '[已过滤卡号]', 
                     '[已过滤IP地址]', '[已过滤MAC地址]', '[已过滤精确地址]', '[已过滤QQ号]',
                     '[已过滤微信号]', '[已过滤令牌]', '[已过滤网址]', '[已过滤文件路径]'];
  
  for (let i = 0; i < piiMarkers.length; i++) {
    for (let j = i; j < piiMarkers.length; j++) {
      const doublePattern = new RegExp(`${escapeRegex(piiMarkers[i])}\\s*${escapeRegex(piiMarkers[j])}`, 'g');
      filteredText = filteredText.replace(doublePattern, '[已过滤敏感信息]');
    }
  }
  
  return filteredText;
}

// 辅助函数：转义正则表达式特殊字符
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateStatus(status: any): EventRec['status'] | null {
  const validStatuses = ['open', 'done', 'cancelled', 'note'];
  return validStatuses.includes(status) ? status : null;
}

function validateTimestamp(timestamp: any): number | undefined {
  if (typeof timestamp === 'number' && timestamp > Date.now()) {
    // 未来的时间戳，且在合理范围内（1年内）
    const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
    return timestamp <= oneYearFromNow ? timestamp : undefined;
  }
  return undefined;
}

// 配额策略执行：根据maxEvents设置执行溢出策略
async function enforceQuotaPolicy(personaId: string): Promise<void> {
  try {
    // 获取该persona的记忆设置
    const settings = await MemoryRepo.getSettings(personaId);
    console.log('[MM][quota-check]', { personaId, maxEvents: settings.maxEvents, policy: settings.overflowPolicy });
    
    // 获取当前事件总数
    const allEvents = await MemoryRepo.getEventsByPersona(personaId);
    const currentCount = allEvents.length;
    
    if (currentCount <= settings.maxEvents) {
      console.log('[MM][quota-ok]', { current: currentCount, max: settings.maxEvents });
      return;
    }
    
    const excessCount = currentCount - settings.maxEvents;
    console.log('[MM][quota-exceeded]', { current: currentCount, max: settings.maxEvents, excess: excessCount });
    
    if (settings.overflowPolicy === 'drop_oldest') {
      // 策略1：删除最旧的事件
      await applyDropOldestPolicy(personaId, excessCount, allEvents);
    } else if (settings.overflowPolicy === 'compress_oldest') {
      // 策略2：压缩最旧的事件
      await applyCompressOldestPolicy(personaId, settings.compressBatchSize, allEvents);
    }
    
  } catch (error) {
    console.error('[MM][quota-enforcement-error]', { personaId, error });
  }
}

// 删除最旧事件策略
async function applyDropOldestPolicy(
  personaId: string, 
  excessCount: number, 
  allEvents: EventRec[]
): Promise<void> {
  // 按创建时间排序，最旧的在前
  const sortedByAge = allEvents.sort((a, b) => a.createdAt - b.createdAt);
  
  // 选择最旧的excess个事件删除
  const toDelete = sortedByAge.slice(0, excessCount);
  const deleteIds = toDelete.map(e => e.id);
  
  console.log('[MM][drop-oldest]', { 
    toDeleteCount: deleteIds.length, 
    oldestTitle: toDelete[0]?.title,
    newestDeletedTitle: toDelete[toDelete.length - 1]?.title
  });
  
  await MemoryRepo.removeEvents(deleteIds);
  
  console.log('[MM][drop-oldest-success]', { deletedCount: deleteIds.length });
}

// 压缩最旧事件策略
async function applyCompressOldestPolicy(
  personaId: string, 
  batchSize: number,
  allEvents: EventRec[]
): Promise<void> {
  // 筛选出可压缩的事件（已完成或笔记类，且未压缩）
  const compressibleEvents = allEvents.filter(e => 
    (e.status === 'done' || e.status === 'note') && 
    !e.compressed &&
    !e.excludeFromPrompt
  ).sort((a, b) => a.createdAt - b.createdAt);
  
  if (compressibleEvents.length < 3) {
    console.log('[MM][compress-insufficient]', { 
      available: compressibleEvents.length,
      message: '可压缩事件不足3个，跳过压缩策略' 
    });
    
    // 退化为删除策略
    const excessCount = allEvents.length - (await MemoryRepo.getSettings(personaId)).maxEvents;
    if (excessCount > 0) {
      console.log('[MM][fallback-to-drop]', { excessCount });
      await applyDropOldestPolicy(personaId, excessCount, allEvents);
    }
    return;
  }
  
  // 选择最旧的batchSize个可压缩事件
  const toBatch = compressibleEvents.slice(0, Math.min(batchSize, compressibleEvents.length));
  console.log('[MM][compress-oldest]', { 
    batchSize: toBatch.length,
    oldestTitle: toBatch[0]?.title,
    newestTitle: toBatch[toBatch.length - 1]?.title
  });
  
  // 使用现有的压缩功能
  const candidateIds = toBatch.map(e => e.id);
  
  // 调用压缩函数（注意：这需要API配置，如果失败会记录警告但不会阻塞）
  try {
    // 获取API配置，统一兼容 key 名称
    const win = (globalThis as any).window || ({} as any);
    const apiConfigRaw = win.STATE?.state?.apiConfig || win.state?.apiConfig || win.STATE?.globalSettings?.activeApiConfig || {};
    const proxyUrl: string | undefined = apiConfigRaw.proxyUrl || apiConfigRaw.url;
    const apiKey: string | undefined = apiConfigRaw.apiKey || apiConfigRaw.key;
    const model: string | undefined = apiConfigRaw.model || apiConfigRaw.modelName || apiConfigRaw.selectedModel;

    if (proxyUrl && apiKey && model) {
      await compressOldEvents(
        personaId,
        candidateIds,
        '压缩旧的已完成事件，保留关键信息',
        proxyUrl,
        apiKey,
        model
      );
      console.log('[MM][compress-success]', { compressedCount: candidateIds.length });
    } else {
      console.warn('[MM][compress-no-api]', '缺少API配置，无法执行压缩，退化为删除策略', {
        apiConfigFound: !!apiConfigRaw,
        hasProxyUrl: !!proxyUrl,
        hasApiKey: !!apiKey,
        hasModel: !!model
      });
      const excessCount = allEvents.length - (await MemoryRepo.getSettings(personaId)).maxEvents;
      if (excessCount > 0) {
        await applyDropOldestPolicy(personaId, excessCount, allEvents);
      }
    }
  } catch (error) {
    console.error('[MM][compress-error]', error);
    console.log('[MM][compress-fallback]', '压缩失败，退化为删除策略');
    
    // 压缩失败，退化为删除策略
    const excessCount = allEvents.length - (await MemoryRepo.getSettings(personaId)).maxEvents;
    if (excessCount > 0) {
      await applyDropOldestPolicy(personaId, excessCount, allEvents);
    }
  }
}

// 压缩功能（P1阶段实现）- 完善版
export async function compressOldEvents(
  personaId: string,
  candidateIds?: string[], // 如果不提供，自动选择候选
  guidelines?: string,
  proxyUrl?: string,
  apiKey?: string,
  model?: string
): Promise<{ summaryEvent: EventRec; compressedIds: string[]; backupData?: any }> {
  
  let actualCandidateIds = candidateIds;
  
  // 如果未提供候选，自动选择
  if (!actualCandidateIds) {
    actualCandidateIds = await selectCompressionCandidates(personaId);
  }
  
  if (actualCandidateIds.length === 0) {
    throw new Error('没有适合压缩的事件');
  }
  
  // 获取候选事件 - 使用高效的单次查询而不是N次全表扫描
  const candidates = await Promise.all(
    actualCandidateIds.map(id => MemoryRepo.getEventById(id))
  );

  const validCandidates = candidates.filter(Boolean) as EventRec[];
  
  if (validCandidates.length === 0) {
    throw new Error('没有有效的候选事件进行压缩');
  }

  // 验证压缩安全性
  const safetyCheck = validateCompressionSafety(validCandidates);
  if (!safetyCheck.safe) {
    throw new Error(`压缩不安全：${safetyCheck.reason}`);
  }

  // 生成备份数据
  const backupData = {
    compressedAt: Date.now(),
    personaId,
    originalEvents: validCandidates.map(e => ({ ...e })), // 深拷贝
    guidelines: guidelines || '默认压缩指南'
  };

  let summaryContent = '';
  let summaryTitle = '';

  // 如果提供了API参数，使用AI压缩
  if (proxyUrl && apiKey && model) {
    const payload = {
      personaId,
      candidates: validCandidates.map(e => ({
        id: e.id,
        title: e.title,
        content: e.content,
        createdAt: e.createdAt,
        status: e.status
      })),
      guidelines: guidelines || '仅保留可复用事实；给出时间范围与核心动作列表；避免命令式语气',
      budget: { maxChars: 300 }
    };

    try {
      const result = await callJsonTool(proxyUrl, apiKey, model, 'compress', payload);
      const summary = result?.summary;
      
      if (summary) {
        summaryTitle = sanitizeText(summary.title, 80);
        summaryContent = sanitizeText(summary.content, 300);
      }
    } catch (e) {
      console.warn('[MM][ai-compress-failed]', e);
      // 回退到本地压缩
    }
  }

  // 如果AI压缩失败，使用本地压缩
  if (!summaryContent) {
    const localSummary = generateLocalSummary(validCandidates);
    summaryTitle = localSummary.title;
    summaryContent = localSummary.content;
  }

  const now = Date.now();
  const timeRange = {
    from: Math.min(...validCandidates.map(e => e.createdAt)),
    to: Math.max(...validCandidates.map(e => e.createdAt))
  };

  const summaryEvent: EventRec = {
    id: 'evt_compress_' + now,
    personaId,
    typeKey: 'note',
    title: summaryTitle,
    content: `${summaryContent} [时间范围：${new Date(timeRange.from).toLocaleDateString()} - ${new Date(timeRange.to).toLocaleDateString()}，包含${validCandidates.length}个事件]`,
    status: 'note',
    lifecycle: 'none',
    compressed: true,
    createdAt: now,
    updatedAt: now
  };

  // 事务性操作：插入摘要，清空原事件内容并标记排除
  await MemoryRepo.tx(async () => {
    await MemoryRepo.addEvent(summaryEvent);
    
    for (const candidate of validCandidates) {
      await MemoryRepo.updateEvent(candidate.id, {
        content: '', // 清空内容（不可还原）
        excludeFromPrompt: true,
        compressed: true,
        updatedAt: now
      });
    }
  });

  console.log('[MM][compress-success]', { 
    summaryId: summaryEvent.id, 
    compressedCount: validCandidates.length,
    backupSize: JSON.stringify(backupData).length
  });

  return {
    summaryEvent,
    compressedIds: validCandidates.map(e => e.id),
    backupData // 提供给调用者备份到文件
  };
}

// 自动选择压缩候选
export async function selectCompressionCandidates(personaId: string, maxCandidates?: number, options?: { forceIncludeOpen?: boolean; includeDueSoon?: boolean }): Promise<string[]> {
  // 如果未提供maxCandidates，从PersonaMemorySettings中获取
  if (maxCandidates === undefined) {
    const settings = await MemoryRepo.getSettings(personaId);
    maxCandidates = settings.compressBatchSize || 10; // 默认值10
  }

  const allEvents = await MemoryRepo.getEventsByPersona(personaId);
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // 筛选候选：已完成/笔记类 且 非临期 且 30天前
  const candidates = allEvents
    .filter(e => {
      const allowOpen = options?.forceIncludeOpen === true;
      const allowDueSoon = options?.includeDueSoon === true;
      const isDoneOrNote = (e.status === 'done' || e.status === 'note');
      const isOpen = e.status === 'open';
      const isDueSoon = !!e.dueAt && e.dueAt >= now;

      const statusAllowed = isDoneOrNote || (allowOpen && isOpen);
      const dueAllowed = (!e.dueAt || e.dueAt < now) || (allowDueSoon && isDueSoon);

      return statusAllowed &&
             dueAllowed &&
             !e.compressed &&
             !e.excludeFromPrompt &&
             e.createdAt < thirtyDaysAgo;
    })
    .sort((a, b) => a.createdAt - b.createdAt) // 按时间升序，优先压缩最旧的
    .slice(0, maxCandidates);

  return candidates.map(e => e.id);
}

// 压缩干跑预览（不落库）：优先尝试AI压缩，失败回退本地摘要
export async function previewCompress(
  personaId: string,
  candidateIds: string[],
  guidelines?: string,
  proxyUrl?: string,
  apiKey?: string,
  model?: string
): Promise<{
  title: string;
  content: string;
  estimates?: { chars?: number };
  baselineChars: number;
  expectedSavingsChars?: number;
}> {
  const candidates = await Promise.all(candidateIds.map(id => MemoryRepo.getEventById(id)));
  const validCandidates = (candidates.filter(Boolean) as EventRec[]);
  if (validCandidates.length === 0) {
    throw new Error('没有有效的候选事件进行预览');
  }

  // 估算原始字符数
  const baselineChars = validCandidates.reduce((sum, e) => sum + (e.title?.length || 0) + (e.content?.length || 0) + 16, 0);

  let previewTitle = '';
  let previewContent = '';
  let estimates: { chars?: number } | undefined;

  if (proxyUrl && apiKey && model) {
    try {
      const payload = {
        personaId,
        candidates: validCandidates.map(e => ({ id: e.id, title: e.title, content: e.content, createdAt: e.createdAt, status: e.status })),
        guidelines: guidelines || '仅保留可复用事实；给出时间范围与核心动作列表；避免命令式语气',
        budget: { maxChars: 300 }
      };
      const result = await callJsonTool(proxyUrl, apiKey, model, 'compress', payload);
      const summary = result?.summary;
      if (summary) {
        previewTitle = sanitizeText(summary.title, 80);
        previewContent = sanitizeText(summary.content, 300);
        estimates = result?.estimates;
      }
    } catch (e) {
      console.warn('[MM][preview-compress-ai-failed]', e);
    }
  }

  if (!previewContent) {
    const local = generateLocalSummary(validCandidates);
    previewTitle = local.title;
    previewContent = local.content;
  }

  const expectedSavingsChars = estimates?.chars ? Math.max(0, baselineChars - (estimates.chars as number)) : undefined;

  return {
    title: previewTitle,
    content: previewContent,
    estimates,
    baselineChars,
    expectedSavingsChars
  };
}

// 验证压缩安全性
function validateCompressionSafety(candidates: EventRec[]): { safe: boolean; reason?: string } {
  // 1. 不允许压缩进行中的事件
  const hasOpenEvents = candidates.some(e => e.status === 'open');
  if (hasOpenEvents) {
    return { safe: false, reason: '包含进行中的事件' };
  }

  // 2. 不允许压缩临期事件
  const now = Date.now();
  const sevenDaysFromNow = now + 7 * 24 * 60 * 60 * 1000;
  const hasDueSoonEvents = candidates.some(e => e.dueAt && e.dueAt < sevenDaysFromNow);
  if (hasDueSoonEvents) {
    return { safe: false, reason: '包含临期事件' };
  }

  // 3. 至少需要2个事件才值得压缩
  if (candidates.length < 2) {
    return { safe: false, reason: '候选事件太少' };
  }

  // 4. 不允许压缩已经被压缩过的事件
  const hasCompressedEvents = candidates.some(e => e.compressed);
  if (hasCompressedEvents) {
    return { safe: false, reason: '包含已压缩的事件' };
  }

  return { safe: true };
}

// 本地压缩算法（AI不可用时的回退）
function generateLocalSummary(events: EventRec[]): { title: string; content: string } {
  const sortedEvents = events.sort((a, b) => a.createdAt - b.createdAt);
  const startDate = new Date(sortedEvents[0].createdAt).toLocaleDateString('zh-CN');
  const endDate = new Date(sortedEvents[sortedEvents.length - 1].createdAt).toLocaleDateString('zh-CN');
  
  // 提取主要活动类型
  const activities = events.map(e => e.title).filter(t => t.length > 0);
  const uniqueActivities = [...new Set(activities)].slice(0, 5); // 最多5个不同活动

  const title = `${startDate}至${endDate}期间活动摘要`;
  const content = `期间完成${events.length}项活动，主要包括：${uniqueActivities.join('、')}等。此为系统自动压缩的摘要事件。`;

  return {
    title: title.slice(0, 80),
    content: content.slice(0, 250) // 留50字符给时间范围信息
  };
}

// 一键压缩指定persona的旧事件
export async function autoCompressPersonaEvents(
  personaId: string, 
  proxyUrl: string, 
  apiKey: string, 
  model: string,
  batchSize: number = 15
): Promise<{ compressed: number; summaries: number }> {
  const candidates = await selectCompressionCandidates(personaId, batchSize);
  
  if (candidates.length === 0) {
    console.log('[MM][auto-compress-skip]', { personaId, reason: 'no_candidates' });
    return { compressed: 0, summaries: 0 };
  }

  try {
    const result = await compressOldEvents(personaId, candidates, undefined, proxyUrl, apiKey, model);
    return { 
      compressed: result.compressedIds.length, 
      summaries: 1
    };
  } catch (e) {
    console.warn('[MM][auto-compress-failed]', { personaId, error: e });
    return { compressed: 0, summaries: 0 };
  }
}

// 完成闭环：关联父子事件
export async function completeEvent(
  eventId: string,
  status: 'done' | 'cancelled',
  note?: string
): Promise<void> {
  const now = Date.now();
  
  await MemoryRepo.updateEvent(eventId, {
    status,
    content: note ? sanitizeText(note, 300) : undefined,
    updatedAt: now,
    lastUsedAt: now
  });
  
  console.log('[MM][complete-event]', { eventId, status });
}

// 回退匹配：根据时间、标题、参与者匹配潜在父事件
async function findPotentialParent(personaId: string, completionEvent: EventRec): Promise<string | null> {
  const openEvents = await MemoryRepo.getOpenByPersona(personaId);
  
  if (openEvents.length === 0) return null;
  
  const candidates = openEvents.map(parent => {
    let score = 0;
    
    // 1. 时间匹配 (±1天)
    if (parent.dueAt && completionEvent.createdAt) {
      const timeDiff = Math.abs(parent.dueAt - completionEvent.createdAt);
      const oneDayMs = 24 * 60 * 60 * 1000;
      if (timeDiff <= oneDayMs) score += 2;
    }
    
    // 2. 标题相似度（Jaccard相似度简化版）
    const titleSimilarity = calculateTitleSimilarity(parent.title, completionEvent.title);
    if (titleSimilarity >= 0.6) score += 2;
    if (titleSimilarity >= 0.3) score += 1;
    
    // 3. 参与者交集
    const parentParticipants = new Set(parent.participants || []);
    const completionParticipants = new Set(completionEvent.participants || []);
    const intersection = new Set([...parentParticipants].filter(x => completionParticipants.has(x)));
    if (intersection.size > 0) score += 1;
    
    return { parent, score };
  });
  
  // 找到得分最高且≥2分的候选
  const bestCandidate = candidates
    .filter(c => c.score >= 2)
    .sort((a, b) => b.score - a.score)[0];
  
  return bestCandidate ? bestCandidate.parent.id : null;
}

// 简化的标题相似度计算（基于词集合）
function calculateTitleSimilarity(title1: string, title2: string): number {
  const normalize = (str: string) => str.toLowerCase()
    .replace(/[，、。！？]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
  
  const words1 = new Set(normalize(title1));
  const words2 = new Set(normalize(title2));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// 判断是否应该更新父事件而不是创建子事件
async function considerUpdatingParent(event: EventRec): Promise<boolean> {
  if (!event.parentEventId) return false;
  
  try {
    const allEvents = await MemoryRepo.getEventsByPersona(event.personaId);
    const parent = allEvents.find(e => e.id === event.parentEventId);
    
    if (!parent) return false;
    
    // 如果父事件还是open状态，且子事件是简单的完成/取消，直接更新父事件
    if (parent.status === 'open' && 
        (event.status === 'done' || event.status === 'cancelled') &&
        event.title.length < 50 // 简短的完成描述
    ) {
      return true;
    }
    
    return false;
  } catch (e) {
    console.warn('[MM][parent-check-failed]', e);
    return false;
  }
}

// 模板派生和参与者归一化处理
function applyTemplateDerivationAndNormalization({
  title,
  content,
  titleTpl,
  contentTpl,
  participants,
  personaId
}: {
  title: string;
  content: string;
  titleTpl?: string;
  contentTpl?: string;
  participants?: any[];
  personaId: string;
}): {
  title: string;
  content: string;
  titleTpl?: string;
  contentTpl?: string;
  participants: string[];
} {
  // 1. 参与者归一化为标准格式 ['user', 'persona:<personaId>']
  const normalizedParticipants = ['user', `persona:${personaId}`];

  // 2. 模板派生：如果没有提供模板，尝试从内容中派生
  let derivedTitleTpl = titleTpl;
  let derivedContentTpl = contentTpl;
  let finalTitle = title;
  let finalContent = content;

  // 如果LLM已经提供了模板，直接使用
  if (titleTpl || contentTpl) {
    return {
      title: finalTitle,
      content: finalContent,
      titleTpl: derivedTitleTpl,
      contentTpl: derivedContentTpl,
      participants: normalizedParticipants
    };
  }

  // 尝试从内容中识别并派生模板
  // 简单的模式匹配：寻找可能的用户/角色占位语
  const userPatterns = [
    /用户/g,
    /User/g,
    /user/g,
    /我/g
  ];

  const personaPatterns = [
    /AI助手/g,
    /Assistant/g,
    /assistant/g,
    /角色/g,
    /persona/g,
    /Persona/g
  ];

  // 检查标题是否包含可模板化的内容
  let titleHasUserRef = false;
  let titleHasPersonaRef = false;
  let tempTitle = title;

  for (const pattern of userPatterns) {
    if (pattern.test(title)) {
      titleHasUserRef = true;
      tempTitle = tempTitle.replace(pattern, '{USER}');
    }
  }

  for (const pattern of personaPatterns) {
    if (pattern.test(title)) {
      titleHasPersonaRef = true;
      tempTitle = tempTitle.replace(pattern, '{PERSONA}');
    }
  }

  // 检查内容是否包含可模板化的内容
  let contentHasUserRef = false;
  let contentHasPersonaRef = false;
  let tempContent = content;

  for (const pattern of userPatterns) {
    if (pattern.test(content)) {
      contentHasUserRef = true;
      tempContent = tempContent.replace(pattern, '{USER}');
    }
  }

  for (const pattern of personaPatterns) {
    if (pattern.test(content)) {
      contentHasPersonaRef = true;
      tempContent = tempContent.replace(pattern, '{PERSONA}');
    }
  }

  // 如果检测到模式，生成模板
  if (titleHasUserRef || titleHasPersonaRef) {
    derivedTitleTpl = tempTitle;
  }

  if (contentHasUserRef || contentHasPersonaRef) {
    derivedContentTpl = tempContent;
  }

  return {
    title: finalTitle,
    content: finalContent,
    titleTpl: derivedTitleTpl,
    contentTpl: derivedContentTpl,
    participants: normalizedParticipants
  };
}
