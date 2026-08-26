import { defaultSchema, type Options } from "rehype-sanitize";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "del",
  "code",
  "pre",
  "blockquote",
  "a",
  "ul",
  "ol",
  "li",
  "span",
];

export const LANGUAGE_CLASS = /^language-./;
export const HLJS_CLASS = /^hljs-/;

export const sanitizeSchema: Options = {
  ...defaultSchema,
  tagNames: ALLOWED_TAGS,
  attributes: {
    a: ["href", "title"],
    code: [["className", LANGUAGE_CLASS, HLJS_CLASS, "hljs"]],
    pre: [["className", HLJS_CLASS, "hljs"]],
    span: [["className", HLJS_CLASS, "hljs"]],
  },
  protocols: { href: ["http", "https", "mailto"] },
  clobberPrefix: "user-content-",
  strip: ["script", "style"],
};
