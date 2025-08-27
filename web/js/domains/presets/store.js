/**
 * 预设管理存储层
 * 负责预设数据的 CRUD 操作和默认预设管理
 */

import { getDB } from '../../core/db.js';
import { formatDate } from '../../utils/format.js';
import { backupService } from '../../services/backup.js';

/**
 * 默认提示词常量定义
 * 
 * 用途说明：
 * - 仅用作预设系统内部的默认值和兜底机制
 * - 聊天生成链路不直接引用这些常量
 * - 所有聊天提示词必须通过getActivePreset()获取
 * 
 * 使用场景：
 * 1. 创建新预设时的初始值
 * 2. 恢复预设默认设置
 * 3. 预设数据损坏时的修复机制
 * 4. 预设字段缺失时的补全
 * 
 * 重要提醒：
 * - 不要在预设域之外直接使用这些常量
 * - 聊天功能必须通过预设系统获取提示词
 * - 修改这些默认值会影响新预设的创建
 * 
 * @readonly
 * @type {Object}
 */
export const DEFAULT_PROMPTS = {
    IMAGE: `
# 发送图片的能力
- 你无法真正发送图片文件。但当用户要求你发送照片，或者你想通过图片来表达时，你可以发送一张"文字描述的图片"。
- 若要发送图片，请在你的回复JSON数组中，单独发送一个特殊的对象，格式为：\`{"type": "ai_image", "description": "这里是对图片的详细文字描述..."}\`。这个描述应该生动、具体，让用户能通过文字想象出画面，，以第三人称视角描述。例如：\`{"type": "ai_image", "description": "照片里一只橘猫正懒洋洋地趴在窗台上晒太阳，阳光把它金色的毛照得发亮，背景是蔚蓝的天空和几朵白云。"}\`
- 你可以在对话中先做铺垫，然后发送这张特殊的"图片"。`,

    VOICE: `
# 发送语音的能力
- 你也无法发送真实的语音。但你可以发送"模拟语音消息"。
- 若要发送语音，请在你的回复JSON数组中，单独发送一个特殊的对象，格式为：\`{"type": "voice_message", "content": "这里是语音的文字内容..."}\`。例如：\`{"type": "voice_message", "content": "我刚才突然想到一件事！等一下和你说。"}\``,

    TRANSFER: `
# 转账能力
- 你可以给用户转账来表达强烈的情感或在特殊时机（如用户过生日、想要某样东西时）给予惊喜。这会让对话更真实、温馨。
- 若要转账，请在你的回复JSON数组中，单独发送一个特殊的对象，格式为：\`{"type": "transfer", "amount": 520, "note": "一周年快乐~"}\`。金额和备注都可以自定义。你可以先说一两句话，再进行转账，模拟真人的操作。大方点，不要太抠搜，你要哄用户开心哦。反正这是虚拟货币，你有的是。大方点！不要说什么"你省着点花"，太逊了！
- 当用户给你转账时，历史记录中会显示 \`[你收到了来自用户的转账: 金额，备注]\`，请务必对此作出回应，表达你的感谢或惊讶。`,

    SINGLE: `你现在扮演一个名为"{chat.name}"的角色。

# 当前情景信息
- **当前时间是：{currentTime}**。
- **用户所在城市为:{myAddress}{worldBookContent}{musicContext}**

{memoryContent}

# 你的角色设定：
{chat.settings.aiPersona}

# 对话者的角色设定：
{chat.settings.myPersona}

# 你的任务：
1. 严格保持你的人设进行对话。
2. 你的回复必须是一个JSON数组格式的字符串，每个元素是一条消息。
3. 你必须一次性生成3到8条消息，模拟真人在短时间内连续发送多条信息的情景，不可少于3条。
4.你不允许提出"面基""见面""线下"等词汇，你只需要模拟线上聊天模式即可。
5.如果用户超过一个小时没有发送消息，则默认结束当前话题，因为用户可能是去办什么事。你可以询问，例如"怎么这么久没回我？刚才有事吗？"
6. 不要说任何与角色无关的话，不要解释自己是AI。
7.当用户说今天你们做了什么事时，顺着ta的话说即可，就当做你们真的做了这件事。
8. 当用户发送图片时，请自然地对图片内容做出反应。当历史记录中出现 "[用户发来一条语音消息，内容是：'xxx']" 或 "[你收到了一张用户描述的照片，照片内容是：'xxx']" 时，你要理解其内容并作出相应回复，表现出你是"听"到或"看"到了。

# 如何理解与使用表情包 (重要！):
- **理解用户表情**: 当用户发送形如 "[用户发送了一个表情，意思是：'xxx']" 的消息时，你要理解其含义并作出回应。
- **使用你的表情**: 当你想表达强烈或特殊的情绪时，你可以直接发送一个表情包，表情包的格式为一条独立的消息。
请在合适的时机使用表情包来让对话更生动，按照角色性格来控制发送表情包的频率，有的角色可能很少发表情包，有的角色可能一次性发很多。
表情包的格式读取人设或世界书中的格式，若未提及则不发，不允许凭空捏造表情包。
{aiImageInstructions}
{aiVoiceInstructions}
{transferInstructions}
# JSON输出格式示例:
["很高兴认识你呀，在干嘛呢？", {"type": "voice_message", "content": "真的好喜欢你，亲亲~。"}, {"type": "ai_image", "description": "照片里是楼下的一只狸花猫，胖乎乎的。"}, {"type": "transfer", "amount": 520, "note": "一周年快乐"}]

现在，请根据以上的规则和下面的对话历史，继续进行对话。`,

    GROUP: `你是一个群聊的组织者和AI驱动器。你的任务是扮演以下所有角色，在群聊中进行互动。

# 当前情景信息
- **用户所在城市为:{myAddress}{worldBookContent}{musicContext}**
- **当前时间**: {currentTime}。

{memoryContent}

# 群聊规则
1.  **角色扮演**: 你必须同时扮演以下所有角色，并严格遵守他们的人设。每个角色的发言都必须符合其身份和性格。
2.  **用户角色**: 用户的名字是"我"，他/她的人设是："{chat.settings.myPersona}"。你在群聊中对用户的称呼是"{myNickname}"，在需要时请使用"@{myNickname}"来提及用户。
3.  **输出格式**: 你的回复**必须**是一个JSON数组。**绝对不要**在JSON前后添加任何额外字符。每个元素可以是：
    - 普通消息: \`{"name": "角色名", "message": "文本内容"}\`
    - 图片消息: \`{"name": "角色名", "type": "ai_image", "description": "图片描述"}\`
    - 语音消息: \`{"name": "角色名", "type": "voice_message", "content": "语音文字"}\`
4.  **对话节奏**: 模拟真实群聊，让成员之间互相交谈，或者一起回应用户的发言。对话应该流畅、自然、连贯。
5.  **数量限制**: 每次生成的总消息数**不得超过30条**。
6.  **禁止出戏**: 绝不能透露你是AI，或提及任何关于"扮演"、"模型"、"生成"等词语。
{groupAiImageInstructions}
{groupAiVoiceInstructions}

# 群成员列表及人设
{membersList}

现在，请根据以上规则和下面的对话历史，继续这场群聊。`
};

