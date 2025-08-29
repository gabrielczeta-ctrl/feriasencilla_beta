import { useState, useEffect, useCallback, useRef } from 'react';
import io from 'socket.io-client';

type Socket = ReturnType<typeof io>;

interface Player {
  id: string;
  name: string;
  joinedAt: string;
  score: number;
  isActive: boolean;
}

interface AsciiCharacter {
  id: string;
  playerId: string;
  character: string;
  x: number;
  y: number;
  asciiType: number;
  createdAt: number;
  expiresAt: number;
}

interface Room {
  id: string;
  playerCount: number;
  players: Player[];
  currentShader: number;
  gameState: 'waiting' | 'playing' | 'finished' | 'transitioning';
  mousePositions: Record<string, { x: number; y: number; timestamp: number }>;
  currentPlayer?: string;
  queue?: string[];
  timeRemaining?: number;
  asciiCharacters?: AsciiCharacter[];
}

interface MultiplayerState {
  isConnected: boolean;
  room: Room | null;
  playerId: string | null;
  playerName: string | null;
  otherPlayers: Player[];
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  isMyTurn: boolean;
}

// Server configuration - auto-detect environment
const SERVER_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001'
  : 'https://feriasencillabeta-production.up.railway.app';

export function useMultiplayer() {
  const [state, setState] = useState<MultiplayerState>({
    isConnected: false,
    room: null,
    playerId: null,
    playerName: null,
    otherPlayers: [],
    connectionStatus: 'disconnected',
    isMyTurn: false
  });

  const socketRef = useRef<Socket | null>(null);
  const mouseUpdateQueue = useRef<{ x: number; y: number }[]>([]);

  // Initialize socket connection
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    
    setState(prev => ({ ...prev, connectionStatus: 'connecting' }));
    
    socketRef.current = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('🟢 Connected to shader battle server:', SERVER_URL);
      setState(prev => ({ 
        ...prev, 
        isConnected: true, 
        connectionStatus: 'connected' 
      }));
    });

    socket.on('connect_error', (error: Error) => {
      console.error('🔴 Connection error:', error);
      setState(prev => ({ 
        ...prev, 
        isConnected: false, 
        connectionStatus: 'disconnected' 
      }));
    });

    socket.on('disconnect', (reason: string) => {
      console.log('🔴 Disconnected from server:', reason);
      setState(prev => ({ 
        ...prev, 
        isConnected: false, 
        connectionStatus: 'disconnected',
        room: null
      }));
    });

    socket.on('room-joined', (data: { room: Room; playerId: string; playerName: string }) => {
      console.log('🎮 Joined room:', data.room.id);
      setState(prev => ({
        ...prev,
        room: data.room,
        playerId: data.playerId,
        playerName: data.playerName,
        otherPlayers: data.room.players.filter(p => p.id !== data.playerId)
      }));
    });

    socket.on('player-joined', (data: { player: Player; room: Room }) => {
      console.log('👥 Player joined:', data.player.name);
      setState(prev => ({
        ...prev,
        room: data.room,
        otherPlayers: data.room.players.filter(p => p.id !== prev.playerId)
      }));
    });

    socket.on('player-left', (data: { playerId: string; playerName: string; room: Room }) => {
      console.log('👋 Player left:', data.playerName);
      setState(prev => ({
        ...prev,
        room: data.room,
        otherPlayers: data.room.players.filter(p => p.id !== prev.playerId)
      }));
    });

    socket.on('shader-changed', (data: { shaderIndex: number; changedBy: string }) => {
      console.log('🎨 Shader changed by other player:', data.shaderIndex);
      setState(prev => ({
        ...prev,
        room: prev.room ? { ...prev.room, currentShader: data.shaderIndex } : null
      }));
    });

    socket.on('game-state-changed', (data: { 
      currentPlayer: string; 
      shaderIndex: number; 
      timeRemaining: number; 
      queue: string[];
      gamePhase: 'waiting' | 'playing' | 'transitioning';
    }) => {
      console.log('🎮 Game state update:', data);
      setState(prev => ({
        ...prev,
        room: prev.room ? { 
          ...prev.room, 
          currentShader: data.shaderIndex,
          gameState: data.gamePhase,
          currentPlayer: data.currentPlayer,
          queue: data.queue,
          timeRemaining: data.timeRemaining
        } : null,
        isMyTurn: data.currentPlayer === prev.playerId
      }));
    });

    socket.on('player-mouse', (data: { playerId: string; x: number; y: number }) => {
      setState(prev => {
        if (!prev.room) return prev;
        
        return {
          ...prev,
          room: {
            ...prev.room,
            mousePositions: {
              ...prev.room.mousePositions,
              [data.playerId]: { x: data.x, y: data.y, timestamp: Date.now() }
            }
          }
        };
      });
    });

    socket.on('ascii-added', (data: { asciiChar: AsciiCharacter; addedBy: string }) => {
      console.log('🔤 ASCII character added:', data.asciiChar.character, 'by', data.addedBy);
    });

    socket.on('ascii-update', (data: { asciiCharacters: AsciiCharacter[] }) => {
      console.log('📝 ASCII update received:', data.asciiCharacters.length, 'characters');
      setState(prev => {
        if (!prev.room) return prev;
        
        return {
          ...prev,
          room: {
            ...prev.room,
            asciiCharacters: data.asciiCharacters
          }
        };
      });
    });

  }, []);

  // Join the global battle room
  const joinBattle = useCallback((playerName?: string) => {
    console.log('🚀 Joining battle...', { playerName, connected: socketRef.current?.connected });
    
    if (!socketRef.current?.connected) {
      setState(prev => ({ ...prev, connectionStatus: 'connecting' }));
      connect();
      
      // Wait for connection then join the global room
      const retryJoin = () => {
        if (socketRef.current?.connected) {
          console.log('✅ Connected! Joining room...');
          socketRef.current.emit('join-room', { roomId: 'GLOBAL', playerName: playerName || 'Player' });
        } else {
          console.log('🔄 Still connecting... retrying...');
          setTimeout(retryJoin, 200);
        }
      };
      setTimeout(retryJoin, 500);
    } else {
      console.log('✅ Already connected, joining room...');
      socketRef.current.emit('join-room', { roomId: 'GLOBAL', playerName: playerName || 'Player' });
    }
  }, [connect]);

  // Send mouse position (throttled)
  const sendMousePosition = useCallback((x: number, y: number) => {
    if (!socketRef.current?.connected) return;
    
    // Simple throttling - only send if queue is empty
    if (mouseUpdateQueue.current.length === 0) {
      mouseUpdateQueue.current.push({ x, y });
      
      setTimeout(() => {
        const latest = mouseUpdateQueue.current.pop();
        mouseUpdateQueue.current = [];
        
        if (latest) {
          socketRef.current?.emit('mouse-move', latest);
        }
      }, 16); // ~60fps
    } else {
      // Update the queued position
      mouseUpdateQueue.current[0] = { x, y };
    }
  }, []);

  // Send ASCII character (only if it's your turn)
  const sendAsciiInput = useCallback((character: string, x: number, y: number) => {
    if (!socketRef.current?.connected) return;
    if (!state.isMyTurn) {
      console.log('🚫 Not your turn - ASCII input blocked');
      return;
    }
    if (!character || character.length !== 1) {
      console.log('🚫 Invalid character - must be single character');
      return;
    }
    socketRef.current.emit('ascii-input', { character, x, y });
  }, [state.isMyTurn]);

  // Disconnect
  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setState({
      isConnected: false,
      room: null,
      playerId: null,
      playerName: null,
      otherPlayers: [],
      connectionStatus: 'disconnected',
      isMyTurn: false
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    ...state,
    connect,
    joinBattle,
    sendMousePosition,
    sendAsciiInput,
    disconnect
  };
}