const { Plugin, Modal, MarkdownView, Setting, PluginSettingTab } = require("obsidian");
// 动态加载 Pickr，无需 require

module.exports = class ColorizeTextPlugin extends Plugin {
  async onload() {
    // 初始化日志文件
    const fs = require('fs').promises;
    const path = require('path');
    this.logPath = path.join("D:\\Documents\\Obsidian Vault\\.obsidian\\plugins\\colorize-text", 'debug.log');
    try {
      await fs.writeFile(this.logPath, `ColorizeText 插件初始化开始 - ${new Date().toISOString()}\n`, 'utf8');
      await fs.appendFile(this.logPath, `工作目录: ${process.cwd()}\n`, 'utf8');
      await fs.appendFile(this.logPath, `插件路径: ${__dirname}\n`, 'utf8');
    } catch (err) {
      console.error('初始化日志失败:', err);
    }
    
    // 测试控制台输出
    console.log('=== ColorizeText 插件加载测试 ===');
    console.log('ColorizeText: 控制台测试 - 如果你看到这条消息，说明控制台正常工作');
    console.log('ColorizeText: 插件版本: 1.0.0');
    console.log('ColorizeText: 当前时间:', new Date().toISOString());
    console.log('=== 控制台测试结束 ===');
    
    // 首先立即创建设置对象，确保它在插件启动时就存在
    this.settings = {
      apiKey: "",
      apiName: "OpenAI",
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiModel: "gpt-3.5-turbo",
      enableAIColor: true
    };
    
    // 添加日志方法
    this.log = async (message) => {
      try {
        await fs.appendFile(this.logPath, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
      } catch (err) {
        console.error('写入日志失败:', err);
      }
    };
    
    // 尝试从api_data.json加载API设置
    try {
      await this.loadApiSettings();
    } catch (loadError) {
      console.error('ColorizeText: 加载API设置失败，将使用默认设置:', loadError.message);
    }
    
    try {
      console.log("ColorizeText 插件已加载");
      // 添加设置标签页
    try {
      if (this.app && this.addSettingTab) {
        const settingsTab = new ColorizeTextSettingsTab(this.app, this);
        this.addSettingTab(settingsTab);
        console.log('ColorizeText: 设置标签页已添加');
      }
    } catch (error) {
      console.error('ColorizeText: 添加设置标签页失败:', error);
    }
      
      // 注册命令和快捷键
    try {
      if (this.addCommand) {
        this.addCommand({
          id: "open-colorize-modal",
          name: "打开配色弹窗",
          hotkeys: [
            { modifiers: ["Ctrl", "Shift"], key: "H" },
            { modifiers: ["Mod"], key: "k" }
          ],
          editorCallback: (editor, view) => {
            try {
              this.openColorModal(editor);
            } catch (error) {
              console.error('ColorizeText: 打开弹窗失败:', error);
              new Notice('打开配色弹窗失败: ' + error.message);
            }
          }
        });
        this.addCommand({
          id: "apply-highlight-history",
          name: "应用历史高亮到当前文件",
          hotkeys: [{ modifiers: ["Mod", "Shift"], key: "k" }],
          editorCallback: (editor, view) => {
            this.applyHighlightHistoryToCurrentFile(editor);
          }
        });
        console.log('ColorizeText: 命令和快捷键已成功注册');
      }
    } catch (error) {
      console.error('ColorizeText: 注册命令失败:', error);
    }
      
      // 加载已保存配色和高亮历史
      // 首先从span_data.json加载span标签的配置
      const data = await this.loadSpanData() || {};
      this.palette = data.palette || [
        { textColor: "#FFFFFF", bgColor: "#000000" }
      ];
      
      // 独立加载mark标签的配置，不再覆盖span标签的配置
      this.markStyles = [];
      try {
        const data2 = await this.loadData2();
        if (data2 && data2.markStyles && Array.isArray(data2.markStyles) && data2.markStyles.length > 0) {
          // 过滤掉可能的null或undefined值
          const filteredStyles = data2.markStyles.filter(style => style !== null && style !== undefined);
          if (filteredStyles.length > 0) {
            this.markStyles = filteredStyles;
            console.log(`ColorizeText: 已从morehighlightstyle_data.json加载mark标签配置，共${this.markStyles.length}个样式`);
          }
        }
      } catch (error) {
        console.error("ColorizeText: 加载morehighlightstyle_data.json配置时出错:", error);
      }
      
      // 使用Node.js的path模块来处理路径，确保跨平台兼容性
      const path = require('path');
      // 创建高亮历史目录 - 直接使用正确的配置目录路径
      // 修复：使用正确的配置目录路径，避免使用可能有问题的this.app.vault.configDir
      const correctConfigDir = "D:\\Documents\\Obsidian Vault\\.obsidian";
      this.highlightHistoryDir = path.join(correctConfigDir, 'plugins', 'colorize-text', 'highlight_histories');
      console.log(`ColorizeText: 高亮历史目录(完整绝对路径): ${this.highlightHistoryDir}`);
      await this.ensureDirectoryExists(this.highlightHistoryDir);
      
      // 检查是否需要从旧格式迁移
      if (data.highlightHistory) {
        // 迁移旧格式数据到单独的文件
        await this.migrateOldHighlightHistory(data.highlightHistory);
        // 清除主文件中的highlightHistory
        await this.saveSpanData({
          palette: this.palette,
          settings: this.settings || {},
          // 不再保存highlightHistory到主文件
        });
      }
      
      // 初始化highlightHistory为空对象，按需加载
      this.highlightHistory = {};
      
      // 合并从loadSpanData加载的设置
      if (data?.settings) {
        this.settings = {
          ...this.settings,
          ...data.settings
        };
        console.log('ColorizeText: 最终加载的settings:', this.settings);
      }
      
    // 挂载到全局，供弹窗回调使用
    window.colorizeTextPluginInstance = this;
    
    // 添加全局鼠标点击事件监听器来记录光标位置
    this.registerEvent(
      this.app.workspace.on('editor-click', (editor, view) => {
        try {
          const cursor = editor.getCursor();
          const lineCount = editor.lineCount();
          console.log(`ColorizeText: 鼠标左键点击 - 当前行: ${cursor.line}, 列: ${cursor.ch}, 总行数: ${lineCount}`);
          
          // 获取当前行内容
          const lineContent = editor.getLine(cursor.line);
          console.log(`ColorizeText: 当前行内容: "${lineContent}"`);
          
          // 获取选中的文本（如果有）
          const selectedText = editor.getSelection();
          if (selectedText) {
            console.log(`ColorizeText: 选中文本: "${selectedText}"`);
          }
        } catch (error) {
          console.error('ColorizeText: 记录鼠标点击位置失败:', error);
        }
      })
    );
    
    // 添加右键点击事件监听器来记录光标位置
    this.registerEvent(
      this.app.workspace.on('editor-context-menu', (editor, view) => {
        try {
          const cursor = editor.getCursor();
          const lineCount = editor.lineCount();
          console.log(`ColorizeText: 鼠标右键点击 - 当前行: ${cursor.line}, 列: ${cursor.ch}, 总行数: ${lineCount}`);
          
          // 获取当前行内容
          const lineContent = editor.getLine(cursor.line);
          console.log(`ColorizeText: 当前行内容: "${lineContent}"`);
          
          // 获取选中的文本（如果有）
          const selectedText = editor.getSelection();
          if (selectedText) {
            console.log(`ColorizeText: 选中文本: "${selectedText}"`);
          }
        } catch (error) {
          console.error('ColorizeText: 记录鼠标右键点击位置失败:', error);
        }
      })
    );
    
    // 添加光标位置变化监听器
    this.registerEvent(
      this.app.workspace.on('editor-change', (editor, view) => {
        try {
          const cursor = editor.getCursor();
          // 只在行号变化时记录，避免过多日志
          if (this.lastCursorLine !== cursor.line) {
            console.log(`ColorizeText: 光标移动到第 ${cursor.line} 行, 列: ${cursor.ch}`);
            this.lastCursorLine = cursor.line;
          }
        } catch (error) {
          console.error('ColorizeText: 记录光标移动失败:', error);
        }
      })
    );
    
    // 添加文件重命名事件监听器
    this.registerEvent(
      this.app.vault.on('rename', async (file, oldPath) => {
        try {
          await this.handleFileRename(file, oldPath);
        } catch (error) {
          console.error('处理文件重命名失败:', error);
        }
      })
    )

    // 添加文件删除事件监听器
    this.registerEvent(
      this.app.vault.on('delete', async (file) => {
        try {
          await this.handleFileDelete(file);
        } catch (error) {
          console.error('处理文件删除失败:', error);
        }
      })
    );
    } catch (error) {
      console.error("ColorizeText: onload方法发生严重错误导致插件卸载:", error);
      console.error("ColorizeText: 错误堆栈:", error.stack);
    }
  }
  
  // 处理文件重命名事件
  async handleFileRename(file, oldPath) {
    // 只处理markdown文件
    if (!file.path.endsWith('.md')) return;
    
    const fs = require('fs').promises;
    const path = require('path');
    
    // 获取旧的高亮历史文件路径
    const oldHighlightFileName = this.getHighlightFileName(oldPath);
    // 获取新的高亮历史文件路径
    const newHighlightFileName = this.getHighlightFileName(file.path);
    
    // 检查旧文件是否存在
    try {
      await fs.access(oldHighlightFileName);
      
      // 重命名高亮历史文件
      await fs.rename(oldHighlightFileName, newHighlightFileName);
      console.log(`ColorizeText: 高亮历史文件已从 ${oldHighlightFileName} 重命名为 ${newHighlightFileName}`);
      
      // 更新内存中的缓存键名
      if (this.highlightHistory[oldPath]) {
        this.highlightHistory[file.path] = this.highlightHistory[oldPath];
        delete this.highlightHistory[oldPath];
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`重命名高亮历史文件失败: ${oldHighlightFileName} -> ${newHighlightFileName}`, error);
      }
      // 如果旧文件不存在，不需要做任何事情
    }
  }
  
  // 处理文件删除事件
  async handleFileDelete(file) {
    // 只处理markdown文件
    if (!file.path.endsWith('.md')) return;
    
    const fs = require('fs').promises;
    
    // 获取对应的高亮历史文件路径
    const highlightFileName = this.getHighlightFileName(file.path);
    
    // 检查高亮历史文件是否存在
    try {
      await fs.access(highlightFileName);
      
      // 删除高亮历史文件
      await fs.unlink(highlightFileName);
      console.log(`ColorizeText: 高亮历史文件已删除: ${highlightFileName}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error(`删除高亮历史文件失败: ${highlightFileName}`, error);
      }
      // 如果文件不存在，不需要做任何事情
    }
    
    // 从内存缓存中删除对应的高亮历史
    if (this.highlightHistory[file.path]) {
      delete this.highlightHistory[file.path];
    }
  }
  
  // 将光标所在行居中显示的方法 - 基于simple-goto-line插件的实现
  centerCursorInEditor(editor) {
    try {
      const cursor = editor.getCursor();
      const lineCount = editor.lineCount();
      
      console.log(`ColorizeText: 开始居中光标 - 当前行: ${cursor.line}, 总行数: ${lineCount}`);
      
      // 关键优化：先聚焦编辑器，再进行其他操作
      editor.focus();
      
      const lineIndex = cursor.line;
      
      if (lineIndex >= 0 && lineIndex < editor.lineCount()) {
        // 改进的滚动逻辑，确保目标行显示在视口中间
        try {
          // 尝试使用更精确的滚动方法
          if (typeof editor.cm?.scrollIntoView === 'function') {
            // CodeMirror编辑器
            editor.cm.scrollIntoView({
              line: lineIndex,
              ch: cursor.ch
            }, 0.5); // 0.5表示居中
            console.log(`ColorizeText: 使用CodeMirror scrollIntoView居中，行: ${lineIndex + 1}`);
          } else if (typeof editor.scrollIntoView === 'function') {
            // 备用方案：使用scrollIntoView并尝试居中
            const editorEl = editor.domElement?.closest('.cm-editor')?.querySelector('.cm-scroller');
            if (editorEl) {
              // 近似计算居中滚动位置
              const lineHeight = editor.defaultLineHeight || 20; // 近似行高
              const viewportHeight = editorEl.clientHeight;
              const scrollInfo = editor.getScrollInfo?.();
              const currentScrollTop = scrollInfo?.top || 0;
              const targetScroll = currentScrollTop + (lineIndex * lineHeight) - (viewportHeight / 2) + (lineHeight / 2);
              
              console.log(`ColorizeText: 计算滚动位置 - 行高: ${lineHeight}, 视口高度: ${viewportHeight}, 当前滚动: ${currentScrollTop}, 目标滚动: ${targetScroll}`);
              
              // 使用setTimeout确保在光标设置后执行滚动
              setTimeout(() => {
                try {
                  editor.scrollTo(0, targetScroll);
                  console.log(`ColorizeText: 使用计算滚动位置居中完成，行: ${lineIndex + 1}`);
                } catch (scrollError) {
                  console.error('ColorizeText: 计算滚动失败:', scrollError);
                  // 最终备用方案
                  editor.scrollIntoView({
                    from: { line: lineIndex, ch: cursor.ch },
                    to: { line: lineIndex, ch: cursor.ch }
                  }, true);
                  console.log(`ColorizeText: 使用备用scrollIntoView，行: ${lineIndex + 1}`);
                }
              }, 50);
            } else {
              // 最终备用方案
              editor.scrollIntoView({
                from: { line: lineIndex, ch: cursor.ch },
                to: { line: lineIndex, ch: cursor.ch }
              }, true);
              console.log(`ColorizeText: 使用最终备用scrollIntoView，行: ${lineIndex + 1}`);
            }
          }
        } catch (scrollError) {
          console.error('ColorizeText: 滚动错误:', scrollError);
          // 最终备用方案
          editor.scrollIntoView({
            from: { line: lineIndex, ch: cursor.ch },
            to: { line: lineIndex, ch: cursor.ch }
          }, true);
          console.log(`ColorizeText: 使用错误处理备用scrollIntoView，行: ${lineIndex + 1}`);
        }
        
        console.log(`ColorizeText: 光标行已居中，当前行: ${lineIndex + 1}`);
      } else {
        console.error('ColorizeText: 无效的行号:', lineIndex);
      }
    } catch (error) {
      console.error("ColorizeText: 居中光标失败:", error);
      console.error("ColorizeText: 错误详情:", error.stack);
      // 即使出错也只尝试最基本的操作
      try {
        const cursor = editor.getCursor();
        editor.focus();
        console.log(`ColorizeText: 尝试基础聚焦和滚动到光标位置，行: ${cursor.line}`);
        // 简单的滚动到光标位置
        editor.scrollIntoView({
          from: { line: cursor.line, ch: cursor.ch }, 
          to: { line: cursor.line, ch: cursor.ch }
        }, true);
        console.log(`ColorizeText: 基础滚动完成`);
      } catch (fallbackError) {
        console.error("ColorizeText: 基础滚动也失败:", fallbackError);
        console.error("ColorizeText: 基础滚动错误详情:", fallbackError.stack);
      }
    }
  }

  // 将当前文件中与高亮历史关键词相同的文本应用相同颜色
  async applyHighlightHistoryToCurrentFile(editor) {
    const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
    
    if (filePath === "__unknown__") {
      console.error("ColorizeText: 无法获取当前文件路径");
      new Notice("无法获取当前文件路径");
      return;
    }
    
    // 记录应用高亮前的光标位置
    const beforeCursor = editor.getCursor();
    console.log(`ColorizeText: 应用历史高亮前 - 当前行: ${beforeCursor.line}, 列: ${beforeCursor.ch}`);
    
    console.log("ColorizeText: 当前文件路径:", filePath);
    console.log("ColorizeText: 对应高亮历史文件:", this.getHighlightFileName(filePath));
    
    // 加载当前文件的高亮历史
    const history = await this.loadFileHighlightHistory(filePath);
    
    if (!history || history.length === 0) {
      console.log("ColorizeText: 高亮历史记录:", history);
      new Notice("当前文件没有高亮历史记录");
      return;
    }
    
    // 直接使用内嵌的应用高亮历史函数
    const content = editor.getValue();
    const result = this.applyHighlightHistoryToFile(content, history);
    
    if (result.appliedCount > 0) {
      const oldCursor = editor.getCursor();
      const oldScroll = editor.getScrollInfo ? editor.getScrollInfo() : null;
      
      console.log(`ColorizeText: 应用历史高亮前记录的光标位置 - 行: ${oldCursor.line}, 列: ${oldCursor.ch}`);
      
      editor.setValue(result.processedContent);
      
      // 恢复光标位置和滚动位置
      if (oldCursor) {
        editor.setCursor(oldCursor);
        console.log(`ColorizeText: 应用历史高亮后恢复光标位置 - 行: ${oldCursor.line}, 列: ${oldCursor.ch}`);
      }
      if (oldScroll && editor.scrollTo) {
        editor.scrollTo(oldScroll.left, oldScroll.top);
      }
      
      // 应用高亮后将光标所在行居中显示
      setTimeout(() => {
        const afterCursor = editor.getCursor();
        console.log(`ColorizeText: 准备居中光标时的光标位置 - 行: ${afterCursor.line}, 列: ${afterCursor.ch}`);
        this.centerCursorInEditor(editor);
      }, 100); // 稍微延迟以确保DOM更新完成
      
      new Notice(`已应用 ${result.appliedCount} 处高亮`);
    } else {
      new Notice("没有找到需要应用高亮的文本");
    }
  }

  // 应用高亮历史到文件内容的函数（优化版本）
  applyHighlightHistoryToFile(fileContent, highlightHistory) {
    // 提前检查参数有效性
    if (!fileContent || !highlightHistory || highlightHistory.length === 0) {
      return { processedContent: fileContent, appliedCount: 0 };
    }
    
    let processedContent = fileContent;
    let appliedCount = 0;
    
    // 按文本长度排序，优先匹配较长的文本
    const sortedHistory = [...highlightHistory].sort((a, b) => b.text.length - a.text.length);
    
    // 创建一个通用的检查函数，避免重复代码
    const checkIfInFormat = (beforeMatch, afterMatch) => {
      // 检查是否在 mark 标签内
      const lastMarkStart = beforeMatch.lastIndexOf('<mark');
      const lastMarkEnd = beforeMatch.lastIndexOf('</mark>');
      const isInMark = lastMarkStart > lastMarkEnd;
      
      if (isInMark) return true;
      
      // 检查是否在 span 标签内
      const lastSpanStart = beforeMatch.lastIndexOf('<span');
      const lastSpanEnd = beforeMatch.lastIndexOf('</span>');
      const isInSpan = lastSpanStart > lastSpanEnd;
      
      if (isInSpan) return true;
      
      // 检查是否在bold格式内 (**text**)
      const allBoldBefore = (beforeMatch.match(/\*\*/g) || []).length;
      const isInBold = allBoldBefore % 2 === 1;
      
      if (isInBold) return true;
      
      // 检查是否在链接格式内 ([[text]])
      const lastLinkStart = beforeMatch.lastIndexOf('[[');
      const lastLinkEnd = beforeMatch.lastIndexOf(']]');
      const isInLink = lastLinkStart > lastLinkEnd;
      
      if (isInLink) return true;
      
      // 快速检查后面是否有结束标签
      if (afterMatch && afterMatch.length >= 10) {
        const nextChars = afterMatch.substring(0, 10);
        const hasClosingTag = nextChars.startsWith('</mark>') || 
                             nextChars.startsWith('</span>') || 
                             nextChars.startsWith('**') || 
                             nextChars.startsWith(']]');
        
        if (hasClosingTag) return true;
      }
      
      return false;
    };
    
    // 对不同类型的高亮使用统一的处理逻辑
    for (const item of sortedHistory) {
      const searchText = item.text;
      if (!searchText) continue;
      
      // 转义搜索文本中的特殊字符
      const escapedSearchText = this.escapeRegExp(searchText);
      
      let regex, replacement;
      
      if (item.markClass) {
        // 处理 markClass 类型的高亮
        regex = new RegExp(escapedSearchText, "g");
        replacement = (match, offset) => {
          const beforeMatch = processedContent.slice(0, offset);
          const afterMatch = processedContent.slice(offset + match.length);
          
          if (checkIfInFormat(beforeMatch, afterMatch)) {
            return match;
          }
          
          appliedCount++;
          return `<mark class="${item.markClass}">${match}</mark>`;
        };
      } else if (item.fullStyle === "bold") {
        // 处理 bold 格式
        regex = new RegExp(escapedSearchText, "g");
        replacement = (match, offset) => {
          const beforeMatch = processedContent.slice(0, offset);
          const afterMatch = processedContent.slice(offset + match.length);
          
          if (checkIfInFormat(beforeMatch, afterMatch)) {
            return match;
          }
          
          appliedCount++;
          return `**${match}**`;
        };
      } else if (item.fullStyle === "link") {
        // 处理 link 格式
        regex = new RegExp(escapedSearchText, "g");
        replacement = (match, offset) => {
          const beforeMatch = processedContent.slice(0, offset);
          const afterMatch = processedContent.slice(offset + match.length);
          
          if (checkIfInFormat(beforeMatch, afterMatch)) {
            return match;
          }
          
          appliedCount++;
          return `[[${match}]]`;
        };
      } else if (item.textColor || item.bgColor || item.fullStyle) {
        // 处理普通 span 样式
        const textColor = item.textColor || '';
        const bgColor = item.bgColor || '';
        const style = item.fullStyle || (textColor || bgColor ? 
            `color: ${textColor}; background-color: ${bgColor}` : '');
        
        if (style) {
          regex = new RegExp(escapedSearchText, "g");
          replacement = (match, offset) => {
            const beforeMatch = processedContent.slice(0, offset);
            const afterMatch = processedContent.slice(offset + match.length);
            
            if (checkIfInFormat(beforeMatch, afterMatch)) {
              return match;
            }
            
            appliedCount++;
            return `<span style="${style}">${match}</span>`;
          };
        } else {
          continue; // 没有样式需要应用，跳过
        }
      } else {
        continue; // 不支持的高亮类型，跳过
      }
      
      // 应用替换
      processedContent = processedContent.replace(regex, replacement);
    }
    
    return { processedContent, appliedCount };
  }
  
  // 转义正则表达式特殊字符
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& 表示整个匹配的字符串
  }
  
  // 独立的转义函数，用于事件处理等上下文可能变化的场景
  static staticEscapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& 表示整个匹配的字符串
  }
  
  // 清理事件监听器和资源
  onunload() {
    console.log("ColorizeText 插件已卸载");


    // 所有通过registerEvent注册的事件会自动清理
  }
  
  // 确保目录存在
  async ensureDirectoryExists(dirPath) {
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      console.log(`ColorizeText: 尝试创建目录: ${dirPath}`);
      // 获取目录的绝对路径进行验证
      const absoluteDirPath = path.resolve(dirPath);
      console.log(`ColorizeText: 目录绝对路径: ${absoluteDirPath}`);
      
      await fs.mkdir(absoluteDirPath, { recursive: true });
      console.log(`ColorizeText: 目录创建成功: ${absoluteDirPath}`);
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.error("ColorizeText: 创建高亮历史目录失败:", err);
      } else {
        console.log(`ColorizeText: 目录已存在: ${dirPath}`);
      }
    }
  }
  
  // 迁移旧格式数据到单独的文件
  async migrateOldHighlightHistory(oldHistory) {
    const fs = require('fs').promises;
    for (const [filePath, highlights] of Object.entries(oldHistory)) {
      if (highlights && highlights.length > 0) {
        await this.saveFileHighlightHistory(filePath, highlights);
      }
    }
  }
  
  // 获取文件对应的高亮历史文件名
  getHighlightFileName(filePath) {
    const path = require('path');
    // 替换文件名中可能导致问题的字符，并移除原始文件扩展名
    const baseName = path.basename(filePath, path.extname(filePath));
    const safeName = baseName.replace(/[\\/:*?"<>|]/g, "_") + ".json";
    const fullPath = path.join(this.highlightHistoryDir, safeName);
    console.log(`ColorizeText: 高亮历史文件路径(完整绝对路径): ${fullPath}`);
    return fullPath;
  }
  
  // 加载配置的增强方法 - 同时检查span_data.json和data.json
  async loadSpanData() {
    try {
      const spanDataFilePath = '.obsidian/plugins/colorize-text/span_data.json';
      
      // 用于存储最终的配置结果
      let finalData = null;
      
      // 尝试加载span_data.json
      // 首先尝试使用vault接口（Obsidian推荐的方式）
      const spanDataFile = this.app.vault.getAbstractFileByPath(spanDataFilePath);
      if (spanDataFile && spanDataFile instanceof File) {
        const content = await this.app.vault.read(spanDataFile);
        console.log('ColorizeText: 成功通过vault接口读取span标签配置文件');
        
        // 立即验证解析结果
        finalData = JSON.parse(content);
        console.log('ColorizeText: span标签配置解析成功');
      } else {
        // 如果vault接口无法找到文件，尝试使用adapter接口作为后备
        try {
          console.log('ColorizeText: vault接口未找到span标签配置文件，尝试使用adapter接口');
          const content = await this.app.vault.adapter.read(spanDataFilePath);
          console.log('ColorizeText: 成功通过adapter接口读取span标签配置文件');
          
          // 立即验证解析结果
          finalData = JSON.parse(content);
          console.log('ColorizeText: adapter接口span标签配置解析成功');
        } catch (adapterError) {
          console.log('ColorizeText: adapter接口也无法读取span标签配置文件:', adapterError.message);
        }
      }
      
      // 如果成功加载了配置，确保settings结构完整
      if (finalData && finalData.settings) {
        // 合并默认设置，确保所有必要的设置项都存在
        finalData.settings = {
          apiKey: "",
          apiName: "OpenAI",
          apiUrl: "https://api.openai.com/v1/chat/completions",
          apiModel: "gpt-3.5-turbo",
          ...finalData.settings
        };
      }
      
      console.log('ColorizeText: 配置加载完成', finalData ? '成功' : '失败，将使用默认配置');
      return finalData;
    } catch (error) {
      console.error("读取配置失败:", error);
    }
    return null;
  }
  
  // 增强的配置加载方法 - 同时支持vault和adapter接口
  async loadData2() {
    try {
      const data2FilePath = '.obsidian/plugins/colorize-text/morehighlightstyle_data.json';
      
      // 首先尝试使用vault接口（Obsidian推荐的方式）
      const data2File = this.app.vault.getAbstractFileByPath(data2FilePath);
      if (data2File && data2File instanceof File) {
        const content = await this.app.vault.read(data2File);
        console.log('ColorizeText: 成功通过vault接口读取mark标签配置文件');
        
        // 打印配置文件的前100个字符，用于调试
        console.log('ColorizeText: mark标签配置文件内容预览:', content.substring(0, 100));
        
        // 立即验证解析结果
        const parsedData = JSON.parse(content);
        console.log('ColorizeText: mark标签配置解析成功，共', parsedData.markStyles ? parsedData.markStyles.length : 0, '个样式');
        return parsedData;
      }
      
      // 如果vault接口无法找到文件，尝试使用adapter接口作为后备
      try {
        console.log('ColorizeText: vault接口未找到mark标签配置文件，尝试使用adapter接口');
        const content = await this.app.vault.adapter.read(data2FilePath);
        console.log('ColorizeText: 成功通过adapter接口读取mark标签配置文件');
        
        // 立即验证解析结果
        const parsedData = JSON.parse(content);
        console.log('ColorizeText: adapter接口mark标签配置解析成功，共', parsedData.markStyles ? parsedData.markStyles.length : 0, '个样式');
        return parsedData;
      } catch (adapterError) {
        console.log('ColorizeText: adapter接口也无法读取mark标签配置文件:', adapterError.message);
      }
      
      console.log('ColorizeText: mark标签配置文件不存在或无法读取，将使用默认配置');
    } catch (error) {
      console.error('ColorizeText: 读取mark标签配置文件时出错:', error);
    }
    return null;
  }
  
  // 从单独文件加载文件高亮历史
  async loadFileHighlightHistory(filePath) {
    // 确保highlightHistory对象存在
    if (!this.highlightHistory) {
      this.highlightHistory = {};
      console.log('ColorizeText: 已初始化缺失的highlightHistory对象');
    }
    
    if (!filePath || filePath === "__unknown__") {
      console.log('ColorizeText: 无效的文件路径:', filePath);
      return [];
    }
    
    // 优先从内存缓存加载
    if (this.highlightHistory[filePath]) {
      console.log('ColorizeText: 从内存缓存加载高亮历史:', filePath);
      return this.highlightHistory[filePath];
    }
    
    const fs = require('fs').promises;
    const fileName = this.getHighlightFileName(filePath);
    console.log('ColorizeText: 尝试从文件加载高亮历史:', fileName);
    try {
      const content = await fs.readFile(fileName, 'utf8');
      console.log('ColorizeText: 文件内容:', content.substring(0, 100) + (content.length > 100 ? '...' : ''));
      const history = JSON.parse(content);
      // 缓存到内存
      this.highlightHistory[filePath] = history;
      await this.log(`成功加载高亮历史记录数: ${history.length}, 文件: ${fileName}`);
      console.log('ColorizeText: 成功加载高亮历史记录数:', history.length);
      return history;
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`加载文件高亮历史失败 (${filePath}):`, err);
      }
      // 如果文件不存在，返回空数组
      this.highlightHistory[filePath] = [];
      return [];
    }
  }
  
  // 保存文件高亮历史到单独文件
  async saveFileHighlightHistory(filePath, history) {
    const fs = require('fs').promises;
    const path = require('path');
    
    if (!filePath || filePath === "__unknown__") {
      console.log(`ColorizeText: 无效的文件路径，跳过保存: ${filePath}`);
      return;
    }
    
    const fileName = this.getHighlightFileName(filePath);
    
    // 更新内存缓存
    this.highlightHistory[filePath] = history || [];
    
    try {
      // 再次确保目录存在，以防初始化时目录创建失败
      await this.ensureDirectoryExists(this.highlightHistoryDir);
      
      if (!history || history.length === 0) {
        // 如果历史记录为空，删除对应的历史文件
        try {
          await fs.access(fileName);
          await fs.unlink(fileName);
          console.log(`ColorizeText: 历史记录为空，已删除历史文件: ${fileName}`);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            console.error(`ColorizeText: 删除空历史文件失败: ${fileName}`, err);
          } else {
            console.log(`ColorizeText: 历史文件不存在，无需删除: ${fileName}`);
          }
        }
        return;
      }
      
      // 保存到文件
      console.log(`ColorizeText: 尝试保存文件: ${fileName}`);
      await fs.writeFile(fileName, JSON.stringify(history, null, 2), 'utf8');
      
      // 验证文件是否真的保存成功
      const fileExists = await fs.access(fileName).then(() => true).catch(() => false);
      if (fileExists) {
        console.log(`ColorizeText: 文件保存成功且已验证存在: ${fileName}`);
        // 获取文件信息
        const stats = await fs.stat(fileName);
        console.log(`ColorizeText: 文件大小: ${stats.size} 字节`);
      } else {
        console.error(`ColorizeText: 文件保存失败 - 验证文件不存在: ${fileName}`);
      }
    } catch (err) {
      console.error(`ColorizeText: 保存文件高亮历史失败 (${filePath}):`, err);
    }
  }
  
  // 删除文件高亮历史
  async deleteFileHighlightHistory(filePath) {
    if (!filePath || filePath === "__unknown__") {
      return;
    }
    


    const fs = require('fs').promises;
    const fileName = this.getHighlightFileName(filePath);
    
    try {
      // 从内存缓存删除
      delete this.highlightHistory[filePath];
      // 从文件系统删除
      await fs.unlink(fileName);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error(`删除文件高亮历史失败 (${filePath}):`, err);
      }
    }
  }
  
  async savePalette() {
    // 实现增强版双重保存和验证策略，完全借鉴saveFileHighlightHistory的工作方式
    const fs = require('fs').promises;
    const path = require('path');
    
    try {
      console.log('ColorizeText: 开始保存span标签配色方案...');
      console.log('ColorizeText: span标签配色方案包含', this.palette.length, '个配色');
      
      // 确保palette是数组
      const saveData = {
        palette: Array.isArray(this.palette) ? this.palette : [],
        settings: this.settings || {}
      };
      
      // 直接使用Node.js的fs模块保存文件（借鉴高亮历史的保存方式）
      try {
        // 获取数据文件的绝对路径
        const basePath = this.app?.vault?.adapter?.getBasePath() || "D:\\Documents\\Obsidian Vault";
        const dataFilePath = path.join(basePath, '.obsidian', 'plugins', 'colorize-text', 'span_data.json');
        const backupFilePath = path.join(basePath, '.obsidian', 'plugins', 'colorize-text', 'span_data.json.bak');
        
        console.log('ColorizeText: 数据文件路径:', dataFilePath);
        
        // 确保目录存在
        const dir = path.dirname(dataFilePath);
        try {
          await fs.mkdir(dir, { recursive: true });
        } catch (mkdirErr) {
          if (mkdirErr.code !== 'EEXIST') {
            console.error('ColorizeText: 创建目录失败:', mkdirErr.message);
          }
        }
        
        // 写入文件
        await fs.writeFile(dataFilePath, JSON.stringify(saveData, null, 2), 'utf8');
        console.log('ColorizeText: 成功通过Node.js fs模块保存span标签配置');
        
        // 尝试创建备份文件
        try {
          await fs.writeFile(backupFilePath, JSON.stringify(saveData, null, 2), 'utf8');
          console.log('ColorizeText: 已成功创建备份文件');
        } catch (backupErr) {
          console.warn('ColorizeText: 创建备份文件失败，但不影响主保存功能:', backupErr.message);
        }
        
        // 验证保存结果
        const content = await fs.readFile(dataFilePath, 'utf8');
        const savedData = JSON.parse(content);
        console.log('ColorizeText: 成功读取并解析数据文件');
        console.log('ColorizeText: 保存的数据包含', savedData.palette?.length || 0, '个配色');
        
        // 验证保存的数据与当前数据是否一致
        if (JSON.stringify(savedData.palette) === JSON.stringify(this.palette)) {
          console.log('ColorizeText: 配色方案保存成功且数据验证完全一致！');
        } else {
          console.warn('ColorizeText: 警告 - 保存的数据与当前数据不完全匹配');
          console.log('ColorizeText: 当前数据长度:', this.palette.length, '保存的数据长度:', savedData.palette?.length || 0);
        }
        
        return true;
      } catch (fsError) {
        console.error('ColorizeText: 使用fs模块保存失败:', fsError.message);
        
        // 作为最后的后备，尝试使用Obsidian的vault接口
        try {
          const spanDataFilePath = '.obsidian/plugins/colorize-text/span_data.json';
          const content = JSON.stringify(saveData, null, 2);
          
          if (this.app && this.app.vault) {
            try {
              const existingFile = this.app.vault.getAbstractFileByPath(spanDataFilePath);
              if (existingFile && existingFile instanceof File) {
                await this.app.vault.modify(existingFile, content);
                console.log('ColorizeText: 后备方案 - 成功通过vault接口更新span标签配置文件');
              } else {
                await this.app.vault.create(spanDataFilePath, content);
                console.log('ColorizeText: 后备方案 - 成功通过vault接口创建span标签配置文件');
              }
            } catch (vaultError) {
              // 尝试使用adapter接口作为最后后备
              if (this.app.vault.adapter) {
                await this.app.vault.adapter.write(spanDataFilePath, content);
                console.log('ColorizeText: 后备方案 - 成功通过adapter接口保存span标签配置');
              }
            }
          }
        } catch (finalError) {
          console.error('ColorizeText: 所有保存方法均失败！', finalError.message);
        }
      }
      
      // 获取数据文件的绝对路径 - 使用app.vault.adapter.getBasePath确保路径正确
      try {
        const basePath = this.app.vault.adapter.getBasePath();
        const dataFilePath = path.join(basePath, '.obsidian', 'plugins', 'colorize-text', 'span_data.json');
        const backupFilePath = path.join(basePath, '.obsidian', 'plugins', 'colorize-text', 'span_data.json.bak');
        
        console.log('ColorizeText: 数据文件路径:', dataFilePath);
        
        // 验证文件是否保存成功
        try {
          // 使用fs.access检查文件是否存在
          await fs.access(dataFilePath);
          console.log('ColorizeText: 数据文件存在');
          
          // 读取文件内容进行验证
          const content = await fs.readFile(dataFilePath, 'utf8');
          const savedData = JSON.parse(content);
          
          console.log('ColorizeText: 成功读取并解析数据文件');
          console.log('ColorizeText: 保存的数据包含', savedData.palette?.length || 0, '个配色');
          
          // 验证保存的数据与当前数据是否一致
          if (JSON.stringify(savedData.palette) === JSON.stringify(this.palette)) {
            console.log('ColorizeText: 配色方案保存成功且数据验证完全一致！');
          } else {
            console.warn('ColorizeText: 警告 - 保存的数据与当前数据不完全匹配');
            console.log('ColorizeText: 当前数据长度:', this.palette.length, '保存的数据长度:', savedData.palette?.length || 0);
          }
          
          // 尝试创建备份文件（使用try-catch避免备份失败影响主流程）
          try {
            await fs.writeFile(backupFilePath, JSON.stringify(savedData, null, 2), 'utf8');
            console.log('ColorizeText: 已成功创建备份文件');
          } catch (backupErr) {
            console.warn('ColorizeText: 创建备份文件失败，但不影响主保存功能:', backupErr.message);
          }
          
          return true;
        } catch (verifyError) {
          console.error('ColorizeText: 验证文件保存失败:', verifyError.message);
          
          // 作为后备方案，直接使用fs写入文件
          try {
            console.log('ColorizeText: 尝试使用fs直接写入文件作为后备方案');
            await fs.writeFile(dataFilePath, JSON.stringify(saveData, null, 2), 'utf8');
            console.log('ColorizeText: 后备方案 - 成功使用fs直接写入文件');
            return true;
          } catch (fallbackError) {
            console.error('ColorizeText: 后备方案也失败:', fallbackError.message);
          }
        }
      } catch (pathError) {
        console.error('ColorizeText: 获取文件路径失败:', pathError.message);
        
        // 备选方案：使用固定路径
        const correctConfigDir = "D:\\Documents\\Obsidian Vault\\.obsidian";
        const dataFilePath = path.join(correctConfigDir, 'plugins', 'colorize-text', 'span_data.json');
        
        try {
          await fs.writeFile(dataFilePath, JSON.stringify(saveData, null, 2), 'utf8');
          console.log('ColorizeText: 使用固定路径成功保存文件');
          return true;
        } catch (fixedPathError) {
          console.error('ColorizeText: 固定路径保存也失败:', fixedPathError.message);
        }
      }
    } catch (err) {
      console.error('ColorizeText: 保存配色方案时发生错误:', err.message);
    }
    
    // 如果所有方法都失败，记录关键信息并返回false
    console.error('ColorizeText: 所有保存方法均失败！');
    console.error('ColorizeText: 当前palette长度:', this.palette.length);
    return false;
  }

  // 保存API设置到api_data.json文件
  async saveSettings() {
    try {
      console.log('ColorizeText: 开始保存API设置...');
      
      const fs = require('fs').promises;
      const path = require('path');
      
      // 创建要保存的设置对象
      const saveData = {
        settings: this.settings || {
          apiKey: "",
          apiName: "OpenAI",
          apiUrl: "https://api.openai.com/v1/chat/completions",
          apiModel: "gpt-3.5-turbo"
        },
        lastSaved: new Date().toISOString(),
        version: "1.0.0"
      };
      
      // 获取数据文件的绝对路径
      const basePath = this.app?.vault?.adapter?.getBasePath() || "D:\Documents\Obsidian Vault";
      const dataFilePath = path.join(basePath, '.obsidian', 'plugins', 'colorize-text', 'api_data.json');
      
      console.log('ColorizeText: API设置文件路径:', dataFilePath);
      
      // 确保目录存在
      const dir = path.dirname(dataFilePath);
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (mkdirErr) {
        if (mkdirErr.code !== 'EEXIST') {
          console.error('ColorizeText: 创建目录失败:', mkdirErr.message);
        }
      }
      
      // 保存到api_data.json文件
      try {
        await fs.writeFile(dataFilePath, JSON.stringify(saveData, null, 2), 'utf8');
        console.log('ColorizeText: API设置已成功保存到api_data.json');
        
        // 同时从span_data.json中移除settings部分（如果存在）
        try {
          const spanDataFilePath = path.join(basePath, '.obsidian', 'plugins', 'colorize-text', 'span_data.json');
          if (await fs.access(spanDataFilePath).then(() => true).catch(() => false)) {
            const spanDataContent = await fs.readFile(spanDataFilePath, 'utf8');
            const spanData = JSON.parse(spanDataContent);
            if (spanData.settings) {
              delete spanData.settings;
              await fs.writeFile(spanDataFilePath, JSON.stringify(spanData, null, 2), 'utf8');
              console.log('ColorizeText: 已从span_data.json中移除settings部分');
            }
          }
        } catch (spanDataError) {
          console.error('ColorizeText: 从span_data.json中移除settings部分时出错:', spanDataError.message);
        }
        
        return true;
      } catch (writeError) {
        console.error('ColorizeText: 保存API设置失败:', writeError.message);
        return false;
      }
    } catch (error) {
      console.error('ColorizeText: 保存设置时发生错误:', error);
      return false;
    }
  }
  
  // 从api_data.json文件加载API设置
  async loadApiSettings() {
    try {
      console.log('ColorizeText: 开始加载API设置...');
      
      const fs = require('fs').promises;
      const path = require('path');
      
      // 获取数据文件的绝对路径
      const basePath = this.app?.vault?.adapter?.getBasePath() || "D:\Documents\Obsidian Vault";
      const dataFilePath = path.join(basePath, '.obsidian', 'plugins', 'colorize-text', 'api_data.json');
      
      console.log('ColorizeText: API设置文件路径:', dataFilePath);
      
      // 检查文件是否存在
      try {
        await fs.access(dataFilePath);
        console.log('ColorizeText: 找到api_data.json文件');
        
        // 读取文件内容
        const content = await fs.readFile(dataFilePath, 'utf8');
        const data = JSON.parse(content);
        
        // 验证数据结构
        if (data.settings && typeof data.settings === 'object') {
          // 合并读取的设置和默认设置
          this.settings = {
            // 默认设置
            apiKey: "",
            apiName: "OpenAI",
            apiUrl: "https://api.openai.com/v1/chat/completions",
            apiModel: "gpt-3.5-turbo",
            // 合并从文件读取的设置
            ...data.settings
          };
          
          console.log('ColorizeText: API设置加载成功，使用的API名称:', this.settings.apiName);
        } else {
          console.warn('ColorizeText: api_data.json文件中settings结构无效，将使用默认设置');
        }
      } catch (accessError) {
        console.log('ColorizeText: 未找到api_data.json文件，将使用默认设置');
        
        // 检查是否存在旧的span_data.json文件中的settings
        try {
          const spanDataFilePath = path.join(basePath, '.obsidian', 'plugins', 'colorize-text', 'span_data.json');
          await fs.access(spanDataFilePath);
          
          const spanDataContent = await fs.readFile(spanDataFilePath, 'utf8');
          const spanData = JSON.parse(spanDataContent);
          
          if (spanData.settings && typeof spanData.settings === 'object') {
            console.log('ColorizeText: 从span_data.json文件中找到旧的API设置');
            
            // 合并旧设置和默认设置
            this.settings = {
              apiKey: "",
              apiName: "OpenAI",
              apiUrl: "https://api.openai.com/v1/chat/completions",
              apiModel: "gpt-3.5-turbo",
              ...spanData.settings
            };
            
            // 提示用户已迁移旧设置
            console.log('ColorizeText: 已从旧的span_data.json迁移API设置到内存中');
            
            // 自动保存迁移后的设置到新的api_data.json文件
            await this.saveSettings();
          }
        } catch (spanDataAccessError) {
          console.log('ColorizeText: 未找到旧的span_data.json文件或其中没有settings部分');
        }
      }
      
      return this.settings;
    } catch (error) {
      console.error('ColorizeText: 加载API设置时发生错误:', error);
      throw error;
    }
  }
  
  async saveHighlightHistory(filePath, history) {
    // 调用新方法保存到单独文件
    await this.saveFileHighlightHistory(filePath, history);
  }
  
  async openColorModal(editor) {
    const selectedText = editor.getSelection();
    let previewText = selectedText || "示例";
    if (previewText.length > 3) previewText = previewText.slice(0, 3) + "...";
    // 获取当前文件路径
    const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
    // 使用新方法加载历史
    this.loadFileHighlightHistory(filePath).then(history => {
      // 创建PaletteModal实例，正确传递所有必要参数，包括markStyles配置
      const modal = new PaletteModal(this.app, this, this.palette, async (selected) => {
        if (!selectedText) return;
        
        // 根据selected.useMarkTag决定使用mark标签还是span标签
        let wrapped;
        if (selected.useMarkTag) {
          // 使用mark标签并应用所选样式
          if (selected.markClass) {
            // 如果指定了markClass（从按钮点击事件传入），直接使用该样式类
            wrapped = `<mark class="${selected.markClass}">${selectedText}</mark>`;
          } else {
            // 否则尝试从morehighlightstyle_data.json中加载模板
            try {
              const data2Path = this.app.vault.adapter.getBasePath() + "\\.obsidian\\plugins\\colorize-text\\morehighlightstyle_data.json";
              if (await this.app.vault.adapter.exists(data2Path)) {
                const data2Content = await this.app.vault.adapter.read(data2Path);
                const data2 = JSON.parse(data2Content);
                if (data2.modalConfig && data2.modalConfig.selectedTextTemplate) {
                  wrapped = data2.modalConfig.selectedTextTemplate.replace("{text}", selectedText);
                }
              }
            } catch (error) {
              console.error("读取morehighlightstyle_data.json配置失败:", error);
            }
            
            // 如果未成功加载模板，使用默认的mark标签
            if (!wrapped) {
              wrapped = `<mark class="more-highlight-half yellow-highlighter">${selectedText}</mark>`;
            }
          }
        } else {
          // 使用传统的span标签
          if (selected.fullStyle) {
            // 如果提供了fullStyle，直接使用它
            wrapped = `<span style="${selected.fullStyle}">${selectedText}</span>`;
          } else {
            // 否则使用传统的textColor和bgColor
            wrapped = `<span style="color: ${selected.textColor}; background-color: ${selected.bgColor};">${selectedText}</span>`;
          }
        }
        
        editor.replaceSelection(wrapped);
        
        // 记录应用高亮后的光标位置
        const afterReplaceCursor = editor.getCursor();
        console.log(`ColorizeText: 颜色板应用高亮后 - 当前行: ${afterReplaceCursor.line}, 列: ${afterReplaceCursor.ch}`);
        
        // 应用高亮后将光标所在行居中显示
        setTimeout(() => {
          const beforeCenterCursor = editor.getCursor();
          console.log(`ColorizeText: 颜色板准备居中光标时的光标位置 - 行: ${beforeCenterCursor.line}, 列: ${beforeCenterCursor.ch}`);
          if (window.colorizeTextPluginInstance) {
            window.colorizeTextPluginInstance.centerCursorInEditor(editor);
          }
        }, 100); // 稍微延迟以确保DOM更新完成
        
        // 保存高亮历史
        const newRecord = {
          text: selectedText,
          textColor: selected.textColor,
          bgColor: selected.bgColor,
          time: Date.now()
        };
        
        // 如果提供了fullStyle，也保存到历史记录中
        if (selected.fullStyle) {
          newRecord.fullStyle = selected.fullStyle;
        }
        
        // 如果是使用mark标签的高亮，同时保存markClass属性
        if (selected.useMarkTag && selected.markClass) {
          newRecord.markClass = selected.markClass;
        }
        
        // 只保留最新100条
        const newHistory = [newRecord, ...history].slice(0, 100);
        await this.saveFileHighlightHistory(filePath, newHistory);
        }, async (newPair) => {
        this.palette.push(newPair);
        await this.savePalette();
        // 重新打开弹窗时不重复添加新配色，且高亮历史保持
        this.openColorModal(editor);
      }, previewText, history);
      // 使用Obsidian标准的open方法而不是show方法
      modal.open();
    });
  }

};


// 设置标签页类 - 简化版本，确保设置页面一定会显示
class ColorizeTextSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin || {};
    // 确保settings对象存在
    if (!this.plugin.settings) {
      this.plugin.settings = {
        apiKey: "",
        apiName: "OpenAI",
        apiUrl: "https://api.openai.com/v1/chat/completions",
        apiModel: "gpt-3.5-turbo",
        enableAIColor: true
      };
    }
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    
    // 确保plugin和settings对象存在（使用备用对象作为最后手段）
    const plugin = this.plugin || {};
    const settings = plugin.settings || {
      apiKey: "",
      apiName: "OpenAI",
      apiUrl: "https://api.openai.com/v1/chat/completions",
      apiModel: "gpt-3.5-turbo"
    };

    // 添加设置标题
    containerEl.createEl('h2', { text: 'Colorize Text 设置' });

    // API 配置
    try {
      new Setting(containerEl)
        .setName('API 名称')
        .setDesc('使用的AI服务名称')
        .addText(text => text
          .setPlaceholder('例如: OpenAI')
          .setValue(this.plugin.settings.apiName || 'OpenAI')
          .onChange(async (value) => {
            this.plugin.settings.apiName = value;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('API 地址')
        .setDesc('API服务端点地址')
        .addText(text => text
          .setPlaceholder('例如: https://api.openai.com/v1/chat/completions')
          .setValue(this.plugin.settings.apiUrl || 'https://api.openai.com/v1/chat/completions')
          .onChange(async (value) => {
            this.plugin.settings.apiUrl = value;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('API 模型')
        .setDesc('使用的AI模型名称')
        .addText(text => text
          .setPlaceholder('例如: gpt-3.5-turbo')
          .setValue(this.plugin.settings.apiModel || 'gpt-3.5-turbo')
          .onChange(async (value) => {
            this.plugin.settings.apiModel = value;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('API 密钥')
        .setDesc('您的AI API密钥')
        .addText(text => text
          .setPlaceholder('输入API密钥')
          .setValue(this.plugin.settings.apiKey || '')
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('启用AI配色')
        .setDesc('是否在弹窗中显示AI配色功能')
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.enableAIColor !== false)
          .onChange(async (value) => {
            this.plugin.settings.enableAIColor = value;
            await this.plugin.saveSettings();
          }));

      console.log('ColorizeTextSettingsTab: 所有设置项已成功创建');
    } catch (error) {
      console.error('ColorizeTextSettingsTab: 创建设置项时出错:', error);
      containerEl.createEl('div', { text: `创建设置项时出错: ${error.message}` });
    }

  }
}





class PaletteModal extends Modal {
  constructor(app, plugin, palette, onSelect, onAdd, previewText, highlightHistory, markStyles = []) {
    super(app);
    this.plugin = plugin;
    this.palette = palette;
    this.onSelect = onSelect;
    this.onAdd = onAdd;
    this.previewText = previewText || "示例";
    this.highlightHistory = highlightHistory || [];
    this.markStyles = markStyles;
    // 记录创建时的时间戳，用于调试
    this.creationTime = Date.now();
  }
  
  // 增强的配置加载方法 - 同时支持vault和adapter接口
  async loadData2() {
    try {
      const data2FilePath = '.obsidian/plugins/colorize-text/morehighlightstyle_data.json';
      
      // 首先尝试使用vault接口（Obsidian推荐的方式）
      const data2File = this.app.vault.getAbstractFileByPath(data2FilePath);
      if (data2File && data2File instanceof File) {
        const content = await this.app.vault.read(data2File);
        console.log('ColorizeText: 成功通过vault接口读取mark标签配置文件');
        
        // 打印配置文件的前100个字符，用于调试
        console.log('ColorizeText: mark标签配置文件内容预览:', content.substring(0, 100));
        
        // 立即验证解析结果
        const parsedData = JSON.parse(content);
        console.log('ColorizeText: mark标签配置解析成功，共', parsedData.markStyles ? parsedData.markStyles.length : 0, '个样式');
        return parsedData;
      }
      
      // 如果vault接口无法找到文件，尝试使用adapter接口作为后备
      try {
        console.log('ColorizeText: vault接口未找到mark标签配置文件，尝试使用adapter接口');
        const content = await this.app.vault.adapter.read(data2FilePath);
        console.log('ColorizeText: 成功通过adapter接口读取mark标签配置文件');
        
        // 立即验证解析结果
        const parsedData = JSON.parse(content);
        console.log('ColorizeText: adapter接口mark标签配置解析成功，共', parsedData.markStyles ? parsedData.markStyles.length : 0, '个样式');
        return parsedData;
      } catch (adapterError) {
        console.log('ColorizeText: adapter接口也无法读取mark标签配置文件:', adapterError.message);
      }
      
      console.log('ColorizeText: mark标签配置文件不存在或无法读取，将使用默认配置');
    } catch (error) {
      console.error("读取mark标签配置失败:", error);
    }
    return null;
  }
  

  
  // 保存span标签配置的自定义方法
  async saveSpanData(data) {
    try {
      const spanDataFilePath = '.obsidian/plugins/colorize-text/span_data.json';
      const content = JSON.stringify(data, null, 2);
      
      // 首先尝试使用vault接口
      const existingFile = this.app.vault.getAbstractFileByPath(spanDataFilePath);
      if (existingFile && existingFile instanceof File) {
        await this.app.vault.modify(existingFile, content);
        console.log('ColorizeText: 成功通过vault接口更新span标签配置文件');
        return true;
      } else {
        await this.app.vault.create(spanDataFilePath, content);
        console.log('ColorizeText: 成功通过vault接口创建span标签配置文件');
        return true;
      }
    } catch (vaultError) {
      console.error('ColorizeText: 使用vault接口保存span标签配置失败:', vaultError.message);
      
      // 尝试使用adapter接口作为后备
      try {
        const spanDataFilePath = '.obsidian/plugins/colorize-text/span_data.json';
        await this.app.vault.adapter.write(spanDataFilePath, JSON.stringify(data, null, 2));
        console.log('ColorizeText: 成功通过adapter接口保存span标签配置');
        return true;
      } catch (adapterError) {
        console.error('ColorizeText: 后备方案也失败:', adapterError.message);
      }
    }
    return false;
  }
  
  // 测试保存和加载功能是否正常工作
  async testSaveLoad() {
    // 临时禁用测试功能，因为它导致了错误
    console.log('ColorizeText: 测试功能已临时禁用以避免错误');
    return;
    
    // 以下是原有的测试代码，但目前有问题，需要进一步修复
    try {
      console.log('ColorizeText: 开始运行保存加载测试...');
      
      // 创建一个简单的测试配置，不依赖外部变量
      const testConfig = {
        testFlag: true,
        testTimestamp: new Date().getTime(),
        testData: '这是一个测试'
      };
      
      // 保存测试配置
      const testFilePath = '.obsidian/plugins/colorize-text/test_config.json';
      
      // 先检查文件是否存在，如果存在则删除
      const existingFile = this.app.vault.getAbstractFileByPath(testFilePath);
      if (existingFile && existingFile instanceof File) {
        await this.app.vault.delete(existingFile);
        console.log('ColorizeText: 已删除旧的测试文件');
      }
      
      // 然后创建新文件
      await this.app.vault.create(testFilePath, JSON.stringify(testConfig, null, 2));
      console.log('ColorizeText: 测试配置已保存');
      
      // 立即读取测试配置
      const testFile = this.app.vault.getAbstractFileByPath(testFilePath);
      if (testFile && testFile instanceof File) {
        const content = await this.app.vault.read(testFile);
        const loadedConfig = JSON.parse(content);
        
        console.log('ColorizeText: 测试配置已读取，验证结果:', 
          'testFlag=' + loadedConfig.testFlag,
          'testTimestamp=' + loadedConfig.testTimestamp
        );
        
        // 验证读取结果是否与保存的一致
        if (loadedConfig.testFlag && loadedConfig.testTimestamp === testConfig.testTimestamp) {
          console.log('ColorizeText: 保存加载测试通过! 文件系统操作正常工作');
        } else {
          console.error('ColorizeText: 保存加载测试失败! 读取的配置与保存的不一致');
        }
        
        // 清理测试文件
        await this.app.vault.delete(testFile);
        console.log('ColorizeText: 测试文件已清理');
      } else {
        console.error('ColorizeText: 无法找到测试文件，测试失败');
      }
    } catch (error) {
      console.error('ColorizeText: 保存加载测试异常:', error);
    }
  }
  
  // 简化的配置保存方法 - 直接使用app.vault接口
  async saveSortedMarkStyles(newMarkStyles) {
    try {
      const data2FilePath = '.obsidian/plugins/colorize-text/morehighlightstyle_data.json';
      
      // 确保newMarkStyles是有效的数组
      if (!newMarkStyles || !Array.isArray(newMarkStyles) || newMarkStyles.length === 0) {
        console.error('ColorizeText: 保存失败 - 无效的markStyles数组');
        return false;
      }
      
      // 默认mark样式配置，用于补充缺失的class和name
      const defaultMarkStyles = [
        {"class": "more-highlight yellow-highlighter", "name": "黄色荧光笔"},
        {"class": "more-highlight-half yellow-highlighter", "name": "黄色半划线"},
        {"class": "more-highlight-underline yellow-highlighter", "name": "黄色波浪线"},
        {"class": "more-highlight-rainbow yellow-highlighter", "name": "黄色彩虹线"},
        {"class": "more-highlight-mask yellow-highlighter", "name": "黄色模糊"},
        {"class": "more-highlight green-highlighter", "name": "绿色荧光笔"},
        {"class": "more-highlight-half green-highlighter", "name": "绿色半划线"},
        {"class": "more-highlight-underline green-highlighter", "name": "绿色波浪线"},
        {"class": "more-highlight-rainbow green-highlighter", "name": "绿色彩虹线"},
        {"class": "more-highlight-mask green-highlighter", "name": "绿色模糊"},
        {"class": "more-highlight blue-highlighter", "name": "蓝色荧光笔"},
        {"class": "more-highlight-half blue-highlighter", "name": "蓝色半划线"},
        {"class": "more-highlight-underline blue-highlighter", "name": "蓝色波浪线"},
        {"class": "more-highlight-rainbow blue-highlighter", "name": "蓝色彩虹线"},
        {"class": "more-highlight-mask blue-highlighter", "name": "蓝色模糊"},
        {"class": "more-highlight pink-highlighter", "name": "粉色荧光笔"},
        {"class": "more-highlight-half pink-highlighter", "name": "粉色半划线"},
        {"class": "more-highlight-underline pink-highlighter", "name": "粉色波浪线"},
        {"class": "more-highlight-rainbow pink-highlighter", "name": "粉色彩虹线"},
        {"class": "more-highlight-mask pink-highlighter", "name": "粉色模糊"},
        {"class": "more-highlight orange-highlighter", "name": "橙色荧光笔"},
        {"class": "more-highlight-half orange-highlighter", "name": "橙色半划线"},
        {"class": "more-highlight-underline orange-highlighter", "name": "橙色波浪线"},
        {"class": "more-highlight-rainbow orange-highlighter", "name": "橙色彩虹线"},
        {"class": "more-highlight-mask orange-highlighter", "name": "橙色模糊"}
      ];

      // 创建配置对象，确保格式正确
      const config = {
        markStyles: newMarkStyles.map((style, index) => ({
          // 确保每个样式对象都有必要的属性，如果class或name缺失，尝试从默认配置中获取
          class: style.class || (defaultMarkStyles[index] ? defaultMarkStyles[index].class : ''),
          name: style.name || (defaultMarkStyles[index] ? defaultMarkStyles[index].name : '未命名样式')
        })),
        lastSaved: new Date().toISOString(), // 添加时间戳便于调试
        version: '1.0.2', // 更新版本标识
        totalStyles: newMarkStyles.length
      };
      
      // 使用Obsidian的vault接口直接写入文件
      const content = JSON.stringify(config, null, 2);
      
      // 尝试获取文件
      const data2File = this.app.vault.getAbstractFileByPath(data2FilePath);
      
      try {
        if (data2File && data2File instanceof File) {
          // 文件存在，修改它
          await this.app.vault.modify(data2File, content);
          console.log('ColorizeText: mark标签配置已成功更新');
        } else {
          // 文件不存在，创建新文件
          await this.app.vault.create(data2FilePath, content);
          console.log('ColorizeText: mark标签配置文件已创建');
        }
      } catch (fileError) {
        // 如果遇到文件已存在错误，尝试使用修改方法
        if (fileError.message && fileError.message.includes('File already exists')) {
          console.log('ColorizeText: 文件已存在，尝试使用修改方法');
          try {
            // 再次尝试获取文件
            const retryFile = this.app.vault.getAbstractFileByPath(data2FilePath);
            if (retryFile && retryFile instanceof File) {
              await this.app.vault.modify(retryFile, content);
              console.log('ColorizeText: 通过修改方法成功保存');
            } else {
              // 如果仍然无法获取文件，使用adapter的write方法作为后备方案
            console.log('ColorizeText: 无法获取mark标签配置文件引用，使用adapter.write作为后备方案');
            const fullPath = '.obsidian/plugins/colorize-text/morehighlightstyle_data.json';
            await this.app.vault.adapter.write(fullPath, content);
            console.log('ColorizeText: 通过adapter.write成功保存mark标签配置');
            }
          } catch (retryError) {
            console.error('ColorizeText: 重试保存也失败:', retryError);
            throw retryError; // 重新抛出错误，让上层处理
          }
        } else {
          throw fileError; // 重新抛出其他类型的错误
        }
      }
      
      // 立即验证保存结果 - 添加延迟以确保文件系统完成写入
      setTimeout(async () => {
        try {
          const savedData = await this.loadData2();
          if (savedData && savedData.markStyles && savedData.markStyles.length > 0) {
            console.log('ColorizeText: 保存验证成功，共保存', savedData.markStyles.length, '个样式');
            if (savedData.lastSaved) {
              console.log('ColorizeText: 保存的最后时间戳:', savedData.lastSaved);
            }
            // 验证保存的样式数量是否与预期一致
            if (savedData.markStyles.length === newMarkStyles.length) {
              console.log('ColorizeText: 样式数量验证通过，保存的样式数量与原数量一致');
            } else {
              console.warn('ColorizeText: 样式数量不匹配，保存的:', savedData.markStyles.length, '个，原数量:', newMarkStyles.length);
            }
          } else {
            console.error('ColorizeText: 保存验证失败 - 读取的配置不完整');
            
            // 尝试直接使用adapter接口读取文件进行验证
            try {
              const data2FilePath = '.obsidian/plugins/colorize-text/morehighlightstyle_data.json';
              const content = await this.app.vault.adapter.read(data2FilePath);
              const parsedData = JSON.parse(content);
              if (parsedData && parsedData.markStyles && parsedData.markStyles.length > 0) {
                console.log('ColorizeText: 使用adapter接口验证成功，mark标签配置实际已保存，共', parsedData.markStyles.length, '个样式');
              }
            } catch (adapterVerifyError) {
              console.error('ColorizeText: adapter接口验证mark标签配置也失败:', adapterVerifyError);
            }
          }
        } catch (verifyError) {
          console.error('ColorizeText: 保存验证异常:', verifyError);
        }
      }, 500); // 增加延迟时间以确保文件系统操作完成
      
      return true;
    } catch (error) {
      console.error("保存配置失败:", error);
      // 尝试以另一种方式保存作为最后的尝试
      try {
        const fallbackPath = this.app.vault.adapter.getBasePath() + '\\.obsidian\\plugins\\colorize-text\\morehighlightstyle_data_fallback.json';
        await this.app.vault.adapter.write(fallbackPath, JSON.stringify({ 
          markStyles: newMarkStyles, 
          fallbackSave: true, 
          timestamp: new Date().toISOString() 
        }, null, 2));
        console.log('ColorizeText: 已成功创建mark标签备用配置文件:', fallbackPath);
      } catch (fallbackError) {
        console.error('ColorizeText: 备用保存也失败:', fallbackError);
      }
      return false;
    }
  }

  async generateAIColor(text, aiRow, editor) {
    if (!window.colorizeTextPluginInstance?.settings?.apiKey) {
      new Notice("请先在设置中配置API Key");
      return;
    }

    new Notice("正在生成AI配色...");
    
    try {
      // 确保aiRow存在
      if (!aiRow) {
        console.error("AI行元素不存在");
        return;
      }

      // 获取当前文件路径
      const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
      
      // 获取当前段落的内容作为上下文
      let context = "";
      if (editor) {
        const cursor = editor.getCursor();
        const lineCount = editor.lineCount();
        
        // 向上查找段落开始位置（直到找到空行或文件开头）
        let startLine = cursor.line;
        while (startLine > 0) {
          const prevLine = editor.getLine(startLine - 1);
          if (prevLine.trim() === "") {
            break;
          }
          startLine--;
        }
        
        // 向下查找段落结束位置（直到找到空行或文件结尾）
        let endLine = cursor.line;
        while (endLine < lineCount - 1) {
          const nextLine = editor.getLine(endLine + 1);
          if (nextLine.trim() === "") {
            break;
          }
          endLine++;
        }
        
        // 获取并拼接整个段落的内容
        for (let i = startLine; i <= endLine; i++) {
          context += editor.getLine(i) + "\n";
        }
      }
      
      // 获取当前文件的高亮历史
      let highlightHistory = [];
      if (window.colorizeTextPluginInstance && filePath) {
        highlightHistory = window.colorizeTextPluginInstance.highlightHistory[filePath] || [];
        console.log("当前文件路径:", filePath);
        console.log("获取到的高亮历史数量:", highlightHistory.length);
        console.log("获取到的高亮历史完整数据:", highlightHistory);
        console.log("完整的高亮历史数据结构:", window.colorizeTextPluginInstance.highlightHistory);
        // 记录发送给AI的历史数据数量
        console.log("发送给AI的高亮历史数量:", highlightHistory.length);
      } else {
        console.log("无法获取高亮历史: pluginInstance=", window.colorizeTextPluginInstance, "filePath=", filePath);
      }

      const resultText = aiRow.querySelector(".ai-result-text");
      const aiBtn = aiRow.querySelector("button[title='AI生成配色']"); // 更精确地选择AI按钮
      
      // 验证元素是否存在
      if (!resultText || !aiBtn) {
        console.error("无法找到必要的DOM元素", {resultText, aiBtn});
        return;
      }
      
      // 确保按钮是有效的DOM元素
      if (!(aiBtn instanceof HTMLElement)) {
        console.error("AI按钮不是有效的DOM元素");
        return;
      }
      
      // 确保按钮有style属性
      if (!aiBtn.style) {
        console.error("AI按钮缺少style属性");
        return;
      }

      // 设置初始状态
      resultText.value = "正在获取AI配色...";
      resultText.readOnly = true;

      // 使用用户配置的API设置
      const apiUrl = window.colorizeTextPluginInstance.settings.apiUrl || "https://api.openai.com/v1/chat/completions";
      const apiModel = window.colorizeTextPluginInstance.settings.apiModel || "gpt-3.5-turbo";
      const apiKey = window.colorizeTextPluginInstance.settings.apiKey;
      
      // 验证API密钥是否设置
      if (!apiKey) {
        throw new Error("请先在插件设置中配置API密钥");
      }
      
      // 验证API URL格式
      try {
        new URL(apiUrl);
      } catch (urlError) {
        throw new Error(`API URL格式错误: ${urlError.message}`);
      }
      
      // 添加调试信息，显示当前使用的API URL
      console.log(`ColorizeText: 使用API URL: ${apiUrl}`);
      console.log(`ColorizeText: 使用API模型: ${apiModel}`);
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: apiModel,
          messages: [
            {
              role: "user",
              content: `请为以下文字生成配色方案：${text}
              上下文：
              ${context}
              
              高亮历史(${highlightHistory.length}条记录)：
              ${JSON.stringify(highlightHistory, null, 2) || '[]'}
              
              要求：
              - 新配色要与高亮历史配色方案有**明显区分**
              - 文字颜色和背景颜色要有足够对比度，确保文字清晰可见

              - 返回格式：<span style="color: #HEX; background-color: #HEX;">文本</span>
              - 不要滥用样式属性border-radius、fontweight，除非确实需要, 
  
              - 仅返回html标签及其包裹的文本, 不要其他解释文字` //padding、font-size 
            //  - 请在返回内容中明确展示所有高亮历史数据，不要省略或简化
            //- 请在返回内容中注明收到了多少条高亮历史记录
            }
          ],
          temperature: 0.7,
          max_tokens: 3000 // 增加token数量以确保完整返回
        })
      });

      try {
        // 先检查响应状态
        if (!response.ok) {
          // 针对404错误提供更具体的提示
          if (response.status === 404) {
            throw new Error(`API请求失败: HTTP 404 Not Found\n请检查插件设置中的API URL是否正确`);
          } else {
            throw new Error(`API请求失败: HTTP ${response.status} ${response.statusText}`);
          }
        }
        
        // 读取原始响应文本以便调试
        const responseText = await response.text();
        
        // 尝试解析JSON，但提供更好的错误处理
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          // 记录原始响应文本的前200个字符用于调试
          const preview = responseText.length > 200 ? responseText.substring(0, 200) + '...' : responseText;
          console.error("JSON解析错误，响应预览:", preview);
          throw new Error(`JSON解析失败: ${parseError.message}\n响应预览: ${preview}`);
        }
        
        if (data.choices && data.choices[0]?.message?.content) {
          const result = data.choices[0].message.content;
          resultText.value = result;
          resultText.readOnly = false;
          
          // 尝试解析颜色更新按钮样式（支持包含padding等额外样式）
          const match = result.match(/<span[^>]+style="[^"]*color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3});[^"]*background-color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})[^"]*"[^>]*>/i) || 
                       result.match(/<span[^>]+style="[^"]*background-color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3});[^"]*color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})[^"]*"[^>]*>/i) ||
                       result.match(/<span[^>]+style="[^"]*color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3});[^;]*;[^"]*background-color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})[^"]*"[^>]*>/i) ||
                       result.match(/<span[^>]+style="[^"]*background-color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3});[^;]*;[^"]*color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})[^"]*"[^>]*>/i);
          
          const fullStyleMatch = result.match(/<span[^>]+style="([^"]*)"[^>]*>/i);
          if (match && fullStyleMatch) {
            const textColor = match[1];
            const bgColor = match[2];
            
            // 安全地更新AI按钮样式
            try {
              aiBtn.style.color = textColor;
              aiBtn.style.background = bgColor;
            } catch (e) {
              console.error("更新按钮样式失败:", e);
            }
            
            // 不再自动添加到配色方案，只在应用时添加到高亮历史
          } else {
            new Notice("无法解析AI返回的配色方案");
          }
        } else {
          new Notice("AI生成配色失败");
        }
      } catch (jsonError) {
        console.error("AI配色生成响应解析错误:", jsonError);
        new Notice(`AI配色响应解析失败: ${jsonError.message}`);
      }
    } catch (error) {
      console.error("AI配色生成错误:", error);
      new Notice("AI配色生成失败，请检查API Key和网络连接");
    }
  }

  async onOpen() {
    // 更明确地从this获取contentEl，使用const确保不会被意外重新赋值
    const contentEl = this.contentEl;
    
    // 确保contentEl存在
    if (!contentEl) {
      console.error("ColorizeText: contentEl未找到，无法渲染调色板");
      return;
    }
    
    // 使用原生DOM方法清空元素
    if (contentEl && contentEl instanceof HTMLElement) {
      while (contentEl.firstChild) {
        contentEl.removeChild(contentEl.firstChild);
      }
    }
    contentEl.style.minWidth = "340px";
    contentEl.style.padding = "18px";
    // 添加弹窗标题（如果没有）
    if (!contentEl.querySelector('.colorize-modal-title')) {
      const title = document.createElement("div");
      title.className = "colorize-modal-title";
      title.innerText = this.highlightHistory && this.highlightHistory.length > 0 ? "配色方案与高亮历史" : "配色方案";
      title.style.fontSize = "18px";
      title.style.fontWeight = "bold";
      title.style.marginBottom = "14px";
      contentEl.appendChild(title);
    }

    // 添加选中文字的按钮，放在标题下方、配色方案上方
    try {
      // 获取当前编辑器选中的文本
      const selectedText = this.app.workspace.activeLeaf?.view?.editor?.getSelection();
      const selectedRow = contentEl.createEl("div");
      // 设置为grid布局，实现每行8个按钮
      selectedRow.style.display = "grid";
      selectedRow.style.gridTemplateColumns = "repeat(8, 1fr)";
      selectedRow.style.gap = "4px";
      selectedRow.style.marginBottom = "8px";
      
      // 默认mark样式配置，确保即使配置文件读取失败也能显示完整的样式
      const defaultMarkStyles = [
        {"class": "more-highlight yellow-highlighter", "name": "黄色荧光笔"},
        {"class": "more-highlight-half yellow-highlighter", "name": "黄色半划线"},
        {"class": "more-highlight-underline yellow-highlighter", "name": "黄色波浪线"},
        {"class": "more-highlight-rainbow yellow-highlighter", "name": "黄色彩虹线"},
        {"class": "more-highlight-mask yellow-highlighter", "name": "黄色模糊"},
        
        {"class": "more-highlight green-highlighter", "name": "绿色荧光笔"},
        {"class": "more-highlight-half green-highlighter", "name": "绿色半划线"},
        {"class": "more-highlight-underline green-highlighter", "name": "绿色波浪线"},
        {"class": "more-highlight-rainbow green-highlighter", "name": "绿色彩虹线"},
        {"class": "more-highlight-mask green-highlighter", "name": "绿色模糊"},
        
        {"class": "more-highlight blue-highlighter", "name": "蓝色荧光笔"},
        {"class": "more-highlight-half blue-highlighter", "name": "蓝色半划线"},
        {"class": "more-highlight-underline blue-highlighter", "name": "蓝色波浪线"},
        {"class": "more-highlight-rainbow blue-highlighter", "name": "蓝色彩虹线"},
        {"class": "more-highlight-mask blue-highlighter", "name": "蓝色模糊"},
        
        {"class": "more-highlight pink-highlighter", "name": "粉色荧光笔"},
        {"class": "more-highlight-half pink-highlighter", "name": "粉色半划线"},
        {"class": "more-highlight-underline pink-highlighter", "name": "粉色波浪线"},
        {"class": "more-highlight-rainbow pink-highlighter", "name": "粉色彩虹线"},
        {"class": "more-highlight-mask pink-highlighter", "name": "粉色模糊"},
        
        {"class": "more-highlight orange-highlighter", "name": "橙色荧光笔"},
        {"class": "more-highlight-half orange-highlighter", "name": "橙色半划线"},
        {"class": "more-highlight-underline orange-highlighter", "name": "橙色波浪线"},
        {"class": "more-highlight-rainbow orange-highlighter", "name": "橙色彩虹线"},
        {"class": "more-highlight-mask orange-highlighter", "name": "橙色模糊"}
      ];
      
      // 每次打开弹窗时都重新从文件加载最新的markStyles配置
      let markStyles = [];
      try {
        console.log('ColorizeText: 尝试从文件加载最新的mark标签配置');
        const data2 = await this.loadData2();
        if (data2 && data2.markStyles && Array.isArray(data2.markStyles) && data2.markStyles.length > 0) {
          // 过滤掉可能的null或undefined值
          const filteredStyles = data2.markStyles.filter(style => style !== null && style !== undefined);
          if (filteredStyles.length > 0) {
            markStyles = filteredStyles;
            console.log(`ColorizeText: 成功加载最新mark标签配置，共${markStyles.length}个样式`);
          }
        } else {
          console.log('ColorizeText: 未找到有效的mark标签配置，使用默认样式');
          markStyles = defaultMarkStyles;
        }
      } catch (error) {
        console.error('ColorizeText: 加载mark标签配置时出错:', error);
        markStyles = defaultMarkStyles;
      }
      
      // 确保所有样式都有必要的属性
      try {
        // 检查每个样式是否缺少class属性，如果缺少，使用默认配置中的class
        markStyles = markStyles.map((style, index) => {
          // 如果style.class为空，尝试从默认样式中获取对应索引的class
          if (!style.class || style.class.trim() === '') {
            if (defaultMarkStyles[index] && defaultMarkStyles[index].class) {
              console.log(`ColorizeText: 为样式${index}补充缺失的class属性: ${defaultMarkStyles[index].class}`);
              return {
                class: defaultMarkStyles[index].class,
                name: style.name || (defaultMarkStyles[index] ? defaultMarkStyles[index].name : '未命名样式')
              };
            }
          }
          return {
            class: style.class,
            name: style.name || '未命名样式'
          };
        });
        
        // 过滤掉可能的null或undefined值
        markStyles = markStyles.filter(style => style !== null && style !== undefined);
        
        console.log(`ColorizeText: 使用mark标签配置，共${markStyles.length}个样式`);
      } catch (error) {
        console.error("处理markStyles配置时出错:", error);
        markStyles = defaultMarkStyles;
      }
      
      // 存储markStyles引用，便于拖拽排序时访问
      selectedRow.markStyles = markStyles;
      
      // 运行保存加载测试，验证配置是否能正确持久化
      try {
        this.testSaveLoad();
      } catch (testError) {
        console.error('ColorizeText: 测试执行失败，但不影响插件功能:', testError);
      }
      
      // 如果没有配置markStyles，使用默认的黄色半划线样式
      if (markStyles.length === 0) {
        // 创建默认的选中文字按钮，使用mark标签和CSS样式
        const defaultBtn = document.createElement("button");
        defaultBtn.style.display = "inline-flex";
        defaultBtn.style.alignItems = "center";
        defaultBtn.style.justifyContent = "center";
        defaultBtn.style.background = "transparent";
        defaultBtn.style.border = "none";
        defaultBtn.style.borderRadius = "4px";
        defaultBtn.style.cursor = "pointer";
        defaultBtn.style.padding = "0";
        defaultBtn.style.margin = "0";
        defaultBtn.title = `选中文字`;
        
        // 设置按钮内容为mark标签，让CSS样式生效，最多显示3个字符
        const displayText = selectedText ? (selectedText.length > 3 ? selectedText.slice(0, 3) + "..." : selectedText) : "示例";
        defaultBtn.innerHTML = `<mark class="more-highlight-half yellow-highlighter">${displayText}</mark>`;
        
        defaultBtn.style.height = "auto";
        defaultBtn.style.minHeight = "22px";
        defaultBtn.style.width = "auto";
        defaultBtn.style.minWidth = "32px";
        
        // 点击事件：应用黄色高亮样式，使用mark标签
        defaultBtn.addEventListener("click", () => {
          if (selectedText) {
            this.onSelect({ textColor: "#f72235", bgColor: "#fff4c2", useMarkTag: true, markClass: "more-highlight-half yellow-highlighter" });
            // 刷新弹窗内容
            this.onOpen();
          }
        });
          
        selectedRow.appendChild(defaultBtn);
      } else {
        // 先清空selectedRow，以防多次加载或按钮重复创建
        selectedRow.innerHTML = '';
        
        // 初始化selectedRow.markStyles引用，确保拖拽排序时能正确访问
        selectedRow.markStyles = markStyles;
        
        // 为每种mark样式创建一个按钮
      
      // 添加拖拽样式提示
      selectedRow.style.userSelect = "none";
      
      // 为每种mark样式创建一个按钮
      markStyles.forEach((style, index) => {
        const styleBtn = document.createElement("button");
        styleBtn.style.display = "flex";
        styleBtn.style.alignItems = "center";
        styleBtn.style.justifyContent = "center";
        styleBtn.style.background = "transparent";
        styleBtn.style.border = "none";
        styleBtn.style.borderRadius = "4px";
        styleBtn.style.cursor = "pointer";
        styleBtn.style.padding = "4px";
        styleBtn.style.margin = "0";
        styleBtn.style.width = "100%";
        styleBtn.title = `${style.name} (可拖拽排序)`;
        
        // 设置按钮内容为mark标签，让CSS样式生效，最多显示3个字符
        const displayText = selectedText ? (selectedText.length > 3 ? selectedText.slice(0, 3) + "..." : selectedText) : "示例";
        styleBtn.innerHTML = `<mark class="${style.class}">${displayText}</mark>`;
        
        styleBtn.style.height = "auto";
        styleBtn.style.minHeight = "22px";
        styleBtn.style.minWidth = "32px";
        
        // 点击事件：应用对应样式，使用mark标签（只有在有选中文字时才执行）
        styleBtn.addEventListener("click", () => {
          if (selectedText) {
            this.onSelect({ useMarkTag: true, markClass: style.class });
            // 刷新弹窗内容
            this.onOpen();
          }
        });
        
        // 添加拖拽功能
        styleBtn.draggable = true;
        styleBtn.setAttribute('data-style-index', index);
        
        // 拖拽开始事件
        styleBtn.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', e.target.getAttribute('data-style-index'));
          // 添加拖拽时的视觉效果
          setTimeout(() => {
            e.target.style.opacity = '0.4';
          }, 0);
        });
        
        // 拖拽结束事件
        styleBtn.addEventListener('dragend', (e) => {
          e.target.style.opacity = '1';
        });
        
        // 拖拽经过事件
        styleBtn.addEventListener('dragover', (e) => {
          e.preventDefault();
          // 添加悬停效果
          e.target.style.border = '2px dashed #ccc';
        });
        
        // 拖拽离开事件
        styleBtn.addEventListener('dragleave', (e) => {
          e.target.style.border = 'none';
        });
        
        // 放置事件
        styleBtn.addEventListener('drop', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          // 确保找到按钮元素（即使拖放到mark标签上）
          let targetButton = e.target;
          while (targetButton && !targetButton.hasAttribute('data-style-index')) {
            targetButton = targetButton.parentElement;
          }
          
          if (!targetButton) return;
          
          targetButton.style.border = 'none';
          
          // 获取拖拽源和目标的索引
          const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
          let targetIndex = parseInt(targetButton.getAttribute('data-style-index'));
          
          // 确保索引有效
          if (isNaN(draggedIndex) || isNaN(targetIndex) || draggedIndex === targetIndex) return;
          
          // 获取当前的markStyles数组
          const currentMarkStyles = [...selectedRow.markStyles];
          
          // 实现简单的位置互换功能
          const newMarkStyles = [...currentMarkStyles];
          // 保存被拖拽的元素
          const temp = newMarkStyles[draggedIndex];
          // 交换两个元素的位置
          newMarkStyles[draggedIndex] = newMarkStyles[targetIndex];
          newMarkStyles[targetIndex] = temp;
          
          // 打印排序前后的索引，用于调试
          console.log(`ColorizeText: 排序前 - draggedIndex: ${draggedIndex}, targetIndex: ${targetIndex}`);
          console.log(`ColorizeText: 排序后 - 第${draggedIndex}位: ${newMarkStyles[draggedIndex].name}, 第${targetIndex}位: ${newMarkStyles[targetIndex].name}`);
          
          // 获取所有按钮
          const allButtons = Array.from(selectedRow.querySelectorAll('button'));
          
          // 保存按钮的引用，以便稍后重新添加
          const buttonReferences = {};
          allButtons.forEach(btn => {
            const markTag = btn.querySelector('mark');
            if (markTag) {
              // 使用mark标签的class作为唯一标识
              buttonReferences[markTag.className] = btn;
            }
          });
          
          // 清空容器
          selectedRow.innerHTML = '';
          
          // 按新顺序重新添加按钮
          newMarkStyles.forEach((style, index) => {
            // 找到对应的按钮
            const btn = buttonReferences[style.class];
            if (btn) {
              // 更新按钮的data-style-index属性
              btn.setAttribute('data-style-index', index);
              // 添加到容器
              selectedRow.appendChild(btn);
            }
          });
          
          // 保存更新后的markStyles引用
          selectedRow.markStyles = newMarkStyles;
          
          // 确保容器是grid布局
          if (!selectedRow.style.display || selectedRow.style.display !== 'grid') {
              selectedRow.style.display = 'grid';
              selectedRow.style.gridTemplateColumns = 'repeat(8, 1fr)';
              selectedRow.style.gap = '4px';
            }
          // 移除可能存在的flex相关样式
          selectedRow.style.flexWrap = 'initial';
          
          // 保存this上下文引用
          const self = this;
          
          // 立即创建一个新的配置副本进行保存，避免引用问题
          // 立即创建一个新的配置副本进行保存，避免引用问题
          const configToSave = JSON.parse(JSON.stringify(newMarkStyles));
          
          try {
            console.log('ColorizeText: 开始保存排序配置');
            // 确保markStyles是有效的数组
            if (!Array.isArray(newMarkStyles) || newMarkStyles.length === 0) {
              console.error('ColorizeText: 无效的markStyles数组，无法保存排序');
              return;
            }
            
            // 立即更新当前modal实例的markStyles，确保弹窗内排序立即生效
            this.markStyles = [...configToSave];
            
            // 同时更新全局插件实例的markStyles，确保弹窗重开时能保持排序
            if (window.colorizeTextPluginInstance) {
              window.colorizeTextPluginInstance.markStyles = [...configToSave];
              console.log('ColorizeText: 已更新全局插件实例的markStyles排序');
            }
            
            // 首先尝试使用全局实例的saveSortedMarkStyles方法
            let saveResult = false;
            if (window.colorizeTextPluginInstance && typeof window.colorizeTextPluginInstance.saveSortedMarkStyles === 'function') {
              saveResult = await window.colorizeTextPluginInstance.saveSortedMarkStyles(configToSave);
              if (saveResult) {
                console.log('ColorizeText: 通过全局实例保存mark标签排序成功');
              }
            }
            
            // 如果全局实例保存失败，尝试使用Modal的saveSortedMarkStyles方法
            if (!saveResult) {
              console.error('ColorizeText: 全局实例保存失败，尝试使用Modal的saveSortedMarkStyles方法');
              saveResult = await self.saveSortedMarkStyles(configToSave);
              if (saveResult) {
                console.log('ColorizeText: 通过Modal的saveSortedMarkStyles方法保存成功');
              }
            }
            
            // 如果前两种方法都失败，尝试使用adapter直接写入文件
            if (!saveResult) {
              console.error('ColorizeText: 前两种保存方法都失败，尝试使用适配器直接写入');
              try {
                const data2Path = self.app.vault.adapter.getBasePath() + '\\.obsidian\\plugins\\colorize-text\\morehighlightstyle_data.json';
                const config = {
                  markStyles: configToSave,
                  lastSaved: new Date().toISOString(),
                  version: '1.0.2',
                  fallback: true
                };
                
                await self.app.vault.adapter.write(data2Path, JSON.stringify(config, null, 2));
                console.log('ColorizeText: 适配器直接写入文件成功');
                saveResult = true;
              } catch (fallbackError) {
                console.error('ColorizeText: 适配器写入失败:', fallbackError);
              }
            }
            
            if (saveResult) {
              console.log('ColorizeText: mark标签排序配置成功保存到morehighlightstyle_data.json! 下次打开时将保持当前顺序');
              
              // 立即验证保存结果
              setTimeout(async () => {
                try {
                  const savedData = await self.loadData2();
                  if (savedData && savedData.markStyles && savedData.markStyles.length === configToSave.length) {
                    console.log('ColorizeText: mark标签保存验证成功，样式数量一致');
                    // 再次更新全局实例，确保最新数据
                    if (window.colorizeTextPluginInstance) {
                      window.colorizeTextPluginInstance.markStyles = [...configToSave];
                    }
                  } else {
                    console.error('ColorizeText: mark标签保存验证失败，可能未正确写入文件');
                  }
                } catch (verifyError) {
                  console.error('ColorizeText: mark标签保存验证异常:', verifyError);
                }
              }, 300);
            } else {
              console.error('ColorizeText: 所有保存方法均失败!');
            }
          } catch (error) {
            console.error('ColorizeText: 保存排序配置时发生异常:', error);
          }
        });
        
        selectedRow.appendChild(styleBtn);
      });
      }
      
      // 为所有mark按钮添加右键菜单支持
      const allButtons = selectedRow.querySelectorAll("button");
      allButtons.forEach(btn => {
        if (selectedText) {
          btn.addEventListener("contextmenu", async (e) => {
            e.preventDefault();
            // 获取当前选中的文本
            const activeLeaf = this.app.workspace.activeLeaf;
            if (!activeLeaf) return;
            const view = activeLeaf.view;
            if (!view || !view.editor) return;
            const editor = view.editor;
            let text = editor.getSelection();
            if (!text) text = selectedText;
            const content = editor.getValue();
            if (!text) return;
            // 获取当前按钮对应的样式信息
            const markTag = btn.querySelector('mark');
            let markClass = "more-highlight-half yellow-highlighter";
            if (markTag) {
              markClass = markTag.className;
            }
            
            // 匹配所有未被包裹的完整选中文本
            const markReg = new RegExp(`<mark[^>]*>\s*${text}\s*</mark>`, "g");
            let replaced = false;
            
            // 只替换未包裹的完整文本
            let newContent = content.replace(new RegExp(`(?<!<mark[^>]*>)${text}(?!</mark>)`, "g"), (match, offset, str) => {
              // 跳过已包裹的
              if (markReg.test(str.slice(Math.max(0, offset - 30), offset + match.length + 30))) return match;
              replaced = true;
              return `<mark class="${markClass}">${match}</mark>`;
            });
          
            // 确保编辑器存在且内容已修改
            if (replaced) {
              // 记录应用高亮前的光标位置
              const beforeCursor = editor.getCursor();
              console.log(`ColorizeText: 右键应用高亮前 - 当前行: ${beforeCursor.line}, 列: ${beforeCursor.ch}`);
              
              // 记录原光标和滚动条位置
              const oldCursor = editor.getCursor();
              const oldScroll = editor.getScrollInfo ? editor.getScrollInfo() : null;
              
              console.log(`ColorizeText: 右键应用高亮前记录的光标位置 - 行: ${oldCursor.line}, 列: ${oldCursor.ch}`);
              
              editor.setValue(newContent);
              
              // 恢复光标
              if (oldCursor) {
                editor.setCursor(oldCursor);
                console.log(`ColorizeText: 右键应用高亮后恢复光标位置 - 行: ${oldCursor.line}, 列: ${oldCursor.ch}`);
              }
              // 恢复滚动条
              if (oldScroll && editor.scrollTo) editor.scrollTo(oldScroll.left, oldScroll.top);
              
              // 应用高亮后将光标所在行居中显示
              setTimeout(() => {
                const afterCursor = editor.getCursor();
                console.log(`ColorizeText: 右键应用高亮准备居中光标时的光标位置 - 行: ${afterCursor.line}, 列: ${afterCursor.ch}`);
                if (window.colorizeTextPluginInstance) {
                  window.colorizeTextPluginInstance.centerCursorInEditor(editor);
                }
              }, 100); // 稍微延迟以确保DOM更新完成
              
              // 保存高亮历史
              const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
              if (window.colorizeTextPluginInstance) {
                const plugin = window.colorizeTextPluginInstance;
                // 使用新方法加载历史
                const history = await plugin.loadFileHighlightHistory(filePath);
                // 使用当前按钮的样式信息
                const styleInfo = markStyles.find(s => s.class === markClass) || {
                  textColor: "#f72235",
                  bgColor: "#fff4c2"
                };
                
                const newRecord = {
                  text: text,
                  textColor: styleInfo.textColor,
                  bgColor: styleInfo.bgColor,
                  markClass: markClass,
                  time: Date.now()
                };
                // 使用新方法保存历史
                const newHistory = [newRecord, ...history].slice(0, 100);
                await plugin.saveFileHighlightHistory(filePath, newHistory);
              }
            }
            // 应用后关闭弹窗
            this.close();
          });
      }
      });
      
      // 添加MoreHighlightStyle标题
      const markStylesTitle = document.createElement("div");
      markStylesTitle.innerText = "来自:MoreHighlightStyle";
      markStylesTitle.style.fontSize = "14px";
      markStylesTitle.style.fontWeight = "bold";
      markStylesTitle.style.marginTop = "12px";
      markStylesTitle.style.marginBottom = "6px";
      markStylesTitle.style.color = "#666";
      contentEl.appendChild(markStylesTitle);
      contentEl.appendChild(selectedRow);
    } catch (error) {
      console.error("显示选中文字按钮失败:", error);
    }

    // 添加边框样式标题
    const borderTitle = document.createElement("div");
    borderTitle.innerText = "border (单击应用到当前 右击应用到所有匹配)";
    borderTitle.style.fontSize = "14px";
    borderTitle.style.fontWeight = "bold";
    borderTitle.style.marginTop = "12px";
    borderTitle.style.marginBottom = "6px";
    borderTitle.style.color = "#666";
    contentEl.appendChild(borderTitle);
    
    // 边框样式容器
    const borderStylesContainer = document.createElement("div");
    borderStylesContainer.style.display = "flex";
    borderStylesContainer.style.flexWrap = "wrap";
    borderStylesContainer.style.gap = "4px";
    borderStylesContainer.style.marginBottom = "8px";
    
    // 定义边框样式数据
    const borderStyles = [

      { style: "border:2px solid #FF6347;", name: "番茄红" },
      { style: "border:2px solid #008080;", name: "青色" },
      { style: "border:2px solid #4169E1;", name: "皇家蓝" },
      { style: "border:2px solid #8A2BE2;", name: "紫罗兰" },
      { style: "border:2px solid #FF1493;", name: "深粉红" },
      { style: "border:2px solid #FFD700;", name: "金色" },
      
      { style: "border:1px solid red; border-radius:50%;", name: "红色" },
      { style: "border:1px solid #4169E1; border-radius:50%;", name: "椭圆皇家蓝" },
      { style: "border:1px solid #32CD32; border-radius:50%;", name: "椭圆酸橙绿" },
      { style: "border:1px solid #FF8C00; border-radius:50%;", name: "椭圆深橙色" },
      { style: "border:1px solid #9370DB; border-radius:50%;", name: "椭圆中紫色" },
      { style: "border:1px solid #FF1493; border-radius:50%;", name: "椭圆深粉红" },

      { style: "border:3px double #FF6347;", name: "番茄红" },
      { style: "border:3px double #FF8C00;", name: "深橙色" },
      { style: "border:3px double #9370DB;", name: "中紫色" },
      { style: "border:3px double #DC143C;", name: "猩红色" },
      { style: "border:3px double #FFB6C1;", name: "浅粉红" },

      { style: "border:1px dashed blue;", name: "蓝色" },
      { style: "border:1px dashed #DC143C;", name: "猩红色" },

      { style: "border:2px dotted green;", name: "绿色" },
      { style: "border:2px dotted #FF6347;", name: "番茄红" },

      { style: "border:1px solid red; box-shadow:0 0 5px red;", name: "发光红" },
      { style: "border:1px solid blue; box-shadow:0 0 4px blue;", name: "发光蓝" },


      { style: "border:1px solid transparent; border-image: linear-gradient(45deg, #00d4ff, #A6A5A8FF, #ff1493) 1;", name: "天蓝紫粉" },

      { style: "border-bottom:3px solid blue;", name: "蓝色" },
      { style: "border-bottom:3px solid #FF4500;", name: "橙红色" },
      { style: "border-bottom:3px solid #32CD32;", name: "酸橙绿" },
      { style: "border-bottom:3px solid #FF1493;", name: "深粉红" },
      { style: "border-bottom:3px solid #9370DB;", name: "中紫色" },
      { style: "border-bottom:3px solid #FFD700;", name: "金色" },
      { style: "border-bottom:3px solid #00CED1;", name: "深青色" },
  


      { style: "text-shadow: 2px 2px 4px red, -2px -2px 4px cyan;", name: "Tiktok" },
      { style: "text-shadow: 2px 2px 4px #32F08C, -2px -2px 4px #7255B0; color: black;", name: "ghost" },
      { style: "text-shadow: 0 0 5px #fff, 0 0 10px #fff, 0 0 15px #FF1493, 0 0 20px #FF1493, 0 0 25px #FF1493, 0 0 30px #FF1493, 0 0 35px #FF1493; color: white;", name: "Neon Pink" },
      { style: "text-shadow: 1px 1px 2px black, 0 0 1em blue, 0 0 0.2em blue; color: white;", name: "Deep Blue Glow" },
      { style: "text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000; color: yellow;", name: "Outline/Stamp" },
      { style: "text-shadow: 1px 1px 1px #ccc, 2px 2px 1px #ddd, 3px 3px 1px #eee; color: #555;", name: "Layered 3D" },


      { style: "text-shadow: 2px 2px 4px #FFD93D, -2px -2px 4px #6BCB77; color: #2D4059;", name: "sunshine" },
      { style: "text-shadow: 2px 2px 4px #00B4DB, -2px -2px 4px #0083B0; color: white;", name: "ocean" },
      { style: "text-shadow: 2px 2px 4px #F093FB, -2px -2px 4px #74000FFF;", name: "sunset" },
      { style: "text-shadow: 2px 2px 4px #FFA400, -2px -2px 4px #00D9FF; color: black;", name: "neon" },
      { style: "text-shadow: 2px 2px 4px #59BB97FF, -2px -2px 4px #C9A58DFF; color: #3A3A3A;", name: "pastel" },
      { style: "text-shadow: 2px 2px 4px #DA22FF, -2px -2px 4px #9733EE;", name: "purple" },


      { style: "text-shadow: 2px 2px 4px Orange, -2px -2px 4px white;", name: "多层阴影" },
      { style: "text-shadow: 2px 2px 4px #00CED1, -2px -2px 4px Yellow;", name: "多层阴影" },
      { style: "text-shadow: 2px 2px 4px green, -2px -2px 4px white;", name: "多层阴影" },
      { style: "text-shadow: 2px 2px 4px cyan, -2px -2px 4px white;", name: "多层阴影" },
      { style: "text-shadow: 2px 2px 4px blue, -2px -2px 4px white;", name: "多层阴影" },
      { style: "text-shadow: 2px 2px 4px purple, -2px -2px 4px white;", name: "多层阴影" },
      { style: "text-shadow: 2px 2px 4px #FF69B4, -2px -2px 4px white;", name: "多层阴影" }, 
      { style: "text-shadow: 2px 2px 4px #58BCFF, -2px -2px 4px white;", name: "多层阴影" },

      { style: "text-shadow: 2px 2px 4px #1A1B1D, -2px -2px 4px #C9481E; color: #FFD700;", name: "多层阴影" },
     
// 火焰效果
{ style: "text-shadow: 0 0 4px #fff, 0 0 11px #fff, 0 0 19px #fff, 0 0 40px #ff9900, 0 0 80px #ff6600, 0 0 90px #ff4500, 0 0 100px #ff0000; color: #FFA500;", name: "Fire" },

// 冰霜效果
{ style: "text-shadow: 0 0 5px #00f5ff, 0 0 10px #00f5ff, 0 0 20px #00d4ff, 0 0 40px #00aaff; color: #e0ffff;", name: "Ice" },

// 金属质感
{ style: "text-shadow: -1px -1px 0 #c9c9c9, 1px 1px 0 #fff, 2px 2px 0 #c9c9c9, 3px 3px 0 #b0b0b0; color: #e8e8e8;", name: "Chrome" },

// 毛玻璃模糊
//{ style: "text-shadow: 0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.6), 0 0 30px rgba(255,255,255,0.4); color: rgba(255,255,255,0.3); font-weight: bold;", name: "Frosted Glass" },

// 彩虹渐变
{ style: "text-shadow: 1px 1px 0 #f00, 2px 2px 0 #ff0, 3px 3px 0 #0f0, 4px 4px 0 #0ff, 5px 5px 0 #00f, 6px 6px 0 #f0f; color: white;", name: "Rainbow" },

// 浮雕效果
{ style: "text-shadow: 1px 1px 0 #fff, -1px -1px 0 #000; color: #999;", name: "Emboss" },

// 镂空效果
{ style: "text-shadow: 1px 1px 0 #000, -1px -1px 0 #fff, 1px -1px 0 #000, -1px 1px 0 #fff; color: transparent; -webkit-text-stroke: 1px #333;", name: "Hollow" },

// 复古霓虹
{ style: "text-shadow: 0 0 10px #ff006e, 0 0 20px #ff006e, 0 0 30px #ff006e, 0 0 40px #8338ec, 0 0 70px #8338ec, 0 0 80px #8338ec; color: #ffbe0b;", name: "Retro Neon" },

// 阴影分离
//{ style: "text-shadow: 3px 3px 0 rgba(255,0,0,0.5), 6px 6px 0 rgba(0,255,0,0.5), 9px 9px 0 rgba(0,0,255,0.5); color: white;", name: "RGB Split" },

// 柔和发光
{ style: "text-shadow: 0 0 20px rgba(255,215,0,0.8), 0 0 40px rgba(255,215,0,0.6), 0 0 60px rgba(255,215,0,0.4); color: #FFD700;", name: "Soft Glow" },

// 像素故障
{ style: "text-shadow: 2px 0 0 red, -2px 0 0 cyan, 0 2px 0 yellow, 0 -2px 0 lime; color: white;", name: "Pixel Glitch" },

// 激光效果
{ style: "text-shadow: 0 0 2px #fff, 0 0 5px #00ff00, 0 0 10px #00ff00, 0 0 20px #00ff00, 0 0 40px #00ff00; color: #4E9E4EFF;", name: "Laser Green" },

// 水波纹
{ style: "text-shadow: 0 1px 0 #84fab0, 0 2px 0 #8fd3f4, 0 3px 0 #84fab0, 0 4px 0 #8fd3f4, 0 5px 10px rgba(0,0,0,0.5); color: white;", name: "Water Wave" },

// 血迹效果
{ style: "text-shadow: 2px 2px 3px #8b0000, -1px -1px 2px #ff0000, 0 0 10px #8b0000; color: #dc143c;", name: "Blood" },

// 电光效果
{ style: "text-shadow: 0 0 5px #fff, 0 0 10px #fff, 0 0 15px #00ffff, 0 0 20px #00ffff, 0 0 35px #00ffff, 2px 2px 5px #000; color: white;", name: "Electric" },

      { style: "-webkit-text-stroke: 0.2px red; color: blue;", name: "描边文字" },
      { style: "-webkit-text-stroke: 0.2px Orange; color: blue;", name: "描边文字" },
      { style: "-webkit-text-stroke: 0.2px yellow; color: green;", name: "描边文字" },
      { style: "-webkit-text-stroke: 0.2px cyan; color: blue;", name: "描边文字" },
      { style: "-webkit-text-stroke: 0.2px blue; color: blue;", name: "描边文字" },
      { style: "-webkit-text-stroke: 0.2px purple; color: blue;", name: "描边文字" },
      { style: "-webkit-text-stroke: 0.8px #CFC3AA; color: #968700FF;", name: "描边文字" },







    ];
    
    // 渲染边框样式按钮
    borderStyles.forEach((borderStyle, idx) => {
      const btn = document.createElement("button");
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.background = "transparent";
      btn.style.border = "none";
      btn.style.borderRadius = "4px";
      btn.style.cursor = "pointer";
      btn.style.padding = "0 8px";
      btn.style.margin = "0";
      btn.style.fontSize = "14px";
      btn.title = borderStyle.name + " (点击应用,右击应用到全部)";
      // 获取当前选中的文本，如果没有则显示"示例"
      let displayText = "示例"; // 默认显示"示例"
      if (this.app.workspace.activeLeaf && this.app.workspace.activeLeaf.view && this.app.workspace.activeLeaf.view.editor) {
        const selectedText = this.app.workspace.activeLeaf.view.editor.getSelection();
        if (selectedText && selectedText.trim().length > 0) {
          displayText = selectedText;
        }
      }
      
      // 限制显示长度：最多3个汉字或6个英文字符
      const truncateText = (text) => {
        // 判断字符串是否主要包含汉字
        const hasChinese = /[\u4e00-\u9fa5]/.test(text);
        if (hasChinese) {
          // 主要包含汉字，最多显示3个
          return text.length > 3 ? text.substring(0, 3) + '...' : text;
        } else {
          // 主要包含英文，最多显示6个字符
          return text.length > 6 ? text.substring(0, 6) + '...' : text;
        }
      };
      
      const truncatedText = truncateText(displayText);
      btn.innerHTML = "<span style=\"" + borderStyle.style + "\">" + truncatedText + "</span>";
      btn.style.height = "auto";
      btn.style.minHeight = "22px";
      btn.style.minWidth = "32px";
      
      // 点击事件：应用对应样式
      btn.addEventListener("click", () => {
        // 获取当前选中的文本
        const selectedText = this.app.workspace.activeLeaf?.view?.editor?.getSelection();
        if (selectedText) {
          this.onSelect({ fullStyle: borderStyle.style });
          this.close();
        }
      });
      
      // 右键直接应用到所有匹配
      btn.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        try {
          // 获取编辑器实例
          const activeLeaf = this.app.workspace.activeLeaf;
          const editor = activeLeaf && activeLeaf.view && activeLeaf.view.editor;
          
          if (editor) {
            const content = editor.getValue();
            let hasChanges = false;
            let highlightedCount = 0;
            
            // 获取当前选中的文本，如果没有则从按钮的HTML内容中提取显示文本
            let searchText = editor.getSelection();
            if (!searchText) {
              // 从按钮的HTML中提取span标签的文本内容
              const spanElement = btn.querySelector('span');
              searchText = spanElement ? spanElement.textContent : '示例';
            }
            const escapedSearchText = window.colorizeTextPluginInstance.constructor.staticEscapeRegExp(searchText);
            
            let processedContent = content.replace(
              new RegExp(`(?<!<span[^>]*>)(${escapedSearchText})(?!</span>)`, "g"),
              (match, p1, offset) => {
                // 检查当前匹配是否在已有的span标签内
                const beforeMatch = content.slice(0, offset);
                const lastSpanStart = beforeMatch.lastIndexOf('<span');
                const lastSpanEnd = beforeMatch.lastIndexOf('</span>');
                
                // 如果上一个span开始标签在span结束标签之后，说明当前在span内部
                if (lastSpanStart > lastSpanEnd) {
                  return match;
                }
                
                highlightedCount++;
                hasChanges = true;
                return `<span style="${borderStyle.style}">${p1}</span>`;
              }
            );
            
            if (hasChanges) {
              // 记录应用高亮前的光标位置
              const beforeCursor = editor.getCursor();
              console.log(`ColorizeText: 边框样式右键应用高亮前 - 当前行: ${beforeCursor.line}, 列: ${beforeCursor.ch}`);
              
              const oldCursor = editor.getCursor();
              const oldScroll = editor.getScrollInfo ? editor.getScrollInfo() : null;
              
              console.log(`ColorizeText: 边框样式右键应用高亮前记录的光标位置 - 行: ${oldCursor.line}, 列: ${oldCursor.ch}`);
              
              editor.setValue(processedContent);
              
              // 恢复光标位置和滚动位置
              if (oldCursor) {
                editor.setCursor(oldCursor);
                console.log(`ColorizeText: 边框样式右键应用高亮后恢复光标位置 - 行: ${oldCursor.line}, 列: ${oldCursor.ch}`);
              }
              if (oldScroll && editor.scrollTo) {
                editor.scrollTo(oldScroll.left, oldScroll.top);
              }
              
              // 应用高亮后将光标所在行居中显示
              setTimeout(() => {
                const afterCursor = editor.getCursor();
                console.log(`ColorizeText: 边框样式右键应用高亮准备居中光标时的光标位置 - 行: ${afterCursor.line}, 列: ${afterCursor.ch}`);
                if (window.colorizeTextPluginInstance) {
                  window.colorizeTextPluginInstance.centerCursorInEditor(editor);
                }
              }, 100); // 稍微延迟以确保DOM更新完成
              
              // 保存高亮历史
              const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
              if (window.colorizeTextPluginInstance) {
                const plugin = window.colorizeTextPluginInstance;
                const history = await plugin.loadFileHighlightHistory(filePath);
                const newRecord = {
                  text: searchText,
                  fullStyle: borderStyle.style,
                  time: Date.now()
                };
                const newHistory = [newRecord, ...history].slice(0, 100);
                await plugin.saveFileHighlightHistory(filePath, newHistory);
              }
              
              new Notice(`已应用 ${highlightedCount} 处边框样式`);
              // 应用后关闭窗口
              this.close();
            } else {
              new Notice("没有找到需要应用样式的文本");
            }
          }
        } catch (error) {
          console.error('ColorizeText: 应用边框样式失败:', error);
          new Notice('应用边框样式失败: ' + error.message);
        }
      });
      
      borderStylesContainer.appendChild(btn);
    });
    
    contentEl.appendChild(borderStylesContainer);
    
    // 添加格式标题
    const formatTitle = document.createElement("div");
    formatTitle.innerText = "格式(单击应用, 右击应用到所有)";
    formatTitle.style.fontSize = "14px";
    formatTitle.style.fontWeight = "bold";
    formatTitle.style.marginTop = "12px";
    formatTitle.style.marginBottom = "6px";
    formatTitle.style.color = "#666";
    contentEl.appendChild(formatTitle);

    // 格式按钮容器
    const formatButtonsContainer = document.createElement("div");
    formatButtonsContainer.style.display = "flex";
    formatButtonsContainer.style.flexWrap = "wrap";
    formatButtonsContainer.style.gap = "4px";
    formatButtonsContainer.style.marginBottom = "8px";

    // 加粗按钮
    const boldBtn = document.createElement("button");
    boldBtn.style.display = "inline-flex";
    boldBtn.style.alignItems = "center";
    boldBtn.style.justifyContent = "center";
    boldBtn.style.background = "transparent";
    boldBtn.style.border = "none";
    boldBtn.style.borderRadius = "4px";
    boldBtn.style.cursor = "pointer";
    boldBtn.style.padding = "0 8px";
    boldBtn.style.margin = "0";
    boldBtn.style.fontSize = "14px";
    boldBtn.style.fontWeight = "bold";
    boldBtn.title = "加粗 (点击应用)";
    boldBtn.innerText = "加粗";
    boldBtn.style.height = "auto";
    boldBtn.style.minHeight = "22px";
    boldBtn.style.minWidth = "32px";
    
    // 加粗按钮点击事件
    boldBtn.addEventListener("click", () => {
      const selectedText = this.app.workspace.activeLeaf?.view?.editor?.getSelection();
      const activeLeaf = this.app.workspace.activeLeaf;
      const editor = activeLeaf && activeLeaf.view && activeLeaf.view.editor;
      if (selectedText && editor) {
        editor.replaceSelection(`**${selectedText}**`);
        // 保存高亮历史
        const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
        if (window.colorizeTextPluginInstance) {
          const plugin = window.colorizeTextPluginInstance;
          plugin.loadFileHighlightHistory(filePath).then(history => {
            const newRecord = {
              text: selectedText,
              fullStyle: "bold",
              time: Date.now()
            };
            const newHistory = [newRecord, ...history].slice(0, 100);
            plugin.saveFileHighlightHistory(filePath, newHistory);
          });
        }
        this.close();
      }
    });
    
    // 加粗按钮右键事件
    boldBtn.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      try {
        const activeLeaf = this.app.workspace.activeLeaf;
        const editor = activeLeaf && activeLeaf.view && activeLeaf.view.editor;
        
        if (editor) {
          const content = editor.getValue();
          let hasChanges = false;
          let highlightedCount = 0;
          
          let searchText = editor.getSelection();
          if (!searchText) {
            searchText = "示例";
          }
          const escapedSearchText = window.colorizeTextPluginInstance.constructor.staticEscapeRegExp(searchText);
          
          // 避免重复加粗
          // 使用简单的字符串包含检查来避免正则表达式转义问题
          let processedContent = content;
          const boldPattern = `**${searchText}**`;
          
          if (!content.includes(boldPattern)) {
            processedContent = content.replace(
              new RegExp(`(${escapedSearchText})`, "g"),
              (match) => {
                highlightedCount++;
                hasChanges = true;
                return `**${match}**`;
              }
            );
          }
          
          if (hasChanges) {
            const oldCursor = editor.getCursor();
            const oldScroll = editor.getScrollInfo ? editor.getScrollInfo() : null;
            
            editor.setValue(processedContent);
            
            if (oldCursor) {
              editor.setCursor(oldCursor);
            }
            if (oldScroll && editor.scrollTo) {
              editor.scrollTo(oldScroll.left, oldScroll.top);
            }
            
            const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
            if (window.colorizeTextPluginInstance) {
              const plugin = window.colorizeTextPluginInstance;
              const history = await plugin.loadFileHighlightHistory(filePath);
              const newRecord = {
                text: searchText,
                fullStyle: "bold",
                time: Date.now()
              };
              const newHistory = [newRecord, ...history].slice(0, 100);
              await plugin.saveFileHighlightHistory(filePath, newHistory);
            }
            
            new Notice(`已应用 ${highlightedCount} 处加粗样式`);
            this.close();
          } else {
            new Notice("没有找到需要应用样式的文本或文本已加粗");
          }
        }
      } catch (error) {
        console.error('ColorizeText: 应用加粗样式失败:', error);
        new Notice('应用加粗样式失败: ' + error.message);
      }
    });

    // [[选中文本]]按钮
    const linkBtn = document.createElement("button");
    linkBtn.style.display = "inline-flex";
    linkBtn.style.alignItems = "center";
    linkBtn.style.justifyContent = "center";
    linkBtn.style.background = "transparent";
    linkBtn.style.border = "none";
    linkBtn.style.borderRadius = "4px";
    linkBtn.style.cursor = "pointer";
    linkBtn.style.padding = "0 8px";
    linkBtn.style.margin = "0";
    linkBtn.style.fontSize = "14px";
    linkBtn.title = "链接 (点击应用)";
    linkBtn.style.height = "auto";
    linkBtn.style.minHeight = "22px";
    linkBtn.style.minWidth = "80px";
    
    // 更新链接按钮文本以显示实际选中的文本
    function updateLinkButtonText() {
      const selectedText = this.app.workspace.activeLeaf?.view?.editor?.getSelection() || '';
      if (selectedText) {
        linkBtn.innerText = `[[${selectedText}]]`;
      } else {
        linkBtn.innerText = '[[选中文本]]';
      }
    }
    
    // 初始化按钮文本
    updateLinkButtonText.call(this);
    
    // 在编辑器选择变化时更新按钮文本
    this.app.workspace.on('editor-paste', updateLinkButtonText.bind(this));
    this.app.workspace.on('editor-cursor-change', updateLinkButtonText.bind(this));
    
    // [[选中文本]]按钮点击事件
    linkBtn.addEventListener("click", () => {
      const selectedText = this.app.workspace.activeLeaf?.view?.editor?.getSelection();
      if (selectedText) {
        const activeLeaf = this.app.workspace.activeLeaf;
        const editor = activeLeaf && activeLeaf.view && activeLeaf.view.editor;
        if (editor) {
          editor.replaceSelection(`[[${selectedText}]]`);
          // 保存高亮历史
          const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
          if (window.colorizeTextPluginInstance) {
            const plugin = window.colorizeTextPluginInstance;
            plugin.loadFileHighlightHistory(filePath).then(history => {
              const newRecord = {
                text: selectedText,
                fullStyle: "link",
                time: Date.now()
              };
              const newHistory = [newRecord, ...history].slice(0, 100);
              plugin.saveFileHighlightHistory(filePath, newHistory);
            });
          }
          this.close();
        }
      }
    });
    
    // [[选中文本]]按钮右键事件
    linkBtn.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      try {
        const activeLeaf = this.app.workspace.activeLeaf;
        const editor = activeLeaf && activeLeaf.view && activeLeaf.view.editor;
        
        if (editor) {
          const content = editor.getValue();
          let hasChanges = false;
          let highlightedCount = 0;
          
          let searchText = editor.getSelection();
          if (!searchText) {
            searchText = "示例";
          }
          const escapedSearchText = window.colorizeTextPluginInstance.constructor.staticEscapeRegExp(searchText);
          
          // 避免重复链接化
          const linkReg = new RegExp(`\\[\\[${escapedSearchText}\\]\\]`, "g");
          let processedContent = content;
          
          if (!linkReg.test(content)) {
            processedContent = content.replace(
              new RegExp(`(${escapedSearchText})`, "g"),
              (match) => {
                highlightedCount++;
                hasChanges = true;
                return `[[${match}]]`;
              }
            );
          }
          
          if (hasChanges) {
            const oldCursor = editor.getCursor();
            const oldScroll = editor.getScrollInfo ? editor.getScrollInfo() : null;
            
            editor.setValue(processedContent);
            
            if (oldCursor) {
              editor.setCursor(oldCursor);
            }
            if (oldScroll && editor.scrollTo) {
              editor.scrollTo(oldScroll.left, oldScroll.top);
            }
            
            const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
            if (window.colorizeTextPluginInstance) {
              const plugin = window.colorizeTextPluginInstance;
              const history = await plugin.loadFileHighlightHistory(filePath);
              const newRecord = {
                text: searchText,
                fullStyle: "link",
                time: Date.now()
              };
              const newHistory = [newRecord, ...history].slice(0, 100);
              await plugin.saveFileHighlightHistory(filePath, newHistory);
            }
            
            new Notice(`已应用 ${highlightedCount} 处链接样式`);
            this.close();
          } else {
            new Notice("没有找到需要应用样式的文本或文本已链接化");
          }
        }
      } catch (error) {
        console.error('ColorizeText: 应用链接样式失败:', error);
        new Notice('应用链接样式失败: ' + error.message);
      }
    });

    formatButtonsContainer.appendChild(boldBtn);
    formatButtonsContainer.appendChild(linkBtn);
    contentEl.appendChild(formatButtonsContainer);

    // 添加自定义配色标题
    const customPaletteTitle = document.createElement("div");
    customPaletteTitle.innerText = "自定义配色（单击应用到当前 右击应用到所有匹配 中键删除）";
    customPaletteTitle.style.fontSize = "14px";
    customPaletteTitle.style.fontWeight = "bold";
    customPaletteTitle.style.marginTop = "12px";
    customPaletteTitle.style.marginBottom = "6px";
    customPaletteTitle.style.color = "#666";
    contentEl.appendChild(customPaletteTitle);

    const row = contentEl.createEl("div");
    row.style.display = "flex";
    row.style.gap = "8px";
    row.style.flexWrap = "wrap";
    row.style.marginBottom = "8px";
    // 添加拖拽样式提示
    row.style.userSelect = "none";

    // 存储palette引用，便于拖拽排序时访问
    row.palette = this.palette;

    // 创建添加按钮
    let addBtn = document.createElement("button");
    addBtn.style.display = "inline-flex";
    addBtn.style.alignItems = "center";
    addBtn.style.justifyContent = "center";
    addBtn.style.background = "#eee";
    addBtn.style.color = "#333";
    addBtn.style.fontWeight = "bold";
    addBtn.style.fontSize = "18px";
    addBtn.style.border = "1px dashed #aaa";
    addBtn.style.borderRadius = "4px";
    addBtn.style.cursor = "pointer";
    addBtn.style.padding = "0 8px";
    addBtn.style.height = "auto";
    addBtn.style.minHeight = "22px";
    addBtn.style.width = "auto";
    addBtn.style.minWidth = "32px";
    addBtn.title = "添加新配色";
    addBtn.innerText = "+";
    addBtn.addEventListener("click", () => {
      this.openAddDialog();
    });

    // 每次打开弹窗时都重新从文件加载最新的palette配置
    try {
      console.log('ColorizeText: 尝试从文件加载最新的自定义配色配置');
      const spanData = await this.plugin.loadSpanData();
      if (spanData && spanData.palette && Array.isArray(spanData.palette) && spanData.palette.length > 0) {
        // 更新this.palette和全局实例的palette
        this.palette = spanData.palette;
        if (window.colorizeTextPluginInstance) {
          window.colorizeTextPluginInstance.palette = spanData.palette;
        }
        console.log(`ColorizeText: 成功加载最新自定义配色配置，共${this.palette.length}个配色`);
      } else {
        console.log('ColorizeText: 未找到有效的自定义配色配置，使用当前内存中的配置');
      }
    } catch (error) {
      console.error('ColorizeText: 加载自定义配色配置时出错:', error);
    }
    
    // 渲染所有配色色块
    this.palette.forEach((pair, idx) => {
      const btn = document.createElement("button");
      btn.style.display = "inline-flex";
      btn.style.alignItems = "center";
      btn.style.justifyContent = "center";
      btn.style.fontWeight = "normal";
      btn.style.fontSize = "14px";
      btn.style.border = "none";
      btn.style.borderRadius = "4px";
      btn.style.cursor = "pointer";
      btn.style.padding = "0 8px";
      btn.style.margin = "0";
      btn.title = `文字:${pair.textColor} 背景:${pair.bgColor}（可拖拽排序）`;
      btn.innerText = this.previewText;
      btn.style.height = "auto";
      btn.style.minHeight = "22px";
      btn.style.width = "auto";
      btn.style.minWidth = "32px";
      
      // 设置按钮样式和颜色，确保有默认值，使用更合理的默认颜色（灰色背景黑色文字）
      btn.style.color = pair.textColor || "#333333";
      btn.style.background = pair.bgColor || "#e0e0e0";
      btn.addEventListener("click", () => {
        this.onSelect(pair);
        this.close();
      });
      

      
      // 添加拖拽功能
      btn.draggable = true;
      btn.setAttribute('data-palette-index', idx);
      
      // 拖拽开始事件
      btn.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', e.target.getAttribute('data-palette-index'));
        // 添加拖拽时的视觉效果
        setTimeout(() => {
          e.target.style.opacity = '0.4';
        }, 0);
      });
      
      // 拖拽结束事件
      btn.addEventListener('dragend', (e) => {
        e.target.style.opacity = '1';
      });
      
      // 拖拽经过事件
      btn.addEventListener('dragover', (e) => {
        e.preventDefault();
        // 添加悬停效果
        e.target.style.border = '2px dashed #ccc';
      });
      
      // 拖拽离开事件
      btn.addEventListener('dragleave', (e) => {
        e.target.style.border = 'none';
      });
      
      // 放置事件
      btn.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // 确保找到按钮元素
        let targetButton = e.target;
        while (targetButton && !targetButton.hasAttribute('data-palette-index')) {
          targetButton = targetButton.parentElement;
        }
        
        if (!targetButton) return;
        
        targetButton.style.border = 'none';
        
        // 获取拖拽源和目标的索引
        const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
        let targetIndex = parseInt(targetButton.getAttribute('data-palette-index'));
        
        // 确保索引有效
        if (isNaN(draggedIndex) || isNaN(targetIndex) || draggedIndex === targetIndex) return;
        
        // 获取当前的palette数组
        const currentPalette = [...row.palette];
        
        // 实现简单的位置互换功能
        const newPalette = [...currentPalette];
        // 保存被拖拽的元素
        const temp = newPalette[draggedIndex];
        // 交换两个元素的位置
        newPalette[draggedIndex] = newPalette[targetIndex];
        newPalette[targetIndex] = temp;
        
        // 打印排序前后的索引，用于调试
        console.log(`ColorizeText: 配色排序前 - draggedIndex: ${draggedIndex}, targetIndex: ${targetIndex}`);
        console.log(`ColorizeText: 配色排序后 - 第${draggedIndex}位: ${newPalette[draggedIndex].textColor}/${newPalette[draggedIndex].bgColor}, 第${targetIndex}位: ${newPalette[targetIndex].textColor}/${newPalette[targetIndex].bgColor}`);
        
        // 获取所有按钮
        const allButtons = Array.from(row.querySelectorAll('button'));
        
        // 保存按钮的引用，使用原始索引作为键
        const buttonReferences = {};
        allButtons.forEach(btn => {
          // 跳过添加按钮
          if (btn === addBtn) return;
          // 使用原始的data-palette-index属性作为唯一标识
          const originalIndex = btn.getAttribute('data-palette-index');
          if (originalIndex !== null) {
            buttonReferences[originalIndex] = btn;
          }
        });
        
        // 清空容器，但保留添加按钮的引用
        row.innerHTML = '';
        
        // 按新顺序重新添加按钮
        newPalette.forEach((style, index) => {
          // 找到对应的按钮
          const btn = buttonReferences[index];
          if (btn) {
            // 更新按钮的data-palette-index属性
            btn.setAttribute('data-palette-index', index);
            // 确保样式正确
            btn.style.color = style.textColor;
            btn.style.background = style.bgColor;
            
            // 获取按钮中的mark元素并更新其class
            const markElement = btn.querySelector('mark');
            if (markElement && style.class) {
              markElement.className = style.class;
            }
            
            // 添加到容器
            row.appendChild(btn);
          } else {
            console.warn(`ColorizeText: 未找到索引为 ${index} 的按钮`);
          }
        });
        
        // 添加添加按钮
        row.appendChild(addBtn);
        
        // 保存更新后的palette引用
        row.palette = newPalette;
        // 更新插件实例的palette
        this.palette = newPalette;
        
        // 确保容器是flex布局
        if (!row.style.display || row.style.display !== 'flex') {
          row.style.display = 'flex';
          row.style.flexWrap = 'wrap';
        }
        
        // 保存排序后的配色方案
          try {
            console.log('ColorizeText: 开始保存配色排序配置');
            // 先确保plugin实例和modal的palette都已更新
            this.palette = newPalette;
            if (window.colorizeTextPluginInstance) {
              window.colorizeTextPluginInstance.palette = newPalette;
            }
            
            // 创建配置副本，避免引用问题
            const configToSave = {
              palette: JSON.parse(JSON.stringify(newPalette)),
              settings: {} // 清空settings，避免影响palette保存
            };
            
            // 首先尝试使用全局实例的savePalette方法，这是最可靠的方式
            let saveResult = false;
            if (window.colorizeTextPluginInstance) {
              saveResult = await window.colorizeTextPluginInstance.savePalette();
              if (saveResult) {
                console.log('ColorizeText: 通过全局实例保存配色排序成功');
              }
            }
            
            // 如果全局实例保存失败，尝试直接使用Modal的saveSpanData方法
            if (!saveResult) {
              console.error('ColorizeText: 全局实例保存失败，尝试使用Modal的saveSpanData方法');
              saveResult = await this.saveSpanData(configToSave);
              if (saveResult) {
                console.log('ColorizeText: 通过Modal的saveSpanData方法保存成功');
              }
            }
            
            // 如果前两种方法都失败，尝试使用适配器直接写入文件
            if (!saveResult) {
              console.error('ColorizeText: 前两种保存方法都失败，尝试使用适配器直接写入');
              try {
                const dataPath = this.app.vault.adapter.getBasePath() + '\\.obsidian\\plugins\\colorize-text\\span_data.json';
                await this.app.vault.adapter.write(dataPath, JSON.stringify(configToSave, null, 2));
                console.log('ColorizeText: 适配器直接写入文件成功');
                saveResult = true;
              } catch (adapterError) {
                console.error('ColorizeText: 适配器写入失败:', adapterError);
              }
            }
            
            if (saveResult) {
              console.log('ColorizeText: 配色排序配置成功保存到span_data.json! 下次打开时将保持当前顺序');
            } else {
              console.error('ColorizeText: 所有保存方法均失败!');
            }
            
            // 立即验证保存结果
            setTimeout(async () => {
              try {
                const savedData = await this.loadSpanData();
                if (savedData && savedData.palette && savedData.palette.length === newPalette.length) {
                  console.log('ColorizeText: 保存验证成功，配色数量一致');
                } else {
                  console.error('ColorizeText: 保存验证失败，可能未正确写入文件');
                }
              } catch (verifyError) {
                console.error('ColorizeText: 保存验证异常:', verifyError);
              }
            }, 300);
          } catch (error) {
            console.error('ColorizeText: 保存配色排序配置时发生异常:', error);
          }
      });
      
      // 右键直接应用到所有匹配项
      btn.addEventListener("contextmenu", async (e) => {
        e.preventDefault();
        // 获取当前选中的文本（应为原始选区，而不是预览文本）
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf) return;
        const view = activeLeaf.view;
        if (!view || !view.editor) return;
        const editor = view.editor;
        let selectedText = editor.getSelection();
        if (!selectedText) selectedText = this.previewText.replace(/\.\.\.$/, "");
        const content = editor.getValue();
        if (!selectedText) return;
        // 匹配所有未被包裹的完整选中文本
        const spanReg = new RegExp(`<span[^>]*>\s*${selectedText}\s*<\/span>`, "g");
        let replaced = false;
        // 只替换未包裹的完整文本（不拆分重复子串）
        let newContent = content.replace(new RegExp(`(?<!<span[^>]*>)${selectedText}(?!<\/span>)`, "g"), (match, offset, str) => {
          // 跳过已包裹的
          if (spanReg.test(str.slice(Math.max(0, offset - 30), offset + match.length + 30))) return match;
          replaced = true;
          return `<span style="color: ${pair.textColor}; background-color: ${pair.bgColor};">${match}</span>`;
        });
        
        // 确保编辑器存在且内容已修改
        if (replaced) {
          // 记录原光标和滚动条位置
          const oldCursor = editor.getCursor();
          const oldScroll = editor.getScrollInfo ? editor.getScrollInfo() : null;
          editor.setValue(newContent);
          // 恢复光标
          if (oldCursor) editor.setCursor(oldCursor);
          // 恢复滚动条
          if (oldScroll && editor.scrollTo) editor.scrollTo(oldScroll.left, oldScroll.top);
          // 保存高亮历史
          const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
          if (window.colorizeTextPluginInstance) {
            const plugin = window.colorizeTextPluginInstance;
            // 使用新方法加载历史
            const history = await plugin.loadFileHighlightHistory(filePath);
            // 直接使用pair中的颜色值
            const newRecord = {
              text: selectedText,
              textColor: pair.textColor,
              bgColor: pair.bgColor,
              fullStyle: `color: ${pair.textColor}; background-color: ${pair.bgColor}`,
              time: Date.now()
            };
            // 使用新方法保存历史
            const newHistory = [newRecord, ...history].slice(0, 100);
            await plugin.saveFileHighlightHistory(filePath, newHistory);
          }
        }
        // 应用后关闭弹窗
        this.close();
      });
      
      // 中键点击移除配色方案
      btn.addEventListener("mousedown", async (e) => {
        // button=1 表示中键
        if (e.button === 1) {
          e.preventDefault();
          // 从palette中移除当前配色
          const newPalette = [...this.palette].filter((_, index) => index !== idx);
          this.palette = newPalette;
          
          // 保存更新后的palette
          try {
            if (window.colorizeTextPluginInstance) {
              // 先更新主插件实例的palette，确保保存的是最新数据
              window.colorizeTextPluginInstance.palette = newPalette;
              // 然后调用保存方法
              await window.colorizeTextPluginInstance.savePalette();
              console.log('ColorizeText: 成功移除配色并保存，当前配色数量:', newPalette.length);
            } else {
              console.error('ColorizeText: 主插件实例不存在，无法保存palette');
            }
            // 重新打开弹窗以刷新视图
            this.close();
            if (window.colorizeTextPluginInstance) {
              const activeLeaf = this.app.workspace.activeLeaf;
              if (activeLeaf && activeLeaf.view && activeLeaf.view.editor) {
                window.colorizeTextPluginInstance.openColorModal(activeLeaf.view.editor);
              }
            }
          } catch (error) {
            console.error('ColorizeText: 移除配色时保存失败:', error);
          }
        }
      });
      
      // 添加按钮到容器
      row.appendChild(btn);
    });
    
    // 添加添加按钮到容器
    row.appendChild(addBtn);
  
    // 添加容器到内容元素
      contentEl.appendChild(row);
      
      // 添加AI功能提示信息
      if (window.colorizeTextPluginInstance?.settings?.enableAIColor !== false && !window.colorizeTextPluginInstance?.settings?.apiKey) {
        const aiTip = contentEl.createEl("div");
        aiTip.style.margin = "12px 0";
        aiTip.style.padding = "8px";
        aiTip.style.backgroundColor = "#f0f0f0";
        aiTip.style.borderRadius = "4px";
        aiTip.style.fontSize = "12px";
        aiTip.style.color = "#666";
        aiTip.innerText = "提示：配置API Key后可启用AI配色功能。请前往插件设置界面进行配置。";
        contentEl.appendChild(aiTip);
      }
    // 注意：addBtn已经在前面声明过了，这里直接使用现有变量
    addBtn.style.display = "inline-flex";
    addBtn.style.alignItems = "center";
    addBtn.style.justifyContent = "center";
    addBtn.style.background = "#eee";
    addBtn.style.color = "#333";
    addBtn.style.fontWeight = "bold";
    addBtn.style.fontSize = "18px";
    addBtn.style.border = "1px dashed #aaa";
    addBtn.style.borderRadius = "4px";
    addBtn.style.cursor = "pointer";
    addBtn.style.padding = "0 8px";
    addBtn.style.height = "auto";
    addBtn.style.minHeight = "22px";
    addBtn.style.width = "auto";
    addBtn.style.minWidth = "32px";
    addBtn.title = "添加新配色";
    addBtn.innerText = "+";
    addBtn.addEventListener("click", () => {
      this.openAddDialog();
    });
    row.appendChild(addBtn);

    // 添加AI生成配色的区域
    if (window.colorizeTextPluginInstance?.settings?.apiKey && window.colorizeTextPluginInstance?.settings?.enableAIColor !== false) {
      const aiRow = contentEl.createEl("div");
      aiRow.style.display = "flex";
      aiRow.style.alignItems = "center";
      aiRow.style.gap = "8px";
      aiRow.style.margin = "12px 0";
      
      // AI按钮
      const aiBtn = document.createElement("button");
      aiBtn.style.display = "inline-flex";
      aiBtn.style.alignItems = "center";
      aiBtn.style.justifyContent = "center";
      aiBtn.style.background = this.palette[0].bgColor || "#4caf50";
      aiBtn.style.color = this.palette[0].textColor || "#fff";
      aiBtn.style.fontWeight = "bold";
      aiBtn.style.fontSize = "14px";
      aiBtn.style.border = "none";
      aiBtn.style.borderRadius = "4px";
      aiBtn.style.cursor = "pointer";
      aiBtn.style.padding = "6px 12px";
      aiBtn.style.height = "auto";
      aiBtn.style.minHeight = "32px";
      aiBtn.style.width = "auto";
      aiBtn.style.minWidth = "80px";
      aiBtn.title = "AI生成配色";
      
      // 显示选中的文本（最多4个字符）
      const selectedText = this.app.workspace.activeLeaf?.view?.editor?.getSelection();
      const displayText = selectedText ? 
        (selectedText.length > 4 ? selectedText.slice(0, 4) + "..." : selectedText) : 
        "AI配色";
      aiBtn.innerText = displayText;
      
      // 单击应用配色
      aiBtn.addEventListener("click", () => {
        const editor = this.app.workspace.activeLeaf?.view?.editor;
        if (editor && resultText.value) {
          const selectedText = editor.getSelection();
          if (selectedText) {
            editor.replaceSelection(resultText.value);
            // 添加到高亮历史
            const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
            if (window.colorizeTextPluginInstance) {
              const plugin = window.colorizeTextPluginInstance;
              const history = plugin.highlightHistory[filePath] || [];
              const match = resultText.value.match(/<span[^>]+style="[^"]*color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3});[^"]*background-color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})[^"]*"[^>]*>/i);
              const fullStyleMatch = resultText.value.match(/<span[^>]+style="([^"]*)"[^>]*>/i);
              if (match && fullStyleMatch) {
                const newRecord = {
                  text: selectedText,
                  textColor: match[1],
                  bgColor: match[2],
                  fullStyle: fullStyleMatch[1],
                  time: Date.now()
                };
                plugin.highlightHistory[filePath] = [newRecord, ...history].slice(0, 100);
                plugin.savePalette();
                this.close(); // 关闭弹窗
              }
            }
          }
        }
      });
      
      // 右键菜单：应用到所有匹配
      aiBtn.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const menu = document.createElement("div");
        menu.style.position = "fixed";
        
        // 计算菜单位置，确保不超出屏幕
        const menuWidth = 180; // 预估菜单宽度
        const menuHeight = 100; // 预估菜单高度
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        
        // 检查是否会超出右侧边界，如果会则调整位置
        let left = e.clientX;
        if (left + menuWidth > screenWidth) {
          left = screenWidth - menuWidth - 10;
        }
        
        // 检查是否会超出底部边界，如果会则调整位置
        let top = e.clientY;
        if (top + menuHeight > screenHeight) {
          top = screenHeight - menuHeight - 10;
        }
        
        menu.style.left = left + "px";
        menu.style.top = top + "px";
        menu.style.background = "#fff";
        menu.style.border = "1px solid #ccc";
        menu.style.borderRadius = "6px";
        menu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)";
        menu.style.zIndex = "99999";
        menu.style.padding = "4px 0";
        menu.style.minWidth = "140px";
        
        const applyAllItem = document.createElement("div");
        applyAllItem.innerText = "应用到所有匹配";
        applyAllItem.style.padding = "8px 16px";
        applyAllItem.style.cursor = "pointer";
        applyAllItem.addEventListener("mouseenter", () => { applyAllItem.style.background = "#f0f0f0"; });
        applyAllItem.addEventListener("mouseleave", () => { applyAllItem.style.background = "#fff"; });
        applyAllItem.addEventListener("click", async () => {
          menu.remove();
          const editor = this.app.workspace.activeLeaf?.view?.editor;
          if (editor && resultText.value) {
            const selectedText = editor.getSelection();
            if (!selectedText) return;
            const content = editor.getValue();
            // 从文本框获取完整的HTML内容
            const htmlContent = resultText.value;
            // 解析颜色值
            const colorMatch = htmlContent.match(/<span[^>]+style="[^"]*color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3});[^"]*background-color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})[^"]*"[^>]*>/i);
            if (colorMatch) {
              const textColor = colorMatch[1];
              const bgColor = colorMatch[2];
              const spanReg = new RegExp(`<span[^>]*>\s*${selectedText}\s*<\/span>`, "g");
              let replaced = false;
              // 获取完整的样式字符串
              const fullStyleMatch = htmlContent.match(/<span[^>]+style="([^"]*)"[^>]*>/i);
              const fullStyle = fullStyleMatch ? fullStyleMatch[1] : `color: ${textColor}; background-color: ${bgColor}`;
              
              let newContent = content.replace(new RegExp(`(?<!<span[^>]*>)${selectedText}(?!<\/span>)`, "g"), (matchText, offset, str) => {
                if (spanReg.test(str.slice(Math.max(0, offset - 30), offset + matchText.length + 30))) return matchText;
                replaced = true;
                return `<span style="${fullStyle}">${matchText}</span>`;
              });
              if (replaced) {
            // 记录移除高亮前的光标位置
            const beforeCursor = editor.getCursor();
            console.log(`ColorizeText: 中键移除高亮前 - 当前行: ${beforeCursor.line}, 列: ${beforeCursor.ch}`);
            
            const oldCursor = editor.getCursor();
            const oldScroll = editor.getScrollInfo ? editor.getScrollInfo() : null;
            
            console.log(`ColorizeText: 中键移除高亮前记录的光标位置 - 行: ${oldCursor.line}, 列: ${oldCursor.ch}`);
            
            editor.setValue(newContent);
            
            if (oldCursor) {
              editor.setCursor(oldCursor);
              console.log(`ColorizeText: 中键移除高亮后恢复光标位置 - 行: ${oldCursor.line}, 列: ${oldCursor.ch}`);
            }
            if (oldScroll && editor.scrollTo) editor.scrollTo(oldScroll.left, oldScroll.top);
                // 添加到高亮历史
                const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
                if (window.colorizeTextPluginInstance) {
                  const plugin = window.colorizeTextPluginInstance;
                  const history = plugin.highlightHistory[filePath] || [];
                  const newRecord = {
                    text: selectedText,
                    textColor: colorMatch[1],
                    bgColor: colorMatch[2],
                    fullStyle: fullStyle,
                    time: Date.now()
                  };
                  plugin.highlightHistory[filePath] = [newRecord, ...history].slice(0, 100);
                  // 添加调用saveFileHighlightHistory方法，确保高亮历史保存到.data文件
                  await plugin.saveFileHighlightHistory(filePath, plugin.highlightHistory[filePath]);
                  plugin.savePalette();
                  this.close(); // 关闭弹窗
                }
              }
            }
          }
        });
        menu.appendChild(applyAllItem);
        document.body.appendChild(menu);
        setTimeout(() => {
          document.addEventListener("mousedown", (ev) => {
            if (!menu.contains(ev.target)) menu.remove();
          }, { once: true });
        }, 0);
      });
      
      aiRow.appendChild(aiBtn);

      // AI结果文本框（可编辑）
      const resultText = document.createElement("textarea");
      resultText.className = "ai-result-text";
      resultText.style.flex = "1";
      resultText.style.padding = "8px";
      resultText.style.border = "1px solid #ddd";
      resultText.style.borderRadius = "4px";
      resultText.style.backgroundColor = "#f8f8f8";
      resultText.style.minHeight = "32px";
      resultText.style.overflow = "auto";
      resultText.style.fontSize = "13px";
      resultText.style.resize = "vertical";
      resultText.readOnly = true;
      resultText.innerText = "正在获取AI配色...";
      aiRow.appendChild(resultText);

      // 文本框修改时实时更新AI按钮样式
      resultText.addEventListener("input", () => {
        const match = resultText.value.match(/<span[^>]+style="[^"]*color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3});[^"]*background-color:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})[^"]*"[^>]*>/i);
        if (match) {
          aiBtn.style.color = match[1];
          aiBtn.style.background = match[2];
        }
      });

      // 弹窗打开时自动发送请求给AI
      if (selectedText) {
        // 获取编辑器实例并传递给generateAIColor方法
        const editor = this.app.workspace.activeLeaf?.view?.editor;
        this.generateAIColor(selectedText, aiRow, editor);
      }
    }

    // 高亮历史展示
    if (this.highlightHistory.length > 0) {
      const historyTitle = document.createElement("div");
      historyTitle.style.margin = "18px 0 6px 0";
      historyTitle.style.fontWeight = "bold";
      historyTitle.style.display = "flex";
      historyTitle.style.justifyContent = "space-between";
      historyTitle.style.alignItems = "center";
      
      // 标题文本
      const titleText = document.createElement("span");
      titleText.innerText = "高亮历史(单击定位 中键删除所有匹配)";
      historyTitle.appendChild(titleText);
      
      // 打开文件夹按钮
      const openFolderBtn = document.createElement("button");
      openFolderBtn.innerText = "打开文件夹";
      openFolderBtn.style.fontSize = "12px";
      openFolderBtn.style.padding = "2px 8px";
      openFolderBtn.style.background = "#f0f0f0";
      openFolderBtn.style.border = "1px solid #ccc";
      openFolderBtn.style.borderRadius = "3px";
      openFolderBtn.style.cursor = "pointer";
      openFolderBtn.style.marginLeft = "8px";
      
      openFolderBtn.addEventListener("click", async () => {
        try {
          const childProcess = require('child_process');
          const path = require('path');
          
          // 获取当前文件路径
          const activeFile = this.app.workspace.getActiveFile();
          const filePath = activeFile?.path || "__unknown__";
          
          // 获取对应的高亮历史文件路径
          const highlightFileName = this.plugin.getHighlightFileName(filePath);
          
          // 在Windows上打开文件夹并选中文件
          // 使用start命令，后跟文件夹路径和文件路径
          const folderPath = path.dirname(highlightFileName);
          childProcess.exec(`start "" "${folderPath}" /select,"${highlightFileName}"`);
        } catch (error) {
          console.error("打开高亮历史文件夹失败:", error);
          new Notice("打开高亮历史文件夹失败");
        }
      });
      
      historyTitle.appendChild(openFolderBtn);
      contentEl.appendChild(historyTitle);
      this.highlightHistory.forEach(h => {
        const item = document.createElement("div");
        item.style.display = "inline-block";
        item.style.margin = "2px 8px 2px 0";
        item.style.padding = "2px 8px";
        item.style.borderRadius = "4px";
        item.style.fontSize = "13px";
        item.style.cursor = "pointer";
        
        // 检查是否有markClass属性，有则应用mark标签的CSS渲染
        if (h.markClass) {
          const markElement = document.createElement("mark");
          markElement.className = h.markClass;
          markElement.innerText = h.text.length > 16 ? h.text.slice(0, 16) + "..." : h.text;
          item.appendChild(markElement);
          // 移除默认样式，让mark标签的CSS类生效
          item.style.background = "none";
          item.style.color = "inherit";
        } else {
          // 优先使用fullStyle
          if (h.fullStyle === "bold") {
            // 加粗样式
            item.style.fontWeight = "bold";
            item.innerText = h.text.length > 16 ? h.text.slice(0, 16) + "..." : h.text;
          } else if (h.fullStyle === "link") {
            // 链接样式
            item.style.color = "#0066cc";
            item.style.textDecoration = "underline";
            item.innerText = h.text.length > 16 ? h.text.slice(0, 16) + "..." : h.text;
          } else if (h.fullStyle) {
            // 解析fullStyle中的样式并应用
            const styleParts = h.fullStyle.split(';');
            styleParts.forEach(part => {
              const [prop, value] = part.split(':').map(s => s.trim());
              if (prop && value) {
                item.style[prop.replace(/-([a-z])/g, g => g[1].toUpperCase())] = value;
              }
            });
            item.innerText = h.text.length > 16 ? h.text.slice(0, 16) + "..." : h.text;
          } else {
            // 如果没有fullStyle，回退到原有渲染方式
            item.style.background = h.bgColor;
            item.style.color = h.textColor;
            item.innerText = h.text.length > 16 ? h.text.slice(0, 16) + "..." : h.text;
          }
        }
        item.title = h.text;
        item.addEventListener("click", () => {
          // 只定位并选中页面第一个匹配文本，不再自动高亮
          const activeLeaf = this.app.workspace.activeLeaf;
          if (!activeLeaf) return;
          const view = activeLeaf.view;
          if (!view || !view.editor) return;
          const editor = view.editor;
          const content = editor.getValue();
          const idx = content.indexOf(h.text);
          if (idx !== -1) {
            const startLine = content.substr(0, idx).split('\n').length - 1;
            const startCh = idx - content.lastIndexOf('\n', idx - 1) - 1;
            const endLine = content.substr(0, idx + h.text.length).split('\n').length - 1;
            const endCh = idx + h.text.length - content.lastIndexOf('\n', idx + h.text.length - 1) - 1;
            editor.setSelection({ line: startLine, ch: startCh }, { line: endLine, ch: endCh });
            editor.scrollIntoView({ from: { line: startLine, ch: startCh }, to: { line: endLine, ch: endCh } });
          }
          this.close();
        });
        // 添加中键点击事件 - 直接移除所有匹配高亮
        item.addEventListener("mousedown", async (e) => {
          if (e.button === 1) { // 中键点击
            e.preventDefault();
            // 移除所有匹配文本的高亮
            const activeLeaf = this.app.workspace.activeLeaf;
            if (!activeLeaf) return;
            const view = activeLeaf.view;
            if (!view || !view.editor) return;
            const editor = view.editor;
            const content = editor.getValue();
            const escText = h.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            // 同时匹配span和mark标签
            const tagReg = new RegExp(`<(span|mark)[^>]*>\\s*${escText}\\s*</\\1>`, "gi");
            let newContent = content.replace(tagReg, h.text);
            
            // 处理加粗格式 (**text**)
            const boldReg = new RegExp(`\\*\\*\\s*${escText}\\s*\\*\\*`, "gi");
            newContent = newContent.replace(boldReg, h.text);
            
            // 处理链接格式 ([[text]])
            const linkReg = new RegExp(`\\[\\[\\s*${escText}\\s*\\]\\]`, "gi");
            newContent = newContent.replace(linkReg, h.text);
            
            const oldCursor = editor.getCursor();
            const oldScroll = editor.getScrollInfo ? editor.getScrollInfo() : null;
            editor.setValue(newContent);
            if (oldCursor) editor.setCursor(oldCursor);
            if (oldScroll && editor.scrollTo) editor.scrollTo(oldScroll.left, oldScroll.top);
            // 从高亮历史中删除该项
            const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
            if (window.colorizeTextPluginInstance) {
              const plugin = window.colorizeTextPluginInstance;
              // 使用新方法加载历史
              const history = await plugin.loadFileHighlightHistory(filePath);
              // 过滤掉匹配的历史记录
              const newHistory = history.filter(item => item.text !== h.text || item.bgColor !== h.bgColor || item.textColor !== h.textColor);
              // 使用正确的方法名保存历史
              await plugin.saveFileHighlightHistory(filePath, newHistory);
              // 重新打开弹窗以刷新视图
              this.close();
              if (activeLeaf && activeLeaf.view && activeLeaf.view.editor) {
                plugin.openColorModal(activeLeaf.view.editor);
              }
            }
          }
        });
        // 右键菜单：添加应用和移除选项
        item.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          // 弹出菜单
          const menu = document.createElement("div");
          menu.style.position = "fixed";
          
          // 计算菜单位置，确保不超出屏幕
          const menuWidth = 200; // 预估菜单宽度
          const menuHeight = 300; // 预估菜单高度（包含所有选项）
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;
          
          // 检查是否会超出右侧边界，如果会则调整位置
          let left = e.clientX;
          if (left + menuWidth > screenWidth) {
            left = screenWidth - menuWidth - 10;
          }
          
          // 检查是否会超出底部边界，如果会则调整位置
          let top = e.clientY;
          if (top + menuHeight > screenHeight) {
            top = screenHeight - menuHeight - 10;
          }
          
          menu.style.left = left + "px";
          menu.style.top = top + "px";
          menu.style.background = "#fff";
          menu.style.border = "1px solid #ccc";
          menu.style.borderRadius = "6px";
          menu.style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)";
          menu.style.zIndex = "99999";
          menu.style.padding = "4px 0";
          menu.style.minWidth = "140px";
          
          // 应用到当前选项
          const applyCurrentItem = document.createElement("div");
          applyCurrentItem.innerText = "应用到当前";
          applyCurrentItem.style.padding = "8px 16px";
          applyCurrentItem.style.cursor = "pointer";
          applyCurrentItem.addEventListener("mouseenter", () => { applyCurrentItem.style.background = "#f0f0f0"; });
          applyCurrentItem.addEventListener("mouseleave", () => { applyCurrentItem.style.background = "#fff"; });
          applyCurrentItem.addEventListener("click", async () => {
            menu.remove();
            // 应用到当前选中的文本
            const activeLeaf = this.app.workspace.activeLeaf;
            if (!activeLeaf) return;
            const view = activeLeaf.view;
            if (!view || !view.editor) return;
            const editor = view.editor;
            const selectedText = editor.getSelection();
            if (selectedText) {
              const wrapped = `<span style="${h.fullStyle || `color: ${h.textColor}; background-color: ${h.bgColor}`}">${selectedText}</span>`;
              editor.replaceSelection(wrapped);
              // 更新高亮历史
              const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
              if (window.colorizeTextPluginInstance) {
                const plugin = window.colorizeTextPluginInstance;
                // 使用新方法加载历史
                const history = await plugin.loadFileHighlightHistory(filePath);
                // 过滤掉相同文本但颜色不同的项（避免重复）
                const filteredHistory = history.filter(item => item.text !== selectedText);
                // 创建新的高亮历史记录
                const newRecord = {
                  text: selectedText,
                  textColor: h.textColor,
                  bgColor: h.bgColor,
                  fullStyle: h.fullStyle,
                  time: Date.now()
                };
                // 将新记录添加到历史的最前面，并限制总条数
                const newHistory = [newRecord, ...filteredHistory].slice(0, 100);
                // 使用新方法保存历史
                await plugin.saveFileHighlightHistory(filePath, newHistory);
              }
              this.close();
            }
          });
          menu.appendChild(applyCurrentItem);
          
          // 将格式输入到编辑框选项
          const formatToEditorItem = document.createElement("div");
          formatToEditorItem.innerText = "将格式输入到编辑框";
          formatToEditorItem.style.padding = "8px 16px";
          formatToEditorItem.style.cursor = "pointer";
          formatToEditorItem.addEventListener("mouseenter", () => { formatToEditorItem.style.background = "#f0f0f0"; });
          formatToEditorItem.addEventListener("mouseleave", () => { formatToEditorItem.style.background = "#fff"; });
          formatToEditorItem.addEventListener("click", () => {
            menu.remove();
            
            // 创建局部变量保存当前的h值，避免闭包问题
            const currentHighlight = h;
            
            // 获取编辑器实例
            const activeLeaf = this.app.workspace.activeLeaf;
            if (!activeLeaf) return;
            const view = activeLeaf.view;
            if (!view || !view.editor) return;
            const editor = view.editor;
            
            // 获取编辑器中当前选中的文字
            const selectedText = editor.getSelection();
            
            // 查找AI编辑框（改进选择器）
            const resultText = document.querySelector(".ai-result-text");
            if (!resultText) {
              console.error("无法找到AI编辑框");
              return;
            }
            
            // 构建span标签格式，使用选中的文字替换中间的内容
            const spanFormat = `<span style="${currentHighlight.fullStyle || `color: ${currentHighlight.textColor}; background-color: ${currentHighlight.bgColor}`}">${selectedText || currentHighlight.text}</span>`;
            
            // 填充到编辑框并设置为可编辑
            resultText.readOnly = false;
            resultText.value = spanFormat;
            
            // 确保编辑框可见
            const pluginContainer = resultText.closest(".modal-content") || resultText.closest("div");
            if (pluginContainer) {
              // 滚动到编辑框位置
              pluginContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            
            // 选中整个内容
            resultText.focus();
            resultText.select();
            
            // 触发input事件，更新AI按钮样式
            const inputEvent = new Event('input', { bubbles: true });
            resultText.dispatchEvent(inputEvent);
            
            // 不需要关闭插件窗口，让用户可以继续操作
          });
          menu.appendChild(formatToEditorItem);
          
          // 分隔线
          const separator = document.createElement("div");
          separator.style.height = "1px";
          separator.style.background = "#eee";
          separator.style.margin = "4px 0";
          menu.appendChild(separator);
          
          // 从历史中移除选项
          const removeHistoryItem = document.createElement("div");
          removeHistoryItem.innerText = "从历史中移除";
          removeHistoryItem.style.padding = "8px 16px";
          removeHistoryItem.style.cursor = "pointer";
          removeHistoryItem.addEventListener("mouseenter", () => { removeHistoryItem.style.background = "#f0f0f0"; });
          removeHistoryItem.addEventListener("mouseleave", () => { removeHistoryItem.style.background = "#fff"; });
          removeHistoryItem.addEventListener("click", async () => {
            menu.remove();
            // 只从高亮历史中移除该项，不影响正文高亮
            const activeLeaf = this.app.workspace.activeLeaf;
            if (!activeLeaf) return;
            const view = activeLeaf.view;
            if (!view || !view.editor) return;
            const editor = view.editor;
            const content = editor.getValue();
            // 更强的高亮移除正则，兼容属性顺序、单双引号、空格
            const escText = h.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const spanReg = new RegExp(`<span[^>]*>\s*${escText}\s*</span>`, "gi");
            let newContent = content.replace(spanReg, h.text);
            // 恢复原光标和滚动条位置
            const oldCursor = editor.getCursor();
            const oldScroll = editor.getScrollInfo ? editor.getScrollInfo() : null;
            editor.setValue(newContent);
            if (oldCursor) editor.setCursor(oldCursor);
            if (oldScroll && editor.scrollTo) editor.scrollTo(oldScroll.left, oldScroll.top);
            // 从高亮历史中删除该项
            const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
            if (window.colorizeTextPluginInstance) {
              const plugin = window.colorizeTextPluginInstance;
              // 使用正确的方法加载历史
              const history = await plugin.loadFileHighlightHistory(filePath);
              // 过滤掉匹配的历史记录
              const newHistory = history.filter(item => item.text !== h.text || item.bgColor !== h.bgColor || item.textColor !== h.textColor);
              // 使用正确的方法名保存历史到文件
              await plugin.saveFileHighlightHistory(filePath, newHistory);
              console.log('ColorizeText: 已从高亮历史文件中移除项目');
            }
            this.close();
          });

          // 移除所有匹配高亮
          const removeItem = document.createElement("div");
          removeItem.innerText = "移除所有匹配高亮";
          removeItem.style.padding = "8px 16px";
          removeItem.style.cursor = "pointer";
          removeItem.addEventListener("mouseenter", () => { removeItem.style.background = "#f0f0f0"; });
          removeItem.addEventListener("mouseleave", () => { removeItem.style.background = "#fff"; });
          removeItem.addEventListener("click", async () => {
            menu.remove();
            // 移除所有匹配文本的高亮
            const activeLeaf = this.app.workspace.activeLeaf;
            if (!activeLeaf) return;
            const view = activeLeaf.view;
            if (!view || !view.editor) return;
            const editor = view.editor;
            const content = editor.getValue();
            const escText = h.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const spanReg = new RegExp(`<span[^>]*>\s*${escText}\s*</span>`, "gi");
            let newContent = content.replace(spanReg, h.text);
            const oldCursor = editor.getCursor();
            const oldScroll = editor.getScrollInfo ? editor.getScrollInfo() : null;
            editor.setValue(newContent);
            if (oldCursor) editor.setCursor(oldCursor);
            if (oldScroll && editor.scrollTo) editor.scrollTo(oldScroll.left, oldScroll.top);
            // 从高亮历史中删除该项
            const filePath = this.app.workspace.getActiveFile()?.path || "__unknown__";
            if (window.colorizeTextPluginInstance) {
              const plugin = window.colorizeTextPluginInstance;
              // 使用新方法加载历史
              const history = await plugin.loadFileHighlightHistory(filePath);
              // 过滤掉匹配的历史记录
              const newHistory = history.filter(item => item.text !== h.text || item.bgColor !== h.bgColor || item.textColor !== h.textColor);
              // 使用正确的方法名保存历史
              await plugin.saveFileHighlightHistory(filePath, newHistory);
            }
            this.close();
          });
          
          menu.appendChild(removeHistoryItem);
          menu.appendChild(removeItem);
          document.body.appendChild(menu);
          // 点击其他区域关闭菜单
          const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) menu.remove();
          };
          setTimeout(() => {
            document.addEventListener("mousedown", closeMenu, { once: true });
          }, 0);
        });
        contentEl.appendChild(item);
      });
    }

  }
  
  async openAddDialog() {
    try {
      // 确保使用this.contentEl而不是局部变量，避免作用域问题
      const contentEl = this.contentEl;
      // 使用原生DOM方法清空元素
      if (contentEl && contentEl instanceof HTMLElement) {
        while (contentEl.firstChild) {
          contentEl.removeChild(contentEl.firstChild);
        }
        contentEl.style.minWidth = "340px";
        contentEl.style.padding = "24px";
        // 临时清空剪贴板
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText("");
        }
        // 添加弹窗标题（如果没有）
        if (!contentEl.querySelector('.colorize-modal-title')) {
          const title = document.createElement("div");
          title.className = "colorize-modal-title";
          title.innerText = "新配色";
          title.style.fontSize = "18px";
          title.style.fontWeight = "bold";
          title.style.marginBottom = "14px";
          contentEl.appendChild(title);
        }



        // 预设颜色
        const COLORS = [
          "#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#FFFFFF",
          "#FFA500", "#800080", "#008000", "#808000", "#C0C0C0", "#808080", "#FFD700", "#A52A2A"
        ];

        let textColor = COLORS[0];
        let bgColor = COLORS[7];

        // 预览按钮样式优化（提前定义，供输入框和色块区联动）
        const preview = document.createElement("button");
        preview.innerText = "这是一段预览文字";
        preview.style.display = "inline-flex";
        preview.style.alignItems = "center";
        preview.style.justifyContent = "center";
        preview.style.background = bgColor;
        preview.style.color = textColor;
        preview.style.fontWeight = "normal";
        preview.style.fontSize = "14px";
        preview.style.border = "none";
        preview.style.borderRadius = "4px";
        preview.style.cursor = "default";
        preview.style.padding = "0 8px";
        preview.style.margin = "12px auto";
        preview.style.height = "auto";
        preview.style.minHeight = "22px";
        preview.style.width = "auto";
        preview.style.minWidth = "32px";

        // 文字色选择 + 输入框（同一行），色块另起一行
        const textRowWrap = document.createElement("div");
        textRowWrap.style.display = "flex";
        textRowWrap.style.alignItems = "center";
        textRowWrap.style.marginBottom = "6px";
        const textLabel = document.createElement("span");
        textLabel.innerText = "文字颜色: ";
        textLabel.style.marginRight = "6px";
        textRowWrap.appendChild(textLabel);
        const textInput = document.createElement("input");
        textInput.type = "text";
        textInput.value = textColor;
        textInput.style.width = "80px";
        textInput.style.marginRight = "8px";
        textInput.style.border = "1px solid #ccc";
        textInput.style.borderRadius = "4px";
        textInput.style.height = "22px";
        textInput.style.fontSize = "13px";
        textInput.addEventListener("input", () => {
          textColor = textInput.value;
          preview.style.color = textColor;
        });
        textRowWrap.appendChild(textInput);
        setTimeout(() => { textInput.focus(); }, 0);

        // 文字色块区
        const textRow = document.createElement("div");
        textRow.style.display = "flex";
        textRow.style.marginBottom = "10px";
        COLORS.forEach(c => {
          const btn = document.createElement("button");
          btn.innerText = "A";
          btn.style.background = "transparent";
          btn.style.color = c;
          btn.style.width = "24px";
          btn.style.height = "24px";
          btn.style.fontSize = "16px";
          btn.style.fontWeight = "bold";
          btn.style.border = "none";
          btn.style.borderRadius = "0";
          btn.style.cursor = "pointer";
          btn.style.padding = "0";
          btn.style.margin = "0";
          btn.title = c;
          btn.addEventListener("click", () => {
            textColor = c;
            textInput.value = c;
            preview.style.color = c;
          });
          textRow.appendChild(btn);
        });

        // 背景色选择 + 输入框（同一行），色块另起一行
        const bgRowWrap = document.createElement("div");
        bgRowWrap.style.display = "flex";
        bgRowWrap.style.alignItems = "center";
        bgRowWrap.style.marginBottom = "6px";
        const bgLabel = document.createElement("span");
        bgLabel.innerText = "背景颜色: ";
        bgLabel.style.marginRight = "6px";
        bgRowWrap.appendChild(bgLabel);
        const bgInput = document.createElement("input");
        bgInput.type = "text";
        bgInput.value = bgColor;
        bgInput.style.width = "80px";
        bgInput.style.marginRight = "8px";
        bgInput.style.border = "1px solid #ccc";
        bgInput.style.borderRadius = "4px";
        bgInput.style.height = "22px";
        bgInput.style.fontSize = "13px";
        bgInput.addEventListener("input", () => {
          bgColor = bgInput.value;
          preview.style.background = bgColor;
        });
        bgRowWrap.appendChild(bgInput);

        // 背景色块区
        const bgRow = document.createElement("div");
        bgRow.style.display = "flex";
        bgRow.style.marginBottom = "10px";
        COLORS.forEach(c => {
          const btn = document.createElement("button");
          btn.style.background = c;
          btn.style.width = "24px";
          btn.style.height = "24px";
          btn.style.border = "none";
          btn.style.borderRadius = "0";
          btn.style.cursor = "pointer";
          btn.style.padding = "0";
          btn.style.margin = "0";
          btn.title = c;
          btn.addEventListener("click", () => {
            bgColor = c;
            bgInput.value = c;
            preview.style.background = c;
          });
          bgRow.appendChild(btn);
        });

        // 剪贴板自动填充逻辑：循环收集颜色，收集到两个后自动填充，继续等待下一组
        function isColor(str) {
          return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(str.trim()) ||
            /^rgb\s*\(/i.test(str.trim()) ||
            /^rgba\s*\(/i.test(str.trim());
        }
        let colorQueue = [];
        let clipboardInterval;

        function showTooltip(message) {
          const tooltip = document.createElement('div');
          tooltip.innerText = message;
          tooltip.style.position = 'fixed';
          tooltip.style.left = '50%';
          tooltip.style.top = '12%';
          tooltip.style.transform = 'translate(-50%, 0)';
          tooltip.style.background = '#333';
          tooltip.style.color = '#fff';
          tooltip.style.padding = '8px 18px';
          tooltip.style.borderRadius = '8px';
          tooltip.style.fontSize = '15px';
          tooltip.style.zIndex = '99999';
          tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
          document.body.appendChild(tooltip);
          setTimeout(() => {
            tooltip.remove();
          }, 1800);
        }
        function startClipboardMonitor() {
          if (clipboardInterval) return;
          clipboardInterval = setInterval(async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (isColor(text) && !colorQueue.includes(text)) {
                colorQueue.push(text);
                await navigator.clipboard.writeText(""); // 清空剪贴板
                if (colorQueue.length === 2) {
                  textInput.value = colorQueue[0];
                  textColor = colorQueue[0];
                  preview.style.color = colorQueue[0];
                  bgInput.value = colorQueue[1];
                  bgColor = colorQueue[1];
                  preview.style.background = colorQueue[1];
                  showTooltip('新颜色已填充');
                  colorQueue = [];
                }
              }
            } catch (error) {}
          }, 500);
        }
        function stopClipboardMonitor() {
          if (clipboardInterval) {
            clearInterval(clipboardInterval);
            clipboardInterval = null;
          }
        }
        // 进入弹窗即开始监听，关闭弹窗停止
        startClipboardMonitor();
        this.onClose = stopClipboardMonitor;

        // 确认按钮
        const okBtn = document.createElement("button");
        okBtn.innerText = "添加";
        okBtn.style.padding = "6px 18px";
        okBtn.style.fontWeight = "bold";
        okBtn.style.borderRadius = "6px";
        okBtn.style.border = "1px solid #888";
        okBtn.style.background = "#4caf50";
        okBtn.style.color = "#fff";
        okBtn.style.cursor = "pointer";
        okBtn.addEventListener("click", () => {
          this.onAdd({ textColor, bgColor });
          this.close();
        });

        // 取消按钮
        const cancelBtn = document.createElement("button");
        cancelBtn.innerText = "取消";
        cancelBtn.style.padding = "6px 18px";
        cancelBtn.style.fontWeight = "bold";
        cancelBtn.style.borderRadius = "6px";
        cancelBtn.style.border = "1px solid #888";
        cancelBtn.style.background = "#eee";
        cancelBtn.style.color = "#333";
        cancelBtn.style.cursor = "pointer";
        cancelBtn.addEventListener("click", () => {
          this.close();
        });

        // 按钮区（右侧并排）
        const btnRow = document.createElement("div");
        btnRow.style.display = "flex";
        btnRow.style.justifyContent = "flex-end";
        btnRow.style.alignItems = "center";
        btnRow.style.gap = "12px";
        btnRow.style.marginTop = "12px";
        btnRow.appendChild(okBtn);
        btnRow.appendChild(cancelBtn);

        // 按顺序渲染所有区域
        contentEl.appendChild(textRowWrap);
        contentEl.appendChild(textRow);
        contentEl.appendChild(bgRowWrap);
        contentEl.appendChild(bgRow);
        contentEl.appendChild(preview);
        contentEl.appendChild(btnRow);
      } else {
        console.warn("contentEl is not available or is not an HTMLElement");
      }
    } catch (error) {
      console.error("打开添加对话框失败:", error);
    }

    // 预设颜色
    const COLORS = [
      "#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#FFFFFF",
      "#FFA500", "#800080", "#008000", "#808000", "#C0C0C0", "#808080", "#FFD700", "#A52A2A"
    ];

    let textColor = COLORS[0];
    let bgColor = COLORS[7];

    // 预览按钮样式优化（提前定义，供输入框和色块区联动）
    const preview = document.createElement("button");
    preview.innerText = "这是一段预览文字";
    preview.style.display = "inline-flex";
    preview.style.alignItems = "center";
    preview.style.justifyContent = "center";
    preview.style.background = bgColor;
    preview.style.color = textColor;
    preview.style.fontWeight = "normal";
    preview.style.fontSize = "14px";
    preview.style.border = "none";
    preview.style.borderRadius = "4px";
    preview.style.cursor = "default";
    preview.style.padding = "0 8px";
    preview.style.margin = "12px auto";
    preview.style.height = "auto";
    preview.style.minHeight = "22px";
    preview.style.width = "auto";
    preview.style.minWidth = "32px";

    // 文字色选择 + 输入框（同一行），色块另起一行
    const textRowWrap = document.createElement("div");
    textRowWrap.style.display = "flex";
    textRowWrap.style.alignItems = "center";
    textRowWrap.style.marginBottom = "6px";
    const textLabel = document.createElement("span");
    textLabel.innerText = "文字颜色: ";
    textLabel.style.marginRight = "6px";
    textRowWrap.appendChild(textLabel);
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = textColor;
    textInput.style.width = "80px";
    textInput.style.marginRight = "8px";
    textInput.style.border = "1px solid #ccc";
    textInput.style.borderRadius = "4px";
    textInput.style.height = "22px";
    textInput.style.fontSize = "13px";
    textInput.addEventListener("input", () => {
      textColor = textInput.value;
      preview.style.color = textColor;
    });
    textRowWrap.appendChild(textInput);
    setTimeout(() => { textInput.focus(); }, 0);

    // 文字色块区
    const textRow = document.createElement("div");
    textRow.style.display = "flex";
    textRow.style.marginBottom = "10px";
    COLORS.forEach(c => {
      const btn = document.createElement("button");
      btn.innerText = "示例";
      btn.style.background = "transparent";
      btn.style.color = c;
      btn.style.width = "24px";
      btn.style.height = "24px";
      btn.style.fontSize = "16px";
      btn.style.fontWeight = "bold";
      btn.style.border = "none";
      btn.style.borderRadius = "0";
      btn.style.cursor = "pointer";
      btn.style.padding = "0";
      btn.style.margin = "0";
      btn.title = c;
      btn.addEventListener("click", () => {
        textColor = c;
        textInput.value = c;
        preview.style.color = c;
      });
      textRow.appendChild(btn);
    });

    // 背景色选择 + 输入框（同一行），色块另起一行
    const bgRowWrap = document.createElement("div");
    bgRowWrap.style.display = "flex";
    bgRowWrap.style.alignItems = "center";
    bgRowWrap.style.marginBottom = "6px";
    const bgLabel = document.createElement("span");
    bgLabel.innerText = "背景颜色: ";
    bgLabel.style.marginRight = "6px";
    bgRowWrap.appendChild(bgLabel);
    const bgInput = document.createElement("input");
    bgInput.type = "text";
    bgInput.value = bgColor;
    bgInput.style.width = "80px";
    bgInput.style.marginRight = "8px";
    bgInput.style.border = "1px solid #ccc";
    bgInput.style.borderRadius = "4px";
    bgInput.style.height = "22px";
    bgInput.style.fontSize = "13px";
    bgInput.addEventListener("input", () => {
      bgColor = bgInput.value;
      preview.style.background = bgColor;
    });
    bgRowWrap.appendChild(bgInput);

    // 背景色块区
    const bgRow = document.createElement("div");
    bgRow.style.display = "flex";
    bgRow.style.marginBottom = "10px";
    COLORS.forEach(c => {
      const btn = document.createElement("button");
      btn.style.background = c;
      btn.style.width = "24px";
      btn.style.height = "24px";
      btn.style.border = "none";
      btn.style.borderRadius = "0";
      btn.style.cursor = "pointer";
      btn.style.padding = "0";
      btn.style.margin = "0";
      btn.title = c;
      btn.addEventListener("click", () => {
        bgColor = c;
        bgInput.value = c;
        preview.style.background = c;
      });
      bgRow.appendChild(btn);
    });

    // 剪贴板自动填充逻辑：循环收集颜色，收集到两个后自动填充，继续等待下一组
    function isColor(str) {
      return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(str.trim()) ||
        /^rgb\s*\(/i.test(str.trim()) ||
        /^rgba\s*\(/i.test(str.trim());
    }
    let colorQueue = [];
    let clipboardInterval;

    function showTooltip(message) {
      const tooltip = document.createElement('div');
      tooltip.innerText = message;
      tooltip.style.position = 'fixed';
      tooltip.style.left = '50%';
      tooltip.style.top = '12%';
      tooltip.style.transform = 'translate(-50%, 0)';
      tooltip.style.background = '#333';
      tooltip.style.color = '#fff';
      tooltip.style.padding = '8px 18px';
      tooltip.style.borderRadius = '8px';
      tooltip.style.fontSize = '15px';
      tooltip.style.zIndex = '99999';
      tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.18)';
      document.body.appendChild(tooltip);
      setTimeout(() => {
        tooltip.remove();
      }, 1800);
    }
    function startClipboardMonitor() {
      if (clipboardInterval) return;
      clipboardInterval = setInterval(async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (isColor(text) && !colorQueue.includes(text)) {
            colorQueue.push(text);
            await navigator.clipboard.writeText(""); // 清空剪贴板
            if (colorQueue.length === 2) {
              textInput.value = colorQueue[0];
              textColor = colorQueue[0];
              preview.style.color = colorQueue[0];
              bgInput.value = colorQueue[1];
              bgColor = colorQueue[1];
              preview.style.background = colorQueue[1];
              showTooltip('新颜色已填充');
              colorQueue = [];
            }
          }
        } catch (error) {}
      }, 500);
    }
    function stopClipboardMonitor() {
      if (clipboardInterval) {
        clearInterval(clipboardInterval);
        clipboardInterval = null;
      }
    }
    // 进入弹窗即开始监听，关闭弹窗停止
    startClipboardMonitor();
    this.onClose = stopClipboardMonitor;

    // 确认按钮
    const okBtn = document.createElement("button");
    okBtn.innerText = "添加";
    okBtn.style.padding = "6px 18px";
    okBtn.style.fontWeight = "bold";
    okBtn.style.borderRadius = "6px";
    okBtn.style.border = "1px solid #888";
    okBtn.style.background = "#4caf50";
    okBtn.style.color = "#fff";
    okBtn.style.cursor = "pointer";
    okBtn.addEventListener("click", () => {
      this.onAdd({ textColor, bgColor });
      this.close();
    });

    // 取消按钮
    const cancelBtn = document.createElement("button");
    cancelBtn.innerText = "取消";
    cancelBtn.style.padding = "6px 18px";
    cancelBtn.style.fontWeight = "bold";
    cancelBtn.style.borderRadius = "6px";
    cancelBtn.style.border = "1px solid #888";
    cancelBtn.style.background = "#eee";
    cancelBtn.style.color = "#333";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.addEventListener("click", () => {
      this.close();
    });

    // 按钮区（右侧并排）
    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.alignItems = "center";
    btnRow.style.gap = "12px";
    btnRow.style.marginTop = "12px";
    btnRow.appendChild(okBtn);
    btnRow.appendChild(cancelBtn);

    // 按顺序渲染所有区域
    contentEl.appendChild(textRowWrap);
    contentEl.appendChild(textRow);
    contentEl.appendChild(bgRowWrap);
    contentEl.appendChild(bgRow);
    contentEl.appendChild(preview);
    contentEl.appendChild(btnRow);
  }
}
