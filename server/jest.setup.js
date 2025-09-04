// Mock Redis for testing
jest.mock('ioredis', () => {
  return class MockRedis {
    constructor() {
      this.data = new Map()
      this.connected = false
    }
    
    async connect() {
      this.connected = true
      return this
    }
    
    async disconnect() {
      this.connected = false
    }
    
    async set(key, value, ...args) {
      this.data.set(key, value)
      return 'OK'
    }
    
    async get(key) {
      return this.data.get(key) || null
    }
    
    async zadd(key, score, member) {
      // Simple mock for sorted sets
      return 1
    }
    
    async zrevrange(key, start, stop) {
      return []
    }
    
    async subscribe(channel) {
      return 1
    }
    
    on(event, callback) {
      // Mock event handling
    }
  }
})

// Mock Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return class MockAnthropic {
    constructor() {
      this.messages = {
        create: jest.fn()
      }
    }
  }
})

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.ANTHROPIC_API_KEY = 'test-key'