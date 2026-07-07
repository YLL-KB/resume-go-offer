# AI 简历系统：内容获取与保存转化思路

> 个人学习笔记 — 梳理一个 AI 简历编辑器的核心链路设计。

---

## 一、整体架构概览

```
┌──────────────────────────────────────────────────────────────┐
│                        前端 (Next.js)                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ 模板页面 │  │ 分析页面 │  │ 编辑页面 │  │ 富文本编辑器 │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
│       │              │              │               │         │
│       └──────────────┼──────────────┼───────────────┘         │
│                      │              │                          │
│               ┌──────┴──────┐ ┌────┴────┐                     │
│               │ editor-store│ │ AI API  │                     │
│               │  (Zustand)  │ │ Routes  │                     │
│               └─────────────┘ └────┬────┘                     │
└────────────────────────────────────┼──────────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                 │
              ┌─────┴─────┐  ┌──────┴──────┐  ┌──────┴──────┐
              │  OpenAI   │  │  DeepSeek   │  │  通义千问   │
              └───────────┘  └─────────────┘  └─────────────┘
```

核心设计理念：**前端只做 UI 和状态管理，所有 AI 调用走后端 API Route，不暴露 API Key。**

---

## 二、AI 获取内容的完整链路

### 2.1 输入来源 → 结构化内容

系统支持两种内容入口：

```
入口 A：用户上传 PDF 简历 → AI 解析为结构化表单
入口 B：用户选择模板 PDF → 提取 Markdown → AI 分析模块结构
```

#### 链路 A：简历上传 → AI 解析 → 结构化表单

```
用户上传 PDF
    │
    ▼
POST /api/ai/upload-resume
    │  FormData { file }
    │  → 保存到 public/uploads/analysis/{uuid}.pdf
    │  → 每 30 分钟自动清理过期文件
    │  → 返回 { id, url }
    │
    ▼
GET /api/templates/[id]/extract-markdown?source=analysis
    │  ┌─ Layer 1: MinerU Extract（高精度，需 token）
    │  │   失败 → 降级
    │  ├─ Layer 2: MinerU Flash（免费，精度较低）
    │  │   失败 → 降级
    │  └─ Layer 3: 兜底警告（无法解析）
    │
    │  可选：?layout=true → GLM-OCR 视觉布局分析
    │  → 返回 { markdown, contentList, source, layoutElements }
    │
    ▼
POST /api/ai/parse-resume
    │  Body: { content: markdown文本 }
    │  → AI 将纯文本简历拆成结构化 sections
    │  → 返回 { sections: [{ title, type, fields/items/content }] }
    │
    ▼
前端渲染为可编辑表单（RichTextEditor）
```

#### 链路 B：模板选择 → AI 分析 → 模块结构

```
用户上传模板 PDF
    │
    ▼
POST /api/templates/[id]/summary
    │  pdfjs-dist 逐页提取文本
    │  → AI 提取标题 + 摘要
    │  → 返回 { title, summary }
    │
    ▼
POST /api/templates/[id]/analyze
    │  PDF raw text → AI 识别模块结构
    │  → 返回 {
    │      layout: "single-column",
    │      sections: [{ id, label, order, type, description }],
    │      style_hints: { has_photo_area, section_separator }
    │    }
    │  → 结果缓存到 {id}.meta.json 避免重复调用
    │
    ▼
前端展示模板预览 + 模块列表，用户选择后进入编辑器
```

### 2.2 AI 调用的统一封装

所有 AI 调用通过 `src/lib/ai/index.ts` 统一管理：

```typescript
// 核心设计：基于 OpenAI 兼容 SDK，一行配置切换模型
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,  // 切换服务商只改这里
});

const DEFAULT_MODEL = process.env.AI_MODEL ?? "gpt-4o-mini";
```

**多模型切换策略：**
| 服务商 | baseURL | 适用场景 |
|--------|---------|----------|
| OpenAI | `https://api.openai.com/v1` | 通用，最稳定 |
| DeepSeek | `https://api.deepseek.com/v1` | 性价比高，中文好 |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 国内部署，中文最强 |

### 2.3 AI 能力的原子化拆分

每个 AI 能力拆成独立方法，单一职责：

```
ai.improveText()         → 润色单条经历描述（支持流式）
ai.generateSummary()     → 生成个人总结段落
ai.analyzeResume()       → 全面分析简历（评分+优缺点+建议）
ai.improveResumeSection() → 针对性优化简历某个板块
ai.parseResume()         → 将文本简历拆为结构化表单字段
ai.analyzeTemplate()     → 分析模板 PDF 的模块结构
ai.summarizeTemplate()   → 从 PDF 提取标题和摘要
```

每个方法都包含：
- **System Prompt** — 角色设定 + 严格格式约束
- **User Message** — 清洗后的用户数据
- **Temperature 控制** — 创造性任务 (0.6-0.7) vs 精确任务 (0.1-0.3)
- **max_tokens** — 防止过长输出浪费

