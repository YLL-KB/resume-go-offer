# 在线编辑器设计文档

## 核心思路

简历编辑的本质矛盾：**PDF 是固定布局的打印格式，但用户需要灵活编辑内容**。

市面上大多数简历工具的方案是"填表单 → 套模版渲染"，优点是简单，缺点是用户无法微调最终 PDF 的排版细节。本项目的思路是反过来：**把 PDF 模版当作画布，直接在 PDF 上修改文字**。

```
传统方案:  表单数据 → 模版引擎 → 生成 PDF  (灵活但不可控)
本项目:    解析 PDF → 逐块编辑 → 原位替换   (所见即所得)
```

---

## 编辑模型（当前形态）

编辑器入口在 `src/app/resume/new/ResumeNewContent.tsx`。左侧用 `react-pdf` 渲染原 PDF 预览，右侧是「文字块编辑」列表：PDF 里的每一个文字块对应一个 `<textarea>`，直接改文字内容；每个块还能标记「删除」（导出时涂白不写字，即"抹掉"）。

这是**逐块原位编辑**——保留模版的设计感（字体、颜色、位置、对齐），只改文字内容，不改坐标。

### 文字块数据模型

基础字段 `TextBlock` 定义于 `src/components/preview/ClickablePdfView.tsx`，`RichTextBlock` 在 `src/lib/pdf/text-extractor.ts` 上扩展字号/字体/颜色：

```typescript
// src/components/preview/ClickablePdfView.tsx
interface TextBlock {
  x: number; y: number; width: number; height: number;
  text: string; page: number; globalIndex: number; pageHeight: number;
}

// src/lib/pdf/text-extractor.ts
interface RichTextBlock extends TextBlock {
  fontSize: number;  // 字号
  fontName: string;  // 字体名
  color: string;     // 颜色 (hex)
  cssFontFamily: string; // 映射到 CSS 字体族
  items: RichTextItem[]; // 该行内每个字符项
}
```

> 为什么用 textarea 而不是富文本：模版页上每个文字块是独立排版的（不同字号、字体、颜色），拆开编辑反而更精确。富文本编辑器适合连续排版，不适合这种"分散文字块"场景。

### 已移除的部分（不要误以为还在用）

- **自定义页（Layer 2）**：数据模型 `CustomPage` 与 `fill` API 的 Part C 渲染逻辑仍保留，但前端已无编辑入口（`editor-store` 里的 `addCustomPage` 未被调用，`customPages` 恒为空，Part C 实际不执行）。
- **MinerU 模块编辑 / 图片编辑**：`editor-store.ts` 里仍残留 `mdModules`、`editedModules`、`templateImages`、`editedImages` 等字段和 action，但 `ResumeNewContent.tsx` 已完全不用（它用组件本地 `useState` 管理 `blocks`/`edits`/`deletedBlocks`）。这些是遗留死代码。

---

## 文字提取原理

`src/lib/pdf/text-extractor.ts` 用 **pdfjs-dist** 在浏览器端解析 PDF（不依赖服务端，离线可用、即时）：

```
PDF 文本对象 (TextItem)
  │  transform: [a, b, c, d, e, f]
  │  fontSize = |transform[3]|  (scaleY)
  │  x = transform[4]           (translateX)
  │  y = transform[5]           (translateY, PDF bottom-left origin)
  │  height = 字符高度
  ▼
按行合并：同 y 坐标 + 同字体脚本 + 同字体名 = 一行
  │  groupKey = `${yKey}|${fontScript}|${fontName}`
  │  （同行不同字体如「个人简历」黑体 +「Personal resume」Times 不会合并）
  ▼
RichTextBlock { x=行最左, y=行基线, width=行宽+16, height=行高+6, ... }
```

输出 `RichTextBlock[]`，按 PDF y 降序（物理从上到下）、同 y 按 x 升序（从左到右）排序。

---

## 坐标系统

这是整个编辑管线里最容易出错的地方，需要特别说明。

### PDF 坐标 vs 屏幕坐标

