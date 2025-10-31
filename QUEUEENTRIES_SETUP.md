# QueueEntries Table Configuration - Complete Setup

## ✓ Configuration Complete

Your DynamoDB table is now fully configured with the following settings:

### Table Details

- **Table Name**: `QueueEntries`
- **Region**: `us-east-1`
- **Status**: ACTIVE ✓
- **Item Count**: 0 (cleared and ready for new data)
- **Billing Mode**: PAY_PER_REQUEST

### Key Schema

| Column     | Type   | Role               |
| ---------- | ------ | ------------------ |
| `clinicId` | String | Partition Key (PK) |
| `tokenId`  | String | Sort Key (SK)      |

### Stored Columns (Automatically Added)

#### Clinic & Person Information

- `clinicName` - Name of the clinic
- `personName` - Patient/person name
- `phoneNumber` - Contact phone number

#### Status

- `status` - Token status (waiting, arrived, served, cancelled)

#### Date & Time Fields

**Token Taken Time**

- `date` (ISO format) - "2025-10-18T16:45:30Z"
- `dateFormatted` (readable) - "10/18/2025 4:45pm"
- `tokenTakenAt` (ISO format) - "2025-10-18T16:32:00Z"
- `tokenTakenAtFormatted` (readable) - "4:32pm"

**Arrival Time**

- `arrivedAt` (ISO format) - "2025-10-18T16:45:00Z"
- `arrivedAtFormatted` (readable) - "4:45pm"

**Cancellation Time**

- `cancelledAt` (ISO format) - "2025-10-18T17:00:00Z"
- `cancelledAtFormatted` (readable) - "5:00pm"

#### Waiting Time

- `waitingTime` - Estimated wait time in seconds (string)
  - Example: "900" (15 minutes)
- `waitingTimeBetween` - Actual wait time between token taken and arrival (string)
  - Example: "825" (13 minutes 45 seconds)

## How to Start Using

### 1. Restart the Server

```powershell
cd "c:\Users\usama\OneDrive\Desktop\QUEUE MANAGEMENT SYSTEM"
$env:AWS_REGION = "us-east-1"
node server.js
```

### 2. Access the Application

- **User Interface**: http://localhost:3000
- **API Endpoint**: http://localhost:3000/api/queue

### 3. Create a Token

When you create a new token, it will automatically save with ALL these columns:

```json
{
  "clinicId": "8bd1f0c2-3a0b-4d6e-9b2f-6a4f8a2f3c9d",
  "tokenId": "001",
  "clinicName": "Central Clinic",
  "personName": "John Doe",
  "phoneNumber": "+1-555-0123",
  "date": "2025-10-18T16:32:00Z",
  "dateFormatted": "10/18/2025 4:32pm",
  "tokenTakenAt": "2025-10-18T16:32:00Z",
  "tokenTakenAtFormatted": "4:32pm",
  "status": "waiting",
  "waitingTime": "900"
}
```

When they arrive:

```json
{
  ...
  "status": "arrived",
  "arrivedAt": "2025-10-18T16:45:00Z",
  "arrivedAtFormatted": "4:45pm",
  "waitingTimeBetween": "825"
}
```

When cancelled:

```json
{
  ...
  "status": "cancelled",
  "cancelledAt": "2025-10-18T17:00:00Z",
  "cancelledAtFormatted": "5:00pm"
}
```

## Data Flow

1. **User creates token** → Saved to QueueEntries
2. **Times recorded** → Both ISO and formatted versions saved
3. **Status updates** → Arrival/cancellation times added
4. **Wait time calculated** → Stored in seconds (easily convertible)

## View in AWS Console

1. Go to AWS Console
2. DynamoDB → Tables → `QueueEntries`
3. Click on "Explore table items"
4. You'll see all the columns listed above

## Format Conversions

The formatDuration function converts seconds to readable format:

| Seconds | Display |
| ------- | ------- |
| 30      | 30s     |
| 60      | 1m      |
| 90      | 1m 30s  |
| 900     | 15m     |
| 3600    | 1h      |
| 5400    | 1h 30m  |

## Environment Setup

Your server is configured with:

- `DYNAMODB_TABLE` = "QueueEntries"
- `AWS_REGION` = "us-east-1"
- `DYNAMO_ENABLE` = true (automatically enabled)

## Ready to Use! ✓

The system is fully configured and ready for production use. Start the server and begin creating tokens!
