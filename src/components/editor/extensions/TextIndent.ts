import { Extension } from "@tiptap/core";

/**
 * 为 paragraph 节点添加 textIndent 属性，值为 "2em" 或 null。
 * 使用 editor.chain().focus().updateAttributes("paragraph", { textIndent: "2em" }).run()
 */
export const TextIndent = Extension.create({
  name: "textIndent",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          textIndent: {
            default: null,
            parseHTML: (el) => {
              if (el.style.textIndent === "2em") return "2em";
              return null;
            },
            renderHTML: (attrs) => {
              if (attrs.textIndent !== "2em") return {};
              return { style: "text-indent: 2em" };
            },
          },
        },
      },
    ];
  },
});
