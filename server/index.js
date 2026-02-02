import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import {
  connectDB,
  getAllSchools,
  getSchoolById,
  updateSchool,
  saveAllSchools,
  insertSchool,
  getAllUsers,
  getUserById,
  getAllPlans,
  getPlanByMonth,
  savePlan,
  deletePlan,
  createVersion,
  getAllVersions,
  getVersionByTimestamp,
  restoreVersion,
  deleteLastVersions,
  getVisits,
  getVisitById,
  createVisit,
  updateVisit,
  deleteVisit
} from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Environment configuration
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

// JWT secret - REQUIRED in production
const JWT_SECRET = process.env.JWT_SECRET || (IS_PRODUCTION ? null : 'schools-crm-dev-secret-key');
if (IS_PRODUCTION && !JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is required in production!');
  process.exit(1);
}
const JWT_EXPIRES_IN = '7d';

// Определяем режим работы из переменной окружения (sandbox только для локальной разработки)
const MODE = process.env.MODE || 'production';
const IS_SANDBOX = MODE === 'sandbox' && !IS_PRODUCTION;

// Порт из env (для PaaS) или дефолтный
const PORT = process.env.PORT || (IS_SANDBOX ? 3002 : 3001);

// CORS configuration
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const corsOptions = {
  origin: IS_PRODUCTION && CORS_ORIGIN !== '*'
    ? CORS_ORIGIN.split(',').map(o => o.trim())
    : true,
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// ====== MSK TIMEZONE HELPERS ======
const MSK_TIME_ZONE = 'Europe/Moscow';
const getMskDateString = (d = new Date()) => {
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MSK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

// File-based paths for sandbox mode only (local development)
const DATA_DIR = path.join(__dirname, 'data');
const SCHOOLS_FILE = path.join(DATA_DIR, IS_SANDBOX ? 'schools_sandbox.json' : 'schools.json');
const BACKUPS_DIR = path.join(DATA_DIR, IS_SANDBOX ? 'backups_sandbox' : 'backups');
const PRODUCTION_SCHOOLS_FILE = path.join(DATA_DIR, 'schools.json');
const PLANS_FILE = path.join(DATA_DIR, IS_SANDBOX ? 'plans_sandbox.json' : 'plans.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Create directories for sandbox mode
if (IS_SANDBOX) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  // Copy production data to sandbox on first run
  if (!fs.existsSync(SCHOOLS_FILE) && fs.existsSync(PRODUCTION_SCHOOLS_FILE)) {
    console.log('📋 Sandbox: копирование данных из production...');
    fs.copyFileSync(PRODUCTION_SCHOOLS_FILE, SCHOOLS_FILE);
    console.log('✅ Sandbox: данные скопированы успешно');
  }
}

// ============== AUTH FUNCTIONS ==============

// Чтение пользователей (для sandbox - из файла, для production - из MongoDB)
const readUsers = async () => {
  if (IS_SANDBOX) {
    // Sandbox mode: use file-based storage
    if (!fs.existsSync(USERS_FILE)) {
      return [];
    }
    const data = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    return data.users || [];
  }
  // Production mode: use MongoDB
  return getAllUsers();
};

// Verify password (supports both plaintext for migration and bcrypt hashes)
const verifyPassword = async (inputPassword, storedPassword) => {
  // Check if stored password is a bcrypt hash (starts with $2)
  if (storedPassword.startsWith('$2')) {
    return bcrypt.compare(inputPassword, storedPassword);
  }
  // Fallback to plaintext comparison (for migration period)
  return inputPassword === storedPassword;
};

// Middleware: проверка JWT токена
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Необходима авторизация' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
};

// Middleware: проверка роли администратора
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступно только администраторам' });
  }
  next();
};

// Создание бэкапа с указанием пользователя
const createBackupLocal = (userId = null) => {
  // File-based backup for sandbox mode only
  if (!fs.existsSync(SCHOOLS_FILE)) return null;

  const BACKUP_INTERVAL_MS = 60 * 60 * 1000;
  const prefix = IS_SANDBOX ? 'sandbox_' : 'schools_';
  const metaFile = path.join(BACKUPS_DIR, `${prefix}last_backup_meta.json`);

  try {
    if (fs.existsSync(metaFile)) {
      const meta = JSON.parse(fs.readFileSync(metaFile, 'utf-8'));
      const lastMs = typeof meta?.lastBackupMs === 'number' ? meta.lastBackupMs : null;
      if (lastMs && (Date.now() - lastMs) < BACKUP_INTERVAL_MS) {
        return null;
      }
    }
  } catch (e) {
    console.warn('⚠️ Не удалось прочитать meta бэкапов:', e?.message || e);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const userSuffix = userId ? `_${userId}` : '';
  const backupFile = path.join(BACKUPS_DIR, `${prefix}${timestamp}${userSuffix}.json`);
  fs.copyFileSync(SCHOOLS_FILE, backupFile);

  try {
    fs.writeFileSync(metaFile, JSON.stringify({
      lastBackupMs: Date.now(),
      lastBackupIso: new Date().toISOString(),
      lastBackupFile: path.basename(backupFile),
      userId: userId || null
    }, null, 2), 'utf-8');
  } catch (e) {
    console.warn('⚠️ Не удалось записать meta бэкапов:', e?.message || e);
  }

  const backups = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .reverse();

  if (backups.length > 50) {
    backups.slice(50).forEach(f => {
      fs.unlinkSync(path.join(BACKUPS_DIR, f));
    });
  }

  return timestamp;
};

// Create backup (routes to file or MongoDB based on mode)
const createBackup = async (schools, userId = null) => {
  if (IS_SANDBOX) {
    return createBackupLocal(userId);
  }
  // Production: use MongoDB versions
  return createVersion(schools, userId);
};

// Чтение школ (для sandbox - из файла, для production - из MongoDB)
const readSchools = async () => {
  if (IS_SANDBOX) {
    if (!fs.existsSync(SCHOOLS_FILE)) {
      return [];
    }
    return JSON.parse(fs.readFileSync(SCHOOLS_FILE, 'utf-8'));
  }
  // Production: use MongoDB
  return getAllSchools();
};

// Дедупликация школ по id (с сохранением данных)
const dedupeSchoolsById = (schools) => {
  if (!Array.isArray(schools)) return [];

  const byId = new Map();
  let duplicates = 0;

  const mergeArraysUnique = (a, b) => {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    return Array.from(new Set([...arrA, ...arrB]));
  };

  const mergeActivities = (a, b) => {
    const arrA = Array.isArray(a) ? a : [];
    const arrB = Array.isArray(b) ? b : [];
    const map = new Map();
    // порядок важен: сначала старые, потом новые (новые перетрут по id)
    [...arrA, ...arrB].forEach((act) => {
      if (!act || !act.id) return;
      map.set(act.id, act);
    });
    return Array.from(map.values());
  };

  schools.forEach((s) => {
    if (!s || !s.id) return;

    if (!byId.has(s.id)) {
      byId.set(s.id, s);
      return;
    }

    duplicates++;
    const prev = byId.get(s.id);
    const merged = { ...prev, ...s };

    // tags / activities — объединяем
    merged.tags = mergeArraysUnique(prev.tags, s.tags);
    merged.activities = mergeActivities(prev.activities, s.activities);

    byId.set(s.id, merged);
  });

  return { schools: Array.from(byId.values()), duplicates };
};

// Сохранение школ с указанием пользователя для бэкапа
const saveSchools = async (schools, userId = null) => {
  const { schools: deduped } = dedupeSchoolsById(schools);

  if (IS_SANDBOX) {
    // Sandbox: file-based storage
    createBackupLocal(userId);
    fs.writeFileSync(SCHOOLS_FILE, JSON.stringify(deduped, null, 2), 'utf-8');
  } else {
    // Production: MongoDB
    await createVersion(deduped, userId);
    await saveAllSchools(deduped);
  }
};

// ============== PLANS FUNCTIONS ==============

// Чтение планов (для sandbox - из файла, для production - из MongoDB)
const readPlans = async () => {
  if (IS_SANDBOX) {
    if (!fs.existsSync(PLANS_FILE)) {
      return { plans: [] };
    }
    try {
      const data = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf-8'));
      if (Array.isArray(data.plans)) {
        return data;
      }
      return { plans: [] };
    } catch (e) {
      console.warn('⚠️ Ошибка чтения планов:', e?.message || e);
      return { plans: [] };
    }
  }
  // Production: use MongoDB
  const plans = await getAllPlans();
  return { plans };
};

// Сохранение планов
const savePlansData = async (plans, userId = null) => {
  if (IS_SANDBOX) {
    const data = { plans: Array.isArray(plans) ? plans : [] };
    fs.writeFileSync(PLANS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`📋 Планы сохранены${userId ? ` (пользователь: ${userId})` : ''}`);
  } else {
    // Production: save each plan to MongoDB
    for (const plan of plans) {
      await savePlan(plan);
    }
    console.log(`📋 Планы сохранены в MongoDB${userId ? ` (пользователь: ${userId})` : ''}`);
  }
};

// Startup deduplication is handled in startServer() after DB connection

// ============== API ENDPOINTS ==============

// ============== AUTH ENDPOINTS ==============

// POST /api/auth/login — авторизация
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Укажите логин и пароль' });
    }

    const users = await readUsers();
    const user = users.find(u => u.id === username);

    if (!user) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Verify password (supports bcrypt hashes and plaintext for migration)
    const passwordValid = await verifyPassword(password, user.password || user.passwordHash || '');
    if (!passwordValid) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Создаём JWT токен
    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Ошибка авторизации' });
  }
});

