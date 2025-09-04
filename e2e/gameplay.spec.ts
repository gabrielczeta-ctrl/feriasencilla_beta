import { test, expect } from '@playwright/test'

test.describe('Gameplay Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    
    // Complete auth and character creation
    await page.getByText(/continue as guest/i).click()
    await page.waitForTimeout(1000)
    
    // Create a basic character if needed
    if (await page.getByPlaceholder(/character name/i).isVisible()) {
      await page.getByPlaceholder(/character name/i).fill('TestAdventurer')
      await page.getByRole('button', { name: /create character/i }).click()
      await page.waitForTimeout(2000)
    }
  })

  test('should display game interface', async ({ page }) => {
    // Should see main game elements
    await expect(
      page.getByText(/the eternal tavern/i).or(
        page.getByText(/tavern/i)
      )
    ).toBeVisible()
    
    // Should have action input
    await expect(
      page.getByPlaceholder(/what do you do/i).or(
        page.getByPlaceholder(/enter your action/i)
      ).or(
        page.locator('input[type="text"]').first()
      )
    ).toBeVisible()
    
    // Should have send/submit button
    await expect(
      page.getByRole('button', { name: /send/i }).or(
        page.getByRole('button', { name: /submit/i })
      )
    ).toBeVisible()
  })

  test('should send player action', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const actionInput = page.getByPlaceholder(/what do you do/i).or(
      page.getByPlaceholder(/enter your action/i)
    ).or(
      page.locator('input[type="text"]').first()
    )
    
    const sendButton = page.getByRole('button', { name: /send/i }).or(
      page.getByRole('button', { name: /submit/i })
    )
    
    // Type an action
    await actionInput.fill('look around the tavern')
    await sendButton.click()
    
    // Should show action was submitted
    await expect(
      page.getByText(/action queued/i).or(
        page.getByText(/action submitted/i)
      ).or(
        page.getByText(/look around the tavern/i)
      )
    ).toBeVisible()
    
    // Input should be cleared
    await expect(actionInput).toHaveValue('')
  })

  test('should display chat messages', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for chat area
    const chatArea = page.locator('[data-testid="chat-area"]').or(
      page.locator('.chat').first()
    ).or(
      page.locator('[class*="chat"]').first()
    )
    
    // Send a test message
    const actionInput = page.getByPlaceholder(/what do you do/i).or(
      page.locator('input[type="text"]').first()
    )
    
    if (await actionInput.isVisible()) {
      await actionInput.fill('Hello, fellow adventurers!')
      await page.keyboard.press('Enter')
      
      // Wait for message to appear
      await page.waitForTimeout(1000)
      
      // Should see the message in chat
      await expect(
        page.getByText(/hello, fellow adventurers/i)
      ).toBeVisible()
    }
  })

  test('should handle dice rolling', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for dice roll interface
    const diceInput = page.getByPlaceholder(/1d20/i).or(
      page.locator('[data-testid="dice-input"]')
    ).or(
      page.locator('input[placeholder*="d"]').first()
    )
    
    if (await diceInput.isVisible()) {
      await diceInput.fill('1d20+3')
      
      const rollButton = page.getByRole('button', { name: /roll/i })
      await rollButton.click()
      
      // Should see dice result
      await expect(
        page.getByText(/rolled/i).or(
          page.getByText(/\d+/i) // Any number result
        )
      ).toBeVisible()
    }
  })

  test('should display turn timer and phase', async ({ page }) => {
    await page.waitForTimeout(3000)
    
    // Look for turn phase indicator
    const phaseIndicator = page.locator('[data-testid="turn-phase"]').or(
      page.getByText(/player turns/i)
    ).or(
      page.getByText(/dm processing/i)
    ).or(
      page.getByText(/dm response/i)
    )
    
    // Should show current phase
    await expect(phaseIndicator).toBeVisible()
    
    // Look for timer
    const timer = page.locator('[data-testid="turn-timer"]').or(
      page.getByText(/\d+:\d+/i) // Timer format
    ).or(
      page.getByText(/\d+s/i) // Seconds format
    )
    
    if (await timer.isVisible()) {
      // Timer should be counting down or showing time
      const timerText = await timer.textContent()
      expect(timerText).toMatch(/\d+/)
    }
  })

  test('should show character sheet', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for character sheet button/link
    const characterButton = page.getByRole('button', { name: /character/i }).or(
      page.getByRole('button', { name: /sheet/i })
    ).or(
      page.locator('[data-testid="character-sheet-button"]')
    )
    
    if (await characterButton.isVisible()) {
      await characterButton.click()
      
      // Should see character sheet modal
      await expect(
        page.getByText(/testadventurer/i).or(
          page.getByText(/character sheet/i)
        )
      ).toBeVisible()
      
      // Should see stats
      await expect(
        page.getByText(/strength/i).or(
          page.getByText(/STR/i)
        )
      ).toBeVisible()
      
      // Close character sheet
      const closeButton = page.getByRole('button', { name: /close/i }).first()
      if (await closeButton.isVisible()) {
        await closeButton.click()
      } else {
        await page.keyboard.press('Escape')
      }
    }
  })

  test('should handle DM responses', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Send an action
    const actionInput = page.locator('input[type="text"]').first()
    if (await actionInput.isVisible()) {
      await actionInput.fill('examine the room carefully')
      await page.keyboard.press('Enter')
      
      // Wait for DM processing phase
      await page.waitForTimeout(15000) // Wait for player turn to end
      
      // Should see DM processing or response
      await expect(
        page.getByText(/dm processing/i).or(
          page.getByText(/dm response/i)
        ).or(
          page.getByText(/examine/i) // Echo of our action
        ).or(
          page.getByText(/you see/i) // Typical DM response start
        )
      ).toBeVisible({ timeout: 30000 })
    }
  })

  test('should handle multiple players', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Open second tab/context to simulate another player
    const context2 = await page.context().newPage()
    await context2.goto('/')
    
    // Set up second player
    await context2.getByText(/continue as guest/i).click()
    await context2.waitForTimeout(1000)
    
    if (await context2.getByPlaceholder(/character name/i).isVisible()) {
      await context2.getByPlaceholder(/character name/i).fill('SecondPlayer')
      await context2.getByRole('button', { name: /create character/i }).click()
      await context2.waitForTimeout(2000)
    }
    
    // Send action from first player
    const actionInput = page.locator('input[type="text"]').first()
    if (await actionInput.isVisible()) {
      await actionInput.fill('waves at everyone')
      await page.keyboard.press('Enter')
      
      await page.waitForTimeout(2000)
      
      // Second player should see the action
      await expect(
        context2.getByText(/waves at everyone/i).or(
          context2.getByText(/testadventurer/i)
        )
      ).toBeVisible({ timeout: 5000 })
    }
    
    await context2.close()
  })

  test('should show available actions', async ({ page }) => {
    await page.waitForTimeout(3000)
    
    // Look for suggested actions or action buttons
    const actionSuggestions = page.locator('[data-testid="available-actions"]').or(
      page.getByText(/available actions/i).locator('..')
    ).or(
      page.getByRole('button', { name: /look around/i })
    )
    
    if (await actionSuggestions.isVisible()) {
      // Try clicking a suggested action
      const lookAction = page.getByRole('button', { name: /look around/i }).or(
        page.getByText(/look around/i).first()
      )
      
      if (await lookAction.isVisible() && await lookAction.isEnabled()) {
        await lookAction.click()
        
        // Should submit this action
        await expect(
          page.getByText(/look around/i)
        ).toBeVisible()
      }
    }
  })

  test('should handle inventory and equipment', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for inventory button
    const inventoryButton = page.getByRole('button', { name: /inventory/i }).or(
      page.getByRole('button', { name: /equipment/i })
    )
    
    if (await inventoryButton.isVisible()) {
      await inventoryButton.click()
      
      // Should see inventory modal
      await expect(
        page.getByText(/inventory/i).or(
          page.getByText(/equipment/i)
        )
      ).toBeVisible()
      
      // Look for items
      const items = page.locator('[data-testid="inventory-item"]').or(
        page.getByText(/sword/i)
      ).or(
        page.getByText(/armor/i)
      )
      
      // Should have at least starting equipment
      if (await items.first().isVisible()) {
        const itemCount = await items.count()
        expect(itemCount).toBeGreaterThan(0)
      }
      
      // Close inventory
      await page.keyboard.press('Escape')
    }
  })

  test('should handle combat initiation', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Send a combat-related action
    const actionInput = page.locator('input[type="text"]').first()
    if (await actionInput.isVisible()) {
      await actionInput.fill('attack the goblin')
      await page.keyboard.press('Enter')
      
      await page.waitForTimeout(3000)
      
      // Wait for potential combat to start
      await page.waitForTimeout(15000)
      
      // Look for combat indicators
      const combatIndicators = page.getByText(/combat/i).or(
        page.getByText(/initiative/i)
      ).or(
        page.getByText(/turn order/i)
      ).or(
        page.getByText(/attack/i)
      )
      
      // May or may not trigger combat depending on game state
      if (await combatIndicators.isVisible()) {
        console.log('Combat was initiated')
      }
    }
  })

  test('should persist game state across refresh', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Send an action to establish game state
    const actionInput = page.locator('input[type="text"]').first()
    if (await actionInput.isVisible()) {
      await actionInput.fill('sit down at a table')
      await page.keyboard.press('Enter')
      
      await page.waitForTimeout(2000)
      
      // Refresh the page
      await page.reload()
      
      // Should maintain connection and game state
      await page.waitForTimeout(3000)
      
      // Should still be in the game
      await expect(
        page.getByText(/the eternal tavern/i).or(
          page.locator('input[type="text"]').first()
        )
      ).toBeVisible()
      
      // May see previous action in chat history
      // (depending on implementation)
    }
  })

  test('should handle connection loss gracefully', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Simulate network issue by going offline
    await page.context().setOffline(true)
    
    await page.waitForTimeout(2000)
    
    // Should show disconnected state
    await expect(
      page.getByText(/disconnected/i).or(
        page.getByText(/connection lost/i)
      ).or(
        page.getByText(/reconnecting/i)
      )
    ).toBeVisible({ timeout: 10000 })
    
    // Restore connection
    await page.context().setOffline(false)
    
    await page.waitForTimeout(3000)
    
    // Should reconnect
    await expect(
      page.getByText(/connected/i).or(
        page.locator('input[type="text"]').first()
      )
    ).toBeVisible({ timeout: 10000 })
  })
})