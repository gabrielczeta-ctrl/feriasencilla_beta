import http from "http";
import { WebSocketServer } from "ws";
import Redis from "ioredis";
import crypto from "crypto";
import { ClaudeDM } from "./claude-dm.js";
import { UserManager } from "./userManager.js";
import { GlobalGameManager } from "./globalGameManager.js";

const PORT = process.env.PORT || 8080;
const REDIS_URL = process.env.REDIS_PUBLIC_URL || process.env.REDIS_URL || process.env.REDIS_PRIVATE_URL || "redis://localhost:6379";

console.log("🎲 D&D Platform Server Starting...");
console.log("🔍 Redis URL:", REDIS_URL.replace(/\/\/.*@/, "//***:***@"));

// Redis setup
let redis, pub, sub;
let redisConnected = false;

const hasRedis = REDIS_URL && !REDIS_URL.includes('localhost:6379');
console.log("🔍 Has Redis:", hasRedis);

// Initialize Claude DM
const claudeDM = new ClaudeDM();
console.log("🎭 Claude DM initialized");

// Initialize User Manager (will be set up after Redis connection)
let userManager;
let globalGameManager;

if (hasRedis) {
  const redisConfig = {
    lazyConnect: true,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    commandTimeout: 5000
  };
  
  redis = new Redis(REDIS_URL, redisConfig);
  pub = new Redis(REDIS_URL, redisConfig);
  sub = new Redis(REDIS_URL, redisConfig);

  try {
    console.log("🔄 Attempting Redis connection...");
    await Promise.all([redis.connect(), pub.connect(), sub.connect()]);
    await sub.subscribe("dnd:channel");
    redisConnected = true;
    console.log("✅ Redis connected successfully!");
    
    // Initialize User Manager with Redis
    userManager = new UserManager(redis);
    console.log("👤 User Manager initialized with Redis");
    
    // Initialize Global Game Manager
    globalGameManager = new GlobalGameManager(redis, userManager);
    console.log("🌍 Global Game Manager initialized with Redis");
  } catch (error) {
    console.warn("⚠️ Redis connection failed, running without persistence:");
    console.warn("   Error:", error.message);
  }
} else {
  console.log("🔄 No Redis service configured, running without persistence");
  // Initialize User Manager without Redis (in-memory fallback)
  userManager = new UserManager(null);
  console.log("👤 User Manager initialized (in-memory mode)");
  
  // Initialize Global Game Manager without Redis
  globalGameManager = new GlobalGameManager(null, userManager);
  console.log("🌍 Global Game Manager initialized (in-memory mode)");
}

// In-memory storage (fallback when Redis is not available)
const gameRooms = new Map();
const playerSessions = new Map(); // playerId -> { roomId, ws, lastSeen }
const npcInteractionTimers = new Map(); // roomId -> timer
const dmUpdateTimers = new Map(); // roomId -> timer

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ 
      ok: true, 
      redis: redisConnected,
      uptime: process.uptime(),
      type: "dnd-platform"
    }));
    return;
  }
  
  // Don't respond to /ws requests - let them be handled by the upgrade handler
  if (req.url === "/ws") {
    res.writeHead(400, { "content-type": "text/plain" });
    res.end("WebSocket endpoint - use WebSocket connection");
    return;
  }
  
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("D&D Platform WebSocket Server");
});

const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

wss.on("connection", (ws, req) => {
  clients.add(ws);
  ws.playerId = null;
  ws.roomId = 'global-server'; // All players join global server
  
  // Register client with global game manager
  if (globalGameManager) {
    globalGameManager.addClient(ws);
  }

  console.log(`👤 New connection (${clients.size} total)`);

  ws.on("close", () => {
    clients.delete(ws);
    if (ws.playerId && ws.roomId) {
      handlePlayerDisconnect(ws.playerId, ws.roomId);
      // Remove from global game manager
      if (globalGameManager) {
        globalGameManager.removePlayer(ws.playerId);
        globalGameManager.removeClient(ws);
      }
    }
    console.log(`👋 Connection closed (${clients.size} remaining)`);
  });

  ws.on("message", async (buf) => {
    let msg;
    try { 
      msg = JSON.parse(buf.toString()); 
    } catch { 
      return; 
    }

    const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

    try {
      await handleMessage(ws, msg, ip);
    } catch (error) {
      console.error("Error handling message:", error);
      ws.send(JSON.stringify({
        type: "error",
        message: "Internal server error",
        timestamp: Date.now()
      }));
    }
  });
});

