const express = require('express');
const multer = require('multer');
const path = require('path');
const Food = require('../models/Food');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Multer config for food photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `food_${Date.now()}_${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// @route   GET /api/food
// @desc    Get all available food listings
// @access  Public
router.get('/', async (req, res) => {
  try {
    const foods = await Food.find({ status: 'available' })
      .populate('donor', 'name avatar')
      .sort({ createdAt: -1 });

    res.json(foods);
  } catch (error) {
    console.error('Get food error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/food/all
// @desc    Get all food listings (all statuses)
// @access  Public
router.get('/all', async (req, res) => {
  try {
    const foods = await Food.find()
      .populate('donor', 'name avatar')
      .populate('claimedBy', 'name avatar')
      .sort({ createdAt: -1 });

    res.json(foods);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/food/:id
// @desc    Get single food item
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const food = await Food.findById(req.params.id)
      .populate('donor', 'name avatar email')
      .populate('claimedBy', 'name avatar');

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    res.json(food);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/food
// @desc    Create a new food listing
// @access  Private
router.post('/', protect, upload.single('photo'), async (req, res) => {
  try {
    const { name, description, address, latitude, longitude } = req.body;

    if (!name || !address) {
      return res.status(400).json({ message: 'Please provide food name and address' });
    }

    const foodData = {
      name,
      description: description || '',
      address,
      latitude: latitude ? parseFloat(latitude) : null,
      longitude: longitude ? parseFloat(longitude) : null,
      donor: req.user._id
    };

    if (req.file) {
      foodData.photo = `/uploads/${req.file.filename}`;
    }

    const food = await Food.create(foodData);
    const populated = await food.populate('donor', 'name avatar');

    // Emit Socket.IO event for new food shared
    const io = req.app.get('io');
    if (io) {
      io.emit('food_shared', {
        food: populated,
        message: `${req.user.name} shared "${food.name}"`
      });
    }

    res.status(201).json(populated);
  } catch (error) {
    console.error('Create food error:', error);
    res.status(500).json({ message: 'Server error creating food listing' });
  }
});

// @route   PUT /api/food/:id
// @desc    Update own food listing
// @access  Private
router.put('/:id', protect, upload.single('photo'), async (req, res) => {
  try {
    let food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    if (food.donor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to update this listing' });
    }

    const updates = { ...req.body };
    if (req.file) {
      updates.photo = `/uploads/${req.file.filename}`;
    }

    food = await Food.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    }).populate('donor', 'name avatar');

    res.json(food);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/food/:id
// @desc    Delete own food listing
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    if (food.donor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to delete this listing' });
    }

    await food.deleteOne();
    res.json({ message: 'Food listing removed' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/food/:id/claim
// @desc    Claim a food item
// @access  Private
router.post('/:id/claim', protect, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id).populate('donor', 'name avatar');

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    if (food.status !== 'available') {
      return res.status(400).json({ message: 'This food has already been claimed' });
    }

    if (food.donor._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot claim your own food' });
    }

    food.status = 'claimed';
    food.claimedBy = req.user._id;
    await food.save();

    // Create notification for the donor
    const notification = await Notification.create({
      user: food.donor._id,
      type: 'claim_request',
      message: `${req.user.name} claimed your "${food.name}"`,
      food: food._id,
      fromUser: req.user._id
    });

    // Emit Socket.IO event to the donor
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${food.donor._id}`).emit('notification', {
        notification: await notification.populate('food fromUser'),
        message: `${req.user.name} claimed your "${food.name}"`
      });
    }

    const populated = await food.populate('claimedBy', 'name avatar');
    res.json(populated);
  } catch (error) {
    console.error('Claim food error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/food/:id/complete
// @desc    Mark a claimed food as completed (picked up)
// @access  Private
router.put('/:id/complete', protect, async (req, res) => {
  try {
    const food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({ message: 'Food listing not found' });
    }

    if (food.donor.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the donor can mark as completed' });
    }

    if (food.status !== 'claimed') {
      return res.status(400).json({ message: 'Food must be claimed before completing' });
    }

    food.status = 'completed';
    await food.save();

    // Notify the claimer
    if (food.claimedBy) {
      const notification = await Notification.create({
        user: food.claimedBy,
        type: 'food_completed',
        message: `Pickup completed for "${food.name}"`,
        food: food._id,
        fromUser: req.user._id
      });

      const io = req.app.get('io');
      if (io) {
        io.to(`user_${food.claimedBy}`).emit('notification', {
          notification,
          message: `Pickup completed for "${food.name}"`
        });
      }
    }

    res.json(food);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
