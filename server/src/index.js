const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 4000;
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];
const envOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const clientOriginsSet = new Set([...envOrigins, ...defaultOrigins]);

const isLocalDevelopmentOrigin = (origin) => {
  try {
    const url = new URL(origin);
    const isHttp = url.protocol === 'http:' || url.protocol === 'https:';
    const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return isHttp && isLocalhost;
  } catch (error) {
    return false;
  }
};

const allowOrigin = (origin) => {
  if (!origin) return true;
  if (clientOriginsSet.has(origin)) return true;
  if (isLocalDevelopmentOrigin(origin)) return true;
  return false;
};

const validateCorsOrigin = (origin, callback) => {
  if (allowOrigin(origin)) {
    callback(null, true);
  } else {
    callback(new Error('Not allowed by CORS'));
  }
};
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';

const dbPath = path.join(__dirname, '..', 'data', 'app.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const uploadsDir = path.join(__dirname, '..', 'uploads');
const audioUploadsDir = path.join(uploadsDir, 'audio');
if (!fs.existsSync(audioUploadsDir)) {
  fs.mkdirSync(audioUploadsDir, { recursive: true });
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

db.exec(`
  CREATE TABLE IF NOT EXISTS direct_chats (
    id TEXT PRIMARY KEY,
    user_one INTEGER NOT NULL,
    user_two INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(user_one, user_two)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    sender_id INTEGER NOT NULL,
    sender_name TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT,
    attachment_path TEXT,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_preferences (
    chat_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    custom_title TEXT,
    notifications_enabled INTEGER DEFAULT 1,
    PRIMARY KEY (chat_id, user_id)
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_invites (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    created_by INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    revoked INTEGER DEFAULT 0,
    redeemed_by INTEGER,
    redeemed_at INTEGER,
    FOREIGN KEY (chat_id) REFERENCES direct_chats(id)
  );
`);

const app = express();
app.use(cors({
  origin: validateCorsOrigin,
  credentials: true,
}));
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadsDir));

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
const getUserByIdStmt = db.prepare('SELECT id, username FROM users WHERE id = ?');
const searchUsersStmt = db.prepare(
  'SELECT id, username FROM users WHERE username LIKE ? AND id != ? ORDER BY username ASC LIMIT 10'
);
const upsertRoomStmt = db.prepare('INSERT OR IGNORE INTO rooms (id) VALUES (?)');
const insertMessageStmt = db.prepare(
  'INSERT INTO messages (room_id, sender_id, sender_name, type, content, attachment_path, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const getMessageByIdStmt = db.prepare(
  'SELECT id, room_id, sender_name, type, content, attachment_path, metadata, created_at FROM messages WHERE id = ?'
);
const listRoomMessagesStmt = db.prepare(
  'SELECT id, room_id, sender_name, type, content, attachment_path, metadata, created_at FROM messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 200'
);
const ensureChatAccessStmt = db.prepare(
  'SELECT id, user_one, user_two FROM direct_chats WHERE id = ? AND (user_one = ? OR user_two = ?)'
);
const listChatsForUserStmt = db.prepare(`
  SELECT
    dc.id,
    dc.created_at,
    CASE WHEN dc.user_one = ? THEN dc.user_two ELSE dc.user_one END AS partner_id,
    u.username AS partner_username,
    pref.custom_title AS custom_title,
    pref.notifications_enabled AS notifications_enabled,
    (
      SELECT sender_name FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_sender,
    (
      SELECT type FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_type,
    (
      SELECT content FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_content,
    (
      SELECT attachment_path FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_attachment,
    (
      SELECT metadata FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_metadata,
    (
      SELECT created_at FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_timestamp
  FROM direct_chats dc
  JOIN users u ON u.id = CASE WHEN dc.user_one = ? THEN dc.user_two ELSE dc.user_one END
  LEFT JOIN chat_preferences pref ON pref.chat_id = dc.id AND pref.user_id = ?
  WHERE dc.user_one = ? OR dc.user_two = ?
  ORDER BY COALESCE(last_timestamp, dc.created_at) DESC
  LIMIT 100
`);
const getChatSummaryStmt = db.prepare(`
  SELECT
    dc.id,
    dc.created_at,
    CASE WHEN dc.user_one = ? THEN dc.user_two ELSE dc.user_one END AS partner_id,
    u.username AS partner_username,
    pref.custom_title AS custom_title,
    pref.notifications_enabled AS notifications_enabled,
    (
      SELECT sender_name FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_sender,
    (
      SELECT type FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_type,
    (
      SELECT content FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_content,
    (
      SELECT attachment_path FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_attachment,
    (
      SELECT metadata FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_metadata,
    (
      SELECT created_at FROM messages WHERE room_id = dc.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) AS last_timestamp
  FROM direct_chats dc
  JOIN users u ON u.id = CASE WHEN dc.user_one = ? THEN dc.user_two ELSE dc.user_one END
  LEFT JOIN chat_preferences pref ON pref.chat_id = dc.id AND pref.user_id = ?
  WHERE dc.id = ? AND (dc.user_one = ? OR dc.user_two = ?)
`);
const createChatStmt = db.prepare(
  'INSERT OR IGNORE INTO direct_chats (id, user_one, user_two, created_at) VALUES (?, ?, ?, ?)'
);
const getChatRowStmt = db.prepare('SELECT id, user_one, user_two FROM direct_chats WHERE id = ?');
const getChatPreferencesStmt = db.prepare(
  'SELECT custom_title, notifications_enabled FROM chat_preferences WHERE chat_id = ? AND user_id = ?'
);
const upsertChatPreferencesStmt = db.prepare(`
  INSERT INTO chat_preferences (chat_id, user_id, custom_title, notifications_enabled)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(chat_id, user_id)
  DO UPDATE SET custom_title = excluded.custom_title, notifications_enabled = excluded.notifications_enabled
`);
const createInviteStmt = db.prepare(
  'INSERT INTO chat_invites (id, chat_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
);
const getInviteStmt = db.prepare(
  'SELECT id, chat_id, created_by, created_at, expires_at, revoked, redeemed_by, redeemed_at FROM chat_invites WHERE id = ?'
);
const markInviteRedeemedStmt = db.prepare(
  'UPDATE chat_invites SET revoked = 1, redeemed_by = ?, redeemed_at = ? WHERE id = ?'
);

