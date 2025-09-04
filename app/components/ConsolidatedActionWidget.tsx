"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Character } from '../types/dnd';
import { globalCommandQueue, CommonCommands, CommandExecutor, GameCommand } from '../utils/commandQueue';
import { isGuestCritter } from '../utils/animalCritters';

interface ConsolidatedActionWidgetProps {
  character: Character | null;
  isAuthenticated: boolean;
  turnPhase: 'player_turns' | 'dm_processing' | 'dm_response';
  hasPlayerActedThisTurn: boolean;
  onSendAction: (action: string) => Promise<void>;
  onRollDice: (expression: string, type: string, description?: string) => Promise<void>;
  onSendChat: (message: string, type: string) => Promise<void>;
  onGenerateEquipment?: () => Promise<void>;
  onGenerateLoot?: () => Promise<void>;
}

export default function ConsolidatedActionWidget({
  character,
  isAuthenticated,
  turnPhase,
  hasPlayerActedThisTurn,
  onSendAction,
  onRollDice,
  onSendChat,
  onGenerateEquipment,
  onGenerateLoot
}: ConsolidatedActionWidgetProps) {
  const [activeTab, setActiveTab] = useState<'action' | 'chat' | 'dice' | 'queue'>('action');
  const [actionInput, setActionInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [diceInput, setDiceInput] = useState('1d20');
  const [diceType, setDiceType] = useState('custom');
  const [queueCommands, setQueueCommands] = useState<GameCommand[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Subscribe to command queue changes
  useEffect(() => {
    const unsubscribe = globalCommandQueue.subscribe(setQueueCommands);
    setQueueCommands(globalCommandQueue.getAllCommands());
    return unsubscribe;
  }, []);

  const canAct = turnPhase === 'player_turns' && !hasPlayerActedThisTurn;
  const isGuest = character && isGuestCritter(character);

  const handleSendAction = async () => {
    if (actionInput.trim() && canAct) {
      // Add to command queue for processing
      globalCommandQueue.addCommand({
        type: 'player_action',
        command: 'player_action',
        description: actionInput.trim(),
        playerId: 'current_player',
        characterId: character?.id,
        priority: 'normal'
      });

      await onSendAction(actionInput.trim());
      setActionInput('');
    }
  };

  const handleSendChat = async () => {
    if (chatInput.trim()) {
      await onSendChat(chatInput.trim(), 'chat');
      setChatInput('');
    }
  };

  const handleRollDice = async () => {
    if (diceInput.trim()) {
      await onRollDice(diceInput.trim(), diceType, `${character?.name || 'Player'} rolls ${diceInput}`);
    }
  };

  const handleQuickAction = async (actionType: string) => {
    const quickActions = {
      'look_around': 'I look around to observe my surroundings',
      'listen': 'I listen carefully for any sounds or voices',
      'search': 'I search the area for anything interesting',
      'wait': 'I wait and observe what happens next',
      'help_party': 'I try to help my party members',
      'investigate': 'I investigate something that catches my attention'
    };

    const action = quickActions[actionType as keyof typeof quickActions];
    if (action && canAct) {
      await onSendAction(action);
    }
  };

  const handleQuickCommand = (commandType: string) => {
    switch (commandType) {
      case 'generate_equipment':
        if (onGenerateEquipment) {
          globalCommandQueue.addCommand(CommonCommands.GENERATE_LOOT('character equipment'));
          onGenerateEquipment();
        }
        break;
      case 'generate_loot':
        if (onGenerateLoot) {
          globalCommandQueue.addCommand(CommonCommands.GENERATE_LOOT('treasure chest'));
          onGenerateLoot();
        }
        break;
      case 'heal_party':
        globalCommandQueue.addCommand(CommonCommands.HEAL_PARTY(10));
        break;
      case 'save_game':
        globalCommandQueue.addCommand(CommonCommands.SAVE_GAME());
        break;
    }
  };

  const executeQueueCommand = async (commandId: string) => {
    const executor = new CommandExecutor(globalCommandQueue);
    await executor.processNext();
  };

  const pendingCount = globalCommandQueue.getPendingCount();
  const pendingInstructionsCount = globalCommandQueue.getPendingInstructionsCount();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/95 backdrop-blur-md border border-gray-700 rounded-lg p-4 w-full max-w-4xl mx-auto shadow-xl"
    >
      {/* Header with Character Info */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="text-sm">
            {character ? (
              <span className="text-green-400">
                {character.name} {isGuest && '🐾'} {!isAuthenticated && '(Guest)'}
              </span>
            ) : (
              <span className="text-yellow-400">No Character</span>
            )}
          </div>
          {isGuest && (
            <span className="px-2 py-1 bg-purple-900/30 text-purple-300 text-xs rounded border border-purple-500/30">
              Critter Mode
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2 text-xs">
          <div className={`px-2 py-1 rounded ${
            turnPhase === 'player_turns' ? 'bg-green-900/30 text-green-400' :
            turnPhase === 'dm_processing' ? 'bg-yellow-900/30 text-yellow-400' :
            'bg-blue-900/30 text-blue-400'
          }`}>
            {turnPhase.replace('_', ' ').toUpperCase()}
          </div>
          {hasPlayerActedThisTurn && (
            <div className="px-2 py-1 bg-gray-700/50 text-gray-400 rounded">
              Acted This Turn
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-4 bg-gray-800/50 rounded-lg p-1">
        {[
          { id: 'action', label: '⚔️ Actions', color: 'blue' },
          { id: 'chat', label: '💬 Chat', color: 'green' },
          { id: 'dice', label: '🎲 Dice', color: 'purple' },
          { id: 'queue', label: `📋 Queue${pendingCount > 0 ? ` (${pendingCount})` : ''}`, color: 'orange' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
              activeTab === tab.id 
                ? `bg-${tab.color}-600 text-white` 
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* Action Tab */}
        {activeTab === 'action' && (
          <motion.div
            key="action"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            {/* Action Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                What do you do? {isGuest && <span className="text-purple-400">(will be converted to animal sounds)</span>}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendAction()}
                  placeholder={isGuest ? "Describe your critter's actions..." : "Describe what you want to do..."}
                  className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  disabled={!canAct}
                />
                <button
                  onClick={handleSendAction}
                  disabled={!actionInput.trim() || !canAct}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 rounded transition-colors font-semibold"
                >
                  Act
                </button>
              </div>
            </div>

            {/* Quick Actions */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Quick Actions</label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { id: 'look_around', label: '👁️ Look Around', desc: 'Observe surroundings' },
                  { id: 'listen', label: '👂 Listen', desc: 'Listen for sounds' },
                  { id: 'search', label: '🔍 Search', desc: 'Search the area' },
                  { id: 'wait', label: '⏳ Wait', desc: 'Wait and observe' },
                  { id: 'help_party', label: '🤝 Help', desc: 'Assist party members' },
                  { id: 'investigate', label: '🕵️ Investigate', desc: 'Examine something' }
                ].map(action => (
                  <button
                    key={action.id}
                    onClick={() => handleQuickAction(action.id)}
                    disabled={!canAct}
                    className="p-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-700/50 border border-gray-600 rounded text-sm transition-colors text-left"
                    title={action.desc}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Send Message {isGuest && <span className="text-purple-400">(will be converted to animal sounds)</span>}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder={isGuest ? "What does your critter say?" : "Type your message..."}
                  className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 focus:border-green-500 focus:outline-none"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim()}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-400 rounded transition-colors font-semibold"
                >
                  Send
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Dice Tab */}
        {activeTab === 'dice' && (
          <motion.div
            key="dice"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Roll Dice</label>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={diceInput}
                  onChange={(e) => setDiceInput(e.target.value)}
                  placeholder="1d20+5"
                  className="flex-1 p-3 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
                />
                <select
                  value={diceType}
                  onChange={(e) => setDiceType(e.target.value)}
                  className="p-3 bg-gray-800 border border-gray-700 rounded text-white focus:border-purple-500 focus:outline-none"
                >
                  <option value="custom">Custom</option>
                  <option value="attack">Attack</option>
                  <option value="damage">Damage</option>
                  <option value="save">Saving Throw</option>
                  <option value="check">Ability Check</option>
                  <option value="initiative">Initiative</option>
                </select>
                <button
                  onClick={handleRollDice}
                  disabled={!diceInput.trim()}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-400 rounded transition-colors font-semibold"
                >
                  Roll
                </button>
              </div>

              {/* Quick Dice Rolls */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { dice: '1d20', label: 'd20', type: 'check' },
                  { dice: '1d20+3', label: 'd20+3', type: 'attack' },
                  { dice: '1d6', label: 'd6', type: 'damage' },
                  { dice: '1d4', label: 'd4', type: 'damage' },
                  { dice: '2d6', label: '2d6', type: 'damage' },
                  { dice: '1d8', label: 'd8', type: 'damage' },
                  { dice: '1d10', label: 'd10', type: 'damage' },
                  { dice: '1d12', label: 'd12', type: 'damage' }
                ].map(roll => (
                  <button
                    key={roll.dice}
                    onClick={() => {
                      setDiceInput(roll.dice);
                      setDiceType(roll.type);
                      onRollDice(roll.dice, roll.type);
                    }}
                    className="p-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-sm transition-colors"
                  >
                    {roll.label}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Queue Tab */}
        {activeTab === 'queue' && (
          <motion.div
            key="queue"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-4"
          >
            {/* Queue Status */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-300">
                {pendingCount} commands queued, {pendingInstructionsCount} LLM instructions pending
              </div>
              <button
                onClick={() => globalCommandQueue.clearCompleted()}
                className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-sm rounded transition-colors"
              >
                Clear Completed
              </button>
            </div>

            {/* Quick Commands */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Quick Commands</label>
              <div className="grid grid-cols-2 gap-2">
                {isAuthenticated && onGenerateEquipment && (
                  <button
                    onClick={() => handleQuickCommand('generate_equipment')}
                    className="p-2 bg-blue-800 hover:bg-blue-700 border border-blue-600 rounded text-sm transition-colors"
                  >
                    🎒 Generate Equipment
                  </button>
                )}
                {onGenerateLoot && (
                  <button
                    onClick={() => handleQuickCommand('generate_loot')}
                    className="p-2 bg-yellow-800 hover:bg-yellow-700 border border-yellow-600 rounded text-sm transition-colors"
                  >
                    💰 Generate Loot
                  </button>
                )}
                <button
                  onClick={() => handleQuickCommand('heal_party')}
                  className="p-2 bg-green-800 hover:bg-green-700 border border-green-600 rounded text-sm transition-colors"
                >
                  💚 Heal Party
                </button>
                <button
                  onClick={() => handleQuickCommand('save_game')}
                  className="p-2 bg-purple-800 hover:bg-purple-700 border border-purple-600 rounded text-sm transition-colors"
                >
                  💾 Save Game
                </button>
              </div>
            </div>

            {/* Command List */}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {queueCommands.slice(0, 10).map((command) => (
                <div
                  key={command.id}
                  className={`p-3 rounded border ${
                    command.status === 'completed' ? 'bg-green-900/20 border-green-700/50' :
                    command.status === 'failed' ? 'bg-red-900/20 border-red-700/50' :
                    command.status === 'processing' ? 'bg-yellow-900/20 border-yellow-700/50' :
                    'bg-gray-800/50 border-gray-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${
                        command.priority === 'urgent' ? 'bg-red-600' :
                        command.priority === 'high' ? 'bg-orange-600' :
                        command.priority === 'normal' ? 'bg-blue-600' : 'bg-gray-600'
                      }`}>
                        {command.type}
                      </span>
                      <span className="ml-2 text-gray-300">{command.description}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {command.status}
                    </div>
                  </div>
                </div>
              ))}
              
              {queueCommands.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No commands in queue
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}