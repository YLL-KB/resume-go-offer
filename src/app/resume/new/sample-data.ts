import type { ResumeData } from "@/lib/validators/resume.schema";

export const SAMPLE_RESUME_DATA: ResumeData = {
  basic: {
    name: "张三",
    email: "zhangsan@example.com",
    phone: "138-0000-0000",
    location: "北京",
    website: "https://zhangsan.dev",
    title: "高级前端工程师",
  },
  summary:
    "拥有 6 年 Web 前端开发经验，专注 React 生态与性能优化。主导过多个从零到一的中大型项目，擅长组件化架构设计与工程化建设。",
  education: [
    {
      school: "北京大学",
      degree: "硕士",
      major: "计算机科学与技术",
      startDate: "2016.09",
      endDate: "2019.07",
      gpa: "3.8/4.0",
    },
    {
      school: "武汉大学",
      degree: "学士",
      major: "软件工程",
      startDate: "2012.09",
      endDate: "2016.07",
      gpa: "3.6/4.0",
    },
  ],
  experience: [
    {
      company: "字节跳动",
      title: "高级前端工程师",
      startDate: "2021.03",
      endDate: "",
      description:
        "负责抖音电商商家端核心模块的前端架构设计与开发。主导了商家后台的微前端改造，将巨石应用拆分为 12 个独立子应用，构建部署时间从 20 分钟降至 3 分钟。",
      highlights: [],
    },
    {
      company: "阿里巴巴",
      title: "前端工程师",
      startDate: "2019.07",
      endDate: "2021.02",
      description:
        "参与淘宝商家工具的前端开发，负责商品管理、订单管理模块。推动团队从 Class Component 迁移到 Hooks，代码量减少约 30%。",
      highlights: [],
    },
  ],
  projects: [
    {
      name: "Resume Go Offer",
      description:
        "开源简历制作工具，支持 AI 优化简历内容、多模板切换、一键导出 PDF。使用 Next.js + Tailwind CSS + D1 数据库构建。",
      url: "https://github.com/example/resume-go-offer",
      techStack: "Next.js, TypeScript, Tailwind CSS, Drizzle ORM",
      highlights: [],
    },
    {
      name: "组件库 @my/design-system",
      description:
        "从零搭建公司级 React 组件库，包含 40+ 组件，支持主题定制与按需加载。覆盖 3 个业务线、15+ 个项目。",
      url: "",
      techStack: "React, TypeScript, Rollup, Storybook, Jest",
      highlights: [],
    },
  ],
  skills: [
    "React",
    "TypeScript",
    "Next.js",
    "Node.js",
    "Tailwind CSS",
    "Webpack",
    "Vite",
    "Git",
    "Docker",
  ],
};
