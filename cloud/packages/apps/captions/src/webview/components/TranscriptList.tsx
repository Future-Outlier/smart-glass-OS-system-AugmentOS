import {useRef, useEffect, useState} from "react"
import {ChevronDown} from "lucide-react"
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
    <>
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
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
          transcripts.map((transcript) => <TranscriptItem key={transcript.id} transcript={transcript} />)
        )}
      </div>

      {/* Scroll to bottom FAB */}
      {!autoScroll && transcripts.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-6 right-6 w-14 h-14 bg-black hover:bg-gray-800 text-white rounded-full shadow-lg flex items-center justify-center transition-all">
          <ChevronDown className="w-6 h-6" />
        </button>
      )}
    </>
  )
}
