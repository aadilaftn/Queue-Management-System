// Load environment variables from .env file
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Server } = require("socket.io");
const {
  SNSClient,
  PublishCommand,
  SubscribeCommand,
} = require("@aws-sdk/client-sns");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "queue.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE))
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({ lastToken: 0, entries: [] }, null, 2)
  );

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server);

// MQTT configuration and client for AWS IoT Core integration
let mqttClient = null;
let mqttConnected = false;
const IOT_ENDPOINT = process.env.IOT_ENDPOINT || null;
const IOT_CERT_PATH = process.env.IOT_CERT_PATH || null;
const IOT_KEY_PATH = process.env.IOT_KEY_PATH || null;
const IOT_CA_PATH = process.env.IOT_CA_PATH || null;
const IOT_TOPIC_PREFIX =
  process.env.IOT_TOPIC_PREFIX ||
  `queue/clinic/${process.env.CLINIC_ID || "default"}/`;
const MQTT_CLIENT_ID = process.env.MQTT_CLIENT_ID || `server-${Date.now()}`;

// DynamoDB optional client (table may be set directly or enabled via DYNAMO_ENABLE)
let DYNAMO_TABLE = process.env.DYNAMODB_TABLE || "QueueEntries";
// clinic id: prefer env, otherwise persist one in data/clinic_id.txt
let CLINIC_ID = process.env.CLINIC_ID || null;
const CLINIC_ID_FILE = path.join(DATA_DIR, "clinic_id.txt");
if (!CLINIC_ID) {
  try {
    if (fs.existsSync(CLINIC_ID_FILE))
      CLINIC_ID = fs.readFileSync(CLINIC_ID_FILE, "utf8").trim();
    if (!CLINIC_ID) {
      CLINIC_ID =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : require("crypto").randomBytes(8).toString("hex");
      fs.writeFileSync(CLINIC_ID_FILE, CLINIC_ID, "utf8");
      console.log("Generated new CLINIC_ID and saved to", CLINIC_ID_FILE);
    }
  } catch (e) {
    console.warn(
      "Failed to read/write clinic id file, falling back to default-clinic",
      e.message
    );
    CLINIC_ID = CLINIC_ID || "default-clinic";
  }
}
// Respect DYNAMO_ENABLE flag: if set to true and no explicit DYNAMODB_TABLE is
// provided, derive a default table name from the clinic id so sync can be
// activated by setting DYNAMO_ENABLE=true.
const _dynamoEnableRaw = String(process.env.DYNAMO_ENABLE || "").toLowerCase();
const DYNAMO_ENABLE =
  _dynamoEnableRaw === "true" ||
  _dynamoEnableRaw === "1" ||
  _dynamoEnableRaw === "yes";
if (DYNAMO_ENABLE && !DYNAMO_TABLE) {
  DYNAMO_TABLE = `clinic_${CLINIC_ID}`;
  console.log(
    "DYNAMO_ENABLE=true detected; using derived DYNAMODB_TABLE=",
    DYNAMO_TABLE
  );
} else if (_dynamoEnableRaw) {
  console.log(
    "DYNAMO_ENABLE set to",
    _dynamoEnableRaw,
    "; DYNAMODB_TABLE=",
    DYNAMO_TABLE || "(not set)"
  );
}
let dynamoClient = null;
let ddbMapper = null;

// SNS configuration for email notifications
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || null;
let snsClient = null;
if (SNS_TOPIC_ARN) {
  snsClient = new SNSClient({ region: process.env.AWS_REGION || "us-east-1" });
  console.log("SNS email notifications enabled for topic:", SNS_TOPIC_ARN);
} else {
  console.log("SNS_TOPIC_ARN not set - email notifications disabled");
}

// Admin secret: if set, HTTP requests with header `x-admin-token` (or
// `x-admin-secret`) matching this value are allowed to create tokens via the
// web. For testing or trusted deployments you can also set
// ALLOW_WEB_TOKENS=true to permit web-based token creation from the site.
// Note: ALLOW_WEB_TOKENS is less secure than using a secret and should only
// be used in trusted environments.
const ADMIN_SECRET = process.env.SECRET_ADMIN_TOKEN || null;
const ALLOW_WEB_TOKENS =
  String(process.env.ALLOW_WEB_TOKENS || "").toLowerCase() === "true";

// Average service time per patient in seconds (configurable via environment)
// Default 180s = 3 minutes. Set via: $env:AVG_SERVICE_SECONDS="600" for 10 minutes
const DEFAULT_AVG_SERVICE_SECONDS = process.env.AVG_SERVICE_SECONDS
  ? parseInt(process.env.AVG_SERVICE_SECONDS, 10)
  : 180;

