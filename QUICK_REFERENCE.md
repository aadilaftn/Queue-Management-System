# 🚀 Quick Reference Guide

## 5-Second Summary

**Digital queue system:** Patients get tokens → Timer counts waiting time → System saves data to cloud → Staff manages queue

---

## 3 Things You Need to Know

### 1. **The Three Websites**

```
http://localhost:3000              → Patient sees their token & wait time
http://localhost:3000/admin.html   → Staff controls the queue
http://localhost:3000/simulate.html → Test without real kiosk
```

### 2. **How It Works in 3 Steps**

```
KIOSK              SERVER              DASHBOARD
(Device)    →      (Brain)       →      (Screen)
Creates            Stores             Shows
Token              Data               Updates
```

### 3. **What Happens**

```
Patient gets token #15 → Timer counts 1s, 2s, 3s... → Reaches window after 5m 30s → System saves he waited 5m 30s
```

---

## The 4 Main Components

| Component     | What It Does                                    | Location                              |
| ------------- | ----------------------------------------------- | ------------------------------------- |
| **Kiosk**     | Creates tokens when patients press button       | Physical device or browser simulator  |
| **Server**    | Receives requests, manages queue, sends updates | `server.js` running on localhost:3000 |
| **Database**  | Saves all data permanently                      | AWS DynamoDB (cloud)                  |
| **Dashboard** | Shows patients their token and wait time        | Browser websites (React)              |

---

## 4 Key Technologies

| Tech          | Purpose                              |
| ------------- | ------------------------------------ |
| **Node.js**   | Runs the server                      |
| **Express**   | Handles web requests                 |
| **Socket.IO** | Real-time updates (instant messages) |
| **DynamoDB**  | Permanent storage (database)         |

---

## 5 Files You Should Know

| File                | Purpose                           |
| ------------------- | --------------------------------- |
| `server.js`         | The brain - handles all logic     |
| `public/app.jsx`    | Patient dashboard (what they see) |
| `public/admin.html` | Staff screen                      |
| `.env`              | AWS credentials (secret!)         |
| `data/queue.json`   | Current queue (local storage)     |

---

## 6 Important Concepts

### Real-Time (Socket.IO)

- Everything updates instantly
- No need to refresh page
- Everyone sees same information at same time

### Waiting Time

- Counts on patient's phone
- Sent to server every 2 seconds
- Saved to database
- Final time saved when patient arrives

### Database (DynamoDB)

- Stores all token information forever
- Accessible anytime, anywhere
- If server crashes, data is safe
- Multiple servers can access same data

### MQTT (Optional)

- Device messaging system
- Kiosks talk to each other
- Real-time notifications
- Requires AWS IoT Core setup

### Kiosk-Only Token Creation

- Only kiosks can create tokens
- Prevents random web token creation
- Simulated kiosk available for testing

### Scalability

- Can handle many patients
- Can run on multiple servers
- Each clinic has separate queue
- Grows with your business

---

## 7 Actions Patients Can Do

1. ✅ Enter name and phone at kiosk
2. ✅ Get token number
3. ✅ Watch timer count up (how long waiting)
4. ✅ See position in queue
5. ✅ Click "I'm here" when reaching window
6. ✅ System records time waited
7. ✅ Receive confirmation message

---

## 8 Actions Staff Can Do

1. ✅ View all waiting patients
2. ✅ See how long each person waited
3. ✅ Click "Serve" when calling patient
4. ✅ Click "Skip" to move to next patient
5. ✅ Mark patients as served
6. ✅ See average wait time
7. ✅ Reset queue (end of day)
8. ✅ View historical data

---

## 9 Data Points Tracked

| Data            | When Captured                           |
| --------------- | --------------------------------------- |
| Patient name    | At kiosk                                |
| Phone number    | At kiosk                                |
| Token number    | When created                            |
| Time started    | When created                            |
| Wait time       | Every 2 seconds (live)                  |
| Time arrived    | When patient clicks "here"              |
| Final wait time | When patient arrives                    |
| Time served     | When staff marks served                 |
| Status          | Throughout (waiting → arrived → served) |

---

## 10 Messages Sent

### Kiosk → Server

```
"I need a token for John Doe, 555-1234"
```

### Server → Dashboard

```
"New patient! Token #15 added"
"Token #15 waited 30 seconds"
"Token #15 is now being served"
```

