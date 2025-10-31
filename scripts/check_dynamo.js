const {
  DynamoDBClient,
  ListTablesCommand,
} = require("@aws-sdk/client-dynamodb");

const region = process.env.AWS_REGION || "us-east-1";
const table = process.env.DYNAMODB_TABLE || "<<not-set>>";
console.log("Region:", region);
console.log("Table:", table);
(async () => {
  try {
    const client = new DynamoDBClient({ region });
    const res = await client.send(new ListTablesCommand({ Limit: 1 }));
    console.log(
      "ListTables OK, sample:",
      res.TableNames && res.TableNames.slice(0, 1)
    );
  } catch (e) {
    console.error("Dynamo check error:", e && e.message ? e.message : e);
  }
})();
