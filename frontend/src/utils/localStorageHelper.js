// LocalStorage keys
export const STATE_KEY = 'super_auction_state';
export const PLAYERS_KEY = 'super_auction_players';
export const TEAMS_KEY = 'super_auction_teams';
export const RULES_KEY = 'super_auction_rules';

// Preloaded default category rules (Base Prices & Roster Slots per Team)
export const DEFAULT_RULES = {
  basePrices: {
    A: 1000000, // ₹10,00,000 (10 Lakh)
    B: 500000,  // ₹5,00,000 (5 Lakh)
    C: 200000   // ₹2,00,000 (2 Lakh)
  },
  slots: {
    A: 2,
    B: 3,
    C: 5
  },
  minPlayers: 5,
  maxPlayers: 15
};

// Preloaded mock players with high-quality Dicebear seeds
export const DEFAULT_PLAYERS = [
  {
    id: 'mock-1',
    name: 'Virat Kohli',
    category: 'A',
    basePrice: 1000000,
    age: 37,
    status: 'Pending',
    finalPrice: 0,
    winningTeam: null,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ViratKohli'
  },
  {
    id: 'mock-2',
    name: 'Rohit Sharma',
    category: 'A',
    basePrice: 1000000,
    age: 39,
    status: 'Pending',
    finalPrice: 0,
    winningTeam: null,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=RohitSharma'
  },
  {
    id: 'mock-3',
    name: 'Jasprit Bumrah',
    category: 'A',
    basePrice: 1000000,
    age: 32,
    status: 'Pending',
    finalPrice: 0,
    winningTeam: null,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JaspritBumrah'
  },
  {
    id: 'mock-4',
    name: 'Ravindra Jadeja',
    category: 'B',
    basePrice: 500000,
    age: 37,
    status: 'Pending',
    finalPrice: 0,
    winningTeam: null,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=RavindraJadeja'
  },
  {
    id: 'mock-5',
    name: 'MS Dhoni',
    category: 'A',
    basePrice: 1000000,
    age: 44,
    status: 'Pending',
    finalPrice: 0,
    winningTeam: null,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MSDhoni'
  },
  {
    id: 'mock-6',
    name: 'Rinku Singh',
    category: 'C',
    basePrice: 200000,
    age: 28,
    status: 'Pending',
    finalPrice: 0,
    winningTeam: null,
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=RinkuSingh'
  }
];

export const DEFAULT_TEAMS = [
  { id: 'team-1', name: 'Chennai Champions', budget: 10000000, initialBudget: 10000000 },
  { id: 'team-2', name: 'Mumbai Mavericks', budget: 10000000, initialBudget: 10000000 },
  { id: 'team-3', name: 'Pune Panthers', budget: 10000000, initialBudget: 10000000 },
  { id: 'team-4', name: 'Bangalore Bulls', budget: 10000000, initialBudget: 10000000 },
  { id: 'team-5', name: 'Delhi Dynamos', budget: 10000000, initialBudget: 10000000 }
];

export const DEFAULT_AUCTION_STATE = {
  livePlayer: null,
  liveStatus: 'waiting',
  soldInfo: null,
  currentBid: 0,
  highestBidder: null,
  bidHistory: []
};

const hostname = typeof window !== 'undefined' && window.location.hostname ? window.location.hostname : 'localhost';
const API_URL = `http://${hostname}:5000/api`;

// Helper to extract roomId from active path in URL
const getRoomIdFromUrl = () => {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/^\/room\/([^/]+)/);
  return match ? match[1] : null;
};

// Get rules scoped to room
export const getRules = async () => {
  try {
    const roomId = getRoomIdFromUrl();
    if (!roomId) return DEFAULT_RULES;
    const res = await fetch(`${API_URL}/rules?roomId=${roomId}`);
    const data = await res.json();
    return data && !data.error ? data : DEFAULT_RULES;
  } catch (err) {
    console.error(err);
    return DEFAULT_RULES;
  }
};

// Get players scoped to room
export const getPlayers = async () => {
  try {
    const roomId = getRoomIdFromUrl();
    if (!roomId) return [];
    const res = await fetch(`${API_URL}/players?roomId=${roomId}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(err);
    return [];
  }
};

// Get teams scoped to room
export const getTeams = async () => {
  try {
    const roomId = getRoomIdFromUrl();
    if (!roomId) return [];
    const res = await fetch(`${API_URL}/teams?roomId=${roomId}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(err);
    return [];
  }
};


// Format currency in Indian Rupees format (INR)
export const formatRupees = (amount) => {
  if (amount === undefined || amount === null) return '₹0';
  
  const amountStr = Math.round(amount).toString();
  let lastThree = amountStr.substring(amountStr.length - 3);
  const otherNumbers = amountStr.substring(0, amountStr.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
  return '₹' + formatted;
};

// Parse a simple CSV string into objects
export const parseCSV = (csvText) => {
  const lines = csvText.split(/\r?\n/);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  
  const results = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    let values = [];
    let insideQuote = false;
    let currentValue = '';
    
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const char = line[charIdx];
      if (char === '"' || char === "'") {
        insideQuote = !insideQuote;
      } else if (char === ',' && !insideQuote) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    values.push(currentValue.trim());
    
    const player = {};
    headers.forEach((header, index) => {
      let rawVal = values[index] ? values[index].replace(/^["']|["']$/g, '') : '';
      player[header] = rawVal;
    });
    
    results.push(player);
  }
  
  return results;
};
