const express = require('express');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cors = require('cors');
const { Server } = require('socket.io');
const selfsigned = require('selfsigned');

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

const isProd = process.env.NODE_ENV === 'production';
const allowedOrigins = new Set(config.clientOrigins || []);
const debugTls = process.env.DEBUG_TLS === '1';
const debugMux = process.env.DEBUG_MUX === '1';

function previewBytes(buffer, max = 16) {
  const slice = buffer.subarray(0, Math.min(buffer.length, max));
  const hex = Array.from(slice)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join(' ');
  const ascii = slice
    .toString('ascii')
    .replace(/[^\x20-\x7E]/g, '.');
  return { hex, ascii };
}

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

const httpPort = config.port + 1;
const httpsPort = config.port + 2;

const httpServer = http.createServer(app);

let httpsServer;
if (config.tlsKeyPath && config.tlsCertPath) {
  const key = fs.readFileSync(config.tlsKeyPath);
  const cert = fs.readFileSync(config.tlsCertPath);
  httpsServer = https.createServer({ key, cert, minVersion: 'TLSv1.2' }, app);
  console.log('HTTPS enabled for backend server (custom cert).');
} else {
  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: false },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true
      },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' }
        ]
      }
    ]
  });
  httpsServer = https.createServer(
    {
      key: pems.private,
      cert: pems.cert,
      minVersion: 'TLSv1.2'
    },
    app
  );
  console.log('HTTPS enabled for backend server (self-signed).');
}

if (debugTls) {
  httpsServer.on('secureConnection', (tlsSocket) => {
    const protocol = tlsSocket.getProtocol();
    const cipher = tlsSocket.getCipher();
    console.log('[tls] secure connection', {
      remote: `${tlsSocket.remoteAddress}:${tlsSocket.remotePort}`,
      protocol,
      cipher: cipher ? cipher.name : 'unknown'
    });
  });

  httpsServer.on('tlsClientError', (err, tlsSocket) => {
    console.error('[tls] client error', {
      remote: tlsSocket ? `${tlsSocket.remoteAddress}:${tlsSocket.remotePort}` : 'unknown',
      message: err.message
    });
  });
}

function createSocketServer(server) {
  return new Server(server, {
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
}

const ioHttp = createSocketServer(httpServer);
const ioHttps = createSocketServer(httpsServer);

ioHttp.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

ioHttps.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

registerChatSockets(ioHttp);
registerVoiceSockets(ioHttp);
registerChatSockets(ioHttps);
registerVoiceSockets(ioHttps);

const ioBroadcast = {
  to(room) {
    return {
      emit(event, payload) {
        ioHttp.to(room).emit(event, payload);
        ioHttps.to(room).emit(event, payload);
      }
    };
  }
};

app.set('io', ioBroadcast);

const muxServer = net.createServer((socket) => {
  let buffered = Buffer.alloc(0);

  function stripProxyProtocol(buffer) {
    if (buffer.length === 0) return { buffer, done: true };

    // Proxy Protocol v1 starts with "PROXY "
    if (buffer.slice(0, 6).toString('ascii') === 'PROXY ') {
      const end = buffer.indexOf('\r\n');
      if (end === -1) return { buffer, done: false };
      if (debugMux) {
        console.log(`[mux] stripped proxy protocol v1 header (${end + 2} bytes)`);
      }
      return { buffer: buffer.slice(end + 2), done: true };
    }

    // Proxy Protocol v2 signature
    const sig = Buffer.from([0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a]);
    if (buffer.length >= sig.length && buffer.subarray(0, sig.length).equals(sig)) {
      if (buffer.length < 16) return { buffer, done: false };
      const len = buffer.readUInt16BE(14);
      const total = 16 + len;
      if (buffer.length < total) return { buffer, done: false };
      if (debugMux) {
        console.log(`[mux] stripped proxy protocol v2 header (${total} bytes)`);
      }
      return { buffer: buffer.slice(total), done: true };
    }

    return { buffer, done: true };
  }

  function onData(chunk) {
    buffered = Buffer.concat([buffered, chunk]);

    const parsed = stripProxyProtocol(buffered);
    if (!parsed.done) return;

    buffered = parsed.buffer;
    if (buffered.length === 0) return;

    const isTls = buffered[0] === 22;
    const targetPort = isTls ? httpsPort : httpPort;
    if (debugMux) {
      const preview = previewBytes(buffered);
      console.log('[mux] first bytes', {
        tls: isTls,
        targetPort,
        hex: preview.hex,
        ascii: preview.ascii
      });
    }
    const upstream = net.connect(targetPort, '127.0.0.1', () => {
      upstream.write(buffered);
      socket.pipe(upstream).pipe(socket);
    });

    upstream.on('error', () => {
      socket.destroy();
    });

    socket.off('data', onData);
  }

  socket.on('data', onData);
});

async function start() {
  await initDb();
  await seedAll();

  httpServer.listen(httpPort, () => {
    console.log(`HTTP backend listening on ${httpPort}`);
  });

  httpsServer.listen(httpsPort, () => {
    console.log(`HTTPS backend listening on ${httpsPort}`);
  });

  muxServer.listen(config.port, () => {
    console.log(`Mux listening on ${config.port} (HTTP+HTTPS)`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
