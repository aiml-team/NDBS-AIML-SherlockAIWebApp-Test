import { useEffect, useRef, useState } from 'react';
import ChatMessage from './ChatMessage.jsx';
import ChatInput from './ChatInput.jsx';
import { chatAsk, chatAskStream, chatGreeting, getProspectConflicts } from '../../lib/api.js';

// Last-resort fallback — used only if BOTH the network call AND the server's
// own fallback path fail. The server usually returns its own static
// fallback message when Claude is unavailable, so this rarely fires.
const STATIC_FALLBACK_GREETING =
  'Hello — ask me anything about the indexed prospect discovery documents.';

/**
 * Floating chat widget — a fixed circular button in the bottom-right corner
 * that opens a compact chat panel. Talks to POST /api/rag/chat.
 *
 * The widget is stateless; each question is a fresh RAG round-trip.
 */
// Resize bounds (px). Keep panel usable on small screens too.
const MIN_W = 320, MAX_W = 900;
const MIN_H = 360, MAX_H = 900;
const DEFAULT_W = 380, DEFAULT_H = 560;

function _loadSize() {
  try {
    const raw = localStorage.getItem('sherlock.chat.size');
    if (!raw) return { w: DEFAULT_W, h: DEFAULT_H };
    const { w, h } = JSON.parse(raw);
    return {
      w: Math.min(MAX_W, Math.max(MIN_W, Number(w) || DEFAULT_W)),
      h: Math.min(MAX_H, Math.max(MIN_H, Number(h) || DEFAULT_H)),
    };
  } catch (_) {
    return { w: DEFAULT_W, h: DEFAULT_H };
  }
}

