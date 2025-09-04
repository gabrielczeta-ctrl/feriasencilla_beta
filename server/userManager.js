import bcrypt from 'bcrypt';
import crypto from 'crypto';

export class UserManager {
  constructor(redis) {
    this.redis = redis;
    this.sessions = new Map(); // In-memory session storage
    this.inMemoryUsers = new Map(); // Fallback when no Redis
    this.hasRedis = redis !== null;
  }

  // Hash password securely
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  // Verify password
  async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  // Generate secure session token
  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Register new user with character
  async registerUser(username, password, character = null) {
    try {
      // Check if username exists
      let existingUser;
      if (this.hasRedis) {
        existingUser = await this.redis.get(`user:${username}`);
      } else {
        existingUser = this.inMemoryUsers.get(username);
      }
      
      if (existingUser) {
        return { success: false, message: 'Username already exists' };
      }

      // Hash password
      const passwordHash = await this.hashPassword(password);
      
      // Create user object
      const userData = {
        username,
        passwordHash,
        character: character,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      };

      // Save to storage
      if (this.hasRedis) {
        await this.redis.set(`user:${username}`, JSON.stringify(userData));
      } else {
        this.inMemoryUsers.set(username, userData);
      }
      
      console.log(`✅ User registered: ${username}`);
      return { success: true, message: 'User registered successfully' };
    } catch (error) {
      console.error('❌ Registration error:', error);
      return { success: false, message: 'Registration failed' };
    }
  }

  // Authenticate user
  async authenticateUser(username, password) {
    try {
      let userData;
      if (this.hasRedis) {
        userData = await this.redis.get(`user:${username}`);
        if (userData) userData = JSON.parse(userData);
      } else {
        userData = this.inMemoryUsers.get(username);
      }
      
      if (!userData) {
        return { success: false, message: 'User not found' };
      }

      const user = userData;
      const isValidPassword = await this.verifyPassword(password, user.passwordHash);
      
      if (!isValidPassword) {
        return { success: false, message: 'Invalid password' };
      }

      // Generate session token
      const sessionToken = this.generateSessionToken();
      
      // Store session
      this.sessions.set(sessionToken, {
        username,
        loginTime: new Date().toISOString()
      });

      // Update last login
      user.lastLogin = new Date().toISOString();
      if (this.hasRedis) {
        await this.redis.set(`user:${username}`, JSON.stringify(user));
      } else {
        this.inMemoryUsers.set(username, user);
      }

      console.log(`✅ User authenticated: ${username}`);
      return { 
        success: true, 
        sessionToken, 
        character: user.character,
        message: 'Authentication successful' 
      };
    } catch (error) {
      console.error('❌ Authentication error:', error);
      return { success: false, message: 'Authentication failed' };
    }
  }

  // Validate session token
  validateSession(sessionToken) {
    return this.sessions.has(sessionToken);
  }

  // Get user from session
  getUserFromSession(sessionToken) {
    return this.sessions.get(sessionToken);
  }

  // Save character to user profile
  async saveUserCharacter(username, character) {
    try {
      let userData;
      if (this.hasRedis) {
        userData = await this.redis.get(`user:${username}`);
        if (userData) userData = JSON.parse(userData);
      } else {
        userData = this.inMemoryUsers.get(username);
      }
      
      if (!userData) {
        return { success: false, message: 'User not found' };
      }

      const user = userData;
      user.character = character;
      user.updatedAt = new Date().toISOString();

      if (this.hasRedis) {
        await this.redis.set(`user:${username}`, JSON.stringify(user));
      } else {
        this.inMemoryUsers.set(username, user);
      }
      
      console.log(`✅ Character saved for user: ${username}`);
      return { success: true, message: 'Character saved successfully' };
    } catch (error) {
      console.error('❌ Save character error:', error);
      return { success: false, message: 'Failed to save character' };
    }
  }

  // Get user's character
  async getUserCharacter(username) {
    try {
      let userData;
      if (this.hasRedis) {
        userData = await this.redis.get(`user:${username}`);
        if (userData) userData = JSON.parse(userData);
      } else {
        userData = this.inMemoryUsers.get(username);
      }
      
      if (!userData) {
        return { success: false, message: 'User not found' };
      }

      const user = userData;
      return { 
        success: true, 
        character: user.character,
        message: 'Character retrieved successfully' 
      };
    } catch (error) {
      console.error('❌ Get character error:', error);
      return { success: false, message: 'Failed to get character' };
    }
  }

  // Logout user
  logout(sessionToken) {
    this.sessions.delete(sessionToken);
    return { success: true, message: 'Logged out successfully' };
  }

  // Clean up expired sessions (call periodically)
  cleanupSessions() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [token, session] of this.sessions.entries()) {
      if (now - new Date(session.loginTime).getTime() > maxAge) {
        this.sessions.delete(token);
      }
    }
  }
}