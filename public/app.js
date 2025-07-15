const MARKETSTACK_API_KEY = "031e516ff79a548af70a20fef49ad93f";

let exchangeRate = 85.98;
let user = JSON.parse(localStorage.getItem('user')) || null; 
let watchlist = [];
let holdings = [];
let orders = [];
let funds = 0;
let settings = JSON.parse(localStorage.getItem('settings')) || { theme: 'light', currency: 'INR', notifications: true };
const PRICE_UPDATE_INTERVAL = 60000; 
const HISTORY_DAYS = 750; 

// Store chart instances for real-time updates
const chartInstances = new Map();

// Store last search results to persist after re-render
let lastSearchSymbol = null;
let lastSearchStockData = null;

// Store market status and fetch errors for UI display
let marketStatusMessage = '';
let fetchErrorMessage = '';

// Apply theme
document.body.classList.toggle('dark-mode', settings.theme === 'dark');

// Throttle function
function throttle(func, limit) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= limit) {
      lastCall = now;
      return func(...args);
    }
  };
}

// Load user-specific data from database
async function loadUserData() {
  if (!user || !user.id) return;
  
  try {
    // Load portfolio data
    const portfolioResponse = await fetch(`/api/portfolio/${user.id}/details`);
    if (portfolioResponse.ok) {
      const portfolioData = await portfolioResponse.json();
      funds = portfolioData.portfolio.availableCash || 0;
      holdings = portfolioData.holdings || [];
    }

    // Load watchlist
    const watchlistResponse = await fetch(`/api/watchlist/${user.id}`);
    if (watchlistResponse.ok) {
      watchlist = await watchlistResponse.json();
    }

    // Load orders
    const ordersResponse = await fetch(`/api/orders/${user.id}`);
    if (ordersResponse.ok) {
      orders = await ordersResponse.json();
    }

    console.log('User data loaded:', { funds, holdings: holdings.length, watchlist: watchlist.length, orders: orders.length });
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// Save user-specific data to database (for local operations)
function saveUserData() {
  if (!user || !user.id) return;
  
  // Note: Most data is saved directly to database via API calls
  // This function is kept for backward compatibility
  console.log('User data saved locally');
}

// Check if US market is open (9:30 AM to 4:00 PM Eastern Time, Monday to Friday)
function isMarketOpen() {
  try {
    const now = new Date();
    const options = { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', weekday: 'long', hour12: false };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    
    const day = parts.find(part => part.type === 'weekday').value;
    const hour = parseInt(parts.find(part => part.type === 'hour').value);
    const minute = parseInt(parts.find(part => part.type === 'minute').value);
    
    const isWeekday = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(day);
    const isMarketHours = (hour > 9 || (hour === 9 && minute >= 30)) && hour < 16;
    
    const isOpen = isWeekday && isMarketHours;
    console.log(`Market open check: ${day} ${hour}:${minute} ET - Market is ${isOpen ? 'open' : 'closed'}`);
    return isOpen;
  } catch (error) {
    console.error('Error in isMarketOpen:', error.message);
    return true;
  }
}

// Validate stock symbols
function validateSymbols(symbols) {
  try {
    if (!symbols || symbols.trim() === "") {
      throw new Error("No stock symbols provided.");
    }
    const symbolArray = symbols.split(',');
    const invalidSymbols = symbolArray.filter(symbol => !/^[A-Z0-9.]+$/i.test(symbol.trim()));
    if (invalidSymbols.length > 0) {
      throw new Error(`Invalid stock symbols: ${invalidSymbols.join(', ')}. Symbols should contain only letters, numbers, and dots (e.g., AAPL, MSFT).`);
    }
    return symbolArray.map(symbol => symbol.trim().toUpperCase());
  } catch (error) {
    console.error('validateSymbols error:', error.message);
    return [];
  }
}

// Fetch stock data using Marketstack's /eod endpoint
async function fetchStockData(symbols, limit = HISTORY_DAYS) {
  const spinner = document.querySelector('.loading-spinner');
  const results = document.getElementById('search-results');
  if (spinner) spinner.style.display = 'block';
  try {
    const symbolArray = validateSymbols(symbols);
    if (symbolArray.length === 0) {
      throw new Error("No valid symbols provided after validation.");
    }

    const symbol = symbolArray[0];
    console.log(`Processing symbol: ${symbol}`);

    const today = new Date();
    const dateTo = today.toISOString().split('T')[0];
    today.setDate(today.getDate() - HISTORY_DAYS);
    const dateFrom = today.toISOString().split('T')[0];

    const url = `https://api.marketstack.com/v1/eod?access_key=${MARKETSTACK_API_KEY}&symbols=${symbol}&date_from=${dateFrom}&date_to=${dateTo}&limit=${limit}`;
    console.log(`Fetching stock data from: ${url}`);

    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'StockHustlr/1.0 (for educational purposes)'
        }
      });
    } catch (fetchError) {
      console.error('Fetch error:', fetchError);
      throw new Error('Network error: Failed to reach Marketstack API. Please check your internet connection or ensure the app is served via a local server (e.g., http://localhost).');
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP error response body:', errorText);
      if (response.status === 401) {
        throw new Error("Invalid Marketstack API key. Please sign up at https://marketstack.com/ to get a valid key and replace 'MARKETSTACK_API_KEY' in app.js.");
      } else if (response.status === 429) {
        throw new Error("Marketstack API rate limit exceeded (100 requests/month on free plan). Please upgrade your plan or try again next month.");
      } else {
        throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
      }
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError);
      const rawText = await response.text();
      console.error('Raw response body:', rawText);
      throw new Error('Failed to parse API response as JSON. Raw response logged to console.');
    }

    if (data.error) {
      console.error('Marketstack API error:', data.error);
      if (data.error.code === 101) {
        throw new Error("Invalid Marketstack API key. Please sign up at https://marketstack.com/ to get a valid key.");
      } else if (data.error.code === 105) {
        throw new Error("Marketstack API rate limit exceeded (100 requests/month on free plan). Please upgrade your plan or try again next month.");
      } else if (data.error.code === 103) {
        throw new Error(`Invalid or unsupported stock symbol: ${symbol}. Please check the symbol and try again.`);
      } else {
        throw new Error(data.error.message || "Unknown error occurred while fetching stock data.");
      }
    }

    if (!data.data || data.data.length === 0) {
      throw new Error(`No data returned for ${symbol}. The market may be closed, or the symbol may not be supported by Marketstack.`);
    }

    const stockData = data.data.map(item => ({
      symbol: item.symbol,
      date: item.date.split('T')[0],
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
    }));

    const latest = stockData[0];
    if (latest.close === 0 && latest.open === 0 && latest.high === 0 && latest.low === 0) {
      throw new Error(`No valid data returned for ${symbol}. All price fields are zero.`);
    }

    if (spinner) spinner.style.display = 'none';
    console.log('Final stock data:', stockData);
    return stockData;
  } catch (error) {
    console.error('Error fetching stock data:', error.message);
    if (spinner) spinner.style.display = 'none';

    const displayError = () => {
      const results = document.getElementById('search-results');
      if (results) {
        results.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
      } else {
        console.error('Cannot display error: search-results element not found.');
      }
    };
    displayError();

    return [];
  }
}

