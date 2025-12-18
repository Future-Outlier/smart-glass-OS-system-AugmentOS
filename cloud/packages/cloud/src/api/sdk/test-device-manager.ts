#!/usr/bin/env node
/**
 * Test script for SDK device-manager API endpoint
 *
 * Usage:
 *   bun run cloud/packages/cloud/src/api/sdk/test-device-manager.ts
 *
 * Environment variables:
 *   API_URL - Base URL (default: http://localhost:8002)
 *   PACKAGE_NAME - Your package name
 *   API_KEY - Your API key
 *   USER_EMAIL - Target user email (default: aryan.mentra.dev.public@gmail.com)
 */

const userId = process.env.USER_EMAIL || "aryan.mentra.dev.public@gmail.com";
const baseUrl = process.env.API_URL || "http://localhost:8002";
const packageName = process.env.PACKAGE_NAME || "com.example.testapp";
const apiKey = process.env.API_KEY || "test-api-key-123";

async function testEndpoint(
  endpoint: string,
  name: string,
  authToken: string,
) {
  const url = `${baseUrl}/api/sdk/device-manager/${encodeURIComponent(userId)}/${endpoint}`;

  console.log(`\n${"━".repeat(50)}`);
  console.log(`📡 Testing ${name} Endpoint`);
  console.log(`URL: ${url}`);
  console.log("━".repeat(50));

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    const data = await response.json();

    console.log(`✅ Status: ${response.status}`);
    console.log("\n📦 Response:");
    console.log(JSON.stringify(data, null, 2));

    if (data.success) {
      console.log(`\n✨ ${name} Data:`);
      Object.entries(data).forEach(([key, value]) => {
        if (key !== "success" && key !== "userId" && key !== "timestamp") {
          console.log(`  • ${key}: ${value ?? "N/A"}`);
        }
      });
    } else {
      console.log("\n⚠️  Request failed:", data.message || data.error);
    }
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
  }
}

async function testDeviceManagerSdkApi() {
  console.log("🧪 Testing SDK Device Manager API (Authenticated)");
  console.log("━".repeat(50));
  console.log(`User Email: ${userId}`);
  console.log(`Package Name: ${packageName}`);
  console.log(`API Key: ${apiKey.substring(0, 10)}...`);
  console.log("━".repeat(50));

  const authToken = `${packageName}:${apiKey}`;

  // Test WiFi endpoint
  await testEndpoint("wifi", "WiFi", authToken);

  // Test Battery endpoint
  await testEndpoint("battery", "Battery", authToken);

  // Test Hotspot endpoint
  await testEndpoint("hotspot", "Hotspot", authToken);

  console.log(`\n${"━".repeat(50)}`);
  console.log("✅ All tests completed!");
  console.log("━".repeat(50));
}

testDeviceManagerSdkApi();
