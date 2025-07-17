---
sidebar_position: 1
---

# Build From Scratch

This guide will walk you through creating a simple "Hello, World" MentraOS app that displays text on the MentraOS smart glasses. This will introduce you to the basic structure of an app and how to use the SDK.

## Prerequisites

Make sure you have the following installed:

*   **Node.js:** (v18.0.0 or later)
*   **Bun:** [Install bun](https://bun.sh/docs/installation)
*   **A code editor:** (VS Code recommended)

## Part 1: Set Up Your Project

### 1. Create Project Directory

Create a new directory for your app and initialize a Node.js project:

```bash
mkdir my-first-mentraos-app
cd my-first-mentraos-app
bun init -y
```

This will create a package.json file.

### 2. Install the SDK

Install the @mentra/sdk package:

```bash
bun add @mentra/sdk
```

### 3. Install Additional Dependencies

Install TypeScript and other development dependencies:

```bash
bun add -d typescript tsx @types/node
```

### 4. Create Project Structure

Create the following project structure:

```
my-first-mentraos-app/
├── src/
│   └── index.ts
├── .env
└── package.json
```

### 5. Set Up Environment Configuration

Create a `.env` file:

```env
PORT=3000
PACKAGE_NAME=com.example.myfirstmentraosapp
MENTRAOS_API_KEY=your_api_key_from_console
```

Edit the `.env` file with your app details (you'll get these values when you register your app later).

### 6. Write Your App Code

Add the following code to `src/index.ts`:

```typescript
import { AppServer, AppSession } from '@mentra/sdk';

// Load configuration from environment variables
const PACKAGE_NAME = process.env.PACKAGE_NAME || "com.example.myfirstmentraosapp";
const PORT = parseInt(process.env.PORT || "3000");
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY;

if (!MENTRAOS_API_KEY) {
    console.error("MENTRAOS_API_KEY environment variable is required");
    process.exit(1);
}

/**
 * MyMentraOSApp - A simple MentraOS application that displays "Hello, World!"
 * Extends AppServer to handle sessions and user interactions
 */
class MyMentraOSApp extends AppServer {
    /**
     * Handle new session connections
     * @param session - The app session instance
     * @param sessionId - Unique identifier for this session
     * @param userId - The user ID for this session
     */
    protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
        session.logger.info(`New session: ${sessionId} for user ${userId}`);

        // Display "Hello, World!" on the glasses
        session.layouts.showTextWall("Hello, World!");

        // Log when the session is disconnected
        session.events.onDisconnected(() => {
            session.logger.info(`Session ${sessionId} disconnected.`);
        });
    }
}

// Create and start the app server
const server = new MyMentraOSApp({
    packageName: PACKAGE_NAME,
    apiKey: MENTRAOS_API_KEY,
    port: PORT
});

server.start().catch(err => {
    console.error("Failed to start server:", err);
});
```

### 7. Configure TypeScript

Create a `tsconfig.json` file in the root of your project:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "baseUrl": ".",
    "paths": {}
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 8. Set Up Build Scripts

Update your `package.json` with the following scripts:

```json
{
  "name": "my-first-mentraos-app",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "bun run dist/index.js",
    "dev": "bun --watch src/index.ts"
  },
  "dependencies": {
    "@mentra/sdk": "^2.1.2"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

## Part 2: Connect to MentraOS

### 9. Install MentraOS on Your Phone

Download and install the MentraOS app from [mentra.glass/os](https://mentra.glass/os)

### 10. Set Up ngrok

We are going to use ngrok to expose your local app to the internet.  This is useful for development, but when you're ready to go live, you'll want to deploy to a cloud service like [Railway](railway-deployment) or [an Ubuntu server](ubuntu-deployment).

To make your locally running app accessible from the internet:

1. Install ngrok: `brew install ngrok` (on macOS) or [install ngrok](https://ngrok.com/docs/getting-started/)
2. Create an ngrok account
3. [Set up a static address/URL in the ngrok dashboard](https://dashboard.ngrok.com/)

* Make sure you run the `ngrok config add-authtoken <your_authtoken>` line
* Make sure you select `Static Domain`, then generate a static domain

<center>
  <img width="75%" src="/img/ngrok_guide_1.png"></img>
</center>

### 11. Register Your App

![MentraOS Console](https://github.com/user-attachments/assets/36192c2b-e1ba-423b-90de-47ff8cd91318)

1. Navigate to [console.mentra.glass](https://console.mentra.glass/)
2. Click "Sign In" and log in with the same account you're using for MentraOS
3. Click "Create App"
4. Set a unique package name (e.g., `com.yourname.myfirstapp`)
5. For "Public URL", enter your ngrok static URL
6. Add the microphone permission.  See the [Permissions](permissions) guide for details.
7. After the app is created, you will be given an API key. Copy this key.

> This automatically installs the app for your user.  For other people to test the app (including others in your organization), they need to install the app.  Get the app install link from the App edit page under the `Share with Testers` section.

### 12. Set up App Permissions

Your app must declare which permissions it needs to access device capabilities.  To add permissions to your app:

1. Go to [console.mentra.glass](https://console.mentra.glass/)
2. Click on your app to open its settings
3. Scroll to the **Required Permissions** section
4. Click **Add Permission** to add a new permission
5. Select the permission type (e.g., "MICROPHONE" for speech features)
6. Add a clear description explaining why your app needs this permission
7. Save your changes

For example, if your app will use voice commands, add:
- **Permission Type**: MICROPHONE
- **Description**: "Used for voice commands and speech recognition"

### 13. Update Your Environment Configuration

Edit your `.env` file with the values from your registered app:

```env
PORT=3000
PACKAGE_NAME=com.yourname.myfirstapp
MENTRAOS_API_KEY=your_actual_api_key_from_console
```

Make sure the `PACKAGE_NAME` matches what you registered in the MentraOS Console.

## Part 3: Run Your App

### 14. Install Dependencies and Run

Install all dependencies:

```bash
bun install
```

For development with automatic reloading:

```bash
bun run dev
```

Or build and run in production mode:

```bash
bun run build
bun run start
```

### 15. Make Your App Accessible

Expose your app to the internet with ngrok:

```bash
ngrok http --url=<YOUR_NGROK_URL_HERE> 3000
```

> Note: The port number (3000) must match the PORT in your `.env` file.

> **IMPORTANT:** After making changes to your app code or restarting your server, you must restart your app inside the MentraOS phone app.

### 16. View Your Logs

Notice that we're now using `session.logger` instead of `console.log`. The session logger automatically includes context like the user ID and session ID, making it easier to debug your app:

```
[12:34:56.789] INFO: New session: session_456 for user user_123
    userId: "user_123"
    sessionId: "session_456"
    service: "app-session"

[12:34:58.124] INFO: Session session_456 disconnected.
    userId: "user_123"
    sessionId: "session_456"
    service: "app-session"
```

This structured logging helps you debug issues and monitor how users interact with your app.

## What's Next?

Congratulations! You've built your first MentraOS app. To continue your journey:

### Subscribe to Events

You can listen for [transcriptions, translations, settings updates, and other events](/events) within the onSession function.

- Subscribe to real-time data streams like speech transcription, location updates, and button presses
- Use convenient methods like `session.events.onTranscription()` and `session.events.onButtonPress()`
- Handle system events such as connection status and settings changes
- Always unsubscribe from events when no longer needed to prevent resource leaks

### Configure Settings

Configure [Settings](/settings) to let users customize your app's behavior through persistent, synchronized preferences.

- Define settings in the developer console (toggles, text inputs, dropdowns, sliders)
- Access setting values in your app with `session.settings.get()`
- Listen for real-time setting changes with `session.settings.onValueChange()`
- Settings persist across app restarts and devices

### Implement AI Tools

Implement [AI Tools](/tools) to extend Mira AI's capabilities with custom functions that users can invoke through natural language.

- Your app can respond to tool calls from Mira AI via `onToolCall` in your code
- Define custom tools that can be called by MentraOS through natural language
- Each tool takes specific parameters and returns a result
- Tools can perform operations on your application's data
- Properly handle authentication and validation in your tool implementations

### Build a Webview

Build [Webviews](/webview-auth-overview) to provide web interfaces with automatic MentraOS user authentication.

- Access the webview at `/webview`
- The current MentraOS user is available at `request.authUserId`
- Create a web interface that allows users to interact with your app's functionality

### Monitor and Debug with Logging

Use the session logger to improve your app:

```typescript
// Track user behavior
session.logger.info('User completed tutorial', {
  stepCount: 5,
  duration: 120000
});

// Debug performance issues
const startTime = Date.now();
await processUserInput(input);
session.logger.debug('Input processing completed', {
  processingTime: Date.now() - startTime
});

// Monitor errors
try {
  await riskyOperation();
} catch (error) {
  session.logger.error(error, 'Risk operation failed', {
    context: 'user-action',
    retryable: true
  });
}
```

### Learn More
- Explore [Core Concepts](/core-concepts) to understand sessions, events, and the app lifecycle
- Dive into [Events](/events) to handle user interactions and sensor data
- Master [Layouts](/layouts) to create rich visual experiences on smart glasses
- Learn about [Permissions](/permissions) to understand how to access device data securely

### Get Help
- Join our [Discord community](https://discord.gg/5ukNvkEAqT) for support
- Visit [Mentra.glass](https://mentra.glass) for the latest updates
- Check out the [GitHub Organization](https://github.com/Mentra-Community) for examples
- For a more in-depth example with app settings support, see the [Extended Example](https://github.com/Mentra-Community/MentraOS-Extended-Example-App)