async function handleMessage(ws, msg, ip) {
  // Rate limiting
  if (!rateLimit(ip, 1000)) { // 1 message per second
    return;
  }

  switch (msg.type) {
    case "register":
      await handleRegister(ws, msg);
      break;
      
    case "login":
      await handleLogin(ws, msg);
      break;
      
    case "player_connect":
      await handlePlayerConnect(ws, msg);
      break;
      
    case "create_room":
      await handleCreateRoom(ws, msg, ip);
      break;
      
    case "join_room":
      await handleJoinRoom(ws, msg);
      break;
      
    case "leave_room":
      await handleLeaveRoom(ws, msg);
      break;
      
    case "list_rooms":
      await handleListRooms(ws);
      break;
      
    case "create_character":
      await handleCreateCharacter(ws, msg, ip);
      break;
      
    case "update_character":
      await handleUpdateCharacter(ws, msg, ip);
      break;
      
    case "player_action":
      await handlePlayerAction(ws, msg, ip);
      break;
      
    case "dice_roll":
      await handleDiceRoll(ws, msg, ip);
      break;
      
    case "generate_equipment":
      await handleGenerateEquipment(ws, msg, ip);
      break;

    case "generate_loot":
      await handleGenerateLoot(ws, msg, ip);
      break;
      
    case "chat_message":
      await handleChatMessage(ws, msg, ip);
      break;
      
    case "dm_action":
      await handleDMAction(ws, msg, ip);
      break;
      
    default:
      console.warn("Unknown message type:", msg.type);
  }
}

// Authentication handlers
async function handleRegister(ws, msg) {
  if (!userManager) {
    ws.send(JSON.stringify({
      type: "register_response",
      success: false,
      message: "User management not available"
    }));
    return;
  }

  const { username, password } = msg;
  
  if (!username || !password) {
    ws.send(JSON.stringify({
      type: "register_response",
      success: false,
      message: "Username and password required"
    }));
    return;
  }

  if (username.length < 3 || password.length < 6) {
    ws.send(JSON.stringify({
      type: "register_response",
      success: false,
      message: "Username must be 3+ chars, password must be 6+ chars"
    }));
    return;
  }

  const result = await userManager.registerUser(username, password);
  
  ws.send(JSON.stringify({
    type: "register_response",
    ...result
  }));
}

async function handleLogin(ws, msg) {
  if (!userManager) {
    ws.send(JSON.stringify({
      type: "login_response",
      success: false,
      message: "User management not available"
    }));
    return;
  }

  const { username, password } = msg;
  
  if (!username || !password) {
    ws.send(JSON.stringify({
      type: "login_response",
      success: false,
      message: "Username and password required"
    }));
    return;
  }

  const result = await userManager.authenticateUser(username, password);
  
  if (result.success) {
    // Set user session on WebSocket
    ws.username = username;
    ws.sessionToken = result.sessionToken;
    ws.userCharacter = result.character;
    
    console.log(`👤 User logged in: ${username}`);
  }
  
  ws.send(JSON.stringify({
    type: "login_response",
    ...result,
    // Don't send sessionToken to client for security
    sessionToken: undefined
  }));
}

async function handlePlayerConnect(ws, msg) {
  const playerId = sanitizeString(msg.playerId) || generateId();
  // Use authenticated username if available, otherwise use provided name
  const playerName = ws.username || sanitizeString(msg.playerName) || "Anonymous";
  
  ws.playerId = playerId;
  playerSessions.set(playerId, { ws, lastSeen: Date.now() });
  
  // Retrieve user's character if authenticated
  let userCharacter = ws.userCharacter; // From login
  if (ws.username && !userCharacter && userManager) {
    console.log(`🔍 Retrieving stored character for user: ${ws.username}`);
    const characterResult = await userManager.getUserCharacter(ws.username);
    if (characterResult.success && characterResult.character) {
      userCharacter = characterResult.character;
      ws.userCharacter = userCharacter; // Cache for this session
      console.log(`✅ Character retrieved for ${ws.username}:`, userCharacter.name);
    } else {
      console.log(`ℹ️ No stored character found for ${ws.username}`);
    }
  }
  
  // Add player to global game manager
  if (globalGameManager) {
    const welcomeData = globalGameManager.addPlayer(playerId, {
      id: playerId,
      name: playerName,
      character: userCharacter,
      isAuthenticated: !!ws.username
    });
    
    ws.send(JSON.stringify({
      type: "player_connected",
      playerId,
      playerName,
      character: userCharacter || null,
      isAuthenticated: !!ws.username,
      globalRoom: welcomeData,
      timestamp: Date.now()
    }));
    return;
  }
  
  // Fallback for when global manager isn't available
  ws.send(JSON.stringify({
    type: "player_connected",
    playerId,
    playerName,
    character: userCharacter || null,
    isAuthenticated: !!ws.username,
    timestamp: Date.now()
  }));
}

