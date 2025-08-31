# Partywall - Multiplayer Physics Canvas

A real-time multiplayer physics-based drawing canvas built with Love2D and Lua, featuring advanced Box2D physics, particle systems, and WebSocket networking.

## Features

🎨 **Advanced Drawing System**
- Multiple drawing tools (pen, brush, eraser, marker, message)
- Smooth Catmull-Rom spline rendering with pressure sensitivity
- Real-time stroke collision generation for physics interaction
- Automatic stroke expiration (1 hour) with cleanup

⚡ **High-Performance Physics**
- Native Box2D integration with 120 Hz fixed timestep
- Dynamic message bodies with realistic physics properties
- Drawing-to-physics collision generation
- Object throwing with drag-and-release mechanics
- Boundary collision detection with configurable bounce

🌐 **Multiplayer Networking**
- WebSocket client with automatic reconnection
- Message batching and queuing for performance
- Exponential backoff reconnection strategy
- Network statistics and monitoring
- Real-time state synchronization

✨ **Visual Effects**
- Hardware-accelerated particle system
- Multiple effect types (bounce, collision, throw, drawing)
- Additive blending for glowing effects
- Trail particles and dynamic animations

🎵 **Immersive Audio**
- Spatial audio with distance calculations
- Dynamic sound effects for all interactions
- Audio pools for performance optimization
- Velocity-based sound scaling
- Ambient music system

📱 **Advanced UI System**
- Context menus with physics controls
- Drawing tools panel with color palette
- Responsive design with camera system
- Smooth panning, zooming, and screen shake
- Debug visualization toggles

## System Requirements

