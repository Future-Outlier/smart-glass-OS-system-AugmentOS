# Mentra AI + MCP Tool System Redesign

## Executive Summary

This document outlines a complete redesign of the MentraOS tool calling system, replacing the current bespoke LangChain-based implementation with a modern Mastra + MCP architecture.

**Key Changes:**

1. Replace LangChain agents with Mastra framework
2. Adopt MCP (Model Context Protocol) as the tool format standard
3. Cloud serves as centralized MCP server (aggregates all mini-app tools)
4. Mini-apps register tools via MCP schema but serve simple HTTP endpoints
5. New app activation mechanism for tools that need display access

---

## Current State (Problems)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT ARCHITECTURE                        │
│                                                                 │
│  User Voice ──► Transcription ──► Mira (LangChain Agent)       │
│                                         │                       │
│                                         ▼                       │
│                              AgentGatekeeper                    │
│                              (LLM selects agents)               │
│                                         │                       │
│                         ┌───────────────┼───────────────┐       │
│                         ▼               ▼               ▼       │
│                   NewsAgent      MiraAgent      OtherAgents     │
│                         │               │                       │
│                         └───────┬───────┘                       │
│                                 ▼                               │
│                    Tool Discovery (REST)                        │
│                    GET /api/tools/users/:userId/tools           │
│                                 │                               │
│                                 ▼                               │
│                    Tool Execution (HTTP POST)                   │
│                    POST /api/tools/apps/:pkg/tool               │
│                                 │                               │
│                                 ▼                               │
│                         Mini-App /tool endpoint                 │
│                         (may have activeSession=null)  ← BROKEN │
└─────────────────────────────────────────────────────────────────┘

Problems:
1. Bespoke tool schema (not MCP compatible)
2. LangChain overhead and complexity
3. No app activation when tool needs display
4. Scattered tool discovery across REST endpoints
5. No streaming support
6. Poor error handling and observability
```

---

## New Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         NEW ARCHITECTURE                                  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                      MentraOS Cloud                                 │  │
│  │                                                                     │  │
│  │  ┌─────────────┐    ┌─────────────────────────────────────────┐   │  │
│  │  │ Transcription│───►│           Mentra AI Service              │   │  │
│  │  │   Manager    │    │                                          │   │  │
│  │  └─────────────┘    │  ┌──────────────────────────────────┐   │   │  │
│  │                      │  │         Mastra Agent              │   │   │  │
│  │                      │  │                                   │   │   │  │
│  │                      │  │  - Receives transcription        │   │   │  │
│  │                      │  │  - Has access to MCP tools       │   │   │  │
│  │                      │  │  - Streams responses             │   │   │  │
│  │                      │  │  - Handles conversation state    │   │   │  │
│  │                      │  └──────────────────────────────────┘   │   │  │
│  │                      │                   │                      │   │  │
│  │                      │                   ▼                      │   │  │
│  │                      │  ┌──────────────────────────────────┐   │   │  │
│  │                      │  │      MCP Tool Registry           │   │   │  │
│  │                      │  │      (MCPServer interface)       │   │   │  │
│  │                      │  │                                   │   │   │  │
│  │                      │  │  tools: [                        │   │   │  │
│  │                      │  │    "com.app1.add_reminder",      │   │   │  │
│  │                      │  │    "com.app1.list_reminders",    │   │   │  │
│  │                      │  │    "com.app2.play_song",         │   │   │  │
│  │                      │  │    ...                           │   │   │  │
│  │                      │  │  ]                               │   │   │  │
│  │                      │  └──────────────────────────────────┘   │   │  │
│  │                      └─────────────────────────────────────────┘   │  │
│  │                                          │                         │  │
│  │                                          │ Tool Execution          │  │
│  │                                          ▼                         │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                  Tool Execution Router                       │  │  │
│  │  │                                                              │  │  │
│  │  │  1. Parse tool name: "com.app1.add_reminder"                │  │  │
│  │  │  2. Check if app needs activation (requiresDisplay flag)    │  │  │
│  │  │  3. If needs activation → AppManager.activateForTool()      │  │  │
│  │  │  4. Execute tool via HTTP POST to app                       │  │  │
│  │  │  5. Return result (or stream)                               │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  │                                          │                         │  │
│  └──────────────────────────────────────────┼─────────────────────────┘  │
│                                             │                            │
│                                             ▼                            │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                         Mini-Apps                                    │ │
│  │                                                                      │ │
│  │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐              │ │
│  │   │   App 1     │   │   App 2     │   │   App 3     │              │ │
│  │   │             │   │             │   │             │              │ │
│  │   │ POST /tool  │   │ POST /tool  │   │ POST /tool  │              │ │
│  │   │             │   │             │   │             │              │ │
│  │   │ Tools:      │   │ Tools:      │   │ Tools:      │              │ │
│  │   │ - reminder  │   │ - play_song │   │ - search    │              │ │
│  │   │ - list      │   │ - pause     │   │ - bookmark  │              │ │
│  │   └─────────────┘   └─────────────┘   └─────────────┘              │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Component Design

### 1. MCP Tool Schema (SDK Types)

Replace the current `ToolSchema` with MCP-compatible format:

```typescript
// packages/sdk/src/types/tools.ts

