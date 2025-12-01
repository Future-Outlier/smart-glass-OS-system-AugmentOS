/**
 * Captions App - Two Server Architecture
 *
 * Port 3334 (Bun)     - Serves React webview + custom API routes
 * Port 3333 (Express) - Handles MentraOS AppServer + proxies to Bun
 *
 * Flow:
 * - User visits localhost:3333 → Express proxies to Bun → Gets React app
 * - MentraOS Cloud calls /session-start → Express handles it
 * - Browser requests /api/hello → Express proxies to Bun
 * - Auth headers (x-auth-user-id) are forwarded from Express to Bun
 *
 * API Patterns:
 * - Express routes: Use (req as any).authUserId - authenticated by middleware
 * - Bun routes: Use req.headers.get('x-auth-user-id') - forwarded from Express
 */

import {serve} from "bun"

import {routes} from "./api/routes"
import {LiveCaptionsApp} from "./app"
import {UserSession} from "./app/session/UserSession"
import indexProd from "./webview/index.prod.html"

// Configuration
const PORT = parseInt(process.env.PORT || "3333", 10)
const BUN_PORT = PORT + 1 // 3334
const PACKAGE_NAME = process.env.PACKAGE_NAME || "com.mentra.captions"
const API_KEY = process.env.MENTRAOS_API_KEY || ""

if (!API_KEY) {
  console.error("❌ MENTRAOS_API_KEY environment variable is not set")
  process.exit(1)
}

if (!PACKAGE_NAME) {
  console.error("❌ PACKAGE_NAME environment variable is not set")
  process.exit(1)
}

console.log("🚀 Starting Captions App...\n")

// ============================================
// Step 1: Start Bun Server (Port 3334)
// ============================================

console.log(`📦 Starting Bun server on port ${BUN_PORT}...`)

const bunServer = serve({
  port: BUN_PORT,
  routes: {
    // Custom API routes
    ...routes,

    // Serve pre-built webview as fallback
    // This ensures @/ path imports are resolved at build time, not runtime
    "/*": indexProd,
  },
})

console.log(`✅ Bun server running at ${bunServer.url}`)
console.log(`   - Webview: ${bunServer.url}`)
console.log(`   - API: ${bunServer.url}/api/hello\n`)

// ============================================
// Step 2: Start Express/AppServer (Port 3333)
// ============================================

console.log(`📱 Starting MentraOS AppServer on port ${PORT}...`)

const captionsApp = new LiveCaptionsApp({
  packageName: PACKAGE_NAME,
  apiKey: API_KEY,
  port: PORT,
})

// Start AppServer first (registers all MentraOS routes)
await captionsApp.start()

// Get Express app instance AFTER starting (routes are registered)
const expressApp = captionsApp.getExpressApp()

// ============================================
// SSE Stream Route (bypasses proxy)
// ============================================
expressApp.get("/api/transcripts/stream", (req, res) => {
  const authReq = req as any
  const userId = authReq.authUserId

  if (!userId) {
    return res.status(401).send("Unauthorized")
  }

  const userSession = UserSession.getUserSession(userId)

  if (!userSession) {
    return res.status(404).send("No active session")
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")

  // Send initial connection message
  res.write(`data: ${JSON.stringify({type: "connected"})}\n\n`)

  // Create SSE client
  const client = {
    send: (data: any) => {
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      } catch {
        // Client disconnected
        userSession.transcripts.removeSSEClient(client)
      }
    },
  }

  // Register client
  userSession.transcripts.addSSEClient(client)

  // Cleanup on disconnect
  req.on("close", () => {
    userSession.transcripts.removeSSEClient(client)
  })
})

// ============================================
// Optional: Add Express API routes here
// ============================================
// Example Express route that uses auth middleware:
// expressApp.get("/api/express-example", (req, res) => {
//   const authReq = req as any
//   if (authReq.authUserId) {
//     res.json({ message: "Hello from Express!", userId: authReq.authUserId })
//   } else {
//     res.status(401).json({ error: "Not authenticated" })
//   }
// })

// ============================================
// Proxy: Forward unmatched routes to Bun
// ============================================
// Add catch-all proxy as LAST route - only matches if no other route did
// This forwards any unmatched routes to Bun (webview, custom API)
expressApp.all("*", async (req, res) => {
  try {
    const bunUrl = `http://localhost:${BUN_PORT}${req.originalUrl || req.url}`

    // Build headers - forward existing headers AND add auth info
    const proxyHeaders: Record<string, string> = {}

    // Copy existing headers
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value) {
        proxyHeaders[key] = Array.isArray(value) ? value.join(", ") : value
      }
    })

    // Forward authenticated user from Express middleware to Bun
    const authReq = req as any
    if (authReq.authUserId) {
      proxyHeaders["x-auth-user-id"] = authReq.authUserId
    }

    if (authReq.activeSession) {
      proxyHeaders["x-has-active-session"] = "true"
    }

    // Proxy request to Bun
    const response = await fetch(bunUrl, {
      method: req.method,
      headers: proxyHeaders as HeadersInit,
      body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
    })

    // Copy response headers
    response.headers.forEach((value, key) => {
      res.setHeader(key, value)
    })

    // Send response
    res.status(response.status)
    res.send(await response.text())
  } catch (error) {
    console.error("Proxy error:", error)
    res.status(500).send("Proxy error")
  }
})

console.log(`✅ MentraOS AppServer running at http://localhost:${PORT}`)
console.log(`   - Session endpoints: http://localhost:${PORT}/session-start`)
console.log(`   - Webhook: http://localhost:${PORT}/webhook`)
console.log(`   - Webview (proxied): http://localhost:${PORT}\n`)

console.log("🎉 Captions app is ready!")
console.log(`\n📝 Access the app at: http://localhost:${PORT}\n`)

// ============================================
// Graceful Shutdown
// ============================================

const shutdown = async () => {
  console.log("\n🛑 Shutting down...")
  captionsApp.stop()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
