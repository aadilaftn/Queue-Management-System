# Complete Architecture Diagram with IoT Message Flow

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         QUEUE MANAGEMENT SYSTEM                              │
│                    Real-time Clinic Queue Management                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐    ┌──────────────────────┐    ┌──────────────────────┐
│   KIOSK DEVICES      │    │   FRONTEND CLIENTS   │    │   ADMIN DASHBOARD    │
│  (Token Creators)    │    │   (Patient UI)       │    │   (Queue Manager)    │
│                      │    │                      │    │                      │
│  • Display Tokens    │    │  • Request Tokens    │    │  • Serve Patients    │
│  • Publish Status    │    │  • Track Wait Time   │    │  • Skip/Cancel       │
│  • IoT Connected     │    │  • Socket.IO Receive │    │  • View Queue        │
└──────────────────────┘    └──────────────────────┘    └──────────────────────┘
         ↓                            ↓                           ↓
         │                            │                           │
         └────────────────┬───────────┴──────────────────┬────────┘
                          │                              │
                    Socket.IO (WebSocket)               HTTP/Socket.IO
                          │                              │
                          ↓                              ↓
         ┌────────────────────────────────────────────────────────┐
         │          EXPRESS SERVER (Node.js)                      │
         │          Port: 3000                                    │
         │  ┌──────────────────────────────────────────────────┐ │
         │  │  • Kiosk Socket Handlers                         │ │
         │  │  • Token Creation & Management                   │ │
         │  │  • Queue State Management                        │ │
         │  │  • Real-time Broadcasting (Socket.IO)            │ │
         │  │  • MQTT Bridge (IoT Core Integration)            │ │
         │  │  • DynamoDB Sync                                 │ │
         │  └──────────────────────────────────────────────────┘ │
         └────────────────────────────────────────────────────────┘
                      ↓                        ↓
         ┌────────────────────┐   ┌────────────────────┐
         │   LOCAL STORAGE    │   │   AWS DYNAMODB     │
         │   (queue.json)     │   │   (QueueEntries)   │
         │                    │   │                    │
         │  • Backup data     │   │  • Persistent      │
         │  • Quick access    │   │  • Multi-instance  │
         │  • Development     │   │  • Scalable        │
         └────────────────────┘   └────────────────────┘
                                           ↑
                                     DynamoDB Sync
                                    (UpdateCommand)

         ┌────────────────────────────────────────────────────┐
         │           AWS IOT CORE (MQTT Broker)               │
         │  Endpoint: your-endpoint.iot.us-east-1.amazonaws   │
         │                                                     │
         │  Topics:                                            │
         │  • queue/clinic/default/updates (Server publishes) │
         │  • queue/clinic/default/incoming/+ (Devices pub)   │
         └────────────────────────────────────────────────────┘
                                ↑
                    MQTT (mTLS - Mutual TLS)
                         (Port 8883)
                                │
         ┌──────────────────────┴──────────────────────┐
         │                                             │
         ↓                                             ↓
    KIOSK DEVICE                              EXTERNAL SYSTEM
    (Python/JS)                               (Mobile App, etc.)
    - Subscribe: updates                      - Subscribe: updates
    - Publish: incoming/kiosk-1               - Publish: incoming/device-n