async function handleCreateRoom(ws, msg, ip) {
  console.log('🏰 handleCreateRoom called with:', { playerId: ws.playerId, msg });
  
  if (!ws.playerId) {
    console.log('❌ Player not connected, rejecting room creation');
    ws.send(JSON.stringify({ type: "error", message: "Must connect first" }));
    return;
  }

  const roomData = {
    name: sanitizeString(msg.roomName, 50) || "Unnamed Campaign",
    description: sanitizeString(msg.description, 200) || "",
    dmId: msg.useAIDM ? null : ws.playerId,
    maxPlayers: Math.min(Math.max(msg.maxPlayers || 6, 2), 10),
    isPublic: msg.isPublic !== false,
    useAIDM: msg.useAIDM === true
  };

  console.log('📋 Room data prepared:', roomData);

  const roomId = generateRoomId();
  console.log('🎲 Generated room ID:', roomId);
  
  const room = createRoom(roomId, roomData);
  console.log('🏗️ Room created:', { id: room.id, name: room.name, isPublic: room.settings.isPublic });
  
  // Add creator to room
  const player = {
    id: ws.playerId,
    name: msg.playerName || "Player",
    role: roomData.dmId === ws.playerId ? "dm" : "player",
    isOnline: true,
    lastSeen: Date.now(),
    joinedAt: Date.now()
  };
  
  room.players.push(player);
  ws.roomId = roomId;
  
  console.log('👥 Player added to room:', { playerId: player.id, roomId, totalPlayers: room.players.length });
  
  // Generate campaign story with Claude immediately
  if (roomData.useAIDM) {
    console.log('🎭 Generating campaign story with Claude...');
    try {
      const storyData = await claudeDM.generateCampaignStory(roomData.description, roomData.name);
      
      // Update room with generated story
      room.gameState.story = {
        currentScene: storyData.location,
        sceneDescription: storyData.sceneDescription,
        availableActions: storyData.availableActions,
        npcs: storyData.npcs.map(npc => ({
          id: generateId(),
          name: npc.name,
          description: npc.description,
          personality: npc.personality,
          location: storyData.location
        })),
        location: storyData.location,
        questLog: [{ id: generateId(), title: "Campaign Beginning", description: storyData.questHook, status: "active" }],
        worldState: { questHook: storyData.questHook }
      };
      
      // Set room to playing phase since story is ready
      room.gameState.phase = "playing";
      room.currentScene = storyData.location;
      
      console.log('✨ Campaign story generated and room set to playing phase');
      
      // Add initial DM message
      room.gameState.chatLog.push({
        id: generateId(),
        playerId: 'system',
        playerName: 'DM',
        type: 'system',
        content: storyData.sceneDescription,
        timestamp: Date.now()
      });
      
    } catch (error) {
      console.error('❌ Failed to generate campaign story:', error);
      // Continue with basic setup if story generation fails
    }
  }
  
  // Store in Redis/memory
  await saveRoom(room);
  console.log('💾 Room saved to storage');
  
  const roomResponse = sanitizeRoomForClient(room);
  console.log('📤 Broadcasting room creation:', { roomId, roomName: room.name, isPublic: room.settings.isPublic });
  
  broadcast({
    type: "room_created",
    room: roomResponse,
    timestamp: Date.now()
  }, roomId);

  ws.send(JSON.stringify({
    type: "room_joined",
    room: roomResponse,
    player,
    timestamp: Date.now()
  }));
  
  console.log('✅ Room creation complete for:', roomId);
}

async function handleJoinRoom(ws, msg) {
  if (!ws.playerId) {
    ws.send(JSON.stringify({ type: "error", message: "Must connect first" }));
    return;
  }

  const roomId = sanitizeString(msg.roomId);
  const room = await loadRoom(roomId);
  
  if (!room) {
    ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
    return;
  }
  
  if (room.players.length >= room.maxPlayers) {
    ws.send(JSON.stringify({ type: "error", message: "Room is full" }));
    return;
  }
  
  // Check if player already in room
  let player = room.players.find(p => p.id === ws.playerId);
  if (player) {
    player.isOnline = true;
    player.lastSeen = Date.now();
  } else {
    player = {
      id: ws.playerId,
      name: msg.playerName || "Player",
      role: "player",
      isOnline: true,
      lastSeen: Date.now(),
      joinedAt: Date.now()
    };
    room.players.push(player);
  }
  
  ws.roomId = roomId;
  room.lastActivity = Date.now();
  
  await saveRoom(room);
  
  broadcast({
    type: "player_joined",
    player,
    room: sanitizeRoomForClient(room),
    timestamp: Date.now()
  }, roomId);
}

async function handleLeaveRoom(ws, msg) {
  if (!ws.roomId) return;
  
  const room = await loadRoom(ws.roomId);
  if (!room) return;
  
  room.players = room.players.filter(p => p.id !== ws.playerId);
  
  // If DM left, promote someone or enable AI
  if (room.dmId === ws.playerId && room.players.length > 0) {
    const newDM = room.players[0];
    newDM.role = "dm";
    room.dmId = newDM.id;
  }
  
  ws.roomId = null;
  await saveRoom(room);
  
  broadcast({
    type: "player_left",
    playerId: ws.playerId,
    room: sanitizeRoomForClient(room),
    timestamp: Date.now()
  }, room.id);
}

async function handleListRooms(ws) {
  console.log('📋 handleListRooms called by player:', ws.playerId);
  const publicRooms = await getPublicRooms();
  console.log('🏠 Found public rooms:', publicRooms.length, publicRooms.map(r => ({ id: r.id, name: r.name, isPublic: r.settings.isPublic })));
  
  const roomsList = publicRooms.map(sanitizeRoomForClient);
  console.log('📤 Sending rooms list:', roomsList.length, 'rooms');
  
  ws.send(JSON.stringify({
    type: "rooms_list",
    rooms: roomsList,
    timestamp: Date.now()
  }));
}

