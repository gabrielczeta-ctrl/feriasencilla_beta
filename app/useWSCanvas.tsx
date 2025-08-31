"use client";

import { useState, useRef, useEffect, useMemo } from 'react';
import { CanvasObject, DrawingStroke } from './UnifiedCanvasEnhanced';

const HOUR_MS = 60 * 60 * 1000;

interface Note {
  id: string;
  text: string;
  xPct: number;
  yPct: number;
  createdAt: number;
  expireAt?: number;
  imageData?: string;
  physics?: {
    vx: number;
    vy: number;
    bouncing: boolean;
    mass: number;
    friction: number;
    restitution: number;
  };
}

export function useWSCanvas(wsUrl: string, ttlMs = HOUR_MS) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [currentVideo, setCurrentVideo] = useState<string>("");
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  
  // Convert notes to canvas objects
  const canvasObjects: CanvasObject[] = useMemo(() => {
    return notes.map(note => ({
      id: note.id,
      type: 'message' as const,
      x: note.xPct,
      y: note.yPct,
      width: 15, // Approximate width percentage
      height: 8,  // Approximate height percentage
      physics: note.physics || undefined, // Include physics properties from notes
      data: { text: note.text, imageData: note.imageData },
      createdAt: note.createdAt,
      expireAt: note.expireAt
    }));
  }, [notes]);

  useEffect(() => {
    if (!wsUrl) return;
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
          
          // Handle existing message types
          if (msg.type === "state" && Array.isArray(msg.notes)) {
            setNotes(msg.notes);
            if (msg.currentVideo && msg.currentVideo.url) {
              setCurrentVideo(msg.currentVideo.url);
            }
            if (Array.isArray(msg.strokes)) {
              setStrokes(msg.strokes);
            }
          } else if (msg.type === "new" && msg.note) {
            setNotes((prev) => {
              const exists = prev.some((n) => n.id === msg.note.id);
              return exists ? prev : [msg.note, ...prev];
            });
          } else if (msg.type === "video" && msg.url) {
            setCurrentVideo(msg.url);
          } else if (msg.type === "move" && msg.noteId) {
            setNotes(prev => prev.map(note => 
              note.id === msg.noteId 
                ? { ...note, xPct: msg.xPct, yPct: msg.yPct }
                : note
            ));
          }
          // Handle new drawing types
          else if (msg.type === "drawing_stroke" && msg.stroke) {
            setStrokes(prev => [...prev, msg.stroke]);
          } else if (msg.type === "drawing_clear") {
            setStrokes([]);
          }
          // Handle object updates
          else if (msg.type === "object_update" && msg.objectId && msg.updates) {
            setNotes(prev => prev.map(note => 
              note.id === msg.objectId 
                ? { ...note, ...msg.updates }
                : note
            ));
          }
          // Handle object physics throwing
          else if (msg.type === "object_throw" && msg.objectId) {
            setNotes(prev => prev.map(note => 
              note.id === msg.objectId 
                ? { 
                    ...note, 
                    physics: {
                      vx: msg.vx || 0,
                      vy: msg.vy || 0,
                      bouncing: true,
                      mass: 1,
                      friction: 0.98,
                      restitution: 0.7
                    }
                  }
                : note
            ));
          }
          // Handle object deletion
          else if (msg.type === "object_delete" && msg.objectId) {
            setNotes(prev => prev.filter(note => note.id !== msg.objectId));
          }
        } catch (error) {
          console.warn("Failed to parse WebSocket message:", error);
        }
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
    return () => { 
      closed = true; 
      try { wsRef.current?.close(); } catch {} 
    };
  }, [wsUrl]);

  // Client-side prune for display
  const freshNotes = useMemo(() => {
    const cutoff = Date.now() - ttlMs;
    return notes.filter((n) => (n.createdAt ?? 0) >= cutoff);
  }, [notes, ttlMs]);

  // Prune old strokes (keep last 1000 strokes to prevent memory bloat)
  const freshStrokes = useMemo(() => {
    return strokes.slice(-1000);
  }, [strokes]);

  // API functions
  async function postNote({ text, xPct, yPct, imageData }: { 
    text: string; 
    xPct: number; 
    yPct: number; 
    imageData?: string;
  }) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) throw new Error("WebSocket not connected");
    ws.send(JSON.stringify({ 
      type: "post", 
      note: { text, xPct, yPct, imageData } 
    }));
  }

  async function sendDrawingStroke(stroke: Omit<DrawingStroke, 'id' | 'timestamp'>) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) throw new Error("WebSocket not connected");
    ws.send(JSON.stringify({ 
      type: "drawing_stroke", 
      stroke 
    }));
  }

  async function clearDrawing() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) throw new Error("WebSocket not connected");
    ws.send(JSON.stringify({ type: "drawing_clear" }));
  }

  async function updateVideo(url: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) {
      console.warn("🚫 WebSocket not connected, cannot sync video");
      return;
    }
    ws.send(JSON.stringify({ type: "video", url }));
  }

  async function moveObject(objectId: string, xPct: number, yPct: number) {
    // Find if this is a note
    const note = notes.find(n => n.id === objectId);
    if (note) {
      // Update locally first for immediate feedback
      setNotes(prev => prev.map(n => 
        n.id === objectId ? { ...n, xPct, yPct } : n
      ));
      
      // Then sync to server
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ 
          type: "move", 
          noteId: objectId, 
          xPct, 
          yPct 
        }));
      }
    }
  }

  async function updateObject(objectId: string, updates: Partial<CanvasObject>) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) throw new Error("WebSocket not connected");
    
    // Update locally first for immediate feedback
    setNotes(prev => prev.map(n => 
      n.id === objectId ? { ...n, ...updates } : n
    ));
    
    // Then sync to server
    ws.send(JSON.stringify({ 
      type: "object_update", 
      objectId, 
      updates 
    }));
  }

  async function throwObject(objectId: string, vx: number, vy: number) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) throw new Error("WebSocket not connected");
    
    ws.send(JSON.stringify({ 
      type: "object_throw", 
      objectId, 
      vx, 
      vy 
    }));
  }

  async function deleteObject(objectId: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) throw new Error("WebSocket not connected");
    
    // Update locally first for immediate feedback
    setNotes(prev => prev.filter(n => n.id !== objectId));
    
    // Then sync to server
    ws.send(JSON.stringify({ 
      type: "object_delete", 
      objectId 
    }));
  }

  return {
    notes: freshNotes,
    strokes: freshStrokes,
    canvasObjects,
    currentVideo,
    status,
    postNote,
    sendDrawingStroke,
    clearDrawing,
    updateVideo,
    moveObject,
    updateObject,
    throwObject,
    deleteObject,
    wsRef
  };
}