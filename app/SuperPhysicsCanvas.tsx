"use client";

import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { WebPhysicsEngine, PhysicsBody, Collision } from './components/WebPhysicsEngine';
import { WebParticleSystem } from './components/WebParticleSystem';

// Enhanced canvas object types with Love2D-inspired physics
export interface CanvasObject {
  id: string;
  type: 'message' | 'drawing' | 'image' | 'embedding';
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  width?: number;
  height?: number;
  rotation?: number;
  physics?: {
    vx: number;
    vy: number;
    bouncing: boolean;
    mass: number;
    friction: number;
    restitution: number; // Bounciness factor (0-1)
    angularVelocity?: number;
  };
  data: any; // Object-specific data
  createdAt?: number;
  expireAt?: number;
}

export interface DrawingStroke {
  id: string;
  tool: 'pen' | 'brush' | 'eraser' | 'message' | 'marker';
  color: string;
  size: number;
  points: Array<{ x: number; y: number; pressure?: number }>; // Percentage coordinates
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

// Web Audio System for spatial sound effects
class WebAudioSystem {
  private audioContext: AudioContext | null = null;
  private sounds: Map<string, AudioBuffer> = new Map();
  private masterVolume = 0.7;

  constructor() {
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.generateSounds();
    }
  }

  private generateSounds(): void {
    if (!this.audioContext) return;

    const generateTone = (frequency: number, duration: number, type: OscillatorType = 'sine'): AudioBuffer => {
      const sampleRate = this.audioContext!.sampleRate;
      const length = duration * sampleRate;
      const buffer = this.audioContext!.createBuffer(1, length, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        let sample = 0;
        
        if (type === 'sine') {
          sample = Math.sin(2 * Math.PI * frequency * t);
        } else if (type === 'square') {
          sample = Math.sin(2 * Math.PI * frequency * t) > 0 ? 1 : -1;
        } else if (type === 'sawtooth') {
          sample = 2 * (t * frequency - Math.floor(0.5 + t * frequency));
        }
        
        // Apply fade out envelope
        const envelope = Math.exp(-t * 4);
        sample *= envelope;
        data[i] = sample * 0.2;
      }

      return buffer;
    };

    // Generate Love2D-inspired sound effects
    this.sounds.set('bounce', generateTone(440, 0.3, 'sine'));
    this.sounds.set('collision', generateTone(220, 0.4, 'square'));
    this.sounds.set('throw', generateTone(880, 0.15, 'sine'));
    this.sounds.set('drawPen', generateTone(660, 0.1, 'sine'));
    this.sounds.set('drawBrush', generateTone(550, 0.12, 'sawtooth'));
    this.sounds.set('message', generateTone(770, 0.25, 'sine'));
    this.sounds.set('erase', generateTone(330, 0.15, 'square'));
  }

  playSound(soundName: string, x?: number, y?: number, velocity?: number): void {
    if (!this.audioContext || !this.sounds.has(soundName)) return;

    const buffer = this.sounds.get(soundName)!;
    const source = this.audioContext.createBufferSource();
    const gainNode = this.audioContext.createGain();
    const pannerNode = this.audioContext.createStereoPanner();

    source.buffer = buffer;
    
    // Calculate spatial audio if position provided
    let volume = this.masterVolume;
    let pan = 0;
    
    if (x !== undefined && y !== undefined) {
      // Simple spatial audio based on screen position
      pan = (x - 50) / 50; // -1 to 1 based on screen percentage
      pan = Math.max(-1, Math.min(1, pan));
    }
    
    if (velocity !== undefined) {
      // Scale volume by velocity
      volume *= Math.min(1.5, Math.max(0.3, velocity / 200));
    }

    gainNode.gain.value = volume;
    pannerNode.pan.value = pan;

    source.connect(gainNode);
    gainNode.connect(pannerNode);
    pannerNode.connect(this.audioContext.destination);
    source.start();
  }

  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }
}

