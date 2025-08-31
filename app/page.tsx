"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Realtime Party Wall — Single‑page React app (WebSocket + Redis edition)
 *
 * Changes vs previous version:
 * - Removed Firebase/Firestore
 * - Added WebSocket client that talks to your Railway server
 * - Notes broadcast to everyone in realtime; expire client‑side after 1 hour
 * - Still includes: high‑FPS animated canvas background, livestream embed dock, playful pop‑up ad
 *
 * Backend protocol (see server template in chat):
 *  Client → Server:
 *    { type: "hello" }
 *    { type: "post", note: { text, xPct, yPct } }
 *  Server → Client:
 *    { type: "state", notes: Note[] }
 *    { type: "new", note: Note }
 *  Note = { id, text, xPct, yPct, createdAt, expireAt }
 */

// --- Utils ---
const HOUR_MS = 60 * 60 * 1000;
function now() { return Date.now(); }
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }
function useNow(tickMs = 10000) {
  const [t, setT] = useState(now());
  useEffect(() => { const id = setInterval(() => setT(now()), tickMs); return () => clearInterval(id); }, [tickMs]);
  return t;
}

function toEmbedUrl(raw: string, parentHost?: string) {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if ((u.hostname.includes("youtube.com") || u.hostname === "youtu.be") && (u.searchParams.get("v") || u.pathname.length > 1)) {
      let id = u.searchParams.get("v");
      if (!id && u.hostname === "youtu.be") id = u.pathname.slice(1);
      return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("twitch.tv") && !u.pathname.includes("/videos/")) {
      const channel = u.pathname.replaceAll("/", "");
      const parent = parentHost || "localhost";
      return `https://player.twitch.tv/?channel=${channel}&parent=${parent}&autoplay=false`;
    }
    return raw;
  } catch { return raw; }
}

// --- Canvas Particle Field (fast + pretty) ---
function ParticleField({ drawingCanvas }: { drawingCanvas?: HTMLCanvasElement | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<any[]>([]);
  const animationRef = useRef<number | null>(null);
  const lastTRef = useRef(0);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d", { alpha: true });
    if (!ctx) return;
    
    function resize() {
      if (!cvs || !ctx) return;
      const ratio = window.devicePixelRatio || 1;
      cvs.width = Math.floor(cvs.clientWidth * ratio);
      cvs.height = Math.floor(cvs.clientHeight * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cvs);

    const N = 140;
    const parts = Array.from({ length: N }, () => ({
      x: Math.random() * cvs.clientWidth,
      y: Math.random() * cvs.clientHeight,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.5) * 0.6,
      r: 1 + Math.random() * 2,
      t: Math.random() * Math.PI * 2,
      color: "rgba(255,255,255,0.9)",
    }));
    particlesRef.current = parts;

    function draw(ts: number) {
      if (!cvs || !ctx) return;
      const dt = lastTRef.current ? Math.min(33, ts - lastTRef.current) : 16; lastTRef.current = ts;
      ctx.clearRect(0, 0, cvs.clientWidth, cvs.clientHeight);
      const g = ctx.createLinearGradient(0, 0, cvs.clientWidth, cvs.clientHeight);
      g.addColorStop(0, "rgba(255,255,255,0.02)"); g.addColorStop(1, "rgba(0,0,0,0.02)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, cvs.clientWidth, cvs.clientHeight);
      const mouse = mouseRef.current;
      
      // Get drawing data for particle interactions
      let drawingImageData: ImageData | null = null;
      if (drawingCanvas) {
        try {
          const drawingCtx = drawingCanvas.getContext('2d');
          if (drawingCtx) {
            drawingImageData = drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
          }
        } catch (e) {
          // Canvas might not be accessible, continue without drawing data
        }
      }
      
      for (const p of particlesRef.current) {
        p.t += 0.002 * dt; p.vx += Math.cos(p.t) * 0.002; p.vy += Math.sin(p.t * 1.3) * 0.002;
        
        // Mouse interaction
        const dx = p.x - mouse.x, dy = p.y - mouse.y; const d2 = dx * dx + dy * dy;
        if (d2 < 20000) { const f = 0.06; const inv = 1 / Math.sqrt(d2 + 0.001); p.vx += dx * inv * f; p.vy += dy * inv * f; }
        
        // Drawing interaction - particles attracted to drawn pixels
        if (drawingImageData) {
          const canvasX = Math.floor((p.x / cvs.clientWidth) * drawingCanvas!.width);
          const canvasY = Math.floor((p.y / cvs.clientHeight) * drawingCanvas!.height);
          
          if (canvasX >= 0 && canvasX < drawingCanvas!.width && canvasY >= 0 && canvasY < drawingCanvas!.height) {
            const pixelIndex = (canvasY * drawingCanvas!.width + canvasX) * 4;
            const alpha = drawingImageData.data[pixelIndex + 3]; // Alpha channel
            
            if (alpha > 128) { // If there's a visible drawing here
              const attractionForce = 0.08;
              const targetX = (canvasX / drawingCanvas!.width) * cvs.clientWidth;
              const targetY = (canvasY / drawingCanvas!.height) * cvs.clientHeight;
              const drawDx = targetX - p.x;
              const drawDy = targetY - p.y;
              const drawD2 = drawDx * drawDx + drawDy * drawDy;
              
              if (drawD2 < 10000) { // Within attraction range
                const inv = 1 / Math.sqrt(drawD2 + 0.001);
                p.vx += drawDx * inv * attractionForce;
                p.vy += drawDy * inv * attractionForce;
                
                // Change particle color based on drawing
                const r = drawingImageData.data[pixelIndex];
                const g = drawingImageData.data[pixelIndex + 1];
                const b = drawingImageData.data[pixelIndex + 2];
                p.color = `rgba(${r},${g},${b},0.9)`;
              }
            } else {
              // Reset to default color when not near drawing
              p.color = "rgba(255,255,255,0.9)";
            }
          }
        }
        
        p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06;
        if (p.x < -10) p.x = cvs.clientWidth + 10; if (p.x > cvs.clientWidth + 10) p.x = -10; if (p.y < -10) p.y = cvs.clientHeight + 10; if (p.y > cvs.clientHeight + 10) p.y = -10;
        
        ctx.beginPath(); 
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); 
        ctx.fillStyle = p.color || "rgba(255,255,255,0.9)"; 
        ctx.fill();
      }
      animationRef.current = requestAnimationFrame(draw);
    }
    animationRef.current = requestAnimationFrame(draw);

    function onMove(e: PointerEvent) { 
      if (!cvs) return;
      const rect = cvs.getBoundingClientRect(); 
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }; 
    }
    function onLeave() { mouseRef.current = { x: -9999, y: -9999 }; }
    cvs.addEventListener("pointermove", onMove, { passive: true });
    cvs.addEventListener("pointerleave", onLeave, { passive: true });

    return () => { ro.disconnect(); if (animationRef.current) cancelAnimationFrame(animationRef.current); cvs.removeEventListener("pointermove", onMove); cvs.removeEventListener("pointerleave", onLeave); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full will-change-transform" aria-hidden />;
}

// --- WebSocket realtime hook ---
interface Note {
  id: string;
  text: string;
  xPct: number;
  yPct: number;
  createdAt: number;
  expireAt: number;
  imageData?: string; // For drawings
  isDragging?: boolean;
}

function useWSNotes(wsUrl: string, ttlMs = HOUR_MS) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentVideo, setCurrentVideo] = useState<string>("");
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const t = useNow(15000);

  useEffect(() => {
    if (!wsUrl) return; // Not connected yet
    let closed = false;
    let retry = 0;

    function connect() {
      setStatus("connecting");
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        setStatus("connected");
        retry = 0;
        ws.send(JSON.stringify({ type: "hello" }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === "state" && Array.isArray(msg.notes)) {
            setNotes(msg.notes);
            if (msg.currentVideo && msg.currentVideo.url) {
              setCurrentVideo(msg.currentVideo.url);
            }
          } else if (msg.type === "new" && msg.note) {
            setNotes((prev) => {
              const exists = prev.some((n) => n.id === msg.note.id);
              return exists ? prev : [msg.note, ...prev];
            });
          } else if (msg.type === "video" && msg.url) {
            console.log("📺 Received video sync:", msg.url);
            setCurrentVideo(msg.url);
          } else if (msg.type === "move" && msg.noteId) {
            // Update note position
            setNotes(prev => prev.map(note => 
              note.id === msg.noteId 
                ? { ...note, xPct: msg.xPct, yPct: msg.yPct }
                : note
            ));
          }
        } catch {}
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus("disconnected");
        retry += 1;
        const backoff = Math.min(10000, 500 * Math.pow(2, retry));
        setTimeout(connect, backoff);
      };
      ws.onerror = () => {
        try { ws.close(); } catch {}
      };
    }
    connect();
    return () => { closed = true; try { wsRef.current?.close(); } catch {} };
  }, [wsUrl]);

  // Client-side prune for display
  const fresh = useMemo(() => {
    const cutoff = Date.now() - ttlMs;
    return notes.filter((n) => (n.createdAt ?? 0) >= cutoff);
  }, [notes, ttlMs, t]);

  async function postNote({ text, xPct, yPct }: { text: string; xPct: number; yPct: number }) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) throw new Error("WebSocket not connected");
    ws.send(JSON.stringify({ type: "post", note: { text, xPct, yPct } }));
  }

  async function updateVideo(url: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) {
      console.warn("🚫 WebSocket not connected, cannot sync video");
      return;
    }
    console.log("📡 Sending video sync:", url);
    ws.send(JSON.stringify({ type: "video", url }));
  }

  return { notes: fresh, currentVideo, status, postNote, updateVideo, wsRef };
}

