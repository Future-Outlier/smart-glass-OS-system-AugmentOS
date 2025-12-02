import { useState } from "react"
import { BottomNav } from "./components/BottomNav"
import { EmptyState } from "./components/EmptyState"
import { Header } from "./components/Header"
import { StatusBar } from "./components/StatusBar"
import { TranscriptList } from "./components/TranscriptList"
import { Settings } from "./components/Settings"
import { useSettings } from "./hooks/useSettings"
import { useTranscripts } from "./hooks/useTranscripts"
import "./index.css"

export function App() {
  const { transcripts, connected } = useTranscripts()
  const { settings, updateLanguage, updateLanguageHints, updateDisplayLines, updateDisplayWidth } = useSettings()
  const [activeTab, setActiveTab] = useState<"captions" | "settings">("captions")

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
        {activeTab === "captions" && (
          <>
            <div className="px-6 pt-4">
              {/* Status indicator */}
              <StatusBar isListening={connected} />
            </div>

            {/* Content - Empty state or transcript list - This needs to scroll */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {hasTranscripts ? <TranscriptList transcripts={transcripts} /> : <EmptyState />}
            </div>
          </>
        )}

        {activeTab === "settings" && (
          <Settings
            settings={settings}
            onUpdateLanguage={updateLanguage}
            onUpdateHints={updateLanguageHints}
            onUpdateDisplayLines={updateDisplayLines}
            onUpdateDisplayWidth={updateDisplayWidth}
          />
        )}
      </div>

      {/* Bottom navigation with home indicator inside */}
      <div className="w-full">
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </div>
  )
}

export default App
