/**
 * 验证工具函数
 * 提供各种数据验证功能
 * 已加强安全性 - 修复验证不足问题
 */

import { escapeHtml, sanitizeInput, RateLimit } from './security.js';

/**
 * 增强的验证电子邮件格式 - 修复正则过于简单的问题
 * @param {string} email 电子邮件地址
 * @returns {boolean} 是否有效
 */
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    
    // 🚨 安全修复：使用更严格的邮箱验证正则
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    const trimmedEmail = email.trim();
    
    // 长度检查
    if (trimmedEmail.length > 254) {
        return false;
    }
    
    // 基础格式检查
    if (!emailRegex.test(trimmedEmail)) {
        return false;
    }
    
    // 域名部分检查
    const parts = trimmedEmail.split('@');
    if (parts.length !== 2) {
        return false;
    }
    
    const [localPart, domainPart] = parts;
    
    // 本地部分长度检查
    if (localPart.length > 64 || localPart.length === 0) {
        return false;
    }
    
    // 域名部分长度检查
    if (domainPart.length > 253 || domainPart.length === 0) {
        return false;
    }
    
    // 不允许连续的点
    if (trimmedEmail.includes('..')) {
        return false;
    }
    
    return true;
}

/**
 * 验证手机号格式（中国大陆）
 * @param {string} phoneNumber 手机号
 * @returns {boolean} 是否有效
 */
export function isValidPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        return false;
    }
    
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const phoneRegex = /^1[3-9]\d{9}$/;
    return phoneRegex.test(cleanPhone);
}

/**
 * 验证 URL 格式
 * @param {string} url URL 地址
 * @returns {boolean} 是否有效
 */
export function isValidUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * 验证 API Key 格式
 * @param {string} apiKey API 密钥
 * @returns {boolean} 是否有效
 */
export function isValidApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
        return false;
    }
    
    // 基本格式检查：至少8位，包含字母和数字/符号
    const trimmed = apiKey.trim();
    return trimmed.length >= 8 && /[a-zA-Z]/.test(trimmed) && /[\d\W]/.test(trimmed);
}

/**
 * 验证字符串长度
 * @param {string} str 字符串
 * @param {number} min 最小长度
 * @param {number} max 最大长度
 * @returns {Object} 验证结果
 */
export function validateLength(str, min = 0, max = Infinity) {
    if (typeof str !== 'string') {
        return {
            valid: false,
            error: '输入必须是字符串'
        };
    }
    
    const length = str.trim().length;
    
    if (length < min) {
        return {
            valid: false,
            error: `长度不能少于${min}个字符`
        };
    }
    
    if (length > max) {
        return {
            valid: false,
            error: `长度不能超过${max}个字符`
        };
    }
    
    return {
        valid: true,
        length
    };
}

/**
 * 验证数字范围
 * @param {number} num 数字
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {Object} 验证结果
 */
export function validateRange(num, min = -Infinity, max = Infinity) {
    if (typeof num !== 'number' || isNaN(num)) {
        return {
            valid: false,
            error: '输入必须是有效数字'
        };
    }
    
    if (num < min) {
        return {
            valid: false,
            error: `数值不能小于${min}`
        };
    }
    
    if (num > max) {
        return {
            valid: false,
            error: `数值不能大于${max}`
        };
    }
    
    return {
        valid: true,
        value: num
    };
}

/**
 * 验证数字（带字段名与范围提示）
 * @param {*} value 待验证值
 * @param {string} fieldName 字段名
 * @param {number} min 最小值
 * @param {number} max 最大值
 * @returns {{isValid:boolean, value?:number, error?:string}}
 */
export function validateNumber(value, fieldName = '数值', min = -Infinity, max = Infinity) {
    const num = typeof value === 'number' ? value : Number(value);
    if (typeof num !== 'number' || isNaN(num)) {
        return {
            isValid: false,
            error: `${fieldName}必须是有效数字`
        };
    }
    if (num < min) {
        return {
            isValid: false,
            error: `${fieldName}不能小于${min}`
        };
    }
    if (num > max) {
        return {
            isValid: false,
            error: `${fieldName}不能大于${max}`
        };
    }
    return {
        isValid: true,
        value: num
    };
}

/**
 * 安全的API输入验证 - 新增功能
 * @param {Object} input 输入数据
 * @param {Object} schema 验证schema
 * @returns {Object} 验证结果
 */
