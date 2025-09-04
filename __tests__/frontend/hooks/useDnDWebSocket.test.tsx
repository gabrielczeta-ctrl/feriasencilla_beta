import { renderHook, act, waitFor } from '@testing-library/react'
import { useDnDWebSocket } from '../useDnDWebSocket'

// Mock WebSocket
const mockWebSocket = {
  readyState: WebSocket.CONNECTING,
  send: jest.fn(),
  close: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
}

const mockWebSocketConstructor = jest.fn(() => mockWebSocket)
global.WebSocket = mockWebSocketConstructor as any

describe('useDnDWebSocket Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockWebSocket.readyState = WebSocket.CONNECTING
  })

  afterEach(() => {
    // Clean up any open connections
    act(() => {
      // Simulate closing connection if needed
    })
  })

  describe('Initialization', () => {
    test('should initialize with disconnected state', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      expect(result.current.status).toBe('disconnected')
      expect(result.current.playerId).toBeNull()
      expect(result.current.currentRoom).toBeNull()
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.publicRooms).toEqual([])
      expect(result.current.chatMessages).toEqual([])
      expect(result.current.diceRolls).toEqual([])
    })

    test('should provide all required functions', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      expect(typeof result.current.connect).toBe('function')
      expect(typeof result.current.disconnect).toBe('function')
      expect(typeof result.current.login).toBe('function')
      expect(typeof result.current.register).toBe('function')
      expect(typeof result.current.createRoom).toBe('function')
      expect(typeof result.current.joinRoom).toBe('function')
      expect(typeof result.current.leaveRoom).toBe('function')
      expect(typeof result.current.refreshRooms).toBe('function')
      expect(typeof result.current.createCharacter).toBe('function')
      expect(typeof result.current.updateCharacter).toBe('function')
      expect(typeof result.current.sendPlayerAction).toBe('function')
      expect(typeof result.current.rollDice).toBe('function')
      expect(typeof result.current.sendChatMessage).toBe('function')
    })
  })

  describe('Connection Management', () => {
    test('should connect to WebSocket server', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        result.current.connect('TestPlayer')
      })

      expect(mockWebSocketConstructor).toHaveBeenCalledWith('ws://localhost:8080/ws')
      expect(result.current.status).toBe('connecting')
    })

    test('should handle connection open event', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        result.current.connect('TestPlayer')
      })

      // Simulate WebSocket open event
      const openHandler = mockWebSocket.addEventListener.mock.calls.find(
        call => call[0] === 'open'
      )?.[1]

      act(() => {
        if (openHandler) {
          mockWebSocket.readyState = WebSocket.OPEN
          openHandler()
        }
      })

      expect(result.current.status).toBe('connected')
    })

    test('should handle connection close event', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        result.current.connect('TestPlayer')
      })

      // Simulate connection open
      act(() => {
        mockWebSocket.readyState = WebSocket.OPEN
        const openHandler = mockWebSocket.addEventListener.mock.calls.find(
          call => call[0] === 'open'
        )?.[1]
        if (openHandler) openHandler()
      })

      // Simulate connection close
      act(() => {
        mockWebSocket.readyState = WebSocket.CLOSED
        const closeHandler = mockWebSocket.addEventListener.mock.calls.find(
          call => call[0] === 'close'
        )?.[1]
        if (closeHandler) closeHandler()
      })

      expect(result.current.status).toBe('disconnected')
      expect(result.current.playerId).toBeNull()
    })

    test('should disconnect WebSocket', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        result.current.connect('TestPlayer')
      })

      act(() => {
        result.current.disconnect()
      })

      expect(mockWebSocket.close).toHaveBeenCalled()
    })
  })

  describe('Message Handling', () => {
    let messageHandler: (event: MessageEvent) => void

    beforeEach(() => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        result.current.connect('TestPlayer')
      })

      messageHandler = mockWebSocket.addEventListener.mock.calls.find(
        call => call[0] === 'message'
      )?.[1] as (event: MessageEvent) => void
    })

    test('should handle player_connected message', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      const message = {
        type: 'player_connected',
        playerId: 'player123',
        playerName: 'TestPlayer',
        isAuthenticated: false,
        character: null,
        timestamp: Date.now()
      }

      act(() => {
        if (messageHandler) {
          messageHandler({ data: JSON.stringify(message) } as MessageEvent)
        }
      })

      expect(result.current.playerId).toBe('player123')
      expect(result.current.isAuthenticated).toBe(false)
      expect(result.current.userCharacter).toBeNull()
    })

    test('should handle login_response message', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      const message = {
        type: 'login_response',
        success: true,
        message: 'Login successful',
        character: { name: 'Hero', class: 'Fighter' },
        timestamp: Date.now()
      }

      act(() => {
        if (messageHandler) {
          messageHandler({ data: JSON.stringify(message) } as MessageEvent)
        }
      })

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.userCharacter).toEqual({ name: 'Hero', class: 'Fighter' })
    })

    test('should handle rooms_list message', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      const rooms = [
        { id: 'room1', name: 'Adventure 1', players: [], maxPlayers: 6 },
        { id: 'room2', name: 'Adventure 2', players: [], maxPlayers: 4 }
      ]

      const message = {
        type: 'rooms_list',
        rooms,
        timestamp: Date.now()
      }

      act(() => {
        if (messageHandler) {
          messageHandler({ data: JSON.stringify(message) } as MessageEvent)
        }
      })

      expect(result.current.publicRooms).toEqual(rooms)
    })

    test('should handle room_joined message', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      const room = {
        id: 'room123',
        name: 'Test Campaign',
        players: [{ id: 'player123', name: 'TestPlayer' }],
        gameState: { phase: 'character_creation' }
      }

      const message = {
        type: 'room_joined',
        room,
        timestamp: Date.now()
      }

      act(() => {
        if (messageHandler) {
          messageHandler({ data: JSON.stringify(message) } as MessageEvent)
        }
      })

      expect(result.current.currentRoom).toEqual(room)
    })

    test('should handle chat_message', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      const chatMessage = {
        id: 'msg1',
        playerId: 'player123',
        playerName: 'TestPlayer',
        type: 'chat',
        content: 'Hello everyone!',
        timestamp: Date.now()
      }

      const message = {
        type: 'chat_message',
        message: chatMessage,
        timestamp: Date.now()
      }

      act(() => {
        if (messageHandler) {
          messageHandler({ data: JSON.stringify(message) } as MessageEvent)
        }
      })

      expect(result.current.chatMessages).toContainEqual(chatMessage)
    })

    test('should handle dice_rolled message', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      const diceRoll = {
        id: 'roll1',
        playerId: 'player123',
        playerName: 'TestPlayer',
        expression: '1d20',
        results: [15],
        total: 15,
        type: 'attack',
        timestamp: Date.now()
      }

      const message = {
        type: 'dice_rolled',
        roll: diceRoll,
        timestamp: Date.now()
      }

      act(() => {
        if (messageHandler) {
          messageHandler({ data: JSON.stringify(message) } as MessageEvent)
        }
      })

      expect(result.current.diceRolls).toContainEqual(diceRoll)
    })

    test('should handle global server state updates', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      const globalState = {
        turnPhase: 'dm_processing' as const,
        turnStartTime: Date.now(),
        playerTurnDuration: 15000,
        dmUpdateInterval: 30000,
        playersWhoActed: 2,
        totalPlayers: 4
      }

      const message = {
        type: 'global_state_update',
        state: globalState,
        timestamp: Date.now()
      }

      act(() => {
        if (messageHandler) {
          messageHandler({ data: JSON.stringify(message) } as MessageEvent)
        }
      })

      expect(result.current.globalServerState).toEqual(globalState)
    })

    test('should handle invalid JSON messages gracefully', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        if (messageHandler) {
          messageHandler({ data: 'invalid json' } as MessageEvent)
        }
      })

      // Should not crash and state should remain unchanged
      expect(result.current.status).toBe('connecting')
    })

    test('should limit chat message history', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      // Add 150 chat messages (more than the 100 limit)
      for (let i = 0; i < 150; i++) {
        const chatMessage = {
          id: `msg${i}`,
          playerId: 'player123',
          playerName: 'TestPlayer',
          type: 'chat',
          content: `Message ${i}`,
          timestamp: Date.now() + i
        }

        const message = {
          type: 'chat_message',
          message: chatMessage,
          timestamp: Date.now()
        }

        act(() => {
          if (messageHandler) {
            messageHandler({ data: JSON.stringify(message) } as MessageEvent)
          }
        })
      }

      // Should only keep the last 100 messages
      expect(result.current.chatMessages.length).toBe(100)
      expect(result.current.chatMessages[0].content).toBe('Message 50') // First kept message
      expect(result.current.chatMessages[99].content).toBe('Message 149') // Last message
    })
  })

  describe('Actions', () => {
    let sendMock: jest.Mock

    beforeEach(() => {
      sendMock = mockWebSocket.send as jest.Mock
      const { result } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        result.current.connect('TestPlayer')
        // Simulate connection open
        mockWebSocket.readyState = WebSocket.OPEN
        const openHandler = mockWebSocket.addEventListener.mock.calls.find(
          call => call[0] === 'open'
        )?.[1]
        if (openHandler) openHandler()
      })
    })

    test('should send login message', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      await act(async () => {
        await result.current.login('testuser', 'password123')
      })

      expect(sendMock).toHaveBeenCalledWith(JSON.stringify({
        type: 'login',
        username: 'testuser',
        password: 'password123'
      }))
    })

    test('should send register message', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      await act(async () => {
        await result.current.register('newuser', 'password123')
      })

      expect(sendMock).toHaveBeenCalledWith(JSON.stringify({
        type: 'register',
        username: 'newuser',
        password: 'password123'
      }))
    })

    test('should send create room message', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      const roomData = {
        roomName: 'Test Campaign',
        description: 'A test adventure',
        maxPlayers: 6,
        isPublic: true,
        useAIDM: true
      }

      await act(async () => {
        await result.current.createRoom(roomData)
      })

      expect(sendMock).toHaveBeenCalledWith(JSON.stringify({
        type: 'create_room',
        ...roomData
      }))
    })

    test('should send join room message', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      await act(async () => {
        await result.current.joinRoom('room123')
      })

      expect(sendMock).toHaveBeenCalledWith(JSON.stringify({
        type: 'join_room',
        roomId: 'room123'
      }))
    })

    test('should send create character message', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      const character = {
        name: 'Hero',
        class: 'Fighter',
        race: 'Human',
        level: 1,
        stats: {
          strength: 16,
          dexterity: 12,
          constitution: 14,
          intelligence: 10,
          wisdom: 13,
          charisma: 8
        },
        hitPoints: { current: 12, maximum: 12, temporary: 0 },
        armorClass: 15
      }

      await act(async () => {
        await result.current.createCharacter(character)
      })

      expect(sendMock).toHaveBeenCalledWith(JSON.stringify({
        type: 'create_character',
        character
      }))
    })

    test('should send player action message', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      await act(async () => {
        await result.current.sendPlayerAction('look around the tavern')
      })

      expect(sendMock).toHaveBeenCalledWith(JSON.stringify({
        type: 'player_action',
        action: 'look around the tavern'
      }))
    })

    test('should send dice roll message', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      await act(async () => {
        await result.current.rollDice('1d20+3', 'attack', 'Sword attack')
      })

      expect(sendMock).toHaveBeenCalledWith(JSON.stringify({
        type: 'dice_roll',
        expression: '1d20+3',
        rollType: 'attack',
        description: 'Sword attack'
      }))
    })

    test('should send chat message', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      await act(async () => {
        await result.current.sendChatMessage('Hello everyone!', 'chat')
      })

      expect(sendMock).toHaveBeenCalledWith(JSON.stringify({
        type: 'chat_message',
        message: 'Hello everyone!',
        messageType: 'chat'
      }))
    })

    test('should request rooms list', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      await act(async () => {
        await result.current.refreshRooms()
      })

      expect(sendMock).toHaveBeenCalledWith(JSON.stringify({
        type: 'list_rooms'
      }))
    })

    test('should not send messages when disconnected', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      // Simulate disconnect
      act(() => {
        mockWebSocket.readyState = WebSocket.CLOSED
      })

      await act(async () => {
        await result.current.sendChatMessage('test message')
      })

      // Should not attempt to send when disconnected
      expect(sendMock).not.toHaveBeenCalledWith(
        expect.stringContaining('chat_message')
      )
    })
  })

  describe('Error Handling', () => {
    test('should handle WebSocket errors', () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        result.current.connect('TestPlayer')
      })

      // Simulate WebSocket error
      const errorHandler = mockWebSocket.addEventListener.mock.calls.find(
        call => call[0] === 'error'
      )?.[1]

      act(() => {
        if (errorHandler) {
          errorHandler(new Error('Connection failed'))
        }
      })

      expect(result.current.status).toBe('disconnected')
    })

    test('should handle send errors gracefully', async () => {
      const { result } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        result.current.connect('TestPlayer')
        mockWebSocket.readyState = WebSocket.OPEN
      })

      // Mock send to throw error
      mockWebSocket.send.mockImplementationOnce(() => {
        throw new Error('Send failed')
      })

      await act(async () => {
        // Should not throw
        await result.current.sendChatMessage('test')
      })

      // Hook should still be functional
      expect(result.current.status).toBe('connected')
    })
  })

  describe('Cleanup', () => {
    test('should cleanup on unmount', () => {
      const { unmount } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        const hook = renderHook(() => useDnDWebSocket())
        hook.result.current.connect('TestPlayer')
      })

      unmount()

      expect(mockWebSocket.close).toHaveBeenCalled()
    })

    test('should remove event listeners on cleanup', () => {
      const { result, unmount } = renderHook(() => useDnDWebSocket())
      
      act(() => {
        result.current.connect('TestPlayer')
      })

      unmount()

      expect(mockWebSocket.removeEventListener).toHaveBeenCalledWith('open', expect.any(Function))
      expect(mockWebSocket.removeEventListener).toHaveBeenCalledWith('close', expect.any(Function))
      expect(mockWebSocket.removeEventListener).toHaveBeenCalledWith('message', expect.any(Function))
      expect(mockWebSocket.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function))
    })
  })
})