```
屏幕坐标 (浏览器)              PDF 坐标 (pdf-lib)
(0,0) ────────► x              (0,842) ────────► x
│                               │
│  文字从上方开始                 │  文字从底部开始
│                               │
▼ y                             ▼ y
                             (0,0)
```

### 各层使用的坐标

| 环节 | 坐标系 | 说明 |
|---|---|---|
| `text-extractor.ts` 提取 | PDF 原生 (bottom-left) | `transform[5]` 直接取自 PDF transform |
| `ResumeNewContent.tsx` 编辑 | 不涉及坐标 | 只编辑文字，不改坐标 |
| `fill/route.ts` 接收 edits | PDF 原生 (bottom-left) | **注意：不需要二次翻转** |

**常见 Bug**：早期版本在 fill API 中做了 `pdfY = pageHeight - e.y - e.h` 的翻转，但 `text-extractor.ts` 传过来的 y 已经是 PDF 原生坐标（从底部算），导致文字被画到了页面底部。修复方案是直接使用 `e.y`，不做翻转。

---

## PDF 填充管线

`POST /api/templates/[id]/fill`（`src/app/api/templates/[id]/fill/route.ts`）是核心接口，用 **pdf-lib + @pdf-lib/fontkit** 嵌入 CJK 字体（`public/NotoSansSC-Regular.otf`）后回填。请求体分三部分：

```typescript
{
  strayEdits: EditItem[];    // Part A：逐块原位编辑
  moduleEdits: ModuleEdit[]; // Part B：模块末尾追加（当前前端未发送）
  customPages: CustomPageItem[]; // Part C：自定义页（当前前端无入口）
  source?: string;           // "analysis" 时从 analysis 目录读 PDF，否则 templates
}
```

当前前端只发送 `strayEdits`（+ 空 `customPages`）。

### Part A：文字块原位替换（唯一在用的路径）

`EditItem { page, x, y, w, h, fontSize, text, color }`。

```
对每个 EditItem:
  ┌─────────────────────┐
  │ 画白色矩形覆盖原文     │  x: e.x-4, y: e.y-descender,
  │ (Pass A1, 先画所有)  │  w: e.w+8, h: e.h+descender+8
  └─────────────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 画新文字              │  x: e.x+1, y: e.y (基线)
  │ (Pass A2, 在所有遮罩上) │  size: e.fontSize, font: NotoSansSC
  └─────────────────────┘
```

- **两遍渲染**：如果边遮罩边写字，后面的遮罩可能盖住前面已写的文字，所以先涂白所有、再统一画字。
- **descender 处理**：中文和拉丁字母的下沉部分（g/j/p/q/y 的尾巴）在基线下方。白色矩形向下扩展 `fontSize × 0.3`（至少 6pt）才能完全覆盖。
- **删除块**：前端把 `text` 置空字符串，Part A2 跳过绘制，效果等于"抹掉"。

### 风格继承（titleSize / bodySize / dominantColor）

从提交的 edits 里提取（`fill/route.ts` 的 `median`/`mostCommon`）：

```typescript
dominantColor = mostCommon(allColors)                 || "#333333"
titleSize     = median(allSizes.filter(s => s >= 16)) || 18
bodySize      = median(allSizes.filter(s => s < 16))  || 11
```

### 输出

```
pdfDoc.save() → Buffer → public/filled/{id}.pdf（每次覆盖写入）
  → 返回 URL: /filled/{id}.pdf?t=timestamp（防缓存）
```

---

## HTML → PDF 文本解析

自定义页内容（`CustomPage.markdown`，HTML 片段）在 fill API 中通过 `parseHtmlToLines()`（`fill/route.ts`）转为可绘制的文本行。

