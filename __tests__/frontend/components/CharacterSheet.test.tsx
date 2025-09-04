import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CharacterSheet from '../CharacterSheet'
import { GameStateProvider } from '../../contexts/GameStateContext'

// Mock the WebSocket hook
const mockWebSocketHook = {
  updateCharacter: jest.fn(),
  rollDice: jest.fn(),
  status: 'connected'
}

jest.mock('../../hooks/useDnDWebSocket', () => ({
  useDnDWebSocket: () => mockWebSocketHook
}))

const mockCharacter = {
  id: 'char123',
  name: 'Aragorn',
  race: 'Human',
  class: 'Ranger',
  level: 5,
  stats: {
    strength: 16,
    dexterity: 14,
    constitution: 15,
    intelligence: 12,
    wisdom: 13,
    charisma: 10
  },
  hitPoints: {
    current: 42,
    maximum: 45,
    temporary: 0
  },
  armorClass: 17,
  backstory: 'A skilled ranger from the North',
  equipment: [
    { id: 'sword1', name: 'Longsword', type: 'weapon', damage: '1d8+3' },
    { id: 'armor1', name: 'Studded Leather', type: 'armor', ac: 12 }
  ]
}

const renderWithProvider = (ui: React.ReactElement) => {
  return render(<GameStateProvider>{ui}</GameStateProvider>)
}

