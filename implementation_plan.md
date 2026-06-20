# MongoDB & Socket.io Persistent Auction Server - Implementation Plan

Transition the **Super Player Auction** application from individual client-side `localStorage` to a fully persistent, secure, and robust **MongoDB** server-side database. 

This architecture implements standard database persistence, multi-client real-time synchronization via **Socket.io**, and REST API gateways, enabling multiple users (e.g., admin and multiple audience displays) to connect securely from different devices!

---

## User Review Required

> [!IMPORTANT]
> - **Dual Persistence (Hybrid vs Complete)**: We propose transitioning completely to server-side persistence using MongoDB, while keeping local storage only as an offline/error fallback. 
> - **Real-time Socket Broadcasting**: Mutations on the Admin Deck (such as bidding or hammering sold) will trigger immediate REST API updates to MongoDB, which will then broadcast socket.io events (e.g., `'auctionStateUpdated'`, `'playerSold'`) to all connected client screens instantly.
> - **Database Connection (Local/Cloud)**: The server will default to connecting to a local MongoDB instance (`mongodb://127.0.0.1:27017/auction_db`), but will allow custom URIs via a standard `.env` configuration file (e.g. MongoDB Atlas cloud cluster).

---

## Proposed Database Architecture

We will create four distinct collections inside MongoDB:

### 1. `Player` Collection Schema
```javascript
{
  name: { type: String, required: true },
  photo: { type: String, required: true },
  category: { type: String, required: true, enum: ['A', 'B', 'C'] },
  basePrice: { type: Number, required: true },
  age: { type: Number },
  status: { type: String, required: true, enum: ['Pending', 'Live', 'Sold', 'Unsold'], default: 'Pending' },
  finalPrice: { type: Number, default: 0 },
  winningTeam: { type: String, default: null } // Name of the franchise
}
```

### 2. `Team` Collection Schema
```javascript
{
  name: { type: String, required: true, unique: true },
  budget: { type: Number, required: true },
  initialBudget: { type: Number, required: true }
}
```

### 3. `Rule` Collection Schema
```javascript
{
  basePrices: {
    A: { type: Number, default: 20000000 },
    B: { type: Number, default: 15000000 },
    C: { type: Number, default: 10000000 }
  },
  slots: {
    A: { type: Number, default: 2 },
    B: { type: Number, default: 3 },
    C: { type: Number, default: 5 }
  }
}
```

### 4. `AuctionState` Collection Schema
```javascript
{
  livePlayer: { type: Object, default: null }, // Current active player document
  liveStatus: { type: String, enum: ['waiting', 'live', 'sold', 'unsold'], default: 'waiting' },
  soldInfo: {
    teamId: { type: String },
    teamName: { type: String },
    price: { type: Number }
  },
  currentBid: { type: Number, default: 0 },
  highestBidder: { type: String, default: null }
}
```

---

## Proposed Changes

### Backend Components

#### [MODIFY] [backend/package.json](file:///c:/Users/bajaj/OneDrive/Desktop/auction_app/backend/package.json)
- Ensure dependencies include `mongoose`, `express`, `cors`, `dotenv`, and `socket.io`.

#### [MODIFY] [backend/server.js](file:///c:/Users/bajaj/OneDrive/Desktop/auction_app/backend/server.js)
- Import `connectDB` from `backend/config/db.js` and initialize database connection on startup.
- Implement REST API routing for:
  - `/api/players` (GET roster list, POST import/bulk array, DELETE wipe)
  - `/api/teams` (GET lists, POST create new team, DELETE wipe/remove)
  - `/api/rules` (GET current rules, POST edit rules)
  - `/api/state` (GET active state, POST update live bidding/sold status)
- Integrate Socket.io server to listen to actions and broadcast real-time updates.

#### [NEW] [backend/routes/](file:///c:/Users/bajaj/OneDrive/Desktop/auction_app/backend/routes/)
Create dedicated modular routes to handle database queries cleanly:
- `playerRoutes.js` (fetch, create, CSV uploader parser integration)
- `teamRoutes.js` (franchise creation, cap limits)
- `rulesRoutes.js` (slots configuration, base prices updates)
- `auctionRoutes.js` (draft controller, sold/unsold transactional updates, live bidding sync)

#### [MODIFY] [backend/socket/auctionHandlers.js](file:///c:/Users/bajaj/OneDrive/Desktop/auction_app/backend/socket/auctionHandlers.js)
- Implement socket events to emit real-time updates to all connected displays whenever any admin auction changes occur.

---

### Frontend Components

#### [MODIFY] [frontend/src/utils/localStorageHelper.js](file:///c:/Users/bajaj/OneDrive/Desktop/auction_app/frontend/src/utils/localStorageHelper.js)
- Transition this helper into an **API client helper** (e.g. `apiHelper.js`):
  - Change `getPlayers()`, `getRules()`, `getTeams()` and state mutations into `async/await` Axios or standard `fetch` helper requests communicating with `/api/` endpoints.
  - Implement localStorage storage actions merely as high-speed local offline caches or failure redundancies.

#### [MODIFY] [frontend/src/pages/AdminPage.jsx](file:///c:/Users/bajaj/OneDrive/Desktop/auction_app/frontend/src/pages/AdminPage.jsx)
- Update component state hooks to load data asynchronously from `/api/` endpoints using `useEffect`.
- Adapt transactional handlers (`pushPlayerToLive`, `handleTeamTap`, `markAsSold`, `handleCSVUpload`) to perform server-side `POST` mutations and trigger socket broadcasts.

#### [MODIFY] [frontend/src/pages/AuctionPage.jsx](file:///c:/Users/bajaj/OneDrive/Desktop/auction_app/frontend/src/pages/AuctionPage.jsx)
- Establish an active Socket.io client connection to the backend server.
- Bind listener events (e.g. `socket.on('auctionStateChanged')`) to instantly update the live visual overlay, stopwatch timer, neon Golden Grade Category badges, and stadium confetti/fireworks celebration states without polling.

#### [MODIFY] [frontend/src/pages/SummaryPage.jsx](file:///c:/Users/bajaj/OneDrive/Desktop/auction_app/frontend/src/pages/SummaryPage.jsx)
- Load sold rosters and standings asynchronously from MongoDB. Update the CSV exporter to parse real-time server records.

---

## Verification Plan

### Database & Build Testing
1. **Database Connection Test**:
   - Start local MongoDB. Run the backend dev server (`npm run dev`) and confirm the console outputs: `MongoDB Connected: 127.0.0.1`.
2. **REST Endpoint Audit**:
   - Probe endpoints (`http://localhost:5000/api/players`) via Postman or browser queries to confirm JSON structures match Grade Categories and ages.

### Multi-Client Manual Verification Flow
1. **Two separate machines/devices**:
   - Open [http://localhost:5173/](http://localhost:5173/) on **Device 1 (Audience Screen)**.
   - Open [http://localhost:5173/manage](http://localhost:5173/manage) on **Device 2 (Admin Controller)**.
2. **Real-time Sync Verification**:
   - Tap Chennai Champions badge on Device 2.
   - Verify Device 1 **instantly updates** its current bid by +₹50,000 via Socket.io with zero browser refresh!
3. **Draft Guard & Validation Check**:
   - Draft Category A players until the MongoDB team rules slot limit is exceeded.
   - Confirm the server returns a REST validation error blocking the transaction, and the admin console fires the warning popup.