async function handleCreateCharacter(ws, msg, ip) {
  if (!msg.character) {
    console.log('❌ No character data provided');
    return;
  }
  
  console.log('🎭 Creating character for player:', ws.playerId, 'in room:', ws.roomId || 'global');
  
  // Validate and sanitize character data
  const character = sanitizeCharacter(msg.character);
  character.id = generateId();
  character.playerId = ws.playerId;
  character.createdAt = Date.now();
  
  // Handle room-based character creation
  if (ws.roomId) {
    const room = await loadRoom(ws.roomId);
    if (!room) {
      console.log('❌ Room not found:', ws.roomId);
      return;
    }
    
    const player = room.players.find(p => p.id === ws.playerId);
    if (!player) {
      console.log('❌ Player not found in room:', ws.playerId);
      return;
    }
    
    player.character = character;
    player.characterId = character.id;
    
    room.lastActivity = Date.now();
    await saveRoom(room);
    console.log('✅ Character saved to room:', room.name);
  } else {
    // Handle global game character creation
    console.log('🌍 Creating character for global game');
    if (globalGameManager) {
      globalGameManager.updatePlayerCharacter(ws.playerId, character);
      console.log('✅ Character registered with global game manager');
    }
  }
  
  // Save character to user profile if authenticated
  if (ws.username && userManager) {
    try {
      await userManager.saveUserCharacter(ws.username, character);
      ws.userCharacter = character;
      console.log(`💾 Character saved for user: ${ws.username}`);
    } catch (error) {
      console.error(`❌ Failed to save character for user ${ws.username}:`, error);
    }
  }
  
  broadcast({
    type: "character_created",
    playerId: ws.playerId,
    character,
    timestamp: Date.now()
  }, ws.roomId);
  
  // Check if all players have characters
  const playersWithCharacters = room.players.filter(p => p.role === "player" && p.character).length;
  const totalPlayers = room.players.filter(p => p.role === "player").length;
  
  if (playersWithCharacters === totalPlayers && room.gameState.phase === "character_creation") {
    room.gameState.phase = "playing";
    room.gameState.story.currentScene = "tavern";
    room.gameState.story.sceneDescription = "You find yourselves in a cozy tavern called 'The Prancing Pony'...";
    
    await saveRoom(room);
    
    broadcast({
      type: "game_started",
      room: sanitizeRoomForClient(room),
      timestamp: Date.now()
    }, ws.roomId);
  }
}

async function handleUpdateCharacter(ws, msg, ip) {
  if (!ws.roomId || !msg.character) return;
  
  const room = await loadRoom(ws.roomId);
  if (!room) return;
  
  const player = room.players.find(p => p.id === ws.playerId);
  if (!player || !player.character) return;
  
  // Validate and sanitize character data
  const updatedCharacter = sanitizeCharacter(msg.character);
  updatedCharacter.id = player.character.id; // Keep original ID
  updatedCharacter.playerId = ws.playerId;
  updatedCharacter.createdAt = player.character.createdAt; // Keep original creation time
  
  player.character = updatedCharacter;
  
  room.lastActivity = Date.now();
  await saveRoom(room);
  
  broadcast({
    type: "character_updated",
    playerId: ws.playerId,
    character: updatedCharacter,
    timestamp: Date.now()
  }, ws.roomId);
  
  console.log(`🔄 ${player.name} updated character: ${updatedCharacter.name} (HP: ${updatedCharacter.hitPoints?.current}/${updatedCharacter.hitPoints?.maximum})`);
}

async function handlePlayerAction(ws, msg, ip) {
  if (!globalGameManager || !ws.playerId || !msg.action) {
    ws.send(JSON.stringify({
      type: "action_error",
      message: "Global server not available or invalid action"
    }));
    return;
  }
  
  const action = sanitizeString(msg.action, 500);
  
  // Submit action to global game manager
  const result = globalGameManager.addPlayerAction(ws.playerId, action);
  
  if (result.success) {
    ws.send(JSON.stringify({
      type: "action_submitted",
      message: "Action queued for next DM update",
      action: action,
      timestamp: Date.now()
    }));
  } else {
    ws.send(JSON.stringify({
      type: "action_error",
      message: result.message,
      timestamp: Date.now()
    }));
  }
}

async function handleDiceRoll(ws, msg, ip) {
  if (!ws.roomId || !msg.expression) return;
  
  const room = await loadRoom(ws.roomId);
  if (!room) return;
  
  const player = room.players.find(p => p.id === ws.playerId);
  if (!player) return;
  
  const diceResult = parseDiceExpression(msg.expression);
  if (!diceResult.valid) {
    ws.send(JSON.stringify({ type: "error", message: "Invalid dice expression" }));
    return;
  }
  
  const roll = {
    id: generateId(),
    playerId: ws.playerId,
    playerName: player.character?.name || player.name,
    expression: msg.expression,
    results: diceResult.rolls,
    total: diceResult.total,
    type: msg.rollType || "custom",
    description: sanitizeString(msg.description, 100),
    timestamp: Date.now()
  };
  
  room.gameState.dice.push(roll);
  room.lastActivity = Date.now();
  await saveRoom(room);
  
  broadcast({
    type: "dice_rolled",
    roll,
    timestamp: Date.now()
  }, ws.roomId);
}

