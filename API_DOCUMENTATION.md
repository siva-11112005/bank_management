# BankEase API Documentation

## Base URL
```
http://localhost:5000/api
```

---

## 🔐 Authentication Endpoints

### 1. Register User
**POST** `/auth/register`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "9876543210",
  "password": "SecurePass123",
  "confirmPassword": "SecurePass123",
  "aadhar": "123456789012",
  "address": "123 Main Street, City, Country"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "role": "USER"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "User already exists with this email"
}
```

---

### 2. Login User
**POST** `/auth/login`

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "role": "USER"
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

### 3. Get User Profile
**GET** `/auth/profile`

**Headers:**
```
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "9876543210",
    "aadhar": "123456789012",
    "address": "123 Main Street",
    "role": "USER"
  }
}
```

---

### 4. Update User Profile
**PUT** `/auth/profile`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "9876543210",
  "address": "456 New Street, City"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "9876543210",
    "address": "456 New Street, City",
    "role": "USER"
  }
}
```

---

### 5. Logout
**POST** `/auth/logout`

**Headers:**
```
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 💳 Account Endpoints

### 1. Create Account
**POST** `/accounts/create`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "accountType": "SAVINGS",
  "branch": "Downtown Branch",
  "ifscCode": "SBIN0001234"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Account created successfully",
  "account": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "accountNumber": "ACC1234567890",
    "accountType": "SAVINGS",
    "balance": 0,
    "ifscCode": "SBIN0001234",
    "branch": "Downtown Branch",
    "status": "ACTIVE",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### 2. Get My Account
**GET** `/accounts/my-account`

**Headers:**
```
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "success": true,
  "account": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": {
      "_id": "507f1f77bcf86cd799439012",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com"
    },
    "accountNumber": "ACC1234567890",
    "accountType": "SAVINGS",
    "balance": 50000,
    "ifscCode": "SBIN0001234",
    "branch": "Downtown Branch",
    "status": "ACTIVE"
  }
}
```

---

### 3. Deposit Money (Old Endpoint)
**POST** `/accounts/deposit`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "amount": 10000
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Deposit successful",
  "newBalance": 60000
}
```

---

### 4. Withdraw Money (Old Endpoint)
**POST** `/accounts/withdraw`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "amount": 5000
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Withdrawal successful",
  "newBalance": 55000
}
```

---

## 💰 Transaction Endpoints

### 1. Get My Transactions
**GET** `/transactions/my-transactions`

**Headers:**
```
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "success": true,
  "totalTransactions": 5,
  "transactions": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "accountId": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "type": "DEPOSIT",
      "amount": 10000,
      "description": "Initial deposit",
      "status": "SUCCESS",
      "balanceAfterTransaction": 10000,
      "createdAt": "2024-01-15T10:30:00Z"
    },
    {
      "_id": "507f1f77bcf86cd799439014",
      "accountId": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "type": "TRANSFER",
      "amount": 5000,
      "recipientName": "Jane Smith",
      "status": "SUCCESS",
      "balanceAfterTransaction": 5000,
      "createdAt": "2024-01-16T11:45:00Z"
    }
  ]
}
```

---

### 2. Deposit (With Transaction Logging)
**POST** `/transactions/deposit`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "amount": 10000,
  "description": "Salary deposit"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Deposit successful",
  "transaction": {
    "_id": "507f1f77bcf86cd799439015",
    "accountId": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "type": "DEPOSIT",
    "amount": 10000,
    "description": "Salary deposit",
    "status": "SUCCESS",
    "balanceAfterTransaction": 20000,
    "createdAt": "2024-01-17T09:00:00Z"
  },
  "newBalance": 20000
}
```

---

