export default function SubmitButton({ children, loading, disabled, ...rest }) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      className="w-full mt-1 inline-flex items-center justify-center gap-2 bg-blue text-white border-none font-sans font-bold text-[15px] px-5 py-3.5 rounded-full cursor-pointer transition-all shadow-[0_8px_22px_rgba(37,99,235,0.35)] hover:bg-blue-dark hover:shadow-[0_10px_28px_rgba(37,99,235,0.45)] hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      {...rest}
    >
      {loading && (
        <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/35 border-t-white animate-spin" />
      )}
      {children}
    </button>
  );
}