function isTokenCreationAllowed(req) {
  try {
    // explicit allow-all flag (use with caution)
    if (ALLOW_WEB_TOKENS) return true;
    // if an admin secret is configured, require the matching header
    if (ADMIN_SECRET) {
      const provided =
        req.headers["x-admin-token"] || req.headers["x-admin-secret"] || null;
      return provided && provided === ADMIN_SECRET;
    }
  } catch (e) {
    // fall through to deny
  }
  return false;
}
if (DYNAMO_TABLE) {
  const {
    DynamoDBClient,
    ListTablesCommand,
  } = require("@aws-sdk/client-dynamodb");
  const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
  dynamoClient = new DynamoDBClient({});
  ddbMapper = DynamoDBDocumentClient.from(dynamoClient);
  console.log("DynamoDB sync enabled for table", DYNAMO_TABLE);

  // quick connectivity / credentials check — if it fails, disable ddbMapper so
  // the app continues to run but without attempting Dynamo sync.
  (async () => {
    try {
      await dynamoClient.send(new ListTablesCommand({ Limit: 1 }));
      console.log("DynamoDB connectivity check: OK");
    } catch (e) {
      console.error(
        "DynamoDB connectivity/credentials check failed:",
        e && e.message ? e.message : String(e)
      );
      console.error(
        "Dynamo sync disabled. To enable: set DYNAMODB_TABLE, AWS_REGION and AWS credentials (env or ~/.aws/credentials), and ensure the table exists."
      );
      ddbMapper = null;
      dynamoClient = null;
    }
  })();
}

// load items from DynamoDB into local data store
async function loadFromDynamo() {
  if (!ddbMapper || !DYNAMO_TABLE) return;
  try {
    const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
    const resp = await ddbMapper.send(
      new ScanCommand({ TableName: DYNAMO_TABLE })
    );
    const items = resp.Items || [];
    // map Dynamo items to local entry format
    const entries = items
      .map((it) => {
        const token = it.token
          ? parseInt(it.token, 10)
          : it.tokenId
          ? parseInt(it.tokenId.replace(/[^0-9]/g, ""), 10)
          : null;
        return {
          token: token || null,
          tokenId: it.tokenId || (it.token ? it.token.toString() : null),
          clinicId: it.clinicId || CLINIC_ID,
          clinicName: it.clinicName || null,
          name: it.personName || it.name || null,
          phoneNumber: it.phoneNumber || null,
          timestamp:
            it.tokenTakenAt ||
            it.timestamp ||
            it.createdAt ||
            new Date().toISOString(),
          status: it.status || "waiting",
          arrivedAt: it.arrivedAt || null,
          servedAt: it.servedAt || null,
          cancelledAt: it.cancelledAt || null,
          waitingTime: it.waitingTime || null,
        };
      })
      .filter((e) => e.token !== null);

    // compute lastToken as max token
    const lastToken = entries.length
      ? Math.max(...entries.map((e) => e.token))
      : 0;
    const data = {
      lastToken,
      entries: entries.sort((a, b) => a.token - b.token),
    };
    writeData(data);
    console.log(
      `Loaded ${entries.length} items from DynamoDB into local store`
    );
    broadcastQueue();
  } catch (e) {
    console.error("Failed to load from DynamoDB", e.message);
  }
}

