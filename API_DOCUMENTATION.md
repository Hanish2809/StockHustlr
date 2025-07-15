# Stock Trading API Documentation

## Authentication Endpoints

### Signup
- **POST** `/signup`
- Body: `{ "name": "string", "email": "string", "password": "string" }`

### Login
- **POST** `/login`
- Body: `{ "email": "string", "password": "string" }`
- Returns: `{ "message": "Login successful", "user": { "id": "userId", "name": "string", "email": "string" } }`

### User Profile
- **GET** `/api/user/:userId` - Get user profile
- **PATCH** `/api/user/:userId` - Update user profile
- Body: `{ "name": "string", "phone": "string", "address": "string", "dateOfBirth": "date" }`

## Orders API

### Get User Orders
- **GET** `/api/orders/:userId`
- Returns: Array of user's orders

### Create Order
- **POST** `/api/orders`
- Body: `{ "userId": "string", "stockSymbol": "string", "orderType": "BUY|SELL", "quantity": number, "price": number, "notes": "string" }`

### Update Order Status
- **PATCH** `/api/orders/:orderId`
- Body: `{ "status": "PENDING|COMPLETED|CANCELLED" }`

## Holdings API

### Get User Holdings
- **GET** `/api/holdings/:userId`
- Returns: Array of user's stock holdings

### Get Specific Holding
- **GET** `/api/holdings/:userId/:stockSymbol`
- Returns: Specific holding details

### Update Holding
- **PATCH** `/api/holdings/:userId/:stockSymbol`
- Body: `{ "quantity": number, "averageBuyPrice": number, "notes": "string" }`

### Delete Holding
- **DELETE** `/api/holdings/:userId/:stockSymbol`

## Watchlist API

### Get User Watchlist
- **GET** `/api/watchlist/:userId`
- Returns: Array of watchlist items

### Add to Watchlist
- **POST** `/api/watchlist`
- Body: `{ "userId": "string", "stockSymbol": "string", "stockName": "string", "notes": "string" }`

### Update Watchlist Item
- **PATCH** `/api/watchlist/:userId/:stockSymbol`
- Body: `{ "notes": "string" }`

### Remove from Watchlist
- **DELETE** `/api/watchlist/:userId/:stockSymbol`

### Check if Stock in Watchlist
- **GET** `/api/watchlist/:userId/:stockSymbol/check`
- Returns: `{ "inWatchlist": boolean }`

## Funds API

### Get Fund Transactions
- **GET** `/api/funds/:userId`
- Returns: Array of fund transactions

### Add Fund Transaction
- **POST** `/api/funds`
- Body: `{ "userId": "string", "transactionType": "DEPOSIT|WITHDRAWAL", "amount": number, "description": "string", "referenceId": "string" }`

### Update Transaction Status
- **PATCH** `/api/funds/:transactionId`
- Body: `{ "status": "PENDING|COMPLETED|FAILED" }`

### Get Current Balance
- **GET** `/api/funds/:userId/balance`
- Returns: `{ "balance": number }`

### Get Transaction Summary
- **GET** `/api/funds/:userId/summary`
- Returns: `{ "totalDeposits": number, "totalWithdrawals": number }`

## Portfolio API

### Get Portfolio
- **GET** `/api/portfolio/:userId`
- Returns: Portfolio summary

### Get Portfolio with Holdings
- **GET** `/api/portfolio/:userId/details`
- Returns: Portfolio with detailed holdings

### Update Portfolio
- **PATCH** `/api/portfolio/:userId`
- Body: `{ "totalValue": number, "totalInvested": number, "availableCash": number }`

### Get Portfolio Performance
- **GET** `/api/portfolio/:userId/performance?days=30`
- Returns: Performance history

### Get Portfolio Summary
- **GET** `/api/portfolio/:userId/summary`
- Returns: Portfolio statistics

## Database Models

### User
- `name`, `email`, `password`, `phone`, `address`, `dateOfBirth`, `kycStatus`, `accountStatus`, `createdAt`, `lastLogin`

### Order
- `userId`, `stockSymbol`, `orderType`, `quantity`, `price`, `totalAmount`, `status`, `orderDate`, `completedDate`, `notes`

### Holding
- `userId`, `stockSymbol`, `stockName`, `quantity`, `averageBuyPrice`, `totalInvested`, `currentValue`, `profitLoss`, `profitLossPercent`, `lastUpdated`

### Watchlist
- `userId`, `stockSymbol`, `stockName`, `addedDate`, `notes`

### Fund
- `userId`, `transactionType`, `amount`, `balance`, `description`, `transactionDate`, `status`, `referenceId`

### Portfolio
- `userId`, `totalValue`, `totalInvested`, `totalProfitLoss`, `totalProfitLossPercent`, `availableCash`, `numberOfHoldings`, `lastUpdated`

## Example Usage

### Creating a Buy Order
```javascript
fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    stockSymbol: 'AAPL',
    orderType: 'BUY',
    quantity: 10,
    price: 150.50,
    notes: 'Long term investment'
  })
});
```

### Adding Funds
```javascript
fetch('/api/funds', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    transactionType: 'DEPOSIT',
    amount: 1000,
    description: 'Initial deposit'
  })
});
```

### Getting Portfolio
```javascript
fetch('/api/portfolio/user123/details')
  .then(response => response.json())
  .then(data => console.log(data));
``` 