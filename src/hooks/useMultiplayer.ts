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

interface Room {
  id: string;
  playerCount: number;
  players: Player[];
  currentShader: number;
  gameState: 'waiting' | 'playing' | 'finished';
  mousePositions: Record<string, { x: number; y: number; timestamp: number }>;
}

interface MultiplayerState {
  isConnected: boolean;
  room: Room | null;
  playerId: string | null;
  playerName: string | null;
  otherPlayers: Player[];
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
}

// Using Railway public URL for the deployed server
const SERVER_URL = 'wss://shader-battle-server-production.up.railway.app';

export function useMultiplayer() {
  const [state, setState] = useState<MultiplayerState>({
    isConnected: false,
    room: null,
    playerId: null,
    playerName: null,
    otherPlayers: [],
    connectionStatus: 'disconnected'
  });

  const socketRef = useRef<Socket | null>(null);
  const mouseUpdateQueue = useRef<{ x: number; y: number }[]>([]);

  // Initialize socket connection
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;
    
    setState(prev => ({ ...prev, connectionStatus: 'connecting' }));
    
    socketRef.current = io(SERVER_URL, {
      transports: ['websocket']
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('🟢 Connected to shader battle server');
      setState(prev => ({ 
        ...prev, 
        isConnected: true, 
        connectionStatus: 'connected' 
      }));
    });

    socket.on('disconnect', () => {
      console.log('🔴 Disconnected from server');
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

  }, []);

  // Join the global battle room
  const joinBattle = useCallback((playerName?: string) => {
    if (!socketRef.current?.connected) {
      connect();
      // Wait for connection then join the global room
      setTimeout(() => {
        socketRef.current?.emit('join-room', { roomId: 'GLOBAL', playerName });
      }, 1000);
    } else {
      socketRef.current.emit('join-room', { roomId: 'GLOBAL', playerName });
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

  // Change shader
  const changeShader = useCallback((shaderIndex: number) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit('change-shader', { shaderIndex });
  }, []);

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
      connectionStatus: 'disconnected'
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
    changeShader,
    disconnect
  };
}