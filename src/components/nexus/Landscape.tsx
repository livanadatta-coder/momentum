export function Landscape() {
  return (
    <div className="relative h-40 overflow-hidden rounded-b-[18px] bg-[#f8e8d6]">
      <div className="absolute inset-x-0 bottom-0 h-28 rounded-t-[50%] bg-[#c7d9b7]" />
      <div className="absolute -left-8 bottom-0 h-24 w-60 rounded-t-[70%] bg-[#9fc69f]" />
      <div className="absolute -right-8 bottom-0 h-32 w-72 rounded-t-[70%] bg-[#dfe7c9]" />
      <div className="absolute bottom-9 left-1/2 h-9 w-9 -translate-x-1/2 rounded-full bg-coral shadow-[0_0_30px_rgba(247,107,88,0.28)]" />
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#82b483]/60 to-transparent" />
    </div>
  );
}