interface SuperPhysicsCanvasProps {
  width: number;
  height: number;
  objects: CanvasObject[];
  strokes: DrawingStroke[];
  selectedObjects: Set<string>;
  drawingMode: boolean;
  drawingTool: 'pen' | 'brush' | 'eraser' | 'message' | 'marker';
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

export default function SuperPhysicsCanvas({
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
}: SuperPhysicsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const physicsEngineRef = useRef<WebPhysicsEngine | null>(null);
  const particleSystemRef = useRef<WebParticleSystem | null>(null);
  const audioSystemRef = useRef<WebAudioSystem | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  
  // Enhanced interaction state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number; pressure?: number }>>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragObject, setDragObject] = useState<{ objectId: string; offsetX: number; offsetY: number } | null>(null);
  const [isThrowMode, setIsThrowMode] = useState(false);
  const [throwStart, setThrowStart] = useState<{ x: number; y: number; time: number } | null>(null);
  const [showPhysicsDebug, setShowPhysicsDebug] = useState(false);
  const [physicsEnabled, setPhysicsEnabled] = useState(true);
  const [camera, setCamera] = useState({ x: 0, y: 0, zoom: 1 });

  // Initialize systems
  useEffect(() => {
    if (!canvasRef.current || !overlayCanvasRef.current) return;

    // Initialize physics engine
    physicsEngineRef.current = new WebPhysicsEngine(width, height);
    
    // Initialize particle system
    particleSystemRef.current = new WebParticleSystem(canvasRef.current);
    
    // Initialize audio system
    audioSystemRef.current = new WebAudioSystem();

    // Set up collision callbacks
    physicsEngineRef.current.onCollision((collision: Collision) => {
      const intensity = Math.min(collision.relativeVelocity / 100, 1);
      
      if (particleSystemRef.current && audioSystemRef.current) {
        // Create collision particles
        const worldPos = percentageToWorld(collision.point.x / width * 100, collision.point.y / height * 100);
        particleSystemRef.current.collisionSparks(worldPos.x, worldPos.y);
        
        // Play collision sound
        audioSystemRef.current.playSound(
          intensity > 0.5 ? 'collision' : 'bounce',
          collision.point.x / width * 100,
          collision.point.y / height * 100,
          collision.relativeVelocity
        );
      }
    });

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [width, height]);

  // Animation loop with Love2D-style fixed timestep
  useEffect(() => {
    const animate = (currentTime: number) => {
      const deltaTime = Math.min((currentTime - lastTimeRef.current) / 1000, 1/30); // Cap at 30 FPS
      lastTimeRef.current = currentTime;

      if (physicsEngineRef.current && particleSystemRef.current) {
        // Update physics simulation
        if (physicsEnabled) {
          physicsEngineRef.current.update(deltaTime);
        }
        
        // Update particle system
        particleSystemRef.current.update(deltaTime);
        
        // Sync physics bodies with canvas objects
        syncPhysicsWithObjects();
      }

      // Render everything
      render();

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [objects, strokes, physicsEnabled, showPhysicsDebug]);

  // Convert percentage coordinates to world coordinates
  const percentageToWorld = useCallback((x: number, y: number) => ({
    x: (x / 100) * width,
    y: (y / 100) * height
  }), [width, height]);

  // Convert world coordinates to percentage
  const worldToPercentage = useCallback((x: number, y: number) => ({
    x: (x / width) * 100,
    y: (y / height) * 100
  }), [width, height]);

  // Sync physics bodies with canvas objects
  const syncPhysicsWithObjects = useCallback(() => {
    if (!physicsEngineRef.current) return;

    for (const obj of objects) {
      const body = physicsEngineRef.current.getBody(obj.id);
      const worldPos = percentageToWorld(obj.x, obj.y);

      if (obj.physics?.bouncing && body) {
        // Update object position from physics simulation
        const percentPos = worldToPercentage(body.x, body.y);
        if (Math.abs(percentPos.x - obj.x) > 0.1 || Math.abs(percentPos.y - obj.y) > 0.1) {
          onObjectMove(obj.id, percentPos.x, percentPos.y);
        }
        
        // Update rotation if physics body has angular velocity
        if (body.angularVelocity !== 0) {
          onObjectUpdate(obj.id, { 
            rotation: body.rotation,
            physics: {
              ...obj.physics,
              angularVelocity: body.angularVelocity
            }
          });
        }
      } else if (obj.physics?.bouncing && !body) {
        // Create physics body for new bouncing object
        const objWidth = obj.width || 100;
        const objHeight = obj.height || 30;
        
        physicsEngineRef.current.addBody(obj.id, worldPos.x, worldPos.y, objWidth, objHeight, {
          mass: obj.physics.mass || 1,
          restitution: obj.physics.restitution || 0.8,
          friction: obj.physics.friction || 0.3,
          vx: obj.physics.vx || 0,
          vy: obj.physics.vy || 0
        });
      }
    }
  }, [objects, onObjectMove, onObjectUpdate, percentageToWorld, worldToPercentage]);

  // Enhanced drawing with pressure sensitivity and smooth curves
  const handleDrawing = useCallback((event: React.MouseEvent) => {
    if (!drawingMode || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    
    // Simulate pressure based on drawing speed
    const pressure = 0.5 + Math.random() * 0.5;

    if (event.type === 'mousedown') {
      setIsDrawing(true);
      setCurrentStroke([{ x, y, pressure }]);
      
      if (audioSystemRef.current) {
        audioSystemRef.current.playSound(`draw${drawingTool.charAt(0).toUpperCase() + drawingTool.slice(1)}`, x, y);
      }
      
      if (particleSystemRef.current) {
        particleSystemRef.current.drawingEffect(...percentageToWorld(x, y));
      }
    } else if (event.type === 'mousemove' && isDrawing) {
      const newStroke = [...currentStroke, { x, y, pressure }];
      setCurrentStroke(newStroke);
      
      if (particleSystemRef.current && Math.random() < 0.3) {
        particleSystemRef.current.drawingEffect(...percentageToWorld(x, y));
      }
    } else if (event.type === 'mouseup' && isDrawing) {
      const finalStroke = [...currentStroke, { x, y, pressure }];
      setIsDrawing(false);
      setCurrentStroke([]);

      if (finalStroke.length > 1) {
        // Calculate stroke bounds for collision detection
        const bounds = {
          minX: Math.min(...finalStroke.map(p => p.x)),
          minY: Math.min(...finalStroke.map(p => p.y)),
          maxX: Math.max(...finalStroke.map(p => p.x)),
          maxY: Math.max(...finalStroke.map(p => p.y))
        };

        const stroke: Omit<DrawingStroke, 'id' | 'timestamp'> = {
          tool: drawingTool,
          color: drawingColor,
          size: brushSize,
          points: finalStroke,
          bounds,
          expireAt: Date.now() + (60 * 60 * 1000) // 1 hour expiration
        };

        onDrawingStroke(stroke);

        // Create physics collision for the stroke
        if (physicsEngineRef.current && drawingTool !== 'eraser') {
          const worldPoints = finalStroke.map(p => percentageToWorld(p.x, p.y));
          physicsEngineRef.current.addStrokeCollision(
            `stroke_${Date.now()}`, 
            worldPoints, 
            brushSize
          );
        }
      }
    }
  }, [drawingMode, isDrawing, currentStroke, drawingTool, drawingColor, brushSize, onDrawingStroke, percentageToWorld]);

  // Enhanced object interaction with throw mechanics
  const handleObjectInteraction = useCallback((event: React.MouseEvent, objectId: string) => {
    if (drawingMode) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    if (event.type === 'mousedown') {
      if (event.button === 2) { // Right click - context menu
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          objectId,
          objectType: 'message'
        });
      } else if (event.button === 0) { // Left click - start drag/throw
        setIsDragging(true);
        setIsThrowMode(event.ctrlKey);
        setThrowStart({ x, y, time: Date.now() });
        
        const obj = objects.find(o => o.id === objectId);
        if (obj) {
          setDragObject({
            objectId,
            offsetX: x - obj.x,
            offsetY: y - obj.y
          });
        }
        
        onObjectSelect(objectId, event.ctrlKey);
      }
    }
  }, [drawingMode, objects, onObjectSelect]);

  // Handle mouse movement for dragging and throwing
  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    if (drawingMode) {
      handleDrawing(event);
    } else if (isDragging && dragObject) {
      const newX = x - dragObject.offsetX;
      const newY = y - dragObject.offsetY;
      
      // Constrain to canvas bounds
      const constrainedX = Math.max(5, Math.min(95, newX));
      const constrainedY = Math.max(5, Math.min(95, newY));
      
      onObjectMove(dragObject.objectId, constrainedX, constrainedY);
    }
  }, [drawingMode, isDragging, dragObject, handleDrawing, onObjectMove]);

  // Handle mouse up for completing throws
  const handleMouseUp = useCallback((event: React.MouseEvent) => {
    if (drawingMode) {
      handleDrawing(event);
      return;
    }

    if (isDragging && isThrowMode && throwStart && dragObject) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;
      
      const deltaTime = (Date.now() - throwStart.time) / 1000;
      const vx = ((x - throwStart.x) / deltaTime) * 5; // Scale velocity
      const vy = ((y - throwStart.y) / deltaTime) * 5;
      
      // Add physics to object and throw it
      onObjectUpdate(dragObject.objectId, {
        physics: {
          vx,
          vy,
          bouncing: true,
          mass: 1,
          friction: 0.3,
          restitution: 0.8
        }
      });
      
      onThrowObject(dragObject.objectId, vx, vy);
      
      if (audioSystemRef.current && particleSystemRef.current) {
        const worldPos = percentageToWorld(x, y);
        audioSystemRef.current.playSound('throw', x, y, Math.sqrt(vx*vx + vy*vy));
        particleSystemRef.current.throwEffect(worldPos.x, worldPos.y, vx, vy);
      }
    }

    setIsDragging(false);
    setIsThrowMode(false);
    setThrowStart(null);
    setDragObject(null);
  }, [drawingMode, isDragging, isThrowMode, throwStart, dragObject, handleDrawing, onObjectUpdate, onThrowObject, percentageToWorld]);

