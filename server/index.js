import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 5174;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// ===== Uploads (local disk) =====
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname || '') || '.jpg';
        cb(null, `${unique}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    },
});

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_DIR));

// Schemas
const itemSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        category: { type: String, required: true },
        status: { type: String, enum: ['Washed', 'Unwashed', 'Lost/Unused'], default: 'Washed' },
        imageUrl: { type: String, default: null },
    },
    { timestamps: true }
);

const categorySchema = new mongoose.Schema(
    { name: { type: String, required: true, unique: true } },
    { timestamps: true }
);

const Item = mongoose.model('Item', itemSchema);
const Category = mongoose.model('Category', categorySchema);

// Users
const userSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true, index: true },
        passwordHash: { type: String, required: true },
    },
    { timestamps: true }
);
const User = mongoose.model('User', userSchema, 'users');

// Base + health
app.get('/api', (_req, res) => {
    res.json({
        status: 'ok',
        endpoints: ['/api/health', '/api/items', '/api/categories'],
    });
});
app.get('/api/health', async (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    const db = mongoose.connection.name;
    const counts = {
        items: await Item.countDocuments().catch(() => 0),
        categories: await Category.countDocuments().catch(() => 0),
        users: await User.countDocuments().catch(() => 0),
    };
    res.json({ connected, db, counts });
});

// Auth
app.post('/api/auth/signup', async (req, res, next) => {
    try {
        const username = (req.body.username || '').trim().toLowerCase();
        const password = req.body.password || '';
        if (!username || !password) return res.status(400).json({ error: 'username and password required' });
        if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
        const exists = await User.findOne({ username }).lean();
        if (exists) return res.status(409).json({ error: 'username already exists' });
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ username, passwordHash });
        const token = jwt.sign({ id: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, user: { id: user._id, username } });
    } catch (e) {
        next(e);
    }
});

app.post('/api/auth/login', async (req, res, next) => {
    try {
        const username = (req.body.username || '').trim().toLowerCase();
        const password = req.body.password || '';
        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ error: 'invalid credentials' });
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return res.status(401).json({ error: 'invalid credentials' });
        const token = jwt.sign({ id: user._id, username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, username } });
    } catch (e) {
        next(e);
    }
});

// Upload endpoint (multipart/form-data field name: 'image')
app.post('/api/upload', upload.single('image'), (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'image file required' });
        const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        res.status(201).json({ url });
    } catch (e) {
        next(e);
    }
});

// Items CRUD
app.get('/api/items', async (_req, res, next) => {
    try {
        const items = await Item.find().sort({ createdAt: 1 }).lean();
        res.json(items);
    } catch (e) {
        next(e);
    }
});

app.post('/api/items', async (req, res, next) => {
    try {
        const doc = await Item.create(req.body);
        res.status(201).json(doc);
    } catch (e) {
        next(e);
    }
});

app.put('/api/items/:id', async (req, res, next) => {
    try {
        const doc = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!doc) return res.status(404).json({ error: 'Not found' });
        res.json(doc);
    } catch (e) {
        next(e);
    }
});

app.delete('/api/items/:id', async (req, res, next) => {
    try {
        const doc = await Item.findByIdAndDelete(req.params.id);
        // Best-effort cleanup of local uploaded image file
        if (doc?.imageUrl) {
            try {
                let pathname;
                try {
                    pathname = new URL(doc.imageUrl).pathname; // absolute URL
                } catch {
                    pathname = doc.imageUrl; // maybe relative path
                }
                const filename = path.basename(pathname);
                const filePath = path.join(UPLOAD_DIR, filename);
                if (filePath.startsWith(UPLOAD_DIR) && fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch { }
        }
        res.status(204).end();
    } catch (e) {
        next(e);
    }
});

// Categories
app.get('/api/categories', async (_req, res, next) => {
    try {
        const cats = await Category.find().sort({ name: 1 }).lean();
        res.json(cats);
    } catch (e) {
        next(e);
    }
});

app.post('/api/categories', async (req, res, next) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
        const doc = await Category.create({ name });
        res.status(201).json(doc);
    } catch (e) {
        if (e.code === 11000) {
            const doc = await Category.findOne({ name }).lean();
            return res.status(200).json(doc);
        }
        next(e);
    }
});

app.delete('/api/categories/:name', async (req, res, next) => {
    try {
        await Category.deleteOne({ name: req.params.name });
        res.status(204).end();
    } catch (e) {
        next(e);
    }
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

async function start() {
    if (!MONGODB_URI) {
        console.error('Missing MONGODB_URI in .env');
        process.exit(1);
    }
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('MongoDB connected');
        app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
    } catch (e) {
        console.error('MongoDB connection failed:', e.message);
        process.exit(1);
    }
}

start();