// --- Input bubble ---
interface InputBubbleProps {
  xPct: number;
  yPct: number;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

function InputBubble({ xPct, yPct, onSubmit, onCancel }: InputBubbleProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <div className="absolute z-30" style={{ left: `${xPct}%`, top: `${yPct}%`, transform: "translate(-50%, -120%)" }}>
      <form
        onSubmit={(e) => { e.preventDefault(); const v = value.trim(); if (v) onSubmit(v); }}
        className="bg-white/90 backdrop-blur text-sm rounded-2xl shadow-xl px-3 py-2 flex items-center gap-2 border border-black/5 text-black"
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 140))}
          placeholder="say something nice…"
          className="outline-none bg-transparent placeholder:text-black/40"
        />
        <button type="button" onClick={onCancel} className="text-xs px-2 py-1 rounded-full bg-black/5 hover:bg-black/10">Cancel</button>
        <button type="submit" className="text-xs px-2 py-1 rounded-full bg-black text-white hover:opacity-90">Drop</button>
      </form>
    </div>
  );
}

// --- Ad modal ---
interface AdModalProps {
  open: boolean;
  onClose: () => void;
}

function AdModal({ open, onClose }: AdModalProps) {
  if (!open) return null;
  
  const adTypes = [
    {
      title: "✨ Premium Sparkles Pro+",
      lines: [
        "🚀 Unlock 200% more vibes instantly!",
        "🎯 Premium emoji reactions",
        "⚡ Lightning-fast message delivery",
        "🌈 Rainbow particle effects"
      ],
      cta: "UPGRADE NOW",
      color: "from-purple-500 to-pink-500"
    },
    {
      title: "🎮 Character Creator DLC",
      lines: [
        "🦄 Create your unique avatar",
        "👑 Exclusive crown emojis",
        "🎨 Custom message colors",
        "🔥 Legendary status badge"
      ],
      cta: "GET CHARACTERS",
      color: "from-blue-500 to-cyan-500"
    },
    {
      title: "💰 Wall Coin Mining",
      lines: [
        "⛏️ Mine coins while chatting!",
        "💎 Trade rare wall gems",
        "🏆 Leaderboard rankings",
        "🎰 Daily spin rewards"
      ],
      cta: "START MINING",
      color: "from-yellow-500 to-orange-500"
    }
  ];
  
  const ad = adTypes[Math.floor(Math.random() * adTypes.length)];
  
  return (
    <div className="fixed inset-0 z-40 bg-black/50 grid place-items-center">
      <div className="bg-white max-w-sm w-[92vw] rounded-2xl p-5 shadow-2xl border border-black/10 text-black relative overflow-hidden">
        <div className={`absolute inset-0 bg-gradient-to-br ${ad.color} opacity-5`} />
        <div className="relative">
          <div className="text-xl font-semibold mb-2">{ad.title}</div>
          <div className="space-y-1 mb-4">{ad.lines.map((l, i) => (<div key={i} className="text-black/80">{l}</div>))}</div>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-full bg-black/10 hover:bg-black/20">No thanks</button>
            <button onClick={() => { onClose(); alert(`You clicked "${ad.cta}"! 🎉 Capitalism level: MAXIMUM`); }} className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${ad.color} text-white font-semibold hover:scale-105 transition-transform`}>
              {ad.cta}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Setup panel ---
interface SetupPanelProps {
  streamUrl: string;
  setStreamUrl: (url: string) => void;
  onUpdateVideo: (url: string) => void;
  user: User;
  onLogout: () => void;
}

function SetupPanel({ streamUrl, setStreamUrl, onUpdateVideo, user, onLogout }: SetupPanelProps) {
  const handleVideoChange = (newUrl: string) => {
    setStreamUrl(newUrl);
    // Only sync if URL is actually different and not empty
    if (newUrl.trim() && newUrl !== streamUrl) {
      console.log('🎥 Syncing video globally:', newUrl);
      onUpdateVideo(newUrl);
    }
  };

  const xpProgress = getXPProgress(user);
  const title = getLevelTitle(user.level);

  return (
    <div className="p-4 rounded-2xl bg-white/90 border border-black/10 shadow-xl space-y-4 text-black">
      {/* RPG User Profile */}
      <div className="pb-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{user.emoji}</span>
            <div>
              <div className="font-bold text-lg">{user.name.slice(0, 4)}</div>
              <div className="text-sm text-purple-600 font-semibold">{title}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">Lv.{user.level}</div>
            <button 
              onClick={onLogout}
              className="px-2 py-1 rounded-full bg-red-100 hover:bg-red-200 text-red-700 text-xs mt-1"
            >
              Logout
            </button>
          </div>
        </div>
        
        {/* XP Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span>XP: {xpProgress.current}/{xpProgress.needed}</span>
            <span>{Math.round(xpProgress.progress * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${xpProgress.progress * 100}%` }}
            />
          </div>
        </div>
        
        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4 mt-3 text-center">
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-2">
            <div className="text-lg font-bold text-blue-600">{user.messagesSent}</div>
            <div className="text-xs text-gray-600">Messages</div>
          </div>
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-2">
            <div className="text-lg font-bold text-purple-600">{user.xp}</div>
            <div className="text-xs text-gray-600">Total XP</div>
          </div>
        </div>
      </div>
      
      <div>
        <div className="font-semibold mb-1">🎥 Global Livestream</div>
        <div className="text-sm text-black/70 mb-2">Paste a YouTube/Twitch URL - it syncs for EVERYONE instantly!</div>
        <input 
          value={streamUrl} 
          onChange={(e) => handleVideoChange(e.target.value)} 
          placeholder="https://www.youtube.com/watch?v=...  or  https://twitch.tv/<channel>" 
          className="w-full bg-white border border-black/10 rounded-xl px-3 py-2" 
        />
      </div>
    </div>
  );
}