```
输入 HTML 片段:
  <h2>项目经验</h2>
  <p>负责XX系统架构设计</p>
  <ul><li>带领5人团队</li></ul>

      ↓ parseHtmlToLines(html, titleSize, bodySize)

先解码实体: &amp;→&, &lt;→<, &nbsp;→空格, &ldquo;→“ ...
      ↓
按块分割: 正则匹配 <h1>~<h6> / <p> / <li> / <ul>|<ol>
      ↓
逐块识别:
  <h1>~<h6> → bold 标题，字号 = titleSize + 偏移（h1=+6, h2=+4, h3=+0 ...）
  <p>      → 正文，字号 = bodySize
  <li>     → "• 内容"，indent=18，字号 = bodySize
      ↓
内联处理: collectInline() 提取 <span style="color:..."> 的颜色，剥离其余标签
      ↓
输出 TextLine[]（text / fontSize / indent / spaceBefore / spaceAfter / bold / color）
```

> 注意：当前 `parseHtmlToLines` 只在 Part B（`moduleEdits`）和 Part C（`customPages`）中调用，而这两条路径前端都未接通，所以它是"后端就绪、前端未用"的代码。

---

## 状态管理

编辑器状态集中在 `src/stores/editor-store.ts`（Zustand）。

**当前实际在用的字段**（`ResumeNewContent.tsx` 订阅）：

```
parsing / saving / saved / resumeId     — 解析、保存状态
customPages                             — 自定义页（当前恒为空）
aiAnalysis                              — AI 分析结果（评分/优点/不足/建议）
```

**组件本地 state**（不在 store，`ResumeNewContent.tsx`）：

```
blocks: RichTextBlock[]        — 提取出的文字块
edits: Record<number,string>   — globalIndex → 编辑后的文字
deletedBlocks: Set<number>     — 标记删除的块
```

**遗留死字段**（store 里定义但无人订阅）：`markdown`、`mdModules`、`activeModuleId`、`editedModules`、`deletedModules`、`moduleContents`、`templateImages`、`editedImages`、`deletedImages` 及对应 action。这些对应已移除的 MinerU 模块编辑和图片编辑功能，清理时可一并删除。

**持久化**：`persist` 中间件只把 `aiAnalysis` 序列化到 sessionStorage（`partialize`），其余为运行时内存态。

---

## 关键设计决策

### 1. 为什么用 pdf-lib 而不是 Canvas 截图？

| 方案 | 优点 | 缺点 |
|---|---|---|
| pdf-lib 原位替换 | 输出真 PDF，文字可选、可搜索、矢量无损 | 需要嵌入 CJK 字体（16MB），坐标计算复杂 |
| Canvas 截图覆盖 | 实现简单，兼容性好 | 输出是图片，文字不可选，放大模糊 |

选择 pdf-lib 是因为简历是正式文档，用户可能需要面试官搜索 PDF 中的关键词。

### 2. 为什么文字提取用 pdfjs-dist 而不是 MinerU？

| 维度 | pdfjs-dist（当前方案） | MinerU |
|------|----------------------|--------|
| 运行位置 | 客户端浏览器 | 服务端 API |
| 外部依赖 | 零 | 需要 MinerU token（或免费 Flash 模式） |
| 提取精度 | 精确到每个字符的坐标、字号、颜色 | 语义理解好，但丢失精确坐标 |
| 编辑方式 | 逐块 textarea，原位替换 | 按模块富文本编辑，重新排版 |
| PDF 回填 | pdf-lib 同位置覆盖，布局完全保留 | 需要重新排版，无法完美还原原布局 |
| 离线可用 | ✅ | ❌ |

核心矛盾：模版的本质是精心设计的固定布局。pdfjs-dist 是"保留布局，只改文字"（尊重模版设计）；MinerU 是"提取语义，重新排版"（抛弃模版设计）。简历场景的核心需求是"用别人设计好的排版填自己的内容"，所以选 pdfjs-dist。

> MinerU 代码仍存在（`src/lib/pdf/mineru-extractor.ts` + `src/app/api/templates/[id]/extract-markdown/route.ts`），但当前编辑器前端直接走 pdfjs-dist，不再调用 MinerU。

### 3. 为什么不支持拖拽移动文字块？

文字块的位置由 PDF 模版决定，原位编辑 + 删除已覆盖核心需求。拖拽移动需要引入 Canvas 交互层，复杂度高且与"尊重模版设计"的理念矛盾。如果用户需要调整布局，应该修改原始模版文件后重新上传。
