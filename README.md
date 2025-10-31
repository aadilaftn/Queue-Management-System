# Queue Management Prototype

This is a minimal real-time queue management prototype (Express + Socket.IO + MQTT) intended as the first step for a digital queue system for clinics/banks/customer centers.

Features included:

- Take a token
- View live queue in user UI with real-time elapsed time tracking
- Cancel token
- Admin UI to Serve/Skip and Reset
- Real-time updates via Socket.IO (WebSocket)
- **NEW: MQTT integration with AWS IoT Core for device synchronization** ✨
- Optional DynamoDB persistence

## Run locally

1. Install dependencies

```powershell
cd "c:/Users/usama/OneDrive/Desktop/QUEUE MANAGEMENT SYSTEM"
npm install
```

2. Start server (without MQTT)

```powershell
npm start
```

3. Open UIs

- User: http://localhost:3000/
- Admin: http://localhost:3000/admin.html

## MQTT Integration with AWS IoT Core (NEW)

To enable live updates to frontend dashboards via MQTT and AWS IoT Core:

1. Get AWS IoT endpoint and device certificates (see [MQTT_SETUP.md](MQTT_SETUP.md))
2. Set environment variables:
   ```powershell
   $env:IOT_ENDPOINT = "your-endpoint.iot.region.amazonaws.com"
   $env:IOT_CERT_PATH = "./spider.cert.pem"
   $env:IOT_KEY_PATH = "./spider.private.key"
   $env:IOT_CA_PATH = "./root-CA.crt"
   ```
3. Start server: `npm start`

The server will:

- Connect to AWS IoT Core via mTLS
- Subscribe to device updates on `queue/clinic/{clinicId}/incoming/+`
- Publish queue state to `queue/clinic/{clinicId}/updates`
- Forward MQTT messages to frontend dashboards via Socket.IO

**See [MQTT_SETUP.md](MQTT_SETUP.md) for detailed configuration, testing, and troubleshooting.**

## Next steps / Integration notes

- ✅ Real-time updates via Socket.IO
- ✅ **MQTT bridge to AWS IoT Core for device synchronization**
- Store queue entries in DynamoDB instead of local JSON for persistence across instances. Keys: token (number), status (string), timestamps, phone for SNS.
- Use SNS to send SMS when a token is N slots away (e.g., 3). An AWS Lambda or backend worker can subscribe to DynamoDB Streams or listen to IoT events to trigger SNS.
- For production: use API Gateway + Lambda or an ECS/Fargate service for the API, enable authentication for admin, and use CloudWatch for analytics.

Architecture diagram and full report will be provided separately (next deliverable).

## Enabling DynamoDB sync (optional)

The app supports optional synchronization with DynamoDB. When enabled the server will:

- Load existing items from the configured table on startup.
- Periodically poll the table for changes (configurable).
- Sync new/updated entries to DynamoDB when tokens are taken, arrived, served, skipped or cancelled.

Steps to enable:

1. Ensure AWS credentials are available (environment variables AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and optional AWS_SESSION_TOKEN), or configure `~/.aws/credentials` with a profile and set `AWS_PROFILE`.

2. Set these environment variables before running the script or server:

```
set DYNAMODB_TABLE=your-table-name
set AWS_REGION=us-east-1
set CLINIC_ID=your-clinic-id   # optional; a clinic id will be generated and stored if not provided
```

3. Create the DynamoDB table (one-time). The repo includes a helper:

```
npm run create-table
```

This will create a table with primary key `clinicId` (string) and sort key `tokenId` (string). It uses PAY_PER_REQUEST billing mode.

4. Migrate existing local data to DynamoDB (optional):

```
set DYNAMODB_TABLE=your-table-name
set CLINIC_ID=your-clinic-id
node scripts/migrate_to_dynamo.js
```

5. Start the server with DynamoDB sync enabled by setting `DYNAMODB_TABLE` in the environment when launching the server. Example (PowerShell):

```powershell
set DYNAMODB_TABLE=your-table-name; set AWS_REGION=us-east-1; npm start
```

Notes:

- If the app cannot connect to DynamoDB at startup (missing credentials, wrong region, or table doesn't exist), Dynamo sync will be disabled but the server will continue operating using local JSON storage.
- For production, consider using IAM roles (EC2/ECS/Lambda) rather than long-lived credentials and enable monitoring with CloudWatch.

### Quick enable via DYNAMO_ENABLE

You can enable Dynamo sync with a single flag. If `DYNAMO_ENABLE=true` is set and `DYNAMODB_TABLE` is not provided, the server will derive a default table name from the `CLINIC_ID` (e.g. `clinic_<clinicId>`) and attempt to use it. This is handy for quick testing.

Example (PowerShell):

```powershell
set DYNAMO_ENABLE=true; set AWS_REGION=us-east-1; npm start
```

If you prefer to explicitly set the table name use `DYNAMODB_TABLE` as documented above. If the server cannot access Dynamo the sync will be disabled and it will continue using local JSON storage.

## Simulate a kiosk (publish tokens to AWS IoT Core)

A simple Python simulator is included at `scripts/simulate_kiosk.py`. It publishes token messages to a topic (default `queue/tokens`) and supports the AWS IoT Device SDK v2 or falls back to `paho-mqtt`.

Install Python deps (choose one approach):

- AWS IoT Device SDK v2 (preferred):

```
pip install awscrt awsiot
```

- Or fallback with paho-mqtt:

```
pip install paho-mqtt
```

Run the simulator (PowerShell example):

```powershell
python scripts/simulate_kiosk.py --endpoint "your-endpoint.amazonaws.com" --cert device.pem.crt --key private.pem.key --root-ca AmazonRootCA1.pem --client-id Kiosk001 --topic queue/tokens --interval 5
```

The script will publish a new token message every `--interval` seconds.
