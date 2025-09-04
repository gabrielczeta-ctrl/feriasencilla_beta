import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useMovementSystem, Coord, Terrain } from "../hooks/useMovementSystem";
import { PlayerAction } from "../hooks/useGameStateManager";

// Enhanced Movement & Memory HUD with Full Game Integration

type MemoryEntry = {
  id: string;
  turn: number;
  tag: "Quest" | "NPC" | "Note" | "Condition" | "Combat" | "Loot";
  text: string;
  createdAt: number;
  priority: 'low' | 'medium' | 'high';
  category?: string;
};

type Character = {
  id: string;
  name: string;
  speed: number;
  bonuses?: number;
  penalties?: number;
  conditions: string[];
  position: Coord;
  memory: MemoryEntry[];
  hitPoints?: { current: number; maximum: number };
  armorClass?: number;
};

type SaveSnapshot = {
  character: Character;
  grid: Terrain[][];
  enemies: Array<{ id: string; name: string; position: Coord; reach: number }>;
  turnNumber: number;
  timestamp: number;
};

interface EnhancedMovementHUDProps {
  onSaveState?: (slot: number, snapshot: SaveSnapshot) => void;
  onLoadState?: (slot: number) => SaveSnapshot | null;
  onAddAction?: (action: Omit<PlayerAction, 'id' | 'timestamp' | 'processed'>) => boolean;
  initialCharacter?: Partial<Character>;
  turnNumber?: number;
  gamePhase?: 'player_input' | 'ai_processing' | 'ai_response' | 'resolution';
  canAct?: boolean;
}

