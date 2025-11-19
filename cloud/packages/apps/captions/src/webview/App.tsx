import {Header} from "./components/Header"
import {TranscriptList} from "./components/TranscriptList"
import {useTranscripts} from "./hooks/useTranscripts"
import {useSettings} from "./hooks/useSettings"
import "./index.css"

export function App() {
  const {transcripts, connected} = useTranscripts()
  const {settings, updateLanguage, updateLanguageHints, updateDisplayLines, updateDisplayWidth} = useSettings()

  return (
    <div className="flex flex-col w-screen h-screen bg-white">
      <Header
        connected={connected}
        settings={settings}
        onUpdateLanguage={updateLanguage}
        onUpdateHints={updateLanguageHints}
        onUpdateDisplayLines={updateDisplayLines}
        onUpdateDisplayWidth={updateDisplayWidth}
      />
      <TranscriptList transcripts={transcripts} />
    </div>
  )
}

export default App
