const express = require('express');
const router = express.Router();
const Holding = require('../models/Holding');

// Get all holdings for a user
router.get('/:userId', async (req, res) => {
  try {
    const holdings = await Holding.find({ userId: req.params.userId })
      .sort({ lastUpdated: -1 });
    res.json(holdings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Update holding (for manual adjustments)
router.patch('/:userId/:stockSymbol', async (req, res) => {
  try {
    const { quantity, averageBuyPrice, notes } = req.body;
    const updateData = { lastUpdated: new Date() };
    
    if (quantity !== undefined) updateData.quantity = quantity;
    if (averageBuyPrice !== undefined) updateData.averageBuyPrice = averageBuyPrice;
    if (notes !== undefined) updateData.notes = notes;
    
    const holding = await Holding.findOneAndUpdate(
      {
        userId: req.params.userId,
        stockSymbol: req.params.stockSymbol.toUpperCase()
      },
      updateData,
      { new: true }
    );
    
    if (!holding) {
      return res.status(404).json({ error: 'Holding not found' });
    }
    
    res.json(holding);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete holding
router.delete('/:userId/:stockSymbol', async (req, res) => {
  try {
    const holding = await Holding.findOneAndDelete({
      userId: req.params.userId,
      stockSymbol: req.params.stockSymbol.toUpperCase()
    });
    
    if (!holding) {
      return res.status(404).json({ error: 'Holding not found' });
    }
    
    res.json({ message: 'Holding deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 