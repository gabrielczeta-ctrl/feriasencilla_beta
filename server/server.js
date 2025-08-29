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

  addWidget(playerId, message, x, y) {
    // Normalize coordinates to 0-1 range
    const normalizedX = x / 1920;
    const normalizedY = y / 1080;
    
    const widget = {
      id: `${playerId}-${Date.now()}-${Math.random()}`,
      playerId,
      message: message || '✨',
      x: normalizedX,
      y: normalizedY,
      vx: (Math.random() - 0.5) * 0.0005, // Random velocity
      vy: (Math.random() - 0.5) * 0.0005,
      widgetType: Math.random(), // 0-1 for different colors/styles
      createdAt: Date.now(),
      expiresAt: Date.now() + 15000, // 15 seconds lifespan
      bounce: 0.8, // Bounce factor
      size: 0.8 + Math.random() * 0.4 // Size variation
    };

    this.widgets.push(widget);
    
    // Limit total widgets to prevent memory issues
    if (this.widgets.length > 50) {
      this.widgets = this.widgets.slice(-50);
    }

    console.log(`🎮 Widget '${message}' added by ${playerId} at (${x}, ${y})`);
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
      
      // Bounce off edges
      if (widget.x <= 0 || widget.x >= 1) {
        widget.vx *= -widget.bounce;
        widget.x = Math.max(0, Math.min(1, widget.x));
        updated = true;
      }
      if (widget.y <= 0 || widget.y >= 1) {
        widget.vy *= -widget.bounce;
        widget.y = Math.max(0, Math.min(1, widget.y));
        updated = true;
      }
      
      // Add some gravity
      widget.vy += 0.00001;
      
      // Slight air resistance
      widget.vx *= 0.999;
      widget.vy *= 0.999;
    }
    
    // Only broadcast if widgets actually moved significantly
    if (updated && this.widgets.length > 0 && Math.random() < 0.1) { // Throttle updates
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