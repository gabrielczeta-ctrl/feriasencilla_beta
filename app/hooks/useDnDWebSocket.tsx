"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { GameRoom, Player, Character, ChatMessage, DiceRoll } from '../types/dnd';

interface DnDWebSocketState {
  // Connection state
  status: 'disconnected' | 'connecting' | 'connected';
  playerId: string | null;
  currentRoom: GameRoom | null;
  isAuthenticated: boolean;
  userCharacter: Character | null;
  
  // Global server state
  globalServerState: {
    turnPhase: 'player_turns' | 'dm_processing' | 'dm_response';
    turnStartTime: number;
    playerTurnDuration: number;
    dmUpdateInterval: number;
    playersWhoActed: number;
    totalPlayers: number;
  } | null;
  
  // Game data
  publicRooms: GameRoom[];
  chatMessages: ChatMessage[];
  diceRolls: DiceRoll[];
  
  // Actions
  connect: (playerName: string) => void;
  disconnect: () => void;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
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
  generateEquipment: (character: Character) => Promise<void>;
  generateLoot: (context: any, difficulty?: string) => Promise<void>;
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userCharacter, setUserCharacter] = useState<Character | null>(null);
  const [globalServerState, setGlobalServerState] = useState<{
    turnPhase: 'player_turns' | 'dm_processing' | 'dm_response';
    turnStartTime: number;
    playerTurnDuration: number;
    dmUpdateInterval: number;
    playersWhoActed: number;
    totalPlayers: number;
  } | null>(null);
  
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
        setIsAuthenticated(message.isAuthenticated || false);
        if (message.character) {
          setUserCharacter(message.character);
        }
        // Auto-join global room
        if (message.globalRoom) {
          setCurrentRoom(message.globalRoom.room);
          if (message.globalRoom.storyContext) {
            setChatMessages(message.globalRoom.storyContext);
          }
        }
        break;

      case 'login_response':
      case 'register_response':
        if (message.success) {
          setIsAuthenticated(true);
          if (message.character) {
            setUserCharacter(message.character);
          }
        }
        // Propagate response to calling component
        if (wsRef.current) {
          (wsRef.current as any).lastAuthResponse = message;
        }
        break;

      case 'turn_phase_change':
        // Handle turn phase changes
        console.log(`🎮 Turn phase: ${message.phase} - ${message.message}`);
        if (message.gameState) {
          setGlobalServerState(message.gameState);
        } else {
          setGlobalServerState(prev => prev ? {
            ...prev,
            turnPhase: message.phase,
            turnStartTime: Date.now(),
            playersWhoActed: 0 // Reset when turn changes
          } : {
            turnPhase: message.phase,
            turnStartTime: Date.now(),
            playerTurnDuration: message.duration || 15000,
            dmUpdateInterval: 30000,
            playersWhoActed: 0,
            totalPlayers: 1
          });
        }
        break;

      case 'game_state_sync':
        // Handle game state synchronization for new connections
        console.log('🔄 Syncing game state:', message.gameState);
        setGlobalServerState(message.gameState);
        break;

      case 'dm_story_update':
        // Handle DM story updates
        if (message.story) {
          setChatMessages(prev => [...prev, message.story]);
        }
        break;

      case 'player_action_queued':
        // Show when another player queues an action
        console.log(`⏰ ${message.playerName} queued action: ${message.action}`);
        break;

      case 'action_submitted':
      case 'action_error':
        // Handle action feedback
        console.log(`💬 Action result: ${message.message}`);
        break;

      case 'welcome_to_global':
        // Handle global room welcome
        if (message.room) {
          setCurrentRoom(message.room);
        }
        if (message.storyContext) {
          setChatMessages(message.storyContext);
        }
        // Initialize global server state
        setGlobalServerState({
          turnPhase: message.currentPhase || 'player_turns',
          turnStartTime: Date.now() - (message.nextTurnIn || 0),
          playerTurnDuration: 15000,
          dmUpdateInterval: 30000,
          playersWhoActed: 0,
          totalPlayers: message.room?.playerCount || 1
        });
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

      case 'equipment_generated':
        // Handle generated equipment - could be used to update character inventory
        console.log('🎒 Equipment generated:', message.equipment);
        // You can dispatch this to a context or state manager
        break;

      case 'loot_generated':
        // Handle generated loot - broadcast to all players
        console.log('💰 Loot generated:', message.loot);
        setChatMessages(prev => [...prev, {
          id: `loot_${Date.now()}`,
          playerId: 'dm',
          content: `🎁 Treasure discovered! ${message.loot.currency?.gold || 0} gold pieces and ${message.loot.equipment?.length || 0} items found!`,
          playerName: 'DM',
          type: 'system',
          timestamp: Date.now()
        } as ChatMessage]);
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
  // Authentication methods
  const login = useCallback(async (username: string, password: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to server'));
        return;
      }

      // Set up response handler
      const responseHandler = () => {
        const response = (wsRef.current as any)?.lastAuthResponse;
        if (response && (response.type === 'login_response')) {
          (wsRef.current as any).lastAuthResponse = null;
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.message || 'Login failed'));
          }
        } else {
          // Wait a bit more
          setTimeout(responseHandler, 100);
        }
      };

      sendMessage({
        type: 'login',
        username,
        password
      });

      // Start checking for response
      setTimeout(responseHandler, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if ((wsRef.current as any)?.lastAuthResponse?.type !== 'login_response') {
          reject(new Error('Login timeout'));
        }
      }, 10000);
    });
  }, [sendMessage]);

  const register = useCallback(async (username: string, password: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to server'));
        return;
      }

      // Set up response handler
      const responseHandler = () => {
        const response = (wsRef.current as any)?.lastAuthResponse;
        if (response && (response.type === 'register_response')) {
          (wsRef.current as any).lastAuthResponse = null;
          if (response.success) {
            resolve();
          } else {
            reject(new Error(response.message || 'Registration failed'));
          }
        } else {
          // Wait a bit more
          setTimeout(responseHandler, 100);
        }
      };

      sendMessage({
        type: 'register',
        username,
        password
      });

      // Start checking for response
      setTimeout(responseHandler, 100);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if ((wsRef.current as any)?.lastAuthResponse?.type !== 'register_response') {
          reject(new Error('Registration timeout'));
        }
      }, 10000);
    });
  }, [sendMessage]);

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
    
    // Real server should now handle action processing with Claude DM
  }, [sendMessage, playerId, handleMessage]);

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

  const generateEquipment = useCallback(async (character: Character): Promise<void> => {
    if (!sendMessage({
      type: 'generate_equipment',
      character
    })) {
      throw new Error('Not connected to server');
    }
  }, [sendMessage]);

  const generateLoot = useCallback(async (context: any, difficulty: string = 'normal'): Promise<void> => {
    if (!sendMessage({
      type: 'generate_loot',
      context,
      difficulty
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
    isAuthenticated,
    userCharacter,
    globalServerState,
    publicRooms,
    chatMessages,
    diceRolls,
    connect,
    disconnect,
    login,
    register,
    createRoom,
    joinRoom,
    leaveRoom,
    refreshRooms,
    createCharacter,
    updateCharacter,
    sendPlayerAction,
    rollDice,
    sendChatMessage,
    sendDMAction,
    generateEquipment,
    generateLoot
  };
}