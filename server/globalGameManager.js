import { ClaudeDM } from './claude-dm.js';

export class GlobalGameManager {
  constructor(redis, userManager) {
    this.redis = redis;
    this.userManager = userManager;
    this.claudeDM = new ClaudeDM();
    
    // Global game state
    this.globalRoom = {
      id: 'global-server',
      name: 'The Eternal Tavern',
      description: 'A mystical tavern where all adventurers gather across realms',
      players: new Map(), // playerId -> player object
      gameState: {
        phase: 'playing',
        currentScene: 'The Eternal Tavern',
        storyContext: [],
        messageQueue: [], // Messages waiting for DM processing
        lastDMUpdate: Date.now(),
        turnPhase: 'player_turns', // 'player_turns' | 'dm_processing' | 'dm_response'
        turnStartTime: Date.now(),
        playersWhoActed: new Set(), // Players who sent message this turn
      },
      settings: {
        playerTurnDuration: 15000, // 15 seconds for player input
        dmUpdateInterval: 30000,   // 30 seconds between DM updates
        maxContextMessages: 50,    // Keep last 50 messages for DM context
      }
    };

    // Timers
    this.playerTurnTimer = null;
    this.dmUpdateTimer = null;
    this.clients = new Set();

    this.initializeGlobalRoom();
    this.startGameLoop();
  }

  async initializeGlobalRoom() {
    // Load persistent global room state if available
    if (this.redis) {
      try {
        const savedRoom = await this.redis.get('global-room-state');
        if (savedRoom) {
          const roomData = JSON.parse(savedRoom);
          this.globalRoom.gameState.storyContext = roomData.storyContext || [];
          this.globalRoom.gameState.messageQueue = roomData.messageQueue || [];
          this.globalRoom.gameState.currentScene = roomData.currentScene || 'The Eternal Tavern';
          console.log('🏰 Loaded persistent global room state');
        }
      } catch (error) {
        console.error('❌ Failed to load global room state:', error);
      }
    }

    // Initialize with welcome story if empty
    if (this.globalRoom.gameState.storyContext.length === 0) {
      await this.initializeWelcomeStory();
    }
  }

  async initializeWelcomeStory() {
    const welcomeStory = await this.claudeDM.generateCampaignStory(
      'A mystical tavern that exists between dimensions, where adventurers from all realms gather to share stories and embark on collaborative quests',
      'The Eternal Tavern'
    );

    const welcomeMessage = {
      type: 'story_message',
      content: welcomeStory.story || 'Welcome to The Eternal Tavern, a place where adventurers from all realms gather. The air hums with magic and possibility...',
      location: welcomeStory.location || 'The Eternal Tavern',
      availableActions: welcomeStory.availableActions || [
        'Approach the mysterious bartender',
        'Join other adventurers at a table',
        'Examine the magical artifacts on display',
        'Listen to the bard\'s tale'
      ],
      npcs: welcomeStory.npcs || [
        { name: 'Keeper of Tales', description: 'The enigmatic tavern keeper who knows all stories' },
        { name: 'Wandering Bard', description: 'A storyteller who weaves magic with words' }
      ],
      timestamp: Date.now(),
      playerName: 'DM'
    };

    this.globalRoom.gameState.storyContext.push(welcomeMessage);
    await this.saveGlobalRoomState();
  }

  startGameLoop() {
    this.schedulePlayerTurn();
    console.log('🎮 Global game loop started');
  }