export function validateApiInput(input, schema) {
    const errors = [];
    const warnings = [];
    
    if (!input || typeof input !== 'object') {
        return {
            isValid: false,
            errors: ['输入数据格式不正确'],
            warnings
        };
    }
    
    // 检查必需字段
    if (schema.required) {
        for (const field of schema.required) {
            if (!(field in input) || input[field] === null || input[field] === undefined) {
                errors.push(`缺少必需字段: ${field}`);
            }
        }
    }
    
    // 检查字段类型和长度
    for (const [field, rules] of Object.entries(schema.fields || {})) {
        if (field in input) {
            const value = input[field];
            
            // 类型检查
            if (rules.type && typeof value !== rules.type) {
                errors.push(`字段 ${field} 类型错误，期望 ${rules.type}，实际 ${typeof value}`);
                continue;
            }
            
            // 长度检查
            if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
                errors.push(`字段 ${field} 长度超过限制 ${rules.maxLength}`);
            }
            
            if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
                errors.push(`字段 ${field} 长度不足 ${rules.minLength}`);
            }
            
            // 数值范围检查
            if (rules.min !== undefined && typeof value === 'number' && value < rules.min) {
                errors.push(`字段 ${field} 值过小，最小值: ${rules.min}`);
            }
            
            if (rules.max !== undefined && typeof value === 'number' && value > rules.max) {
                errors.push(`字段 ${field} 值过大，最大值: ${rules.max}`);
            }
            
            // 模式匹配
            if (rules.pattern && typeof value === 'string') {
                const pattern = new RegExp(rules.pattern);
                if (!pattern.test(value)) {
                    errors.push(`字段 ${field} 格式不正确`);
                }
            }
            
            // 邮箱验证
            if (rules.email && !isValidEmail(value)) {
                errors.push(`字段 ${field} 邮箱格式不正确`);
            }
            
            // URL验证
            if (rules.url) {
                try {
                    new URL(value);
                } catch {
                    errors.push(`字段 ${field} URL格式不正确`);
                }
            }
        }
    }
    
    // 速率限制检查
    if (schema.rateLimit) {
        try {
            const key = `api_${JSON.stringify(input)}`;
            RateLimit.check(key, schema.rateLimit.limit || 10, schema.rateLimit.window || 60000);
        } catch (error) {
            errors.push(error.message);
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors,
        warnings,
        sanitized: sanitizeApiInput(input, schema)
    };
}

/**
 * 清理API输入数据
 * @param {Object} input 输入数据
 * @param {Object} schema 验证schema
 * @returns {Object} 清理后的数据
 */
export function sanitizeApiInput(input, schema) {
    const sanitized = {};
    
    for (const [field, value] of Object.entries(input)) {
        const rules = schema.fields?.[field] || {};
        
        if (typeof value === 'string') {
            // 根据规则清理字符串
            if (rules.html) {
                sanitized[field] = sanitizeInput(value, 'html');
            } else if (rules.url) {
                sanitized[field] = sanitizeInput(value, 'url');
            } else if (rules.filename) {
                sanitized[field] = sanitizeInput(value, 'filename');
            } else {
                sanitized[field] = sanitizeInput(value, 'text');
            }
        } else {
            sanitized[field] = value;
        }
    }
    
    return sanitized;
}

/**
 * 验证必填字段
 * @param {*} value 值
 * @param {string} fieldName 字段名
 * @returns {Object} 验证结果
 */
export function validateRequired(value, fieldName = '此字段') {
    if (value === null || value === undefined) {
        return {
            valid: false,
            error: `${fieldName}是必填的`
        };
    }
    
    if (typeof value === 'string' && value.trim().length === 0) {
        return {
            valid: false,
            error: `${fieldName}不能为空`
        };
    }
    
    if (Array.isArray(value) && value.length === 0) {
        return {
            valid: false,
            error: `${fieldName}不能为空`
        };
    }
    
    return {
        valid: true,
        value
    };
}

/**
 * 验证布尔值
 * @param {*} value 值
 * @param {string} fieldName 字段名
 * @returns {Object} 验证结果
 */
