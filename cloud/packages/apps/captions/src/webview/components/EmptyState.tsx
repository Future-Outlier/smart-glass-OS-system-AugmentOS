interface EmptyStateProps {
  className?: string
}

export function EmptyState({className = ""}: EmptyStateProps) {
  return (
    <div className={`relative rounded-2xl overflow-hidden ${className}`}>
      {/* Background with gradient overlays */}
      <div className="absolute inset-0 bg-background rounded-2xl" />

      {/* Gradient blobs */}
      <div className="absolute w-72 h-72 -left-[69px] top-[400px] bg-emerald-200/80 rounded-full blur-3xl" />
      <div className="absolute w-72 h-72 -left-[229px] -top-[150px] bg-emerald-200/80 rounded-full blur-3xl" />
      <div className="absolute w-72 h-72 left-[164px] -top-[59px] bg-lime-100 rounded-full blur-[32px]" />
      <div className="absolute w-72 h-72 left-[118px] top-[206px] bg-orange-50 rounded-full blur-[32px]" />

      {/* Grid pattern */}
      <div className="absolute left-[1px] top-0 w-full inline-flex flex-col justify-start items-end">
        {/* Row 1 */}
        <div className="inline-flex justify-start items-center">
          {[...Array(6)].map((_, i) => (
            <div key={`1-${i}`} className="w-14 h-14 border-[0.82px] border-white/50" />
          ))}
        </div>
        {/* Row 2 */}
        <div className="inline-flex justify-start items-center">
          {[...Array(6)].map((_, i) => (
            <div key={`2-${i}`} className="w-14 h-14 border-[0.82px] border-white/50" />
          ))}
        </div>
        {/* Row 3 */}
        <div className="inline-flex justify-start items-center">
          {[...Array(6)].map((_, i) => (
            <div key={`3-${i}`} className="w-14 h-14 border-[0.82px] border-white/50" />
          ))}
        </div>
        {/* Row 4 */}
        <div className="inline-flex justify-start items-center">
          {[...Array(6)].map((_, i) => (
            <div key={`4-${i}`} className="w-14 h-14 border-[0.82px] border-white/50" />
          ))}
        </div>
        {/* Row 5 */}
        <div className="inline-flex justify-start items-center">
          {[...Array(6)].map((_, i) => (
            <div key={`5-${i}`} className="w-14 h-14 border-[0.82px] border-white/50" />
          ))}
        </div>
        {/* Row 6 */}
        <div className="inline-flex justify-start items-center">
          {[...Array(6)].map((_, i) => (
            <div key={`6-${i}`} className="w-14 h-14 border-[0.82px] border-white/50" />
          ))}
        </div>
        {/* Row 7 */}
        <div className="inline-flex justify-start items-center">
          {[...Array(6)].map((_, i) => (
            <div key={`7-${i}`} className="w-14 h-14 border-[0.82px] border-white/50" />
          ))}
        </div>
        {/* Row 8 - 2 cells */}
        <div className="inline-flex justify-start items-center">
          {[...Array(2)].map((_, i) => (
            <div key={`8-${i}`} className="w-14 h-14 border-[0.82px] border-white/50" />
          ))}
        </div>
        {/* Row 9 - 1 cell */}
        <div className="inline-flex justify-start items-center">
          <div className="w-14 h-14 border-[0.82px] border-white/50" />
        </div>
        {/* Row 10 - 1 cell */}
        <div className="inline-flex justify-start items-center">
          <div className="w-14 h-14 border-[0.82px] border-white/50" />
        </div>
        {/* Row 11 */}
        <div className="inline-flex justify-start items-center">
          {[...Array(6)].map((_, i) => (
            <div key={`11-${i}`} className="w-14 h-14 border-[0.82px] border-white/50" />
          ))}
        </div>
        {/* Row 12 */}
        <div className="inline-flex justify-start items-center">
          {[...Array(6)].map((_, i) => (
            <div key={`12-${i}`} className="w-14 h-14 border-[0.82px] border-white/50" />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="relative left-[17px] top-[340.75px] inline-flex flex-col justify-start items-start gap-4">
        <div className="flex flex-col justify-start items-start gap-1.5">
          <h2 className="text-secondary-foreground text-4xl font-normal font-['Red_Hat_Display'] leading-[47.20px]">
            Waiting for <br />
            speech.
          </h2>
          <p className="w-80 text-accent-foreground text-xl font-normal font-['Red_Hat_Display']">
            Captions appear here as people speak. They&apos;re transient and won&apos;t be saved afterwards.
          </p>
        </div>
      </div>
    </div>
  )
}