  schedulePlayerTurn() {
    // Clear existing timer
    if (this.playerTurnTimer) {
      clearTimeout(this.playerTurnTimer);
    }

    // Set turn phase
    this.globalRoom.gameState.turnPhase = 'player_turns';
    this.globalRoom.gameState.turnStartTime = Date.now();
    this.globalRoom.gameState.playersWhoActed.clear();

    // Broadcast turn start with enhanced state information
    this.broadcastToAll({
      type: 'turn_phase_change',
      phase: 'player_turns',
      duration: this.globalRoom.settings.playerTurnDuration,
      message: '📝 Player turn phase started! You have 15 seconds to send your action.',
      gameState: {
        turnPhase: 'player_turns',
        turnStartTime: this.globalRoom.gameState.turnStartTime,
        playerTurnDuration: this.globalRoom.settings.playerTurnDuration,
        dmUpdateInterval: this.globalRoom.settings.dmUpdateInterval,
        playersWhoActed: this.globalRoom.gameState.playersWhoActed.size,
        totalPlayers: this.globalRoom.players.size,
        currentPhase: 'player_turns'
      }
    });

    // Schedule turn end
    this.playerTurnTimer = setTimeout(() => {
      this.endPlayerTurn();
    }, this.globalRoom.settings.playerTurnDuration);
  }

  async endPlayerTurn() {
    this.globalRoom.gameState.turnPhase = 'dm_processing';
    
    // Broadcast processing phase with enhanced state information
    this.broadcastToAll({
      type: 'turn_phase_change',
      phase: 'dm_processing',
      message: '🤖 DM is processing your actions...',
      gameState: {
        turnPhase: 'dm_processing',
        turnStartTime: this.globalRoom.gameState.turnStartTime,
        playerTurnDuration: this.globalRoom.settings.playerTurnDuration,
        dmUpdateInterval: this.globalRoom.settings.dmUpdateInterval,
        playersWhoActed: this.globalRoom.gameState.playersWhoActed.size,
        totalPlayers: this.globalRoom.players.size,
        currentPhase: 'dm_processing',
        actionsToProcess: this.globalRoom.gameState.messageQueue.length
      }
    });

    // Process queued messages with DM
    await this.processDMUpdate();

    // Schedule next turn
    setTimeout(() => {
      this.schedulePlayerTurn();
    }, 2000); // 2 second gap between turns
  }

  async processDMUpdate() {
    if (this.globalRoom.gameState.messageQueue.length === 0) {
      // No player actions, continue story naturally
      await this.generateContinuationStory();
      return;
    }

    try {
      // Get recent context for DM
      const recentContext = this.globalRoom.gameState.storyContext
        .slice(-this.globalRoom.settings.maxContextMessages)
        .map(msg => `${msg.playerName}: ${msg.content}`)
        .join('\n');

      const playerActions = this.globalRoom.gameState.messageQueue
        .map(msg => `${msg.playerName}: ${msg.content}`)
        .join('\n');

      // Process player actions with Claude DM
      const latestAction = this.globalRoom.gameState.messageQueue[0]; // Get the first action
      const actingPlayer = this.globalRoom.players.get(latestAction.playerId);
      
      const dmResponse = await this.claudeDM.processPlayerAction({
        playerInput: latestAction.content,
        currentScene: this.globalRoom.gameState.currentScene,
        players: Array.from(this.globalRoom.players.values()).map(p => ({ 
          id: p.id, 
          name: p.name, 
          character: p.character 
        })).filter(p => p.character),
        gameState: {
          storyContext: this.globalRoom.gameState.storyContext,
          currentScene: this.globalRoom.gameState.currentScene
        },
        roomId: this.globalRoom.id,
        actingPlayer: actingPlayer ? {
          id: actingPlayer.id,
          name: actingPlayer.name,
          character: actingPlayer.character
        } : null
      });

      // Create DM story message
      let dmMessage;
      if (dmResponse && dmResponse.narration) {
        dmMessage = {
          type: 'story_message',
          content: dmResponse.narration,
          location: dmResponse.sceneUpdate?.newLocation || this.globalRoom.gameState.currentScene,
          availableActions: dmResponse.sceneUpdate?.availableActions || [
            'Continue exploring the tavern',
            'Talk to other adventurers', 
            'Order a drink',
            'Rest by the fireplace'
          ],
          npcs: dmResponse.npcResponse ? [dmResponse.npcResponse] : [],
          timestamp: Date.now(),
          playerName: 'DM'
        };

        console.log('✅ Real Claude response received:', dmResponse.narration?.slice(0, 100) + '...');
      } else {
        // Fallback message when Claude doesn't respond
        dmMessage = {
          type: 'story_message',
          content: 'The story continues as the tavern hums with activity...',
          location: this.globalRoom.gameState.currentScene,
          availableActions: [
            'Continue exploring the tavern',
            'Talk to other adventurers', 
            'Order a drink',
            'Rest by the fireplace'
          ],
          npcs: [],
          timestamp: Date.now(),
          playerName: 'DM'
        };

        console.log('⚠️ Using fallback response - Claude DM may not be working properly');
      }

      // Add to story context
      this.globalRoom.gameState.storyContext.push(dmMessage);
      
      // Update current scene if Claude provided a new one
      if (dmResponse && dmResponse.sceneUpdate?.newLocation) {
        this.globalRoom.gameState.currentScene = dmResponse.sceneUpdate.newLocation;
        console.log('🏛️ Scene updated to:', dmResponse.sceneUpdate.newLocation);
      }

      // Broadcast DM response
      this.broadcastToAll({
        type: 'dm_story_update',
        story: dmMessage,
        phase: 'dm_response'
      });

      // Move processed messages to story context
      this.globalRoom.gameState.messageQueue.forEach(msg => {
        this.globalRoom.gameState.storyContext.push(msg);
      });

      // Clear message queue
      this.globalRoom.gameState.messageQueue = [];

      // Trim story context if too long
      if (this.globalRoom.gameState.storyContext.length > this.globalRoom.settings.maxContextMessages * 2) {
        this.globalRoom.gameState.storyContext = this.globalRoom.gameState.storyContext
          .slice(-this.globalRoom.settings.maxContextMessages);
      }

      await this.saveGlobalRoomState();
      
    } catch (error) {
      console.error('❌ DM processing failed:', error);
      await this.generateFallbackStory();
    }
  }

