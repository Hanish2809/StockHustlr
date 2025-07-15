const mongoose = require('mongoose');

const holdingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stockSymbol: { type: String, required: true, uppercase: true },
  stockName: { type: String, required: true },
  quantity: { type: Number, required: true, default: 0 },
  averageBuyPrice: { type: Number, required: true },
  totalInvested: { type: Number, required: true },
  currentValue: { type: Number, default: 0 },
  profitLoss: { type: Number, default: 0 },
  profitLossPercent: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

// Compound index to ensure unique holdings per user and stock
holdingSchema.index({ userId: 1, stockSymbol: 1 }, { unique: true });

module.exports = mongoose.model('Holding', holdingSchema); 