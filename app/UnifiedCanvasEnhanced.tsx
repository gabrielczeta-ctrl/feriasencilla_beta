"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';

// Enhanced canvas object types
export interface CanvasObject {
  id: string;
  type: 'message' | 'drawing' | 'image' | 'embedding';
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  width?: number;
  height?: number;
  physics?: {
    vx: number;
    vy: number;
    bouncing: boolean;
    mass: number;
    friction: number;
    restitution: number; // Bounciness factor (0-1)
  };
  data: any; // Object-specific data
  createdAt?: number;
  expireAt?: number;
}

export interface DrawingStroke {
  id: string;
  tool: 'pen' | 'brush' | 'eraser';
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>; // Percentage coordinates
  timestamp: number;
  expireAt?: number;
  bounds?: { // Collision bounds for the stroke
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface ContextMenu {
  x: number;
  y: number;
  objectId: string;
  objectType: 'message' | 'drawing' | 'image' | 'embedding' | 'stroke';
}

interface UnifiedCanvasProps {
  width: number;
  height: number;
  objects: CanvasObject[];
  strokes: DrawingStroke[];
  selectedObjects: Set<string>;
  drawingMode: boolean;
  drawingTool: 'pen' | 'brush' | 'eraser';
  drawingColor: string;
  brushSize: number;
  onObjectMove: (id: string, x: number, y: number) => void;
  onObjectSelect: (id: string, ctrlKey: boolean) => void;
  onObjectUpdate: (id: string, updates: Partial<CanvasObject>) => void;
  onObjectDelete: (id: string) => void;
  onDrawingStroke: (stroke: Omit<DrawingStroke, 'id' | 'timestamp'>) => void;
  onDrawingClear: () => void;
  onThrowObject: (id: string, vx: number, vy: number) => void;
}

export function UnifiedCanvas({
  width,
  height,
  objects,
  strokes,
  selectedObjects,
  drawingMode,
  drawingTool,
  drawingColor,
  brushSize,
  onObjectMove,
  onObjectSelect,
  onObjectUpdate,
  onObjectDelete,
  onDrawingStroke,
  onDrawingClear,
  onThrowObject
}: UnifiedCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number }>>([]);
  
  // Interaction state
  const [draggedObject, setDraggedObject] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [dragStartTime, setDragStartTime] = useState<number>(0);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  
  // Physics constants
  const GRAVITY = 0.2;
  const FRICTION = 0.98;
  const BOUNDARY_RESTITUTION = 0.7;
  const MIN_VELOCITY = 0.1;

  // Convert screen coordinates to percentage coordinates
  const screenToPercent = useCallback((screenX: number, screenY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const x = ((screenX - rect.left) / rect.width) * 100;
    const y = ((screenY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }, []);

  // Convert percentage coordinates to canvas coordinates
  const percentToCanvas = useCallback((percentX: number, percentY: number) => {
    return {
      x: (percentX / 100) * width,
      y: (percentY / 100) * height
    };
  }, [width, height]);

  // Calculate stroke bounds for collision detection
  const calculateStrokeBounds = useCallback((points: Array<{ x: number; y: number }>, strokeSize: number): DrawingStroke['bounds'] => {
    if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    
    const padding = strokeSize / 2;
    const minX = Math.min(...points.map(p => p.x)) - padding;
    const minY = Math.min(...points.map(p => p.y)) - padding;
    const maxX = Math.max(...points.map(p => p.x)) + padding;
    const maxY = Math.max(...points.map(p => p.y)) + padding;
    
    return { minX, minY, maxX, maxY };
  }, []);

  // Find object at given coordinates
  const findObjectAt = useCallback((x: number, y: number): CanvasObject | null => {
    // Check objects in reverse order (top to bottom)
    for (let i = objects.length - 1; i >= 0; i--) {
      const obj = objects[i];
      const objWidth = obj.width || 10;
      const objHeight = obj.height || 5;
      
      if (x >= obj.x - objWidth/2 && x <= obj.x + objWidth/2 &&
          y >= obj.y - objHeight/2 && y <= obj.y + objHeight/2) {
        return obj;
      }
    }
    return null;
  }, [objects]);

  // Check collision between object and stroke
  const checkStrokeCollision = useCallback((obj: CanvasObject, stroke: DrawingStroke): boolean => {
    if (!stroke.bounds) return false;
    
    const objWidth = obj.width || 10;
    const objHeight = obj.height || 5;
    
    const objLeft = obj.x - objWidth/2;
    const objRight = obj.x + objWidth/2;
    const objTop = obj.y - objHeight/2;
    const objBottom = obj.y + objHeight/2;
    
    return !(objRight < stroke.bounds.minX || 
             objLeft > stroke.bounds.maxX || 
             objBottom < stroke.bounds.minY || 
             objTop > stroke.bounds.maxY);
  }, []);

  // Boundary collision detection and response
  const handleBoundaryCollision = useCallback((obj: CanvasObject): Partial<CanvasObject> => {
    if (!obj.physics?.bouncing) return {};
    
    const objWidth = obj.width || 10;
    const objHeight = obj.height || 5;
    const updates: Partial<CanvasObject> = {};
    
    let { x, y } = obj;
    let { vx, vy } = obj.physics;
    
    // Left/Right boundaries
    if (x - objWidth/2 <= 0) {
      x = objWidth/2;
      vx = Math.abs(vx) * BOUNDARY_RESTITUTION;
    } else if (x + objWidth/2 >= 100) {
      x = 100 - objWidth/2;
      vx = -Math.abs(vx) * BOUNDARY_RESTITUTION;
    }
    
    // Top/Bottom boundaries  
    if (y - objHeight/2 <= 0) {
      y = objHeight/2;
      vy = Math.abs(vy) * BOUNDARY_RESTITUTION;
    } else if (y + objHeight/2 >= 100) {
      y = 100 - objHeight/2;
      vy = -Math.abs(vy) * BOUNDARY_RESTITUTION;
    }
    
    // Apply friction
    vx *= obj.physics.friction;
    vy *= obj.physics.friction;
    
    // Stop if velocity is too small
    if (Math.abs(vx) < MIN_VELOCITY && Math.abs(vy) < MIN_VELOCITY) {
      vx = 0;
      vy = 0;
      updates.physics = { ...obj.physics, bouncing: false, vx: 0, vy: 0 };
    } else {
      updates.physics = { ...obj.physics, vx, vy };
    }
    
    if (x !== obj.x || y !== obj.y) {
      updates.x = x;
      updates.y = y;
    }
    
    return updates;
  }, []);

  // Physics simulation
  const updatePhysics = useCallback(() => {
    objects.forEach(obj => {
      if (obj.physics?.bouncing) {
        const updates = handleBoundaryCollision(obj);
        
        // Check stroke collisions
        strokes.forEach(stroke => {
          if (checkStrokeCollision(obj, stroke) && obj.physics) {
            // Simple collision response - reverse velocity and apply restitution
            const newVx = -obj.physics.vx * obj.physics.restitution;
            const newVy = -obj.physics.vy * obj.physics.restitution;
            
            updates.physics = { 
              ...obj.physics, 
              vx: newVx, 
              vy: newVy 
            };
          }
        });
        
        if (Object.keys(updates).length > 0) {
          onObjectUpdate(obj.id, updates);
        }
      }
    });
  }, [objects, strokes, checkStrokeCollision, handleBoundaryCollision, onObjectUpdate]);

  // Render all canvas content
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!canvas || !overlayCanvas) return;

    const ctx = canvas.getContext('2d');
    const overlayCtx = overlayCanvas.getContext('2d');
    if (!ctx || !overlayCtx) return;

    // Clear canvases
    ctx.clearRect(0, 0, width, height);
    overlayCtx.clearRect(0, 0, width, height);

    // Set canvas dimensions and scaling
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    overlayCanvas.width = width * ratio;
    overlayCanvas.height = height * ratio;
    
    ctx.scale(ratio, ratio);
    overlayCtx.scale(ratio, ratio);

    // Filter expired strokes
    const now = Date.now();
    const validStrokes = strokes.filter(stroke => !stroke.expireAt || stroke.expireAt > now);

    // Render drawing strokes
    validStrokes.forEach(stroke => {
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (stroke.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      }
      
      if (stroke.points.length > 1) {
        ctx.beginPath();
        const startPoint = percentToCanvas(stroke.points[0].x, stroke.points[0].y);
        ctx.moveTo(startPoint.x, startPoint.y);
        
        for (let i = 1; i < stroke.points.length; i++) {
          const point = percentToCanvas(stroke.points[i].x, stroke.points[i].y);
          ctx.lineTo(point.x, point.y);
        }
        ctx.stroke();
      }
      
      ctx.restore();
    });

    // Render current drawing stroke
    if (currentStroke.length > 1) {
      overlayCtx.save();
      overlayCtx.strokeStyle = drawingColor;
      overlayCtx.lineWidth = brushSize;
      overlayCtx.lineCap = 'round';
      overlayCtx.lineJoin = 'round';
      
      overlayCtx.beginPath();
      const startPoint = percentToCanvas(currentStroke[0].x, currentStroke[0].y);
      overlayCtx.moveTo(startPoint.x, startPoint.y);
      
      for (let i = 1; i < currentStroke.length; i++) {
        const point = percentToCanvas(currentStroke[i].x, currentStroke[i].y);
        overlayCtx.lineTo(point.x, point.y);
      }
      overlayCtx.stroke();
      overlayCtx.restore();
    }

    // Filter expired objects
    const validObjects = objects.filter(obj => !obj.expireAt || obj.expireAt > now);

    // Render objects
    validObjects.forEach(obj => {
      const canvasPos = percentToCanvas(obj.x, obj.y);
      const isSelected = selectedObjects.has(obj.id);
      
      ctx.save();
      
      // Physics glow effect
      if (obj.physics?.bouncing) {
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 10;
      }
      
      // Selection highlight
      if (isSelected) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        const objWidth = (obj.width || 10) * width / 100;
        const objHeight = (obj.height || 5) * height / 100;
        ctx.strokeRect(
          canvasPos.x - objWidth/2, 
          canvasPos.y - objHeight/2, 
          objWidth, 
          objHeight
        );
      }
      
      // Render based on object type
      switch (obj.type) {
        case 'message':
          ctx.fillStyle = obj.physics?.bouncing ? '#fef3c7' : '#ffffff';
          ctx.strokeStyle = '#374151';
          ctx.lineWidth = 1;
          ctx.font = 'bold 14px sans-serif';
          
          const text = obj.data.text || '';
          const textMetrics = ctx.measureText(text);
          const textWidth = textMetrics.width + 16;
          const textHeight = 28;
          
          // Update object dimensions
          if (obj.width !== textWidth * 100 / width || obj.height !== textHeight * 100 / height) {
            onObjectUpdate(obj.id, {
              width: textWidth * 100 / width,
              height: textHeight * 100 / height
            });
          }
          
          // Message bubble with rounded corners
          const radius = 8;
          ctx.beginPath();
          ctx.roundRect(canvasPos.x - textWidth/2, canvasPos.y - textHeight/2, textWidth, textHeight, radius);
          ctx.fill();
          ctx.stroke();
          
          // Text
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, canvasPos.x, canvasPos.y);
          break;
          
        case 'image':
          // Placeholder for images
          ctx.fillStyle = '#e5e7eb';
          ctx.strokeStyle = '#9ca3af';
          ctx.lineWidth = 2;
          const imgWidth = (obj.width || 20) * width / 100;
          const imgHeight = (obj.height || 15) * height / 100;
          
          ctx.beginPath();
          ctx.roundRect(canvasPos.x - imgWidth/2, canvasPos.y - imgHeight/2, imgWidth, imgHeight, 4);
          ctx.fill();
          ctx.stroke();
          
          ctx.fillStyle = '#6b7280';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('🖼️', canvasPos.x, canvasPos.y);
          break;
      }
      
      ctx.restore();
    });

