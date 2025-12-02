interface EmptyStateProps {
  className?: string
}

export function EmptyState({className = ""}: EmptyStateProps) {
  return (
    <div className={`relative w-full h-full rounded-2xl overflow-hidden ${className}`}>
      {/* Background with gradient overlays */}
      <div className="absolute inset-0 bg-white rounded-2xl" />
      {/* Gradient blobs - positioned for better mobile view */}
      <div className="absolute w-64 h-64 -left-16 bottom-0 bg-emerald-200/80 rounded-full blur-3xl" />
      <div className="absolute w-64 h-64 -left-32 -top-20 bg-emerald-200/80 rounded-full blur-3xl" />
      <div className="absolute w-64 h-64 right-0 -top-10 bg-lime-100 rounded-full blur-[32px]" />
      <div className="absolute w-64 h-64 right-8 top-1/2 bg-orange-50 rounded-full blur-[32px]" />
      {/* Grid pattern - responsive sizing */}
      <div className="absolute inset-0 flex flex-col items-end opacity-100">
        {/* Rows of grid cells */}
        {[...Array(12)].map((_, rowIndex) => {
          // Determine number of cells per row for visual effect
          const cellCount = rowIndex >= 7 && rowIndex <= 9 ? (rowIndex === 7 ? 2 : 1) : 6
          return (
            <div key={rowIndex} className="flex justify-start items-center">
              {[...Array(cellCount)].map((_, cellIndex) => (
                <div
                  key={`${rowIndex}-${cellIndex}`}
                  className="w-12 h-12 sm:w-14 sm:h-14 border-[0.82px] border-white/50"
                />
              ))}
            </div>
          )
        })}
      </div>{" "}
      {/* Content */}
      <div className="relative flex items-center justify-center h-full px-6 py-8">
        <div className="flex flex-col justify-center items-start gap-4 max-w-sm">
          <h2 className="text-gray-900 text-3xl sm:text-4xl font-normal font-['Red_Hat_Display'] leading-tight">
            Waiting for
            <br />
            speech.
          </h2>
          <p className="text-gray-600 text-lg sm:text-xl font-normal font-['Red_Hat_Display'] leading-relaxed">
            Captions appear here as people speak. They&apos;re transient and won&apos;t be saved afterwards.
          </p>
        </div>
      </div>
    </div>
  )
}
