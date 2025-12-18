# Device Manager API Documentation

## Overview

Two API endpoints for accessing device information and status:
1. **Testing API** - No authentication (for testing only)
2. **SDK API** - Authenticated with Bearer token (production-ready)

---

## 1. Testing API (No Auth)

**For testing purposes only - not for production use**

### Endpoint
```
GET /api/testing/device-wifi/:userId
```

### Features
- No authentication required
- Hardcoded test data for `aryan.mentra.dev.public@gmail.com`
- Returns real data from DeviceManager if session exists

### Example Request
```bash
curl "http://localhost:8002/api/testing/device-wifi/aryan.mentra.dev.public@gmail.com"
```

### Example Response
```json
{
  "success": true,
  "userId": "aryan.mentra.dev.public@gmail.com",
  "wifiConnected": true,
  "wifiSsid": "TestNetwork-5G",
  "wifiLocalIp": "192.168.1.100",
  "timestamp": "2025-12-17T10:30:00.000Z",
  "note": "Hardcoded test data - no active session found"
}
```

### Testing Methods
```bash
# Method 1: Using bun script
cd /Users/aryan/Documents/Work/MentraOS/cloud
bun run test:wifi

# Method 2: Using bash script
cd /Users/aryan/Documents/Work/MentraOS/cloud/packages/cloud/src/api/testing
./test-wifi.sh

# Method 3: Direct curl
curl "http://localhost:8002/api/testing/device-wifi/aryan.mentra.dev.public%40gmail.com"

# Method 4: Browser
# Open: http://localhost:8002/api/testing/device-wifi/aryan.mentra.dev.public@gmail.com
```

---

## 2. SDK API (Authenticated)

**Production-ready authenticated endpoints**

### Authentication
All endpoints use Bearer token authentication following MentraOS SDK pattern:
```
Authorization: Bearer <packageName>:<apiKey>
```

---

### WiFi Status Endpoint

**GET** `/api/sdk/device-manager/:email/wifi`

Returns WiFi connection status for a user's device.

#### Example Request
```bash
curl "http://localhost:8002/api/sdk/device-manager/user@example.com/wifi" \
  -H "Authorization: Bearer com.example.myapp:your-api-key-here"
```

#### Example Response (Success)
```json
{
  "success": true,
  "userId": "user@example.com",
  "wifiConnected": true,
  "wifiSsid": "HomeNetwork-5G",
  "wifiLocalIp": "192.168.1.50",
  "timestamp": "2025-12-17T10:30:00.000Z"
}
```

---

### Battery Status Endpoint

**GET** `/api/sdk/device-manager/:email/battery`

Returns battery and case battery status for a user's device.

#### Example Request
```bash
curl "http://localhost:8002/api/sdk/device-manager/user@example.com/battery" \
  -H "Authorization: Bearer com.example.myapp:your-api-key-here"
```

#### Example Response (Success)
```json
{
  "success": true,
  "userId": "user@example.com",
  "batteryLevel": 85,
  "charging": false,
  "caseBatteryLevel": 60,
  "caseCharging": true,
  "caseOpen": false,
  "caseRemoved": false,
  "timestamp": "2025-12-17T10:30:00.000Z"
}
```

---

### Hotspot Status Endpoint

**GET** `/api/sdk/device-manager/:email/hotspot`

Returns hotspot status for a user's device.

#### Example Request
```bash
curl "http://localhost:8002/api/sdk/device-manager/user@example.com/hotspot" \
  -H "Authorization: Bearer com.example.myapp:your-api-key-here"
```

#### Example Response (Success)
```json
{
  "success": true,
  "userId": "user@example.com",
  "hotspotEnabled": true,
  "hotspotSsid": "Device-Hotspot-5G",
  "timestamp": "2025-12-17T10:30:00.000Z"
}
```

---

### Common Response (Session Not Found)
```json
{
  "success": false,
  "message": "User session not found",
  "userId": "user@example.com",
  ...
}
```

### Error Responses

#### 401 Unauthorized - Missing Authorization
```json
{
  "error": "Missing Authorization header",
  "message": "Authorization header is required for SDK requests"
}
```

#### 401 Unauthorized - Invalid Token
```json
{
  "error": "Invalid API key",
  "message": "Provided API key is not valid for this packageName"
}
```

#### 400 Bad Request - Missing Email
```json
{
  "error": "Missing email parameter",
  "message": "Email parameter is required"
}
```

