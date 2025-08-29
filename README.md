# Shader Battle Arena Server

Real-time multiplayer WebSocket server for the Shader Battle Arena game.

## Features

- Real-time multiplayer synchronization
- Room-based player management
- Mouse position broadcasting
- Shader change synchronization
- Auto-cleanup of empty rooms

## Deployment

### Railway (Recommended)

1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Create project: `railway new`
4. Deploy: `railway up`

### Manual Deployment

Set the `PORT` environment variable for your hosting platform.

## Environment Variables

- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment (development/production)

## API Endpoints

- `GET /` - Health check endpoint
- WebSocket connection on same port

## WebSocket Events

- `join-room` - Join a game room
- `mouse-move` - Send mouse position
- `change-shader` - Change active shader
- `get-rooms` - Get list of active rooms