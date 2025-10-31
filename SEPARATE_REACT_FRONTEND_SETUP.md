# Separate React Frontend Setup Guide

## Overview

This guide explains how to set up a **separate React frontend application** that runs independently from the Node.js backend server.

### Architecture

```
┌──────────────────────────┐
│   React Frontend App     │
│   (Port 3000 or 5000)    │
│   - User Dashboard       │
│   - Admin Dashboard      │
│   - Kiosk Simulator      │
└────────────┬─────────────┘
             │ HTTP + WebSocket
             │ Socket.IO
             │
┌────────────▼─────────────┐
│  Node.js Backend Server  │
│  (Port 3001 or 3000)     │
│  - Express API           │
│  - Socket.IO             │
│  - MQTT Bridge           │
│  - DynamoDB Sync         │
└──────────────────────────┘
```

## Option 1: Create React App (CRA) - RECOMMENDED

### Step 1: Create the React App

```powershell
cd "c:\Users\usama\OneDrive\Desktop"
npx create-react-app queue-frontend
cd queue-frontend
```

This creates a full React development environment with:

- Hot module reloading
- Development server
- Build tools
- Testing setup

### Step 2: Install Dependencies

```powershell
npm install socket.io-client axios
```

### Step 3: Create Project Structure

After CRA finishes, create these folders:

```
queue-frontend/
├── src/
│   ├── components/
│   │   ├── UserDashboard.js      # Patient UI
│   │   ├── AdminDashboard.js     # Admin UI
│   │   ├── KioskSimulator.js     # Kiosk simulator
│   │   └── Common.js             # Shared components
│   ├── services/
│   │   ├── api.js                # REST API calls
│   │   └── socketService.js      # Socket.IO client
│   ├── utils/
│   │   └── formatting.js         # Time formatting
│   ├── App.js                    # Main app
│   ├── App.css
│   └── index.js
├── public/
│   ├── index.html
│   └── favicon.ico
├── package.json
└── .env                          # Backend URL config
```

### Step 4: Configuration

Create `.env` file in `queue-frontend/`:

```
REACT_APP_BACKEND_URL=http://localhost:3000
REACT_APP_API_BASE=http://localhost:3000/api
```

### Step 5: Start Development Server

```powershell
cd queue-frontend
npm start
```

Opens automatically at `http://localhost:3000`

---

## Option 2: Manual Setup (No CRA)

If CRA is taking too long, create a simpler setup:

### Step 1: Create Folder Structure

```powershell
mkdir queue-frontend
cd queue-frontend
```

### Step 2: Initialize npm

```powershell
npm init -y
```

### Step 3: Install Dependencies

```powershell
npm install react react-dom react-scripts socket.io-client axios
npm install --save-dev @types/react @types/react-dom
```

### Step 4: Update package.json

Add these scripts:

```json
{
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "dev": "react-scripts start",
    "eject": "react-scripts eject"
  }
}
```

### Step 5: Create src/index.js

```javascript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
```

### Step 6: Create public/index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Queue Management - Patient</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

### Step 7: Start

```powershell
npm start
```

---

## File Templates

### src/services/socketService.js

```javascript
import io from "socket.io-client";

const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:3000";

class SocketService {
  constructor() {
    this.socket = null;
  }

  connect() {
    this.socket = io(BACKEND_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.socket.on("connect", () => {
      console.log("Connected to server");
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from server");
    });
  }

  on(event, callback) {
    this.socket.on(event, callback);
  }

  emit(event, data) {
    this.socket.emit(event, data);
  }

  off(event) {
    this.socket.off(event);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export default new SocketService();
```

### src/services/api.js

```javascript
import axios from "axios";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:3000/api";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
});

export const apiCalls = {
  // Get queue state
  getQueue: () => api.get("/queue"),

  // Arrive at clinic
  arrive: (token, elapsedTime) => api.post("/arrive", { token, elapsedTime }),

  // Cancel token
  cancel: (token) => api.post("/cancel", { token }),

  // Admin actions
  adminAction: (action, token) => api.post("/admin_action", { action, token }),
};
```

### src/components/UserDashboard.js

