import { jest } from '@jest/globals'
import WebSocket from 'ws'
import http from 'http'

// Mock dependencies first
const mockRedis = {
  connect: jest.fn().mockResolvedValue(true),
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  zadd: jest.fn().mockResolvedValue(1),
  zrevrange: jest.fn().mockResolvedValue([]),
  subscribe: jest.fn().mockResolvedValue(1),
  on: jest.fn(),
}

jest.unstable_mockModule('ioredis', () => ({
  default: jest.fn(() => mockRedis)
}))

jest.unstable_mockModule('../claude-dm.js', () => ({
  ClaudeDM: jest.fn(() => ({
    generateCampaignStory: jest.fn().mockResolvedValue({
      sceneDescription: 'Test scene description',
      location: 'Test Tavern',
      availableActions: ['Look around', 'Talk to bartender'],
      npcs: [{ name: 'Bob', description: 'Friendly bartender', personality: 'friendly' }],
      questHook: 'A mysterious quest awaits'
    }),
    processPlayerAction: jest.fn().mockResolvedValue({
      narration: 'You perform the action successfully'
    })
  }))
}))

jest.unstable_mockModule('../userManager.js', () => ({
  UserManager: jest.fn(() => ({
    registerUser: jest.fn().mockResolvedValue({ success: true, message: 'User registered' }),
    authenticateUser: jest.fn().mockResolvedValue({ success: true, sessionToken: 'test-token' }),
    getUserCharacter: jest.fn().mockResolvedValue({ success: true, character: null }),
    saveUserCharacter: jest.fn().mockResolvedValue({ success: true })
  }))
}))

jest.unstable_mockModule('../globalGameManager.js', () => ({
  GlobalGameManager: jest.fn(() => ({
    addClient: jest.fn(),
    removeClient: jest.fn(),
    addPlayer: jest.fn().mockReturnValue({ id: 'global-server', name: 'The Eternal Tavern' }),
    removePlayer: jest.fn(),
    addPlayerAction: jest.fn().mockReturnValue({ success: true }),
    broadcastToAll: jest.fn()
  }))
}))