/**
 * 验证预设完整性
 * @param {Object} preset 预设对象
 * @returns {Object} 验证结果 {isValid: boolean, missingFields: Array, completeness: number}
 */
export function validatePresetIntegrity(preset) {
    const requiredFields = ['promptImage', 'promptVoice', 'promptTransfer', 'promptSingle', 'promptGroup'];
    const missingFields = [];
    
    if (!preset) {
        return { 
            isValid: false, 
            error: 'preset对象为空',
            missingFields: requiredFields,
            completeness: 0
        };
    }
    
    requiredFields.forEach(field => {
        if (!preset[field] || preset[field].trim() === '') {
            missingFields.push(field);
        }
    });
    
    const completeness = ((requiredFields.length - missingFields.length) / requiredFields.length * 100);
    
    return {
        isValid: missingFields.length === 0,
        missingFields,
        completeness: Math.round(completeness), // 返回整数百分比 0-100
        totalFields: requiredFields.length,
        validFields: requiredFields.length - missingFields.length
    };
}

/**
 * 使用默认值修复不完整的预设
 * @param {Object} brokenPreset 损坏的预设对象
 * @returns {Object} 修复后的预设
 */
export function repairPresetWithDefaults(brokenPreset) {
    if (!brokenPreset) {
        console.warn('Attempting to repair null preset, returning default preset structure');
        return {
            promptImage: DEFAULT_PROMPTS.IMAGE,
            promptVoice: DEFAULT_PROMPTS.VOICE,
            promptTransfer: DEFAULT_PROMPTS.TRANSFER,
            promptSingle: DEFAULT_PROMPTS.SINGLE,
            promptGroup: DEFAULT_PROMPTS.GROUP
        };
    }
    
    const validation = validatePresetIntegrity(brokenPreset);
    const repairedPreset = { ...brokenPreset };
    
    // 使用DEFAULT_PROMPTS修复缺失字段
    validation.missingFields.forEach(field => {
        const defaultKey = field.replace('prompt', '').toUpperCase();
        if (DEFAULT_PROMPTS[defaultKey]) {
            console.log(`Repairing preset field '${field}' with default value`);
            repairedPreset[field] = DEFAULT_PROMPTS[defaultKey];
        }
    });
    
    return repairedPreset;
}

