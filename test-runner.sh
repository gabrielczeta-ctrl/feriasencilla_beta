#!/bin/bash

# D&D Platform Test Runner
# Comprehensive test suite for all systems

set -e

echo "🎲 D&D Platform Test Suite"
echo "========================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Default test types to run
RUN_BACKEND=1
RUN_FRONTEND=1
RUN_E2E=0
RUN_COVERAGE=0
INSTALL_DEPS=1

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backend-only)
            RUN_BACKEND=1
            RUN_FRONTEND=0
            RUN_E2E=0
            shift
            ;;
        --frontend-only)
            RUN_BACKEND=0
            RUN_FRONTEND=1
            RUN_E2E=0
            shift
            ;;
        --e2e-only)
            RUN_BACKEND=0
            RUN_FRONTEND=0
            RUN_E2E=1
            shift
            ;;
        --all)
            RUN_BACKEND=1
            RUN_FRONTEND=1
            RUN_E2E=1
            shift
            ;;
        --coverage)
            RUN_COVERAGE=1
            shift
            ;;
        --no-install)
            INSTALL_DEPS=0
            shift
            ;;
        --help)
            echo "D&D Platform Test Runner"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --backend-only   Run only backend tests"
            echo "  --frontend-only  Run only frontend tests"
            echo "  --e2e-only      Run only end-to-end tests"
            echo "  --all           Run all tests including E2E"
            echo "  --coverage      Generate coverage reports"
            echo "  --no-install    Skip dependency installation"
            echo "  --help          Show this help message"
            echo ""
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
print_status "Checking prerequisites..."

if ! command_exists node; then
    print_error "Node.js is not installed"
    exit 1
fi

if ! command_exists npm; then
    print_error "npm is not installed"
    exit 1
fi

NODE_VERSION=$(node --version | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18 or higher is required (found v$NODE_VERSION)"
    exit 1
fi

print_success "Prerequisites check passed"

# Install dependencies
if [ "$INSTALL_DEPS" -eq 1 ]; then
    print_status "Installing dependencies..."
    
    # Frontend dependencies
    npm install || {
        print_error "Failed to install frontend dependencies"
        exit 1
    }
    
    # Backend dependencies
    cd server
    npm install || {
        print_error "Failed to install backend dependencies"
        exit 1
    }
    cd ..
    
    print_success "Dependencies installed"
fi

# Initialize test results
BACKEND_EXIT_CODE=0
FRONTEND_EXIT_CODE=0
E2E_EXIT_CODE=0

# Run backend tests
if [ "$RUN_BACKEND" -eq 1 ]; then
    print_status "Running backend tests..."
    echo ""
    
    cd server
    if [ "$RUN_COVERAGE" -eq 1 ]; then
        npm run test:coverage || BACKEND_EXIT_CODE=$?
    else
        npm test || BACKEND_EXIT_CODE=$?
    fi
    cd ..
    
    if [ "$BACKEND_EXIT_CODE" -eq 0 ]; then
        print_success "Backend tests passed"
    else
        print_error "Backend tests failed"
    fi
    echo ""
fi

# Run frontend tests
if [ "$RUN_FRONTEND" -eq 1 ]; then
    print_status "Running frontend tests..."
    echo ""
    
    if [ "$RUN_COVERAGE" -eq 1 ]; then
        npm run test:coverage || FRONTEND_EXIT_CODE=$?
    else
        npm test -- --watchAll=false || FRONTEND_EXIT_CODE=$?
    fi
    
    if [ "$FRONTEND_EXIT_CODE" -eq 0 ]; then
        print_success "Frontend tests passed"
    else
        print_error "Frontend tests failed"
    fi
    echo ""
fi

# Run E2E tests
if [ "$RUN_E2E" -eq 1 ]; then
    print_status "Running end-to-end tests..."
    print_warning "Starting servers for E2E tests..."
    
    # Start the servers in background
    npm run dev &
    FRONTEND_PID=$!
    
    npm run server:dev &
    SERVER_PID=$!
    
    # Wait for servers to start
    sleep 10
    
    # Install Playwright browsers if needed
    if ! command_exists playwright; then
        cd __tests__ && npx playwright install || {
            print_error "Failed to install Playwright browsers"
            kill $FRONTEND_PID $SERVER_PID 2>/dev/null || true
            exit 1
        }
        cd ..
    fi
    
    # Run E2E tests
    npm run test:e2e || E2E_EXIT_CODE=$?
    
    # Kill the servers
    kill $FRONTEND_PID $SERVER_PID 2>/dev/null || true
    
    if [ "$E2E_EXIT_CODE" -eq 0 ]; then
        print_success "E2E tests passed"
    else
        print_error "E2E tests failed"
    fi
    echo ""
fi

# Generate test summary
echo "🎲 Test Results Summary"
echo "======================"
echo ""

if [ "$RUN_BACKEND" -eq 1 ]; then
    if [ "$BACKEND_EXIT_CODE" -eq 0 ]; then
        echo -e "Backend Tests:  ${GREEN}✅ PASSED${NC}"
    else
        echo -e "Backend Tests:  ${RED}❌ FAILED${NC}"
    fi
fi

if [ "$RUN_FRONTEND" -eq 1 ]; then
    if [ "$FRONTEND_EXIT_CODE" -eq 0 ]; then
        echo -e "Frontend Tests: ${GREEN}✅ PASSED${NC}"
    else
        echo -e "Frontend Tests: ${RED}❌ FAILED${NC}"
    fi
fi

if [ "$RUN_E2E" -eq 1 ]; then
    if [ "$E2E_EXIT_CODE" -eq 0 ]; then
        echo -e "E2E Tests:      ${GREEN}✅ PASSED${NC}"
    else
        echo -e "E2E Tests:      ${RED}❌ FAILED${NC}"
    fi
fi

echo ""

# Coverage reports
if [ "$RUN_COVERAGE" -eq 1 ]; then
    echo "📊 Coverage Reports"
    echo "=================="
    echo ""
    
    if [ "$RUN_BACKEND" -eq 1 ] && [ -d "server/coverage" ]; then
        echo "Backend coverage: server/coverage/lcov-report/index.html"
    fi
    
    if [ "$RUN_FRONTEND" -eq 1 ] && [ -d "coverage" ]; then
        echo "Frontend coverage: coverage/lcov-report/index.html"
    fi
    
    echo ""
fi

# Exit with appropriate code
TOTAL_EXIT_CODE=0

if [ "$RUN_BACKEND" -eq 1 ] && [ "$BACKEND_EXIT_CODE" -ne 0 ]; then
    TOTAL_EXIT_CODE=1
fi

if [ "$RUN_FRONTEND" -eq 1 ] && [ "$FRONTEND_EXIT_CODE" -ne 0 ]; then
    TOTAL_EXIT_CODE=1
fi

if [ "$RUN_E2E" -eq 1 ] && [ "$E2E_EXIT_CODE" -ne 0 ]; then
    TOTAL_EXIT_CODE=1
fi

if [ "$TOTAL_EXIT_CODE" -eq 0 ]; then
    print_success "All tests passed! 🎉"
else
    print_error "Some tests failed. Please check the output above."
fi

exit $TOTAL_EXIT_CODE