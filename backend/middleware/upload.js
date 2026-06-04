const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'resumes',
    resource_type: 'raw',
    // Include the original extension IN the public_id so Cloudinary preserves it
    // e.g. public_id = "resumes/resume_1234567890_123456789.pdf"
    // This makes req.file.path (the Cloudinary URL) end with the correct extension
    public_id: (req, file) => {
      const ext = file.originalname.split('.').pop().toLowerCase()
      return `resume_${Date.now()}_${Math.round(Math.random() * 1e9)}.${ext}`
    }
  }
});

const fileFilter = (req, file, cb) => {
  const allowedMime = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  const ext = file.originalname.split('.').pop().toLowerCase();
  const allowedExt = ['pdf', 'doc', 'docx'];

  if (allowedMime.includes(file.mimetype) || allowedExt.includes(ext)) {
    return cb(null, true);
  }
  cb(new Error('Only PDF, DOC, DOCX files are allowed'));
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});