#### 404 Not Found - User Session Not Found
```json
{
  "success": false,
  "message": "User session not found",
  "userId": "user@example.com",
  "wifiConnected": false,
  "wifiSsid": null,
  "wifiLocalIp": null
}
```

#### 500 Internal Server Error
```json
{
  "error": "Failed to get device WiFi status",
  "message": "Internal server error"
}
```

### Testing SDK API

#### Using Test Script
```bash
cd /Users/aryan/Documents/Work/MentraOS/cloud
bun run test:device-manager
```

#### With Environment Variables
```bash
PACKAGE_NAME=com.myapp \
API_KEY=your-api-key \
USER_EMAIL=user@example.com \
bun run test:device-manager
```

#### Using curl

Test WiFi endpoint:
```bash
curl "http://localhost:8002/api/sdk/device-manager/aryan.mentra.dev.public@gmail.com/wifi" \
  -H "Authorization: Bearer com.example.testapp:test-api-key-123"
```

Test Battery endpoint:
```bash
curl "http://localhost:8002/api/sdk/device-manager/aryan.mentra.dev.public@gmail.com/battery" \
  -H "Authorization: Bearer com.example.testapp:test-api-key-123"
```

Test Hotspot endpoint:
```bash
curl "http://localhost:8002/api/sdk/device-manager/aryan.mentra.dev.public@gmail.com/hotspot" \
  -H "Authorization: Bearer com.example.testapp:test-api-key-123"
```

---

## Response Fields

### Common Fields (All Endpoints)
| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether the request was successful |
| `userId` | string | User email/ID |
| `timestamp` | string | ISO 8601 timestamp of response |
| `message` | string | Error or status message (optional) |
| `error` | string | Error type (only in error responses) |

### WiFi Endpoint Fields
| Field | Type | Description |
|-------|------|-------------|
| `wifiConnected` | boolean \| null | Whether device is connected to WiFi |
| `wifiSsid` | string \| null | WiFi network name (SSID) |
| `wifiLocalIp` | string \| null | Device's local IP address on WiFi network |

### Battery Endpoint Fields
| Field | Type | Description |
|-------|------|-------------|
| `batteryLevel` | number \| null | Device battery level (0-100) |
| `charging` | boolean \| null | Whether device is charging |
| `caseBatteryLevel` | number \| null | Case battery level (0-100) |
| `caseCharging` | boolean \| null | Whether case is charging |
| `caseOpen` | boolean \| null | Whether case is open |
| `caseRemoved` | boolean \| null | Whether device is removed from case |

### Hotspot Endpoint Fields
| Field | Type | Description |
|-------|------|-------------|
| `hotspotEnabled` | boolean \| null | Whether device hotspot is enabled |
| `hotspotSsid` | string \| null | Hotspot network name (SSID) |

---

## Files Created

### API Endpoints
- `cloud/packages/cloud/src/api/testing/device-wifi.api.ts` - Testing endpoint (no auth)
- `cloud/packages/cloud/src/api/sdk/device-manager.api.ts` - Production SDK endpoint (authenticated)

### Test Scripts
- `cloud/packages/cloud/src/api/testing/test-device-wifi.ts` - TypeScript test for no-auth endpoint
- `cloud/packages/cloud/src/api/testing/test-wifi.sh` - Bash test for no-auth endpoint
- `cloud/packages/cloud/src/api/sdk/test-device-manager.ts` - TypeScript test for SDK endpoint

### Configuration
- `cloud/packages/cloud/src/api/index.ts` - API routes registration
- `cloud/package.json` - Added `test:wifi` and `test:device-manager` scripts

---

## Data Source

Both endpoints retrieve WiFi status from `UserSession.deviceManager.getDeviceState()`, which returns:
- `wifiConnected?: boolean` - Connection status
- `wifiSsid?: string` - Network name
- `wifiLocalIp?: string` - Local IP address

The device state is managed by the `DeviceManager` class and updated via the `/api/client/device/state` endpoint when mobile clients report device status changes.

---

## Next Steps

✅ Testing endpoint ready (no auth)
✅ Production SDK endpoint ready (with auth)
✅ Test scripts created
✅ Documentation complete

**Ready to add more endpoints!**

Follow the same pattern:
1. Create endpoint file in `cloud/packages/cloud/src/api/sdk/`
2. Use `authenticateSDK` middleware for authentication
3. Access `req.sdk.packageName` for the authenticated app
4. Register in `cloud/packages/cloud/src/api/index.ts`
5. Create test scripts as needed
