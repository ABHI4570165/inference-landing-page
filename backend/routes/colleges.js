const router = require('express').Router();
const College = require('../models/College');
const auth = require('../middleware/auth');

// Public: GET all colleges
router.get('/', async (req, res) => {
  try {
    const colleges = await College.find().sort({ name: 1 });
    res.json(colleges);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: POST create college
router.post('/', auth, async (req, res) => {
  try {
    const { name, location } = req.body;
    if (!name) return res.status(400).json({ message: 'College name is required' });
    const college = await College.create({ name, location });
    res.status(201).json(college);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'College already exists' });
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: PUT update college
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, location } = req.body;
    const college = await College.findByIdAndUpdate(req.params.id, { name, location }, { new: true });
    if (!college) return res.status(404).json({ message: 'College not found' });
    res.json(college);
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: DELETE college
router.delete('/:id', auth, async (req, res) => {
  try {
    const college = await College.findByIdAndDelete(req.params.id);
    if (!college) return res.status(404).json({ message: 'College not found' });
    res.json({ message: 'College deleted' });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