export function validateBoolean(value, fieldName = '此字段') {
    if (typeof value === 'boolean') {
        return {
            valid: true,
            value
        };
    }
    
    // 支持字符串形式的布尔值
    if (typeof value === 'string') {
        const lowerValue = value.toLowerCase().trim();
        if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
            return {
                valid: true,
                value: true
            };
        }
        if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
            return {
                valid: true,
                value: false
            };
        }
    }
    
    // 支持数字形式的布尔值
    if (typeof value === 'number') {
        if (value === 1) {
            return {
                valid: true,
                value: true
            };
        }
        if (value === 0) {
            return {
                valid: true,
                value: false
            };
        }
    }
    
    return {
        valid: false,
        error: `${fieldName}必须是布尔值（true/false）`
    };
}

/**
 * 验证 JSON 格式
 * @param {string} jsonString JSON 字符串
 * @returns {Object} 验证结果
 */
export function validateJson(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
        return {
            valid: false,
            error: 'JSON 字符串不能为空'
        };
    }
    
    try {
        const parsed = JSON.parse(jsonString.trim());
        return {
            valid: true,
            data: parsed
        };
    } catch (error) {
        return {
            valid: false,
            error: `JSON 格式错误: ${error.message}`
        };
    }
}

/**
 * 验证图片文件
 * @param {File} file 文件对象
 * @param {Object} options 验证选项
 * @returns {Object} 验证结果
 */
export function validateImageFile(file, options = {}) {
    const {
        maxSize = 5 * 1024 * 1024, // 5MB
        allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    } = options;
    
    if (!file || !(file instanceof File)) {
        return {
            valid: false,
            error: '请选择一个文件'
        };
    }
    
    if (!allowedTypes.includes(file.type)) {
        return {
            valid: false,
            error: `文件类型不支持，请选择：${allowedTypes.join(', ')}`
        };
    }
    
    if (file.size > maxSize) {
        return {
            valid: false,
            error: `文件大小不能超过 ${Math.round(maxSize / 1024 / 1024)}MB`
        };
    }
    
    return {
        valid: true,
        file
    };
}

/**
 * 验证音频文件
 * @param {File} file 文件对象
 * @param {Object} options 验证选项
 * @returns {Object} 验证结果
 */
export function validateAudioFile(file, options = {}) {
    const {
        maxSize = 10 * 1024 * 1024, // 10MB
        allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg']
    } = options;
    
    if (!file || !(file instanceof File)) {
        return {
            valid: false,
            error: '请选择一个文件'
        };
    }
    
    if (!allowedTypes.includes(file.type)) {
        return {
            valid: false,
            error: `文件类型不支持，请选择：${allowedTypes.join(', ')}`
        };
    }
    
    if (file.size > maxSize) {
        return {
            valid: false,
            error: `文件大小不能超过 ${Math.round(maxSize / 1024 / 1024)}MB`
        };
    }
    
    return {
        valid: true,
        file
    };
}

/**
 * 验证密码强度
 * @param {string} password 密码
 * @param {Object} requirements 密码要求
 * @returns {Object} 验证结果
 */
export function validatePassword(password, requirements = {}) {
    const {
        minLength = 8,
        requireUppercase = true,
        requireLowercase = true,
        requireNumbers = true,
        requireSpecialChars = false
    } = requirements;
    
    if (!password || typeof password !== 'string') {
        return {
            valid: false,
            error: '密码不能为空',
            strength: 0
        };
    }
    
    const errors = [];
    let strength = 0;
    
    // 长度检查
    if (password.length < minLength) {
        errors.push(`密码长度至少需要${minLength}位`);
    } else {
        strength += 1;
    }
    
    // 大写字母检查
    if (requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('密码必须包含大写字母');
    } else if (/[A-Z]/.test(password)) {
        strength += 1;
    }
    
    // 小写字母检查
    if (requireLowercase && !/[a-z]/.test(password)) {
        errors.push('密码必须包含小写字母');
    } else if (/[a-z]/.test(password)) {
        strength += 1;
    }
    
    // 数字检查
    if (requireNumbers && !/\d/.test(password)) {
        errors.push('密码必须包含数字');
    } else if (/\d/.test(password)) {
        strength += 1;
    }
    
    // 特殊字符检查
    if (requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push('密码必须包含特殊字符');
    } else if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        strength += 1;
    }
    
    return {
        valid: errors.length === 0,
        error: errors.join('；'),
        strength: Math.min(strength, 5),
        strengthLabel: ['很弱', '弱', '一般', '强', '很强'][Math.min(strength, 4)]
    };
}