  async generateContinuationStory() {
    const continuationMessage = {
      type: 'story_message',
      content: 'Time passes in the eternal tavern. The magical atmosphere shifts subtly, creating new opportunities for adventure...',
      location: this.globalRoom.gameState.currentScene,
      availableActions: [
        'Observe the changing magical energies',
        'Interact with nearby adventurers',
        'Explore a newly opened passage',
        'Consult the tavern keeper'
      ],
      timestamp: Date.now(),
      playerName: 'DM'
    };

    this.globalRoom.gameState.storyContext.push(continuationMessage);

    this.broadcastToAll({
      type: 'dm_story_update',
      story: continuationMessage,
      phase: 'dm_response'
    });

    await this.saveGlobalRoomState();
  }

  async generateFallbackStory() {
    const fallbackMessage = {
      type: 'story_message',
      content: 'The tavern keeper looks up from polishing a mystical goblet, sensing the presence of the adventurers gathered here...',
      location: this.globalRoom.gameState.currentScene,
      availableActions: [
        'Speak with the tavern keeper',
        'Examine the goblet',
        'Join other adventurers',
        'Rest by the magical fireplace'
      ],
      timestamp: Date.now(),
      playerName: 'DM'
    };

    this.globalRoom.gameState.storyContext.push(fallbackMessage);

    this.broadcastToAll({
      type: 'dm_story_update',
      story: fallbackMessage,
      phase: 'dm_response'
    });
  }

  async saveGlobalRoomState() {
    if (this.redis) {
      try {
        const stateToSave = {
          storyContext: this.globalRoom.gameState.storyContext,
          messageQueue: this.globalRoom.gameState.messageQueue,
          currentScene: this.globalRoom.gameState.currentScene,
          lastSaved: Date.now()
        };
        await this.redis.set('global-room-state', JSON.stringify(stateToSave));
      } catch (error) {
        console.error('❌ Failed to save global room state:', error);
      }
    }
  }

  addPlayer(playerId, playerData) {
    this.globalRoom.players.set(playerId, {
      ...playerData,
      joinedAt: Date.now(),
      lastSeen: Date.now()
    });

    // Send welcome message to new player
    const welcomeMsg = {
      type: 'welcome_to_global',
      room: this.getPublicRoomData(),
      storyContext: this.globalRoom.gameState.storyContext.slice(-10), // Last 10 messages
      currentPhase: this.globalRoom.gameState.turnPhase,
      nextTurnIn: this.getTimeUntilNextTurn()
    };

    return welcomeMsg;
  }