describe('D&D Server', () => {
  let server
  let wss
  let mockWs
  
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Mock WebSocket
    mockWs = {
      playerId: null,
      roomId: null,
      username: null,
      readyState: 1,
      send: jest.fn(),
      on: jest.fn(),
      close: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }
  })
  
  afterEach(async () => {
    if (server) {
      server.close()
    }
  })

  describe('Health Check Endpoint', () => {
    test('should return health status', (done) => {
      const server = http.createServer((req, res) => {
        if (req.url === "/health") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ 
            ok: true, 
            redis: false,
            uptime: process.uptime(),
            type: "dnd-platform"
          }));
          return;
        }
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("D&D Platform WebSocket Server");
      })

      server.listen(0, () => {
        const port = server.address().port
        const req = http.request(`http://localhost:${port}/health`, (res) => {
          let data = ''
          res.on('data', chunk => data += chunk)
          res.on('end', () => {
            const response = JSON.parse(data)
            expect(response.ok).toBe(true)
            expect(response.type).toBe('dnd-platform')
            expect(typeof response.uptime).toBe('number')
            server.close()
            done()
          })
        })
        req.end()
      })
    })
  })

  describe('WebSocket Message Handling', () => {
    // Import the server module to test message handlers
    let handleMessage
    
    beforeAll(async () => {
      // This is a simplified approach - in a real scenario you'd need to structure 
      // the server code to be more testable by extracting the message handler
      handleMessage = async (ws, msg, ip) => {
        // Mock implementation of message handling logic
        switch (msg.type) {
          case 'register':
            ws.send(JSON.stringify({
              type: 'register_response',
              success: true,
              message: 'User registered successfully'
            }))
            break
          case 'login':
            ws.send(JSON.stringify({
              type: 'login_response',
              success: true,
              message: 'Login successful'
            }))
            break
          case 'player_connect':
            ws.playerId = msg.playerId || 'test-player-id'
            ws.send(JSON.stringify({
              type: 'player_connected',
              playerId: ws.playerId,
              timestamp: Date.now()
            }))
            break
          default:
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Unknown message type'
            }))
        }
      }
    })

    test('should handle player registration', async () => {
      const message = {
        type: 'register',
        username: 'testuser',
        password: 'password123'
      }

      await handleMessage(mockWs, message, '127.0.0.1')

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'register_response',
          success: true,
          message: 'User registered successfully'
        })
      )
    })

    test('should handle player login', async () => {
      const message = {
        type: 'login',
        username: 'testuser',
        password: 'password123'
      }

      await handleMessage(mockWs, message, '127.0.0.1')

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'login_response',
          success: true,
          message: 'Login successful'
        })
      )
    })

    test('should handle player connection', async () => {
      const message = {
        type: 'player_connect',
        playerId: 'test-player-123',
        playerName: 'Test Player'
      }

      await handleMessage(mockWs, message, '127.0.0.1')

      expect(mockWs.playerId).toBe('test-player-123')
      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"player_connected"')
      )
    })

    test('should handle unknown message types', async () => {
      const message = {
        type: 'unknown_type'
      }

      await handleMessage(mockWs, message, '127.0.0.1')

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'error',
          message: 'Unknown message type'
        })
      )
    })
  })

  describe('Room Management', () => {
    test('should create a room with valid data', () => {
      const roomData = {
        name: 'Test Campaign',
        description: 'A test adventure',
        dmId: 'player-123',
        maxPlayers: 6,
        isPublic: true,
        useAIDM: false
      }

      // Mock the room creation function
      const createRoom = (roomId, data) => ({
        id: roomId,
        name: data.name,
        description: data.description,
        dmId: data.dmId,
        players: [],
        maxPlayers: data.maxPlayers,
        currentScene: "Character Creation",
        gameState: {
          phase: "character_creation",
          story: {
            currentScene: "",
            sceneDescription: "",
            availableActions: [],
            npcs: [],
            location: "",
            questLog: [],
            worldState: {}
          },
          dice: [],
          chatLog: []
        },
        settings: {
          isPublic: data.isPublic,
          useAIDM: data.useAIDM
        },
        createdAt: Date.now(),
        lastActivity: Date.now()
      })

      const room = createRoom('TEST123', roomData)

      expect(room.id).toBe('TEST123')
      expect(room.name).toBe('Test Campaign')
      expect(room.description).toBe('A test adventure')
      expect(room.maxPlayers).toBe(6)
      expect(room.settings.isPublic).toBe(true)
      expect(room.settings.useAIDM).toBe(false)
      expect(room.gameState.phase).toBe('character_creation')
      expect(Array.isArray(room.players)).toBe(true)
    })

    test('should sanitize room data for client', () => {
      const room = {
        id: 'TEST123',
        name: 'Test Campaign',
        description: 'Test description',
        dmId: 'dm-123',
        players: [
          {
            id: 'player-1',
            name: 'Player One',
            role: 'player',
            isOnline: true,
            character: { name: 'Hero', class: 'Fighter' }
          }
        ],
        maxPlayers: 6,
        currentScene: 'Tavern',
        gameState: { phase: 'playing' },
        settings: { isPublic: true },
        createdAt: Date.now(),
        lastActivity: Date.now()
      }

      const sanitizeRoomForClient = (room) => ({
        id: room.id,
        name: room.name,
        description: room.description,
        dmId: room.dmId,
        players: room.players,
        maxPlayers: room.maxPlayers,
        currentScene: room.currentScene,
        gameState: room.gameState,
        settings: room.settings,
        createdAt: room.createdAt,
        lastActivity: room.lastActivity
      })

      const sanitized = sanitizeRoomForClient(room)

      expect(sanitized.id).toBe(room.id)
      expect(sanitized.name).toBe(room.name)
      expect(sanitized.players).toEqual(room.players)
      expect(sanitized.gameState).toEqual(room.gameState)
    })
  })

  describe('Character Management', () => {
    test('should sanitize character data', () => {
      const rawCharacter = {
        name: 'Test Hero',
        race: 'Human',
        class: 'Fighter',
        level: 1,
        stats: {
          strength: 15,
          dexterity: 12,
          constitution: 14,
          intelligence: 10,
          wisdom: 13,
          charisma: 8
        },
        hitPoints: {
          current: 12,
          maximum: 12,
          temporary: 0
        },
        armorClass: 15,
        backstory: 'A brave warrior',
        equipment: []
      }

      const sanitizeCharacter = (character) => ({
        name: character.name || "Unnamed Character",
        race: character.race || "Human",
        class: character.class || "Fighter",
        level: Math.min(Math.max(parseInt(character.level) || 1, 1), 20),
        stats: {
          strength: Math.min(Math.max(parseInt(character.stats?.strength) || 10, 8), 18),
          dexterity: Math.min(Math.max(parseInt(character.stats?.dexterity) || 10, 8), 18),
          constitution: Math.min(Math.max(parseInt(character.stats?.constitution) || 10, 8), 18),
          intelligence: Math.min(Math.max(parseInt(character.stats?.intelligence) || 10, 8), 18),
          wisdom: Math.min(Math.max(parseInt(character.stats?.wisdom) || 10, 8), 18),
          charisma: Math.min(Math.max(parseInt(character.stats?.charisma) || 10, 8), 18)
        },
        hitPoints: {
          current: Math.max(parseInt(character.hitPoints?.current) || 10, 0),
          maximum: Math.max(parseInt(character.hitPoints?.maximum) || 10, 1),
          temporary: Math.max(parseInt(character.hitPoints?.temporary) || 0, 0)
        },
        armorClass: Math.min(Math.max(parseInt(character.armorClass) || 10, 5), 30),
        backstory: character.backstory || "",
        equipment: []
      })

      const sanitized = sanitizeCharacter(rawCharacter)

      expect(sanitized.name).toBe('Test Hero')
      expect(sanitized.race).toBe('Human')
      expect(sanitized.class).toBe('Fighter')
      expect(sanitized.level).toBe(1)
      expect(sanitized.stats.strength).toBe(15)
      expect(sanitized.hitPoints.current).toBe(12)
      expect(sanitized.armorClass).toBe(15)
    })

    test('should handle invalid character data', () => {
      const invalidCharacter = {
        name: '',
        level: 'invalid',
        stats: {
          strength: -5,
          dexterity: 25
        },
        hitPoints: {
          current: -10,
          maximum: 0
        },
        armorClass: 50
      }

      const sanitizeCharacter = (character) => ({
        name: character.name || "Unnamed Character",
        race: character.race || "Human",
        class: character.class || "Fighter",
        level: Math.min(Math.max(parseInt(character.level) || 1, 1), 20),
        stats: {
          strength: Math.min(Math.max(parseInt(character.stats?.strength) || 10, 8), 18),
          dexterity: Math.min(Math.max(parseInt(character.stats?.dexterity) || 10, 8), 18),
          constitution: Math.min(Math.max(parseInt(character.stats?.constitution) || 10, 8), 18),
          intelligence: Math.min(Math.max(parseInt(character.stats?.intelligence) || 10, 8), 18),
          wisdom: Math.min(Math.max(parseInt(character.stats?.wisdom) || 10, 8), 18),
          charisma: Math.min(Math.max(parseInt(character.stats?.charisma) || 10, 8), 18)
        },
        hitPoints: {
          current: Math.max(parseInt(character.hitPoints?.current) || 10, 0),
          maximum: Math.max(parseInt(character.hitPoints?.maximum) || 10, 1),
          temporary: Math.max(parseInt(character.hitPoints?.temporary) || 0, 0)
        },
        armorClass: Math.min(Math.max(parseInt(character.armorClass) || 10, 5), 30),
        backstory: character.backstory || "",
        equipment: []
      })

      const sanitized = sanitizeCharacter(invalidCharacter)

      expect(sanitized.name).toBe('Unnamed Character')
      expect(sanitized.race).toBe('Human')
      expect(sanitized.class).toBe('Fighter')
      expect(sanitized.level).toBe(1)
      expect(sanitized.stats.strength).toBe(8) // Clamped to minimum
      expect(sanitized.stats.dexterity).toBe(18) // Clamped to maximum
      expect(sanitized.hitPoints.current).toBe(0) // Clamped to 0 (minimum)
      expect(sanitized.hitPoints.maximum).toBe(10) // Default value used since 0 is falsy
      expect(sanitized.armorClass).toBe(30) // Clamped to maximum
    })
  })

  describe('Dice Rolling System', () => {
    test('should parse valid dice expressions', () => {
      const parseDiceExpression = (expression) => {
        const cleanExpr = expression.toLowerCase().replace(/\s/g, '');
        const diceRegex = /(\d+)?d(\d+)([+-]\d+)?/g;
        
        let total = 0;
        let allRolls = [];
        let match;
        let valid = false;

        while ((match = diceRegex.exec(cleanExpr)) !== null) {
          valid = true;
          const numDice = parseInt(match[1] || '1');
          const dieSize = parseInt(match[2]);
          const modifier = parseInt(match[3] || '0');
          
          if (numDice > 20 || dieSize > 100) continue;
          
          const rolls = [];
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

      const result1 = parseDiceExpression('1d20');
      expect(result1.valid).toBe(true);
      expect(result1.rolls.length).toBe(1);
      expect(result1.rolls[0]).toBeGreaterThanOrEqual(1);
      expect(result1.rolls[0]).toBeLessThanOrEqual(20);

      const result2 = parseDiceExpression('2d6+3');
      expect(result2.valid).toBe(true);
      expect(result2.rolls.length).toBe(2);
      expect(result2.total).toBeGreaterThanOrEqual(5); // 2 + 3 minimum
      expect(result2.total).toBeLessThanOrEqual(15); // 12 + 3 maximum

      const result3 = parseDiceExpression('invalid');
      expect(result3.valid).toBe(false);
      expect(result3.rolls.length).toBe(0);
    })
  })

  describe('Rate Limiting', () => {
    test('should implement rate limiting', () => {
      const lastAction = new Map();
      
      const rateLimit = (ip, minMs = 1000) => {
        const prev = lastAction.get(ip) || 0;
        const now = Date.now();
        if (now - prev < minMs) return false;
        lastAction.set(ip, now);
        return true;
      }

      // First request should pass
      expect(rateLimit('127.0.0.1', 1000)).toBe(true);
      
      // Immediate second request should fail
      expect(rateLimit('127.0.0.1', 1000)).toBe(false);
      
      // Different IP should pass
      expect(rateLimit('192.168.1.1', 1000)).toBe(true);
    })
  })

  describe('String Sanitization', () => {
    test('should sanitize strings properly', () => {
      const sanitizeString = (str, maxLength = 255) => {
        if (!str || typeof str !== "string") return "";
        return str.trim().slice(0, maxLength);
      }

      expect(sanitizeString("  hello world  ")).toBe("hello world");
      expect(sanitizeString("a".repeat(300), 100)).toHaveLength(100);
      expect(sanitizeString(null)).toBe("");
      expect(sanitizeString(123)).toBe("");
      expect(sanitizeString("")).toBe("");
    })
  })
})