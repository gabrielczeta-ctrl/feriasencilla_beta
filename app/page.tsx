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
function ParticleField() {
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
      for (const p of particlesRef.current) {
        p.t += 0.002 * dt; p.vx += Math.cos(p.t) * 0.002; p.vy += Math.sin(p.t * 1.3) * 0.002;
        const dx = p.x - mouse.x, dy = p.y - mouse.y; const d2 = dx * dx + dy * dy;
        if (d2 < 20000) { const f = 0.06; const inv = 1 / Math.sqrt(d2 + 0.001); p.vx += dx * inv * f; p.vy += dy * inv * f; }
        p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06;
        if (p.x < -10) p.x = cvs.clientWidth + 10; if (p.x > cvs.clientWidth + 10) p.x = -10; if (p.y < -10) p.y = cvs.clientHeight + 10; if (p.y > cvs.clientHeight + 10) p.y = -10;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();
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
}

function useWSNotes(wsUrl: string, ttlMs = HOUR_MS) {
  const [notes, setNotes] = useState<Note[]>([]);
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
          } else if (msg.type === "new" && msg.note) {
            setNotes((prev) => {
              const exists = prev.some((n) => n.id === msg.note.id);
              return exists ? prev : [msg.note, ...prev];
            });
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

  return { notes: fresh, status, postNote };
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
  const lines = [
    "✨ Upgrade to Premium Sparkles!",
    "🔥 200% more vibes. Limited time!",
    "🌀 Click now to spin your luck!",
    "🎁 Free pixels with every click.",
  ];
  return (
    <div className="fixed inset-0 z-40 bg-black/50 grid place-items-center">
      <div className="bg-white max-w-sm w-[92vw] rounded-2xl p-5 shadow-2xl border border-black/10 text-black">
        <div className="text-xl font-semibold mb-2">Totally Real Pop‑Up Ad</div>
        <div className="space-y-1 mb-4">{lines.map((l, i) => (<div key={i} className="text-black/80">{l}</div>))}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-full bg-black text-white">No thanks</button>
          <a href="#" onClick={(e) => { e.preventDefault(); onClose(); alert("You clicked an ad. Capitalism purrs."); }} className="px-3 py-1.5 rounded-full bg-black/10 hover:bg-black/20">Take my money</a>
        </div>
      </div>
    </div>
  );
}

// --- Setup panel ---
interface SetupPanelProps {
  streamUrl: string;
  setStreamUrl: (url: string) => void;
  wsUrl: string;
  setWsUrl: (url: string) => void;
}

function SetupPanel({ streamUrl, setStreamUrl, wsUrl, setWsUrl }: SetupPanelProps) {
  return (
    <div className="p-4 rounded-2xl bg-white/90 border border-black/10 shadow-xl space-y-4 text-black">
      <div>
        <div className="font-semibold mb-1">1) Livestream (optional)</div>
        <div className="text-sm text-black/70 mb-2">Paste a YouTube/Twitch URL or an embed URL. We'll try to auto‑embed.</div>
        <input value={streamUrl} onChange={(e) => setStreamUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=...  or  https://twitch.tv/<channel>" className="w-full bg-white border border-black/10 rounded-xl px-3 py-2" />
      </div>
      <div>
        <div className="font-semibold mb-1">2) WebSocket URL (realtime)</div>
        <div className="text-sm text-black/70 mb-2">Use your Railway server WebSocket endpoint (e.g. wss://your‑app.up.railway.app/ws). Stored in your browser.</div>
        <input value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} placeholder="wss://<railway>/ws" className="w-full bg-white border border-black/10 rounded-xl px-3 py-2 font-mono text-xs" />
      </div>
    </div>
  );
}

