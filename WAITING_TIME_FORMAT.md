# Waiting Time - Single Column

## What is Stored

Only **ONE** waiting time column in DynamoDB:

### `waitingTime`

- **Meaning**: Actual wait time between token taken and arrival (in seconds)
- **Stored As**: String (e.g., "33", "900", "3600")
- **Formula**:
  - If token has **arrived**: Time from `tokenTakenAt` to `arrivedAt`
  - If token is **waiting**: Estimated wait based on average service time

## When You See: 33

`waitingTime: 33` means **33 SECONDS**

## Conversion Reference

All waiting times are stored as **seconds** in DynamoDB:

| Value | Actual Time              | Display  |
| ----- | ------------------------ | -------- |
| 33    | **33 seconds**           | 33s      |
| 60    | 1 minute                 | 1m       |
| 90    | 1 minute 30 seconds      | 1m 30s   |
| 120   | 2 minutes                | 2m       |
| 300   | 5 minutes                | 5m       |
| 600   | 10 minutes               | 10m      |
| 900   | 15 minutes               | 15m      |
| 3600  | 1 hour                   | 1h       |
| 3661  | 1 hour 1 minute 1 second | 1h 1m 1s |

## How It Works

### Storage (DynamoDB)

- **`waitingTime`** - Estimated wait time in seconds
- **`waitingTimeBetween`** - Actual wait time (from token taken to arrival) in seconds

### Display (User Interface)

- **`waitingTimeHuman`** - Formatted display (e.g., "33s", "1m 30s", "1h 5m")
- **`waitingTimeBetweenHuman`** - Formatted display of actual wait

### Automatic Conversion

When data is sent to the UI, the system automatically converts:

```
33 seconds → 33s
825 seconds → 13m 45s
5400 seconds → 1h 30m
```

## Example Entry in DynamoDB

```json
{
  "tokenId": "001",
  "personName": "John Doe",
  "tokenTakenAt": "2025-10-18T04:32:00Z",
  "tokenTakenAtFormatted": "4:32am",
  "arrivedAt": "2025-10-18T04:33:45Z",
  "arrivedAtFormatted": "4:33am",
  "waitingTime": "900",           ← Estimated wait (900 seconds = 15 minutes)
  "waitingTimeBetween": "105",    ← Actual wait (105 seconds = 1m 45s)
  "waitingTimeHuman": "15m",      ← For display
  "waitingTimeBetweenHuman": "1m 45s"  ← For display
}
```

## Column Meanings

- **`waitingTime`** - How long the system estimated it would take before they arrived
- **`waitingTimeBetween`** - How long they actually waited from taking the token to arriving

If `waitingTimeBetween` is 33 seconds, it means they arrived at the cabin 33 seconds after taking their token.

## In AWS Console

You'll see the raw values (in seconds):

- `waitingTime: "900"`
- `waitingTimeBetween: "33"`

But when displayed to users (via API or Socket.IO), they see:

- `waitingTimeHuman: "15m"`
- `waitingTimeBetweenHuman: "33s"`

This makes it human-readable! ✓