const EnhancedMovementHUD: React.FC<EnhancedMovementHUDProps> = ({
  onSaveState,
  onLoadState,
  onAddAction,
  initialCharacter,
  turnNumber = 1,
  gamePhase = 'player_input',
  canAct = true
}) => {
  const defaultCharacter: Character = {
    id: "player",
    name: "Hero",
    speed: 30,
    bonuses: 0,
    penalties: 0,
    conditions: [],
    position: { x: 1, y: 1 },
    memory: [],
    hitPoints: { current: 25, maximum: 25 },
    armorClass: 15,
    ...initialCharacter
  };

  const [character, setCharacter] = useState<Character>(defaultCharacter);
  const [hoveredCell, setHoveredCell] = useState<Coord | null>(null);
  const [dash, setDash] = useState(false);
  const [disengage, setDisengage] = useState(false);
  const [showMemory, setShowMemory] = useState(true);
  const [newMemoryText, setNewMemoryText] = useState("");
  const [newMemoryTag, setNewMemoryTag] = useState<MemoryEntry["tag"]>("Note");
  const [newMemoryPriority, setNewMemoryPriority] = useState<MemoryEntry["priority"]>("medium");

  // Initialize movement system
  const {
    gridState,
    validateMovement,
    previewMovement,
    executeMovement,
    updateCharacterPosition,
    previewPath,
    isValidating
  } = useMovementSystem(
    // Server validation callback
    async (action) => {
      console.log('Server validating movement:', action);
      // This would normally call your server
      return {
        valid: true,
        cost: action.cost,
        errors: [],
        warnings: [],
        opportunityAttacks: [],
        needsDash: false,
        remainingMovement: 0
      };
    },
    // Movement completion callback
    (action, result) => {
      console.log('Movement completed:', action, result);
      
      // Add movement to memory if significant
      if (result.opportunityAttacks.length > 0 || result.warnings.length > 0) {
        const memoryText = `Moved to (${action.to.x}, ${action.to.y}). ${
          result.warnings.join(', ')
        }`;
        addMemoryEntry(memoryText, 'Combat', 'high');
      }

      // Add as game action
      if (onAddAction) {
        onAddAction({
          playerId: character.id,
          playerName: character.name,
          type: 'movement',
          action: `Moved to position (${action.to.x}, ${action.to.y})${action.dash ? ' (dashed)' : ''}${action.disengage ? ' (disengaged)' : ''}`,
          data: action,
        });
      }

      // Reset movement states
      setDash(false);
      setDisengage(false);
    }
  );

  // Update character position in movement system
  useEffect(() => {
    updateCharacterPosition(character.id, character.position, character.speed, character.conditions);
  }, [character, updateCharacterPosition]);

  // Calculate available movement
  const availableSpeed = useMemo(() => {
    let base = character.speed;
    if (character.bonuses) base += character.bonuses;
    if (character.penalties) base -= character.penalties;
    if (dash) base *= 2;
    if (character.conditions.includes("Grappled") || character.conditions.includes("Prone")) {
      base = Math.floor(base / 2);
    }
    return Math.max(0, base);
  }, [character, dash]);

  // Preview movement when hovering
  useEffect(() => {
    if (hoveredCell) {
      previewMovement(character.id, hoveredCell);
    }
  }, [hoveredCell, character.id, previewMovement]);

  // Validate current preview
  const movementInfo = useMemo(() => {
    if (!hoveredCell) return null;
    return validateMovement(character.id, hoveredCell, dash, disengage);
  }, [hoveredCell, character.id, dash, disengage, validateMovement]);

  // Handle cell click for movement
  const handleCellClick = useCallback(async (coord: Coord) => {
    if (!canAct || gamePhase !== 'player_input') {
      console.warn('Cannot move: not in player input phase');
      return;
    }

    if (!movementInfo?.valid) {
      console.warn('Invalid movement:', movementInfo?.errors);
      return;
    }
    
    const needsDash = movementInfo.needsDash;
    if (needsDash && !dash) {
      setDash(true);
      return;
    }

    // Execute movement
    const success = await executeMovement(character.id, coord, dash, disengage);
    if (success) {
      // Update local character state
      setCharacter(prev => ({ ...prev, position: coord }));
    }
  }, [canAct, gamePhase, movementInfo, dash, disengage, executeMovement, character.id]);

  // Add memory entry
  const addMemoryEntry = useCallback((
    text?: string,
    tag?: MemoryEntry["tag"],
    priority?: MemoryEntry["priority"]
  ) => {
    const entryText = text || newMemoryText.trim();
    if (!entryText) return;
    
    const entry: MemoryEntry = {
      id: `memory_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      turn: turnNumber,
      tag: tag || newMemoryTag,
      text: entryText,
      createdAt: Date.now(),
      priority: priority || newMemoryPriority,
    };

    setCharacter(prev => ({
      ...prev,
      memory: [...prev.memory, entry]
    }));

    // Add to game actions if it's important
    if (entry.priority === 'high' && onAddAction) {
      onAddAction({
        playerId: character.id,
        playerName: character.name,
        type: 'interaction',
        action: `Noted: [${entry.tag}] ${entry.text}`,
        data: entry,
      });
    }

    if (!text) {
      setNewMemoryText("");
    }
  }, [newMemoryText, newMemoryTag, newMemoryPriority, turnNumber, onAddAction, character.id, character.name]);

  // Save/Load functionality
  const handleSave = useCallback((slot: number) => {
    const snapshot: SaveSnapshot = {
      character,
      grid: gridState.terrain,
      enemies: Array.from(gridState.enemies.entries()).map(([id, enemy]) => ({
        id,
        ...enemy
      })),
      turnNumber,
      timestamp: Date.now()
    };
    
    if (onSaveState) {
      onSaveState(slot, snapshot);
    } else {
      localStorage.setItem(`dnd_enhanced_save_${slot}`, JSON.stringify(snapshot));
    }
    
    // Add save action to memory
    addMemoryEntry(`Game saved to slot ${slot}`, 'Note', 'low');
  }, [character, gridState, turnNumber, onSaveState, addMemoryEntry]);

  const handleLoad = useCallback((slot: number) => {
    let snapshot: SaveSnapshot | null = null;
    
    if (onLoadState) {
      snapshot = onLoadState(slot);
    } else {
      const saved = localStorage.getItem(`dnd_enhanced_save_${slot}`);
      if (saved) {
        try {
          snapshot = JSON.parse(saved);
        } catch (e) {
          console.error("Failed to load save:", e);
        }
      }
    }

    if (snapshot) {
      setCharacter(snapshot.character);
      // Note: In a full implementation, you'd also update the grid and enemies
      addMemoryEntry(`Game loaded from slot ${slot}`, 'Note', 'low');
    }
  }, [onLoadState, addMemoryEntry]);

  // Get cell styling
  const getCellColor = useCallback((x: number, y: number) => {
    const terrain = gridState.terrain[y][x];
    const isCharacterPos = character.position.x === x && character.position.y === y;
    const isEnemyPos = Array.from(gridState.enemies.values()).some(e => e.position.x === x && e.position.y === y);
    const isInPath = previewPath?.path.some(p => p.x === x && p.y === y);
    const isHovered = hoveredCell?.x === x && hoveredCell?.y === y;

    if (isCharacterPos) return "bg-blue-500 ring-2 ring-blue-300";
    if (isEnemyPos) return "bg-red-500 ring-2 ring-red-300";
    if (isHovered) return "bg-yellow-400 ring-2 ring-yellow-200";
    if (isInPath) {
      const pathIndex = previewPath?.path.findIndex(p => p.x === x && p.y === y);
      const isValidMove = movementInfo?.valid;
      return `${isValidMove ? 'bg-green-400' : 'bg-red-400'} opacity-70 ring-1 ring-white`;
    }
    
    switch (terrain) {
      case "blocked": return "bg-gray-800 border-gray-600";
      case "difficult": return "bg-orange-300 border-orange-500";
      case "hazard": return "bg-red-300 border-red-500 animate-pulse";
      default: return "bg-gray-200 border-gray-400";
    }
  }, [gridState, character.position, hoveredCell, previewPath, movementInfo]);

  // Get cell icon
  const getCellIcon = useCallback((x: number, y: number) => {
    const isCharacterPos = character.position.x === x && character.position.y === y;
    const enemy = Array.from(gridState.enemies.values()).find(e => e.position.x === x && e.position.y === y);
    const terrain = gridState.terrain[y][x];

    if (isCharacterPos) return "🛡️";
    if (enemy) return "👹";
    if (terrain === "hazard") return "🔥";
    if (terrain === "blocked") return "🪨";
    return "";
  }, [gridState, character.position]);

  const phaseColor = {
    'player_input': 'text-green-400',
    'ai_processing': 'text-yellow-400',
    'ai_response': 'text-blue-400',
    'resolution': 'text-purple-400'
  }[gamePhase];

  return (
    <div className="bg-gray-900 text-white p-4 rounded-lg space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Tactical Movement</h3>
          <div className="text-sm text-gray-400">
            Turn {turnNumber} • <span className={phaseColor}>{gamePhase.replace('_', ' ')}</span>
            {!canAct && <span className="ml-2 text-red-400">• Disabled</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map(slot => (
            <div key={slot} className="flex gap-1">
              <button
                onClick={() => handleSave(slot)}
                disabled={!canAct}
                className="px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400 rounded text-xs transition-colors"
              >
                Save {slot}
              </button>
              <button
                onClick={() => handleLoad(slot)}
                disabled={!canAct}
                className="px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-400 rounded text-xs transition-colors"
              >
                Load {slot}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Movement Grid */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium">Battle Map</h4>
            <div className="text-sm">
              Speed: {availableSpeed}ft
              {movementInfo && ` | Cost: ${movementInfo.cost}ft`}
              {isValidating && " | Validating..."}
            </div>
          </div>
          
          <div className="grid grid-cols-12 gap-1 p-2 bg-gray-800 rounded">
            {gridState.terrain.map((row, y) =>
              row.map((terrain, x) => (
                <div
                  key={`${x},${y}`}
                  className={`w-6 h-6 border cursor-pointer flex items-center justify-center text-xs ${getCellColor(x, y)} ${
                    !canAct || gamePhase !== 'player_input' ? 'cursor-not-allowed opacity-50' : ''
                  }`}
                  onMouseEnter={() => canAct && setHoveredCell({ x, y })}
                  onMouseLeave={() => setHoveredCell(null)}
                  onClick={() => handleCellClick({ x, y })}
                  title={`(${x},${y}) - ${terrain}${!canAct ? ' (disabled)' : ''}`}
                >
                  {getCellIcon(x, y)}
                </div>
              ))
            )}
          </div>

          {/* Movement Options */}
          <div className="flex gap-2 mt-2">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={dash}
                onChange={(e) => setDash(e.target.checked)}
                disabled={!canAct || gamePhase !== 'player_input'}
              />
              <span className="text-sm">Dash (Double Speed)</span>
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={disengage}
                onChange={(e) => setDisengage(e.target.checked)}
                disabled={!canAct || gamePhase !== 'player_input'}
              />
              <span className="text-sm">Disengage (No AoO)</span>
            </label>
          </div>

          {/* Movement Warnings */}
          {movementInfo && movementInfo.opportunityAttacks.length > 0 && !disengage && (
            <div className="mt-2 p-2 bg-red-900/30 border border-red-700 rounded text-sm">
              ⚠️ Opportunity Attacks: {movementInfo.opportunityAttacks.map(a => a.enemyName).join(", ")}
            </div>
          )}

          {movementInfo && movementInfo.warnings.length > 0 && (
            <div className="mt-2 p-2 bg-yellow-900/30 border border-yellow-700 rounded text-sm">
              ⚠️ {movementInfo.warnings.join("; ")}
            </div>
          )}

          {movementInfo && movementInfo.needsDash && !dash && (
            <div className="mt-2 p-2 bg-blue-900/30 border border-blue-700 rounded text-sm">
              💨 Need to Dash to reach this position ({movementInfo.cost}ft required, {character.speed}ft available)
            </div>
          )}
        </div>

        {/* Memory Panel */}
        {showMemory && (
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium">Character Memory</h4>
              <button
                onClick={() => setShowMemory(false)}
                className="text-xs text-gray-400 hover:text-white"
              >
                Hide
              </button>
            </div>
            
            {/* Add Memory */}
            <div className="space-y-2 mb-4">
              <div className="flex gap-2">
                <select
                  value={newMemoryTag}
                  onChange={(e) => setNewMemoryTag(e.target.value as MemoryEntry["tag"])}
                  disabled={!canAct}
                  className="bg-gray-700 text-white rounded px-2 py-1 text-sm disabled:bg-gray-800 disabled:text-gray-500"
                >
                  <option value="Note">Note</option>
                  <option value="Quest">Quest</option>
                  <option value="NPC">NPC</option>
                  <option value="Condition">Condition</option>
                  <option value="Combat">Combat</option>
                  <option value="Loot">Loot</option>
                </select>
                <select
                  value={newMemoryPriority}
                  onChange={(e) => setNewMemoryPriority(e.target.value as MemoryEntry["priority"])}
                  disabled={!canAct}
                  className="bg-gray-700 text-white rounded px-2 py-1 text-sm disabled:bg-gray-800 disabled:text-gray-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMemoryText}
                  onChange={(e) => setNewMemoryText(e.target.value)}
                  placeholder="Add a memory..."
                  disabled={!canAct}
                  className="flex-1 bg-gray-700 text-white rounded px-2 py-1 text-sm disabled:bg-gray-800 disabled:text-gray-500 placeholder-gray-400"
                  onKeyPress={(e) => e.key === 'Enter' && addMemoryEntry()}
                />
                <button
                  onClick={() => addMemoryEntry()}
                  disabled={!canAct || !newMemoryText.trim()}
                  className="px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-400 rounded text-sm transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Memory List */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {character.memory
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 15)
                .map((entry) => (
                <div key={entry.id} className="p-2 bg-gray-800 rounded text-sm border-l-4 border-l-purple-500">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex gap-2 items-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        entry.tag === "Quest" ? "bg-yellow-600" :
                        entry.tag === "NPC" ? "bg-blue-600" :
                        entry.tag === "Combat" ? "bg-red-600" :
                        entry.tag === "Condition" ? "bg-orange-600" :
                        entry.tag === "Loot" ? "bg-green-600" :
                        "bg-gray-600"
                      }`}>
                        {entry.tag}
                      </span>
                      <span className={`w-2 h-2 rounded-full ${
                        entry.priority === 'high' ? 'bg-red-400' :
                        entry.priority === 'medium' ? 'bg-yellow-400' :
                        'bg-green-400'
                      }`} />
                    </div>
                    <span className="text-xs text-gray-400">Turn {entry.turn}</span>
                  </div>
                  <p className="text-gray-300">{entry.text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {!showMemory && (
          <div className="flex items-center justify-center">
            <button
              onClick={() => setShowMemory(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm transition-colors"
            >
              Show Memory ({character.memory.length} entries)
            </button>
          </div>
        )}
      </div>

      {/* Character Status Bar */}
      <div className="bg-gray-800 p-3 rounded flex justify-between items-center text-sm">
        <div className="flex gap-4">
          <span><strong>{character.name}</strong></span>
          {character.hitPoints && (
            <span>HP: <span className="text-red-400">{character.hitPoints.current}/{character.hitPoints.maximum}</span></span>
          )}
          {character.armorClass && (
            <span>AC: {character.armorClass}</span>
          )}
          <span>Speed: {character.speed}ft</span>
        </div>
        <div className="flex gap-2">
          {character.conditions.map((condition, i) => (
            <span key={i} className="px-2 py-1 bg-red-600 rounded text-xs">
              {condition}
            </span>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span>Player</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-500 rounded"></div>
          <span>Enemy</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-300 rounded"></div>
          <span>Difficult</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-300 rounded"></div>
          <span>Hazard</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gray-800 border border-gray-600 rounded"></div>
          <span>Blocked</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-400 rounded"></div>
          <span>Valid Path</span>
        </div>
      </div>
    </div>
  );
};

export default EnhancedMovementHUD;