// Fetch the latest price using Marketstack's /intraday endpoint
async function fetchLatestPrice(symbol) {
  try {
    const now = new Date();
    const dateTo = now.toISOString().split('T')[0];
    const dateFrom = dateTo;
    const interval = '1min';
    const url = `https://api.marketstack.com/v1/intraday?access_key=${MARKETSTACK_API_KEY}&symbols=${symbol}&date_from=${dateFrom}&date_to=${dateTo}&interval=${interval}&limit=1`;
    console.log(`Fetching latest price for ${symbol} from: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'StockHustlr/1.0 (for educational purposes)'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('HTTP error response body:', errorText);
      if (response.status === 429) {
        throw new Error("Marketstack API rate limit exceeded (100 requests/month on free plan). Please upgrade your plan or reduce update frequency.");
      }
      throw new Error(`HTTP error! Status: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`Marketstack /intraday response for ${symbol}:`, data);

    if (data.error) {
      console.error('Marketstack API error:', data.error);
      throw new Error(data.error.message || "Unknown error occurred while fetching latest price.");
    }

    if (!data.data || data.data.length === 0) {
      throw new Error(`No intraday data returned for ${symbol}. The market may be closed.`);
    }

    const latest = data.data[0];
    const latestPriceData = {
      price: parseFloat(latest.close),
      open: parseFloat(latest.open),
      high: parseFloat(latest.high),
      low: parseFloat(latest.low),
      timestamp: new Date(latest.date).getTime() / 1000
    };
    console.log(`Latest price data for ${symbol}:`, latestPriceData);
    return latestPriceData;
  } catch (error) {
    console.error(`Error fetching latest price for ${symbol}:`, error.message);
    fetchErrorMessage = `Failed to update prices: ${error.message}`;
    return null;
  }
}

// Function to create and render a TradingView chart with real-time updates
function createChart(containerId, stockData, theme = 'light') {
  try {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`Chart container with ID ${containerId} not found.`);
      return;
    }

    if (!stockData || stockData.length === 0) {
      container.innerHTML = '<p style="color: red;">No data available to render chart.</p>';
      return;
    }

    if (typeof LightweightCharts === 'undefined') {
      console.error('LightweightCharts library not loaded. Please ensure the script is included in index.html.');
      container.innerHTML = '<p style="color: red;">Error: Chart library not loaded.</p>';
      return;
    }

    console.log('LightweightCharts version:', LightweightCharts.version ? LightweightCharts.version() : 'Unknown');

    container.innerHTML = '';
    container.style.width = '100%';
    container.style.height = '400px';

    let chartData = stockData.map(item => ({
      time: item.date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      value: item.close,
    })).reverse();

    const chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 400,
      layout: {
        backgroundColor: theme === 'dark' ? '#1a1a1a' : '#ffffff',
        textColor: theme === 'dark' ? '#d1d4dc' : '#000000',
      },
      grid: {
        vertLines: { color: theme === 'dark' ? '#333' : '#e1e1e1' },
        horzLines: { color: theme === 'dark' ? '#333' : '#e1e1e1' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
    });

    let series;
    if (typeof chart.addCandlestickSeries === 'function') {
      series = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
      });
      series.setData(chartData);
      console.log(`Candlestick chart rendered successfully for ${containerId}`);
    } else {
      console.warn('addCandlestickSeries not available. Falling back to line series.');
      series = chart.addLineSeries({
        color: '#2962FF',
        lineWidth: 2,
      });
      const lineData = chartData.map(item => ({
        time: item.time,
        value: item.close,
      }));
      series.setData(lineData);
      console.log(`Line chart rendered successfully for ${containerId} as a fallback`);
    }

    chart.timeScale().fitContent();

    const resizeChart = () => {
      if (container.clientWidth > 0 && container.clientHeight > 0) {
        chart.resize(container.clientWidth, 400);
        chart.timeScale().fitContent();
        console.log(`Chart resized to ${container.clientWidth}x400px`);
      }
    };
    window.addEventListener('resize', resizeChart);

    setTimeout(() => {
      if (container.querySelector('canvas')) {
        console.log(`Chart canvas found for ${containerId}, chart should be visible`);
      } else {
        console.warn(`Chart canvas not found for ${containerId}, chart may not be visible`);
      }
    }, 100);

    chartInstances.set(containerId, { chart, series, data: chartData, symbol: stockData[0].symbol });
  } catch (error) {
    console.error('Error in createChart:', error.message);
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `<p style="color: red;">Error rendering chart: ${error.message}</p>`;
    }
  }
}

