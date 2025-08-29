import React, { useEffect, useRef, useState, useCallback } from 'react';
import { VERT, SHADERS, NAMES } from './shaders';
import { useMultiplayer } from './hooks/useMultiplayer';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animationRef = useRef<number>(0);
  const mouseRef = useRef<[number, number]>([0, 0]);
  
  const [currentShader, setCurrentShader] = useState(0);
  const [showHUD, setShowHUD] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  
  // Multiplayer state
  const multiplayer = useMultiplayer();
  const [playerName, setPlayerName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

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
    
    const program = createProgram(gl, VERT, SHADERS[currentShader]);
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
  }, [createProgram, currentShader]);

  const updateShader = useCallback(() => {
    const gl = glRef.current;
    if (!gl) return;
    
    const program = createProgram(gl, VERT, SHADERS[currentShader]);
    if (!program) return;
    
    if (programRef.current) {
      gl.deleteProgram(programRef.current);
    }
    
    programRef.current = program;
    gl.useProgram(program);
    
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  }, [createProgram, currentShader]);

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
    
    const timeUniform = gl.getUniformLocation(program, 'u_time');
    const resUniform = gl.getUniformLocation(program, 'u_res');
    const mouseUniform = gl.getUniformLocation(program, 'u_mouse');
    
    gl.uniform1f(timeUniform, time * 0.001);
    gl.uniform2f(resUniform, canvas.width, canvas.height);
    gl.uniform2f(mouseUniform, mouseRef.current[0], canvas.height - mouseRef.current[1]);
    
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    
    animationRef.current = requestAnimationFrame(render);
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    
    if (key >= '1' && key <= '4') {
      const index = parseInt(key) - 1;
      if (index !== currentShader) {
        setCurrentShader(index);
      }
    } else if (key === 'n') {
      setCurrentShader((prev) => (prev + 1) % SHADERS.length);
    } else if (key === 'p') {
      setCurrentShader((prev) => (prev - 1 + SHADERS.length) % SHADERS.length);
    } else if (key === 'h') {
      setShowHUD((prev) => !prev);
    }
  }, [currentShader]);

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
    updateShader();
  }, [currentShader, updateShader]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [handleKeyDown, handleMouseMove, resizeCanvas]);

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

  return (
    <>
      <canvas ref={canvasRef} />
      
      {/* Game Header */}
      <div className="game-header">
        <div className="game-title">🎮 SHADER BATTLE ARENA</div>
        <div className="room-info">
          <span className="room-id">
            Room: #{multiplayer.room?.id || 'SOLO'}
          </span>
          <span className="player-count">
            👥 {multiplayer.room?.playerCount || 1} Player{(multiplayer.room?.playerCount || 1) > 1 ? 's' : ''}
          </span>
          <span className={`connection-status ${multiplayer.connectionStatus}`}>
            {multiplayer.connectionStatus === 'connected' ? '🟢' : 
             multiplayer.connectionStatus === 'connecting' ? '🟡' : '🔴'} 
            {multiplayer.connectionStatus}
          </span>
        </div>
      </div>

      {/* Shader Info Panel */}
      <div className={`shader-panel ${!showHUD ? 'hidden' : ''}`}>
        <div className="shader-name">{NAMES[currentShader]}</div>
        <div className="shader-challenge">Move your mouse to distort reality!</div>
      </div>

      {/* Control Panel */}
      <div className={`control-panel ${!showHUD ? 'hidden' : ''}`}>
        <div className="shader-selector">
          {NAMES.map((name, index) => (
            <button
              key={index}
              className={`shader-btn ${index === currentShader ? 'active' : ''}`}
              onClick={() => {
                setCurrentShader(index);
                if (multiplayer.isConnected) {
                  multiplayer.changeShader(index);
                }
              }}
            >
              {index + 1}. {name}
            </button>
          ))}
        </div>
        
        <div className="game-controls">
          <button className="control-btn" onClick={() => setCurrentShader((prev) => (prev - 1 + SHADERS.length) % SHADERS.length)}>
            ⏮ Previous
          </button>
          <button className="control-btn" onClick={() => setShowHUD(!showHUD)}>
            👁 {showHUD ? 'Hide' : 'Show'} UI
          </button>
          <button className="control-btn" onClick={() => setCurrentShader((prev) => (prev + 1) % SHADERS.length)}>
            ⏭ Next
          </button>
        </div>

        <div className="multiplayer-section">
          {!multiplayer.isConnected ? (
            <div className="join-room-form">
              <h3>🌐 Join Multiplayer Battle!</h3>
              <div className="form-row">
                <input
                  type="text"
                  placeholder="Your name (optional)"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="name-input"
                />
                <input
                  type="text"
                  placeholder="Room ID (leave empty for new room)"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  className="room-input"
                />
                <button
                  onClick={() => {
                    setIsJoiningRoom(true);
                    multiplayer.joinRoom(roomId || undefined, playerName || undefined);
                  }}
                  disabled={isJoiningRoom}
                  className="join-btn"
                >
                  {isJoiningRoom ? '🔄 Connecting...' : '🚀 Join Battle'}
                </button>
              </div>
            </div>
          ) : (
            <div className="multiplayer-status">
              <div className="status-item">
                <span className="status-label">You:</span>
                <span className="status-value">{multiplayer.playerName} 🟢</span>
              </div>
              <div className="status-item">
                <span className="status-label">Other Players:</span>
                <span className="status-value">
                  {multiplayer.otherPlayers.length > 0 
                    ? multiplayer.otherPlayers.map(p => p.name).join(', ')
                    : 'Waiting for players... 👥'
                  }
                </span>
              </div>
              <button
                onClick={multiplayer.disconnect}
                className="disconnect-btn"
              >
                🔌 Leave Room
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Legacy keyboard controls hint */}
      <div className={`legacy-controls ${!showHUD ? 'hidden' : ''}`}>
        💡 Keyboard: 1-4 shaders • N/P next/prev • H hide UI
      </div>
    </>
  );
};

export default App;