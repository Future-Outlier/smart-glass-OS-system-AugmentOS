#!/usr/bin/env ts-node
/**
 * Live Captions TPA Test
 * 
 * This example demonstrates:
 * 1. Installing the Live Captions TPA
 * 2. Starting the app
 * 3. Streaming audio from a WAV file
 * 4. Receiving real-time transcription results
 * 5. Stopping and uninstalling the app
 */

import { resolve } from 'path';
import { MentraClient } from '../MentraClient';
import { AccountService } from '../services/AccountService';

const LIVE_CAPTIONS_PACKAGE = 'com.mentra.livecaptions';
const AUDIO_FILE_PATH = resolve(__dirname, '../audio/good-morning-2033.wav');

async function main() {
  console.log('🎯 Live Captions TPA Test Starting...\n');

  // Get test account
  const accountService = new AccountService();
  const account = accountService.getDefaultTestAccount();

  // Create client
  const client = new MentraClient({
    email: account.email,
    coreToken: account.coreToken,
    serverUrl: process.env.DEFAULT_SERVER_URL || 'ws://localhost:8002',
    debug: {
      logLevel: 'info',
      logWebSocketMessages: true
    }
  });

  // Setup event listeners
  setupEventListeners(client);

  try {
    // Step 1: Connect to AugmentOS Cloud
    console.log('📡 Connecting to AugmentOS Cloud...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Step 2: Stop app first if it's already running (to ensure clean state)
    console.log(`🛑 Ensuring ${LIVE_CAPTIONS_PACKAGE} is stopped first...`);
    try {
      await client.stopApp(LIVE_CAPTIONS_PACKAGE);
      console.log('✅ App stopped successfully');
    } catch (error) {
      console.log('ℹ️  App was not running (this is fine)');
    }

    // Step 3: Install Live Captions TPA
    console.log(`📦 Installing ${LIVE_CAPTIONS_PACKAGE}...`);
    try {
      await client.installApp(LIVE_CAPTIONS_PACKAGE);
      console.log('✅ App installed successfully');
    } catch (error: any) {
      if (error.message.includes('already installed')) {
        console.log('ℹ️  App is already installed (this is fine)');
      } else {
        console.log('⚠️  Install error:', error.message);
      }
    }

    // Step 4: Start the Live Captions app
    console.log(`🚀 Starting ${LIVE_CAPTIONS_PACKAGE}...`);
    await client.startApp(LIVE_CAPTIONS_PACKAGE);
    console.log('✅ App started successfully\n');

    // Wait a moment for app to initialize
    await sleep(2000);

    // Step 5: Check running apps
    const runningApps = client.getRunningApps();
    console.log('📱 Currently running apps:', runningApps);
    
    if (!runningApps.includes(LIVE_CAPTIONS_PACKAGE)) {
      throw new Error('Live Captions app did not start properly');
    }

    // Step 6: Stream audio file for transcription
    console.log(`🎤 Streaming audio file: ${AUDIO_FILE_PATH}`);
    console.log('📝 Listening for transcription results...\n');
    
    await client.startSpeakingFromFile(AUDIO_FILE_PATH);
    console.log('✅ Audio streaming completed\n');

    // Wait for transcription to complete
    console.log('⏳ Waiting for transcription to complete...');
    await sleep(5000);

    // Step 7: Stop the app
    console.log(`🛑 Stopping ${LIVE_CAPTIONS_PACKAGE}...`);
    await client.stopApp(LIVE_CAPTIONS_PACKAGE);
    console.log('✅ App stopped successfully\n');

    // Step 8: Optionally uninstall the app
    const shouldUninstall = process.argv.includes('--uninstall');
    if (shouldUninstall) {
      console.log(`🗑️  Uninstalling ${LIVE_CAPTIONS_PACKAGE}...`);
      await client.uninstallApp(LIVE_CAPTIONS_PACKAGE);
      console.log('✅ App uninstalled successfully\n');
    } else {
      console.log('ℹ️  App left installed (use --uninstall flag to remove)\n');
    }

    // Step 9: Disconnect
    console.log('👋 Disconnecting...');
    await client.disconnect();
    console.log('✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

function setupEventListeners(client: MentraClient) {
  // Display events (transcription results should appear here)
  client.on('display_event', (event) => {
    console.log('📺 Display Event:', {
      type: event.layout?.type,
      text: event.layout?.textData?.text,
      timestamp: event.timestamp.toISOString()
    });
  });

  // App state changes
  client.on('app_state_change', (event) => {
    console.log('🔄 App State Change:', {
      activeApps: event.userSession.activeAppSessions,
      loadingApps: event.userSession.loadingApps,
      isTranscribing: event.userSession.isTranscribing,
      timestamp: event.timestamp.toISOString()
    });
  });

  // Microphone state changes
  client.on('microphone_state_change', (event) => {
    console.log('🎤 Microphone State:', {
      enabled: event.isMicrophoneEnabled,
      timestamp: event.timestamp.toISOString()
    });
  });

  // Settings updates
  client.on('settings_update', (event) => {
    console.log('⚙️  Settings Update:', {
      settings: event.settings,
      timestamp: event.timestamp.toISOString()
    });
  });

  // Connection events
  client.on('connection_ack', (event) => {
    console.log('🔗 Connection ACK:', {
      sessionId: event.sessionId,
      timestamp: event.timestamp.toISOString()
    });
  });

  // Errors
  client.on('error', (error) => {
    console.error('❌ Client Error:', error);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
if (require.main === module) {
  main().catch(console.error);
}