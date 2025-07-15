// MongoDB Connection
const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/myapp', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connected');
}).catch(err => {
    console.error('MongoDB connection error:', err);
});

const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt'); // Import bcrypt for password checking
const User = require('./models/User');

// Import new models
const Order = require('./models/Order');
const Holding = require('./models/Holding');
const Watchlist = require('./models/Watchlist');
const Fund = require('./models/Fund');
const Portfolio = require('./models/Portfolio');

// Import routes
const ordersRouter = require('./routes/orders');
const holdingsRouter = require('./routes/holdings');
const watchlistRouter = require('./routes/watchlist');
const fundsRouter = require('./routes/funds');
const portfolioRouter = require('./routes/portfolio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

const htmlFiles = ['signin', 'signup', 'dashboard', 'funds', 'holdings', 'orders', 'portfolio', 'profile', 'settings', 'home'];
htmlFiles.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', `${page}.html`));
  });
});

// API Routes
app.use('/api/orders', ordersRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/funds', fundsRouter);
app.use('/api/portfolio', portfolioRouter);

// Signup route
app.post('/signup', async (req, res) => {
  console.log('Signup request received:', req.body);
  const { name, email, password } = req.body;
  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).send('User already exists');

    const hashedPassword = await bcrypt.hash(password, 10); // Hash password before saving
    const user = new User({ name, email, password: hashedPassword });
    await user.save();
    res.status(200).send('Signup successful');
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).send('Signup failed');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log('Login request:', { email, password });

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found');
      return res.status(400).send('Invalid credentials');
    }

    console.log('User found:', user);

    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match result:', isMatch);

    if (!isMatch) {
      return res.status(400).send('Invalid credentials');
    }

    // Update last login
    await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    res.status(200).json({ 
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).send('Login failed');
  }
});

// Get user profile
app.get('/api/user/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user profile
app.patch('/api/user/:userId', async (req, res) => {
  try {
    const { name, phone, address, dateOfBirth } = req.body;
    const updateData = {};
    
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (address) updateData.address = address;
    if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
    
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      updateData,
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
