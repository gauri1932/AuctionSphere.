# Authentication Options & Integration Guide

This guide compares authentication strategies for the **Auction Sphere** application (React/Vite Frontend + Express/Node.js/MongoDB Backend) and provides detailed walkthroughs for implementation.

---

## Quick Comparison Table

| Auth Solution | Dev Setup Time | Cost (Free Tier / Scaling) | Stack Fit | Key Features | Best Used For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Supabase Auth** | Fast (15–30 mins) | Very Generous (50k MAUs) | Good (JWT validated in Express) | Social Logins, Magic Links, MFA, User Management Dashboard | Quick, production-ready, secure external auth |
| **Custom JWT Auth** | Medium (2–3 hours) | 100% Free (Self-hosted) | Perfect (Same Mongo DB) | Custom Schemas, absolute control over queries | Zero external dependencies, offline development, cost avoidance |
| **Clerk** | Super Fast (10 mins) | Generous (10k MAU) / Expensive scaling | React-first (SDK handles UI) | Gorgeous pre-built React components, profile management | Fastest UI setup, modern dashboard |
| **Firebase Auth** | Fast (20 mins) | Generous (Unlimited Email/SMS charges) | Good | Phone/OTP login, OAuth, mature ecosystem | Apps requiring Phone/OTP logins |

---

## Detailed Breakdown of Recommended Options

### Option 1: Supabase Auth (Recommended Third-Party)
Supabase Auth uses a built-in GoTrue server under the hood. Even if your main database is MongoDB, you can use Supabase solely as an Identity Provider (IdP). Supabase issues JSON Web Tokens (JWTs) which your Express backend can verify cryptographically without calling Supabase APIs on every request.

#### Pros:
* **Pre-built UI**: Can use `@supabase/auth-ui-react` for beautiful, instant login/signup screens.
* **Security**: Handles salting/hashing, email verification, session expiration, and rate-limiting out-of-the-box.
* **Social OAuth**: Easiest setup for Google, Apple, GitHub login.
* **MFA**: Built-in Multi-Factor Authentication support.

#### Cons:
* **Two Databases**: User auth credentials live in Supabase (PostgreSQL), while auction data lives in MongoDB. If you need to link a `Player` or `Team` to a `User`, you must save the Supabase `user_id` (UUID string) in MongoDB.

---

### Option 2: Custom JWT Auth (Recommended Local/Self-hosted)
If you want to keep your architecture unified, you can write custom JWT authentication directly into your Express backend and store users in MongoDB.

#### Pros:
* **Single Database**: Everything stays in your MongoDB cluster.
* **No Third Parties**: Works completely offline (perfect for local development or private servers).
* **No API Limits**: No monthly active user constraints or pricing cliffs.

#### Cons:
* **Development Overhead**: You must build the `/register`, `/login`, refresh-token flow, reset password flows, and security logic yourself.
* **Maintenance**: Responsible for keeping dependencies like `bcrypt` and `jsonwebtoken` patched and secure.

---

## Step-by-Step Supabase Auth Integration Guide

If you decide to go with **Supabase**, here is how to integrate it into the current React frontend and Express backend:

### Step 1: Create Supabase Project
1. Go to the [Supabase Dashboard](https://supabase.com) and create a new project.
2. Under **Project Settings** > **API**, locate your `Project URL` and `anon public key`.

### Step 2: Configure Environment Variables
Create or edit your `.env` files.

#### Frontend (`frontend/.env`)
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Backend (`backend/.env`)
```env
SUPABASE_JWT_SECRET=your-supabase-jwt-secret-found-in-api-settings
```
> [!IMPORTANT]
> The `SUPABASE_JWT_SECRET` is used by the Express backend to verify the signature of JWT tokens passed by the frontend. Find this in Supabase Settings > API > **JWT Settings (JWT Secret)**.

---

### Step 3: Frontend Implementation (React/Vite)

1. Install dependencies in your `frontend` directory:
   ```bash
   cd frontend
   npm install @supabase/supabase-js @supabase/auth-ui-react @supabase/auth-ui-shared
   ```

2. Initialize the Supabase Client. Create a new file `frontend/src/utils/supabaseClient.js`:
   ```javascript
   import { createClient } from '@supabase/supabase-js';

   const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
   const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

   export const supabase = createClient(supabaseUrl, supabaseAnonKey);
   ```

3. Create the Login Component `frontend/src/components/Login.jsx`:
   ```jsx
   import React from 'react';
   import { Auth } from '@supabase/auth-ui-react';
   import { ThemeSupa } from '@supabase/auth-ui-shared';
   import { supabase } from '../utils/supabaseClient';

   export default function Login() {
     return (
       <div className="flex justify-center items-center h-screen bg-slate-900">
         <div className="w-full max-w-md p-8 bg-slate-800 rounded-lg shadow-xl border border-slate-700">
           <h2 className="text-2xl font-bold text-white mb-6 text-center">Auction Sphere Login</h2>
           <Auth
             supabaseClient={supabase}
             appearance={{ theme: ThemeSupa }}
             providers={['google', 'github']}
             theme="dark"
           />
         </div>
       </div>
     );
   }
   ```

4. Authenticated Request Helper in the Frontend:
   When calling your Express backend, retrieve the session token and put it in the `Authorization` header:
   ```javascript
   import { supabase } from './supabaseClient';

   export async function fetchWithAuth(url, options = {}) {
     const { data: { session } } = await supabase.auth.getSession();
     const token = session?.access_token;

     const headers = {
       ...options.headers,
       'Content-Type': 'application/json',
     };

     if (token) {
       headers['Authorization'] = `Bearer ${token}`;
     }

     return fetch(url, { ...options, headers });
   }
   ```

---

### Step 4: Backend Implementation (Express)

1. Install dependencies in your `backend` directory:
   ```bash
   cd backend
   npm install jsonwebtoken
   ```

2. Create an Auth Middleware `backend/config/authMiddleware.js`:
   ```javascript
   const jwt = require('jsonwebtoken');

   const requireAuth = (req, res, next) => {
     const authHeader = req.headers.authorization;
     if (!authHeader || !authHeader.startsWith('Bearer ')) {
       return res.status(401).json({ error: 'No token provided' });
     }

     const token = authHeader.split(' ')[1];

     try {
       // Verify JWT using the Supabase JWT Secret
       const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
       req.user = decoded; // Contains user ID (decoded.sub), email, etc.
       next();
     } catch (err) {
       return res.status(401).json({ error: 'Invalid or expired token' });
     }
   };

   module.exports = requireAuth;
   ```

3. Protect Backend Routes in `backend/routes/api.js`:
   ```javascript
   const requireAuth = require('../config/authMiddleware');

   // Example: Protect a route so only authenticated users can access
   router.post('/players', requireAuth, async (req, res) => {
       // Authenticated logic...
   });
   ```

---

## Step-by-Step Custom JWT Auth Integration Guide (Alternative)

If you prefer **Custom MongoDB Auth** without Supabase to keep all data in one place:

### Step 1: Create User Schema
Create `backend/models/User.js`:
```javascript
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'audience'], default: 'audience' }
});

module.exports = mongoose.model('User', UserSchema);
```

### Step 2: Implement Auth Routes
Install `bcrypt` and `jsonwebtoken` in backend:
```bash
cd backend
npm install bcrypt jsonwebtoken
```

Add `/api/auth/register` and `/api/auth/login` inside backend routes:
```javascript
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Register Endpoint
router.post('/register', async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashedPassword, role });
    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Login Endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```
