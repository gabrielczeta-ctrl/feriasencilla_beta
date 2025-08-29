import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());

// Game state
const rooms = new Map();
const playerSessions = new Map();

// Room management
class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.currentShader = 0;
    this.gameState = 'waiting'; // waiting, playing, finished, transitioning
    this.mousePositions = new Map();
    this.createdAt = new Date();
    this.asciiCharacters = []; // Store active ASCII characters
    
    // WarioWare-style queue system
    this.queue = [];
    this.currentPlayer = null;
    this.turnTimer = null;
    this.turnDuration = 45000; // 45 seconds per turn
    this.timeRemaining = 0;
    
    // Cleanup expired ASCII characters every second
    this.asciiCleanupTimer = setInterval(() => {
      this.cleanupExpiredAscii();
    }, 1000);
  }

  addPlayer(playerId, playerName) {
    const player = {
      id: playerId,
      name: playerName || `Player${this.players.size + 1}`,
      joinedAt: new Date(),
      score: 0,
      isActive: true
    };
    this.players.set(playerId, player);
    
    // Add to queue
    this.queue.push(playerId);
    
    // Start game if this is the first player
    if (this.players.size === 1) {
      this.startNextTurn();
    }
    
    return player;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.mousePositions.delete(playerId);
    
    // Remove from queue
    this.queue = this.queue.filter(id => id !== playerId);
    
    // If current player left, start next turn
    if (this.currentPlayer === playerId) {
      this.startNextTurn();
    }
    
    // Clean up empty rooms
    if (this.players.size === 0) {
      if (this.turnTimer) {
        clearInterval(this.turnTimer);
        this.turnTimer = null;
      }
      rooms.delete(this.id);
      console.log(`🗑️ Room ${this.id} deleted (empty)`);
    }
  }

  updateMousePosition(playerId, x, y) {
    this.mousePositions.set(playerId, { x, y, timestamp: Date.now() });
  }

  addAsciiCharacter(playerId, char, x, y) {
    // Determine ASCII type based on character
    let asciiType = 0.0;
    if (/[a-zA-Z]/.test(char)) asciiType = Math.random() * 0.2; // Letters: 0-0.2
    else if (/[0-9]/.test(char)) asciiType = 0.2 + Math.random() * 0.2; // Numbers: 0.2-0.4
    else if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(char)) asciiType = 0.4 + Math.random() * 0.2; // Special: 0.4-0.6
    else if (/[.,;:!?'""]/.test(char)) asciiType = 0.6 + Math.random() * 0.2; // Punctuation: 0.6-0.8
    else asciiType = 0.8 + Math.random() * 0.2; // Symbols: 0.8-1.0

    const asciiChar = {
      id: `${playerId}-${Date.now()}-${Math.random()}`,
      playerId,
      character: char,
      x: x / 1920, // Normalize to 0-1 range
      y: y / 1080, // Normalize to 0-1 range
      asciiType,
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000 // 10 seconds lifespan
    };

    this.asciiCharacters.push(asciiChar);
    
    // Limit total ASCII characters to prevent memory issues
    if (this.asciiCharacters.length > 100) {
      this.asciiCharacters = this.asciiCharacters.slice(-100);
    }

    console.log(`✨ ASCII '${char}' added by ${playerId} at (${x}, ${y})`);
    return asciiChar;
  }

  cleanupExpiredAscii() {
    const now = Date.now();
    const initialCount = this.asciiCharacters.length;
    this.asciiCharacters = this.asciiCharacters.filter(char => char.expiresAt > now);
    
    if (this.asciiCharacters.length < initialCount) {
      console.log(`🧹 Cleaned up ${initialCount - this.asciiCharacters.length} expired ASCII characters`);
      this.broadcastAsciiUpdate();
    }
  }

  startNextTurn() {
    if (this.queue.length === 0) {
      this.gameState = 'waiting';
      this.currentPlayer = null;
      return;
    }

    // Get next player from queue
    this.currentPlayer = this.queue.shift();
    this.queue.push(this.currentPlayer); // Add back to end of queue
    
    // Always use the single reactive shader
    this.currentShader = 0;
    
    this.gameState = 'playing';
    this.timeRemaining = this.turnDuration / 1000; // Convert to seconds
    
    console.log(`🎮 New turn started: ${this.currentPlayer} playing shader ${this.currentShader}`);
    
    // Broadcast game state change
    this.broadcastGameState();
    
    // Clear existing timer
    if (this.turnTimer) {
      clearInterval(this.turnTimer);
    }
    
    // Start countdown timer with shader transitions
    this.turnTimer = setInterval(() => {
      this.timeRemaining -= 1;
      
      // No shader transitions - always use reactive ASCII shader
      
      // Broadcast timer updates every second
      this.broadcastGameState();
      
      if (this.timeRemaining <= 0) {
        console.log(`⏰ Turn ended for ${this.currentPlayer}`);
        this.startNextTurn();
      }
    }, 1000);
  }

  broadcastGameState() {
    if (this.io && this.id) {
      this.io.to(this.id).emit('game-state-changed', {
        currentPlayer: this.currentPlayer,
        shaderIndex: this.currentShader,
        timeRemaining: this.timeRemaining,
        queue: this.queue,
        gamePhase: this.gameState
      });
    }
  }

  broadcastAsciiUpdate() {
    if (this.io && this.id) {
      this.io.to(this.id).emit('ascii-update', {
        asciiCharacters: this.asciiCharacters
      });
    }
  }

  setSocketIO(io) {
    this.io = io;
  }

  getRoomData() {
    return {
      id: this.id,
      playerCount: this.players.size,
      players: Array.from(this.players.values()),
      currentShader: this.currentShader,
      gameState: this.gameState,
      mousePositions: Object.fromEntries(this.mousePositions),
      currentPlayer: this.currentPlayer,
      queue: this.queue,
      timeRemaining: this.timeRemaining,
      asciiCharacters: this.asciiCharacters
    };
  }
}