```

---

## 2. Token Generation Flow (Step-by-Step)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PATIENT TAKES TOKEN (User Story)                          │
└─────────────────────────────────────────────────────────────────────────────┘

USER BROWSER                          SERVER                        KIOSK SIM
  │                                     │                             │
  ├─ Opens http://localhost:3000        │                             │
  │  (React UI loads)                   │                             │
  │                                     │                             │
  ├─ Sets name: "John Doe"              │                             │
  │  (Saved in localStorage)            │                             │
  │                                     │                             │
  ├─ Clicks "Take Token"                │                             │
  │  (Emits Socket.IO event)            │                             │
  │                                     │                             │
  ├──────── request_token ───────────→  │                             │
  │  payload: {                         │                             │
  │    name: "John Doe",                │                             │
  │    phone: null                      │                             │
  │  }                                  │                             │
  │                                     ├─ Finds kiosk socket        │
  │                                     │                             │
  │                                     ├──────── request_token ────→ │
  │                                     │  payload: {                │
  │                                     │    requestId: "...",       │
  │                                     │    profile: { ... }        │
  │                                     │  }                         │
  │                                     │                             │
  │                                     │  ← kiosk_create ──────────┤
  │                                     │  payload: {                │
  │                                     │    requestId: "...",       │
  │                                     │    profile: { ... }        │
  │                                     │  }                         │
  │                                     │                             │
  │                                     ├─ Create token #5:          │
  │                                     │  • status: "waiting"       │
  │                                     │  • timestamp: now()        │
  │                                     │  • name: "John Doe"        │
  │                                     │  • waitingTime: 0          │
  │                                     │                             │
  │                                     ├─ Save to queue.json        │
  │                                     │                             │
  │                                     ├─ Sync to DynamoDB          │
  │                                     │  (UpdateCommand)           │
  │                                     │                             │
  │                                     ├─ Broadcast queue_update    │
  │                                     │  (all clients)             │
  │                                     │                             │
  │ ← token_issued ────────────────────┤                             │
  │  payload: { token: 5 }              │                             │
  │                                     ├─ Publish to MQTT           │
  │                                     │  Topic: queue/clinic/.../  │
  │                                     │  Payload: { entries: [...] │
  │                                     │             lastToken: 5 } │
  │                                     │                             │
  │                                     ├──────→ AWS IoT Core        │
  │                                     │                             │
  │ ← queue_update ────────────────────┤                             │
  │  payload: {                         │                             │
  │    lastToken: 5,                    │                             │
  │    entries: [                       │                             │
  │      {                              │                             │
  │        token: 5,                    │                             │
  │        name: "John Doe",            │                             │
  │        status: "waiting",           │                             │
  │        waitingTimeHuman: "0s"       │                             │
  │      }                              │                             │
  │    ]                                │                             │
  │  }                                  │                             │
  │                                     │                             │
  ├─ Shows "Token #5"                   │                             │
  │ in UI + starts stopwatch            │                             │
  │                                     │                             │
  └─────────────────────────────────────┴─────────────────────────────┘

TIME PASSES... User waits at clinic...

USER BROWSER                          SERVER                      DYNAMODB
  │                                     │                            │
  ├─ Stopwatch: 1s, 2s, 3s...          │                            │
  │ (elapsedTime increments)            │                            │
  │                                     │                            │
  ├─ Every 2 seconds:                  │                            │
  │  emit("update_elapsed_time", {     │                            │
  │    token: 5,                        │                            │
  │    elapsedTime: 45                 │                            │
  │  })                                │                            │
  │                                     │                            │
  ├──────── update_elapsed_time ──────→ │                            │
  │                                     ├─ Update entry.waitingTime │
  │                                     │  to 45 seconds            │
  │                                     │                            │
  │                                     ├─ Save to queue.json        │
  │                                     │                            │
  │                                     ├─ Sync to DynamoDB ────────→│
  │                                     │  UpdateCommand:            │
  │                                     │  SET waitingTime = 45      │
  │                                     │                            │
  │                                     ├─ Publish to MQTT           │
  │                                     │  (new waitingTime: 45s)    │
  │                                     │                            │
  │                                     ├─ Broadcast to all clients  │
  │                                     │                            │
  │ ← queue_update ────────────────────┤                            │
  │  (new waitingTime: 45s)            │                            │
  │                                     │                            │
  ├─ Display updates: "45s"             │                            │
  │                                     │                            │
  └─────────────────────────────────────┴────────────────────────────┘
```

---

## 3. MQTT Message Flow (IoT Integration)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MQTT MESSAGE FLOW (AWS IoT Core)                          │
└─────────────────────────────────────────────────────────────────────────────┘

SCENARIO: Kiosk Device publishes a message via MQTT

