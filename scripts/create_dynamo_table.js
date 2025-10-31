#!/usr/bin/env node
const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} = require("@aws-sdk/client-dynamodb");

const tableName = process.env.DYNAMODB_TABLE;
const region =
  process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

if (!tableName) {
  console.error(
    "Please set DYNAMODB_TABLE environment variable to the desired table name."
  );
  process.exit(1);
}

const client = new DynamoDBClient({ region });

async function exists(name) {
  try {
    const cmd = new DescribeTableCommand({ TableName: name });
    await client.send(cmd);
    return true;
  } catch (e) {
    return false;
  }
}

async function create() {
  console.log(`Checking for table ${tableName} in region ${region}...`);
  if (await exists(tableName)) {
    console.log(`Table ${tableName} already exists.`);
    return;
  }
  const params = {
    TableName: tableName,
    AttributeDefinitions: [
      { AttributeName: "clinicId", AttributeType: "S" },
      { AttributeName: "tokenId", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "clinicId", KeyType: "HASH" }, // PK
      { AttributeName: "tokenId", KeyType: "RANGE" }, // SK
    ],
    BillingMode: "PAY_PER_REQUEST",
  };
  try {
    console.log("Creating table with params:", JSON.stringify(params, null, 2));
    const cmd = new CreateTableCommand(params);
    const res = await client.send(cmd);
    console.log(
      "CreateTable response:",
      res.TableDescription && res.TableDescription.TableStatus
    );
    console.log("Waiting for table to become ACTIVE may take a few seconds...");
  } catch (e) {
    console.error("Failed to create table:", e && e.message ? e.message : e);
    process.exit(1);
  }
}

create().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
