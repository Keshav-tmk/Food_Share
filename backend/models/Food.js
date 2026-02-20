const mongoose = require('mongoose');

const foodSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a food title'],
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  photo: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    required: [true, 'Please add a pickup address'],
    trim: true
  },
  latitude: {
    type: Number,
    default: null
  },
  longitude: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    enum: ['available', 'claimed', 'completed'],
    default: 'available'
  },
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  claimedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  }
}, {
  timestamps: true
});

// Index for efficient queries
foodSchema.index({ status: 1, createdAt: -1 });
foodSchema.index({ donor: 1 });
foodSchema.index({ claimedBy: 1 });

module.exports = mongoose.model('Food', foodSchema);
