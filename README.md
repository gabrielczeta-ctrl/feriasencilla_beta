# D&D Platform - AI-Powered Tabletop RPG

A revolutionary multiplayer D&D platform with AI Dungeon Master, real-time gameplay, character management, and intelligent storytelling. Built with Next.js, WebSockets, and advanced game mechanics.

## ✨ Features

### 🎲 **Core Gameplay**
- **AI Dungeon Master**: Intelligent storytelling and encounter management
- **Real-time Multiplayer**: Join campaigns with friends instantly
- **Character Creation**: Full D&D 5e character sheet with point-buy system
- **Dice Rolling System**: Comprehensive dice mechanics with automatic calculations
- **Turn-based Combat**: Initiative tracking and combat management

### 🎭 **Game Systems**
- **Dynamic Storytelling**: AI responds to player actions with contextual narration
- **Quest Management**: Automatic quest tracking and progression
- **NPC Interactions**: Intelligent dialogue system with personality-driven responses
- **Combat Encounters**: Balanced encounter generation based on party level
- **Persistent Campaigns**: Save and resume adventures across sessions

### 🌐 **Technical Features**
- **WebSocket Real-time**: Ultra-low latency for seamless multiplayer
- **Room Management**: Create public/private campaigns with customizable settings
- **Redis Persistence**: Reliable data storage with session recovery
- **Cross-Platform**: Works on desktop and mobile browsers
- **Professional UI**: Intuitive interface designed for tabletop gaming

## 🚀 Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the D&D server**:
   ```bash
   npm run server
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open** [http://localhost:3000](http://localhost:3000)

5. **Create your character** and join an adventure!

## 🎮 How to Play

### As a Player
1. **Enter your name** and connect to the platform
2. **Join a campaign** from the public lobby or create your own
3. **Create your character** using the D&D 5e character creation system
4. **Interact with the world** by typing actions in natural language
5. **Roll dice** for skill checks, attacks, and saves
6. **Chat with party members** and coordinate strategies

### As a DM
- **Enable AI DM mode** for automated storytelling
- **Manage encounters** and story progression
- **Control NPCs** and world interactions
- **Override AI decisions** when needed

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Framer Motion
- **Backend**: Node.js WebSocket Server with Redis
- **AI Engine**: Custom rule-based DM with expansion capabilities
- **Game Logic**: D&D 5e mechanics implementation
- **Real-time**: WebSocket with automatic reconnection
- **Styling**: Tailwind CSS with responsive design

## ⚙️ Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
REDIS_URL=redis://localhost:6379
# Optional: Add OpenAI API key for enhanced AI DM
OPENAI_API_KEY=your_openai_key_here
```

## 🏗️ Architecture

### Game Systems
- **Room Manager**: Campaign creation and player management
- **Character System**: Full D&D 5e character implementation
- **DM Engine**: AI-powered storytelling and encounter management
- **Dice Engine**: Comprehensive dice rolling with modifiers
- **Combat System**: Turn-based combat with initiative tracking

### Technical Components
- **WebSocket Server**: Real-time multiplayer communication
- **Redis Storage**: Persistent campaign and character data
- **State Management**: React hooks with WebSocket synchronization
- **Type Safety**: Full TypeScript implementation with D&D data models

## 🎯 Game Features

### Character Creation
- **Race & Class Selection**: All core D&D races and classes
- **Point-Buy Stats**: Standard 27-point ability score system  
- **Skill Proficiencies**: Choose from all D&D skills
- **Equipment Management**: Starting gear and inventory
- **Character Backstory**: Rich character development tools

### Gameplay Mechanics
- **Natural Language Actions**: Describe actions in plain English
- **Contextual Responses**: AI adapts to player choices and story
- **Dynamic Encounters**: Procedurally generated challenges
- **Social Interactions**: Dialogue with intelligent NPCs
- **Environmental Interaction**: Detailed world simulation

### Campaign Management
- **Public/Private Rooms**: Control campaign visibility
- **Player Limits**: Set maximum party size
- **AI DM Options**: Toggle automated vs. human DM
- **Session Persistence**: Campaigns survive disconnections
- **Chat History**: Full adventure logs

## 🚀 Deployment

Deploy on Vercel, Railway, or Heroku with Redis addon:

1. **Frontend**: Deploy Next.js app to Vercel
2. **Backend**: Deploy WebSocket server to Railway/Heroku
3. **Database**: Add Redis addon for persistence
4. **Configuration**: Set environment variables

## 🔮 Future Enhancements

- **OpenAI Integration**: GPT-powered storytelling
- **Visual Battle Maps**: Interactive combat grids
- **Voice Chat**: Integrated voice communication
- **Homebrew Content**: Custom races, classes, and spells
- **Campaign Sharing**: Export/import adventures
- **Mobile App**: Native iOS/Android clients

## 📜 License

MIT License - see LICENSE file for details.

## 🎲 Start Your Adventure

Ready to embark on epic quests? Fire up the platform and let the AI guide you through unforgettable D&D adventures!