describe('CharacterSheet Component', () => {
  const defaultProps = {
    character: mockCharacter,
    isOpen: true,
    onClose: jest.fn(),
    editable: true
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    test('should render character information', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      expect(screen.getByText('Aragorn')).toBeInTheDocument()
      expect(screen.getByText('Level 5 Human Ranger')).toBeInTheDocument()
      expect(screen.getByText('AC 17')).toBeInTheDocument()
      expect(screen.getByText('42/45')).toBeInTheDocument() // Hit points
    })

    test('should render ability scores', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      expect(screen.getByText('STR')).toBeInTheDocument()
      expect(screen.getByText('16')).toBeInTheDocument()
      expect(screen.getByText('+3')).toBeInTheDocument() // STR modifier
      
      expect(screen.getByText('DEX')).toBeInTheDocument()
      expect(screen.getByText('14')).toBeInTheDocument()
      expect(screen.getByText('+2')).toBeInTheDocument() // DEX modifier
    })

    test('should render equipment list', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      expect(screen.getByText('Longsword')).toBeInTheDocument()
      expect(screen.getByText('1d8+3')).toBeInTheDocument()
      expect(screen.getByText('Studded Leather')).toBeInTheDocument()
      expect(screen.getByText('AC 12')).toBeInTheDocument()
    })

    test('should render backstory', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      expect(screen.getByText('A skilled ranger from the North')).toBeInTheDocument()
    })

    test('should not render when isOpen is false', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} isOpen={false} />)
      
      expect(screen.queryByText('Aragorn')).not.toBeInTheDocument()
    })

    test('should render in read-only mode when editable is false', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} editable={false} />)
      
      expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    })
  })

  describe('Ability Score Interactions', () => {
    test('should show ability score modifiers correctly', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      // Test modifier calculations
      const strengthMod = Math.floor((16 - 10) / 2) // +3
      const dexterityMod = Math.floor((14 - 10) / 2) // +2
      const charismaMod = Math.floor((10 - 10) / 2) // +0
      
      expect(screen.getByText('+3')).toBeInTheDocument() // STR
      expect(screen.getByText('+2')).toBeInTheDocument() // DEX
      expect(screen.getByText('+0')).toBeInTheDocument() // CHA
    })

    test('should handle ability score rolls', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const strRollButton = screen.getByTestId('str-roll-button')
      await user.click(strRollButton)
      
      expect(mockWebSocketHook.rollDice).toHaveBeenCalledWith('1d20+3', 'ability', 'Strength Check')
    })

    test('should handle saving throws', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const strSaveButton = screen.getByTestId('str-save-button')
      await user.click(strSaveButton)
      
      expect(mockWebSocketHook.rollDice).toHaveBeenCalledWith('1d20+3', 'save', 'Strength Saving Throw')
    })
  })

  describe('Hit Points Management', () => {
    test('should display current and maximum hit points', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      expect(screen.getByDisplayValue('42')).toBeInTheDocument() // Current HP
      expect(screen.getByDisplayValue('45')).toBeInTheDocument() // Max HP
    })

    test('should update current hit points', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const currentHPInput = screen.getByDisplayValue('42')
      await user.clear(currentHPInput)
      await user.type(currentHPInput, '30')
      
      // Trigger save
      const saveButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(saveButton)
      
      expect(mockWebSocketHook.updateCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          hitPoints: expect.objectContaining({
            current: 30,
            maximum: 45,
            temporary: 0
          })
        })
      )
    })

    test('should handle temporary hit points', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const tempHPInput = screen.getByDisplayValue('0')
      await user.clear(tempHPInput)
      await user.type(tempHPInput, '5')
      
      const saveButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(saveButton)
      
      expect(mockWebSocketHook.updateCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          hitPoints: expect.objectContaining({
            temporary: 5
          })
        })
      )
    })

    test('should not allow negative hit points', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const currentHPInput = screen.getByDisplayValue('42')
      await user.clear(currentHPInput)
      await user.type(currentHPInput, '-10')
      
      fireEvent.blur(currentHPInput)
      
      expect(currentHPInput).toHaveValue(0)
    })

    test('should not allow current HP to exceed maximum', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const currentHPInput = screen.getByDisplayValue('42')
      await user.clear(currentHPInput)
      await user.type(currentHPInput, '50')
      
      fireEvent.blur(currentHPInput)
      
      expect(currentHPInput).toHaveValue(45) // Should be clamped to maximum
    })
  })

  describe('Equipment Management', () => {
    test('should display equipment items', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      expect(screen.getByText('Longsword')).toBeInTheDocument()
      expect(screen.getByText('Studded Leather')).toBeInTheDocument()
    })

    test('should handle weapon attack rolls', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const attackButton = screen.getByTestId('weapon-attack-sword1')
      await user.click(attackButton)
      
      expect(mockWebSocketHook.rollDice).toHaveBeenCalledWith(
        '1d20+5', // DEX modifier + proficiency
        'attack',
        'Longsword Attack'
      )
    })

    test('should handle damage rolls', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const damageButton = screen.getByTestId('weapon-damage-sword1')
      await user.click(damageButton)
      
      expect(mockWebSocketHook.rollDice).toHaveBeenCalledWith(
        '1d8+3',
        'damage',
        'Longsword Damage'
      )
    })

    test('should allow adding new equipment in edit mode', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const addEquipmentButton = screen.getByRole('button', { name: /add equipment/i })
      await user.click(addEquipmentButton)
      
      expect(screen.getByPlaceholderText(/item name/i)).toBeInTheDocument()
      expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument()
    })
  })

  describe('Character Information Editing', () => {
    test('should allow editing character name', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const nameInput = screen.getByDisplayValue('Aragorn')
      await user.clear(nameInput)
      await user.type(nameInput, 'Strider')
      
      const saveButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(saveButton)
      
      expect(mockWebSocketHook.updateCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Strider'
        })
      )
    })

    test('should allow editing backstory', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const backstoryTextarea = screen.getByDisplayValue('A skilled ranger from the North')
      await user.clear(backstoryTextarea)
      await user.type(backstoryTextarea, 'A mysterious wanderer with a secret past')
      
      const saveButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(saveButton)
      
      expect(mockWebSocketHook.updateCharacter).toHaveBeenCalledWith(
        expect.objectContaining({
          backstory: 'A mysterious wanderer with a secret past'
        })
      )
    })

    test('should validate required fields', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const nameInput = screen.getByDisplayValue('Aragorn')
      await user.clear(nameInput)
      
      const saveButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(saveButton)
      
      expect(screen.getByText(/name is required/i)).toBeInTheDocument()
      expect(mockWebSocketHook.updateCharacter).not.toHaveBeenCalled()
    })
  })

  describe('Proficiency and Skills', () => {
    test('should calculate proficiency bonus correctly', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      // Level 5 character should have +3 proficiency bonus
      const proficiencyBonus = Math.ceil(mockCharacter.level / 4) + 1
      expect(proficiencyBonus).toBe(3)
      
      // This would be reflected in skill calculations
      expect(screen.getByText('+3')).toBeInTheDocument()
    })

    test('should handle skill checks', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const stealthButton = screen.getByTestId('skill-stealth')
      await user.click(stealthButton)
      
      // Stealth uses Dexterity (DEX +2)
      expect(mockWebSocketHook.rollDice).toHaveBeenCalledWith(
        '1d20+2',
        'skill',
        'Stealth Check'
      )
    })
  })

  describe('Modal Interactions', () => {
    test('should close modal when close button is clicked', async () => {
      const user = userEvent.setup()
      const onCloseMock = jest.fn()
      
      renderWithProvider(<CharacterSheet {...defaultProps} onClose={onCloseMock} />)
      
      const closeButton = screen.getByRole('button', { name: /close/i })
      await user.click(closeButton)
      
      expect(onCloseMock).toHaveBeenCalled()
    })

    test('should prompt for unsaved changes when closing', async () => {
      const user = userEvent.setup()
      const onCloseMock = jest.fn()
      
      renderWithProvider(<CharacterSheet {...defaultProps} onClose={onCloseMock} />)
      
      // Make a change
      const nameInput = screen.getByDisplayValue('Aragorn')
      await user.clear(nameInput)
      await user.type(nameInput, 'Strider')
      
      const closeButton = screen.getByRole('button', { name: /close/i })
      await user.click(closeButton)
      
      expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument()
    })

    test('should save changes before closing', async () => {
      const user = userEvent.setup()
      const onCloseMock = jest.fn()
      
      renderWithProvider(<CharacterSheet {...defaultProps} onClose={onCloseMock} />)
      
      const nameInput = screen.getByDisplayValue('Aragorn')
      await user.clear(nameInput)
      await user.type(nameInput, 'Strider')
      
      const closeButton = screen.getByRole('button', { name: /close/i })
      await user.click(closeButton)
      
      const saveAndCloseButton = screen.getByRole('button', { name: /save and close/i })
      await user.click(saveAndCloseButton)
      
      expect(mockWebSocketHook.updateCharacter).toHaveBeenCalled()
      expect(onCloseMock).toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    test('should have proper ARIA attributes', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const modal = screen.getByRole('dialog')
      expect(modal).toHaveAttribute('aria-modal', 'true')
      expect(modal).toHaveAttribute('aria-labelledby')
    })

    test('should have proper form labels', () => {
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      expect(screen.getByLabelText(/character name/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/current hit points/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/maximum hit points/i)).toBeInTheDocument()
    })

    test('should support keyboard navigation', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const nameInput = screen.getByDisplayValue('Aragorn')
      nameInput.focus()
      
      await user.tab()
      expect(screen.getByDisplayValue('42')).toHaveFocus() // Current HP input
    })
  })

  describe('Error Handling', () => {
    test('should handle update character errors', async () => {
      const user = userEvent.setup()
      mockWebSocketHook.updateCharacter.mockRejectedValue(new Error('Update failed'))
      
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const nameInput = screen.getByDisplayValue('Aragorn')
      await user.clear(nameInput)
      await user.type(nameInput, 'Strider')
      
      const saveButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(saveButton)
      
      await waitFor(() => {
        expect(screen.getByText(/failed to update character/i)).toBeInTheDocument()
      })
    })

    test('should handle dice roll errors gracefully', async () => {
      const user = userEvent.setup()
      mockWebSocketHook.rollDice.mockRejectedValue(new Error('Roll failed'))
      
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const strRollButton = screen.getByTestId('str-roll-button')
      await user.click(strRollButton)
      
      // Should not crash the component
      expect(screen.getByText('Aragorn')).toBeInTheDocument()
    })
  })

  describe('Loading States', () => {
    test('should show loading state when saving', async () => {
      const user = userEvent.setup()
      mockWebSocketHook.updateCharacter.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      )
      
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const nameInput = screen.getByDisplayValue('Aragorn')
      await user.clear(nameInput)
      await user.type(nameInput, 'Strider')
      
      const saveButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(saveButton)
      
      expect(screen.getByText(/saving/i)).toBeInTheDocument()
      expect(saveButton).toBeDisabled()
    })
  })

  describe('Data Validation', () => {
    test('should validate ability score ranges', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const strInput = screen.getByDisplayValue('16')
      await user.clear(strInput)
      await user.type(strInput, '25') // Above maximum
      
      fireEvent.blur(strInput)
      
      expect(strInput).toHaveValue(20) // Should be clamped to 20
    })

    test('should validate level ranges', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const levelInput = screen.getByDisplayValue('5')
      await user.clear(levelInput)
      await user.type(levelInput, '25') // Above maximum
      
      fireEvent.blur(levelInput)
      
      expect(levelInput).toHaveValue(20) // Should be clamped to 20
    })

    test('should not allow empty required fields', async () => {
      const user = userEvent.setup()
      renderWithProvider(<CharacterSheet {...defaultProps} />)
      
      const nameInput = screen.getByDisplayValue('Aragorn')
      await user.clear(nameInput)
      
      const saveButton = screen.getByRole('button', { name: /save changes/i })
      await user.click(saveButton)
      
      expect(screen.getByText(/name is required/i)).toBeInTheDocument()
    })
  })
})