/**
 * MCP-compatible tool definition
 * See: https://modelcontextprotocol.io/docs/concepts/tools
 */
export interface MCPToolDefinition {
  /** Unique tool name, namespaced: "packageName.toolName" */
  name: string

  /** Human-readable description for the LLM */
  description: string

  /** JSON Schema for input parameters */
  inputSchema: {
    type: "object"
    properties: Record<string, JSONSchemaProperty>
    required?: string[]
  }

  /** MentraOS extensions (not part of MCP spec) */
  menpitraExtensions?: {
    /** Voice activation phrases (e.g., "remind me", "set a reminder") */
    activationPhrases?: string[]

    /** Does this tool need to display UI on glasses? */
    requiresDisplay?: boolean

    /** Should this tool activate the app as foreground? */
    activateApp?: boolean

    /** Tool category for organization */
    category?: "productivity" | "media" | "communication" | "utility" | "other"
  }
}

/** JSON Schema property definition */
export interface JSONSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object"
  description: string
  enum?: (string | number)[]
  default?: unknown
  items?: JSONSchemaProperty // For arrays
  properties?: Record<string, JSONSchemaProperty> // For nested objects
  required?: string[] // For nested objects
}

/**
 * Tool execution request (sent to mini-app)
 */
export interface MCPToolCall {
  /** Full tool name: "com.example.app.add_reminder" */
  name: string

  /** Tool arguments matching inputSchema */
  arguments: Record<string, unknown>

  /** Execution context */
  context: {
    userId: string
    sessionId: string
    timestamp: string

    /** If app was activated for this tool call */
    activatedForTool: boolean

    /** Conversation context (recent messages) */
    conversationHistory?: ConversationMessage[]
  }
}

/**
 * Tool execution response (from mini-app)
 */
export interface MCPToolResult {
  /** Tool execution succeeded */
  success: boolean

  /** Result content (for LLM context) */
  content?: string | object

  /** Error details if failed */
  error?: {
    code: string
    message: string
    retryable?: boolean
  }

  /** MentraOS extensions */
  mentraExtensions?: {
    /** App is handling display (Mentra AI should not respond verbally) */
    handledDisplay?: boolean

    /** Suggested follow-up actions */
    suggestedFollowUps?: string[]
  }
}
```

### 2. Tool Registry Service

```typescript
// packages/cloud/src/services/tools/ToolRegistryService.ts

import {MCPToolDefinition} from "@mentra/sdk"

/**
 * Centralized registry of all tools from all installed apps
 * Serves as the data source for the MCP Server
 */