// GET /api/auth/me — получить текущего пользователя
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      role: req.user.role
    }
  });
});

// ============== PUBLIC ENDPOINTS ==============

// GET /api/mode — получить текущий режим
app.get('/api/mode', (req, res) => {
  res.json({
    mode: MODE,
    isSandbox: IS_SANDBOX,
    port: PORT
  });
});

// GET /api/schools — получить все школы
app.get('/api/schools', async (req, res) => {
  try {
    const schools = await readSchools();
    res.json(schools);
  } catch (error) {
    console.error('Error reading schools:', error);
    res.status(500).json({ error: 'Ошибка чтения данных' });
  }
});

// GET /api/schools/:id — получить одну школу
app.get('/api/schools/:id', async (req, res) => {
  try {
    if (IS_SANDBOX) {
      const schools = await readSchools();
      const school = schools.find(s => s.id === req.params.id);
      if (!school) {
        return res.status(404).json({ error: 'Школа не найдена' });
      }
      res.json(school);
    } else {
      const school = await getSchoolById(req.params.id);
      if (!school) {
        return res.status(404).json({ error: 'Школа не найдена' });
      }
      res.json(school);
    }
  } catch (error) {
    console.error('Error reading school:', error);
    res.status(500).json({ error: 'Ошибка чтения данных' });
  }
});

// PUT /api/schools/:id — обновить школу
// Админ: может обновлять любые поля
// Менеджер: может обновлять только callsLink (ссылка на звонки)
app.put('/api/schools/:id', requireAuth, async (req, res) => {
  try {
    const isAdminUser = req.user?.role === 'admin';
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const keys = Object.keys(body);

    if (!isAdminUser) {
      const ALLOWED_MANAGER_FIELDS = new Set(['callsLink']);
      const forbidden = keys.filter(k => !ALLOWED_MANAGER_FIELDS.has(k));
      if (forbidden.length > 0) {
        return res.status(403).json({ error: 'Доступно только администраторам' });
      }
      // normalize type
      if (typeof body.callsLink !== 'string') {
        body.callsLink = '';
      }
    }

    const schools = await readSchools();
    const index = schools.findIndex(s => s.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Школа не найдена' });
    }

    // Обновляем только переданные поля
    schools[index] = { ...schools[index], ...body };
    await saveSchools(schools, req.user?.id);

    res.json({ success: true, school: schools[index] });
  } catch (error) {
    console.error('Error updating school:', error);
    res.status(500).json({ error: 'Ошибка обновления данных' });
  }
});

// POST /api/schools/:id/activity — добавить активность (требуется авторизация)
app.post('/api/schools/:id/activity', requireAuth, async (req, res) => {
  try {
    const schools = await readSchools();
    const index = schools.findIndex(s => s.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Школа не найдена' });
    }

    const activity = {
      id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      date: req.body.date || getMskDateString(),
      type: req.body.type,
      description: req.body.description || '',
      parentContacts: req.body.parentContacts || 0,
      classesContacted: req.body.classesContacted || [],
      createdBy: req.user.id, // Кто создал активность
      createdByName: req.user?.name || null
    };

    if (!schools[index].activities) {
      schools[index].activities = [];
    }
    schools[index].activities.push(activity);

    await saveSchools(schools, req.user.id);

    res.json({ success: true, activity, school: schools[index] });
  } catch (error) {
    console.error('Error adding activity:', error);
    res.status(500).json({ error: 'Ошибка добавления активности' });
  }
});

// PUT /api/schools/:id/status — быстрое обновление статуса (только админ)
app.put('/api/schools/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const schools = await readSchools();
    const index = schools.findIndex(s => s.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: 'Школа не найдена' });
    }

    const { statusField, date } = req.body;
    const statusDate = date || getMskDateString();

    // Обновляем статус
    schools[index][statusField] = statusDate;

    await saveSchools(schools, req.user?.id);

    res.json({ success: true, school: schools[index] });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Ошибка обновления статуса' });
  }
});