async function handleChatMessage(ws, msg, ip) {
  if (!ws.roomId || !msg.message) return;
  
  const room = await loadRoom(ws.roomId);
  if (!room) return;
  
  const player = room.players.find(p => p.id === ws.playerId);
  if (!player) return;
  
  const chatMessage = {
    id: generateId(),
    playerId: ws.playerId,
    playerName: player.character?.name || player.name,
    type: msg.messageType || "chat",
    content: sanitizeString(msg.message, 1000),
    timestamp: Date.now()
  };
  
  room.gameState.chatLog.push(chatMessage);
  
  // Keep only last 100 messages
  if (room.gameState.chatLog.length > 100) {
    room.gameState.chatLog = room.gameState.chatLog.slice(-100);
  }
  
  room.lastActivity = Date.now();
  await saveRoom(room);
  
  broadcast({
    type: "chat_message",
    message: chatMessage,
    timestamp: Date.now()
  }, ws.roomId);
}

// Helper functions
async function processAIAction(room, character, action, actingPlayer) {
  try {
    const context = {
      playerInput: action,
      currentScene: room.currentScene,
      players: room.players.map(p => p.character).filter(Boolean),
      gameState: room.gameState,
      roomId: room.id,
      actingPlayer: actingPlayer,
      recentActions: room.gameState.chatLog.slice(-5).map(msg => msg.content)
    };

    console.log(`🎲 Claude processing action for ${character.name}: "${action}"`);
    const response = await claudeDM.processPlayerAction(context);
    
    // If Claude doesn't provide a response (validation failed or API unavailable), don't send anything
    if (!response) {
      console.log('⏸️ No DM response - action validation failed or API unavailable');
      return;
    }
    
    // Handle automatic dice rolling if Claude requests it
    let diceResults = null;
    let finalResponse = response;
    
    if (response.diceRoll?.required) {
      console.log(`🎲 Rolling ${response.diceRoll.dice} for ${response.diceRoll.type} (DC ${response.diceRoll.difficulty})`);
      
      diceResults = rollDiceExpression(response.diceRoll.dice);
      const success = diceResults.total >= response.diceRoll.difficulty;
      
      // Send dice results back to Claude for better narrative integration
      try {
        const diceContext = {
          ...context,
          diceResult: {
            roll: diceResults.total,
            success: success,
            difficulty: response.diceRoll.difficulty,
            type: response.diceRoll.type
          },
          originalAction: action,
          originalNarration: response.narration
        };
        
        console.log(`🎭 Claude incorporating dice result: ${diceResults.total} (${success ? 'SUCCESS' : 'FAILURE'})`);
        finalResponse = await claudeDM.incorporateDiceResult(diceContext);
      } catch (error) {
        console.warn('⚠️ Failed to incorporate dice result, using original response');
      }
      
      // Add dice roll to game state
      const diceRoll = {
        id: generateId(),
        playerId: actingPlayer.id,
        playerName: character.name,
        expression: response.diceRoll.dice,
        results: diceResults.rolls,
        total: diceResults.total,
        type: response.diceRoll.type,
        difficulty: response.diceRoll.difficulty,
        success: success,
        timestamp: Date.now()
      };
      
      room.gameState.dice.push(diceRoll);
      
      // Broadcast dice roll
      broadcast({
        type: "dice_rolled",
        roll: diceRoll,
        timestamp: Date.now()
      }, room.id);
      
      console.log(`🎲 ${character.name} rolled ${diceResults.total} vs DC ${response.diceRoll.difficulty}: ${success ? 'SUCCESS' : 'FAILURE'}`);
    }
    
    // Update room state if Claude provided scene updates (use finalResponse)
    if (finalResponse.sceneUpdate) {
      if (finalResponse.sceneUpdate.location && finalResponse.sceneUpdate.location !== room.gameState.story.location) {
        room.gameState.story.location = finalResponse.sceneUpdate.location;
        room.currentScene = finalResponse.sceneUpdate.location;
        console.log(`🌍 Scene changed to: ${finalResponse.sceneUpdate.location}`);
      }
      if (finalResponse.sceneUpdate.description) {
        room.gameState.story.sceneDescription = finalResponse.sceneUpdate.description;
      }
      if (finalResponse.sceneUpdate.availableActions) {
        room.gameState.story.availableActions = finalResponse.sceneUpdate.availableActions;
      }
      
      // Update NPCs if there are new developments
      if (finalResponse.sceneUpdate.newDevelopment) {
        console.log(`📖 Story development: ${finalResponse.sceneUpdate.newDevelopment}`);
      }
    }

    // Handle NPC responses (updated structure) - use finalResponse
    if (finalResponse.npcResponse) {
      setTimeout(() => {
        const npcMessage = {
          id: generateId(),
          playerId: 'npc',
          playerName: finalResponse.npcResponse.npcName,
          type: 'chat',
          content: finalResponse.npcResponse.dialogue,
          timestamp: Date.now()
        };
        
        room.gameState.chatLog.push(npcMessage);
        saveRoom(room);
        
        broadcast({
          type: "chat_message",
          message: npcMessage,
          timestamp: Date.now()
        }, room.id);
        
        console.log(`💬 NPC ${finalResponse.npcResponse.npcName}: "${finalResponse.npcResponse.dialogue}"`);
      }, 1500); // Delay for realism
    }

    // Handle consequences
    if (finalResponse.consequences) {
      if (finalResponse.consequences.immediate) {
        console.log(`⚡ Immediate consequence: ${finalResponse.consequences.immediate}`);
      }
      if (finalResponse.consequences.ongoing) {
        console.log(`📝 Ongoing consequence: ${finalResponse.consequences.ongoing}`);
        // Store ongoing consequences in world state
        if (!room.gameState.story.worldState.consequences) {
          room.gameState.story.worldState.consequences = [];
        }
        room.gameState.story.worldState.consequences.push({
          action: action,
          consequence: finalResponse.consequences.ongoing,
          timestamp: Date.now()
        });
      }
    }

    // Use the final response narration (which should already include dice results)
    return finalResponse.narration || `${character.name} ${action}. The adventure continues...`;
    
  } catch (error) {
    console.error('❌ Claude processing error:', error);
    return `As ${character.name} ${action}, something interesting happens... (The DM seems distracted for a moment)`;
  }
}

