# 在线编辑器设计文档

## 核心思路

简历编辑的本质矛盾：**PDF 是固定布局的打印格式，但用户需要灵活编辑内容**。

市面上大多数简历工具的方案是"填表单 → 套模版渲染"，优点是简单，缺点是用户无法微调最终 PDF 的排版细节。本项目的思路是反过来：**把 PDF 模版当作画布，直接在 PDF 上修改文字**。

```
传统方案:  表单数据 → 模版引擎 → 生成 PDF  (灵活但不可控)
本项目:    解析 PDF → 逐块编辑 → 原位替换   (所见即所得)
```

---

## 两层编辑模型

编辑器分为两个层级，对应两种不同的编辑自由度：

### Layer 1：模版页 — 逐块原位编辑

**定位**：保留模版的设计感（字体、颜色、位置、对齐），只改文字内容。

**数据模型**：从 PDF 中提取的 `RichTextBlock[]`，每个 block 包含：

```typescript
interface RichTextBlock {
  globalIndex: number;   // 全局唯一序号
  page: number;          // 所在页
  x: number;             // PDF 原生 x 坐标（从左）
  y: number;             // PDF 原生 y 坐标（从底）
  width: number;         // 文字块宽度
  height: number;        // 文字块高度
  text: string;          // 原文
  fontSize: number;      // 字号
  fontName: string;      // 字体名
  color: string;         // 颜色 (hex)
}
```

**提取原理** (`src/lib/pdf/text-extractor.ts`)：

```
PDF 文本对象 (TextItem)
  │  transform: [a, b, c, d, e, f]
  │  fontSize = |d|  (scaleY)
  │  x = e           (translateX)
  │  y = f           (translateY, PDF bottom-left origin)
  │  height = 字符高度
  │
  ▼
按行合并：同 y 坐标 (±1px) + 同字体 = 一行
  │
  ▼
RichTextBlock { x=行最左, y=行基线, width=行宽+16, height=行高+6, ... }
```

**编辑交互**：
- 每个 block 对应一个 `<textarea>`，编辑替换原文
- 可删除 block（导出时涂白不写字，即"抹掉"）
- 导出时 block 坐标原样传给服务端，pdf-lib 在相同位置覆盖

**为什么用 textarea 而不是富文本**：模版页上的每个文字块是独立排版的（不同字号、不同字体、不同颜色），拆开编辑反而更精确。富文本编辑器适合连续排版，不适合这种"分散文字块"的场景。

### Layer 2：自定义页 — 自由排版编辑

**定位**：当简历内容超过一页时，在保留模版视觉风格的前提下，新增页面自由填写内容。

**数据模型**：

```typescript
interface CustomPage {
  id: string;        // "custom-0", "custom-1" ...
  markdown: string;  // TipTap 输出的 HTML
}
```

**为什么用富文本（TipTap）而不是继续逐块编辑**：
- 自定义页没有预置文字块，无法也无必要逐块放置
- 用户需要连续排版（段落、标题、列表），富文本编辑器天然适合
- 导出时按 A4 排版规则自动计算 y 坐标，从上到下流式渲染

**底版继承**：自定义页不是纯白纸，而是**复制模版第一页 → 涂白所有文字块**，保留模版的边框、线条、图标等装饰元素：

```
模版第一页                         自定义页底版
┌────────────────────┐            ┌────────────────────┐
│ ╔══════════════╗   │            │ ╔══════════════╗   │
│ ║  詹密简历     ║   │  复制+涂白  │ ║              ║   │
│ ║  前端工程师   ║   │  ───────►  │ ║              ║   │
│ ╚══════════════╝   │            │ ╚══════════════╝   │
│ ─────────────────  │            │ ─────────────────  │
│ 工作经历           │            │                    │
│ • XX公司...        │            │   ← 用户内容渲染    │
│ • YY公司...        │            │     在此区域        │
│                    │            │                    │
└────────────────────┘            └────────────────────┘
```

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
| `text-extractor.ts` 提取 | PDF 原生 (bottom-left) | `tx[5]` 直接取自 PDF transform |
| `ResumeNewContent.tsx` 编辑 | 不涉及坐标 | 只编辑文字，不改坐标 |
| `fill/route.ts` 接收 edits | PDF 原生 (bottom-left) | **注意：不需要二次翻转** |
| `fill/route.ts` 渲染自定义页 | PDF 原生 (bottom-left) | 从上到下计算 y，每次减去行高 |

**常见 Bug**：早期版本在 fill API 中做了 `pdfY = pageHeight - e.y - e.h` 的翻转，但 `text-extractor.ts` 传过来的 y 已经是 PDF 原生坐标（从底部算），导致文字被画到了页面底部。修复方案是直接使用 `e.y`，不做翻转。

