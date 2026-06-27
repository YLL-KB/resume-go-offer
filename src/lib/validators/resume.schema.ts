import { z } from "zod";

// ============================================================
// 基本信息
// ============================================================
export const basicInfoSchema = z.object({
  name: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().optional().default(""),
  location: z.string().optional().default(""),
  website: z.string().optional().default(""),
  title: z.string().optional().default(""),
});

export type BasicInfo = z.infer<typeof basicInfoSchema>;

// ============================================================
// 教育经历
// ============================================================
export const educationSchema = z.object({
  school: z.string().default(""),
  degree: z.string().default(""),
  major: z.string().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  gpa: z.string().optional().default(""),
});

export type Education = z.infer<typeof educationSchema>;

// ============================================================
// 工作经历
// ============================================================
export const experienceSchema = z.object({
  company: z.string().default(""),
  title: z.string().default(""),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  description: z.string().optional().default(""),
  highlights: z.array(z.string()).optional().default([]),
});

export type Experience = z.infer<typeof experienceSchema>;

// ============================================================
// 项目经验
// ============================================================
export const projectSchema = z.object({
  name: z.string().default(""),
  description: z.string().optional().default(""),
  url: z.string().optional().default(""),
  techStack: z.string().optional().default(""),
  highlights: z.array(z.string()).optional().default([]),
});

export type Project = z.infer<typeof projectSchema>;

// ============================================================
// 完整简历数据
// ============================================================
export const resumeDataSchema = z.object({
  basic: basicInfoSchema,
  summary: z.string().optional().default(""),
  education: z.array(educationSchema).optional().default([]),
  experience: z.array(experienceSchema).optional().default([]),
  projects: z.array(projectSchema).optional().default([]),
  skills: z.array(z.string()).optional().default([]),
});

export type ResumeData = z.infer<typeof resumeDataSchema>;

// ============================================================
// 默认空简历
// ============================================================
export const DEFAULT_RESUME_DATA: ResumeData = {
  basic: {
    name: "",
    email: "",
    phone: "",
    location: "",
    website: "",
    title: "",
  },
  summary: "",
  education: [],
  experience: [],
  projects: [],
  skills: [],
};
