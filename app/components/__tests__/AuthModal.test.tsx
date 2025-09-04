import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthModal from '../AuthModal'

// Mock the WebSocket hook
const mockWebSocketHook = {
  status: 'connected',
  login: jest.fn(),
  register: jest.fn(),
}

jest.mock('../../hooks/useDnDWebSocket', () => ({
  useDnDWebSocket: () => mockWebSocketHook
}))

describe('AuthModal Component', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    initialMode: 'login' as const
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Rendering', () => {
    test('should render login form by default', () => {
      render(<AuthModal {...defaultProps} />)
      
      expect(screen.getByText('Welcome Back')).toBeInTheDocument()
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    test('should render register form when initialMode is register', () => {
      render(<AuthModal {...defaultProps} initialMode="register" />)
      
      expect(screen.getByText('Create Account')).toBeInTheDocument()
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
    })

    test('should not render when isOpen is false', () => {
      render(<AuthModal {...defaultProps} isOpen={false} />)
      
      expect(screen.queryByText('Welcome Back')).not.toBeInTheDocument()
      expect(screen.queryByText('Create Account')).not.toBeInTheDocument()
    })

    test('should render close button', () => {
      render(<AuthModal {...defaultProps} />)
      
      const closeButton = screen.getByRole('button', { name: /close/i })
      expect(closeButton).toBeInTheDocument()
    })
  })

  describe('Form Switching', () => {
    test('should switch from login to register', async () => {
      const user = userEvent.setup()
      render(<AuthModal {...defaultProps} />)
      
      expect(screen.getByText('Welcome Back')).toBeInTheDocument()
      
      const switchLink = screen.getByText(/don't have an account/i).closest('button')
      await user.click(switchLink!)
      
      expect(screen.getByText('Create Account')).toBeInTheDocument()
      expect(screen.queryByText('Welcome Back')).not.toBeInTheDocument()
    })

    test('should switch from register to login', async () => {
      const user = userEvent.setup()
      render(<AuthModal {...defaultProps} initialMode="register" />)
      
      expect(screen.getByText('Create Account')).toBeInTheDocument()
      
      const switchLink = screen.getByText(/already have an account/i).closest('button')
      await user.click(switchLink!)
      
      expect(screen.getByText('Welcome Back')).toBeInTheDocument()
      expect(screen.queryByText('Create Account')).not.toBeInTheDocument()
    })
  })

  describe('Login Form', () => {
    test('should handle login form submission', async () => {
      const user = userEvent.setup()
      mockWebSocketHook.login.mockResolvedValue(undefined)
      
      render(<AuthModal {...defaultProps} />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      
      await user.type(usernameInput, 'testuser')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)
      
      expect(mockWebSocketHook.login).toHaveBeenCalledWith('testuser', 'password123')
    })

    test('should validate required fields for login', async () => {
      const user = userEvent.setup()
      render(<AuthModal {...defaultProps} />)
      
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      await user.click(submitButton)
      
      expect(mockWebSocketHook.login).not.toHaveBeenCalled()
      
      // Should show validation errors
      expect(screen.getByText(/username is required/i)).toBeInTheDocument()
      expect(screen.getByText(/password is required/i)).toBeInTheDocument()
    })

    test('should validate minimum username length', async () => {
      const user = userEvent.setup()
      render(<AuthModal {...defaultProps} />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      
      await user.type(usernameInput, 'ab') // Only 2 characters
      await user.click(submitButton)
      
      expect(screen.getByText(/username must be at least 3 characters/i)).toBeInTheDocument()
    })

    test('should validate minimum password length', async () => {
      const user = userEvent.setup()
      render(<AuthModal {...defaultProps} />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      
      await user.type(usernameInput, 'testuser')
      await user.type(passwordInput, '12345') // Only 5 characters
      await user.click(submitButton)
      
      expect(screen.getByText(/password must be at least 6 characters/i)).toBeInTheDocument()
    })

    test('should show loading state during login', async () => {
      const user = userEvent.setup()
      // Mock login to be slow
      mockWebSocketHook.login.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      render(<AuthModal {...defaultProps} />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      
      await user.type(usernameInput, 'testuser')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)
      
      expect(screen.getByText(/signing in/i)).toBeInTheDocument()
      expect(submitButton).toBeDisabled()
    })
  })

  describe('Register Form', () => {
    test('should handle register form submission', async () => {
      const user = userEvent.setup()
      mockWebSocketHook.register.mockResolvedValue(undefined)
      
      render(<AuthModal {...defaultProps} initialMode="register" />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /create account/i })
      
      await user.type(usernameInput, 'newuser')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)
      
      expect(mockWebSocketHook.register).toHaveBeenCalledWith('newuser', 'password123')
    })

    test('should validate required fields for register', async () => {
      const user = userEvent.setup()
      render(<AuthModal {...defaultProps} initialMode="register" />)
      
      const submitButton = screen.getByRole('button', { name: /create account/i })
      await user.click(submitButton)
      
      expect(mockWebSocketHook.register).not.toHaveBeenCalled()
      expect(screen.getByText(/username is required/i)).toBeInTheDocument()
      expect(screen.getByText(/password is required/i)).toBeInTheDocument()
    })

    test('should show loading state during registration', async () => {
      const user = userEvent.setup()
      mockWebSocketHook.register.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
      
      render(<AuthModal {...defaultProps} initialMode="register" />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /create account/i })
      
      await user.type(usernameInput, 'newuser')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)
      
      expect(screen.getByText(/creating account/i)).toBeInTheDocument()
      expect(submitButton).toBeDisabled()
    })
  })

  describe('Error Handling', () => {
    test('should display login error message', async () => {
      const user = userEvent.setup()
      mockWebSocketHook.login.mockRejectedValue(new Error('Invalid credentials'))
      
      render(<AuthModal {...defaultProps} />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      
      await user.type(usernameInput, 'testuser')
      await user.type(passwordInput, 'wrongpassword')
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
      })
    })

    test('should display registration error message', async () => {
      const user = userEvent.setup()
      mockWebSocketHook.register.mockRejectedValue(new Error('Username already exists'))
      
      render(<AuthModal {...defaultProps} initialMode="register" />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /create account/i })
      
      await user.type(usernameInput, 'existinguser')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText(/username already exists/i)).toBeInTheDocument()
      })
    })

    test('should clear errors when switching forms', async () => {
      const user = userEvent.setup()
      mockWebSocketHook.login.mockRejectedValue(new Error('Login failed'))
      
      render(<AuthModal {...defaultProps} />)
      
      // Trigger login error
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      await user.click(submitButton)
      
      await waitFor(() => {
        expect(screen.getByText(/username is required/i)).toBeInTheDocument()
      })
      
      // Switch to register form
      const switchLink = screen.getByText(/don't have an account/i).closest('button')
      await user.click(switchLink!)
      
      // Errors should be cleared
      expect(screen.queryByText(/username is required/i)).not.toBeInTheDocument()
    })
  })

  describe('Modal Interactions', () => {
    test('should call onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      const onCloseMock = jest.fn()
      
      render(<AuthModal {...defaultProps} onClose={onCloseMock} />)
      
      const closeButton = screen.getByRole('button', { name: /close/i })
      await user.click(closeButton)
      
      expect(onCloseMock).toHaveBeenCalled()
    })

    test('should call onClose when clicking outside modal', async () => {
      const user = userEvent.setup()
      const onCloseMock = jest.fn()
      
      render(<AuthModal {...defaultProps} onClose={onCloseMock} />)
      
      const modalOverlay = screen.getByTestId('modal-overlay')
      await user.click(modalOverlay)
      
      expect(onCloseMock).toHaveBeenCalled()
    })

    test('should not close when clicking inside modal content', async () => {
      const user = userEvent.setup()
      const onCloseMock = jest.fn()
      
      render(<AuthModal {...defaultProps} onClose={onCloseMock} />)
      
      const modalContent = screen.getByRole('dialog')
      await user.click(modalContent)
      
      expect(onCloseMock).not.toHaveBeenCalled()
    })

    test('should handle Escape key to close modal', () => {
      const onCloseMock = jest.fn()
      render(<AuthModal {...defaultProps} onClose={onCloseMock} />)
      
      fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
      
      expect(onCloseMock).toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    test('should have proper ARIA attributes', () => {
      render(<AuthModal {...defaultProps} />)
      
      const modal = screen.getByRole('dialog')
      expect(modal).toHaveAttribute('aria-modal', 'true')
      expect(modal).toHaveAttribute('aria-labelledby')
    })

    test('should focus first input when opened', () => {
      render(<AuthModal {...defaultProps} />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      expect(usernameInput).toHaveFocus()
    })

    test('should trap focus within modal', async () => {
      const user = userEvent.setup()
      render(<AuthModal {...defaultProps} />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      const closeButton = screen.getByRole('button', { name: /close/i })
      
      expect(usernameInput).toHaveFocus()
      
      await user.tab()
      expect(passwordInput).toHaveFocus()
      
      await user.tab()
      expect(submitButton).toHaveFocus()
      
      await user.tab()
      expect(closeButton).toHaveFocus()
      
      // Should wrap back to first element
      await user.tab()
      expect(usernameInput).toHaveFocus()
    })

    test('should have proper form labels', () => {
      render(<AuthModal {...defaultProps} />)
      
      expect(screen.getByLabelText(/username/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    })
  })

  describe('Form State Management', () => {
    test('should clear form when switching modes', async () => {
      const user = userEvent.setup()
      render(<AuthModal {...defaultProps} />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      
      await user.type(usernameInput, 'testuser')
      await user.type(passwordInput, 'password123')
      
      expect(usernameInput).toHaveValue('testuser')
      expect(passwordInput).toHaveValue('password123')
      
      // Switch to register
      const switchLink = screen.getByText(/don't have an account/i).closest('button')
      await user.click(switchLink!)
      
      // Form should be cleared
      expect(screen.getByLabelText(/username/i)).toHaveValue('')
      expect(screen.getByLabelText(/password/i)).toHaveValue('')
    })

    test('should preserve form state when not switching modes', async () => {
      const user = userEvent.setup()
      render(<AuthModal {...defaultProps} />)
      
      const usernameInput = screen.getByLabelText(/username/i)
      const passwordInput = screen.getByLabelText(/password/i)
      
      await user.type(usernameInput, 'testuser')
      await user.type(passwordInput, 'password123')
      
      // Click somewhere else but don't switch modes
      await user.click(screen.getByText('Welcome Back'))
      
      expect(usernameInput).toHaveValue('testuser')
      expect(passwordInput).toHaveValue('password123')
    })
  })

  describe('Connection Status', () => {
    test('should disable form when WebSocket is disconnected', () => {
      mockWebSocketHook.status = 'disconnected'
      
      render(<AuthModal {...defaultProps} />)
      
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      expect(submitButton).toBeDisabled()
      expect(screen.getByText(/connection lost/i)).toBeInTheDocument()
    })

    test('should show connecting state', () => {
      mockWebSocketHook.status = 'connecting'
      
      render(<AuthModal {...defaultProps} />)
      
      expect(screen.getByText(/connecting/i)).toBeInTheDocument()
    })

    test('should enable form when connected', () => {
      mockWebSocketHook.status = 'connected'
      
      render(<AuthModal {...defaultProps} />)
      
      const submitButton = screen.getByRole('button', { name: /sign in/i })
      expect(submitButton).not.toBeDisabled()
    })
  })
})