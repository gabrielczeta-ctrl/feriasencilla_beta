# D&D Platform Testing Guide

This document provides a comprehensive overview of the testing strategy and implementation for the D&D Platform.

## 🎯 Testing Strategy Overview

Our testing approach follows the testing pyramid with three main layers:

### 1. Unit Tests (Base of Pyramid - 70%)
- **Backend**: Server logic, user management, Claude AI integration
- **Frontend**: Hooks, contexts, utilities, and components
- **Coverage Target**: 70%+

### 2. Integration Tests (Middle - 20%)
- WebSocket communication
- Database operations
- API interactions
- Component integration

### 3. End-to-End Tests (Top - 10%)
- Complete user flows
- Cross-browser compatibility
- Real-world scenarios

## 🏗️ Test Infrastructure

### Testing Frameworks & Tools

**Backend Testing:**
- **Jest**: Test runner and assertion library
- **Supertest**: HTTP API testing
- **WebSocket Client**: WebSocket connection testing

**Frontend Testing:**
- **Jest**: Test runner
- **React Testing Library**: Component testing
- **Jest DOM**: DOM assertion utilities
- **User Event**: User interaction simulation

**E2E Testing:**
- **Playwright**: Browser automation and testing
- **Multi-browser**: Chrome, Firefox, Safari support

### Mock Strategy

**External Services:**
- Redis: Mocked with in-memory implementation
- Anthropic API: Mocked responses for deterministic tests
- WebSocket: Mocked connections for unit tests

**Internal Services:**
- User authentication flows
- Character data persistence
- Real-time communication

## 📁 Test Structure

```
project/
├── server/
│   ├── __tests__/
│   │   ├── dnd-server.test.js
│   │   ├── claude-dm.test.js
│   │   ├── userManager.test.js
│   │   └── globalGameManager.test.js
│   ├── jest.config.js
│   └── jest.setup.js
├── app/
│   ├── hooks/
│   │   └── __tests__/
│   │       └── useDnDWebSocket.test.tsx
│   ├── contexts/
│   │   └── __tests__/
│   │       └── GameStateContext.test.tsx
│   └── components/
│       └── __tests__/
│           ├── AuthModal.test.tsx
│           └── CharacterSheet.test.tsx
├── e2e/
│   ├── auth-flow.spec.ts
│   ├── character-creation.spec.ts
│   └── gameplay.spec.ts
├── jest.config.js
├── jest.setup.js
├── playwright.config.ts
└── test-runner.sh
```

## 🔧 Running Tests

### Quick Start

```bash
# Run all tests (backend + frontend)
./test-runner.sh

# Run with coverage
./test-runner.sh --coverage

# Run specific test suites
./test-runner.sh --backend-only
./test-runner.sh --frontend-only
./test-runner.sh --e2e-only

# Run all including E2E
./test-runner.sh --all
```

### Individual Test Commands

```bash
# Backend tests
cd server && npm test
cd server && npm run test:coverage

# Frontend tests
npm test
npm run test:coverage

# E2E tests (requires servers running)
npm run test:e2e
```

### Watch Mode (Development)

```bash
# Backend
cd server && npm run test:watch

# Frontend
npm run test:watch
```

## 📊 Test Coverage

### Coverage Targets

- **Overall**: 70%+ line coverage
- **Critical Paths**: 90%+ (authentication, character management, WebSocket communication)
- **Business Logic**: 80%+ (game mechanics, AI interactions)

### Coverage Reports

After running tests with `--coverage`, view reports:
- Backend: `server/coverage/lcov-report/index.html`
- Frontend: `coverage/lcov-report/index.html`

### CI/CD Integration

Coverage reports are generated in CI and can be integrated with:
- GitHub Actions
- Codecov/Coveralls
- SonarQube

## 🧪 Test Categories

### Backend Tests

#### 1. Server Core (`dnd-server.test.js`)
- WebSocket connection handling
- Message routing and validation
- Rate limiting
- Room management
- Character creation/updates
- Dice rolling system
- Error handling

#### 2. Claude AI Integration (`claude-dm.test.js`)
- Campaign story generation
- Player action processing
- Dice result integration
- Equipment generation
- Loot generation
- Fallback responses
- Error handling

#### 3. User Management (`userManager.test.js`)
- User registration/authentication
- Password hashing/verification
- Session management
- Character persistence
- Redis vs in-memory storage
- Error scenarios

#### 4. Global Game Manager (`globalGameManager.test.js`)
- Player management
- Turn-based mechanics
- Battle map system
- Real-time updates
- State persistence
- Performance optimization