export class ToolRegistryService {
  /**
   * Get all tools available to a user
   * Aggregates tools from all installed apps
   */
  async getToolsForUser(userId: string): Promise<MCPToolDefinition[]> {
    // 1. Get user's installed apps from DB
    const user = await User.findByEmail(userId)
    const installedApps = user?.installedApps || []

    // 2. Fetch tool definitions for each app
    const allTools: MCPToolDefinition[] = []

    for (const {packageName} of installedApps) {
      const app = await App.findOne({packageName})
      if (!app?.tools) continue

      // Namespace tools with package name
      for (const tool of app.tools) {
        allTools.push({
          name: `${packageName}.${tool.name}`,
          description: tool.description,
          inputSchema: tool.inputSchema,
          mentraExtensions: tool.mentraExtensions,
        })
      }
    }

    return allTools
  }

  /**
   * Get tool definition by full name
   */
  async getTool(toolName: string): Promise<MCPToolDefinition | null> {
    const [packageName, ...rest] = toolName.split(".")
    const localToolName = rest.join(".")

    const app = await App.findOne({packageName})
    if (!app?.tools) return null

    const tool = app.tools.find((t) => t.name === localToolName)
    if (!tool) return null

    return {
      name: toolName,
      description: tool.description,
      inputSchema: tool.inputSchema,
      mentraExtensions: tool.mentraExtensions,
    }
  }

  /**
   * Register/update tools for an app
   * Called when app registers or updates via Developer Console
   */
  async registerTools(packageName: string, tools: Omit<MCPToolDefinition, "name">[]): Promise<void> {
    // Validate all tool schemas
    for (const tool of tools) {
      this.validateToolSchema(tool)
    }

    // Store in app document
    await App.updateOne({packageName}, {$set: {tools}})

    // Invalidate any caches
    await this.invalidateCache(packageName)
  }

  private validateToolSchema(tool: Omit<MCPToolDefinition, "name">): void {
    // Validate JSON Schema structure
    if (tool.inputSchema.type !== "object") {
      throw new Error("Tool inputSchema must have type: 'object'")
    }
    // ... more validation
  }
}
```

### 3. Tool Executor Service

```typescript
// packages/cloud/src/services/tools/ToolExecutorService.ts

import {MCPToolCall, MCPToolResult} from "@mentra/sdk"

/**
 * Executes tool calls by routing to appropriate mini-apps
 * Handles app activation, retries, and error handling
 */
export class ToolExecutorService {
  constructor(
    private toolRegistry: ToolRegistryService,
    private appManager: AppManager,
    private logger: Logger,
  ) {}