### Patient Phone → Server

```
"I've been waiting 120 seconds"
"I've arrived at the window"
```

### Server → Database

```
"Save Token 15: name, phone, wait time, status"
```

---

## The Waiting Time Formula

```
Waiting Time = Current Time - Token Creation Time

Example:
Token created: 10:30:00
Current time:  10:35:30
Waiting time: 5 minutes 30 seconds = 330 seconds
```

---

## Average Wait Calculation

```
Average Wait = Total Seconds of All Waiting Patients / Number of Waiting Patients

Example:
Patient A: 5 minutes
Patient B: 3 minutes
Patient C: 4 minutes
─────────────────
Total: 12 minutes ÷ 3 patients = 4 minutes average

New patients see: "Estimated wait: 4 minutes"
```

---

## Settings You Can Change

Edit `.env` file:

```powershell
PORT=3000                    # Change port if needed
AVG_SERVICE_SECONDS=180      # Average time per patient (3 min)
CLINIC_ID=default-clinic     # Your clinic name
DYNAMODB_TABLE=QueueEntries  # Database table name
IOT_ENDPOINT=...             # AWS IoT endpoint (for MQTT)
```

---

## Errors & What They Mean

| Error                               | Meaning                        | Fix                                                   |
| ----------------------------------- | ------------------------------ | ----------------------------------------------------- |
| `no_kiosk_connected`                | No kiosk device sending tokens | Open simulator: `http://localhost:3000/simulate.html` |
| `DynamoDB connectivity failed`      | AWS credentials not set        | Add AWS keys to `.env` file                           |
| `MQTT: IOT_ENDPOINT not configured` | MQTT not enabled               | Optional - only needed for IoT devices                |
| `Port 3000 already in use`          | Another server running         | Close other server or change PORT in `.env`           |

---

## Test Checklist

- [ ] Server running: `npm start`
- [ ] Can access: `http://localhost:3000`
- [ ] Simulator registered: `/simulate.html`
- [ ] Can take token: Patient sees token number
- [ ] Timer counting: Wait time increases
- [ ] Admin sees token: `/admin.html`
- [ ] Can mark served: Admin clicks "Serve"
- [ ] DynamoDB synced: Check `.env` has AWS keys

---

## Performance Tips

1. **Keep queue clean** - Archive old tokens daily
2. **Use DynamoDB** - Don't rely on local JSON only
3. **Monitor connections** - Check how many users
4. **Back up data** - Export tokens weekly
5. **Update regularly** - Keep npm packages current

---

## Security Checklist

- [ ] `.env` file not committed to git
- [ ] AWS credentials rotated regularly
- [ ] DynamoDB table has backup enabled
- [ ] Access logs checked weekly
- [ ] Kiosk-only token creation enforced
- [ ] Admin password protected (custom feature)

---

## Common Workflows

### Morning Setup

```
1. npm start                     (start server)
2. Open /admin.html            (staff screen)
3. Open /simulate.html         (test kiosk)
4. Verify DynamoDB connected
```

### During Operation

```
1. Patients use kiosk
2. Get tokens automatically
3. Wait time tracks live
4. Staff marks as served
5. Next patient called
```

### End of Day

```
1. Admin clicks "Reset" (clear queue)
2. All data saved to DynamoDB
3. Review daily statistics
4. Check average wait times
```

### Enable MQTT (Advanced)

```
1. Get IoT endpoint from AWS
2. Copy certificates
3. Add to .env: IOT_ENDPOINT, IOT_CERT_PATH, etc.
4. npm start
5. Devices can now connect via MQTT
```

---

## API Endpoints (For Developers)

```
GET  /api/queue              → Get current queue state
POST /api/take               → Create new token
POST /api/arrive             → Mark token arrived
POST /api/cancel             → Cancel token
POST /api/admin_action       → Serve/skip token
POST /api/reset              → Clear queue
```

---

## Socket.IO Events (Real-Time)

```
socket.on("token_issued")        → New token created
socket.on("queue_update")        → Queue state changed
socket.on("request_token")       → Kiosk requesting token
socket.on("update_elapsed_time") → Waiting time update
socket.on("mqtt_message")        → Message from IoT device
```

---

## Database Query Example

