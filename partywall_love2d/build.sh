#!/bin/bash

# Partywall Love2D Build Script
# Cross-platform distribution builder

set -e  # Exit on any error

PROJECT_NAME="partywall_multiplayer_canvas"
VERSION="1.0.0"
BUILD_DIR="builds"
DIST_DIR="dist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${BLUE}[BUILD]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check dependencies
check_dependencies() {
    log "Checking build dependencies..."
    
    if ! command -v love &> /dev/null; then
        error "Love2D not found. Please install Love2D from https://love2d.org/"
        exit 1
    fi
    
    if ! command -v zip &> /dev/null; then
        warning "zip not found. Some build targets may not work."
    fi
    
    success "Dependencies check passed"
}

# Create build directories
setup_directories() {
    log "Setting up build directories..."
    
    rm -rf "$BUILD_DIR" "$DIST_DIR"
    mkdir -p "$BUILD_DIR" "$DIST_DIR"
    
    success "Directories created"
}

# Create .love file (platform-independent)
build_love_file() {
    log "Building .love file..."
    
    # Exclude build files and git
    zip -9 -r "$BUILD_DIR/${PROJECT_NAME}.love" . \
        -x "*.git*" \
        -x "*builds/*" \
        -x "*dist/*" \
        -x "*.md" \
        -x "build.sh" \
        -x ".love-release" \
        -x "*.DS_Store"
    
    success ".love file created: $BUILD_DIR/${PROJECT_NAME}.love"
}

# Build Windows executable
build_windows() {
    log "Building Windows executable..."
    
    LOVE_WIN_URL="https://github.com/love2d/love/releases/download/11.4/love-11.4-win64.zip"
    LOVE_WIN_FILE="love-win64.zip"
    
    # Download Love2D Windows if not exists
    if [ ! -f "$LOVE_WIN_FILE" ]; then
        log "Downloading Love2D Windows..."
        curl -L -o "$LOVE_WIN_FILE" "$LOVE_WIN_URL"
    fi
    
    # Extract and setup
    unzip -q "$LOVE_WIN_FILE" -d "$BUILD_DIR/temp"
    mv "$BUILD_DIR/temp/love-11.4-win64" "$BUILD_DIR/windows"
    
    # Combine executable with .love file
    cat "$BUILD_DIR/windows/love.exe" "$BUILD_DIR/${PROJECT_NAME}.love" > "$BUILD_DIR/windows/${PROJECT_NAME}.exe"
    rm "$BUILD_DIR/windows/love.exe"
    rm "$BUILD_DIR/windows/lovec.exe"
    
    # Create distribution package
    cd "$BUILD_DIR"
    zip -9 -r "../$DIST_DIR/${PROJECT_NAME}-${VERSION}-windows.zip" windows/
    cd ..
    
    # Cleanup
    rm -rf "$BUILD_DIR/temp"
    
    success "Windows build completed: $DIST_DIR/${PROJECT_NAME}-${VERSION}-windows.zip"
}

# Build macOS application
build_macos() {
    log "Building macOS application..."
    
    LOVE_MAC_URL="https://github.com/love2d/love/releases/download/11.4/love-11.4-macos.zip"
    LOVE_MAC_FILE="love-macos.zip"
    
    # Download Love2D macOS if not exists
    if [ ! -f "$LOVE_MAC_FILE" ]; then
        log "Downloading Love2D macOS..."
        curl -L -o "$LOVE_MAC_FILE" "$LOVE_MAC_URL"
    fi
    
    # Extract and setup
    unzip -q "$LOVE_MAC_FILE" -d "$BUILD_DIR/temp"
    cp -r "$BUILD_DIR/temp/love.app" "$BUILD_DIR/Partywall.app"
    
    # Copy .love file into app bundle
    cp "$BUILD_DIR/${PROJECT_NAME}.love" "$BUILD_DIR/Partywall.app/Contents/Resources/"
    
    # Update Info.plist
    PLIST="$BUILD_DIR/Partywall.app/Contents/Info.plist"
    if [ -f "$PLIST" ]; then
        # Update bundle name
        sed -i '' 's/<string>LÖVE<\/string>/<string>Partywall<\/string>/g' "$PLIST"
        sed -i '' 's/<string>org.love2d.love<\/string>/<string>com.partywall.canvas<\/string>/g' "$PLIST"
    fi
    
    # Create distribution package
    cd "$BUILD_DIR"
    zip -9 -r "../$DIST_DIR/${PROJECT_NAME}-${VERSION}-macos.zip" Partywall.app/
    cd ..
    
    # Cleanup
    rm -rf "$BUILD_DIR/temp"
    
    success "macOS build completed: $DIST_DIR/${PROJECT_NAME}-${VERSION}-macos.zip"
}

