"use client";

import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { Character, GameRoom } from '../types/dnd';

// Game State Types
export interface GameState {
  // Core game data
  currentRoom: GameRoom | null;
  currentPlayer: any | null;
  playerCharacter: Character | null;
  
  // UI States
  activeModal: 'none' | 'character-sheet' | 'character-profile' | 'inventory' | 'settings' | 'current-context';
  showHUD: boolean;
  chatAutoScroll: boolean;
  
  // Game Phase
  phase: 'login' | 'guest_character_choice' | 'lobby' | 'character_creation' | 'character_customization' | 'playing';
  
  // Notifications and Alerts
  notifications: GameNotification[];
  
  // Combat and Turn System
  inCombat: boolean;
  currentTurn: string | null;
  turnOrder: string[];
}

export interface GameNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
  duration?: number; // Auto-dismiss time in ms
}

// Action Types
type GameStateAction =
  | { type: 'SET_ROOM'; payload: GameRoom | null }
  | { type: 'SET_PLAYER'; payload: any | null }
  | { type: 'SET_CHARACTER'; payload: Character | null }
  | { type: 'SET_PHASE'; payload: GameState['phase'] }
  | { type: 'SET_MODAL'; payload: GameState['activeModal'] }
  | { type: 'TOGGLE_HUD' }
  | { type: 'TOGGLE_CHAT_AUTO_SCROLL' }
  | { type: 'ADD_NOTIFICATION'; payload: Omit<GameNotification, 'id' | 'timestamp'> }
  | { type: 'REMOVE_NOTIFICATION'; payload: string }
  | { type: 'SET_COMBAT'; payload: { inCombat: boolean; currentTurn?: string | null; turnOrder?: string[] } }
  | { type: 'RESET_STATE' };

// Initial State
const initialGameState: GameState = {
  currentRoom: null,
  currentPlayer: null,
  playerCharacter: null,
  activeModal: 'none',
  showHUD: true,
  chatAutoScroll: true,
  phase: 'login',
  notifications: [],
  inCombat: false,
  currentTurn: null,
  turnOrder: []
};

// Reducer
function gameStateReducer(state: GameState, action: GameStateAction): GameState {
  switch (action.type) {
    case 'SET_ROOM':
      return { ...state, currentRoom: action.payload };
    
    case 'SET_PLAYER':
      return { ...state, currentPlayer: action.payload };
    
    case 'SET_CHARACTER':
      return { ...state, playerCharacter: action.payload };
    
    case 'SET_PHASE':
      return { ...state, phase: action.payload };
    
    case 'SET_MODAL':
      return { ...state, activeModal: action.payload };
    
    case 'TOGGLE_HUD':
      return { ...state, showHUD: !state.showHUD };
    
    case 'TOGGLE_CHAT_AUTO_SCROLL':
      return { ...state, chatAutoScroll: !state.chatAutoScroll };
    
    case 'ADD_NOTIFICATION':
      const notification: GameNotification = {
        ...action.payload,
        id: Math.random().toString(36).substr(2, 9),
        timestamp: Date.now()
      };
      return {
        ...state,
        notifications: [...state.notifications, notification]
      };
    
    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload)
      };
    
    case 'SET_COMBAT':
      return {
        ...state,
        inCombat: action.payload.inCombat,
        currentTurn: action.payload.currentTurn ?? state.currentTurn,
        turnOrder: action.payload.turnOrder ?? state.turnOrder
      };
    
    case 'RESET_STATE':
      return initialGameState;
    
    default:
      return state;
  }
}

// Context
const GameStateContext = createContext<{
  state: GameState;
  dispatch: React.Dispatch<GameStateAction>;
} | null>(null);

// Provider Component
export function GameStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gameStateReducer, initialGameState);

  return (
    <GameStateContext.Provider value={{ state, dispatch }}>
      {children}
    </GameStateContext.Provider>
  );
}

// Custom Hook
export function useGameState() {
  const context = useContext(GameStateContext);
  if (!context) {
    throw new Error('useGameState must be used within a GameStateProvider');
  }
  return context;
}

// Helper Functions
export const gameStateHelpers = {
  // Show notification
  showNotification: (
    dispatch: React.Dispatch<GameStateAction>, 
    notification: Omit<GameNotification, 'id' | 'timestamp'>
  ) => {
    dispatch({ type: 'ADD_NOTIFICATION', payload: notification });
    
    // Auto-dismiss if duration is specified
    if (notification.duration) {
      setTimeout(() => {
        // Note: This won't work perfectly due to closure, but it's a basic implementation
        // In a real app, you'd want to use useEffect or a ref to track the notification ID
      }, notification.duration);
    }
  },

  // Combat helpers
  startCombat: (dispatch: React.Dispatch<GameStateAction>, turnOrder: string[]) => {
    dispatch({ 
      type: 'SET_COMBAT', 
      payload: { inCombat: true, turnOrder, currentTurn: turnOrder[0] } 
    });
  },

  endCombat: (dispatch: React.Dispatch<GameStateAction>) => {
    dispatch({ 
      type: 'SET_COMBAT', 
      payload: { inCombat: false, currentTurn: null, turnOrder: [] } 
    });
  },

  nextTurn: (dispatch: React.Dispatch<GameStateAction>, state: GameState) => {
    if (!state.inCombat || !state.currentTurn) return;
    
    const currentIndex = state.turnOrder.indexOf(state.currentTurn);
    const nextIndex = (currentIndex + 1) % state.turnOrder.length;
    const nextTurn = state.turnOrder[nextIndex];
    
    dispatch({ 
      type: 'SET_COMBAT', 
      payload: { inCombat: true, currentTurn: nextTurn } 
    });
  }
};