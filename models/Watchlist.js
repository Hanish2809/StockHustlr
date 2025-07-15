const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stockSymbol: { type: String, required: true, uppercase: true },
  stockName: { type: String, required: true },
  addedDate: { type: Date, default: Date.now },
  notes: { type: String }
});

// Compound index to ensure unique watchlist entries per user and stock
watchlistSchema.index({ userId: 1, stockSymbol: 1 }, { unique: true });

module.exports = mongoose.model('Watchlist', watchlistSchema); 