  /**
   * Execute a tool call
   */
  async execute(toolCall: MCPToolCall, userSession: UserSession): Promise<MCPToolResult> {
    const startTime = Date.now()

    try {
      // 1. Parse tool name to get package
      const {packageName, localToolName} = this.parseToolName(toolCall.name)

      // 2. Get tool definition
      const toolDef = await this.toolRegistry.getTool(toolCall.name)
      if (!toolDef) {
        return {
          success: false,
          error: {code: "TOOL_NOT_FOUND", message: `Tool ${toolCall.name} not found`},
        }
      }

      // 3. Validate arguments against schema
      const validationResult = this.validateArguments(toolCall.arguments, toolDef.inputSchema)
      if (!validationResult.valid) {
        return {
          success: false,
          error: {
            code: "INVALID_ARGUMENTS",
            message: validationResult.error,
            retryable: false,
          },
        }
      }

      // 4. Check if app needs activation
      if (toolDef.mentraExtensions?.activateApp || toolDef.mentraExtensions?.requiresDisplay) {
        await this.ensureAppActivated(packageName, userSession, toolCall)
      }

      // 5. Get app's public URL
      const app = await App.findOne({packageName})
      if (!app?.publicUrl) {
        return {
          success: false,
          error: {code: "APP_NOT_AVAILABLE", message: `App ${packageName} has no public URL`},
        }
      }

      // 6. Execute HTTP request to app
      const result = await this.executeHttpRequest(app.publicUrl, {
        ...toolCall,
        name: localToolName, // Send local name, not namespaced
      })

      // 7. Log execution
      this.logger.info(
        {
          tool: toolCall.name,
          userId: toolCall.context.userId,
          duration: Date.now() - startTime,
          success: result.success,
        },
        "Tool executed",
      )

      return result
    } catch (error) {
      this.logger.error({error, tool: toolCall.name}, "Tool execution failed")
      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          retryable: true,
        },
      }
    }
  }

  /**
   * Ensure app is activated and has display access
   */
  private async ensureAppActivated(
    packageName: string,
    userSession: UserSession,
    toolCall: MCPToolCall,
  ): Promise<void> {
    const appSession = userSession.appManager.getAppSession(packageName)

    // If app is already running with active session, we're good
    if (appSession?.isRunning) {
      return
    }

    // Start the app
    this.logger.info({packageName, tool: toolCall.name}, "Activating app for tool call")

    const result = await userSession.appManager.startApp(packageName)
    if (!result.success) {
      throw new Error(`Failed to activate app: ${result.error?.message}`)
    }

    // Mark this as a tool-initiated activation
    toolCall.context.activatedForTool = true
  }

  /**
   * Execute HTTP request to app's /tool endpoint
   */
  private async executeHttpRequest(publicUrl: string, toolCall: MCPToolCall): Promise<MCPToolResult> {
    const webhookUrl = `${publicUrl}/tool`

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(toolCall),
      signal: AbortSignal.timeout(30000), // 30s timeout
    })

    if (!response.ok) {
      return {
        success: false,
        error: {
          code: "HTTP_ERROR",
          message: `HTTP ${response.status}: ${response.statusText}`,
          retryable: response.status >= 500,
        },
      }
    }

    return (await response.json()) as MCPToolResult
  }

  private parseToolName(fullName: string): {packageName: string; localToolName: string} {
    // "com.example.app.add_reminder" -> { packageName: "com.example.app", localToolName: "add_reminder" }
    const parts = fullName.split(".")
    const localToolName = parts.pop()!
    const packageName = parts.join(".")
    return {packageName, localToolName}
  }

  private validateArguments(
    args: Record<string, unknown>,
    schema: MCPToolDefinition["inputSchema"],
  ): {valid: boolean; error?: string} {
    // Use a JSON Schema validator like Ajv
    // ... validation logic
    return {valid: true}
  }
}
```

### 4. Mentra AI Service (Mastra-based)

```typescript
// packages/cloud/src/services/ai/MentraAIService.ts

import {Agent, createTool} from "@mastra/core"
import {MCPClient} from "@mastra/mcp"

/**
 * Main AI service using Mastra framework
 * Replaces the old LangChain-based MiraAgent + AgentGatekeeper
 */
export class MentraAIService {
  private agent: Agent
  private toolExecutor: ToolExecutorService
  private toolRegistry: ToolRegistryService

  constructor(toolExecutor: ToolExecutorService, toolRegistry: ToolRegistryService, config: MentraAIConfig) {
    this.toolExecutor = toolExecutor
    this.toolRegistry = toolRegistry

    this.agent = new Agent({
      name: "MentraAI",
      instructions: this.buildSystemPrompt(),
      model: {
        provider: config.llmProvider, // "openai", "anthropic", etc.
        name: config.llmModel, // "gpt-4o", "claude-3-opus", etc.
        toolChoice: "auto",
      },
    })
  }

  /**
   * Process user input and generate response
   * Called when transcription is finalized
   */
  async processInput(input: string, userSession: UserSession, context: ConversationContext): Promise<MentraAIResponse> {
    // 1. Get available tools for this user
    const tools = await this.toolRegistry.getToolsForUser(userSession.userId)

    // 2. Convert to Mastra tool format
    const mastraTools = tools.map((tool) => this.convertToMastraTool(tool, userSession))

    // 3. Run the agent
    const result = await this.agent.generate(input, {
      tools: mastraTools,
      context: {
        userId: userSession.userId,
        conversationHistory: context.history,
        currentTime: new Date().toISOString(),
        userPreferences: context.preferences,
      },
    })

    // 4. Build response
    return {
      text: result.text,
      toolCalls: result.toolCalls?.map((tc) => ({
        name: tc.name,
        arguments: tc.arguments,
        result: tc.result,
      })),
      shouldSpeak: !result.toolCalls?.some((tc) => tc.result?.mentraExtensions?.handledDisplay),
    }
  }

