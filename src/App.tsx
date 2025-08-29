import React, { useEffect, useRef, useState, useCallback } from 'react';
import { VERT, OPTIMIZED_WIDGET_SHADER, NAMES } from './shaders';
import { useMultiplayer } from './hooks/useMultiplayer';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animationRef = useRef<number>(0);
  const mouseRef = useRef<[number, number]>([0, 0]);
  
  const [showHUD, setShowHUD] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [isWritingMessage, setIsWritingMessage] = useState(false);
  const [pendingMessage, setPendingMessage] = useState('');
  const [clickPosition, setClickPosition] = useState<[number, number] | null>(null);
  
  // Game state
  const [score, setScore] = useState(0);
  
  // Multiplayer state
  const multiplayer = useMultiplayer();

  // Auto-join multiplayer on app load
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!multiplayer.isConnected && multiplayer.connectionStatus === 'disconnected') {
        multiplayer.joinBattle('Player');
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
      const age = Math.max(0, (widget.expiresAt - Date.now()) / 15000); // Normalize age 0-1
      
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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only allow HUD toggle
    if (e.key.toLowerCase() === 'h') {
      setShowHUD((prev) => !prev);
      e.preventDefault();
    }
    
    // Handle input for message writing
    if (isWritingMessage && e.key === 'Enter') {
      e.preventDefault();
      if (pendingMessage.trim() && clickPosition) {
        multiplayer.sendWidgetMessage(pendingMessage.trim(), clickPosition[0], clickPosition[1]);
        setScore(prev => prev + 1);
        setPendingMessage('');
        setIsWritingMessage(false);
        setClickPosition(null);
      }
    } else if (isWritingMessage && e.key === 'Escape') {
      e.preventDefault();
      setIsWritingMessage(false);
      setPendingMessage('');
      setClickPosition(null);
    }
  }, [isWritingMessage, pendingMessage, clickPosition, multiplayer]);

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

  const sendQuickMessage = useCallback((message: string) => {
    if (!multiplayer.isMyTurn || !multiplayer.isConnected) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Use mouse position or center
    const x = mouseRef.current[0] || canvas.width / 2;
    const y = mouseRef.current[1] || canvas.height / 2;
    
    multiplayer.sendWidgetMessage(message, x, y);
    setScore(prev => prev + 1);
  }, [multiplayer]);

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
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleCanvasClick);
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleCanvasClick);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [handleKeyDown, handleMouseMove, handleCanvasClick, resizeCanvas]);

  if (webglError) {
    return (
      <div className="error-panel">
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
      <canvas ref={canvasRef} />
      
      {/* Click Position Indicator */}
      {isWritingMessage && clickPosition && (
        <div
          className="click-indicator"
          style={{
            position: 'fixed',
            left: `${(clickPosition[0] / (canvasRef.current?.width || 1)) * 100}%`,
            top: `${(clickPosition[1] / (canvasRef.current?.height || 1)) * 100}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 2000,
            fontSize: '24px',
            animation: 'pulse 1s infinite'
          }}
        >
          ✏️
        </div>
      )}

      {/* Message Input Modal */}
      {isWritingMessage && (
        <div className="message-input-modal">
          <div className="message-input-content">
            <h3>📝 Write your message</h3>
            <input
              type="text"
              value={pendingMessage}
              onChange={(e) => setPendingMessage(e.target.value)}
              placeholder="Type your message..."
              maxLength={50}
              autoFocus
              onKeyDown={(e) => e.stopPropagation()} // Prevent bubbling
            />
            <div className="message-input-buttons">
              <button 
                onClick={() => {
                  if (pendingMessage.trim() && clickPosition) {
                    multiplayer.sendWidgetMessage(pendingMessage.trim(), clickPosition[0], clickPosition[1]);
                    setScore(prev => prev + 1);
                    setPendingMessage('');
                    setIsWritingMessage(false);
                    setClickPosition(null);
                  }
                }}
                disabled={!pendingMessage.trim()}
              >
                🚀 Send
              </button>
              <button 
                onClick={() => {
                  setIsWritingMessage(false);
                  setPendingMessage('');
                  setClickPosition(null);
                }}
              >
                ❌ Cancel
              </button>
            </div>
            <small>Press Enter to send, Escape to cancel</small>
          </div>
        </div>
      )}
      
      {/* Game Header */}
      <div className="game-header">
        <div className="game-title">🎮 WIDGET BOUNCER</div>
        <div className="room-info">
          <span className="score-display">🎯 {score}</span>
          <span className="player-count">
            👥 {multiplayer.room?.playerCount || 1}
          </span>
          <span className={`connection-status ${multiplayer.connectionStatus}`}>
            {multiplayer.connectionStatus === 'connected' ? '🟢' : 
             multiplayer.connectionStatus === 'connecting' ? '🟡' : '🔴'} 
          </span>
        </div>
      </div>

      {/* Queue System */}
      {multiplayer.isConnected && multiplayer.room && (
        <div className="queue-panel">
          <div className="current-player-section">
            <div className="current-player-label">
              {multiplayer.room.currentPlayer === multiplayer.playerId ? 
                '🎮 YOUR TURN!' : 
                `🎯 ${multiplayer.room.players.find(p => p.id === multiplayer.room!.currentPlayer)?.name || 'Player'}'s Turn`
              }
            </div>
            {multiplayer.room.timeRemaining !== undefined && (
              <div className="timer-display">
                <div className="timer-bar">
                  <div 
                    className="timer-fill"
                    style={{ 
                      width: `${(multiplayer.room.timeRemaining / 45) * 100}%`,
                      backgroundColor: multiplayer.room.timeRemaining < 10 ? '#ff4444' : 
                                     multiplayer.room.timeRemaining < 20 ? '#ffaa00' : '#44ff44'
                    }}
                  />
                </div>
                <span className="timer-text">{Math.ceil(multiplayer.room.timeRemaining)}s</span>
              </div>
            )}
          </div>
          
          {multiplayer.room.queue && multiplayer.room.queue.length > 0 && (
            <div className="queue-section">
              <div className="queue-label">🎭 Up Next:</div>
              <div className="queue-list">
                {multiplayer.room.queue.slice(0, 4).map((playerId, index) => {
                  const player = multiplayer.room!.players.find(p => p.id === playerId);
                  return (
                    <div key={playerId} className="queue-item">
                      {index === 0 ? '👑' : '👤'} {player?.name || 'Player'}
                    </div>
                  );
                })}
                {multiplayer.room.queue.length > 4 && (
                  <div className="queue-item">+{multiplayer.room.queue.length - 4} more</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bouncing Widgets */}
      {multiplayer.room?.widgets?.map((widget) => {
        const age = Math.max(0, (widget.expiresAt - Date.now()) / 15000); // 0-1
        const opacity = age;
        
        if (opacity <= 0.1) return null;
        
        return (
          <div
            key={widget.id}
            className="bouncing-widget"
            style={{
              position: 'fixed',
              left: `${widget.x * 100}%`,
              top: `${widget.y * 100}%`,
              opacity: opacity,
              transform: `translate(-50%, -50%) scale(${widget.size * opacity})`,
              pointerEvents: 'none',
              zIndex: 1000,
              fontSize: '20px',
              color: getWidgetColor(widget.widgetType),
              textShadow: `0 0 10px ${getWidgetColor(widget.widgetType)}`,
              fontFamily: 'monospace',
              fontWeight: 'bold',
              background: 'rgba(0,0,0,0.3)',
              padding: '4px 8px',
              borderRadius: '8px',
              border: `2px solid ${getWidgetColor(widget.widgetType)}`,
              whiteSpace: 'nowrap',
              maxWidth: '200px',
              overflow: 'hidden'
            }}
          >
            {widget.message}
          </div>
        );
      })}

      {/* Challenge Panel */}
      <div className={`shader-panel ${!showHUD ? 'hidden' : ''}`}>
        <div className="shader-name">🎨 {NAMES[0]}</div>
        <div className="shader-challenge">
          {multiplayer.isMyTurn ? 
            '👆 Click anywhere to write a message!' : 
            '👀 Watch the bouncing widgets!'
          }
        </div>
        {multiplayer.room?.widgets && (
          <div className="widget-stats">
            Active widgets: {multiplayer.room.widgets.filter(w => w.expiresAt > Date.now()).length}
          </div>
        )}
      </div>

      {/* Control Panel */}
      <div className={`control-panel ${!showHUD ? 'hidden' : ''}`}>        
        <div className="game-controls">
          <button className="control-btn" onClick={() => setShowHUD(!showHUD)}>
            👁 {showHUD ? 'Hide' : 'Show'} UI
          </button>
          {multiplayer.isMyTurn && (
            <div className="turn-controls">
              <span className="turn-indicator">🎮 Your Turn!</span>
              <span className="interaction-hint">Click anywhere to write a message</span>
            </div>
          )}
        </div>

        {/* Quick Messages */}
        {multiplayer.isMyTurn && (
          <div className="quick-messages">
            <div className="quick-messages-label">Quick Messages:</div>
            <div className="quick-buttons">
              {['🎉', '❤️', '🚀', '✨', 'Hello!', 'Nice!', 'Wow!', 'Cool!'].map((msg) => (
                <button
                  key={msg}
                  className="quick-btn"
                  onClick={() => sendQuickMessage(msg)}
                >
                  {msg}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="multiplayer-section">
          {!multiplayer.isConnected ? (
            <div className="join-battle-form">
              <button
                onClick={() => multiplayer.joinBattle('Player')}
                disabled={multiplayer.connectionStatus === 'connecting'}
                className="join-btn"
              >
                {multiplayer.connectionStatus === 'connecting' ? '🟡' : '🚀'} Join Widget Battle
              </button>
            </div>
          ) : (
            <button
              onClick={multiplayer.disconnect}
              className="disconnect-btn"
            >
              🔌 Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default App;