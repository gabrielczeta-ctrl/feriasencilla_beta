// Basic DM Engine - Rule-based AI for D&D Beta
import { 
  Character, GameState, AIResponse, DMAction, AIPromptContext, 
  NPC, CombatParticipant, StoryState 
} from '../types/dnd';

export class DMEngine {
  private storyTemplates: StoryTemplate[] = [];
  private encounterTemplates: EncounterTemplate[] = [];
  private npcTemplates: Record<string, NPC> = {};
  
  constructor() {
    this.initializeTemplates();
  }

  // Main function to process player input and generate DM response
  async processPlayerAction(context: AIPromptContext): Promise<AIResponse> {
    const { playerInput, gameState, currentScene, players } = context;
    
    // Normalize input
    const action = this.parsePlayerAction(playerInput.toLowerCase());
    
    // Determine response based on game phase and action
    switch (gameState.phase) {
      case 'playing':
        return this.handleExplorationAction(action, context);
      case 'combat':
        return this.handleExplorationAction(action, context); // Use same handler for now
      default:
        return this.handleGeneralExploration(action, context);
    }
  }

  private parsePlayerAction(input: string): ParsedAction {
    const actionWords = {
      movement: ['go', 'move', 'walk', 'run', 'travel', 'head', 'enter', 'leave'],
      investigation: ['look', 'examine', 'search', 'investigate', 'check', 'inspect'],
      social: ['talk', 'speak', 'ask', 'tell', 'persuade', 'intimidate', 'deceive'],
      combat: ['attack', 'hit', 'strike', 'cast', 'shoot', 'fight', 'defend'],
      magic: ['cast', 'spell', 'magic', 'enchant', 'heal', 'cure'],
      stealth: ['hide', 'sneak', 'stealth', 'quietly', 'carefully'],
      misc: ['use', 'take', 'grab', 'pick', 'open', 'close', 'push', 'pull']
    };

    const words = input.split(' ');
    let actionType: string = 'misc';
    let target: string = '';
    let intent: string = input;

    // Find action type
    for (const [type, keywords] of Object.entries(actionWords)) {
      if (keywords.some(keyword => words.includes(keyword))) {
        actionType = type;
        break;
      }
    }

    // Extract target
    const prepositions = ['at', 'to', 'with', 'on', 'in', 'the'];
    const targetIndex = words.findIndex(word => prepositions.includes(word));
    if (targetIndex !== -1 && targetIndex < words.length - 1) {
      target = words.slice(targetIndex + 1).join(' ');
    }

    return { type: actionType, target, intent, originalInput: input };
  }

  private async handleExplorationAction(action: ParsedAction, context: AIPromptContext): Promise<AIResponse> {
    const { gameState, currentScene } = context;
    const storyState = gameState.story;

    switch (action.type) {
      case 'movement':
        return this.handleMovement(action, storyState, context);
      
      case 'investigation':
        return this.handleInvestigation(action, storyState, context);
      
      case 'social':
        return this.handleSocialInteraction(action, storyState, context);
      
      case 'combat':
        return this.initiateCombat(action, context);
      
      default:
        return this.handleGeneralExploration(action, context);
    }
  }

  private async handleMovement(action: ParsedAction, storyState: StoryState, context: AIPromptContext): Promise<AIResponse> {
    const currentLocation = storyState.location;
    const possibleDestinations = this.getAvailableDestinations(currentLocation);
    
    // Try to match target to available destinations
    const destination = possibleDestinations.find(dest => 
      dest.toLowerCase().includes(action.target.toLowerCase()) ||
      action.target.toLowerCase().includes(dest.toLowerCase())
    );

    if (destination) {
      const newScene = this.generateSceneForLocation(destination);
      return {
        narration: `You ${action.intent} and find yourself ${newScene.description}`,
        actions: [{
          type: 'scene_change',
          parameters: { location: destination, description: newScene.description },
          description: `Players moved to ${destination}`
        }],
        newScene: destination
      };
    } else {
      return {
        narration: `You can't seem to ${action.intent}. The available paths are: ${possibleDestinations.join(', ')}.`,
        actions: []
      };
    }
  }

  private async handleInvestigation(action: ParsedAction, storyState: StoryState, context: AIPromptContext): Promise<AIResponse> {
    const searchResults = this.getSearchResults(action.target, storyState.location);
    
    if (searchResults.found) {
      const dmActions: DMAction[] = [];
      
      // Add items if found
      if (searchResults.items && searchResults.items.length > 0) {
        dmActions.push({
          type: 'give_item',
          parameters: { items: searchResults.items },
          description: `Players found: ${searchResults.items.join(', ')}`
        });
      }

      // Trigger encounters if any
      if (searchResults.encounter) {
        return this.triggerEncounter(searchResults.encounter, context);
      }

      return {
        narration: searchResults.description,
        actions: dmActions
      };
    } else {
      return {
        narration: `You ${action.intent} but don't find anything particularly interesting.`,
        actions: []
      };
    }
  }