  /**
   * Stream response (for real-time display)
   */
  async *streamResponse(
    input: string,
    userSession: UserSession,
    context: ConversationContext,
  ): AsyncGenerator<MentraAIStreamChunk> {
    const tools = await this.toolRegistry.getToolsForUser(userSession.userId)
    const mastraTools = tools.map((tool) => this.convertToMastraTool(tool, userSession))

    const stream = await this.agent.stream(input, {
      tools: mastraTools,
      context: {
        userId: userSession.userId,
        conversationHistory: context.history,
      },
    })

    for await (const chunk of stream) {
      yield {
        type: chunk.type, // "text" | "tool_call" | "tool_result"
        content: chunk.content,
      }
    }
  }

  /**
   * Convert MCP tool definition to Mastra tool
   */
  private convertToMastraTool(toolDef: MCPToolDefinition, userSession: UserSession) {
    return createTool({
      name: toolDef.name,
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
      execute: async (args) => {
        // Execute via ToolExecutorService
        const result = await this.toolExecutor.execute(
          {
            name: toolDef.name,
            arguments: args,
            context: {
              userId: userSession.userId,
              sessionId: userSession.sessionId,
              timestamp: new Date().toISOString(),
              activatedForTool: false,
            },
          },
          userSession,
        )

        if (!result.success) {
          throw new Error(result.error?.message || "Tool execution failed")
        }

        return result.content
      },
    })
  }

  private buildSystemPrompt(): string {
    return `You are Mentra AI, a helpful assistant integrated into smart glasses.

Your role is to help users with tasks hands-free using voice commands.

Guidelines:
- Be concise - users are wearing glasses and can't read long text
- Use tools when they help accomplish the user's request
- If a tool fails, explain briefly and offer alternatives
- For display-heavy results, the app will show them - don't repeat the content verbally
- Respect user privacy - don't share personal information unnecessarily

You have access to tools from the user's installed apps. Use them when relevant.`
  }
}

// Types

export interface MentraAIConfig {
  llmProvider: "openai" | "anthropic" | "azure"
  llmModel: string
  temperature?: number
  maxTokens?: number
}

export interface MentraAIResponse {
  text: string
  toolCalls?: {
    name: string
    arguments: Record<string, unknown>
    result: MCPToolResult
  }[]
  shouldSpeak: boolean
}

export interface MentraAIStreamChunk {
  type: "text" | "tool_call" | "tool_result"
  content: unknown
}

export interface ConversationContext {
  history: ConversationMessage[]
  preferences: UserPreferences
}

export interface ConversationMessage {
  role: "user" | "assistant"
  content: string
  timestamp: string
}
```

### 5. Integration with TranscriptionManager

```typescript
// packages/cloud/src/services/session/MentraAIIntegration.ts

/**
 * Integrates Mentra AI with the transcription pipeline
 * Replaces the old Mira subscription-based approach
 */
export class MentraAIIntegration {
  private mentraAI: MentraAIService
  private conversationHistory: Map<string, ConversationMessage[]> = new Map()

  constructor(mentraAI: MentraAIService) {
    this.mentraAI = mentraAI
  }