// --- Main App ---
export default function PartyWall() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [streamUrl, setStreamUrl] = useState(() => typeof window !== 'undefined' ? localStorage.getItem("partywall_stream_url") || "" : "");
  const [wsUrl, setWsUrl] = useState(() => (typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_WS_URL || localStorage.getItem("partywall_ws_url") || "") : ""));
  const [inputAt, setInputAt] = useState<{xPct: number; yPct: number} | null>(null); // {xPct,yPct}
  const [adOpen, setAdOpen] = useState(false);
  const nowMs = useNow(1000);

  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem("partywall_stream_url", streamUrl); }, [streamUrl]);
  useEffect(() => { if (wsUrl && typeof window !== 'undefined') localStorage.setItem("partywall_ws_url", wsUrl); }, [wsUrl]);

  // Ad timer (random pop up every 30–60s)
  useEffect(() => {
    let active = true; function schedule() { const ms = 30000 + Math.random() * 30000; setTimeout(() => { if (!active) return; setAdOpen(true); schedule(); }, ms); }
    schedule(); return () => { active = false; };
  }, []);

  const { notes, status, postNote } = useWSNotes(wsUrl, HOUR_MS);

  const onBackgroundClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement; if (target.closest && target.closest(".ui")) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = clamp01((e.clientX - rect.left) / rect.width) * 100;
    const yPct = clamp01((e.clientY - rect.top) / rect.height) * 100;
    setInputAt({ xPct, yPct });
  }, []);

  async function submitNote(text: string) {
    if (!inputAt) return;
    const payload = { text, ...inputAt };
    setInputAt(null);
    try { await postNote(payload); } catch (e) { console.error(e); alert("Failed to post. Check your WebSocket URL / server logs."); }
  }

  const embedUrl = useMemo(() => toEmbedUrl(streamUrl, typeof window !== 'undefined' ? window.location.hostname : ''), [streamUrl]);

  return (
    <div ref={containerRef} className="relative w-full h-[100dvh] overflow-hidden bg-black text-white" onClick={onBackgroundClick}>
      <ParticleField />

      {/* Floating notes */}
      <div className="absolute inset-0">
        <AnimatePresence>
          {notes.map((n) => {
            const age = nowMs - n.createdAt; const life = clamp01(1 - age / HOUR_MS); const scale = 0.9 + 0.2 * life; const opacity = 0.2 + 0.8 * life;
            return (
              <motion.div key={n.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity, scale }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: "spring", stiffness: 200, damping: 20 }} className="pointer-events-none select-none absolute font-semibold drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]" style={{ left: `${n.xPct}%`, top: `${n.yPct}%`, transform: "translate(-50%, -50%)" }}>
                <span className="px-3 py-2 rounded-2xl" style={{ background: "rgba(255,255,255,0.14)" }}>{n.text}</span>
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

      {/* Top HUD */}
      <div className="ui pointer-events-auto absolute top-0 left-0 right-0 p-3 flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/10">
          <div className={`size-2 rounded-full ${status === 'connected' ? 'bg-green-400' : status === 'connecting' ? 'bg-yellow-300' : 'bg-red-500'} animate-pulse`} />
          <div className="text-xs">Live Wall · last hour</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); setAdOpen(true); }} className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs">Trigger Ad 💸</button>
          <details className="[&_summary]:list-none">
            <summary className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-xs cursor-pointer">Setup ⚙️</summary>
            <div className="absolute right-3 mt-2 w-[min(92vw,36rem)]">
              <SetupPanel streamUrl={streamUrl} setStreamUrl={setStreamUrl} wsUrl={wsUrl} setWsUrl={setWsUrl} />
            </div>
          </details>
        </div>
      </div>

      {/* Livestream dock */}
      <div className="ui pointer-events-auto absolute bottom-3 right-3 w-[min(92vw,560px)] h-[315px] rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black/40 backdrop-blur">
        {embedUrl ? (
          <iframe title="Livestream" src={embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
        ) : (
          <div className="w-full h-full grid place-items-center text-center p-6 text-white/80">
            <div><div className="font-semibold">No stream yet</div><div className="text-sm mt-1">Open ⚙️ Setup and paste a YouTube/Twitch URL.</div></div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="ui pointer-events-none absolute bottom-3 left-3 text-xs text-white/70">Tip: click anywhere to drop a message. They fade after 1 hour.</div>

      {/* Pop‑up ads */}
      <AdModal open={adOpen} onClose={() => setAdOpen(false)} />
    </div>
  );
}