"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDnDWebSocket } from './hooks/useDnDWebSocket';
import { useGameState } from './contexts/GameStateContext';
import CharacterSheet from './components/CharacterSheet';
import CharacterCustomization from './components/CharacterCustomization';
import FireShaderBackground from './components/FireShaderBackground';
import GameHUD from './components/GameHUD';
import AuthModal from './components/AuthModal';
import DMUpdateTimer from './components/DMUpdateTimer';
import EnhancedMovementHUD from './components/EnhancedMovementHUD';
import CombatManager from './components/CombatManager';
import { Character, GameRoom, ChatMessage, DiceRoll } from './types/dnd';
import { generateRandomCritter, convertToAnimalSpeak, isGuestCritter } from './utils/animalCritters';
import ConsolidatedActionWidget from './components/ConsolidatedActionWidget';
import PriorityGameDisplay from './components/PriorityGameDisplay';

export default function DnDPlatform() {
  const { state, dispatch } = useGameState();
  const [playerName, setPlayerName] = useState('');
  const [createdCharacter, setCreatedCharacter] = useState<Character | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [actionInput, setActionInput] = useState('');
  const [talkInput, setTalkInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [diceInput, setDiceInput] = useState('1d20');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [hasPlayerActedThisTurn, setHasPlayerActedThisTurn] = useState(false);
  const [showCombatManager, setShowCombatManager] = useState(false);
  const [globalServerState, setGlobalServerState] = useState({
    turnPhase: 'player_turns' as 'player_turns' | 'dm_processing' | 'dm_response',
    turnStartTime: Date.now(),
    playerTurnDuration: 15000,
    dmUpdateInterval: 30000,
    playersWhoActed: 0,
    totalPlayers: 1
  });
  const [createRoomData, setCreateRoomData] = useState({
    roomName: '',
    description: '',
    maxPlayers: 6,
    isPublic: true,
    useAIDM: true
  });

  // Debug tracking for AI prompts and responses
  const [debugPrompts, setDebugPrompts] = useState<Array<{
    id: string;
    type: 'user_input' | 'ai_response';
    content: string;
    timestamp: number;
    turnId: string;
    processed: boolean;
  }>>([]);

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
  
  const {
    status,
    playerId,
    currentRoom,
    isAuthenticated,
    userCharacter,
    globalServerState: hookGlobalState,
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
    generateEquipment,
    generateLoot
  } = useDnDWebSocket(wsUrl);

  // Update global server state when hook state changes
  useEffect(() => {
    if (hookGlobalState) {
      const previousPhase = globalServerState.turnPhase;
      setGlobalServerState(hookGlobalState);
      
      // Reset player turn state when turn phase changes to player_turns
      if (hookGlobalState.turnPhase === 'player_turns' && previousPhase !== 'player_turns') {
        console.log('🎮 Turn phase: player_turns - 📝 Player turn phase started! You have 15 seconds to send your action.');
        setHasPlayerActedThisTurn(false);
      } else if (hookGlobalState.turnPhase === 'dm_processing') {
        console.log('🎮 Turn phase: dm_processing - 🤖 DM is processing your actions...');
      }
    }
  }, [hookGlobalState, globalServerState.turnPhase]);

  // Reset turn state when new turn starts
  useEffect(() => {
    if (globalServerState.turnPhase === 'player_turns') {
      setHasPlayerActedThisTurn(false);
    }
  }, [globalServerState.turnStartTime]);

  // Initialize player name from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedName = localStorage.getItem('dnd_player_name');
      if (savedName) {
        setPlayerName(savedName);
      }
    }
  }, []);

  // Auto-connect to WebSocket server for authentication
  useEffect(() => {
    if (status === 'disconnected' && state.phase === 'login') {
      console.log('🔄 Auto-connecting to server for authentication...');
      // Connect with player name if available, otherwise temp name
      const connectName = playerName.trim() || 'temp-user-for-auth';
      connect(connectName);
    }
  }, [status, state.phase, connect, playerName]);

  // Send character to server when guest enters playing phase
  useEffect(() => {
    if (status === 'connected' && state.playerCharacter && state.phase === 'playing' && !isAuthenticated) {
      console.log('🐾 Sending guest character to server:', state.playerCharacter.name);
      createCharacter(state.playerCharacter).catch(error => {
        console.error('❌ Failed to send guest character to server:', error);
        // If character creation fails, show error and go back to character choice
        dispatch({ type: 'SET_PHASE', payload: 'guest_character_choice' });
      });
    }
  }, [status, state.playerCharacter, state.phase, isAuthenticated, createCharacter, dispatch]);

  // Handle authenticated user character loading and phase transitions
  useEffect(() => {
    if (status === 'connected') {
      if (isAuthenticated) {
        if (userCharacter) {
          // User has a character, go to playing phase
          console.log('✅ Authenticated user with character, entering playing phase');
          dispatch({ type: 'SET_CHARACTER', payload: userCharacter });
          dispatch({ type: 'SET_PHASE', payload: 'playing' });
        } else {
          // User authenticated but no character, go to character creation
          console.log('✅ Authenticated user without character, entering character creation');
          dispatch({ type: 'SET_PHASE', payload: 'character_creation' });
        }
      } else {
        // Guest user connected - show character choice options
        console.log('🐾 Guest user connected, showing character choice options');
        dispatch({ type: 'SET_PHASE', payload: 'guest_character_choice' });
      }
    }
  }, [isAuthenticated, userCharacter, status, dispatch]);

  // Auto-refresh rooms when in lobby
  useEffect(() => {
    if (state.phase === 'lobby' && status === 'connected') {
      refreshRooms();
      const interval = setInterval(refreshRooms, 5000);
      return () => clearInterval(interval);
    }
  }, [state.phase, status, refreshRooms]);

  // Auto-scroll chat when new messages arrive and auto-scroll is enabled
  useEffect(() => {
    if (state.chatAutoScroll && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages, state.chatAutoScroll]);

  // Update game state based on WebSocket connection status
  useEffect(() => {
    if (status === 'disconnected') {
      dispatch({ type: 'SET_PHASE', payload: 'login' });
    }
    // Don't auto-transition to playing phase - let other useEffects handle proper flow
  }, [status, dispatch]);

  // Track AI responses for debugging
  useEffect(() => {
    if (chatMessages.length > 0) {
      const latestMessage = chatMessages[chatMessages.length - 1];
      if (latestMessage.playerName === 'DM' && latestMessage.type === 'system') {
        const currentTurnId = `turn_${globalServerState.turnStartTime}`;
        setDebugPrompts(prev => {
          // Check if this response is already tracked
          const exists = prev.find(p => p.content === latestMessage.content && p.type === 'ai_response');
          if (!exists) {
            // Mark the most recent unprocessed user input as processed
            const updatedPrompts = prev.map(prompt => {
              if (prompt.type === 'user_input' && !prompt.processed && prompt.turnId === currentTurnId) {
                return { ...prompt, processed: true };
              }
              return prompt;
            });
            
            // Add the AI response
            return [...updatedPrompts, {
              id: `response_${Date.now()}`,
              type: 'ai_response',
              content: latestMessage.content,
              timestamp: latestMessage.timestamp,
              turnId: currentTurnId,
              processed: true
            }];
          }
          return prev;
        });
      }
    }
  }, [chatMessages, globalServerState.turnStartTime]);

  const handleGuestLogin = async () => {
    if (playerName.trim()) {
      localStorage.setItem('dnd_player_name', playerName.trim());
      
      // Connect first, then let the user choose character type
      connect(playerName.trim());
      // Phase will remain 'login' until connection is established
      // Then useEffect will handle the proper flow based on authentication state
    }
  };

  const handleAuthenticatedLogin = async (username: string, password: string) => {
    try {
      await login(username, password);
      setShowAuthModal(false);
      setPlayerName(username);
      // After login, reconnect with proper username
      disconnect();
      setTimeout(() => {
        connect(username);
        // Character will be loaded from server response, phase will be set based on character availability
      }, 500);
    } catch (error) {
      throw error; // Let AuthModal handle the error
    }
  };

  const handleRegistration = async (username: string, password: string) => {
    try {
      await register(username, password);
      setShowAuthModal(false);
      setPlayerName(username);
      // After registration, reconnect with proper username
      // Phase will be set automatically by useEffect based on character availability
      disconnect();
      setTimeout(() => {
        connect(username);
      }, 500);
    } catch (error) {
      throw error; // Let AuthModal handle the error
    }
  };

  const handleCreateRoom = async () => {
    console.log('🏰 Creating room with data:', createRoomData);
    if (createRoomData.roomName.trim()) {
      try {
        console.log('📤 Sending createRoom request...');
        await createRoom(createRoomData);
        console.log('✅ Room creation request sent successfully');
        setCreateRoomData({
          roomName: '',
          description: '',
          maxPlayers: 6,
          isPublic: true,
          useAIDM: true
        });
        // Refresh rooms after creation
        setTimeout(() => {
          console.log('🔄 Refreshing room list...');
          refreshRooms();
        }, 1000);
      } catch (error) {
        console.error('❌ Failed to create room:', error);
      }
    } else {
      console.warn('⚠️ Room name is empty, cannot create room');
    }
  };

  const handleJoinRoom = async (roomId: string) => {
    try {
      await joinRoom(roomId);
    } catch (error) {
      console.error('Failed to join room:', error);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await leaveRoom();
    } catch (error) {
      console.error('Failed to leave room:', error);
    }
  };

  const handleCharacterSave = async (character: Character) => {
    try {
      setCreatedCharacter(character);
      dispatch({ type: 'SET_MODAL', payload: 'none' });
      // Navigate to customization phase after character creation
      dispatch({ type: 'SET_PHASE', payload: 'character_customization' });
    } catch (error) {
      console.error('Failed to create character:', error);
    }
  };

  const handleCustomizationComplete = async (finalCharacter: Character) => {
    try {
      await createCharacter(finalCharacter);
      setCreatedCharacter(null);
      dispatch({ type: 'SET_CHARACTER', payload: finalCharacter });
      // After customization, navigate to playing phase
      dispatch({ type: 'SET_PHASE', payload: 'playing' });
    } catch (error) {
      console.error('Failed to create character:', error);
    }
  };

  const updateCharacterHP = async (change: number) => {
    if (!userCharacter) return;

    const newCurrent = Math.max(0, Math.min(userCharacter.hitPoints.maximum, userCharacter.hitPoints.current + change));
    
    const updatedCharacter = {
      ...userCharacter,
      hitPoints: {
        ...userCharacter.hitPoints,
        current: newCurrent
      }
    };

    try {
      // Send character update to server
      await updateCharacter(updatedCharacter);
      
      // Add a system message for HP changes
      const hpChangeMsg = change > 0 ? 
        `${userCharacter.name} regains ${change} hit points (${newCurrent}/${userCharacter.hitPoints.maximum} HP)` :
        `${userCharacter.name} takes ${Math.abs(change)} damage (${newCurrent}/${userCharacter.hitPoints.maximum} HP)`;
        
      await sendChatMessage(hpChangeMsg, 'system');
      
    } catch (error) {
      console.error('Failed to update character HP:', error);
    }
  };

  const handleSendAction = async () => {
    const canAct = globalServerState.turnPhase === 'player_turns' && !hasPlayerActedThisTurn;
    
    if (actionInput.trim() && canAct) {
      try {
        let processedAction = actionInput.trim();
        
        // Convert guest critter speech to animal sounds
        const currentCharacter = state.playerCharacter || userCharacter;
        if (currentCharacter && isGuestCritter(currentCharacter)) {
          processedAction = convertToAnimalSpeak(processedAction, currentCharacter.race);
          console.log(`🐾 Converted guest action: "${actionInput.trim()}" → "${processedAction}"`);
        }
        
        // Send action directly to server instead of using conflicting state managers
        await sendPlayerAction(processedAction);
        setActionInput('');
        setHasPlayerActedThisTurn(true);
        
        // Track for debugging
        const currentTurnId = `turn_${globalServerState.turnStartTime}`;
        setDebugPrompts(prev => [...prev, {
          id: `input_${Date.now()}`,
          type: 'user_input',
          content: `[ACTION] ${processedAction}`,
          timestamp: Date.now(),
          turnId: currentTurnId,
          processed: false
        }]);

        console.log('✅ Action sent to server:', processedAction);
      } catch (error) {
        console.error('❌ Failed to send action:', error);
        setHasPlayerActedThisTurn(false); // Reset on error
      }
    } else {
      console.warn('Cannot send action:', { 
        hasInput: !!actionInput.trim(),
        canAct,
        turnPhase: globalServerState.turnPhase,
        hasActed: hasPlayerActedThisTurn 
      });
    }
  };

  const handleSendTalk = async () => {
    const canAct = globalServerState.turnPhase === 'player_turns' && !hasPlayerActedThisTurn;
    
    if (talkInput.trim() && canAct) {
      try {
        let processedTalk = talkInput.trim();
        
        // Convert guest critter speech to animal sounds
        const currentCharacter = state.playerCharacter || userCharacter;
        if (currentCharacter && isGuestCritter(currentCharacter)) {
          processedTalk = convertToAnimalSpeak(processedTalk, currentCharacter.race);
          console.log(`🐾 Converted guest dialogue: "${talkInput.trim()}" → "${processedTalk}"`);
        }
        
        // Send dialogue directly to server
        await sendPlayerAction(`"${processedTalk}"`);
        setTalkInput('');
        setHasPlayerActedThisTurn(true);
        
        // Track for debugging
        const currentTurnId = `turn_${globalServerState.turnStartTime}`;
        setDebugPrompts(prev => [...prev, {
          id: `input_${Date.now()}`,
          type: 'user_input',
          content: `[TALK] ${processedTalk}`,
          timestamp: Date.now(),
          turnId: currentTurnId,
          processed: false
        }]);

        console.log('✅ Dialogue sent to server:', processedTalk);
      } catch (error) {
        console.error('❌ Failed to send dialogue:', error);
        setHasPlayerActedThisTurn(false); // Reset on error
      }
    } else {
      console.warn('Cannot send dialogue:', { 
        hasInput: !!talkInput.trim(),
        canAct,
        turnPhase: globalServerState.turnPhase,
        hasActed: hasPlayerActedThisTurn 
      });
    }
  };

  const handleSendChat = async () => {
    if (chatInput.trim()) {
      try {
        await sendChatMessage(chatInput.trim());
        setChatInput('');
      } catch (error) {
        console.error('Failed to send chat:', error);
      }
    }
  };

  const handleRollDice = async () => {
    if (diceInput.trim()) {
      try {
        await rollDice(diceInput.trim());
      } catch (error) {
        console.error('Failed to roll dice:', error);
      }
    }
  };

  // Login Screen
  if (state.phase === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <FireShaderBackground setting="tavern" location="Welcome Hall" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 p-8 rounded-lg shadow-xl max-w-md w-full mx-4"
        >
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🎲 D&D Platform</h1>
            <p className="text-gray-400">Enter your name to begin your adventure</p>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleGuestLogin()}
              placeholder="Your character name"
              className="w-full p-4 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              maxLength={50}
            />
            
            <button
              onClick={handleGuestLogin}
              disabled={!playerName.trim() || status === 'connecting'}
              className="w-full p-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded font-semibold transition-colors"
            >
              {status === 'connecting' ? 'Connecting...' : '🐾 Enter as Guest Critter'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-900 text-gray-400">or</span>
              </div>
            </div>

            <button
              onClick={() => setShowAuthModal(true)}
              className="w-full p-4 bg-purple-600 hover:bg-purple-700 text-white rounded font-semibold transition-colors"
            >
              🔐 Login / Register Account
            </button>
          </div>

          <div className="mt-4 text-center">
            <div className={`inline-flex items-center gap-2 text-sm ${
              status === 'connected' ? 'text-green-400' : 
              status === 'connecting' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              <div className="w-2 h-2 rounded-full bg-current"></div>
              {status === 'connected' ? 'Connected' : 
               status === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </div>
          </div>
        </motion.div>
        
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onLogin={handleAuthenticatedLogin}
          onRegister={handleRegistration}
        />
      </div>
    );
  }

  // Guest Character Choice Screen
  if (state.phase === 'guest_character_choice') {
    const handleCreateCritter = () => {
      // Generate random critter character for guests
      const critterCharacter = generateRandomCritter(playerName.trim());
      
      // Store locally and set in state
      dispatch({ type: 'SET_CHARACTER', payload: critterCharacter });
      console.log(`🐾 Generated guest critter: ${critterCharacter.name} (${critterCharacter.race})`);
      
      // Proceed to playing phase
      dispatch({ type: 'SET_PHASE', payload: 'playing' });
    };

    const handleCreateFullCharacter = () => {
      // Go to full character creation
      dispatch({ type: 'SET_PHASE', payload: 'character_creation' });
    };

    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <FireShaderBackground setting="tavern" location="Character Choice" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900 p-8 rounded-lg shadow-xl max-w-lg w-full mx-4"
        >
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🎭 Choose Your Character</h1>
            <p className="text-gray-400">Welcome {playerName}! How would you like to play?</p>
          </div>

          <div className="space-y-4">
            <button
              onClick={handleCreateCritter}
              className="w-full p-6 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">🐾</span>
                <div>
                  <div className="font-bold text-lg">Quick Start - Animal Critter</div>
                  <div className="text-green-200 text-sm">Play as a cute animal companion (mouse, cat, rabbit, etc.)</div>
                  <div className="text-green-300 text-xs mt-1">⚡ Jump right in! Perfect for beginners</div>
                </div>
              </div>
            </button>

            <button
              onClick={handleCreateFullCharacter}
              className="w-full p-6 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <span className="text-3xl">⚔️</span>
                <div>
                  <div className="font-bold text-lg">Full D&D Character</div>
                  <div className="text-purple-200 text-sm">Create a complete D&D 5e character with stats, class & equipment</div>
                  <div className="text-purple-300 text-xs mt-1">🎲 Full customization for experienced players</div>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-6 text-center">
            <button
              onClick={() => setShowAuthModal(true)}
              className="text-gray-400 hover:text-gray-300 transition-colors duration-200 text-sm"
            >
              🔐 Or login to your account
            </button>
          </div>

          <div className="mt-4 text-center">
            <div className={`inline-flex items-center gap-2 text-sm ${
              status === 'connected' ? 'text-green-400' : 
              status === 'connecting' ? 'text-yellow-400' : 'text-red-400'
            }`}>
              <div className="w-2 h-2 rounded-full bg-current"></div>
              {status === 'connected' ? 'Connected to server' : 
               status === 'connecting' ? 'Connecting...' : 'Disconnected'}
            </div>
          </div>
        </motion.div>
        
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onLogin={handleAuthenticatedLogin}
          onRegister={handleRegistration}
        />
      </div>
    );
  }

  // Room Lobby
  if (state.phase === 'lobby') {
    return (
      <div className="min-h-screen text-white p-4 relative">
        <FireShaderBackground setting="tavern" location="Campaign Lobby" />
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">🏰 Campaign Lobby</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Welcome, {playerName}</span>
                {isAuthenticated && (
                  <span className="px-2 py-1 bg-green-900/30 text-green-400 text-xs rounded border border-green-500/30">
                    🔐 Authenticated {userCharacter && '• Character Saved'}
                  </span>
                )}
              </div>
              <button
                onClick={disconnect}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create Room */}
            <div className="bg-gray-900 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Create New Campaign</h2>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Campaign Name"
                  value={createRoomData.roomName}
                  onChange={(e) => setCreateRoomData(prev => ({ ...prev, roomName: e.target.value }))}
                  className="w-full p-3 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400"
                  maxLength={50}
                />
                <textarea
                  placeholder="Description (optional)"
                  value={createRoomData.description}
                  onChange={(e) => setCreateRoomData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full p-3 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 h-24 resize-none"
                  maxLength={200}
                />
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createRoomData.isPublic}
                      onChange={(e) => setCreateRoomData(prev => ({ ...prev, isPublic: e.target.checked }))}
                    />
                    Public
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={createRoomData.useAIDM}
                      onChange={(e) => setCreateRoomData(prev => ({ ...prev, useAIDM: e.target.checked }))}
                    />
                    AI Dungeon Master
                  </label>
                </div>
                <button
                  onClick={handleCreateRoom}
                  disabled={!createRoomData.roomName.trim()}
                  className="w-full p-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 rounded transition-colors"
                >
                  Create Campaign
                </button>
              </div>
            </div>

            {/* Public Rooms */}
            <div className="lg:col-span-2 bg-gray-900 p-6 rounded-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Public Campaigns</h2>
                <button
                  onClick={refreshRooms}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors text-sm"
                >
                  Refresh
                </button>
              </div>
              
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {publicRooms.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No public campaigns available</p>
                ) : (
                  publicRooms.map((room) => (
                    <motion.div
                      key={room.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-gray-800 p-4 rounded border border-gray-700 hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{room.name}</h3>
                          {room.description && (
                            <p className="text-gray-400 text-sm mt-1">{room.description}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                            <span>Players: {room.players?.length || 0}/{room.maxPlayers || 0}</span>
                            <span>Phase: {room.gameState?.phase || 'Waiting'}</span>
                            {room.settings?.useAIDM && <span className="text-purple-400">🤖 AI DM</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleJoinRoom(room.id)}
                          disabled={(room.players?.length || 0) >= (room.maxPlayers || 0)}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 rounded transition-colors"
                        >
                          Join
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Character Creation
  if (state.phase === 'character_creation') {
    return (
      <div className="min-h-screen text-white p-4 relative overflow-auto">
        <FireShaderBackground setting="tavern" location="Character Creation" />
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">⚔️ Character Creation</h1>
              <p className="text-gray-400 mt-1">
                Campaign: {currentRoom?.name} | Players: {currentRoom?.players?.length || 0}/{currentRoom?.maxPlayers}
              </p>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
            >
              Leave Campaign
            </button>
          </div>

          <CharacterSheet
            onSave={handleCharacterSave}
            onCancel={() => handleLeaveRoom()}
          />

          {/* Other Players Status */}
          {currentRoom && (
            <div className="mt-6 bg-gray-900 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Party Members</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(currentRoom.players || []).filter(p => p.role === 'player').map((player) => (
                  <div key={player.id} className="bg-gray-800 p-3 rounded">
                    <div className="flex items-center justify-between">
                      <span className={player.isOnline ? 'text-white' : 'text-gray-400'}>
                        {player.character?.name || player.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {player.character ? (
                          <span className="text-green-400 text-xs">✓ Ready</span>
                        ) : (
                          <span className="text-yellow-400 text-xs">⏳ Creating</span>
                        )}
                        <div className={`w-2 h-2 rounded-full ${
                          player.isOnline ? 'bg-green-400' : 'bg-gray-400'
                        }`}></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Character Customization Phase
  if (state.phase === 'character_customization' && createdCharacter) {
    return (
      <div className="min-h-screen text-white p-4 relative overflow-auto">
        <FireShaderBackground setting="tavern" location="Character Customization" />
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">🎒 Character Customization</h1>
              <p className="text-gray-400 mt-1">
                Customize {createdCharacter.name} - Choose starting equipment and traits
              </p>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
            >
              Leave Campaign
            </button>
          </div>
          <CharacterCustomization
            character={createdCharacter}
            onComplete={handleCustomizationComplete}
            onCancel={() => handleLeaveRoom()}
          />
        </div>
      </div>
    );
  }

  // Playing Phase
  if (state.phase === 'playing') {
    const currentCharacter = state.playerCharacter || userCharacter;
    const currentScene = "The Eternal Tavern";
    const sceneDescription = "The tavern buzzes with activity as adventurers from across the realms gather. The fire crackles warmly in the stone hearth, casting dancing shadows on the wooden walls. A mysterious hooded figure sits alone in the corner, while the barkeep serves drinks to a group of chattering halflings. The air is thick with the scent of ale, roasted meat, and adventure.";

    return (
      <div className="min-h-screen text-white relative">
        <FireShaderBackground 
          setting="tavern"
          location="The Eternal Tavern"
        />
        
        {/* Game HUD */}
        <GameHUD
          onToggleModal={(modal) => dispatch({ type: 'SET_MODAL', payload: modal })}
          onUpdateCharacterHP={updateCharacterHP}
        />

        {/* Header */}
        <div className="bg-black/20 backdrop-blur-sm p-4 border-b border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">🎲 The Eternal Tavern</h1>
              <p className="text-gray-300">
                Global D&D Server • {globalServerState.totalPlayers} adventurers online
                {isAuthenticated && userCharacter ? (
                  <span className="ml-2 text-green-400">• Character Saved</span>
                ) : !isAuthenticated ? (
                  <span className="ml-2 text-purple-400">• Guest Mode</span>
                ) : null}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCombatManager(true)}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm transition-colors"
                title="Open Combat Manager"
              >
                ⚔️ Combat
              </button>
              <button
                onClick={() => dispatch({ type: 'TOGGLE_HUD' })}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  state.showHUD 
                    ? 'bg-purple-600 hover:bg-purple-700' 
                    : 'bg-gray-600 hover:bg-gray-500'
                }`}
                title={state.showHUD ? 'Hide HUD' : 'Show HUD'}
              >
                {state.showHUD ? '🎮 HUD ON' : '🎮 HUD OFF'}
              </button>
              <button
                onClick={() => disconnect()}
                className="px-3 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm transition-colors"
              >
                Leave Server
              </button>
            </div>
          </div>
        </div>

        {/* Main Game Layout */}
        <div className="max-w-7xl mx-auto p-4">
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            
            {/* Priority Game Display - Takes up 2 columns */}
            <div className="xl:col-span-2">
              <PriorityGameDisplay
                currentScene={currentScene}
                sceneDescription={sceneDescription}
                chatMessages={chatMessages}
                character={currentCharacter}
                turnPhase={globalServerState.turnPhase}
                turnStartTime={globalServerState.turnStartTime}
                playerTurnDuration={globalServerState.playerTurnDuration}
                dmUpdateInterval={globalServerState.dmUpdateInterval}
              />
            </div>

            {/* Consolidated Action Widget - Sidebar */}
            <div className="xl:col-span-1">
              <ConsolidatedActionWidget
                character={currentCharacter}
                isAuthenticated={isAuthenticated}
                turnPhase={globalServerState.turnPhase}
                hasPlayerActedThisTurn={hasPlayerActedThisTurn}
                onSendAction={async (action: string) => {
                  // Process the action with animal speak conversion if needed
                  let processedAction = action;
                  if (currentCharacter && isGuestCritter(currentCharacter)) {
                    processedAction = convertToAnimalSpeak(action, currentCharacter.race);
                  }
                  await sendPlayerAction(processedAction);
                  setHasPlayerActedThisTurn(true);
                }}
                onRollDice={async (expression: string, type: string, description?: string) => {
                  await rollDice(expression, type, description);
                }}
                onSendChat={async (message: string, type: string) => {
                  await sendChatMessage(message, type);
                }}
                onGenerateEquipment={currentCharacter ? async () => {
                  await generateEquipment(currentCharacter);
                } : undefined}
                onGenerateLoot={async () => {
                  const context = {
                    currentScene: currentScene,
                    averageLevel: currentCharacter?.level || 1,
                    recentActions: "Exploring the mysterious tavern"
                  };
                  await generateLoot(context, 'normal');
                }}
              />
            </div>

          </div>

          {/* DMUpdateTimer - Fixed at bottom */}
          <div className="fixed bottom-4 left-4 z-40">
            <DMUpdateTimer
              turnPhase={globalServerState.turnPhase}
              turnStartTime={globalServerState.turnStartTime}
              playerTurnDuration={globalServerState.playerTurnDuration}
              dmUpdateInterval={globalServerState.dmUpdateInterval}
              playersWhoActed={globalServerState.playersWhoActed}
              totalPlayers={globalServerState.totalPlayers}
              hasPlayerActed={hasPlayerActedThisTurn}
            />
          </div>

          {/* Debug Panel - Optional */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 bg-gray-900/50 backdrop-blur-md border border-gray-700/50 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-2 text-gray-400">🐛 Debug Info</h3>
              <div className="text-xs text-gray-500 space-y-1">
                <div>Phase: {state.phase}</div>
                <div>Turn Phase: {globalServerState.turnPhase}</div>
                <div>Character: {currentCharacter ? `${currentCharacter.name} (${currentCharacter.race} ${currentCharacter.class})` : 'None'}</div>
                <div>Has Acted: {hasPlayerActedThisTurn.toString()}</div>
                <div>Chat Messages: {chatMessages.length}</div>
                <div>Debug Prompts: {debugPrompts.length}</div>
              </div>
            </div>
          )}

        </div>

        {/* Modals */}
        <AnimatePresence>
          {showCombatManager && (
            <CombatManager
              isVisible={showCombatManager}
              onToggle={() => setShowCombatManager(false)}
              playerId={playerId || ''}
              playerName={playerName || ''}
              canAct={globalServerState.turnPhase === 'player_turns' && !hasPlayerActedThisTurn}
            />
          )}
        </AnimatePresence>

        {/* Authentication Modal */}
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onLogin={async (username, password) => {
            await login(username, password);
            setPlayerName(username);
          }}
          onRegister={async (username, password) => {
            await register(username, password);
            setPlayerName(username);
          }}
        />
      </div>
    );
  }

  return null;
}
