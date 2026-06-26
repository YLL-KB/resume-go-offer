import type { TemplateConfig } from "../types";

/**
 * "classic" built-in template.
 * Used as the default renderer for all uploaded 「简约」style templates.
 *
 * When the user uploads a new template PDF with a different visual style,
 * create a new directory under templates/ with config.ts + index.tsx
 * and add one entry in registry.ts.
 */
export const classicConfig: TemplateConfig = {
  id: "classic",
  name: "经典模板",
  layout: "classic",
  description: "传统简约的简历布局，适合大多数求职场景",
  builtIn: true,
  colorScheme: {
    primary: "#000000",
    background: "#ffffff",
    text: "#212529",
  },
};
