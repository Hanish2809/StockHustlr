const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  stockSymbol: { type: String, uppercase: true }, // Not required for fund transactions
  orderType: { type: String, enum: ['BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL'], required: true },
  quantity: { type: Number }, // Not required for fund transactions
  price: { type: Number }, // Not required for fund transactions
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['PENDING', 'COMPLETED', 'CANCELLED'], default: 'PENDING' },
  orderDate: { type: Date, default: Date.now },
  completedDate: { type: Date },
  notes: { type: String }
});

module.exports = mongoose.model('Order', orderSchema); 