### 自定义页的 y 计算

```
第一页文字块中 y 最大的块（物理位置最高）
  ↓
yStart = topBlock.y + topBlock.h + 12  // 文字区域下方留白
  ↓
逐行画文字，每行:
  y -= line.fontSize * 1.6            // 行高 = 字号 × 1.6
  if (y < 50) → 新建页, y = 792      // 触底自动分页
```

---

## PDF 填充管线

`POST /api/templates/[id]/fill` 是整个系统的核心接口，分三步执行：

### Step 1：模版页文字替换

```
对每个 EditItem:
  ┌─────────────────────┐
  │ 画白色矩形覆盖原文     │  x: e.x-4, y: e.y-descender,
  │ (Pass 1, 先画所有)   │  w: max(原宽, 新文宽)+8, h: 原高+descender+8
  └─────────────────────┘
           │
           ▼
  ┌─────────────────────┐
  │ 画新文字              │  x: e.x+1, y: e.y (基线)
  │ (Pass 2, 在所有遮罩上) │  size: e.fontSize, font: NotoSansSC
  └─────────────────────┘
```

**为什么两遍渲染**：如果边遮罩边写字，后面的遮罩可能盖住前面已写的文字。

**descender 处理**：中文和拉丁字母的下沉部分（g, j, p, q, y 的尾巴、部分中文笔画）在基线下方。白色矩形需要向下扩展 `fontSize × 0.3`（至少 6pt）才能完全覆盖。

### Step 2：自定义页生成

```
if (customPages.length > 0):
  加载模版 PDF → templateDoc

  for each customPage:
    ┌──────────────────────────┐
    │ copyPages(templateDoc, 0) │  复制模版第一页
    │ pdfDoc.addPage(copied)    │  加入输出文档
    └──────────────────────────┘
              │
              ▼
    ┌──────────────────────────┐
    │ 涂白所有 page1Blocks      │  遍历 templateBlocks，
    │                          │  逐个画白色矩形覆盖
    └──────────────────────────┘
              │
              ▼
    ┌──────────────────────────┐
    │ htmlToTextLines()         │  解析 TipTap 输出的 HTML
    │ → TextLine[]              │  提取标题/列表/段落结构
    └──────────────────────────┘
              │
              ▼
    ┌──────────────────────────┐
    │ 从文字区域下方开始排版      │  y 从 topBlock.y+topBlock.h+12 开始
    │ 超出页面 → addPage() 续页  │  续页为纯白 A4
    └──────────────────────────┘
```

### Step 3：合并输出

```
pdfDoc.save() → Buffer
  │
  ▼
public/filled/{id}.pdf  (每次覆盖写入)
  │
  ▼
返回 URL: /filled/{id}.pdf?t=timestamp  (防缓存)
```

---

## HTML → PDF 文本解析

TipTap 富文本编辑器输出 HTML，填充 API 需要将其转为可绘制的文本行。

### 解析流程

```
输入 HTML (TipTap 输出):
  <h2>项目经验</h2>
  <p>负责XX系统架构设计</p>
  <ul>
    <li><p>带领5人团队</p></li>
    <li><p>性能优化30%</p></li>
  </ul>

      ↓ htmlToTextLines()

解码实体:   &amp; → &, &nbsp; → 空格, etc.
      ↓
标签转换:
  <h2>  → \n[H2]        (标题标记，与文字同行)
  </h2> → (移除)
  <li>  → \n[LI]        (列表标记)
  </p>  → \n            (段落换行)
  <p>   → (移除)
  <ul>  → \n            (列表容器换行)
      ↓
剥离剩余标签:  <strong>, <em>, <span> 等全部移除
      ↓
按 \n 分割，逐行识别标记:
  [H1] → fontSize=titleSize+4, bold, indent=0
  [H2] → fontSize=titleSize,   bold, indent=0
  [H3] → fontSize=titleSize-2, bold, indent=0
  [LI] → fontSize=bodySize,    indent=18  (缩进)
  其他  → fontSize=bodySize,   indent=0
      ↓
输出 TextLine[]
```

### 风格继承

自定义页的文字风格从模版第一页提取：

```typescript
// 颜色：取所有文字块中出现次数最多的颜色
dominantColor = mostCommon(blocks.map(b => b.color)) || "#333333"

// 标题字号：取 fontSize ≥ 16 的中位数
titleSize = median(blocks.filter(b => b.fontSize >= 16).map(b => b.fontSize)) || 18

// 正文字号：取 fontSize < 16 的中位数
bodySize = median(blocks.filter(b => b.fontSize < 16).map(b => b.fontSize)) || 11
```

