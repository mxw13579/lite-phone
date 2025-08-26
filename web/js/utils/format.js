/**
 * 格式化工具函数
 * 提供日期、数字、大小等常用格式化功能
 */

/**
 * 格式化日期
 * @param {Date|string|number} date 日期对象、日期字符串或时间戳
 * @param {string} format 格式字符串，支持 YYYY、MM、DD、HH、mm、ss
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) {
            return 'Invalid Date';
        }
        
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        
        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
            
    } catch (error) {
        console.error('Date formatting error:', error);
        return 'Invalid Date';
    }
}

/**
 * 格式化相对时间
 * @param {Date|string|number} date 日期对象、日期字符串或时间戳
 * @returns {string} 相对时间字符串
 */
export function formatRelativeTime(date) {
    try {
        const d = new Date(date);
        const now = new Date();
        const diffInSeconds = Math.floor((now - d) / 1000);
        
        if (diffInSeconds < 60) {
            return '刚刚';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes}分钟前`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours}小时前`;
        } else if (diffInSeconds < 2592000) {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days}天前`;
        } else {
            // 超过30天显示具体日期
            return formatDate(d, 'MM-DD');
        }
        
    } catch (error) {
        console.error('Relative time formatting error:', error);
        return '未知时间';
    }
}

/**
 * 格式化时间范围
 * @param {Date|string|number} startDate 开始日期
 * @param {Date|string|number} endDate 结束日期
 * @returns {string} 时间范围字符串
 */
export function formatTimeRange(startDate, endDate) {
    try {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return 'Invalid Date Range';
        }
        
        const isSameDay = start.toDateString() === end.toDateString();
        
        if (isSameDay) {
            return `${formatDate(start, 'MM-DD')} ${formatDate(start, 'HH:mm')}-${formatDate(end, 'HH:mm')}`;
        } else {
            return `${formatDate(start, 'MM-DD HH:mm')} - ${formatDate(end, 'MM-DD HH:mm')}`;
        }
        
    } catch (error) {
        console.error('Time range formatting error:', error);
        return 'Invalid Date Range';
    }
}

/**
 * 格式化数字
 * @param {number} num 数字
 * @param {Object} options 格式化选项
 * @returns {string} 格式化后的数字字符串
 */
export function formatNumber(num, options = {}) {
    try {
        const {
            decimals = 0,
            thousandsSeparator = ',',
            decimalPoint = '.',
            prefix = '',
            suffix = ''
        } = options;
        
        if (typeof num !== 'number' || isNaN(num)) {
            return 'NaN';
        }
        
        const fixed = num.toFixed(decimals);
        const [integer, decimal] = fixed.split('.');
        
        // 添加千位分隔符
        const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
        
        let result = formattedInteger;
        if (decimal && decimals > 0) {
            result += decimalPoint + decimal;
        }
        
        return prefix + result + suffix;
        
    } catch (error) {
        console.error('Number formatting error:', error);
        return String(num);
    }
}

/**
 * 格式化文件大小
 * @param {number} bytes 字节数
 * @param {number} decimals 小数位数
 * @returns {string} 格式化后的文件大小
 */
export function formatFileSize(bytes, decimals = 2) {
    try {
        if (!bytes || bytes === 0) return '0 B';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
        
    } catch (error) {
        console.error('File size formatting error:', error);
        return String(bytes) + ' B';
    }
}

/**
 * 格式化百分比
 * @param {number} value 值
 * @param {number} total 总数
 * @param {number} decimals 小数位数
 * @returns {string} 百分比字符串
 */
export function formatPercentage(value, total, decimals = 1) {
    try {
        if (!total || total === 0) return '0%';
        
        const percentage = (value / total) * 100;
        return percentage.toFixed(decimals) + '%';
        
    } catch (error) {
        console.error('Percentage formatting error:', error);
        return '0%';
    }
}

/**
 * 格式化持续时间
 * @param {number} seconds 秒数
 * @returns {string} 持续时间字符串
 */
export function formatDuration(seconds) {
    try {
        if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
            return '00:00';
        }
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        } else {
            return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        
    } catch (error) {
        console.error('Duration formatting error:', error);
        return '00:00';
    }
}

/**
 * 格式化货币
 * @param {number} amount 金额
 * @param {string} currency 货币符号
 * @param {number} decimals 小数位数
 * @returns {string} 货币字符串
 */
export function formatCurrency(amount, currency = '¥', decimals = 2) {
    try {
        if (typeof amount !== 'number' || isNaN(amount)) {
            return currency + '0.00';
        }
        
        const formatted = formatNumber(amount, {
            decimals,
            thousandsSeparator: ','
        });
        
        return currency + formatted;
        
    } catch (error) {
        console.error('Currency formatting error:', error);
        return currency + String(amount);
    }
}

/**
 * 格式化电话号码
 * @param {string} phoneNumber 电话号码
 * @returns {string} 格式化后的电话号码
 */
export function formatPhoneNumber(phoneNumber) {
    try {
        // 移除所有非数字字符
        const cleaned = phoneNumber.replace(/\D/g, '');
        
        if (cleaned.length === 11) {
            // 中国手机号格式：138-0013-8000
            return cleaned.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
        } else if (cleaned.length === 10) {
            // 美国电话号格式：(555) 123-4567
            return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');
        } else {
            return phoneNumber; // 返回原始格式
        }
        
    } catch (error) {
        console.error('Phone number formatting error:', error);
        return phoneNumber;
    }
}

/**
 * 截断文本
 * @param {string} text 原始文本
 * @param {number} maxLength 最大长度
 * @param {string} suffix 后缀
 * @returns {string} 截断后的文本
 */
export function truncateText(text, maxLength, suffix = '...') {
    try {
        if (!text || typeof text !== 'string') {
            return '';
        }
        
        if (text.length <= maxLength) {
            return text;
        }
        
        return text.substring(0, maxLength - suffix.length) + suffix;
        
    } catch (error) {
        console.error('Text truncation error:', error);
        return String(text);
    }
}

/**
 * 高亮文本中的关键词
 * @param {string} text 原始文本
 * @param {string} keyword 关键词
 * @param {string} className CSS类名
 * @returns {string} 高亮后的HTML字符串
 */
export function highlightText(text, keyword, className = 'highlight') {
    try {
        if (!text || !keyword || typeof text !== 'string') {
            return text;
        }
        
        const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedKeyword})`, 'gi');
        
        return text.replace(regex, `<span class="${className}">$1</span>`);
        
    } catch (error) {
        console.error('Text highlighting error:', error);
        return text;
    }
}

/**
 * 将驼峰命名转换为短横线命名
 * @param {string} str 驼峰命名字符串
 * @returns {string} 短横线命名字符串
 */
export function kebabCase(str) {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
}

/**
 * 将短横线命名转换为驼峰命名
 * @param {string} str 短横线命名字符串
 * @returns {string} 驼峰命名字符串
 */
export function camelCase(str) {
    return str.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
}