// GET /api/metrics — получить метрики за период
app.get('/api/metrics', async (req, res) => {
  try {
    const { from, to } = req.query;
    const schools = await readSchools();

    const isInPeriod = (dateStr, periodStart, periodEnd) => {
      if (!dateStr) return false;
      return dateStr >= periodStart && dateStr <= periodEnd;
    };

    const metrics = {
      newSchools: schools.filter(s => isInPeriod(s.inWorkDate, from, to)).length,
      schoolsInWork: schools.filter(s => s.inWorkDate && s.inWorkDate <= to).length,
      contactMade: schools.filter(s => isInPeriod(s.contactDate, from, to)).length,
      meetingScheduled: schools.filter(s => isInPeriod(s.meetingScheduledDate, from, to)).length,
      meetingHeld: schools.filter(s => isInPeriod(s.meetingHeldDate, from, to)).length,
      eventScheduled: schools.filter(s => isInPeriod(s.eventScheduledDate, from, to)).length,
      eventHeld: schools.filter(s => isInPeriod(s.eventHeldDate, from, to)).length,
      campusVisitPlanned: schools.filter(s => isInPeriod(s.campusVisitPlannedDate, from, to)).length,
      loadedToCRM: schools.filter(s => isInPeriod(s.loadedToCRMDate, from, to)).length,
      qualifiedLeads: schools.filter(s => isInPeriod(s.qualifiedLeadDate, from, to)).length,
      arrivedToCampus: schools.filter(s => isInPeriod(s.arrivedToCampusDate, from, to)).length,
      preliminaryMeetings: schools.filter(s => isInPeriod(s.preliminaryMeetingDate, from, to)).length,
      parentContacts: schools.reduce((sum, school) => {
        if (!school.activities) return sum;
        return sum + school.activities
          .filter(a => isInPeriod(a.date, from, to))
          .reduce((s, a) => s + (a.parentContacts || 0), 0);
      }, 0)
    };

    res.json(metrics);
  } catch (error) {
    console.error('Error calculating metrics:', error);
    res.status(500).json({ error: 'Ошибка расчета метрик' });
  }
});

// GET /api/versions — список бэкапов
app.get('/api/versions', async (req, res) => {
  try {
    if (IS_SANDBOX) {
      // Sandbox: file-based versions
      const prefix = IS_SANDBOX ? 'sandbox_' : 'schools_';
      const users = await readUsers();

      const backups = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
        .sort()
        .reverse()
        .map(filename => {
          const filePath = path.join(BACKUPS_DIR, filename);
          const stats = fs.statSync(filePath);

          const nameWithoutPrefix = filename.replace(prefix, '').replace('.json', '');
          const timestamp = nameWithoutPrefix.slice(0, 19);
          const userId = nameWithoutPrefix.length > 19 ? nameWithoutPrefix.slice(20) : null;

          const user = userId ? users.find(u => u.id === userId) : null;

          return {
            filename,
            timestamp,
            displayDate: new Date(stats.mtime).toLocaleString('ru'),
            size: stats.size,
            userId: userId || null,
            userName: user ? user.name : null
          };
        });

      return res.json(backups);
    }

    // Production: MongoDB versions
    const versions = await getAllVersions();
    const users = await readUsers();

    const formattedVersions = versions.map(v => {
      const user = v.userId ? users.find(u => u.id === v.userId) : null;
      return {
        timestamp: v.timestamp,
        displayDate: new Date(v.createdAt).toLocaleString('ru'),
        schoolsCount: v.schoolsCount,
        userId: v.userId || null,
        userName: user ? user.name : null
      };
    });

    res.json(formattedVersions);
  } catch (error) {
    console.error('Error reading versions:', error);
    res.status(500).json({ error: 'Ошибка чтения версий' });
  }
});

// POST /api/restore/:version — восстановить версию (только админ)
app.post('/api/restore/:version', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { version } = req.params;

    if (IS_SANDBOX) {
      // Sandbox: file-based restore
      const prefix = 'sandbox_';
      const backupFile = path.join(BACKUPS_DIR, `${prefix}${version}.json`);

      if (!fs.existsSync(backupFile)) {
        return res.status(404).json({ error: 'Версия не найдена' });
      }

      createBackupLocal();
      fs.copyFileSync(backupFile, SCHOOLS_FILE);

      return res.json({ success: true, message: `Данные восстановлены из версии ${version}` });
    }

    // Production: MongoDB restore
    const versionData = await restoreVersion(version);
    if (!versionData) {
      return res.status(404).json({ error: 'Версия не найдена' });
    }

    // Create backup of current state before restore
    const currentSchools = await getAllSchools();
    await createVersion(currentSchools, req.user?.id);

    // Restore schools from version
    await saveAllSchools(versionData);

    res.json({ success: true, message: `Данные восстановлены из версии ${version}` });
  } catch (error) {
    console.error('Error restoring version:', error);
    res.status(500).json({ error: 'Ошибка восстановления версии' });
  }
});

// DELETE /api/versions/last?count=N — удалить последние N записей (только админ)
app.delete('/api/versions/last', requireAuth, requireAdmin, async (req, res) => {
  try {
    const count = Math.min(Math.max(1, parseInt(req.query.count, 10) || 1), 100);

    if (IS_SANDBOX) {
      const prefix = 'sandbox_';
      const backupFiles = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith(prefix) && f.endsWith('.json') && !f.includes('last_backup_meta'))
        .map(filename => ({
          filename,
          mtime: fs.statSync(path.join(BACKUPS_DIR, filename)).mtime
        }))
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, count);

      for (const { filename } of backupFiles) {
        fs.unlinkSync(path.join(BACKUPS_DIR, filename));
      }
      return res.json({ success: true, deleted: backupFiles.length, message: `Удалено записей: ${backupFiles.length}` });
    }

    const { deleted } = await deleteLastVersions(count);
    res.json({ success: true, deleted, message: `Удалено записей: ${deleted}` });
  } catch (error) {
    console.error('Error deleting last versions:', error);
    res.status(500).json({ error: 'Ошибка удаления записей' });
  }
});

// POST /api/sandbox/reset — сбросить sandbox данные (только для sandbox режима)
app.post('/api/sandbox/reset', async (req, res) => {
  if (!IS_SANDBOX) {
    return res.status(403).json({ error: 'Доступно только в sandbox режиме' });
  }

  try {
    // Создаём бэкап текущих sandbox данных
    createBackupLocal();

    // Копируем данные из production
    if (fs.existsSync(PRODUCTION_SCHOOLS_FILE)) {
      fs.copyFileSync(PRODUCTION_SCHOOLS_FILE, SCHOOLS_FILE);
      res.json({ success: true, message: 'Sandbox данные сброшены из production' });
    } else {
      fs.writeFileSync(SCHOOLS_FILE, '[]', 'utf-8');
      res.json({ success: true, message: 'Sandbox данные очищены (production не найден)' });
    }
  } catch (error) {
    console.error('Error resetting sandbox:', error);
    res.status(500).json({ error: 'Ошибка сброса sandbox данных' });
  }
});