  // Context menu actions
  const handleContextMenuAction = useCallback((action: string) => {
    if (!contextMenu) return;

    const obj = objects.find(o => o.id === contextMenu.objectId);
    if (!obj) return;

    switch (action) {
      case 'togglePhysics':
        const newPhysics = obj.physics?.bouncing ? 
          undefined : 
          {
            vx: 0,
            vy: 0,
            bouncing: true,
            mass: 1,
            friction: 0.3,
            restitution: 0.8
          };
          
        onObjectUpdate(contextMenu.objectId, { physics: newPhysics });
        
        if (audioSystemRef.current) {
          audioSystemRef.current.playSound('message', obj.x, obj.y);
        }
        
        if (particleSystemRef.current) {
          const worldPos = percentageToWorld(obj.x, obj.y);
          particleSystemRef.current.messageSpawn(worldPos.x, worldPos.y);
        }
        break;
        
      case 'delete':
        onObjectDelete(contextMenu.objectId);
        if (physicsEngineRef.current) {
          physicsEngineRef.current.removeBody(contextMenu.objectId);
        }
        break;
        
      case 'explode':
        if (particleSystemRef.current && audioSystemRef.current) {
          const worldPos = percentageToWorld(obj.x, obj.y);
          particleSystemRef.current.createExplosion(worldPos.x, worldPos.y, 2);
          audioSystemRef.current.playSound('collision', obj.x, obj.y, 300);
        }
        break;
    }

    setContextMenu(null);
  }, [contextMenu, objects, onObjectUpdate, onObjectDelete, percentageToWorld]);

