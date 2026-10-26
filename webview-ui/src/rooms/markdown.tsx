import type { ReactNode } from 'react';

const INLINE =
  /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\((?:https?:\/\/)[^)\s]+\)|https?:\/\/[^\s<>)]+)/g;
const LIST_ITEM = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-bright hover:text-accent underline break-all"
    >
      {children}
    </a>
  );
}

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    if (token.startsWith('**')) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key++} className="bg-bg-dark px-2">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('[')) {
      const close = token.indexOf('](');
      nodes.push(
        <Link key={key++} href={token.slice(close + 2, -1)}>
          {token.slice(1, close)}
        </Link>,
      );
    } else {
      const url = token.replace(/[.,;:!?]+$/, '');
      nodes.push(
        <Link key={key++} href={url}>
          {url}
        </Link>,
      );
      if (url.length < token.length) nodes.push(token.slice(url.length));
    }
    last = start + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function paragraph(lines: string[], key: number): ReactNode {
  return (
    <p key={key} className="m-0 whitespace-pre-wrap break-words">
      {lines.flatMap((line, index) => [
        ...(index > 0 ? [<br key={`br-${index}`} />] : []),
        ...inline(line),
      ])}
    </p>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split('\n');
  let key = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (line.trimStart().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre
          key={key++}
          className="m-0 bg-bg-dark px-6 py-4 whitespace-pre-wrap break-words text-[0.8em]"
        >
          {code.join('\n')}
        </pre>,
      );
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push(
        <div key={key++} className="font-bold">
          {inline(heading[1])}
        </div>,
      );
      i++;
      continue;
    }
    if (line.trimStart().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('|')) rows.push(lines[i++]);
      blocks.push(
        <pre key={key++} className="m-0 overflow-x-auto whitespace-pre text-[0.8em]">
          {rows.join('\n')}
        </pre>,
      );
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        const item = LIST_ITEM.exec(lines[i]) as RegExpExecArray;
        const depth = Math.min(3, Math.floor(item[1].length / 2));
        items.push(
          <li
            key={items.length}
            className="flex gap-6 break-words"
            style={{ marginLeft: `${depth * 12}px` }}
          >
            <span className="shrink-0">{/\d/.test(item[2]) ? item[2] : '•'}</span>
            <span className="min-w-0">{inline(item[3])}</span>
          </li>,
        );
        i++;
      }
      blocks.push(
        <ul key={key++} className="m-0 pl-4 list-none">
          {items}
        </ul>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].trimStart().startsWith('|') &&
      !HEADING.test(lines[i]) &&
      !LIST_ITEM.test(lines[i])
    ) {
      para.push(lines[i].replace(/^>\s?/, ''));
      i++;
    }
    blocks.push(paragraph(para, key++));
  }
  return <div className="flex flex-col gap-4">{blocks}</div>;
}
