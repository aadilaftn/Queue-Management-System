#!/usr/bin/env node
/**
 * Example Device/Kiosk - Publishes queue events to AWS IoT Core
 *
 * This can run on a Node.js-based kiosk or any device with a display.
 * It demonstrates:
 * - Connecting to AWS IoT Core with mTLS
 * - Subscribing to queue updates
 * - Publishing device events (token displayed, service started, etc.)
 */

const mqtt = require("mqtt");
const fs = require("fs");
const path = require("path");

class QueueKiosk {
  constructor(options) {
    this.endpoint = options.endpoint;
    this.clientId = options.clientId || `kiosk-${Date.now()}`;
    this.topicPrefix = options.topicPrefix || "queue/clinic/default/";
    this.certPath = options.certPath;
    this.keyPath = options.keyPath;
    this.caPath = options.caPath;

    this.topicSubscribe = `${this.topicPrefix}updates`;
    this.topicPublish = `${this.topicPrefix}incoming/${this.clientId}`;
  }

  connect() {
    console.log(`[KIOSK] Initializing ${this.clientId}`);

    // Build MQTT options
    const mqttOptions = {
      clientId: this.clientId,
      clean: true,
      reconnectPeriod: 5000,
    };

    // Add mTLS certificate options
    try {
      mqttOptions.cert = fs.readFileSync(this.certPath);
      mqttOptions.key = fs.readFileSync(this.keyPath);
      if (this.caPath) {
        mqttOptions.ca = fs.readFileSync(this.caPath);
      }
      mqttOptions.protocol = "mqtts";
      mqttOptions.port = 8883;
    } catch (err) {
      console.error(`[KIOSK] Error reading certificates: ${err.message}`);
      process.exit(1);
    }

    const brokerUrl = `${mqttOptions.protocol}://${this.endpoint}:${mqttOptions.port}`;
    console.log(`[KIOSK] Connecting to ${brokerUrl}...`);

    this.client = mqtt.connect(brokerUrl, mqttOptions);

    this.client.on("connect", () => {
      console.log("[KIOSK] Connected to AWS IoT Core!");
      this.onConnected();
    });

    this.client.on("message", (topic, message) => {
      this.onMessage(topic, message);
    });

    this.client.on("error", (err) => {
      console.error(`[KIOSK] MQTT Error: ${err.message}`);
    });

    this.client.on("close", () => {
      console.log("[KIOSK] Connection closed");
    });

    this.client.on("reconnect", () => {
      console.log("[KIOSK] Reconnecting...");
    });
  }

  onConnected() {
    // Subscribe to queue updates
    console.log(`[KIOSK] Subscribing to: ${this.topicSubscribe}`);
    this.client.subscribe(this.topicSubscribe, { qos: 1 }, (err) => {
      if (err) {
        console.error(`[KIOSK] Subscribe error: ${err}`);
      } else {
        console.log("[KIOSK] Subscribed successfully");
        // Start simulating token displays
        this.startSimulation();
      }
    });
  }

  onMessage(topic, message) {
    try {
      const payload = JSON.parse(message.toString());
      console.log(`\n[KIOSK] Received queue update:`);
      console.log(`  Last token: ${payload.lastToken}`);
      console.log(
        `  Waiting entries: ${
          payload.entries.filter((e) => e.status === "waiting").length
        }`
      );

      // Simulate displaying the next token on screen
      const waiting = payload.entries.filter((e) => e.status === "waiting");
      if (waiting.length > 0) {
        const nextToken = waiting[0];
        console.log(
          `\n  >>> [DISPLAY] Token #${nextToken.token} - Please proceed!`
        );
        console.log(`      Wait time: ${nextToken.waitingTimeHuman}`);
      }
    } catch (err) {
      console.error(`[KIOSK] Failed to parse message: ${err.message}`);
    }
  }

  startSimulation() {
    console.log(
      "\n[KIOSK] Starting simulation (displays a token every 5 seconds)"
    );
    console.log(`[KIOSK] Publishing to: ${this.topicPublish}\n`);

    let displayCounter = 0;

    setInterval(() => {
      displayCounter++;
      const event = {
        deviceId: this.clientId,
        action: "token_displayed",
        token: displayCounter,
        timestamp: new Date().toISOString(),
        screen_location: "Window A",
        brightness: 100,
        displayDuration: 5, // seconds
      };

      console.log(`[KIOSK] Publishing token display event: #${displayCounter}`);
      this.client.publish(
        this.topicPublish,
        JSON.stringify(event),
        { qos: 1 },
        (err) => {
          if (err) {
            console.error(`[KIOSK] Publish error: ${err.message}`);
          }
        }
      );
    }, 5000);
  }

  disconnect() {
    console.log("[KIOSK] Disconnecting...");
    this.client.end(() => {
      console.log("[KIOSK] Disconnected");
      process.exit(0);
    });
  }
}

// Example usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error(
      "Usage: node example_kiosk_device.js <endpoint> <cert_path> <key_path> [ca_path] [client_id]"
    );
    console.error("");
    console.error("Example:");
    console.error("  node example_kiosk_device.js \\");
    console.error("    aqrvs9wjclzg2-ats.iot.us-east-1.amazonaws.com \\");
    console.error("    ./spider.cert.pem \\");
    console.error("    ./spider.private.key \\");
    console.error("    ./root-CA.crt \\");
    console.error("    kiosk-1");
    process.exit(1);
  }

  const kiosk = new QueueKiosk({
    endpoint: args[0],
    certPath: args[1],
    keyPath: args[2],
    caPath: args[3] || null,
    clientId: args[4] || "kiosk-nodejs",
    topicPrefix: "queue/clinic/default/",
  });

  kiosk.connect();

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n[KIOSK] Received SIGINT, shutting down...");
    kiosk.disconnect();
  });
}

module.exports = QueueKiosk;