  // Render function with Love2D-inspired effects
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!canvas || !overlayCanvas) return;

    const ctx = canvas.getContext('2d')!;
    const overlayCtx = overlayCanvas.getContext('2d')!;

    // Clear canvases
    ctx.clearRect(0, 0, width, height);
    overlayCtx.clearRect(0, 0, width, height);

    // Render background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    // Render drawing strokes with smooth curves
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.beginPath();

      // Draw smooth Catmull-Rom spline
      for (let i = 0; i < stroke.points.length - 1; i++) {
        const p1 = percentageToWorld(stroke.points[i].x, stroke.points[i].y);
        const p2 = percentageToWorld(stroke.points[i + 1].x, stroke.points[i + 1].y);

        if (i === 0) {
          ctx.moveTo(p1.x, p1.y);
        }
        
        // Simple quadratic curve for smoothness
        const cp = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2
        };
        
        ctx.quadraticCurveTo(p1.x, p1.y, cp.x, cp.y);
      }
      
      ctx.stroke();
    }

    // Render current drawing stroke
    if (isDrawing && currentStroke.length > 1) {
      ctx.strokeStyle = drawingColor;
      ctx.lineWidth = brushSize;
      ctx.beginPath();
      
      const firstPoint = percentageToWorld(currentStroke[0].x, currentStroke[0].y);
      ctx.moveTo(firstPoint.x, firstPoint.y);
      
      for (let i = 1; i < currentStroke.length; i++) {
        const point = percentageToWorld(currentStroke[i].x, currentStroke[i].y);
        ctx.lineTo(point.x, point.y);
      }
      
      ctx.stroke();
    }

    // Render objects with physics properties
    for (const obj of objects) {
      const worldPos = percentageToWorld(obj.x, obj.y);
      const isSelected = selectedObjects.has(obj.id);
      
      ctx.save();
      ctx.translate(worldPos.x, worldPos.y);
      
      if (obj.rotation) {
        ctx.rotate(obj.rotation);
      }

      // Object styling
      if (obj.physics?.bouncing) {
        ctx.fillStyle = '#4CAF50';
        ctx.strokeStyle = '#81C784';
        ctx.lineWidth = 2;
      } else {
        ctx.fillStyle = '#2196F3';
        ctx.strokeStyle = '#64B5F6';
        ctx.lineWidth = 1;
      }

      if (isSelected) {
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 3;
      }

      // Draw object
      const objWidth = obj.width || 100;
      const objHeight = obj.height || 30;
      
      ctx.fillRect(-objWidth/2, -objHeight/2, objWidth, objHeight);
      ctx.strokeRect(-objWidth/2, -objHeight/2, objWidth, objHeight);

      // Draw object text/content
      if (obj.data?.text) {
        ctx.fillStyle = '#FFF';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(obj.data.text.substring(0, 20), 0, 0);
      }

      ctx.restore();
    }

    // Render particles
    if (particleSystemRef.current) {
      particleSystemRef.current.render();
    }

    // Render physics debug visualization
    if (showPhysicsDebug && physicsEngineRef.current) {
      overlayCtx.strokeStyle = '#FF00FF';
      overlayCtx.lineWidth = 2;
      
      for (const body of physicsEngineRef.current.getAllBodies()) {
        overlayCtx.strokeRect(
          body.bounds.minX,
          body.bounds.minY,
          body.bounds.maxX - body.bounds.minX,
          body.bounds.maxY - body.bounds.minY
        );
      }
    }

    // Render throw trajectory preview
    if (isThrowMode && throwStart && isDragging && dragObject) {
      const rect = canvasRef.current.getBoundingClientRect();
      // This would show trajectory preview - simplified for now
      overlayCtx.strokeStyle = '#FFC107';
      overlayCtx.lineWidth = 2;
      overlayCtx.setLineDash([5, 5]);
      
      const obj = objects.find(o => o.id === dragObject.objectId);
      if (obj) {
        const startWorld = percentageToWorld(throwStart.x, throwStart.y);
        const currentWorld = percentageToWorld(obj.x, obj.y);
        
        overlayCtx.beginPath();
        overlayCtx.moveTo(startWorld.x, startWorld.y);
        overlayCtx.lineTo(currentWorld.x, currentWorld.y);
        overlayCtx.stroke();
      }
      
      overlayCtx.setLineDash([]);
    }
  }, [width, height, strokes, objects, selectedObjects, isDrawing, currentStroke, drawingColor, brushSize, showPhysicsDebug, isThrowMode, throwStart, isDragging, dragObject, percentageToWorld]);

  // Tool panel UI
  const toolPanel = useMemo(() => (
    <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-90 rounded-lg p-4 space-y-2">
      <div className="text-white text-sm font-semibold">Physics Canvas Tools</div>
      
      {/* Tool selection */}
      <div className="flex space-x-2">
        {(['pen', 'brush', 'eraser', 'message', 'marker'] as const).map((tool) => (
          <button
            key={tool}
            onClick={() => {}} // Would be handled by parent
            className={`px-3 py-1 rounded text-sm ${
              drawingTool === tool ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
            }`}
          >
            {tool}
          </button>
        ))}
      </div>
      
      {/* Physics controls */}
      <div className="flex space-x-2">
        <button
          onClick={() => setPhysicsEnabled(!physicsEnabled)}
          className={`px-3 py-1 rounded text-sm ${
            physicsEnabled ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300'
          }`}
        >
          Physics: {physicsEnabled ? 'ON' : 'OFF'}
        </button>
        
        <button
          onClick={() => setShowPhysicsDebug(!showPhysicsDebug)}
          className={`px-3 py-1 rounded text-sm ${
            showPhysicsDebug ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300'
          }`}
        >
          Debug
        </button>
      </div>

      {/* Stats display */}
      <div className="text-xs text-gray-400">
        <div>Objects: {objects.length}</div>
        <div>Strokes: {strokes.length}</div>
        <div>Particles: {particleSystemRef.current?.getCount() || 0}</div>
        <div>Physics Bodies: {physicsEngineRef.current?.getAllBodies().length || 0}</div>
      </div>
    </div>
  ), [drawingTool, physicsEnabled, showPhysicsDebug, objects.length, strokes.length]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* Main canvas */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={drawingMode ? handleDrawing : undefined}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      
      {/* Overlay canvas for UI elements */}
      <canvas
        ref={overlayCanvasRef}
        width={width}
        height={height}
        className="absolute inset-0 pointer-events-none"
      />

      {/* Tool panel */}
      {toolPanel}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="absolute bg-gray-900 bg-opacity-95 rounded-lg shadow-lg py-2 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => handleContextMenuAction('togglePhysics')}
            className="block w-full px-4 py-2 text-left text-white hover:bg-gray-700"
          >
            🎈 Toggle Physics
          </button>
          <button
            onClick={() => handleContextMenuAction('explode')}
            className="block w-full px-4 py-2 text-left text-white hover:bg-gray-700"
          >
            💥 Explode
          </button>
          <button
            onClick={() => handleContextMenuAction('delete')}
            className="block w-full px-4 py-2 text-left text-red-400 hover:bg-gray-700"
          >
            🗑️ Delete
          </button>
        </div>
      )}

      {/* Click outside to close context menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}