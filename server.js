const http = require("http");
const os = require("os");

const PORT = 3000;
const HOSTNAME = os.hostname();
const APP_NAME = process.env.APP_NAME || "Container Demo";
const APP_ENV = process.env.APP_ENV || "development";

function uptimeSeconds() {
  return Math.floor(process.uptime());
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data) + "\n");
}

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  // No icon file. Answer 204 so the browser does not log a 404 error.
  if (req.url === "/favicon.ico") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/info") {
    sendJson(res, 200, {
      app: APP_NAME,
      env: APP_ENV,
      hostname: HOSTNAME,
      uptimeSeconds: uptimeSeconds(),
    });
    return;
  }

  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${APP_NAME}</title>
</head>
<body>
  <h1>${APP_NAME}</h1>
  <p>Container hostname: <strong>${HOSTNAME}</strong></p>
  <p>Uptime: ${uptimeSeconds()} seconds</p>
  <p>Environment: ${APP_ENV}</p>
  <p><a href="/healthz">/healthz</a> | <a href="/info">/info</a></p>
</body>
</html>
`);
    return;
  }

  sendJson(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`${HOSTNAME} listening on port ${PORT}`);
});

// Docker sends SIGTERM on stop. Close the server so the container stops fast.
process.on("SIGTERM", () => {
  console.log(`${HOSTNAME} got SIGTERM, shutting down`);
  server.close(() => process.exit(0));
});