const formatMessage = (row) => {
  if (!row) return null;
  let metadata = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata);
    } catch (err) {
      metadata = null;
    }
  }
  return {
    id: row.id.toString(),
    roomId: row.room_id,
    sender: row.sender_name,
    type: row.type,
    message: row.type === 'text' ? row.content || '' : '',
    audioPath: row.type === 'audio' ? row.attachment_path : null,
    metadata,
    timestamp: row.created_at,
  };
};

const formatChatSummary = (row) => {
  if (!row) return null;
  let metadata = null;
  if (row.last_metadata) {
    try {
      metadata = JSON.parse(row.last_metadata);
    } catch (err) {
      metadata = null;
    }
  }
  const createdAt = typeof row.created_at === 'number' ? row.created_at : Number(row.created_at);
  const notificationsEnabled = row.notifications_enabled == null ? true : row.notifications_enabled !== 0;
  const customTitle = row.custom_title || null;
  return {
    id: row.id,
    created_at: Number.isNaN(createdAt) ? null : createdAt,
    partner: row.partner_id
      ? {
          id: row.partner_id,
          username: row.partner_username,
        }
      : null,
    title:
      customTitle ||
      (row.partner_username ? `Чат с ${row.partner_username}` : 'Личный чат'),
    custom_title: customTitle,
    notifications_enabled: notificationsEnabled,
    last_message: row.last_type === 'audio' ? '[Голосовое сообщение]' : row.last_content || null,
    last_sender: row.last_sender || null,
    last_type: row.last_type || null,
    last_attachment: row.last_attachment || null,
    last_metadata: metadata,
    last_timestamp: row.last_timestamp ? Number(row.last_timestamp) : null,
  };
};

const getChatIdForUsers = (firstId, secondId) => {
  const [a, b] = [Number(firstId), Number(secondId)].sort((x, y) => x - y);
  return `chat_${a}_${b}`;
};

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

