# Shader Arena — Multiplayer Visual Battle Game

A real-time multiplayer WebGL2 game with 8 interactive fragment shaders, gamification system, and live battles. Built for 60fps performance with auto-joining multiplayer rooms.

## 🎮 Game Features

- **Auto-join multiplayer** - Instantly connects to global battle rooms
- **Live scoring system** - Earn points and streaks by completing challenges
- **Dynamic challenges** - Rotate every ~10 seconds (center mouse, draw circles, etc.)
- **Particle effects** - Visual feedback for achievements
- **Real-time battles** - See other players' mouse movements and shader changes
- **8 custom shaders** - From soft gradients to matrix rain effects

## 🚀 Quickstart

```bash
npm i
npm run dev
```

Server (Railway deployed):
```bash
cd server
npm i
npm start
```

## 🎯 How to Play

1. **App auto-connects** to multiplayer on load
2. **Complete challenges** shown in the challenge panel
3. **Earn points** by following challenge objectives (move mouse to center, etc.)
4. **Build streaks** for higher scores
5. **Compete** with other players in real-time

## 🕹️ Controls

- **1-8**: Switch between shaders instantly
- **N/P**: Cycle next/previous shader
- **H**: Hide/show UI
- **Mouse**: Interactive effects + challenge completion

## 🎨 Shaders

1. **Soft Flow** — Gentle noise fields with pleasant colors
2. **Gradient Glitch** — Smooth color transitions with subtle distortion
3. **CRT Wave** — Barrel distortion with cosine gradient palette
4. **Pixel Melt** — Pixelation grid with noise-based temporal smear
5. **Plasma Storm** — Dynamic plasma effects with color cycling
6. **Neural Net** — Network visualization with pulsing connections
7. **Kaleidoscope** — Symmetrical pattern generator
8. **Matrix Rain** — Classic green digital rain effect

## 🛠️ Tech Stack

- **Frontend**: React + TypeScript + Vite + WebGL2
- **Backend**: Node.js + Socket.IO + Express
- **Deployment**: Railway (server) + Auto-deployment
- **Real-time**: WebSocket connections for multiplayer

## 🌐 Live Deployment

- **Multiplayer Server**: `wss://feriasencillabeta-production.up.railway.app`
- **GitHub**: `git@github.com:gabrielczeta-ctrl/feriasencilla_beta.git`

## 🎯 Build & Deploy

```bash
npm run build
npm run preview
```

## ⚡ Requirements

- WebGL2 support (graceful error message if unavailable)
- Modern browser (desktop/mobile)
- Network connection for multiplayer features