import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v2 as cloudinary } from 'cloudinary';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 5174;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Configure Cloudinary if creds provided
if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET,
    });
}

// ===== Uploads (local disk) =====
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Use memory storage when targeting cloud uploads; keep fileFilter and limits
const upload = multer({
    storage: multer.memoryStorage(),
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
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true },
        category: { type: String, required: true },
        status: { type: String, enum: ['Washed', 'Unwashed', 'Lost/Unused'], default: 'Washed' },
        imageUrl: { type: String, default: null },
        imagePublicId: { type: String, default: null },
    },
    { timestamps: true }
);

const categorySchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true },
    },
    { timestamps: true }
);
categorySchema.index({ userId: 1, name: 1 }, { unique: true });

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

// Auth middleware
function auth(req, res, next) {
    const hdr = req.headers.authorization || '';
    const [, token] = hdr.split(' ');
    if (!token) return res.status(401).json({ error: 'unauthorized' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = { id: payload.id, username: payload.username };
        next();
    } catch (e) {
        return res.status(401).json({ error: 'unauthorized' });
    }
}

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
app.post('/api/upload', auth, upload.single('image'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'image file required' });
        // Prefer Cloudinary when configured
        if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
            const folder = `clothes-organiser/${req.user.id}`;
            const uploadFromBuffer = () => new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
                stream.end(req.file.buffer);
            });
            const result = await uploadFromBuffer();
            return res.status(201).json({ url: result.secure_url || result.url, publicId: result.public_id });
        }
        // Fallback to local disk when Cloudinary is not configured
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(req.file.originalname || '') || '.jpg';
        const filename = `${unique}${ext}`;
        const filePath = path.join(UPLOAD_DIR, filename);
        fs.writeFileSync(filePath, req.file.buffer);
        const url = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
        res.status(201).json({ url });
    } catch (e) {
        next(e);
    }
});

// Items CRUD
app.get('/api/items', auth, async (req, res, next) => {
    try {
        const items = await Item.find({ userId: req.user.id }).sort({ createdAt: 1 }).lean();
        res.json(items);
    } catch (e) {
        next(e);
    }
});

app.post('/api/items', auth, async (req, res, next) => {
    try {
        const doc = await Item.create({ ...req.body, userId: req.user.id });
        res.status(201).json(doc);
    } catch (e) {
        next(e);
    }
});

app.put('/api/items/:id', auth, async (req, res, next) => {
    try {
        const doc = await Item.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, req.body, { new: true });
        if (!doc) return res.status(404).json({ error: 'Not found' });
        res.json(doc);
    } catch (e) {
        next(e);
    }
});

app.delete('/api/items/:id', auth, async (req, res, next) => {
    try {
        const doc = await Item.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        // Cleanup uploaded image (Cloudinary or local)
        if (doc?.imagePublicId && CLOUDINARY_CLOUD_NAME) {
            try {
                await cloudinary.uploader.destroy(doc.imagePublicId);
            } catch { }
        } else if (doc?.imageUrl) {
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
app.get('/api/categories', auth, async (req, res, next) => {
    try {
        const cats = await Category.find({ userId: req.user.id }).sort({ name: 1 }).lean();
        res.json(cats);
    } catch (e) {
        next(e);
    }
});

app.post('/api/categories', auth, async (req, res, next) => {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
        const doc = await Category.create({ name, userId: req.user.id });
        res.status(201).json(doc);
    } catch (e) {
        if (e.code === 11000) {
            const doc = await Category.findOne({ name, userId: req.user.id }).lean();
            return res.status(200).json(doc);
        }
        next(e);
    }
});

app.delete('/api/categories/:name', auth, async (req, res, next) => {
    try {
        await Category.deleteOne({ name: req.params.name, userId: req.user.id });
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
