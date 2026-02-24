const express = require('express');
const http = require('http');
const path = require('path');
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

app.use('/static-apps/dnd', express.static(path.join(__dirname, 'static_apps', 'dnd')));

app.use('/api/auth', authRoutes);
app.use('/api/apps', appsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/private', privateFilesRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

const io = new Server(server, {
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
