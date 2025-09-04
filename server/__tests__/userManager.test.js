import { jest } from '@jest/globals'
import bcrypt from 'bcrypt'

// Mock bcrypt for faster tests
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true)
}))

// Mock Redis
const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  hset: jest.fn().mockResolvedValue(1),
  hget: jest.fn().mockResolvedValue(null),
  hgetall: jest.fn().mockResolvedValue({}),
  exists: jest.fn().mockResolvedValue(0),
  del: jest.fn().mockResolvedValue(1)
}

const { UserManager } = await import('../userManager.js')

describe('UserManager', () => {
  let userManager
  let userManagerWithRedis

  beforeEach(() => {
    jest.clearAllMocks()
    userManager = new UserManager(null) // In-memory mode
    userManagerWithRedis = new UserManager(mockRedis)
  })

  describe('Initialization', () => {
    test('should initialize without Redis (in-memory mode)', () => {
      expect(userManager.hasRedis).toBe(false)
      expect(userManager.inMemoryUsers).toBeInstanceOf(Map)
      expect(userManager.sessions).toBeInstanceOf(Map)
    })

    test('should initialize with Redis', () => {
      expect(userManagerWithRedis.hasRedis).toBe(true)
      expect(userManagerWithRedis.redis).toBe(mockRedis)
    })
  })

  describe('Password Management', () => {
    test('should hash passwords securely', async () => {
      const password = 'testPassword123'
      const hashedPassword = await userManager.hashPassword(password)

      expect(bcrypt.hash).toHaveBeenCalledWith(password, 12)
      expect(hashedPassword).toBe('hashed_password')
    })

    test('should verify passwords correctly', async () => {
      const password = 'testPassword123'
      const hash = 'hashed_password'
      
      const isValid = await userManager.verifyPassword(password, hash)

      expect(bcrypt.compare).toHaveBeenCalledWith(password, hash)
      expect(isValid).toBe(true)
    })

    test('should handle password verification failure', async () => {
      bcrypt.compare.mockResolvedValueOnce(false)
      
      const isValid = await userManager.verifyPassword('wrongPassword', 'hash')
      expect(isValid).toBe(false)
    })
  })

  describe('Session Token Management', () => {
    test('should generate secure session tokens', () => {
      const token1 = userManager.generateSessionToken()
      const token2 = userManager.generateSessionToken()

      expect(typeof token1).toBe('string')
      expect(token1.length).toBe(64) // 32 bytes hex = 64 characters
      expect(token1).not.toBe(token2) // Should be unique
      expect(/^[0-9a-f]+$/.test(token1)).toBe(true) // Should be hex
    })
  })

  describe('User Registration (In-Memory)', () => {
    test('should register new user successfully', async () => {
      const username = 'testuser'
      const password = 'password123'

      const result = await userManager.registerUser(username, password)

      expect(result.success).toBe(true)
      expect(result.message).toBe('User registered successfully')
      expect(result.sessionToken).toBeDefined()
      expect(userManager.inMemoryUsers.has(username)).toBe(true)
      
      const userData = userManager.inMemoryUsers.get(username)
      expect(userData.username).toBe(username)
      expect(userData.passwordHash).toBe('hashed_password')
      expect(userData.createdAt).toBeDefined()
    })

    test('should prevent duplicate usernames', async () => {
      const username = 'existinguser'
      const password = 'password123'

      // Register first user
      await userManager.registerUser(username, password)
      
      // Try to register same username again
      const result = await userManager.registerUser(username, password)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Username already exists')
      expect(result.sessionToken).toBeUndefined()
    })

    test('should register user with character', async () => {
      const username = 'herouser'
      const password = 'password123'
      const character = {
        name: 'Hero',
        class: 'Fighter',
        level: 1
      }

      const result = await userManager.registerUser(username, password, character)

      expect(result.success).toBe(true)
      expect(result.character).toEqual(character)
      
      const userData = userManager.inMemoryUsers.get(username)
      expect(userData.character).toEqual(character)
    })

    test('should handle registration errors', async () => {
      bcrypt.hash.mockRejectedValueOnce(new Error('Hash error'))

      const result = await userManager.registerUser('testuser', 'password')

      expect(result.success).toBe(false)
      expect(result.message).toContain('Registration failed')
    })
  })

  describe('User Registration (Redis)', () => {
    test('should register user in Redis', async () => {
      mockRedis.exists.mockResolvedValueOnce(0) // User doesn't exist

      const result = await userManagerWithRedis.registerUser('redisuser', 'password123')

      expect(result.success).toBe(true)
      expect(mockRedis.exists).toHaveBeenCalledWith('user:redisuser')
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'user:redisuser',
        expect.objectContaining({
          username: 'redisuser',
          passwordHash: 'hashed_password'
        })
      )
    })

    test('should prevent duplicate usernames in Redis', async () => {
      mockRedis.exists.mockResolvedValueOnce(1) // User exists

      const result = await userManagerWithRedis.registerUser('existinguser', 'password')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Username already exists')
      expect(mockRedis.hset).not.toHaveBeenCalled()
    })

    test('should handle Redis errors during registration', async () => {
      mockRedis.exists.mockRejectedValueOnce(new Error('Redis error'))

      const result = await userManagerWithRedis.registerUser('testuser', 'password')

      expect(result.success).toBe(false)
      expect(result.message).toContain('Registration failed')
    })
  })

  describe('User Authentication (In-Memory)', () => {
    beforeEach(async () => {
      // Set up a test user
      await userManager.registerUser('testuser', 'password123')
    })

    test('should authenticate valid user', async () => {
      const result = await userManager.authenticateUser('testuser', 'password123')

      expect(result.success).toBe(true)
      expect(result.message).toBe('Login successful')
      expect(result.sessionToken).toBeDefined()
      expect(userManager.sessions.has(result.sessionToken)).toBe(true)
    })

    test('should reject invalid username', async () => {
      const result = await userManager.authenticateUser('nonexistent', 'password')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid username or password')
      expect(result.sessionToken).toBeUndefined()
    })

    test('should reject invalid password', async () => {
      bcrypt.compare.mockResolvedValueOnce(false)

      const result = await userManager.authenticateUser('testuser', 'wrongpassword')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid username or password')
    })

    test('should return user character on login', async () => {
      const character = { name: 'Hero', class: 'Fighter' }
      await userManager.saveUserCharacter('testuser', character)

      const result = await userManager.authenticateUser('testuser', 'password123')

      expect(result.success).toBe(true)
      expect(result.character).toEqual(character)
    })
  })

  describe('User Authentication (Redis)', () => {
    test('should authenticate user from Redis', async () => {
      const userData = {
        username: 'redisuser',
        passwordHash: 'hashed_password',
        createdAt: Date.now().toString(),
        character: JSON.stringify({ name: 'Hero', class: 'Fighter' })
      }
      
      mockRedis.hgetall.mockResolvedValueOnce(userData)

      const result = await userManagerWithRedis.authenticateUser('redisuser', 'password123')

      expect(result.success).toBe(true)
      expect(mockRedis.hgetall).toHaveBeenCalledWith('user:redisuser')
      expect(result.character.name).toBe('Hero')
    })

    test('should handle non-existent user in Redis', async () => {
      mockRedis.hgetall.mockResolvedValueOnce({})

      const result = await userManagerWithRedis.authenticateUser('nonexistent', 'password')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Invalid username or password')
    })
  })

  describe('Character Management (In-Memory)', () => {
    beforeEach(async () => {
      await userManager.registerUser('testuser', 'password123')
    })

    test('should save user character', async () => {
      const character = {
        name: 'Aragorn',
        class: 'Ranger',
        level: 5,
        stats: { strength: 16, dexterity: 14 }
      }

      const result = await userManager.saveUserCharacter('testuser', character)

      expect(result.success).toBe(true)
      expect(result.message).toBe('Character saved successfully')
      
      const userData = userManager.inMemoryUsers.get('testuser')
      expect(userData.character).toEqual(character)
    })

    test('should get user character', async () => {
      const character = { name: 'Legolas', class: 'Ranger' }
      await userManager.saveUserCharacter('testuser', character)

      const result = await userManager.getUserCharacter('testuser')

      expect(result.success).toBe(true)
      expect(result.character).toEqual(character)
    })

    test('should handle getting character for non-existent user', async () => {
      const result = await userManager.getUserCharacter('nonexistent')

      expect(result.success).toBe(false)
      expect(result.message).toBe('User not found')
    })

    test('should handle user with no character', async () => {
      const result = await userManager.getUserCharacter('testuser')

      expect(result.success).toBe(true)
      expect(result.character).toBeNull()
      expect(result.message).toBe('No character found for user')
    })
  })

  describe('Character Management (Redis)', () => {
    test('should save character to Redis', async () => {
      const character = { name: 'Gandalf', class: 'Wizard' }
      
      const result = await userManagerWithRedis.saveUserCharacter('redisuser', character)

      expect(result.success).toBe(true)
      expect(mockRedis.hset).toHaveBeenCalledWith(
        'user:redisuser',
        'character',
        JSON.stringify(character)
      )
    })

    test('should get character from Redis', async () => {
      const character = { name: 'Gimli', class: 'Fighter' }
      mockRedis.hget.mockResolvedValueOnce(JSON.stringify(character))

      const result = await userManagerWithRedis.getUserCharacter('redisuser')

      expect(result.success).toBe(true)
      expect(result.character).toEqual(character)
      expect(mockRedis.hget).toHaveBeenCalledWith('user:redisuser', 'character')
    })

    test('should handle Redis errors when saving character', async () => {
      mockRedis.hset.mockRejectedValueOnce(new Error('Redis error'))

      const result = await userManagerWithRedis.saveUserCharacter('user', { name: 'Test' })

      expect(result.success).toBe(false)
      expect(result.message).toContain('Failed to save character')
    })
  })

  describe('Session Management', () => {
    test('should validate valid session token', () => {
      const token = userManager.generateSessionToken()
      const userData = { username: 'testuser' }
      userManager.sessions.set(token, { ...userData, createdAt: Date.now() })

      const result = userManager.validateSession(token)

      expect(result.valid).toBe(true)
      expect(result.username).toBe('testuser')
    })

    test('should reject invalid session token', () => {
      const result = userManager.validateSession('invalid-token')

      expect(result.valid).toBe(false)
      expect(result.username).toBeNull()
    })

    test('should reject expired session token', () => {
      const token = userManager.generateSessionToken()
      const userData = { username: 'testuser' }
      const expiredTime = Date.now() - (25 * 60 * 60 * 1000) // 25 hours ago
      userManager.sessions.set(token, { ...userData, createdAt: expiredTime })

      const result = userManager.validateSession(token)

      expect(result.valid).toBe(false)
      expect(userManager.sessions.has(token)).toBe(false) // Should be cleaned up
    })

    test('should destroy session', () => {
      const token = userManager.generateSessionToken()
      userManager.sessions.set(token, { username: 'testuser', createdAt: Date.now() })

      userManager.destroySession(token)

      expect(userManager.sessions.has(token)).toBe(false)
    })
  })

  describe('User Listing and Management', () => {
    test('should list all users (in-memory)', async () => {
      await userManager.registerUser('user1', 'password')
      await userManager.registerUser('user2', 'password')

      const users = await userManager.getAllUsers()

      expect(users.length).toBe(2)
      expect(users.map(u => u.username)).toContain('user1')
      expect(users.map(u => u.username)).toContain('user2')
      // Should not include password hashes
      expect(users[0].passwordHash).toBeUndefined()
    })

    test('should delete user (in-memory)', async () => {
      await userManager.registerUser('deleteuser', 'password')
      expect(userManager.inMemoryUsers.has('deleteuser')).toBe(true)

      const result = await userManager.deleteUser('deleteuser')

      expect(result.success).toBe(true)
      expect(userManager.inMemoryUsers.has('deleteuser')).toBe(false)
    })

    test('should handle deleting non-existent user', async () => {
      const result = await userManager.deleteUser('nonexistent')

      expect(result.success).toBe(false)
      expect(result.message).toBe('User not found')
    })
  })

  describe('Session Cleanup', () => {
    test('should clean up expired sessions', () => {
      const validToken = userManager.generateSessionToken()
      const expiredToken = userManager.generateSessionToken()
      
      const now = Date.now()
      userManager.sessions.set(validToken, { username: 'user1', createdAt: now })
      userManager.sessions.set(expiredToken, { username: 'user2', createdAt: now - (25 * 60 * 60 * 1000) })

      userManager.cleanupExpiredSessions()

      expect(userManager.sessions.has(validToken)).toBe(true)
      expect(userManager.sessions.has(expiredToken)).toBe(false)
    })

    test('should get session count', () => {
      const token1 = userManager.generateSessionToken()
      const token2 = userManager.generateSessionToken()
      
      userManager.sessions.set(token1, { username: 'user1', createdAt: Date.now() })
      userManager.sessions.set(token2, { username: 'user2', createdAt: Date.now() })

      expect(userManager.getActiveSessionCount()).toBe(2)
    })
  })

  describe('Error Handling', () => {
    test('should handle malformed character JSON in Redis', async () => {
      mockRedis.hget.mockResolvedValueOnce('invalid json')

      const result = await userManagerWithRedis.getUserCharacter('user')

      expect(result.success).toBe(true)
      expect(result.character).toBeNull()
    })

    test('should handle authentication errors gracefully', async () => {
      bcrypt.compare.mockRejectedValueOnce(new Error('Bcrypt error'))

      const result = await userManager.authenticateUser('user', 'password')

      expect(result.success).toBe(false)
      expect(result.message).toContain('Authentication failed')
    })
  })
})