  removePlayer(playerId) {
    this.globalRoom.players.delete(playerId);
  }

  addPlayerAction(playerId, action) {
    const player = this.globalRoom.players.get(playerId);
    if (!player) return false;

    // Check if in player turn phase
    if (this.globalRoom.gameState.turnPhase !== 'player_turns') {
      return { success: false, message: 'Not in player turn phase' };
    }

    // Check if player already acted this turn
    if (this.globalRoom.gameState.playersWhoActed.has(playerId)) {
      return { success: false, message: 'You have already acted this turn' };
    }

    // Add action to queue
    const actionMessage = {
      type: 'player_action',
      content: action,
      playerName: player.name,
      playerId: playerId,
      character: player.character,
      timestamp: Date.now()
    };

    this.globalRoom.gameState.messageQueue.push(actionMessage);
    this.globalRoom.gameState.playersWhoActed.add(playerId);

    // Broadcast that player acted
    this.broadcastToAll({
      type: 'player_action_queued',
      playerName: player.name,
      action: action
    });

    return { success: true };
  }

  getTimeUntilNextTurn() {
    const elapsed = Date.now() - this.globalRoom.gameState.turnStartTime;
    const remaining = Math.max(0, this.globalRoom.settings.playerTurnDuration - elapsed);
    return remaining;
  }

  getPublicRoomData() {
    return {
      id: this.globalRoom.id,
      name: this.globalRoom.name,
      description: this.globalRoom.description,
      playerCount: this.globalRoom.players.size,
      gameState: {
        phase: this.globalRoom.gameState.phase,
        currentScene: this.globalRoom.gameState.currentScene,
        turnPhase: this.globalRoom.gameState.turnPhase,
        chatLog: this.globalRoom.gameState.storyContext.slice(-20) // Last 20 messages
      },
      settings: this.globalRoom.settings
    };
  }

  broadcastToAll(message) {
    for (const client of this.clients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(JSON.stringify(message));
        } catch (error) {
          console.error('Failed to send message to client:', error);
        }
      }
    }
  }

  addClient(ws) {
    this.clients.add(ws);
    console.log(`🎮 Client added to global server. Total: ${this.clients.size}`);
    
    // Send current game state to the new client
    this.sendCurrentGameState(ws);
  }

  sendCurrentGameState(ws) {
    // Send current turn phase information
    ws.send(JSON.stringify({
      type: 'game_state_sync',
      gameState: {
        turnPhase: this.globalRoom.gameState.turnPhase,
        turnStartTime: this.globalRoom.gameState.turnStartTime,
        playerTurnDuration: this.globalRoom.settings.playerTurnDuration,
        dmUpdateInterval: this.globalRoom.settings.dmUpdateInterval,
        playersWhoActed: this.globalRoom.gameState.playersWhoActed.size,
        totalPlayers: this.globalRoom.players.size,
        currentPhase: this.globalRoom.gameState.turnPhase
      },
      currentScene: this.globalRoom.gameState.currentScene
    }));

    // Send recent story context
    if (this.globalRoom.gameState.storyContext.length > 0) {
      const recentStory = this.globalRoom.gameState.storyContext.slice(-3); // Last 3 story messages
      recentStory.forEach(story => {
        ws.send(JSON.stringify({
          type: 'dm_story_update',
          story: story,
          isHistorical: true
        }));
      });
    }
  }

  removeClient(ws) {
    this.clients.delete(ws);
  }

  // Get current game statistics
  getGameStats() {
    return {
      totalPlayers: this.globalRoom.players.size,
      currentPhase: this.globalRoom.gameState.turnPhase,
      timeUntilNextTurn: this.getTimeUntilNextTurn(),
      messagesInQueue: this.globalRoom.gameState.messageQueue.length,
      playersWhoActed: this.globalRoom.gameState.playersWhoActed.size,
      storyLength: this.globalRoom.gameState.storyContext.length
    };
  }
}