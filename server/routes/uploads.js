const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { authenticateRequest } = require('../auth');

const router = express.Router();
router.use(authenticateRequest);

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const scope = req.query.scope === 'avatar' ? 'avatars' : 'photos';
    const dir = path.join(UPLOAD_ROOT, scope);
    ensureDir(dir);
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${randomUUID()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG or PNG images are allowed'));
    }
  }
});

router.post('/images', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Image file is required' });
  }
  const scope = req.query.scope === 'avatar' ? 'avatars' : 'photos';
  const relativePath = `/uploads/${scope}/${req.file.filename}`;
  return res.status(201).json({ url: relativePath });
});

module.exports = router;
