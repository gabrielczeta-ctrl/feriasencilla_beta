import http from "http";
import { WebSocketServer } from "ws";
import Redis from "ioredis";
import crypto from "crypto";

const PORT = process.env.PORT || 8080;
// Railway Redis can use different environment variable names
// Prefer PUBLIC_URL as internal networking sometimes fails
const REDIS_URL = process.env.REDIS_PUBLIC_URL || process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || "redis://localhost:6379";

console.log("🔍 Redis URL:", REDIS_URL.replace(/\/\/.*@/, "//***:***@")); // Log URL with masked credentials

// Debug: List available Redis environment variables
const redisEnvVars = Object.keys(process.env).filter(key => key.includes('REDIS'));
console.log("🔍 Available Redis env vars:", redisEnvVars.length > 0 ? redisEnvVars : "None found");
const NOTE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CHANNEL = "notes:channel";
const ZKEY = "notes:z"; // sorted set of ids by expireAt

// Only create Redis clients if we have a real Redis URL
let redis, pub, sub;
let redisConnected = false;

// Check if we have a real Redis URL (not localhost fallback)
const hasRedis = REDIS_URL && !REDIS_URL.includes('localhost:6379');

console.log("🔍 Has Redis:", hasRedis);
console.log("🔍 Will use URL:", hasRedis ? REDIS_URL.replace(/\/\/.*@/, "//***:***@") : "None");

if (hasRedis) {
  const redisConfig = {
    lazyConnect: true,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    commandTimeout: 5000
  };
  
  redis = new Redis(REDIS_URL, redisConfig);
  pub = new Redis(REDIS_URL, redisConfig);
  sub = new Redis(REDIS_URL, redisConfig);

  // Connect to Redis, but don't block server startup if it fails
  try {
    console.log("🔄 Attempting Redis connection...");
    await Promise.all([redis.connect(), pub.connect(), sub.connect()]);
    await sub.subscribe(CHANNEL);
    redisConnected = true;
    console.log("✅ Redis connected successfully!");
  } catch (error) {
    console.warn("⚠️ Redis connection failed, running without persistence:");
    console.warn("   Error:", error.message);
    console.warn("   Code:", error.code);
    console.warn("   Using URL:", REDIS_URL.replace(/\/\/.*@/, "//***:***@"));
  }
} else {
  console.log("🔄 No Redis service configured, running without persistence");
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ 
      ok: true, 
      redis: redisConnected,
      uptime: process.uptime()
    }));
    return;
  }
  // Basic home
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("PartyWall WS server");
});

const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

wss.on("connection", (ws, req) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));

  ws.on("message", async (buf) => {
    let msg;
    try { msg = JSON.parse(buf.toString()); } catch { return; }

    if (msg.type === "hello") {
      const notes = await fetchActiveNotes();
      ws.send(JSON.stringify({ type: "state", notes }));
      return;
    }

    if (msg.type === "post" && msg.note) {
      const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!rateLimit(ip)) return;
      const clean = sanitizeNote(msg.note);
      if (!clean) return;

      const createdAt = Date.now();
      const expireAt = createdAt + NOTE_TTL_MS;
      const id = crypto.randomUUID();
      const note = { id, ...clean, createdAt, expireAt };

      // Store & index (only if Redis is connected)
      if (redisConnected) {
        try {
          await redis.set(`note:${id}`, JSON.stringify(note), "EX", NOTE_TTL_MS / 1000);
          await redis.zadd(ZKEY, expireAt, id);
          // Broadcast via Redis so all instances get it
          await pub.publish(CHANNEL, JSON.stringify({ type: "new", note }));
        } catch (error) {
          console.warn("Redis operation failed:", error.message);
        }
      }
      
      // Always broadcast locally
      broadcast({ type: "new", note });
    }
  });
});

// Redis pubsub → fan out to WS clients (only if Redis connected)
if (redisConnected && sub) {
  sub.on("message", (_, raw) => {
    try { broadcast(JSON.parse(raw)); } catch {}
  });
}

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(data);
  }
}

// Fetch active notes: prune expired, then fetch bodies
async function fetchActiveNotes() {
  if (!redisConnected) {
    return []; // Return empty array if Redis not connected
  }
  
  try {
    const now = Date.now();
    // prune expired ids
    await redis.zremrangebyscore(ZKEY, "-inf", now);
    const ids = await redis.zrange(ZKEY, 0, -1);
    if (ids.length === 0) return [];
    const keys = ids.map((id) => `note:${id}`);
    const vals = await redis.mget(keys);
    return vals.filter(Boolean).map((s) => {
      try { return JSON.parse(s); } catch { return null; }
    }).filter(Boolean);
  } catch (error) {
    console.warn("Failed to fetch notes from Redis:", error.message);
    return [];
  }
}

// Simple per-IP cooldown
const lastPost = new Map();
function rateLimit(ip, minMs = 2000) {
  const prev = lastPost.get(ip) || 0;
  const now = Date.now();
  if (now - prev < minMs) return false;
  lastPost.set(ip, now);
  return true;
}

function sanitizeNote(n) {
  if (!n || typeof n.text !== "string") return null;
  const text = n.text.trim().slice(0, 140);
  const xPct = Number(n.xPct);
  const yPct = Number(n.yPct);
  if (!text) return null;
  if (!(xPct >= 0 && xPct <= 100 && yPct >= 0 && yPct <= 100)) return null;
  return { text, xPct, yPct };
}

server.on("upgrade", (req, socket, head) => {
  if (new URL(req.url, "http://x").pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(PORT, () => {
  console.log("WS server on :" + PORT);
});