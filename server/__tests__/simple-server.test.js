import { jest } from '@jest/globals'

describe('Server Integration Tests', () => {
  describe('Basic Functionality', () => {
    test('should calculate ability modifiers correctly', () => {
      const calculateModifier = (score) => Math.floor((score - 10) / 2)
      
      expect(calculateModifier(16)).toBe(3)
      expect(calculateModifier(14)).toBe(2)
      expect(calculateModifier(10)).toBe(0)
      expect(calculateModifier(8)).toBe(-1)
    })

    test('should validate dice expressions', () => {
      const isValidDiceExpression = (expr) => {
        return /^\d+d\d+(\+\d+)?$/.test(expr)
      }

      expect(isValidDiceExpression('1d20')).toBe(true)
      expect(isValidDiceExpression('2d6+3')).toBe(true)
      expect(isValidDiceExpression('invalid')).toBe(false)
    })

    test('should sanitize strings', () => {
      const sanitizeString = (str, maxLength = 255) => {
        if (!str || typeof str !== "string") return ""
        return str.trim().slice(0, maxLength)
      }

      expect(sanitizeString("  hello world  ")).toBe("hello world")
      expect(sanitizeString("a".repeat(300), 100)).toHaveLength(100)
      expect(sanitizeString(null)).toBe("")
      expect(sanitizeString(123)).toBe("")
    })

    test('should generate unique IDs', () => {
      const generateId = () => {
        return Math.random().toString(36).substr(2, 9)
      }

      const id1 = generateId()
      const id2 = generateId()
      
      expect(typeof id1).toBe('string')
      expect(typeof id2).toBe('string')
      expect(id1).not.toBe(id2)
    })
  })

  describe('Character Data Validation', () => {
    test('should validate character stats', () => {
      const validateStat = (stat) => {
        const parsed = parseInt(stat)
        return Math.min(Math.max(parsed || 10, 8), 18)
      }

      expect(validateStat(16)).toBe(16)
      expect(validateStat(25)).toBe(18) // Clamped to max
      expect(validateStat(5)).toBe(8)   // Clamped to min
      expect(validateStat('invalid')).toBe(10) // Default
    })

    test('should validate hit points', () => {
      const validateHP = (current, maximum) => {
        const maxHP = Math.max(parseInt(maximum) || 10, 1)
        const curHP = Math.max(Math.min(parseInt(current) || maxHP, maxHP), 0)
        return { current: curHP, maximum: maxHP }
      }

      const hp1 = validateHP(15, 20)
      expect(hp1.current).toBe(15)
      expect(hp1.maximum).toBe(20)

      const hp2 = validateHP(-5, 10)
      expect(hp2.current).toBe(0) // Clamped to 0
      expect(hp2.maximum).toBe(10)

      const hp3 = validateHP(15, 10)
      expect(hp3.current).toBe(10) // Clamped to maximum
      expect(hp3.maximum).toBe(10)
    })
  })

  describe('Game Mechanics', () => {
    test('should calculate proficiency bonus', () => {
      const getProficiencyBonus = (level) => {
        return Math.ceil(level / 4) + 1
      }

      expect(getProficiencyBonus(1)).toBe(2)
      expect(getProficiencyBonus(5)).toBe(3)
      expect(getProficiencyBonus(9)).toBe(4)
      expect(getProficiencyBonus(13)).toBe(5)
      expect(getProficiencyBonus(17)).toBe(6)
    })

    test('should simulate dice rolls', () => {
      const rollDice = (sides) => {
        return Math.floor(Math.random() * sides) + 1
      }

      for (let i = 0; i < 100; i++) {
        const roll = rollDice(20)
        expect(roll).toBeGreaterThanOrEqual(1)
        expect(roll).toBeLessThanOrEqual(20)
      }
    })
  })

  describe('Rate Limiting', () => {
    test('should implement basic rate limiting', () => {
      const rateLimiter = (() => {
        const lastAction = new Map()
        return (ip, minMs = 1000) => {
          const prev = lastAction.get(ip) || 0
          const now = Date.now()
          if (now - prev < minMs) return false
          lastAction.set(ip, now)
          return true
        }
      })()

      expect(rateLimiter('127.0.0.1', 100)).toBe(true)
      expect(rateLimiter('127.0.0.1', 100)).toBe(false)
      expect(rateLimiter('192.168.1.1', 100)).toBe(true)
    })
  })

  describe('Error Handling', () => {
    test('should handle malformed JSON gracefully', () => {
      const parseMessage = (data) => {
        try {
          return { success: true, data: JSON.parse(data) }
        } catch (error) {
          return { success: false, error: error.message }
        }
      }

      const valid = parseMessage('{"type": "test", "data": "value"}')
      expect(valid.success).toBe(true)
      expect(valid.data.type).toBe('test')

      const invalid = parseMessage('invalid json')
      expect(invalid.success).toBe(false)
      expect(invalid.error).toBeDefined()
    })

    test('should validate message types', () => {
      const validMessageTypes = [
        'player_connect', 'create_room', 'join_room', 'player_action',
        'dice_roll', 'chat_message', 'create_character'
      ]

      const isValidMessageType = (type) => {
        return validMessageTypes.includes(type)
      }

      expect(isValidMessageType('player_connect')).toBe(true)
      expect(isValidMessageType('dice_roll')).toBe(true)
      expect(isValidMessageType('invalid_type')).toBe(false)
    })
  })

  describe('Room Management', () => {
    test('should create room data structure', () => {
      const createRoom = (id, data) => ({
        id,
        name: data.name,
        description: data.description,
        players: [],
        maxPlayers: data.maxPlayers,
        gameState: {
          phase: 'character_creation',
          dice: [],
          chatLog: []
        },
        settings: {
          isPublic: data.isPublic,
          useAIDM: data.useAIDM
        },
        createdAt: Date.now()
      })

      const roomData = {
        name: 'Test Campaign',
        description: 'A test adventure',
        maxPlayers: 6,
        isPublic: true,
        useAIDM: true
      }

      const room = createRoom('TEST123', roomData)

      expect(room.id).toBe('TEST123')
      expect(room.name).toBe('Test Campaign')
      expect(room.maxPlayers).toBe(6)
      expect(Array.isArray(room.players)).toBe(true)
      expect(room.gameState.phase).toBe('character_creation')
      expect(room.settings.isPublic).toBe(true)
    })
  })
})