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
  const [autoCycle, setAutoCycle] = useState(true);
  
  // Game state
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [challenge, setChallenge] = useState<string>('Move mouse to center');
  const [challengeProgress, setChallengeProgress] = useState(0);
  const [particles, setParticles] = useState<Array<{x: number, y: number, life: number}>>([]);
  
  // Multiplayer state
  const multiplayer = useMultiplayer();
  const [isJoiningBattle, setIsJoiningBattle] = useState(false);

  // Auto-join multiplayer on app load
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!multiplayer.isConnected && multiplayer.connectionStatus === 'disconnected') {
        multiplayer.joinBattle('Player');
      }
    }, 1000); // Give WebGL time to initialize first
    
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

  // Game challenges
  const challenges = [
    'Move mouse to center',
    'Draw circles with your mouse',
    'Keep mouse in corners for 3s',
    'Trace the edges quickly',
    'Make rapid movements'
  ];

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
    
    // Game logic - check challenges
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const mouseX = newMousePos[0];
    const mouseY = newMousePos[1];
    
    const distanceFromCenter = Math.sqrt((mouseX - centerX) ** 2 + (mouseY - centerY) ** 2);
    const maxDistance = Math.sqrt(centerX ** 2 + centerY ** 2);
    
    // Update challenge progress based on current challenge
    if (challenge.includes('center')) {
      const progress = Math.max(0, 1 - (distanceFromCenter / (maxDistance * 0.3)));
      setChallengeProgress(progress);
      if (progress > 0.8) {
        setScore(prev => prev + 1);
        setStreak(prev => prev + 1);
        // Add particle effect
        setParticles(prev => [...prev, { x: mouseX, y: mouseY, life: 1.0 }]);
      }
    }
    
    // Send to multiplayer if connected
    if (multiplayer.isConnected) {
      multiplayer.sendMousePosition(newMousePos[0], newMousePos[1]);
    }
  }, [multiplayer, challenge]);

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

  // Sync shader changes from multiplayer
  useEffect(() => {
    if (multiplayer.room?.currentShader !== undefined && multiplayer.room.currentShader !== currentShader) {
      console.log('🔄 Syncing shader from multiplayer:', multiplayer.room.currentShader);
      setCurrentShader(multiplayer.room.currentShader);
    }
  }, [multiplayer.room?.currentShader, currentShader]);

  // Auto-cycle disabled when connected to multiplayer (server controls turns)
  useEffect(() => {
    if (!autoCycle || multiplayer.isConnected) return;
    
    const interval = setInterval(() => {
      setCurrentShader((prev) => {
        const nextShader = (prev + 1) % SHADERS.length;
        return nextShader;
      });
    }, 45000); // 45 seconds
    
    return () => clearInterval(interval);
  }, [autoCycle, multiplayer.isConnected]);

  // Particle system and challenge rotation
  useEffect(() => {
    const interval = setInterval(() => {
      // Update particles
      setParticles(prev => prev.map(p => ({ ...p, life: p.life - 0.02 })).filter(p => p.life > 0));
      
      // Rotate challenges every 10 seconds
      if (Math.random() < 0.1) {
        setChallenge(challenges[Math.floor(Math.random() * challenges.length)]);
        setChallengeProgress(0);
      }
    }, 100);
    
    return () => clearInterval(interval);
  }, [challenges]);

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
        <div className="game-title">🎮 SHADER ARENA</div>
        <div className="room-info">
          <span className="score-display">⚡ {score}</span>
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

      {/* Challenge Panel */}
      <div className={`shader-panel ${!showHUD ? 'hidden' : ''}`}>
        <div className="shader-name">#{currentShader + 1} {NAMES[currentShader]}</div>
        <div className="shader-challenge">🎯 {challenge}</div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${challengeProgress * 100}%` }}
          />
        </div>
      </div>

      {/* Particles */}
      {particles.map((particle, i) => (
        <div
          key={i}
          className="particle"
          style={{
            position: 'fixed',
            left: `${(particle.x / (canvasRef.current?.width || 1)) * 100}%`,
            top: `${(particle.y / (canvasRef.current?.height || 1)) * 100}%`,
            opacity: particle.life,
            transform: `scale(${particle.life})`,
            pointerEvents: 'none',
            zIndex: 1000
          }}
        >
          ✨
        </div>
      ))}

      {/* Control Panel */}
      <div className={`control-panel ${!showHUD ? 'hidden' : ''}`}>
        <div className="shader-selector">
          {SHADERS.map((_, index) => (
            <button
              key={index}
              className={`shader-btn ${index === currentShader ? 'active' : ''}`}
              onClick={() => {
                setCurrentShader(index);
                setAutoCycle(false); // Disable auto-cycle when manually selected
                setTimeout(() => setAutoCycle(true), 10000); // Re-enable after 10 seconds
                if (multiplayer.isConnected) {
                  multiplayer.changeShader(index);
                }
              }}
              title={NAMES[index]}
            >
              {index + 1}
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
            <div className="join-battle-form">
              <button
                onClick={() => {
                  setIsJoiningBattle(true);
                  multiplayer.joinBattle('Player');
                }}
                disabled={isJoiningBattle || multiplayer.connectionStatus === 'connecting'}
                className="join-btn"
              >
                {multiplayer.connectionStatus === 'connecting' ? '🟡' : '🚀'}
              </button>
            </div>
          ) : (
            <button
              onClick={multiplayer.disconnect}
              className="disconnect-btn"
            >
              🔌
            </button>
          )}
        </div>
      </div>

    </>
  );
};

export default App;