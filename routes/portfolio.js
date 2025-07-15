const express = require('express');
const router = express.Router();
const Portfolio = require('../models/Portfolio');
const Holding = require('../models/Holding');
const Order = require('../models/Order');

// Get portfolio for a user
router.get('/:userId', async (req, res) => {
  try {
    let portfolio = await Portfolio.findOne({ userId: req.params.userId });
    
    if (!portfolio) {
      // Create portfolio if it doesn't exist
      portfolio = new Portfolio({
        userId: req.params.userId,
        totalValue: 0,
        totalInvested: 0,
        totalProfitLoss: 0,
        totalProfitLossPercent: 0,
        availableCash: 0,
        numberOfHoldings: 0
      });
      await portfolio.save();
    }
    
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get portfolio with holdings details
router.get('/:userId/details', async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne({ userId: req.params.userId });
    const holdings = await Holding.find({ userId: req.params.userId });
    
    const portfolioDetails = {
      portfolio: portfolio || {
        userId: req.params.userId,
        totalValue: 0,
        totalInvested: 0,
        totalProfitLoss: 0,
        totalProfitLossPercent: 0,
        availableCash: 0,
        numberOfHoldings: 0
      },
      holdings: holdings
    };
    
    res.json(portfolioDetails);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update portfolio manually (for admin purposes)
router.patch('/:userId', async (req, res) => {
  try {
    const { totalValue, totalInvested, availableCash } = req.body;
    const updateData = { lastUpdated: new Date() };
    
    if (totalValue !== undefined) updateData.totalValue = totalValue;
    if (totalInvested !== undefined) updateData.totalInvested = totalInvested;
    if (availableCash !== undefined) updateData.availableCash = availableCash;
    
    // Calculate profit/loss if both values are provided
    if (totalValue !== undefined && totalInvested !== undefined) {
      updateData.totalProfitLoss = totalValue - totalInvested;
      updateData.totalProfitLossPercent = totalInvested > 0 ? (updateData.totalProfitLoss / totalInvested) * 100 : 0;
    }
    
    const portfolio = await Portfolio.findOneAndUpdate(
      { userId: req.params.userId },
      updateData,
      { upsert: true, new: true }
    );
    
    res.json(portfolio);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get portfolio performance history
router.get('/:userId/performance', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    const orders = await Order.find({
      userId: req.params.userId,
      orderDate: { $gte: startDate },
      status: 'COMPLETED'
    }).sort({ orderDate: 1 });
    
    // Calculate daily portfolio values (simplified)
    const performance = orders.map(order => ({
      date: order.orderDate,
      orderType: order.orderType,
      amount: order.totalAmount,
      stockSymbol: order.stockSymbol
    }));
    
    res.json(performance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get portfolio summary statistics
router.get('/:userId/summary', async (req, res) => {
  try {
    const portfolio = await Portfolio.findOne({ userId: req.params.userId });
    const holdings = await Holding.find({ userId: req.params.userId });
    const orders = await Order.find({ userId: req.params.userId, status: 'COMPLETED' });
    
    const summary = {
      totalHoldings: holdings.length,
      totalOrders: orders.length,
      buyOrders: orders.filter(o => o.orderType === 'BUY').length,
      sellOrders: orders.filter(o => o.orderType === 'SELL').length,
      portfolio: portfolio || {
        totalValue: 0,
        totalInvested: 0,
        totalProfitLoss: 0,
        totalProfitLossPercent: 0,
        availableCash: 0
      }
    };
    
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 