#!/usr/bin/env node

/**
 * Script to create the QueueEntries DynamoDB table
 *
 * Usage:
 *   node create_queue_entries_table.js [region]
 *
 * Default region: us-east-1
 */

const region = process.argv[2] || process.env.AWS_REGION || "us-east-1";
const tableName = "QueueEntries";

(async () => {
  try {
    const {
      DynamoDBClient,
      CreateTableCommand,
      DescribeTableCommand,
      ListTablesCommand,
    } = require("@aws-sdk/client-dynamodb");

    console.log(
      `Creating DynamoDB table '${tableName}' in region '${region}'...\n`
    );
    const client = new DynamoDBClient({ region });

    // First, list available tables
    console.log("Checking available tables...");
    const listResp = await client.send(new ListTablesCommand({ Limit: 100 }));
    console.log("Available tables:", listResp.TableNames || []);

    // Check if table already exists
    console.log(`\nChecking if table '${tableName}' exists...`);
    try {
      const describeResp = await client.send(
        new DescribeTableCommand({ TableName: tableName })
      );
      console.log(`✓ Table '${tableName}' already exists!`);
      console.log(`  Status: ${describeResp.Table.TableStatus}`);
      console.log(`  Item Count: ${describeResp.Table.ItemCount}`);
      console.log(`  Size: ${describeResp.Table.TableSizeBytes} bytes`);
      process.exit(0);
    } catch (e) {
      if (e.name === "ResourceNotFoundException") {
        console.log(`✗ Table '${tableName}' does not exist. Creating...`);
      } else {
        throw e;
      }
    }

    // Create the table
    const params = {
      TableName: tableName,
      AttributeDefinitions: [
        { AttributeName: "clinicId", AttributeType: "S" },
        { AttributeName: "tokenId", AttributeType: "S" },
        { AttributeName: "status", AttributeType: "S" },
        { AttributeName: "date", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "clinicId", KeyType: "HASH" }, // Partition Key
        { AttributeName: "tokenId", KeyType: "RANGE" }, // Sort Key
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "status-date-index",
          KeySchema: [
            { AttributeName: "status", KeyType: "HASH" },
            { AttributeName: "date", KeyType: "RANGE" },
          ],
          Projection: {
            ProjectionType: "ALL",
          },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5,
          },
        },
      ],
      BillingMode: "PAY_PER_REQUEST",
    };

    console.log(`\nTable configuration:`);
    console.log(JSON.stringify(params, null, 2));

    const createResp = await client.send(new CreateTableCommand(params));
    console.log(`\n✓ Table creation initiated!`);
    console.log(`  Table Name: ${createResp.TableDescription.TableName}`);
    console.log(`  Status: ${createResp.TableDescription.TableStatus}`);
    console.log(`  ARN: ${createResp.TableDescription.TableArn}`);

    console.log("\n⏳ Waiting for table to become active...");
    let isActive = false;
    let attempts = 0;
    while (!isActive && attempts < 60) {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
      try {
        const describeResp = await client.send(
          new DescribeTableCommand({ TableName: tableName })
        );
        console.log(`  Status: ${describeResp.Table.TableStatus}`);
        if (describeResp.Table.TableStatus === "ACTIVE") {
          isActive = true;
          console.log("\n✓ Table is now ACTIVE!");
        }
      } catch (e) {
        // Table might not be visible yet
      }
      attempts++;
    }

    if (!isActive) {
      console.log(
        "\n⚠️  Table creation may still be in progress. Check AWS Console for status."
      );
    }

    console.log("\n✓ QueueEntries table ready for use!");
    console.log("  New columns being tracked:");
    console.log("    - clinicId (PK)");
    console.log("    - tokenId (SK)");
    console.log("    - clinicName");
    console.log("    - personName");
    console.log("    - phoneNumber");
    console.log("    - date / dateFormatted");
    console.log("    - tokenTakenAt / tokenTakenAtFormatted");
    console.log("    - arrivedAt / arrivedAtFormatted");
    console.log("    - cancelledAt / cancelledAtFormatted");
    console.log("    - status");
    console.log("    - waitingTime");
    console.log("    - waitingTimeBetween");

    process.exit(0);
  } catch (e) {
    console.error("✗ Error:", e.message);
    process.exit(1);
  }
})();
