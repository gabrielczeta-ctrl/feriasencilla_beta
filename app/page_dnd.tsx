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
import { Character, GameRoom, ChatMessage, DiceRoll } from './types/dnd';

export default function DnDPlatform() {
  const { state, dispatch } = useGameState();
  const [playerName, setPlayerName] = useState('');
  const [createdCharacter, setCreatedCharacter] = useState<Character | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [actionInput, setActionInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [diceInput, setDiceInput] = useState('1d20');
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [hasPlayerActedThisTurn, setHasPlayerActedThisTurn] = useState(false);
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
      // After customization, navigate to playing phase if in a room
      if (currentRoom && currentRoom.gameState?.phase === 'playing') {
        dispatch({ type: 'SET_PHASE', payload: 'playing' });
      }
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
    if (actionInput.trim() && !hasPlayerActedThisTurn && globalServerState.turnPhase === 'player_turns') {
      try {
        await sendPlayerAction(actionInput.trim());
        setActionInput('');
        setHasPlayerActedThisTurn(true);
      } catch (error) {
        console.error('Failed to send action:', error);
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
                Campaign: {currentRoom?.name} | Players: {currentRoom?.players.length}/{currentRoom?.maxPlayers}
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
                {currentRoom.players.filter(p => p.role === 'player').map((player) => (
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
    // Global server mode - no current room needed

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
        {/* Global Server Timer */}
        <div className="max-w-7xl mx-auto p-4">
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
              {currentRoom && currentRoom.players.find(p => p.id === playerId)?.role === 'dm' && (
                <button
                  onClick={() => {
                    if (window.confirm('⚠️ DELETE SERVER: This will permanently delete the entire campaign and all data. Are you absolutely sure?')) {
                      // TODO: Implement server deletion
                      console.log('🗑️ DELETE SERVER requested for room:', currentRoom?.id);
                      alert('🚧 Server deletion functionality coming soon!');
                    }
                  }}
                  className="px-3 py-1 bg-red-800 hover:bg-red-900 rounded text-sm transition-colors border border-red-600"
                  title="Delete entire server (DM only)"
                >
                  🗑️ DELETE SERVER
                </button>
              )}
              <button
                onClick={handleLeaveRoom}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
              >
                Leave
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Game Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Scene Description */}
            <div className="bg-gray-900 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-3">Current Scene</h2>
              <p className="text-gray-300 leading-relaxed">
                {currentRoom?.gameState?.story?.sceneDescription || "The adventure awaits..."}
              </p>
            </div>

            {/* Action Input */}
            <div className="bg-gray-900 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-3">What do you do?</h2>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendAction()}
                  placeholder={
                    hasPlayerActedThisTurn 
                      ? "You've already acted this turn. Wait for DM response..." 
                      : globalServerState.turnPhase !== 'player_turns'
                        ? "Wait for your turn to send actions..."
                        : "Describe your action in one sentence..."
                  }
                  className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400"
                  maxLength={500}
                  disabled={hasPlayerActedThisTurn || globalServerState.turnPhase !== 'player_turns'}
                />
                <button
                  onClick={handleSendAction}
                  disabled={
                    !actionInput.trim() || 
                    hasPlayerActedThisTurn || 
                    globalServerState.turnPhase !== 'player_turns'
                  }
                  className={`px-6 py-3 rounded transition-colors font-semibold ${
                    hasPlayerActedThisTurn
                      ? 'bg-green-600 text-white cursor-default'
                      : globalServerState.turnPhase !== 'player_turns'
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : actionInput.trim()
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {hasPlayerActedThisTurn ? '✅ Sent' : globalServerState.turnPhase !== 'player_turns' ? '⏳ Wait' : 'Send'}
                </button>
              </div>
            </div>

            {/* Chat Log */}
            <div className="bg-gray-900 p-6 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold">Adventure Log</h2>
                <button
                  onClick={() => dispatch({ type: 'TOGGLE_CHAT_AUTO_SCROLL' })}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    state.chatAutoScroll 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-gray-600 hover:bg-gray-500'
                  }`}
                  title={state.chatAutoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF'}
                >
                  {state.chatAutoScroll ? '📜 Auto' : '📜 Manual'}
                </button>
              </div>
              <div 
                ref={chatContainerRef}
                className="h-96 overflow-y-auto space-y-2 scroll-smooth">
                {chatMessages.map((message) => (
                  <div key={message.id} className={`p-2 rounded text-sm ${
                    message.type === 'system' ? 'bg-purple-900/30 border-l-4 border-purple-500' :
                    message.type === 'action' ? 'bg-blue-900/30' :
                    message.type === 'dice' ? 'bg-green-900/30' :
                    'bg-gray-800'
                  }`}>
                    <span className="font-semibold text-gray-300">{message.playerName}:</span>
                    <span className="ml-2">{message.content}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 text-xs text-gray-500 text-center">
                Use the Action Input above to interact with the world and NPCs
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Character Info */}
            {userCharacter ? (
              <div className="bg-gray-900 p-4 rounded-lg">
                <h3 className="font-semibold mb-3">Your Character</h3>
                <div className="space-y-2 text-sm">
                  <div className="font-medium">{userCharacter.name}</div>
                  <div className="text-gray-400">
                    Level {userCharacter.level} {userCharacter.race} {userCharacter.class}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-red-400">
                        HP: {userCharacter.hitPoints.current}/{userCharacter.hitPoints.maximum}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateCharacterHP(-1)}
                          disabled={userCharacter.hitPoints.current <= 0}
                          className="w-6 h-6 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:opacity-50 rounded text-xs font-bold transition-colors"
                          title="Take 1 damage"
                        >
                          −
                        </button>
                        <button
                          onClick={() => updateCharacterHP(1)}
                          disabled={userCharacter.hitPoints.current >= userCharacter.hitPoints.maximum}
                          className="w-6 h-6 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:opacity-50 rounded text-xs font-bold transition-colors"
                          title="Heal 1 HP"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className={`w-full bg-gray-700 rounded-full h-2 overflow-hidden`}>
                      <div 
                        className={`h-full transition-all duration-300 ${
                          userCharacter.hitPoints.current <= userCharacter.hitPoints.maximum * 0.25 
                            ? 'bg-red-500' 
                            : userCharacter.hitPoints.current <= userCharacter.hitPoints.maximum * 0.5
                            ? 'bg-yellow-500'
                            : 'bg-green-500'
                        }`}
                        style={{ 
                          width: `${Math.max(0, (userCharacter.hitPoints.current / userCharacter.hitPoints.maximum) * 100)}%` 
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-blue-400">
                    AC: {userCharacter.armorClass}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => dispatch({ type: 'SET_MODAL', payload: 'character-profile' })}
                    className="flex-1 p-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors text-sm font-medium"
                  >
                    👤 Profile
                  </button>
                  <button
                    onClick={() => dispatch({ type: 'SET_MODAL', payload: 'character-sheet' })}
                    className="flex-1 p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-sm"
                  >
                    📄 Edit Sheet
                  </button>
                </div>
                
                {/* Inventory Section */}
                <div className="mt-4 space-y-2">
                  <h4 className="font-medium text-purple-400">🎒 Inventory</h4>
                  {userCharacter.equipment && userCharacter.equipment.length > 0 ? (
                    <div className="space-y-1">
                      {userCharacter.equipment.slice(0, 5).map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-xs bg-gray-800 p-2 rounded">
                          <div className="flex items-center space-x-2">
                            <span className={`w-2 h-2 rounded-full ${
                              item.type === 'weapon' ? 'bg-red-500' :
                              item.type === 'armor' ? 'bg-blue-500' :
                              item.type === 'tool' ? 'bg-yellow-500' :
                              'bg-purple-500'
                            }`}></span>
                            <span className="text-white">{item.name}</span>
                            {item.equipped && <span className="text-green-400">✓</span>}
                          </div>
                          <button
                            onClick={() => {
                              setActionInput(`I use my ${item.name}`);
                            }}
                            className="text-blue-400 hover:text-blue-300 text-xs"
                          >
                            Use
                          </button>
                        </div>
                      ))}
                      {userCharacter.equipment.length > 5 && (
                        <div className="text-xs text-gray-500 text-center">
                          +{userCharacter.equipment.length - 5} more items
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">No equipment yet</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-gray-900 p-4 rounded-lg">
                <h3 className="font-semibold mb-3">⚔️ Character</h3>
                <p className="text-gray-400 text-sm mb-4">
                  Playing as: <span className="text-white font-medium">{playerName || "Anonymous Adventurer"}</span>
                </p>
                <button
                  onClick={() => dispatch({ type: 'SET_PHASE', payload: 'character_creation' })}
                  className="w-full p-3 bg-blue-600 hover:bg-blue-700 rounded transition-colors text-white font-medium"
                >
                  ⚔️ Create Character Sheet
                </button>
                <p className="text-xs text-gray-500 mt-2">
                  Optional: Create a full D&D character with stats, backstory, and abilities
                </p>
              </div>
            )}

            {/* Enhanced Dice Results - Show recent automatic rolls with animations */}
            {diceRolls.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-900 p-4 rounded-lg border border-gray-700"
              >
                <h3 className="font-semibold mb-3 text-yellow-400">🎲 Recent Rolls</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {diceRolls.slice(-6).map((roll, index) => (
                    <motion.div 
                      key={roll.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="text-sm bg-gray-800 p-3 rounded border-l-4 border-l-blue-500 hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-blue-400 font-medium">{roll.playerName}</span>
                          <span className="text-gray-400 mx-2">•</span>
                          <span className="text-yellow-400 font-mono">{roll.expression}</span>
                          {roll.description && (
                            <span className="text-gray-300 text-xs block mt-1">{roll.description}</span>
                          )}
                        </div>
                        <div className="text-right">
                          <div className={`font-bold text-lg ${
                            roll.success !== undefined ? 
                              (roll.success ? 'text-green-400' : 'text-red-400') : 
                              'text-white'
                          }`}>
                            {roll.total}
                          </div>
                          <div className="text-xs space-x-1">
                            {roll.advantage && <span className="text-green-300">👍 ADV</span>}
                            {roll.disadvantage && <span className="text-red-300">👎 DIS</span>}
                            {roll.success !== undefined && (
                              <div className={`${roll.success ? 'text-green-300' : 'text-red-300'} font-medium`}>
                                DC {roll.difficulty} - {roll.success ? '✓ SUCCESS' : '✗ FAILED'}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {roll.results && roll.results.length > 1 && (
                        <div className="text-xs text-gray-400 mt-2">
                          Individual rolls: [{roll.results.join(', ')}]
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Game Status */}
            <div className="bg-gray-900 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Game Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Phase:</span>
                  <span className="capitalize text-green-400">{state.phase}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">HUD:</span>
                  <span className={state.showHUD ? 'text-green-400' : 'text-red-400'}>
                    {state.showHUD ? 'Visible' : 'Hidden'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Auto-scroll:</span>
                  <span className={state.chatAutoScroll ? 'text-green-400' : 'text-yellow-400'}>
                    {state.chatAutoScroll ? 'ON' : 'OFF'}
                  </span>
                </div>
                {state.inCombat && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Combat:</span>
                      <span className="text-red-400">Active ⚔️</span>
                    </div>
                    {state.currentTurn && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Turn:</span>
                        <span className="text-yellow-400">{state.currentTurn}</span>
                      </div>
                    )}
                  </>
                )}
                {state.activeModal !== 'none' && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Modal:</span>
                    <span className="text-purple-400 capitalize">{state.activeModal.replace('-', ' ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Party */}
            <div className="bg-gray-900 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Party ({currentRoom?.players?.length || 0})</h3>
              <div className="space-y-2">
                {currentRoom?.players?.map((player) => (
                  <div key={player.id} className="flex items-center justify-between text-sm">
                    <span className={player.isOnline ? 'text-white' : 'text-gray-400'}>
                      {player.character?.name || player.name}
                      {player.role === 'dm' && ' 👑'}
                      {player.id === playerId && ' (You)'}
                    </span>
                    <div className="flex items-center gap-2">
                      {player.character && <span className="text-green-400 text-xs">✓</span>}
                      <div className={`w-2 h-2 rounded-full ${
                        player.isOnline ? 'bg-green-400' : 'bg-gray-400'
                      }`}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Character Sheet Modal */}
        <AnimatePresence>
          {state.activeModal === 'character-sheet' && userCharacter && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              onClick={() => dispatch({ type: 'SET_MODAL', payload: 'none' })}
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              >
                <CharacterSheet
                  character={userCharacter}
                  onSave={() => dispatch({ type: 'SET_MODAL', payload: 'none' })}
                  onCancel={() => dispatch({ type: 'SET_MODAL', payload: 'none' })}
                  isEditing={true}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Character Profile Modal */}
        <AnimatePresence>
          {state.activeModal === 'character-profile' && userCharacter && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              onClick={() => dispatch({ type: 'SET_MODAL', payload: 'none' })}
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className="max-w-2xl w-full bg-gray-900 rounded-lg p-6"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white">👤 Character Profile</h2>
                  <button
                    onClick={() => dispatch({ type: 'SET_MODAL', payload: 'none' })}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    ×
                  </button>
                </div>
                
                <div className="space-y-6 text-white">
                  {/* Character Header */}
                  <div className="text-center pb-4 border-b border-gray-700">
                    <h3 className="text-3xl font-bold text-purple-400">{userCharacter.name}</h3>
                    <p className="text-lg text-gray-300 mt-2">
                      Level {userCharacter.level} {userCharacter.race} {userCharacter.class}
                    </p>
                  </div>
                  
                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-800 p-3 rounded text-center">
                      <div className="text-red-400 font-bold text-xl">
                        {userCharacter.hitPoints.current}/{userCharacter.hitPoints.maximum}
                      </div>
                      <div className="text-xs text-gray-400">Hit Points</div>
                    </div>
                    <div className="bg-gray-800 p-3 rounded text-center">
                      <div className="text-blue-400 font-bold text-xl">{userCharacter.armorClass}</div>
                      <div className="text-xs text-gray-400">Armor Class</div>
                    </div>
                    <div className="bg-gray-800 p-3 rounded text-center">
                      <div className="text-green-400 font-bold text-xl">+{userCharacter.proficiencyBonus}</div>
                      <div className="text-xs text-gray-400">Proficiency</div>
                    </div>
                    <div className="bg-gray-800 p-3 rounded text-center">
                      <div className="text-purple-400 font-bold text-xl">{userCharacter.equipment?.length || 0}</div>
                      <div className="text-xs text-gray-400">Items</div>
                    </div>
                  </div>
                  
                  {/* Ability Scores */}
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-yellow-400">Ability Scores</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {Object.entries(userCharacter.stats).map(([stat, value]) => (
                        <div key={stat} className="bg-gray-800 p-2 rounded text-center">
                          <div className="text-white font-bold">{value}</div>
                          <div className="text-xs text-gray-400 capitalize">{stat.slice(0,3)}</div>
                          <div className="text-xs text-gray-500">
                            {Math.floor((value - 10) / 2) >= 0 ? '+' : ''}{Math.floor((value - 10) / 2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* Backstory */}
                  {userCharacter.backstory && (
                    <div>
                      <h4 className="text-lg font-semibold mb-3 text-yellow-400">Backstory</h4>
                      <div className="bg-gray-800 p-4 rounded">
                        <p className="text-gray-300 text-sm leading-relaxed">{userCharacter.backstory}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Skills */}
                  <div>
                    <h4 className="text-lg font-semibold mb-3 text-yellow-400">Proficient Skills</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(userCharacter.skills || {})
                        .filter(([_, proficient]) => proficient)
                        .map(([skill]) => (
                          <span key={skill} className="bg-blue-600 px-3 py-1 rounded-full text-xs">{skill}</span>
                        ))}
                    </div>
                  </div>
                  
                  {/* Equipment */}
                  {userCharacter.equipment && userCharacter.equipment.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold mb-3 text-yellow-400">Equipment</h4>
                      <div className="space-y-2 max-h-32 overflow-y-auto">
                        {userCharacter.equipment.map((item, index) => (
                          <div key={index} className="flex items-center justify-between bg-gray-800 p-2 rounded text-sm">
                            <div className="flex items-center space-x-2">
                              <span className={`w-2 h-2 rounded-full ${
                                item.type === 'weapon' ? 'bg-red-500' :
                                item.type === 'armor' ? 'bg-blue-500' :
                                item.type === 'tool' ? 'bg-yellow-500' :
                                'bg-purple-500'
                              }`}></span>
                              <span>{item.name}</span>
                            </div>
                            {item.equipped && <span className="text-green-400 text-xs">Equipped</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
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