import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SourceList from './SourceList.jsx';
import ConflictList from './ConflictList.jsx';

/** One turn in the transcript — user, assistant, or error. */
export default function ChatMessage({ message, prospect }) {
  const isUser = message.role === 'user';
  const isError = message.role === 'error';

  const containerCls = isUser ? 'flex justify-end' : 'flex justify-start';
  const bubbleCls = isUser
    ? 'bg-blue text-white rounded-2xl rounded-br-md px-4 py-3 max-w-[85%]'
    : isError
      ? 'bg-red-50 text-red-800 border border-red-200 rounded-2xl rounded-bl-md px-4 py-3 max-w-[90%]'
      : 'bg-white border border-bd rounded-2xl rounded-bl-md px-4 py-3 max-w-[92%] shadow-sm';

  return (
    <div className={containerCls}>
      <div className={bubbleCls}>
        {message.isLoading ? (
          <LoadingDots />
        ) : isUser || isError ? (
          <div className="whitespace-pre-wrap text-[14px] leading-relaxed">
            {message.content}
          </div>
        ) : (
          <MarkdownBody text={message.content} streaming={message.streaming} />
        )}

        {!isUser && !isError && message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} />
        )}

        {!isUser && !isError && message.conflicts && message.conflicts.length > 0 && (
          <ConflictList conflicts={message.conflicts} prospect={prospect} />
        )}

        {!isUser && !message.isGreeting && message.request_id && (
          <div className="mt-2 text-[10px] text-mute font-mono opacity-60">
            req: {message.request_id}
          </div>
        )}
      </div>
    </div>
  );
}

/** Three-dot placeholder for messages waiting on the backend. */
function LoadingDots() {
  return (
    <div className="flex items-center gap-1 text-[12px] text-mute py-0.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue animate-bounce" />
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue animate-bounce [animation-delay:120ms]" />
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue animate-bounce [animation-delay:240ms]" />
    </div>
  );
}

/**
 * Renders Claude's markdown safely with tight Tailwind styling that fits the
 * chat bubble. We enumerate every element we care about so we can guarantee
 * spacing and colors without pulling in @tailwindcss/typography.
 */
function MarkdownBody({ text, streaming }) {
  const showEmptyCursor = streaming && !text;
  return (
    <div className="text-[14px] leading-relaxed text-ink markdown-body">
      {showEmptyCursor && (
        <span className="stream-cursor" aria-hidden="true">▍</span>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p:  ({ node, ...p }) => <p className="mb-2 last:mb-0" {...p} />,
          h1: ({ node, ...p }) => <h3 className="font-bold text-[15px] mt-2 mb-1.5" {...p} />,
          h2: ({ node, ...p }) => <h3 className="font-bold text-[15px] mt-2 mb-1.5" {...p} />,
          h3: ({ node, ...p }) => <h4 className="font-bold text-[14px] mt-2 mb-1" {...p} />,
          h4: ({ node, ...p }) => <h5 className="font-semibold text-[13px] mt-1.5 mb-1" {...p} />,
          ul: ({ node, ...p }) => <ul className="list-disc pl-5 my-1.5 space-y-1" {...p} />,
          ol: ({ node, ...p }) => <ol className="list-decimal pl-5 my-1.5 space-y-1" {...p} />,
          li: ({ node, ...p }) => <li className="marker:text-blue" {...p} />,
          strong: ({ node, ...p }) => <strong className="font-semibold text-ink" {...p} />,
          em: ({ node, ...p }) => <em className="italic" {...p} />,
          code: ({ node, inline, className, children, ...rest }) =>
            inline ? (
              <code className="bg-bg3 border border-bd rounded px-1 py-0.5 font-mono text-[12.5px]" {...rest}>
                {children}
              </code>
            ) : (
              <pre className="bg-bg3 border border-bd rounded-md p-2 overflow-x-auto my-2">
                <code className="font-mono text-[12px] whitespace-pre" {...rest}>{children}</code>
              </pre>
            ),
          blockquote: ({ node, ...p }) => (
            <blockquote className="border-l-3 border-blue/40 pl-3 my-2 italic text-mute" {...p} />
          ),
          a: ({ node, ...p }) => (
            <a className="text-blue underline hover:text-blue-dark" target="_blank" rel="noopener noreferrer" {...p} />
          ),
          hr: () => <hr className="my-2 border-bd" />,
          table: ({ node, ...p }) => (
            <div className="overflow-x-auto my-2">
              <table className="text-[12.5px] border border-bd border-collapse" {...p} />
            </div>
          ),
          th: ({ node, ...p }) => <th className="border border-bd bg-bg3 px-2 py-1 font-semibold text-left" {...p} />,
          td: ({ node, ...p }) => <td className="border border-bd px-2 py-1" {...p} />,
        }}
      >
        {text}
      </ReactMarkdown>
      {streaming && text && (
        <span className="stream-cursor" aria-hidden="true">▍</span>
      )}
    </div>
  );
}