# Build Linux AppImage
build_linux() {
    log "Building Linux package..."
    
    LOVE_LINUX_URL="https://github.com/love2d/love/releases/download/11.4/love-11.4-linux-x86_64.tar.gz"
    LOVE_LINUX_FILE="love-linux.tar.gz"
    
    # Download Love2D Linux if not exists
    if [ ! -f "$LOVE_LINUX_FILE" ]; then
        log "Downloading Love2D Linux..."
        curl -L -o "$LOVE_LINUX_FILE" "$LOVE_LINUX_URL"
    fi
    
    # Extract and setup
    tar -xzf "$LOVE_LINUX_FILE" -C "$BUILD_DIR/temp"
    mv "$BUILD_DIR/temp/love-11.4-linux-x86_64" "$BUILD_DIR/linux"
    
    # Create launcher script
    cat > "$BUILD_DIR/linux/partywall" << 'EOF'
#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"
./love partywall_multiplayer_canvas.love
EOF
    
    chmod +x "$BUILD_DIR/linux/partywall"
    cp "$BUILD_DIR/${PROJECT_NAME}.love" "$BUILD_DIR/linux/"
    
    # Create distribution package
    cd "$BUILD_DIR"
    tar -czf "../$DIST_DIR/${PROJECT_NAME}-${VERSION}-linux.tar.gz" linux/
    cd ..
    
    # Cleanup
    rm -rf "$BUILD_DIR/temp"
    
    success "Linux build completed: $DIST_DIR/${PROJECT_NAME}-${VERSION}-linux.tar.gz"
}

# Generate checksums
generate_checksums() {
    log "Generating checksums..."
    
    cd "$DIST_DIR"
    sha256sum *.zip *.tar.gz *.love > checksums.txt 2>/dev/null || shasum -a 256 *.zip *.tar.gz *.love > checksums.txt
    cd ..
    
    success "Checksums generated: $DIST_DIR/checksums.txt"
}

# Main build function
main() {
    log "Starting Partywall Love2D build process..."
    
    check_dependencies
    setup_directories
    build_love_file
    
    # Copy .love file to dist for direct distribution
    cp "$BUILD_DIR/${PROJECT_NAME}.love" "$DIST_DIR/"
    
    # Build platform-specific versions
    case "${1:-all}" in
        "windows")
            build_windows
            ;;
        "macos")
            build_macos
            ;;
        "linux")
            build_linux
            ;;
        "love")
            # Already built
            ;;
        "all"|*)
            if [[ "$OSTYPE" == "darwin"* ]]; then
                build_macos
            fi
            if [[ "$OSTYPE" == "linux-gnu"* ]]; then
                build_linux
            fi
            if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
                build_windows
            fi
            ;;
    esac
    
    generate_checksums
    
    success "Build process completed! Check the '$DIST_DIR' directory."
    log "Available builds:"
    ls -la "$DIST_DIR"
}

# Handle command line arguments
case "${1:-}" in
    "-h"|"--help")
        echo "Partywall Love2D Build Script"
        echo ""
        echo "Usage: $0 [target]"
        echo ""
        echo "Targets:"
        echo "  all      Build for all available platforms (default)"
        echo "  love     Build .love file only"
        echo "  windows  Build Windows executable"
        echo "  macos    Build macOS application"
        echo "  linux    Build Linux package"
        echo ""
        exit 0
        ;;
    *)
        main "$1"
        ;;
esac