// --- INSANE STAT DATABASE ---
const STAT_DATABASE = {
  // Completely Random Categories
  "🎮 Gaming Skills": [
    { name: "Rage Quit Resistance", icon: "🤬" },
    { name: "Button Mashing Technique", icon: "🕹️" },
    { name: "Loading Screen Patience", icon: "⏳" },
    { name: "Noob Crushing Ability", icon: "💀" },
    { name: "Achievement Hunting", icon: "🏆" },
    { name: "Speedrun Potential", icon: "⚡" },
  ],
  
  "🍕 Life Essentials": [
    { name: "Pizza Folding Technique", icon: "🍕" },
    { name: "Caffeine Tolerance", icon: "☕" },
    { name: "Sleep Procrastination", icon: "😴" },
    { name: "Snack Optimization", icon: "🍿" },
    { name: "Comfort Zone Expansion", icon: "🛋️" },
    { name: "Midnight Fridge Raids", icon: "🥪" },
  ],

  "🔮 Mystical Nonsense": [
    { name: "Aura Reading Accuracy", icon: "✨" },
    { name: "Crystal Ball Clarity", icon: "🔮" },
    { name: "Horoscope Dependency", icon: "⭐" },
    { name: "Manifestation Power", icon: "🌟" },
    { name: "Chakra Alignment", icon: "🧘" },
    { name: "Vibe Check Sensitivity", icon: "📡" },
  ],

  "🐱 Internet Culture": [
    { name: "Meme Recognition Speed", icon: "🐸" },
    { name: "Cat Video Appreciation", icon: "🐱" },
    { name: "Troll Detection", icon: "👹" },
    { name: "Rickroll Immunity", icon: "🎵" },
    { name: "Comment Section Survival", icon: "💬" },
    { name: "Viral Prediction", icon: "📈" },
  ],

  "🤡 Absurd Talents": [
    { name: "Banana Peeling Efficiency", icon: "🍌" },
    { name: "Rubber Duck Debugging", icon: "🦆" },
    { name: "Spaghetti Twirling Mastery", icon: "🍝" },
    { name: "Elevator Button Politics", icon: "🛗" },
    { name: "WiFi Password Guessing", icon: "📶" },
    { name: "Parallel Parking Anxiety", icon: "🚗" },
  ],

  "🌈 Personality Quirks": [
    { name: "Social Battery Level", icon: "🔋" },
    { name: "Awkward Silence Tolerance", icon: "😶" },
    { name: "Small Talk Avoidance", icon: "💬" },
    { name: "Overthinking Capacity", icon: "🤔" },
    { name: "Random Fact Storage", icon: "🧠" },
    { name: "Procrastination Creativity", icon: "⏰" },
  ],

  "🦄 Pure Fantasy": [
    { name: "Unicorn Belief Level", icon: "🦄" },
    { name: "Dragon Negotiation", icon: "🐉" },
    { name: "Fairy Communication", icon: "🧚" },
    { name: "Magic Potion Brewing", icon: "🧪" },
    { name: "Teleportation Accuracy", icon: "✨" },
    { name: "Mind Reading Ethics", icon: "👁️" },
  ],

  "🎭 Social Disasters": [
    { name: "Dad Joke Delivery", icon: "👨" },
    { name: "Karaoke Confidence", icon: "🎤" },
    { name: "Dance Floor Courage", icon: "💃" },
    { name: "Phone Call Anxiety", icon: "📞" },
    { name: "Name Forgetting Rate", icon: "🏷️" },
    { name: "Compliment Acceptance", icon: "😊" },
  ],

  "🌊 Weather Powers": [
    { name: "Rain Prediction Accuracy", icon: "🌧️" },
    { name: "Sunburn Resistance", icon: "☀️" },
    { name: "Snow Day Manifesting", icon: "❄️" },
    { name: "Wind Direction Control", icon: "💨" },
    { name: "Thunder Fear Level", icon: "⛈️" },
    { name: "Rainbow Summoning", icon: "🌈" },
  ],

  "🚀 Space Cadet": [
    { name: "Alien Communication", icon: "👽" },
    { name: "Zero Gravity Adaptation", icon: "🚀" },
    { name: "Constellation Naming", icon: "⭐" },
    { name: "Meteor Dodging", icon: "☄️" },
    { name: "Black Hole Resistance", icon: "🕳️" },
    { name: "Spaceship Parking", icon: "🛸" },
  ]
};

