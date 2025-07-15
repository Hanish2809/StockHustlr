const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  totalValue: { type: Number, default: 0 },
  totalInvested: { type: Number, default: 0 },
  totalProfitLoss: { type: Number, default: 0 },
  totalProfitLossPercent: { type: Number, default: 0 },
  availableCash: { type: Number, default: 0 },
  numberOfHoldings: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Portfolio', portfolioSchema); 