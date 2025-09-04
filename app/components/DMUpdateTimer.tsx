"use client";

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface DMUpdateTimerProps {
  turnPhase: 'player_turns' | 'dm_processing' | 'dm_response';
  turnStartTime: number;
  playerTurnDuration: number; // in milliseconds
  dmUpdateInterval: number;
  playersWhoActed: number;
  totalPlayers: number;
  hasPlayerActed: boolean;
}

export default function DMUpdateTimer({ 
  turnPhase, 
  turnStartTime, 
  playerTurnDuration, 
  dmUpdateInterval,
  playersWhoActed,
  totalPlayers,
  hasPlayerActed 
}: DMUpdateTimerProps) {
  const [timeLeft, setTimeLeft] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - turnStartTime;
      
      if (turnPhase === 'player_turns') {
        const remaining = Math.max(0, playerTurnDuration - elapsed);
        const progressPercent = Math.min(100, (elapsed / playerTurnDuration) * 100);
        
        setTimeLeft(remaining);
        setProgress(progressPercent);
      } else {
        setTimeLeft(0);
        setProgress(0);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [turnPhase, turnStartTime, playerTurnDuration]);

  const formatTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
  };

  const getPhaseColor = () => {
    switch (turnPhase) {
      case 'player_turns':
        return hasPlayerActed ? 'text-green-400' : 'text-yellow-400';
      case 'dm_processing':
        return 'text-purple-400';
      case 'dm_response':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const getPhaseMessage = () => {
    switch (turnPhase) {
      case 'player_turns':
        if (hasPlayerActed) {
          return `✅ Your action is queued! Waiting for others...`;
        }
        return `📝 Send your action within ${formatTime(timeLeft)}`;
      case 'dm_processing':
        return '🤖 DM is processing all actions...';
      case 'dm_response':
        return '📜 DM is responding to the story...';
      default:
        return 'Waiting for next turn...';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/95 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-4 mb-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl">🎲</div>
          <div>
            <h3 className="text-lg font-bold text-purple-400">The Eternal Tavern</h3>
            <p className="text-sm text-gray-400">Global D&D Server</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-blue-400">{totalPlayers}</div>
          <div className="text-xs text-gray-400">adventurers</div>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className={`font-medium ${getPhaseColor()}`}>
            {getPhaseMessage()}
          </span>
          {turnPhase === 'player_turns' && (
            <span className="text-sm font-mono text-gray-300">
              {formatTime(timeLeft)}
            </span>
          )}
        </div>

        {turnPhase === 'player_turns' && (
          <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
            <motion.div
              className={`h-2 rounded-full transition-colors duration-500 ${
                hasPlayerActed 
                  ? 'bg-green-500' 
                  : timeLeft < 5000 
                    ? 'bg-red-500' 
                    : 'bg-yellow-500'
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
        )}

        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400">
            {playersWhoActed}/{totalPlayers} players acted this turn
          </span>
          <span className="text-purple-400 font-medium">
            ⏱️ Smart Updates {playersWhoActed > 0 ? 'every 15s' : 'reduced frequency'}
          </span>
        </div>
      </div>

      <div className="text-xs text-center text-gray-500 border-t border-gray-700 pt-2">
        🎭 Turn-based gameplay • One sentence per turn • AI DM storytelling
      </div>
    </motion.div>
  );
}