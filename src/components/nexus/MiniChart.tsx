export function MiniChart() {
  return (
    <div className="mt-5 h-24 rounded-[14px] bg-[#fbfaf7] p-4">
      <svg viewBox="0 0 240 80" className="h-full w-full" role="img" aria-label="Focus score trend">
        <path
          d="M8 58 C32 42, 46 50, 62 38 S92 50, 112 28 S142 40, 156 22 S190 52, 232 12"
          fill="none"
          stroke="#7CC594"
          strokeLinecap="round"
          strokeWidth="4"
        />
        <path
          d="M8 58 C32 42, 46 50, 62 38 S92 50, 112 28 S142 40, 156 22 S190 52, 232 12 L232 80 L8 80 Z"
          fill="rgba(124,197,148,0.14)"
        />
      </svg>
    </div>
  );
}