    animationRef.current = requestAnimationFrame(render);
  }, [objects, strokes, selectedObjects, currentStroke, drawingColor, brushSize, width, height, percentToCanvas, onObjectUpdate]);

  // Mouse/touch event handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setContextMenu(null); // Close context menu
    
    const { x, y } = screenToPercent(e.clientX, e.clientY);
    
    if (drawingMode) {
      setIsDrawing(true);
      setCurrentStroke([{ x, y }]);
    } else {
      const clickedObject = findObjectAt(x, y);
      
      if (clickedObject) {
        // Handle object selection and dragging
        onObjectSelect(clickedObject.id, e.ctrlKey);
        
        if (!e.ctrlKey) {
          setDraggedObject(clickedObject.id);
          setDragOffset({
            x: x - clickedObject.x,
            y: y - clickedObject.y
          });
          setDragStartPos({ x: clickedObject.x, y: clickedObject.y });
          setDragStartTime(Date.now());
        }
      }
    }
  }, [drawingMode, screenToPercent, findObjectAt, onObjectSelect]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const { x, y } = screenToPercent(e.clientX, e.clientY);
    
    if (isDrawing && drawingMode) {
      setCurrentStroke(prev => [...prev, { x, y }]);
    } else if (draggedObject) {
      const newX = Math.max(0, Math.min(100, x - dragOffset.x));
      const newY = Math.max(0, Math.min(100, y - dragOffset.y));
      onObjectMove(draggedObject, newX, newY);
    }
  }, [isDrawing, drawingMode, draggedObject, dragOffset, screenToPercent, onObjectMove]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    
    if (isDrawing && currentStroke.length > 1) {
      // Calculate stroke bounds for collision detection
      const bounds = calculateStrokeBounds(currentStroke, brushSize);
      const now = Date.now();
      
      onDrawingStroke({
        tool: drawingTool,
        color: drawingColor,
        size: brushSize,
        points: currentStroke,
        bounds,
        expireAt: now + (60 * 60 * 1000) // 1 hour expiration
      });
    }
    
    // Handle object throwing physics
    if (draggedObject && dragStartPos && dragStartTime) {
      const obj = objects.find(o => o.id === draggedObject);
      if (obj) {
        const dragTime = Date.now() - dragStartTime;
        const dragDistance = Math.sqrt(
          Math.pow(obj.x - dragStartPos.x, 2) + 
          Math.pow(obj.y - dragStartPos.y, 2)
        );
        
        // Calculate throw velocity based on drag speed
        if (dragTime > 0 && dragDistance > 1) {
          const speed = Math.min(dragDistance / dragTime * 10, 5); // Cap speed
          const angle = Math.atan2(obj.y - dragStartPos.y, obj.x - dragStartPos.x);
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          
          onThrowObject(draggedObject, vx, vy);
        }
      }
    }
    
    setIsDrawing(false);
    setCurrentStroke([]);
    setDraggedObject(null);
    setDragOffset({ x: 0, y: 0 });
    setDragStartPos(null);
    setDragStartTime(0);
  }, [isDrawing, currentStroke, drawingTool, drawingColor, brushSize, draggedObject, dragStartPos, dragStartTime, objects, calculateStrokeBounds, onDrawingStroke, onThrowObject]);

  // Right-click context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = screenToPercent(e.clientX, e.clientY);
    const clickedObject = findObjectAt(x, y);
    
    if (clickedObject) {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        objectId: clickedObject.id,
        objectType: clickedObject.type
      });
    } else {
      setContextMenu(null);
    }
  }, [screenToPercent, findObjectAt]);

  // Initialize canvas and start render loop
  useEffect(() => {
    if (canvasRef.current) {
      animationRef.current = requestAnimationFrame(render);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [render]);

  // Physics update loop
  useEffect(() => {
    const interval = setInterval(() => {
      updatePhysics();
    }, 16); // ~60 FPS
    
    return () => clearInterval(interval);
  }, [updatePhysics]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div 
      className="relative"
      style={{ width, height }}
    >
      {/* Main drawing canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ 
          width: `${width}px`, 
          height: `${height}px`,
          cursor: drawingMode ? 'crosshair' : 'default'
        }}
      />
      
      {/* Overlay canvas for current drawing stroke */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ 
          width: `${width}px`, 
          height: `${height}px`
        }}
      />
      
      {/* Interactive overlay for mouse events */}
      <div
        className="absolute inset-0 w-full h-full"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onContextMenu={handleContextMenu}
        style={{ touchAction: 'none' }}
      />
      
      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-2 min-w-48"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            transform: 'translate(-10px, -10px)'
          }}
        >
          <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700">
            {contextMenu.objectType.charAt(0).toUpperCase() + contextMenu.objectType.slice(1)} Options
          </div>
          
          <button
            onClick={() => {
              const obj = objects.find(o => o.id === contextMenu.objectId);
              const currentBouncing = obj?.physics?.bouncing || false;
              onObjectUpdate(contextMenu.objectId, {
                physics: {
                  vx: 0,
                  vy: 0,
                  bouncing: !currentBouncing,
                  mass: 1,
                  friction: 0.98,
                  restitution: 0.7
                }
              });
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left hover:bg-gray-800 text-white"
          >
            🎈 Toggle Physics
          </button>
          
          <button
            onClick={() => {
              onThrowObject(contextMenu.objectId, 
                (Math.random() - 0.5) * 8, 
                (Math.random() - 0.5) * 8
              );
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left hover:bg-gray-800 text-white"
          >
            🚀 Random Throw
          </button>
          
          <button
            onClick={() => {
              onObjectDelete(contextMenu.objectId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left hover:bg-red-800 text-red-300"
          >
            🗑️ Delete
          </button>
          
          <button
            onClick={() => {
              navigator.clipboard?.writeText(contextMenu.objectId);
              setContextMenu(null);
            }}
            className="w-full px-3 py-2 text-left hover:bg-gray-800 text-white"
          >
            📋 Copy ID
          </button>
        </div>
      )}
    </div>
  );
}