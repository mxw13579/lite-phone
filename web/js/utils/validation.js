/**
 * 验证工具函数
 * 提供各种数据验证功能
 */

/**
 * 验证电子邮件格式
 * @param {string} email 电子邮件地址
 * @returns {boolean} 是否有效
 */
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
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