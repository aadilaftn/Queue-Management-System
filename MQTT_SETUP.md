# MQTT Integration with AWS IoT Core

This guide explains how to set up MQTT integration with AWS IoT Core for live updates to your frontend dashboards and connected devices.

## Architecture Overview

The system uses a **server-bridge architecture**:

- **Backend Server**: Acts as an MQTT client connecting to AWS IoT Core via mTLS (mutual TLS with device certificates)
- **MQTT Broker**: AWS IoT Core endpoint handles pub/sub messaging
- **Frontend Dashboards**: Receive updates via WebSocket (Socket.IO) forwarded from the server
- **IoT Devices**: Publish/subscribe to MQTT topics directly or via the backend bridge

### Message Flow

```
Device 1 (Python/MQTT)
    ↓ (MQTT publish)
    ↓
AWS IoT Core (MQTT Broker)
    ↓ (MQTT subscribe)
    ↓
Backend Server
    ↓ (Socket.IO emit)
    ↓
Frontend Dashboard (Real-time updates)

Queue Update Flow:
Backend broadcastQueue() → MQTT publish → Devices receive update
```

## Prerequisites

You need:

1. AWS Account with IoT Core enabled
2. Device certificates (cert, key, and CA root certificate)
3. AWS IoT endpoint URL (e.g., `aqrvs9wjclzg2-ats.iot.us-east-1.amazonaws.com`)
4. IoT policy allowing Publish/Subscribe on your topics
5. Node.js mqtt package (already installed: `npm install mqtt`)

## Step-by-Step Setup

### 1. Get Your AWS IoT Endpoint

```powershell
# Install AWS CLI if needed, then run:
aws iot describe-endpoint --endpoint-type iot:Data-ATS
```

This returns your endpoint URL like: `aqrvs9wjclzg2-ats.iot.us-east-1.amazonaws.com`

### 2. Create or Locate Device Certificates

Option A: Create new certificates in AWS IoT Console

```powershell
# Navigate to AWS IoT Console > Certificates > Create certificate
# Download and save:
#   - Certificate (spider.cert.pem)
#   - Private Key (spider.private.key)
#   - Root CA (root-CA.crt)
```

Option B: Use existing certificates from `connect_device_package/`

```powershell
# If you already have certs in connect_device_package/, copy them:
Copy-Item "c:\Users\usama\Downloads\connect_device_package\spider.cert.pem" -Destination "c:\Users\usama\OneDrive\Desktop\QUEUE MANAGEMENT SYSTEM\spider.cert.pem"
Copy-Item "c:\Users\usama\Downloads\connect_device_package\spider.private.key" -Destination "c:\Users\usama\OneDrive\Desktop\QUEUE MANAGEMENT SYSTEM\spider.private.key"
Copy-Item "c:\Users\usama\Downloads\connect_device_package\root-CA.crt" -Destination "c:\Users\usama\OneDrive\Desktop\QUEUE MANAGEMENT SYSTEM\root-CA.crt"
```

### 3. Create or Update IoT Policy

Ensure your certificate is attached to an IoT Policy that allows:

- `iot:Connect`
- `iot:Publish` on `queue/clinic/+/updates` and `queue/clinic/+/incoming/+`
- `iot:Subscribe` on `queue/clinic/+/incoming/+` and `topicfilter/queue/clinic/+/incoming/+`
- `iot:Receive` on subscribed topics

