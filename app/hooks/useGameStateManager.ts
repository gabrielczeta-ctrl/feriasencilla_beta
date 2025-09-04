import { useState, useEffect, useRef, useCallback } from 'react';
import { Character, ChatMessage, DiceRoll } from '../types/dnd';

// Enhanced Game State Management for LLM Integration

export type GamePhase = 'player_input' | 'ai_processing' | 'ai_response' | 'resolution';

export type PlayerAction = {
  id: string;
  playerId: string;
  playerName: string;
  type: 'movement' | 'ability' | 'dialogue' | 'interaction' | 'combat';
  action: string;
  data?: any; // movement paths, spell targets, etc.
  timestamp: number;
  processed: boolean;
};

export type GameStatePackage = {
  turnId: string;
  timestamp: number;
  phase: GamePhase;
  characters: Character[];
  environment: {
    currentScene: string;
    weather: string;
    lighting: string;
    activeEffects: string[];
  };
  narrative: {
    recentEvents: string[];
    pendingActions: PlayerAction[];
    contextWindow: string[];
  };
  aiContext: {
    lastPrompts: string[];
    processingStartTime?: number;
    nextUpdateTimer?: number;
  };
};

export type GameStateManagerConfig = {
  playerTurnDuration: number; // milliseconds
  aiProcessingTimeout: number; // milliseconds
  maxActionsPerTurn: number;
  contextWindowSize: number; // number of previous events to keep
  enableActionBatching: boolean;
};

const DEFAULT_CONFIG: GameStateManagerConfig = {
  playerTurnDuration: 15000, // 15 seconds
  aiProcessingTimeout: 10000, // 10 seconds
  maxActionsPerTurn: 10,
  contextWindowSize: 20,
  enableActionBatching: true,
};

