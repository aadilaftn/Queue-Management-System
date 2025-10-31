const fs = require("fs");
const path = require("path");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const DATA_FILE = path.join(__dirname, "..", "data", "queue.json");
const TABLE = process.env.DYNAMODB_TABLE;
const CLINIC_ID = process.env.CLINIC_ID || "default-clinic";

if (!TABLE) {
  console.error(
    "Please set DYNAMODB_TABLE=your-table-name and AWS creds in env"
  );
  process.exit(1);
}

if (!fs.existsSync(DATA_FILE)) {
  console.error("No data file found at", DATA_FILE);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(DATA_FILE));
const items = raw.entries || [];

(async () => {
  const client = new DynamoDBClient({});
  const doc = DynamoDBDocumentClient.from(client);
  console.log(`Uploading ${items.length} items to ${TABLE}`);
  for (const it of items) {
    const item = Object.assign({}, it);
    // attach clinicId required by the table
    item.clinicId = CLINIC_ID;
    // ensure token is present and in the expected key field tokenId
    if (!item.tokenId) {
      // prefer existing token, otherwise generate one
      if (item.token) item.tokenId = item.token.toString();
      else item.tokenId = `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    // ensure token is a string for backwards compatibility
    if (item.token && typeof item.token === "number")
      item.token = item.token.toString();
    try {
      await doc.send(new PutCommand({ TableName: TABLE, Item: item }));
      console.log("Uploaded", item.token);
    } catch (e) {
      console.error("Failed", item.token, e.message);
    }
  }
  console.log("Done");
})();
