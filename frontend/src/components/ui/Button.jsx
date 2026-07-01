const variants = {
  primary:
    'bg-btn-blue text-white border-none shadow-btnBlue hover:shadow-btnBlueLg hover:-translate-y-[1px] active:translate-y-0 active:shadow-btnBlue',
  success:
    'bg-btn-green text-white border-none shadow-btnGreen hover:shadow-btnGreenLg hover:-translate-y-[1px] active:translate-y-0 active:shadow-btnGreen',
  successSolid:
    'bg-green text-white border-none shadow-btnGreen hover:opacity-95 hover:-translate-y-[1px] active:translate-y-0',
  ghostBlue:
    'bg-white text-blue border border-bd hover:border-blue-mid hover:bg-blue-lt hover:text-blue-dark',
  ghostRed:
    'bg-white text-ink-muted border border-bd hover:border-red-mid hover:bg-red-lt hover:text-red',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-3.5 py-1.5 text-[12px] rounded-lg',
  lg: 'px-[18px] py-2.5 text-[13.5px] rounded-[10px]',
  xl: 'px-5 py-3 text-sm rounded-[10px]',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'lg',
  className = '',
  ...rest
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 font-sans font-semibold cursor-pointer transition-all duration-200 ease-spring whitespace-nowrap ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