---

## 三、AI 返回值的健壮处理

### 3.1 safeJsonParse — 多层降级解析

AI 返回 JSON 时经常出现格式瑕疵，`safeJsonParse` 设计了 **6 层降级策略**：

```
Layer 1: 去掉 markdown 代码块（```json ... ```）
    ↓ 失败
Layer 2: 直接 JSON.parse()
    ↓ 失败
Layer 3: 正则提取 JSON 对象/数组 → 修复 trailing commas、注释、中文引号
    ↓ 失败
Layer 4: 手动括号匹配（逐个字符扫描深度）
    ↓ 失败
Layer 5: 逐字段正则提取（最后的兜底，针对 analyzeResume 结构）
    ↓ 失败
Layer 6: 返回 null，调用方自行兜底
```

**关键教训：** 永远不要信任 AI 返回的 JSON 格式。即使用严格的 system prompt，模型仍然可能：
- 包裹 markdown 代码块
- 在对象末尾加 trailing comma
- 使用中文引号
- JSON 中间插入注释

### 3.2 每个调用方的兜底策略

```typescript
// analyzeResume 的兜底
if (!parsed) {
  return {
    overview: "分析结果解析失败，请重试",  // 友好错误提示
    strengths: [], weaknesses: [], suggestions: [],
    score: 0,
  };
}

// parseResume 的兜底：把整段文本当作一个纯文本 section
if (!parsed?.sections) {
  return {
    sections: [{ title: "简历内容", type: "textarea", content }],
  };
}

// analyzeTemplate 的兜底：返回默认四模块结构
if (!parsed) {
  return {
    layout: "single-column",
    sections: [
      { id: "basic", label: "个人信息", ... },
      { id: "experience", label: "工作经历", ... },
      { id: "education", label: "教育背景", ... },
      { id: "skills", label: "技能", ... },
    ],
  };
}
```

---

## 四、前端状态管理 — Zustand Editor Store

### 4.1 状态模块划分

```
editor-store (Zustand + persist)
│
├── 模板层
│   ├── templateId, pdfUrl           — 当前模板标识
│   ├── templateImages, editedImages — 图片管理
│   └── deletedImages                 — 软删除图片
│
├── 内容层 (Markdown)
│   ├── markdown, markdownSource     — 原始提取结果
│   ├── mdModules[]                  — 按 ## 拆分的模块
│   ├── editedModules, deletedModules — 模块编辑/删除
│   ├── moduleContents               — 模块级 HTML 内容
│   └── activeModuleId               — 当前选中模块
│
├── 表单层
│   └── resumeData                    — 结构化简历数据（Zod schema）
│
├── 自定义页
│   └── customPages[]                 — 用户追加的额外页面
│
└── AI 分析
    ├── aiAnalysis                    — 最新分析结果（持久化到 sessionStorage）
    └── parsedSections                — AI 拆好的简历模块
```

### 4.2 持久化策略

```typescript
persist(
  (set) => ({ ... }),
  {
    name: "resume-editor-storage",
    storage: createJSONStorage(() => sessionStorage),  // 会话级，关标签页即清
    partialize: (state) => ({ aiAnalysis: state.aiAnalysis }), // 只持久化分析结果
  }
);
```

**设计考量：**
- 用 `sessionStorage` 而非 `localStorage` → 关浏览器自动清理，不留脏数据
- 只持久化 `aiAnalysis`（分析结果需要跨页面携带）
- 编辑状态不持久化（刷新 = 重新开始，避免旧数据干扰）

### 4.3 软删除模式

图片和模块的删除不直接从数组移除，而是标记到 `deletedImages` / `deletedModules` 集合中：

```typescript
// 切换软删除状态
toggleImageDeleted: (id) =>
  set((s) => {
    const next = new Set(s.deletedImages);
    if (next.has(id)) next.delete(id); else next.add(id);
    return { deletedImages: next };
  }),
```

**好处：** 支持撤销、预览对比、批量导出时按需过滤。

---

## 五、PDF 保存时的转化思路

### 5.1 核心挑战

保存时面临的核心问题：**用户在富文本编辑器里改的是 Markdown/HTML，但最终要输出到 PDF 模板的固定位置。**

### 5.2 三层填充策略

```
POST /api/templates/[id]/fill

Body: {
  strayEdits:    EditItem[],    // Part A: 原位文字替换
  moduleEdits:   ModuleEdit[],  // Part B: 编辑模块追加
  customPages:   CustomPage[],  // Part C: 自定义页
}
```

#### Part A — 原位文字块替换（保留原布局）