KIOSK DEVICE (Python)                AWS IOT CORE                    SERVER
  │                                      │                             │
  ├─ Connect with mTLS                  │                             │
  │  cert: spider.cert.pem              │                             │
  │  key: spider.private.key            │                             │
  │  endpoint: your-endpoint            │                             │
  │                                      │                             │
  ├─ Publish MQTT Message              │                             │
  │  Topic: queue/clinic/default/       │                             │
  │          incoming/kiosk-1           │                             │
  │                                      │                             │
  │  Payload: {                         │                             │
  │    "deviceId": "kiosk-1",           │                             │
  │    "action": "token_displayed",     │                             │
  │    "token": 5,                      │                             │
  │    "timestamp": "2025-10-18..."     │                             │
  │  }                                   │                             │
  │                                      │                             │
  │                                      ├─ Message received          │
  │                                      │ (QoS 1: At least once)    │
  │                                      │                             │
  │                                      ├──────────────────────────→ │
  │                                      │  (Server subscribed to     │
  │                                      │   queue/clinic/.../+)      │
  │                                      │                             │
  │                                      │                             ├─ Parse JSON
  │                                      │                             │
  │                                      │                             ├─ Log message
  │                                      │                             │
  │                                      │                             ├─ Emit to UI
  │                                      │                             │  via Socket.IO
  │                                      │                             │
  │                                      │                             ├─ All connected
  │                                      │                             │  browsers receive
  │                                      │                             │  socket event:
  │                                      │                             │  "mqtt_message"
  │                                      │                             │
  │                                      │  ← Message ACK ────────────┤
  │                                      │  (QoS 1 acknowledgment)   │
  │                                      │                             │
  └──────────────────────────────────────┴─────────────────────────────┘

SCENARIO: Server publishes queue update to MQTT (broadcast to all devices)

SERVER                                AWS IOT CORE                 EXTERNAL DEVICES
  │                                      │                             │
  ├─ broadcastQueue() called            │                             │
  │  (token created/arrived/cancelled)  │                             │
  │                                      │                             │
  ├─ Publish MQTT Message              │                             │
  │  Topic: queue/clinic/default/       │                             │
  │          updates                    │                             │
  │                                      │                             │
  │  Payload: {                         │                             │
  │    "lastToken": 5,                  │                             │
  │    "avgServiceSeconds": 180,        │                             │
  │    "entries": [                     │                             │
  │      {                              │                             │
  │        "token": 5,                  │                             │
  │        "name": "John Doe",          │                             │
  │        "status": "waiting",         │                             │
  │        "waitingTime": 45,           │                             │
  │        "waitingTimeHuman": "45s"    │                             │
  │      }                              │                             │
  │    ]                                │                             │
  │  }                                   │                             │
  │                                      │                             │
  │  QoS: 1 (At least once delivery)   │                             │
  │                                      │                             │
  │                                      ├─ Broadcast to all          │
  │                                      │  subscribed devices        │
  │                                      │                             │
  │                                      ├──────────────────────────→ │
  │                                      │  (All devices subscribed   │
  │                                      │   to queue/.../updates)    │
  │                                      │                             │
  │                                      │                             ├─ Receive update
  │                                      │                             │
  │                                      │                             ├─ Parse queue state
  │                                      │                             │
  │                                      │                             ├─ Update screen:
  │                                      │                             │  "Next: Token #5"
  │                                      │                             │  "Wait: 45s"
  │                                      │                             │
  │                                      │  ← ACK from devices ───────┤
  │                                      │                             │
  └──────────────────────────────────────┴─────────────────────────────┘