// Helper function to roll dice expressions
function rollDiceExpression(expression) {
  const match = expression.match(/(\d+)d(\d+)([+-]\d+)?/);
  if (!match) return { rolls: [1], total: 1 };
  
  const numDice = parseInt(match[1]);
  const dieSize = parseInt(match[2]);
  const modifier = parseInt(match[3] || '0');
  
  const rolls = [];
  for (let i = 0; i < Math.min(numDice, 10); i++) {
    rolls.push(Math.floor(Math.random() * dieSize) + 1);
  }
  
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier;
  return { rolls, total };
}

function parseDiceExpression(expression) {
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

// Generate equipment for character using Claude AI
async function handleGenerateEquipment(ws, msg, ip) {
  if (!ws.playerId) {
    ws.send(JSON.stringify({
      type: "error",
      message: "Not authenticated"
    }));
    return;
  }

  try {
    console.log(`🎒 Generating equipment for character: ${msg.character?.name || 'Unknown'}`);
    
    const equipment = await claudeDM.generateCharacterEquipment(msg.character);
    
    ws.send(JSON.stringify({
      type: "equipment_generated",
      equipment: equipment,
      timestamp: Date.now()
    }));

    console.log(`✅ Equipment generated for ${msg.character?.name}: ${equipment.weapons?.length || 0} weapons, ${equipment.armor?.length || 0} armor pieces`);

  } catch (error) {
    console.error('❌ Equipment generation error:', error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to generate equipment"
    }));
  }
}

// Generate contextual loot using Claude AI  
async function handleGenerateLoot(ws, msg, ip) {
  if (!ws.playerId) {
    ws.send(JSON.stringify({
      type: "error", 
      message: "Not authenticated"
    }));
    return;
  }

  try {
    console.log(`💰 Generating loot for context: ${msg.context?.currentScene || 'Unknown'}`);
    
    const loot = await claudeDM.generateLoot(msg.context, msg.difficulty || 'normal');
    
    // Broadcast loot to all players in the session
    if (globalGameManager) {
      globalGameManager.broadcastToAll({
        type: "loot_generated",
        loot: loot,
        context: msg.context,
        difficulty: msg.difficulty || 'normal',
        timestamp: Date.now()
      });
    } else {
      ws.send(JSON.stringify({
        type: "loot_generated", 
        loot: loot,
        timestamp: Date.now()
      }));
    }

    console.log(`✅ Loot generated: ${loot.currency?.gold || 0} gold, ${loot.equipment?.length || 0} items`);

  } catch (error) {
    console.error('❌ Loot generation error:', error);
    ws.send(JSON.stringify({
      type: "error",
      message: "Failed to generate loot"
    }));
  }
}

function createRoom(roomId, roomData) {
  return {
    id: roomId,
    name: roomData.name,
    description: roomData.description,
    dmId: roomData.dmId,
    players: [],
    maxPlayers: roomData.maxPlayers,
    currentScene: "Character Creation",
    gameState: {
      phase: "character_creation",
      turnOrder: [],
      initiative: {},
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
      isPublic: roomData.isPublic,
      allowSpectators: true,
      autoRollInitiative: true,
      useAIDM: roomData.useAIDM,
      difficultyLevel: "normal",
      rulesSet: "5e",
      chatSettings: {
        allowOOC: true,
        logDice: true,
        showRolls: true
      }
    },
    createdAt: Date.now(),
    lastActivity: Date.now()
  };
}

async function saveRoom(room) {
  if (redisConnected && redis) {
    try {
      await redis.set(`room:${room.id}`, JSON.stringify(room), "EX", 24 * 60 * 60); // 24 hours
      await redis.zadd("rooms:active", room.lastActivity, room.id);
    } catch (error) {
      console.warn("Redis save room failed:", error.message);
    }
  } else {
    gameRooms.set(room.id, room);
  }
}

async function loadRoom(roomId) {
  if (redisConnected && redis) {
    try {
      const roomData = await redis.get(`room:${roomId}`);
      return roomData ? JSON.parse(roomData) : null;
    } catch (error) {
      console.warn("Redis load room failed:", error.message);
      return null;
    }
  } else {
    return gameRooms.get(roomId) || null;
  }
}