Example policy (save as `iot-policy.json`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:client/server-*"
    },
    {
      "Effect": "Allow",
      "Action": ["iot:Publish", "iot:Receive"],
      "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:topic/queue/clinic/*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": "arn:aws:iot:REGION:ACCOUNT_ID:topicfilter/queue/clinic/*"
    }
  ]
}
```

### 4. Configure Environment Variables

Set these environment variables before starting the server:

**PowerShell:**

```powershell
$env:IOT_ENDPOINT = "aqrvs9wjclzg2-ats.iot.us-east-1.amazonaws.com"
$env:IOT_CERT_PATH = "c:\Users\usama\OneDrive\Desktop\QUEUE MANAGEMENT SYSTEM\spider.cert.pem"
$env:IOT_KEY_PATH = "c:\Users\usama\OneDrive\Desktop\QUEUE MANAGEMENT SYSTEM\spider.private.key"
$env:IOT_CA_PATH = "c:\Users\usama\OneDrive\Desktop\QUEUE MANAGEMENT SYSTEM\root-CA.crt"
$env:IOT_TOPIC_PREFIX = "queue/clinic/default/"
$env:MQTT_CLIENT_ID = "queue-server-$(Get-Date -Format 'yyyyMMddHHmmss')"
```

**Or create a `.env` file** (if you're using `dotenv`):

```
IOT_ENDPOINT=aqrvs9wjclzg2-ats.iot.us-east-1.amazonaws.com
IOT_CERT_PATH=./spider.cert.pem
IOT_KEY_PATH=./spider.private.key
IOT_CA_PATH=./root-CA.crt
IOT_TOPIC_PREFIX=queue/clinic/default/
MQTT_CLIENT_ID=queue-server-123456
```

### 5. Start the Server with MQTT

```powershell
cd "c:\Users\usama\OneDrive\Desktop\QUEUE MANAGEMENT SYSTEM"

# Set environment variables
$env:IOT_ENDPOINT = "YOUR_ENDPOINT"
$env:IOT_CERT_PATH = "./spider.cert.pem"
$env:IOT_KEY_PATH = "./spider.private.key"
$env:IOT_CA_PATH = "./root-CA.crt"

# Start server
npm start
```

Expected output:

```
MQTT: Connecting to mqtts://YOUR_ENDPOINT:8883...
MQTT: Connected to AWS IoT Core
MQTT: Subscribed to queue/clinic/default/incoming/+
Server running on http://localhost:3000
```

## Testing the MQTT Integration

### Test 1: Verify Server Connects to IoT Core

Check the server logs for:

```
MQTT: Connected to AWS IoT Core
MQTT: Subscribed to queue/clinic/default/incoming/+
```

### Test 2: Publish a Test Message from Device

Use the Python device SDK to publish:

```python
# From connect_device_package/aws-iot-device-sdk-python-v2/samples/
python samples/pubsub.py \
  --endpoint YOUR_ENDPOINT \
  --ca_file root-CA.crt \
  --cert spider.cert.pem \
  --key spider.private.key \
  --client_id testDevice \
  --topic queue/clinic/default/incoming/device1 \
  --message '{"action": "status", "data": "test"}' \
  --count 1
```

Check server logs for:

```
MQTT: Received message from queue/clinic/default/incoming/device1
```

### Test 3: Verify Frontend Receives Queue Updates

1. Open browser: `http://localhost:3000`
2. Create a token via the UI
3. Server should publish to `queue/clinic/default/updates` via MQTT
4. All MQTT subscribed clients receive the update
5. Frontend receives via Socket.IO and updates display

### Test 4: Check MQTT Traffic

Use AWS IoT Console → Test → MQTT Client:

1. Subscribe to `queue/clinic/default/#` (all topics under this prefix)
2. Watch for messages as tokens are created/arrive

## MQTT Topics & Message Format

### Topics Published by Server

**Topic:** `queue/clinic/{clinicId}/updates`

- **QoS:** 1 (at least once)
- **Frequency:** When queue changes (token created, arrived, cancelled)
- **Payload:** Full queue state (JSON)

**Example payload:**

```json
{
  "lastToken": 15,
  "avgServiceSeconds": 180,
  "entries": [
    {
      "token": 10,
      "tokenId": "10",
      "name": "John Doe",
      "status": "waiting",
      "timestamp": "2025-10-18T10:30:00Z",
      "waitingTime": 45,
      "waitingTimeHuman": "45s"
    }
  ]
}
```

### Topics Server Subscribes To

**Topic:** `queue/clinic/{clinicId}/incoming/+`

- **QoS:** 1
- **Expected Payload:** JSON with device/kiosk status updates

**Example device message:**

```json
{
  "deviceId": "kiosk-1",
  "action": "token_displayed",
  "token": 10,
  "timestamp": "2025-10-18T10:30:15Z"
}
```

## Troubleshooting

### "MQTT: IOT_ENDPOINT not configured, skipping MQTT setup"

**Cause:** Environment variables not set
**Fix:**

```powershell
$env:IOT_ENDPOINT = "your-endpoint.iot.region.amazonaws.com"
# Then restart server
npm start
```

### "MQTT: Connection error: ECONNREFUSED"