// Initialize MQTT connection to AWS IoT Core
async function initializeMQTT() {
  if (!IOT_ENDPOINT) {
    console.log("MQTT: IOT_ENDPOINT not configured, skipping MQTT setup");
    return;
  }

  try {
    const mqtt = require("mqtt");
    const fs = require("fs");

    // Build connection options based on available credentials
    const options = {
      clientId: MQTT_CLIENT_ID,
      reconnectPeriod: 5000,
      clean: true,
    };

    // If certificates are provided, use mTLS
    if (IOT_CERT_PATH && IOT_KEY_PATH) {
      console.log("MQTT: Using certificate-based authentication");
      options.cert = fs.readFileSync(IOT_CERT_PATH);
      options.key = fs.readFileSync(IOT_KEY_PATH);
      if (IOT_CA_PATH) {
        options.ca = fs.readFileSync(IOT_CA_PATH);
      }
      options.protocol = "mqtts";
      options.port = 8883;
    } else {
      // Fallback: assume websocket with default port
      console.log("MQTT: Using WebSocket authentication");
      options.protocol = "wss";
      options.port = 443;
    }

    const brokerUrl = `${options.protocol}://${IOT_ENDPOINT}:${options.port}`;
    console.log(`MQTT: Connecting to ${brokerUrl}...`);

    mqttClient = mqtt.connect(brokerUrl, options);

    mqttClient.on("connect", () => {
      console.log("MQTT: Connected to AWS IoT Core");
      mqttConnected = true;

      // Subscribe to incoming queue update messages from devices
      const incomingTopic = `${IOT_TOPIC_PREFIX}incoming/+`;
      mqttClient.subscribe(incomingTopic, (err) => {
        if (err) {
          console.error(`MQTT: Failed to subscribe to ${incomingTopic}:`, err);
        } else {
          console.log(`MQTT: Subscribed to ${incomingTopic}`);
        }
      });
    });

    mqttClient.on("message", (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        console.log(`MQTT: Received message from ${topic}`);
        // Forward messages from devices to all websocket clients
        io.emit("mqtt_message", { topic, payload });
      } catch (e) {
        console.error("MQTT: Failed to parse message:", e.message);
      }
    });

    mqttClient.on("error", (err) => {
      console.error("MQTT: Connection error:", err.message);
      mqttConnected = false;
    });

    mqttClient.on("close", () => {
      console.log("MQTT: Disconnected from AWS IoT Core");
      mqttConnected = false;
    });
  } catch (e) {
    console.error("MQTT: Initialization failed:", e.message);
    console.error(
      "To enable MQTT, set IOT_ENDPOINT, IOT_CERT_PATH, IOT_KEY_PATH"
    );
  }
}

function broadcastQueue() {
  const data = readData();
  const avgServiceSeconds = computeAvgServiceSeconds(data);
  const now = new Date();

  // attach humanized estimates for clients without changing stored data
  const payload = Object.assign({}, data, { avgServiceSeconds });
  payload.entries = (payload.entries || []).map((e) => {
    const copy = Object.assign({}, e);

    // For waiting entries, use stored waitingTime (which comes from frontend)
    // Do NOT recalculate - trust the frontend's elapsed time
    if (copy.status === "waiting") {
      // waitingTime should already be set by frontend updates
      // Just format it for display
      copy.waitedSeconds = copy.waitingTime || 0;
      copy.waitingTimeHuman = formatDuration(copy.waitingTime);
    } else if (
      copy.status === "arrived" ||
      copy.status === "served" ||
      copy.status === "cancelled"
    ) {
      // For completed entries, use stored waitingTime
      copy.waitedSeconds = copy.waitingTime || 0;
      copy.waitingTimeHuman = formatDuration(copy.waitingTime);
    }

    return copy;
  });
  io.emit("queue_update", payload);

  // Also publish queue updates to AWS IoT Core for device synchronization
  if (mqttConnected && mqttClient) {
    try {
      const topic = `${IOT_TOPIC_PREFIX}updates`;
      mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
        if (err) {
          console.error(`MQTT: Failed to publish to ${topic}:`, err.message);
        } else {
          console.log(`MQTT: Published queue update to ${topic}`);
        }
      });
    } catch (e) {
      console.error("MQTT: Error publishing queue update:", e.message);
    }
  }
}

