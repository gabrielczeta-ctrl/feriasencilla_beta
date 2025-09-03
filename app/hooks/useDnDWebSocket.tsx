"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { GameRoom, Player, Character, ChatMessage, DiceRoll } from '../types/dnd';

interface DnDWebSocketState {
  // Connection state
  status: 'disconnected' | 'connecting' | 'connected';
  playerId: string | null;
  currentRoom: GameRoom | null;
  
  // Game data
  publicRooms: GameRoom[];
  chatMessages: ChatMessage[];
  diceRolls: DiceRoll[];
  
  // Actions
  connect: (playerName: string) => void;
  disconnect: () => void;
  createRoom: (roomData: CreateRoomData) => Promise<void>;
  joinRoom: (roomId: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  refreshRooms: () => Promise<void>;
  createCharacter: (character: Character) => Promise<void>;
  updateCharacter: (character: Character) => Promise<void>;
  sendPlayerAction: (action: string) => Promise<void>;
  rollDice: (expression: string, type?: string, description?: string) => Promise<void>;
  sendChatMessage: (message: string, type?: string) => Promise<void>;
  sendDMAction: (action: any) => Promise<void>;
}

interface CreateRoomData {
  roomName: string;
  description: string;
  maxPlayers: number;
  isPublic: boolean;
  useAIDM: boolean;
}

export function useDnDWebSocket(wsUrl: string): DnDWebSocketState {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [currentRoom, setCurrentRoom] = useState<GameRoom | null>(null);
  const [publicRooms, setPublicRooms] = useState<GameRoom[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [diceRolls, setDiceRolls] = useState<DiceRoll[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const connect = useCallback((playerName: string) => {
    if (status === 'connected' || !wsUrl) return;
    
    setStatus('connecting');
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('🎲 Connected to D&D server');
        setStatus('connected');
        reconnectAttempts.current = 0;
        
        // Send player connect message
        ws.send(JSON.stringify({
          type: 'player_connect',
          playerId: playerId || crypto.randomUUID(),
          playerName,
          timestamp: Date.now()
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('🔌 Disconnected from D&D server');
        setStatus('disconnected');
        wsRef.current = null;
        
        // Attempt to reconnect
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`🔄 Reconnect attempt ${reconnectAttempts.current}/${maxReconnectAttempts}`);
            connect(playerName);
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setStatus('disconnected');
    }
  }, [wsUrl, status, playerId]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setStatus('disconnected');
    setPlayerId(null);
    setCurrentRoom(null);
    setChatMessages([]);
    setDiceRolls([]);
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        ...message,
        timestamp: Date.now()
      }));
      return true;
    }
    return false;
  }, []);

  const handleMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'player_connected':
        setPlayerId(message.playerId);
        break;

      case 'room_created':
      case 'room_joined':
        setCurrentRoom(message.room);
        if (message.room.gameState?.chatLog) {
          setChatMessages(message.room.gameState.chatLog);
        }
        if (message.room.gameState?.dice) {
          setDiceRolls(message.room.gameState.dice);
        }
        break;

      case 'player_joined':
      case 'player_left':
        if (message.room) {
          setCurrentRoom(message.room);
        }
        break;

      case 'rooms_list':
        setPublicRooms(message.rooms || []);
        break;

      case 'character_created':
        if (currentRoom) {
          const updatedRoom = { ...currentRoom };
          const player = updatedRoom.players.find(p => p.id === message.playerId);
          if (player) {
            player.character = message.character;
            setCurrentRoom(updatedRoom);
          }
        }
        break;

      case 'character_updated':
        if (currentRoom) {
          const updatedRoom = { ...currentRoom };
          const player = updatedRoom.players.find(p => p.id === message.playerId);
          if (player) {
            player.character = message.character;
            setCurrentRoom(updatedRoom);
          }
        }
        break;

      case 'game_started':
        setCurrentRoom(message.room);
        break;

      case 'action_processed':
        setChatMessages(prev => [...prev, message.action]);
        if (message.dmResponse) {
          setChatMessages(prev => [...prev, message.dmResponse]);
        }
        break;

      case 'dice_rolled':
        setDiceRolls(prev => {
          const newRolls = [...prev, message.roll];
          // Keep only last 50 rolls
          return newRolls.slice(-50);
        });
        break;

      case 'chat_message':
        setChatMessages(prev => {
          const newMessages = [...prev, message.message];
          // Keep only last 100 messages
          return newMessages.slice(-100);
        });
        break;

      case 'player_disconnected':
        if (currentRoom) {
          const updatedRoom = { ...currentRoom };
          const player = updatedRoom.players.find(p => p.id === message.playerId);
          if (player) {
            player.isOnline = false;
            setCurrentRoom(updatedRoom);
          }
        }
        break;

      case 'error':
        console.error('Server error:', message.message);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }, [currentRoom]);

  // Actions
  const createRoom = useCallback(async (roomData: CreateRoomData): Promise<void> => {
    if (!sendMessage({
      type: 'create_room',
      ...roomData
    })) {
      throw new Error('Not connected to server');
    }
  }, [sendMessage]);

  const joinRoom = useCallback(async (roomId: string): Promise<void> => {
    if (!sendMessage({
      type: 'join_room',
      roomId,
      playerName: 'Player' // Could be parameterized
    })) {
      throw new Error('Not connected to server');
    }
  }, [sendMessage]);

  const leaveRoom = useCallback(async (): Promise<void> => {
    if (!sendMessage({
      type: 'leave_room'
    })) {
      throw new Error('Not connected to server');
    }
    setCurrentRoom(null);
    setChatMessages([]);
    setDiceRolls([]);
  }, [sendMessage]);

  const refreshRooms = useCallback(async (): Promise<void> => {
    if (!sendMessage({
      type: 'list_rooms'
    })) {
      throw new Error('Not connected to server');
    }
  }, [sendMessage]);

  const createCharacter = useCallback(async (character: Character): Promise<void> => {
    if (!sendMessage({
      type: 'create_character',
      character
    })) {
      throw new Error('Not connected to server');
    }
  }, [sendMessage]);

  const updateCharacter = useCallback(async (character: Character): Promise<void> => {
    if (!sendMessage({
      type: 'update_character',
      character
    })) {
      throw new Error('Not connected to server');
    }
  }, [sendMessage]);

  const sendPlayerAction = useCallback(async (action: string): Promise<void> => {
    if (!sendMessage({
      type: 'player_action',
      action
    })) {
      throw new Error('Not connected to server');
    }
  }, [sendMessage]);

  const rollDice = useCallback(async (expression: string, type: string = 'custom', description?: string): Promise<void> => {
    if (!sendMessage({
      type: 'dice_roll',
      expression,
      rollType: type,
      description
    })) {
      throw new Error('Not connected to server');
    }
  }, [sendMessage]);

  const sendChatMessage = useCallback(async (message: string, messageType: string = 'chat'): Promise<void> => {
    if (!sendMessage({
      type: 'chat_message',
      message,
      messageType
    })) {
      throw new Error('Not connected to server');
    }
  }, [sendMessage]);

  const sendDMAction = useCallback(async (action: any): Promise<void> => {
    if (!sendMessage({
      type: 'dm_action',
      action
    })) {
      throw new Error('Not connected to server');
    }
  }, [sendMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    playerId,
    currentRoom,
    publicRooms,
    chatMessages,
    diceRolls,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    leaveRoom,
    refreshRooms,
    createCharacter,
    updateCharacter,
    sendPlayerAction,
    rollDice,
    sendChatMessage,
    sendDMAction
  };
}