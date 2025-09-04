import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PlayerAction } from '../hooks/useGameStateManager';

// Advanced Combat Mechanics Component for D&D 5e

type CombatParticipant = {
  id: string;
  name: string;
  type: 'player' | 'ally' | 'enemy' | 'neutral';
  initiative: number;
  hitPoints: { current: number; maximum: number };
  armorClass: number;
  speed: number;
  conditions: string[];
  position: { x: number; y: number };
  actions: {
    action: boolean;
    bonusAction: boolean;
    reaction: boolean;
    movement: number;
  };
  resources?: {
    spellSlots?: Record<string, number>;
    kiPoints?: number;
    rageUses?: number;
    inspiration?: boolean;
  };
};

type CombatAction = {
  id: string;
  name: string;
  type: 'action' | 'bonus_action' | 'reaction' | 'movement' | 'free';
  description: string;
  cost?: number; // movement cost or resource cost
  requiresTarget: boolean;
  range: number; // in feet
  damage?: string;
  savingThrow?: {
    ability: string;
    dc: number;
  };
  effects?: string[];
  conditions: string[]; // conditions that prevent this action
};

type CombatState = {
  active: boolean;
  round: number;
  turnOrder: string[];
  currentTurnIndex: number;
  participants: Map<string, CombatParticipant>;
  turnStartTime: number;
  turnDuration: number; // milliseconds
  environment: {
    lighting: 'bright' | 'dim' | 'darkness';
    weather: string;
    terrain: 'normal' | 'difficult' | 'hazardous';
    visibility: number; // feet
  };
};

interface CombatManagerProps {
  isVisible: boolean;
  onToggle: () => void;
  onAddAction?: (action: Omit<PlayerAction, 'id' | 'timestamp' | 'processed'>) => boolean;
  playerId: string;
  playerName: string;
  canAct: boolean;
}

