const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const ALLOWED_EXT  = ['pdf', 'doc', 'docx'];
const EXT_BY_MIME  = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
};

// Resolve a SAFE extension. Android pickers can hand us filenames with no
// extension, non-ASCII names, or a generic application/octet-stream MIME —
// never trust either source alone, and never put raw filename fragments
// into the Cloudinary public_id.
function resolveExt(file) {
  const name = file.originalname || '';
  const dot  = name.lastIndexOf('.');
  const extFromName = dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
  if (ALLOWED_EXT.includes(extFromName)) return extFromName;
  return EXT_BY_MIME[file.mimetype] || null;
}

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'resumes',
    resource_type: 'raw',
    // Include the resolved extension IN the public_id so Cloudinary preserves
    // it and the delivered URL ends with the correct extension
    public_id: (req, file) => {
      const ext = resolveExt(file) || 'pdf';
      return `resume_${Date.now()}_${Math.round(Math.random() * 1e9)}.${ext}`;
    }
  }
});

const fileFilter = (req, file, cb) => {
  // Accept when a valid type can be established from extension OR MIME —
  // covers Android sending octet-stream for PDFs and extensionless picks
  if (resolveExt(file)) return cb(null, true);

  console.warn(
    `[UPLOAD REJECTED] name="${file.originalname}" mime="${file.mimetype}" ` +
    `ua="${req.headers['user-agent'] || 'unknown'}"`
  );
  cb(new Error('Only PDF, DOC, DOCX files are allowed'));
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});
