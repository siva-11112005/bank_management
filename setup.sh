#!/bin/bash

echo "🚀 BankEase - Bank Management System"
echo "======================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install it first."
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo ""

# Backend setup and start
echo "📦 Setting up Backend..."
cd backend

if [ ! -d "node_modules" ]; then
    echo "Installing backend dependencies..."
    npm install
fi

# Check .env file
if [ ! -f ".env" ]; then
    echo "⚠️  .env file not found in backend directory"
    echo "📝 Please create .env with:"
    echo "   PORT=5000"
    echo "   MONGO_URI=your_mongodb_uri"
    echo "   JWT_SECRET=your_secret_key"
    echo "   JWT_EXPIRE=7d"
    echo "   NODE_ENV=development"
    echo "   CORS_ORIGIN=http://localhost:3000"
    exit 1
fi

echo "✅ Backend ready!"
echo ""

# Frontend setup
echo "📦 Setting up Frontend..."
cd ../frontend

if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo "✅ Frontend ready!"
echo ""

# Start both servers
echo "🎉 Starting servers..."
echo ""
echo "To start the application:"
echo "1. Open terminal in 'backend' directory and run: npm run dev"
echo "2. Open another terminal in 'frontend' directory and run: npm start"
echo ""
echo "Backend: http://localhost:5000"
echo "Frontend: http://localhost:3000"
echo ""
