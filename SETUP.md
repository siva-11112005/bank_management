# 🚀 Quick Setup Guide - BankEase

## Prerequisites
- Node.js (v14+)
- MongoDB Atlas account
- Git

## Backend Setup (5 minutes)

### 1. Navigate to backend directory
```bash
cd backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create `.env` file
```bash
PORT=5000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/bankdb
JWT_SECRET=your_super_secret_key_12345
JWT_EXPIRE=7d
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

**To get MONGO_URI:**
1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free account
3. Create a cluster
4. Get connection string and replace username:password

### 4. Start Backend Server
```bash
npm run dev
```

✅ Backend should be running on `http://localhost:5000`

---

## Frontend Setup (5 minutes)

### 1. Navigate to frontend directory
```bash
cd frontend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Start Frontend Server
```bash
npm start
```

✅ Frontend should open on `http://localhost:3000`

---

## 🧪 Testing the Application

### 1. Register New User
- Go to `http://localhost:3000/register`
- Fill all details
- Click Register

### 2. Login
- Use registered email and password
- Redirects to Dashboard

### 3. Create Account
- On Dashboard, click "Create Account"
- Select account type, branch, IFSC
- Account created with initial balance 0

### 4. Deposit Money
- Go to Dashboard
- Click "💳 Deposit"
- Enter amount
- Check balance update

### 5. View Transactions
- Go to Transactions page
- See all your deposits/withdrawals

### 6. Transfer Money
- Click "💸 Transfer Money"
- Enter recipient's account number
- Transfer amount
- Both accounts updated

### 7. Admin Access
1. Register or login with the protected admin identity:
   - Email: `sivasakthivelpalanisamy11@gmail.com`
   - Phone: `7418042205`
2. Login as admin
3. Navigate to `/admin` to see Admin Dashboard
4. View all users, accounts, transactions, stats
5. Other users are automatically kept as `USER` unless `ALLOW_EXTRA_ADMINS=true` is explicitly configured.

---

## 🔑 Test Credentials

After registration, use any user email and password you created.

For admin testing, use the protected admin identity listed above.

---

## 📁 Key Files

### Backend
- `server.js` - Main server file
- `config/db.js` - Database connection
- `models/` - Mongoose schemas
- `controllers/` - Business logic
- `routes/` - API endpoints
- `middleware/` - Auth & Role checking

### Frontend
- `App.js` - Main app component
- `context/AuthContext.jsx` - Authentication state
- `pages/` - Page components
- `services/api.js` - API calls
- `components/` - Reusable components

---

## ⚡ Troubleshooting

### "Cannot connect to MongoDB"
- Check MONGO_URI in `.env`
- Add your IP to MongoDB Atlas whitelist
- Ensure network connectivity

### "CORS Error"
- Update CORS_ORIGIN in backend .env
- Restart backend server

### "Cannot find module"
- Delete `node_modules` folder
- Run `npm install` again

### Port already in use
- Change PORT in `.env` to 5001, 5002, etc.
- Or kill process using that port

---

## 📚 API Testing with Postman

1. Download [Postman](https://www.postman.com/downloads/)
2. Import endpoints from `README.md`
3. Test all routes with sample data

---

## 🚀 Production Ready

Before deploying:
1. Change JWT_SECRET to strong key
2. Set NODE_ENV to production
3. Setup HTTPS
4. Enable rate limiting
5. Add input validation
6. Setup logging

---

## 💡 Next Steps

- Add loan approval system
- Implement notifications
- Add image uploads (profile picture)
- Setup email verification
- Add 2FA (Two-Factor Authentication)
- Create mobile app

---

Happy Banking! 🏦
