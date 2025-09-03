// Room Management System for D&D Platform
import { GameRoom, Player, Character, GameState, WebSocketMessage } from '../types/dnd';
import { DMEngine } from './dmEngine';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerRoomMap: Map<string, string> = new Map(); // playerId -> roomId
  private dmEngine: DMEngine;

  constructor() {
    this.dmEngine = new DMEngine();
  }

  // Create a new game room
  createRoom(
    name: string, 
    description: string, 
    dmId: string | null, 
    settings: Partial<GameRoom['settings']> & { maxPlayers?: number } = {}
  ): GameRoom {
    const roomId = this.generateRoomId();
    const room: GameRoom = {
      id: roomId,
      name,
      description,
      dmId: dmId || undefined,
      players: [],
      maxPlayers: settings.maxPlayers || 6,
      currentScene: 'Character Creation',
      gameState: this.createInitialGameState(),
      settings: {
        isPublic: settings.isPublic ?? true,
        allowSpectators: settings.allowSpectators ?? true,
        autoRollInitiative: settings.autoRollInitiative ?? true,
        useAIDM: settings.useAIDM ?? (dmId === null),
        difficultyLevel: settings.difficultyLevel ?? 'normal',
        rulesSet: settings.rulesSet ?? '5e',
        chatSettings: {
          allowOOC: settings.chatSettings?.allowOOC ?? true,
          logDice: settings.chatSettings?.logDice ?? true,
          showRolls: settings.chatSettings?.showRolls ?? true
        }
      },
      createdAt: Date.now(),
      lastActivity: Date.now()
    };

    this.rooms.set(roomId, room);
    return room;
  }

  // Player joins a room
  joinRoom(roomId: string, player: Omit<Player, 'joinedAt'>): { success: boolean; message: string; room?: GameRoom } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { success: false, message: 'Room is full' };
    }

    // Check if player is already in the room
    const existingPlayer = room.players.find(p => p.id === player.id);
    if (existingPlayer) {
      existingPlayer.isOnline = true;
      existingPlayer.lastSeen = Date.now();
      return { success: true, message: 'Reconnected to room', room };
    }

    // Add player to room
    const fullPlayer: Player = {
      ...player,
      joinedAt: Date.now()
    };

    room.players.push(fullPlayer);
    room.lastActivity = Date.now();
    this.playerRoomMap.set(player.id, roomId);

    // If this is the first player and no DM is set, make them DM
    if (room.players.length === 1 && !room.dmId && !room.settings.useAIDM) {
      room.dmId = player.id;
      fullPlayer.role = 'dm';
    }

    return { success: true, message: 'Joined room successfully', room };
  }

  // Player leaves a room
  leaveRoom(playerId: string): { success: boolean; message: string } {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) {
      return { success: false, message: 'Player not in any room' };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, message: 'Room not found' };
    }

    // Remove player from room
    room.players = room.players.filter(p => p.id !== playerId);
    this.playerRoomMap.delete(playerId);
    room.lastActivity = Date.now();

    // If DM left, either assign new DM or enable AI DM
    if (room.dmId === playerId) {
      const remainingPlayers = room.players.filter(p => p.role === 'player');
      if (remainingPlayers.length > 0) {
        // Promote oldest player to DM
        const newDM = remainingPlayers.reduce((oldest, player) => 
          player.joinedAt < oldest.joinedAt ? player : oldest
        );
        newDM.role = 'dm';
        room.dmId = newDM.id;
      } else {
        // Enable AI DM if no players left
        room.dmId = undefined;
        room.settings.useAIDM = true;
      }
    }

    // Clean up empty rooms (optional)
    if (room.players.length === 0) {
      this.rooms.delete(roomId);
    }

    return { success: true, message: 'Left room successfully' };
  }

  // Get room by ID
  getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  // Get room for player
  getPlayerRoom(playerId: string): GameRoom | undefined {
    const roomId = this.playerRoomMap.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  // List public rooms
  getPublicRooms(): GameRoom[] {
    const roomsArray: GameRoom[] = [];
    for (const room of this.rooms.values()) {
      if (room.settings.isPublic) {
        roomsArray.push(room);
      }
    }
    return roomsArray.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  // Update character for player
  updatePlayerCharacter(playerId: string, character: Character): { success: boolean; message: string } {
    const room = this.getPlayerRoom(playerId);
    if (!room) {
      return { success: false, message: 'Player not in any room' };
    }

    const player = room.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false, message: 'Player not found in room' };
    }

    player.character = character;
    player.characterId = character.id;
    room.lastActivity = Date.now();

    // Check if all players have characters and can start the game
    const playersWithCharacters = room.players.filter(p => 
      p.role === 'player' && p.character
    ).length;
    const totalPlayers = room.players.filter(p => p.role === 'player').length;

    if (playersWithCharacters === totalPlayers && totalPlayers > 0 && room.gameState.phase === 'character_creation') {
      this.startGame(room.id);
    }

    return { success: true, message: 'Character updated successfully' };
  }

  // Start the game
  private startGame(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.gameState.phase = 'playing';
    room.currentScene = 'The adventure begins...';
    room.gameState.story = {
      currentScene: 'tavern',
      sceneDescription: 'You find yourselves in a cozy tavern called "The Prancing Pony". The warm glow of the fireplace illuminates weathered adventurers sharing tales of glory and danger. The bartender, a stout man with kind eyes, nods in your direction.',
      availableActions: [
        'Talk to the bartender',
        'Listen to other patrons',
        'Examine the room',
        'Order food and drink',
        'Ask about local rumors'
      ],
      npcs: [{
        id: 'bartender',
        name: 'Gareth',
        description: 'A friendly bartender with graying hair and knowing eyes',
        personality: 'friendly',
        location: 'tavern'
      }],
      location: 'tavern',
      questLog: [],
      worldState: {}
    };

    this.addSystemMessage(room, 'The game has begun! What would you like to do?');
  }

  // Process player action through DM
  async processPlayerAction(playerId: string, action: string): Promise<{ success: boolean; message: string }> {
    const room = this.getPlayerRoom(playerId);
    if (!room) {
      return { success: false, message: 'Player not in any room' };
    }

    const player = room.players.find(p => p.id === playerId);
    if (!player || !player.character) {
      return { success: false, message: 'Player or character not found' };
    }

    // Log player action
    this.addChatMessage(room, {
      id: this.generateId(),
      playerId,
      playerName: player.character.name,
      type: 'action',
      content: action,
      timestamp: Date.now()
    });

    // Process through DM engine if AI DM is enabled
    if (room.settings.useAIDM) {
      const context = {
        roomId: room.id,
        currentScene: room.gameState.story.currentScene,
        players: room.players.map(p => p.character!).filter(Boolean),
        recentActions: room.gameState.chatLog.slice(-5).map(msg => msg.content),
        gameState: room.gameState,
        playerInput: action
      };

      try {
        const dmResponse = await this.dmEngine.processPlayerAction(context);
        
        // Apply DM actions
        this.applyDMActions(room, dmResponse);
        
        // Add DM narration to chat
        this.addSystemMessage(room, dmResponse.narration);

        if (dmResponse.npcDialogue) {
          this.addChatMessage(room, {
            id: this.generateId(),
            playerId: 'dm',
            playerName: dmResponse.npcDialogue.npcName,
            type: 'chat',
            content: dmResponse.npcDialogue.dialogue,
            timestamp: Date.now()
          });
        }

      } catch (error) {
        console.error('DM Engine error:', error);
        this.addSystemMessage(room, 'The DM seems momentarily distracted... try again in a moment.');
      }
    }

    room.lastActivity = Date.now();
    return { success: true, message: 'Action processed' };
  }

  // Apply DM actions to game state
  private applyDMActions(room: GameRoom, dmResponse: any): void {
    for (const action of dmResponse.actions || []) {
      switch (action.type) {
        case 'scene_change':
          room.gameState.story.location = action.parameters.location;
          room.gameState.story.sceneDescription = action.parameters.description;
          room.currentScene = action.parameters.location;
          break;
          
        case 'combat_start':
          room.gameState.phase = 'combat';
          room.gameState.combat = {
            active: true,
            round: 1,
            turnIndex: 0,
            participants: action.parameters.enemies || []
          };
          break;
          
        case 'give_item':
          // Would implement item giving logic
          break;
      }
    }
  }

  // Roll dice for player
  rollDice(playerId: string, expression: string, type: string = 'custom'): { success: boolean; result?: any } {
    const room = this.getPlayerRoom(playerId);
    if (!room) {
      return { success: false };
    }

    const player = room.players.find(p => p.id === playerId);
    if (!player) {
      return { success: false };
    }

    const diceResult = this.parseDiceExpression(expression);
    if (!diceResult.valid) {
      return { success: false };
    }

    const roll = {
      id: this.generateId(),
      playerId,
      playerName: player.character?.name || player.name,
      expression,
      results: diceResult.rolls,
      total: diceResult.total,
      type: type as any,
      timestamp: Date.now()
    };

    room.gameState.dice.push(roll);
    
    // Add dice roll to chat if enabled
    if (room.settings.chatSettings.logDice) {
      this.addChatMessage(room, {
        id: this.generateId(),
        playerId: 'system',
        playerName: 'System',
        type: 'dice',
        content: `${player.character?.name || player.name} rolled ${expression}: ${diceResult.rolls.join(', ')} = ${diceResult.total}`,
        timestamp: Date.now()
      });
    }

    room.lastActivity = Date.now();
    return { success: true, result: roll };
  }

  // Parse dice expressions like "1d20+5", "2d6", etc.
  private parseDiceExpression(expression: string): { valid: boolean; rolls: number[]; total: number } {
    const cleanExpr = expression.toLowerCase().replace(/\s/g, '');
    const diceRegex = /(\d+)?d(\d+)([+-]\d+)?/g;
    
    let total = 0;
    let allRolls: number[] = [];
    let match;
    let valid = false;

    while ((match = diceRegex.exec(cleanExpr)) !== null) {
      valid = true;
      const numDice = parseInt(match[1] || '1');
      const dieSize = parseInt(match[2]);
      const modifier = parseInt(match[3] || '0');
      
      if (numDice > 20 || dieSize > 100) continue; // Sanity limits
      
      const rolls: number[] = [];
      for (let i = 0; i < numDice; i++) {
        const roll = Math.floor(Math.random() * dieSize) + 1;
        rolls.push(roll);
        total += roll;
      }
      
      total += modifier;
      allRolls.push(...rolls);
    }

    return { valid, rolls: allRolls, total };
  }

  // Helper methods
  private createInitialGameState(): GameState {
    return {
      phase: 'character_creation',
      turnOrder: [],
      initiative: {},
      story: {
        currentScene: '',
        sceneDescription: '',
        availableActions: [],
        npcs: [],
        location: '',
        questLog: [],
        worldState: {}
      },
      dice: [],
      chatLog: []
    };
  }

  private addChatMessage(room: GameRoom, message: any): void {
    room.gameState.chatLog.push(message);
    
    // Keep only last 100 messages
    if (room.gameState.chatLog.length > 100) {
      room.gameState.chatLog = room.gameState.chatLog.slice(-100);
    }
  }

  private addSystemMessage(room: GameRoom, content: string): void {
    this.addChatMessage(room, {
      id: this.generateId(),
      playerId: 'system',
      playerName: 'DM',
      type: 'system',
      content,
      timestamp: Date.now()
    });
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  // Cleanup inactive rooms
  cleanupInactiveRooms(maxAge: number = 24 * 60 * 60 * 1000): number { // 24 hours
    const now = Date.now();
    let cleaned = 0;
    
    for (const [roomId, room] of Array.from(this.rooms.entries())) {
      if (now - room.lastActivity > maxAge) {
        // Remove all players from room mapping
        for (const player of room.players) {
          this.playerRoomMap.delete(player.id);
        }
        
        this.rooms.delete(roomId);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  // Get statistics
  getStats() {
    return {
      totalRooms: this.rooms.size,
      publicRooms: Array.from(this.rooms.values()).filter(r => r.settings.isPublic).length,
      activeRooms: Array.from(this.rooms.values()).filter(r => 
        r.players.some(p => p.isOnline)
      ).length,
      totalPlayers: this.playerRoomMap.size
    };
  }
}