# BankEase - Bank Management MERN Application

A secure, full-stack bank management system built with MERN (MongoDB, Express, React, Node.js) stack.

## 🚀 Features

### User Features
- ✅ **Secure Authentication** - JWT-based login/signup with bcrypt password hashing
- ✅ **Account Management** - Create and manage bank accounts
- ✅ **Transactions** - Deposit, Withdraw, and Transfer money
- ✅ **Transaction History** - View complete transaction records
- ✅ **Loan Management** - Apply for and track loans
- ✅ **Profile Management** - Update personal information

### Admin Features
- ✅ **Admin Dashboard** - View system statistics
- ✅ **User Management** - Monitor and manage users
- ✅ **Account Management** - Control account status
- ✅ **Transaction Monitoring** - View all transactions
- ✅ **System Analytics** - Track balance and loan data

## 🔒 Security Architecture

### 1. Authentication (JWT)
```javascript
// Password hashing with bcrypt
bcrypt.hash(password, 10)

// JWT token generation
jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET)

// HTTP-Only Cookies / LocalStorage
res.cookie("token", token, { httpOnly: true, secure: true })
```

### 2. Authorization (Role-Based)
- **USER** - Basic banking operations
- **ADMIN** - System management and monitoring

### 3. Middleware Protection
- Token verification in auth middleware
- Role-based access control
- Protected routes on frontend

### 4. Password Security
- bcrypt hashing (10 salt rounds)
- No plain passwords in database
- Password matching at login

### 5. Database Security
- MongoDB Atlas IP Whitelisting
- Environment variables for credentials
- No hardcoded secrets

### 6. Additional Security
- Rate limiting (can be added)
- CORS protection
- Input validation
- NoSQL injection prevention

## 📁 Project Structure

```
bank-management-mern/
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── ProtectedRoute.jsx
│   │   │   └── Loader.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Transactions.jsx
│   │   │   ├── Loans.jsx
│   │   │   └── AdminPanel.jsx
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
│
├── backend/
│   ├── config/
│   │   └── db.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Account.js
│   │   ├── Transaction.js
│   │   └── Loan.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── accountRoutes.js
│   │   ├── transactionRoutes.js
│   │   └── adminRoutes.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── accountController.js
│   │   └── transactionController.js
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   └── roleMiddleware.js
│   ├── server.js
│   ├── .env
│   └── package.json
│
└── README.md
```

## 🛠️ Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - NoSQL database
- **Mongoose** - ODM for MongoDB
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **CORS** - Cross-Origin Resource Sharing
- **Cookie Parser** - Cookie middleware

### Frontend
- **React** - UI library
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **CSS3** - Styling

## 📋 Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- MongoDB Atlas account

### Backend Setup

1. **Install dependencies**
```bash
cd backend
npm install
```