- **Love2D 11.4+** (Download from [love2d.org](https://love2d.org/))
- **Operating System**: Windows 10+, macOS 10.12+, Ubuntu 18.04+
- **RAM**: 4 GB minimum, 8 GB recommended
- **Graphics**: OpenGL 3.0+ support
- **Network**: Internet connection for multiplayer features

## Installation

### Quick Start
1. Install Love2D from [love2d.org](https://love2d.org/)
2. Clone or download this repository
3. Run the game:
   ```bash
   # Method 1: Drag folder onto Love2D executable
   # Method 2: Command line
   love partywall_love2d/
   ```

### Development Setup
```bash
# Clone the repository
git clone <repository-url>
cd partywall_love2d

# Install Love2D (Ubuntu/Debian)
sudo apt-get install love

# Install Love2D (macOS with Homebrew)
brew install love

# Run in development mode
love .
```

## Controls

### Drawing
- **Left Mouse**: Draw with current tool
- **Right Mouse**: Open context menu
- **Mouse Wheel**: Zoom in/out
- **Middle Mouse + Drag**: Pan camera

### Tools (Keyboard Shortcuts)
- **1**: Pen tool
- **2**: Brush tool
- **3**: Eraser tool
- **4**: Marker tool
- **5**: Message tool

### Physics
- **Right Click Object**: Toggle physics, throw object, configure properties
- **Drag + Release**: Throw objects with momentum
- **Ctrl + Click**: Move objects without physics

### System
- **F1**: Toggle UI visibility
- **F2**: Toggle debug visualization
- **F3**: Toggle physics debug rendering
- **ESC**: Exit application

## Architecture

### Core Systems

#### Physics System (`src/physics.lua`)
- Box2D world simulation with 120 Hz timestep
- Dynamic body creation for messages and objects
- Static collision generation for drawing strokes
- Contact callbacks for collision detection
- Configurable gravity, damping, and restitution

#### Drawing System (`src/drawing.lua`)
- Multi-tool rendering with different brush behaviors
- Smooth curve interpolation using Catmull-Rom splines
- Real-time collision mesh generation from strokes
- Stroke bounds calculation for spatial optimization
- Automatic expiration and cleanup system

#### Networking (`src/network.lua`)
- WebSocket client with JSON message protocol
- Automatic reconnection with exponential backoff
- Message queuing and batching for performance
- Heartbeat system for connection monitoring
- Network statistics and latency measurement

#### Particle System (`src/particles.lua`)
- Object pooling for 1000+ concurrent particles
- Hardware-accelerated rendering with additive blending
- Multiple effect types with configurable parameters
- Trail particles and physics-based motion
- Dynamic lifetime and fade management

#### Audio System (`src/audio.lua`)
- Spatial audio with distance-based volume
- Dynamic sound effect generation for development
- Audio source pooling for performance
- Velocity-based pitch and volume scaling
- Ambient music system with fade transitions

### File Structure
```
partywall_love2d/
├── main.lua              # Main game loop and system integration
├── conf.lua              # Love2D configuration
├── src/
│   ├── physics.lua       # Box2D physics system
│   ├── drawing.lua       # Multi-tool drawing system
│   ├── network.lua       # WebSocket networking
│   ├── particles.lua     # Particle effects system
│   ├── audio.lua         # Spatial audio system
│   ├── ui.lua           # User interface system
│   ├── camera.lua       # Camera and viewport management
│   └── gamestate.lua    # Game state management
├── assets/
│   ├── fonts/           # UI fonts
│   ├── sfx/            # Sound effects (generated)
│   └── music/          # Background music (generated)
└── README.md
```

## Configuration

### Physics Settings
```lua
-- In main.lua or physics configuration
physics.gravity = 400        -- Pixels per second squared
physics.timestep = 1/120     -- Fixed timestep for consistency
physics.restitution = 0.8    -- Bounce factor (0-1)
physics.friction = 0.5       -- Surface friction
physics.damping = 0.95       -- Air resistance
```

### Network Settings
```lua
-- WebSocket server configuration
serverUrl = "ws://localhost:8080/ws"
reconnectAttempts = 10
batchInterval = 0.1          -- Message batching (seconds)
heartbeatInterval = 30       -- Connection heartbeat (seconds)
```

### Audio Settings
```lua
-- Volume levels (0.0 - 1.0)
audio.masterVolume = 0.7
audio.sfxVolume = 0.8
audio.musicVolume = 0.5
audio.spatialAudio = true
audio.maxDistance = 1000     -- Spatial audio range
```

## Server Integration

The Love2D client connects to a WebSocket server for multiplayer functionality. Expected message protocol:

```json
// Drawing stroke
{
  "type": "drawing_stroke",
  "data": {
    "id": "stroke_123",
    "tool": "pen",
    "color": [1, 0, 0, 1],
    "size": 5,
    "points": [[x1, y1], [x2, y2], ...],
    "timestamp": 1234567890,
    "expireAt": 1234571490
  }
}

// Message creation
{
  "type": "post_message",
  "data": {
    "text": "Hello World!",
    "x": 100,
    "y": 200,
    "physics": {"bouncing": true}
  }
}

// Object physics update
{
  "type": "object_update",
  "data": {
    "objectId": "msg_123",
    "updates": {"x": 150, "y": 250, "angle": 0.5}
  }
}
```

## Performance Optimization

### Drawing Performance
- Stroke bounds calculation for culling off-screen elements
- Automatic cleanup of expired strokes
- Efficient collision mesh generation
- Catmull-Rom spline optimization for smooth curves

### Physics Performance
- Fixed timestep simulation (120 Hz) with frame interpolation
- Spatial partitioning for collision detection
- Dynamic body sleeping for inactive objects
- Efficient contact filtering and callbacks

### Rendering Performance
- Additive blending for particle effects
- Object pooling for particles (1000+ concurrent)
- Viewport culling for off-screen objects
- Hardware-accelerated graphics operations

### Memory Management
- Automatic cleanup of expired objects
- Audio source pooling to prevent memory leaks
- Particle system recycling
- Efficient Lua table management

## Troubleshooting

### Common Issues

**Game won't start**
- Ensure Love2D 11.4+ is installed
- Check that all files are in the correct directory structure
- Verify `main.lua` is in the root directory

**Physics not working**
- Check Box2D module is enabled in `conf.lua`
- Verify physics world is created and updated
- Check collision detection callbacks

**Network connection fails**
- Ensure WebSocket server is running on specified port
- Check firewall settings
- Verify server URL in network configuration

**Audio issues**
- Audio files are generated as placeholders
- Check Love2D audio modules are enabled
- Verify system audio output is working

**Performance issues**
- Reduce particle count in effects configuration
- Lower physics timestep if needed
- Disable spatial audio on lower-end systems
- Reduce drawing collision detail

### Debug Features
- **F2**: Enable debug visualization to see collision shapes
- **F3**: Show physics debug rendering with Box2D shapes
- Console output shows system status and performance metrics
- Network statistics available in debug mode

## Development

### Adding New Tools
1. Add tool configuration to `drawing.lua`
2. Implement tool behavior in drawing system
3. Add UI button in `ui.lua`
4. Configure audio feedback in `audio.lua`

### Custom Particle Effects
1. Define effect parameters in `particles.lua`
2. Add trigger methods for game events
3. Configure visual properties and behaviors
4. Integrate with physics system if needed

### Network Protocol Extensions
1. Add message handlers in `network.lua`
2. Implement server-side message processing
3. Update client-side callback systems
4. Test synchronization across clients

## License

This project is part of the Partywall multiplayer canvas system.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly across platforms
5. Submit a pull request

For questions or support, please open an issue in the repository.