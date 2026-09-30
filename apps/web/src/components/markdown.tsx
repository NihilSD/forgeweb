import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders markdown without raw HTML (react-markdown ignores HTML unless rehype-raw is added, and
 * we never add it). Links open safely and only http(s)/mailto URLs are kept (spec 3.2).
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-forge">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) => (/^(https?:|mailto:|\/(?!\/)|#)/i.test(url) ? url : '')}
        components={{
          a: ({ href, children: c }) => (
            <a
              href={href}
              rel="noopener noreferrer nofollow"
              target={href?.startsWith('/') ? undefined : '_blank'}
            >
              {c}
            </a>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
