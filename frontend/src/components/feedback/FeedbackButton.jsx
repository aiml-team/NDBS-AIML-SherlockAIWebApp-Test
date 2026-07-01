export default function FeedbackButton({ onClick, hidden }) {
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Send feedback"
      title="Send feedback"
      className="fixed bottom-6 right-6 z-[400] w-12 h-12 rounded-full bg-gradient-to-br from-blue to-blue-dark text-white flex items-center justify-center shadow-btnBlueLg hover:shadow-btnBlue hover:-translate-y-[2px] active:translate-y-0 cursor-pointer border-none transition-all duration-200 ease-spring group"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-5 h-5 fill-white"
        aria-hidden="true"
      >
        <path d="M4 4h16c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H7l-4 4V6c0-1.1.9-2 2-2zm2 4v2h12V8H6zm0 4v2h8v-2H6z" />
      </svg>
      <span className="absolute right-full mr-3 px-2.5 py-1 rounded-md bg-ink text-white text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none tracking-tight">
        Send feedback
      </span>
    </button>
  );
}
