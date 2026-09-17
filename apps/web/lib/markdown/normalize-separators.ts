type FenceState = {
  character: "`" | "~";
  length: number;
  owner: ContainerKind | null;
};

type ContainerKind = "blockquote" | "list";

type HtmlBlockState = {
  kind: "basic" | "comment" | "cdata" | "raw-tag";
  tag?: string;
};

const SEPARATOR_LINE_RE = /^ {0,3}-{3,}[ \t]*$/;
const FENCE_OPEN_LINE_RE = /^ {0,3}((?:`{3,}|~{3,}))(?![`~])/;
const FENCE_CLOSE_LINE_RE = /^ {0,3}((?:`{3,}|~{3,}))[ \t]*$/;
const ATX_HEADING_RE = /^ {0,3}#{1,6}(?:[ \t]|$)/;
const BLOCKQUOTE_RE = /^ {0,3}>/;
const LIST_ITEM_RE = /^ {0,3}(?:[-+*](?:[ \t]+|$)|\d{1,9}[.)](?:[ \t]+|$))/;
const LIST_FENCE_PREFIX_RE = /^ {0,3}(?:[-+*]|\d{1,9}[.)])[ \t]+(.+)$/;
const BLOCKQUOTE_FENCE_PREFIX_RE = /^ {0,3}>[ \t]?(.*)$/;
const HTML_TAG_RE = /^ {0,3}<([A-Za-z][\w:-]*)(?:[ \t]+[^>]*)?>/;
const HTML_BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "nav",
  "ol",
  "p",
  "pre",
  "script",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul",
]);
const HTML_RAW_TAGS = new Set(["pre", "script", "style", "textarea"]);

function withoutLineEnding(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function blankLineLike(line: string): string {
  return line.endsWith("\r") ? "\r" : "";
}

function isBlank(line: string): boolean {
  return withoutLineEnding(line).trim() === "";
}

function isSeparatorLine(line: string): boolean {
  return SEPARATOR_LINE_RE.test(withoutLineEnding(line));
}

function isFenceOpen(line: string): FenceState | null {
  const match = FENCE_OPEN_LINE_RE.exec(withoutLineEnding(line));
  if (!match) return null;
  return { character: match[1][0] as "`" | "~", length: match[1].length, owner: null };
}

function isContainerFenceOpen(line: string): FenceState | null {
  const text = withoutLineEnding(line);
  const listMatch = LIST_FENCE_PREFIX_RE.exec(text);
  const listFence = listMatch ? isFenceOpen(listMatch[1]) : null;
  if (listFence) return { ...listFence, owner: "list" };

  const blockquoteMatch = BLOCKQUOTE_FENCE_PREFIX_RE.exec(text);
  const blockquoteFence = blockquoteMatch ? isFenceOpen(blockquoteMatch[1]) : null;
  return blockquoteFence ? { ...blockquoteFence, owner: "blockquote" } : null;
}

function isFenceClose(line: string, fence: FenceState): boolean {
  const match = FENCE_CLOSE_LINE_RE.exec(withoutLineEnding(line));
  return Boolean(match && match[1][0] === fence.character && match[1].length >= fence.length);
}

function isRuleLine(line: string): boolean {
  const text = withoutLineEnding(line).trim();
  if (SEPARATOR_LINE_RE.test(withoutLineEnding(line))) return true;
  for (const character of ["*", "_"]) {
    const compact = text.replaceAll(" ", "").replaceAll("\t", "");
    if (compact.length >= 3 && compact.split("").every((item) => item === character)) return true;
  }
  return false;
}

function hasUnescapedPipe(line: string): boolean {
  const text = withoutLineEnding(line);
  for (let index = 0; index < text.length; index++) {
    if (text[index] === "|" && text[index - 1] !== "\\") return true;
  }
  return false;
}

function isBlockquoteOrListMarker(line: string): boolean {
  const text = withoutLineEnding(line);
  return BLOCKQUOTE_RE.test(text) || LIST_ITEM_RE.test(text);
}

function isStructuralLine(line: string): boolean {
  const text = withoutLineEnding(line);
  const trimmed = text.trim();
  return (
    /^\t/.test(text) ||
    /^ {4}/.test(text) ||
    ATX_HEADING_RE.test(text) ||
    isBlockquoteOrListMarker(text) ||
    FENCE_OPEN_LINE_RE.test(text) ||
    isRuleLine(text) ||
    hasUnescapedPipe(text) ||
    /^ {0,3}<\/?[A-Za-z!][^>]*>/.test(text) ||
    trimmed === ""
  );
}

function sentenceTerminator(line: string): boolean {
  const text = withoutLineEnding(line).trim();
  const withoutClosingMarkers = text.replace(/[\\`*_)\]}>'"]+$/u, "");
  return /[.!?]$/u.test(withoutClosingMarkers);
}

function isEligibleProse(line: string, container: ContainerKind | null): boolean {
  const text = withoutLineEnding(line);
  const trimmed = text.trim();
  if (container || trimmed === "" || isStructuralLine(text)) return false;
  if (!/\s/u.test(trimmed)) return false;

  const codePointLength = Array.from(trimmed).length;
  return codePointLength >= 70 || (codePointLength >= 40 && sentenceTerminator(text));
}

function containerMarker(line: string): ContainerKind | null {
  const text = withoutLineEnding(line);
  if (BLOCKQUOTE_RE.test(text)) return "blockquote";
  if (LIST_ITEM_RE.test(text)) return "list";
  return null;
}

function updateContainer(
  current: ContainerKind | null,
  line: string,
  eligible: boolean,
): ContainerKind | null {
  if (isBlank(line)) return null;
  return containerMarker(line) ?? (eligible ? null : current);
}

function isContainerBoundary(
  line: string,
  fenceStart: FenceState | null,
  htmlStart: HtmlBlockState | null,
): boolean {
  const text = withoutLineEnding(line);
  return (
    isBlank(line) ||
    ATX_HEADING_RE.test(text) ||
    isRuleLine(text) ||
    Boolean(htmlStart) ||
    (Boolean(fenceStart) && fenceStart?.owner === null)
  );
}

function htmlBlockStart(line: string): HtmlBlockState | null {
  const text = withoutLineEnding(line).trimStart();
  if (text.startsWith("<!--") && !text.includes("-->")) return { kind: "comment" };
  if (text.startsWith("<![CDATA[") && !text.includes("]]>")) {
    return { kind: "cdata" };
  }

  const match = HTML_TAG_RE.exec(withoutLineEnding(line));
  if (!match || !HTML_BLOCK_TAGS.has(match[1].toLowerCase())) return null;
  const tag = match[1].toLowerCase();
  if (HTML_RAW_TAGS.has(tag)) return { kind: "raw-tag", tag };
  return { kind: "basic" };
}

function htmlBlockEnd(state: HtmlBlockState, line: string): boolean {
  const text = withoutLineEnding(line);
  if (state.kind === "comment") return text.includes("-->");
  if (state.kind === "cdata") return text.includes("]]>");
  if (state.kind === "raw-tag") {
    return Boolean(state.tag && new RegExp(`</${state.tag}\\s*>`, "i").test(text));
  }
  return isBlank(line);
}

function isFrontMatterBoundary(line: string): boolean {
  const text = withoutLineEnding(line).trim();
  return text === "---" || text === "...";
}

function firstNonBlankIndex(lines: string[]): number {
  return lines.findIndex((line) => !isBlank(line));
}

type SeparatorScanState = {
  container: ContainerKind | null;
  fence: FenceState | null;
  frontMatter: boolean;
  frontMatterStart: number;
  htmlBlock: HtmlBlockState | null;
  output: string[];
  previousEligible: boolean;
};

function handleFrontMatterLine(state: SeparatorScanState, line: string, index: number): boolean {
  if (!state.frontMatter) return false;
  state.output.push(line);
  state.previousEligible = false;
  if (index > state.frontMatterStart && isFrontMatterBoundary(line)) state.frontMatter = false;
  return true;
}

function handleFenceLine(state: SeparatorScanState, line: string): boolean {
  if (!state.fence) return false;
  state.output.push(line);
  state.previousEligible = false;
  if (isFenceClose(line, state.fence)) {
    const owner = state.fence.owner;
    state.fence = null;
    state.container = owner;
  }
  return true;
}

function handleHtmlLine(state: SeparatorScanState, line: string): boolean {
  if (!state.htmlBlock) return false;
  state.output.push(line);
  state.previousEligible = false;
  if (htmlBlockEnd(state.htmlBlock, line)) state.htmlBlock = null;
  return true;
}

function handleSeparatorLine(state: SeparatorScanState, lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  if (!isSeparatorLine(line) || !state.previousEligible) return false;
  state.output.push(blankLineLike(lines[index - 1] ?? ""));
  state.output.push(line);
  state.previousEligible = false;
  return true;
}

function handleOrdinaryLine(state: SeparatorScanState, line: string): void {
  state.output.push(line);
  const fenceStart = isFenceOpen(line) ?? isContainerFenceOpen(line);
  const htmlStart = htmlBlockStart(line);
  if (isContainerBoundary(line, fenceStart, htmlStart)) state.container = null;

  if (fenceStart) {
    state.fence = fenceStart;
    state.container = fenceStart.owner;
    state.previousEligible = false;
    return;
  }

  if (htmlStart) {
    state.htmlBlock = htmlStart;
    state.previousEligible = false;
    return;
  }

  const eligible = isEligibleProse(line, state.container);
  state.previousEligible = eligible;
  state.container = updateContainer(state.container, line, eligible);
}

/**
 * Inserts one blank line before a long prose line's hyphen separator. The
 * caller supplies source lines so existing line endings and fence repairs stay
 * byte-for-byte unchanged except for the inserted separator line.
 */
export function normalizeProseSeparators(lines: string[]): string[] {
  const frontMatterStart = firstNonBlankIndex(lines);
  const state: SeparatorScanState = {
    container: null,
    fence: null,
    frontMatter:
      frontMatterStart >= 0 &&
      isFrontMatterBoundary(lines[frontMatterStart] ?? "") &&
      withoutLineEnding(lines[frontMatterStart] ?? "").trim() === "---",
    frontMatterStart,
    htmlBlock: null,
    output: [],
    previousEligible: false,
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? "";

    if (handleFrontMatterLine(state, line, index)) continue;
    if (handleFenceLine(state, line)) continue;
    if (handleHtmlLine(state, line)) continue;
    if (handleSeparatorLine(state, lines, index)) continue;
    handleOrdinaryLine(state, line);
  }

  return state.output;
}