```
原始 PDF 页
┌─────────────────────────┐
│  张三                    │  ← Block: (x=50,y=800,w=100,h=20)
│  前端工程师              │  ← Block: (x=50,y=775,w=120,h=18)
│  ─────────────────────  │
│  工作经历               │
│  负责前端开发工作        │  ← 用户改为"主导前端架构设计"
└─────────────────────────┘

执行步骤：
1. 用白色矩形覆盖原文字区域（涂白）
2. 在相同坐标用 CJK 字体绘制新文字
3. 保留原 PDF 的字体大小、颜色
```

关键技术点：
- 使用 `pdf-lib` + `fontkit` 嵌入中文字体
- `color` 取所有 block 的众数（mostCommon）作为主色调
- `fontSize` 取所有 size 的中位数（median）分离 title/body

#### Part B — 编辑模块末尾追加

```
用户编辑某个模块后，新增内容追加到该模块下方：

原始模块最后一个 block 底部 → 向下留 12px 间距 → 逐行渲染新内容

如果当前页放不下 → 自动换到下一页顶部
```

HTML → 文本行转换逻辑（`parseHtmlToLines`）：
```
<h1>标题</h1>  →  fontSize: titleSize+6, bold: true, spaceBefore: 14
<h2>副标题</h2> →  fontSize: titleSize+4, bold: true, spaceBefore: 10
<p>段落</p>    →  fontSize: bodySize, 正常段落间距
<li>列表项</li> →  fontSize: bodySize, indent: 18, 前缀 "• "
```

#### Part C — 自定义页

```
用户添加空白页 → 复制模板第一页作为底版
→ 涂白所有原文字块
→ 在干净底版上从头渲染用户 Markdown
```

### 5.3 风格继承

所有三部分的文字绘制都继承原模板的风格：

```typescript
// 从所有文字块中提取主导风格
const dominantColor = mostCommon(allColors) || "#333333";
const titleSize = median(allSizes.filter(s => s >= 16)) || 18;
const bodySize = median(allSizes.filter(s => s < 16)) || 11;
```

这样新增内容与原模板在视觉上保持一致，不会出现"粘贴感"。

---

## 六、PDF 文本提取的双模策略

### 6.1 为什么需要多种提取方式

PDF 分两种：
- **文字型 PDF**（可选中文字）→ pdfjs 直接提取
- **扫描型/图片型 PDF**（文字是像素）→ 需要 OCR

### 6.2 提取管线

```
MinerU Extract（高精度 OCR，需要 token）
    │
    ├── 成功 → markdown + contentList（含 bbox 坐标）
    │
    └── 失败 → MinerU Flash（免费模式，精度较低）
              │
              └── 失败 → 兜底警告
```

### 6.3 GLM-OCR 布局增强

当传 `?layout=true` 时，额外调用智谱 GLM-4V 做视觉布局分析：

```
PDF 页面 → 转 base64 → GLM-4V（多模态大模型）
→ 返回每个元素的 { type, x, y, w, h, content }
→ 与 MinerU 的 bbox 合并，得到更精确的坐标
```

这样既能得到 MinerU 的文字识别质量，又能得到 GLM-4V 的布局理解能力。

---

## 七、流式 vs 非流式响应

### 7.1 适用场景

| 响应方式 | 适用场景 | 用户体验 |
|----------|----------|----------|
| 非流式 | 结构化输出（分析报告、JSON 解析） | 等待后一次性展示 |
| 流式 | 文本生成（润色文案、生成总结） | 逐字输出，类似 ChatGPT |

### 7.2 实现方式

```
API Route:
  ?stream=true → 返回 ReadableStream<Uint8Array>
  ?stream=false 或不传 → 返回 JSON

streamToResponse():
  将 OpenAI SDK 的 AsyncIterable<ChatCompletionChunk>
  转为 Web ReadableStream
  每个 chunk 提取 delta.content → 编码为 Uint8Array → 写入流
```

---

## 八、关键设计原则总结

1. **AI 调用全走后端** — 前端不拿 API Key，安全性由服务端保证
2. **Parser 多级降级** — `safeJsonParse` 6 层兜底，AI 返回格式再乱也能解析
3. **每个 AI 方法独立兜底** — 解析失败不崩溃，返回合理默认值
4. **PDF 提取多源降级** — MinerU → MinerU Flash → 兜底，尽量不给用户报错
5. **PDF 保存分层处理** — 原位替换 + 模块追加 + 自定义页，三层覆盖所有场景
6. **持久化最小化** — sessionStorage 只存必要的 AI 分析结果，关标签页自动清理
7. **软删除代替硬删除** — 图片/模块标记删除，支持撤销和预览对比
8. **风格自动继承** — 众数取色、中位数分字号，新增内容与模板浑然一体
9. **单一路由支持双模响应** — 同一个 API 端点，`?stream=true` 切流式，不额外维护两套代码
10. **临时文件自动清理** — 上传分析文件 30 分钟过期，避免存储膨胀
