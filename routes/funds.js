const express = require('express');
const router = express.Router();
const Fund = require('../models/Fund');
const Portfolio = require('../models/Portfolio');
const Order = require('../models/Order'); // Add this import at the top

// Get all fund transactions for a user
router.get('/:userId', async (req, res) => {
  try {
    const transactions = await Fund.find({ userId: req.params.userId })
      .sort({ transactionDate: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add fund transaction (deposit/withdrawal)
router.post('/', async (req, res) => {
  try {
    const { userId, transactionType, amount, description, referenceId } = req.body;
    
    // Get current portfolio to calculate new balance
    const portfolio = await Portfolio.findOne({ userId });
    const currentBalance = portfolio ? portfolio.availableCash : 0;
    
    let newBalance;
    if (transactionType === 'DEPOSIT') {
      newBalance = currentBalance + amount;
    } else if (transactionType === 'WITHDRAWAL') {
      if (currentBalance < amount) {
        return res.status(400).json({ error: 'Insufficient funds' });
      }
      newBalance = currentBalance - amount;
    } else {
      return res.status(400).json({ error: 'Invalid transaction type' });
    }

    const fundTransaction = new Fund({
      userId,
      transactionType,
      amount,
      balance: newBalance,
      description,
      referenceId
    });

    await fundTransaction.save();

    // Create a corresponding order entry for unified transaction history
    const order = new Order({
      userId,
      orderType: transactionType, // 'DEPOSIT' or 'WITHDRAWAL'
      totalAmount: amount,
      status: 'COMPLETED',
      orderDate: fundTransaction.transactionDate,
      notes: description || (transactionType === 'DEPOSIT' ? 'Fund deposit' : 'Fund withdrawal')
    });
    await order.save();

    // Update portfolio available cash
    await Portfolio.findOneAndUpdate(
      { userId },
      { availableCash: newBalance, lastUpdated: new Date() },
      { upsert: true, new: true }
    );

    res.status(201).json(fundTransaction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update transaction status
router.patch('/:transactionId', async (req, res) => {
  try {
    const { status } = req.body;
    
    const transaction = await Fund.findByIdAndUpdate(
      req.params.transactionId,
      { status },
      { new: true }
    );
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get current balance
router.get('/:userId/balance', async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne({ userId: req.params.userId });
    const balance = portfolio ? portfolio.availableCash : 0;
    res.json({ balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



module.exports = router; 