import {BottomNav} from "./components/BottomNav"
import {EmptyState} from "./components/EmptyState"
import {Header} from "./components/Header"
import {StatusBar} from "./components/StatusBar"
import {TranscriptList} from "./components/TranscriptList"
import {useSettings} from "./hooks/useSettings"
import {useTranscripts} from "./hooks/useTranscripts"
import "./index.css"

export function App() {
  const {transcripts, connected} = useTranscripts()
  const {settings, updateLanguage, updateLanguageHints, updateDisplayLines, updateDisplayWidth} = useSettings()

  const hasTranscripts = transcripts.length > 0

  return (
    <div className="w-screen mx-auto h-screen relative bg-zinc-100 flex flex-col overflow-hidden">
      {/* Header */}
      <Header
        connected={connected}
        settings={settings}
        onUpdateLanguage={updateLanguage}
        onUpdateHints={updateLanguageHints}
        onUpdateDisplayLines={updateDisplayLines}
        onUpdateDisplayWidth={updateDisplayWidth}
      />

      {/* Main content area */}
      <div className="flex-1 px-6 py-4 flex flex-col items-start gap-2.5 overflow-hidden">
        {/* Status indicator */}
        <StatusBar isListening={connected} />

        {/* Content - Empty state or transcript list */}
        <div className="w-full flex-1 min-h-0">
          {hasTranscripts ? <TranscriptList transcripts={transcripts} /> : <EmptyState />}
        </div>
      </div>

      {/* Home indicator bar */}
      <div className="w-full h-14 px-6 py-2 bg-neutral-100/50 backdrop-blur-lg flex justify-center items-center">
        <div className="w-24 h-[3px] bg-gray-400 rounded-2xl" />
      </div>

      {/* Bottom navigation */}
      <div className="w-full">
        <BottomNav activeTab="captions" />
      </div>
    </div>
  )
}

export default App