const CombatManager: React.FC<CombatManagerProps> = ({
  isVisible,
  onToggle,
  onAddAction,
  playerId,
  playerName,
  canAct
}) => {
  const [combatState, setCombatState] = useState<CombatState>({
    active: false,
    round: 1,
    turnOrder: [],
    currentTurnIndex: 0,
    participants: new Map(),
    turnStartTime: Date.now(),
    turnDuration: 30000, // 30 seconds per turn
    environment: {
      lighting: 'bright',
      weather: 'clear',
      terrain: 'normal',
      visibility: 120
    }
  });

  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<CombatAction | null>(null);
  const [initiativeInput, setInitiativeInput] = useState<string>('');
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [newParticipant, setNewParticipant] = useState({
    name: '',
    type: 'enemy' as CombatParticipant['type'],
    hitPoints: 20,
    armorClass: 15,
    speed: 30
  });

  // Default combat actions for D&D 5e
  const defaultActions: CombatAction[] = [
    {
      id: 'attack',
      name: 'Attack',
      type: 'action',
      description: 'Make a weapon or spell attack',
      requiresTarget: true,
      range: 5,
      conditions: ['Paralyzed', 'Unconscious', 'Stunned']
    },
    {
      id: 'dash',
      name: 'Dash',
      type: 'action',
      description: 'Double your movement speed this turn',
      requiresTarget: false,
      range: 0,
      conditions: ['Paralyzed', 'Unconscious', 'Stunned']
    },
    {
      id: 'dodge',
      name: 'Dodge',
      type: 'action',
      description: 'Attacks against you have disadvantage until your next turn',
      requiresTarget: false,
      range: 0,
      conditions: ['Paralyzed', 'Unconscious', 'Stunned']
    },
    {
      id: 'help',
      name: 'Help',
      type: 'action',
      description: 'Give an ally advantage on their next attack or ability check',
      requiresTarget: true,
      range: 5,
      conditions: ['Paralyzed', 'Unconscious', 'Stunned']
    },
    {
      id: 'hide',
      name: 'Hide',
      type: 'action',
      description: 'Make a Stealth check to hide',
      requiresTarget: false,
      range: 0,
      conditions: ['Paralyzed', 'Unconscious', 'Stunned']
    },
    {
      id: 'ready',
      name: 'Ready',
      type: 'action',
      description: 'Prepare an action to trigger on a specific condition',
      requiresTarget: false,
      range: 0,
      conditions: ['Paralyzed', 'Unconscious', 'Stunned']
    },
    {
      id: 'search',
      name: 'Search',
      type: 'action',
      description: 'Look for hidden creatures or objects',
      requiresTarget: false,
      range: 0,
      conditions: ['Paralyzed', 'Unconscious', 'Stunned', 'Blinded']
    },
    {
      id: 'disengage',
      name: 'Disengage',
      type: 'action',
      description: 'Your movement doesn\'t provoke opportunity attacks',
      requiresTarget: false,
      range: 0,
      conditions: ['Paralyzed', 'Unconscious', 'Stunned']
    }
  ];

  // Initialize combat with some default participants
  useEffect(() => {
    const initialParticipants = new Map<string, CombatParticipant>();
    
    // Add player
    initialParticipants.set(playerId, {
      id: playerId,
      name: playerName,
      type: 'player',
      initiative: 10,
      hitPoints: { current: 25, maximum: 25 },
      armorClass: 15,
      speed: 30,
      conditions: [],
      position: { x: 2, y: 2 },
      actions: { action: true, bonusAction: true, reaction: true, movement: 30 }
    });

    // Add some enemies
    initialParticipants.set('orc1', {
      id: 'orc1',
      name: 'Orc Warrior',
      type: 'enemy',
      initiative: 8,
      hitPoints: { current: 15, maximum: 15 },
      armorClass: 13,
      speed: 30,
      conditions: [],
      position: { x: 6, y: 6 },
      actions: { action: true, bonusAction: true, reaction: true, movement: 30 }
    });

    setCombatState(prev => ({
      ...prev,
      participants: initialParticipants,
      turnOrder: Array.from(initialParticipants.keys()).sort((a, b) => 
        initialParticipants.get(b)!.initiative - initialParticipants.get(a)!.initiative
      )
    }));
  }, [playerId, playerName]);

  // Current participant
  const currentParticipant = useMemo(() => {
    if (combatState.turnOrder.length === 0) return null;
    const currentId = combatState.turnOrder[combatState.currentTurnIndex];
    return combatState.participants.get(currentId) || null;
  }, [combatState.turnOrder, combatState.currentTurnIndex, combatState.participants]);

  // Check if it's player's turn
  const isPlayerTurn = useMemo(() => {
    return currentParticipant?.id === playerId;
  }, [currentParticipant, playerId]);

  // Start combat
  const startCombat = useCallback(() => {
    setCombatState(prev => ({
      ...prev,
      active: true,
      round: 1,
      currentTurnIndex: 0,
      turnStartTime: Date.now()
    }));

    if (onAddAction) {
      onAddAction({
        playerId,
        playerName,
        type: 'combat',
        action: 'Combat started! Roll for initiative.',
      });
    }
  }, [onAddAction, playerId, playerName]);

  // End combat
  const endCombat = useCallback(() => {
    setCombatState(prev => ({
      ...prev,
      active: false
    }));

    if (onAddAction) {
      onAddAction({
        playerId,
        playerName,
        type: 'combat',
        action: 'Combat ended.',
      });
    }
  }, [onAddAction, playerId, playerName]);

  // Next turn
  const nextTurn = useCallback(() => {
    setCombatState(prev => {
      let newIndex = prev.currentTurnIndex + 1;
      let newRound = prev.round;
      
      if (newIndex >= prev.turnOrder.length) {
        newIndex = 0;
        newRound += 1;
      }

      // Reset actions for new turn participant
      const newParticipants = new Map(prev.participants);
      const nextParticipantId = prev.turnOrder[newIndex];
      const nextParticipant = newParticipants.get(nextParticipantId);
      
      if (nextParticipant) {
        nextParticipant.actions = {
          action: true,
          bonusAction: true,
          reaction: true,
          movement: nextParticipant.speed
        };
        newParticipants.set(nextParticipantId, nextParticipant);
      }

      return {
        ...prev,
        currentTurnIndex: newIndex,
        round: newRound,
        participants: newParticipants,
        turnStartTime: Date.now()
      };
    });
  }, []);

  // Execute action
  const executeAction = useCallback((action: CombatAction, targetId?: string) => {
    if (!canAct || !isPlayerTurn || !currentParticipant) return;

    const participant = combatState.participants.get(playerId);
    if (!participant) return;

    // Check if action is available
    if (action.type === 'action' && !participant.actions.action) {
      console.warn('No action available');
      return;
    }
    if (action.type === 'bonus_action' && !participant.actions.bonusAction) {
      console.warn('No bonus action available');
      return;
    }

    // Check conditions
    if (action.conditions.some(condition => participant.conditions.includes(condition))) {
      console.warn('Cannot perform action due to conditions');
      return;
    }

    // Consume action
    setCombatState(prev => {
      const newParticipants = new Map(prev.participants);
      const updatedParticipant = { ...participant };
      
      if (action.type === 'action') updatedParticipant.actions.action = false;
      if (action.type === 'bonus_action') updatedParticipant.actions.bonusAction = false;
      if (action.type === 'movement' && action.cost) {
        updatedParticipant.actions.movement = Math.max(0, updatedParticipant.actions.movement - action.cost);
      }

      newParticipants.set(playerId, updatedParticipant);
      
      return {
        ...prev,
        participants: newParticipants
      };
    });

    // Add to game actions
    const targetName = targetId ? combatState.participants.get(targetId)?.name : '';
    const actionDescription = `${action.name}${targetName ? ` on ${targetName}` : ''}`;

    if (onAddAction) {
      onAddAction({
        playerId,
        playerName,
        type: 'combat',
        action: actionDescription,
        data: {
          action: action.name,
          target: targetId,
          round: combatState.round
        }
      });
    }

    setSelectedAction(null);
    setSelectedTarget(null);
  }, [canAct, isPlayerTurn, currentParticipant, combatState, playerId, onAddAction, playerName]);

  // Add participant
  const addParticipant = useCallback(() => {
    if (!newParticipant.name.trim()) return;

    const id = `${newParticipant.type}_${Date.now()}`;
    const participant: CombatParticipant = {
      id,
      name: newParticipant.name,
      type: newParticipant.type,
      initiative: Math.floor(Math.random() * 20) + 1,
      hitPoints: { current: newParticipant.hitPoints, maximum: newParticipant.hitPoints },
      armorClass: newParticipant.armorClass,
      speed: newParticipant.speed,
      conditions: [],
      position: { x: Math.floor(Math.random() * 10), y: Math.floor(Math.random() * 10) },
      actions: { action: true, bonusAction: true, reaction: true, movement: newParticipant.speed }
    };

    setCombatState(prev => {
      const newParticipants = new Map(prev.participants);
      newParticipants.set(id, participant);
      
      const newTurnOrder = Array.from(newParticipants.keys()).sort((a, b) => 
        newParticipants.get(b)!.initiative - newParticipants.get(a)!.initiative
      );

      return {
        ...prev,
        participants: newParticipants,
        turnOrder: newTurnOrder
      };
    });

    setNewParticipant({
      name: '',
      type: 'enemy',
      hitPoints: 20,
      armorClass: 15,
      speed: 30
    });
    setShowAddParticipant(false);
  }, [newParticipant]);

  // Roll initiative
  const rollInitiative = useCallback(() => {
    if (!initiativeInput.trim()) return;

    const roll = parseInt(initiativeInput);
    if (isNaN(roll)) return;

    setCombatState(prev => {
      const newParticipants = new Map(prev.participants);
      const participant = newParticipants.get(playerId);
      
      if (participant) {
        participant.initiative = roll;
        newParticipants.set(playerId, participant);
        
        const newTurnOrder = Array.from(newParticipants.keys()).sort((a, b) => 
          newParticipants.get(b)!.initiative - newParticipants.get(a)!.initiative
        );

        return {
          ...prev,
          participants: newParticipants,
          turnOrder: newTurnOrder
        };
      }
      return prev;
    });

    setInitiativeInput('');
  }, [initiativeInput, playerId]);

  if (!isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={onToggle}
          className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-full shadow-lg transition-colors"
          title="Open Combat Manager"
        >
          ⚔️
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 text-white p-6 rounded-lg max-w-4xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            ⚔️ Combat Manager
            {combatState.active && (
              <span className="text-red-400 text-sm">
                Round {combatState.round}
              </span>
            )}
          </h2>
          <button
            onClick={onToggle}
            className="text-gray-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        {!combatState.active ? (
          // Combat Setup
          <div className="space-y-6">
            <div className="flex gap-4">
              <button
                onClick={startCombat}
                disabled={combatState.participants.size < 1}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 rounded transition-colors"
              >
                Start Combat
              </button>
              <button
                onClick={() => setShowAddParticipant(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              >
                Add Participant
              </button>
            </div>

            {/* Initiative Rolling */}
            <div className="bg-gray-800 p-4 rounded">
              <h3 className="font-semibold mb-3">Roll Initiative</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={initiativeInput}
                  onChange={(e) => setInitiativeInput(e.target.value)}
                  placeholder="Initiative roll (1-20)"
                  className="flex-1 bg-gray-700 text-white rounded px-3 py-2"
                />
                <button
                  onClick={rollInitiative}
                  disabled={!initiativeInput.trim()}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 rounded transition-colors"
                >
                  Set Initiative
                </button>
              </div>
            </div>

            {/* Participants List */}
            <div className="bg-gray-800 p-4 rounded">
              <h3 className="font-semibold mb-3">Combat Participants</h3>
              <div className="space-y-2">
                {Array.from(combatState.participants.values())
                  .sort((a, b) => b.initiative - a.initiative)
                  .map((participant) => (
                  <div key={participant.id} className="flex justify-between items-center bg-gray-700 p-3 rounded">
                    <div>
                      <span className={`font-medium ${
                        participant.type === 'player' ? 'text-blue-400' :
                        participant.type === 'ally' ? 'text-green-400' :
                        'text-red-400'
                      }`}>
                        {participant.name}
                      </span>
                      <span className="text-sm text-gray-400 ml-2">
                        Initiative: {participant.initiative}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-red-400">
                        HP: {participant.hitPoints.current}/{participant.hitPoints.maximum}
                      </span>
                      <span className="text-gray-400 ml-3">
                        AC: {participant.armorClass}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add Participant Form */}
            {showAddParticipant && (
              <div className="bg-gray-800 p-4 rounded">
                <h3 className="font-semibold mb-3">Add Participant</h3>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    value={newParticipant.name}
                    onChange={(e) => setNewParticipant(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Name"
                    className="bg-gray-700 text-white rounded px-3 py-2"
                  />
                  <select
                    value={newParticipant.type}
                    onChange={(e) => setNewParticipant(prev => ({ ...prev, type: e.target.value as CombatParticipant['type'] }))}
                    className="bg-gray-700 text-white rounded px-3 py-2"
                  >
                    <option value="ally">Ally</option>
                    <option value="enemy">Enemy</option>
                    <option value="neutral">Neutral</option>
                  </select>
                  <input
                    type="number"
                    value={newParticipant.hitPoints}
                    onChange={(e) => setNewParticipant(prev => ({ ...prev, hitPoints: parseInt(e.target.value) || 0 }))}
                    placeholder="Hit Points"
                    className="bg-gray-700 text-white rounded px-3 py-2"
                  />
                  <input
                    type="number"
                    value={newParticipant.armorClass}
                    onChange={(e) => setNewParticipant(prev => ({ ...prev, armorClass: parseInt(e.target.value) || 0 }))}
                    placeholder="Armor Class"
                    className="bg-gray-700 text-white rounded px-3 py-2"
                  />
                  <input
                    type="number"
                    value={newParticipant.speed}
                    onChange={(e) => setNewParticipant(prev => ({ ...prev, speed: parseInt(e.target.value) || 0 }))}
                    placeholder="Speed (feet)"
                    className="bg-gray-700 text-white rounded px-3 py-2"
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={addParticipant}
                    disabled={!newParticipant.name.trim()}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 rounded transition-colors"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowAddParticipant(false)}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Active Combat
          <div className="space-y-6">
            {/* Current Turn Info */}
            <div className="bg-gray-800 p-4 rounded border-l-4 border-l-red-500">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-semibold text-red-400">
                    {currentParticipant ? `${currentParticipant.name}'s Turn` : 'No Active Participant'}
                  </h3>
                  <p className="text-sm text-gray-400">
                    Round {combatState.round} • Turn {combatState.currentTurnIndex + 1} of {combatState.turnOrder.length}
                  </p>
                  {isPlayerTurn && (
                    <p className="text-green-400 text-sm mt-1">🎯 Your turn!</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={nextTurn}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                  >
                    Next Turn
                  </button>
                  <button
                    onClick={endCombat}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded transition-colors"
                  >
                    End Combat
                  </button>
                </div>
              </div>

              {/* Current participant's actions */}
              {currentParticipant && (
                <div className="mt-3 pt-3 border-t border-gray-700">
                  <div className="grid grid-cols-4 gap-3 text-sm">
                    <div className={`text-center p-2 rounded ${currentParticipant.actions.action ? 'bg-green-800' : 'bg-red-800'}`}>
                      Action: {currentParticipant.actions.action ? '✓' : '✗'}
                    </div>
                    <div className={`text-center p-2 rounded ${currentParticipant.actions.bonusAction ? 'bg-green-800' : 'bg-red-800'}`}>
                      Bonus: {currentParticipant.actions.bonusAction ? '✓' : '✗'}
                    </div>
                    <div className={`text-center p-2 rounded ${currentParticipant.actions.reaction ? 'bg-green-800' : 'bg-red-800'}`}>
                      Reaction: {currentParticipant.actions.reaction ? '✓' : '✗'}
                    </div>
                    <div className="text-center p-2 bg-blue-800 rounded">
                      Move: {currentParticipant.actions.movement}ft
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Combat Actions (only show for player's turn) */}
            {isPlayerTurn && canAct && (
              <div className="bg-gray-800 p-4 rounded">
                <h3 className="font-semibold mb-3">Combat Actions</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {defaultActions.map((action) => {
                    const participant = combatState.participants.get(playerId);
                    const canPerform = participant && 
                      ((action.type === 'action' && participant.actions.action) ||
                       (action.type === 'bonus_action' && participant.actions.bonusAction) ||
                       action.type === 'free') &&
                      !action.conditions.some(condition => participant.conditions.includes(condition));

                    return (
                      <button
                        key={action.id}
                        onClick={() => {
                          if (action.requiresTarget) {
                            setSelectedAction(action);
                          } else {
                            executeAction(action);
                          }
                        }}
                        disabled={!canPerform}
                        className={`p-3 rounded text-sm transition-colors ${
                          canPerform 
                            ? 'bg-blue-600 hover:bg-blue-700' 
                            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        }`}
                        title={action.description}
                      >
                        {action.name}
                        <div className="text-xs opacity-75 mt-1">
                          {action.type.replace('_', ' ')}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Target Selection */}
                {selectedAction && (
                  <div className="mt-4 p-3 bg-gray-700 rounded">
                    <h4 className="font-medium mb-2">Select Target for {selectedAction.name}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {Array.from(combatState.participants.values())
                        .filter(p => p.id !== playerId)
                        .map((participant) => (
                          <button
                            key={participant.id}
                            onClick={() => executeAction(selectedAction, participant.id)}
                            className="p-2 bg-gray-600 hover:bg-gray-500 rounded text-sm"
                          >
                            {participant.name}
                            <div className="text-xs text-gray-400">
                              HP: {participant.hitPoints.current}/{participant.hitPoints.maximum}
                            </div>
                          </button>
                        ))}
                    </div>
                    <button
                      onClick={() => setSelectedAction(null)}
                      className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Turn Order */}
            <div className="bg-gray-800 p-4 rounded">
              <h3 className="font-semibold mb-3">Initiative Order</h3>
              <div className="space-y-2">
                {combatState.turnOrder.map((participantId, index) => {
                  const participant = combatState.participants.get(participantId);
                  if (!participant) return null;

                  const isCurrent = index === combatState.currentTurnIndex;

                  return (
                    <div
                      key={participantId}
                      className={`flex justify-between items-center p-3 rounded ${
                        isCurrent 
                          ? 'bg-red-700 border border-red-500' 
                          : 'bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono w-6">
                          {index + 1}.
                        </span>
                        <span className={`font-medium ${
                          participant.type === 'player' ? 'text-blue-400' :
                          participant.type === 'ally' ? 'text-green-400' :
                          'text-red-400'
                        }`}>
                          {participant.name}
                        </span>
                        {isCurrent && <span className="text-yellow-400">← Current</span>}
                      </div>
                      <div className="flex gap-4 text-sm">
                        <span className="text-red-400">
                          {participant.hitPoints.current}/{participant.hitPoints.maximum} HP
                        </span>
                        <span className="text-blue-400">
                          AC {participant.armorClass}
                        </span>
                        <span className="text-gray-400">
                          Init: {participant.initiative}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CombatManager;