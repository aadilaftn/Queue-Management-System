const { useState, useEffect, useRef } = React;

const socket = io();

function formatDuration(sec) {
  if (sec === null || sec === undefined) return "-";
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  if (s < 1) return "<1s";
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(" ");
}

function App() {
  const [data, setData] = useState({ lastToken: 0, entries: [] });
  const [profile, setProfile] = useState(() =>
    JSON.parse(localStorage.getItem("profile") || "{}")
  );
  const [myToken, setMyToken] = useState(null);
  const [tokenStartTime, setTokenStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [savedElapsedTime, setSavedElapsedTime] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    socket.on("queue_update", (payload) => {
      setData(payload);
    });
    socket.on("token_issued", (info) => {
      if (info && info.token) {
        setMyToken(info.token);
        setTokenStartTime(Date.now()); // Record when token was taken
        setElapsedTime(0);
        alert("Token issued: #" + info.token);
      }
    });
    return () => {
      socket.off("queue_update");
      socket.off("token_issued");
    };
  }, []);

  useEffect(() => {
    // update local profile storage
    localStorage.setItem("profile", JSON.stringify(profile || {}));
  }, [profile]);

  useEffect(() => {
    // Reset when token is cleared or changed
    if (!myToken) {
      setTokenStartTime(null);
      setElapsedTime(0);
      setSavedElapsedTime(null);
    }
  }, [myToken]);

  // Stopwatch effect - increments elapsed time every second
  useEffect(() => {
    if (!tokenStartTime) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // If interval is already running, don't restart it
    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tokenStartTime]);

  // Send elapsed time to backend every 2 seconds so it stays in sync
  useEffect(() => {
    if (!myToken || elapsedTime === 0) return;

    const sendTimer = setInterval(() => {
      socket.emit("update_elapsed_time", {
        token: myToken,
        elapsedTime: elapsedTime,
      });
    }, 2000);

    return () => clearInterval(sendTimer);
  }, [myToken, elapsedTime]);

  const takeToken = () => {
    if (!profile || !profile.name) return alert("Set your name first");
    socket.emit("request_token", {
      name: profile.name,
      phoneNumber: profile.phone || null,
      email: profile.email || null,
    });
    socket.once("request_sent", () => alert("Token request sent to kiosk"));
    socket.once("request_failed", (err) =>
      alert("Token request failed: " + (err && err.error))
    );
  };

  const markArrived = async () => {
    if (!myToken) return alert("No token");
    const res = await fetch("/api/arrive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: myToken,
        phoneNumber: profile.phone || null,
        elapsedTime: elapsedTime,
      }),
    });
    const json = await res.json();
    if (json.success) {
      // Save the elapsed time that was just recorded
      setSavedElapsedTime(elapsedTime);
      alert("Marked arrived. Time waited: " + formatDuration(elapsedTime));
      // Keep the token displayed briefly so user can see the saved time
      setTimeout(() => {
        setMyToken(null);
        setSavedElapsedTime(null);
      }, 2000);
    } else alert(json.error || "Failed");
  };

  const cancel = async () => {
    if (!myToken) return alert("No token");
    const res = await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: myToken }),
    });
    const json = await res.json();
    if (json.success) {
      setMyToken(null);
    } else alert(json.error || "Failed");
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div>
          <div style={styles.title}>Clinic Queue</div>
          <div style={styles.subtitle}>Take a token & track wait</div>
        </div>
        <div style={styles.pill}>Live</div>
      </header>

      <main style={styles.container}>
        <aside style={styles.sidebar}>
          <div style={styles.card}>
            <h4 style={{ margin: 0 }}>Profile</h4>
            {profile && profile.name ? (
              <div>
                <div style={{ fontWeight: 700 }}>{profile.name}</div>
                <div style={{ color: "#6b7280" }}>{profile.phone || ""}</div>
                <div style={{ color: "#6b7280" }}>{profile.email || ""}</div>
                <div style={{ marginTop: 8 }}>
                  <button
                    style={styles.btnOutline}
                    onClick={() => {
                      const n = prompt("Name", profile.name);
                      const p = prompt("Phone", profile.phone || "");
                      const e = prompt("Email", profile.email || "");
                      if (n) setProfile({ name: n, phone: p, email: e });
                    }}
                  >
                    Edit
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginTop: 8 }}>
                  <input
                    placeholder="Name"
                    value={profile.name || ""}
                    onChange={(e) =>
                      setProfile({ ...profile, name: e.target.value })
                    }
                    style={styles.input}
                  />
                  <input
                    placeholder="Phone"
                    value={profile.phone || ""}
                    onChange={(e) =>
                      setProfile({ ...profile, phone: e.target.value })
                    }
                    style={styles.input}
                  />
                  <input
                    placeholder="Email"
                    value={profile.email || ""}
                    onChange={(e) =>
                      setProfile({ ...profile, email: e.target.value })
                    }
                    style={styles.input}
                  />
                  <button
                    style={styles.btnPrimary}
                    onClick={() => {
                      if (!profile.name) return alert("Enter name");
                      setProfile(profile);
                    }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>

        <section style={styles.main}>
          <div style={styles.card}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div>
                <div style={{ color: "#6b7280" }}>Now Serving</div>
                <div style={styles.nowBig}>
                  {(data.entries || []).find(
                    (e) => e.status === "served" || e.status === "skipped"
                  )
                    ? `#${
                        (data.entries || []).find(
                          (e) => e.status === "served" || e.status === "skipped"
                        ).token
                      }`
                    : "-"}
                </div>
              </div>
              <div style={{ marginLeft: 8 }}>
                <div style={{ color: "#6b7280" }}>
                  How long you've been waiting
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    fontFamily: "monospace",
                  }}
                >
                  {savedElapsedTime !== null
                    ? formatDuration(savedElapsedTime)
                    : myToken && tokenStartTime
                    ? formatDuration(elapsedTime)
                    : "-"}
                </div>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <div style={{ color: "#6b7280" }}>Your Token</div>
                <div style={{ fontWeight: 700 }}>
                  {myToken ? `#${myToken}` : "-"}
                </div>
              </div>
            </div>

            <hr />

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                style={{
                  ...styles.btnPrimary,
                  opacity: profile && profile.name ? 1 : 0.6,
                }}
                onClick={takeToken}
                disabled={!profile || !profile.name}
              >
                Take Token
              </button>
              <button
                style={styles.btnSuccess}
                onClick={markArrived}
                disabled={!myToken}
              >
                Arrived
              </button>
              <button
                style={styles.btnOutline}
                onClick={cancel}
                disabled={!myToken}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer style={styles.footer}>
        Made with care · Clinic Queue System
      </footer>
    </div>
  );
}