```

---

## 4. Data Flow Through All Systems

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE DATA FLOW (All Systems)                          │
└─────────────────────────────────────────────────────────────────────────────┘

USER ACTION: Patient arrives at clinic

BROWSER                 SERVER              LOCAL STORAGE          DYNAMODB
  │                       │                      │                    │
  ├─ Load UI               │                      │                    │
  │  http://localhost:     │                      │                    │
  │  3000                  │                      │                    │
  │                        │                      │                    │
  ├─ Connect Socket.IO     │                      │                    │
  │                        ├─ Accept connection   │                    │
  │                        │                      │                    │
  │                        ├─ broadcastQueue()    │                    │
  │                        │  (initial state)     │                    │
  │                        │                      ├─ Read queue.json   │
  │                        │                      │  (all entries)    │
  │                        │                      │                    │
  │ ← queue_update ────────┤                      │                    │
  │  (current state)       │                      │                    │
  │                        │                      │                    │
  ├─ Display queue         │                      │                    │
  │  (all waiting tokens)  │                      │                    │
  │                        │                      │                    │
  ├─ Set name: "John"      │                      │                    │
  │  (localStorage)        │                      │                    │
  │                        │                      │                    │
  ├─ Take Token button     │                      │                    │
  │                        │                      │                    │
  ├─ Kiosk creates token   │                      │                    │
  │  #5                    │                      │                    │
  │  (via simulator or     │                      │                    │
  │   real device)         │                      │                    │
  │                        │                      │                    │
  │                        ├─ Create entry:       │                    │
  │                        │  token: 5            │                    │
  │                        │  name: "John"        │                    │
  │                        │  status: "waiting"   │                    │
  │                        │  waitingTime: 0      │                    │
  │                        │                      │                    │
  │                        ├─ Write to file ─────→│                    │
  │                        │  queue.json          │                    │
  │                        │  (updated)           │                    │
  │                        │                      │                    │
  │                        ├─ Sync to DB ───────────────────────────→ │
  │                        │  PutCommand:         │                    │
  │                        │  INSERT entry into   │                    │
  │                        │  QueueEntries table  │                    │
  │                        │                      │                    │
  │                        ├─ broadcastQueue()    │                    │
  │                        │  (notify all)        │                    │
  │                        │                      │                    │
  │ ← queue_update ────────┤                      │                    │
  │ ← token_issued ────────┤                      │                    │
  │  token: 5              │                      │                    │
  │                        │                      │                    │
  ├─ Show "Token #5"       │                      │                    │
  ├─ Start stopwatch       │                      │                    │
  │  (1s, 2s, 3s...)      │                      │                    │
  │                        │                      │                    │
  ├─ Every 2 seconds:      │                      │                    │
  │  emit                  │                      │                    │
  │  update_elapsed_time   │                      │                    │
  │  (elapsedTime: 45)     │                      │                    │
  │                        │                      │                    │
  │                        ├─ Update entry ──────→│ queue.json updated│
  │                        │  waitingTime: 45     │                    │
  │                        │                      │                    │
  │                        ├─ Sync to DB ───────────────────────────→ │
  │                        │  UpdateCommand:      │                    │
  │                        │  SET waitingTime=45  │                    │
  │                        │                      │                    │
  │                        ├─ Publish to MQTT ─→ AWS IoT Core ──────┐ │
  │                        │  (all subscribers)   │                  │ │
  │                        │                      │                  │ │
  │                        ├─ broadcastQueue()    │                  │ │
  │                        │  (all browsers)      │                  │ │
  │                        │                      │                  │ │
  │ ← queue_update ────────┤                      │                  │ │
  │  (waitingTime: 45s)    │                      │                  │ │
  │                        │                      │                  │ │
  ├─ Update display       │                      │                  │ │
  │  "45s" on screen      │                      │                  │ │
  │                        │                      │                  │ │
  └────────────────────────┴──────────────────────┴──────────────────┘ │
                                                                        │
                                                         External Devices
                                                         receive update via MQTT

TIME PASSES: Patient arrives at window

BROWSER                 SERVER              LOCAL STORAGE          DYNAMODB
  │                       │                      │                    │
  ├─ Click "Arrived"       │                      │                    │
  │                        │                      │                    │
  ├─ POST /api/arrive      │                      │                    │
  │  { token: 5,          │                      │                    │
  │    elapsedTime: 324 }  │                      │                    │
  │                        │                      │                    │
  │                        ├─ Update entry:       │                    │
  │                        │  status: "arrived"   │                    │
  │                        │  arrivedAt: now()    │                    │
  │                        │  waitingTime: 324    │                    │
  │                        │                      │                    │
  │                        ├─ Save to file ─────→│ queue.json update  │
  │                        │                      │                    │
  │                        ├─ Sync to DB ───────────────────────────→ │
  │                        │  UpdateCommand:      │                    │
  │                        │  status="arrived"    │                    │
  │                        │  waitingTime=324     │                    │
  │                        │                      │                    │
  │                        ├─ broadcastQueue()    │                    │
  │                        │                      │                    │
  │ ← queue_update ────────┤                      │                    │
  │  (status: arrived)     │                      │                    │
  │                        │                      │                    │
  ├─ Alert: "Arrived!"    │                      │                    │
  │  "Waited: 324s        │                      │                    │
  │   (5 minutes 24s)"    │                      │                    │
  │                        │                      │                    │
  └────────────────────────┴──────────────────────┴────────────────────┘

RESULT:
✅ Queue updated in real-time
✅ Waiting time accurately tracked (from browser stopwatch)
✅ Data persisted to DynamoDB
✅ All dashboards notified via Socket.IO
✅ MQTT devices receive update
```

