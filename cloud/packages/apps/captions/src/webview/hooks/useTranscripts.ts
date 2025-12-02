import {useState, useEffect} from "react"

export interface Transcript {
  id: string
  utteranceId: string | null
  speaker: string
  text: string
  timestamp: string | null
  isFinal: boolean
}

export function useTranscripts() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let eventSource: EventSource | null = null

    const connect = async () => {
      try {
        // Load initial transcript history
        const response = await fetch("/api/transcripts")
        if (response.ok) {
          const data = await response.json()
          setTranscripts(data.transcripts || [])
        }

        // Connect to SSE stream
        eventSource = new EventSource("/api/transcripts/stream")

        eventSource.onopen = () => {
          setConnected(true)
          setError(null)
        }

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)

            if (data.type === "connected") {
              console.log("SSE connected")
              return
            }

            // Use utteranceId for correlation if available
            if (data.utteranceId) {
              setTranscripts((prev) => {
                const existingIndex = prev.findIndex(
                  (t) => t.utteranceId === data.utteranceId
                )

                const newTranscript: Transcript = {
                  id: data.id,
                  utteranceId: data.utteranceId,
                  speaker: data.speaker,
                  text: data.text,
                  timestamp: data.timestamp,
                  isFinal: data.type === "final",
                }

                if (existingIndex >= 0) {
                  // Update existing transcript (interim->interim or interim->final)
                  const updated = [...prev]
                  updated[existingIndex] = newTranscript
                  return updated
                } else {
                  // New utterance
                  return [...prev, newTranscript]
                }
              })
            } else {
              // Legacy behavior: no utteranceId
              if (data.type === "interim") {
                setTranscripts((prev) => {
                  // Remove any existing INTERIM transcript from the same speaker
                  const filtered = prev.filter(
                    (t) => !(t.speaker === data.speaker && !t.isFinal)
                  )

                  return [
                    ...filtered,
                    {
                      id: data.id,
                      utteranceId: null,
                      speaker: data.speaker,
                      text: data.text,
                      timestamp: null,
                      isFinal: false,
                    },
                  ]
                })
              } else if (data.type === "final") {
                setTranscripts((prev) => {
                  // Check if we already have this final transcript by ID
                  const alreadyExists = prev.some((t) => t.isFinal && t.id === data.id)
                  if (alreadyExists) {
                    return prev
                  }

                  // Remove the interim transcript from the same speaker
                  const filtered = prev.filter(
                    (t) => !(t.speaker === data.speaker && !t.isFinal)
                  )

                  return [
                    ...filtered,
                    {
                      id: data.id,
                      utteranceId: null,
                      speaker: data.speaker,
                      text: data.text,
                      timestamp: data.timestamp,
                      isFinal: true,
                    },
                  ]
                })
              }
            }
          } catch (e) {
            console.error("Failed to parse SSE message:", e)
          }
        }

        eventSource.onerror = () => {
          setConnected(false)
          setError("Connection lost")
          eventSource?.close()

          // Attempt to reconnect after 3 seconds
          setTimeout(connect, 3000)
        }
      } catch (err) {
        console.error("Failed to connect:", err)
        setError("Failed to connect")
        setConnected(false)
      }
    }

    connect()

    return () => {
      eventSource?.close()
    }
  }, [])

  const [isRecording, setIsRecording] = useState(false)

  const toggleRecording = () => {
    setIsRecording((prev) => !prev)
  }

  const clearTranscripts = () => {
    setTranscripts([])
  }

  return {transcripts, connected, error, isRecording, toggleRecording, clearTranscripts}
}
