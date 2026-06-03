# AGENTS.md — resume-go-offer

AI 编程助手指导文件。描述项目目标、技术决策、代码规范和约定。

## 项目概述

**resume-go-offer** 是一个在线简历生成与管理工具，帮助求职者快速创建专业简历、管理多个版本，并追踪投递状态。

### 核心功能规划

- 简历编辑器：分步表单填写（个人信息、教育经历、工作经历、项目经验、技能标签）
- 多模板切换：至少 3 套简历模板，支持实时预览
- 版本管理：每份简历可保存多个版本，支持版本对比与回滚
- 投递追踪：记录投递公司、职位、时间、状态（已投/初筛/面试/Offer/已拒）
- 导出：PDF 导出（浏览器端）

### 用户故事

1. 用户填写表单 → 实时预览简历 → 切换模板看效果 → 导出 PDF
2. 用户管理多份简历（如前端岗、全栈岗各一份）
3. 用户记录每次投递 → 看板视图追踪进度

## 技术决策

### 已确定

| 决策     | 选择                                                   | 原因                  |
| -------- | ------------------------------------------------------ | --------------------- |
| 框架     | Next.js 16 App Router                                  | 项目已初始化          |
| 运行时   | Cloudflare Pages                                       | 免费额度、全球 CDN    |
| 样式方案 | Tailwind CSS v4                                        | 项目已配置            |
| 组件库   | shadcn/ui (radix-nova)                                 | AGENTS.md 约定        |
| 表单     | react-hook-form + zod                                  | 复杂表单场景          |
| 图标     | lucide-react                                           | AGENTS.md 约定        |
| Toast    | sonner                                                 | AGENTS.md 约定        |
| 数据库   | Cloudflare D1                                          | 免费额度、SQLite 兼容 |
| ORM      | Drizzle ORM                                            | 类型安全、轻量        |
| PDF 导出 | 浏览器端（html2canvas + jspdf 或 @react-pdf/renderer） | 避免服务端依赖        |

### 待确定

- 认证方案（Cloudflare Access / Clerk / NextAuth ？）
- 富文本编辑是否需要（技能描述、项目描述是否需要富文本？）

## 路由规划

```
/                          # 落地页（产品介绍）
/login                     # 登录页
/dashboard                 # 用户仪表盘（简历列表 + 投递看板）
/resume/[id]               # 简历详情/预览
/resume/[id]/edit          # 简历编辑器
/resume/new                # 新建简历
/tracker                   # 投递追踪看板
/settings                  # 用户设置
```

## 数据模型（草案）

```typescript
// 简历
interface Resume {
  id: string
  userId: string
  title: string           // 如"前端开发-3年"
  templateId: string
  data: ResumeData        // JSON 存储的表单数据
  version: number
  createdAt: Date
  updatedAt: Date
}

// 简历数据
interface ResumeData {
  basic: { name, email, phone, location, website, avatar }
  summary: string
  education: { school, degree, major, startDate, endDate, gpa }[]
  experience: { company, title, startDate, endDate, description, highlights }[]
  projects: { name, description, url, techStack, highlights }[]
  skills: { name, level }[]   // level: beginner | intermediate | advanced | expert
  languages: { name, proficiency }[]
  certifications: { name, issuer, date }[]
}

// 投递记录
interface Application {
  id: string
  userId: string
  resumeId: string
  company: string
  position: string
  status: 'applied' | 'screening' | 'interview' | 'offer' | 'rejected'
  appliedAt: Date
  notes: string
  interviewRounds: InterviewRound[]
}
```

## 代码规范

沿用上游 AGENTS.md（`/Users/loong/code/AGENTS.md`）的全部约定，额外补充：

### 组件组织

```
src/
├── app/                  # Next.js App Router 页面（仅路由 + 布局）
├── components/
│   ├── ui/               # shadcn/ui 基础组件
│   ├── resume/           # 简历相关组件（模板、编辑器、预览）
│   ├── tracker/          # 投递追踪组件
│   └── shared/           # 跨模块共享组件
├── lib/
│   ├── db/               # Drizzle schema、migrations、queries
│   ├── validators/       # Zod schema
│   └── utils.ts          # cn() 等工具函数
├── hooks/                # 自定义 hooks
└── styles/               # 额外样式（如有）
```

### 命名约定

- 简历模板组件：`TemplateClassic.tsx`、`TemplateModern.tsx`、`TemplateMinimal.tsx`
- 数据库操作函数：`getResumeById`、`listResumesByUser`、`createApplication`
- Zod schema 文件：`resume.schema.ts`、`application.schema.ts`

### 状态管理

- 表单状态：`react-hook-form`
- 服务端状态：React Server Components + Server Actions
- 客户端全局状态：暂不需要（页面级状态即可）

## 开发阶段

### Phase 1 — 脚手架（当前）
- [ ] 安装 shadcn/ui、lucide-react、react-hook-form、zod、sonner
- [ ] 搭建路由骨架
- [ ] 配置 D1 + Drizzle

### Phase 2 — 简历编辑器
- [ ] 表单步骤（基本信息 → 教育 → 经历 → 项目 → 技能）
- [ ] 实时预览
- [ ] 模板切换

### Phase 3 — 仪表盘
- [ ] 简历列表
- [ ] 投递看板

### Phase 4 — 导出与发布
- [ ] PDF 导出
- [ ] 公开分享链接

## 给 AI 的提示

- 这个项目目前是 Phase 1，刚刚初始化完 Next.js 模板
- 所有变更先读 AGENTS.md 的规范，再动手
- 数据模型还在草案阶段，可以调整
- 优先保证代码能跑通（`npm run dev` 不报错），再谈优化
- 不要安装未列入技术决策的依赖，除非有充分理由
