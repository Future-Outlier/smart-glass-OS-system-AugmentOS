#!/usr/bin/env node
// Test script for device-wifi API endpoint

const userId = "aryan.mentra.dev.public@gmail.com";
const baseUrl = process.env.API_URL || "http://localhost:8002";

async function testDeviceWifiApi() {
  const url = `${baseUrl}/api/testing/device-wifi/${encodeURIComponent(userId)}`;

  console.log("🧪 Testing Device WiFi API");
  console.log("━".repeat(50));
  console.log(`User ID: ${userId}`);
  console.log(`URL: ${url}`);
  console.log("━".repeat(50));

  try {
    const response = await fetch(url);
    const data = await response.json();

    console.log("\n✅ Response Status:", response.status);
    console.log("\n📦 Response Data:");
    console.log(JSON.stringify(data, null, 2));

    console.log("\n📊 WiFi Status:");
    console.log(`  • Connected: ${data.wifiConnected ?? "N/A"}`);
    console.log(`  • SSID: ${data.wifiSsid ?? "N/A"}`);
    console.log(`  • Local IP: ${data.wifiLocalIp ?? "N/A"}`);
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  }
}

testDeviceWifiApi();