---

## 5. Architecture Components (Detailed)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ARCHITECTURE COMPONENTS                              │
└─────────────────────────────────────────────────────────────────────────────┘

1. FRONTEND (React via CDN)
   ┌─────────────────────────────────────────────┐
   │ public/app.jsx (React Component)            │
   │                                             │
   │ State:                                      │
   │ • myToken: current patient's token         │
   │ • elapsedTime: stopwatch counter (1s tick) │
   │ • savedElapsedTime: final wait time        │
   │ • data: queue state from server            │
   │ • profile: name, phone (localStorage)      │
   │                                             │
   │ Functions:                                  │
   │ • takeToken(): emit request_token          │
   │ • markArrived(): POST /api/arrive          │
   │ • formatDuration(): "45s" display          │
   │                                             │
   │ Socket.IO Listeners:                        │
   │ • queue_update: full queue state           │
   │ • token_issued: your token created         │
   │ • mqtt_message: device messages            │
   └─────────────────────────────────────────────┘

2. BACKEND SERVER (Express + Socket.IO)
   ┌─────────────────────────────────────────────┐
   │ server.js (Node.js)                         │
   │                                             │
   │ Main Functions:                             │
   │ • broadcastQueue(): emit to all clients    │
   │ • syncToDynamo(): persist to AWS DB        │
   │ • initializeMQTT(): connect to IoT Core    │
   │ • createTokenEntry(): new token logic      │
   │                                             │
   │ Socket.IO Handlers:                         │
   │ • request_token: forward to kiosk          │
   │ • kiosk_create: create token from kiosk    │
   │ • update_elapsed_time: receive time sync   │
   │ • register: kiosk identification           │
   │                                             │
   │ HTTP Endpoints:                             │
   │ • POST /api/take: create token (admin)    │
   │ • POST /api/arrive: mark arrived          │
   │ • POST /api/cancel: cancel token          │
   │ • GET /api/queue: get queue state         │
   │                                             │
   │ MQTT Integration:                           │
   │ • Subscribe: incoming device messages     │
   │ • Publish: broadcast queue updates        │
   │ • Bridge: MQTT → Socket.IO                │
   └─────────────────────────────────────────────┘

3. DATA STORAGE LAYERS
   ┌─────────────────────────────────────────────┐
   │ Local Storage (queue.json)                   │
   │ • Fast access for server                    │
   │ • Backup if DB fails                        │
   │ • Development/testing                       │
   │                                             │
   │ Structure:                                   │
   │ {                                            │
   │   "lastToken": 5,                           │
   │   "entries": [                              │
   │     {                                        │
   │       "token": 5,                           │
   │       "name": "John Doe",                   │
   │       "status": "waiting",                  │
   │       "timestamp": "2025-10-18T...",        │
   │       "waitingTime": 324,                   │
   │       "clinicId": "default-clinic"          │
   │     }                                        │
   │   ]                                          │
   │ }                                            │
   └─────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────┐
   │ AWS DynamoDB (QueueEntries Table)           │
   │ • Persistent across restarts               │
   │ • Multi-instance scalability                │
   │ • Audit trail / compliance                  │
   │                                             │
   │ Keys:                                        │
   │ • Partition: clinicId                       │
   │ • Sort: tokenId                             │
   │                                             │
   │ Attributes:                                  │
   │ • status, timestamp, personName             │
   │ • phoneNumber, waitingTime                  │
   │ • arrivedAt, servedAt, cancelledAt          │
   └─────────────────────────────────────────────┘