  private async handleSocialInteraction(action: ParsedAction, storyState: StoryState, context: AIPromptContext): Promise<AIResponse> {
    const npc = storyState.npcs.find(n => 
      n.name.toLowerCase().includes(action.target.toLowerCase()) ||
      action.target.toLowerCase().includes(n.name.toLowerCase())
    );

    if (npc) {
      const dialogue = this.generateNPCDialogue(npc, action, context);
      return {
        narration: `You ${action.intent} ${npc.name}.`,
        actions: [],
        npcDialogue: {
          npcName: npc.name,
          dialogue: dialogue.response,
          options: dialogue.options
        }
      };
    } else {
      return {
        narration: `There's no one here to ${action.intent.split(' ')[0]} with.`,
        actions: []
      };
    }
  }

  private async initiateCombat(action: ParsedAction, context: AIPromptContext): Promise<AIResponse> {
    const enemies = this.generateEnemiesForLocation(context.gameState.story.location);
    
    if (enemies.length === 0) {
      return {
        narration: "There's nothing here to fight!",
        actions: []
      };
    }

    return {
      narration: `${action.originalInput} - Initiative is rolled as combat begins!`,
      actions: [{
        type: 'combat_start',
        parameters: { enemies },
        description: `Combat started with ${enemies.length} enemies`
      }],
      combatActions: {
        startCombat: true
      }
    };
  }