```javascript
import React, { useState, useEffect, useRef } from "react";
import socketService from "../services/socketService";

const UserDashboard = () => {
  const [profile, setProfile] = useState({ name: "", phone: "" });
  const [myToken, setMyToken] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [queue, setQueue] = useState([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    socketService.connect();

    socketService.on("queue_update", (data) => {
      setQueue(data.entries || []);
    });

    socketService.on("token_issued", (info) => {
      if (info && info.token) {
        setMyToken(info.token);
        setElapsedTime(0);
        alert(`Token issued: #${info.token}`);
      }
    });

    return () => {
      socketService.off("queue_update");
      socketService.off("token_issued");
    };
  }, []);

  // Stopwatch effect
  useEffect(() => {
    if (!myToken) return;

    intervalRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [myToken]);

  const takeToken = () => {
    if (!profile.name) return alert("Enter name first");
    socketService.emit("request_token", profile);
  };

  const markArrived = () => {
    if (!myToken) return alert("No token");
    socketService.emit("mark_arrived", { token: myToken, elapsedTime });
    setMyToken(null);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Clinic Queue System</h1>

      {!myToken ? (
        <div>
          <h2>Get Your Token</h2>
          <input
            placeholder="Name"
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            style={{ padding: "10px", marginBottom: "10px", width: "100%" }}
          />
          <input
            placeholder="Phone"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
            style={{ padding: "10px", marginBottom: "10px", width: "100%" }}
          />
          <button
            onClick={takeToken}
            style={{
              padding: "10px 20px",
              fontSize: "16px",
              backgroundColor: "#007bff",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            Take Token
          </button>
        </div>
      ) : (
        <div>
          <h2>Your Token: #{myToken}</h2>
          <p>Time Waiting: {elapsedTime}s</p>
          <button
            onClick={markArrived}
            style={{
              padding: "10px 20px",
              fontSize: "16px",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            Mark Arrived
          </button>
        </div>
      )}

      <h2>Queue Status</h2>
      <div>
        {queue.slice(0, 5).map((entry) => (
          <div
            key={entry.token}
            style={{ padding: "10px", borderBottom: "1px solid #ccc" }}
          >
            Token #{entry.token} - {entry.name} ({entry.status})
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserDashboard;
```

### src/App.js

```javascript
import React, { useState } from "react";
import UserDashboard from "./components/UserDashboard";
import AdminDashboard from "./components/AdminDashboard";
import KioskSimulator from "./components/KioskSimulator";

function App() {
  const [page, setPage] = useState("user");

  return (
    <div>
      <nav style={{ padding: "10px", backgroundColor: "#333", color: "white" }}>
        <button onClick={() => setPage("user")} style={{ marginRight: "10px" }}>
          Patient UI
        </button>
        <button
          onClick={() => setPage("admin")}
          style={{ marginRight: "10px" }}
        >
          Admin
        </button>
        <button onClick={() => setPage("kiosk")}>Kiosk Simulator</button>
      </nav>

      {page === "user" && <UserDashboard />}
      {page === "admin" && <AdminDashboard />}
      {page === "kiosk" && <KioskSimulator />}
    </div>
  );
}

export default App;
```

---

## Running Both Frontend & Backend

### Terminal 1: Start Backend

```powershell
cd "c:\Users\usama\OneDrive\Desktop\QUEUE MANAGEMENT SYSTEM"
npm start
# Backend runs on http://localhost:3000
```

### Terminal 2: Start Frontend

```powershell
cd "c:\Users\usama\OneDrive\Desktop\queue-frontend"
npm start
# Frontend runs on http://localhost:3000 (will prompt to use 3001 or different port)
```

Or specify port:

```powershell
$env:PORT=3001
npm start
# Frontend runs on http://localhost:3001
```

---

## Communication Between Frontend & Backend

### Socket.IO (Real-time)

**Frontend emits:**

```javascript
socketService.emit("request_token", { name: "John", phone: "555-1234" });
socketService.emit("update_elapsed_time", { token: 5, elapsedTime: 45 });
```

**Frontend listens:**

```javascript
socketService.on("queue_update", (data) => {
  /* update UI */
});
socketService.on("token_issued", (info) => {
  /* show token */
});
```

### REST API (HTTP)

**Frontend calls:**

```javascript
await api.post("/arrive", { token: 5, elapsedTime: 324 });
await api.post("/cancel", { token: 5 });
await api.get("/queue");
```

---

## Project Structure Summary

```
Queue Management System
├── QUEUE MANAGEMENT SYSTEM/  (Backend - Node.js)
│   ├── server.js
│   ├── package.json
│   ├── .env
│   ├── public/ (old static files)
│   └── data/ (local storage)
│
└── queue-frontend/           (Frontend - React)
    ├── src/
    │   ├── components/
    │   ├── services/
    │   ├── App.js
    │   └── index.js
    ├── public/
    │   ├── index.html
    │   └── favicon.ico
    ├── package.json
    ├── .env
    └── node_modules/
```

---

## Next Steps

1. ✅ Create React app (CRA finishing...)
2. 📋 Install dependencies
3. 📋 Create component files
4. 📋 Update `.env` with backend URL
5. 📋 Start both servers
6. 📋 Test Socket.IO communication
7. 📋 Deploy to production

---

## Troubleshooting

| Issue                    | Solution                               |
| ------------------------ | -------------------------------------- |
| CORS errors              | Backend needs to allow frontend origin |
| Socket.IO not connecting | Check BACKEND_URL in .env              |
| Port already in use      | Use `$env:PORT=5000; npm start`        |
| Dependencies missing     | Run `npm install`                      |
| Hot reload not working   | Check React Scripts version            |

---

This setup gives you:

- ✅ Independent frontend development
- ✅ Separate frontend/backend repos
- ✅ Hot module reloading
- ✅ Production build tools
- ✅ Better organization
- ✅ Scalable architecture