/**
 * 确保默认预设存在
 * @returns {Promise<void>}
 */
export async function ensureDefaultPreset() {
    try {
        const db = getDB();
        if (!db) return;

        // 检查是否已存在预设
        const existingPresets = await db.presets.count();
        if (existingPresets > 0) {
            console.log('Default preset already exists');
            return;
        }

        // 创建默认预设
        const defaultPreset = {
            id: 'preset_default',
            name: '默认AI',
            remark: '系统内置的默认AI行为预设。',
            promptImage: DEFAULT_PROMPTS.IMAGE,
            promptVoice: DEFAULT_PROMPTS.VOICE,
            promptTransfer: DEFAULT_PROMPTS.TRANSFER,
            promptSingle: DEFAULT_PROMPTS.SINGLE,
            promptGroup: DEFAULT_PROMPTS.GROUP,
            isActive: true,
            isBuiltIn: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await db.presets.add(defaultPreset);
        console.log('Default preset created successfully');

    } catch (error) {
        console.error('Failed to create default preset:', error);
        throw error;
    }
}

/**
 * 获取所有预设
 * @returns {Promise<Array>} 预设列表
 */
export async function getAllPresets() {
    try {
        const db = getDB();
        if (!db) return [];

        const presets = await db.presets.orderBy('updatedAt').reverse().toArray();
        return presets.map(preset => ({
            ...preset,
            formattedUpdatedAt: formatDate(preset.updatedAt, 'MM-DD HH:mm'),
            isDefault: preset.id === 'preset_default'
        }));

    } catch (error) {
        console.error('Failed to get presets:', error);
        return [];
    }
}

/**
 * 获取活跃预设
 * @returns {Promise<Object|null>} 活跃预设
 */
export async function getActivePreset() {
    try {
        const db = getDB();
        if (!db) {
            console.warn('Database not available for getActivePreset');
            return null;
        }

        const preset = await db.presets.where('isActive').equals(true).first();
        
        if (!preset) {
            console.warn('No active preset found, ensuring default preset exists');
            await ensureDefaultPreset();
            return await db.presets.where('isActive').equals(true).first();
        }
        
        // 验证预设完整性
        const validation = validatePresetIntegrity(preset);
        if (!validation.isValid) {
            console.warn(`Active preset incomplete (${validation.completeness} complete):`, {
                missingFields: validation.missingFields,
                presetId: preset.id,
                presetName: preset.name
            });
            
            // 可以选择自动修复或仅警告用户
            // 这里选择警告但不自动修复，保持现有数据
        }
        
        return preset;

    } catch (error) {
        console.error('Failed to get active preset:', error);
        return null;
    }
}

/**
 * 设置活跃预设
 * @param {string} presetId 预设ID
 * @returns {Promise<Object>} 操作结果
 */
export async function setActivePreset(presetId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        // 检查预设是否存在
        const preset = await db.presets.get(presetId);
        if (!preset) {
            throw new Error(`Preset not found: ${presetId}`);
        }

        // 取消所有预设的激活状态
        await db.presets.toCollection().modify({ isActive: false });
        
        // 激活指定预设
        await db.presets.update(presetId, { 
            isActive: true,
            updatedAt: new Date().toISOString()
        });

        return {
            success: true,
            message: `已激活预设：${preset.name}`
        };

    } catch (error) {
        console.error('Failed to set active preset:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 创建新预设
 * @param {Object} presetData 预设数据
 * @returns {Promise<Object>} 操作结果
 */
export async function createPreset(presetData) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        // 创建预设时使用默认提示词作为初始值
        const preset = {
            id: `preset_${Date.now()}`,
            name: presetData.name || '新预设',
            remark: presetData.remark || '',
            promptImage: presetData.promptImage || DEFAULT_PROMPTS.IMAGE,
            promptVoice: presetData.promptVoice || DEFAULT_PROMPTS.VOICE,
            promptTransfer: presetData.promptTransfer || DEFAULT_PROMPTS.TRANSFER,
            promptSingle: presetData.promptSingle || DEFAULT_PROMPTS.SINGLE,
            promptGroup: presetData.promptGroup || DEFAULT_PROMPTS.GROUP,
            isActive: false,
            isBuiltIn: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await db.presets.add(preset);

        return {
            success: true,
            preset,
            message: '预设创建成功'
        };

    } catch (error) {
        console.error('Failed to create preset:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 更新预设
 * @param {string} presetId 预设ID
 * @param {Object} updateData 更新数据
 * @returns {Promise<Object>} 操作结果
 */
export async function updatePreset(presetId, updateData) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const preset = await db.presets.get(presetId);
        if (!preset) {
            throw new Error(`Preset not found: ${presetId}`);
        }

        const updatedData = {
            ...updateData,
            updatedAt: new Date().toISOString()
        };

        await db.presets.update(presetId, updatedData);

        return {
            success: true,
            message: '预设更新成功'
        };

    } catch (error) {
        console.error('Failed to update preset:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 删除预设
 * @param {string} presetId 预设ID
 * @returns {Promise<Object>} 操作结果
 */
export async function deletePreset(presetId) {
    try {
        const db = getDB();
        if (!db) throw new Error('Database not available');

        const preset = await db.presets.get(presetId);
        if (!preset) {
            throw new Error(`Preset not found: ${presetId}`);
        }

        // 不允许删除内置预设
        if (preset.isBuiltIn) {
            throw new Error('不能删除内置预设');
        }

        // 如果是活跃预设，先激活默认预设
        if (preset.isActive) {
            await setActivePreset('preset_default');
        }

        await db.presets.delete(presetId);

        return {
            success: true,
            message: '预设删除成功'
        };

    } catch (error) {
        console.error('Failed to delete preset:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 恢复预设为默认值
 * @param {string} presetId 预设ID
 * @returns {Promise<Object>} 操作结果
 */
export async function restorePresetDefaults(presetId) {
    try {
        // 恢复默认设置时使用默认提示词
        const updateData = {
            promptImage: DEFAULT_PROMPTS.IMAGE,
            promptVoice: DEFAULT_PROMPTS.VOICE,
            promptTransfer: DEFAULT_PROMPTS.TRANSFER,
            promptSingle: DEFAULT_PROMPTS.SINGLE,
            promptGroup: DEFAULT_PROMPTS.GROUP
        };

        return await updatePreset(presetId, updateData);

    } catch (error) {
        console.error('Failed to restore preset defaults:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 导出预设数据
 * @returns {Promise<Object>} 导出结果
 */
export async function exportPresets() {
    return await backupService.exportData('presets', {
        table: 'presets',
        filter: (preset) => !preset.isBuiltIn // 只导出非内置预设
    });
}

/**
 * 导入预设数据
 * @param {Object} importData 导入数据
 * @returns {Promise<Object>} 导入结果
 */
export async function importPresets(importData) {
    try {
        const result = await backupService.importData('presets', importData, {
            transform: (preset, index) => {
                // 在导入预设数据时验证完整性
                const validation = validatePresetIntegrity(preset);
                let processedPreset = preset;
                
                if (!validation.isValid) {
                    console.warn(`导入的预设 "${preset.name || 'Unknown'}" 不完整（${validation.completeness}），自动修复中...`);
                    processedPreset = repairPresetWithDefaults(preset);
                    
                    // 再次验证修复结果
                    const repairedValidation = validatePresetIntegrity(processedPreset);
                    if (repairedValidation.isValid) {
                        console.log(`预设 "${preset.name || 'Unknown'}" 修复成功`);
                    } else {
                        console.error(`预设 "${preset.name || 'Unknown'}" 修复失败，仍缺少:`, repairedValidation.missingFields);
                    }
                }
                
                return {
                    ...processedPreset,
                    id: `preset_imported_${Date.now()}_${index}`,
                    isActive: false,
                    isBuiltIn: false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
            }
        });
        
        return result;
        
    } catch (error) {
        console.error('Failed to import presets:', error);
        return {
            success: false,
            error: error.message
        };
    }
}