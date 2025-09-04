import { useState, useCallback, useRef, useEffect } from 'react';

// Enhanced Movement System with D&D 5e Rules and Server Integration

export type Coord = { x: number; y: number };
export type Terrain = "normal" | "difficult" | "blocked" | "hazard";

export type MovementAction = {
  type: 'move' | 'dash' | 'disengage' | 'opportunity_attack';
  playerId: string;
  from: Coord;
  to: Coord;
  path: Coord[];
  cost: number;
  dash: boolean;
  disengage: boolean;
  timestamp: number;
};

export type MovementValidation = {
  valid: boolean;
  cost: number;
  errors: string[];
  warnings: string[];
  opportunityAttacks: {
    enemyId: string;
    enemyName: string;
    position: Coord;
    reach: number;
    triggered: boolean;
  }[];
  needsDash: boolean;
  remainingMovement: number;
};

export type GridState = {
  terrain: Terrain[][];
  characters: Map<string, { position: Coord; speed: number; conditions: string[] }>;
  enemies: Map<string, { position: Coord; reach: number; name: string }>;
  hazards: Map<string, { position: Coord; type: string; damage: string }>;
};

const keyOf = (c: Coord) => `${c.x},${c.y}`;
const manhattan = (a: Coord, b: Coord) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// Calculate movement cost between adjacent squares
function moveCost(from: Coord, to: Coord, terrain: Terrain): number {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  
  if (dx > 1 || dy > 1) return Infinity; // not adjacent
  if (dx === 0 && dy === 0) return 0; // same square
  
  const base = 5; // 5 feet per square
  
  switch (terrain) {
    case "blocked":
      return Infinity;
    case "difficult":
      return base * 2;
    case "hazard":
      return base; // same as normal but with consequences
    default:
      return base;
  }
}

// Enhanced A* pathfinding with D&D rules
function findPath(grid: Terrain[][], start: Coord, goal: Coord): { path: Coord[]; cost: number } {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  
  const inBounds = (c: Coord) => c.x >= 0 && c.y >= 0 && c.x < w && c.y < h;
  const passable = (c: Coord) => grid[c.y][c.x] !== "blocked";
  
  const neighbors = (c: Coord): Coord[] => {
    const n: Coord[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = c.x + dx;
        const ny = c.y + dy;
        const nc = { x: nx, y: ny };
        if (inBounds(nc) && passable(nc)) n.push(nc);
      }
    }
    return n;
  };

  const openSet = new Set<string>([keyOf(start)]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[keyOf(start), 0]]);
  const fScore = new Map<string, number>([[keyOf(start), manhattan(start, goal)]]);

  while (openSet.size > 0) {
    let current = "";
    let lowestF = Infinity;
    
    for (const key of openSet) {
      const f = fScore.get(key) ?? Infinity;
      if (f < lowestF) {
        lowestF = f;
        current = key;
      }
    }

    if (!current) break;

    const [cx, cy] = current.split(",").map(Number);
    const currentCoord = { x: cx, y: cy };

    if (cx === goal.x && cy === goal.y) {
      // Reconstruct path
      const path: Coord[] = [];
      let pathKey = current;
      
      while (pathKey) {
        const [px, py] = pathKey.split(",").map(Number);
        path.unshift({ x: px, y: py });
        pathKey = cameFrom.get(pathKey) || "";
      }
      
      // Calculate total cost
      let totalCost = 0;
      for (let i = 1; i < path.length; i++) {
        const from = path[i - 1];
        const to = path[i];
        const terrain = grid[to.y][to.x];
        totalCost += moveCost(from, to, terrain);
      }
      
      return { path, cost: totalCost };
    }

    openSet.delete(current);

    for (const neighbor of neighbors(currentCoord)) {
      const nKey = keyOf(neighbor);
      const terrain = grid[neighbor.y][neighbor.x];
      const tentativeG = (gScore.get(current) ?? 0) + moveCost(currentCoord, neighbor, terrain);

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + manhattan(neighbor, goal));
        openSet.add(nKey);
      }
    }
  }

  return { path: [], cost: Infinity };
}

// Check opportunity attacks along a path
function checkOpportunityAttacks(
  path: Coord[],
  enemies: Map<string, { position: Coord; reach: number; name: string }>,
  disengage: boolean
): MovementValidation['opportunityAttacks'] {
  if (disengage || path.length < 2) return [];
  
  const attacks: MovementValidation['opportunityAttacks'] = [];
  
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1];
    const to = path[i];
    
    for (const [enemyId, enemy] of enemies.entries()) {
      const wasInReach = manhattan(from, enemy.position) <= enemy.reach;
      const stillInReach = manhattan(to, enemy.position) <= enemy.reach;
      
      if (wasInReach && !stillInReach) {
        // Moving out of reach triggers opportunity attack
        const existingAttack = attacks.find(a => a.enemyId === enemyId);
        if (!existingAttack) {
          attacks.push({
            enemyId,
            enemyName: enemy.name,
            position: enemy.position,
            reach: enemy.reach,
            triggered: true,
          });
        }
      }
    }
  }
  
  return attacks;
}

