import type { ReactNode } from "react";
import { commands, type NewsBlock, type Span } from "@/lib/bindings";
import styles from "./NewsTab.module.css";

/**
 * A post's body. The backend already turned Steam's BBCode/HTML into plain blocks; they are drawn
 * with React elements only (no `innerHTML`), so a post cannot inject markup.
 */
export function NewsBody({ blocks }: { blocks: readonly NewsBlock[] }) {
  const items: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flushList = () => {
    if (list.length > 0) {
      items.push(
        <ul key={`list-${items.length}`} className={styles.list}>
          {list}
        </ul>,
      );
      list = [];
    }
  };

  blocks.forEach((block, index) => {
    if (block.type === "listItem") {
      list.push(
        <li key={index}>
          <Spans spans={block.spans} />
        </li>,
      );
      return;
    }
    flushList();
    switch (block.type) {
      case "heading":
        items.push(
          <h3 key={index} className={styles.heading}>
            {block.text}
          </h3>,
        );
        break;
      case "paragraph":
        items.push(
          <p key={index} className={styles.paragraph}>
            <Spans spans={block.spans} />
          </p>,
        );
        break;
      case "image":
        items.push(
          <img key={index} className={styles.image} src={block.src} alt="" loading="lazy" />,
        );
        break;
    }
  });
  flushList();
  return <div className={styles.body}>{items}</div>;
}

function Spans({ spans }: { spans: readonly Span[] }) {
  return spans.map((span, index) => {
    let content: ReactNode = span.text;
    if (span.italic) content = <em>{content}</em>;
    if (span.bold) content = <strong>{content}</strong>;
    if (span.href) {
      const href = span.href;
      content = (
        <a
          href={href}
          className={styles.link}
          onClick={(event) => {
            // Links open in the browser, never inside Vapor's window.
            event.preventDefault();
            void commands.openLink(href).catch(() => undefined);
          }}
        >
          {content}
        </a>
      );
    }
    return <span key={index}>{content}</span>;
  });
}
