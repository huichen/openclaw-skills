---
name: ticnote-transcript
description: 从 TicNote 分享链接中提取字幕，通过 API 获取 JSON 数据，整理后创建飞书文档，并生成金句海报
---

# TicNote 字幕提取与整理 Skill

## 功能说明

从 TicNote 分享链接中提取录音转写的字幕，通过 API 获取 JSON 数据，整理后：
1. 创建飞书云文档（完整会议记录 + 金句精选）
2. 生成金句海报图片（移动端优化）

## 文件结构

```
ticnote-transcript/
├── SKILL.md              # 本文档
├── template.html         # 海报 HTML 模板
└── generate-poster.js    # 海报截图生成脚本
```

## API 接口

```
GET https://voice-api.ticnote.cn/api/share/show/detail/{分享码}
```

### 参数说明
- **分享码**：从分享链接中提取
  - 链接格式：`https://ticnote.cn/zh/shareDetail/{shareCode}`
  - 分享码：从 URL 最后一段路径提取

### 返回数据结构
```json
{
  "code": 200,
  "data": {
    "title": "会议标题",
    "segments": [
      {
        "index": 0,
        "start": 1.56,
        "end": 1.81,
        "speaker": "SPEAKER_00",
        "text": "嗯。",
        "detected_lang_code": "zh"
      }
    ]
  }
}
```

## 完整处理流程

### 1. 提取分享码
```javascript
const shareCode = url.match(/shareDetail\/([a-zA-Z0-9]+)/)[1];
```

### 2. 调用 API 获取数据
```javascript
const apiUrl = `https://voice-api.ticnote.cn/api/share/show/detail/${shareCode}`;
const response = await fetch(apiUrl);
const data = await response.json();
```

### 3. 整理字幕内容

#### 过滤规则
- **删除未识别说话人**：过滤掉 `speaker` 为 `SPEAKER_00`、`SPEAKER_01` 等的内容
- **删除语气词**：过滤掉纯语气词的内容（嗯、啊、哦、呃等）
- **修复识别错误**：
  - "富盛" → "傅盛"
  - "飞猪" → "飞书"
  - "小龙虾" → "OpenAgent"（根据上下文）
  - "3 万" → "三万"
  - "没将" → "秘塔"
  - "open 扣" → "OpenAgent"

#### 时间格式化
```javascript
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
```

### 4. 创建飞书文档

```javascript
await feishu_create_doc({
  title: `会议记录 - ${data.data.title}`,
  markdown: generateMarkdown(segments)
});
```

### 5. 提取金句

**必须从 API 返回的原始 segments 数据中提取**，不能手动指定！

提取逻辑：
1. 过滤掉 SPEAKER_00 等未识别说话人
2. 过滤掉纯语气词（嗯、啊、哦等）
3. 按说话人分组
4. 选择有深度、有洞察力的观点：
   - 长度适中（20-100 字）
   - 包含关键词：本质、价值、未来、老板、特长、审美、想法、提问、永远、一定、必须等
   - 完整观点，不是过渡性语句
5. 每人不超过 3 条
6. **必须核对原始对话，确保归属正确**

### 6. 生成金句海报

#### 6.1 准备海报数据
```javascript
const posterData = {
  title: "金句精选",
  subtitle: data.data.title,
  speakers: [
    {
      name: "tim",
      title: "影视飓风创始人",
      class: "tim",
      quotes: [
        "人类员工的本质只是我认为未来不会存在明显的上下级关系。",
        "AI 它不是一个浪潮，它是一个[[海啸]]。"  // [[ ]] 表示高亮
      ]
    }
  ]
};
```

#### 6.2 生成 HTML
```javascript
const fs = require('fs');
const path = require('path');
const { generatePoster } = require('./generate-poster.js');

// 读取模板（使用相对路径）
const templatePath = path.join(__dirname, 'template.html');
const template = fs.readFileSync(templatePath, 'utf-8');

// 生成内容 HTML
function generateHTML(data) {
  let content = '';
  for (const speaker of data.speakers) {
    const avatarClass = `speaker-${speaker.class || 'default'}`;
    const initial = speaker.name.charAt(0);
    content += `<div class="speaker-section">
      <div class="speaker-header">
        <div class="speaker-avatar ${avatarClass}">${initial}</div>
        <div class="speaker-info">
          <div class="speaker-name">${speaker.name}</div>
          <div class="speaker-title">${speaker.title}</div>
        </div>
      </div>
      <div class="quote-list">`;
    
    for (const quote of speaker.quotes) {
      const cardClass = `quote-card-${speaker.class || 'default'}`;
      // [[关键词]] 替换为高亮 HTML
      const highlightedQuote = quote.replace(/\[\[(.*?)\]\]/g, '<span class="highlight">$1</span>');
      content += `<div class="quote-card ${cardClass}">
        <p class="quote-text">${highlightedQuote}</p>
      </div>`;
    }
    
    content += `</div></div>`;
  }
  return content;
}

// 填充模板
const html = template
  .replace('{{TITLE}}', posterData.title)
  .replace('{{SUBTITLE}}', posterData.subtitle)
  .replace('{{CONTENT}}', generateHTML(posterData));

// 保存 HTML 到临时目录
const htmlPath = path.join('/tmp', 'ticnote-poster.html');
fs.writeFileSync(htmlPath, html);
```

#### 6.3 生成图片
```javascript
const outputPath = path.join('/tmp', 'ticnote-poster.png');
await generatePoster(
  htmlPath,      // 输入 HTML
  outputPath,    // 输出图片
  600,           // 视口宽度
  3              // 渲染倍率（3=超高清）
);
```

#### 6.4 发送图片
```javascript
await message({
  action: 'send',
  media: outputPath
});
```

## 输出格式

### 飞书文档 Markdown 格式

```markdown
# {会议标题}