async function getPublicRooms() {
  console.log('🔍 getPublicRooms called, redisConnected:', redisConnected);
  
  if (redisConnected && redis) {
    try {
      const roomIds = await redis.zrevrange("rooms:active", 0, 19); // Last 20 active rooms
      console.log('🗂️ Redis room IDs found:', roomIds.length);
      const rooms = [];
      
      for (const roomId of roomIds) {
        const roomData = await redis.get(`room:${roomId}`);
        if (roomData) {
          const room = JSON.parse(roomData);
          console.log('📖 Loaded room from Redis:', { id: room.id, name: room.name, isPublic: room.settings.isPublic });
          if (room.settings.isPublic) {
            rooms.push(room);
          }
        }
      }
      
      console.log('🏠 Redis public rooms returned:', rooms.length);
      return rooms;
    } catch (error) {
      console.warn("Redis get public rooms failed:", error.message);
      return [];
    }
  } else {
    console.log('💾 Using in-memory storage, total rooms:', gameRooms.size);
    const allRooms = Array.from(gameRooms.values());
    console.log('📂 All in-memory rooms:', allRooms.map(r => ({ id: r.id, name: r.name, isPublic: r.settings.isPublic })));
    
    const publicRooms = allRooms
      .filter(room => room.settings.isPublic)
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, 20);
      
    console.log('🏠 In-memory public rooms returned:', publicRooms.length);
    return publicRooms;
  }
}

function sanitizeRoomForClient(room) {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    dmId: room.dmId,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      role: p.role,
      isOnline: p.isOnline,
      lastSeen: p.lastSeen,
      joinedAt: p.joinedAt,
      characterId: p.characterId,
      character: p.character
    })),
    maxPlayers: room.maxPlayers,
    currentScene: room.currentScene,
    gameState: room.gameState, // Send the full gameState object
    settings: room.settings, // Send the full settings object
    createdAt: room.createdAt,
    lastActivity: room.lastActivity
  };
}

function sanitizeCharacter(character) {
  return {
    name: sanitizeString(character.name, 50) || "Unnamed Character",
    race: sanitizeString(character.race, 30) || "Human",
    class: sanitizeString(character.class, 30) || "Fighter",
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
    backstory: sanitizeString(character.backstory, 1000) || "",
    equipment: []
  };
}

function broadcast(message, roomId = null) {
  const data = JSON.stringify(message);
  
  if (roomId) {
    // Broadcast to specific room
    for (const ws of clients) {
      if (ws.roomId === roomId && ws.readyState === 1) {
        ws.send(data);
      }
    }
  } else {
    // Broadcast to all
    for (const ws of clients) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }
}

function handlePlayerDisconnect(playerId, roomId) {
  const session = playerSessions.get(playerId);
  if (session) {
    session.lastSeen = Date.now();
  }
  
  broadcast({
    type: "player_disconnected",
    playerId,
    timestamp: Date.now()
  }, roomId);
}

const lastAction = new Map();
function rateLimit(ip, minMs = 1000) {
  const prev = lastAction.get(ip) || 0;
  const now = Date.now();
  if (now - prev < minMs) return false;
  lastAction.set(ip, now);
  return true;
}

function sanitizeString(str, maxLength = 255) {
  if (!str || typeof str !== "string") return "";
  return str.trim().slice(0, maxLength);
}

