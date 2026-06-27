import { Extension } from "@tiptap/core";

/**
 * 基于 TextStyle 扩展，添加 fontSize 属性支持。
 * 使用 editor.chain().focus().setMark("textStyle", { fontSize: "16px" }).run()
 */
export const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return {
      types: ["textStyle"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize?.replace(/["']/g, "") || null,
            renderHTML: (attrs) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            },
          },
        },
      },
    ];
  },
});
