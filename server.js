const http = require("http");
const fs = require("fs");
const path = require("path");

const { recommend, validateInput } = require("./src/recommendation");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const PUBLIC_DIR = path.join(__dirname, "public");

const rateLimitMap = new Map();
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX, 10) || 30;
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 10000;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000").split(",").map(s => s.trim());
const TRUST_PROXY = process.env.TRUST_PROXY === "true";

function getClientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

function getCorsOrigin(req) {
  const origin = req.headers["origin"];
  if (!origin) return null;
  for (const allowed of ALLOWED_ORIGINS) {
    if (origin === allowed) return allowed;
  }
  // localhost in any port always allowed
  if (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1")) {
    return origin;
  }
  return null;
}

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }
  const timestamps = rateLimitMap.get(ip);
  while (timestamps.length > 0 && timestamps[0] < now - RATE_LIMIT_WINDOW) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_LIMIT_MAX) {
    return false;
  }
  timestamps.push(now);
  return true;
}

const rateLimitTimer = setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of rateLimitMap) {
    while (timestamps.length > 0 && timestamps[0] < now - RATE_LIMIT_WINDOW) {
      timestamps.shift();
    }
    if (timestamps.length === 0) {
      rateLimitMap.delete(ip);
    }
  }
}, 60000);

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
}

const MAX_POST_SIZE = 10240;

function serveStatic(req, res) {
  const reqUrl = new URL(req.url, "http://localhost");
  let filePath = path.join(PUBLIC_DIR, reqUrl.pathname === "/" ? "index.html" : reqUrl.pathname);
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return true;
  }

  const ext = path.extname(filePath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);

  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    res.writeHead(429, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Too Many Requests");
    return;
  }

  // CORS with origin whitelist
  const corsOrigin = getCorsOrigin(req);
  if (corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // 品种列表 API
  if (req.method === "GET" && new URL(req.url, "http://localhost").pathname === "/api/breeds") {
    const breedsPath = path.join(__dirname, "data", "breeds.json");
    const breedsData = JSON.parse(fs.readFileSync(breedsPath, "utf-8"));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(breedsData.breeds, null, 2));
    return;
  }

  // 推荐 API
  if (req.method === "POST" && new URL(req.url, "http://localhost").pathname === "/api/recommend") {
    const contentLength = parseInt(req.headers["content-length"], 10);
    if (contentLength > MAX_POST_SIZE) {
      res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Payload Too Large");
      return;
    }
    let body = "";
    req.on("data", chunk => (body += chunk));
    req.on("end", () => {
      if (Buffer.byteLength(body) > MAX_POST_SIZE) {
        res.writeHead(413, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Payload Too Large");
        return;
      }
      try {
        const input = JSON.parse(body);
        const validation = validateInput(input);
        if (!validation.valid) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Invalid input", details: validation.errors }, null, 2));
          return;
        }
        const result = recommend(input);
        if (result.error) {
          res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(result, null, 2));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(result, null, 2));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: e.message }, null, 2));
      }
    });
    return;
  }

  if (!serveStatic(req, res)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.timeout = 15000;
server.on('close', () => clearInterval(rateLimitTimer));

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`宠物粮推荐引擎 v2 已启动: http://localhost:${PORT}`);
  });
}

module.exports = server;