// POST /api/sandbox/clear — очистить метрики и активности, но сохранить базу школ (только для sandbox режима, только админ)
app.post('/api/sandbox/clear', requireAuth, requireAdmin, async (req, res) => {
  if (!IS_SANDBOX) {
    return res.status(403).json({ error: 'Доступно только в sandbox режиме' });
  }

  try {
    console.log('Начало очистки sandbox данных...');

    // Создаём бэкап текущих sandbox данных перед очисткой
    try {
      createBackupLocal();
      console.log('Бэкап создан');
    } catch (backupError) {
      console.warn('Ошибка при создании бэкапа (продолжаем):', backupError);
    }

    // Загружаем текущие школы
    let schools;
    try {
      schools = await readSchools();
      console.log(`Загружено школ: ${Array.isArray(schools) ? schools.length : 'не массив'}`);
    } catch (readError) {
      console.error('Ошибка чтения школ:', readError);
      return res.status(500).json({ error: `Ошибка чтения данных: ${readError.message}` });
    }

    if (!Array.isArray(schools)) {
      console.error('Данные не являются массивом:', typeof schools);
      return res.status(500).json({ error: 'Некорректный формат данных школ' });
    }

    // Очищаем только метрики и активности, сохраняя базовую информацию о школах
    let cleanedSchools;
    try {
      cleanedSchools = schools.map((school, index) => {
        if (!school || typeof school !== 'object') {
          console.warn(`Пропущена некорректная запись школы #${index}:`, school);
          return null;
        }

        // Создаем объект с базовой информацией
        const cleaned = {
          // Базовая информация о школе (сохраняем)
          id: school.id || '',
          name: school.name || '',
          district: school.district || '',
          region: school.region || 'Москва',
          city: school.city || '',
          address: school.address || '',
          website: school.website || '',
          uchiLink: school.uchiLink || '',
          travelTime: school.travelTime || '',
          tags: Array.isArray(school.tags) ? school.tags : [],
          amoLink: school.amoLink || '',

          // Очищаем все даты и метрики
          inWorkDate: null,
          contactDate: null,
          meetingScheduledDate: null,
          meetingHeldDate: null,
          eventScheduledDate: null,
          eventHeldDate: null,
          campusVisitPlannedDate: null,
          loadedToCRMDate: null,
          qualifiedLeadDate: null,
          arrivedToCampusDate: null,
          preliminaryMeetingDate: null,
          excursionPlannedDate: null,

          // Очищаем статусы звонков и диалогов
          callStatus: null,
          callDate: null,
          callAttempts: 0,
          dialogueStatus: null,
          dialogueDate: null,
          dialogueNotes: '',
          callbackDate: null,

          // Очищаем статусы встреч и мероприятий
          meetingStatus: null,
          meetingDate: null,
          meetingNotes: '',
          eventStatus: null,
          eventDate: null,
          eventNotes: '',

          // Очищаем числовые метрики
          classesCount: 0,
          leadsCount: 0,
          campusVisitsCount: 0,

          // Очищаем активности
          activities: [],

          // Очищаем заметки
          notes: ''
        };

        return cleaned;
      }).filter(school => school !== null); // Удаляем некорректные записи

      console.log(`Очищено школ: ${cleanedSchools.length} из ${schools.length}`);
    } catch (mapError) {
      console.error('Ошибка при обработке школ:', mapError);
      return res.status(500).json({ error: `Ошибка обработки данных: ${mapError.message}` });
    }

    // Сохраняем очищенные данные
    try {
      await saveSchools(cleanedSchools, req.user?.id);
      console.log('Данные успешно сохранены');
    } catch (saveError) {
      console.error('Ошибка сохранения:', saveError);
      return res.status(500).json({ error: `Ошибка сохранения: ${saveError.message}` });
    }

    res.json({
      success: true,
      message: `Метрики и активности очищены. Сохранено школ: ${cleanedSchools.length}`,
      schoolsCount: cleanedSchools.length
    });
  } catch (error) {
    console.error('Критическая ошибка при очистке sandbox:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      error: 'Ошибка очистки sandbox данных',
      details: error.message
    });
  }
});

