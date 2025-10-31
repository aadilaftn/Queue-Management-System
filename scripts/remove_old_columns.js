/**
 * Remove old/deprecated columns from DynamoDB QueueEntries table
 * Specifically removes: waitingTimeBetween, waitedSeconds, estimatedWaitSeconds
 */

const {
  DynamoDBClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const TABLE_NAME = process.env.DYNAMODB_TABLE || "QueueEntries";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

const client = new DynamoDBClient({ region: AWS_REGION });

async function removeOldColumns() {
  console.log(
    `Scanning ${TABLE_NAME} table in region ${AWS_REGION} for items with old columns...`
  );

  try {
    // Scan for all items
    const scanResult = await client.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression:
          "clinicId, tokenId, waitingTimeBetween, waitedSeconds, estimatedWaitSeconds",
      })
    );

    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log("No items found in table.");
      return;
    }

    console.log(
      `Found ${scanResult.Items.length} items. Checking for old columns...`
    );

    let itemsWithOldColumns = 0;
    const updates = [];

    for (const item of scanResult.Items) {
      const hasOldColumns =
        item.waitingTimeBetween ||
        item.waitedSeconds ||
        item.estimatedWaitSeconds;

      if (hasOldColumns) {
        itemsWithOldColumns++;
        updates.push({
          clinicId: item.clinicId,
          tokenId: item.tokenId,
        });
      }
    }

    if (itemsWithOldColumns === 0) {
      console.log("✓ No items with old columns found. Table is clean!");
      return;
    }

    console.log(`Found ${itemsWithOldColumns} items with old columns.`);
    console.log(
      "Removing: waitingTimeBetween, waitedSeconds, estimatedWaitSeconds\n"
    );

    // Remove old columns from each item
    for (const update of updates) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
              clinicId: { S: update.clinicId },
              tokenId: { S: update.tokenId },
            },
            UpdateExpression:
              "REMOVE waitingTimeBetween, waitedSeconds, estimatedWaitSeconds",
          })
        );
        console.log(`✓ Removed old columns from token ${update.tokenId}`);
      } catch (e) {
        console.log(`  Token ${update.tokenId}: ${e.message}`);
      }
    }

    console.log(`\n✓ Successfully cleaned ${itemsWithOldColumns} items!`);
  } catch (e) {
    console.error("Error scanning or updating table:", e);
    process.exit(1);
  }
}

removeOldColumns().then(() => {
  console.log("Cleanup complete.");
  process.exit(0);
});
