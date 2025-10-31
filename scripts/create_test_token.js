#!/usr/bin/env node

/**
 * Script to create a test token in QueueEntries table
 * This will populate the table with all the new columns
 */

(async () => {
  try {
    const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
    const {
      DynamoDBDocumentClient,
      PutCommand,
      ScanCommand,
    } = require("@aws-sdk/lib-dynamodb");

    const tableName = "QueueEntries";
    const clinicId = "test-clinic";

    console.log("Creating test token in QueueEntries...\n");

    const c = new DynamoDBClient({ region: "us-east-1" });
    const d = DynamoDBDocumentClient.from(c);

    // Helper functions from server.js
    function formatTime(isoTimestamp) {
      if (!isoTimestamp) return null;
      try {
        const date = new Date(isoTimestamp);
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? "pm" : "am";
        const displayHours = hours % 12 || 12;
        const paddedMinutes = String(minutes).padStart(2, "0");
        return `${displayHours}:${paddedMinutes}${ampm}`;
      } catch (e) {
        return null;
      }
    }

    function formatDateTime(isoTimestamp) {
      if (!isoTimestamp) return null;
      try {
        const date = new Date(isoTimestamp);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const year = date.getFullYear();
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? "pm" : "am";
        const displayHours = hours % 12 || 12;
        const paddedMinutes = String(minutes).padStart(2, "0");
        return `${month}/${day}/${year} ${displayHours}:${paddedMinutes}${ampm}`;
      } catch (e) {
        return null;
      }
    }

    const now = new Date().toISOString();
    const arrived = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins later

    const testItem = {
      clinicId,
      tokenId: "TEST-001",
      clinicName: "Test Clinic",
      personName: "John Doe",
      phoneNumber: "+1-555-0123",
      date: now,
      dateFormatted: formatDateTime(now),
      status: "arrived",
      tokenTakenAt: now,
      tokenTakenAtFormatted: formatTime(now),
      arrivedAt: arrived,
      arrivedAtFormatted: formatTime(arrived),
      waitingTime: "900",
      waitingTimeBetween: "900",
    };

    console.log("Test item to create:");
    console.log(JSON.stringify(testItem, null, 2));

    // Create the item
    await d.send(
      new PutCommand({
        TableName: tableName,
        Item: testItem,
      })
    );

    console.log("\n✓ Test token created successfully!");

    // Now verify it was saved
    const scanResp = await d.send(
      new ScanCommand({
        TableName: tableName,
        Limit: 1,
      })
    );

    if (scanResp.Items && scanResp.Items.length > 0) {
      console.log("\n✓ Verified in table! Columns present:");
      console.log(Object.keys(scanResp.Items[0]).sort().join("\n  "));
    }

    process.exit(0);
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
})();
