const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';

const dbPath = path.join(__dirname, '..', 'data', 'app.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());

const ensureAuth = (req, res, next) => {
  const token = req.cookies['auth_token'];
  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

const createUserStmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
const findUserStmt = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?');
const listRoomsStmt = db.prepare('SELECT id, created_at FROM rooms ORDER BY created_at DESC LIMIT 50');
const upsertRoomStmt = db.prepare('INSERT OR IGNORE INTO rooms (id) VALUES (?)');

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters' });
  }
  try {
    const existing = findUserStmt.get(username);
    if (existing) {
      return res.status(409).json({ message: 'User already exists' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const info = createUserStmt.run(username, passwordHash);
    const token = jwt.sign({ id: info.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });
    res
      .cookie('auth_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 * 7,
      })
      .status(201)
      .json({ id: info.lastInsertRowid, username });
  } catch (err) {
    console.error('Register error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }
  try {
    const user = findUserStmt.get(username);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res
      .cookie('auth_token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 1000 * 60 * 60 * 24 * 7,
      })
      .json({ id: user.id, username: user.username });
  } catch (err) {
    console.error('Login error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token').json({ message: 'Logged out' });
});

app.get('/api/auth/me', ensureAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});

app.get('/api/rooms', ensureAuth, (req, res) => {
  const rooms = listRoomsStmt.all();
  res.json({ rooms });
});

app.post('/api/rooms', ensureAuth, (req, res) => {
  const { roomId } = req.body;
  if (!roomId) {
    return res.status(400).json({ message: 'Room id is required' });
  }
  try {
    upsertRoomStmt.run(roomId);
    res.status(201).json({ id: roomId });
  } catch (err) {
    console.error('Room creation error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    credentials: true,
  },
});

const roomsState = new Map();

const getUserFromToken = (token) => {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie?.split(';').find((c) => c.trim().startsWith('auth_token='));
  let authToken = token;
  if (typeof token === 'string' && token.includes('=')) {
    authToken = token.split('=')[1];
  } else if (Array.isArray(token)) {
    authToken = token[0];
  }
  if (!authToken && socket.handshake.headers?.cookie) {
    const cookies = Object.fromEntries(
      socket.handshake.headers.cookie.split(';').map((item) => {
        const [key, value] = item.trim().split('=');
        return [key, value];
      })
    );
    authToken = cookies['auth_token'];
  }
  const user = getUserFromToken(authToken);
  if (!user) {
    return next(new Error('Unauthorized'));
  }
  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ roomId, displayName }) => {
    if (!roomId) return;
    upsertRoomStmt.run(roomId);
    socket.join(roomId);
    const room = roomsState.get(roomId) || {
      participants: new Map(),
      callActive: false,
      boardEnabled: false,
    };
    room.participants.set(socket.id, {
      id: socket.id,
      username: socket.user.username,
      displayName: displayName || socket.user.username,
    });
    roomsState.set(roomId, room);

    io.to(roomId).emit('participantsUpdate', Array.from(room.participants.values()));
    socket.emit('callStatus', { callActive: room.callActive, boardEnabled: room.boardEnabled });
  });

  socket.on('leaveRoom', ({ roomId }) => {
    if (!roomId) return;
    socket.leave(roomId);
    const room = roomsState.get(roomId);
    if (room) {
      room.participants.delete(socket.id);
      if (room.participants.size === 0) {
        roomsState.delete(roomId);
      } else {
        io.to(roomId).emit('participantsUpdate', Array.from(room.participants.values()));
      }
    }
  });

  socket.on('chatMessage', ({ roomId, message }) => {
    if (!roomId || !message) return;
    io.to(roomId).emit('chatMessage', {
      id: `${Date.now()}-${Math.random()}`,
      sender: socket.user.username,
      message,
      timestamp: Date.now(),
    });
  });

  socket.on('startCall', ({ roomId }) => {
    if (!roomId) return;
    const room = roomsState.get(roomId);
    if (room) {
      room.callActive = true;
      io.to(roomId).emit('callStatus', { callActive: true, boardEnabled: room.boardEnabled });
    }
  });

  socket.on('endCall', ({ roomId }) => {
    if (!roomId) return;
    const room = roomsState.get(roomId);
    if (room) {
      room.callActive = false;
      room.boardEnabled = false;
      io.to(roomId).emit('callStatus', { callActive: false, boardEnabled: false });
      io.to(roomId).emit('boardClosed');
    }
  });

  socket.on('requestBoard', ({ roomId }) => {
    if (!roomId) return;
    const room = roomsState.get(roomId);
    if (room && room.callActive) {
      room.boardEnabled = true;
      io.to(roomId).emit('boardOpened');
    }
  });

  socket.on('closeBoard', ({ roomId }) => {
    if (!roomId) return;
    const room = roomsState.get(roomId);
    if (room) {
      room.boardEnabled = false;
      io.to(roomId).emit('boardClosed');
    }
  });

  socket.on('boardDraw', ({ roomId, stroke }) => {
    if (!roomId || !stroke) return;
    const room = roomsState.get(roomId);
    if (room && room.boardEnabled) {
      socket.to(roomId).emit('boardDraw', stroke);
    }
  });

  socket.on('boardClear', ({ roomId }) => {
    if (!roomId) return;
    const room = roomsState.get(roomId);
    if (room && room.boardEnabled) {
      io.to(roomId).emit('boardClear');
    }
  });

  socket.on('signal', ({ roomId, data, target }) => {
    if (!roomId || !data || !target) return;
    io.to(target).emit('signal', {
      sender: socket.id,
      data,
    });
  });

  socket.on('fileShare', ({ roomId, fileName, fileType, fileData }) => {
    if (!roomId || !fileName || !fileData) return;
    io.to(roomId).emit('fileShare', {
      sender: socket.user.username,
      fileName,
      fileType,
      fileData,
      timestamp: Date.now(),
    });
  });

  socket.on('disconnecting', () => {
    const rooms = Array.from(socket.rooms).filter((roomId) => roomId !== socket.id);
    rooms.forEach((roomId) => {
      const room = roomsState.get(roomId);
      if (room) {
        room.participants.delete(socket.id);
        if (room.participants.size === 0) {
          roomsState.delete(roomId);
        } else {
          io.to(roomId).emit('participantsUpdate', Array.from(room.participants.values()));
        }
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