### Frontend Tests

#### 1. WebSocket Hook (`useDnDWebSocket.test.tsx`)
- Connection management
- Message handling
- Reconnection logic
- Action sending
- State synchronization
- Error recovery

#### 2. Game State Context (`GameStateContext.test.tsx`)
- State mutations
- Action dispatching
- Notification system
- Modal management
- Phase transitions
- Type safety

#### 3. Authentication Modal (`AuthModal.test.tsx`)
- Form validation
- Login/register flows
- Error handling
- Loading states
- Accessibility
- User interactions

#### 4. Character Sheet (`CharacterSheet.test.tsx`)
- Character display
- Stat modifications
- Equipment management
- Dice rolling
- Form validation
- Save/update operations

### End-to-End Tests

#### 1. Authentication Flow (`auth-flow.spec.ts`)
- Login/register workflows
- Form validation
- Guest access
- Connection status
- Error scenarios
- Security features

#### 2. Character Creation (`character-creation.spec.ts`)
- Character creation wizard
- Stat allocation
- Equipment selection
- AI generation
- Data persistence
- Navigation flows

#### 3. Gameplay (`gameplay.spec.ts`)
- Real-time interactions
- Turn-based mechanics
- Multi-player scenarios
- DM responses
- Combat system
- State persistence

## 🔍 Testing Best Practices

### Writing Good Tests

1. **Arrange-Act-Assert Pattern**
   ```javascript
   test('should calculate ability modifier correctly', () => {
     // Arrange
     const abilityScore = 16
     
     // Act
     const modifier = calculateModifier(abilityScore)
     
     // Assert
     expect(modifier).toBe(3)
   })
   ```

2. **Descriptive Test Names**
   ```javascript
   // Good ✅
   test('should reject login with invalid password')
   
   // Bad ❌
   test('login test')
   ```

3. **Test One Thing at a Time**
   ```javascript
   // Good ✅
   test('should validate username length')
   test('should validate password strength')
   
   // Bad ❌
   test('should validate login form')
   ```

### Mock Guidelines

1. **Mock External Dependencies**
   ```javascript
   jest.mock('@anthropic-ai/sdk')
   jest.mock('ioredis')
   ```

2. **Avoid Over-Mocking**
   - Mock at module boundaries
   - Don't mock internal functions
   - Use real objects when possible

3. **Deterministic Mocks**
   ```javascript
   mockWebSocket.send = jest.fn().mockResolvedValue(undefined)
   ```

### Async Testing

```javascript
// Promises
test('should authenticate user', async () => {
  const result = await userManager.authenticateUser('user', 'pass')
  expect(result.success).toBe(true)
})

// Timers
test('should timeout after delay', () => {
  jest.useFakeTimers()
  const callback = jest.fn()
  
  setTimeout(callback, 1000)
  jest.advanceTimersByTime(1000)
  
  expect(callback).toHaveBeenCalled()
  jest.useRealTimers()
})
```

## 🚀 Continuous Integration

### GitHub Actions Example

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          npm install
          cd server && npm install
      
      - name: Run tests
        run: ./test-runner.sh --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## 🐛 Debugging Tests

### Common Issues

1. **Async Operations Not Awaited**
   ```javascript
   // Add proper awaits and timeouts
   await waitFor(() => expect(element).toBeVisible())
   ```

2. **Mock Cleanup**
   ```javascript
   beforeEach(() => {
     jest.clearAllMocks()
   })
   ```

3. **WebSocket Timing**
   ```javascript
   // Allow time for WebSocket connections
   await page.waitForTimeout(1000)
   ```

### Debug Tools

```bash
# Run single test with verbose output
npm test -- --verbose AuthModal.test.tsx

# Debug mode
node --inspect-brk node_modules/.bin/jest --runInBand

# Playwright debug
npx playwright test --debug
```

## 📈 Performance Testing

### Load Testing
- WebSocket connection limits
- Concurrent player handling
- Memory usage patterns
- Response time metrics

### Benchmarks
- Character creation speed
- AI response latency
- Database query performance
- Real-time update delivery

## 🔄 Test Maintenance

### Regular Tasks
1. **Update test data** when game mechanics change
2. **Review mock accuracy** with API updates
3. **Add regression tests** for bug fixes
4. **Optimize slow tests** for better developer experience
5. **Update E2E tests** with UI changes

### Refactoring Tests
- Extract common test utilities
- Share fixtures between tests
- Maintain test readability
- Remove obsolete tests

## 📚 Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

---

For questions or issues with testing, please check the project's issue tracker or contact the development team.