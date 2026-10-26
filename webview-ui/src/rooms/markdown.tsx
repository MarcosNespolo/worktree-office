import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { serverToken } from '../transport/serverToken.js';

const OFFICE_IMAGE = /^\/api\/images\/[0-9a-f]{20}$/;

function officeImageUrl(src: unknown): string | null {
  if (typeof src !== 'string' || !OFFICE_IMAGE.test(src) || !serverToken) return null;
  return `${src}?token=${encodeURIComponent(serverToken)}`;
}

const components: Components = {
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ src, alt }) => {
    const url = officeImageUrl(src);
    if (!url) return <span className="text-ink-faint">[image]</span>;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" title="Open the image">
        <img src={url} alt={alt || 'image'} loading="lazy" />
      </a>
    );
  },
};

const plugins = [remarkGfm];

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
