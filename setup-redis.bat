@echo off
REM Redis Setup Script for talent_track (Windows)

echo ================================
echo Redis Integration Setup Script
echo ================================
echo.

REM Check if Node modules are installed
if not exist "node_modules" (
    echo 📦 Installing npm dependencies...
    call npm install
) else (
    echo ✓ Node modules already installed
)

REM Check if Redis is running
echo Checking Redis connection...
redis-cli ping >nul 2>&1

if %errorlevel% equ 0 (
    echo ✓ Redis server is running on localhost:6379
) else (
    echo ✗ Redis server is not running
    echo.
    echo Setup options:
    echo 1. Using Docker (recommended):
    echo    docker run -d -p 6379:6379 redis:latest
    echo.
    echo 2. Using WSL2:
    echo    wsl redis-server
    echo.
    echo 3. Download Redis for Windows from:
    echo    https://github.com/microsoftarchive/redis/releases
    exit /b 1
)

echo.
echo ================================
echo Setup Complete!
echo ================================
echo.
echo To start the application:
echo   npm start
echo.
echo To monitor Redis:
echo   redis-cli
echo.
