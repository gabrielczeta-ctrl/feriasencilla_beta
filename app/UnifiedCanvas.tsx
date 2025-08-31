"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';

// Unified canvas object types
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
  };
  data: any; // Object-specific data
}

export interface DrawingStroke {
  id: string;
  tool: 'pen' | 'brush' | 'eraser';
  color: string;
  size: number;
  points: Array<{ x: number; y: number }>; // Percentage coordinates
  timestamp: number;
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
  onDrawingStroke: (stroke: Omit<DrawingStroke, 'id' | 'timestamp'>) => void;
  onDrawingClear: () => void;
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
  onDrawingStroke,
  onDrawingClear
}: UnifiedCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number }>>([]);
  const [draggedObject, setDraggedObject] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // Collision detection between objects
  const checkCollisions = useCallback(() => {
    const collisions: Array<[CanvasObject, CanvasObject]> = [];
    
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        const obj1 = objects[i];
        const obj2 = objects[j];
        
        const dx = obj1.x - obj2.x;
        const dy = obj1.y - obj2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const minDistance = ((obj1.width || 10) + (obj2.width || 10)) / 4;
        
        if (distance < minDistance) {
          collisions.push([obj1, obj2]);
        }
      }
    }
    
    return collisions;
  }, [objects]);

  // Physics simulation
  const updatePhysics = useCallback(() => {
    const collisions = checkCollisions();
    
    // Handle collisions with elastic bouncing
    collisions.forEach(([obj1, obj2]) => {
      if (obj1.physics?.bouncing && obj2.physics?.bouncing) {
        const dx = obj1.x - obj2.x;
        const dy = obj1.y - obj2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
          const normalX = dx / distance;
          const normalY = dy / distance;
          
          // Simple elastic collision
          const relativeVelocityX = (obj1.physics.vx || 0) - (obj2.physics.vx || 0);
          const relativeVelocityY = (obj1.physics.vy || 0) - (obj2.physics.vy || 0);
          
          const impulse = 2 * (relativeVelocityX * normalX + relativeVelocityY * normalY) / 
            ((obj1.physics.mass || 1) + (obj2.physics.mass || 1));
          
          obj1.physics.vx -= impulse * (obj2.physics.mass || 1) * normalX;
          obj1.physics.vy -= impulse * (obj2.physics.mass || 1) * normalY;
          obj2.physics.vx += impulse * (obj1.physics.mass || 1) * normalX;
          obj2.physics.vy += impulse * (obj1.physics.mass || 1) * normalY;
        }
      }
    });
  }, [checkCollisions]);

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

    // Render drawing strokes
    strokes.forEach(stroke => {
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

    // Render objects
    objects.forEach(obj => {
      const canvasPos = percentToCanvas(obj.x, obj.y);
      const isSelected = selectedObjects.has(obj.id);
      
      ctx.save();
      
      // Selection highlight
      if (isSelected) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
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
          ctx.fillStyle = obj.physics?.bouncing ? '#fbbf24' : '#ffffff';
          ctx.strokeStyle = '#374151';
          ctx.lineWidth = 1;
          ctx.font = '14px sans-serif';
          
          const textWidth = ctx.measureText(obj.data.text).width + 16;
          const textHeight = 24;
          
          // Message bubble
          ctx.fillRect(canvasPos.x - textWidth/2, canvasPos.y - textHeight/2, textWidth, textHeight);
          ctx.strokeRect(canvasPos.x - textWidth/2, canvasPos.y - textHeight/2, textWidth, textHeight);
          
          // Text
          ctx.fillStyle = '#000000';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(obj.data.text, canvasPos.x, canvasPos.y);
          break;
          
        case 'image':
          // Placeholder for images
          ctx.fillStyle = '#e5e7eb';
          ctx.strokeStyle = '#9ca3af';
          ctx.lineWidth = 1;
          const imgWidth = (obj.width || 20) * width / 100;
          const imgHeight = (obj.height || 15) * height / 100;
          ctx.fillRect(canvasPos.x - imgWidth/2, canvasPos.y - imgHeight/2, imgWidth, imgHeight);
          ctx.strokeRect(canvasPos.x - imgWidth/2, canvasPos.y - imgHeight/2, imgWidth, imgHeight);
          
          ctx.fillStyle = '#6b7280';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '12px sans-serif';
          ctx.fillText('IMG', canvasPos.x, canvasPos.y);
          break;
      }
      
      ctx.restore();
    });

    animationRef.current = requestAnimationFrame(render);
  }, [objects, strokes, selectedObjects, currentStroke, drawingColor, brushSize, width, height, percentToCanvas]);

  // Mouse/touch event handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
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
      onDrawingStroke({
        tool: drawingTool,
        color: drawingColor,
        size: brushSize,
        points: currentStroke
      });
    }
    
    setIsDrawing(false);
    setCurrentStroke([]);
    setDraggedObject(null);
    setDragOffset({ x: 0, y: 0 });
  }, [isDrawing, currentStroke, drawingTool, drawingColor, brushSize, onDrawingStroke]);

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
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}