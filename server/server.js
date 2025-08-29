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
    this.widgets = []; // Store active widgets
    
    // WarioWare-style queue system
    this.queue = [];
    this.currentPlayer = null;
    this.turnTimer = null;
    this.turnDuration = 45000; // 45 seconds per turn
    this.timeRemaining = 0;
    
    // Cleanup expired widgets every second
    this.widgetCleanupTimer = setInterval(() => {
      this.cleanupExpiredWidgets();
    }, 1000);
    
    // Update widget physics every 60ms (~60fps)
    this.widgetPhysicsTimer = setInterval(() => {
      this.updateWidgetPhysics();
    }, 16);
  }

  addPlayer(playerId, playerName) {
    const player = {
      id: playerId,
      name: playerName || generateRandomName(),
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

  addWidget(playerId, message, x, y) {
    // Normalize coordinates to 0-1 range
    const normalizedX = x / 1920;
    const normalizedY = y / 1080;
    
    // Get player name
    const player = this.players.get(playerId);
    const playerName = player ? player.name : 'Unknown';
    
    // Format timestamp (HH:MM)
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Format message with timestamp and name
    const formattedMessage = `${message}\n${playerName} ${timestamp}`;
    
    const widget = {
      id: `${playerId}-${Date.now()}-${Math.random()}`,
      playerId,
      message: formattedMessage || '✨',
      originalMessage: message,
      playerName,
      timestamp,
      x: normalizedX,
      y: normalizedY,
      vx: (Math.random() - 0.5) * 0.001, // More initial movement
      vy: (Math.random() - 0.5) * 0.001,
      widgetType: Math.random(), // 0-1 for different colors/styles
      createdAt: Date.now(),
      expiresAt: Date.now() + 3600000, // 1 hour lifespan
      bounce: 0.9, // Higher bounce for longer lasting fun
      size: 0.9 + Math.random() * 0.3 // Size variation
    };

    this.widgets.push(widget);
    
    // Limit total widgets to prevent memory issues (higher limit for 1 hour duration)
    if (this.widgets.length > 100) {
      this.widgets = this.widgets.slice(-100);
    }

    console.log(`🎮 Widget '${message}' added by ${playerName} at (${x}, ${y})`);
    return widget;
  }

  cleanupExpiredWidgets() {
    const now = Date.now();
    const initialCount = this.widgets.length;
    this.widgets = this.widgets.filter(widget => widget.expiresAt > now);
    
    if (this.widgets.length < initialCount) {
      console.log(`🧹 Cleaned up ${initialCount - this.widgets.length} expired widgets`);
      this.broadcastWidgetUpdate();
    }
  }
  
  updateWidgetPhysics() {
    let updated = false;
    
    for (const widget of this.widgets) {
      // Update position
      widget.x += widget.vx;
      widget.y += widget.vy;
      
      // Bounce off edges with more energy
      if (widget.x <= 0.05 || widget.x >= 0.95) {
        widget.vx *= -0.8;
        widget.x = Math.max(0.05, Math.min(0.95, widget.x));
        // Add some random energy on bounce
        widget.vx += (Math.random() - 0.5) * 0.0001;
        updated = true;
      }
      if (widget.y <= 0.05 || widget.y >= 0.95) {
        widget.vy *= -0.8;
        widget.y = Math.max(0.05, Math.min(0.95, widget.y));
        // Add some random energy on bounce
        widget.vy += (Math.random() - 0.5) * 0.0001;
        updated = true;
      }
      
      // Floating motion instead of gravity
      const time = Date.now() * 0.001;
      const floatX = Math.sin(time * 0.5 + widget.widgetType * 10) * 0.00005;
      const floatY = Math.cos(time * 0.3 + widget.widgetType * 8) * 0.00003;
      
      widget.vx += floatX;
      widget.vy += floatY;
      
      // Very light air resistance to keep movement smooth
      widget.vx *= 0.9995;
      widget.vy *= 0.9995;
      
      // Keep some minimum movement
      if (Math.abs(widget.vx) < 0.00001) widget.vx += (Math.random() - 0.5) * 0.00002;
      if (Math.abs(widget.vy) < 0.00001) widget.vy += (Math.random() - 0.5) * 0.00002;
    }
    
    // Broadcast updates more frequently for smooth movement
    if (this.widgets.length > 0 && Math.random() < 0.3) {
      this.broadcastWidgetUpdate();
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

  broadcastWidgetUpdate() {
    if (this.io && this.id) {
      this.io.to(this.id).emit('widget-update', {
        widgets: this.widgets
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
      widgets: this.widgets
    };
  }
}

// Generate random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Generate random fun names
function generateRandomName() {
  const adjectives = ['Cool', 'Epic', 'Rad', 'Wild', 'Neon', 'Cosmic', 'Pixel', 'Retro', 'Cyber', 'Glitch', 'Funky', 'Vibey', 'Chill', 'Hyper', 'Ultra', 'Mega', 'Super', 'Turbo', 'Ninja', 'Mystic'];
  const nouns = ['Cat', 'Dog', 'Fox', 'Wolf', 'Bear', 'Tiger', 'Lion', 'Eagle', 'Shark', 'Dragon', 'Phoenix', 'Robot', 'Wizard', 'Knight', 'Pirate', 'Ghost', 'Alien', 'Comet', 'Star', 'Moon'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  
  return `${adj}${noun}${num}`;
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
  
  // Handle widget creation (only current player can create)
  socket.on('create-widget', (data) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;
    
    const room = rooms.get(session.roomId);
    if (!room || room.currentPlayer !== socket.id) {
      // Only current player can create widgets
      return;
    }
    
    const { message, x, y } = data;
    
    // Validate input
    if (!message || message.length > 50) {
      return;
    }
    
    // Add widget to room
    const widget = room.addWidget(socket.id, message, x, y);
    
    // Broadcast to all players
    io.to(session.roomId).emit('widget-added', {
      widget: widget,
      addedBy: socket.id
    });
    
    // Broadcast full widget update
    room.broadcastWidgetUpdate();
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