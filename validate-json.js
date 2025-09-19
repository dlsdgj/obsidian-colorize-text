const fs = require('fs');

try {
    const content = fs.readFileSync('morehighlightstyle_data.json', 'utf8');
    const data = JSON.parse(content);
    
    console.log('JSON格式验证通过!');
    console.log('文件包含', data.markStyles.length, '个mark样式');
    
    // 检查第一个样式是否有正确的属性
    if (data.markStyles && data.markStyles.length > 0) {
        const firstStyle = data.markStyles[0];
        console.log('第一个样式:');
        console.log('  class:', firstStyle.class);
        console.log('  name:', firstStyle.name);
        console.log('  textColor:', firstStyle.textColor);
        console.log('  bgColor:', firstStyle.bgColor);
        
        // 检查是否有黑底白字的样式
        const hasBlackWhiteStyles = data.markStyles.some(style => 
            style.textColor === '#FFFFFF' && style.bgColor === '#000000'
        );
        
        if (hasBlackWhiteStyles) {
            console.log('警告: 文件中仍包含黑底白字的样式!');
        } else {
            console.log('✅ 成功: 文件中没有黑底白字的样式!');
        }
    }
} catch (error) {
    console.error('JSON格式错误:', error.message);
}