const styles = {
  app: {
    fontFamily: "Inter, system-ui, -apple-system, Roboto, Arial",
    background: "linear-gradient(180deg,#f8fbff,#f5f7fb)",
    minHeight: "100vh",
    color: "#0f172a",
  },
  header: {
    background: "linear-gradient(90deg,#2563eb,#06b6d4)",
    padding: 16,
    color: "#fff",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 18, fontWeight: 700 },
  subtitle: { opacity: 0.9, fontSize: 13 },
  pill: {
    background: "rgba(255,255,255,0.16)",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 700,
  },
  container: {
    maxWidth: 1000,
    margin: "20px auto",
    padding: "0 12px",
    display: "flex",
    gap: 16,
  },
  sidebar: { width: 340 },
  main: { flex: 1 },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 16,
    boxShadow: "0 6px 20px rgba(2,6,23,0.06)",
    border: "1px solid rgba(15,23,42,0.04)",
  },
  nowBig: { fontSize: 28, fontWeight: 800 },
  btnPrimary: {
    border: 0,
    padding: "10px 14px",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  btnSuccess: {
    border: 0,
    padding: "10px 14px",
    borderRadius: 8,
    background: "#10b981",
    color: "#fff",
    fontWeight: 700,
    cursor: "pointer",
  },
  btnOutline: {
    border: "1px solid rgba(15,23,42,0.06)",
    padding: "10px 14px",
    borderRadius: 8,
    background: "transparent",
    cursor: "pointer",
  },
  input: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid rgba(15,23,42,0.06)",
    marginTop: 8,
    marginBottom: 8,
  },
  footer: { textAlign: "center", color: "#6b7280", padding: 16 },
};

ReactDOM.createRoot(document.getElementById("root")).render(
  React.createElement(App)
);
