import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ChatMarkdownProps = {
  content: string;
  className?: string;
  /** When true, use inverted (light-on-dark) styles for user bubbles */
  inverted?: boolean;
};

/** Render common AI markdown: **bold**, *italic*, `code`, lists, headers, links. */
export function ChatMarkdown({ content, className, inverted }: ChatMarkdownProps) {
  const lines = (content || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let listBuf: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!listBuf) return;
    const Tag = listBuf.ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`list-${blocks.length}`}
        className={cn(
          "my-1.5 space-y-1 pl-5",
          listBuf.ordered ? "list-decimal" : "list-disc",
        )}
      >
        {listBuf.items.map((item, idx) => (
          <li key={idx}>{renderInline(item, inverted)}</li>
        ))}
      </Tag>,
    );
    listBuf = null;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      blocks.push(<div key={`br-${i}`} className="h-2" />);
      i += 1;
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (orderedMatch || bulletMatch) {
      const ordered = !!orderedMatch;
      const text = orderedMatch ? orderedMatch[2] : bulletMatch![1];
      if (!listBuf || listBuf.ordered !== ordered) {
        flushList();
        listBuf = { ordered, items: [] };
      }
      listBuf.items.push(text);
      i += 1;
      continue;
    }

    flushList();

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const headingClass =
        level === 1
          ? "text-base font-bold mt-1 mb-1"
          : level === 2
            ? "text-sm font-bold mt-1 mb-0.5"
            : "text-sm font-semibold mt-1 mb-0.5";
      blocks.push(
        <p key={`h-${i}`} className={headingClass}>
          {renderInline(text, inverted)}
        </p>,
      );
      i += 1;
      continue;
    }

    blocks.push(
      <p key={`p-${i}`} className="my-0.5 leading-relaxed">
        {renderInline(trimmed, inverted)}
      </p>,
    );
    i += 1;
  }

  flushList();

  return (
    <div
      className={cn(
        "text-sm break-words [&_strong]:font-semibold [&_em]:italic",
        inverted && "[&_code]:bg-white/20 [&_a]:underline [&_a]:text-inherit",
        !inverted && "[&_code]:bg-black/10 [&_a]:text-primary [&_a]:underline",
        className,
      )}
    >
      {blocks}
    </div>
  );
}

function renderInline(text: string, inverted?: boolean): ReactNode[] {
  // Links, bold, italic, inline code — process left-to-right
  const pattern =
    /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|_([^_]+)_)/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<Fragment key={`t-${key++}`}>{text.slice(last, match.index)}</Fragment>);
    }

    if (match[2] && match[3]) {
      nodes.push(
        <a
          key={`a-${key++}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className={inverted ? "underline" : undefined}
        >
          {match[2]}
        </a>,
      );
    } else if (match[4] || match[5]) {
      nodes.push(<strong key={`b-${key++}`}>{match[4] || match[5]}</strong>);
    } else if (match[6]) {
      nodes.push(
        <code key={`c-${key++}`} className="rounded px-1 py-0.5 text-[0.85em] font-mono">
          {match[6]}
        </code>,
      );
    } else if (match[7] || match[8]) {
      nodes.push(<em key={`i-${key++}`}>{match[7] || match[8]}</em>);
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(<Fragment key={`t-${key++}`}>{text.slice(last)}</Fragment>);
  }

  return nodes.length > 0 ? nodes : [text];
}