4. AWS IOT CORE (MQTT Broker)
   ┌─────────────────────────────────────────────┐
   │ Topics:                                      │
   │                                             │
   │ queue/clinic/default/updates                │
   │ ↳ Server publishes queue state             │
   │ ↳ All devices subscribe                    │
   │ ↳ Payload: { entries: [...] }              │
   │                                             │
   │ queue/clinic/default/incoming/+             │
   │ ↳ Devices publish status updates           │
   │ ↳ Server subscribes and relays             │
   │ ↳ Payload: { deviceId, action, ... }       │
   │                                             │
   │ Protocol: MQTTS (TLS 1.2)                   │
   │ Port: 8883                                  │
   │ Auth: mTLS with device certificates         │
   └─────────────────────────────────────────────┘

5. COMMUNICATION PROTOCOLS
   ┌─────────────────────────────────────────────┐
   │ Socket.IO (Browser ↔ Server)               │
   │ • Real-time bidirectional messaging        │
   │ • WebSocket + fallback polling             │
   │ • Low latency (~50-100ms)                   │
   │ • Suitable for all modern browsers         │
   │                                             │
   │ MQTT (Server ↔ IoT Core ↔ Devices)         │
   │ • Publish-Subscribe messaging              │
   │ • QoS 1: At-least-once delivery            │
   │ • Persistent connections                   │
   │ • Low bandwidth, efficient                  │
   │                                             │
   │ HTTP (Admin actions)                        │
   │ • REST endpoints for server actions        │
   │ • POST /api/arrive, /api/cancel            │
   │ • Synchronous operations                    │
   └─────────────────────────────────────────────┘
```

---

## 6. Timeline: From Token Creation to Arrival

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE TIMELINE: Patient Journey                        │
└─────────────────────────────────────────────────────────────────────────────┘

T=0s    Patient enters clinic
        ├─ Opens http://localhost:3000
        ├─ Enters name: "John Doe"
        └─ Clicks "Take Token"

T=0s+   Browser sends: request_token
        ├─ Server finds kiosk simulator
        └─ Kiosk receives request

T=0.5s  Kiosk creates token #5
        ├─ Entry saved to queue.json
        ├─ Entry synced to DynamoDB
        ├─ Server broadcasts queue_update
        └─ Emits token_issued to browser

T=1s    Browser receives token_issued
        ├─ UI shows "Token #5"
        ├─ Stopwatch starts: 1s
        └─ Saves tokenStartTime

T=2s    Stopwatch: 2s
        └─ (no action, just counting)

T=4s    Stopwatch: 4s
        ├─ Browser emits update_elapsed_time (4)
        └─ Server updates entry.waitingTime = 4

T=6s    Stopwatch: 6s
        ├─ Server broadcasts queue_update
        ├─ Publishes to MQTT: queue/.../updates
        ├─ All dashboards refresh
        └─ Devices receive MQTT message

T=10s   Stopwatch: 10s
        └─ (continues counting)

T=12s   Stopwatch: 12s
        ├─ Browser emits update_elapsed_time (12)
        └─ Server syncs to DynamoDB

T=300s  Stopwatch: 300s (5 minutes)
        ├─ Patient approaches window
        ├─ Patient's position changes in queue
        └─ Other admins see real-time position

T=324s  Patient arrives at window
        ├─ Clicks "Marked Arrived"
        ├─ POST /api/arrive { token: 5, elapsedTime: 324 }
        ├─ Server updates status: "arrived"
        ├─ Saves final waitingTime: 324 (5m 24s)
        ├─ Syncs to DynamoDB
        ├─ Broadcasts to all dashboards
        ├─ Publishes to MQTT devices
        ├─ Alert: "Time waited: 5m 24s"
        └─ Token removed from queue display

T=324s+ Patient is served (admin marks served)
        ├─ Status changes to "served"
        ├─ Queue refreshes
        └─ Next patient info displays

RESULT STORED IN DYNAMODB:
{
  "clinicId": "default-clinic",
  "tokenId": "5",
  "token": 5,
  "personName": "John Doe",
  "status": "served",
  "timestamp": "2025-10-18T10:30:00Z",
  "arrivedAt": "2025-10-18T10:35:24Z",
  "servedAt": "2025-10-18T10:35:45Z",
  "waitingTime": 324,
  "waitingTimeHuman": "5m 24s"
}
```