### 3. Withdraw (With Transaction Logging)
**POST** `/transactions/withdraw`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "amount": 5000,
  "description": "ATM withdrawal"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Withdrawal successful",
  "transaction": {
    "_id": "507f1f77bcf86cd799439016",
    "accountId": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439012",
    "type": "WITHDRAWAL",
    "amount": 5000,
    "description": "ATM withdrawal",
    "status": "SUCCESS",
    "balanceAfterTransaction": 15000,
    "createdAt": "2024-01-17T14:30:00Z"
  },
  "newBalance": 15000
}
```

---

### 4. Transfer Money
**POST** `/transactions/transfer`

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body:**
```json
{
  "recipientAccountNumber": "ACC9876543210",
  "amount": 5000,
  "description": "Payment for services"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Transfer successful",
  "senderNewBalance": 10000
}
```

**Error Response (404):**
```json
{
  "success": false,
  "message": "Recipient account not found"
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Insufficient balance"
}
```

---

## 👨‍💼 Admin Endpoints

### 1. Get Dashboard Stats
**GET** `/admin/stats`

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "success": true,
  "stats": {
    "totalUsers": 25,
    "totalAccounts": 30,
    "totalTransactions": 150,
    "totalLoans": 5,
    "totalBalance": 5000000,
    "totalLoanAmount": 500000
  }
}
```

---

### 2. Get All Users
**GET** `/admin/users`

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "success": true,
  "totalUsers": 25,
  "users": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phone": "9876543210",
      "aadhar": "123456789012",
      "role": "USER",
      "isActive": true,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

### 3. Get All Accounts
**GET** `/admin/accounts`

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "success": true,
  "totalAccounts": 30,
  "accounts": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "userId": {
        "_id": "507f1f77bcf86cd799439012",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com"
      },
      "accountNumber": "ACC1234567890",
      "accountType": "SAVINGS",
      "balance": 50000,
      "ifscCode": "SBIN0001234",
      "branch": "Downtown Branch",
      "status": "ACTIVE"
    }
  ]
}
```

---

### 4. Get All Transactions
**GET** `/admin/transactions`

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "success": true,
  "totalTransactions": 150,
  "transactions": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "accountId": "507f1f77bcf86cd799439011",
      "userId": {
        "_id": "507f1f77bcf86cd799439012",
        "firstName": "John",
        "lastName": "Doe"
      },
      "type": "DEPOSIT",
      "amount": 10000,
      "status": "SUCCESS",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

### 5. Deactivate User
**PUT** `/admin/users/{userId}/deactivate`

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User deactivated successfully",
  "user": {
    "_id": "507f1f77bcf86cd799439012",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "isActive": false
  }
}
```

---

### 6. Activate User
**PUT** `/admin/users/{userId}/activate`

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User activated successfully",
  "user": {
    "_id": "507f1f77bcf86cd799439012",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "isActive": true
  }
}
```

---

## 🔄 Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK - Request succeeded |
| 201 | Created - Resource created successfully |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing or invalid token |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource not found |
| 500 | Server Error - Internal server error |

---

## 🔑 Authorization Header Format

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjUwN2YxZjc3YmNmODZjZDc5OTQzOTAxMiIsInJvbGUiOiJVU0VSIiwiaWF0IjoxNzA1MzI4NjAwLCJleHAiOjE3MDU5MzM0MDB9.abcdef123456...
```

## ✅ Testing Checklist

- [ ] Register new user
- [ ] Login with credentials
- [ ] Get user profile
- [ ] Update profile
- [ ] Create account
- [ ] Deposit money
- [ ] Withdraw money
- [ ] Transfer to another account
- [ ] View transaction history
- [ ] Access admin panel (if admin)
- [ ] View all users (admin)
- [ ] View statistics (admin)
- [ ] Logout

---

## 🛠️ Common Test Cases

### Invalid Token
```bash
curl -H "Authorization: Bearer invalid_token" \
  http://localhost:5000/api/auth/profile
# Response: 401 Unauthorized
```

### Missing Headers
```bash
curl http://localhost:5000/api/accounts/my-account
# Response: 401 No token provided
```

### Insufficient Balance
```bash
curl -X POST \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"amount": 999999}' \
  http://localhost:5000/api/transactions/withdraw
# Response: 400 Insufficient balance
```

---

**Happy Testing! 🚀**
