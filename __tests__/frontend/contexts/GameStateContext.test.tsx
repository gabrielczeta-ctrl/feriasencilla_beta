import { render, renderHook, act } from '@testing-library/react'
import { GameStateProvider, useGameState, GameState, GameStateAction } from '../GameStateContext'

// Helper component to test context
const TestComponent = ({ children }: { children: (value: any) => React.ReactNode }) => {
  const contextValue = useGameState()
  return <div>{children(contextValue)}</div>
}

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<GameStateProvider>{ui}</GameStateProvider>)
}

const renderHookWithProvider = <T extends any>(hook: () => T) => {
  return renderHook(hook, {
    wrapper: GameStateProvider
  })
}

describe('GameStateContext', () => {
  describe('Provider Initialization', () => {
    test('should provide initial state', () => {
      let contextValue: any
      
      renderWithProvider(
        <TestComponent>
          {(value) => {
            contextValue = value
            return <div>Test</div>
          }}
        </TestComponent>
      )

      expect(contextValue.state).toEqual({
        currentRoom: null,
        currentPlayer: null,
        playerCharacter: null,
        activeModal: 'none',
        showHUD: false,
        chatAutoScroll: true,
        phase: 'login',
        notifications: [],
        inCombat: false,
        currentTurn: null,
        turnOrder: []
      })

      expect(typeof contextValue.dispatch).toBe('function')
    })

    test('should throw error when used outside provider', () => {
      // Suppress console error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
      
      expect(() => {
        renderHook(() => useGameState())
      }).toThrow('useGameState must be used within a GameStateProvider')

      consoleSpy.mockRestore()
    })
  })

  describe('State Mutations', () => {
    test('should set room', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const testRoom = {
        id: 'room123',
        name: 'Test Campaign',
        players: [],
        gameState: { phase: 'playing' }
      }

      act(() => {
        result.current.dispatch({ type: 'SET_ROOM', payload: testRoom })
      })

      expect(result.current.state.currentRoom).toEqual(testRoom)
    })

    test('should set player', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const testPlayer = {
        id: 'player123',
        name: 'Hero',
        isOnline: true
      }

      act(() => {
        result.current.dispatch({ type: 'SET_PLAYER', payload: testPlayer })
      })

      expect(result.current.state.currentPlayer).toEqual(testPlayer)
    })

    test('should set character', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const testCharacter = {
        name: 'Aragorn',
        class: 'Ranger',
        race: 'Human',
        level: 5,
        stats: {
          strength: 16,
          dexterity: 14,
          constitution: 15,
          intelligence: 12,
          wisdom: 13,
          charisma: 10
        },
        hitPoints: { current: 45, maximum: 45, temporary: 0 },
        armorClass: 16
      }

      act(() => {
        result.current.dispatch({ type: 'SET_CHARACTER', payload: testCharacter })
      })

      expect(result.current.state.playerCharacter).toEqual(testCharacter)
    })

    test('should set phase', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      act(() => {
        result.current.dispatch({ type: 'SET_PHASE', payload: 'character_creation' })
      })

      expect(result.current.state.phase).toBe('character_creation')
    })

    test('should set active modal', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      act(() => {
        result.current.dispatch({ type: 'SET_MODAL', payload: 'character-sheet' })
      })

      expect(result.current.state.activeModal).toBe('character-sheet')
    })

    test('should toggle HUD', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      expect(result.current.state.showHUD).toBe(false)

      act(() => {
        result.current.dispatch({ type: 'TOGGLE_HUD' })
      })

      expect(result.current.state.showHUD).toBe(true)

      act(() => {
        result.current.dispatch({ type: 'TOGGLE_HUD' })
      })

      expect(result.current.state.showHUD).toBe(false)
    })

    test('should toggle chat auto scroll', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      expect(result.current.state.chatAutoScroll).toBe(true)

      act(() => {
        result.current.dispatch({ type: 'TOGGLE_CHAT_AUTO_SCROLL' })
      })

      expect(result.current.state.chatAutoScroll).toBe(false)

      act(() => {
        result.current.dispatch({ type: 'TOGGLE_CHAT_AUTO_SCROLL' })
      })

      expect(result.current.state.chatAutoScroll).toBe(true)
    })

    test('should set combat state', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const combatState = {
        inCombat: true,
        currentTurn: 'player123',
        turnOrder: ['player123', 'player456', 'enemy1']
      }

      act(() => {
        result.current.dispatch({ type: 'SET_COMBAT', payload: combatState })
      })

      expect(result.current.state.inCombat).toBe(true)
      expect(result.current.state.currentTurn).toBe('player123')
      expect(result.current.state.turnOrder).toEqual(['player123', 'player456', 'enemy1'])
    })

    test('should set combat state with partial payload', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      act(() => {
        result.current.dispatch({ type: 'SET_COMBAT', payload: { inCombat: true } })
      })

      expect(result.current.state.inCombat).toBe(true)
      expect(result.current.state.currentTurn).toBeNull()
      expect(result.current.state.turnOrder).toEqual([])
    })
  })

  describe('Notifications', () => {
    test('should add notification', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const notification = {
        type: 'success' as const,
        title: 'Success',
        message: 'Operation completed',
        duration: 5000
      }

      act(() => {
        result.current.dispatch({ type: 'ADD_NOTIFICATION', payload: notification })
      })

      expect(result.current.state.notifications.length).toBe(1)
      expect(result.current.state.notifications[0]).toMatchObject({
        ...notification,
        id: expect.any(String),
        timestamp: expect.any(Number)
      })
    })

    test('should add multiple notifications', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const notification1 = {
        type: 'info' as const,
        title: 'Info',
        message: 'Information message'
      }

      const notification2 = {
        type: 'warning' as const,
        title: 'Warning',
        message: 'Warning message'
      }

      act(() => {
        result.current.dispatch({ type: 'ADD_NOTIFICATION', payload: notification1 })
        result.current.dispatch({ type: 'ADD_NOTIFICATION', payload: notification2 })
      })

      expect(result.current.state.notifications.length).toBe(2)
      expect(result.current.state.notifications[0].type).toBe('info')
      expect(result.current.state.notifications[1].type).toBe('warning')
    })

    test('should remove notification by id', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const notification = {
        type: 'error' as const,
        title: 'Error',
        message: 'Error occurred'
      }

      act(() => {
        result.current.dispatch({ type: 'ADD_NOTIFICATION', payload: notification })
      })

      const notificationId = result.current.state.notifications[0].id

      act(() => {
        result.current.dispatch({ type: 'REMOVE_NOTIFICATION', payload: notificationId })
      })

      expect(result.current.state.notifications.length).toBe(0)
    })

    test('should generate unique notification IDs', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const notification1 = { type: 'info' as const, title: 'Test 1', message: 'Message 1' }
      const notification2 = { type: 'info' as const, title: 'Test 2', message: 'Message 2' }

      act(() => {
        result.current.dispatch({ type: 'ADD_NOTIFICATION', payload: notification1 })
        result.current.dispatch({ type: 'ADD_NOTIFICATION', payload: notification2 })
      })

      const [notif1, notif2] = result.current.state.notifications
      expect(notif1.id).not.toBe(notif2.id)
      expect(typeof notif1.id).toBe('string')
      expect(typeof notif2.id).toBe('string')
    })

    test('should include timestamp when adding notification', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const beforeTime = Date.now()

      act(() => {
        result.current.dispatch({
          type: 'ADD_NOTIFICATION',
          payload: { type: 'info', title: 'Test', message: 'Test message' }
        })
      })

      const afterTime = Date.now()
      const notification = result.current.state.notifications[0]

      expect(notification.timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(notification.timestamp).toBeLessThanOrEqual(afterTime)
    })
  })

  describe('State Persistence', () => {
    test('should maintain state across re-renders', () => {
      const { result, rerender } = renderHookWithProvider(() => useGameState())
      
      const testRoom = {
        id: 'room123',
        name: 'Test Campaign',
        players: []
      }

      act(() => {
        result.current.dispatch({ type: 'SET_ROOM', payload: testRoom })
        result.current.dispatch({ type: 'SET_PHASE', payload: 'playing' })
      })

      rerender()

      expect(result.current.state.currentRoom).toEqual(testRoom)
      expect(result.current.state.phase).toBe('playing')
    })
  })

  describe('Complex State Changes', () => {
    test('should handle phase transitions correctly', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      // Login phase
      expect(result.current.state.phase).toBe('login')

      // After authentication
      act(() => {
        result.current.dispatch({ type: 'SET_PHASE', payload: 'lobby' })
      })
      expect(result.current.state.phase).toBe('lobby')

      // Join room and create character
      act(() => {
        result.current.dispatch({ type: 'SET_PHASE', payload: 'character_creation' })
      })
      expect(result.current.state.phase).toBe('character_creation')

      // Character customization
      act(() => {
        result.current.dispatch({ type: 'SET_PHASE', payload: 'character_customization' })
      })
      expect(result.current.state.phase).toBe('character_customization')

      // Start playing
      act(() => {
        result.current.dispatch({ type: 'SET_PHASE', payload: 'playing' })
      })
      expect(result.current.state.phase).toBe('playing')
    })

    test('should handle combat initialization', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      // Set up game state first
      act(() => {
        result.current.dispatch({ type: 'SET_PHASE', payload: 'playing' })
        result.current.dispatch({
          type: 'SET_PLAYER',
          payload: { id: 'player123', name: 'Hero' }
        })
      })

      // Enter combat
      act(() => {
        result.current.dispatch({
          type: 'SET_COMBAT',
          payload: {
            inCombat: true,
            currentTurn: 'player123',
            turnOrder: ['player123', 'goblin1', 'player456']
          }
        })
      })

      expect(result.current.state.inCombat).toBe(true)
      expect(result.current.state.currentTurn).toBe('player123')
      expect(result.current.state.turnOrder).toEqual(['player123', 'goblin1', 'player456'])
    })

    test('should handle room changes with state cleanup', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      // Set up initial room
      const room1 = { id: 'room1', name: 'Campaign 1', players: [] }
      act(() => {
        result.current.dispatch({ type: 'SET_ROOM', payload: room1 })
        result.current.dispatch({ type: 'SET_PHASE', payload: 'playing' })
        result.current.dispatch({ type: 'SET_COMBAT', payload: { inCombat: true } })
      })

      // Change to new room (should potentially reset some state)
      const room2 = { id: 'room2', name: 'Campaign 2', players: [] }
      act(() => {
        result.current.dispatch({ type: 'SET_ROOM', payload: room2 })
      })

      expect(result.current.state.currentRoom).toEqual(room2)
      // Combat state persists (this might be changed based on game logic)
      expect(result.current.state.inCombat).toBe(true)
    })
  })

  describe('Modal Management', () => {
    test('should cycle through different modals', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const modals = ['character-sheet', 'inventory', 'settings', 'current-context'] as const

      modals.forEach(modal => {
        act(() => {
          result.current.dispatch({ type: 'SET_MODAL', payload: modal })
        })
        expect(result.current.state.activeModal).toBe(modal)
      })

      // Close modal
      act(() => {
        result.current.dispatch({ type: 'SET_MODAL', payload: 'none' })
      })
      expect(result.current.state.activeModal).toBe('none')
    })
  })

  describe('Reducer Edge Cases', () => {
    test('should handle unknown action types gracefully', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      const initialState = result.current.state

      act(() => {
        // @ts-ignore - Testing invalid action type
        result.current.dispatch({ type: 'INVALID_ACTION', payload: 'test' })
      })

      // State should remain unchanged
      expect(result.current.state).toEqual(initialState)
    })

    test('should handle null/undefined payloads', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      act(() => {
        result.current.dispatch({ type: 'SET_ROOM', payload: null })
        result.current.dispatch({ type: 'SET_PLAYER', payload: null })
        result.current.dispatch({ type: 'SET_CHARACTER', payload: null })
      })

      expect(result.current.state.currentRoom).toBeNull()
      expect(result.current.state.currentPlayer).toBeNull()
      expect(result.current.state.playerCharacter).toBeNull()
    })
  })

  describe('TypeScript Type Safety', () => {
    test('should enforce correct payload types', () => {
      const { result } = renderHookWithProvider(() => useGameState())
      
      // These should compile without errors
      act(() => {
        result.current.dispatch({ type: 'SET_PHASE', payload: 'login' })
        result.current.dispatch({ type: 'SET_MODAL', payload: 'character-sheet' })
        result.current.dispatch({ 
          type: 'ADD_NOTIFICATION', 
          payload: { type: 'info', title: 'Test', message: 'Test' } 
        })
        result.current.dispatch({ type: 'REMOVE_NOTIFICATION', payload: 'test-id' })
        result.current.dispatch({ type: 'TOGGLE_HUD' })
        result.current.dispatch({ type: 'TOGGLE_CHAT_AUTO_SCROLL' })
      })

      // Verify state is properly typed
      expect(typeof result.current.state.phase).toBe('string')
      expect(typeof result.current.state.showHUD).toBe('boolean')
      expect(Array.isArray(result.current.state.notifications)).toBe(true)
    })
  })
})