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
    <div className="w-96 h-[844px] relative bg-zinc-100 inline-flex flex-col justify-between items-center overflow-hidden">
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
      <div className="self-stretch flex-1 p-6 flex flex-col justify-center items-start gap-2.5">
        {/* Status indicator */}
        <StatusBar isListening={connected} />

        {/* Content - Empty state or transcript list */}
        {hasTranscripts ? <TranscriptList transcripts={transcripts} /> : <EmptyState className="w-80 flex-1" />}
      </div>

      {/* Home indicator bar */}
      <div className="w-96 h-14 px-6 py-2 bg-neutral-100/50 backdrop-blur-lg inline-flex justify-between items-center">
        <div className="w-24 h-[3px] bg-background rounded-2xl" />
      </div>

      {/* Bottom navigation */}
      <div className="absolute bottom-0 left-0 right-0">
        <BottomNav activeTab="captions" />
      </div>
    </div>
  )
}

export default App
