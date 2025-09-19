// API配置测试脚本
// 这个脚本可以帮助你检查插件实际使用的API配置
// 使用方法: 在Obsidian中按F12打开开发者工具，然后在控制台中运行以下代码
// require('./.obsidian/plugins/colorize-text/api_config_test.js')

console.log('==== Colorize Text 插件API配置测试 ====');

// 检查插件实例是否存在
if (typeof window.colorizeTextPluginInstance !== 'undefined') {
  console.log('插件实例存在');
  
  // 检查设置对象是否存在
  if (window.colorizeTextPluginInstance.settings) {
    const settings = window.colorizeTextPluginInstance.settings;
    console.log('当前API配置:');
    console.log('- API名称: ' + (settings.apiName || '未设置'));
    console.log('- API URL: ' + (settings.apiUrl || '未设置'));
    console.log('- API模型: ' + (settings.apiModel || '未设置'));
    console.log('- API密钥: ' + (settings.apiKey ? '已配置 (为了安全不显示具体值)' : '未配置'));
    
    // 验证API URL格式
    if (settings.apiUrl) {
      try {
        new URL(settings.apiUrl);
        console.log('- URL格式: 有效');
      } catch (e) {
        console.log('- URL格式: 无效: ' + e.message);
      }
    }
    
    // 针对错误提示
    if (settings.apiUrl && settings.apiUrl.includes('api.deepseek.com')) {
      console.warn('\n注意: 你的API URL指向DeepSeek服务器，这可能需要特殊的API密钥格式或不同的请求参数。');
      console.warn('建议: 如果你没有DeepSeek API密钥，请在插件设置中修改为OpenAI的URL: https://api.openai.com/v1/chat/completions');
    }
  } else {
    console.log('设置对象不存在');
  }
} else {
  console.log('插件实例不存在，请确保插件已正确加载');
}

console.log('================================');

// 在Obsidian控制台中使用以下代码可以直接修改设置（临时，重启后失效）
// window.colorizeTextPluginInstance.settings.apiUrl = 'https://api.openai.com/v1/chat/completions';
// window.colorizeTextPluginInstance.saveSettings();