function generateId() {
  return crypto.randomUUID();
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Schedule timed NPC interactions
function scheduleNPCInteraction(roomId) {
  // Clear existing timer for this room
  if (npcInteractionTimers.has(roomId)) {
    clearTimeout(npcInteractionTimers.get(roomId));
  }
  
  // Schedule NPC interaction in 20-45 seconds
  const delay = Math.random() * 25000 + 20000; // 20-45 seconds
  
  const timer = setTimeout(async () => {
    try {
      const room = await loadRoom(roomId);
      if (!room || room.gameState.phase !== 'playing') return;
      
      // Generate NPC interaction
      const npcResponse = await generateNPCInteraction(room);
      if (npcResponse) {
        // Add NPC message to chat
        const npcMessage = {
          id: generateId(),
          playerId: 'npc',
          playerName: npcResponse.npcName,
          type: 'action',
          content: npcResponse.dialogue,
          timestamp: Date.now()
        };
        
        room.gameState.chatLog.push(npcMessage);
        room.lastActivity = Date.now();
        await saveRoom(room);
        
        // Broadcast NPC interaction
        broadcast({
          type: 'chat_message',
          message: npcMessage,
          timestamp: Date.now()
        }, roomId);
        
        console.log(`🎭 NPC interaction in room ${roomId}: ${npcResponse.npcName} - ${npcResponse.dialogue.slice(0, 50)}...`);
        
        // Schedule another interaction
        scheduleNPCInteraction(roomId);
      }
    } catch (error) {
      console.error('❌ Error in NPC interaction:', error);
    }
  }, delay);
  
  npcInteractionTimers.set(roomId, timer);
}

// Generate NPC interactions
async function generateNPCInteraction(room) {
  try {
    // Simple fallback NPC interactions
    const fallbackInteractions = [
      { npcName: "Tavern Keeper", dialogue: "*wipes down glasses and glances at the adventurers*" },
      { npcName: "Local Patron", dialogue: "*whispers something to their companion and looks around nervously*" },
      { npcName: "Town Guard", dialogue: "*adjusts their armor and patrols the area*" },
      { npcName: "Mysterious Stranger", dialogue: "*pulls their hood lower and studies the party from the shadows*" },
      { npcName: "Village Elder", dialogue: "*strokes their beard thoughtfully while watching the events unfold*" }
    ];
    
    // Use existing NPCs if available, otherwise use fallback
    const availableNPCs = room.gameState.story?.npcs?.length > 0 
      ? room.gameState.story.npcs.map(npc => ({ npcName: npc.name, dialogue: `*${npc.name} ${this.getNPCAction(npc)}*` }))
      : fallbackInteractions;
    
    const randomNPC = availableNPCs[Math.floor(Math.random() * availableNPCs.length)];
    
    return randomNPC;
  } catch (error) {
    console.error('❌ NPC interaction generation failed:', error);
    return null;
  }
}

function getNPCAction(npc) {
  const actions = [
    "looks around the room curiously",
    "adjusts their belongings", 
    "mutters something under their breath",
    "glances at the adventuring party",
    "continues with their daily routine",
    "pauses in their work to listen",
    "shifts uncomfortably",
    "nods approvingly at the proceedings"
  ];
  return actions[Math.floor(Math.random() * actions.length)];
}

// Schedule DM story updates
function scheduleDMUpdate(roomId) {
  // Clear existing timer for this room
  if (dmUpdateTimers.has(roomId)) {
    clearTimeout(dmUpdateTimers.get(roomId));
  }
  
  // Schedule DM update in 2-4 minutes
  const delay = Math.random() * 120000 + 120000; // 2-4 minutes
  
  const timer = setTimeout(async () => {
    try {
      const room = await loadRoom(roomId);
      if (!room || room.gameState.phase !== 'playing') return;
      
      // Generate DM story update
      const dmUpdate = await generateDMUpdate(room);
      if (dmUpdate) {
        // Add DM message to chat
        const dmMessage = {
          id: generateId(),
          playerId: 'dm',
          playerName: 'DM',
          type: 'system',
          content: dmUpdate.narration,
          timestamp: Date.now()
        };
        
        room.gameState.chatLog.push(dmMessage);
        room.lastActivity = Date.now();
        
        // Update scene if provided
        if (dmUpdate.sceneUpdate) {
          if (dmUpdate.sceneUpdate.description) {
            room.gameState.story.sceneDescription = dmUpdate.sceneUpdate.description;
          }
          if (dmUpdate.sceneUpdate.availableActions) {
            room.gameState.story.availableActions = dmUpdate.sceneUpdate.availableActions;
          }
        }
        
        await saveRoom(room);
        
        // Broadcast DM update
        broadcast({
          type: 'chat_message',
          message: dmMessage,
          timestamp: Date.now()
        }, roomId);
        
        console.log(`📜 DM story update in room ${roomId}: ${dmUpdate.narration.slice(0, 50)}...`);
        
        // Schedule another update
        scheduleDMUpdate(roomId);
      }
    } catch (error) {
      console.error('❌ Error in DM update:', error);
    }
  }, delay);
  
  dmUpdateTimers.set(roomId, timer);
}

// Generate DM story updates
async function generateDMUpdate(room) {
  try {
    const storyUpdates = [
      {
        narration: "The atmosphere grows tense as dark clouds gather outside. Something feels different about this place...",
        sceneUpdate: { availableActions: ["Investigate the tension", "Look outside", "Ask locals about the change", "Prepare for trouble"] }
      },
      {
        narration: "A distant sound echoes through the area - perhaps opportunity, perhaps danger approaching.",
        sceneUpdate: { availableActions: ["Listen carefully", "Investigate the sound", "Alert your companions", "Hide and observe"] }
      },
      {
        narration: "The local patrons seem to be whispering about something important. Their hushed conversations might hold valuable information.",
        sceneUpdate: { availableActions: ["Eavesdrop on conversations", "Approach the group", "Buy drinks to loosen tongues", "Ask the bartender"] }
      },
      {
        narration: "Time passes, and the world continues to turn. New opportunities and challenges await those bold enough to seek them.",
        sceneUpdate: { availableActions: ["Explore the surroundings", "Seek out adventure", "Talk to locals", "Plan your next move"] }
      },
      {
        narration: "A sense of anticipation fills the air. Events are in motion, and choices made now could have lasting consequences.",
        sceneUpdate: { availableActions: ["Make a bold move", "Proceed cautiously", "Gather more information", "Rally your companions"] }
      }
    ];
    
    return storyUpdates[Math.floor(Math.random() * storyUpdates.length)];
  } catch (error) {
    console.error('❌ DM update generation failed:', error);
    return null;
  }
}

// Redis pubsub → fan out to WS clients (if Redis connected)
if (redisConnected && sub) {
  sub.on("message", (_, raw) => {
    try { 
      broadcast(JSON.parse(raw)); 
    } catch {}
  });
}

server.on("upgrade", (req, socket, head) => {
  if (new URL(req.url, "http://x").pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(PORT, () => {
  console.log("🎲 D&D Platform WebSocket Server running on port " + PORT);
  console.log("🚀 Ready for epic adventures!");
});