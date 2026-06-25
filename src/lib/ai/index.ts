/**
 * AI 调用封装
 *
 * 基于 OpenAI 兼容 SDK，支持 OpenAI / DeepSeek / 通义千问 等。
 * 切换模型只需改 .env.local 中的 OPENAI_BASE_URL 和 AI_MODEL。
 *
 * 用法:
 *   import { ai } from "@/lib/ai";
 *   const result = await ai.improveText("负责前端开发");
 */

import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "sk-placeholder",
  baseURL: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
});

const DEFAULT_MODEL = process.env.AI_MODEL ?? "gpt-4o-mini";

if (process.env.LANGCHAIN_TRACING_V2 === "true" && process.env.LANGCHAIN_API_KEY) {
  console.log("[AI] LangSmith tracing enabled");
}

export const ai = {
  /**
   * 润色简历经历描述
   *
   * @param text - 用户写的原始描述，如"负责前端开发"
   * @param context - 可选的上下文信息，如目标岗位
   * @returns 润色后的描述
   */
  async improveText(text: string, context?: string): Promise<string> {
    const systemPrompt = [
      "你是一位专业的简历优化师。优化以下工作经历描述，使其更专业、更有说服力。",
      "规则：",
      "- 保持原文事实不变，不编造不存在的成就",
      "- 用有力的动词开头（主导、设计、实现、优化等）",
      "- 尽可能量化成果（如没有具体数字则不编造）",
      "- 控制在 2-3 句话以内",
      "- 直接返回优化后的文本，不要加引号或解释",
      context ? `\n目标岗位/行业: ${context}` : "",
    ].join("\n");

    const res = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
    });

    return res.choices[0]?.message?.content?.trim() ?? text;
  },

  /**
   * 生成个人总结（Self-Summary）
   */
  async generateSummary(profile: {
    name?: string;
    title?: string;
    skills?: string[];
    highlights?: string[];
  }): Promise<string> {
    const parts = [];
    if (profile.title) parts.push(`目标岗位: ${profile.title}`);
    if (profile.skills?.length) parts.push(`技能: ${profile.skills.join("、")}`);
    if (profile.highlights?.length) parts.push(`亮点: ${profile.highlights.join("；")}`);

    const res = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `你是专业简历撰写师。根据用户信息生成一段 3-4 句话的自我总结。总结应突出核心竞争力、经验年限、关键成就。用简洁有力的中文。直接返回总结文本。`,
        },
        { role: "user", content: parts.join("\n") },
      ],
    });

    return res.choices[0]?.message?.content?.trim() ?? "";
  },

  /**
   * 分析简历内容，返回结构化评估
   */
  async analyzeResume(content: string): Promise<{
    overview: string;
    strengths: string[];
    weaknesses: string[];
    suggestions: string[];
    score: number;
  }> {
    const res = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: `你是一位资深 HR 和职业规划师。分析以下简历内容，指出优缺点并给出改进建议。
请严格以 JSON 格式返回（不要 markdown 代码块，纯 JSON）：
{
  "overview": "整体评价（2-3句话，概括这份简历的总体水平）",
  "strengths": ["优点1", "优点2", "优点3"],
  "weaknesses": ["不足1", "不足2", "不足3"],
  "suggestions": ["具体改进建议1", "具体改进建议2", "具体改进建议3"],
  "score": 75
}
评分标准：内容完整性30分 + 表达专业性30分 + 结构清晰度20分 + 亮点突出度20分`,
        },
        { role: "user", content },
      ],
    });

    const text = res.choices[0]?.message?.content?.trim() ?? "";
    try {
      return JSON.parse(text);
    } catch {
      // 如果 AI 没返回纯 JSON，尝试提取
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      return {
        overview: "分析结果解析失败，请重试",
        strengths: [],
        weaknesses: [],
        suggestions: [],
        score: 0,
      };
    }
  },

  /**
   * 根据分析结果中的不足/建议，AI 优化简历对应部分
   *
   * @param resumeContent - 原始简历全文
   * @param type - 优化类型："weakness" | "suggestion"
   * @param target - 要改进的具体描述（如"简历内容过于简略"）
   * @returns 优化建议文本
   */
  async improveResumeSection(
    resumeContent: string,
    type: "weakness" | "suggestion",
    target: string,
  ): Promise<string> {
    const prompts: Record<string, string> = {
      weakness:
        "我简历中有以下不足：「" + target + "」。请针对这个不足，直接给出 2-3 条具体的修改建议，告诉我该怎么改写简历中的对应部分。每条建议用一句话，简洁有力。不要评价，直接给建议。",
      suggestion:
        "简历的改进建议是：「" + target + "」。请针对这条建议，直接给出 2-3 条具体的改写示例或优化方向，告诉我怎么落实到简历文本上。每条一行，简洁具体。",
    };

    const res = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "你是一位资深简历优化师。根据用户简历原文和分析结果中的改进方向，给出可落地的具体修改方案。\n直接返回优化内容，每行一条，不要序号和前缀。",
        },
        {
          role: "user",
          content:
            prompts[type] +
            "\n\n以下是完整的简历原文，供参考：\n" +
            resumeContent,
        },
      ],
    });

    return res.choices[0]?.message?.content?.trim() ?? "暂无优化建议";
  },

  /**
   * 将简历文本解析为结构化字段，用于表单编辑
   */
  async parseResume(content: string): Promise<{
    sections: {
      title: string;
      type: "fields" | "textarea" | "list";
      fields?: { key: string; label: string; value: string }[];
      content?: string;
      items?: { fields: { key: string; label: string; value: string }[] }[];
    }[];
  }> {
    const res = await openai.chat.completions.create({
      model: DEFAULT_MODEL,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `你是一个简历解析器。将以下简历文本解析为结构化 JSON，用于前端表单编辑。

返回格式（纯 JSON，不要 markdown）：
{
  "sections": [
    {
      "title": "分区标题，如个人信息、专业技能",
      "type": "fields" | "textarea" | "list",
      // type="fields": 键值对字段
      "fields": [
        { "key": "name", "label": "姓名", "value": "实际值" },
        { "key": "phone", "label": "手机", "value": "138xxxx" }
      ],
      // type="textarea": 大段文本
      "content": "完整文本内容...",
      // type="list": 列表（工作经验/项目经历）
      "items": [
        {
          "fields": [
            { "key": "company", "label": "公司", "value": "XX公司" },
            { "key": "period", "label": "时间", "value": "2020-2023" }
          ]
        }
      ]
    }
  ]
}

规则：
- 信息分类要准确，不要编造不存在的内容
- 保留原文措辞，不要润色或改写
- fields 的 label 用中文，简明扼要
- 个人信息拆成各字段，不要合并`,
        },
        { role: "user", content },
      ],
    });

    const text = res.choices[0]?.message?.content?.trim() ?? "";
    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) return JSON.parse(match[0]);
      // 兜底：当做一个纯文本段落
      return {
        sections: [
          {
            title: "简历内容",
            type: "textarea",
            content,
          },
        ],
      };
    }
  },
};