// POST /api/schools/batch-update — массовое обновление школ (для пайплайна заполнения дня, требуется авторизация)
app.post('/api/schools/batch-update', requireAuth, async (req, res) => {
  try {
    const { updates, numericMetricsBySchool, unknownFunnelMetrics, date } = req.body;

    console.log('Batch update request:', {
      updatesCount: updates?.length || 0,
      numericMetricsCount: numericMetricsBySchool?.length || 0,
      unknownFunnelMetrics: unknownFunnelMetrics ? Object.keys(unknownFunnelMetrics).length : 0,
      date,
      userId: req.user?.id
    });

    // updates может быть пустым массивом, если заполнены только числовые метрики
    const updatesArray = Array.isArray(updates) ? updates : [];

    if (!date) {
      return res.status(400).json({ error: 'Не указана дата' });
    }

    const schools = await readSchools();
    let updatedCount = 0;
    let unknownFunnelCount = 0;

    // Группируем обновления по школам (каскадные метрики - выбор школ)
    const schoolUpdates = {};
    updatesArray.forEach(update => {
      const { schoolId, dateField, date: updateDate } = update;
      if (!schoolId || !dateField) {
        console.warn('Пропущено некорректное обновление:', update);
        return;
      }
      if (!schoolUpdates[schoolId]) {
        schoolUpdates[schoolId] = {};
      }
      schoolUpdates[schoolId][dateField] = updateDate || date;
    });

    // Применяем обновления школ
    for (const [schoolId, fields] of Object.entries(schoolUpdates)) {
      // Обработка виртуальной школы "неизвестно"
      if (schoolId === '__unknown_school__') {
        // Создаем временную запись для метрик без привязки к конкретной школе
        // Можно создать специальную запись или просто пропустить
        // Для простоты создаем запись с ID "unknown_<timestamp>"
        const unknownSchool = {
          id: `unknown_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: '❓ Неизвестно',
          district: '',
          region: 'Москва',
          city: '',
          address: '',
          website: '',
          uchiLink: '',
          travelTime: '',
          tags: ['неизвестно'],
          amoLink: '',
          inWorkDate: null,
          contactDate: null,
          meetingScheduledDate: null,
          meetingHeldDate: null,
          eventScheduledDate: null,
          eventHeldDate: null,
          campusVisitPlannedDate: null,
          loadedToCRMDate: null,
          qualifiedLeadDate: null,
          arrivedToCampusDate: null,
          preliminaryMeetingDate: null,
          excursionPlannedDate: null,
          callStatus: null,
          callDate: null,
          callAttempts: 0,
          dialogueStatus: null,
          dialogueDate: null,
          dialogueNotes: '',
          callbackDate: null,
          meetingStatus: null,
          meetingDate: null,
          meetingNotes: '',
          eventStatus: null,
          eventDate: null,
          eventNotes: '',
          classesCount: 0,
          leadsCount: 0,
          campusVisitsCount: 0,
          notes: 'Создано автоматически для метрик без указания школы',
          activities: []
        };

        // Применяем поля обновления
        Object.assign(unknownSchool, fields);
        schools.push(unknownSchool);
        updatedCount++;
        continue;
      }

      const index = schools.findIndex(s => s.id === schoolId);
      if (index !== -1) {
        schools[index] = { ...schools[index], ...fields };
        updatedCount++;
      }
    }

    // Обрабатываем числовые метрики (привязанные к школам с мероприятием)
    let numericMetricsCount = 0;
    if (numericMetricsBySchool && Array.isArray(numericMetricsBySchool)) {
      numericMetricsBySchool.forEach((item) => {
        if (!item || !item.schoolId || !item.metrics) {
          console.warn('Пропущена некорректная числовая метрика:', item);
          return;
        }

        const { schoolId, metrics } = item;
        numericMetricsCount++;

        // Обработка виртуальной школы "неизвестно" (одна запись: __unknown_school__)
        if (schoolId === '__unknown_school__') {
          let idx = schools.findIndex(s => s.id === '__unknown_school__');
          if (idx === -1) {
            const unknownSchool = {
              id: '__unknown_school__',
              name: '❓ Неизвестно',
              district: '',
              region: 'Москва',
              city: '',
              address: '',
              website: '',
              uchiLink: '',
              travelTime: '',
              tags: ['неизвестно'],
              amoLink: '',
              inWorkDate: null,
              contactDate: null,
              meetingScheduledDate: null,
              meetingHeldDate: null,
              eventScheduledDate: null,
              eventHeldDate: null,
              campusVisitPlannedDate: null,
              loadedToCRMDate: null,
              qualifiedLeadDate: null,
              arrivedToCampusDate: null,
              preliminaryMeetingDate: null,
              excursionPlannedDate: null,
              callStatus: null,
              callDate: null,
              callAttempts: 0,
              dialogueStatus: null,
              dialogueDate: null,
              dialogueNotes: '',
              callbackDate: null,
              meetingStatus: null,
              meetingDate: null,
              meetingNotes: '',
              eventStatus: null,
              eventDate: null,
              eventNotes: '',
              classesCount: 0,
              leadsCount: 0,
              campusVisitsCount: 0,
              notes: 'Создано автоматически для метрик без указания школы',
              activities: []
            };
            schools.push(unknownSchool);
            idx = schools.length - 1;
          }

          if (!schools[idx].activities) {
            schools[idx].activities = [];
          }

          const activity = {
            id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            date: date,
            type: 'numeric_metrics',
            metrics: metrics,
            description: `Числовые метрики: ${Object.entries(metrics).map(([key, value]) => {
              const metricNames = {
                parentContacts: 'Кол-во контактов родителя',
                loadedToCRM: 'Кол-во загруженных в CRM',
                qualifiedLeads: 'Квал заявки',
                arrivedToCampus: 'Доехавшие до кампуса',
                preliminaryMeetings: 'Предвары'
              };
              return `${metricNames[key] || key}: ${value}`;
            }).join(', ')}`,
            createdBy: req.user?.id,
            createdByName: req.user?.name || null
          };

          schools[idx].activities.push(activity);

          // Также обновляем поля школы напрямую, если они есть
          if (metrics.qualifiedLeads) {
            schools[idx].qualifiedLeadDate = date;
          }
          if (metrics.arrivedToCampus) {
            schools[idx].arrivedToCampusDate = date;
          }
          if (metrics.preliminaryMeetings) {
            schools[idx].preliminaryMeetingDate = date;
          }

          return;
        }

        const index = schools.findIndex(s => s.id === schoolId);
        if (index !== -1) {
          // Сохраняем числовые метрики в активности школы
          if (!schools[index].activities) {
            schools[index].activities = [];
          }

          // Создаем активность с числовыми метриками
          const activity = {
            id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            date: date,
            type: 'numeric_metrics',
            metrics: metrics,
            description: `Числовые метрики: ${Object.entries(metrics).map(([key, value]) => {
              const metricNames = {
                parentContacts: 'Кол-во контактов родителя',
                loadedToCRM: 'Кол-во загруженных в CRM',
                qualifiedLeads: 'Квал заявки',
                arrivedToCampus: 'Доехавшие до кампуса',
                preliminaryMeetings: 'Предвары'
              };
              return `${metricNames[key] || key}: ${value}`;
            }).join(', ')}`,
            createdBy: req.user?.id,
            createdByName: req.user?.name || null
          };

          schools[index].activities.push(activity);

          // Также обновляем поля школы напрямую, если они есть
          if (metrics.qualifiedLeads) {
            schools[index].qualifiedLeadDate = date;
          }
          if (metrics.arrivedToCampus) {
            schools[index].arrivedToCampusDate = date;
          }
          if (metrics.preliminaryMeetings) {
            schools[index].preliminaryMeetingDate = date;
          }
        }
      });
    }

    // Если есть каскадные метрики, которые были отмечены как "неизвестно" (количеством),
    // сохраняем их отдельной активностью на школе "__unknown_school__"
    if (unknownFunnelMetrics && typeof unknownFunnelMetrics === 'object') {
      const cleaned = {};
      for (const [k, v] of Object.entries(unknownFunnelMetrics)) {
        if (typeof v === 'number' && v > 0) cleaned[k] = v;
      }
      if (Object.keys(cleaned).length > 0) {
        let idx = schools.findIndex(s => s.id === '__unknown_school__');
        if (idx === -1) {
          const unknownSchool = {
            id: '__unknown_school__',
            name: '❓ Неизвестно',
            district: '',
            region: 'Москва',
            city: '',
            address: '',
            website: '',
            uchiLink: '',
            travelTime: '',
            tags: ['неизвестно'],
            amoLink: '',
            inWorkDate: null,
            contactDate: null,
            meetingScheduledDate: null,
            meetingHeldDate: null,
            eventScheduledDate: null,
            eventHeldDate: null,
            campusVisitPlannedDate: null,
            loadedToCRMDate: null,
            qualifiedLeadDate: null,
            arrivedToCampusDate: null,
            preliminaryMeetingDate: null,
            excursionPlannedDate: null,
            callStatus: null,
            callDate: null,
            callAttempts: 0,
            dialogueStatus: null,
            dialogueDate: null,
            dialogueNotes: '',
            callbackDate: null,
            meetingStatus: null,
            meetingDate: null,
            meetingNotes: '',
            eventStatus: null,
            eventDate: null,
            eventNotes: '',
            classesCount: 0,
            leadsCount: 0,
            campusVisitsCount: 0,
            notes: 'Создано автоматически для метрик без указания школы',
            activities: []
          };
          schools.push(unknownSchool);
          idx = schools.length - 1;
        }

        if (!schools[idx].activities) schools[idx].activities = [];

        const metricNames = {
          newSchools: 'Новые школы',
          contactMade: 'Контакт состоялся',
          meetingScheduled: 'Встреча назначена',
          meetingHeld: 'Встреча состоялась',
          eventScheduled: 'Мероприятие назначено',
          eventHeld: 'Мероприятие проведено',
          excursionPlanned: 'Экскурсия запланирована',
        };

        const activity = {
          id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          date: date,
          type: 'funnel_metrics',
          metrics: cleaned,
          description: `Воронка (неизвестно): ${Object.entries(cleaned).map(([key, value]) => {
            return `${metricNames[key] || key}: ${value}`;
          }).join(', ')}`,
          createdBy: req.user?.id,
          createdByName: req.user?.name || null
        };

        schools[idx].activities.push(activity);
        unknownFunnelCount = Object.values(cleaned).reduce((s, v) => s + v, 0);
      }
    }

    // Сохраняем, если есть обновления или числовые метрики
    if (updatedCount > 0 || numericMetricsCount > 0 || unknownFunnelCount > 0) {
      await saveSchools(schools, req.user?.id);
    } else {
      // В sandbox часто нужно понять, почему "неизвестно" не посчиталось
      const debug = IS_SANDBOX ? {
        date,
        updatesLength: Array.isArray(updates) ? updates.length : null,
        numericMetricsLength: Array.isArray(numericMetricsBySchool) ? numericMetricsBySchool.length : null,
        unknownFunnelMetrics,
        cleanedUnknownFunnel: (typeof unknownFunnelMetrics === 'object' && unknownFunnelMetrics)
          ? Object.fromEntries(Object.entries(unknownFunnelMetrics).filter(([, v]) => typeof v === 'number' && v > 0))
          : null,
        updatedCount,
        numericMetricsCount,
        unknownFunnelCount
      } : undefined

      return res.status(400).json({ error: 'Нет данных для сохранения', debug });
    }

    res.json({
      success: true,
      message: `Обновлено школ: ${updatedCount}${numericMetricsCount > 0 ? `, числовые метрики привязаны к ${numericMetricsCount} школам` : ''}${unknownFunnelCount > 0 ? `, неизвестно (воронка): ${unknownFunnelCount}` : ''}`,
      updatedCount,
      numericMetricsCount,
      unknownFunnelCount
    });
  } catch (error) {
    console.error('Error batch updating schools:', error);
    console.error('Error stack:', error.stack);
    console.error('Request body:', JSON.stringify(req.body, null, 2));
    res.status(500).json({
      error: 'Ошибка массового обновления',
      details: error.message
    });
  }
});

// ====== RESOLVE UNKNOWN ======
// Раскрытие неизвестных школ - замена неизвестности реальными данными
app.post('/api/schools/resolve-unknown', requireAuth, async (req, res) => {
  try {
    const { unknownSchoolId, activityId, metricKey, metricType, resolutions } = req.body;

    // Валидация
    if (!activityId || typeof activityId !== 'string') {
      return res.status(400).json({ error: 'activityId обязателен' });
    }
    if (!metricKey || typeof metricKey !== 'string') {
      return res.status(400).json({ error: 'metricKey обязателен' });
    }
    if (!resolutions || !Array.isArray(resolutions) || resolutions.length === 0) {
      return res.status(400).json({ error: 'resolutions должен быть непустым массивом' });
    }

    // Маппинг метрик воронки на dateField
    const funnelMetricToDateField = {
      newSchools: 'inWorkDate',
      contactMade: 'contactDate',
      meetingScheduled: 'meetingScheduledDate',
      meetingHeld: 'meetingHeldDate',
      eventScheduled: 'eventScheduledDate',
      eventHeld: 'eventHeldDate',
      excursionPlanned: 'excursionPlannedDate',
    };

    const numericMetricNames = {
      parentContacts: 'Кол-во контактов родителя',
      loadedToCRM: 'Кол-во загруженных в CRM',
      qualifiedLeads: 'Квал заявки',
      arrivedToCampus: 'Доехавшие до кампуса',
      preliminaryMeetings: 'Предвары'
    };

    const inferredType = metricType || (funnelMetricToDateField[metricKey] ? 'funnel' : (numericMetricNames[metricKey] ? 'numeric' : null));
    if (!inferredType) {
      return res.status(400).json({ error: `Неизвестная метрика: ${metricKey}` });
    }

    const schools = await readSchools();

    // Найти __unknown_school__
    const sourceUnknownId = (typeof unknownSchoolId === 'string' && unknownSchoolId.length > 0) ? unknownSchoolId : '__unknown_school__';
    const unknownIdx = schools.findIndex(s => s.id === sourceUnknownId);
    if (unknownIdx === -1) {
      return res.status(404).json({ error: `Школа ${sourceUnknownId} не найдена` });
    }

    const unknownSchool = schools[unknownIdx];
    if (!unknownSchool.activities || !Array.isArray(unknownSchool.activities)) {
      return res.status(404).json({ error: 'У __unknown_school__ нет активностей' });
    }

    // Найти активность по ID
    const activityIdx = unknownSchool.activities.findIndex(a => a.id === activityId);
    if (activityIdx === -1) {
      return res.status(404).json({ error: `Активность ${activityId} не найдена` });
    }

    const activity = unknownSchool.activities[activityIdx];
    // Проверяем тип активности в зависимости от метрики
    if (inferredType === 'funnel') {
      if (activity.type !== 'funnel_metrics') {
        return res.status(400).json({ error: 'Активность не является funnel_metrics' });
      }
    } else {
      if (activity.type !== 'numeric_metrics') {
        return res.status(400).json({ error: 'Активность не является numeric_metrics' });
      }
    }

    // Достаём текущее значение неизвестности
    let currentCount = 0;
    if (inferredType === 'funnel') {
      if (!activity.metrics || typeof activity.metrics[metricKey] !== 'number') {
        return res.status(400).json({ error: `Метрика ${metricKey} не найдена в активности` });
      }
      currentCount = activity.metrics[metricKey];
    } else {
      // numeric: может быть в activity.metrics[metricKey] (новое) или в activity.parentContacts (legacy)
      const fromMetrics = (activity.metrics && typeof activity.metrics[metricKey] === 'number')
        ? activity.metrics[metricKey]
        : 0;
      const fromLegacyParentContacts = (metricKey === 'parentContacts' && typeof activity.parentContacts === 'number')
        ? activity.parentContacts
        : 0;

      currentCount = fromMetrics + fromLegacyParentContacts;
      if (currentCount <= 0) {
        return res.status(400).json({ error: `Метрика ${metricKey} не найдена в активности` });
      }
    }

    // Применяем раскрытия к школам
    let resolvedCount = 0;
    const errors = [];

    // Воронка: 1 resolution = 1 школа
    // Числовые: resolution.value — сколько переносим в школу
    let totalNumericResolved = 0;

    for (const resolution of resolutions) {
      const { schoolId, date, value } = resolution;

      if (!schoolId || !date) {
        errors.push(`Пропущен schoolId или date в resolution`);
        continue;
      }

      const schoolIdx = schools.findIndex(s => s.id === schoolId);
      if (schoolIdx === -1) {
        errors.push(`Школа ${schoolId} не найдена`);
        continue;
      }

      if (inferredType === 'funnel') {
        const dateField = funnelMetricToDateField[metricKey];
        // Устанавливаем dateField на школе
        schools[schoolIdx][dateField] = date;
        resolvedCount++;
      } else {
        const numericValue = typeof value === 'number' ? value : 0;
        if (numericValue <= 0) {
          errors.push(`Некорректное value для ${schoolId}`);
          continue;
        }
        // Добавляем numeric_metrics активность на школу
        if (!schools[schoolIdx].activities) schools[schoolIdx].activities = [];
        schools[schoolIdx].activities.push({
          id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          date,
          type: 'numeric_metrics',
          metrics: { [metricKey]: numericValue },
          description: `Числовые метрики: ${numericMetricNames[metricKey] || metricKey}: ${numericValue}`,
          createdBy: req.user?.id,
          createdByName: req.user?.name || null
        });

        // Обновляем date-поля (как в batch-update)
        if (metricKey === 'qualifiedLeads') schools[schoolIdx].qualifiedLeadDate = date;
        if (metricKey === 'arrivedToCampus') schools[schoolIdx].arrivedToCampusDate = date;
        if (metricKey === 'preliminaryMeetings') schools[schoolIdx].preliminaryMeetingDate = date;

        totalNumericResolved += numericValue;
        resolvedCount++;
      }
    }

    // Уменьшаем счётчик в activity
    if (inferredType === 'funnel') {
      if (resolvedCount > currentCount) {
        return res.status(400).json({
          error: `Нельзя раскрыть больше школ (${resolvedCount}) чем есть неизвестных (${currentCount})`
        });
      }
      activity.metrics[metricKey] -= resolvedCount;
    } else {
      if (totalNumericResolved > currentCount) {
        return res.status(400).json({
          error: `Нельзя перенести больше значения (${totalNumericResolved}) чем есть неизвестного (${currentCount})`
        });
      }
      // Списываем сначала из legacy parentContacts (если применимо), потом из metrics
      let remainingToDeduct = totalNumericResolved;
      if (metricKey === 'parentContacts' && typeof activity.parentContacts === 'number' && activity.parentContacts > 0) {
        const d = Math.min(activity.parentContacts, remainingToDeduct);
        activity.parentContacts -= d;
        remainingToDeduct -= d;
        if (activity.parentContacts <= 0) {
          delete activity.parentContacts;
        }
      }

      if (remainingToDeduct > 0) {
        if (!activity.metrics) activity.metrics = {};
        const curr = typeof activity.metrics[metricKey] === 'number' ? activity.metrics[metricKey] : 0;
        activity.metrics[metricKey] = curr - remainingToDeduct;
      }
    }

    // Если метрика стала 0 — удаляем её из объекта
    if (activity.metrics && typeof activity.metrics[metricKey] === 'number' && activity.metrics[metricKey] <= 0) {
      delete activity.metrics[metricKey];
    }

    // Обновляем description
    const metricNames = {
      newSchools: 'Новые школы',
      contactMade: 'Контакт состоялся',
      meetingScheduled: 'Встреча назначена',
      meetingHeld: 'Встреча состоялась',
      eventScheduled: 'Мероприятие назначено',
      eventHeld: 'Мероприятие проведено',
      excursionPlanned: 'Экскурсия запланирована',
    };

    const hasAnyMetrics = activity.metrics && Object.keys(activity.metrics).length > 0;
    const hasLegacyParentContacts = typeof activity.parentContacts === 'number' && activity.parentContacts > 0;

    if (!hasAnyMetrics && !hasLegacyParentContacts) {
      // Удаляем всю активность, если метрик не осталось
      unknownSchool.activities.splice(activityIdx, 1);
    } else {
      // Обновляем description
      if (activity.type === 'funnel_metrics') {
        activity.description = `Воронка (неизвестно): ${Object.entries(activity.metrics).map(([key, value]) => {
          return `${metricNames[key] || key}: ${value}`;
        }).join(', ')}`;
      } else {
        const parts = [];
        if (metricKey === 'parentContacts' && typeof activity.parentContacts === 'number' && activity.parentContacts > 0) {
          parts.push(`${numericMetricNames.parentContacts}: ${activity.parentContacts}`);
        }
        if (activity.metrics) {
          Object.entries(activity.metrics).forEach(([k, v]) => {
            if (typeof v === 'number' && v > 0) parts.push(`${numericMetricNames[k] || k}: ${v}`);
          });
        }
        activity.description = `Числовые метрики (неизвестно): ${parts.join(', ')}`;
      }
    }

    // Сохраняем
    await saveSchools(schools, req.user?.id);

    res.json({
      success: true,
      message: `Раскрыто ${resolvedCount} школ`,
      resolvedCount,
      remainingUnknown: (() => {
        if (inferredType === 'funnel') return (activity.metrics && typeof activity.metrics[metricKey] === 'number') ? activity.metrics[metricKey] : 0;
        const fromMetrics = (activity.metrics && typeof activity.metrics[metricKey] === 'number') ? activity.metrics[metricKey] : 0;
        const fromLegacy = (metricKey === 'parentContacts' && typeof activity.parentContacts === 'number') ? activity.parentContacts : 0;
        return fromMetrics + fromLegacy;
      })(),
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error resolving unknown:', error);
    res.status(500).json({ error: 'Ошибка при раскрытии неизвестных', details: error.message });
  }
});

// ============== PLANS ENDPOINTS ==============

// GET /api/plans — получить все планы
app.get('/api/plans', async (req, res) => {
  try {
    const { plans } = await readPlans();
    res.json(plans);
  } catch (error) {
    console.error('Error reading plans:', error);
    res.status(500).json({ error: 'Ошибка чтения планов' });
  }
});

// GET /api/plans/:month — получить план на конкретный месяц (формат: "2026-01")
app.get('/api/plans/:month', async (req, res) => {
  try {
    const { month } = req.params;

    if (IS_SANDBOX) {
      const { plans } = await readPlans();
      const plan = plans.find(p => p.month === month);
      if (!plan) {
        return res.status(404).json({ error: 'План не найден' });
      }
      return res.json(plan);
    }

    // Production: direct MongoDB query
    const plan = await getPlanByMonth(month);
    if (!plan) {
      return res.status(404).json({ error: 'План не найден' });
    }
    res.json(plan);
  } catch (error) {
    console.error('Error reading plan:', error);
    res.status(500).json({ error: 'Ошибка чтения плана' });
  }
});

// PUT /api/plans/:month — создать или обновить план (только админ)
app.put('/api/plans/:month', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { month } = req.params;
    const { metrics, dailyDistribution } = req.body;

    // Валидация формата месяца (YYYY-MM)
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Некорректный формат месяца. Ожидается: YYYY-MM' });
    }

    // Валидация метрик
    if (!metrics || typeof metrics !== 'object') {
      return res.status(400).json({ error: 'metrics обязателен и должен быть объектом' });
    }

    const { plans } = await readPlans();
    const existingIndex = plans.findIndex(p => p.month === month);

    const now = new Date().toISOString();

    const planData = {
      id: `plan_${month}`,
      month,
      metrics,
      dailyDistribution: dailyDistribution || null,
      updatedAt: now,
      updatedBy: req.user.id
    };

    if (existingIndex === -1) {
      // Создание нового плана
      planData.createdAt = now;
      planData.createdBy = req.user.id;
      plans.push(planData);
      console.log(`📋 Создан план на ${month} пользователем ${req.user.id}`);
    } else {
      // Обновление существующего плана
      planData.createdAt = plans[existingIndex].createdAt || now;
      planData.createdBy = plans[existingIndex].createdBy || req.user.id;
      plans[existingIndex] = planData;
      console.log(`📋 Обновлён план на ${month} пользователем ${req.user.id}`);
    }

    await savePlansData(plans, req.user.id);

    res.json({
      success: true,
      plan: planData,
      message: existingIndex === -1 ? 'План создан' : 'План обновлён'
    });
  } catch (error) {
    console.error('Error saving plan:', error);
    res.status(500).json({ error: 'Ошибка сохранения плана' });
  }
});

// DELETE /api/plans/:month — удалить план (только админ)
app.delete('/api/plans/:month', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { month } = req.params;

    if (IS_SANDBOX) {
      const { plans } = await readPlans();
      const index = plans.findIndex(p => p.month === month);

      if (index === -1) {
        return res.status(404).json({ error: 'План не найден' });
      }

      plans.splice(index, 1);
      await savePlansData(plans, req.user.id);

      console.log(`📋 Удалён план на ${month} пользователем ${req.user.id}`);
      return res.json({ success: true, message: 'План удалён' });
    }

    // Production: direct MongoDB delete
    const deleted = await deletePlan(month);
    if (!deleted) {
      return res.status(404).json({ error: 'План не найден' });
    }

    console.log(`📋 Удалён план на ${month} пользователем ${req.user.id}`);
    res.json({ success: true, message: 'План удалён' });
  } catch (error) {
    console.error('Error deleting plan:', error);
    res.status(500).json({ error: 'Ошибка удаления плана' });
  }
});

// ============== VISITS (CALENDAR) ==============

// GET /api/visits — получить выезды за период
app.get('/api/visits', requireAuth, async (req, res) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'Параметры from и to обязательны (YYYY-MM-DD)' });
    }

    if (IS_SANDBOX) {
      // Sandbox: file-based visits (simplified - store in visits.json)
      const visitsFile = path.join(DATA_DIR, 'visits_sandbox.json');
      if (!fs.existsSync(visitsFile)) {
        return res.json([]);
      }
      const allVisits = JSON.parse(fs.readFileSync(visitsFile, 'utf-8'));
      const filtered = allVisits.filter(v => v.date >= from && v.date <= to);
      return res.json(filtered.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.timeStart.localeCompare(b.timeStart);
      }));
    }

    // Production: MongoDB
    const visits = await getVisits(from, to);
    res.json(visits);
  } catch (error) {
    console.error('Error fetching visits:', error);
    res.status(500).json({ error: 'Ошибка получения выездов' });
  }
});

// POST /api/visits — создать выезд
app.post('/api/visits', requireAuth, async (req, res) => {
  try {
    const { managerId, managerName, date, timeStart, timeEnd, type, schoolId, schoolName, notes } = req.body;

    // Валидация
    if (!managerId || !date || !timeStart || !timeEnd || !type) {
      return res.status(400).json({ error: 'Не все обязательные поля заполнены' });
    }
    if (type !== 'calls' && (!schoolId || !schoolName)) {
      return res.status(400).json({ error: 'Для этого типа выезда нужно выбрать школу' });
    }

    const visit = {
      id: `visit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      managerId,
      managerName: managerName || managerId,
      date,
      timeStart,
      timeEnd,
      type,
      ...(type === 'calls' ? {} : { schoolId, schoolName }),
      notes: notes || '',
      createdAt: new Date().toISOString(),
      createdBy: req.user?.id || 'unknown'
    };

    if (IS_SANDBOX) {
      // Sandbox: file-based
      const visitsFile = path.join(DATA_DIR, 'visits_sandbox.json');
      let visits = [];
      if (fs.existsSync(visitsFile)) {
        visits = JSON.parse(fs.readFileSync(visitsFile, 'utf-8'));
      }
      visits.push(visit);
      fs.writeFileSync(visitsFile, JSON.stringify(visits, null, 2), 'utf-8');
      return res.json({ success: true, visit });
    }

    // Production: MongoDB
    await createVisit(visit);
    res.json({ success: true, visit });
  } catch (error) {
    console.error('Error creating visit:', error);
    res.status(500).json({ error: 'Ошибка создания выезда' });
  }
});

// PUT /api/visits/:id — обновить выезд
app.put('/api/visits/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Запретить изменение id и createdAt
    delete updates.id;
    delete updates.createdAt;
    delete updates.createdBy;

    if (IS_SANDBOX) {
      // Sandbox: file-based
      const visitsFile = path.join(DATA_DIR, 'visits_sandbox.json');
      if (!fs.existsSync(visitsFile)) {
        return res.status(404).json({ error: 'Выезд не найден' });
      }
      let visits = JSON.parse(fs.readFileSync(visitsFile, 'utf-8'));
      const index = visits.findIndex(v => v.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Выезд не найден' });
      }
      visits[index] = { ...visits[index], ...updates };
      fs.writeFileSync(visitsFile, JSON.stringify(visits, null, 2), 'utf-8');
      return res.json({ success: true, visit: visits[index] });
    }

    // Production: MongoDB
    const updated = await updateVisit(id, updates);
    if (!updated) {
      return res.status(404).json({ error: 'Выезд не найден' });
    }
    res.json({ success: true, visit: updated });
  } catch (error) {
    console.error('Error updating visit:', error);
    res.status(500).json({ error: 'Ошибка обновления выезда' });
  }
});

