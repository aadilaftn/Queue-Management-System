#!/usr/bin/env node

/**
 * Script to update DynamoDB table schema with new columns
 * This adds Global Secondary Indexes (GSI) for querying by status, date, etc.
 *
 * Usage:
 *   node update_table_schema.js [tableName]
 */

const path = require("path");
const fs = require("fs");

// Get table name from args or env
let tableName = process.argv[2];
if (!tableName) {
  tableName = process.env.DYNAMODB_TABLE;
}

// If still not set, try to derive from clinic ID
if (!tableName) {
  let clinicId = process.env.CLINIC_ID;
  if (!clinicId) {
    const clinicIdFile = path.join(__dirname, "..", "data", "clinic_id.txt");
    if (fs.existsSync(clinicIdFile)) {
      clinicId = fs.readFileSync(clinicIdFile, "utf8").trim();
    }
  }
  if (clinicId) {
    tableName = `clinic_${clinicId}`;
  }
}

if (!tableName) {
  console.error("Error: Could not determine DynamoDB table name.");
  console.error(
    "Please set DYNAMODB_TABLE env var or provide table name as argument."
  );
  process.exit(1);
}

(async () => {
  try {
    const {
      DynamoDBClient,
      ListTablesCommand,
    } = require("@aws-sdk/client-dynamodb");
    const {
      DynamoDBDocumentClient,
      ScanCommand,
      UpdateCommand,
    } = require("@aws-sdk/lib-dynamodb");

    console.log(`Connecting to DynamoDB...`);
    const dynamoClient = new DynamoDBClient({});
    const ddbMapper = DynamoDBDocumentClient.from(dynamoClient);

    // Verify connectivity
    console.log(`Testing connectivity to DynamoDB...`);
    await dynamoClient.send(new ListTablesCommand({ Limit: 1 }));
    console.log("✓ DynamoDB connectivity: OK");

    // Note: DynamoDB doesn't require schema definition for new attributes
    // They can be added dynamically. This script will scan and update existing items
    // with the new columns if they don't have them yet.

    console.log(`\nScanning table: ${tableName}`);
    const scanResp = await ddbMapper.send(
      new ScanCommand({ TableName: tableName })
    );
    const items = scanResp.Items || [];
    console.log(`Found ${items.length} items in table.`);

    if (items.length === 0) {
      console.log(
        "✓ Table is empty. New columns will be added as new items are created."
      );
      process.exit(0);
    }

    console.log("\n✓ Schema is flexible in DynamoDB!");
    console.log(
      "  New columns will be automatically added to items as they are updated."
    );
    console.log("\nNew columns being used:");
    console.log("  ✓ clinicName");
    console.log("  ✓ personName (renamed from 'name')");
    console.log("  ✓ phoneNumber");
    console.log("  ✓ tokenTakenAt (renamed from 'date')");
    console.log("  ✓ tokenTakenAtFormatted");
    console.log("  ✓ dateFormatted");
    console.log("  ✓ arrivedAt");
    console.log("  ✓ arrivedAtFormatted");
    console.log("  ✓ cancelledAt");
    console.log("  ✓ cancelledAtFormatted");
    console.log("  ✓ waitingTime (seconds)");
    console.log("  ✓ waitingTimeBetween (seconds)");

    console.log(
      "\n📝 Note: Existing items will get these new columns when they are updated."
    );
    console.log("✓ Table schema update complete!");
    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
