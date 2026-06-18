/**
 * MarkdownRenderer — 将 LLM 输出的 Markdown 文本渲染为 JSX
 *
 * 支持的语法：
 * - 标题：# ## ###
 * - 列表：- item, 1. item
 * - 粗体：**text**
 * - 斜体：*text*
 * - 行内代码：`code`
 * - 代码块：```language ... ```
 * - 表格：| a | b | ... (含表头线)
 * - 段落：纯文本行
 * - 空行：间距
 */

"use client";

import { Fragment } from "react";

interface RenderedLine {
  id: string;
  type: "heading" | "list" | "numberedList" | "codeBlock" | "table" | "paragraph" | "empty" | "th" | "td";
  content: string;
  props?: Record<string, unknown>;
}

/** 将 Markdown 文本拆分为结构化行 */
function parseMarkdown(text: string): RenderedLine[] {
  const lines = text.split("\n");
  const result: RenderedLine[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (!line.trim()) {
      result.push({ id: `empty-${i}`, type: "empty", content: "" });
      i++;
      continue;
    }

    // 代码块
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().replace(/^```/, "").trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      result.push({
        id: `code-${result.length}`,
        type: "codeBlock",
        content: codeLines.join("\n"),
        props: { lang },
      });
      continue;
    }

    // 表格行 — 检测是否为分隔线行或数据行
    if (line.includes("|") && line.trim().startsWith("|")) {
      // 收集整个表格
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      // 渲染表格行
      tableLines.forEach((tl, idx) => {
        const cells = parseTableRow(tl);
        const isSeparator = cells.every((c) => /^[\s\-:]+$/.test(c));
        if (isSeparator) return; // 跳过分隔线
        result.push({
          id: `table-${result.length}`,
          type: idx === 0 ? "th" : "td",
          content: cells.join("\t"),
          props: { row: idx },
        });
      });
      continue;
    }

    // 标题
    if (line.startsWith("### ")) {
      result.push({ id: `h4-${i}`, type: "heading", content: line.slice(4), props: { level: 3 } });
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      result.push({ id: `h3-${i}`, type: "heading", content: line.slice(3), props: { level: 2 } });
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      result.push({ id: `h2-${i}`, type: "heading", content: line.slice(2), props: { level: 1 } });
      i++;
      continue;
    }

    // 无序列表
    if (line.match(/^[-*]\s/)) {
      result.push({
        id: `list-${i}`,
        type: "list",
        content: line.replace(/^[-*]\s/, ""),
      });
      i++;
      continue;
    }

    // 有序列表
    if (line.match(/^\d+\.\s/)) {
      const match = line.match(/^(\d+)\.\s(.*)/);
      if (match) {
        result.push({
          id: `nlist-${i}`,
          type: "numberedList",
          content: match[2],
          props: { num: match[1] },
        });
        i++;
        continue;
      }
    }

    // 普通段落
    result.push({ id: `p-${i}`, type: "paragraph", content: line });
    i++;
  }

  return result;
}

/** 解析 Markdown 表格行为单元格数组 */
function parseTableRow(row: string): string[] {
  // 去除首尾 | 和空白
  const trimmed = row.trim();
  let content = trimmed;
  if (content.startsWith("|")) content = content.slice(1);
  if (content.endsWith("|")) content = content.slice(0, -1);
  return content.split("|").map((c) => c.trim());
}

/** 渲染粗体和斜体 */
function renderInlineFormat(text: string): React.ReactNode {
  // 先处理粗体：**text**
  const boldParts = text.split(/(\*\*(.*?)\*\*)/g);
  const result: React.ReactNode[] = [];

  for (let bi = 0; bi < boldParts.length; bi++) {
    const part = boldParts[bi];
    if (bi % 4 === 1) {
      // 粗体匹配组
      result.push(
        <strong key={bi} className="font-semibold text-[#333333]">
          {renderInlineCode(part)}
        </strong>
      );
    } else {
      // 非粗体部分用 Fragment 包裹并加 key，避免 React key 警告
      result.push(<Fragment key={bi}>{renderInlineCode(part)}</Fragment>);
    }
  }

  return <>{result}</>;
}

/** 渲染行内代码 */
function renderInlineCode(text: string): React.ReactNode {
  const parts = text.split(/(`(.*?)`)/g);
  if (parts.length === 1) return text;

  const result: React.ReactNode[] = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    if (pi % 4 === 1) {
      // 行内代码匹配
      result.push(
        <code
          key={pi}
          className="bg-[#F5F5F5] text-[#E54545] px-1 py-0.5 rounded text-xs font-mono"
        >
          {part}
        </code>
      );
    } else {
      result.push(<Fragment key={pi}>{renderItalic(part)}</Fragment>);
    }
  }
  return <>{result}</>;
}

/** 渲染斜体 */
function renderItalic(text: string): React.ReactNode[] {
  const parts = text.split(/((?:^|[^*])\*(?:[^*]|(?!\*))+(?:^|[^*])\*)/);
  if (parts.length <= 1) return [text];
  const result: React.ReactNode[] = [];
  for (let pi = 0; pi < parts.length; pi++) {
    const part = parts[pi];
    if (pi % 4 === 1) {
      result.push(
        <em key={pi} className="italic">
          {part.replace(/^\*|\*$/g, "")}
        </em>
      );
    } else {
      result.push(part);
    }
  }
  return result;
}

/** Markdown 渲染组件入口 */
export default function MarkdownRenderer({ content }: { content: string }) {
  const parsed = parseMarkdown(content);

  // 表格检测与渲染：将连续的 th/td 行合并为一个表格
  const fragments: React.ReactNode[] = [];
  let i = 0;

  while (i < parsed.length) {
    const entry = parsed[i];

    // 表格块：连续 th + td 行
    if (entry.type === "th") {
      const tableRows: RenderedLine[] = [entry];
      i++;
      while (i < parsed.length && (parsed[i].type === "td" || parsed[i].type === "th")) {
        tableRows.push(parsed[i]);
        i++;
      }
      fragments.push(<TableBlock key={`table-${i}`} rows={tableRows} />);
      continue;
    }

    // 普通条目
    fragments.push(
      <FragmentEntry key={entry.id} entry={entry} />
    );
    i++;
  }

  return <>{fragments}</>;
}

/** 表格块 */
function TableBlock({ rows }: { rows: RenderedLine[] }) {
  const headers = rows.filter((r) => r.type === "th").map((r) => r.content.split("\t"));
  const bodyRows = rows.filter((r) => r.type === "td").map((r) => r.content.split("\t"));

  // 统一列数
  const colCount = Math.max(headers.length > 0 ? headers[0].length : 0, ...bodyRows.map((r) => r.length));

  return (
    <div className="overflow-x-auto my-2 -mx-4 px-4">
      <table className="w-full text-xs border-collapse">
        {headers.length > 0 && (
          <thead>
            <tr className="border-b border-[#EEEEEE]">
              {headers[0].map((h, ci) => (
                <th key={ci} className="py-2 px-2 text-left font-semibold text-[#333333]">
                  {h}
                </th>
              ))}
              {/* 补齐空表头 */}
              {Array.from({ length: colCount - headers[0].length }).map((_, ci) => (
                <th key={`empty-${ci}`} className="py-2 px-2 text-left font-semibold text-[#333333]">
                  &nbsp;
                </th>
              ))}
            </tr>
          </thead>
        )}
        {bodyRows.length > 0 && (
          <tbody>
            {bodyRows.map((row, ri) => (
              <tr key={ri} className="border-b border-[#F5F5F5]">
                {row.map((cell, ci) => (
                  <td key={ci} className="py-1.5 px-2 text-[#555555]">
                    {renderInlineFormat(cell)}
                  </td>
                ))}
                {/* 补齐空单元格 */}
                {Array.from({ length: colCount - row.length }).map((_, ci) => (
                  <td key={`empty-${ri}-${ci}`} className="py-1.5 px-2 text-[#999999]">
                    &nbsp;
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}

/** 单个渲染条目 */
function FragmentEntry({ entry }: { entry: RenderedLine }) {
  switch (entry.type) {
    case "heading": {
      const level = (entry.props?.level as number) ?? 2;
      if (level === 1) {
        return (
          <h2 className="text-base font-bold text-[#333333] mt-4 mb-2">
            {renderInlineFormat(entry.content)}
          </h2>
        );
      }
      if (level === 2) {
        return (
          <h3 className="text-sm font-bold text-[#333333] mt-3 mb-1.5">
            {renderInlineFormat(entry.content)}
          </h3>
        );
      }
      return (
        <h4 className="text-sm font-semibold text-[#444444] mt-2 mb-1">
          {renderInlineFormat(entry.content)}
        </h4>
      );
    }

    case "list":
      return (
        <div className="flex items-start gap-1.5 my-0.5">
          <span className="text-brand mt-0.5 shrink-0">•</span>
          <span className="text-sm text-[#555555] leading-relaxed">
            {renderInlineFormat(entry.content)}
          </span>
        </div>
      );

    case "numberedList": {
      const num = (entry.props?.num as string) ?? "";
      return (
        <div className="flex items-start gap-1.5 my-0.5">
          <span className="text-brand font-semibold text-sm shrink-0 min-w-[1.5em]">
            {num}.
          </span>
          <span className="text-sm text-[#555555] leading-relaxed">
            {renderInlineFormat(entry.content)}
          </span>
        </div>
      );
    }

    case "codeBlock": {
      const lang = (entry.props?.lang as string) ?? "";
      const isShort = entry.content.split("\n").length <= 3;
      if (isShort) {
        // 短代码块显示为行内
        return (
          <code
            className="block bg-[#F5F5F5] text-[#E54545] px-2 py-1 rounded text-xs font-mono my-1 whitespace-pre-wrap break-all"
          >
            {entry.content}
          </code>
        );
      }
      return (
        <div className="my-2 -mx-4">
          {lang && (
            <div className="bg-[#333333] text-white px-3 py-1 text-xs font-medium rounded-t-md -mx-4">
              {lang}
            </div>
          )}
          <code
            className={`block bg-[#1E1E1E] text-[#D4D4D4] p-3 text-xs font-mono overflow-x-auto ${
              lang ? "rounded-b-md" : "rounded-md"
            }`}
          >
            {entry.content}
          </code>
        </div>
      );
    }

    case "empty":
      return <div className="h-1" />;

    default:
      return (
        <p className="text-sm text-[#555555] leading-relaxed my-0.5">
          {renderInlineFormat(entry.content)}
        </p>
      );
  }
}