app.get('/api/users/search', ensureAuth, (req, res) => {
  const query = req.query.query?.trim();
  if (!query) {
    return res.json({ users: [] });
  }
  try {
    const cleaned = query.replace(/[%_]/g, '');
    if (!cleaned) {
      return res.json({ users: [] });
    }
    const term = `%${cleaned}%`;
    const results = searchUsersStmt.all(term, req.user.id).map((row) => ({
      id: row.id,
      username: row.username,
    }));
    res.json({ users: results });
  } catch (err) {
    console.error('User search error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/chats', ensureAuth, (req, res) => {
  try {
    const rows = listChatsForUserStmt.all(
      req.user.id,
      req.user.id,
      req.user.id,
      req.user.id,
      req.user.id
    );
    const chats = rows.map((row) => formatChatSummary(row));
    res.json({ chats });
  } catch (err) {
    console.error('List chats error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/chats', ensureAuth, (req, res) => {
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ message: 'Username is required' });
  }
  if (username === req.user.username) {
    return res.status(400).json({ message: 'Нельзя начать чат с самим собой' });
  }
  try {
    const otherUser = findUserStmt.get(username);
    if (!otherUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    const chatId = getChatIdForUsers(req.user.id, otherUser.id);
    const createdAt = Date.now();
    createChatStmt.run(chatId, Math.min(req.user.id, otherUser.id), Math.max(req.user.id, otherUser.id), createdAt);
    upsertRoomStmt.run(chatId);
    const detail = getChatSummaryStmt.get(
      req.user.id,
      req.user.id,
      req.user.id,
      chatId,
      req.user.id,
      req.user.id
    );
    const formatted = detail ? formatChatSummary(detail) : null;
    if (!formatted) {
      return res.status(500).json({ message: 'Не удалось создать чат' });
    }
    res.status(201).json({ chat: formatted });
  } catch (err) {
    console.error('Create chat error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/chats/:chatId', ensureAuth, (req, res) => {
  const { chatId } = req.params;
  if (!chatId) {
    return res.status(400).json({ message: 'Chat id is required' });
  }
  try {
    const detail = getChatSummaryStmt.get(
      req.user.id,
      req.user.id,
      req.user.id,
      chatId,
      req.user.id,
      req.user.id
    );
    if (!detail) {
      return res.status(404).json({ message: 'Чат не найден' });
    }
    const summary = formatChatSummary(detail);
    res.json({ chat: summary });
  } catch (err) {
    console.error('Get chat detail error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/chats/:chatId/messages', ensureAuth, (req, res) => {
  const { chatId } = req.params;
  if (!chatId) {
    return res.status(400).json({ message: 'Chat id is required' });
  }
  try {
    const detail = ensureChatAccessStmt.get(chatId, req.user.id, req.user.id);
    if (!detail) {
      return res.status(404).json({ message: 'Чат не найден' });
    }
    const messages = listRoomMessagesStmt
      .all(chatId)
      .map((row) => ({
        ...formatMessage(row),
        audioUrl: row.type === 'audio' && row.attachment_path ? `/uploads/${row.attachment_path}` : null,
      }));
    res.json({ messages });
  } catch (err) {
    console.error('Fetch messages error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/chats/:chatId/preferences', ensureAuth, (req, res) => {
  const { chatId } = req.params;
  if (!chatId) {
    return res.status(400).json({ message: 'Chat id is required' });
  }
  try {
    const detail = ensureChatAccessStmt.get(chatId, req.user.id, req.user.id);
    if (!detail) {
      return res.status(404).json({ message: 'Чат не найден' });
    }
    const prefs = getChatPreferencesStmt.get(chatId, req.user.id);
    res.json({
      preferences: {
        customTitle: prefs?.custom_title || null,
        notificationsEnabled: prefs?.notifications_enabled == null ? true : prefs.notifications_enabled !== 0,
      },
    });
  } catch (err) {
    console.error('Get chat preferences error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.patch('/api/chats/:chatId/preferences', ensureAuth, (req, res) => {
  const { chatId } = req.params;
  const { customTitle, notificationsEnabled } = req.body || {};
  if (!chatId) {
    return res.status(400).json({ message: 'Chat id is required' });
  }
  try {
    const detail = ensureChatAccessStmt.get(chatId, req.user.id, req.user.id);
    if (!detail) {
      return res.status(404).json({ message: 'Чат не найден' });
    }
    const trimmedTitle = typeof customTitle === 'string' ? customTitle.trim() : null;
    const limitedTitle = trimmedTitle ? trimmedTitle.slice(0, 80) : null;
    const notificationsFlag = notificationsEnabled === false ? 0 : 1;
    upsertChatPreferencesStmt.run(chatId, req.user.id, limitedTitle, notificationsFlag);
    res.json({
      preferences: {
        customTitle: limitedTitle,
        notificationsEnabled: notificationsFlag === 1,
      },
    });
  } catch (err) {
    console.error('Update chat preferences error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/chats/:chatId/invitations', ensureAuth, (req, res) => {
  const { chatId } = req.params;
  if (!chatId) {
    return res.status(400).json({ message: 'Chat id is required' });
  }
  try {
    const chat = ensureChatAccessStmt.get(chatId, req.user.id, req.user.id);
    if (!chat) {
      return res.status(404).json({ message: 'Чат не найден' });
    }
    const token = crypto.randomUUID();
    const createdAt = Date.now();
    const expiresAt = createdAt + 1000 * 60 * 60 * 24 * 3;
    createInviteStmt.run(token, chatId, req.user.id, createdAt, expiresAt);
    res.status(201).json({
      invite: {
        id: token,
        chatId,
        createdBy: req.user.id,
        createdAt,
        expiresAt,
      },
    });
  } catch (err) {
    console.error('Create chat invite error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/invitations/:inviteId', (req, res) => {
  const { inviteId } = req.params;
  if (!inviteId) {
    return res.status(400).json({ message: 'Invite id is required' });
  }
  try {
    const invite = getInviteStmt.get(inviteId);
    if (!invite) {
      return res.status(404).json({ message: 'Приглашение не найдено' });
    }
    const creator = getUserByIdStmt.get(invite.created_by);
    const now = Date.now();
    const status = invite.revoked
      ? 'revoked'
      : invite.redeemed_by
      ? 'redeemed'
      : invite.expires_at && invite.expires_at < now
      ? 'expired'
      : 'active';
    res.json({
      invite: {
        id: invite.id,
        chatId: invite.chat_id,
        createdBy: invite.created_by,
        creatorUsername: creator?.username || null,
        createdAt: invite.created_at,
        expiresAt: invite.expires_at,
        status,
        redeemedBy: invite.redeemed_by || null,
        redeemedAt: invite.redeemed_at || null,
      },
    });
  } catch (err) {
    console.error('Get invite error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/invitations/:inviteId/accept', ensureAuth, (req, res) => {
  const { inviteId } = req.params;
  if (!inviteId) {
    return res.status(400).json({ message: 'Invite id is required' });
  }
  try {
    const invite = getInviteStmt.get(inviteId);
    if (!invite) {
      return res.status(404).json({ message: 'Приглашение не найдено' });
    }
    const now = Date.now();
    if (invite.revoked) {
      return res.status(410).json({ message: 'Приглашение недействительно' });
    }
    if (invite.expires_at && invite.expires_at < now) {
      return res.status(410).json({ message: 'Приглашение истекло' });
    }
    if (invite.redeemed_by && invite.redeemed_by !== req.user.id) {
      return res.status(410).json({ message: 'Приглашение уже использовано' });
    }
    const chat = getChatRowStmt.get(invite.chat_id);
    if (!chat) {
      return res.status(404).json({ message: 'Чат недоступен' });
    }
    if (chat.user_one !== invite.created_by && chat.user_two !== invite.created_by) {
      return res.status(410).json({ message: 'Приглашение недействительно' });
    }
    const inviterId = invite.created_by;
    const targetChatId = getChatIdForUsers(inviterId, req.user.id);
    const createdAt = Date.now();
    createChatStmt.run(targetChatId, Math.min(inviterId, req.user.id), Math.max(inviterId, req.user.id), createdAt);
    upsertRoomStmt.run(targetChatId);
    markInviteRedeemedStmt.run(req.user.id, now, invite.id);
    const detail = getChatSummaryStmt.get(
      req.user.id,
      req.user.id,
      req.user.id,
      targetChatId,
      req.user.id,
      req.user.id
    );
    const formatted = detail ? formatChatSummary(detail) : null;
    if (!formatted) {
      return res.status(500).json({ message: 'Не удалось открыть чат' });
    }
    res.json({
      chat: formatted,
      invite: {
        id: invite.id,
        status: 'redeemed',
      },
    });
  } catch (err) {
    console.error('Accept invite error', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: validateCorsOrigin,
    credentials: true,
  },
});

const chatsState = new Map();
const MAX_BOARD_OBJECTS = 1000;

const createEmptyBoardState = () => ({ objects: [] });

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
  socket.on('joinChat', ({ chatId, displayName }) => {
    if (!chatId) return;
    const chat = ensureChatAccessStmt.get(chatId, socket.user.id, socket.user.id);
    if (!chat) {
      return;
    }
    upsertRoomStmt.run(chatId);
    socket.join(chatId);
    const room = chatsState.get(chatId) || {
      participants: new Map(),
      callActive: false,
      boardEnabled: false,
      boardState: createEmptyBoardState(),
    };
    room.participants.set(socket.id, {
      id: socket.id,
      username: socket.user.username,
      displayName: displayName || socket.user.username,
    });
    chatsState.set(chatId, room);

    io.to(chatId).emit('participantsUpdate', Array.from(room.participants.values()));
    socket.emit('callStatus', { callActive: room.callActive, boardEnabled: room.boardEnabled });
    if (room.boardEnabled) {
      socket.emit('boardSync', room.boardState || createEmptyBoardState());
    }
  });

  socket.on('leaveChat', ({ chatId }) => {
    if (!chatId) return;
    socket.leave(chatId);
    const room = chatsState.get(chatId);
    if (room) {
      room.participants.delete(socket.id);
      if (room.participants.size === 0) {
        chatsState.delete(chatId);
      } else {
        io.to(chatId).emit('participantsUpdate', Array.from(room.participants.values()));
      }
    }
  });

  socket.on('chatMessage', ({ chatId, message }) => {
    if (!chatId || typeof message !== 'string') return;
    const room = chatsState.get(chatId);
    if (!room || !room.participants.has(socket.id)) return;
    const trimmed = message.trim();
    if (!trimmed) return;
    try {
      const createdAt = Date.now();
      const info = insertMessageStmt.run(
        chatId,
        socket.user.id,
        socket.user.username,
        'text',
        trimmed,
        null,
        null,
        createdAt
      );
      const stored = formatMessage(getMessageByIdStmt.get(info.lastInsertRowid));
      if (stored) {
        io.to(chatId).emit('chatMessage', {
          ...stored,
          audioUrl: null,
        });
      }
    } catch (err) {
      console.error('chatMessage error', err);
    }
  });

  socket.on('voiceMessage', ({ chatId, audioData, duration }) => {
    if (!chatId || !audioData) return;
    const room = chatsState.get(chatId);
    if (!room || !room.participants.has(socket.id)) return;
    try {
      const createdAt = Date.now();
      let mimeType = 'audio/webm';
      let base64Payload = audioData;
      const match = typeof audioData === 'string' ? audioData.match(/^data:(.+);base64,(.+)$/) : null;
      if (match) {
        mimeType = match[1];
        base64Payload = match[2];
      }
      const buffer = Buffer.from(base64Payload, 'base64');
      const extension = mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('ogg') ? 'ogg' : 'webm';
      const fileName = `${Date.now()}-${socket.id}.${extension}`;
      const relativePath = path.posix.join('audio', fileName);
      const absolutePath = path.join(audioUploadsDir, fileName);
      fs.writeFileSync(absolutePath, buffer);
      const metadata = JSON.stringify({ duration: duration ?? null, mimeType });
      const info = insertMessageStmt.run(
        chatId,
        socket.user.id,
        socket.user.username,
        'audio',
        null,
        relativePath,
        metadata,
        createdAt
      );
      const stored = formatMessage(getMessageByIdStmt.get(info.lastInsertRowid));
      if (stored) {
        io.to(chatId).emit('chatMessage', {
          ...stored,
          audioUrl: `/uploads/${relativePath}`,
        });
      }
    } catch (err) {
      console.error('voiceMessage error', err);
    }
  });

  socket.on('startCall', ({ chatId }) => {
    if (!chatId) return;
    const room = chatsState.get(chatId);
    if (room) {
      room.callActive = true;
      io.to(chatId).emit('callStatus', { callActive: true, boardEnabled: room.boardEnabled });
    }
  });

  socket.on('endCall', ({ chatId }) => {
    if (!chatId) return;
    const room = chatsState.get(chatId);
    if (room) {
      room.callActive = false;
      room.boardEnabled = false;
      room.boardState = createEmptyBoardState();
      io.to(chatId).emit('callStatus', { callActive: false, boardEnabled: false });
      io.to(chatId).emit('boardClosed');
    }
  });

  socket.on('requestBoard', ({ chatId }) => {
    if (!chatId) return;
    const room = chatsState.get(chatId);
    if (room && room.callActive) {
      room.boardEnabled = true;
      room.boardState = room.boardState || createEmptyBoardState();
      io.to(chatId).emit('boardOpened');
      const snapshot = JSON.parse(JSON.stringify(room.boardState));
      io.to(chatId).emit('boardSync', snapshot);
    }
  });

  socket.on('closeBoard', ({ chatId }) => {
    if (!chatId) return;
    const room = chatsState.get(chatId);
    if (room) {
      room.boardEnabled = false;
      room.boardState = createEmptyBoardState();
      io.to(chatId).emit('boardClosed');
    }
  });

  socket.on('boardAddObject', ({ chatId, object }) => {
    if (!chatId || !object) return;
    const room = chatsState.get(chatId);
    if (room && room.boardEnabled) {
      room.boardState = room.boardState || createEmptyBoardState();
      const snapshot = JSON.parse(JSON.stringify(object));
      room.boardState.objects.push(snapshot);
      if (room.boardState.objects.length > MAX_BOARD_OBJECTS) {
        room.boardState.objects.splice(0, room.boardState.objects.length - MAX_BOARD_OBJECTS);
      }
      socket.to(chatId).emit('boardAddObject', snapshot);
    }
  });

  socket.on('boardUpdateObject', ({ chatId, objectId, updates }) => {
    if (!chatId || !objectId || !updates) return;
    const room = chatsState.get(chatId);
    if (room && room.boardEnabled && room.boardState?.objects) {
      const target = room.boardState.objects.find((item) => item.id === objectId);
      if (target) {
        Object.assign(target, updates);
        socket.to(chatId).emit('boardUpdateObject', { objectId, updates });
      }
    }
  });

  socket.on('boardRemoveObject', ({ chatId, objectId }) => {
    if (!chatId || !objectId) return;
    const room = chatsState.get(chatId);
    if (room && room.boardEnabled && room.boardState?.objects) {
      const index = room.boardState.objects.findIndex((item) => item.id === objectId);
      if (index !== -1) {
        room.boardState.objects.splice(index, 1);
        io.to(chatId).emit('boardRemoveObject', { objectId });
      }
    }
  });

  socket.on('boardClear', ({ chatId }) => {
    if (!chatId) return;
    const room = chatsState.get(chatId);
    if (room && room.boardEnabled) {
      room.boardState = createEmptyBoardState();
      io.to(chatId).emit('boardClear');
    }
  });

  socket.on('boardRequestSync', ({ chatId }) => {
    if (!chatId) return;
    const room = chatsState.get(chatId);
    if (room && room.boardEnabled) {
      const snapshot = room.boardState
        ? JSON.parse(JSON.stringify(room.boardState))
        : createEmptyBoardState();
      socket.emit('boardSync', snapshot);
    }
  });

  socket.on('signal', ({ chatId, data, target }) => {
    if (!chatId || !data || !target) return;
    const room = chatsState.get(chatId);
    if (!room || !room.participants.has(socket.id)) return;
    io.to(target).emit('signal', {
      sender: socket.id,
      data,
    });
  });

  socket.on('fileShare', ({ chatId, fileName, fileType, fileData }) => {
    if (!chatId || !fileName || !fileData) return;
    const room = chatsState.get(chatId);
    if (!room || !room.participants.has(socket.id)) return;
    io.to(chatId).emit('fileShare', {
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
      const room = chatsState.get(roomId);
      if (room) {
        room.participants.delete(socket.id);
        if (room.participants.size === 0) {
          chatsState.delete(roomId);
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
