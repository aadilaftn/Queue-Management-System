# DynamoDB Table Schema Update

## Current Configuration

Your system is configured to use the table name from one of these sources (in order):

1. `DYNAMODB_TABLE` environment variable
2. Derived from `CLINIC_ID` as `clinic_{CLINIC_ID}`
3. Currently configured: `clinic_8bd1f0c2-3a0b-4d6e-9b2f-6a4f8a2f3c9d`

But you mentioned using: `QueueEntries`

## New DynamoDB Columns

The following columns are now being saved to the table:

### Identifiers & Metadata

- `clinicId` (PK) - Clinic identifier
- `tokenId` (SK) - Token identifier
- `clinicName` - Name of the clinic
- `status` - Token status (waiting, arrived, served, cancelled)

### Person Information

- `personName` - Patient/Person name
- `phoneNumber` - Contact phone number

### Date & Time Fields

| Field                   | Format                | Example                | Usage   |
| ----------------------- | --------------------- | ---------------------- | ------- |
| `date`                  | ISO 8601              | "2025-10-18T16:45:30Z" | Storage |
| `dateFormatted`         | MM/DD/YYYY HH:MMam/pm | "10/18/2025 4:45pm"    | Display |
| `tokenTakenAt`          | ISO 8601              | "2025-10-18T16:32:00Z" | Storage |
| `tokenTakenAtFormatted` | HH:MMam/pm            | "4:32pm"               | Display |
| `arrivedAt`             | ISO 8601              | "2025-10-18T16:45:00Z" | Storage |
| `arrivedAtFormatted`    | HH:MMam/pm            | "4:45pm"               | Display |
| `cancelledAt`           | ISO 8601              | "2025-10-18T17:00:00Z" | Storage |
| `cancelledAtFormatted`  | HH:MMam/pm            | "5:00pm"               | Display |

### Timing Information

- `waitingTime` - Estimated wait time in seconds (string)
- `waitingTimeBetween` - Actual wait time between token taken and arrival in seconds (string)

## How to Apply Changes

### Option 1: Use Your Existing Table `QueueEntries`

Set the environment variable and restart the server:

```bash
$env:DYNAMODB_TABLE = "QueueEntries"
node server.js
```

Then new items will automatically include all the new columns.

### Option 2: Update Table Configuration

If you want to use the clinic-based table name, set up the environment:

```bash
$env:DYNAMODB_TABLE = "clinic_8bd1f0c2-3a0b-4d6e-9b2f-6a4f8a2f3c9d"
$env:AWS_REGION = "us-east-1"
node server.js
```

## Important Notes

✅ **DynamoDB is flexible** - No need to pre-define columns
✅ **Backward compatible** - Old items will work with new code
✅ **Automatic** - New columns are added as items are created/updated
✅ **Both formats** - ISO timestamps stored + formatted versions for easy reading

## Next Steps

1. Clear the `QueueEntries` table (you already did this)
2. Restart the server with the correct table name
3. Create new tokens - they will automatically have all new columns
4. View the table in AWS Console to verify the columns are there

## Schema in AWS Console

You should see these columns in your `QueueEntries` table:

- clinicId (Partition Key)
- tokenId (Sort Key)
- clinicName
- personName
- phoneNumber
- date, dateFormatted
- tokenTakenAt, tokenTakenAtFormatted
- arrivedAt, arrivedAtFormatted
- cancelledAt, cancelledAtFormatted
- status
- waitingTime
- waitingTimeBetween