async function syncToDynamo(entry) {
  if (!ddbMapper || !DYNAMO_TABLE) return;
  try {
    // Ensure the item includes required DynamoDB keys
    const item = Object.assign({}, entry);
    if (!item.clinicId) item.clinicId = CLINIC_ID;
    if (!item.tokenId) {
      if (item.token) item.tokenId = item.token.toString();
      else item.tokenId = `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }
    // map our internal fields to the DynamoDB schema expected
    const putItem = {
      clinicId: item.clinicId,
      tokenId: item.tokenId,
      date: item.timestamp || new Date().toISOString(),
      dateFormatted: formatDateTime(item.timestamp || new Date().toISOString()),
      status: item.status || "",
    };

    // Add all the requested columns
    if (item.clinicName) putItem.clinicName = item.clinicName;
    if (item.name) putItem.personName = item.name;
    if (item.phoneNumber) putItem.phoneNumber = item.phoneNumber;
    if (item.email) putItem.email = item.email;

    // Token taken time (store both ISO and formatted)
    if (item.timestamp) {
      putItem.tokenTakenAt = item.timestamp;
      putItem.tokenTakenAtFormatted = formatTime(item.timestamp);
    }

    // Arrival time at cabin (store both ISO and formatted)
    if (item.arrivedAt) {
      putItem.arrivedAt = item.arrivedAt;
      putItem.arrivedAtFormatted = formatTime(item.arrivedAt);
    }

    // Cancellation time (store both ISO and formatted)
    if (item.cancelledAt) {
      putItem.cancelledAt = item.cancelledAt;
      putItem.cancelledAtFormatted = formatTime(item.cancelledAt);
    }

    // ensure waitingTime is populated with actual wait (if arrived) or use stored value
    let waitSeconds = item.waitingTime; // Start with existing value if set

    // If token has arrived and we don't have a waitingTime yet, calculate actual wait time
    if (!waitSeconds && item.timestamp && item.arrivedAt) {
      try {
        const takenTime = new Date(item.timestamp);
        const arrivedTime = new Date(item.arrivedAt);
        waitSeconds = Math.max(0, Math.round((arrivedTime - takenTime) / 1000));
      } catch (e) {
        waitSeconds = 0;
      }
    } else if (!waitSeconds) {
      // Only estimate if no waitingTime is set and token hasn't arrived
      try {
        const local = readData();
        const avg = computeAvgServiceSeconds(local);
        const waiting = (local.entries || [])
          .filter((e) => e.status === "waiting")
          .sort((a, b) => a.token - b.token);
        const ahead = waiting.filter((e) => e.token < item.token).length;
        waitSeconds = Math.round(ahead * avg);
      } catch (e) {
        waitSeconds = 0;
      }
    }
    putItem.waitingTime = String(Math.max(0, Number(waitSeconds) || 0));

    const { PutCommand } = require("@aws-sdk/lib-dynamodb");
    const cmd = new PutCommand({ TableName: DYNAMO_TABLE, Item: putItem });
    await ddbMapper.send(cmd);

    // Remove old columns if they exist
    const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
    try {
      const updateCmd = new UpdateCommand({
        TableName: DYNAMO_TABLE,
        Key: {
          clinicId: item.clinicId,
          tokenId: item.tokenId,
        },
        UpdateExpression:
          "REMOVE waitedSeconds, estimatedWaitSeconds, arrivalTime",
      });
      await ddbMapper.send(updateCmd);
    } catch (e) {
      // Ignore errors if columns don't exist
    }

    console.log(
      `DynamoDB: saved item clinicId=${item.clinicId} tokenId=${item.tokenId}`
    );
  } catch (e) {
    console.error("DynamoDB sync error", e.message);
  }
}

function computeAvgServiceSeconds(data) {
  // Use recent served entries to compute a robust service time estimate.
  // Prefer actual service duration (servedAt - arrivedAt) when available,
  // otherwise fall back to (servedAt - timestamp). Use the median of the
  // recent durations to reduce sensitivity to outliers.
  const N = 50;
  const served = (data.entries || [])
    .filter((e) => e.status === "served" && e.servedAt)
    .sort((a, b) => new Date(b.servedAt) - new Date(a.servedAt))
    .slice(0, N);
  if (!served.length) return DEFAULT_AVG_SERVICE_SECONDS; // use configured default
  const durations = [];
  for (const e of served) {
    try {
      if (e.arrivedAt && e.servedAt) {
        const d = (new Date(e.servedAt) - new Date(e.arrivedAt)) / 1000;
        if (isFinite(d) && d >= 0) durations.push(d);
      } else if (e.timestamp && e.servedAt) {
        const d = (new Date(e.servedAt) - new Date(e.timestamp)) / 1000;
        if (isFinite(d) && d >= 0) durations.push(d);
      }
    } catch (err) {
      // skip malformed dates
    }
  }
  if (!durations.length) return DEFAULT_AVG_SERVICE_SECONDS;
  durations.sort((a, b) => a - b);
  const mid = Math.floor(durations.length / 2);
  const median =
    durations.length % 2 === 1
      ? durations[mid]
      : (durations[mid - 1] + durations[mid]) / 2;
  // ensure a reasonable lower bound
  return Math.max(5, Math.round(median));
}

// format seconds into a detailed human readable string, e.g. "30s", "2m", "1h 5m 30s"
function formatDuration(sec) {
  if (sec === null || typeof sec === "undefined" || sec === "") return null;
  const s = Number(sec) || 0;
  if (s < 1) return "<1s";

  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  // Build the string with available components
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

// format ISO timestamp to readable time format like "4:32am"
function formatTime(isoTimestamp) {
  if (!isoTimestamp) return null;
  try {
    const date = new Date(isoTimestamp);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? "pm" : "am";
    const displayHours = hours % 12 || 12; // Convert to 12-hour format
    const paddedMinutes = String(minutes).padStart(2, "0");
    return `${displayHours}:${paddedMinutes}${ampm}`;
  } catch (e) {
    return null;
  }
}

// format ISO timestamp to full date-time like "10/18/2025 4:32am"
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

// recompute estimated wait for all waiting tokens based on current avg and queue order
function recomputeEstimates(data) {
  const avg = computeAvgServiceSeconds(data);
  // sort entries by token to establish order
  const entries = (data.entries || [])
    .slice()
    .sort((a, b) => a.token - b.token);
  entries.forEach((entry) => {
    if (entry.status === "waiting") {
      // count only waiting tokens ahead in queue
      const ahead = entries.filter(
        (e) => e.status === "waiting" && e.token < entry.token
      ).length;
      // factor in service capacity (number of parallel servers). Default 1.
      const capacity = Math.max(
        1,
        parseInt(process.env.SERVICE_CAPACITY || "1", 10) || 1
      );
      entry.estimatedWaitSeconds = Math.round((ahead * avg) / capacity);
    }
  });
}
// helper to create a token entry (used by HTTP and kiosk socket flows)
async function createTokenEntry(profile, origin) {
  const data = readData();
  const token = data.lastToken + 1;
  const name = profile && profile.name ? String(profile.name).trim() : null;
  const phoneNumber =
    profile && profile.phoneNumber ? String(profile.phoneNumber).trim() : null;
  const email = profile && profile.email ? String(profile.email).trim() : null;
  const avg = computeAvgServiceSeconds(data);
  const waiting = (data.entries || []).filter((e) => e.status === "waiting");
  const estimatedWaitSeconds = Math.round(waiting.length * avg);
  const entry = {
    token,
    timestamp: new Date().toISOString(),
    status: "waiting",
    name,
    estimatedWaitSeconds,
    phoneNumber,
    email,
    waitingTime: 0, // Initialize to 0; frontend will send real elapsed time
  };
  entry.clinicId = CLINIC_ID;
  entry.tokenId = token.toString();
  data.lastToken = token;
  data.entries.push(entry);
  recomputeEstimates(data);
  writeData(data);
  // sync and broadcast
  syncToDynamo(entry).catch(() => {});
  broadcastQueue();
  console.log(`Created token ${token} via ${origin || "web"}`);
  return token;
}

// Send email notification via SNS
async function sendEmailNotification(email, subject, message) {
  if (!snsClient || !SNS_TOPIC_ARN || !email) {
    return;
  }

  try {
    // First, subscribe the email to the topic if not already subscribed
    try {
      const subscribeCommand = new SubscribeCommand({
        TopicArn: SNS_TOPIC_ARN,
        Protocol: "email",
        Endpoint: email,
        Attributes: {
          FilterPolicy: JSON.stringify({}),
        },
      });

      const subscribeResult = await snsClient.send(subscribeCommand);
      console.log(
        `Email ${email} subscribed to SNS topic (SubscriptionArn: ${subscribeResult.SubscriptionArn})`
      );
    } catch (subError) {
      // Subscription might fail if already subscribed, which is fine
      console.log(`Email ${email} subscription attempt: ${subError.message}`);
    }

    // Now publish the message to the topic
    const command = new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Message: message,
      Subject: subject,
      MessageAttributes: {
        email: {
          DataType: "String",
          StringValue: email,
        },
      },
    });

    await snsClient.send(command);
    console.log(`Email published to ${email}: ${subject}`);
  } catch (e) {
    console.error(`Failed to send email to ${email}:`, e.message);
  }
}

// Notify user when token is created
async function notifyTokenCreated(token, name, email) {
  if (!email) return;

  const subject = `Queue Token #${token} Created`;
  const message = `Hello ${name},\n\nYour token number is #${token}.\n\nPlease wait for your number to be called.\n\nThank you!`;

  await sendEmailNotification(email, subject, message);
}

// Notify user when approaching their turn
async function notifyApproachingTurn(token, name, email, nowServing) {
  if (!email) return;

  const subject = `Your Token #${token} is Approaching!`;
  const message = `Hello ${name},\n\nYour token #${token} is approaching!\n\nCurrently serving: #${nowServing}\n\nPlease be ready.\n\nThank you!`;

  await sendEmailNotification(email, subject, message);
}

io.on("connection", (socket) => {
  console.log("socket connected", socket.id);
  socket.emit("queue_update", readData());

  socket.on("admin_action", (payload) => {
    // payload: { action: 'serve'|'skip', token }
    const data = readData();
    const idx = data.entries.findIndex((e) => e.token === payload.token);
    if (idx !== -1) {
      data.entries[idx].status =
        payload.action === "serve" ? "served" : "skipped";
      data.entries[idx].servedAt = new Date().toISOString();
      writeData(data);
      broadcastQueue();
    }
  });

  // allow clients to identify as kiosk devices
  socket.kiosk = false;
  socket.on("register", (payload) => {
    try {
      if (payload && payload.role === "kiosk") {
        socket.kiosk = true;
        socket.clientId = payload.clientId || null;
        console.log(
          "Socket registered as kiosk:",
          socket.id,
          socket.clientId || ""
        );
        socket.emit("registered", { ok: true, clientId: socket.clientId });
      }
    } catch (e) {}
  });

  // website client requests a token; forward to a kiosk
  // payload: { name, phoneNumber, requestId(optional) }
  socket.on("request_token", (payload) => {
    try {
      // find a kiosk socket
      const sockets = Array.from(io.sockets.sockets.values());
      const kioskSocket = sockets.find((s) => s.kiosk === true);
      const reqId =
        (payload && payload.requestId) ||
        String(Date.now()) + "-" + Math.floor(Math.random() * 1000);
      if (kioskSocket) {
        // forward request to kiosk
        kioskSocket.emit("request_token", {
          requestId: reqId,
          profile: payload,
        });
        socket.emit("request_sent", { requestId: reqId });
      } else {
        socket.emit("request_failed", { error: "no_kiosk_connected" });
      }
    } catch (e) {
      socket.emit("request_failed", { error: e.message });
    }
  });

  // kiosk notifies server that it created a token (server will create the entry)
  // payload: { requestId, profile }
  socket.on("kiosk_create", async (payload) => {
    try {
      if (!socket.kiosk)
        return socket.emit("kiosk_create_failed", { error: "not_registered" });
      const profile = (payload && payload.profile) || {};
      const token = await createTokenEntry(profile, "kiosk");
      // Send email notification
      await notifyTokenCreated(token, profile.name, profile.email);
      // notify the kiosk that server recorded the token
      socket.emit("kiosk_create_ack", { success: true, token });
      // notify all clients (or future: only the requester). We'll broadcast event so website client can pick it up.
      io.emit("token_issued", { token, profile });
    } catch (e) {
      socket.emit("kiosk_create_failed", { error: e.message });
    }
  });

  // Frontend sends elapsed time for real-time syncing to backend/DynamoDB
  // payload: { token, elapsedTime }
  socket.on("update_elapsed_time", async (payload) => {
    try {
      if (!payload || !payload.token) return;

      const data = readData();
      const entry = (data.entries || []).find((e) => e.token === payload.token);
      if (!entry) return;

      // Update the entry's waitingTime with the frontend's elapsed time
      entry.waitingTime = Math.max(
        0,
        Math.floor(Number(payload.elapsedTime) || 0)
      );

      // Persist to local file
      writeData(data);

      // Sync to DynamoDB
      if (ddbMapper && DYNAMO_TABLE) {
        try {
          const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
          const updateCmd = new UpdateCommand({
            TableName: DYNAMO_TABLE,
            Key: {
              clinicId: CLINIC_ID,
              tokenId: entry.tokenId || entry.token,
            },
            UpdateExpression: "SET waitingTime = :wt",
            ExpressionAttributeValues: {
              ":wt": String(entry.waitingTime),
            },
          });
          await ddbMapper.send(updateCmd);
        } catch (err) {
          // Silently continue - DynamoDB update is not critical
        }
      }

      // Broadcast updated queue to all clients
      broadcastQueue();
    } catch (e) {
      // Silently handle errors
    }
  });

  // Forward MQTT messages from devices to this client
  socket.on("subscribe_mqtt", () => {
    console.log("Client subscribed to MQTT messages");
    socket.join("mqtt-subscribers");
  });
});

// Broadcast MQTT messages from devices to all subscribed clients
io.on("mqtt_message_received", (data) => {
  io.to("mqtt-subscribers").emit("mqtt_message", data);
});

app.get("/api/queue", (req, res) => {
  const data = readData();
  const avgServiceSeconds = computeAvgServiceSeconds(data);

  const out = Object.assign({}, data);
  out.entries = (out.entries || []).map((e) => {
    const copy = Object.assign({}, e);

    // For all entries, use stored waitingTime (which comes from frontend for waiting entries)
    // Do NOT recalculate - trust the frontend's elapsed time
    copy.waitingTimeHuman = formatDuration(copy.waitingTime);

    return copy;
  });
  res.json(out);
});

app.post("/api/take", (req, res) => {
  // enforce token-creation policy: when Dynamo is enabled, only allow
  // creation from the token machine (IoT -> Dynamo) or via ADMIN_SECRET/header
  if (!isTokenCreationAllowed(req)) {
    console.warn(
      "Blocked web token creation - Dynamo enabled and no admin secret provided or not from localhost"
    );
    return res.status(403).json({
      success: false,
      error: "token creation disabled via web when using token machine",
    });
  }
  const data = readData();
  const token = data.lastToken + 1;
  const name = req.body && req.body.name ? String(req.body.name).trim() : null;
  const phoneNumber =
    req.body && req.body.phoneNumber
      ? String(req.body.phoneNumber).trim()
      : null;
  const email =
    req.body && req.body.email ? String(req.body.email).trim() : null;
  // compute estimated wait based on current average and waiting length
  const avg = computeAvgServiceSeconds(data);
  const waiting = (data.entries || []).filter((e) => e.status === "waiting");
  const estimatedWaitSeconds = Math.round(waiting.length * avg);
  const entry = {
    token,
    timestamp: new Date().toISOString(),
    status: "waiting",
    name,
    estimatedWaitSeconds,
    phoneNumber,
    email,
  };
  // ensure DynamoDB key fields are present for immediate sync
  entry.clinicId = CLINIC_ID;
  entry.tokenId = token.toString();
  data.lastToken = token;
  data.entries.push(entry);
  recomputeEstimates(data);
  writeData(data);
  // sync new entry
  syncToDynamo(entry).catch(() => {});
  // Send email notification
  notifyTokenCreated(token, name, email).catch(() => {});
  broadcastQueue();
  res.json({ success: true, token });
});

app.post("/api/cancel", (req, res) => {
  const { token } = req.body;
  if (!token)
    return res.status(400).json({ success: false, error: "token required" });
  const data = readData();
  const idx = data.entries.findIndex(
    (e) => e.token === token && e.status === "waiting"
  );
  if (idx === -1)
    return res
      .status(404)
      .json({ success: false, error: "token not found or not cancellable" });
  data.entries[idx].status = "cancelled";
  data.entries[idx].cancelledAt = new Date().toISOString();
  if (!data.entries[idx].clinicId) data.entries[idx].clinicId = CLINIC_ID;
  if (!data.entries[idx].tokenId)
    data.entries[idx].tokenId = data.entries[idx].token
      ? data.entries[idx].token.toString()
      : `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  recomputeEstimates(data);
  writeData(data);
  // sync update
  syncToDynamo(data.entries[idx]).catch(() => {});
  broadcastQueue();
  res.json({ success: true });
});

// mark a token as 'arrived' (user reached cabin) — doesn't mark served, just records arrival
app.post("/api/arrive", (req, res) => {
  const { token, elapsedTime } = req.body || {};
  if (!token)
    return res.status(400).json({ success: false, error: "token required" });
  const data = readData();
  const idx = data.entries.findIndex(
    (e) => e.token === token && e.status === "waiting"
  );
  if (idx === -1)
    return res
      .status(404)
      .json({ success: false, error: "token not found or not waiting" });
  const arrivedAt = new Date().toISOString();
  data.entries[idx].status = "arrived";
  data.entries[idx].arrivedAt = arrivedAt;

  // Use the elapsed time from frontend as the final waiting time
  if (elapsedTime !== undefined && elapsedTime !== null) {
    data.entries[idx].waitingTime = Math.max(
      0,
      Math.floor(Number(elapsedTime) || 0)
    );
  }

  writeData(data);
  // sync arrival
  if (!data.entries[idx].clinicId) data.entries[idx].clinicId = CLINIC_ID;
  if (!data.entries[idx].tokenId)
    data.entries[idx].tokenId = data.entries[idx].token
      ? data.entries[idx].token.toString()
      : `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  recomputeEstimates(data);
  syncToDynamo(data.entries[idx]).catch(() => {});
  broadcastQueue();
  res.json({ success: true, waitingTime: data.entries[idx].waitingTime });
});

app.post("/api/reset", (req, res) => {
  writeData({ lastToken: 0, entries: [] });
  broadcastQueue();
  res.json({ success: true });
});

// HTTP-admin action (serve/skip) to allow non-socket demos/tests
app.post("/api/admin_action", (req, res) => {
  const { action, token } = req.body || {};
  if (!action || !token)
    return res
      .status(400)
      .json({ success: false, error: "action and token required" });
  const data = readData();
  const idx = data.entries.findIndex((e) => e.token === token);
  if (idx === -1)
    return res.status(404).json({ success: false, error: "token not found" });
  if (action === "serve") data.entries[idx].status = "served";
  else if (action === "skip") data.entries[idx].status = "skipped";
  else return res.status(400).json({ success: false, error: "unknown action" });
  data.entries[idx].servedAt = new Date().toISOString();
  // if served and no waitedSeconds recorded but arrivedAt exists, compute waited between take and arrival
  if (!data.entries[idx].waitedSeconds && data.entries[idx].arrivedAt) {
    try {
      const taken = new Date(data.entries[idx].timestamp);
      const waited = Math.max(
        0,
        Math.round((new Date(data.entries[idx].arrivedAt) - taken) / 1000)
      );
      data.entries[idx].waitedSeconds = waited;
    } catch (e) {
      data.entries[idx].waitedSeconds = null;
    }
  }
  writeData(data);
  // sync served/skip update
  if (!data.entries[idx].clinicId) data.entries[idx].clinicId = CLINIC_ID;
  if (!data.entries[idx].tokenId)
    data.entries[idx].tokenId = data.entries[idx].token
      ? data.entries[idx].token.toString()
      : `t-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  recomputeEstimates(data);
  syncToDynamo(data.entries[idx]).catch(() => {});
  broadcastQueue();
  return res.json({ success: true });
});

// ETA endpoint (seconds) for a token
app.get("/api/eta", (req, res) => {
  const token = parseInt(req.query.token, 10);
  if (!token)
    return res
      .status(400)
      .json({ success: false, error: "token query required" });
  const data = readData();
  const avg = computeAvgServiceSeconds(data);
  const waiting = data.entries
    .filter((e) => e.status === "waiting")
    .sort((a, b) => a.token - b.token);
  // count how many waiting tokens ahead of the requested token
  const ahead = waiting.filter((e) => e.token < token).length;
  const etaSeconds = ahead * avg;
  res.json({
    success: true,
    token,
    etaSeconds,
    etaHuman: formatDuration(etaSeconds),
    avgServiceSeconds: avg,
    ahead,
  });
});

// debug endpoint to inspect Dynamo config/status at runtime
app.get("/api/debug", (req, res) => {
  try {
    const info = {
      DYNAMODB_TABLE: DYNAMO_TABLE || null,
      AWS_REGION: process.env.AWS_REGION || null,
      AWS_PROFILE: process.env.AWS_PROFILE || null,
      dynamoEnabled: !!ddbMapper,
    };
    res.json({ success: true, info });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// debug: list connected kiosks
app.get("/api/kiosks", (req, res) => {
  try {
    const sockets = Array.from(io.sockets.sockets.values());
    const kiosks = sockets
      .filter((s) => s.kiosk)
      .map((s) => ({ id: s.id, clientId: s.clientId || null }));
    res.json({ success: true, kiosks });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);

// if DynamoDB is enabled, load data on startup and poll periodically
if (DYNAMO_TABLE) {
  (async () => {
    await loadFromDynamo();
    // poll every DYNAMO_POLL_SECONDS (default 30) for external changes
    const pollSeconds = parseInt(process.env.DYNAMO_POLL_SECONDS || "30", 10);
    setInterval(() => {
      loadFromDynamo().catch(() => {});
    }, Math.max(1, pollSeconds) * 1000);
  })();
}

// Initialize MQTT connection to AWS IoT Core for device synchronization
initializeMQTT().catch((err) => {
  console.warn("MQTT initialization failed (non-critical):", err.message);
});

// manual sync endpoint
app.post("/api/sync_from_dynamo", async (req, res) => {
  if (!DYNAMO_TABLE)
    return res
      .status(400)
      .json({ success: false, error: "DYNAMO_TABLE not configured" });
  try {
    await loadFromDynamo();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

// webhook endpoint for DynamoDB Streams / Lambda to notify server of changes
// Configure SYNC_SECRET env var and have the Lambda send this in header 'x-sync-secret'
app.post("/dynamo_webhook", async (req, res) => {
  if (!DYNAMO_TABLE)
    return res
      .status(400)
      .json({ success: false, error: "DYNAMO_TABLE not configured" });
  const expected = process.env.SYNC_SECRET || null;
  const provided = req.headers["x-sync-secret"];
  if (expected && provided !== expected) {
    console.warn("Rejected dynamo_webhook call with invalid secret");
    return res.status(403).json({ success: false, error: "invalid secret" });
  }
  try {
    await loadFromDynamo();
    console.log("Dynamo webhook: triggered loadFromDynamo");
    return res.json({ success: true });
  } catch (e) {
    console.error("Dynamo webhook error", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
});
