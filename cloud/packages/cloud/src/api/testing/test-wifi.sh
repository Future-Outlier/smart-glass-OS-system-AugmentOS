#!/bin/bash
# Simple curl test for device-wifi API

USER_ID="aryan.mentra.dev.public@gmail.com"
BASE_URL="${API_URL:-http://localhost:8002}"
URL="$BASE_URL/api/testing/device-wifi/$(echo "$USER_ID" | jq -sRr @uri)"

echo "🧪 Testing Device WiFi API"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "User ID: $USER_ID"
echo "URL: $URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

curl -s "$URL" | jq '.'
