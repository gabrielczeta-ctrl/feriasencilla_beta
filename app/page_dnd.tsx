"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDnDWebSocket } from './hooks/useDnDWebSocket';
import CharacterSheet from './components/CharacterSheet';
import FireShaderBackground from './components/FireShaderBackground';
import { Character, GameRoom, ChatMessage, DiceRoll } from './types/dnd';

export default function DnDPlatform() {
  const [playerName, setPlayerName] = useState('');
  const [gamePhase, setGamePhase] = useState<'login' | 'lobby' | 'character_creation' | 'playing'>('login');
  const [showCharacterSheet, setShowCharacterSheet] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [actionInput, setActionInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [diceInput, setDiceInput] = useState('1d20');
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
    sendPlayerAction,
    rollDice,
    sendChatMessage
  } = useDnDWebSocket(wsUrl);

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
    if (gamePhase === 'lobby' && status === 'connected') {
      refreshRooms();
      const interval = setInterval(refreshRooms, 5000);
      return () => clearInterval(interval);
    }
  }, [gamePhase, status, refreshRooms]);

  // Update game phase based on current room state
  useEffect(() => {
    if (currentRoom) {
      const currentPlayer = currentRoom.players.find(p => p.id === playerId);
      if (currentPlayer && !currentPlayer.character && currentRoom.gameState?.phase === 'character_creation') {
        setGamePhase('character_creation');
      } else if (currentRoom.gameState?.phase === 'playing') {
        setGamePhase('playing');
      }
    } else if (status === 'connected') {
      setGamePhase('lobby');
    }
  }, [currentRoom, playerId, status]);

  const handleLogin = () => {
    if (playerName.trim()) {
      localStorage.setItem('dnd_player_name', playerName.trim());
      connect(playerName.trim());
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
      await createCharacter(character);
      setShowCharacterSheet(false);
    } catch (error) {
      console.error('Failed to create character:', error);
    }
  };

  const handleSendAction = async () => {
    if (actionInput.trim()) {
      try {
        await sendPlayerAction(actionInput.trim());
        setActionInput('');
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
  if (gamePhase === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <FireShaderBackground />
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
  if (gamePhase === 'lobby') {
    return (
      <div className="min-h-screen text-white p-4 relative">
        <FireShaderBackground />
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold">🏰 Campaign Lobby</h1>
            <div className="flex items-center gap-4">
              <span className="text-gray-400">Welcome, {playerName}</span>
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
                            <span>Players: {room.players.length}/{room.maxPlayers}</span>
                            <span>Phase: {room.gameState?.phase || 'Waiting'}</span>
                            {room.settings.useAIDM && <span className="text-purple-400">🤖 AI DM</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleJoinRoom(room.id)}
                          disabled={room.players.length >= room.maxPlayers}
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
  if (gamePhase === 'character_creation') {
    return (
      <div className="min-h-screen text-white p-4 relative">
        <FireShaderBackground />
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

  // Playing Phase
  if (gamePhase === 'playing' && currentRoom) {
    const currentPlayer = currentRoom.players.find(p => p.id === playerId);
    const isDM = currentPlayer?.role === 'dm';

    return (
      <div className="min-h-screen text-white relative">
        <FireShaderBackground />
        {/* Header */}
        <div className="bg-black/20 p-4 border-b border-white/10">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">{currentRoom.name}</h1>
              <p className="text-gray-400">
                {currentRoom.gameState.story.location} | {currentRoom.players.length} players
              </p>
            </div>
            <button
              onClick={handleLeaveRoom}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
            >
              Leave
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Main Game Area */}
          <div className="lg:col-span-3 space-y-6">
            {/* Scene Description */}
            <div className="bg-gray-900 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-3">Current Scene</h2>
              <p className="text-gray-300 leading-relaxed">
                {currentRoom.gameState.story.sceneDescription || "The adventure awaits..."}
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
                  placeholder="Describe your action..."
                  className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400"
                  maxLength={500}
                />
                <button
                  onClick={handleSendAction}
                  disabled={!actionInput.trim()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded transition-colors"
                >
                  Act
                </button>
              </div>
            </div>

            {/* Chat Log */}
            <div className="bg-gray-900 p-6 rounded-lg">
              <h2 className="text-xl font-semibold mb-3">Adventure Log</h2>
              <div className="h-64 overflow-y-auto space-y-2">
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

              {/* Chat Input */}
              <div className="flex gap-3 mt-4">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Send a message..."
                  className="flex-1 p-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 text-sm"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 rounded transition-colors text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Character Info */}
            {currentPlayer?.character && (
              <div className="bg-gray-900 p-4 rounded-lg">
                <h3 className="font-semibold mb-3">Your Character</h3>
                <div className="space-y-2 text-sm">
                  <div className="font-medium">{currentPlayer.character.name}</div>
                  <div className="text-gray-400">
                    Level {currentPlayer.character.level} {currentPlayer.character.race} {currentPlayer.character.class}
                  </div>
                  <div className="text-red-400">
                    HP: {currentPlayer.character.hitPoints.current}/{currentPlayer.character.hitPoints.maximum}
                  </div>
                  <div className="text-blue-400">
                    AC: {currentPlayer.character.armorClass}
                  </div>
                </div>
                <button
                  onClick={() => setShowCharacterSheet(true)}
                  className="w-full mt-3 p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors text-sm"
                >
                  View Sheet
                </button>
              </div>
            )}

            {/* Dice Roller */}
            <div className="bg-gray-900 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Dice Roller</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={diceInput}
                  onChange={(e) => setDiceInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleRollDice()}
                  placeholder="1d20+5"
                  className="w-full p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {['1d20', '1d12', '1d10', '1d8', '1d6', '1d4'].map(die => (
                    <button
                      key={die}
                      onClick={() => setDiceInput(die)}
                      className="p-1 bg-gray-800 hover:bg-gray-700 rounded"
                    >
                      {die}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleRollDice}
                  className="w-full p-2 bg-red-600 hover:bg-red-700 rounded transition-colors text-sm"
                >
                  Roll Dice
                </button>
              </div>
              
              {/* Recent Rolls */}
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Recent Rolls</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {diceRolls.slice(-5).map((roll) => (
                    <div key={roll.id} className="text-xs bg-gray-800 p-2 rounded">
                      <span className="text-gray-400">{roll.playerName}:</span>
                      <span className="ml-1">{roll.expression}</span>
                      <span className="ml-2 font-bold text-green-400">{roll.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Party */}
            <div className="bg-gray-900 p-4 rounded-lg">
              <h3 className="font-semibold mb-3">Party</h3>
              <div className="space-y-2">
                {currentRoom.players.map((player) => (
                  <div key={player.id} className="flex items-center justify-between text-sm">
                    <span className={player.isOnline ? 'text-white' : 'text-gray-400'}>
                      {player.character?.name || player.name}
                      {player.role === 'dm' && ' 👑'}
                    </span>
                    <div className={`w-2 h-2 rounded-full ${
                      player.isOnline ? 'bg-green-400' : 'bg-gray-400'
                    }`}></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Character Sheet Modal */}
        <AnimatePresence>
          {showCharacterSheet && currentPlayer?.character && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
              onClick={() => setShowCharacterSheet(false)}
            >
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              >
                <CharacterSheet
                  character={currentPlayer.character}
                  onSave={() => setShowCharacterSheet(false)}
                  onCancel={() => setShowCharacterSheet(false)}
                  isEditing={true}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return null;
}