```sql
-- Get all tokens for today
SELECT * FROM QueueEntries
WHERE clinicId = "default-clinic"
AND date >= TODAY

-- Get average wait time
SELECT AVG(waitingTime)
FROM QueueEntries
WHERE status = "served"
AND clinicId = "default-clinic"

-- Get today's statistics
SELECT
  COUNT(*) as total_tokens,
  AVG(waitingTime) as avg_wait,
  MAX(waitingTime) as max_wait
FROM QueueEntries
WHERE clinicId = "default-clinic"
AND date >= TODAY
```

---

## Troubleshooting Flowchart

```
Q: Server won't start?
└─ A: Check port 3000 is free, or change PORT in .env

Q: Can't take tokens?
└─ A: Register kiosk simulator first at /simulate.html

Q: DynamoDB not working?
└─ A: Add AWS keys to .env file

Q: Wait time not accurate?
└─ A: Make sure frontend is connected and timer is counting

Q: Multiple users see different queues?
└─ A: Check WebSocket connection is stable

Q: Data lost after restart?
└─ A: Enable DynamoDB sync (add AWS credentials)
```

---

## Commands You'll Use

```powershell
# Start server
npm start

# Install dependencies
npm install

# Check errors
npm start 2>&1 | Select-String "error"

# Stop server
Ctrl + C

# Install new package
npm install package-name --save

# Clear queue
curl -X POST http://localhost:3000/api/reset
```

---

## Project Files Summary

```
QUEUE MANAGEMENT SYSTEM/
├── server.js                    ← Main server logic (1005 lines)
├── public/
│   ├── app.jsx                  ← Patient dashboard
│   ├── admin.html               ← Admin screen
│   ├── simulate.html            ← Kiosk simulator
│   └── styles.css               ← Styling
├── data/
│   └── queue.json               ← Current queue data
├── scripts/                     ← Utility scripts
├── .env                         ← AWS credentials
├── package.json                 ← Dependencies
│
├── README.md                    ← Project instructions
├── PROJECT_EXPLANATION.md       ← Detailed explanation (THIS FILE)
├── SYSTEM_DIAGRAMS.md          ← Visual diagrams
├── MQTT_SETUP.md               ← MQTT configuration
├── MQTT_QUICKSTART.md          ← Quick MQTT start
│
└── example_kiosk_device.py     ← Python device example
    example_kiosk_device.js     ← Node.js device example
```

---

## What's Installed?

```
✅ Node.js (JavaScript runtime)
✅ Express (Web server)
✅ Socket.IO (Real-time updates)
✅ React (Frontend UI)
✅ AWS SDK (DynamoDB access)
✅ MQTT (Device messaging)
✅ Dotenv (Environment variables)
```

---

## Cost (AWS)

```
FREE TIER (Sufficient for testing):
├─ DynamoDB: 25 GB storage free
├─ IoT Core: 250,000 messages free
├─ Lambda: 1 million invocations free

WHEN YOU SCALE:
├─ DynamoDB: $1.25 per million writes
├─ IoT Core: $0.08 per million messages
├─ Bandwidth: $0.01 per GB

Example (small clinic):
├─ 100 tokens/day × 30 days = 3000 tokens/month
├─ DynamoDB cost: ~$0.01/month
├─ IoT messages: ~15,000/month
├─ IoT cost: ~$0.001/month
├─ Total: < $1/month
```

---

## Next Steps

1. **Test locally** → Open simulator and dashboard
2. **Add real kiosk** → Run Python/Node.js device example
3. **Enable MQTT** → Configure AWS IoT endpoint
4. **Scale up** → Add multiple clinics
5. **Deploy** → Move to production server
6. **Monitor** → Check AWS CloudWatch logs
7. **Backup** → Export DynamoDB daily
8. **Optimize** → Fine-tune timings based on usage

---

## Getting Help

| Question           | Answer                               |
| ------------------ | ------------------------------------ |
| How to start?      | `npm start`                          |
| How to test?       | Open `/simulate.html`                |
| Where's the code?  | `server.js`                          |
| How to access AWS? | Check `.env` file                    |
| How to scale?      | Add DynamoDB & MQTT                  |
| How to debug?      | Check browser console or server logs |

---

**System Ready!** 🚀

You now have a complete, production-ready queue management system with:

- ✅ Real-time updates
- ✅ Cloud database
- ✅ MQTT support
- ✅ Admin controls
- ✅ Accurate wait time tracking

Start with the simulator and grow from there! 📈
