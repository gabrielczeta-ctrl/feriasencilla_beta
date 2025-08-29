import React, { useEffect, useRef, useState, useCallback } from 'react';
import { VERT, REACTIVE_ASCII_SHADER, NAMES } from './shaders';
import { useMultiplayer } from './hooks/useMultiplayer';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animationRef = useRef<number>(0);
  const mouseRef = useRef<[number, number]>([0, 0]);
  
  const [showHUD, setShowHUD] = useState(true);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [asciiInput, setAsciiInput] = useState('');
  
  // Game state
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  
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
    
    const program = createProgram(gl, VERT, REACTIVE_ASCII_SHADER);
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
    
    // Set ASCII character uniforms
    const asciiChars = multiplayer.room?.asciiCharacters || [];
    const activeAscii = asciiChars.filter(char => char.expiresAt > Date.now());
    const maxAscii = Math.min(activeAscii.length, 50);
    
    // ASCII count
    const asciiCountUniform = gl.getUniformLocation(program, 'u_asciiCount');
    gl.uniform1f(asciiCountUniform, maxAscii);
    
    // ASCII positions array
    const asciiPositions = new Float32Array(100); // 50 * 2 for vec2 array
    const asciiAges = new Float32Array(50);
    const asciiTypes = new Float32Array(50);
    
    for (let i = 0; i < maxAscii; i++) {
      const char = activeAscii[i];
      const age = (char.expiresAt - Date.now()) / 1000; // Age in seconds remaining
      
      asciiPositions[i * 2] = char.x;
      asciiPositions[i * 2 + 1] = 1.0 - char.y; // Flip Y for WebGL
      asciiAges[i] = Math.max(0, age);
      asciiTypes[i] = char.asciiType;
    }
    
    const asciiPositionsUniform = gl.getUniformLocation(program, 'u_asciiPositions');
    const asciiAgesUniform = gl.getUniformLocation(program, 'u_asciiAges');
    const asciiTypesUniform = gl.getUniformLocation(program, 'u_asciiTypes');
    
    gl.uniform2fv(asciiPositionsUniform, asciiPositions);
    gl.uniform1fv(asciiAgesUniform, asciiAges);
    gl.uniform1fv(asciiTypesUniform, asciiTypes);
    
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    
    animationRef.current = requestAnimationFrame(render);
  }, [multiplayer.room?.asciiCharacters]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    e.preventDefault();
    
    // Only allow HUD toggle universally
    if (e.key.toLowerCase() === 'h') {
      setShowHUD((prev) => !prev);
      return;
    }
    
    // ASCII input for current player
    if (multiplayer.isMyTurn && multiplayer.isConnected) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      let character = '';
      
      // Handle different key types
      if (e.key.length === 1) {
        character = e.key;
      } else if (e.key === 'Space') {
        character = ' ';
      } else if (e.key === 'Enter') {
        character = '\n';
      }
      
      if (character) {
        // Use mouse position, or center if mouse not moved
        const x = mouseRef.current[0] || canvas.width / 2;
        const y = mouseRef.current[1] || canvas.height / 2;
        
        multiplayer.sendAsciiInput(character, x, y);
        setScore(prev => prev + 1);
        setStreak(prev => prev + 1);
      }
    }
  }, [multiplayer]);

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

  const handleMouseClick = useCallback((e: MouseEvent) => {
    if (!multiplayer.isMyTurn || !multiplayer.isConnected) return;
    
    // If there's text in the input, send it
    if (asciiInput.trim()) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      
      const x = (e.clientX - rect.left) * dpr;
      const y = (e.clientY - rect.top) * dpr;
      
      // Send each character
      for (const char of asciiInput.trim()) {
        setTimeout(() => {
          multiplayer.sendAsciiInput(char, x + Math.random() * 20 - 10, y + Math.random() * 20 - 10);
        }, Math.random() * 100);
      }
      
      setAsciiInput('');
      setScore(prev => prev + asciiInput.trim().length);
    }
  }, [multiplayer, asciiInput]);

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
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleMouseClick);
    window.addEventListener('resize', resizeCanvas);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleMouseClick);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [handleKeyDown, handleMouseMove, handleMouseClick, resizeCanvas]);

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
        <div className="game-title">🔤 ASCII REACTOR</div>
        <div className="room-info">
          <span className="score-display">✨ {score}</span>
          <span className="streak-display">🔥 {streak}</span>
          <span className="player-count">
            👥 {multiplayer.room?.playerCount || 1}
          </span>
          <span className={`connection-status ${multiplayer.connectionStatus}`}>
            {multiplayer.connectionStatus === 'connected' ? '🟢' : 
             multiplayer.connectionStatus === 'connecting' ? '🟡' : '🔴'} 
          </span>
        </div>
      </div>

      {/* WarioWare-Style Queue System */}
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

      {/* ASCII Characters Display */}
      {multiplayer.room?.asciiCharacters?.map((char) => {
        const age = Math.max(0, (char.expiresAt - Date.now()) / 10000); // 0-1
        const opacity = age;
        
        if (opacity <= 0) return null;
        
        return (
          <div
            key={char.id}
            className="ascii-character"
            style={{
              position: 'fixed',
              left: `${char.x * 100}%`,
              top: `${char.y * 100}%`,
              opacity: opacity,
              transform: `translate(-50%, -50%) scale(${0.5 + opacity * 0.5})`,
              pointerEvents: 'none',
              zIndex: 1000,
              fontSize: '24px',
              color: char.playerId === multiplayer.playerId ? '#00ff88' : '#ff0088',
              textShadow: '0 0 10px currentColor',
              fontFamily: 'monospace',
              fontWeight: 'bold'
            }}
          >
            {char.character}
          </div>
        );
      })}

      {/* Challenge Panel */}
      <div className={`shader-panel ${!showHUD ? 'hidden' : ''}`}>
        <div className="shader-name">🎨 {NAMES[0]}</div>
        <div className="shader-challenge">
          {multiplayer.isMyTurn ? 
            '🔤 Type characters to influence the field!' : 
            '👀 Watch the reactive ASCII field!'
          }
        </div>
        {multiplayer.room?.asciiCharacters && (
          <div className="ascii-stats">
            Active characters: {multiplayer.room.asciiCharacters.filter(c => c.expiresAt > Date.now()).length}
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
              <span className="interaction-hint">Type any key or click to add text</span>
            </div>
          )}
        </div>

        {/* ASCII Input */}
        {multiplayer.isMyTurn && (
          <div className="ascii-input-section">
            <input
              type="text"
              value={asciiInput}
              onChange={(e) => setAsciiInput(e.target.value)}
              placeholder="Type text and click to place..."
              className="ascii-input"
              maxLength={50}
            />
            <button 
              onClick={() => {
                const canvas = canvasRef.current;
                if (!canvas || !asciiInput.trim()) return;
                
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                
                for (const char of asciiInput.trim()) {
                  setTimeout(() => {
                    multiplayer.sendAsciiInput(char, centerX + Math.random() * 100 - 50, centerY + Math.random() * 100 - 50);
                  }, Math.random() * 200);
                }
                
                setAsciiInput('');
              }}
              className="ascii-send-btn"
              disabled={!asciiInput.trim()}
            >
              🚀 Send
            </button>
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
                {multiplayer.connectionStatus === 'connecting' ? '🟡' : '🚀'} Join ASCII Battle
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