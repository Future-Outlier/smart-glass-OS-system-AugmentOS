import {Transcript} from "../hooks/useTranscripts"
import {getSpeakerColor} from "../lib/colors"

interface TranscriptItemProps {
  transcript: Transcript
}

export function TranscriptItem({transcript}: TranscriptItemProps) {
  const colorClass = getSpeakerColor(transcript.speaker)

  return (
    <div className={`p-4 rounded-lg border ${colorClass} space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">{transcript.speaker}</span>
        {transcript.timestamp && <span className="text-xs text-gray-500">{transcript.timestamp}</span>}
        {!transcript.isFinal && <span className="text-xs text-gray-400 italic">Now</span>}
      </div>
      <p className={`text-base leading-relaxed ${transcript.isFinal ? "text-gray-900" : "text-gray-600 italic"}`}>
        {transcript.text}
      </p>
    </div>
  )
}