---

## 7. Key Features Explained

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KEY FEATURES BREAKDOWN                             │
└─────────────────────────────────────────────────────────────────────────────┘

1. REAL-TIME STOPWATCH ⏱️
   How it works:
   ├─ Frontend: window.setInterval() every 1000ms
   ├─ Increments elapsedTime state
   ├─ Displays to patient in real-time
   ├─ Sends to server every 2 seconds
   ├─ Server persists to DynamoDB
   └─ All other dashboards update

   Why it's accurate:
   └─ Browser controls the time (not network dependent)
   └─ Server acts as backup storage only
   └─ No drift between what patient sees and what's saved

2. KIOSK-ONLY TOKEN GENERATION 🎟️
   How it works:
   ├─ Web UI sends request_token via Socket.IO
   ├─ Server checks: Is a kiosk connected?
   ├─ If YES: Forward request to kiosk
   ├─ If NO: Reject with "no_kiosk_connected"
   └─ Only kiosk can create tokens

   Why this matters:
   ├─ Controlled token distribution
   ├─ Physical kiosk validates queue discipline
   ├─ Prevents spam/duplicate requests
   └─ Ensures fair queue management

3. MQTT BRIDGE FOR IOT DEVICES 🌐
   How it works:
   ├─ Server connects to AWS IoT Core (mTLS)
   ├─ Subscribes to: queue/clinic/default/incoming/+
   ├─ Devices publish their status
   ├─ Server receives MQTT message
   ├─ Converts to Socket.IO event
   ├─ All browsers get the update
   └─ Server also publishes queue updates to MQTT

   Why it's useful:
   ├─ Multiple kiosks stay in sync
   ├─ Mobile apps can subscribe to MQTT too
   ├─ Scale to many devices without server load
   └─ Decoupled from web clients

4. DYNAMODB PERSISTENCE 💾
   How it works:
   ├─ Every token change → UpdateCommand to DB
   ├─ Server loads queue on startup
   ├─ Acts as source of truth
   ├─ Multiple server instances share same DB
   └─ Historical data for analytics

   Why it matters:
   ├─ Data survives server restarts
   ├─ Compliance/audit trail
   ├─ Scalable to thousands of patients
   ├─ Can run multiple servers (HA/LB)
   └─ Analytics on wait times

5. MULTI-CLIENT SYNCHRONIZATION 📡
   How it works:
   ├─ Socket.IO connects each browser
   ├─ Server broadcasts queue_update to all
   ├─ Every change triggers broadcast
   ├─ All dashboards refresh simultaneously
   └─ Admin sees real-time queue state

   Why it's important:
   ├─ Admins see accurate queue position
   ├─ Multiple screens stay in sync
   ├─ Prevents double-serving
   └─ Real-time decision making
