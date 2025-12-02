import {BottomNav} from "./components/BottomNav"
import {EmptyState} from "./components/EmptyState"
import {Header} from "./components/Header"
import {TranscriptList} from "./components/TranscriptList"
import {useSettings} from "./hooks/useSettings"
import {useTranscripts} from "./hooks/useTranscripts"
import "./index.css"
// import {StatusBar} from "./components/StatusBar"

export function App() {
  const {transcripts, connected} = useTranscripts()
  const {settings, updateLanguage, updateLanguageHints, updateDisplayLines, updateDisplayWidth} = useSettings()

  const hasTranscripts = transcripts.length > 0

  return (
    <div className="w-full max-w-md mx-auto h-screen relative bg-zinc-100 flex flex-col overflow-hidden">
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
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Status indicator */}
        {/*<div className="px-6 pt-4">
          <StatusBar isListening={connected} />
        </div>*/}

        {/* Content - Empty state or transcript list - This needs to scroll */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {hasTranscripts ? <TranscriptList transcripts={transcripts} /> : <EmptyState />}
        </div>
      </div>

      {/* Bottom navigation with home indicator inside */}
      <div className="w-full">
        <BottomNav activeTab="captions" />
      </div>
    </div>
  )
}

export default App
