"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage, Character } from '../types/dnd';
import { isGuestCritter } from '../utils/animalCritters';

interface PriorityGameDisplayProps {
  currentScene: string;
  sceneDescription: string;
  chatMessages: ChatMessage[];
  character: Character | null;
  turnPhase: 'player_turns' | 'dm_processing' | 'dm_response';
  turnStartTime: number;
  playerTurnDuration: number;
  dmUpdateInterval: number;
}

export default function PriorityGameDisplay({
  currentScene,
  sceneDescription,
  chatMessages,
  character,
  turnPhase,
  turnStartTime,
  playerTurnDuration,
  dmUpdateInterval
}: PriorityGameDisplayProps) {
  const [expandedScene, setExpandedScene] = useState(false);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Update timer
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - turnStartTime;
      const maxDuration = turnPhase === 'player_turns' ? playerTurnDuration : dmUpdateInterval;
      setTimeRemaining(Math.max(0, maxDuration - elapsed));
    }, 100);

    return () => clearInterval(interval);
  }, [turnStartTime, turnPhase, playerTurnDuration, dmUpdateInterval]);

  // Get latest DM message
  const latestDMMessage = chatMessages
    .filter(msg => msg.playerName === 'DM' && msg.type === 'system')
    .slice(-1)[0];

  // Get recent important messages
  const importantMessages = chatMessages
    .filter(msg => 
      msg.playerName === 'DM' || 
      msg.type === 'system' || 
      msg.type === 'action' ||
      msg.type === 'dice'
    )
    .slice(-5);

  // Format time remaining
  const formatTime = (ms: number): string => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const getMessageIcon = (message: ChatMessage): string => {
    if (message.playerName === 'DM') return '🎭';
    if (message.type === 'action') return '⚔️';
    if (message.type === 'dice') return '🎲';
    if (message.type === 'system') return '⚙️';
    return '💬';
  };

  const isGuest = character && isGuestCritter(character);

  return (
    <div className="space-y-4">
      {/* Current Scene - Priority #1 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 backdrop-blur-md border border-blue-500/30 rounded-lg p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-blue-300">🏰 Current Scene</h2>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              turnPhase === 'player_turns' ? 'bg-green-600/30 text-green-300 border border-green-500/50' :
              turnPhase === 'dm_processing' ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50' :
              'bg-blue-600/30 text-blue-300 border border-blue-500/50'
            }`}>
              {turnPhase === 'player_turns' ? '⚔️ Your Turn' :
               turnPhase === 'dm_processing' ? '🤖 DM Processing' :
               '📖 Story Time'}
            </div>
          </div>
          
          {timeRemaining > 0 && (
            <div className={`px-3 py-1 rounded-full text-sm font-mono ${
              timeRemaining < 5000 ? 'bg-red-600/30 text-red-300 border border-red-500/50' :
              timeRemaining < 10000 ? 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50' :
              'bg-gray-600/30 text-gray-300 border border-gray-500/50'
            }`}>
              ⏱️ {formatTime(timeRemaining)}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white">{currentScene || 'The Adventure Begins'}</h3>
          
          <div className="relative">
            <p className={`text-gray-200 leading-relaxed ${
              !expandedScene && sceneDescription.length > 200 ? 'line-clamp-3' : ''
            }`}>
              {sceneDescription || 'The scene is being set...'}
            </p>
            
            {sceneDescription.length > 200 && (
              <button
                onClick={() => setExpandedScene(!expandedScene)}
                className="mt-2 text-blue-400 hover:text-blue-300 text-sm underline"
              >
                {expandedScene ? 'Show Less' : 'Show More'}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Latest DM Update - Priority #2 */}
      {latestDMMessage && (
        <motion.div
          key={latestDMMessage.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 backdrop-blur-md border border-purple-500/30 rounded-lg p-5 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl">🎭</div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-bold text-purple-300">Dungeon Master</h3>
                <span className="text-xs text-gray-400">{formatTimestamp(latestDMMessage.timestamp)}</span>
                <span className="px-2 py-1 bg-purple-600/30 text-purple-300 text-xs rounded border border-purple-500/30">
                  Latest Update
                </span>
              </div>
              <div className="text-gray-200 leading-relaxed">
                {latestDMMessage.content}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Character Status - Quick Glance */}
      {character && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-gray-900/50 backdrop-blur-md border border-gray-600/50 rounded-lg p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-lg">
                {isGuest ? '🐾' : '⚔️'}
              </div>
              <div>
                <h4 className="font-semibold text-white">{character.name}</h4>
                <p className="text-sm text-gray-400">
                  {character.race} {character.class} • Level {character.level}
                  {isGuest && <span className="text-purple-400"> (Guest Critter)</span>}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4 text-sm">
              <div className="text-center">
                <div className="text-red-400 font-mono">
                  {character.hitPoints.current}/{character.hitPoints.maximum}
                </div>
                <div className="text-xs text-gray-500">HP</div>
              </div>
              <div className="text-center">
                <div className="text-blue-400 font-mono">{character.armorClass}</div>
                <div className="text-xs text-gray-500">AC</div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Recent Activity - Collapsible */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900/30 backdrop-blur-md border border-gray-700/50 rounded-lg"
      >
        <button
          onClick={() => setShowAllMessages(!showAllMessages)}
          className="w-full p-4 text-left hover:bg-gray-800/30 transition-colors rounded-t-lg"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-300">📜 Recent Activity</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {importantMessages.length} recent events
              </span>
              <span className={`transform transition-transform ${showAllMessages ? 'rotate-180' : ''}`}>
                ⌄
              </span>
            </div>
          </div>
        </button>

        <AnimatePresence>
          {showAllMessages && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-gray-700/50"
            >
              <div 
                ref={chatContainerRef}
                className="max-h-64 overflow-y-auto p-4 space-y-3"
              >
                {importantMessages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-3 rounded-lg ${
                      message.playerName === 'DM' 
                        ? 'bg-purple-900/20 border-l-4 border-purple-500/50' 
                        : message.type === 'dice'
                        ? 'bg-blue-900/20 border-l-4 border-blue-500/50'
                        : 'bg-gray-800/30 border-l-4 border-gray-600/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg">{getMessageIcon(message)}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">
                            {message.playerName}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTimestamp(message.timestamp)}
                          </span>
                          {message.type !== 'chat' && (
                            <span className="px-2 py-1 bg-gray-700/50 text-gray-300 text-xs rounded">
                              {message.type}
                            </span>
                          )}
                        </div>
                        <div className="text-gray-300 text-sm leading-relaxed">
                          {message.content}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}