2. **Configure environment variables**
Create `.env` file:
```
PORT=5000
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/bankdb
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRE=7d
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

3. **Start backend server**
```bash
npm run dev
```

### Frontend Setup

1. **Install dependencies**
```bash
cd frontend
npm install
```

2. **Create `.env` file** (optional)
```
REACT_APP_API_URL=http://localhost:5000/api
```

3. **Start frontend server**
```bash
npm start
```

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update profile
- `POST /api/auth/logout` - Logout

### Accounts
- `POST /api/accounts/create` - Create account
- `GET /api/accounts/my-account` - Get user's account
- `GET /api/accounts` - Get all accounts (Admin)
- `GET /api/accounts/:id` - Get account by ID (Admin)
- `POST /api/accounts/deposit` - Deposit money
- `POST /api/accounts/withdraw` - Withdraw money

### Transactions
- `GET /api/transactions/my-transactions` - Get user transactions
- `GET /api/transactions` - Get all transactions (Admin)
- `POST /api/transactions/deposit` - Deposit with transaction logging
- `POST /api/transactions/withdraw` - Withdraw with transaction logging
- `POST /api/transactions/transfer` - Transfer between accounts

### Admin
- `GET /api/admin/stats` - Get system statistics
- `GET /api/admin/users` - Get all users
- `GET /api/admin/accounts` - Get all accounts
- `GET /api/admin/transactions` - Get all transactions
- `PUT /api/admin/users/:id/deactivate` - Deactivate user
- `PUT /api/admin/users/:id/activate` - Activate user

## 🔐 User Roles

### Regular User
- Create personal account
- View account balance
- Deposit/Withdraw money
- Transfer to other accounts
- View transaction history
- Apply for loans

### Admin
- View all users
- Monitor all accounts
- Check all transactions
- View system statistics
- Manage user accounts
- Approve/Reject loans

## 🎨 UI/UX Features

- **Responsive Design** - Works on all devices
- **Modern UI** - Gradient backgrounds and smooth animations
- **Form Validation** - Client-side validation
- **Loading States** - Visual feedback during operations
- **Error Handling** - Clear error messages
- **Dark Mode Ready** - Easy to extend

## 📦 Database Models

### User
```
firstName, lastName, email, phone, password, aadhar, address, role, isActive
```

### Account
```
userId, accountNumber, accountType, balance, ifscCode, branch, status
```

### Transaction
```
accountId, userId, type, amount, description, recipientAccountId, status, balanceAfterTransaction
```

### Loan
```
userId, accountId, loanType, principal, interestRate, tenure, emi, status, amountPaid, remainingAmount
```

## 🚀 Deployment

### Backend (Heroku/Railway)
1. Install Heroku CLI
2. Create `Procfile`
3. Deploy: `git push heroku main`

### Frontend (Vercel/Netlify)
1. `npm run build`
2. Deploy build folder to Vercel/Netlify

### Render (Recommended)
This repo now includes `render.yaml` with 3 services:
- `bankease-api` (Node web API)
- `bankease-jobs` (Node worker for schedulers/cron-like jobs)
- `bankease-frontend` (Static React app)

Quick steps:
1. Push this repo to GitHub.
2. In Render, choose **New + -> Blueprint** and select this repository.
3. Fill required env values in Render dashboard:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `FRONTEND_URL`
   - `CORS_ORIGIN`
   - `REACT_APP_API_URL`
   - `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM_ADDRESS` (if OTP/email needed)
4. Keep cookie settings for cross-domain deploy:
   - `COOKIE_SAME_SITE=none`
   - `COOKIE_SECURE=true`

Note:
- Scheduler jobs are intentionally disabled on API service and enabled on worker service to avoid duplicate execution.

### Render Single Web Service (Backend + Frontend Together)
If you want only one Render web service:

1. Service type: `Web Service (Node)`
2. Root Directory: `bank-management-mern`
3. Build Command:
   ```bash
   cd frontend && npm install && npm run build && cd ../backend && npm install
   ```
4. Start Command:
   ```bash
   cd backend && npm start
   ```
5. Required env values:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `NODE_ENV=production`
   - `FRONTEND_URL=https://<same-service>.onrender.com`
   - `CORS_ORIGIN=https://<same-service>.onrender.com`
   - `FRONTEND_BUILD_PATH=../frontend/build`

In this mode backend serves React build from `frontend/build`.

Post-deploy smoke test:
1. Open backend folder:
   ```bash
   cd backend
   ```
2. Run checks:
   ```bash
   API_BASE_URL=https://your-backend-service.onrender.com CHECK_CORS_ORIGIN=https://your-frontend-service.onrender.com npm run deploy:check
   ```
3. Optional auth flow check (login + profile):
   ```bash
   API_BASE_URL=https://your-backend-service.onrender.com CHECK_CORS_ORIGIN=https://your-frontend-service.onrender.com CHECK_LOGIN_EMAIL=your_test_user_email CHECK_LOGIN_PASSWORD=your_test_user_password npm run deploy:check
   ```

4. Full checklist:
   - `RENDER_POST_DEPLOY_CHECKLIST.md`

## 📚 Learning Resources
- [MERN Stack Guide](https://www.mongodb.com/languages/mean-stack)
- [JWT Authentication](https://jwt.io/)
- [React Router](https://reactrouter.com/)
- [MongoDB Documentations](https://docs.mongodb.com/)

## 🤝 Contributing

Feel free to fork this project and submit pull requests for any improvements.

## 📄 License

MIT License - feel free to use this project for learning purposes.

## 💡 Future Enhancements

- [ ] Mobile app (React Native)
- [ ] Two-factor authentication
- [ ] Advanced loan management system
- [ ] Bill payment integration
- [ ] Investment portfolio
- [ ] Cryptocurrency support
- [ ] Real-time notifications
- [ ] Advanced analytics dashboard

## 📞 Support

For issues and questions, please open an issue in the repository.

---

**Built with ❤️ for secure banking**

## Docker Deployment

Use one-command full stack startup:

```bash
docker compose build
docker compose up -d
```

Frontend: `http://localhost:3000`  
Backend health: `http://localhost:5000/api/health`

Detailed step-by-step guide:
- `DOCKER_SETUP.md`