// Randomly pick stats from the database
interface CharacterStats {
  [key: string]: number; // Dynamic stats
}

function generateRandomStats(): CharacterStats {
  const stats: CharacterStats = {};
  const categories = Object.keys(STAT_DATABASE);
  
  // Pick 3-5 random categories
  const numCategories = 3 + Math.floor(Math.random() * 3);
  const selectedCategories = categories
    .sort(() => 0.5 - Math.random())
    .slice(0, numCategories);
  
  selectedCategories.forEach(category => {
    const categoryStats = STAT_DATABASE[category as keyof typeof STAT_DATABASE];
    // Pick 2-4 stats from each category
    const numStats = 2 + Math.floor(Math.random() * 3);
    const selectedStats = categoryStats
      .sort(() => 0.5 - Math.random())
      .slice(0, numStats);
    
    selectedStats.forEach(stat => {
      const statKey = `${stat.icon} ${stat.name}`;
      stats[statKey] = Math.floor(Math.random() * 100) + 1;
    });
  });
  
  return stats;
}

// Get stat categories for display
function getStatCategoriesForDisplay(user: User) {
  const categories: { title: string; stats: { name: string; value: number; icon: string }[] }[] = [];
  const statEntries = Object.entries(user.stats);
  
  // Group stats by emoji (rough category detection)
  const grouped: { [key: string]: { name: string; value: number; icon: string }[] } = {};
  
  statEntries.forEach(([key, value]) => {
    const icon = key.split(' ')[0];
    const name = key.substring(key.indexOf(' ') + 1);
    
    if (!grouped[icon]) {
      grouped[icon] = [];
    }
    grouped[icon].push({ name, value, icon });
  });
  
  // Convert to category format
  Object.entries(grouped).forEach(([icon, stats], index) => {
    const categoryNames = ["Your Random Powers", "Weird Abilities", "Secret Skills", "Hidden Talents"];
    categories.push({
      title: `${icon} ${categoryNames[index % categoryNames.length]}`,
      stats
    });
  });
  
  return categories;
}

interface User {
  name: string;
  emoji: string;
  color: string;
  xp: number;
  level: number;
  messagesSent: number;
  joinedAt: number;
  stats: CharacterStats;
}


// Get stat description based on value
function getStatDescription(value: number): string {
  if (value >= 90) return "🌟 LEGENDARY";
  if (value >= 75) return "⚡ EPIC";
  if (value >= 60) return "🔥 HIGH";
  if (value >= 40) return "✨ DECENT";
  if (value >= 25) return "📊 LOW";
  return "💀 ABYSMAL";
}

// XP required for each level (exponential growth)
function getXPForLevel(level: number): number {
  return Math.floor(10 * Math.pow(1.5, level - 1));
}

// Calculate level from total XP
function getLevelFromXP(xp: number): number {
  let level = 1;
  let totalXPNeeded = 0;
  while (totalXPNeeded <= xp) {
    totalXPNeeded += getXPForLevel(level);
    if (totalXPNeeded <= xp) level++;
  }
  return level;
}

// Get XP progress towards next level
function getXPProgress(user: User): { current: number; needed: number; progress: number } {
  const currentLevel = user.level;
  const xpForCurrentLevel = getXPForLevel(currentLevel);
  let xpUsedForPreviousLevels = 0;
  
  for (let i = 1; i < currentLevel; i++) {
    xpUsedForPreviousLevels += getXPForLevel(i);
  }
  
  const currentXPInLevel = user.xp - xpUsedForPreviousLevels;
  const progress = Math.min(currentXPInLevel / xpForCurrentLevel, 1);
  
  return {
    current: currentXPInLevel,
    needed: xpForCurrentLevel,
    progress
  };
}