export default function ChatWidget({ prospect = null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [size, setSize] = useState(_loadSize);
  const transcriptRef = useRef(null);
  // Always-current ref so async callbacks (handleSend) never capture a stale prospect
  const prospectRef = useRef(prospect);
  useEffect(() => { prospectRef.current = prospect; }, [prospect]);

  // Persist the last chosen size (debounced via effect — one write per change).
  useEffect(() => {
    try {
      localStorage.setItem('sherlock.chat.size', JSON.stringify(size));
    } catch (_) { /* quota / private-mode — silently ignore */ }
  }, [size]);

  // Start a drag from the top-left corner. We compute the new width/height
  // from mouse position: dragging up-and-left makes the panel bigger
  // (natural, since the panel is anchored to bottom-right).
  function startResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.w;
    const startH = size.h;

    const onMove = (ev) => {
      const dx = startX - ev.clientX;   // drag left → dx > 0 → wider
      const dy = startY - ev.clientY;   // drag up   → dy > 0 → taller
      const w = Math.min(MAX_W, Math.max(MIN_W, startW + dx));
      const h = Math.min(MAX_H, Math.max(MIN_H, startH + dy));
      setSize({ w, h });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'nwse-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Ask the backend for a freshly generated greeting whenever the widget
  // opens on an empty transcript. History is preserved if the user just
  // closed-and-reopened the panel without clearing.
  // When on a ViewProspect page, also fetch unresolved conflicts and attach
  // them to the greeting bubble so "Keep A / Keep B" buttons appear immediately.
  useEffect(() => {
    if (!open || messages.length > 0) return;
    let cancelled = false;
    const greetingId = Date.now();
    seedGreeting({
      onLoading: () => {
        if (cancelled) return;
        setMessages([{
          role: 'assistant',
          content: '',
          sources: [],
          id: greetingId,
          isGreeting: true,
          isLoading: true,
        }]);
      },
      onReady: async (text) => {
        if (cancelled) return;
        const base = {
          role: 'assistant',
          content: text,
          sources: [],
          id: greetingId,
          isGreeting: true,
        };
        setMessages([base]);
        // If we're on a prospect page, fetch its unresolved conflicts and
        // show them right below the greeting so the user can act immediately.
        if (prospect) {
          try {
            const conflicts = await getProspectConflicts(prospect);
            if (!cancelled && conflicts.length > 0) {
              setMessages((prev) => prev.map((m) =>
                m.id === greetingId ? { ...m, conflicts } : m
              ));
            }
          } catch (_) { /* non-fatal */ }
        }
      },
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When prospect changes (user navigates to a ViewProspect page while chat
  // is already open), attach conflicts to the first greeting bubble.
  useEffect(() => {
    if (!open || !prospect) return;
    getProspectConflicts(prospect).then((conflicts) => {
      if (!conflicts.length) return;
      setMessages((prev) => {
        const firstGreeting = prev.findIndex((m) => m.isGreeting);
        if (firstGreeting === -1) return prev;
        // Only attach if not already attached
        if (prev[firstGreeting].conflicts) return prev;
        const updated = [...prev];
        updated[firstGreeting] = { ...updated[firstGreeting], conflicts };
        return updated;
      });
    }).catch(() => {});
  }, [prospect, open]);

  // Auto-scroll to the bottom when new messages arrive — but only if the
  // user is already at (or very near) the bottom. If they've scrolled up
  // to re-read older messages, DON'T yank them back down.
  useEffect(() => {
    if (!open) return;
    const el = transcriptRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 80) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, sending, open]);

  // While a response is streaming, keep the growing bubble in view — but
  // only while the user hasn't scrolled up. Checking the same 80 px
  // threshold on every animation frame means the moment the user drags the
  // scrollbar upward, auto-scroll disengages until they return to the
  // bottom on their own.
  useEffect(() => {
    if (!open || !sending) return;
    let raf;
    const tick = () => {
      const el = transcriptRef.current;
      if (el) {
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distanceFromBottom < 80) {
          el.scrollTop = el.scrollHeight;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, sending]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function handleSend() {
    const question = input.trim();
    if (!question || sending) return;
    const currentProspect = prospectRef.current;
    console.log('[ChatWidget] handleSend prospect=', currentProspect, 'question=', question);
    setInput('');
    setSending(true);

    const userId = Date.now();
    const assistantId = userId + 1;
    const userMsg = { role: 'user', content: question, id: userId };
    const placeholder = {
      role: 'assistant',
      content: '',
      sources: [],
      streaming: true,
      id: assistantId,
    };
    setMessages((prev) => [...prev, userMsg, placeholder]);

    // Typewriter buffer. The Foundry proxy buffers Anthropic's per-token
    // deltas into 100-200 char blocks (~15 blocks for a 2 KB answer), so
    // raw streaming looks like "chunks appearing" rather than "typing".
    // We keep an outstanding buffer of characters that have arrived from
    // the server but not yet been shown, and drain it 3 chars/tick at
    // ~16 ms/tick (~180 chars/sec) — feels like ChatGPT typing.
    let pending = '';
    let streamFinished = false;
    let finalRequestId = null;
    let gotAnyDelta = false;

    const CHARS_PER_TICK = 3;
    const TICK_MS = 16;

    const drain = () => {
      if (pending.length === 0) {
        if (streamFinished) {
          setMessages((prev) => prev.map(
            (m) => (m.id === assistantId
              ? { ...m, streaming: false, request_id: finalRequestId }
              : m)));
          setSending(false);
          return;
        }
        // Nothing to reveal yet; check again next tick.
        setTimeout(drain, TICK_MS);
        return;
      }
      const take = Math.min(CHARS_PER_TICK, pending.length);
      const slice = pending.slice(0, take);
      pending = pending.slice(take);
      setMessages((prev) => prev.map(
        (m) => (m.id === assistantId
          ? { ...m, content: (m.content || '') + slice }
          : m)));
      setTimeout(drain, TICK_MS);
    };
    setTimeout(drain, TICK_MS);

    await chatAskStream({
      question,
      prospect: currentProspect,
      onSources: (sources) => {
        setMessages((prev) => prev.map(
          (m) => (m.id === assistantId ? { ...m, sources } : m)));
      },
      onDelta: (text) => {
        gotAnyDelta = true;
        pending += text;
      },
      onConflicts: (conflicts) => {
        setMessages((prev) => prev.map(
          (m) => (m.id === assistantId ? { ...m, conflicts } : m)));
      },
      onDone: ({ request_id }) => {
        streamFinished = true;
        finalRequestId = request_id;
      },
      onError: async ({ error, request_id }) => {
        // Stop the typewriter loop.
        streamFinished = true;
        // If we never got a single token, try the non-streaming endpoint
        // once as a safety net.
        if (!gotAnyDelta) {
          try {
            const resp = await chatAsk({ question, prospect: currentProspect });
            pending = '';
            setMessages((prev) => prev.map(
              (m) => (m.id === assistantId
                ? {
                    ...m,
                    content: resp.answer,
                    sources: resp.sources || [],
                    request_id: resp.request_id,
                    streaming: false,
                  }
                : m)));
            setSending(false);
            return;
          } catch (_) { /* fall through */ }
        }
        setMessages((prev) => {
          const filtered = prev.filter(
            (m) => !(m.id === assistantId && !m.content && pending.length === 0));
          const marked = filtered.map(
            (m) => (m.id === assistantId ? { ...m, streaming: false } : m));
          return [...marked, {
            role: 'error',
            content: error || 'The chat request failed.',
            request_id,
            id: Date.now() + 2,
          }];
        });
        setSending(false);
      },
    });
  }

  function handleNewChat() {
    setInput('');
    // Fresh transcript + a fresh Claude-generated greeting.
    let cancelled = false;
    seedGreeting({
      onLoading: () => {
        if (cancelled) return;
        setMessages([{
          role: 'assistant',
          content: '',
          sources: [],
          id: Date.now(),
          isGreeting: true,
          isLoading: true,
        }]);
      },
      onReady: (text) => {
        if (cancelled) return;
        setMessages([{
          role: 'assistant',
          content: text,
          sources: [],
          id: Date.now(),
          isGreeting: true,
        }]);
      },
    });
    return () => { cancelled = true; };
  }

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────── */}
      <div className="fixed bottom-5 right-5 z-[300] w-14 h-14">
        {/* Soft pulse halo — only when idle (button closed) */}
        {!open && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full bg-btn-blue opacity-55 animate-chat-ping pointer-events-none"
          />
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Close chat' : 'Open chat'}
          aria-expanded={open}
          className={`relative w-14 h-14 rounded-full bg-btn-blue text-white shadow-btnBlueLg hover:-translate-y-[2px] active:translate-y-0 transition-transform duration-200 ease-spring flex items-center justify-center text-[22px] focus:outline-none focus:ring-4 focus:ring-blue/40 ${
            open ? '' : 'animate-chat-float'
          }`}
        >
          <span aria-hidden="true">
            {open ? '✕' : '💬'}
          </span>
        </button>
      </div>

      {/* ── Chat panel ──────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-label="Document chat"
          style={{
            width: `min(${size.w}px, calc(100vw - 2.5rem))`,
            height: `min(${size.h}px, calc(100vh - 8rem))`,
          }}
          className="fixed z-[400] bg-white border border-bd shadow-2xl flex flex-col
                     bottom-24 right-5
                     rounded-2xl overflow-hidden
                     sm:bottom-24 sm:right-5"
        >
          {/* Drag handle in the top-left corner. Grab and drag up-left to
              enlarge, down-right to shrink. The visible triangle plus a
              generous 18 px hit area make it easy to grab on any DPI. */}
          <div
            onMouseDown={startResize}
            role="separator"
            aria-label="Resize chat panel"
            title="Drag to resize"
            className="absolute top-0 left-0 z-10 w-[18px] h-[18px] cursor-nwse-resize
                       flex items-start justify-start"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
                 className="text-white/70 pointer-events-none">
              <path d="M1 6 L6 1 M1 10 L10 1 M1 14 L14 1"
                    stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          </div>
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-btn-blue text-white flex-shrink-0">
            <div className="min-w-0">
              <div className="text-[14px] font-bold leading-tight">Sherlock AI Assistant</div>
              {prospect && (
                <div className="text-[11px] text-white/75 mt-0.5 truncate">{prospect}</div>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={handleNewChat}
                aria-label="Start new chat"
                title="New chat"
                className="text-white/85 hover:text-white px-2 py-1 rounded-md text-[11px] font-semibold hover:bg-white/15"
              >
                New
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="text-white/85 hover:text-white w-7 h-7 rounded-md hover:bg-white/15 flex items-center justify-center text-[15px]"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          <div
            ref={transcriptRef}
            className="flex-1 overflow-y-auto bg-bg-subtle px-3 py-3 space-y-2"
          >
            {messages.map((m) => <ChatMessage key={m.id} message={m} prospect={prospect} />)}

            {/* Show quick-start prompt chips right after the greeting, until
                the user asks their first real question. */}
            {messages.length === 1 && messages[0].isGreeting && !sending && (
              <SuggestionChips prospect={prospect} onPick={(q) => setInput(q)} />
            )}

            {/* When sending, progress is shown inside the streaming assistant
                bubble itself (empty bubble → sources chips → blinking cursor
                → typing text). No separate "Thinking…" placeholder is needed
                — showing one below the growing bubble hides the answer. */}
          </div>

          {/* Input */}
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={sending}
          />
        </div>
      )}
    </>
  );
}

/**
 * Fetch a fresh assistant greeting from POST /api/rag/greeting.
 *
 * ``onLoading`` is invoked synchronously so the caller can seed a loading
 * placeholder before the network round-trip. ``onReady`` is invoked with
 * the final greeting text (real Claude output, server-side fallback, or
 * client-side fallback — never an empty string).
 */
async function seedGreeting({ onLoading, onReady }) {
  onLoading?.();
  let text;
  try {
    const resp = await chatGreeting();
    text = (resp?.greeting || '').trim() || STATIC_FALLBACK_GREETING;
  } catch {
    text = STATIC_FALLBACK_GREETING;
  }
  onReady?.(text);
}

function SuggestionChips({ prospect, onPick }) {
  const samples = prospect
    ? [
        `What conflicts exist for ${prospect}?`,
        `Summarise ${prospect}'s pain points.`,
        'Which SAP modules were discussed?',
      ]
    : [
        'Summarise finance pain points.',
        'Which SAP modules were discussed?',
        'Compare the top 3 prospects.',
      ];
  return (
    <div className="pl-1 pr-2 pt-1 pb-1">
      <div className="text-[10px] font-semibold text-mute uppercase tracking-wider mb-1.5 pl-1">
        Try asking
      </div>
      <div className="flex flex-wrap gap-1.5">
        {samples.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="text-[11.5px] text-blue-dark bg-blue-lt border border-blue-mid hover:bg-blue hover:text-white hover:border-blue rounded-full px-2.5 py-1 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
