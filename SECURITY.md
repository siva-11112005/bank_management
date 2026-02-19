# 🏦 BankEase - Security Features Implementation Guide

## Overview
This document explains all the security features implemented in the BankEase bank management system and how they protect user data.

---

## 1️⃣ Authentication - JWT (JSON Web Tokens)

### How it works:
```javascript
// User Login Flow:
1. User sends email + password
2. Server verifies password using bcrypt.compare()
3. If valid, server generates JWT token
4. Token contains: { id: user._id, role: user.role }
5. Token sent to frontend
6. Frontend stores in localStorage
7. Frontend sends token in Authorization header for protected routes

// Token Generation:
const generateToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE } // 7 days
  );
};
```

### Security Benefits:
✅ Stateless authentication (no session management)
✅ Token expiration (7 days)
✅ Can't be modified without secret key
✅ Works across multiple servers

---

## 2️⃣ Password Security - Bcrypt Hashing

### How it works:
```javascript
// Registration:
const salt = await bcrypt.genSalt(10); // 10 rounds
const hashedPassword = await bcrypt.hash(password, salt);
// Store hashedPassword in DB

// Login Verification:
const isMatch = await bcrypt.compare(enteredPassword, storedHashedPassword);
```

### Security Benefits:
✅ One-way hashing (can't reverse)
✅ 10 salt rounds (strong protection)
✅ Each password has unique salt
✅ Resistant to rainbow table attacks
✅ Plain passwords never stored in database

**Example:**
- User Password: `MyBank123`
- Stored Hash: `$2b$10$N9qo8uLOickgx2Z...` (never same twice)

---

## 3️⃣ Authorization - Role-Based Access Control (RBAC)

### User Roles:
```javascript
Role: "USER"
- Can view own account
- Can make transactions
- Cannot access admin routes

Role: "ADMIN"
- Can view all users
- Can view all accounts
- Can view all transactions
- Can manage user accounts
```

### Implementation:
```javascript
// Middleware check:
exports.authorize = (requiredRoles) => {
  return (req, res, next) => {
    if (!req.user || !requiredRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }
    next();
  };
};

// Route protection:
router.get("/admin/users", protect, authorize(["ADMIN"]), getAllUsers);
// Only users with ADMIN role can access
```

---

## 4️⃣ Protected Routes - Frontend

### How it works:
```javascript
// ProtectedRoute Component:
<ProtectedRoute requiredRole="ADMIN">
  <AdminPanel />
</ProtectedRoute>

// If user not logged in → Redirect to /login
// If user not admin → Redirect to /dashboard
// Otherwise → Show component
```

### Security Flow:
1. User tries to access `/admin`
2. ProtectedRoute checks authentication
3. ProtectedRoute checks role
4. If everything OK → Show page
5. Otherwise → Redirect to login

---

## 5️⃣ Token Storage & HTTP-Only Cookies

### Implementation:
```javascript
// Backend sets HTTP-only cookie:
res.cookie("token", token, {
  httpOnly: true,           // JavaScript can't access
  secure: true,             // HTTPS only
  sameSite: "strict",       // CSRF protection
  maxAge: 7*24*60*60*1000   // 7 days
});

// Frontend also stores in localStorage as backup
localStorage.setItem("token", token);
```

### Security Benefits:
✅ HTTP-Only: Can't be stolen by XSS attacks
✅ Secure flag: Only sent over HTTPS
✅ SameSite: Prevents CSRF attacks
✅ Automatic expiration

---

## 6️⃣ Input Validation & NoSQL Injection Prevention

### Example:
```javascript
// ❌ Vulnerable:
db.users.findOne({ email: userInput }); // If userInput contains code

// ✅ Safe with Mongoose:
const user = await User.findOne({ email });
// Mongoose escapes special characters automatically
```

### Validation in Forms:
```javascript
// Email validation:
match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, "Valid email required"]

// Password minimum length:
minlength: 6

// Aadhar unique:
unique: true
```

---

## 7️⃣ Database Connection Security

### MongoDB Atlas Configuration:
```javascript
// .env file (NEVER commit this):
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/bankdb

// Features:
✅ IP Whitelisting - Only allowed IPs can connect
✅ Network encryption - Data encrypted in transit
✅ Authentication - Username/password required
✅ Credentials in .env - Not in code
```

### Connection Options:
```javascript
const conn = await mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // SSL enabled by default in MongoDB Atlas
});
```

---

## 8️⃣ CORS (Cross-Origin Resource Sharing)

### Implementation:
```javascript
app.use(cors({
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,  // Allow cookies
  optionsSuccessStatus: 200
}));
```

### Protection:
✅ Only specified origins can access API
✅ Prevents unauthorized cross-site requests
✅ Credentials included safely

---

## 9️⃣ Environment Variables

### Never Commit:
```
.env  ← Add to .gitignore ✅
```

### Example .env (SECURE):
```
PORT=5000
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/db
JWT_SECRET=your_super_secret_key_min_32_chars_long
JWT_EXPIRE=7d
CORS_ORIGIN=http://localhost:3000
```

### Access in Code:
```javascript
const dbUri = process.env.MONGO_URI; // Safe access
```

---

## 🔟 Additional Security Recommendations

### 1. Rate Limiting (Add to backend)
```javascript
const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use("/api/", limiter);
```

### 2. Helmet.js (Add to backend)
```javascript
const helmet = require("helmet");
app.use(helmet()); // Sets various HTTP headers
```

### 3. HTTPS in Production
- Use SSL certificate
- Redirect HTTP to HTTPS
- Set secure: true in cookies

### 4. Password Requirements
- Minimum 8 characters
- Mix of uppercase, lowercase, numbers, symbols
- Password strength meter on frontend

### 5. Two-Factor Authentication
- SMS verification
- Google Authenticator
- Email OTP

### 6. Audit Logging
```javascript
// Log all sensitive operations:
- Login attempts
- Transaction creation
- User role changes
- Admin actions
```

---

## 🔐 Security Checklist

### Before Production:
- [ ] Change JWT_SECRET to strong random string
- [ ] Enable HTTPS/SSL
- [ ] Configure MongoDB IP whitelist
- [ ] Add rate limiting
- [ ] Install helmet.js
- [ ] Add HTTPS redirect
- [ ] Enable CORS properly
- [ ] Test for SQL/NoSQL injection
- [ ] Test for XSS vulnerabilities
- [ ] Implement CSRF tokens
- [ ] Add audit logging
- [ ] Hide error messages
- [ ] Use environment variables
- [ ] Regular security updates
- [ ] Database backups

---

## 🚨 Common Vulnerabilities & Fixes

### 1. XSS (Cross-Site Scripting)
**Problem:** User input not sanitized
**Solution:** React automatically escapes content

### 2. CSRF (Cross-Site Request Forgery)
**Problem:** Attacker tricks user into making request
**Solution:** sameSite="strict" cookies + token validation

### 3. SQL Injection
**Problem:** Malicious SQL in input
**Solution:** Use Mongoose (ORM), parameterized queries

### 4. NoSQL Injection
**Problem:** MongoDB operators in input
**Solution:** Input validation, Mongoose escaping

### 5. Weak Passwords
**Problem:** Users set simple passwords
**Solution:** Enforce password strength requirements

### 6. Expired Tokens Not Invalidated
**Problem:** User login, token stolen, logout doesn't help
**Solution:** Token blacklist or short expiration (7 days)

---

## 📊 Security Testing

### Tools:
1. **Postman** - API testing
2. **Burp Suite** - Security testing
3. **OWASP ZAP** - Vulnerability scanner
4. **SonarQube** - Code quality

### Test Cases:
```javascript
// 1. Try accessing /admin without ADMIN role
GET /api/admin/stats (without token) → 401 Unauthorized ✓

// 2. Try modifying another user's data
PUT /api/accounts/user2Id (with user1 token) → 403 Forbidden ✓

// 3. Try SQL injection
POST /auth/login
email: "admin' OR '1'='1" → Properly escaped, fails ✓

// 4. Token expiration
Wait 7 days, use old token → 401 Invalid token ✓
```

---

## 📚 Security Resources

- OWASP Top 10: https://owasp.org/www-project-top-ten/
- JWT.io: https://jwt.io/
- bcrypt: https://www.npmjs.com/package/bcryptjs
- Helmet.js: https://helmetjs.github.io/
- MongoDB Security: https://docs.mongodb.com/manual/security/

---

## 🎓 Interview Talking Points

1. **JWT Authentication**
   - Stateless, scalable
   - Token contains user ID and role
   - Verified using secret key

2. **Password Security**
   - Bcrypt hashing with 10 salt rounds
   - One-way function
   - Rainbow table resistant

3. **Authorization**
   - Role-based access control
   - Middleware checks user role
   - Different permissions for USER vs ADMIN

4. **Protected Routes**
   - Frontend checks token existence
   - Redirects to login if missing
   - Checks role for admin pages

5. **Database Security**
   - Comments on .env usage
   - IP whitelisting on MongoDB Atlas
   - Credentials never in code

---

**Remember: Security is not a feature, it's a fundamental requirement!** 🔒
