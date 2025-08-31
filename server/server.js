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
      const currentVideo = await getCurrentVideo();
      const strokes = await fetchDrawingStrokes();
      ws.send(JSON.stringify({ type: "state", notes, currentVideo, strokes }));
      return;
    }

    if (msg.type === "video" && msg.url) {
      // Broadcast video change to all clients
      const videoMsg = { type: "video", url: msg.url, timestamp: Date.now() };
      
      if (redisConnected && redis) {
        try {
          await redis.set("current_video", JSON.stringify(videoMsg), "EX", 3600); // 1 hour
          await pub.publish(CHANNEL, JSON.stringify(videoMsg));
        } catch (error) {
          console.warn("Redis video operation failed:", error.message);
        }
      }
      
      broadcast(videoMsg);
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

    // Handle drawing strokes
    if (msg.type === "drawing_stroke" && msg.stroke) {
      const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!rateLimit(ip, 100)) return; // Higher frequency for drawing
      
      const stroke = sanitizeStroke(msg.stroke);
      if (!stroke) return;

      const strokeId = crypto.randomUUID();
      const strokeMsg = {
        type: "drawing_stroke",
        stroke: {
          ...stroke,
          id: strokeId,
          timestamp: Date.now()
        }
      };

      // Store stroke persistently (only if Redis is connected)
      if (redisConnected && redis) {
        try {
          await redis.set(`stroke:${strokeId}`, JSON.stringify(strokeMsg.stroke), "EX", 24 * 60 * 60); // 24 hours
          await redis.zadd("strokes:z", strokeMsg.stroke.timestamp, strokeId);
          await pub.publish(CHANNEL, JSON.stringify(strokeMsg));
        } catch (error) {
          console.warn("Redis stroke operation failed:", error.message);
        }
      }
      
      broadcast(strokeMsg);
    }

    // Handle drawing clear
    if (msg.type === "drawing_clear") {
      const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      if (!rateLimit(ip, 5000)) return; // Rate limit clear operations
      
      const clearMsg = {
        type: "drawing_clear",
        timestamp: Date.now()
      };

      // Clear all strokes from Redis
      if (redisConnected && redis) {
        try {
          const strokeIds = await redis.zrange("strokes:z", 0, -1);
          if (strokeIds.length > 0) {
            const keys = strokeIds.map((id) => `stroke:${id}`);
            await redis.del(...keys);
            await redis.del("strokes:z");
          }
          await pub.publish(CHANNEL, JSON.stringify(clearMsg));
        } catch (error) {
          console.warn("Redis clear operation failed:", error.message);
        }
      }
      
      broadcast(clearMsg);
    }

    // Handle object updates (physics, properties, etc.)
    if (msg.type === "object_update" && msg.objectId && msg.updates) {
      const updateMsg = {
        type: "object_update",
        objectId: msg.objectId,
        updates: msg.updates,
        timestamp: Date.now()
      };

      if (redisConnected && pub) {
        try {
          await pub.publish(CHANNEL, JSON.stringify(updateMsg));
        } catch (error) {
          console.warn("Redis object update operation failed:", error.message);
        }
      }
      
      broadcast(updateMsg);
    }

    // Handle object physics throwing
    if (msg.type === "object_throw" && msg.objectId && typeof msg.vx === "number" && typeof msg.vy === "number") {
      // Clamp velocity to reasonable limits
      const vx = Math.max(-10, Math.min(10, msg.vx));
      const vy = Math.max(-10, Math.min(10, msg.vy));
      
      const throwMsg = {
        type: "object_throw",
        objectId: msg.objectId,
        vx,
        vy,
        timestamp: Date.now()
      };

      if (redisConnected && pub) {
        try {
          await pub.publish(CHANNEL, JSON.stringify(throwMsg));
        } catch (error) {
          console.warn("Redis object throw operation failed:", error.message);
        }
      }
      
      broadcast(throwMsg);
    }

    // Handle object deletion
    if (msg.type === "object_delete" && msg.objectId) {
      const deleteMsg = {
        type: "object_delete",
        objectId: msg.objectId,
        timestamp: Date.now()
      };

      if (redisConnected && pub) {
        try {
          await pub.publish(CHANNEL, JSON.stringify(deleteMsg));
        } catch (error) {
          console.warn("Redis object delete operation failed:", error.message);
        }
      }
      
      broadcast(deleteMsg);
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

// Get current video from Redis
async function getCurrentVideo() {
  if (!redisConnected || !redis) return null;
  
  try {
    const video = await redis.get("current_video");
    return video ? JSON.parse(video) : null;
  } catch (error) {
    console.warn("Failed to fetch current video from Redis:", error.message);
    return null;
  }
}

// Fetch drawing strokes from Redis
async function fetchDrawingStrokes() {
  if (!redisConnected || !redis) return [];
  
  try {
    // Get all stroke IDs from the sorted set
    const strokeIds = await redis.zrange("strokes:z", 0, -1);
    if (strokeIds.length === 0) return [];
    
    // Fetch all stroke data
    const keys = strokeIds.map((id) => `stroke:${id}`);
    const strokesData = await redis.mget(keys);
    
    return strokesData
      .filter(Boolean)
      .map((data) => {
        try {
          return JSON.parse(data);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp); // Sort by timestamp
  } catch (error) {
    console.warn("Failed to fetch drawing strokes from Redis:", error.message);
    return [];
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

function sanitizeStroke(stroke) {
  if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 1) return null;
  
  // Validate stroke properties
  const tool = ['pen', 'brush', 'eraser'].includes(stroke.tool) ? stroke.tool : 'pen';
  const color = typeof stroke.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(stroke.color) ? stroke.color : '#000000';
  const size = Number(stroke.size);
  if (!(size >= 1 && size <= 50)) return null;
  
  // Validate and normalize points
  const points = stroke.points
    .slice(0, 1000) // Limit points per stroke
    .map(p => {
      const x = Number(p.x);
      const y = Number(p.y);
      // Normalize to percentage coordinates for consistency across devices
      if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100)) return null;
      return { x, y };
    })
    .filter(Boolean);
    
  if (points.length === 0) return null;
  
  return { tool, color, size, points };
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