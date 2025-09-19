const fs = require('fs');
const path = require('path');

// 读取并验证JSON文件
function validateMarkStyles() {
    try {
        const filePath = path.join(__dirname, 'morehighlightstyle_data.json');
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        // 检查是否包含markStyles数组
        if (!data.markStyles || !Array.isArray(data.markStyles)) {
            console.error('错误: markStyles数组不存在或格式不正确');
            return false;
        }
        
        console.log(`验证成功: markStyles数组包含${data.markStyles.length}个样式`);
        
        // 检查第一个样式
        if (data.markStyles.length > 0) {
            const firstStyle = data.markStyles[0];
            console.log(`第一个样式: { class: "${firstStyle.class}", name: "${firstStyle.name}" }`);
        }
        
        // 检查是否包含lastSaved和version字段
        if (data.lastSaved && data.version) {
            console.log(`版本信息: 版本=${data.version}, 最后保存时间=${data.lastSaved}`);
        }
        
        // 检查是否所有样式对象都不包含bgColor和textColor属性
        let hasInvalidProperty = false;
        data.markStyles.forEach((style, index) => {
            if (style.bgColor || style.textColor) {
                console.error(`错误: 样式索引${index}包含不应该有的属性: ${style.bgColor ? 'bgColor' : ''}${style.bgColor && style.textColor ? '和' : ''}${style.textColor ? 'textColor' : ''}`);
                hasInvalidProperty = true;
            }
        });
        
        if (!hasInvalidProperty) {
            console.log('验证通过: 所有样式对象都不包含bgColor和textColor属性');
        }
        
        // 检查是否所有样式对象都包含class和name属性
        let missingRequiredProperty = false;
        data.markStyles.forEach((style, index) => {
            if (!style.class) {
                console.error(`错误: 样式索引${index}缺少class属性`);
                missingRequiredProperty = true;
            }
            if (!style.name) {
                console.error(`错误: 样式索引${index}缺少name属性`);
                missingRequiredProperty = true;
            }
        });
        
        if (!missingRequiredProperty) {
            console.log('验证通过: 所有样式对象都包含必要的class和name属性');
        }
        
        return !hasInvalidProperty && !missingRequiredProperty;
    } catch (error) {
        console.error('JSON格式错误:', error.message);
        return false;
    }
}

// 运行验证
const isValid = validateMarkStyles();
console.log(`\n最终验证结果: ${isValid ? '通过' : '失败'}`);
process.exit(isValid ? 0 : 1);