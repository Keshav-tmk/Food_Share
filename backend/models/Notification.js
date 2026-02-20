const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['claim_request', 'food_shared', 'claim_accepted', 'food_completed'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  food: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Food',
    default: null
  },
  fromUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  read: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
