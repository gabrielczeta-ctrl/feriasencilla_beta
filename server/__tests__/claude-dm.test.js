import { jest } from '@jest/globals'

// Mock Anthropic SDK
const mockAnthropicResponse = {
  content: [{ text: '{"sceneDescription":"You enter a mystical tavern","location":"The Prancing Pony","availableActions":["Look around","Talk to bartender","Order drink"],"npcs":[{"name":"Innkeeper Bob","description":"A jolly man","personality":"friendly"}],"questHook":"Strange rumors circulate"}' }]
}

const mockAnthropic = {
  messages: {
    create: jest.fn().mockResolvedValue(mockAnthropicResponse)
  }
}

jest.unstable_mockModule('@anthropic-ai/sdk', () => ({
  default: jest.fn(() => mockAnthropic)
}))

const { ClaudeDM } = await import('../claude-dm.js')

describe('Claude DM', () => {
  let claudeDM

  beforeEach(() => {
    claudeDM = new ClaudeDM()
    jest.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY
  })

  describe('Initialization', () => {
    test('should initialize with API key', () => {
      expect(claudeDM).toBeInstanceOf(ClaudeDM)
    })

    test('should warn when no API key is provided', () => {
      delete process.env.ANTHROPIC_API_KEY
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      
      new ClaudeDM()
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '⚠️  ANTHROPIC_API_KEY not set - DM will use fallback responses'
      )
      
      consoleSpy.mockRestore()
    })
  })

  describe('Campaign Story Generation', () => {
    test('should generate campaign story with API key', async () => {
      const result = await claudeDM.generateCampaignStory(
        'A dark fantasy adventure',
        'The Cursed Realm'
      )

      expect(mockAnthropic.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        messages: [{ 
          role: 'user', 
          content: expect.stringContaining('The Cursed Realm')
        }]
      })

      expect(result).toEqual({
        sceneDescription: 'You enter a mystical tavern',
        location: 'The Prancing Pony',
        availableActions: ['Look around', 'Talk to bartender', 'Order drink'],
        npcs: [{ name: 'Innkeeper Bob', description: 'A jolly man', personality: 'friendly' }],
        questHook: 'Strange rumors circulate'
      })
    })

    test('should use fallback when API key is missing', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const claudeDMNoKey = new ClaudeDM()

      const result = await claudeDMNoKey.generateCampaignStory(
        'A test adventure',
        'Test Campaign'
      )

      expect(mockAnthropic.messages.create).not.toHaveBeenCalled()
      expect(result).toEqual({
        sceneDescription: expect.stringContaining('Test Campaign'),
        location: 'The Prancing Pony',
        availableActions: expect.arrayContaining(['Look around', 'Order a drink']),
        npcs: expect.arrayContaining([
          expect.objectContaining({ name: expect.any(String) })
        ]),
        questHook: expect.stringContaining('adventure')
      })
    })

    test('should handle API errors gracefully', async () => {
      mockAnthropic.messages.create.mockRejectedValueOnce(new Error('API Error'))

      const result = await claudeDM.generateCampaignStory(
        'Test description',
        'Test Room'
      )

      expect(result).toEqual({
        sceneDescription: expect.stringContaining('Test Room'),
        location: 'The Prancing Pony',
        availableActions: expect.any(Array),
        npcs: expect.any(Array),
        questHook: expect.any(String)
      })
    })

    test('should handle invalid JSON response', async () => {
      mockAnthropic.messages.create.mockResolvedValueOnce({
        content: [{ text: 'Invalid JSON response' }]
      })

      const result = await claudeDM.generateCampaignStory(
        'Test description',
        'Test Room'
      )

      expect(result).toEqual({
        sceneDescription: expect.any(String),
        location: expect.any(String),
        availableActions: expect.any(Array),
        npcs: expect.any(Array),
        questHook: expect.any(String)
      })
    })
  })

  describe('Player Action Processing', () => {
    test('should process valid player action', async () => {
      const mockActionResponse = {
        content: [{ 
          text: '{"narration":"You successfully examine the room","sceneUpdate":{"description":"The room is well-lit"},"consequences":{"immediate":"You notice a hidden door"}}' 
        }]
      }
      
      mockAnthropic.messages.create.mockResolvedValueOnce(mockActionResponse)

      const context = {
        playerInput: 'examine room',
        currentScene: 'tavern',
        players: [{ name: 'Hero', class: 'Fighter' }],
        gameState: { phase: 'playing' },
        roomId: 'test-room',
        actingPlayer: { id: 'player-1', name: 'Hero' }
      }

      const result = await claudeDM.processPlayerAction(context)

      expect(mockAnthropic.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-haiku-20240307',
        max_tokens: 800,
        messages: [{ 
          role: 'user', 
          content: expect.stringContaining('examine room')
        }]
      })

      expect(result).toEqual({
        narration: 'You successfully examine the room',
        sceneUpdate: { description: 'The room is well-lit' },
        consequences: { immediate: 'You notice a hidden door' }
      })
    })

    test('should return null for invalid actions without API key', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const claudeDMNoKey = new ClaudeDM()

      const context = {
        playerInput: 'do something evil',
        currentScene: 'tavern'
      }

      const result = await claudeDMNoKey.processPlayerAction(context)
      expect(result).toBeNull()
    })

    test('should handle API errors in action processing', async () => {
      mockAnthropic.messages.create.mockRejectedValueOnce(new Error('API Error'))

      const context = {
        playerInput: 'examine room',
        currentScene: 'tavern',
        actingPlayer: { name: 'Hero' }
      }

      const result = await claudeDM.processPlayerAction(context)
      expect(result).toBeNull()
    })
  })

  describe('Dice Result Integration', () => {
    test('should incorporate dice results into narrative', async () => {
      const mockDiceResponse = {
        content: [{ 
          text: '{"narration":"Your attack hits magnificently! The sword strikes true.","sceneUpdate":{"description":"The enemy staggers back"}}' 
        }]
      }
      
      mockAnthropic.messages.create.mockResolvedValueOnce(mockDiceResponse)

      const context = {
        playerInput: 'attack with sword',
        diceResult: {
          roll: 18,
          success: true,
          difficulty: 15,
          type: 'attack'
        },
        originalAction: 'attack with sword',
        originalNarration: 'You swing your sword'
      }

      const result = await claudeDM.incorporateDiceResult(context)

      expect(result.narration).toBe('Your attack hits magnificently! The sword strikes true.')
      expect(result.sceneUpdate.description).toBe('The enemy staggers back')
    })
  })

  describe('Character Equipment Generation', () => {
    test('should generate appropriate equipment for character', async () => {
      const mockEquipmentResponse = {
        content: [{ 
          text: '{"weapons":[{"name":"Longsword","damage":"1d8+3","type":"melee"}],"armor":[{"name":"Chain Mail","ac":16,"type":"medium"}],"items":[{"name":"Health Potion","quantity":2}]}' 
        }]
      }
      
      mockAnthropic.messages.create.mockResolvedValueOnce(mockEquipmentResponse)

      const character = {
        name: 'Warrior',
        class: 'Fighter',
        level: 3,
        stats: { strength: 16, dexterity: 12 }
      }

      const result = await claudeDM.generateCharacterEquipment(character)

      expect(result).toEqual({
        weapons: [{ name: 'Longsword', damage: '1d8+3', type: 'melee' }],
        armor: [{ name: 'Chain Mail', ac: 16, type: 'medium' }],
        items: [{ name: 'Health Potion', quantity: 2 }]
      })
    })

    test('should provide fallback equipment without API key', async () => {
      delete process.env.ANTHROPIC_API_KEY
      const claudeDMNoKey = new ClaudeDM()

      const character = {
        name: 'Rogue',
        class: 'Rogue',
        level: 1
      }

      const result = await claudeDMNoKey.generateCharacterEquipment(character)

      expect(result.weapons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.any(String) })
        ])
      )
      expect(result.armor).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: expect.any(String) })
        ])
      )
    })
  })

  describe('Loot Generation', () => {
    test('should generate contextual loot', async () => {
      const mockLootResponse = {
        content: [{ 
          text: '{"currency":{"gold":25,"silver":10},"equipment":[{"name":"Magic Ring","rarity":"uncommon","description":"A ring that glows faintly"}],"consumables":[{"name":"Healing Potion","quantity":1}]}' 
        }]
      }
      
      mockAnthropic.messages.create.mockResolvedValueOnce(mockLootResponse)

      const context = {
        currentScene: 'dungeon',
        recentEvents: ['Defeated goblin'],
        partyLevel: 3
      }

      const result = await claudeDM.generateLoot(context, 'normal')

      expect(result).toEqual({
        currency: { gold: 25, silver: 10 },
        equipment: [{ name: 'Magic Ring', rarity: 'uncommon', description: 'A ring that glows faintly' }],
        consumables: [{ name: 'Healing Potion', quantity: 1 }]
      })
    })

    test('should adjust loot based on difficulty', async () => {
      const mockHardLootResponse = {
        content: [{ 
          text: '{"currency":{"gold":100,"platinum":5},"equipment":[{"name":"Rare Sword","rarity":"rare"}]}' 
        }]
      }
      
      mockAnthropic.messages.create.mockResolvedValueOnce(mockHardLootResponse)

      const context = { currentScene: 'boss room' }
      const result = await claudeDM.generateLoot(context, 'hard')

      expect(mockAnthropic.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-haiku-20240307',
        max_tokens: 600,
        messages: [{ 
          role: 'user', 
          content: expect.stringContaining('hard')
        }]
      })
    })
  })

  describe('Fallback Responses', () => {
    test('should provide fallback campaign story', () => {
      delete process.env.ANTHROPIC_API_KEY
      const claudeDMNoKey = new ClaudeDM()

      const fallback = claudeDMNoKey.getFallbackCampaignStory('Test description', 'Test Room')

      expect(fallback.sceneDescription).toContain('Test Room')
      expect(fallback.location).toBe('The Prancing Pony')
      expect(Array.isArray(fallback.availableActions)).toBe(true)
      expect(Array.isArray(fallback.npcs)).toBe(true)
      expect(typeof fallback.questHook).toBe('string')
    })

    test('should provide fallback equipment based on character class', () => {
      delete process.env.ANTHROPIC_API_KEY
      const claudeDMNoKey = new ClaudeDM()

      const fighterEquipment = claudeDMNoKey.getFallbackEquipment({ class: 'Fighter' })
      const rogueEquipment = claudeDMNoKey.getFallbackEquipment({ class: 'Rogue' })
      const wizardEquipment = claudeDMNoKey.getFallbackEquipment({ class: 'Wizard' })

      expect(fighterEquipment.weapons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Longsword' })
        ])
      )
      
      expect(rogueEquipment.weapons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Dagger' })
        ])
      )

      expect(wizardEquipment.weapons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Quarterstaff' })
        ])
      )
    })

    test('should provide fallback loot based on difficulty', () => {
      delete process.env.ANTHROPIC_API_KEY
      const claudeDMNoKey = new ClaudeDM()

      const easyLoot = claudeDMNoKey.getFallbackLoot('easy')
      const hardLoot = claudeDMNoKey.getFallbackLoot('hard')

      expect(easyLoot.currency.gold).toBeLessThan(hardLoot.currency.gold)
      expect(easyLoot.equipment.length).toBeLessThanOrEqual(hardLoot.equipment.length)
    })
  })

  describe('Action Validation', () => {
    test('should validate player actions', () => {
      delete process.env.ANTHROPIC_API_KEY
      const claudeDMNoKey = new ClaudeDM()

      expect(claudeDMNoKey.isValidAction('look around')).toBe(true)
      expect(claudeDMNoKey.isValidAction('attack goblin')).toBe(true)
      expect(claudeDMNoKey.isValidAction('talk to NPC')).toBe(true)
      expect(claudeDMNoKey.isValidAction('cast fireball')).toBe(true)
      
      // These should be considered invalid/inappropriate
      expect(claudeDMNoKey.isValidAction('')).toBe(false)
      expect(claudeDMNoKey.isValidAction('   ')).toBe(false)
    })
  })
})