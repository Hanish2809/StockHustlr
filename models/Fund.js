const mongoose = require('mongoose');

const fundSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  transactionType: { type: String, enum: ['DEPOSIT', 'WITHDRAWAL'], required: true },
  amount: { type: Number, required: true },
  balance: { type: Number, required: true }, // Balance after this transaction
  description: { type: String },
  transactionDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
  referenceId: { type: String } // For external payment references
});

module.exports = mongoose.model('Fund', fundSchema); 