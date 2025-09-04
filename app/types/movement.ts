// Server-Side Movement Validation Types for WebSocket Integration

export type Coord = { x: number; y: number };
export type Terrain = "normal" | "difficult" | "blocked" | "hazard";

export type MovementRequest = {
  type: 'MOVEMENT_REQUEST';
  playerId: string;
  characterId: string;
  from: Coord;
  to: Coord;
  path: Coord[];
  dash: boolean;
  disengage: boolean;
  timestamp: number;
  roomId?: string;
};

export type MovementValidationResult = {
  valid: boolean;
  cost: number;
  actualPath?: Coord[]; // Server-corrected path
  errors: string[];
  warnings: string[];
  opportunityAttacks: {
    enemyId: string;
    enemyName: string;
    position: Coord;
    reach: number;
    damage?: string; // If attack hits
    rolled?: boolean;
  }[];
  effectsTriggered: {
    type: 'hazard' | 'trap' | 'spell' | 'environmental';
    position: Coord;
    description: string;
    damage?: string;
    conditions?: string[];
  }[];
  remainingMovement: number;
  stamina?: number; // If using stamina system
};

export type MovementResponse = {
  type: 'MOVEMENT_RESPONSE';
  requestId?: string;
  playerId: string;
  result: MovementValidationResult;
  newPosition?: Coord;
  timestamp: number;
};

export type CombatMovementData = {
  initiative: number;
  hasActedThisTurn: boolean;
  hasDashedThisTurn: boolean;
  hasDisengagedThisTurn: boolean;
  movementUsed: number;
  actionsUsed: number;
  bonusActionsUsed: number;
  reactions: string[]; // What reactions are available
};

export type GridUpdateMessage = {
  type: 'GRID_UPDATE';
  changes: {
    position: Coord;
    newTerrain: Terrain;
    reason: string;
  }[];
  timestamp: number;
};

export type CharacterPositionUpdate = {
  type: 'CHARACTER_POSITION_UPDATE';
  updates: {
    characterId: string;
    playerId: string;
    position: Coord;
    facing?: number; // degrees, 0 = north
    stance?: 'standing' | 'prone' | 'crouched';
    conditions: string[];
  }[];
  timestamp: number;
};

// Server validation rules
export interface MovementRules {
  baseSpeed: number; // feet per turn
  difficultTerrainMultiplier: number; // usually 2
  dashMultiplier: number; // usually 2
  maxDashPerTurn: number; // usually 1
  allowDiagonalMovement: boolean;
  diagonalCostMultiplier: number; // some systems make diagonals cost 1.5x
  opportunityAttackRange: number; // usually 5 feet
  
  // Advanced rules
  allowProvokedMovement: boolean; // can you move when grappled, etc.
  swimSpeedRatio: number; // swimming speed as ratio of land speed
  climbSpeedRatio: number; // climbing speed as ratio of land speed
  flySpeedModifiers: {
    hovering: boolean;
    maneuverability: 'clumsy' | 'poor' | 'average' | 'good' | 'perfect';
  };
}

// For integration with existing WebSocket types
export interface MovementWebSocketMessage {
  type: 'MOVEMENT_REQUEST' | 'MOVEMENT_RESPONSE' | 'GRID_UPDATE' | 'CHARACTER_POSITION_UPDATE';
  roomId?: string;
  playerId: string;
  data: MovementRequest | MovementResponse | GridUpdateMessage | CharacterPositionUpdate;
  timestamp: number;
}

// Enhanced game state for server
export interface ServerGameGrid {
  width: number;
  height: number;
  terrain: Terrain[][];
  
  // Dynamic elements
  characters: Map<string, {
    playerId: string;
    position: Coord;
    speed: number;
    conditions: string[];
    combatData?: CombatMovementData;
  }>;
  
  enemies: Map<string, {
    position: Coord;
    reach: number;
    name: string;
    hitPoints: number;
    armorClass: number;
    initiative?: number;
  }>;
  
  hazards: Map<string, {
    position: Coord;
    type: string;
    damage: string;
    description: string;
    permanent: boolean;
    triggersOn: 'enter' | 'end_turn' | 'start_turn';
  }>;
  
  effects: Map<string, {
    position: Coord;
    radius: number;
    type: string;
    description: string;
    duration: number; // turns
    caster?: string;
  }>;
}

// Pathfinding result with enhanced data
export interface ServerPathfindingResult {
  path: Coord[];
  totalCost: number;
  segmentCosts: number[];
  hazardsEncountered: string[];
  effectsTriggered: string[];
  alternativePaths?: {
    path: Coord[];
    cost: number;
    reason: string; // why this alternative exists
  }[];
}

// Combat integration
export interface CombatState {
  active: boolean;
  round: number;
  turnOrder: string[]; // character/enemy IDs
  currentTurnIndex: number;
  initiativeRolls: Map<string, number>;
  
  // Movement tracking
  movementThisTurn: Map<string, number>;
  actionsThisTurn: Map<string, {
    action: boolean;
    bonusAction: boolean;
    reaction: string[];
    movement: number;
  }>;
}

export default MovementRequest;