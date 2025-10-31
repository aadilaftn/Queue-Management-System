const http = require("http");

// Create a token with email via HTTP API
const data = JSON.stringify({
  name: "Test User",
  phoneNumber: "1234567890",
  email: "test@example.com",
});

const options = {
  hostname: "localhost",
  port: 3000,
  path: "/api/token",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": data.length,
  },
};

const req = http.request(options, (res) => {
  let responseData = "";

  res.on("data", (chunk) => {
    responseData += chunk;
  });

  res.on("end", () => {
    console.log("Response:", responseData);
    process.exit(0);
  });
});

req.on("error", (error) => {
  console.error("Error:", error);
  process.exit(1);
});

req.write(data);
req.end();