**来源：** {TicNote 链接}
**整理时间：** {当前时间}
**说话人：** {说话人列表}
**总时长：** {时长}

---

## 对话内容

### 00:00 - 05:00

**tim** [00:19]
我来展示一个刚刚我们就在又在说话间...

**卡兹克** [01:50]
我我记得之前您提过...

---

## 🎯 金句精选

### tim
> "人类员工的本质只是我认为未来不会存在明显的上下级关系。"

### 傅盛
> "悲观者永远正确，乐观者永远前行。"

### 刀哥
> "出来混最重要是出来，你不能先开始用起来，我觉得这是最重要的。"

---

## 🔥 观点交锋

### AI 是否是传销？
- **卡兹克**提问：小龙虾到底是不是传销？
- **傅盛**回应：如果小龙虾真的是传销，我就成传销头子了
- **tim**观点：是一种新技术的探索

---

*整理自 TicNote API*
```

### 海报图片

- **尺寸**：600px × 自适应高度
- **渲染**：3x 超高清（实际输出 1800px 宽）
- **格式**：PNG
- **内容**：标题 + 说话人 + 金句（带高亮）

## 完整示例代码

```javascript
const fs = require('fs');
const path = require('path');
const { generatePoster } = require('./generate-poster.js');

// 1. 提取分享码
const shareCode = url.match(/shareDetail\/([a-zA-Z0-9]+)/)[1];

// 2. 调用 API
const apiUrl = `https://voice-api.ticnote.cn/api/share/show/detail/${shareCode}`;
const response = await fetch(apiUrl);
const data = await response.json();

// 3. 整理内容
const segments = data.data.segments
  .filter(seg => !seg.speaker.startsWith('SPEAKER_'))
  .filter(seg => !/^[嗯啊哦呃哎哟\s.！？]+$/.test(seg.text))
  .map(seg => ({
    ...seg,
    text: fixErrors(seg.text),
    time: formatTime(seg.start)
  }));

// 4. 创建文档
const doc = await feishu_create_doc({
  title: `会议记录 - ${data.data.title}`,
  markdown: generateMarkdown(segments)
});

// 5. 提取金句
const quotes = extractQuotes(segments);

// 6. 生成海报
const posterData = {
  title: "金句精选",
  subtitle: data.data.title,
  speakers: quotes.map(q => ({
    name: q.speaker,
    title: q.title || '',
    class: getClassForSpeaker(q.speaker),
    quotes: q.quotes.map(quote => highlightKeywords(quote))
  }))
};

// 读取模板并填充（使用相对路径）
const templatePath = path.join(__dirname, 'template.html');
const template = fs.readFileSync(templatePath, 'utf-8');

const html = template
  .replace('{{TITLE}}', posterData.title)
  .replace('{{SUBTITLE}}', posterData.subtitle)
  .replace('{{CONTENT}}', generateHTML(posterData));

// 保存到临时目录
const htmlPath = path.join('/tmp', 'ticnote-poster.html');
fs.writeFileSync(htmlPath, html);

// 生成图片
const outputPath = path.join('/tmp', 'ticnote-poster.png');
await generatePoster(htmlPath, outputPath, 600, 3);

// 发送给用户
await message({
  action: 'send',
  media: outputPath
});
```

## 说话人样式类名

| 类名 | 头像颜色 | 边框颜色 | 适用场景 |
|------|---------|---------|---------|
| `tim` | 粉红渐变 | 粉红 | 影视飓风/创作者 |
| `fs` | 蓝色渐变 | 蓝色 | 傅盛/技术专家 |
| `dg` | 绿色渐变 | 绿色 | 刀哥/创业者 |
| `kzk` | 橙黄渐变 | 橙色 | 卡兹克/主持人 |
| `default` | 紫色渐变 | 紫色 | 其他默认 |

## 高亮语法

在文本中使用 `[[关键词]]` 语法，会自动渲染为高亮背景：

```
"这是一个[[重要]]的观点"
```

渲染为：
```html
<span class="highlight">重要</span>
```

## 优化建议

### 路径处理
- ✅ 使用 `path.join(__dirname, ...)` 处理相对路径
- ✅ 临时文件使用 `/tmp` 目录（跨平台兼容）
- ✅ 避免硬编码绝对路径

### 性能优化
- 海报生成使用 3x 渲染，如需更快可降低为 2x
- 长文本金句建议截断到 100 字以内
- 说话人超过 5 人时建议分批生成海报

### 错误处理
```javascript
try {
  const data = await fetch(apiUrl).then(r => r.json());
  if (data.code !== 200) {
    throw new Error(`API 错误：${data.message}`);
  }
} catch (error) {
  console.error('处理失败:', error);
  // 降级处理：只生成文档，不生成海报
}
```

## 注意事项

1. **API 调用频率**：避免短时间内多次调用
2. **文档权限**：创建的文档默认对当前用户可见
3. **隐私保护**：敏感内容需要脱敏处理
4. **海报生成**：
   - 确保已安装 Playwright 和 Chromium
   - 使用 `path.join()` 处理路径
   - 高清渲染（scale=3）会占用更多内存
5. **金句提取**：必须从原始 API 数据提取，不能手动编造
