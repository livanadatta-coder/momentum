const bars = [38, 22, 56, 30, 68, 74];

export function BarRhythm() {
  return (
    <div className="mt-5 flex h-24 items-end gap-3 rounded-[14px] bg-[#fbfaf7] p-4">
      {bars.map((height, index) => (
        <div key={height + index} className="flex flex-1 items-end gap-1">
          <span className="w-full rounded-t-sm bg-sky/70" style={{ height: `${height}%` }} />
          <span className="w-full rounded-t-sm bg-sage/55" style={{ height: `${Math.min(height + 18, 92)}%` }} />
        </div>
      ))}
    </div>
  );
}
