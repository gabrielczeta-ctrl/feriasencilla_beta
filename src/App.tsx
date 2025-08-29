import React, { useEffect, useRef, useState, useCallback } from 'react';
import { VERT, OPTIMIZED_WIDGET_SHADER } from './shaders';
import { useMultiplayer } from './hooks/useMultiplayer';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animationRef = useRef<number>(0);
  const mouseRef = useRef<[number, number]>([0, 0]);
  
  const [webglError, setWebglError] = useState<string | null>(null);
  const [isWritingMessage, setIsWritingMessage] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [clickPosition, setClickPosition] = useState<[number, number] | null>(null);
  
  // Multiplayer state
  const multiplayer = useMultiplayer();

  // Auto-join multiplayer on app load with no name (will get random name)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!multiplayer.isConnected && multiplayer.connectionStatus === 'disconnected') {
        multiplayer.joinBattle(); // No name = random name generated
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  const compileShader = useCallback((gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    
    return shader;
  }, []);

  const createProgram = useCallback((gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram | null => {
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    
    if (!vertexShader || !fragmentShader) return null;
    
    const program = gl.createProgram();
    if (!program) return null;
    
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    
    return program;
  }, [compileShader]);

  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const gl = canvas.getContext('webgl2', { 
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false
    });
    
    if (!gl) {
      setWebglError('WebGL2 not supported');
      return false;
    }
    
    glRef.current = gl;
    
    const program = createProgram(gl, VERT, OPTIMIZED_WIDGET_SHADER);
    if (!program) {
      setWebglError('Failed to create shader program');
      return false;
    }
    
    programRef.current = program;
    
    const vertices = new Float32Array([
      -1, -1,
       3, -1,
      -1,  3
    ]);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    gl.useProgram(program);
    
    return true;
  }, [createProgram]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    if (!canvas || !gl) return;
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    
    gl.viewport(0, 0, canvas.width, canvas.height);
  }, []);

  const render = useCallback((time: number) => {
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Set basic uniforms
    const timeUniform = gl.getUniformLocation(program, 'u_time');
    const resUniform = gl.getUniformLocation(program, 'u_res');
    const mouseUniform = gl.getUniformLocation(program, 'u_mouse');
    
    gl.uniform1f(timeUniform, time * 0.001);
    gl.uniform2f(resUniform, canvas.width, canvas.height);
    gl.uniform2f(mouseUniform, mouseRef.current[0], canvas.height - mouseRef.current[1]);
    
    // Set widget uniforms
    const widgets = multiplayer.room?.widgets || [];
    const activeWidgets = widgets.filter(widget => widget.expiresAt > Date.now());
    const maxWidgets = Math.min(activeWidgets.length, 20);
    
    // Widget count
    const widgetCountUniform = gl.getUniformLocation(program, 'u_widgetCount');
    gl.uniform1f(widgetCountUniform, maxWidgets);
    
    // Widget arrays
    const widgetPositions = new Float32Array(40); // 20 * 2 for vec2 array
    const widgetAges = new Float32Array(20);
    const widgetTypes = new Float32Array(20);
    
    for (let i = 0; i < maxWidgets; i++) {
      const widget = activeWidgets[i];
      const age = Math.max(0, (widget.expiresAt - Date.now()) / 3600000); // Normalize age 0-1 for 1 hour
      
      widgetPositions[i * 2] = widget.x;
      widgetPositions[i * 2 + 1] = widget.y;
      widgetAges[i] = age;
      widgetTypes[i] = widget.widgetType;
    }
    
    const widgetPositionsUniform = gl.getUniformLocation(program, 'u_widgetPositions');
    const widgetAgesUniform = gl.getUniformLocation(program, 'u_widgetAges');
    const widgetTypesUniform = gl.getUniformLocation(program, 'u_widgetTypes');
    
    gl.uniform2fv(widgetPositionsUniform, widgetPositions);
    gl.uniform1fv(widgetAgesUniform, widgetAges);
    gl.uniform1fv(widgetTypesUniform, widgetTypes);
    
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    
    animationRef.current = requestAnimationFrame(render);
  }, [multiplayer.room?.widgets]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    const newMousePos: [number, number] = [
      (e.clientX - rect.left) * dpr,
      (e.clientY - rect.top) * dpr
    ];
    
    mouseRef.current = newMousePos;
    
    // Send to multiplayer if connected
    if (multiplayer.isConnected) {
      multiplayer.sendMousePosition(newMousePos[0], newMousePos[1]);
    }
  }, [multiplayer]);

  const handleCanvasClick = useCallback((e: MouseEvent) => {
    e.preventDefault();
    
    if (!multiplayer.isMyTurn || !multiplayer.isConnected) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    
    // Start writing mode
    setClickPosition([x, y]);
    setIsWritingMessage(true);
    setPendingMessage('');
  }, [multiplayer]);

  const handleTouch = useCallback((e: TouchEvent) => {
    e.preventDefault();
    
    if (!multiplayer.isMyTurn || !multiplayer.isConnected) return;
    
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    const x = (touch.clientX - rect.left) * dpr;
    const y = (touch.clientY - rect.top) * dpr;
    
    // Start writing mode
    setClickPosition([x, y]);
    setIsWritingMessage(true);
    setPendingMessage('');
  }, [multiplayer]);

  const sendMessage = useCallback(() => {
    if (pendingMessage.trim() && clickPosition) {
      multiplayer.sendWidgetMessage(pendingMessage.trim(), clickPosition[0], clickPosition[1]);
      setPendingMessage('');
      setIsWritingMessage(false);
      setClickPosition(null);
    }
  }, [multiplayer, pendingMessage, clickPosition]);

  const cancelMessage = useCallback(() => {
    setIsWritingMessage(false);
    setPendingMessage('');
    setClickPosition(null);
  }, []);

  useEffect(() => {
    if (initWebGL()) {
      resizeCanvas();
      animationRef.current = requestAnimationFrame(render);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    window.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', handleTouch);
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleCanvasClick);
      canvas.removeEventListener('touchstart', handleTouch);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [handleMouseMove, handleCanvasClick, handleTouch, resizeCanvas]);

  if (webglError) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: '50%', 
        left: '50%', 
        transform: 'translate(-50%, -50%)',
        color: 'white',
        fontSize: '18px',
        textAlign: 'center',
        padding: '20px'
      }}>
        <div>{webglError}</div>
        <div style={{ fontSize: '14px', marginTop: '10px', opacity: 0.7 }}>
          This demo requires WebGL2 support
        </div>
      </div>
    );
  }

  const getWidgetColor = (widgetType: number) => {
    if (widgetType < 0.25) return '#ff4d6d'; // Pink
    else if (widgetType < 0.5) return '#4dd8ff'; // Cyan
    else if (widgetType < 0.75) return '#ffed4a'; // Yellow
    else return '#52d87f'; // Green
  };

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none' }} />

      {/* Mobile-Optimized Message Input */}
      {isWritingMessage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000,
          padding: '20px'
        }}>
          <div style={{
            background: '#222',
            borderRadius: '12px',
            padding: '24px',
            width: '100%',
            maxWidth: '400px',
            border: '2px solid #4dd8ff'
          }}>
            <div style={{ color: 'white', fontSize: '18px', marginBottom: '16px', textAlign: 'center' }}>
              💬 Write your message
            </div>
            <input
              type="text"
              value={pendingMessage}
              onChange={(e) => setPendingMessage(e.target.value)}
              placeholder="Type your message..."
              maxLength={100}
              autoFocus
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                borderRadius: '8px',
                border: '1px solid #666',
                background: '#333',
                color: 'white',
                marginBottom: '16px',
                outline: 'none'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  sendMessage();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelMessage();
                }
              }}
            />
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={sendMessage}
                disabled={!pendingMessage.trim()}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: pendingMessage.trim() ? '#4dd8ff' : '#666',
                  color: 'white',
                  cursor: pendingMessage.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                🚀 Send
              </button>
              <button
                onClick={cancelMessage}
                style={{
                  flex: 1,
                  padding: '12px',
                  fontSize: '16px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#666',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                ❌ Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Minimal Turn Indicator */}
      {multiplayer.isConnected && multiplayer.room && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          right: '20px',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '12px',
          borderRadius: '8px',
          textAlign: 'center',
          fontSize: '16px',
          zIndex: 1000,
          border: multiplayer.isMyTurn ? '2px solid #4dd8ff' : '2px solid #666'
        }}>
          {multiplayer.isMyTurn ? 
            '🎮 Tap anywhere to write a message!' : 
            `🎯 ${multiplayer.room.players.find(p => p.id === multiplayer.room!.currentPlayer)?.name || 'Someone'}'s turn`
          }
          {multiplayer.room.timeRemaining !== undefined && (
            <div style={{ 
              marginTop: '4px', 
              fontSize: '14px', 
              opacity: 0.8 
            }}>
              ⏱️ {Math.ceil(multiplayer.room.timeRemaining)}s
            </div>
          )}
        </div>
      )}

      {/* Bouncing Widgets with Timestamps */}
      {multiplayer.room?.widgets?.map((widget) => {
        const age = Math.max(0, (widget.expiresAt - Date.now()) / 3600000); // 0-1 for 1 hour
        const opacity = Math.min(1, age * 2); // Fade more gradually
        
        if (opacity <= 0.1) return null;
        
        return (
          <div
            key={widget.id}
            style={{
              position: 'fixed',
              left: `${widget.x * 100}%`,
              top: `${widget.y * 100}%`,
              opacity: opacity,
              transform: `translate(-50%, -50%) scale(${widget.size * Math.min(1, opacity * 1.5)})`,
              pointerEvents: 'none',
              zIndex: 1000,
              fontSize: '14px',
              color: getWidgetColor(widget.widgetType),
              textShadow: `0 0 8px ${getWidgetColor(widget.widgetType)}`,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              background: 'rgba(0,0,0,0.8)',
              padding: '8px 12px',
              borderRadius: '12px',
              border: `2px solid ${getWidgetColor(widget.widgetType)}`,
              whiteSpace: 'pre-line',
              maxWidth: '200px',
              textAlign: 'center',
              lineHeight: '1.2'
            }}
          >
            {widget.message}
          </div>
        );
      })}
    </>
  );
};

export default App;