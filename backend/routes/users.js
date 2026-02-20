const express = require('express');
const Food = require('../models/Food');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/users/stats
// @desc    Get current user's statistics
// @access  Private
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user._id;

    const [sharedCount, claimedCount, completedAsDonor, completedAsClaimer] = await Promise.all([
      Food.countDocuments({ donor: userId }),
      Food.countDocuments({ claimedBy: userId }),
      Food.countDocuments({ donor: userId, status: 'completed' }),
      Food.countDocuments({ claimedBy: userId, status: 'completed' })
    ]);

    res.json({
      foodShared: sharedCount,
      foodClaimed: claimedCount,
      completedDonations: completedAsDonor,
      completedPickups: completedAsClaimer,
      totalCompleted: completedAsDonor + completedAsClaimer
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/my-food
// @desc    Get user's shared food listings
// @access  Private
router.get('/my-food', protect, async (req, res) => {
  try {
    const foods = await Food.find({ donor: req.user._id })
      .populate('claimedBy', 'name avatar')
      .sort({ createdAt: -1 });

    res.json(foods);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/users/my-claims
// @desc    Get food items claimed by user
// @access  Private
router.get('/my-claims', protect, async (req, res) => {
  try {
    const foods = await Food.find({ claimedBy: req.user._id })
      .populate('donor', 'name avatar')
      .sort({ createdAt: -1 });

    res.json(foods);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