export const useMovementSystem = (
  onMoveRequest?: (action: MovementAction) => Promise<MovementValidation>,
  onMovementComplete?: (action: MovementAction, result: MovementValidation) => void
) => {
  const [gridState, setGridState] = useState<GridState>({
    terrain: Array(12).fill(null).map(() => Array(12).fill("normal" as Terrain)),
    characters: new Map(),
    enemies: new Map(),
    hazards: new Map(),
  });

  const [pendingMovement, setPendingMovement] = useState<MovementAction | null>(null);
  const [previewPath, setPreviewPath] = useState<{ path: Coord[]; cost: number } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Initialize default terrain with some variety
  useEffect(() => {
    setGridState(prev => {
      const newTerrain = [...prev.terrain];
      
      // Add some difficult terrain
      newTerrain[3][3] = "difficult";
      newTerrain[3][4] = "difficult";
      newTerrain[4][3] = "difficult";
      
      // Add some blocked areas
      newTerrain[7][2] = "blocked";
      newTerrain[7][3] = "blocked";
      newTerrain[8][2] = "blocked";
      
      // Add hazards
      newTerrain[5][8] = "hazard";
      newTerrain[9][5] = "hazard";
      
      return {
        ...prev,
        terrain: newTerrain,
      };
    });

    // Add some default enemies
    setGridState(prev => ({
      ...prev,
      enemies: new Map([
        ['orc1', { position: { x: 6, y: 6 }, reach: 1, name: 'Orc Warrior' }],
        ['goblin1', { position: { x: 9, y: 3 }, reach: 1, name: 'Goblin Archer' }],
      ]),
      hazards: new Map([
        ['fire1', { position: { x: 5, y: 8 }, type: 'fire', damage: '1d6 fire' }],
        ['acid1', { position: { x: 9, y: 5 }, type: 'acid', damage: '1d4 acid' }],
      ]),
    }));
  }, []);

  // Update character position
  const updateCharacterPosition = useCallback((
    characterId: string,
    position: Coord,
    speed: number = 30,
    conditions: string[] = []
  ) => {
    setGridState(prev => ({
      ...prev,
      characters: new Map(prev.characters.set(characterId, { position, speed, conditions })),
    }));
  }, []);

  // Validate movement client-side
  const validateMovement = useCallback((
    characterId: string,
    targetPosition: Coord,
    dash: boolean = false,
    disengage: boolean = false
  ): MovementValidation => {
    const character = gridState.characters.get(characterId);
    if (!character) {
      return {
        valid: false,
        cost: Infinity,
        errors: ['Character not found'],
        warnings: [],
        opportunityAttacks: [],
        needsDash: false,
        remainingMovement: 0,
      };
    }

    // Find path
    const pathResult = findPath(gridState.terrain, character.position, targetPosition);
    if (pathResult.path.length === 0) {
      return {
        valid: false,
        cost: Infinity,
        errors: ['No valid path to target'],
        warnings: [],
        opportunityAttacks: [],
        needsDash: false,
        remainingMovement: 0,
      };
    }

    // Calculate available speed
    let availableSpeed = character.speed;
    if (dash) availableSpeed *= 2;
    
    // Apply conditions
    if (character.conditions.includes('Grappled') || character.conditions.includes('Prone')) {
      availableSpeed = Math.floor(availableSpeed / 2);
    }
    if (character.conditions.includes('Slowed')) {
      availableSpeed = Math.floor(availableSpeed / 2);
    }

    const cost = pathResult.cost;
    const needsDash = cost > character.speed;
    const canMove = cost <= availableSpeed;
    
    // Check opportunity attacks
    const opportunityAttacks = checkOpportunityAttacks(pathResult.path, gridState.enemies, disengage);
    
    // Check for hazards in path
    const warnings: string[] = [];
    const hazardSquares: string[] = [];
    
    for (const coord of pathResult.path) {
      const terrain = gridState.terrain[coord.y][coord.x];
      const hazard = Array.from(gridState.hazards.values()).find(h => 
        h.position.x === coord.x && h.position.y === coord.y
      );
      
      if (terrain === 'hazard' || hazard) {
        const hazardType = hazard ? hazard.type : 'unknown';
        const damage = hazard ? hazard.damage : '1d4';
        hazardSquares.push(`${hazardType} (${damage})`);
      }
    }
    
    if (hazardSquares.length > 0) {
      warnings.push(`Path crosses hazards: ${hazardSquares.join(', ')}`);
    }
    
    if (opportunityAttacks.length > 0 && !disengage) {
      warnings.push(`Will provoke ${opportunityAttacks.length} opportunity attack(s)`);
    }

    return {
      valid: canMove,
      cost,
      errors: canMove ? [] : [`Insufficient movement: need ${cost}ft, have ${availableSpeed}ft`],
      warnings,
      opportunityAttacks,
      needsDash,
      remainingMovement: Math.max(0, availableSpeed - cost),
    };
  }, [gridState]);

  // Preview movement path
  const previewMovement = useCallback((
    characterId: string,
    targetPosition: Coord
  ) => {
    const character = gridState.characters.get(characterId);
    if (!character) {
      setPreviewPath(null);
      return null;
    }

    const pathResult = findPath(gridState.terrain, character.position, targetPosition);
    setPreviewPath(pathResult.path.length > 0 ? pathResult : null);
    return pathResult;
  }, [gridState]);

  // Execute movement
  const executeMovement = useCallback(async (
    characterId: string,
    targetPosition: Coord,
    dash: boolean = false,
    disengage: boolean = false
  ) => {
    const character = gridState.characters.get(characterId);
    if (!character) return false;

    // Client-side validation
    const validation = validateMovement(characterId, targetPosition, dash, disengage);
    if (!validation.valid) {
      console.warn('Invalid movement:', validation.errors);
      return false;
    }

    // Find path
    const pathResult = findPath(gridState.terrain, character.position, targetPosition);
    if (pathResult.path.length === 0) return false;

    const action: MovementAction = {
      type: 'move',
      playerId: characterId,
      from: character.position,
      to: targetPosition,
      path: pathResult.path,
      cost: pathResult.cost,
      dash,
      disengage,
      timestamp: Date.now(),
    };

    setPendingMovement(action);
    setIsValidating(true);

    try {
      // Server-side validation if available
      if (onMoveRequest) {
        const serverValidation = await onMoveRequest(action);
        
        if (serverValidation.valid) {
          // Update character position
          updateCharacterPosition(characterId, targetPosition, character.speed, character.conditions);
          
          // Notify completion
          if (onMovementComplete) {
            onMovementComplete(action, serverValidation);
          }
          
          console.log(`✅ Movement completed: ${characterId} to (${targetPosition.x}, ${targetPosition.y})`);
          return true;
        } else {
          console.warn('Server rejected movement:', serverValidation.errors);
          return false;
        }
      } else {
        // No server validation, just update locally
        updateCharacterPosition(characterId, targetPosition, character.speed, character.conditions);
        
        if (onMovementComplete) {
          onMovementComplete(action, validation);
        }
        
        return true;
      }
    } catch (error) {
      console.error('Movement execution failed:', error);
      return false;
    } finally {
      setPendingMovement(null);
      setIsValidating(false);
      setPreviewPath(null);
    }
  }, [gridState, validateMovement, updateCharacterPosition, onMoveRequest, onMovementComplete]);

  // Update grid terrain
  const updateTerrain = useCallback((position: Coord, terrain: Terrain) => {
    setGridState(prev => {
      const newTerrain = [...prev.terrain];
      newTerrain[position.y][position.x] = terrain;
      return { ...prev, terrain: newTerrain };
    });
  }, []);

  // Add/update enemy
  const updateEnemy = useCallback((enemyId: string, position: Coord, reach: number, name: string) => {
    setGridState(prev => ({
      ...prev,
      enemies: new Map(prev.enemies.set(enemyId, { position, reach, name })),
    }));
  }, []);

  // Remove enemy
  const removeEnemy = useCallback((enemyId: string) => {
    setGridState(prev => {
      const newEnemies = new Map(prev.enemies);
      newEnemies.delete(enemyId);
      return { ...prev, enemies: newEnemies };
    });
  }, []);

  // Get character at position
  const getCharacterAt = useCallback((position: Coord): string | null => {
    for (const [charId, char] of gridState.characters.entries()) {
      if (char.position.x === position.x && char.position.y === position.y) {
        return charId;
      }
    }
    return null;
  }, [gridState.characters]);

  // Get enemy at position
  const getEnemyAt = useCallback((position: Coord): string | null => {
    for (const [enemyId, enemy] of gridState.enemies.entries()) {
      if (enemy.position.x === position.x && enemy.position.y === position.y) {
        return enemyId;
      }
    }
    return null;
  }, [gridState.enemies]);

  return {
    // State
    gridState,
    pendingMovement,
    previewPath,
    isValidating,
    
    // Actions
    updateCharacterPosition,
    validateMovement,
    previewMovement,
    executeMovement,
    updateTerrain,
    updateEnemy,
    removeEnemy,
    
    // Utilities
    getCharacterAt,
    getEnemyAt,
    findPath: (start: Coord, goal: Coord) => findPath(gridState.terrain, start, goal),
  };
};

export default useMovementSystem;