---

## 状态管理

编辑器状态集中在 Zustand store (`src/stores/editor-store.ts`)：

```
EditorState
├── 模版标识
│   ├── templateId
│   └── pdfUrl
│
├── Markdown 提取（MinerU 管线，预留）
│   ├── markdown, markdownSource
│   ├── mdModules, activeModuleId
│   ├── editedModules, deletedModules
│   └── parsing
│
├── 图片
│   ├── templateImages
│   ├── editedImages
│   └── deletedImages
│
├── 自定义页
│   ├── customPages: CustomPage[]
│   ├── addCustomPage()
│   ├── removeCustomPage()
│   └── updateCustomPage()
│
└── 持久化
    ├── resumeData, resumeId
    └── saving, saved
```

**为什么图片和自定义页放在 store 而不是组件 state**：
- 切换模版时需要重置所有这些状态
- 保存草稿时需要完整序列化
- 未来接入 MinerU 管线时会增加更多交叉依赖

---

## 关键设计决策

### 1. 为什么用 pdf-lib 而不是 Canvas 截图？

| 方案 | 优点 | 缺点 |
|---|---|---|
| pdf-lib 原位替换 | 输出真 PDF，文字可选、可搜索、矢量无损 | 需要嵌入 CJK 字体（16MB），坐标计算复杂 |
| Canvas 截图覆盖 | 实现简单，兼容性好 | 输出是图片，文字不可选，放大模糊 |

选择 pdf-lib 是因为简历是正式文档，用户可能需要面试官搜索 PDF 中的关键词。

### 2. 为什么文字提取用 pdfjs-dist 而不是 MinerU？

这是两条完全不同的技术路线，核心矛盾在于"要不要保留模版的排版设计"。

| 维度 | pdfjs-dist（当前方案） | MinerU + Markdown |
|------|----------------------|-------------------|
| 运行位置 | 客户端浏览器 | 服务端 API |
| 外部依赖 | 零 | 需要 MinerU token（或用免费 Flash 模式） |
| 提取精度 | 精确到每个字符的坐标、字号、颜色 | 语义理解好，但丢失精确坐标 |
| 编辑方式 | 逐块 textarea，原位替换 | 按模块富文本编辑，自由排版 |
| PDF 回填 | pdf-lib 同位置覆盖，布局完全保留 | 需要重新排版，无法完美还原原布局 |
| 离线可用 | ✅ | ❌ |
| 速度 | 即时（本地解析） | 有网络延迟（API 调用） |
| Flow 排版 | ❌ 文字必须适配原位置 | ✅ 内容可自由增删、重排 |

**核心矛盾：**

```
模版的本质 = 精心设计的固定布局

pdfjs-dist → "保留布局，只改文字"    → 尊重模版设计
MinerU    → "提取语义，重新排版"    → 抛弃模版设计
```

如果用户上传模版是为了它的排版设计（字体层级、留白、对齐、装饰），pdfjs-dist 是正确的——原位置替换保留所有这些。

如果用户只是想要一个"好看的简历框架"，不在意精确排版，那 MinerU 更灵活——提取内容 → 随便改 → 套个模版重新渲染。

**结论：**

当前方案（pdfjs-dist）更适合简历场景，因为核心需求是"用别人设计好的排版填自己的内容"，不是"提取内容后自由排版"。

**两者可以互补：** MinerU 用来做**语义标注**——识别每个文字块是"姓名"还是"工作经历标题"，辅助自动填表；但填充回 PDF 还是用 pdfjs-dist 的坐标方案。

**当前 MinerU 代码状态：** `mineru-extractor.ts`、`extract.ts`、`extract-markdown/route.ts` 已实现，但 `extractMarkdown()` / `parseMarkdownModules()` 零引用未接通。store 中预留的 `markdown` / `mdModules` 字段也一直空着。

### 3. 为什么自定义页用 TipTap 而不是 Milkdown？

虽然 `@milkdown/*` 包已安装（原计划用于 MinerU 管线的 Markdown 编辑），但 TipTap 有以下优势：
- 已在本项目中稳定运行（`RichTextEditor.tsx`）
- 输出 HTML 更容易在服务端解析
- 中文支持开箱即用

Milkdown 更适合纯 Markdown 编辑场景，后续接通 MinerU 管线时可能会切换。

### 4. 为什么不支持拖拽移动文字块？

文字块的位置由 PDF 模版决定，原位编辑 + 删除已覆盖核心需求。拖拽移动需要引入 Canvas 交互层，复杂度高且与"尊重模版设计"的理念矛盾。如果用户需要调整布局，应该修改原始模版文件后重新上传。
