import {useState, useEffect} from "react"

export interface Transcript {
  id: string
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

            if (data.type === "interim") {
              // Update or add interim transcript
              setTranscripts((prev) => {
                // Remove any existing interim transcripts
                const withoutInterim = prev.filter((t) => t.isFinal)

                // Add new interim
                return [
                  ...withoutInterim,
                  {
                    id: data.id,
                    speaker: data.speaker,
                    text: data.text,
                    timestamp: null,
                    isFinal: false,
                  },
                ]
              })
            } else if (data.type === "final") {
              // Replace interim with final
              setTranscripts((prev) => {
                // Remove interim transcripts
                const withoutInterim = prev.filter((t) => t.isFinal)

                // Add final transcript
                return [
                  ...withoutInterim,
                  {
                    id: data.id,
                    speaker: data.speaker,
                    text: data.text,
                    timestamp: data.timestamp,
                    isFinal: true,
                  },
                ]
              })
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

  return {transcripts, connected, error}
}