  /**
   * Called when VAD detects end of speech and transcription is finalized
   */
  async onTranscriptionFinalized(userSession: UserSession, transcription: FinalTranscription): Promise<void> {
    // 1. Check if this is addressed to Mentra AI
    // Could be wake word detection, always-on mode, or explicit trigger
    if (!this.shouldProcess(transcription, userSession)) {
      return
    }

    const userId = userSession.userId

    // 2. Get or create conversation history
    const history = this.getConversationHistory(userId)

    // 3. Add user message to history
    history.push({
      role: "user",
      content: transcription.text,
      timestamp: new Date().toISOString(),
    })

    // 4. Process with Mentra AI (streaming)
    const responseChunks: string[] = []

    for await (const chunk of this.mentraAI.streamResponse(transcription.text, userSession, {
      history,
      preferences: await this.getUserPreferences(userId),
    })) {
      if (chunk.type === "text") {
        responseChunks.push(chunk.content as string)

        // Stream to display if configured
        await userSession.displayManager.streamText(chunk.content as string)
      }

      if (chunk.type === "tool_call") {
        // Show tool execution indicator
        await userSession.displayManager.showToolExecution(chunk.content)
      }
    }

    // 5. Full response
    const fullResponse = responseChunks.join("")

    // 6. Add to history
    history.push({
      role: "assistant",
      content: fullResponse,
      timestamp: new Date().toISOString(),
    })

    // 7. Speak response (TTS)
    await userSession.ttsManager?.speak(fullResponse)

    // 8. Trim history if too long
    this.trimHistory(userId)
  }

  private shouldProcess(transcription: FinalTranscription, userSession: UserSession): boolean {
    // Check for wake word ("Hey Mentra", "OK Mentra", etc.)
    const wakeWords = ["hey mentra", "ok mentra", "mentra"]
    const lowerText = transcription.text.toLowerCase()

    if (wakeWords.some((w) => lowerText.startsWith(w))) {
      return true
    }

    // Check if always-listening mode is enabled
    if (userSession.userSettings.mentraAlwaysListening) {
      return true
    }

    // Check if user is in active conversation (recent interaction)
    const lastInteraction = this.getLastInteractionTime(userSession.userId)
    if (lastInteraction && Date.now() - lastInteraction < 30000) {
      // 30s window
      return true
    }

    return false
  }

  private getConversationHistory(userId: string): ConversationMessage[] {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, [])
    }
    return this.conversationHistory.get(userId)!
  }

  private trimHistory(userId: string): void {
    const history = this.conversationHistory.get(userId)
    if (history && history.length > 20) {
      // Keep last 20 messages
      this.conversationHistory.set(userId, history.slice(-20))
    }
  }
}
```

### 6. SDK Changes for Mini-Apps

```typescript
// packages/sdk/src/app/server/tool-handler.ts

import {MCPToolCall, MCPToolResult} from "../../types/tools"

/**
 * Tool handler interface for mini-apps
 */
export interface ToolHandler {
  (call: MCPToolCall): Promise<MCPToolResult>
}

/**
 * Decorator-style tool definition for mini-apps
 */