/**
 * 批量验证表单数据
 * @param {Object} data 表单数据
 * @param {Object} rules 验证规则
 * @returns {Object} 验证结果
 */
export function validateForm(data, rules) {
    const errors = {};
    let isValid = true;
    
    Object.entries(rules).forEach(([field, fieldRules]) => {
        const value = data[field];
        
        for (const rule of fieldRules) {
            const result = rule.validator(value, rule.options || {});
            
            if (!result.valid) {
                errors[field] = result.error;
                isValid = false;
                break; // 一旦发现错误，停止该字段的后续验证
            }
        }
    });
    
    return {
        valid: isValid,
        errors,
        data: isValid ? data : null
    };
}

/**
 * 常用验证规则
 */
export const ValidationRules = {
    required: (fieldName = '此字段') => ({
        validator: validateRequired,
        options: fieldName
    }),
    
    email: () => ({
        validator: (value) => ({
            valid: !value || isValidEmail(value),
            error: '请输入有效的邮箱地址'
        })
    }),
    
    phone: () => ({
        validator: (value) => ({
            valid: !value || isValidPhoneNumber(value),
            error: '请输入有效的手机号码'
        })
    }),
    
    url: () => ({
        validator: (value) => ({
            valid: !value || isValidUrl(value),
            error: '请输入有效的URL地址'
        })
    }),
    
    length: (min, max) => ({
        validator: validateLength,
        options: { min, max }
    }),
    
    range: (min, max) => ({
        validator: validateRange,
        options: { min, max }
    }),
    
    pattern: (regex, errorMessage = '格式不正确') => ({
        validator: (value) => ({
            valid: !value || regex.test(value),
            error: errorMessage
        })
    })
};

/**
 * 通用输入验证函数
 * @param {Object} fields 字段验证配置对象
 * @returns {Object} 验证结果
 */
export function validateInput(fields) {
    const errors = [];
    let isValid = true;

    for (const [fieldName, config] of Object.entries(fields)) {
        const { value, required = false, type, min, max, pattern } = config;

        // 必填验证
        if (required) {
            const requiredResult = validateRequired(value, fieldName);
            if (!requiredResult.valid) {
                errors.push(requiredResult.error);
                isValid = false;
                continue;
            }
        }

        // 如果不是必填且值为空，跳过其他验证
        if (!required && (value === null || value === undefined || value === '')) {
            continue;
        }

        // 类型验证
        if (type) {
            let typeValid = true;
            let typeError = '';

            switch (type) {
                case 'string':
                    if (typeof value !== 'string') {
                        typeValid = false;
                        typeError = `${fieldName}必须是字符串`;
                    }
                    break;
                case 'number':
                    const numResult = validateNumber(value, fieldName, min, max);
                    if (!numResult.isValid) {
                        typeValid = false;
                        typeError = numResult.error;
                    }
                    break;
                case 'boolean':
                    const boolResult = validateBoolean(value, fieldName);
                    if (!boolResult.valid) {
                        typeValid = false;
                        typeError = boolResult.error;
                    }
                    break;
                case 'email':
                    if (!isValidEmail(value)) {
                        typeValid = false;
                        typeError = `${fieldName}必须是有效的邮箱地址`;
                    }
                    break;
                case 'url':
                    if (!isValidUrl(value)) {
                        typeValid = false;
                        typeError = `${fieldName}必须是有效的URL地址`;
                    }
                    break;
                case 'phone':
                    if (!isValidPhoneNumber(value)) {
                        typeValid = false;
                        typeError = `${fieldName}必须是有效的手机号码`;
                    }
                    break;
                default:
                    // 未知类型，跳过类型验证
                    break;
            }

            if (!typeValid) {
                errors.push(typeError);
                isValid = false;
                continue;
            }
        }

        // 长度验证（字符串）
        if (typeof value === 'string' && (min !== undefined || max !== undefined)) {
            const lengthResult = validateLength(value, min, max);
            if (!lengthResult.valid) {
                errors.push(`${fieldName}: ${lengthResult.error}`);
                isValid = false;
                continue;
            }
        }

        // 模式验证
        if (pattern && typeof value === 'string') {
            const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
            if (!regex.test(value)) {
                errors.push(`${fieldName}格式不正确`);
                isValid = false;
                continue;
            }
        }
    }

    return {
        isValid,
        errors
    };
}