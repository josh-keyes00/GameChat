# Personal Gaming Hub (MVP)

Discord-style personal gaming hub with chat, DND tools iframe, and admin-only private files.

## Stack

- Frontend: React + Vite (JS), React Router, Socket.IO client
- Backend: Node.js + Express, Socket.IO, SQLite, session auth
- Storage: files on disk, metadata in SQLite

## Local Setup

### Option A) Run Both (Root Scripts)

```powershell
cd C:\PersonalGameChat
npm install
npm run dev
```

### Option B) Run Separately

### 1) Backend

```powershell
cd backend
npm install
```

Create a local `.env` from the example:

```powershell
copy .env.example .env
```

Run the backend:

```powershell
npm run dev
```

The backend runs on `http://localhost:4000`.

### 2) Frontend

```powershell
cd ..\frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

## Production Build (Single Port)

Build the frontend and serve it from the backend:

```powershell
cd C:\PersonalGameChat
npm run build
npm run start
```

The app is served from `http://localhost:4000` (API + Socket.IO + static UI).

## Seed Users (Dev)

These are created on backend start if missing:

- Admin: `admin / admin123`
- Friend: `friend / friend123`

Change them in `backend/.env`.

## DND Tools Integration

Drop your static site into:

- `backend/static_apps/dnd/`

The DND Tools app loads in an iframe at `/app/dnd`.

## Chat Files

- Max size: 1GB (client + server enforced)
- Uploaded to `backend/storage/chat_uploads/<channel_key>/`
- Download via message link

## Voice Chat (WebRTC)

- Click **Join Voice** in any chat channel.
- Uses peer-to-peer WebRTC with a public STUN server (`stun.l.google.com:19302`).
- For remote users behind strict NAT, you may need a TURN server (not included).

## Private Files (Admin Only)

- Max size: 1GB
- Uploaded to `backend/storage/private_files/<folder_key>/`
- Admin-only routes and UI

## Playit.gg Notes

- Build and run the single-port server:
  - `npm run build`
  - `npm run start`
- Expose backend port `4000` through Playit.gg (single-port setup).
- Ensure `CLIENT_ORIGIN` in `backend/.env` matches the Playit URL you expose.
- For production, set `NODE_ENV=production` and use a strong `SESSION_SECRET`.

## Scripts

Root (`package.json`):

- `npm run dev` - run backend + frontend dev servers together
- `npm run build` - build the frontend
- `npm run start` - start the backend (serves built frontend)

Backend (`backend/package.json`):

- `npm run dev` - start with nodemon
- `npm run start` - start normally
- `npm run seed` - re-run seed script

Frontend (`frontend/package.json`):

- `npm run dev` - Vite dev server
- `npm run build` - production build

## Security Notes (MVP)

- Sessions are cookie-based and stored in SQLite.
- All file routes enforce role checks and known channel/folder keys.
- Filenames are sanitized and stored with server-generated names.

## TODO / Next Improvements

- Chunked uploads for massive files
- Rate limiting on chat and uploads
- More granular permissions
- Presence, typing indicators, and notifications
- Optional drag/drop file uploads