export function defineTool<TArgs extends Record<string, unknown>>(config: {
  name: string
  description: string
  parameters: MCPToolDefinition["inputSchema"]["properties"]
  required?: string[]
  requiresDisplay?: boolean
  handler: (args: TArgs, context: MCPToolCall["context"]) => Promise<string | object>
}): {definition: Omit<MCPToolDefinition, "name">; handler: ToolHandler} {
  return {
    definition: {
      description: config.description,
      inputSchema: {
        type: "object",
        properties: config.parameters,
        required: config.required,
      },
      mentraExtensions: {
        requiresDisplay: config.requiresDisplay,
      },
    },
    handler: async (call: MCPToolCall): Promise<MCPToolResult> => {
      try {
        const result = await config.handler(call.arguments as TArgs, call.context)
        return {
          success: true,
          content: result,
        }
      } catch (error) {
        return {
          success: false,
          error: {
            code: "HANDLER_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        }
      }
    },
  }
}

// Usage example in a mini-app:

const addReminderTool = defineTool({
  name: "add_reminder",
  description: "Add a reminder for the user",
  parameters: {
    text: {type: "string", description: "What to remind about"},
    time: {type: "string", description: "When to remind (ISO 8601)"},
  },
  required: ["text"],
  requiresDisplay: false,

  handler: async (args, context) => {
    const reminder = await db.reminders.create({
      userId: context.userId,
      text: args.text,
      time: args.time ? new Date(args.time) : null,
    })

    return `Reminder added: "${args.text}"`
  },
})
```

### 7. Updated AppServer in SDK

```typescript
// packages/sdk/src/app/server/index.ts (partial update)

export class AppServer {
  private tools: Map<string, ToolHandler> = new Map()
  private toolDefinitions: Map<string, Omit<MCPToolDefinition, "name">> = new Map()

  /**
   * Register a tool with handler
   */
  registerTool(name: string, definition: Omit<MCPToolDefinition, "name">, handler: ToolHandler): void {
    this.tools.set(name, handler)
    this.toolDefinitions.set(name, definition)
    this.logger.info({tool: name}, "Tool registered")
  }

  /**
   * Get all tool definitions for registration with cloud
   */
  getToolDefinitions(): {name: string; definition: Omit<MCPToolDefinition, "name">}[] {
    return Array.from(this.toolDefinitions.entries()).map(([name, def]) => ({
      name,
      definition: def,
    }))
  }

  /**
   * Setup the /tool endpoint
   */
  private setupToolEndpoint(): void {
    this.app.post("/tool", async (req, res) => {
      const toolCall = req.body as MCPToolCall

      this.logger.info({tool: toolCall.name}, "Received tool call")

      // Find handler
      const handler = this.tools.get(toolCall.name)
      if (!handler) {
        res.status(404).json({
          success: false,
          error: {code: "TOOL_NOT_FOUND", message: `Tool ${toolCall.name} not found`},
        } as MCPToolResult)
        return
      }

      // Execute
      try {
        const result = await handler(toolCall)
        res.json(result)
      } catch (error) {
        this.logger.error({error, tool: toolCall.name}, "Tool execution error")
        res.status(500).json({
          success: false,
          error: {
            code: "EXECUTION_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          },
        } as MCPToolResult)
      }
    })
  }
}
```

---

## Migration Path

### Phase 1: Schema Migration (Week 1)

1. Add new `MCPToolDefinition` types to SDK
2. Create migration script for existing tool definitions in DB
3. Update Developer Console to use new schema
4. Keep old `/api/tools` endpoints working (compatibility layer)

### Phase 2: Tool Executor (Week 2)

1. Implement `ToolRegistryService`
2. Implement `ToolExecutorService`
3. Add app activation logic for tools
4. Deploy new `/tool` endpoint handling

### Phase 3: Mentra AI Service (Week 3)

1. Add Mastra as dependency
2. Implement `MentraAIService`
3. Implement `MentraAIIntegration`
4. Wire up to TranscriptionManager
5. Run both old and new systems in parallel for testing

### Phase 4: Cleanup (Week 4)

1. Remove old LangChain agents
2. Remove old tool routes
3. Remove AgentGatekeeper
4. Update documentation
5. Update SDK examples

---

## API Changes Summary

### Removed Endpoints

- `GET /api/tools/apps/:packageName/tools` - replaced by registry
- `GET /api/tools/users/:userId/tools` - replaced by registry
- `POST /api/tools/apps/:packageName/tool` - replaced by ToolExecutor

### New Internal Services

- `ToolRegistryService` - central tool registry
- `ToolExecutorService` - handles tool execution with activation
- `MentraAIService` - Mastra-based AI agent
- `MentraAIIntegration` - transcription pipeline integration

### SDK Changes

- New `MCPToolDefinition` type (replaces `ToolSchema`)
- New `MCPToolCall` type (replaces `ToolCall`)
- New `MCPToolResult` type
- New `defineTool()` helper function
- Updated `AppServer.registerTool()` method

---

## Open Questions

1. **Conversation persistence**: Should conversation history persist across sessions? Currently in-memory.

2. **Multi-language support**: How do activation phrases work across languages?

3. **Tool permissions**: Should users be able to disable specific tools per-app?

4. **Rate limiting**: Per-user rate limits on tool calls?

5. **Billing/usage tracking**: How to track tool usage for potential monetization?

---

## Dependencies

### New Packages

```json
{
  "@mastra/core": "^0.x.x",
  "@mastra/mcp": "^0.x.x",
  "ajv": "^8.x.x" // JSON Schema validation
}
```

### Removed Packages

```json
{
  "langchain": "remove",
  "@langchain/core": "remove",
  "@langchain/openai": "remove"
}
```
