const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Holding = require('../models/Holding');
const Portfolio = require('../models/Portfolio');

// Get all orders for a user
router.get('/:userId', async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.params.userId })
      .sort({ orderDate: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new order
router.post('/', async (req, res) => {
  try {
    const { userId, stockSymbol, orderType, quantity, price, notes } = req.body;
    const totalAmount = quantity * price;

    // Check if user has sufficient funds for buy orders
    if (orderType === 'BUY') {
      let portfolio = await Portfolio.findOne({ userId });
      if (!portfolio) {
        portfolio = new Portfolio({
          userId,
          totalValue: 0,
          totalInvested: 0,
          totalProfitLoss: 0,
          totalProfitLossPercent: 0,
          availableCash: 0,
          numberOfHoldings: 0
        });
        await portfolio.save();
      }
      
      if (portfolio.availableCash < totalAmount) {
        return res.status(400).json({ error: 'Insufficient funds' });
      }
    }

    // Check if user has sufficient holdings for sell orders
    if (orderType === 'SELL') {
      const holding = await Holding.findOne({ userId, stockSymbol });
      if (!holding || holding.quantity < quantity) {
        return res.status(400).json({ error: 'Insufficient holdings' });
      }
    }

    const order = new Order({
      userId,
      stockSymbol,
      orderType,
      quantity,
      price,
      totalAmount,
      notes
    });

    await order.save();
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update order status
router.patch('/:orderId', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.orderId,
      { 
        status,
        completedDate: status === 'COMPLETED' ? new Date() : null
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // If order is completed, update holdings
    if (status === 'COMPLETED') {
      await updateHoldings(order);
    }

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper function to update holdings when order is completed
async function updateHoldings(order) {
  try {
    const existingHolding = await Holding.findOne({
      userId: order.userId,
      stockSymbol: order.stockSymbol
    });

    if (order.orderType === 'BUY') {
      // Deduct funds for buy order
      let portfolio = await Portfolio.findOne({ userId: order.userId });
      if (!portfolio) {
        // Create portfolio if it doesn't exist
        portfolio = new Portfolio({
          userId: order.userId,
          totalValue: 0,
          totalInvested: 0,
          totalProfitLoss: 0,
          totalProfitLossPercent: 0,
          availableCash: 0,
          numberOfHoldings: 0
        });
        await portfolio.save();
      }
      
      const newAvailableCash = portfolio.availableCash - order.totalAmount;
      await Portfolio.findByIdAndUpdate(portfolio._id, {
        availableCash: newAvailableCash,
        lastUpdated: new Date()
      });

      if (existingHolding) {
        // Update existing holding
        const newQuantity = existingHolding.quantity + order.quantity;
        const newTotalInvested = existingHolding.totalInvested + order.totalAmount;
        const newAveragePrice = newTotalInvested / newQuantity;

        await Holding.findByIdAndUpdate(existingHolding._id, {
          quantity: newQuantity,
          totalInvested: newTotalInvested,
          averageBuyPrice: newAveragePrice,
          lastUpdated: new Date()
        });
      } else {
        // Create new holding
        const newHolding = new Holding({
          userId: order.userId,
          stockSymbol: order.stockSymbol,
          stockName: order.stockSymbol, // You might want to fetch actual stock name
          quantity: order.quantity,
          averageBuyPrice: order.price,
          totalInvested: order.totalAmount,
          currentValue: order.totalAmount, // Initially same as invested
          profitLoss: 0, // Initially no profit/loss
          profitLossPercent: 0,
          lastUpdated: new Date()
        });
        await newHolding.save();
      }
    } else if (order.orderType === 'SELL') {
      // Add funds for sell order
      let portfolio = await Portfolio.findOne({ userId: order.userId });
      if (!portfolio) {
        // Create portfolio if it doesn't exist
        portfolio = new Portfolio({
          userId: order.userId,
          totalValue: 0,
          totalInvested: 0,
          totalProfitLoss: 0,
          totalProfitLossPercent: 0,
          availableCash: 0,
          numberOfHoldings: 0
        });
        await portfolio.save();
      }
      
      const newAvailableCash = portfolio.availableCash + order.totalAmount;
      await Portfolio.findByIdAndUpdate(portfolio._id, {
        availableCash: newAvailableCash,
        lastUpdated: new Date()
      });

      if (existingHolding) {
        const newQuantity = existingHolding.quantity - order.quantity;
        if (newQuantity <= 0) {
          // Remove holding if quantity becomes 0 or negative
          await Holding.findByIdAndDelete(existingHolding._id);
        } else {
          // Update holding - recalculate average price and total invested
          const remainingValue = (existingHolding.totalInvested / existingHolding.quantity) * newQuantity;
          await Holding.findByIdAndUpdate(existingHolding._id, {
            quantity: newQuantity,
            totalInvested: remainingValue,
            lastUpdated: new Date()
          });
        }
      }
    }

    // Update portfolio
    await updatePortfolio(order.userId);
  } catch (err) {
    console.error('Error updating holdings:', err);
  }
}

// Helper function to update portfolio
async function updatePortfolio(userId) {
  try {
    const holdings = await Holding.find({ userId });
    let totalValue = 0;
    let totalInvested = 0;

    for (const holding of holdings) {
      // You would typically fetch current stock price from an API
      // For now, we'll use the average buy price as current price
      const currentPrice = holding.averageBuyPrice;
      const currentValue = holding.quantity * currentPrice;
      
      // Update holding with current values
      const profitLoss = currentValue - holding.totalInvested;
      const profitLossPercent = holding.totalInvested > 0 ? (profitLoss / holding.totalInvested) * 100 : 0;
      
      await Holding.findByIdAndUpdate(holding._id, {
        currentValue: currentValue,
        profitLoss: profitLoss,
        profitLossPercent: profitLossPercent,
        lastUpdated: new Date()
      });
      
      totalValue += currentValue;
      totalInvested += holding.totalInvested;
    }

    const totalProfitLoss = totalValue - totalInvested;
    const totalProfitLossPercent = totalInvested > 0 ? (totalProfitLoss / totalInvested) * 100 : 0;

    await Portfolio.findOneAndUpdate(
      { userId },
      {
        totalValue,
        totalInvested,
        totalProfitLoss,
        totalProfitLossPercent,
        numberOfHoldings: holdings.length,
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.error('Error updating portfolio:', err);
  }
}

module.exports = router; 