// DELETE /api/visits/:id — удалить выезд
app.delete('/api/visits/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (IS_SANDBOX) {
      // Sandbox: file-based
      const visitsFile = path.join(DATA_DIR, 'visits_sandbox.json');
      if (!fs.existsSync(visitsFile)) {
        return res.status(404).json({ error: 'Выезд не найден' });
      }
      let visits = JSON.parse(fs.readFileSync(visitsFile, 'utf-8'));
      const index = visits.findIndex(v => v.id === id);
      if (index === -1) {
        return res.status(404).json({ error: 'Выезд не найден' });
      }
      visits.splice(index, 1);
      fs.writeFileSync(visitsFile, JSON.stringify(visits, null, 2), 'utf-8');
      return res.json({ success: true });
    }

    // Production: MongoDB
    const deleted = await deleteVisit(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Выезд не найден' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting visit:', error);
    res.status(500).json({ error: 'Ошибка удаления выезда' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: IS_SANDBOX ? 'sandbox' : 'production',
    timestamp: new Date().toISOString()
  });
});

// Start server function
async function startServer() {
  try {
    // Connect to MongoDB in production mode
    if (!IS_SANDBOX) {
      await connectDB();

      // Startup deduplication for production
      const schools = await getAllSchools();
      const { schools: cleaned, duplicates } = dedupeSchoolsById(schools);
      if (duplicates > 0) {
        console.log(`🧹 Дедупликация: найдено дублей по id: ${duplicates}. Обновляем данные...`);
        await saveAllSchools(cleaned);
      }
    } else {
      // Sandbox startup deduplication (file-based)
      try {
        if (fs.existsSync(SCHOOLS_FILE)) {
          const initial = JSON.parse(fs.readFileSync(SCHOOLS_FILE, 'utf-8'));
          const { schools: cleaned, duplicates } = dedupeSchoolsById(initial);
          if (duplicates > 0) {
            console.log(`🧹 Дедупликация: найдено дублей по id: ${duplicates}. Перезаписываем файл данных...`);
            createBackupLocal(null);
            fs.writeFileSync(SCHOOLS_FILE, JSON.stringify(cleaned, null, 2), 'utf-8');
          }
        }
      } catch (e) {
        console.error('⚠️ Ошибка дедупликации при старте:', e);
      }
    }

    // Start Express server
    const server = app.listen(PORT, () => {
      const modeLabel = IS_SANDBOX ? '🧪 SANDBOX' : '🚀 PRODUCTION';
      console.log(`${modeLabel} API сервер запущен на http://localhost:${PORT}`);

      if (IS_SANDBOX) {
        console.log(`📁 Данные хранятся в: ${SCHOOLS_FILE}`);
        console.log(`📦 Бэкапы в: ${BACKUPS_DIR}`);
      } else {
        console.log(`📁 Данные хранятся в: MongoDB`);
      }
    });

    // Server error handling
    server.on('error', (err) => {
      console.error('🛑 Server error:', err);
    });
    server.on('close', () => {
      console.warn('⚠️ Server closed');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Process event handlers
process.on('beforeExit', (code) => {
  console.warn('⚠️ Process beforeExit:', code);
});
process.on('exit', (code) => {
  console.warn('⚠️ Process exit:', code);
});

// Start the server
startServer();
