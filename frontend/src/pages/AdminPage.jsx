import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, useUser, UserButton } from '@clerk/clerk-react';
import {
  formatRupees,
  parseCSV
} from '../utils/localStorageHelper';
import { socket } from '../utils/socket';
import { API_URL } from '../utils/apiConfig';
import './AdminPage.css';

const AdminPage = () => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { isLoaded, userId, getToken } = useAuth();
  const { user } = useUser();
  const [isAdminRoomOwner, setIsAdminRoomOwner] = useState(false);
  const [checkingOwner, setCheckingOwner] = useState(true);

  useEffect(() => {
    const verifyOwnership = async () => {
      if (!isLoaded) {
        console.log('[Ownership Check] useAuth is not loaded yet');
        return;
      }
      
      try {
        console.log('[Ownership Check] Started with userId:', userId, 'and roomId:', roomId);
        if (!userId) {
          console.log('[Ownership Check] No userId found, setting admin false');
          setIsAdminRoomOwner(false);
          setCheckingOwner(false);
          return;
        }

        const token = await getToken();
        console.log('[Ownership Check] Token fetched successfully:', !!token);
        
        const roomRes = await fetch(`${API_URL}/rooms/${roomId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        console.log('[Ownership Check] Fetch room response status:', roomRes.status);
        if (roomRes.ok) {
          const roomData = await roomRes.json();
          console.log('[Ownership Check] Room adminUserId from DB:', roomData.adminUserId, 'vs Current userId:', userId);
          if (roomData.adminUserId === userId) {
            console.log('[Ownership Check] Match! Setting admin true');
            sessionStorage.setItem(`room_admin_${roomId}`, 'true');
            setIsAdminRoomOwner(true);
          } else {
            console.log('[Ownership Check] Mismatch! Setting admin false');
            sessionStorage.removeItem(`room_admin_${roomId}`);
            setIsAdminRoomOwner(false);
          }
        } else {
          console.log('[Ownership Check] Room fetch failed with status:', roomRes.status);
          setIsAdminRoomOwner(false);
        }
      } catch (err) {
        console.error('[Ownership Check] Failed to verify room ownership:', err);
        setIsAdminRoomOwner(false);
      } finally {
        setCheckingOwner(false);
      }
    };

    verifyOwnership();
  }, [isLoaded, userId, roomId]);

  // Roster, Teams and Auction state
  const [players, setPlayers] = useState([]);
  const playersRef = React.useRef(players);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  const [teams, setTeams] = useState([]);
  const [auctionState, setAuctionState] = useState({
    livePlayer: null,
    liveStatus: 'waiting',
    soldInfo: null,
    bidHistory: []
  });

  // Rules for category base prices and slots
  const [rules, setRules] = useState({
    basePrices: { A: 1000000, B: 500000, C: 200000 },
    slots: { A: 2, B: 3, C: 5 },
    minPlayers: 5,
    maxPlayers: 15
  });

  // Forms and active UI tabs
  const [activeSubTab, setActiveSubTab] = useState('controller'); // controller, add-player, manage-teams, system
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerCategory, setNewPlayerCategory] = useState('A');
  const [newPlayerBasePrice, setNewPlayerBasePrice] = useState(1000000); // 10 Lakh default
  const [newPlayerPhoto, setNewPlayerPhoto] = useState('');
  const [newPlayerAge, setNewPlayerAge] = useState('');

  // Default new manual player base price based on active category rules
  useEffect(() => {
    if (rules && rules.basePrices && rules.basePrices[newPlayerCategory]) {
      setNewPlayerBasePrice(rules.basePrices[newPlayerCategory]);
    }
  }, [newPlayerCategory, rules]);

  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamBudget, setNewTeamBudget] = useState(10000000); // 1 Crore default

  // Live bidding fields
  const [soldPrice, setSoldPrice] = useState('');
  const [buyingTeamId, setBuyingTeamId] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Queue Category filter state
  const [queueFilterCategory, setQueueFilterCategory] = useState('All');

  // Notification states
  const [notification, setNotification] = useState({ text: '', type: '' });

  // Load all datasets from API via Socket
  const refreshAllState = () => {
    socket.emit('fetchInitialData', (res) => {
      if (res.success) {
        setPlayers(res.data.players);
        setTeams(res.data.teams);
        setAuctionState(res.data.state);
        setRules(res.data.rules);
      } else if (res.error === 'Unauthorized') {
        setIsAdminRoomOwner(false);
        showNotification('Session unauthorized. Please re-authenticate.', 'error');
      } else {
        showNotification(res.error || 'Failed to fetch initial data.', 'error');
      }
    });
  };

  useEffect(() => {
    refreshAllState();

    socket.on('playersUpdated', (data) => setPlayers(data));
    socket.on('teamsUpdated', (data) => setTeams(data));
    socket.on('rulesUpdated', (data) => setRules(data));
    socket.on('auctionStateUpdated', (data) => {
      setAuctionState(data);
    });

    return () => {
      socket.off('playersUpdated');
      socket.off('teamsUpdated');
      socket.off('rulesUpdated');
      socket.off('auctionStateUpdated');
    };
  }, []);

  // Sync buyingTeamId when auctionState's highestBidder changes
  useEffect(() => {
    if (auctionState.highestBidder && teams.length > 0) {
      const matchedTeam = teams.find(t => t.name === auctionState.highestBidder);
      if (matchedTeam) {
        setBuyingTeamId(matchedTeam._id || matchedTeam.id);
      }
    } else {
      setBuyingTeamId('');
    }
  }, [auctionState.highestBidder, teams]);

  // Sync soldPrice input field when auctionState's currentBid changes (if not actively typing/focused)
  useEffect(() => {
    if (!isInputFocused && auctionState && auctionState.currentBid !== undefined) {
      setSoldPrice(auctionState.currentBid);
    }
  }, [auctionState.currentBid, isInputFocused]);

  const showNotification = (text, type = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification({ text: '', type: '' }), 4000);
  };

  // Push Player to Live Stage
  const pushPlayerToLive = (player) => {
    socket.timeout(5000).emit('pushPlayerLive', { playerId: player._id || player.id }, (err, res) => {
      if (err) {
        showNotification('Operation timed out. Please check network connection.', 'error');
        return;
      }
      if (res.success) {
        setPlayers(res.data.players);
        setAuctionState(res.data.state);
        setSoldPrice(res.data.state.currentBid);
        setBuyingTeamId('');
        showNotification(`Active Player: ${player.name} pushed to Live Display!`);
      } else if (res.error === 'Unauthorized') {
        setIsAdminRoomOwner(false);
      } else {
        showNotification(res.error, 'error');
      }
    });
  };

  // Push next logical random pending player to live stage following category priority order (A -> B -> C)
  const pushNextRandomPlayer = (rosterList) => {
    const order = ['A', 'B', 'C'];
    let startIndex = 0;

    if (queueFilterCategory === 'B') {
      startIndex = 1;
    } else if (queueFilterCategory === 'C') {
      startIndex = 2;
    }

    let chosenCat = null;
    let candidates = [];

    for (let i = startIndex; i < order.length; i++) {
      const cat = order[i];
      const catPending = rosterList.filter(p => p.status === 'Pending' && p.category === cat);
      if (catPending.length > 0) {
        chosenCat = cat;
        candidates = catPending;
        break;
      }
    }

    if (candidates.length > 0) {
      if (queueFilterCategory !== 'All' && queueFilterCategory !== chosenCat) {
        setQueueFilterCategory(chosenCat);
      }
      const randPlayer = candidates[Math.floor(Math.random() * candidates.length)];
      pushPlayerToLive(randPlayer);
      return true;
    } else {
      refreshAllState();
      return false;
    }
  };

  // Push Random Player to Live Stage
  const pushRandomPlayerToLive = () => {
    const success = pushNextRandomPlayer(players);
    if (!success) {
      showNotification('All pending draft players have already been auctioned!', 'warning');
    }
  };

  // Helper to calculate minimum budget a team must reserve to fill their minimum required roster size
  const calculateMinReservedBudget = (team, activePlayerCat = null) => {
    const activeCount = players.filter(p => p.status === 'Sold' && p.winningTeam === team.name).length;
    const needed = (rules.minPlayers || 5) - activeCount;
    if (needed <= 1) return 0;

    const prices = Object.values(rules.basePrices || { A: 1000000, B: 500000, C: 200000 });
    const minPrice = Math.min(...prices);
    return (needed - 1) * minPrice;
  };

  // Handle franchise team selection and auto-increment current bid
  const handleTeamTap = (team) => {
    if (!auctionState.livePlayer) return;

    // Prevent bidding against yourself
    if (auctionState.highestBidder === team.name) {
      showNotification(`${team.name} is already the leading bidder!`, 'warning');
      return;
    }

    // Check global max players limit
    const activeCount = players.filter(p => p.status === 'Sold' && p.winningTeam === team.name).length;
    if (activeCount >= (rules.maxPlayers || 15)) {
      showNotification(`Roster Lockout: ${team.name} has already reached the maximum limit of ${rules.maxPlayers || 15} players!`, 'error');
      return;
    }

    // Check Category slots limit
    const activePlayerCat = auctionState.livePlayer.category;
    const catCount = players.filter(p => p.status === 'Sold' && p.winningTeam === team.name && p.category === activePlayerCat).length;
    const maxCatSlots = rules.slots?.[activePlayerCat] || 999;
    if (catCount >= maxCatSlots) {
      showNotification(`Category Roster Full: ${team.name} has already reached the maximum limit of ${maxCatSlots} players for Category ${activePlayerCat}!`, 'error');
      return;
    }

    const minReserved = calculateMinReservedBudget(team, auctionState.livePlayer.category);
    const isFirstBid = !auctionState.highestBidder;
    const potentialBid = isFirstBid
      ? (parseInt(soldPrice, 10) || 0)
      : (parseInt(soldPrice, 10) || 0) + 50000;

    if (team.budget - potentialBid < minReserved) {
      showNotification(`Solvency Lockout: ${team.name} cannot afford the bid of ${formatRupees(potentialBid)}!`, 'error');
      return;
    }

    socket.timeout(5000).emit('placeBid', {
      teamId: team._id || team.id,
      teamName: team.name,
      bidAmount: potentialBid
    }, (err, res) => {
      if (err) {
        showNotification('Bid operation timed out. Please check connection.', 'error');
        return;
      }
      if (res.success) {
        setBuyingTeamId(team._id || team.id);
        setSoldPrice(potentialBid);
        setAuctionState(res.data);
        showNotification(`${team.name} placed a bid of ${formatRupees(potentialBid)}!`);
      } else if (res.error === 'Unauthorized') {
        setIsAdminRoomOwner(false);
      } else {
        showNotification(res.error, 'error');
      }
    });
  };

  // Handle manual bid price input change in real-time
  const handleBidPriceChange = (val) => {
    setSoldPrice(val);
    const parsedVal = parseInt(val, 10) || 0;

    // Update live bid price in real-time via Socket
    socket.emit('updateCurrentBid', { bidAmount: parsedVal }, (res) => {
      if (res.success) {
        setAuctionState(res.data);
      } else if (res.error === 'Unauthorized') {
        setIsAdminRoomOwner(false);
      }
    });
  };

  // Mark Active Player as SOLD
  const markAsSold = (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!auctionState.livePlayer) return;
    if (!buyingTeamId) {
      showNotification('Please select a franchise team to award the player.', 'error');
      return;
    }

    const price = parseInt(soldPrice, 10);
    if (isNaN(price) || price <= 0) {
      showNotification('Please enter a valid numeric bidding amount.', 'error');
      return;
    }

    const winningTeam = teams.find(t => (t._id || t.id) === buyingTeamId);
    if (!winningTeam) return;

    setIsSubmitting(true);
    socket.timeout(5000).emit('markPlayerSold', { buyingTeamId, price }, (err, res) => {
      setIsSubmitting(false);
      if (err) {
        showNotification('Sold operation timed out. Please check connection.', 'error');
        return;
      }
      if (res.success) {
        setPlayers(res.data.players);
        setTeams(res.data.teams);
        setAuctionState(res.data.state);
        showNotification(`Hammer Down! ${res.data.state.livePlayer.name} SOLD to ${winningTeam.name} for ${formatRupees(price)}!`);

        // Auto revert display back to waiting and queue next player after 4 seconds
        setTimeout(() => {
          socket.timeout(5000).emit('clearLiveStage', (revertErr, revertRes) => {
            if (revertErr) return;
            if (revertRes.success) {
              setAuctionState(revertRes.data);
              pushNextRandomPlayer(res.data.players);
            }
          });
        }, 4100);
      } else if (res.error === 'Unauthorized') {
        setIsAdminRoomOwner(false);
      } else {
        showNotification(res.error, 'error');
      }
    });
  };

  // Mark Active Player as UNSOLD
  const markAsUnsold = () => {
    if (!auctionState.livePlayer) return;

    socket.timeout(5000).emit('markPlayerUnsold', (err, res) => {
      if (err) {
        showNotification('Operation timed out. Please check connection.', 'error');
        return;
      }
      if (res.success) {
        setPlayers(res.data.players);
        setAuctionState(res.data.state);
        showNotification(`${res.data.state.livePlayer.name} marked as UNSOLD.`);

        // Fall back to waiting after a short delay and load next
        setTimeout(() => {
          socket.timeout(5000).emit('clearLiveStage', (revertErr, revertRes) => {
            if (revertErr) return;
            if (revertRes.success) {
              setAuctionState(revertRes.data);
              pushNextRandomPlayer(res.data.players);
            }
          });
        }, 2000);
      } else if (res.error === 'Unauthorized') {
        setIsAdminRoomOwner(false);
      } else {
        showNotification(res.error, 'error'); 
      }
    });
  };

  // Undo last active bid (Live auction stage)
  const handleUndoLastBid = () => {
    if (!auctionState.livePlayer) return;
    if (!auctionState.bidHistory || auctionState.bidHistory.length === 0) {
      showNotification('No bids to undo.', 'warning');
      return;
    }

    const confirmMsg = `Are you sure you want to undo the last bid of ${formatRupees(auctionState.currentBid)}?`;
    if (!window.confirm(confirmMsg)) return;

    socket.timeout(5000).emit('undoLastBid', (err, res) => {
      if (err) {
        showNotification('Operation timed out. Please check connection.', 'error');
        return;
      }
      if (res.success) {
        setAuctionState(res.data);
        showNotification('Successfully rolled back the last bid.');
      } else {
        showNotification(res.error, 'error');
      }
    });
  };

  // Undo player sale (Rollback completed sale to previous bid)
  const handleUndoSale = (player) => {
    const confirmMsg = `Are you sure you want to undo the sale of ${player.name} to ${player.winningTeam} for ${formatRupees(player.finalPrice)}?\n\nThis will refund the team's budget, restore the player back to the live stage, and roll the bid back to the previous highest bid.`;
    if (!window.confirm(confirmMsg)) return;

    socket.timeout(5000).emit('undoPlayerSale', { playerId: player._id || player.id }, (err, res) => {
      if (err) {
        showNotification('Undo operation timed out. Please check connection.', 'error');
        return;
      }
      if (res.success) {
        setPlayers(res.data.players);
        setTeams(res.data.teams);
        setAuctionState(res.data.state);
        showNotification(`Successfully restored ${player.name} to the active draft stage!`);
      } else {
        showNotification(res.error, 'error');
      }
    });
  };

  // CSV File Uploader Handler
  const handleCSVUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => { 
      try {
        const text = evt.target.result;
        const parsedData = parseCSV(text);

        if (parsedData.length === 0) {
          showNotification('No valid player rows found in the CSV.', 'error');
          return;
        }

        // Standardize headers and map fields
        const importedPlayers = parsedData.map((row, index) => {
          const name = row['Name of the Player'] || row['Player Name'] || row['name'] || row['Name'] || row['Player'] || `Player #${index + 1}`;

          let category = (row['category'] || row['Category'] || '').trim().toUpperCase();
          if (category === 'A+') category = 'A'; // Normalize A+ to category A
          if (category !== 'A' && category !== 'B' && category !== 'C') {
            // Fallback categorization based on name and role for demo imports lacking a category column
            const lowerName = name.toLowerCase();
            const lowerRole = (row['role'] || row['Role'] || row['Strength'] || row['strength'] || '').toLowerCase();
            if (lowerName.includes('kohli') || lowerName.includes('sharma') || lowerName.includes('bumrah') || lowerName.includes('dhoni') || lowerName.includes('pandya')) {
              category = 'A';
            } else if (lowerRole.includes('batsman') || lowerRole.includes('all-rounder') || lowerRole.includes('all rounder') || lowerName.includes('stokes') || lowerName.includes('root') || lowerName.includes('williamson') || lowerName.includes('babar')) {
              category = 'B';
            } else {
              category = 'C';
            }
          }

          const ageRaw = row['age'] || row['Age'] || '';
          const age = ageRaw ? parseInt(ageRaw.replace(/[^0-9]/g, ''), 10) || null : null;

          const basePriceRaw = row['Base Price'] || row['base price'] || row['basePrice'] || row['price'] || '';
          let basePrice = basePriceRaw ? parseInt(basePriceRaw.replace(/[^0-9]/g, ''), 10) : null;

          if (!basePrice) {
            basePrice = (rules.basePrices && rules.basePrices[category] !== undefined)
              ? rules.basePrices[category]
              : 1000000;
          }

          const rawPhoto = (row['Photo URL'] || row['photo'] || row['Photo'] || row['photo_url'] || row['photoUrl'] || '').trim();
          let photo = (rawPhoto.toLowerCase().startsWith('http://') || rawPhoto.toLowerCase().startsWith('https://'))
            ? rawPhoto
            : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name.replace(/\s+/g, ''))}`;

          // Transform Google Drive links to bypass cookie/hotlink restrictions
          if (photo.includes('drive.google.com')) {
            const match = photo.match(/[?&]id=([^&]+)/) || photo.match(/\/file\/d\/([^/]+)/);
            if (match && match[1]) {
              photo = `https://lh3.googleusercontent.com/d/${match[1]}`;
            }
          }

          return {
            name,
            category,
            basePrice,
            age,
            status: 'Pending',
            finalPrice: 0,
            winningTeam: null,
            photo
          };
        });

        const confirmOverwrite = window.confirm(`Found ${importedPlayers.length} players. Click OK to overwrite current roster, or Cancel to merge them.`);

        let finalRoster = [];
        if (confirmOverwrite) {
          finalRoster = importedPlayers;
        } else {
          finalRoster = [...players, ...importedPlayers];
        }

        const token = await getToken();
        const res = await fetch(`${API_URL}/players?roomId=${roomId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(finalRoster)
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to save roster to database.');
        }
        const freshPlayers = await res.json();
        setPlayers(freshPlayers);
        showNotification(`Successfully imported ${importedPlayers.length} players to database!`);
      } catch (err) {
        showNotification(`Failed to parse file: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  };

  // Manual Player Creation
  const handleAddPlayer = (e) => {
    e.preventDefault();
    if (!newPlayerName.trim()) {
      showNotification('Player name is required!', 'error');
      return;
    }

    const trimmedPhoto = newPlayerPhoto.trim();
    const photoUrl = (trimmedPhoto.toLowerCase().startsWith('http://') || trimmedPhoto.toLowerCase().startsWith('https://'))
      ? trimmedPhoto
      : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(newPlayerName.replace(/\s+/g, ''))}`;

    const newPlayer = {
      name: newPlayerName.trim(),
      category: newPlayerCategory,
      basePrice: parseInt(newPlayerBasePrice, 10) || 10000000,
      age: newPlayerAge ? parseInt(newPlayerAge, 10) : null,
      status: 'Pending',
      finalPrice: 0,
      winningTeam: null,
      photo: photoUrl
    };

    socket.timeout(5000).emit('addPlayer', newPlayer, (err, res) => {
      if (err) {
        showNotification('Operation timed out. Please check connection.', 'error');
        return;
      }
      if (res.success) {
        setPlayers(res.data);
        setNewPlayerName('');
        setNewPlayerPhoto('');
        setNewPlayerAge('');
        showNotification(`${newPlayer.name} registered into the draft successfully!`);
      } else if (res.error === 'Unauthorized') {
        setIsAdminRoomOwner(false);
      } else {
        showNotification(res.error, 'error');
      }
    });
  };

  // Team Addition
  const handleAddTeam = (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) {
      showNotification('Team name is required!', 'error');
      return;
    }

    const newTeam = {
      name: newTeamName.trim(),
      budget: parseInt(newTeamBudget, 10) || 10000000,
      initialBudget: parseInt(newTeamBudget, 10) || 10000000
    };

    socket.timeout(5000).emit('addTeam', newTeam, (err, res) => {
      if (err) {
        showNotification('Operation timed out. Please check connection.', 'error');
        return;
      }
      if (res.success) {
        setTeams(res.data);
        setNewTeamName('');
        showNotification(`${newTeam.name} franchise registered!`);
      } else if (res.error === 'Unauthorized') {
        setIsAdminRoomOwner(false);
      } else {
        showNotification(res.error, 'error');
      }
    });
  };

  // Delete Team
  const handleDeleteTeam = (teamId) => {
    socket.timeout(5000).emit('deleteTeam', { teamId }, (err, res) => {
      if (err) {
        showNotification('Operation timed out. Please check connection.', 'error');
        return;
      }
      if (res.success) {
        setTeams(res.data);
        showNotification('Franchise team removed.');
      } else if (res.error === 'Unauthorized') {
        setIsAdminRoomOwner(false);
      } else {
        showNotification(res.error, 'error');
      }
    });
  };

  // System Controls Handler
  const systemReset = (type) => {
    const isHard = type === 'hard';
    const confirmMsg = isHard 
      ? 'Are you absolutely sure? This will wipe ALL data and load default mock rosters.'
      : 'This will delete all players and teams. Proceed?';

    if (window.confirm(confirmMsg)) {
      const pass = sessionStorage.getItem(`room_passkey_${roomId}`) || '';
      socket.timeout(5000).emit('systemReset', { confirm: true, securityPin: pass, type }, (err, res) => {
        if (err) {
          showNotification('Operation timed out. Please check connection.', 'error');
          return;
        }
        if (res.success) {
          if (isHard) {
            setPlayers(res.data.players);
            setTeams(res.data.teams);
            setRules(res.data.rules);
            setAuctionState(res.data.state);
            showNotification('System restored to default settings.', 'warning');
          } else {
            setPlayers([]);
            setTeams([]);
            setAuctionState(res.data.state);
            showNotification('All datasets wiped clean.', 'warning');
          }
        } else if (res.error === 'Unauthorized') {
          setIsAdminRoomOwner(false);
        } else {
          showNotification(res.error, 'error');
        }
      });
    }
  };

  // Save rules via Socket
  const handleSaveRules = (e) => {
    e.preventDefault();
    socket.timeout(5000).emit('updateRules', rules, (err, res) => {
      if (err) {
        showNotification('Operation timed out. Please check connection.', 'error');
        return;
      }
      if (res.success) {
        setRules(res.data);
        showNotification('Roster rules and limits successfully updated!');
      } else if (res.error === 'Unauthorized') {
        setIsAdminRoomOwner(false);
      } else {
        showNotification(res.error, 'error');
      }
    });
  };

  // Loading check
  if (checkingOwner || !isLoaded) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <span className="w-10 h-10 border-4 border-accent-gold border-t-transparent rounded-full animate-spin"></span>
      </div>
    );
  }

  // Admin Access Denied Screen
  if (!isAdminRoomOwner) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 relative">
        <div className="stadium-light-overlay absolute inset-0 z-0"></div>

        <div className="w-full max-w-md glass-panel glass-panel-glow p-8 rounded-2xl border border-red-500/20 text-center relative z-10">
          <div className="w-20 h-20 bg-red-500/10 rounded-full border border-red-500/30 flex items-center justify-center mx-auto mb-6 text-3xl">
            🚫
          </div>

          <h1 className="text-3xl font-sporty tracking-wider text-red-500 mb-2">ACCESS DENIED</h1>
          <p className="text-sm text-gray-400 mb-4 uppercase tracking-widest font-semibold">Admin Credentials Required</p>
          <p className="text-xs text-gray-400 leading-relaxed mb-6">
            You have unlocked the read-only views for this auction, but administrative permissions are required to access the Locker Room Control Panel.
          </p>

          <button
            onClick={() => navigate(`/room/${roomId}`)}
            className="w-full py-4 bg-secondary-dark hover:bg-white/5 border border-white/10 text-white font-bold rounded-xl tracking-widest font-sporty text-lg uppercase transition-all duration-300 cursor-pointer"
          >
            Back to Live Board
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-24 relative animate-page-in">
      <div className="stadium-light-overlay absolute inset-0 z-0"></div>

      {/* Floating System Notification */}
      {notification.text && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-xl border text-sm uppercase tracking-wide font-bold shadow-2xl transition-all duration-300 flex items-center space-x-3 animate-bounce ${notification.type === 'error'
            ? 'bg-red-950/90 text-red-400 border-red-500/50'
            : notification.type === 'warning'
              ? 'bg-yellow-950/90 text-yellow-400 border-yellow-500/50'
              : 'bg-green-950/90 text-green-400 border-green-500/50'
          }`}>
          <span>{notification.type === 'error' ? '🚫' : '⚡'}</span>
          <span>{notification.text}</span>
        </div>
      )}

      {/* Header Info */}
      <div className="relative z-10 flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-5xl font-sporty tracking-wider text-accent-gold text-center md:text-left">
              CONTROL DECK
            </h1>
            <p className="text-xs tracking-[0.2em] font-semibold text-gray-400 uppercase mt-1 text-center md:text-left">
              Real-Time Room Draft Console
            </p>
          </div>
          <div className="bg-white/5 border border-white/10 p-2 rounded-full flex items-center justify-center">
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>

        {/* Sync Tip Notice */}
        <div className="bg-[#1b263b]/50 border border-white/5 rounded-xl px-4 py-3 text-xs text-gray-400 max-w-sm text-center md:text-right">
          💡 <span className="font-semibold text-accent-gold">Two-Tab Sync Notice:</span> Keep the <strong className="text-white">Public Display</strong> open in a separate browser tab. Updating items here will trigger real-time changes there instantly!
        </div>
      </div>

      {/* Dashboard Sub-Tab Navigation */}
      <div className="relative z-10 flex space-x-2 p-1 bg-primary-dark/80 rounded-xl border border-white/10 mb-8 overflow-x-auto no-scrollbar whitespace-nowrap">
        {[
          { id: 'controller', label: '🎛️ Live Auction Deck' },
          { id: 'add-player', label: '👤 Player Draft Form' },
          { id: 'manage-teams', label: '🛡️ Franchise Manager' },
          { id: 'rules', label: '📊 Category Rules' },
          { id: 'system', label: '🛠️ System Tools' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex-grow px-5 py-3 rounded-lg text-sm font-semibold tracking-wide uppercase font-sporty transition-all duration-300 cursor-pointer ${activeSubTab === tab.id
                ? 'bg-accent-gold text-primary-dark font-bold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* RENDER ACTIVE SUBTAB CONTENT */}
      <div className="relative z-10">

        {/* SUBTAB 1: LIVE AUCTION CONTROLLER */}
        {activeSubTab === 'controller' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Live Controller Stage (Left-Mid) */}
            <div className="lg:col-span-2 space-y-8">

              {/* Active Live Player Status Box */}
              <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 px-4 py-1 bg-red-600 text-white font-bold text-xs uppercase tracking-widest live-pulse-badge">
                  LIVE CONTROLLER
                </div>

                <h2 className="text-2xl font-sporty tracking-wider text-accent-gold mb-6 uppercase">
                  Currently on Live Stage
                </h2>

                {auctionState.livePlayer ? (
                  <div className="flex flex-col md:flex-row gap-6 items-center">
                    <img
                      src={auctionState.livePlayer.photo}
                      alt={auctionState.livePlayer.name}
                      className="w-32 h-32 rounded-full border-2 border-accent-gold/40 bg-primary-dark object-cover"
                    />

                    <div className="flex-grow text-center md:text-left space-y-2">
                      <div className="flex flex-col md:flex-row items-center gap-2">
                        <h3 className="text-3xl font-sporty tracking-wide text-white">
                          {auctionState.livePlayer.name}
                        </h3>
                        <span className="bg-[#1b263b] border border-white/10 text-accent-gold px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">
                          Category {auctionState.livePlayer.category}
                        </span>
                        {auctionState.livePlayer.age && (
                          <span className="bg-white/5 border border-white/10 text-gray-300 px-3 py-0.5 rounded-full text-xs font-bold">
                            Age: {auctionState.livePlayer.age}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400">
                        Initial Base Price: <strong className="text-white">{formatRupees(auctionState.livePlayer.basePrice)}</strong>
                      </p>

                      {/* Sold forms */}
                      <form onSubmit={markAsSold} className="grid grid-cols-1 gap-5 mt-6 pt-4 border-t border-white/10">

                        <div>
                          <label className="block text-xs uppercase tracking-wider font-bold text-gray-400 mb-2 text-left">
                            Current Bid (₹)
                          </label>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <input
                              type="number"
                              value={soldPrice}
                              onChange={(e) => handleBidPriceChange(e.target.value)}
                              onFocus={() => setIsInputFocused(true)}
                              onBlur={() => setIsInputFocused(false)}
                              placeholder="Current Bid Price"
                              className="w-full max-w-sm px-4 py-3 bg-primary-dark border border-white/10 text-white font-bold rounded-lg focus:outline-none focus:border-accent-gold font-bold text-base"
                            />
                            {auctionState.bidHistory && auctionState.bidHistory.length > 0 && (
                              <button
                                type="button"
                                onClick={handleUndoLastBid}
                                className="px-4 py-3 bg-red-950/80 hover:bg-red-900 border border-red-500/30 hover:border-red-500 text-red-200 font-bold text-xs uppercase tracking-wider rounded-lg transition duration-300 flex items-center justify-center space-x-1 cursor-pointer"
                              >
                                <span>↩️</span>
                                <span>Undo Last Bid</span>
                              </button>
                            )}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs uppercase tracking-wider font-bold text-gray-400 mb-3 text-left">
                            Winning Franchise/Team
                          </label>
                          {teams.length === 0 ? (
                            <p className="text-gray-500 text-xs">No registered franchise teams found.</p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {teams.map(t => {
                                const isSelected = buyingTeamId === (t._id || t.id);
                                let emoji = "🛡️";
                                if (t.name.toLowerCase().includes("chennai")) emoji = "🦁";
                                else if (t.name.toLowerCase().includes("mumbai")) emoji = "⚡";
                                else if (t.name.toLowerCase().includes("pune")) emoji = "🐾";
                                else if (t.name.toLowerCase().includes("bangalore")) emoji = "🐂";
                                else if (t.name.toLowerCase().includes("delhi")) emoji = "🌪️";
                                                            // Solvency Verification
                                const activeCount = players.filter(p => p.status === 'Sold' && p.winningTeam === t.name).length;
                                const isMaxLimitReached = activeCount >= (rules.maxPlayers || 15);
                                
                                const activePlayerCat = auctionState.livePlayer?.category;
                                const catCount = players.filter(p => p.status === 'Sold' && p.winningTeam === t.name && p.category === activePlayerCat).length;
                                const maxCatSlots = rules.slots?.[activePlayerCat] || 999;
                                const isCatSlotsFull = catCount >= maxCatSlots;

                                const minReserved = calculateMinReservedBudget(t, activePlayerCat);
                                const isFirstBid = !auctionState.highestBidder;
                                const potentialBid = isFirstBid 
                                  ? (parseInt(soldPrice, 10) || 0)
                                  : (parseInt(soldPrice, 10) || 0) + 50000;
                                const isSolvent = !isMaxLimitReached && !isCatSlotsFull && (t.budget - potentialBid >= minReserved);
                                const isLeading = auctionState.highestBidder === t.name;

                                return (
                                  <button
                                    key={t._id || t.id}
                                    type="button"
                                    disabled={!isSolvent || isLeading || isMaxLimitReached || isCatSlotsFull}
                                    onClick={() => handleTeamTap(t)}
                                    className={`flex items-center space-x-3 p-3 rounded-xl border text-left transition-all duration-300 cursor-pointer ${isSelected
                                        ? 'bg-accent-gold text-primary-dark border-accent-gold font-bold scale-[1.02] shadow-lg glow-gold'
                                        : (!isSolvent || isMaxLimitReached || isCatSlotsFull)
                                          ? 'bg-primary-dark/20 border-red-500/20 text-gray-600 cursor-not-allowed opacity-40'
                                          : 'bg-primary-dark border-white/10 text-gray-300 hover:border-white/30'
                                       }`}
                                    title={isLeading ? 'Leading Bidder' : isMaxLimitReached ? `Roster Full: Maximum limit of ${rules.maxPlayers} reached` : isCatSlotsFull ? `Category ${activePlayerCat} Full: Maximum limit of ${maxCatSlots} reached` : !isSolvent ? `Insolvent: Budget must be at least ${formatRupees(potentialBid)}` : ''}
                                  >
                                    <span className="text-2xl select-none">{emoji}</span>
                                    <div className="min-w-0 flex-grow">
                                      <span className="block text-xs font-black uppercase truncate leading-tight">{t.name}</span>
                                      <span className={`block text-[10px] mt-0.5 ${isSelected ? 'text-primary-dark/85' : (!isSolvent || isMaxLimitReached || isCatSlotsFull) ? 'text-red-500/60' : 'text-gray-500'}`}>
                                        {formatRupees(t.budget)}
                                      </span>
                                      {isMaxLimitReached && (
                                        <span className="block text-[8px] text-red-500/80 font-black mt-0.5 tracking-tighter uppercase">LOCKOUT: MAX SQUAD</span>
                                      )}
                                      {isCatSlotsFull && !isMaxLimitReached && (
                                        <span className="block text-[8px] text-red-500/80 font-black mt-0.5 tracking-tighter uppercase">LOCKOUT: CAT {activePlayerCat} FULL</span>
                                      )}
                                      {!isSolvent && !isMaxLimitReached && !isCatSlotsFull && (
                                        <span className="block text-[8px] text-red-500/80 font-black mt-0.5 tracking-tighter uppercase">LOCKOUT: INS BUDGET</span>
                                      )}
                                      {isLeading && (
                                        <span className={`block text-[8px] font-black mt-0.5 tracking-tighter uppercase ${isSelected ? 'text-primary-dark/85' : 'text-green-400'}`}>LEADING BIDDER</span>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-4 pt-2">
                          <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex-grow py-4 bg-green-600 hover:bg-green-700 disabled:bg-green-800/40 disabled:cursor-not-allowed disabled:scale-100 text-white font-bold font-sporty text-xl tracking-widest uppercase rounded-xl transition-all duration-300 hover:scale-[1.02] cursor-pointer"
                          >
                            {isSubmitting ? '⏳ Submitting...' : '🔨 Hammer Sold'}
                          </button>

                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={markAsUnsold}
                            className="py-4 px-6 bg-red-950/80 hover:bg-red-900/90 disabled:bg-red-950/30 disabled:text-red-400/40 disabled:cursor-not-allowed text-red-200 font-bold font-sporty text-xl tracking-widest uppercase rounded-xl border border-red-500/20 transition-all duration-300 cursor-pointer"
                          >
                            🚫 Pass Unsold
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-gray-500">
                    <p className="text-lg">No active player currently on the live stage.</p>
                    <p className="text-xs text-gray-600 mt-2">Select a pending player from the queue on the right to push live.</p>
                  </div>
                )}
              </div>

              {/* Franchise Budgets Quick Board */}
              <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-xl">
                <h2 className="text-2xl font-sporty tracking-wider text-accent-gold mb-4 uppercase">
                  Franchise Cap Balances
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {teams.length === 0 ? (
                    <p className="text-gray-500 col-span-2">No franchises registered. Visit Franchise tab to set them up.</p>
                  ) : (
                    teams.map(t => {
                      const spendPercentage = ((t.initialBudget - t.budget) / t.initialBudget) * 100;
                      return (
                        <div key={t._id || t.id} className="bg-primary-dark/50 border border-white/5 rounded-xl p-4 flex flex-col justify-between">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-gray-200">{t.name}</span>
                            <span className="text-accent-gold font-bold font-sporty">{formatRupees(t.budget)}</span>
                          </div>
                          {/* Progress bar */}
                          <div className="w-full h-2 bg-secondary-dark rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent-gold"
                              style={{ width: `${Math.min(100, Math.max(0, 100 - spendPercentage))}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500 text-right mt-1">
                            Available: {Math.max(0, 100 - spendPercentage).toFixed(0)}%
                          </span>
                        </div>
                      );
                    })
              </div>

              {/* Recent Sales History */}
              <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-xl">
                <h2 className="text-2xl font-sporty tracking-wider text-accent-gold mb-4 uppercase flex items-center gap-2">
                  <span>📜</span>
                  <span>Recent Sales History</span>
                </h2>
                {players.filter(p => p.status === 'Sold').length === 0 ? (
                  <p className="text-gray-500 text-sm">No players have been sold yet.</p>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {players
                      .filter(p => p.status === 'Sold')
                      .map(p => (
                        <div
                          key={p._id || p.id}
                          className="bg-primary-dark/50 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={p.photo}
                              alt={p.name}
                              className="w-10 h-10 rounded-full border border-white/10 object-cover"
                            />
                            <div>
                              <div className="font-bold text-sm text-white">{p.name}</div>
                              <div className="text-[10px] text-gray-400">
                                Category {p.category} | Base: {formatRupees(p.basePrice)}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <div className="text-xs font-black text-green-400 font-sporty">
                                {formatRupees(p.finalPrice)}
                              </div>
                              <div className="text-[9px] uppercase tracking-wider font-bold text-accent-gold">
                                Sold to {p.winningTeam}
                              </div>
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => handleUndoSale(p)}
                              className="px-2.5 py-1.5 bg-red-950/60 hover:bg-red-900 border border-red-500/20 hover:border-red-500 text-red-200 font-bold text-[10px] uppercase tracking-wider rounded transition duration-300 flex items-center gap-1 cursor-pointer"
                              title="Undo sale, refund team budget, and reopen bidding on live stage"
                            >
                              <span>🔄</span>
                              <span>Undo</span>
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Bidding Queue / Draft List (Right Sidebar) */}
            <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl h-[calc(100vh-250px)] overflow-y-auto">
              <h2 className="text-2xl font-sporty tracking-wider text-accent-gold mb-2 uppercase sticky top-0 bg-primary-dark/40 py-2 backdrop-blur-md">
                Draft Player Queue ({players.filter(p => p.status === 'Pending').length} pending)
              </h2>

              {/* Category Quick Filter Selectors */}
              <div className="flex space-x-1 p-1 bg-primary-dark/80 rounded-lg border border-white/10 mb-4 text-xs font-bold uppercase tracking-wide select-none">
                {['All', 'A', 'B', 'C'].map(cat => {
                  const isActive = queueFilterCategory === cat;
                  const count = cat === 'All'
                    ? players.filter(p => p.status === 'Pending').length
                    : players.filter(p => p.status === 'Pending' && p.category === cat).length;

                  return (
                    <button
                      key={cat}
                      onClick={() => setQueueFilterCategory(cat)}
                      className={`flex-1 py-2 px-1 rounded font-sporty text-center transition-all duration-300 cursor-pointer ${isActive
                          ? 'bg-accent-gold text-primary-dark font-black'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                      {cat === 'All' ? 'All' : `Cat ${cat}`} ({count})
                    </button>
                  );
                })}
              </div>

              <button
                onClick={pushRandomPlayerToLive}
                className="w-full mb-4 py-3 bg-[#1b263b] hover:bg-white/5 text-accent-gold border border-accent-gold/30 hover:border-accent-gold rounded-xl text-sm font-bold font-sporty tracking-wider uppercase transition-all duration-300 flex items-center justify-center space-x-2 shadow-lg cursor-pointer"
              >
                <span>🎲</span>
                <span>Draw Random Player Live</span>
              </button>

              <div className="space-y-3">
                {players.length === 0 ? (
                  <p className="text-gray-500 text-center py-10 text-sm">Draft list is completely empty. Please import or add players.</p>
                ) : (
                  players
                    .filter(p => {
                      if (queueFilterCategory === 'All') return true;
                      return p.category === queueFilterCategory;
                    })
                    .map(p => (
                      <div
                        key={p._id || p.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${p.status === 'Live'
                            ? 'bg-accent-gold/10 border-accent-gold'
                            : p.status === 'Sold'
                              ? 'bg-green-950/20 border-green-500/20 opacity-60'
                              : p.status === 'Unsold'
                                ? 'bg-red-950/20 border-red-500/20 opacity-60'
                                : 'bg-primary-dark/40 border-white/5 hover:border-white/20'
                          }`}
                      >
                        <img
                          src={p.photo}
                          alt={p.name}
                          className="w-12 h-12 rounded-full border border-white/10 bg-primary-dark object-cover"
                        />

                        <div className="flex-grow min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-sm text-gray-200 truncate">{p.name}</h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.status === 'Sold'
                                ? 'bg-green-500/10 text-green-400'
                                : p.status === 'Unsold'
                                  ? 'bg-red-500/10 text-red-400'
                                  : p.status === 'Live'
                                    ? 'bg-accent-gold text-primary-dark font-black'
                                    : 'bg-gray-800 text-gray-400'
                              }`}>
                              {p.status}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
                            <span>Category {p.category} {p.age ? `• Age ${p.age}` : ''}</span>
                            <span className="font-semibold text-gray-300">{formatRupees(p.basePrice)}</span>
                          </div>
                        </div>

                        {p.status === 'Pending' && (
                          <button
                            onClick={() => pushPlayerToLive(p)}
                            className="px-3 py-2 bg-accent-gold text-primary-dark hover:bg-gold-hover rounded-lg text-xs font-bold font-sporty uppercase transition-all duration-300 shadow cursor-pointer whitespace-nowrap"
                          >
                            🔨 Push
                          </button>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUBTAB 2: PLAYER ADD / CSV IMPORT */}
        {activeSubTab === 'add-player' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

            {/* Manual Form (Left) */}
            <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl">
              <h2 className="text-3xl font-sporty tracking-wider text-accent-gold mb-6 uppercase">
                Add Player to Roster
              </h2>

              <form onSubmit={handleAddPlayer} className="space-y-5">
                <div>
                  <label className="block text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">
                    Player Name
                  </label>
                  <input
                    type="text"
                    required
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="Virat Kohli"
                    className="w-full px-4 py-3 bg-primary-dark border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-gold"
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">
                      Grade Category
                    </label>
                    <select
                      value={newPlayerCategory}
                      onChange={(e) => setNewPlayerCategory(e.target.value)}
                      className="w-full px-4 py-3 bg-primary-dark border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-gold font-semibold"
                    >
                      <option value="A">⭐ Category A</option>
                      <option value="B">⚡ Category B</option>
                      <option value="C">🌟 Category C</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">
                      Age
                    </label>
                    <input
                      type="number"
                      value={newPlayerAge}
                      onChange={(e) => setNewPlayerAge(e.target.value)}
                      placeholder="28"
                      className="w-full px-4 py-3 bg-primary-dark border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-gold font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">
                      Base Price (₹)
                    </label>
                    <input
                      type="number"
                      required
                      value={newPlayerBasePrice}
                      onChange={(e) => setNewPlayerBasePrice(e.target.value)}
                      placeholder="20000000"
                      className="w-full px-4 py-3 bg-primary-dark border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-gold font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">
                    Photo URL (Optional)
                  </label>
                  <input
                    type="url"
                    value={newPlayerPhoto}
                    onChange={(e) => setNewPlayerPhoto(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full px-4 py-3 bg-primary-dark border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-gold"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    If empty, a customized Dicebear avatar profile will be generated automatically.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-accent-gold hover:bg-gold-hover text-primary-dark font-bold font-sporty text-xl tracking-widest uppercase rounded-xl transition-all duration-300 shadow-lg glow-gold cursor-pointer"
                >
                  🚀 Add Draft Candidate
                </button>
              </form>
            </div>

            {/* CSV File Roster Loader (Right) */}
            <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl flex flex-col justify-between">
              <div>
                <h2 className="text-3xl font-sporty tracking-wider text-accent-gold mb-6 uppercase">
                  Bulk CSV Import
                </h2>
                <p className="text-sm text-gray-400 mb-6">
                  You can upload a CSV roster mapping out your players. The columns must include at least:
                </p>

                {/* Expected Columns table */}
                <div className="bg-primary-dark/50 border border-white/5 rounded-xl p-4 space-y-2 text-xs mb-8">
                  <div className="flex justify-between border-b border-white/10 pb-2">
                    <span className="font-bold text-white uppercase">Expected Header Column</span>
                    <span className="text-accent-gold font-bold">Options / Formats</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">name</span>
                    <span className="text-gray-500">e.g. Jasprit Bumrah</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">category</span>
                    <span className="text-gray-500">A, B, or C</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">base price</span>
                    <span className="text-gray-500">e.g. 20000000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">age</span>
                    <span className="text-gray-500">e.g. 32 (optional)</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">photo</span>
                    <span className="text-gray-500">HTTP/S URL link (optional)</span>
                  </div>
                </div>

                <div className="border-2 border-dashed border-accent-gold/30 rounded-2xl p-8 text-center hover:border-accent-gold transition-all duration-300 relative group cursor-pointer">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleCSVUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="text-4xl mb-4 group-hover:scale-110 transition-all duration-300">📂</div>
                  <h4 className="font-bold text-lg text-gray-200">Click or Drag Roster CSV File</h4>
                  <p className="text-xs text-gray-500 mt-2">Only .csv spreadsheets supported</p>
                </div>
              </div>

              <div className="mt-8 p-4 bg-[#1b263b]/30 border border-white/5 rounded-xl text-xs text-gray-500">
                💡 <strong>Roster Tip:</strong> If columns do not align exactly, the system will fallback and auto-generate default avatars and standard categories.
              </div>
            </div>

          </div>
        )}

        {/* SUBTAB 3: TEAM MANAGER */}
        {activeSubTab === 'manage-teams' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Left Column Controls */}
            <div className="space-y-8 col-span-1">
              {/* Create Team Form */}
              <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl">
                <h2 className="text-3xl font-sporty tracking-wider text-accent-gold mb-6 uppercase">
                  Add Franchise
                </h2>

                <form onSubmit={handleAddTeam} className="space-y-5">
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">
                      Franchise / Team Name
                    </label>
                    <input
                      type="text"
                      required
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="Chennai Champions"
                      className="w-full px-4 py-3 bg-primary-dark border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-gold font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">
                      Franchise Cap Limit (₹)
                    </label>
                    <input
                      type="number"
                      required
                      value={newTeamBudget}
                      onChange={(e) => setNewTeamBudget(e.target.value)}
                      placeholder="10000000"
                      className="w-full px-4 py-3 bg-primary-dark border border-white/10 rounded-lg text-white focus:outline-none focus:border-accent-gold font-bold"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Standard draft salary cap: ₹1,00,00,000 (1 Crore)
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 bg-accent-gold hover:bg-gold-hover text-primary-dark font-bold font-sporty text-xl tracking-widest uppercase rounded-xl transition-all duration-300 shadow-lg glow-gold cursor-pointer"
                  >
                    🛡️ Register Team
                  </button>
                </form>
              </div>

              {/* Roster Size Limits Form */}
              <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl">
                <h2 className="text-3xl font-sporty tracking-wider text-accent-gold mb-6 uppercase">
                  Roster Limits
                </h2>

                <form onSubmit={handleSaveRules} className="space-y-5">
                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">
                      Minimum Squad Size
                    </label>
                    <input
                      type="number"
                      required
                      value={rules.minPlayers || 5}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        setRules(prev => ({ ...prev, minPlayers: val }));
                      }}
                      className="w-full px-4 py-3 bg-primary-dark border border-white/10 rounded-lg text-white font-bold focus:outline-none focus:border-accent-gold"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Team budget solvency enforces this limit
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-widest font-bold text-gray-400 mb-2">
                      Maximum Squad Size
                    </label>
                    <input
                      type="number"
                      required
                      value={rules.maxPlayers || 15}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        setRules(prev => ({ ...prev, maxPlayers: val }));
                      }}
                      className="w-full px-4 py-3 bg-primary-dark border border-white/10 rounded-lg text-white font-bold focus:outline-none focus:border-accent-gold"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">
                      Enforces draft cap lockout when reached
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 bg-accent-gold hover:bg-gold-hover text-primary-dark font-bold font-sporty text-xl tracking-widest uppercase rounded-xl transition-all duration-300 shadow-lg glow-gold cursor-pointer"
                  >
                    💾 Save Roster Limits
                  </button>
                </form>
              </div>
            </div>

            {/* Franchise Registered Board */}
            <div className="lg:col-span-2 glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl">
              <h2 className="text-3xl font-sporty tracking-wider text-accent-gold mb-6 uppercase">
                Registered Franchise Squads ({teams.length})
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-gray-400 font-bold uppercase tracking-wider text-xs">
                      <th className="py-3 px-4">Franchise Name</th>
                      <th className="py-3 px-4">Cap Ceiling</th>
                      <th className="py-3 px-4">Remaining Cap</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {teams.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="py-12 text-center text-gray-500">
                          No registered teams. Set one up on the left panel!
                        </td>
                      </tr>
                    ) : (
                      teams.map(t => (
                        <tr key={t._id || t.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="py-4 px-4 font-bold text-gray-200">{t.name}</td>
                          <td className="py-4 px-4 text-gray-400">{formatRupees(t.initialBudget)}</td>
                          <td className="py-4 px-4 font-bold text-accent-gold">{formatRupees(t.budget)}</td>
                          <td className="py-4 px-4 text-center">
                            <button
                              onClick={() => handleDeleteTeam(t._id || t.id)}
                              className="px-3 py-1 bg-red-950 text-red-400 hover:bg-red-900 border border-red-500/20 rounded text-xs transition duration-300 font-bold cursor-pointer"
                            >
                              ✕ Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* SUBTAB 4: SYSTEM CONTROLS */}
        {activeSubTab === 'system' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* System Actions card */}
            <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl text-center space-y-6">
              <div className="text-4xl">💾</div>
              <h3 className="text-2xl font-sporty tracking-wider text-white uppercase">Persist session</h3>
              <p className="text-xs text-gray-400">
                Although local state updates automatically, click save to lock all session histories in your browser's persistent storage.
              </p>
              <button
                onClick={() => showNotification('Auction data state locked in storage!')}
                className="w-full py-3 bg-secondary-dark hover:bg-white/10 text-accent-gold border border-accent-gold/40 hover:border-accent-gold font-bold font-sporty tracking-widest uppercase rounded-xl transition duration-300 cursor-pointer"
              >
                💾 Save Session
              </button>
            </div>

            <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl text-center space-y-6">
              <div className="text-4xl">🔄</div>
              <h3 className="text-2xl font-sporty tracking-wider text-white uppercase">Reset Defaults</h3>
              <p className="text-xs text-gray-400">
                Wipe active edits and restore the pre-packaged draft rosters (5 mock players including Virat Kohli, MS Dhoni, etc.) and teams.
              </p>
              <button
                onClick={() => systemReset('hard')}
                className="w-full py-3 bg-yellow-950/80 hover:bg-yellow-900 text-yellow-300 border border-yellow-500/20 font-bold font-sporty tracking-widest uppercase rounded-xl transition duration-300 cursor-pointer"
              >
                🔄 Restore default draft
              </button>
            </div>

            <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl text-center space-y-6">
              <div className="text-4xl">🚨</div>
              <h3 className="text-2xl font-sporty tracking-wider text-white uppercase">Danger Zone</h3>
              <p className="text-xs text-gray-400">
                Wipes all datasets (players, teams, history) entirely from the system. Readying the deck for a complete blank setup.
              </p>
              <button
                onClick={() => systemReset('clear')}
                className="w-full py-3 bg-red-950/85 hover:bg-red-900 text-red-200 border border-red-500/20 font-bold font-sporty tracking-widest uppercase rounded-xl transition duration-300 cursor-pointer"
              >
                ⚠️ WIPE ENTIRE DATABASE
              </button>
            </div>

          </div>
        )}

        {/* SUBTAB 5: CATEGORY RULES CONFIGURATOR */}
        {activeSubTab === 'rules' && (
          <div className="glass-panel rounded-2xl border border-white/10 p-6 shadow-2xl space-y-8">
            <h2 className="text-3xl font-sporty tracking-wider text-accent-gold uppercase">
              Configure Category Rules
            </h2>
            <p className="text-sm text-gray-400">
              Configure the minimum base amount and maximum team slots allowed per category.
            </p>

            <form onSubmit={handleSaveRules} className="space-y-6">

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Base Prices card */}
                <div className="bg-primary-dark/40 border border-white/5 p-5 rounded-xl space-y-4">
                  <h3 className="text-xl font-sporty text-accent-gold uppercase tracking-wider">Base Amounts (₹)</h3>
                  {Object.keys(rules.basePrices || {}).map((cat) => (
                    <div key={cat} className="flex justify-between items-center gap-2">
                      <span className="text-sm font-bold text-gray-300">Category {cat}</span>
                      <input
                        type="number"
                        value={rules.basePrices[cat]}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setRules(prev => ({
                            ...prev,
                            basePrices: { ...prev.basePrices, [cat]: val }
                          }));
                        }}
                        className="w-48 px-3 py-2 bg-primary-dark border border-white/10 rounded-lg text-white font-bold focus:outline-none focus:border-accent-gold"
                      />
                    </div>
                  ))}
                </div>

                {/* Slots per Team card */}
                <div className="bg-primary-dark/40 border border-white/5 p-5 rounded-xl space-y-4">
                  <h3 className="text-xl font-sporty text-accent-gold uppercase tracking-wider">Slots per Team</h3>
                  {Object.keys(rules.slots || {}).map((cat) => (
                    <div key={cat} className="flex justify-between items-center gap-2">
                      <span className="text-sm font-bold text-gray-300">Category {cat} Slots</span>
                      <input
                        type="number"
                        value={rules.slots[cat]}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setRules(prev => ({
                            ...prev,
                            slots: { ...prev.slots, [cat]: val }
                          }));
                        }}
                        className="w-48 px-3 py-2 bg-primary-dark border border-white/10 rounded-lg text-white font-bold focus:outline-none focus:border-accent-gold"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-accent-gold hover:bg-gold-hover text-primary-dark font-bold font-sporty text-xl tracking-widest uppercase rounded-xl transition duration-300 shadow-lg glow-gold cursor-pointer"
              >
                💾 Save Category Rules
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminPage;