**Cause:** Endpoint URL or credentials incorrect
**Fix:**

- Verify endpoint URL: `aws iot describe-endpoint --endpoint-type iot:Data-ATS`
- Verify certificate paths are correct
- Ensure certificate is attached to an IoT policy

### "MQTT: Failed to subscribe to queue/clinic/default/incoming/+"

**Cause:** Certificate/policy doesn't have Subscribe permission
**Fix:**

- Attach an IoT policy with `iot:Subscribe` action
- Ensure resource includes `topicfilter/queue/clinic/*`

### "Declaration or statement expected" JS error

**Cause:** Syntax error in server.js
**Fix:**

```powershell
npm start 2>&1 | Select-String "error|Error"
```

## Frontend Integration (Optional)

The frontend automatically receives MQTT messages via Socket.IO. To explicitly handle MQTT messages in React:

```javascript
// In public/app.jsx
useEffect(() => {
  socket.on("mqtt_message", (data) => {
    console.log("Received MQTT message:", data.topic, data.payload);
    // Update UI with device-originated data if needed
  });

  return () => {
    socket.off("mqtt_message");
  };
}, []);
```

## Device SDK Examples

### Python Device Publishing to Queue Topic

```python
from awsiot import mqtt_connection_builder
import json

# Build MQTT connection
mqtt_connection = mqtt_connection_builder.mtls_from_path(
    endpoint="YOUR_ENDPOINT",
    cert_filepath="spider.cert.pem",
    key_filepath="spider.private.key",
    ca_filepath="root-CA.crt",
    client_id="kiosk-1"
)

# Connect
mqtt_connection.connect()

# Publish kiosk status
message = {
    "deviceId": "kiosk-1",
    "action": "token_displayed",
    "token": 10,
    "timestamp": "2025-10-18T10:30:15Z"
}

mqtt_connection.publish(
    topic="queue/clinic/default/incoming/kiosk1",
    payload=json.dumps(message),
    qos=1
)

mqtt_connection.disconnect()
```

### Node.js Device Publishing

```javascript
const mqtt = require("mqtt");
const fs = require("fs");

const options = {
  cert: fs.readFileSync("spider.cert.pem"),
  key: fs.readFileSync("spider.private.key"),
  ca: fs.readFileSync("root-CA.crt"),
};

const client = mqtt.connect("mqtts://YOUR_ENDPOINT:8883", {
  ...options,
  clientId: "device-node-1",
});

client.on("connect", () => {
  const msg = {
    deviceId: "device-node-1",
    action: "status",
    timestamp: new Date().toISOString(),
  };

  client.publish("queue/clinic/default/incoming/device1", JSON.stringify(msg), {
    qos: 1,
  });

  client.end();
});
```

## Performance Notes

- **MQTT Publish Frequency:** Queue is published whenever state changes (token create, arrive, cancel)
- **Socket.IO Forwarding:** Server forwards MQTT messages to subscribed browser clients with minimal latency
- **QoS 1:** Ensures messages are delivered at least once (slightly higher overhead than QoS 0, but reliable)
- **Scaling:** For many devices, use AWS IoT Fleet Provisioning to manage certificates dynamically

## Security Best Practices

1. **Rotate Certificates:** Plan regular certificate rotation before expiry
2. **Least Privilege Policies:** Only grant permissions on required topics
3. **Use Device-Specific Client IDs:** Don't hardcode reusable credentials
4. **Monitor AWS IoT Logs:** Enable CloudWatch logs to audit MQTT connections
5. **VPC Endpoint:** For production, use AWS IoT VPC endpoint to keep traffic private

## Next Steps

1. ✅ Install mqtt package (done)
2. ✅ Add MQTT configuration to server (done)
3. 📋 Get AWS IoT endpoint and certificates
4. 📋 Set up IoT policy
5. 📋 Configure environment variables
6. 📋 Start server and test connectivity
7. 📋 Publish test messages from devices
8. 📋 Monitor frontend for real-time updates

---

For more details, see:

- [AWS IoT Core Documentation](https://docs.aws.amazon.com/iot/latest/)
- [AWS IoT Device SDK for Python](https://github.com/aws/aws-iot-device-sdk-python-v2)
- [AWS IoT MQTT Topics](https://docs.aws.amazon.com/iot/latest/developerguide/topics.html)
