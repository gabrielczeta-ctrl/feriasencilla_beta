import { jest } from '@jest/globals'

// Mock dependencies
const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  hset: jest.fn().mockResolvedValue(1),
  hgetall: jest.fn().mockResolvedValue({}),
}

const mockUserManager = {
  validateSession: jest.fn().mockReturnValue({ valid: true, username: 'testuser' }),
  getUserCharacter: jest.fn().mockResolvedValue({ success: true, character: null })
}

const mockClaudeDM = {
  processGlobalUpdate: jest.fn().mockResolvedValue({
    narration: 'The tavern bustles with activity',
    sceneUpdate: { description: 'New adventurers arrive' },
    npcActions: []
  }),
  processPlayerActions: jest.fn().mockResolvedValue({
    responses: [
      { playerId: 'player1', narration: 'You look around the tavern' }
    ]
  })
}

jest.unstable_mockModule('../claude-dm.js', () => ({
  ClaudeDM: jest.fn(() => mockClaudeDM)
}))

const { GlobalGameManager } = await import('../globalGameManager.js')

describe('GlobalGameManager', () => {
  let gameManager
  let mockClient

  beforeEach(() => {
    jest.clearAllMocks()
    gameManager = new GlobalGameManager(mockRedis, mockUserManager)
    
    mockClient = {
      readyState: 1,
      send: jest.fn(),
      playerId: null
    }
  })

  afterEach(() => {
    if (gameManager.playerTurnTimer) {
      clearTimeout(gameManager.playerTurnTimer)
    }
    if (gameManager.dmUpdateTimer) {
      clearTimeout(gameManager.dmUpdateTimer)
    }
  })

  describe('Initialization', () => {
    test('should initialize global room state', () => {
      expect(gameManager.globalRoom).toBeDefined()
      expect(gameManager.globalRoom.id).toBe('global-server')
      expect(gameManager.globalRoom.name).toBe('The Eternal Tavern')
      expect(gameManager.globalRoom.players).toBeInstanceOf(Map)
      expect(gameManager.globalRoom.gameState.phase).toBe('playing')
      expect(gameManager.globalRoom.gameState.turnPhase).toBe('player_turns')
    })

    test('should initialize battle map', () => {
      const battleMap = gameManager.globalRoom.gameState.battleMap
      
      expect(battleMap.active).toBe(false)
      expect(battleMap.gridSize.width).toBe(20)
      expect(battleMap.gridSize.height).toBe(20)
      expect(battleMap.playerPositions).toBeInstanceOf(Map)
      expect(battleMap.enemies).toBeInstanceOf(Map)
      expect(battleMap.hazards).toBeInstanceOf(Map)
      expect(battleMap.lighting).toBe('normal')
      expect(battleMap.weather).toBe('clear')
    })

    test('should start game loop timers', () => {
      expect(gameManager.playerTurnTimer).toBeDefined()
      expect(gameManager.dmUpdateTimer).toBeDefined()
    })
  })

  describe('Client Management', () => {
    test('should add client to set', () => {
      gameManager.addClient(mockClient)
      
      expect(gameManager.clients.has(mockClient)).toBe(true)
    })

    test('should remove client from set', () => {
      gameManager.addClient(mockClient)
      gameManager.removeClient(mockClient)
      
      expect(gameManager.clients.has(mockClient)).toBe(false)
    })

    test('should broadcast to all clients', () => {
      const client1 = { readyState: 1, send: jest.fn() }
      const client2 = { readyState: 1, send: jest.fn() }
      const closedClient = { readyState: 3, send: jest.fn() } // CLOSED state
      
      gameManager.addClient(client1)
      gameManager.addClient(client2)
      gameManager.addClient(closedClient)

      const message = { type: 'test', data: 'hello' }
      gameManager.broadcastToAll(message)

      expect(client1.send).toHaveBeenCalledWith(JSON.stringify(message))
      expect(client2.send).toHaveBeenCalledWith(JSON.stringify(message))
      expect(closedClient.send).not.toHaveBeenCalled()
    })
  })

  describe('Player Management', () => {
    test('should add player to global room', () => {
      const playerData = {
        id: 'player1',
        name: 'Hero',
        character: { name: 'Aragorn', class: 'Ranger' },
        isAuthenticated: true
      }

      const welcomeData = gameManager.addPlayer('player1', playerData)

      expect(gameManager.globalRoom.players.has('player1')).toBe(true)
      expect(gameManager.globalRoom.players.get('player1')).toEqual({
        ...playerData,
        joinedAt: expect.any(Number),
        lastSeen: expect.any(Number),
        position: { x: 10, y: 10 }, // Default position
        conditions: [],
        facing: 'north'
      })

      expect(welcomeData).toEqual({
        id: 'global-server',
        name: 'The Eternal Tavern',
        currentScene: 'The Eternal Tavern',
        playerCount: 1,
        gameState: expect.objectContaining({
          turnPhase: 'player_turns'
        })
      })
    })

    test('should update existing player when re-adding', () => {
      const playerData = {
        id: 'player1',
        name: 'Hero',
        character: { name: 'Aragorn', class: 'Ranger' }
      }

      gameManager.addPlayer('player1', playerData)
      
      const updatedData = {
        id: 'player1',
        name: 'Updated Hero',
        character: { name: 'Legolas', class: 'Ranger' }
      }

      gameManager.addPlayer('player1', updatedData)

      const player = gameManager.globalRoom.players.get('player1')
      expect(player.name).toBe('Updated Hero')
      expect(player.character.name).toBe('Legolas')
    })

    test('should remove player from global room', () => {
      gameManager.addPlayer('player1', { id: 'player1', name: 'Hero' })
      expect(gameManager.globalRoom.players.has('player1')).toBe(true)

      gameManager.removePlayer('player1')

      expect(gameManager.globalRoom.players.has('player1')).toBe(false)
    })

    test('should get player data', () => {
      const playerData = { id: 'player1', name: 'Hero' }
      gameManager.addPlayer('player1', playerData)

      const retrievedPlayer = gameManager.getPlayer('player1')

      expect(retrievedPlayer).toBeDefined()
      expect(retrievedPlayer.id).toBe('player1')
      expect(retrievedPlayer.name).toBe('Hero')
    })

    test('should return null for non-existent player', () => {
      const player = gameManager.getPlayer('nonexistent')
      expect(player).toBeNull()
    })

    test('should get all players', () => {
      gameManager.addPlayer('player1', { id: 'player1', name: 'Hero1' })
      gameManager.addPlayer('player2', { id: 'player2', name: 'Hero2' })

      const allPlayers = gameManager.getAllPlayers()

      expect(allPlayers.length).toBe(2)
      expect(allPlayers.map(p => p.id)).toContain('player1')
      expect(allPlayers.map(p => p.id)).toContain('player2')
    })
  })

  describe('Player Actions', () => {
    beforeEach(() => {
      gameManager.addPlayer('player1', {
        id: 'player1',
        name: 'Hero',
        character: { name: 'Test Hero' }
      })
    })

    test('should add player action to queue', () => {
      const result = gameManager.addPlayerAction('player1', 'look around')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Action queued for next DM update')
      expect(gameManager.globalRoom.gameState.messageQueue.length).toBe(1)
      
      const queuedAction = gameManager.globalRoom.gameState.messageQueue[0]
      expect(queuedAction.playerId).toBe('player1')
      expect(queuedAction.action).toBe('look around')
      expect(queuedAction.timestamp).toBeDefined()
    })

    test('should reject action from non-existent player', () => {
      const result = gameManager.addPlayerAction('nonexistent', 'do something')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Player not found')
      expect(gameManager.globalRoom.gameState.messageQueue.length).toBe(0)
    })

    test('should reject empty action', () => {
      const result = gameManager.addPlayerAction('player1', '')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Action cannot be empty')
    })

    test('should prevent duplicate actions from same player', () => {
      gameManager.addPlayerAction('player1', 'first action')
      const result = gameManager.addPlayerAction('player1', 'second action')

      expect(result.success).toBe(false)
      expect(result.message).toBe('You have already submitted an action this turn')
      expect(gameManager.globalRoom.gameState.messageQueue.length).toBe(1)
    })

    test('should clear message queue', () => {
      gameManager.addPlayerAction('player1', 'test action')
      expect(gameManager.globalRoom.gameState.messageQueue.length).toBe(1)

      gameManager.clearMessageQueue()

      expect(gameManager.globalRoom.gameState.messageQueue.length).toBe(0)
      expect(gameManager.globalRoom.gameState.playersWhoActed.size).toBe(0)
    })
  })

  describe('Battle Map Management', () => {
    beforeEach(() => {
      gameManager.addPlayer('player1', {
        id: 'player1',
        name: 'Fighter',
        character: { name: 'Tank' }
      })
    })

    test('should activate battle map', () => {
      const result = gameManager.activateBattleMap()

      expect(result.success).toBe(true)
      expect(gameManager.globalRoom.gameState.battleMap.active).toBe(true)
      expect(gameManager.globalRoom.gameState.turnPhase).toBe('player_turns')
    })

    test('should deactivate battle map', () => {
      gameManager.activateBattleMap()
      const result = gameManager.deactivateBattleMap()

      expect(result.success).toBe(true)
      expect(gameManager.globalRoom.gameState.battleMap.active).toBe(false)
    })

    test('should move player on battle map', () => {
      gameManager.activateBattleMap()
      
      const result = gameManager.movePlayer('player1', 5, 7)

      expect(result.success).toBe(true)
      const position = gameManager.globalRoom.gameState.battleMap.playerPositions.get('player1')
      expect(position.x).toBe(5)
      expect(position.y).toBe(7)
    })

    test('should reject invalid move coordinates', () => {
      gameManager.activateBattleMap()
      
      const result = gameManager.movePlayer('player1', -1, 25)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid coordinates')
    })

    test('should reject moves when battle map is inactive', () => {
      const result = gameManager.movePlayer('player1', 5, 5)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Battle map is not active')
    })

    test('should add enemy to battle map', () => {
      gameManager.activateBattleMap()
      
      const enemy = {
        id: 'goblin1',
        name: 'Goblin',
        x: 15,
        y: 15,
        hp: 7,
        ac: 15,
        type: 'humanoid'
      }

      const result = gameManager.addEnemy(enemy)

      expect(result.success).toBe(true)
      expect(gameManager.globalRoom.gameState.battleMap.enemies.has('goblin1')).toBe(true)
      
      const addedEnemy = gameManager.globalRoom.gameState.battleMap.enemies.get('goblin1')
      expect(addedEnemy).toEqual(enemy)
    })

    test('should remove enemy from battle map', () => {
      gameManager.activateBattleMap()
      gameManager.addEnemy({ id: 'goblin1', name: 'Goblin', x: 15, y: 15, hp: 7, ac: 15 })

      const result = gameManager.removeEnemy('goblin1')

      expect(result.success).toBe(true)
      expect(gameManager.globalRoom.gameState.battleMap.enemies.has('goblin1')).toBe(false)
    })

    test('should add hazard to battle map', () => {
      gameManager.activateBattleMap()
      
      const hazard = {
        id: 'pit1',
        x: 8,
        y: 8,
        type: 'pit',
        damage: '1d6',
        description: 'A deep pit trap'
      }

      const result = gameManager.addHazard(hazard)

      expect(result.success).toBe(true)
      expect(gameManager.globalRoom.gameState.battleMap.hazards.has('pit1')).toBe(true)
    })

    test('should update environmental conditions', () => {
      const result = gameManager.updateEnvironment('dim', 'rain')

      expect(result.success).toBe(true)
      expect(gameManager.globalRoom.gameState.battleMap.lighting).toBe('dim')
      expect(gameManager.globalRoom.gameState.battleMap.weather).toBe('rain')
    })
  })

  describe('Turn Management', () => {
    test('should start player turn phase', () => {
      gameManager.startPlayerTurnPhase()

      expect(gameManager.globalRoom.gameState.turnPhase).toBe('player_turns')
      expect(gameManager.globalRoom.gameState.turnStartTime).toBeCloseTo(Date.now(), -2)
      expect(gameManager.globalRoom.gameState.playersWhoActed.size).toBe(0)
    })

    test('should start DM processing phase', () => {
      gameManager.startDMProcessingPhase()

      expect(gameManager.globalRoom.gameState.turnPhase).toBe('dm_processing')
      expect(gameManager.globalRoom.gameState.turnStartTime).toBeCloseTo(Date.now(), -2)
    })

    test('should start DM response phase', () => {
      gameManager.startDMResponsePhase()

      expect(gameManager.globalRoom.gameState.turnPhase).toBe('dm_response')
      expect(gameManager.globalRoom.gameState.turnStartTime).toBeCloseTo(Date.now(), -2)
    })

    test('should get turn phase status', () => {
      gameManager.addPlayer('player1', { id: 'player1', name: 'Hero1' })
      gameManager.addPlayer('player2', { id: 'player2', name: 'Hero2' })

      const status = gameManager.getTurnPhaseStatus()

      expect(status).toEqual({
        currentPhase: 'player_turns',
        timeRemaining: expect.any(Number),
        playersWhoActed: 0,
        totalPlayers: 2,
        messageQueueLength: 0
      })
    })

    test('should check if all players have acted', () => {
      gameManager.addPlayer('player1', { id: 'player1', name: 'Hero1' })
      gameManager.addPlayer('player2', { id: 'player2', name: 'Hero2' })

      expect(gameManager.haveAllPlayersActed()).toBe(false)

      gameManager.addPlayerAction('player1', 'action1')
      expect(gameManager.haveAllPlayersActed()).toBe(false)

      gameManager.addPlayerAction('player2', 'action2')
      expect(gameManager.haveAllPlayersActed()).toBe(true)
    })
  })

  describe('Game Loop', () => {
    beforeEach(() => {
      gameManager.addPlayer('player1', {
        id: 'player1',
        name: 'Hero',
        character: { name: 'Test Hero' }
      })
    })

    test('should process player turn timeout', async () => {
      jest.useFakeTimers()
      gameManager.startPlayerTurnPhase()

      // Fast forward past the player turn duration
      jest.advanceTimersByTime(gameManager.globalRoom.settings.playerTurnDuration + 1000)

      expect(gameManager.globalRoom.gameState.turnPhase).toBe('dm_processing')

      jest.useRealTimers()
    })

    test('should process DM updates', async () => {
      gameManager.addPlayerAction('player1', 'look around the tavern')
      
      await gameManager.processDMUpdate()

      expect(mockClaudeDM.processPlayerActions).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({
              playerId: 'player1',
              action: 'look around the tavern'
            })
          ])
        })
      )
    })

    test('should process periodic DM updates', async () => {
      const spy = jest.spyOn(gameManager, 'processPeriodicUpdate')
      
      await gameManager.processPeriodicUpdate()

      expect(spy).toHaveBeenCalled()
      expect(mockClaudeDM.processGlobalUpdate).toHaveBeenCalled()
    })
  })

  describe('State Persistence', () => {
    test('should save game state to Redis', async () => {
      await gameManager.saveGameState()

      expect(mockRedis.set).toHaveBeenCalledWith(
        'global-game-state',
        expect.stringContaining('"id":"global-server"'),
        'EX',
        3600
      )
    })

    test('should load game state from Redis', async () => {
      const savedState = {
        id: 'global-server',
        name: 'The Eternal Tavern',
        gameState: { phase: 'playing' }
      }

      mockRedis.get.mockResolvedValueOnce(JSON.stringify(savedState))

      await gameManager.loadGameState()

      expect(mockRedis.get).toHaveBeenCalledWith('global-game-state')
      // State should be restored (partial check)
      expect(gameManager.globalRoom.name).toBe('The Eternal Tavern')
    })

    test('should handle Redis errors gracefully', async () => {
      mockRedis.set.mockRejectedValueOnce(new Error('Redis error'))

      await expect(gameManager.saveGameState()).resolves.not.toThrow()
    })
  })

  describe('Statistics and Metrics', () => {
    test('should get game statistics', () => {
      gameManager.addPlayer('player1', { id: 'player1', name: 'Hero1' })
      gameManager.addPlayer('player2', { id: 'player2', name: 'Hero2' })
      gameManager.addPlayerAction('player1', 'test action')

      const stats = gameManager.getGameStatistics()

      expect(stats).toEqual({
        totalPlayers: 2,
        activeClients: 0, // No clients added in this test
        currentPhase: 'player_turns',
        messageQueueLength: 1,
        playersWhoActed: 1,
        battleMapActive: false,
        uptime: expect.any(Number)
      })
    })

    test('should track uptime', () => {
      const stats1 = gameManager.getGameStatistics()
      
      // Wait a small amount
      setTimeout(() => {
        const stats2 = gameManager.getGameStatistics()
        expect(stats2.uptime).toBeGreaterThan(stats1.uptime)
      }, 10)
    })
  })

  describe('Error Handling', () => {
    test('should handle missing player data gracefully', () => {
      const result = gameManager.addPlayerAction('nonexistent', 'action')
      
      expect(result.success).toBe(false)
      expect(result.message).toBe('Player not found')
    })

    test('should handle invalid battle map operations', () => {
      const result = gameManager.movePlayer('player1', 100, 100)
      
      expect(result.success).toBe(false)
      expect(result.message).toContain('Invalid coordinates')
    })

    test('should handle Claude DM processing errors', async () => {
      mockClaudeDM.processPlayerActions.mockRejectedValueOnce(new Error('Claude error'))
      
      gameManager.addPlayerAction('player1', 'test action')
      
      await expect(gameManager.processDMUpdate()).resolves.not.toThrow()
    })
  })

  describe('Cleanup', () => {
    test('should clean up resources on shutdown', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
      
      gameManager.shutdown()

      expect(clearTimeoutSpy).toHaveBeenCalledWith(gameManager.playerTurnTimer)
      expect(clearTimeoutSpy).toHaveBeenCalledWith(gameManager.dmUpdateTimer)
      expect(gameManager.clients.size).toBe(0)
    })

    test('should remove disconnected clients', () => {
      const connectedClient = { readyState: 1, send: jest.fn() }
      const disconnectedClient = { readyState: 3, send: jest.fn() } // CLOSED
      
      gameManager.addClient(connectedClient)
      gameManager.addClient(disconnectedClient)

      gameManager.cleanupDisconnectedClients()

      expect(gameManager.clients.has(connectedClient)).toBe(true)
      expect(gameManager.clients.has(disconnectedClient)).toBe(false)
    })
  })
})