```

---

## 8. Request/Response Examples

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      REAL EXAMPLE REQUESTS/RESPONSES                         │
└─────────────────────────────────────────────────────────────────────────────┘

REQUEST 1: Browser asks for token
────────────────────────────────────
Browser emits:
socket.emit("request_token", {
  name: "John Doe",
  phoneNumber: "555-1234"
})

Server receives and forwards to kiosk:
socket_kiosk.emit("request_token", {
  requestId: "1729254600000-123",
  profile: {
    name: "John Doe",
    phoneNumber: "555-1234"
  }
})

Kiosk responds:
socket.emit("kiosk_create", {
  requestId: "1729254600000-123",
  profile: { name: "John Doe", ... }
})

Server broadcasts to all browsers:
io.emit("queue_update", {
  lastToken: 5,
  avgServiceSeconds: 180,
  entries: [
    {
      token: 5,
      tokenId: "5",
      name: "John Doe",
      status: "waiting",
      timestamp: "2025-10-18T10:30:00Z",
      waitingTime: 0,
      waitingTimeHuman: "0s"
    }
  ]
})

Server also emits:
socket.emit("token_issued", { token: 5 })

────────────────────────────────────

REQUEST 2: Browser sends elapsed time (every 2 seconds)
────────────────────────────────────
Browser emits:
socket.emit("update_elapsed_time", {
  token: 5,
  elapsedTime: 45
})

Server updates DynamoDB:
UpdateCommand({
  TableName: "QueueEntries",
  Key: {
    clinicId: "default-clinic",
    tokenId: "5"
  },
  UpdateExpression: "SET waitingTime = :wt",
  ExpressionAttributeValues: {
    ":wt": "45"
  }
})

Server broadcasts:
io.emit("queue_update", {
  entries: [
    {
      token: 5,
      waitingTime: 45,
      waitingTimeHuman: "45s"
    }
  ]
})

────────────────────────────────────

REQUEST 3: Patient clicks "Marked Arrived"
────────────────────────────────────
Browser sends:
POST /api/arrive
Content-Type: application/json

{
  "token": 5,
  "elapsedTime": 324
}

Server response:
{
  "success": true,
  "waitingTime": 324
}

Server updates DynamoDB:
UpdateCommand({
  TableName: "QueueEntries",
  Key: {
    clinicId: "default-clinic",
    tokenId: "5"
  },
  UpdateExpression: "SET #s = :status, arrivedAt = :at, waitingTime = :wt",
  ExpressionAttributeNames: {
    "#s": "status"
  },
  ExpressionAttributeValues: {
    ":status": "arrived",
    ":at": "2025-10-18T10:35:24Z",
    ":wt": "324"
  }
})

Server broadcasts:
io.emit("queue_update", {
  entries: [
    {
      token: 5,
      status: "arrived",
      arrivedAt: "2025-10-18T10:35:24Z",
      waitingTime: 324,
      waitingTimeHuman: "5m 24s"
    }
  ]
})

────────────────────────────────────

REQUEST 4: MQTT Device publishes status
────────────────────────────────────
Device publishes:
Topic: queue/clinic/default/incoming/kiosk-1
Payload:
{
  "deviceId": "kiosk-1",
  "action": "token_displayed",
  "token": 5,
  "timestamp": "2025-10-18T10:35:00Z"
}

Server receives and broadcasts to browsers:
io.emit("mqtt_message", {
  topic: "queue/clinic/default/incoming/kiosk-1",
  payload: {
    deviceId: "kiosk-1",
    action: "token_displayed",
    token: 5,
    timestamp: "2025-10-18T10:35:00Z"
  }
})

────────────────────────────────────

REQUEST 5: GET /api/queue (get current queue state)
────────────────────────────────────
Browser sends:
GET /api/queue

Server response:
{
  "lastToken": 5,
  "avgServiceSeconds": 180,
  "entries": [
    {
      "token": 1,
      "name": "Patient A",
      "status": "served",
      "waitingTime": 600,
      "waitingTimeHuman": "10m"
    },
    {
      "token": 5,
      "name": "John Doe",
      "status": "waiting",
      "waitingTime": 45,
      "waitingTimeHuman": "45s"
    },
    {
      "token": 6,
      "name": "Patient B",
      "status": "waiting",
      "waitingTime": 0,
      "waitingTimeHuman": "0s"
    }
  ]
}
```

---

## Summary

This architecture creates a **real-time, scalable clinic queue system** that:

1. ✅ Tracks patient wait times accurately (browser stopwatch)
2. ✅ Persists data to DynamoDB (never lost)
3. ✅ Syncs across all devices via Socket.IO (real-time dashboards)
4. ✅ Integrates with AWS IoT Core via MQTT (scalable device connectivity)
5. ✅ Requires kiosk for tokens (controlled distribution)
6. ✅ Works offline with local JSON fallback
7. ✅ Ready for production with HA/LB setup

The system is **modular, scalable, and production-ready**! 🚀
