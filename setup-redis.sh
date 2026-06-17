#!/bin/bash

# Redis Setup Script for talent_track

echo "================================"
echo "Redis Integration Setup Script"
echo "================================"
echo ""

# Check if Node modules are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
else
    echo "✓ Node modules already installed"
fi

# Check if Redis is installed
if command -v redis-server &> /dev/null; then
    echo "✓ Redis is installed"
    echo ""
    echo "Starting Redis server..."
    redis-server &
    sleep 2
    
    # Verify Redis is running
    if redis-cli ping > /dev/null 2>&1; then
        echo "✓ Redis server is running on localhost:6379"
    else
        echo "✗ Failed to start Redis server"
        exit 1
    fi
else
    echo "✗ Redis is not installed"
    echo ""
    echo "Installation instructions:"
    echo "  Linux:   sudo apt-get install redis-server"
    echo "  macOS:   brew install redis"
    echo "  Windows: Use Docker or WSL2"
    echo ""
    echo "For Docker:"
    echo "  docker run -d -p 6379:6379 redis:latest"
    exit 1
fi

echo ""
echo "================================"
echo "Setup Complete!"
echo "================================"
echo ""
echo "To start the application:"
echo "  npm start"
echo ""
echo "To monitor Redis:"
echo "  redis-cli"
echo ""
