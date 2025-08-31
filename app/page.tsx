"use client";

import React, { useCallback, useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SuperPhysicsCanvas from './SuperPhysicsCanvas';
import { CanvasObject, DrawingStroke } from './UnifiedCanvasEnhanced';
import { useWSCanvas } from './useWSCanvas';

// --- Utils ---
const HOUR_MS = 60 * 60 * 1000;
function now() { return Date.now(); }

function useNow(tickMs = 10000) {
  const [t, setT] = useState(now());
  useEffect(() => { 
    const id = setInterval(() => setT(now()), tickMs); 
    return () => clearInterval(id); 
  }, [tickMs]);
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

// --- Main App Component ---
export default function PartyWallApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [streamUrl, setStreamUrl] = useState(() => 
    typeof window !== 'undefined' ? localStorage.getItem("partywall_stream_url") || "" : ""
  );
  const [wsUrl, setWsUrl] = useState(() => 
    typeof window !== 'undefined' ? 
      (process.env.NEXT_PUBLIC_WS_URL || localStorage.getItem("partywall_ws_url") || "") : 
      ""
  );
  
  // Canvas state
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingTool, setDrawingTool] = useState<'pen' | 'brush' | 'eraser' | 'message'>('pen');
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(3);
  const [selectedObjects, setSelectedObjects] = useState<Set<string>>(new Set());
  
  // UI state
  const [inputAt, setInputAt] = useState<{xPct: number; yPct: number} | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 800 });
  
  // WebSocket connection
  const { 
    notes, 
    strokes, 
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
    deleteObject
  } = useWSCanvas(wsUrl, HOUR_MS);

  // Handle window resize for responsive canvas
  useEffect(() => {
    const updateCanvasSize = () => {
      if (typeof window !== 'undefined') {
        const width = Math.min(window.innerWidth - 40, 1600);
        const height = Math.min(window.innerHeight - 200, 1000);
        setCanvasSize({ width, height });
      }
    };
    
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, []);

  // Save URLs to localStorage
  useEffect(() => { 
    if (typeof window !== 'undefined') 
      localStorage.setItem("partywall_stream_url", streamUrl); 
  }, [streamUrl]);
  
  useEffect(() => { 
    if (wsUrl && typeof window !== 'undefined') 
      localStorage.setItem("partywall_ws_url", wsUrl); 
  }, [wsUrl]);

  // Handle canvas interactions
  const handleObjectMove = useCallback((objectId: string, x: number, y: number) => {
    moveObject(objectId, x, y);
  }, [moveObject]);

  const handleObjectSelect = useCallback((objectId: string, ctrlKey: boolean) => {
    setSelectedObjects(prev => {
      const newSet = new Set(prev);
      if (ctrlKey) {
        if (newSet.has(objectId)) {
          newSet.delete(objectId);
        } else {
          newSet.add(objectId);
        }
      } else {
        newSet.clear();
        newSet.add(objectId);
      }
      return newSet;
    });
  }, []);

  const handleDrawingStroke = useCallback(async (stroke: Omit<DrawingStroke, 'id' | 'timestamp'>) => {
    try {
      await sendDrawingStroke(stroke);
    } catch (error) {
      console.error("Failed to send drawing stroke:", error);
    }
  }, [sendDrawingStroke]);

  const handleDrawingClear = useCallback(async () => {
    try {
      await clearDrawing();
    } catch (error) {
      console.error("Failed to clear drawing:", error);
    }
  }, [clearDrawing]);

  // Handle object updates
  const handleObjectUpdate = useCallback(async (objectId: string, updates: Partial<CanvasObject>) => {
    try {
      await updateObject(objectId, updates);
    } catch (error) {
      console.error("Failed to update object:", error);
    }
  }, [updateObject]);

  // Handle object throwing
  const handleThrowObject = useCallback(async (objectId: string, vx: number, vy: number) => {
    try {
      await throwObject(objectId, vx, vy);
    } catch (error) {
      console.error("Failed to throw object:", error);
    }
  }, [throwObject]);

  // Handle object deletion
  const handleObjectDelete = useCallback(async (objectId: string) => {
    try {
      await deleteObject(objectId);
    } catch (error) {
      console.error("Failed to delete object:", error);
    }
  }, [deleteObject]);

  // Handle background clicks for message input
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (drawingMode || inputAt) return;
    
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    
    setInputAt({ 
      xPct: Math.max(0, Math.min(100, xPct)), 
      yPct: Math.max(0, Math.min(100, yPct)) 
    });
  }, [drawingMode, inputAt]);

  // Handle input submission
  const handleInputSubmit = useCallback(async (text: string) => {
    if (!inputAt) return;
    
    try {
      await postNote({
        text: text.trim(),
        xPct: inputAt.xPct,
        yPct: inputAt.yPct
      });
      setInputAt(null);
    } catch (error) {
      console.error("Failed to post note:", error);
      alert("Failed to post message!");
    }
  }, [inputAt, postNote]);

  // Drawing tools
  const drawingTools = [
    { id: 'pen', name: 'Pen', icon: '✏️' },
    { id: 'brush', name: 'Brush', icon: '🖌️' },
    { id: 'eraser', name: 'Eraser', icon: '🧽' },
    { id: 'message', name: 'Message Box', icon: '💬' },
    { id: 'marker', name: 'Marker', icon: '🖍️' }
  ];

  const colorPresets = ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/20 backdrop-blur p-4 border-b border-white/10">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold">🎪 Party Wall</h1>
          
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${
              status === 'connected' ? 'bg-green-500' : 
              status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
            }`} />
            
            <button
              onClick={() => setDrawingMode(!drawingMode)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                drawingMode ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'
              }`}
            >
              {drawingMode ? '📝 Exit Draw' : '🎨 Draw'}
            </button>
            
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              ⚙️
            </button>
          </div>
        </div>
      </div>

      {/* Main Canvas Container */}
      <div className="pt-20 p-4">
        <div 
          ref={containerRef}
          className="relative mx-auto border border-white/20 rounded-lg overflow-hidden"
          style={{ width: canvasSize.width, height: canvasSize.height }}
          onClick={handleBackgroundClick}
        >
          <SuperPhysicsCanvas
            width={canvasSize.width}
            height={canvasSize.height}
            objects={canvasObjects}
            strokes={strokes}
            selectedObjects={selectedObjects}
            drawingMode={drawingMode}
            drawingTool={drawingTool}
            drawingColor={drawingColor}
            brushSize={brushSize}
            onObjectMove={handleObjectMove}
            onObjectSelect={handleObjectSelect}
            onObjectUpdate={handleObjectUpdate}
            onObjectDelete={handleObjectDelete}
            onDrawingStroke={handleDrawingStroke}
            onDrawingClear={handleDrawingClear}
            onThrowObject={handleThrowObject}
          />
        </div>
      </div>

      {/* Drawing Tools Panel */}
      {drawingMode && (
        <motion.div
          initial={{ x: -300 }}
          animate={{ x: 0 }}
          exit={{ x: -300 }}
          className="fixed left-4 top-32 bg-black/80 backdrop-blur rounded-lg p-4 space-y-4"
        >
          <h3 className="font-semibold">Drawing Tools</h3>
          
          {/* Tool Selection */}
          <div className="space-y-2">
            {drawingTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => setDrawingTool(tool.id as any)}
                className={`w-full p-2 rounded text-left transition-colors ${
                  drawingTool === tool.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {tool.icon} {tool.name}
              </button>
            ))}
          </div>
          
          {/* Color Picker */}
          <div>
            <label className="block text-sm mb-1">Color</label>
            <input
              type="color"
              value={drawingColor}
              onChange={(e) => setDrawingColor(e.target.value)}
              className="w-full h-10 rounded cursor-pointer"
            />
            <div className="flex gap-1 mt-2">
              {colorPresets.map((color) => (
                <button
                  key={color}
                  onClick={() => setDrawingColor(color)}
                  className="w-6 h-6 rounded border border-white/20"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          
          {/* Brush Size */}
          <div>
            <label className="block text-sm mb-1">Size: {brushSize}px</label>
            <input
              type="range"
              min="1"
              max="20"
              value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Clear Button */}
          <button
            onClick={handleDrawingClear}
            className="w-full p-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
          >
            🗑️ Clear All Drawings
          </button>
        </motion.div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <motion.div
          initial={{ x: 300 }}
          animate={{ x: 0 }}
          exit={{ x: 300 }}
          className="fixed right-4 top-32 bg-black/80 backdrop-blur rounded-lg p-4 space-y-4 w-80"
        >
          <h3 className="font-semibold">Settings</h3>
          
          <div>
            <label className="block text-sm mb-1">WebSocket URL</label>
            <input
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              className="w-full p-2 rounded bg-gray-800 border border-gray-600"
              placeholder="ws://localhost:8080/ws"
            />
          </div>
          
          <div>
            <label className="block text-sm mb-1">Stream URL</label>
            <input
              type="text"
              value={streamUrl}
              onChange={(e) => setStreamUrl(e.target.value)}
              className="w-full p-2 rounded bg-gray-800 border border-gray-600"
              placeholder="YouTube/Twitch URL"
            />
            {streamUrl && (
              <button
                onClick={() => updateVideo(streamUrl)}
                className="mt-2 w-full p-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors"
              >
                📺 Sync Video
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* Stream Embed */}
      {(currentVideo || streamUrl) && (
        <div className="fixed bottom-4 right-4 w-80 h-48 bg-black rounded-lg overflow-hidden">
          <iframe
            src={toEmbedUrl(currentVideo || streamUrl)}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* Input Bubble */}
      {inputAt && (
        <InputBubble
          xPct={inputAt.xPct}
          yPct={inputAt.yPct}
          onSubmit={handleInputSubmit}
          onCancel={() => setInputAt(null)}
        />
      )}

      {/* Status Bar */}
      <div className="fixed bottom-4 left-4 bg-black/80 backdrop-blur rounded-lg p-2 text-sm">
        Objects: {canvasObjects.length} | Strokes: {strokes.length} | Status: {status}
      </div>
    </div>
  );
}

// --- Input Bubble Component ---
interface InputBubbleProps {
  xPct: number;
  yPct: number;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

function InputBubble({ xPct, yPct, onSubmit, onCancel }: InputBubbleProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => { 
    inputRef.current?.focus(); 
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  };

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="fixed z-40 pointer-events-none"
      style={{ 
        left: `${xPct}%`, 
        top: `${yPct}%`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <form onSubmit={handleSubmit} className="pointer-events-auto">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={onCancel}
          className="bg-white text-black px-3 py-2 rounded-lg shadow-lg border-2 border-blue-400 text-sm min-w-32"
          placeholder="Type message..."
          maxLength={140}
        />
      </form>
    </motion.div>
  );
}