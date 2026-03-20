# 🌙 Golpo — Real-time Chat App by Kafaah

> A production-ready, end-to-end encrypted, real-time chat platform built with NestJS + React.

---

## 🗂️ Project Structure

```
Root/
├── Backend/          ← NestJS API + WebSocket server
│   ├── src/
│   │   ├── auth/         Auth module (OTP, JWT)
│   │   ├── users/        User profiles, search, block
│   │   ├── chat/         Chats, groups, gateway
│   │   ├── messages/     Messages, reactions, media
│   │   ├── notifications/ Firebase FCM
│   │   └── common/       DB, Redis, Supabase, guards
│   ├── migration.sql     Run this to set up DB schema
│   └── .env.example      Copy to .env and fill in values
│
└── Frontend/         ← Vite + React SPA
    ├── src/
    │   ├── pages/        AuthPage, ChatLayout
    │   ├── components/   Chat, Call UI components
    │   ├── hooks/        useSocket, useMessages, useTyping
    │   ├── store/        Zustand stores (auth, chat, call)
    │   ├── services/     API client, Socket, WebRTC, Crypto
    │   └── types/        TypeScript types
    └── .env.example      Copy to .env and fill in values
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) PostgreSQL database
- A [Redis](https://upstash.com) instance (Upstash works great)
- A [Supabase](https://supabase.com) project with a storage bucket
- A [Firebase](https://console.firebase.google.com) project (for push notifications)
- SMTP credentials (Gmail app password works)

---

### 2. Database Setup

Run `Backend/migration.sql` in your Neon dashboard SQL editor to create all tables.

---

### 3. Backend Setup

```bash
cd Backend
cp .env.example .env
# Edit .env with your credentials
npm install
npm run start:dev
```

Backend runs on: `http://localhost:3001`

---

### 4. Frontend Setup

```bash
cd Frontend
cp .env.example .env
# Edit .env with your API URL and Firebase config
npm install
npm run dev
```

Frontend runs on: `http://localhost:5173`

---

## 🔐 Environment Variables

### Backend `.env`

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `REDIS_URL` | Redis connection URL |
| `JWT_SECRET` | Secret key for JWT signing (make it long!) |
| `SMTP_HOST` | SMTP server (e.g. smtp.gmail.com) |
| `SMTP_USER` | Email address |
| `SMTP_PASS` | App password |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (not anon key) |
| `SUPABASE_BUCKET` | Storage bucket name (e.g. `golpo-media`) |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | Firebase service account private key |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account email |
| `FRONTEND_URL` | Frontend origin for CORS |

### Frontend `.env`

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend API URL |
| `VITE_SOCKET_URL` | Backend socket URL |
| `VITE_FIREBASE_*` | Firebase web app config values |
| `VITE_FIREBASE_VAPID_KEY` | Firebase VAPID key for push |

---

## ✨ Features

| Feature | Status |
|---|---|
| Email OTP authentication | ✅ |
| JWT session management | ✅ |
| End-to-end encryption (RSA + AES) | ✅ |
| Real-time messaging (Socket.io) | ✅ |
| Message status (sent/delivered/seen) | ✅ |
| Typing indicators | ✅ |
| Online presence (Redis) | ✅ |
| Image uploads (Supabase) | ✅ |
| Voice messages | ✅ |
| Emoji reactions | ✅ |
| Message delete / unsend | ✅ |
| 1-to-1 audio/video calls (WebRTC) | ✅ |
| Group chats | ✅ |
| User search | ✅ |
| Block/unblock users | ✅ |
| Pin / archive chats | ✅ |
| Push notifications (Firebase FCM) | ✅ |
| Dark mode (default) | ✅ |
| Light mode toggle | ✅ |
| Message infinite scroll | ✅ |
| Responsive (mobile + desktop) | ✅ |

---

## 🏗️ Tech Stack

| Layer | Tech |
|---|---|
| Backend framework | NestJS |
| Database | Neon PostgreSQL + Drizzle ORM |
| Cache / Presence | Redis (ioredis) |
| Real-time | Socket.io |
| File storage | Supabase Storage |
| Push notifications | Firebase Cloud Messaging |
| Auth | Email OTP + JWT |
| Encryption | Web Crypto API (RSA-OAEP + AES-GCM) |
| Frontend framework | React (Vite) |
| State management | Zustand |
| Styling | TailwindCSS |
| Animations | Framer Motion |
| Video calls | WebRTC (via native browser APIs) |

---

## 🛡️ Security Notes

- All messages are end-to-end encrypted client-side before transmission
- Private keys are stored in IndexedDB, never sent to server
- OTP codes are bcrypt-hashed in database
- Rate limiting on all auth endpoints
- JWT with configurable expiry
- Helmet.js security headers
- Input validation via class-validator
- Blocked users cannot message or call

---

## 📱 Supabase Storage Setup

1. Create a new bucket called `golpo-media`
2. Set it to **Public** (or use signed URLs for private)
3. Add CORS policy to allow your frontend domain

---

## 🔔 Firebase Setup

1. Create a Firebase project
2. Enable Cloud Messaging
3. Download the service account JSON
4. Extract `project_id`, `private_key`, `client_email` for backend env
5. Get web app config for frontend env
6. Generate a VAPID key in Firebase Console → Project Settings → Cloud Messaging

---

*Built with ❤️ by Kafaah · Golpo v1.0.0*
