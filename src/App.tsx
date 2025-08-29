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
  const [showClickEffect, setShowClickEffect] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  
  // Multiplayer state
  const multiplayer = useMultiplayer();

  // Auto-join multiplayer with connection status
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!multiplayer.isConnected && multiplayer.connectionStatus === 'disconnected') {
        setConnectionStatus('Connecting...');
        multiplayer.joinBattle();
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  // Update connection status
  useEffect(() => {
    if (multiplayer.connectionStatus === 'connected') {
      setConnectionStatus('');
    } else if (multiplayer.connectionStatus === 'connecting') {
      setConnectionStatus('Connecting...');
    } else {
      setConnectionStatus('Connection lost...');
    }
  }, [multiplayer.connectionStatus]);

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
      antialias: true,
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
    const widgetPositions = new Float32Array(40);
    const widgetAges = new Float32Array(20);
    const widgetTypes = new Float32Array(20);
    
    for (let i = 0; i < maxWidgets; i++) {
      const widget = activeWidgets[i];
      const age = Math.max(0, (widget.expiresAt - Date.now()) / 3600000);
      
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
    
    if (multiplayer.isConnected) {
      multiplayer.sendMousePosition(newMousePos[0], newMousePos[1]);
    }
  }, [multiplayer]);

  const showClickAnimation = useCallback((x: number, y: number) => {
    setClickPosition([x, y]);
    setShowClickEffect(true);
    setTimeout(() => setShowClickEffect(false), 1000);
  }, []);

  const handleCanvasClick = useCallback((e: MouseEvent) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    
    // Show click animation
    showClickAnimation(x, y);
    
    if (!multiplayer.isMyTurn || !multiplayer.isConnected) {
      return; // Still show click effect, just don't open input
    }
    
    // Start writing mode
    setClickPosition([x, y]);
    setIsWritingMessage(true);
    setPendingMessage('');
  }, [multiplayer, showClickAnimation]);

  const handleTouch = useCallback((e: TouchEvent) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas || e.touches.length === 0) return;
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    const x = (touch.clientX - rect.left) * dpr;
    const y = (touch.clientY - rect.top) * dpr;
    
    // Show click animation
    showClickAnimation(x, y);
    
    if (!multiplayer.isMyTurn || !multiplayer.isConnected) {
      return; // Still show touch effect, just don't open input
    }
    
    // Start writing mode
    setClickPosition([x, y]);
    setIsWritingMessage(true);
    setPendingMessage('');
  }, [multiplayer, showClickAnimation]);

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
    
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('touchstart', handleTouch, { passive: false });
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
        padding: '20px',
        backgroundColor: 'rgba(0,0,0,0.8)',
        borderRadius: '12px'
      }}>
        <div>⚠️ {webglError}</div>
        <div style={{ fontSize: '14px', marginTop: '10px', opacity: 0.7 }}>
          This app requires WebGL2 support
        </div>
      </div>
    );
  }

  const getWidgetColor = (widgetType: number) => {
    if (widgetType < 0.25) return '#ff6b9d'; // Pink
    else if (widgetType < 0.5) return '#4ecdc4'; // Teal
    else if (widgetType < 0.75) return '#ffe66d'; // Yellow
    else return '#95e1d3'; // Mint
  };

  return (
    <>
      <canvas 
        ref={canvasRef} 
        style={{ 
          display: 'block', 
          touchAction: 'none',
          cursor: multiplayer.isMyTurn ? 'crosshair' : 'default'
        }} 
      />

      {/* Click Effect Animation */}
      {showClickEffect && clickPosition && (
        <div
          style={{
            position: 'fixed',
            left: `${(clickPosition[0] / (canvasRef.current?.width || 1)) * 100}%`,
            top: `${(clickPosition[1] / (canvasRef.current?.height || 1)) * 100}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 2000,
            pointerEvents: 'none',
            fontSize: '32px',
            animation: 'clickPulse 1s ease-out forwards'
          }}
        >
          ✨
        </div>
      )}

      {/* Enhanced Message Input */}
      {isWritingMessage && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 3000,
          padding: '20px',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, #2a2a2a, #1e1e1e)',
            borderRadius: '16px',
            padding: '32px',
            width: '100%',
            maxWidth: '450px',
            border: '2px solid #4ecdc4',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            animation: 'slideUp 0.3s ease-out'
          }}>
            <div style={{ 
              color: '#4ecdc4', 
              fontSize: '24px', 
              marginBottom: '20px', 
              textAlign: 'center',
              fontWeight: 'bold'
            }}>
              💬 Write your message
            </div>
            <input
              type="text"
              value={pendingMessage}
              onChange={(e) => setPendingMessage(e.target.value)}
              placeholder="What's on your mind?"
              maxLength={100}
              autoFocus
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '18px',
                borderRadius: '12px',
                border: '2px solid #444',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                marginBottom: '20px',
                outline: 'none',
                transition: 'border-color 0.3s ease',
                fontFamily: 'inherit'
              }}
              onFocus={(e) => e.target.style.borderColor = '#4ecdc4'}
              onBlur={(e) => e.target.style.borderColor = '#444'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pendingMessage.trim()) {
                  e.preventDefault();
                  sendMessage();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelMessage();
                }
              }}
            />
            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={sendMessage}
                disabled={!pendingMessage.trim()}
                style={{
                  flex: 1,
                  padding: '16px',
                  fontSize: '18px',
                  borderRadius: '12px',
                  border: 'none',
                  background: pendingMessage.trim() 
                    ? 'linear-gradient(145deg, #4ecdc4, #3ab6ac)' 
                    : '#444',
                  color: 'white',
                  cursor: pendingMessage.trim() ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                  transition: 'all 0.3s ease',
                  transform: pendingMessage.trim() ? 'scale(1)' : 'scale(0.95)',
                }}
                onMouseEnter={(e) => {
                  if (pendingMessage.trim()) {
                    (e.target as HTMLElement).style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.transform = pendingMessage.trim() ? 'scale(1)' : 'scale(0.95)';
                }}
              >
                🚀 Send
              </button>
              <button
                onClick={cancelMessage}
                style={{
                  flex: 1,
                  padding: '16px',
                  fontSize: '18px',
                  borderRadius: '12px',
                  border: '2px solid #666',
                  background: 'transparent',
                  color: '#ccc',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.borderColor = '#ff6b9d';
                  (e.target as HTMLElement).style.color = '#ff6b9d';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.borderColor = '#666';
                  (e.target as HTMLElement).style.color = '#ccc';
                }}
              >
                ❌ Cancel
              </button>
            </div>
            <div style={{ 
              color: '#888', 
              fontSize: '14px', 
              textAlign: 'center', 
              marginTop: '16px' 
            }}>
              Press Enter to send • Escape to cancel
            </div>
          </div>
        </div>
      )}

      {/* Connection Status */}
      {connectionStatus && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.8)',
          color: '#4ecdc4',
          padding: '16px 24px',
          borderRadius: '8px',
          fontSize: '16px',
          zIndex: 2000
        }}>
          {connectionStatus}
        </div>
      )}

      {/* Enhanced Turn Indicator */}
      {multiplayer.isConnected && multiplayer.room && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '20px',
          right: '20px',
          background: multiplayer.isMyTurn 
            ? 'linear-gradient(145deg, rgba(78, 205, 196, 0.2), rgba(58, 182, 172, 0.2))'
            : 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(10px)',
          color: 'white',
          padding: '16px',
          borderRadius: '12px',
          textAlign: 'center',
          fontSize: '16px',
          zIndex: 1000,
          border: multiplayer.isMyTurn ? '2px solid #4ecdc4' : '2px solid #444',
          animation: multiplayer.isMyTurn ? 'glow 2s ease-in-out infinite alternate' : 'none'
        }}>
          {multiplayer.isMyTurn ? (
            <div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>🎮 Your Turn!</div>
              <div style={{ fontSize: '14px', opacity: 0.8, marginTop: '4px' }}>
                Tap anywhere to write a message
              </div>
            </div>
          ) : (
            <div>
              <div>🎯 {multiplayer.room.players.find(p => p.id === multiplayer.room!.currentPlayer)?.name || 'Someone'}'s turn</div>
              <div style={{ fontSize: '14px', opacity: 0.7, marginTop: '4px' }}>
                Watch the magic happen...
              </div>
            </div>
          )}
          {multiplayer.room.timeRemaining !== undefined && (
            <div style={{ 
              marginTop: '8px',
              fontSize: '14px',
              opacity: 0.8,
              background: 'rgba(255,255,255,0.1)',
              padding: '4px 8px',
              borderRadius: '6px',
              display: 'inline-block'
            }}>
              ⏱️ {Math.ceil(multiplayer.room.timeRemaining)}s remaining
            </div>
          )}
        </div>
      )}

      {/* Enhanced Floating Widgets */}
      {multiplayer.room?.widgets?.map((widget) => {
        const age = Math.max(0, (widget.expiresAt - Date.now()) / 3600000);
        const opacity = Math.min(1, age);
        
        if (opacity <= 0.1) return null;
        
        return (
          <div
            key={widget.id}
            style={{
              position: 'fixed',
              left: `${widget.x * 100}%`,
              top: `${widget.y * 100}%`,
              opacity: opacity,
              transform: `translate(-50%, -50%) scale(${0.8 + widget.size * 0.4})`,
              pointerEvents: 'none',
              zIndex: 1000,
              fontSize: '15px',
              color: getWidgetColor(widget.widgetType),
              textShadow: `0 0 12px ${getWidgetColor(widget.widgetType)}`,
              fontFamily: '"Comic Sans MS", cursive, sans-serif',
              fontWeight: 'bold',
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(8px)',
              padding: '12px 16px',
              borderRadius: '16px',
              border: `2px solid ${getWidgetColor(widget.widgetType)}`,
              whiteSpace: 'pre-line',
              maxWidth: '220px',
              textAlign: 'center',
              lineHeight: '1.3',
              boxShadow: `0 0 20px rgba(${
                widget.widgetType < 0.25 ? '255,107,157' :
                widget.widgetType < 0.5 ? '78,205,196' :
                widget.widgetType < 0.75 ? '255,230,109' : '149,225,211'
              },0.4)`,
              animation: 'float 3s ease-in-out infinite'
            }}
          >
            {widget.message}
          </div>
        );
      })}

      {/* CSS Animations */}
      <style>{`
        @keyframes clickPulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
        }
        
        @keyframes slideUp {
          from { transform: translateY(50px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        
        @keyframes glow {
          from { box-shadow: 0 0 20px rgba(78, 205, 196, 0.3); }
          to { box-shadow: 0 0 30px rgba(78, 205, 196, 0.6); }
        }
        
        @keyframes float {
          0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
          50% { transform: translate(-50%, -50%) translateY(-10px); }
        }
      `}</style>
    </>
  );
};

export default App;