export const useGameStateManager = (
  config: Partial<GameStateManagerConfig> = {},
  onStateUpdate?: (state: GameStatePackage) => void,
  onProcessActions?: (actions: PlayerAction[], context: GameStatePackage) => Promise<void>
) => {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Core state
  const [gameState, setGameState] = useState<GameStatePackage>({
    turnId: `turn_${Date.now()}`,
    timestamp: Date.now(),
    phase: 'player_input',
    characters: [],
    environment: {
      currentScene: "The Eternal Tavern buzzes with activity as adventurers gather around flickering candlelight.",
      weather: "Clear",
      lighting: "Dim candlelight",
      activeEffects: [],
    },
    narrative: {
      recentEvents: [],
      pendingActions: [],
      contextWindow: [],
    },
    aiContext: {
      lastPrompts: [],
    },
  });

  // Action batching
  const [pendingActions, setPendingActions] = useState<PlayerAction[]>([]);
  const [actionTimer, setActionTimer] = useState<NodeJS.Timeout | null>(null);
  const [turnStartTime, setTurnStartTime] = useState<number>(Date.now());
  
  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Start a new turn
  const startNewTurn = useCallback(() => {
    const newTurnId = `turn_${Date.now()}`;
    const now = Date.now();
    
    setGameState(prev => ({
      ...prev,
      turnId: newTurnId,
      timestamp: now,
      phase: 'player_input',
      narrative: {
        ...prev.narrative,
        pendingActions: [],
      },
      aiContext: {
        ...prev.aiContext,
        processingStartTime: undefined,
        nextUpdateTimer: undefined,
      },
    }));
    
    setPendingActions([]);
    setTurnStartTime(now);
    setIsProcessing(false);
    
    // Clear any existing timers
    if (actionTimer) clearTimeout(actionTimer);
    if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    
    console.log(`🎲 New turn started: ${newTurnId}`);
  }, [actionTimer]);

  // Add action to batch
  const addAction = useCallback((action: Omit<PlayerAction, 'id' | 'timestamp' | 'processed'>) => {
    if (gameState.phase !== 'player_input') {
      console.warn('Cannot add action: not in player input phase');
      return false;
    }

    if (pendingActions.length >= fullConfig.maxActionsPerTurn) {
      console.warn('Cannot add action: max actions per turn reached');
      return false;
    }

    const newAction: PlayerAction = {
      ...action,
      id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      processed: false,
    };

    setPendingActions(prev => [...prev, newAction]);

    // Start or restart the action timer if batching is enabled
    if (fullConfig.enableActionBatching) {
      if (actionTimer) clearTimeout(actionTimer);
      
      const newTimer = setTimeout(() => {
        processActionBatch();
      }, fullConfig.playerTurnDuration);
      
      setActionTimer(newTimer);
    } else {
      // Process immediately if batching disabled
      processActionBatch([newAction]);
    }

    console.log(`📝 Action added: ${newAction.type} by ${newAction.playerName}`);
    return true;
  }, [gameState.phase, pendingActions.length, fullConfig, actionTimer]);

  // Process batch of actions
  const processActionBatch = useCallback(async (actionsToProcess?: PlayerAction[]) => {
    const actions = actionsToProcess || pendingActions;
    if (actions.length === 0) return;

    console.log(`⚙️ Processing ${actions.length} actions...`);

    // Update game state to processing phase
    setGameState(prev => ({
      ...prev,
      phase: 'ai_processing',
      narrative: {
        ...prev.narrative,
        pendingActions: actions,
      },
      aiContext: {
        ...prev.aiContext,
        processingStartTime: Date.now(),
      },
    }));

    setIsProcessing(true);

    // Set processing timeout
    processingTimeoutRef.current = setTimeout(() => {
      console.warn('⚠️ AI processing timeout, moving to resolution');
      setGameState(prev => ({ ...prev, phase: 'resolution' }));
      setIsProcessing(false);
    }, fullConfig.aiProcessingTimeout);

    try {
      // Call the processing function
      if (onProcessActions) {
        await onProcessActions(actions, gameState);
      }
      
      // Move to AI response phase
      setGameState(prev => ({
        ...prev,
        phase: 'ai_response',
        aiContext: {
          ...prev.aiContext,
          processingStartTime: undefined,
        },
      }));
      
    } catch (error) {
      console.error('❌ Error processing actions:', error);
      setGameState(prev => ({ ...prev, phase: 'resolution' }));
    } finally {
      setIsProcessing(false);
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
        processingTimeoutRef.current = null;
      }
    }

    // Clear processed actions
    setPendingActions([]);
    if (actionTimer) {
      clearTimeout(actionTimer);
      setActionTimer(null);
    }
  }, [pendingActions, gameState, onProcessActions, fullConfig.aiProcessingTimeout, actionTimer]);

  // Apply AI response and move to resolution
  const applyAIResponse = useCallback((response: string, effects?: any[]) => {
    console.log(`🤖 AI Response received: ${response.substring(0, 100)}...`);
    
    setGameState(prev => {
      const updatedState = {
        ...prev,
        phase: 'resolution' as GamePhase,
        narrative: {
          ...prev.narrative,
          recentEvents: [
            ...prev.narrative.recentEvents.slice(-fullConfig.contextWindowSize + 1),
            response
          ],
          contextWindow: [
            ...prev.narrative.contextWindow.slice(-fullConfig.contextWindowSize + 1),
            `Turn ${prev.turnId}: ${response}`
          ],
        },
        environment: {
          ...prev.environment,
          // Apply any environmental effects from AI response
          activeEffects: effects ? [...prev.environment.activeEffects, ...effects] : prev.environment.activeEffects,
        },
        timestamp: Date.now(),
      };

      // Notify state update
      if (onStateUpdate) {
        onStateUpdate(updatedState);
      }

      return updatedState;
    });

    // Auto-start next turn after brief delay
    setTimeout(() => {
      startNewTurn();
    }, 2000);
  }, [fullConfig.contextWindowSize, onStateUpdate, startNewTurn]);

  // Update character state
  const updateCharacter = useCallback((characterId: string, updates: Partial<Character>) => {
    setGameState(prev => ({
      ...prev,
      characters: prev.characters.map(char => 
        char.id === characterId ? { ...char, ...updates } : char
      ),
    }));
  }, []);

  // Add character
  const addCharacter = useCallback((character: Character) => {
    setGameState(prev => ({
      ...prev,
      characters: [...prev.characters.filter(c => c.id !== character.id), character],
    }));
  }, []);

  // Update environment
  const updateEnvironment = useCallback((updates: Partial<GameStatePackage['environment']>) => {
    setGameState(prev => ({
      ...prev,
      environment: { ...prev.environment, ...updates },
    }));
  }, []);

  // Get turn info
  const getTurnInfo = useCallback(() => {
    const now = Date.now();
    const elapsed = now - turnStartTime;
    const remaining = Math.max(0, fullConfig.playerTurnDuration - elapsed);
    
    return {
      turnId: gameState.turnId,
      phase: gameState.phase,
      elapsed,
      remaining,
      isProcessing,
      actionCount: pendingActions.length,
      maxActions: fullConfig.maxActionsPerTurn,
    };
  }, [gameState.turnId, gameState.phase, turnStartTime, fullConfig.playerTurnDuration, isProcessing, pendingActions.length, fullConfig.maxActionsPerTurn]);

  // Force process actions (emergency button)
  const forceProcessActions = useCallback(() => {
    if (pendingActions.length > 0) {
      processActionBatch();
    }
  }, [pendingActions, processActionBatch]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (actionTimer) clearTimeout(actionTimer);
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current);
    };
  }, [actionTimer]);

  return {
    // State
    gameState,
    turnInfo: getTurnInfo(),
    pendingActions,
    
    // Actions
    addAction,
    applyAIResponse,
    updateCharacter,
    addCharacter,
    updateEnvironment,
    startNewTurn,
    forceProcessActions,
    
    // Utilities
    isProcessing,
    canAddAction: gameState.phase === 'player_input' && pendingActions.length < fullConfig.maxActionsPerTurn,
  };
};

export default useGameStateManager;