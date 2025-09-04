describe('Basic Frontend Tests', () => {
  test('should perform basic calculations', () => {
    expect(2 + 2).toBe(4)
  })

  test('should handle string operations', () => {
    expect('hello world'.toUpperCase()).toBe('HELLO WORLD')
  })

  test('should work with arrays', () => {
    const arr = [1, 2, 3]
    expect(arr.length).toBe(3)
    expect(arr.includes(2)).toBe(true)
  })

  test('should validate dice expressions', () => {
    const isValidDice = (expr: string): boolean => {
      return /^\d+d\d+(\+\d+)?$/.test(expr)
    }

    expect(isValidDice('1d20')).toBe(true)
    expect(isValidDice('2d6+3')).toBe(true)
    expect(isValidDice('invalid')).toBe(false)
  })

  test('should calculate ability modifiers', () => {
    const getModifier = (score: number): number => {
      return Math.floor((score - 10) / 2)
    }

    expect(getModifier(16)).toBe(3)
    expect(getModifier(14)).toBe(2)
    expect(getModifier(10)).toBe(0)
    expect(getModifier(8)).toBe(-1)
  })
})