"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useGameState } from '../contexts/GameStateContext';
import { Character } from '../types/dnd';

interface GameHUDProps {
  onToggleModal: (modal: 'character-sheet' | 'character-profile' | 'inventory') => void;
  onUpdateCharacterHP?: (change: number) => void;
}

export default function GameHUD({ onToggleModal, onUpdateCharacterHP }: GameHUDProps) {
  const { state } = useGameState();

  if (!state.showHUD || !state.playerCharacter) {
    return null;
  }

  const character = state.playerCharacter;

  const getModifier = (score: number): number => {
    return Math.floor((score - 10) / 2);
  };

  const getHPPercentage = (): number => {
    return Math.max(0, (character.hitPoints.current / character.hitPoints.maximum) * 100);
  };

  const getHPColor = (): string => {
    const percentage = getHPPercentage();
    if (percentage <= 25) return 'bg-red-500';
    if (percentage <= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-4 left-4 z-40 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4 shadow-xl min-w-[280px] max-w-[350px]"
    >
      {/* Character Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-white">
          <h3 className="font-bold text-lg text-purple-400">{character.name}</h3>
          <p className="text-sm text-gray-300">
            Level {character.level} {character.race} {character.class}
          </p>
        </div>
        <div className="text-right">
          <div className="text-blue-400 font-bold">AC {character.armorClass}</div>
          <div className="text-green-400 text-sm">+{character.proficiencyBonus} Prof</div>
        </div>
      </div>

      {/* Health Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-red-400 font-medium text-sm">Hit Points</span>
          <div className="flex items-center gap-1">
            {onUpdateCharacterHP && (
              <>
                <button
                  onClick={() => onUpdateCharacterHP(-1)}
                  disabled={character.hitPoints.current <= 0}
                  className="w-5 h-5 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:opacity-50 rounded text-xs font-bold transition-colors"
                  title="Take 1 damage"
                >
                  −
                </button>
                <button
                  onClick={() => onUpdateCharacterHP(1)}
                  disabled={character.hitPoints.current >= character.hitPoints.maximum}
                  className="w-5 h-5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:opacity-50 rounded text-xs font-bold transition-colors"
                  title="Heal 1 HP"
                >
                  +
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full transition-all duration-300 ${getHPColor()}`}
              style={{ width: `${getHPPercentage()}%` }}
            />
          </div>
          <span className="text-white font-bold text-sm min-w-[50px]">
            {character.hitPoints.current}/{character.hitPoints.maximum}
          </span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-gray-800 p-2 rounded text-center">
          <div className="text-red-400 font-bold text-sm">{character.stats.strength}</div>
          <div className="text-xs text-gray-400">STR</div>
          <div className="text-xs text-gray-500">
            {getModifier(character.stats.strength) >= 0 ? '+' : ''}{getModifier(character.stats.strength)}
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded text-center">
          <div className="text-green-400 font-bold text-sm">{character.stats.dexterity}</div>
          <div className="text-xs text-gray-400">DEX</div>
          <div className="text-xs text-gray-500">
            {getModifier(character.stats.dexterity) >= 0 ? '+' : ''}{getModifier(character.stats.dexterity)}
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded text-center">
          <div className="text-blue-400 font-bold text-sm">{character.stats.constitution}</div>
          <div className="text-xs text-gray-400">CON</div>
          <div className="text-xs text-gray-500">
            {getModifier(character.stats.constitution) >= 0 ? '+' : ''}{getModifier(character.stats.constitution)}
          </div>
        </div>
      </div>

      {/* Combat Status */}
      {state.inCombat && (
        <div className="mb-3 p-2 bg-red-900/50 border border-red-700 rounded text-center">
          <div className="text-red-400 font-bold text-sm">⚔️ IN COMBAT</div>
          {state.currentTurn && (
            <div className="text-xs text-gray-300 mt-1">
              Current Turn: {state.currentTurn === state.currentPlayer?.id ? 'YOUR TURN' : state.currentTurn}
            </div>
          )}
        </div>
      )}

      {/* Quick Equipment */}
      {character.equipment && character.equipment.length > 0 && (
        <div className="mb-3">
          <h4 className="text-purple-400 font-medium text-xs mb-2">🎒 Quick Items</h4>
          <div className="space-y-1 max-h-16 overflow-y-auto">
            {character.equipment.slice(0, 3).map((item, index) => (
              <div key={index} className="flex items-center justify-between text-xs bg-gray-800 p-1 rounded">
                <div className="flex items-center space-x-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    item.type === 'weapon' ? 'bg-red-500' :
                    item.type === 'armor' ? 'bg-blue-500' :
                    item.type === 'tool' ? 'bg-yellow-500' :
                    'bg-purple-500'
                  }`}></span>
                  <span className="text-white truncate max-w-[100px]">{item.name}</span>
                  {item.equipped && <span className="text-green-400">✓</span>}
                </div>
              </div>
            ))}
            {character.equipment.length > 3 && (
              <div className="text-xs text-gray-500 text-center">
                +{character.equipment.length - 3} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-3 gap-1">
        <button
          onClick={() => onToggleModal('character-profile')}
          className="p-2 bg-purple-600 hover:bg-purple-700 rounded transition-colors text-xs font-medium"
          title="View Character Profile"
        >
          👤 Profile
        </button>
        <button
          onClick={() => onToggleModal('character-sheet')}
          className="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-xs"
          title="Edit Character Sheet"
        >
          📄 Sheet
        </button>
        <button
          onClick={() => onToggleModal('inventory')}
          className="p-2 bg-yellow-600 hover:bg-yellow-700 rounded transition-colors text-xs"
          title="View Inventory"
        >
          🎒 Items
        </button>
      </div>
    </motion.div>
  );
}