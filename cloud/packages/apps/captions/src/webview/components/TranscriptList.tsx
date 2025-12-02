import {ChevronDown} from "lucide-react"
import {useRef, useEffect, useState} from "react"

// eslint-disable-next-line no-restricted-imports
import {Transcript} from "../hooks/useTranscripts"

import {TranscriptItem} from "./TranscriptItem"
// import {Button} from "@/components/ui/button"

interface TranscriptListProps {
  transcripts: Transcript[]
}

export function TranscriptList({transcripts}: TranscriptListProps) {
  const [autoScroll, setAutoScroll] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (!scrollContainerRef.current) return

    const {scrollTop, scrollHeight, clientHeight} = scrollContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50

    setAutoScroll(isAtBottom)
  }

  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [transcripts, autoScroll])

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      })
    }
  }

  return (
    <div className="h-full flex flex-col relative">
      <div ref={scrollContainerRef} onScroll={handleScroll} className="h-full overflow-y-auto px-6 py-3 space-y-1.5">
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
                />
              </svg>
            </div>
            <p className="text-gray-600 font-medium mb-2">Waiting for conversation</p>
            <p className="text-sm text-gray-500">Transcription will appear here when someone speaks</p>
          </div>
        ) : (
          transcripts.map((transcript, index) => (
            <TranscriptItem
              key={transcript.id}
              transcript={transcript}
              isFirst={index === 0}
              isLast={index === transcripts.length - 1}
            />
          ))
        )}
      </div>

      {/* Scroll to bottom FAB */}
      {!autoScroll && transcripts.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-6 right-6 w-12 h-12 bg-black hover:bg-gray-800 text-white rounded-full shadow-lg flex items-center justify-center transition-all z-10">
          <ChevronDown className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
