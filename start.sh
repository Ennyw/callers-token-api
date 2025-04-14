#!/bin/bash

# Change to the API directory
cd "$(dirname "$0")"

# Check if Node.js is installed
if ! command -v node &> /dev/null
then
    echo "Node.js is not installed. Please install Node.js to run this API."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Check for running server
PID=$(lsof -t -i:3001)
if [ -n "$PID" ]; then
    echo "Server is already running on port 3001 (PID: $PID)"
    echo "Would you like to restart it? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo "Stopping existing server..."
        kill $PID
        sleep 2
    else
        echo "Exiting..."
        exit 0
    fi
fi

# Start the server
echo "Starting Token API server..."
if [ "$1" == "prod" ]; then
    # Production mode
    export NODE_ENV=production
    node server.js
else
    # Development mode with auto-reload
    export NODE_ENV=development
    if command -v npx &> /dev/null; then
        npx nodemon server.js
    else
        node server.js
    fi
fi 