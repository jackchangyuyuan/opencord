import { MENTION_MARKER_PATTERN } from "@opencord/shared/constants";

export type MentionKind = "user" | "role" | "channel" | "broadcast";

export const MENTION_KIND_ATTRIBUTE = "data-mention-kind";
export const MENTION_ID_ATTRIBUTE = "data-mention-id";

const MENTION_KIND_PROPERTY = "dataMentionKind";
const MENTION_ID_PROPERTY = "dataMentionId";

const OPAQUE_TAGS = new Set(["code", "pre"]);

interface HastNode {
  type: string;
  tagName?: string | undefined;
  value?: string | undefined;
  properties?: Record<string, unknown> | undefined;
  children?: HastNode[] | undefined;
}

function kindOf(prefix: string | undefined): MentionKind {
  if (prefix === undefined) {
    return "broadcast";
  }

  if (prefix === "#") {
    return "channel";
  }

  return prefix === "@&" ? "role" : "user";
}

function splitMarkers(value: string): HastNode[] | null {
  const nodes: HastNode[] = [];
  let cursor = 0;

  for (const match of value.matchAll(MENTION_MARKER_PATTERN)) {
    const start = match.index;

    if (start > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, start) });
    }

    nodes.push({
      type: "element",
      tagName: "span",
      properties: {
        [MENTION_KIND_PROPERTY]: kindOf(match[1]),
        [MENTION_ID_PROPERTY]: match[2] ?? match[3] ?? "",
      },
      children: [{ type: "text", value: match[0] }],
    });

    cursor = start + match[0].length;
  }

  if (nodes.length === 0) {
    return null;
  }

  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) });
  }

  return nodes;
}

function markMentions(node: HastNode): void {
  const children = node.children;

  if (
    children === undefined ||
    (node.tagName !== undefined && OPAQUE_TAGS.has(node.tagName))
  ) {
    return;
  }

  const next: HastNode[] = [];

  for (const child of children) {
    if (child.type === "text" && child.value !== undefined) {
      next.push(...(splitMarkers(child.value) ?? [child]));
      continue;
    }

    markMentions(child);
    next.push(child);
  }

  node.children = next;
}

export function rehypeMentions() {
  return (tree: HastNode): void => {
    markMentions(tree);
  };
}