// Get level title based on level
function getLevelTitle(level: number): string {
  if (level >= 50) return "🌟 Wall Legend";
  if (level >= 25) return "👑 VIP Member";
  if (level >= 15) return "⚡ Power User";
  if (level >= 10) return "🔥 Regular";
  if (level >= 5) return "✨ Active";
  return "🆕 Newbie";
}

const defaultEmojis = ["😎", "🦄", "🚀", "🔥", "⚡", "🌈", "👑", "💫", "🎯", "🎮", "🍕", "🎨"];
const defaultColors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"];

function LoginScreen({ onLogin }: { onLogin: (user: User) => void }) {
  const [name, setName] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState(defaultEmojis[0]);
  const [selectedColor, setSelectedColor] = useState(defaultColors[0]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur rounded-3xl p-8 max-w-md w-full shadow-2xl">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">🎉 Join the Wall!</h1>
          <p className="text-gray-600">Pick your vibe and start chatting</p>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Your Name</label>
            <input 
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 20))}
              placeholder="Enter your cool name..."
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              autoFocus
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Choose Your Emoji</label>
            <div className="grid grid-cols-6 gap-2">
              {defaultEmojis.map(emoji => (
                <button 
                  key={emoji}
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`p-2 rounded-lg text-2xl hover:scale-110 transition-transform ${selectedEmoji === emoji ? 'bg-blue-100 ring-2 ring-blue-500' : 'hover:bg-gray-100'}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Pick Your Color</label>
            <div className="flex flex-wrap gap-2">
              {defaultColors.map(color => (
                <button 
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`w-8 h-8 rounded-full transition-transform hover:scale-110 ${selectedColor === color ? 'ring-4 ring-gray-400' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          
          <button 
            onClick={() => name.trim() && onLogin({ 
              name: name.trim(), 
              emoji: selectedEmoji, 
              color: selectedColor,
              xp: 0,
              level: 1,
              messagesSent: 0,
              joinedAt: Date.now(),
              stats: generateRandomStats()
            })}
            disabled={!name.trim()}
            className="w-full py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform"
          >
            🎲 Generate Character & Begin!
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Character Stats Modal ---
interface CharacterStatsModalProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

function CharacterStatsModal({ user, isOpen, onClose }: CharacterStatsModalProps) {
  if (!isOpen) return null;

  const statCategories = getStatCategoriesForDisplay(user);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-gradient-to-br from-purple-900 to-indigo-900 rounded-xl sm:rounded-3xl p-4 sm:p-6 max-w-4xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-y-auto shadow-2xl border border-purple-300/30">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-purple-300/30">
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="text-2xl sm:text-4xl">{user.emoji}</span>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white">{user.name.slice(0, 4)}</h2>
              <div className="text-purple-300">{getLevelTitle(user.level)} • Level {user.level}</div>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white"
          >
            ✕
          </button>
        </div>

        {/* Stats Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
          {statCategories.map((category, categoryIndex) => (
            <div key={categoryIndex} className="bg-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 backdrop-blur">
              <h3 className="text-base sm:text-lg font-bold text-white mb-3 sm:mb-4">{category.title}</h3>
              <div className="space-y-3">
                {category.stats.map((stat, statIndex) => (
                  <div key={statIndex} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{stat.icon}</span>
                      <span className="text-white text-sm">{stat.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-black/30 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-purple-400 to-pink-400 h-2 rounded-full"
                          style={{ width: `${stat.value}%` }}
                        />
                      </div>
                      <span className="text-white font-bold text-sm w-8">{stat.value}</span>
                      <span className="text-xs text-purple-300 w-20">{getStatDescription(stat.value)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer with regenerate button */}
        <div className="mt-6 pt-4 border-t border-purple-300/30 text-center">
          <p className="text-purple-300 text-sm mb-3">
            These stats were randomly generated when you joined! They're completely meaningless but absolutely yours! 🎲
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full font-semibold hover:scale-105 transition-transform"
          >
            🚀 Back to the Wall!
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Main App ---
export default function PartyWall() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('partywall_user');
      if (saved) {
        const parsedUser = JSON.parse(saved);
        // Migrate old users without stats
        if (!parsedUser.stats) {
          parsedUser.stats = generateRandomStats();
        }
        return parsedUser;
      }
    }
    return null;
  });
  const [streamUrl, setStreamUrl] = useState(() => typeof window !== 'undefined' ? localStorage.getItem("partywall_stream_url") || "" : "");
  const [wsUrl, setWsUrl] = useState(() => (typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_WS_URL || localStorage.getItem("partywall_ws_url") || "") : ""));
  const [inputAt, setInputAt] = useState<{xPct: number; yPct: number} | null>(null); // {xPct,yPct}
  const [canvasMode, setCanvasMode] = useState<'draw' | null>(null);
  const [drawingTool, setDrawingTool] = useState<'pen' | 'brush' | 'eraser'>('pen');
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(2);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{x: number; y: number} | null>(null);
  const drawingDataRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [persistentDrawings, setPersistentDrawings] = useState<{id: string; imageData: string; createdAt: number}[]>([]);
  const [draggedNote, setDraggedNote] = useState<string | null>(null);

  // Initialize canvas when entering draw mode
  useEffect(() => {
    if (canvasMode === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Clear canvas for transparent drawing
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawingDataRef.current = canvas.toDataURL();
      }
    }
  }, [canvasMode]);
  const [adOpen, setAdOpen] = useState(false);
  const [xpGain, setXpGain] = useState<{show: boolean; amount: number}>({ show: false, amount: 0 });
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const nowMs = useNow(1000);

  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem("partywall_stream_url", streamUrl); }, [streamUrl]);
  useEffect(() => { if (wsUrl && typeof window !== 'undefined') localStorage.setItem("partywall_ws_url", wsUrl); }, [wsUrl]);
  
  // Save user to localStorage
  useEffect(() => { 
    if (user && typeof window !== 'undefined') {
      localStorage.setItem('partywall_user', JSON.stringify(user));
    }
  }, [user]);

  // Handle login
  const handleLogin = useCallback((newUser: User) => {
    setUser(newUser);
  }, []);

  // Handle logout  
  const handleLogout = useCallback(() => {
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('partywall_user');
    }
  }, []);

  // Ad timer (random pop up every 30–60s)
  useEffect(() => {
    let active = true; function schedule() { const ms = 30000 + Math.random() * 30000; setTimeout(() => { if (!active) return; setAdOpen(true); schedule(); }, ms); }
    schedule(); return () => { active = false; };
  }, []);

  const { notes, currentVideo, status, postNote, updateVideo, wsRef } = useWSNotes(wsUrl, HOUR_MS);

  const onBackgroundClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement; 
    if (target.closest && target.closest(".ui")) return;
    if (target.closest && target.closest(".canvas-area")) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = clamp01((e.clientX - rect.left) / rect.width) * 100;
    const yPct = clamp01((e.clientY - rect.top) / rect.height) * 100;
    if (canvasMode === 'draw') {
      // Don't show input bubble in draw mode
      return;
    }
    setInputAt({ xPct, yPct });
  }, [canvasMode]);

  async function submitNote(text: string) {
    if (!inputAt || !user) return;
    
    // Gain XP and level up!
    const newXP = user.xp + 1;
    const newLevel = getLevelFromXP(newXP);
    const newMessageCount = user.messagesSent + 1;
    const leveledUp = newLevel > user.level;
    
    // Update user with new stats
    const updatedUser = { 
      ...user, 
      xp: newXP, 
      level: newLevel, 
      messagesSent: newMessageCount 
    };
    setUser(updatedUser);
    
    // Show XP gain animation
    setXpGain({ show: true, amount: 1 });
    setTimeout(() => setXpGain({ show: false, amount: 0 }), 2000);

    // Show level up notification
    if (leveledUp) {
      setTimeout(() => {
        alert(`🎉 LEVEL UP! You are now level ${newLevel} - ${getLevelTitle(newLevel)}! 🚀`);
      }, 500);
    }
    
    // Add user info to message with level
    const levelBadge = user.level >= 5 ? `[Lv.${newLevel}]` : "";
    const payload = { text: `${user.emoji} ${user.name.slice(0, 4)} ${levelBadge}: ${text}`, ...inputAt };
    setInputAt(null);
    try { await postNote(payload); } catch (e) { console.error(e); alert("Failed to post message!"); }
  }

  async function submitDrawing(imageData: string) {
    if (!user) return;
    
    // Add drawing to persistent drawings locally
    const drawingId = `drawing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newDrawing = {
      id: drawingId,
      imageData,
      createdAt: Date.now()
    };
    setPersistentDrawings(prev => [...prev, newDrawing]);
    
    // Gain XP for drawing
    const newXP = user.xp + 2; // More XP for drawings
    const newLevel = getLevelFromXP(newXP);
    const newMessageCount = user.messagesSent + 1;
    const leveledUp = newLevel > user.level;
    
    // Update user with new stats
    const updatedUser = { 
      ...user, 
      xp: newXP, 
      level: newLevel, 
      messagesSent: newMessageCount 
    };
    setUser(updatedUser);
    
    // Show XP gain animation
    setXpGain({ show: true, amount: 2 });
    setTimeout(() => setXpGain({ show: false, amount: 0 }), 2000);

    // Show level up notification
    if (leveledUp) {
      setTimeout(() => {
        alert(`🎉 LEVEL UP! You are now level ${newLevel} - ${getLevelTitle(newLevel)}! 🚀`);
      }, 500);
    }
    
    // Add user info to drawing with level
    const levelBadge = user.level >= 5 ? `[Lv.${newLevel}]` : "";
    const payload = { 
      text: `${user.emoji} ${user.name.slice(0, 4)} ${levelBadge} drew something!`,
      xPct: 50, // Center the drawing notification
      yPct: 50,
      imageData // Include the drawing data
    };
    
    try { 
      // Send drawing to server (will need server-side support)
      await postNote(payload); 
    } catch (e) { 
      console.error(e); 
      alert("Failed to post drawing!"); 
    }
  }

  // Use currentVideo from WebSocket if available, otherwise use local streamUrl  
  const activeStreamUrl = currentVideo || streamUrl;
  console.log("🎬 Active stream URL:", activeStreamUrl, { currentVideo, streamUrl });
  const embedUrl = useMemo(() => toEmbedUrl(activeStreamUrl, typeof window !== 'undefined' ? window.location.hostname : ''), [activeStreamUrl]);

  // Show login screen if no user
  if (!user) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div ref={containerRef} className="relative w-full min-h-[100dvh] overflow-x-hidden overflow-y-auto bg-black text-white" onClick={onBackgroundClick}>
      <ParticleField drawingCanvas={canvasRef.current} />

      {/* Persistent Drawing Layer */}
      <div className="absolute inset-0 pointer-events-none">
        {persistentDrawings.map((drawing) => (
          <div key={drawing.id} className="absolute inset-0">
            <img 
              src={drawing.imageData} 
              alt="Drawing" 
              className="absolute inset-0 w-full h-full object-cover opacity-80"
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
        ))}
      </div>

      {/* Floating notes */}
      <div className="absolute inset-0">
        <AnimatePresence>
          {notes.map((n) => {
            const age = nowMs - n.createdAt; const life = clamp01(1 - age / HOUR_MS); const scale = 0.9 + 0.2 * life; const opacity = 0.2 + 0.8 * life;
            const isDragging = draggedNote === n.id;
            return (
              <motion.div 
                key={n.id} 
                initial={{ opacity: 0, scale: 0.8 }} 
                animate={{ opacity, scale }} 
                exit={{ opacity: 0, scale: 0.8 }} 
                transition={{ type: "spring", stiffness: 200, damping: 20 }} 
                className={`absolute font-semibold drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)] ${
                  isDragging ? 'pointer-events-auto cursor-grabbing z-50' : canvasMode === 'draw' ? 'pointer-events-none select-none' : 'pointer-events-auto cursor-grab'
                }`}
                style={{ 
                  left: `${n.xPct}%`, 
                  top: `${n.yPct}%`, 
                  transform: "translate(-50%, -50%)",
                  zIndex: isDragging ? 50 : 10
                }}
                drag={canvasMode !== 'draw'}
                dragMomentum={false}
                onDragStart={() => setDraggedNote(n.id)}
                onDragEnd={(event, info) => {
                  setDraggedNote(null);
                  if (!containerRef.current) return;
                  
                  const rect = containerRef.current.getBoundingClientRect();
                  const newXPct = clamp01(info.point.x / rect.width) * 100;
                  const newYPct = clamp01(info.point.y / rect.height) * 100;
                  
                  // Update note position locally (for immediate feedback)
                  // You might want to send this to the server later
                  // For now, the position update is just visual
                }}
              >
                <div className="px-3 py-2 rounded-2xl max-w-xs" style={{ background: "rgba(255,255,255,0.14)", backdropFilter: "blur(8px)" }}>
                  <div className="text-sm leading-tight">{n.text}</div>
                  {n.imageData && (
                    <div className="mt-2">
                      <img src={n.imageData} alt="Drawing" className="max-w-full h-auto rounded-lg" />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Input bubble */}
      <AnimatePresence>
        {inputAt && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <InputBubble xPct={inputAt.xPct} yPct={inputAt.yPct} onSubmit={submitNote} onCancel={() => setInputAt(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drawing Canvas Overlay */}
      {canvasMode === 'draw' && (
        <div className="canvas-area absolute inset-0 z-30 pointer-events-auto">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            width={1920}
            height={1080}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: 'transparent',
            }}
            onMouseDown={(e) => {
              if (!canvasRef.current) return;
              e.preventDefault();
              isDrawingRef.current = true;
              const rect = canvasRef.current.getBoundingClientRect();
              const scaleX = canvasRef.current.width / rect.width;
              const scaleY = canvasRef.current.height / rect.height;
              const x = (e.clientX - rect.left) * scaleX;
              const y = (e.clientY - rect.top) * scaleY;
              lastPointRef.current = { x, y };
            }}
            onMouseMove={(e) => {
              if (!isDrawingRef.current || !canvasRef.current || !lastPointRef.current) return;
              e.preventDefault();
              
              const ctx = canvasRef.current.getContext('2d');
              if (!ctx) return;
              
              const rect = canvasRef.current.getBoundingClientRect();
              const scaleX = canvasRef.current.width / rect.width;
              const scaleY = canvasRef.current.height / rect.height;
              const x = (e.clientX - rect.left) * scaleX;
              const y = (e.clientY - rect.top) * scaleY;
              
              ctx.beginPath();
              ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
              ctx.lineTo(x, y);
              ctx.strokeStyle = drawingTool === 'eraser' ? 'transparent' : drawingColor;
              ctx.lineWidth = brushSize;
              ctx.lineCap = 'round';
              ctx.globalCompositeOperation = drawingTool === 'eraser' ? 'destination-out' : 'source-over';
              ctx.stroke();
              
              lastPointRef.current = { x, y };
            }}
            onMouseUp={() => {
              isDrawingRef.current = false;
              lastPointRef.current = null;
              // Throttled save of canvas data (only save every 2 seconds)
              setHasUnsavedChanges(true);
              if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
              }
              saveTimeoutRef.current = setTimeout(() => {
                if (canvasRef.current) {
                  drawingDataRef.current = canvasRef.current.toDataURL();
                }
              }, 2000);
            }}
            onTouchStart={(e) => {
              if (!canvasRef.current) return;
              e.preventDefault();
              const touch = e.touches[0];
              isDrawingRef.current = true;
              const rect = canvasRef.current.getBoundingClientRect();
              const scaleX = canvasRef.current.width / rect.width;
              const scaleY = canvasRef.current.height / rect.height;
              const x = (touch.clientX - rect.left) * scaleX;
              const y = (touch.clientY - rect.top) * scaleY;
              lastPointRef.current = { x, y };
            }}
            onTouchMove={(e) => {
              if (!isDrawingRef.current || !canvasRef.current || !lastPointRef.current) return;
              e.preventDefault();
              
              const ctx = canvasRef.current.getContext('2d');
              if (!ctx) return;
              
              const touch = e.touches[0];
              const rect = canvasRef.current.getBoundingClientRect();
              const scaleX = canvasRef.current.width / rect.width;
              const scaleY = canvasRef.current.height / rect.height;
              const x = (touch.clientX - rect.left) * scaleX;
              const y = (touch.clientY - rect.top) * scaleY;
              
              ctx.beginPath();
              ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
              ctx.lineTo(x, y);
              ctx.strokeStyle = drawingTool === 'eraser' ? 'transparent' : drawingColor;
              ctx.lineWidth = brushSize;
              ctx.lineCap = 'round';
              ctx.globalCompositeOperation = drawingTool === 'eraser' ? 'destination-out' : 'source-over';
              ctx.stroke();
              
              lastPointRef.current = { x, y };
            }}
            onTouchEnd={() => {
              isDrawingRef.current = false;
              lastPointRef.current = null;
              // Throttled save for touch as well
              setHasUnsavedChanges(true);
              if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
              }
              saveTimeoutRef.current = setTimeout(() => {
                if (canvasRef.current) {
                  drawingDataRef.current = canvasRef.current.toDataURL();
                }
              }, 2000);
            }}
          />
        </div>
      )}

      {/* Drawing Tools Side Menu */}
      {canvasMode === 'draw' && (
        <div className="ui absolute left-2 top-1/2 transform -translate-y-1/2 bg-white/90 backdrop-blur rounded-2xl p-4 shadow-xl border border-black/10 z-50">
          <div className="space-y-4">
            {/* Tool Selection */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-800">🎨 Tools</div>
              <div className="flex flex-col gap-1">
                {[{ id: 'pen', icon: '✏️', name: 'Pen' }, { id: 'brush', icon: '🖌️', name: 'Brush' }, { id: 'eraser', icon: '🧽', name: 'Eraser' }].map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => setDrawingTool(tool.id as any)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      drawingTool === tool.id ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    <span>{tool.icon}</span>
                    <span>{tool.name}</span>
                  </button>
                ))}
              </div>
            </div>
            
            {/* Color Picker */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-800">🎨 Color</div>
              <input
                type="color"
                value={drawingColor}
                onChange={(e) => setDrawingColor(e.target.value)}
                className="w-full h-10 rounded-lg border border-gray-300"
              />
              <div className="grid grid-cols-4 gap-1">
                {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF'].map(color => (
                  <button
                    key={color}
                    onClick={() => setDrawingColor(color)}
                    className="w-8 h-8 rounded-lg border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            
            {/* Brush Size */}
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-800">📏 Size: {brushSize}px</div>
              <input
                type="range"
                min="1"
                max="50"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full"
              />
            </div>
            
            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d');
                    if (ctx) {
                      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                      setHasUnsavedChanges(true);
                    }
                  }
                }}
                className="w-full px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
              >
                🗑️ Clear
              </button>
              <button
                onClick={() => {
                  if (canvasRef.current) {
                    // Force immediate save
                    if (saveTimeoutRef.current) {
                      clearTimeout(saveTimeoutRef.current);
                    }
                    drawingDataRef.current = canvasRef.current.toDataURL();
                    submitDrawing(drawingDataRef.current);
                    
                    // Clear the drawing canvas after saving
                    const ctx = canvasRef.current.getContext('2d');
                    if (ctx) {
                      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
                    }
                  }
                  setCanvasMode(null);
                  setHasUnsavedChanges(false);
                }}
                className={`w-full px-3 py-2 rounded-lg transition-colors text-sm ${
                  hasUnsavedChanges 
                    ? 'bg-green-500 text-white hover:bg-green-600' 
                    : 'bg-gray-300 text-gray-600'
                }`}
                disabled={!hasUnsavedChanges}
              >
                ✅ Save & Share {hasUnsavedChanges ? '(*)' : ''}
              </button>
              <button
                onClick={() => setCanvasMode(null)}
                className="w-full px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
              >
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top HUD */}
      <div className="ui pointer-events-auto absolute top-0 left-0 right-0 p-2 sm:p-3 flex items-center gap-1 sm:gap-2 z-10 bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/10">
          <div className={`size-2 rounded-full ${status === 'connected' ? 'bg-green-400' : status === 'connecting' ? 'bg-yellow-300' : 'bg-red-500'} animate-pulse`} />
          <div className="text-xs">Live Wall · last hour</div>
        </div>
        
        {/* Clickable User Level Badge */}
        <button 
          onClick={() => setStatsModalOpen(true)}
          className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 backdrop-blur border border-purple-300/30 hover:from-purple-500/30 hover:to-blue-500/30 transition-all cursor-pointer"
        >
          <span className="text-sm sm:text-lg">{user.emoji}</span>
          <div className="text-xs hidden sm:block">
            <div className="font-semibold text-purple-200">Lv.{user.level} {user.name.slice(0, 4)}</div>
            <div className="text-purple-300">{user.xp} XP</div>
          </div>
        </button>
        
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <button 
            onClick={(e) => { 
              e.stopPropagation(); 
              setCanvasMode(canvasMode === 'draw' ? null : 'draw');
            }} 
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border text-xs ${
              canvasMode === 'draw' 
                ? 'bg-blue-500/20 border-blue-400/30 text-blue-200' 
                : 'bg-white/10 hover:bg-white/20 border-white/10'
            }`}
          >
            🎨 {canvasMode === 'draw' ? 'Exit' : 'Draw'}
          </button>
          <button onClick={(e) => { e.stopPropagation(); setAdOpen(true); }} className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs hidden sm:inline-block">💸</button>
          <details className="[&_summary]:list-none">
            <summary className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs cursor-pointer">⚙️</summary>
            <div className="absolute right-3 mt-2 w-[min(92vw,36rem)]">
              <SetupPanel streamUrl={streamUrl} setStreamUrl={setStreamUrl} onUpdateVideo={updateVideo} user={user} onLogout={handleLogout} />
            </div>
          </details>
        </div>
      </div>
      
      {/* XP Gain Animation */}
      <AnimatePresence>
        {xpGain.show && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: -20, scale: 1.2 }}
            exit={{ opacity: 0, y: -40, scale: 0.5 }}
            className="absolute top-20 left-1/2 transform -translate-x-1/2 pointer-events-none z-50"
          >
            <div className="bg-gradient-to-r from-green-400 to-blue-500 text-white px-4 py-2 rounded-full font-bold shadow-lg">
              +{xpGain.amount} XP!
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Livestream dock */}
      <div className="ui pointer-events-auto absolute bottom-2 sm:bottom-3 right-2 sm:right-3 w-[min(95vw,280px)] sm:w-[min(92vw,560px)] h-[180px] sm:h-[315px] rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black/40 backdrop-blur">
        {embedUrl ? (
          <iframe title="Livestream" src={embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
        ) : (
          <div className="w-full h-full grid place-items-center text-center p-6 text-white/80">
            <div><div className="font-semibold text-sm sm:text-base">No stream</div></div>
          </div>
        )}
      </div>


      {/* Pop‑up ads */}
      <AdModal open={adOpen} onClose={() => setAdOpen(false)} />
      
      {/* Character Stats Modal */}
      <CharacterStatsModal 
        user={user} 
        isOpen={statsModalOpen} 
        onClose={() => setStatsModalOpen(false)} 
      />
    </div>
  );
}