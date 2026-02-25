const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config');
const { initDb } = require('./db');
const { seedAll } = require('./seedData');
const authRoutes = require('./routes/auth');
const appsRoutes = require('./routes/apps');
const chatRoutes = require('./routes/chat');
const privateFilesRoutes = require('./routes/privateFiles');
const { registerChatSockets } = require('./sockets/chat');
const { registerVoiceSockets } = require('./sockets/voice');

const app = express();
const server = http.createServer(app);

const isProd = process.env.NODE_ENV === 'production';
const allowedOrigins = new Set(config.clientOrigins || []);

// Allow secure cookies and correct protocol detection when behind a proxy/tunnel.
app.set('trust proxy', 1);

function getHostFromOrigin(origin) {
  try {
    return new URL(origin).hostname;
  } catch (err) {
    return null;
  }
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (allowedOrigins.has('*')) return true;
  if (allowedOrigins.has(origin)) return true;

  const host = getHostFromOrigin(origin);
  if (!host) return false;

  // Always allow local development origins.
  if (host === 'localhost' || host === '127.0.0.1') return true;

  for (const entry of allowedOrigins) {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1);
      if (host.endsWith(suffix)) return true;
    } else if (entry.startsWith('.')) {
      if (host.endsWith(entry)) return true;
    }
  }

  return false;
}

const sessionMiddleware = session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: path.join(__dirname, 'data') }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd
  }
});

app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware);

const clientDist = path.join(__dirname, '..', 'frontend', 'dist');
const clientIndex = path.join(clientDist, 'index.html');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

app.use('/static-apps/dnd', express.static(path.join(__dirname, 'static_apps', 'dnd')));

app.use('/api/auth', authRoutes);
app.use('/api/apps', appsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/private', privateFilesRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/static-apps')) {
    return res.status(404).json({ error: 'Not found.' });
  }

  if (fs.existsSync(clientIndex)) {
    return res.sendFile(clientIndex);
  }

  return res.status(503).send('Frontend build not found.');
});

const io = new Server(server, {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }
});

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

registerChatSockets(io);
registerVoiceSockets(io);
app.set('io', io);

async function start() {
  await initDb();
  await seedAll();

  server.listen(config.port, () => {
    console.log(`Backend listening on ${config.port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
