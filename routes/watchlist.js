const express = require('express');
const router = express.Router();
const Watchlist = require('../models/Watchlist');

// Get all watchlist items for a user
router.get('/:userId', async (req, res) => {
  try {
    const watchlist = await Watchlist.find({ userId: req.params.userId })
      .sort({ addedDate: -1 });
    res.json(watchlist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add stock to watchlist
router.post('/', async (req, res) => {
  try {
    const { userId, stockSymbol, stockName, notes } = req.body;
    
    const watchlistItem = new Watchlist({
      userId,
      stockSymbol: stockSymbol.toUpperCase(),
      stockName,
      notes
    });

    await watchlistItem.save();
    res.status(201).json(watchlistItem);
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ error: 'Stock already in watchlist' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// Update watchlist item
router.patch('/:userId/:stockSymbol', async (req, res) => {
  try {
    const { notes } = req.body;
    
    const watchlistItem = await Watchlist.findOneAndUpdate(
      {
        userId: req.params.userId,
        stockSymbol: req.params.stockSymbol.toUpperCase()
      },
      { notes, addedDate: new Date() },
      { new: true }
    );
    
    if (!watchlistItem) {
      return res.status(404).json({ error: 'Watchlist item not found' });
    }
    
    res.json(watchlistItem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove stock from watchlist
router.delete('/:userId/:stockSymbol', async (req, res) => {
  try {
    const watchlistItem = await Watchlist.findOneAndDelete({
      userId: req.params.userId,
      stockSymbol: req.params.stockSymbol.toUpperCase()
    });
    
    if (!watchlistItem) {
      return res.status(404).json({ error: 'Watchlist item not found' });
    }
    
    res.json({ message: 'Stock removed from watchlist' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check if stock is in watchlist
router.get('/:userId/:stockSymbol/check', async (req, res) => {
  try {
    const watchlistItem = await Watchlist.findOne({
      userId: req.params.userId,
      stockSymbol: req.params.stockSymbol.toUpperCase()
    });
    
    res.json({ inWatchlist: !!watchlistItem });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 