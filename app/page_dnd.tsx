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
import { useGameStateManager, PlayerAction } from './hooks/useGameStateManager';
import { Character, GameRoom, ChatMessage, DiceRoll } from './types/dnd';

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
    sendChatMessage
  } = useDnDWebSocket(wsUrl);

  // Update global server state when hook state changes
  useEffect(() => {
    if (hookGlobalState) {
      setGlobalServerState(hookGlobalState);
      // Reset player turn state when turn phase changes to player_turns
      if (hookGlobalState.turnPhase === 'player_turns' && !hasPlayerActedThisTurn) {
        setHasPlayerActedThisTurn(false);
      }
    }
  }, [hookGlobalState]);

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

  // Update game state based on current room state - Global Server Mode
  useEffect(() => {
    if (status === 'connected' && playerId) {
      // Global server: players can play without characters or create one if they want
      if (userCharacter) {
        dispatch({ type: 'SET_CHARACTER', payload: userCharacter });
      }
      dispatch({ type: 'SET_PHASE', payload: 'playing' });
    } else if (status === 'disconnected') {
      dispatch({ type: 'SET_PHASE', payload: 'login' });
    }
  }, [status, playerId, userCharacter, dispatch]);

  // Initialize Game State Manager for enhanced LLM integration
  const gameStateManager = useGameStateManager(
    {
      playerTurnDuration: globalServerState.playerTurnDuration || 15000,
      aiProcessingTimeout: 10000,
      maxActionsPerTurn: 5,
      contextWindowSize: 20,
      enableActionBatching: true,
    },
    // State update callback
    (newState) => {
      console.log('🎲 Game state updated:', newState);
      // Here you could sync with your existing state management
    },
    // Process actions callback - integrate with your existing AI system
    async (actions: PlayerAction[], context) => {
      console.log('⚙️ Processing actions batch:', actions);
      
      // Build comprehensive context for AI
      const actionDescriptions = actions.map(a => `${a.playerName}: ${a.action}`).join('\n');
      const recentEvents = context.narrative.recentEvents.slice(-5).join('\n');
      const memoryContext = actions
        .filter(a => a.data?.memory)
        .map(a => `Memory: ${a.data.memory.text}`)
        .join('\n');

      const fullPrompt = `
GAME STATE UPDATE - Turn ${context.turnId}

Recent Events:
${recentEvents}

Current Player Actions:
${actionDescriptions}

Character Memory Context:
${memoryContext}

Current Scene: ${context.environment.currentScene}
Weather: ${context.environment.weather}
Lighting: ${context.environment.lighting}

Please respond with narrative continuation and any character/environmental changes.
      `.trim();

      try {
        // Use your existing sendPlayerAction but with enhanced context
        await sendPlayerAction(fullPrompt);
        console.log('✅ AI processing request sent');
      } catch (error) {
        console.error('❌ AI processing failed:', error);
        throw error;
      }
    }
  );

  // Track AI responses and integrate with GameStateManager
  useEffect(() => {
    if (chatMessages.length > 0) {
      const latestMessage = chatMessages[chatMessages.length - 1];
      if (latestMessage.playerName === 'DM' && latestMessage.type === 'system') {
        // Apply AI response to game state manager
        gameStateManager.applyAIResponse(latestMessage.content);
        
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
  }, [chatMessages, globalServerState.turnStartTime, gameStateManager]);

  const handleLogin = () => {
    if (playerName.trim()) {
      localStorage.setItem('dnd_player_name', playerName.trim());
      connect(playerName.trim());
      // Skip lobby and go straight to global server
      dispatch({ type: 'SET_PHASE', payload: 'playing' });
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
    if (actionInput.trim() && gameStateManager.canAddAction) {
      const success = gameStateManager.addAction({
        playerId: playerId || 'unknown',
        playerName: playerName,
        type: 'ability',
        action: actionInput.trim(),
      });

      if (success) {
        setActionInput('');
        setHasPlayerActedThisTurn(true);
        
        // Track for debugging
        const currentTurnId = `turn_${globalServerState.turnStartTime}`;
        setDebugPrompts(prev => [...prev, {
          id: `input_${Date.now()}`,
          type: 'user_input',
          content: `[ACTION] ${actionInput.trim()}`,
          timestamp: Date.now(),
          turnId: currentTurnId,
          processed: false
        }]);
      } else {
        console.warn('Could not add action - game state does not allow it');
      }
    }
  };

  const handleSendTalk = async () => {
    if (talkInput.trim() && gameStateManager.canAddAction) {
      const success = gameStateManager.addAction({
        playerId: playerId || 'unknown',
        playerName: playerName,
        type: 'dialogue',
        action: `"${talkInput.trim()}"`,
      });

      if (success) {
        setTalkInput('');
        setHasPlayerActedThisTurn(true);
        
        // Track for debugging
        const currentTurnId = `turn_${globalServerState.turnStartTime}`;
        setDebugPrompts(prev => [...prev, {
          id: `input_${Date.now()}`,
          type: 'user_input',
          content: `[TALK] ${talkInput.trim()}`,
          timestamp: Date.now(),
          turnId: currentTurnId,
          processed: false
        }]);
      } else {
        console.warn('Could not add dialogue - game state does not allow it');
      }
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
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Your character name"
              className="w-full p-4 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
              maxLength={50}
            />
            
            <button
              onClick={handleLogin}
              disabled={!playerName.trim() || status === 'connecting'}
              className="w-full p-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 text-white rounded font-semibold transition-colors"
            >
              {status === 'connecting' ? 'Connecting...' : 'Enter the Realm'}
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
              🔐 Login with Account
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
    return (
      <div className="min-h-screen text-white relative overflow-auto">
        <FireShaderBackground 
          setting="tavern"
          location="The Eternal Tavern"
        />
        
        {/* Game HUD */}
        <GameHUD
          onToggleModal={(modal) => dispatch({ type: 'SET_MODAL', payload: modal })}
          onUpdateCharacterHP={updateCharacterHP}
        />
        
        {/* Enhanced Game State Display */}
        <div className="max-w-7xl mx-auto p-4">
          <div className="bg-gray-800 p-4 rounded-lg mb-4 border-l-4 border-l-blue-500">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-blue-400">Game State Manager</h3>
                <p className="text-sm text-gray-300">
                  Turn: {gameStateManager.turnInfo.turnId} • 
                  Phase: <span className={`font-medium ${
                    gameStateManager.turnInfo.phase === 'player_input' ? 'text-green-400' :
                    gameStateManager.turnInfo.phase === 'ai_processing' ? 'text-yellow-400' :
                    gameStateManager.turnInfo.phase === 'ai_response' ? 'text-blue-400' :
                    'text-purple-400'
                  }`}>
                    {gameStateManager.turnInfo.phase.replace('_', ' ')}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-400">
                  Actions: {gameStateManager.turnInfo.actionCount}/{gameStateManager.turnInfo.maxActions}
                </div>
                <div className="text-xs text-gray-500">
                  {Math.ceil(gameStateManager.turnInfo.remaining / 1000)}s remaining
                </div>
                {gameStateManager.turnInfo.isProcessing && (
                  <div className="text-yellow-400 text-xs animate-pulse">🤖 AI Processing...</div>
                )}
              </div>
            </div>
            
            {gameStateManager.pendingActions.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <div className="text-sm text-gray-400 mb-2">Pending Actions:</div>
                <div className="space-y-1">
                  {gameStateManager.pendingActions.map((action, i) => (
                    <div key={action.id} className="text-xs bg-gray-700 p-2 rounded flex justify-between">
                      <span>{action.playerName}: {action.action}</span>
                      <span className="text-gray-400">{action.type}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={gameStateManager.forceProcessActions}
                  className="mt-2 px-3 py-1 bg-yellow-600 hover:bg-yellow-700 rounded text-xs transition-colors"
                >
                  Force Process Now
                </button>
              </div>
            )}
          </div>
          
          {/* Original Timer (kept for compatibility) */}
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

        {/* Header */}
        <div className="bg-black/20 p-4 border-b border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">🎲 The Eternal Tavern</h1>
              <p className="text-gray-400">
                Global D&D Server | {globalServerState.totalPlayers} adventurers online
                {state.inCombat && <span className="ml-2 text-red-400">⚔️ Combat</span>}
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

        {/* Main Game Grid */}
        <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Game World & Movement */}
          <div className="lg:col-span-3 space-y-6">
            {/* Current Scene */}
            <div className="bg-gray-900 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-3">Current Scene</h2>
              <p className="text-gray-300 leading-relaxed">
                The tavern buzzes with activity as adventurers from across the realms gather. 
                The fire crackles warmly in the stone hearth, casting dancing shadows on the 
                wooden walls. A mysterious figure in a hooded cloak sits alone in the corner...
              </p>
            </div>

            {/* Enhanced Movement & Memory HUD */}
            <EnhancedMovementHUD 
              turnNumber={Math.floor((Date.now() - gameStateManager.gameState.timestamp) / 30000) + 1}
              gamePhase={gameStateManager.gameState.phase}
              canAct={gameStateManager.canAddAction}
              initialCharacter={{
                id: playerId || 'player',
                name: userCharacter?.name || playerName || 'Hero',
                speed: 30,
                conditions: [],
                position: { x: 2, y: 2 },
                hitPoints: userCharacter?.hitPoints || { current: 25, maximum: 25 },
                armorClass: userCharacter?.armorClass || 15,
                memory: []
              }}
              onAddAction={gameStateManager.addAction}
              onSaveState={(slot, snapshot) => {
                localStorage.setItem(`dnd_enhanced_save_${slot}`, JSON.stringify(snapshot));
                console.log(`💾 Game saved to slot ${slot}`);
              }}
              onLoadState={(slot) => {
                const saved = localStorage.getItem(`dnd_enhanced_save_${slot}`);
                if (saved) {
                  console.log(`📁 Game loaded from slot ${slot}`);
                  return JSON.parse(saved);
                }
                return null;
              }}
            />

            {/* Action Input Panel */}
            <div className="bg-gray-900 p-6 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Your Turn</h3>
              
              {/* Action Input */}
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Action
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={actionInput}
                      onChange={(e) => setActionInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendAction()}
                      placeholder="Describe what you want to do..."
                      className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400"
                      disabled={hasPlayerActedThisTurn || globalServerState.turnPhase !== 'player_turns'}
                    />
                    <button
                      onClick={handleSendAction}
                      disabled={!actionInput.trim() || hasPlayerActedThisTurn || globalServerState.turnPhase !== 'player_turns'}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 rounded transition-colors"
                    >
                      Act
                    </button>
                  </div>
                </div>

                {/* Talk Input */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Dialogue
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={talkInput}
                      onChange={(e) => setTalkInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendTalk()}
                      placeholder="What do you say?"
                      className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400"
                      disabled={hasPlayerActedThisTurn || globalServerState.turnPhase !== 'player_turns'}
                    />
                    <button
                      onClick={handleSendTalk}
                      disabled={!talkInput.trim() || hasPlayerActedThisTurn || globalServerState.turnPhase !== 'player_turns'}
                      className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-400 rounded transition-colors"
                    >
                      Say
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Chat & Events */}
            <div className="bg-gray-900 rounded-lg overflow-hidden">
              <div className="p-4 bg-gray-800 border-b border-gray-700">
                <h3 className="font-semibold">Game Events & Chat</h3>
              </div>
              <div 
                ref={chatContainerRef}
                className="h-96 overflow-y-auto p-4 space-y-3"
              >
                {chatMessages.map((message, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg ${
                      message.playerName === 'DM'
                        ? 'bg-purple-900/30 border border-purple-700/50'
                        : message.type === 'system'
                        ? 'bg-blue-900/30 border border-blue-700/50'
                        : 'bg-gray-800'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium ${
                            message.playerName === 'DM' 
                              ? 'text-purple-400' 
                              : message.type === 'system'
                              ? 'text-blue-400'
                              : 'text-white'
                          }`}>
                            {message.playerName === 'DM' ? '🎭 DM' : message.playerName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Chat Input */}
              <div className="p-4 bg-gray-800 border-t border-gray-700">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                    placeholder="Chat with other players..."
                    className="flex-1 p-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 text-sm"
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={!chatInput.trim()}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-400 rounded text-sm transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Player Character */}
            {userCharacter && (
              <div className="bg-gray-900 p-4 rounded-lg">
                <h3 className="font-semibold mb-3">{userCharacter.name}</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Level {userCharacter.level} {userCharacter.race} {userCharacter.class}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>HP:</span>
                    <span className="text-red-400">
                      {userCharacter.hitPoints.current}/{userCharacter.hitPoints.maximum}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>AC:</span>
                    <span>{userCharacter.armorClass}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Prof Bonus:</span>
                    <span>+{userCharacter.proficiencyBonus}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Dice Roller */}
            <div className="bg-gray-900 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">🎲 Dice Roller</h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={diceInput}
                  onChange={(e) => setDiceInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleRollDice()}
                  placeholder="1d20"
                  className="flex-1 p-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 text-sm"
                />
                <button
                  onClick={handleRollDice}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded text-sm transition-colors"
                >
                  Roll
                </button>
              </div>
              
              {/* Quick Roll Buttons */}
              <div className="grid grid-cols-2 gap-1 text-xs">
                {['1d20', '1d12', '1d10', '1d8', '1d6', '1d4'].map((dice) => (
                  <button
                    key={dice}
                    onClick={() => setDiceInput(dice)}
                    className="p-1 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                  >
                    {dice}
                  </button>
                ))}
              </div>
            </div>

            {/* Recent Dice Rolls */}
            {diceRolls.length > 0 && (
              <div className="bg-gray-900 p-4 rounded-lg">
                <h3 className="font-semibold mb-3 text-yellow-400">🎲 Recent Rolls</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {diceRolls.slice(-6).map((roll, index) => (
                    <div key={roll.id} className="text-sm bg-gray-800 p-3 rounded border-l-4 border-l-blue-500">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-blue-400 font-medium">{roll.playerName}</span>
                          <span className="text-gray-400 mx-2">•</span>
                          <span className="text-yellow-400 font-mono">{roll.expression}</span>
                        </div>
                        <div className={`font-bold text-lg ${
                          roll.success !== undefined ? 
                            (roll.success ? 'text-green-400' : 'text-red-400') : 
                            'text-white'
                        }`}>
                          {roll.total}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Combat Manager */}
        <CombatManager
          isVisible={showCombatManager}
          onToggle={() => setShowCombatManager(!showCombatManager)}
          onAddAction={gameStateManager.addAction}
          playerId={playerId || 'unknown'}
          playerName={playerName}
          canAct={gameStateManager.canAddAction}
        />

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
