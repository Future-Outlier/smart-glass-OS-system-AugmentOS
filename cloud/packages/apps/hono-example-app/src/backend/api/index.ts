/**
 * API Routes
 *
 * All HTTP endpoints for the mini app.
 * Handlers live in sibling files, routing is defined here.
 */

import { Hono } from "hono"
import { getHealth } from "./health"
import { photoStream, transcriptionStream } from "./stream"
import { speak, stopAudio } from "./audio"
import { getThemePreference, setThemePreference } from "./storage"
import { getLatestPhoto, getPhotoData, getPhotoBase64 } from "./photo"

export const api = new Hono()

// Health
api.get("/health", getHealth)

// SSE streams
api.get("/photo-stream", photoStream)
api.get("/transcription-stream", transcriptionStream)

// Audio
api.post("/speak", speak)
api.post("/stop-audio", stopAudio)

// Storage / preferences
api.get("/theme-preference", getThemePreference)
api.post("/theme-preference", setThemePreference)

// Photos
api.get("/latest-photo", getLatestPhoto)
api.get("/photo/:requestId", getPhotoData)
api.get("/photo-base64/:requestId", getPhotoBase64)
