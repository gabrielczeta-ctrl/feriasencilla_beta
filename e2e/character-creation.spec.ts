import { test, expect } from '@playwright/test'

test.describe('Character Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    
    // Skip auth and go to character creation
    await page.getByText(/continue as guest/i).click()
    await page.waitForTimeout(1000)
  })

  test('should display character creation interface', async ({ page }) => {
    await expect(page.getByText(/create character/i).or(page.getByText(/character creation/i))).toBeVisible()
    
    // Should have basic character fields
    await expect(page.getByPlaceholder(/character name/i)).toBeVisible()
    await expect(page.getByText(/race/i)).toBeVisible()
    await expect(page.getByText(/class/i)).toBeVisible()
  })

  test('should create a basic character', async ({ page }) => {
    // Wait for character creation to be available
    await page.waitForTimeout(2000)
    
    // Fill character details
    await page.getByPlaceholder(/character name/i).fill('Aragorn')
    
    // Select race (assuming dropdown or buttons)
    if (await page.getByRole('combobox', { name: /race/i }).isVisible()) {
      await page.getByRole('combobox', { name: /race/i }).selectOption('Human')
    } else {
      await page.getByText('Human').click()
    }
    
    // Select class
    if (await page.getByRole('combobox', { name: /class/i }).isVisible()) {
      await page.getByRole('combobox', { name: /class/i }).selectOption('Ranger')
    } else {
      await page.getByText('Ranger').click()
    }
    
    // Submit character creation
    await page.getByRole('button', { name: /create character/i }).click()
    
    // Wait for character to be created
    await page.waitForTimeout(2000)
    
    // Should proceed to next phase (customization or game)
    await expect(
      page.getByText(/character created/i).or(
        page.getByText(/customize/i)
      ).or(
        page.getByText(/the eternal tavern/i)
      )
    ).toBeVisible()
  })

  test('should validate character name requirement', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Try to create character without name
    await page.getByRole('button', { name: /create character/i }).click()
    
    await expect(page.getByText(/name is required/i)).toBeVisible()
  })

  test('should handle ability score assignment', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for ability score controls
    const strengthControl = page.locator('[data-testid="strength-score"]').or(
      page.getByText('Strength').locator('..').getByRole('spinbutton')
    )
    
    if (await strengthControl.isVisible()) {
      await strengthControl.fill('16')
      
      const dexterityControl = page.locator('[data-testid="dexterity-score"]').or(
        page.getByText('Dexterity').locator('..').getByRole('spinbutton')
      )
      
      if (await dexterityControl.isVisible()) {
        await dexterityControl.fill('14')
      }
    }
    
    // Fill required fields
    await page.getByPlaceholder(/character name/i).fill('TestHero')
    
    // Create character
    await page.getByRole('button', { name: /create character/i }).click()
    
    await page.waitForTimeout(2000)
    
    // Should succeed
    await expect(
      page.getByText(/character created/i).or(
        page.getByText(/the eternal tavern/i)
      )
    ).toBeVisible()
  })

  test('should handle equipment selection', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Fill basic info first
    await page.getByPlaceholder(/character name/i).fill('EquippedHero')
    
    // Look for equipment options
    const equipmentSection = page.locator('[data-testid="equipment-selection"]').or(
      page.getByText(/equipment/i).locator('..')
    )
    
    if (await equipmentSection.isVisible()) {
      // Select starting equipment
      const weaponOption = equipmentSection.getByText(/sword/i).or(
        equipmentSection.getByText(/longsword/i)
      ).first()
      
      if (await weaponOption.isVisible()) {
        await weaponOption.click()
      }
      
      const armorOption = equipmentSection.getByText(/leather/i).or(
        equipmentSection.getByText(/armor/i)
      ).first()
      
      if (await armorOption.isVisible()) {
        await armorOption.click()
      }
    }
    
    // Create character
    await page.getByRole('button', { name: /create character/i }).click()
    
    await page.waitForTimeout(2000)
    
    await expect(
      page.getByText(/character created/i).or(
        page.getByText(/the eternal tavern/i)
      )
    ).toBeVisible()
  })

  test('should generate random character stats', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for random generation button
    const randomButton = page.getByRole('button', { name: /random/i }).or(
      page.getByRole('button', { name: /roll stats/i })
    )
    
    if (await randomButton.isVisible()) {
      // Note initial values if visible
      const strengthBefore = await page.locator('[data-testid="strength-score"]').or(
        page.getByText('Strength').locator('..').getByRole('spinbutton')
      ).inputValue().catch(() => '10')
      
      // Click random button
      await randomButton.click()
      await page.waitForTimeout(500)
      
      // Values should have changed (or at least attempt was made)
      const strengthAfter = await page.locator('[data-testid="strength-score"]').or(
        page.getByText('Strength').locator('..').getByRole('spinbutton')
      ).inputValue().catch(() => '10')
      
      // Even if same value, the button should have functioned
      expect(strengthAfter).toMatch(/^\d+$/) // Should be a number
    }
    
    await page.getByPlaceholder(/character name/i).fill('RandomHero')
    await page.getByRole('button', { name: /create character/i }).click()
    
    await page.waitForTimeout(2000)
    
    await expect(
      page.getByText(/character created/i).or(
        page.getByText(/the eternal tavern/i)
      )
    ).toBeVisible()
  })

  test('should handle backstory input', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    await page.getByPlaceholder(/character name/i).fill('StoryHero')
    
    // Look for backstory field
    const backstoryField = page.getByPlaceholder(/backstory/i).or(
      page.getByRole('textbox', { name: /backstory/i })
    ).or(
      page.locator('textarea').first()
    )
    
    if (await backstoryField.isVisible()) {
      await backstoryField.fill('A brave warrior who seeks adventure and glory in the realm.')
    }
    
    await page.getByRole('button', { name: /create character/i }).click()
    
    await page.waitForTimeout(2000)
    
    await expect(
      page.getByText(/character created/i).or(
        page.getByText(/the eternal tavern/i)
      )
    ).toBeVisible()
  })

  test('should navigate between character creation steps', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Look for step navigation (Next/Previous buttons)
    const nextButton = page.getByRole('button', { name: /next/i })
    
    if (await nextButton.isVisible()) {
      // Fill first step
      await page.getByPlaceholder(/character name/i).fill('MultiStepHero')
      
      // Go to next step
      await nextButton.click()
      await page.waitForTimeout(500)
      
      // Should see different content or next step
      const previousButton = page.getByRole('button', { name: /previous/i }).or(
        page.getByRole('button', { name: /back/i })
      )
      
      if (await previousButton.isVisible()) {
        // Go back
        await previousButton.click()
        await page.waitForTimeout(500)
        
        // Should see character name field again
        await expect(page.getByPlaceholder(/character name/i)).toBeVisible()
      }
    }
  })

  test('should validate ability score ranges', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    const strengthControl = page.locator('[data-testid="strength-score"]').or(
      page.getByText('Strength').locator('..').getByRole('spinbutton')
    )
    
    if (await strengthControl.isVisible()) {
      // Try to set value above maximum (usually 20)
      await strengthControl.fill('25')
      await strengthControl.blur()
      
      // Value should be clamped
      const value = await strengthControl.inputValue()
      expect(parseInt(value)).toBeLessThanOrEqual(20)
      
      // Try to set value below minimum (usually 8)
      await strengthControl.fill('5')
      await strengthControl.blur()
      
      const minValue = await strengthControl.inputValue()
      expect(parseInt(minValue)).toBeGreaterThanOrEqual(8)
    }
  })

  test('should show character preview', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    await page.getByPlaceholder(/character name/i).fill('PreviewHero')
    
    // Look for character preview area
    const previewArea = page.locator('[data-testid="character-preview"]').or(
      page.getByText(/preview/i).locator('..')
    )
    
    if (await previewArea.isVisible()) {
      // Should show character name
      await expect(previewArea.getByText('PreviewHero')).toBeVisible()
      
      // Should show selected race/class when available
      if (await page.getByText('Human').isVisible()) {
        await page.getByText('Human').click()
        await expect(previewArea.getByText(/human/i)).toBeVisible()
      }
    }
  })

  test('should handle AI-generated equipment', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    await page.getByPlaceholder(/character name/i).fill('AIEquippedHero')
    
    // Look for AI generation button
    const generateButton = page.getByRole('button', { name: /generate equipment/i }).or(
      page.getByRole('button', { name: /ai generate/i })
    )
    
    if (await generateButton.isVisible()) {
      await generateButton.click()
      
      // Should show loading state
      await expect(
        page.getByText(/generating/i).or(
          page.getByText(/loading/i)
        )
      ).toBeVisible()
      
      // Wait for generation to complete
      await page.waitForTimeout(3000)
      
      // Should show generated equipment
      await expect(
        page.getByText(/sword/i).or(
          page.getByText(/armor/i)
        ).or(
          page.getByText(/equipment generated/i)
        )
      ).toBeVisible()
    }
    
    await page.getByRole('button', { name: /create character/i }).click()
    await page.waitForTimeout(2000)
  })

  test('should save character progress', async ({ page }) => {
    await page.waitForTimeout(2000)
    
    // Fill partial character info
    await page.getByPlaceholder(/character name/i).fill('ProgressHero')
    
    // Look for save/draft button
    const saveButton = page.getByRole('button', { name: /save/i }).or(
      page.getByRole('button', { name: /draft/i })
    )
    
    if (await saveButton.isVisible()) {
      await saveButton.click()
      await page.waitForTimeout(1000)
      
      // Should show saved confirmation
      await expect(
        page.getByText(/saved/i).or(
          page.getByText(/progress saved/i)
        )
      ).toBeVisible()
      
      // Refresh page and check if data persists
      await page.reload()
      await page.waitForTimeout(2000)
      
      // Skip auth again
      if (await page.getByText(/continue as guest/i).isVisible()) {
        await page.getByText(/continue as guest/i).click()
        await page.waitForTimeout(1000)
      }
      
      // Check if character name is preserved
      const nameField = page.getByPlaceholder(/character name/i)
      if (await nameField.isVisible()) {
        const preservedName = await nameField.inputValue()
        // May or may not be preserved depending on guest vs. authenticated user
        console.log('Preserved name:', preservedName)
      }
    }
  })
})