// Generate random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);
  
  // Join room
  socket.on('join-room', (data) => {
    const { roomId: requestedRoomId, playerName } = data;
    let roomId = requestedRoomId || 'GLOBAL';
    
    // Always use GLOBAL room for multiplayer battles
    if (roomId === 'GLOBAL' || !roomId) {
      roomId = 'GLOBAL';
      if (!rooms.has(roomId)) {
        const newRoom = new GameRoom(roomId);
        newRoom.setSocketIO(io);
        rooms.set(roomId, newRoom);
        console.log(`🆕 Created GLOBAL battle room`);
      }
    } else {
      // Create new room if custom room doesn't exist
      if (!rooms.has(roomId)) {
        roomId = generateRoomId();
        const newRoom = new GameRoom(roomId);
        newRoom.setSocketIO(io);
        rooms.set(roomId, newRoom);
        console.log(`🆕 Created room: ${roomId}`);
      }
    }
    
    const room = rooms.get(roomId);
    const player = room.addPlayer(socket.id, playerName);
    
    // Join socket room
    socket.join(roomId);
    playerSessions.set(socket.id, { roomId, playerId: socket.id });
    
    console.log(`👥 ${player.name} joined room ${roomId} (${room.players.size} players)`);
    
    // Send room data to player
    socket.emit('room-joined', {
      room: room.getRoomData(),
      playerId: socket.id,
      playerName: player.name
    });
    
    // Broadcast to all players in room
    socket.to(roomId).emit('player-joined', {
      player,
      room: room.getRoomData()
    });
  });
  
  // Handle mouse movement
  socket.on('mouse-move', (data) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;
    
    const room = rooms.get(session.roomId);
    if (!room) return;
    
    room.updateMousePosition(socket.id, data.x, data.y);
    
    // Broadcast mouse position to all other players
    socket.to(session.roomId).emit('player-mouse', {
      playerId: socket.id,
      x: data.x,
      y: data.y
    });
  });
  
  // Handle ASCII input (only current player can input)
  socket.on('ascii-input', (data) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;
    
    const room = rooms.get(session.roomId);
    if (!room || room.currentPlayer !== socket.id) {
      // Only current player can input ASCII
      return;
    }
    
    const { character, x, y } = data;
    
    // Validate input
    if (!character || character.length !== 1) {
      return;
    }
    
    // Add ASCII character to room
    const asciiChar = room.addAsciiCharacter(socket.id, character, x, y);
    
    // Broadcast to all players
    io.to(session.roomId).emit('ascii-added', {
      asciiChar: asciiChar,
      addedBy: socket.id
    });
    
    // Broadcast full ASCII update
    room.broadcastAsciiUpdate();
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    const session = playerSessions.get(socket.id);
    if (session) {
      const room = rooms.get(session.roomId);
      if (room) {
        const player = room.players.get(socket.id);
        room.removePlayer(socket.id);
        
        // Notify other players
        socket.to(session.roomId).emit('player-left', {
          playerId: socket.id,
          playerName: player?.name,
          room: room.getRoomData()
        });
        
        console.log(`🔴 ${player?.name || socket.id} left room ${session.roomId}`);
      }
      playerSessions.delete(socket.id);
    }
  });
  
  // Get room list (for future lobby feature)
  socket.on('get-rooms', () => {
    const roomList = Array.from(rooms.values()).map(room => ({
      id: room.id,
      playerCount: room.players.size,
      gameState: room.gameState
    }));
    socket.emit('rooms-list', roomList);
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'Shader Battle Server Running! 🚀',
    rooms: rooms.size,
    players: playerSessions.size,
    uptime: process.uptime()
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🎮 Shader Battle Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}`);
});