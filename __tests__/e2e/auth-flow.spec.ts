import { test, expect } from '@playwright/test'

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('should display login modal on initial load', async ({ page }) => {
    await expect(page.getByText('Welcome Back')).toBeVisible()
    await expect(page.getByPlaceholder('Username')).toBeVisible()
    await expect(page.getByPlaceholder('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
  })

  test('should switch between login and register forms', async ({ page }) => {
    // Initially on login form
    await expect(page.getByText('Welcome Back')).toBeVisible()
    
    // Switch to register
    await page.getByText(/don't have an account/i).click()
    await expect(page.getByText('Create Account')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible()
    
    // Switch back to login
    await page.getByText(/already have an account/i).click()
    await expect(page.getByText('Welcome Back')).toBeVisible()
  })

  test('should validate login form fields', async ({ page }) => {
    // Try to submit empty form
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    await expect(page.getByText(/username is required/i)).toBeVisible()
    await expect(page.getByText(/password is required/i)).toBeVisible()
    
    // Fill username but leave password empty
    await page.getByPlaceholder('Username').fill('testuser')
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    await expect(page.getByText(/password is required/i)).toBeVisible()
    
    // Test minimum length validation
    await page.getByPlaceholder('Username').fill('ab') // Too short
    await page.getByPlaceholder('Password').fill('123') // Too short
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    await expect(page.getByText(/username must be at least 3 characters/i)).toBeVisible()
    await expect(page.getByText(/password must be at least 6 characters/i)).toBeVisible()
  })

  test('should handle successful guest login', async ({ page }) => {
    // Wait for connection to be established
    await page.waitForTimeout(1000)
    
    // Skip authentication and continue as guest
    await page.getByText(/continue as guest/i).click()
    
    // Should see character creation or lobby
    await expect(page.getByText(/choose your character/i).or(page.getByText(/create character/i))).toBeVisible()
    
    // Check that we're connected
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected')
  })

  test('should handle user registration', async ({ page }) => {
    // Switch to register form
    await page.getByText(/don't have an account/i).click()
    
    // Fill registration form
    const timestamp = Date.now()
    const username = `testuser${timestamp}`
    const password = 'password123'
    
    await page.getByPlaceholder('Username').fill(username)
    await page.getByPlaceholder('Password').fill(password)
    
    // Submit registration
    await page.getByRole('button', { name: 'Create Account' }).click()
    
    // Wait for response
    await page.waitForTimeout(2000)
    
    // Should either show success message or proceed to next step
    await expect(
      page.getByText(/registration successful/i).or(
        page.getByText(/choose your character/i)
      )
    ).toBeVisible()
  })

  test('should handle login with existing user', async ({ page }) => {
    // First register a user
    await page.getByText(/don't have an account/i).click()
    
    const timestamp = Date.now()
    const username = `testuser${timestamp}`
    const password = 'password123'
    
    await page.getByPlaceholder('Username').fill(username)
    await page.getByPlaceholder('Password').fill(password)
    await page.getByRole('button', { name: 'Create Account' }).click()
    
    await page.waitForTimeout(2000)
    
    // Logout or refresh page
    await page.reload()
    
    // Login with the same credentials
    await page.getByPlaceholder('Username').fill(username)
    await page.getByPlaceholder('Password').fill(password)
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    await page.waitForTimeout(2000)
    
    // Should be logged in successfully
    await expect(
      page.getByText(/login successful/i).or(
        page.getByText(/choose your character/i)
      )
    ).toBeVisible()
  })

  test('should handle login errors', async ({ page }) => {
    // Try with non-existent credentials
    await page.getByPlaceholder('Username').fill('nonexistentuser')
    await page.getByPlaceholder('Password').fill('wrongpassword')
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    await page.waitForTimeout(2000)
    
    // Should show error message
    await expect(
      page.getByText(/invalid username or password/i).or(
        page.getByText(/authentication failed/i)
      )
    ).toBeVisible()
  })

  test('should handle connection status', async ({ page }) => {
    // Initially should show connecting or connected status
    await expect(
      page.locator('[data-testid="connection-status"]').or(
        page.getByText(/connecting/i)
      )
    ).toBeVisible()
    
    // Wait for connection
    await page.waitForTimeout(3000)
    
    // Should show connected status
    await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected')
  })

  test('should close modal when clicking outside', async ({ page }) => {
    await expect(page.getByText('Welcome Back')).toBeVisible()
    
    // Click outside modal (on overlay)
    await page.locator('.modal-overlay').click({ position: { x: 10, y: 10 } })
    
    // Modal should close and show guest mode
    await expect(page.getByText('Welcome Back')).not.toBeVisible()
  })

  test('should close modal with Escape key', async ({ page }) => {
    await expect(page.getByText('Welcome Back')).toBeVisible()
    
    // Press Escape
    await page.keyboard.press('Escape')
    
    // Modal should close
    await expect(page.getByText('Welcome Back')).not.toBeVisible()
  })

  test('should maintain form state during typing', async ({ page }) => {
    const username = 'testuser123'
    const password = 'mypassword'
    
    // Fill form fields
    await page.getByPlaceholder('Username').fill(username)
    await page.getByPlaceholder('Password').fill(password)
    
    // Verify values are retained
    await expect(page.getByPlaceholder('Username')).toHaveValue(username)
    await expect(page.getByPlaceholder('Password')).toHaveValue(password)
    
    // Click elsewhere but stay in form
    await page.getByText('Welcome Back').click()
    
    // Values should still be there
    await expect(page.getByPlaceholder('Username')).toHaveValue(username)
    await expect(page.getByPlaceholder('Password')).toHaveValue(password)
  })

  test('should clear form when switching between login and register', async ({ page }) => {
    // Fill login form
    await page.getByPlaceholder('Username').fill('testuser')
    await page.getByPlaceholder('Password').fill('password123')
    
    // Switch to register
    await page.getByText(/don't have an account/i).click()
    
    // Form should be cleared
    await expect(page.getByPlaceholder('Username')).toHaveValue('')
    await expect(page.getByPlaceholder('Password')).toHaveValue('')
  })

  test('should show loading states during authentication', async ({ page }) => {
    await page.getByPlaceholder('Username').fill('testuser')
    await page.getByPlaceholder('Password').fill('password123')
    
    // Click login button
    await page.getByRole('button', { name: 'Sign In' }).click()
    
    // Should show loading state
    await expect(page.getByText(/signing in/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /signing in/i })).toBeDisabled()
  })

  test('should handle duplicate registration attempt', async ({ page }) => {
    // Register first user
    await page.getByText(/don't have an account/i).click()
    
    const username = `duplicateuser${Date.now()}`
    await page.getByPlaceholder('Username').fill(username)
    await page.getByPlaceholder('Password').fill('password123')
    await page.getByRole('button', { name: 'Create Account' }).click()
    
    await page.waitForTimeout(2000)
    
    // Try to register same username again
    await page.reload()
    await page.getByText(/don't have an account/i).click()
    
    await page.getByPlaceholder('Username').fill(username)
    await page.getByPlaceholder('Password').fill('password123')
    await page.getByRole('button', { name: 'Create Account' }).click()
    
    await page.waitForTimeout(2000)
    
    // Should show error about duplicate username
    await expect(page.getByText(/username already exists/i)).toBeVisible()
  })
})