  private async handleGeneralExploration(action: ParsedAction, context: AIPromptContext): Promise<AIResponse> {
    const responses = [
      `You attempt to ${action.intent}. The air is thick with possibility.`,
      `As you ${action.intent}, you notice the environment around you more keenly.`,
      `Your action draws the attention of nearby creatures - they seem curious about your intentions.`,
      `The result of your action echoes through the area, perhaps alerting others to your presence.`
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    // 20% chance to trigger a random encounter
    if (Math.random() < 0.2) {
      const encounters = this.encounterTemplates.filter(e => 
        e.locations.includes(context.gameState.story.location) || e.locations.includes('any')
      );
      
      if (encounters.length > 0) {
        const encounter = encounters[Math.floor(Math.random() * encounters.length)];
        return this.triggerEncounter(encounter, context);
      }
    }

    return {
      narration: randomResponse,
      actions: []
    };
  }

  private generateNPCDialogue(npc: NPC, action: ParsedAction, context: AIPromptContext) {
    const dialogueTemplates = {
      friendly: [
        "Greetings, traveler! What brings you to these parts?",
        "Well met! I haven't seen adventurers like you in quite some time.",
        "Welcome! Is there something I can help you with?"
      ],
      neutral: [
        "Yes? What do you want?",
        "I suppose I have a moment to talk.",
        "What brings you here, stranger?"
      ],
      hostile: [
        "You'd best move along, or there'll be trouble.",
        "I don't have time for the likes of you.",
        "What do you think you're doing here?"
      ]
    };

    const personality = npc.personality || 'neutral';
    const templates = dialogueTemplates[personality as keyof typeof dialogueTemplates] || dialogueTemplates.neutral;
    const response = templates[Math.floor(Math.random() * templates.length)];

    const options = [
      "Ask about the local area",
      "Inquire about quests or work",
      "Ask for directions",
      "End conversation"
    ];

    return { response, options };
  }

  private triggerEncounter(encounter: EncounterTemplate, context: AIPromptContext): AIResponse {
    switch (encounter.type) {
      case 'combat':
        return {
          narration: encounter.description,
          actions: [{
            type: 'combat_start',
            parameters: { enemies: encounter.enemies },
            description: `Triggered ${encounter.name}`
          }],
          combatActions: { startCombat: true }
        };
      
      case 'puzzle':
        return {
          narration: encounter.description,
          actions: []
        };
      
      case 'treasure':
        return {
          narration: encounter.description,
          actions: [{
            type: 'give_item',
            parameters: { items: encounter.rewards },
            description: `Found treasure: ${encounter.rewards?.join(', ')}`
          }]
        };
      
      default:
        return {
          narration: encounter.description,
          actions: []
        };
    }
  }

  private getAvailableDestinations(location: string): string[] {
    const locationMap: Record<string, string[]> = {
      'tavern': ['town square', 'inn', 'marketplace', 'forest path'],
      'town square': ['tavern', 'blacksmith', 'temple', 'north road'],
      'forest path': ['tavern', 'deep forest', 'ancient ruins'],
      'deep forest': ['forest path', 'cave entrance', 'druid grove'],
      'ancient ruins': ['forest path', 'underground chamber', 'tower'],
      'default': ['north', 'south', 'east', 'west']
    };

    return locationMap[location] || locationMap['default'];
  }

  private getSearchResults(target: string, location: string): SearchResult {
    const locationSearches: Record<string, Record<string, SearchResult>> = {
      'tavern': {
        'bar': { found: true, description: "You find some loose coins behind the bar.", items: ['5 gold pieces'] },
        'room': { found: true, description: "You discover a hidden letter in the room.", items: ['mysterious letter'] },
        'cellar': { found: true, description: "The cellar contains old wine and... something else.", encounter: this.encounterTemplates.find(e => e.name === 'Cellar Rats') }
      },
      'forest path': {
        'bush': { found: true, description: "You find some berries and herbs.", items: ['healing berries', 'herbs'] },
        'tree': { found: true, description: "Ancient markings are carved into the bark." },
        'ground': { found: true, description: "Fresh tracks lead deeper into the forest." }
      }
    };

    const searches = locationSearches[location];
    if (searches) {
      for (const [key, result] of Object.entries(searches)) {
        if (target.includes(key) || key.includes(target)) {
          return result;
        }
      }
    }

    return { found: false, description: "Nothing of interest." };
  }

  private generateEnemiesForLocation(location: string): CombatParticipant[] {
    const enemyTypes: Record<string, CombatParticipant[]> = {
      'forest path': [
        { id: 'wolf1', name: 'Wolf', type: 'monster', initiative: 0, hitPoints: { current: 11, maximum: 11 }, armorClass: 13, conditions: [] }
      ],
      'deep forest': [
        { id: 'bear1', name: 'Brown Bear', type: 'monster', initiative: 0, hitPoints: { current: 34, maximum: 34 }, armorClass: 11, conditions: [] }
      ],
      'ancient ruins': [
        { id: 'skeleton1', name: 'Skeleton', type: 'monster', initiative: 0, hitPoints: { current: 13, maximum: 13 }, armorClass: 13, conditions: [] },
        { id: 'skeleton2', name: 'Skeleton', type: 'monster', initiative: 0, hitPoints: { current: 13, maximum: 13 }, armorClass: 13, conditions: [] }
      ]
    };

    return enemyTypes[location] || [];
  }

  private generateSceneForLocation(location: string): { description: string } {
    const sceneTemplates: Record<string, string> = {
      'tavern': 'in a warm, bustling tavern filled with the chatter of locals and the smell of roasted meat',
      'town square': 'in the heart of town, where merchants hawk their wares and children play in the fountain',
      'forest path': 'on a winding forest path, dappled with sunlight filtering through ancient trees',
      'deep forest': 'deep in the forest where the canopy blocks most light and strange sounds echo around you',
      'ancient ruins': 'among crumbling stone ruins covered in moss and mysterious runes'
    };

    return { 
      description: sceneTemplates[location] || 'in an unfamiliar place that fills you with wonder and uncertainty'
    };
  }

  private initializeTemplates() {
    this.storyTemplates = [
      {
        name: "Village Mystery",
        description: "A small village plagued by mysterious disappearances",
        startingLocation: "tavern",
        hooks: ["Missing villagers", "Strange lights in the forest", "Ancient evil stirring"]
      }
    ];

    this.encounterTemplates = [
      {
        name: "Goblin Ambush",
        type: "combat",
        description: "Goblins leap out from behind the trees!",
        locations: ["forest path", "deep forest"],
        enemies: [
          { id: 'goblin1', name: 'Goblin', type: 'monster', initiative: 0, hitPoints: { current: 7, maximum: 7 }, armorClass: 15, conditions: [] }
        ]
      },
      {
        name: "Hidden Treasure",
        type: "treasure",
        description: "You discover a small cache hidden beneath some stones!",
        locations: ["any"],
        rewards: ["50 gold pieces", "silver ring"]
      },
      {
        name: "Cellar Rats",
        type: "combat", 
        description: "Giant rats scurry toward you from the shadows!",
        locations: ["tavern"],
        enemies: [
          { id: 'rat1', name: 'Giant Rat', type: 'monster', initiative: 0, hitPoints: { current: 7, maximum: 7 }, armorClass: 12, conditions: [] },
          { id: 'rat2', name: 'Giant Rat', type: 'monster', initiative: 0, hitPoints: { current: 7, maximum: 7 }, armorClass: 12, conditions: [] }
        ]
      }
    ];

    this.npcTemplates = {
      'bartender': {
        id: 'tavern_bartender',
        name: 'Gareth the Barkeep',
        description: 'A stout man with graying hair and knowing eyes',
        personality: 'friendly',
        location: 'tavern'
      },
      'guard': {
        id: 'town_guard',
        name: 'Captain Morris',
        description: 'A stern-looking guard in polished armor',
        personality: 'neutral',
        location: 'town square'
      }
    };
  }
}

// Helper interfaces
interface ParsedAction {
  type: string;
  target: string;
  intent: string;
  originalInput: string;
}

interface SearchResult {
  found: boolean;
  description: string;
  items?: string[];
  encounter?: EncounterTemplate;
}

interface StoryTemplate {
  name: string;
  description: string;
  startingLocation: string;
  hooks: string[];
}

interface EncounterTemplate {
  name: string;
  type: 'combat' | 'puzzle' | 'treasure' | 'social';
  description: string;
  locations: string[];
  enemies?: CombatParticipant[];
  rewards?: string[];
}