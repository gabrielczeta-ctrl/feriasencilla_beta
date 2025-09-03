// D&D Game Platform Type Definitions

export interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  playerId: string;
  stats: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  hitPoints: {
    current: number;
    maximum: number;
    temporary: number;
  };
  armorClass: number;
  proficiencyBonus: number;
  skills: Record<string, boolean>; // proficient skills
  equipment: Equipment[];
  spells?: Spell[];
  backstory?: string;
  notes?: string;
  createdAt: number;
}

export interface Equipment {
  id: string;
  name: string;
  type: 'weapon' | 'armor' | 'tool' | 'consumable' | 'treasure';
  description?: string;
  damage?: string; // e.g., "1d8 + STR"
  properties?: string[];
  equipped: boolean;
  quantity: number;
}

export interface Spell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  damage?: string;
  prepared: boolean;
}

export interface GameRoom {
  id: string;
  name: string;
  description: string;
  dmId?: string; // null for AI DM
  players: Player[];
  maxPlayers: number;
  currentScene: string;
  gameState: GameState;
  settings: RoomSettings;
  createdAt: number;
  lastActivity: number;
}

export interface Player {
  id: string;
  name: string;
  characterId?: string;
  character?: Character;
  isOnline: boolean;
  lastSeen: number;
  role: 'player' | 'dm' | 'spectator';
  joinedAt: number;
}

export interface GameState {
  phase: 'lobby' | 'character_creation' | 'playing' | 'combat' | 'paused';
  currentTurn?: string; // player ID
  turnOrder: string[];
  initiative: Record<string, number>;
  combat?: CombatState;
  story: StoryState;
  dice: DiceRoll[];
  chatLog: ChatMessage[];
}

export interface CombatState {
  active: boolean;
  round: number;
  turnIndex: number;
  participants: CombatParticipant[];
}

export interface CombatParticipant {
  id: string;
  name: string;
  type: 'player' | 'npc' | 'monster';
  initiative: number;
  hitPoints: {
    current: number;
    maximum: number;
  };
  armorClass: number;
  conditions: string[];
  position?: { x: number; y: number };
}

export interface StoryState {
  currentScene: string;
  sceneDescription: string;
  availableActions: string[];
  npcs: NPC[];
  location: string;
  questLog: QuestEntry[];
  worldState: Record<string, any>;
}

export interface NPC {
  id: string;
  name: string;
  description: string;
  personality: string;
  hitPoints?: number;
  armorClass?: number;
  dialogue?: DialogueNode[];
  location: string;
}

export interface DialogueNode {
  id: string;
  text: string;
  options: DialogueOption[];
  conditions?: string[];
}

export interface DialogueOption {
  text: string;
  response: string;
  nextNodeId?: string;
  requirements?: string[];
  consequences?: string[];
}

export interface QuestEntry {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  objectives: QuestObjective[];
  rewards?: string[];
}

export interface QuestObjective {
  id: string;
  description: string;
  completed: boolean;
  optional: boolean;
}

export interface RoomSettings {
  isPublic: boolean;
  allowSpectators: boolean;
  autoRollInitiative: boolean;
  useAIDM: boolean;
  difficultyLevel: 'easy' | 'normal' | 'hard';
  rulesSet: '5e' | 'pathfinder' | 'custom';
  chatSettings: {
    allowOOC: boolean;
    logDice: boolean;
    showRolls: boolean;
  };
}

export interface DiceRoll {
  id: string;
  playerId: string;
  playerName: string;
  expression: string; // e.g., "1d20+5"
  results: number[];
  total: number;
  type: 'attack' | 'damage' | 'save' | 'check' | 'initiative' | 'custom';
  description?: string;
  advantage?: boolean;
  disadvantage?: boolean;
  timestamp: number;
  private?: boolean; // DM only rolls
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  type: 'chat' | 'action' | 'ooc' | 'system' | 'dm' | 'dice';
  content: string;
  timestamp: number;
  private?: boolean;
  targetPlayerId?: string; // for whispers
}

export interface DMAction {
  type: 'scene_change' | 'npc_dialogue' | 'combat_start' | 'combat_end' | 
        'damage_player' | 'heal_player' | 'add_condition' | 'remove_condition' |
        'give_item' | 'remove_item' | 'set_initiative' | 'custom';
  targetId?: string;
  parameters: Record<string, any>;
  description: string;
}

export interface AIPromptContext {
  roomId: string;
  currentScene: string;
  players: Character[];
  recentActions: string[];
  gameState: GameState;
  playerInput: string;
  previousContext?: string;
}

export interface AIResponse {
  narration: string;
  actions: DMAction[];
  newScene?: string;
  npcDialogue?: {
    npcName: string;
    dialogue: string;
    options?: string[];
  };
  combatActions?: {
    startCombat?: boolean;
    endCombat?: boolean;
    damage?: { playerId: string; amount: number; type: string }[];
    conditions?: { playerId: string; condition: string; duration?: number }[];
  };
  questUpdates?: {
    newQuests?: QuestEntry[];
    updateQuests?: { questId: string; updates: Partial<QuestEntry> }[];
  };
}

// WebSocket message types for D&D
export interface WebSocketMessage {
  type: 'join_room' | 'leave_room' | 'create_character' | 'update_character' |
        'player_action' | 'dice_roll' | 'chat_message' | 'dm_action' |
        'room_state' | 'game_state_update' | 'combat_action';
  roomId?: string;
  playerId: string;
  data: any;
  timestamp: number;
}

// Character creation helper types
export interface CharacterTemplate {
  race: string;
  class: string;
  suggestedStats: Character['stats'];
  racialTraits: string[];
  classFeatures: string[];
  proficiencies: {
    skills: string[];
    tools: string[];
    weapons: string[];
    armor: string[];
  };
  hitDie: string;
  primaryAbilities: string[];
}

export const RACES = [
  'Human', 'Elf', 'Dwarf', 'Halfling', 'Dragonborn', 'Gnome', 
  'Half-Elf', 'Half-Orc', 'Tiefling'
] as const;

export const CLASSES = [
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'
] as const;

export const SKILLS = [
  'Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
  'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine',
  'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion',
  'Sleight of Hand', 'Stealth', 'Survival'
] as const;

export type Race = typeof RACES[number];
export type Class = typeof CLASSES[number];
export type Skill = typeof SKILLS[number];