// Update all charts with real-time market prices
const updateCharts = throttle(async () => {
  marketStatusMessage = '';
  fetchErrorMessage = '';

  const marketOpen = isMarketOpen();
  if (!marketOpen) {
    marketStatusMessage = 'Market is closed. Showing last known prices.';
    console.log(marketStatusMessage);
  }

  for (const [containerId, { chart, series, data, symbol }] of chartInstances) {
    let latestPriceData = null;
    if (marketOpen) {
      latestPriceData = await fetchLatestPrice(symbol);
    }

    if (!latestPriceData && data.length > 0) {
      const lastDataPoint = data[0];
      latestPriceData = {
        price: lastDataPoint.close,
        open: lastDataPoint.open,
        high: lastDataPoint.high,
        low: lastDataPoint.low,
        timestamp: new Date(lastDataPoint.time).getTime() / 1000
      };
      console.log(`Using last known price for ${symbol}: ₹${(latestPriceData.price * exchangeRate).toFixed(2)}`);
    }

    if (latestPriceData) {
      const { price, open, high, low, timestamp } = latestPriceData;
      const updatedDataPoint = {
        time: timestamp,
        open: open,
        high: high,
        low: low,
        close: price,
        value: price,
      };

      if (data.length >= HISTORY_DAYS) {
        data.pop();
      }
      data.unshift(updatedDataPoint);
      series.setData([...data]);
      chart.timeScale().fitContent();

      const watchlistStock = watchlist.find(s => s.symbol === symbol);
      if (watchlistStock) {
        watchlistStock.price = price * exchangeRate;
      }
      const holdingStock = holdings.find(h => h.symbol === symbol);
      if (holdingStock) {
        holdingStock.currentPrice = price * exchangeRate;
      }

      console.log(`Chart updated for ${symbol}: ₹${(price * exchangeRate).toFixed(2)}`);
    } else {
      console.warn(`No price data available for ${symbol}, chart not updated.`);
    }
  }

  saveUserData();
  updateSidebar();

  const hash = window.location.hash;
  if (hash === '#dashboard') {
    const totalPortfolioValue = holdings.reduce((sum, h) => sum + (h.currentPrice || h.buyPrice) * h.quantity, 0);
    const totalGainLoss = holdings.reduce((sum, h) => {
      const currentPrice = h.currentPrice || h.buyPrice;
      return sum + (currentPrice - h.buyPrice) * h.quantity;
    }, 0);
    const portfolioValueEl = document.querySelector('.stat-card:nth-child(3) p');
    const gainLossEl = document.querySelector('.stat-card:nth-child(2) p');
    const statusEl = document.querySelector('.market-status');
    if (portfolioValueEl) {
      portfolioValueEl.textContent = `₹${totalPortfolioValue.toFixed(2)}`;
    }
    if (gainLossEl) {
      gainLossEl.textContent = `₹${totalGainLoss.toFixed(2)}`;
      gainLossEl.className = totalGainLoss >= 0 ? 'text-green' : 'text-red';
    }
    if (statusEl) {
      statusEl.innerHTML = marketStatusMessage ? `<span style="color: orange;">${marketStatusMessage}</span>` : '';
      if (fetchErrorMessage) {
        statusEl.innerHTML += `<br><span style="color: red;">${fetchErrorMessage}</span>`;
      }
    }
  }
  if (hash === '#portfolio') {
    const totalPortfolioValue = holdings.reduce((sum, h) => sum + (h.currentPrice || h.buyPrice) * h.quantity, 0);
    const portfolioValueEl = document.querySelector('.portfolio-value');
    const holdingsTableBody = document.querySelector('.holdings-table tbody');
    if (portfolioValueEl) {
      portfolioValueEl.textContent = `Portfolio Value: ₹${totalPortfolioValue.toFixed(2)}`;
    }
    if (holdingsTableBody) {
      holdingsTableBody.innerHTML = holdings.map(h => {
        const currentPrice = h.currentPrice || h.buyPrice;
        const gainLoss = (currentPrice - h.buyPrice) * h.quantity;
        return `
          <tr>
            <td>${h.symbol}</td>
            <td>${h.quantity}</td>
            <td>₹${h.buyPrice.toFixed(2)}</td>
            <td>₹${currentPrice.toFixed(2)}</td>
            <td class="${gainLoss >= 0 ? 'text-green' : 'text-red'}">
              ${gainLoss >= 0 ? '+' : ''}₹${gainLoss.toFixed(2)}
            </td>
          </tr>
        `;
      }).join('');
    }
  }
  if (hash === '#holdings') {
    const holdingsTableBody = document.querySelector('.holdings-table tbody');
    if (holdingsTableBody) {
      holdingsTableBody.innerHTML = holdings.map(h => {
        const currentPrice = h.currentPrice || h.buyPrice;
        const gainLoss = (currentPrice - h.buyPrice) * h.quantity;
        return `
          <tr>
            <td>${h.symbol}</td>
            <td>${h.quantity}</td>
            <td>₹${h.buyPrice.toFixed(2)}</td>
            <td>₹${currentPrice.toFixed(2)}</td>
            <td class="${gainLoss >= 0 ? 'text-green' : 'text-red'}">
              ${gainLoss >= 0 ? '+' : ''}₹${gainLoss.toFixed(2)}
            </td>
            <td>
              <button class="btn-red" onclick="sellStock('${h.symbol}', ${currentPrice})" aria-label="Sell ${h.symbol}">Sell</button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
  if (hash.startsWith('#stock/')) {
    const symbol = hash.split('/')[2];
    const stock = watchlist.find(s => s.symbol === symbol);
    const priceEl = document.querySelector('.card h2');
    const statusEl = document.querySelector('.market-status');
    if (priceEl && stock) {
      priceEl.textContent = `Current Price: ₹${stock.price.toFixed(2)}`;
    }
    if (statusEl) {
      statusEl.innerHTML = marketStatusMessage ? `<span style="color: orange;">${marketStatusMessage}</span>` : '';
      if (fetchErrorMessage) {
        statusEl.innerHTML += `<br><span style="color: red;">${fetchErrorMessage}</span>`;
      }
    }
  }
}, PRICE_UPDATE_INTERVAL);

// Request notification permission
if (settings.notifications && Notification.permission !== 'granted') {
  Notification.requestPermission();
}

// Sidebar rendering
function updateSidebar() {
  try {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    const watchlistUl = sidebar.querySelector('.watchlist');
    
    if (watchlist && watchlist.length > 0) {
    watchlistUl.innerHTML = watchlist.map(stock => `
      <li>
          <span class="stock-symbol">${stock.stockSymbol}</span>
          ${stock.notes ? `<small>${stock.notes}</small>` : ''}
          <button aria-label="Remove ${stock.stockSymbol} from watchlist" onclick="removeFromWatchlist('${stock.stockSymbol}')">Remove</button>
      </li>
    `).join('');
    } else {
      watchlistUl.innerHTML = '<li>No stocks in watchlist</li>';
    }
  } catch (error) {
    console.error('Error in updateSidebar:', error.message);
  }
}

// Add to watchlist
window.addToWatchlist = async function (symbol, price) {
  try {
    if (!user || !user.id) {
      alert('Please login first');
      return;
    }
    
    const response = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        stockSymbol: symbol,
        stockName: symbol,
        notes: `Added at ₹${price.toFixed(2)}`
      })
    });
    
    if (response.ok) {
      await loadUserData(); // Reload user data from database
      updateSidebar();
      alert(`${symbol} added to watchlist!`);
    } else {
      const error = await response.json();
      alert('Error adding to watchlist: ' + (error.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error in addToWatchlist:', error.message);
    alert('Error adding to watchlist. Please try again.');
  }
};

// Remove from watchlist
window.removeFromWatchlist = async function (symbol) {
  try {
    if (!user || !user.id) {
      alert('Please login first');
      return;
    }
    
    const response = await fetch(`/api/watchlist/${user.id}/${symbol}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      await loadUserData(); // Reload user data from database
    updateSidebar();
      alert(`${symbol} removed from watchlist!`);
    } else {
      const error = await response.json();
      alert('Error removing from watchlist: ' + (error.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error in removeFromWatchlist:', error.message);
    alert('Error removing from watchlist. Please try again.');
  }
};

// Buy stock
window.buyStock = async function (symbol, price) {
  try {
    if (!user || !user.id) {
      alert('Please login first');
      return;
    }
    
    const quantity = parseInt(prompt(`How many shares of ${symbol} to buy?`));
    if (isNaN(quantity) || quantity <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    
    // Create buy order
    const orderResponse = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        stockSymbol: symbol,
        orderType: 'BUY',
        quantity: quantity,
        price: price,
        notes: `Buy order for ${symbol}`
      })
    });
    
    if (orderResponse.ok) {
      const order = await orderResponse.json();
      
      // Complete the order immediately (in a real app, this would be done by admin/market)
      const completeResponse = await fetch(`/api/orders/${order._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' })
      });
      
      if (completeResponse.ok) {
        await loadUserData(); // Reload user data from database
        renderDashboard();
        alert(`Successfully bought ${quantity} shares of ${symbol}!`);
      } else {
        alert('Order created but failed to complete. Please contact support.');
      }
    } else {
      const error = await orderResponse.json();
      alert('Error creating order: ' + (error.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error in buyStock:', error.message);
    alert('Error buying stock. Please try again.');
  }
};

// Sell stock
window.sellStock = async function (symbol, price) {
  try {
    if (!user || !user.id) {
      alert('Please login first');
      return;
    }
    
    const quantity = parseInt(prompt(`How many shares of ${symbol} to sell?`));
    if (isNaN(quantity) || quantity <= 0) {
      alert('Please enter a valid quantity.');
      return;
    }
    
    // Create sell order
    const orderResponse = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        stockSymbol: symbol,
        orderType: 'SELL',
        quantity: quantity,
        price: price,
        notes: `Sell order for ${symbol}`
      })
    });
    
    if (orderResponse.ok) {
      const order = await orderResponse.json();
      
      // Complete the order immediately (in a real app, this would be done by admin/market)
      const completeResponse = await fetch(`/api/orders/${order._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' })
      });
      
      if (completeResponse.ok) {
        await loadUserData(); // Reload user data from database
    renderDashboard();
        alert(`Successfully sold ${quantity} shares of ${symbol}!`);
      } else {
        alert('Order created but failed to complete. Please contact support.');
      }
    } else {
      const error = await orderResponse.json();
      alert('Error creating order: ' + (error.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error in sellStock:', error.message);
    alert('Error selling stock. Please try again.');
  }
};

// Navigation rendering
function renderNav() {
  try {
    return `
      <header class="header">
        <nav class="navbar">
          <img src="logo.png" alt="StockHustlr Logo" class="logo" style="background-color: #ffffff;">
          <ul class="nav-links">
            ${user ? `
              <li><a href="#dashboard" class="${window.location.hash === '#dashboard' ? 'active' : ''}">Dashboard</a></li>
              <li><a href="#portfolio" class="${window.location.hash === '#portfolio' ? 'active' : ''}">Portfolio</a></li>
              <li><a href="#orders" class="${window.location.hash === '#orders' ? 'active' : ''}">Orders</a></li>
              <li><a href="#holdings" class="${window.location.hash === '#holdings' ? 'active' : ''}">Holdings</a></li>
              <li><a href="#funds" class="${window.location.hash === '#funds' ? 'active' : ''}">Funds</a></li>
              <li><a href="#profile" class="${window.location.hash === '#profile' ? 'active' : ''}">Profile</a></li>
              <li><a href="#settings" class="${window.location.hash === '#settings' ? 'active' : ''}">Settings</a></li>
              <li><a href="#" onclick="logout()">Logout</a></li>
            ` : `
              <li><a href="#signup" class="${window.location.hash === '#signup' ? 'active' : ''}">Sign Up</a></li>
              <li><a href="#signin" class="${window.location.hash === '#signin' ? 'active' : ''}">Sign In</a></li>
            `}
          </ul>
        </nav>
      </header>
    `;
  } catch (error) {
    console.error('Error in renderNav:', error.message);
    return '<header class="header"><p style="color: red;">Error rendering navigation. Check console.</p></header>';
  }
}

// Home page
function renderHome() {
  try {
    const appDiv = document.getElementById('app');
    if (!appDiv) {
      console.error('App div not found in DOM');
      document.body.innerHTML = '<p style="color: red;">Error: App div not found. Please ensure index.html has <div id="app"></div>.</p>';
      return;
    }

    console.log('Rendering home page...');
    appDiv.innerHTML = `
      ${renderNav()}
      <section class="section hero">
        <div class="hero-content">
          <h1>Invest Smart with StockHustlr</h1>
          <p>Trade stocks, track your portfolio, and grow your wealth with real-time insights.</p>
          <a href="#signup" class="signup-btn">Get Started</a>
        </div>
        <div class="hero-image">
          <img src="laptop-chart.png" alt="Stock Chart on Laptop">
        </div>
      </section>
      <section class="section services">
        <h2>Our Services</h2>
        <div class="services-grid">
          <div class="service-card">
            <img src="futuresight-portfolio.png" alt="Portfolio Management" onerror="console.error('Failed to load image: futuresight-portfolio.png'); this.style.display='none';">
            <h3>Portfolio Management</h3>
            <p>Track and manage your investments with ease.</p>
          </div>
          <div class="service-card">
            <img src="market-pulse.png" alt="Real-Time Updates" onerror="console.error('Failed to load image: market-pulse.png'); this.style.display='none';">
            <h3>Real-Time Updates</h3>
            <p>Get live stock prices and market insights.</p>
          </div>
          <div class="service-card">
            <img src="future-path.png" alt="Market Analysis" onerror="console.error('Failed to load image: future-path.png'); this.style.display='none';">
            <h3>Market Analysis</h3>
            <p>Make informed decisions with advanced analytics.</p>
          </div>
        </div>
      </section>
      <section class="section contact">
        <h2>Contact Us</h2>
        <p>We’d love to hear from you! Reach out with any questions or feedback.</p>
        <div class="contact-form-container">
          <div class="contact-text">
            <h3>Get in Touch</h3>
            <p>Email: support@stockhustlr.com</p>
            <p>Phone: +91 123-456-7890</p>
          </div>
          <form id="contact-form">
            <div class="form-row">
              <input type="text" placeholder="Name" required aria-label="Name">
              <input type="email" placeholder="Email" required aria-label="Email">
            </div>
            <textarea placeholder="Message" required aria-label="Message"></textarea>
            <button type="submit" id="send-btn" aria-label="Send message">Send</button>
          </form>
        </div>
      </section>
      <footer class="footer">
        <div class="footer-content">
          <div class="footer-logo">
            <img src="logo.png" alt="StockHustlr Logo" style="background-color: #ffffff;">
          </div>
          <div class="footer-links">
            <div class="footer-column">
              <h4>Company</h4>
              <ul>
                <li><a href="#">About Us</a></li>
                <li><a href="#">Careers</a></li>
                <li><a href="#">Press</a></li>
              </ul>
            </div>
            <div class="footer-column">
              <h4>Support</h4>
              <ul>
                <li><a href="#">FAQ</a></li>
                <li><a href="#">Contact</a></li>
                <li><a href="#">Terms</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div class="footer-copyright">
          <p>© 2025 StockHustlr. All rights reserved.</p>
        </div>
      </footer>
    `;
    console.log('Home page rendered successfully.');
  } catch (error) {
    console.error('Error in renderHome:', error.message);
    const appDiv = document.getElementById('app');
    if (appDiv) {
      appDiv.innerHTML = `<p style="color: red;">Error rendering home page: ${error.message}. Check console for details.</p>`;
    } else {
      document.body.innerHTML = `<p style="color: red;">Error rendering home page: ${error.message}. App div not found.</p>`;
    }
  }
}

//sign up
function renderSignup() {
  try {
    document.getElementById('app').innerHTML = `
      ${renderNav()}
      <div class="form-container">
        <h2>Sign Up</h2>
        <form id="signup-form">
          <div class="form-group">
            <label for="name">Name</label>
            <input type="text" id="name" placeholder="Enter your name" required aria-label="Name">
          </div>
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" placeholder="Enter your email" required aria-label="Email">
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" placeholder="Enter your password" required aria-label="Password">
          </div>
          <button type="submit" aria-label="Sign up">Sign Up</button>
        </form>
        <p>Already have an account? <a href="#signin">Sign In</a></p>
      </div>
    `;

    document.getElementById('signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      console.log('Sending signup request:', name, email);

      try {
        const response = await fetch('/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        });

        const result = await response.text();
        console.log('Signup response:', result);

        if (response.ok) {
          alert('Signup successful! Please sign in.');
          window.location.hash = '#signin';
        } else {
          alert('Signup failed: ' + result);
        }
      } catch (error) {
        console.error('Signup error:', error);
        alert('Something went wrong. Please try again later.');
      }
    });
  } catch (error) {
    console.error('Error in renderSignup:', error.message);
    document.getElementById('app').innerHTML = `<p style="color: red;">Error rendering signup page: ${error.message}</p>`;
  }
}

function renderSignin() {
  try {
    document.getElementById('app').innerHTML = `
      ${renderNav()}
      <div class="form-container">
        <h2>Sign In</h2>
        <form id="signin-form">
          <div class="form-group">
            <label for="email">Email</label>
            <input type="email" id="email" placeholder="Enter your email" required aria-label="Email">
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" placeholder="Enter your password" required aria-label="Password">
          </div>
          <button type="submit" aria-label="Sign in">Sign In</button>
        </form>
        <p>Don't have an account? <a href="#signup">Sign Up</a></p>
      </div>
    `;

    document.getElementById('signin-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      console.log('Logging in:', email);

      try {
        const response = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        const result = await response.text();
        console.log('Login response:', result);

        if (response.ok) {
          try {
            const userData = JSON.parse(result);
            user = userData.user;
          localStorage.setItem('user', JSON.stringify(user));
            
            // Load user data from database
            await loadUserData();

          window.location.hash = '#dashboard';
          } catch (parseError) {
            console.error('Error parsing login response:', parseError);
            alert('Login successful but error loading user data. Please try again.');
          }
        } else {
          alert('Login failed: ' + result);
        }
      } catch (error) {
        console.error('Login error:', error);
        alert('Something went wrong. Try again later.');
      }
    });
  } catch (error) {
    console.error('Error in renderSignin:', error.message);
    document.getElementById('app').innerHTML = `<p style="color: red;">Error rendering signin page: ${error.message}</p>`;
  }
}

// Logout
window.logout = function () {
  try {
    user = null;
    funds = 0;
    watchlist = [];
    holdings = [];
    orders = [];
    localStorage.removeItem('user'); // Clear user from localStorage on logout
    window.location.hash = '#';
  } catch (error) {
    console.error('Error in logout:', error.message);
  }
};

// Dashboard
function renderDashboard() {
  try {
    if (!user) {
      window.location.hash = '#signin';
      return;
    }
    
    // Calculate portfolio values from database holdings
    const totalPortfolioValue = holdings.reduce((sum, h) => sum + (h.currentValue || h.totalInvested), 0);
    const totalGainLoss = holdings.reduce((sum, h) => sum + (h.profitLoss || 0), 0);
    document.getElementById('app').innerHTML = `
      ${renderNav()}
      <div class="app">
        <aside class="sidebar">
          <h2>Watchlist</h2>
          <ul class="watchlist"></ul>
        </aside>
        <main class="main-content">
          <h1>Dashboard</h1>
          <div class="stats-grid">
            <div class="stat-card">
              <h3>Funds Available</h3>
              <p>₹${funds.toFixed(2)}</p>
            </div>
            <div class="stat-card">
              <h3>Total Gain/Loss</h3>
              <p class="${totalGainLoss >= 0 ? 'text-green' : 'text-red'}">
                ${totalGainLoss >= 0 ? '+' : ''}₹${totalGainLoss.toFixed(2)}
              </p>
            </div>
            <div class="stat-card">
              <h3>Portfolio Value</h3>
              <p>₹${totalPortfolioValue.toFixed(2)}</p>
            </div>
          </div>
          <div class="search-section">
            <h2>Search Stocks</h2>
            <div class="search-bar">
              <input type="text" id="search-input" placeholder="Search stocks (e.g., AAPL)" aria-label="Search stocks">
              <button onclick="fetchStockDataWrapper(document.getElementById('search-input').value)" aria-label="Search">Search</button>
            </div>
            <div class="loading-spinner"></div>
            <p class="market-status"></p>
            <div class="search-results" id="search-results"></div>
          </div>
        </main>
      </div>
    `;
    updateSidebar();
    document.getElementById('search-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') fetchStockDataWrapper(e.target.value);
    });

    if (lastSearchSymbol && lastSearchStockData) {
      const results = document.getElementById('search-results');
      if (results) {
        const stock = lastSearchStockData[0];
        const price = stock.close * exchangeRate;
        const isInWatchlist = watchlist.some(w => w.stockSymbol === stock.symbol);
        results.innerHTML = `
          <div class="result-card">
            <span><a href="#stock/${stock.symbol}">${stock.symbol}</a> - ₹${price.toFixed(2)}</span>
            <div class="result-actions">
              <button class="btn-green" onclick="addToWatchlist('${stock.symbol}', ${price})" aria-label="Add ${stock.symbol} to watchlist" ${isInWatchlist ? 'disabled' : ''}>${isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}</button>
              <button class="btn-blue" onclick="buyStock('${stock.symbol}', ${price})" aria-label="Buy ${stock.symbol}">Buy</button>
              <button class="btn-red" onclick="sellStock('${stock.symbol}', ${price})" aria-label="Sell ${stock.symbol}">Sell</button>
            </div>
            <div id="chart-${stock.symbol}" class="stock-chart"></div>
          </div>
        `;
        createChart(`chart-${stock.symbol}`, lastSearchStockData, settings.theme);
      }
    }

    const statusEl = document.querySelector('.market-status');
    if (statusEl) {
      statusEl.innerHTML = marketStatusMessage ? `<span style="color: orange;">${marketStatusMessage}</span>` : '';
      if (fetchErrorMessage) {
        statusEl.innerHTML += `<br><span style="color: red;">${fetchErrorMessage}</span>`;
      }
    }
  } catch (error) {
    console.error('Error in renderDashboard:', error.message);
    document.getElementById('app').innerHTML = `<p style="color: red;">Error rendering dashboard: ${error.message}</p>`;
  }
}

// Wrapper for fetchStockData to ensure UI updates correctly
window.fetchStockDataWrapper = async function (symbol) {
  try {
    const results = document.getElementById('search-results');
    if (results) {
      results.innerHTML = '';
    }
    const stockData = await fetchStockData(symbol, HISTORY_DAYS);
    if (!results) {
      console.error('search-results element not found after fetch');
      return;
    }
    if (stockData.length > 0) {
      const stock = stockData[0];
      const price = stock.close * exchangeRate;
      results.innerHTML = `
        <div class="result-card">
          <span><a href="#stock/${stock.symbol}">${stock.symbol}</a> - ₹${price.toFixed(2)}</span>
          <div class="result-actions">
            <button class="btn-green" onclick="addToWatchlist('${stock.symbol}', ${price})" aria-label="Add ${stock.symbol} to watchlist">Add to Watchlist</button>
            <button class="btn-blue" onclick="buyStock('${stock.symbol}', ${price})" aria-label="Buy ${stock.symbol}">Buy</button>
            <button class="btn-red" onclick="sellStock('${stock.symbol}', ${price})" aria-label="Sell ${stock.symbol}">Sell</button>
          </div>
          <div id="chart-${stock.symbol}" class="stock-chart"></div>
        </div>
      `;
      createChart(`chart-${stock.symbol}`, stockData, settings.theme);
      lastSearchSymbol = symbol;
      lastSearchStockData = stockData;
    } else {
      lastSearchSymbol = null;
      lastSearchStockData = null;
    }
  } catch (error) {
    console.error('Error in fetchStockDataWrapper:', error.message);
    const results = document.getElementById('search-results');
    if (results) {
      results.innerHTML = `<p style="color: red;">Error fetching stock data: ${error.message}</p>`;
    }
    lastSearchSymbol = null;
    lastSearchStockData = null;
  }
};

// Stock Details
window.renderStockDetails = async function (symbol) {
  try {
    const stock = watchlist.find(s => s.symbol === symbol);
    const stockData = await fetchStockData(symbol, HISTORY_DAYS);
    // Calculate recommendation based on price change percentage
    let recommendation = 'HOLD';
    if (stockData.length > 1) {
      const firstPrice = stockData[stockData.length - 1].close; // Oldest price
      const lastPrice = stockData[0].close; // Latest price
      const priceChangePercent = ((lastPrice - firstPrice) / firstPrice) * 100;
      if (priceChangePercent > 2) {
        recommendation = 'BUY';
      } else if (priceChangePercent < -2) {
        recommendation = 'SELL';
      }
    }
    document.getElementById('app').innerHTML = `
      ${renderNav()}
      <div class="app">
        <aside class="sidebar">
          <h2>Watchlist</h2>
          <ul class="watchlist"></ul>
        </aside>
        <main class="main-content">
          <h1>${symbol} Details</h1>
          <div class="card">
            <h2>Current Price: ₹${stock ? stock.price.toFixed(2) : 0}</h2>
            <p>Recommendation: <span class="recommendation ${recommendation.toLowerCase()}">${recommendation}</span></p>
            <p class="market-status"></p>
            <div id="chart-${symbol}" class="stock-chart"></div>
            <div class="result-actions">
              <button class="btn-blue" onclick="buyStock('${symbol}', ${stock ? stock.price : 0})" aria-label="Buy ${symbol}">Buy</button>
              <button class="btn-red" onclick="sellStock('${symbol}', ${stock ? stock.price : 0})" aria-label="Sell ${symbol}">Sell</button>
            </div>
          </div>
        </main>
      </div>
    `;
    updateSidebar();
    if (stockData.length > 0) {
      createChart(`chart-${symbol}`, stockData, settings.theme);
    }

    const statusEl = document.querySelector('.market-status');
    if (statusEl) {
      statusEl.innerHTML = marketStatusMessage ? `<span style="color: orange;">${marketStatusMessage}</span>` : '';
      if (fetchErrorMessage) {
        statusEl.innerHTML += `<br><span style="color: red;">${fetchErrorMessage}</span>`;
      }
    }
  } catch (error) {
    console.error('Error in renderStockDetails:', error.message);
    document.getElementById('app').innerHTML = `<p style="color: red;">Error rendering stock details: ${error.message}</p>`;
  }
};

// Portfolio
function renderPortfolio() {
  try {
    if (!user) {
      window.location.hash = '#signin';
      return;
    }
    
    // Calculate portfolio values from database holdings
    const totalPortfolioValue = holdings.reduce((sum, h) => sum + (h.currentValue || h.totalInvested), 0);
    const totalGainLoss = holdings.reduce((sum, h) => sum + (h.profitLoss || 0), 0);
    
    document.getElementById('app').innerHTML = `
      ${renderNav()}
      <div class="app">
        <aside class="sidebar">
          <h2>Watchlist</h2>
          <ul class="watchlist"></ul>
        </aside>
        <main class="main-content">
          <h1>Portfolio</h1>
          <div class="card">
            <h2 class="portfolio-value">Portfolio Value: ₹${totalPortfolioValue.toFixed(2)}</h2>
            <p>Total Gain/Loss: <span class="${totalGainLoss >= 0 ? 'text-green' : 'text-red'}">${totalGainLoss >= 0 ? '+' : ''}₹${totalGainLoss.toFixed(2)}</span></p>
            <h3>Your Holdings</h3>
            <table class="holdings-table">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Quantity</th>
                  <th>Average Buy Price</th>
                  <th>Current Value</th>
                  <th>Gain/Loss</th>
                </tr>
              </thead>
              <tbody>
                ${holdings.map(h => {
                  return `
                    <tr>
                      <td>${h.stockSymbol}</td>
                      <td>${h.quantity}</td>
                      <td>₹${h.averageBuyPrice.toFixed(2)}</td>
                      <td>₹${h.currentValue.toFixed(2)}</td>
                      <td class="${h.profitLoss >= 0 ? 'text-green' : 'text-red'}">
                        ${h.profitLoss >= 0 ? '+' : ''}₹${h.profitLoss.toFixed(2)}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    `;
    updateSidebar();
  } catch (error) {
    console.error('Error in renderPortfolio:', error.message);
    document.getElementById('app').innerHTML = `<p style="color: red;">Error rendering portfolio: ${error.message}</p>`;
  }
}

// Orders
function renderOrders() {
  try {
    if (!user) {
      window.location.hash = '#signin';
      return;
    }
    document.getElementById('app').innerHTML = `
      ${renderNav()}
      <div class="app">
        <aside class="sidebar">
          <h2>Watchlist</h2>
          <ul class="watchlist"></ul>
        </aside>
        <main class="main-content">
          <h1>Orders</h1>
          <div class="card">
            <h2>Order History</h2>
            <table class="holdings-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Symbol</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Total Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${orders.map(order => {
                  const isFund = order.orderType === 'DEPOSIT' || order.orderType === 'WITHDRAWAL';
                  return `
                    <tr>
                      <td>${order.orderType}</td>
                      <td>${isFund ? 'N/A' : order.stockSymbol}</td>
                      <td>${isFund ? 'N/A' : order.quantity}</td>
                      <td>${isFund ? 'N/A' : `₹${order.price.toFixed(2)}`}</td>
                      <td>₹${order.totalAmount.toFixed(2)}</td>
                      <td><span class="status-${order.status.toLowerCase()}">${order.status}</span></td>
                      <td>${new Date(order.orderDate).toLocaleDateString()}</td>
                      <td>${order.notes || ''}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    `;
    updateSidebar();
  } catch (error) {
    console.error('Error in renderOrders:', error.message);
    document.getElementById('app').innerHTML = `<p style="color: red;">Error rendering orders: ${error.message}</p>`;
  }
}

// Holdings
function renderHoldings() {
  try {
    if (!user) {
      window.location.hash = '#signin';
      return;
    }
    document.getElementById('app').innerHTML = `
      ${renderNav()}
      <div class="app">
        <aside class="sidebar">
          <h2>Watchlist</h2>
          <ul class="watchlist"></ul>
        </aside>
        <main class="main-content">
          <h1>Holdings</h1>
          <div class="card">
            <h2>Your Holdings</h2>
            <table class="holdings-table">
              <thead>
                <tr>
                  <th>Stock</th>
                  <th>Quantity</th>
                  <th>Average Buy Price</th>
                  <th>Total Invested</th>
                  <th>Current Value</th>
                  <th>Gain/Loss</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${holdings.map(h => {
                  return `
                    <tr>
                      <td>${h.stockSymbol}</td>
                      <td>${h.quantity}</td>
                      <td>₹${h.averageBuyPrice.toFixed(2)}</td>
                      <td>₹${h.totalInvested.toFixed(2)}</td>
                      <td>₹${h.currentValue.toFixed(2)}</td>
                      <td class="${h.profitLoss >= 0 ? 'text-green' : 'text-red'}">
                        ${h.profitLoss >= 0 ? '+' : ''}₹${h.profitLoss.toFixed(2)}
                      </td>
                      <td>
                        <button class="btn-red" onclick="sellStock('${h.stockSymbol}', ${h.currentValue / h.quantity})" aria-label="Sell ${h.stockSymbol}">Sell</button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    `;
    updateSidebar();
  } catch (error) {
    console.error('Error in renderHoldings:', error.message);
    document.getElementById('app').innerHTML = `<p style="color: red;">Error rendering holdings: ${error.message}</p>`;
  }
}

// Funds
function renderFunds() {
  try {
    if (!user) {
      window.location.hash = '#signin';
      return;
    }
    
    // Calculate funds used from portfolio
    const totalInvested = holdings.reduce((sum, h) => sum + (h.totalInvested || 0), 0);
    const availableFunds = funds;
    const totalFunds = availableFunds + totalInvested;
    const usedPercentage = totalFunds > 0 ? (totalInvested / totalFunds) * 100 : 0;
    const availablePercentage = 100 - usedPercentage;
    
    document.getElementById('app').innerHTML = `
      ${renderNav()}
      <div class="app">
        <aside class="sidebar">
          <h2>Watchlist</h2>
          <ul class="watchlist"></ul>
        </aside>
        <main class="main-content">
          <h1>Funds</h1>
          <div class="funds-container">
          <div class="card">
              <h2>Quick Actions</h2>
              <div class="funds-actions">
                <button onclick="addFunds()" class="btn-blue">Add Funds</button>
                <button onclick="withdrawFunds()" class="btn-red">Withdraw Funds</button>
              </div>
              <div class="funds-summary">
                <div class="summary-item">
                  <h3>Total Portfolio Value</h3>
                  <p class="summary-value">₹${(availableFunds + totalInvested).toFixed(2)}</p>
                </div>
                <div class="summary-item">
                  <h3>Available Cash</h3>
                  <p class="summary-value text-green">₹${availableFunds.toFixed(2)}</p>
                </div>
                <div class="summary-item">
                  <h3>Invested Amount</h3>
                  <p class="summary-value text-blue">₹${totalInvested.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    `;
    updateSidebar();
  } catch (error) {
    console.error('Error in renderFunds:', error.message);
    document.getElementById('app').innerHTML = `<p style="color: red;">Error rendering funds: ${error.message}</p>`;
  }
}

window.addFunds = async function () {
  try {
    if (!user || !user.id) {
      alert('Please login first');
      return;
    }
    
    const amount = parseFloat(prompt('Enter amount to add:'));
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount.');
      return;
    }
    
    const response = await fetch('/api/funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        transactionType: 'DEPOSIT',
        amount: amount,
        description: 'Manual deposit'
      })
    });
    
    if (response.ok) {
      await loadUserData(); // Reload user data from database
    renderFunds();
      alert(`Successfully added ₹${amount.toFixed(2)} to your account!`);
    } else {
      const error = await response.json();
      alert('Error adding funds: ' + (error.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error in addFunds:', error.message);
    alert('Error adding funds. Please try again.');
  }
};

window.withdrawFunds = async function () {
  try {
    if (!user || !user.id) {
      alert('Please login first');
      return;
    }
    
    const amount = parseFloat(prompt('Enter amount to withdraw:'));
    if (isNaN(amount) || amount <= 0) {
      alert('Invalid amount.');
      return;
    }
    
    const response = await fetch('/api/funds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: user.id,
        transactionType: 'WITHDRAWAL',
        amount: amount,
        description: 'Manual withdrawal'
      })
    });
    
    if (response.ok) {
      await loadUserData(); // Reload user data from database
    renderFunds();
      alert(`Successfully withdrawn ₹${amount.toFixed(2)} from your account!`);
    } else {
      const error = await response.json();
      alert('Error withdrawing funds: ' + (error.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error in withdrawFunds:', error.message);
    alert('Error withdrawing funds. Please try again.');
  }
};

// Profile
function renderProfile() {
  try {
    if (!user) {
      window.location.hash = '#signin';
      return;
    }
    
    // Get user details from database
    fetch(`/api/user/${user.id}`)
      .then(response => response.json())
      .then(userData => {
        const kycStatus = userData.kycStatus || 'PENDING';
        const phone = userData.phone || 'Not provided';
        const address = userData.address || 'Not provided';
        const dateOfBirth = userData.dateOfBirth ? new Date(userData.dateOfBirth).toLocaleDateString() : 'Not provided';
        
    document.getElementById('app').innerHTML = `
      ${renderNav()}
      <div class="app">
        <aside class="sidebar">
          <h2>Watchlist</h2>
          <ul class="watchlist"></ul>
        </aside>
        <main class="main-content">
          <h1>Profile</h1>
          <div class="card">
            <h2>User Profile</h2>
                <div class="profile-grid">
                  <div class="profile-section">
                    <h3>Basic Information</h3>
            <p><strong>Name:</strong> ${user.name}</p>
            <p><strong>Email:</strong> ${user.email}</p>
                    <p><strong>Phone:</strong> ${phone}</p>
                    <p><strong>Date of Birth:</strong> ${dateOfBirth}</p>
                  </div>
                  
                  <div class="profile-section">
                    <h3>Address</h3>
                    <p><strong>Address:</strong> ${address}</p>
                  </div>
                  
                  <div class="profile-section">
                    <h3>KYC Status</h3>
                    <div class="kyc-status ${kycStatus.toLowerCase()}">
                      
                      <span class="status-text">${kycStatus}</span>
                    </div>
                    <p class="kyc-description">
                      ${kycStatus === 'VERIFIED' ? 'Your account has been verified successfully.' : 
                        kycStatus === 'REJECTED' ? 'Your KYC verification was rejected. Please contact support.' : 
                        'Your KYC verification is pending. Please complete your profile.'}
                    </p>
                  </div>
                </div>
                
                <div class="profile-actions">
                  <button onclick="editProfile()" class="btn-blue">Edit Profile</button>
                  <button onclick="updateKYC()" class="btn-green">Update KYC</button>
                </div>
          </div>
        </main>
      </div>
    `;
    updateSidebar();
      })
      .catch(error => {
        console.error('Error loading user profile:', error);
        document.getElementById('app').innerHTML = `<p style="color: red;">Error loading profile: ${error.message}</p>`;
      });
  } catch (error) {
    console.error('Error in renderProfile:', error.message);
    document.getElementById('app').innerHTML = `<p style="color: red;">Error rendering profile: ${error.message}</p>`;
  }
}

// Edit profile function
window.editProfile = function() {
  const phone = prompt('Enter your phone number:');
  const address = prompt('Enter your address:');
  const dateOfBirth = prompt('Enter your date of birth (YYYY-MM-DD):');
  
  if (phone || address || dateOfBirth) {
    const updateData = {};
    if (phone) updateData.phone = phone;
    if (address) updateData.address = address;
    if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
    
    fetch(`/api/user/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData)
    })
    .then(response => response.json())
    .then(updatedUser => {
      user = { ...user, ...updatedUser };
      localStorage.setItem('user', JSON.stringify(user));
      renderProfile();
      alert('Profile updated successfully!');
    })
    .catch(error => {
      console.error('Error updating profile:', error);
      alert('Error updating profile. Please try again.');
    });
  }
};

// Update KYC function
window.updateKYC = function() {
  alert('KYC verification process will be implemented here. Please contact support for manual verification.');
};

// Settings
function renderSettings() {
  try {
    if (!user) {
      window.location.hash = '#signin';
      return;
    }
    document.getElementById('app').innerHTML = `
      ${renderNav()}
      <div class="app">
        <aside class="sidebar">
          <h2>Watchlist</h2>
          <ul class="watchlist"></ul>
        </aside>
        <main class="main-content">
          <h1>Settings</h1>
          <div class="card">
            <h2>Preferences</h2>
            <div class="settings-option">
              <label>
                Dark Mode
                <input type="checkbox" id="theme-toggle" ${settings.theme === 'dark' ? 'checked' : ''} aria-label="Toggle dark mode">
              </label>
            </div>
            <div class="settings-option">
              <label>
                Currency
                <select id="currency-select" aria-label="Select currency">
                  <option value="INR" ${settings.currency === 'INR' ? 'selected' : ''}>INR</option>
                </select>
              </label>
            </div>
            <div class="settings-option">
              <label>
                Enable Notifications
                <input type="checkbox" id="notifications-toggle" ${settings.notifications ? 'checked' : ''} aria-label="Toggle notifications">
              </label>
            </div>
          </div>
        </main>
      </div>
    `;
    updateSidebar();
    document.getElementById('theme-toggle').addEventListener('change', (e) => {
      settings.theme = e.target.checked ? 'dark' : 'light';
      localStorage.setItem('settings', JSON.stringify(settings));
      document.body.classList.toggle('dark-mode', settings.theme === 'dark');
    });
    document.getElementById('currency-select').addEventListener('change', (e) => {
      settings.currency = e.target.value;
      localStorage.setItem('settings', JSON.stringify(settings));
      // No longer needed as exchangeRate is removed
    });
    document.getElementById('notifications-toggle').addEventListener('change', (e) => {
      settings.notifications = e.target.checked;
      localStorage.setItem('settings', JSON.stringify(settings));
      if (settings.notifications && Notification.permission !== 'granted') {
        Notification.requestPermission();
      }
    });
  } catch (error) {
    console.error('Error in renderSettings:', error.message);
    document.getElementById('app').innerHTML = `<p style="color: red;">Error rendering settings: ${error.message}</p>`;
  }
}

// Routing
function handleRoute() {
  try {
    const hash = window.location.hash || '#';
    console.log('Handling route:', hash);
    if (hash === '#') renderHome();
    else if (hash === '#signup') renderSignup();
    else if (hash === '#signin') renderSignin();
    else if (hash === '#dashboard') renderDashboard();
    else if (hash === '#portfolio') renderPortfolio();
    else if (hash === '#orders') renderOrders();
    else if (hash === '#holdings') renderHoldings();
    else if (hash === '#funds') renderFunds();
    else if (hash === '#profile') renderProfile();
    else if (hash === '#settings') renderSettings();
    else if (hash.startsWith('#stock/')) {
      const symbol = hash.split('/')[2];
      renderStockDetails(symbol);
    } else {
      console.warn('Unknown route:', hash);
      document.getElementById('app').innerHTML = `<p style="color: red;">Page not found: ${hash}</p>`;
    }
  } catch (error) {
    console.error('Error in handleRoute:', error.message);
    const appDiv = document.getElementById('app');
    if (appDiv) {
      appDiv.innerHTML = `<p style="color: red;">Error handling route: ${error.message}. Check console for details.</p>`;
    }
  }
}

// Initialize the app after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('DOM fully loaded, initializing app...');
    
    // Load user from localStorage if available
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        user = JSON.parse(savedUser);
        console.log('User loaded from localStorage:', user);
        
        // Load user data from database
        await loadUserData();
      } catch (error) {
        console.error('Error loading user from localStorage:', error);
    localStorage.removeItem('user');
        user = null;
      }
    }
    
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
    setInterval(updateCharts, PRICE_UPDATE_INTERVAL);
  } catch (error) {
    console.error('Error during app initialization:', error.message);
    const appDiv = document.getElementById('app');
    if (appDiv) {
      appDiv.innerHTML = `<p style="color: red;">Error initializing app: ${error.message}. Check console for details.</p>`;
    } else {
      document.body.innerHTML = `<p style="color: red;">Error initializing app: ${error.message}. App div not found.</p>`;
    }
  }
});

