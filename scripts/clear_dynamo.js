#!/usr/bin/env node

/**
 * Script to clear all items from a DynamoDB table
 *
 * Usage:
 *   node clear_dynamo.js [tableName]
 *
 * If tableName is not provided, it will use DYNAMODB_TABLE env var or derived from CLINIC_ID
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
      DeleteCommand,
    } = require("@aws-sdk/lib-dynamodb");

    console.log(`Connecting to DynamoDB...`);
    const dynamoClient = new DynamoDBClient({});
    const ddbMapper = DynamoDBDocumentClient.from(dynamoClient);

    // Verify connectivity
    console.log(`Testing connectivity to DynamoDB...`);
    await dynamoClient.send(new ListTablesCommand({ Limit: 1 }));
    console.log("✓ DynamoDB connectivity: OK");

    // Scan all items
    console.log(`\nScanning table: ${tableName}`);
    let scanResp;
    try {
      scanResp = await ddbMapper.send(
        new ScanCommand({ TableName: tableName })
      );
    } catch (scanError) {
      if (scanError.name === "ResourceNotFoundException") {
        console.error(
          `\n❌ Error: Table "${tableName}" does not exist in DynamoDB.`
        );
        console.error("\nTo create the table, run:");
        console.error(`  node scripts/create_dynamo_table.js ${tableName}`);
        console.error("\nOr set a different table name:");
        console.error(
          `  DYNAMODB_TABLE=your_table_name node scripts/clear_dynamo.js --force`
        );
        process.exit(1);
      }
      throw scanError;
    }
    const items = scanResp.Items || [];
    console.log(`Found ${items.length} items to delete.`);

    if (items.length === 0) {
      console.log("✓ Table is already empty!");
      process.exit(0);
    }

    // Confirm before deleting
    if (process.argv.includes("--force") || process.argv.includes("-f")) {
      console.log("\nDeleting all items (--force flag set)...");
    } else {
      console.log("\n⚠️  WARNING: About to delete all items from the table!");
      console.log("To confirm and delete, run with --force flag:");
      console.log(`  node clear_dynamo.js ${tableName} --force`);
      process.exit(0);
    }

    // Delete all items
    let deleted = 0;
    for (const item of items) {
      try {
        await ddbMapper.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              clinicId: item.clinicId,
              tokenId: item.tokenId,
            },
          })
        );
        deleted++;
        if (deleted % 10 === 0) {
          console.log(`  Deleted ${deleted}/${items.length} items...`);
        }
      } catch (e) {
        console.error(
          `Failed to delete item with tokenId ${item.tokenId}:`,
          e.message
        );
      }
    }

    console.log(`\n✓ Successfully deleted ${deleted} items from ${tableName}`);
    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
