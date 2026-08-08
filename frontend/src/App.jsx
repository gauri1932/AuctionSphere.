import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import LobbyPage from './pages/LobbyPage';
import Navbar from './components/Navbar';
import RoomAuthWrapper from './components/RoomAuthWrapper';
import AuctionPage from './pages/AuctionPage';
import SummaryPage from './pages/SummaryPage';
import PlayerListPage from './pages/PlayerListPage';
import CategoryPage from './pages/CategoryPage';
import AdminPage from './pages/AdminPage';
import TeamHubPage from './pages/TeamHubPage';
import { socket } from './utils/socket';
import { getTeams } from './utils/localStorageHelper';
import { API_URL } from './utils/apiConfig';
import RoomTopBar from './components/RoomTopBar';
import './index.css';

const UnifiedHeader = () => {
  const location = useLocation();
  const match = location.pathname.match(/^\/room\/([^/]+)/);
  const roomId = match ? match[1] : null;

  const [roomName, setRoomName] = useState('');
  const [auctionState, setAuctionState] = useState({
    liveStatus: 'waiting',
    livePlayer: null
  });
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [teamsCount, setTeamsCount] = useState(0);
  const [isConnected, setIsConnected] = useState(socket.connected);

  const prevPlayerIdRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // Monitor socket connection
  useEffect(() => {
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  // Fetch room metadata & sync live status
  useEffect(() => {
    if (!roomId) return;

    // Room Name cache
    const cachedName = sessionStorage.getItem(`room_name_${roomId}`);
    if (cachedName) {
      setRoomName(cachedName);
    } else {
      fetch(`${API_URL}/rooms/${roomId}`)
        .then((res) => res.ok && res.json())
        .then((data) => {
          if (data && data.name) {
            setRoomName(data.name);
            sessionStorage.setItem(`room_name_${roomId}`, data.name);
          }
        })
        .catch((err) => console.error('[Header] Room fetch error:', err));
    }

    // Load active teams count
    getTeams().then(t => setTeamsCount(t.length)).catch(console.error);

    // Initial state fetch
    socket.emit('fetchInitialData', (res) => {
      if (res.success && res.data.state) {
        setAuctionState(res.data.state);
        if (res.data.teams) setTeamsCount(res.data.teams.length);
      }
    });

    // Listeners for updates
    const handleStateSync = (state) => setAuctionState(state);
    const handleStateUpdate = (state) => setAuctionState(state);
    const handleBidAccepted = (state) => setAuctionState(state);
    const handleTeamsUpdated = (teamsData) => setTeamsCount(teamsData.length);

    socket.on('syncAuctionState', handleStateSync);
    socket.on('auctionStateUpdated', handleStateUpdate);
    socket.on('bidAccepted', handleBidAccepted);
    socket.on('teamsUpdated', handleTeamsUpdated);

    return () => {
      socket.off('syncAuctionState', handleStateSync);
      socket.off('auctionStateUpdated', handleStateUpdate);
      socket.off('bidAccepted', handleBidAccepted);
      socket.off('teamsUpdated', handleTeamsUpdated);
    };
  }, [roomId]);

  // Stopwatch/timer effect (synchronized with page timer)
  useEffect(() => {
    if (auctionState.liveStatus === 'live' && auctionState.livePlayer) {
      const currId = auctionState.livePlayer._id || auctionState.livePlayer.id;
      if (prevPlayerIdRef.current !== currId) {
        setTimerSeconds(0);
        prevPlayerIdRef.current = currId;
      }
      if (!timerIntervalRef.current) {
        timerIntervalRef.current = setInterval(() => {
          setTimerSeconds((prev) => prev + 1);
        }, 1000);
      }
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setTimerSeconds(0);
      prevPlayerIdRef.current = null;
    }
  }, [auctionState.liveStatus, auctionState.livePlayer]);

  if (!roomId) {
    return (
      <header className="relative z-10 w-full bg-gradient-to-b from-[#16202B] to-transparent py-6 border-b border-white/5 shadow-md">
        <div className="max-w-6xl mx-auto px-4 flex justify-between items-center select-none">
          <Link to="/" className="flex items-center space-x-2.5 group">
            <span className="text-3xl group-hover:scale-110 transition duration-300">🏏</span>
            <div className="leading-none">
              <span className="block font-sporty text-3xl tracking-wider text-accent-gold text-glow-gold">
                SUPER PLAYER AUCTION
              </span>
              <span className="block text-[8px] tracking-[0.25em] font-black text-gray-400 uppercase mt-0.5">
                Sports Franchise Draft Board
              </span>
            </div>
          </Link>
          <div className="hidden sm:flex items-center space-x-2 bg-red-600/10 border border-red-500/35 rounded-full px-3 py-1 text-[10px] font-black text-red-500 uppercase tracking-widest">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
            <span>BROADCAST STATE SYNC</span>
          </div>
        </div>
      </header>
    );
  }

  return (
    <RoomTopBar
      roomId={roomId}
      roomName={roomName}
      liveStatus={auctionState.liveStatus}
      timerSeconds={timerSeconds}
      teamsCount={teamsCount}
      isConnected={isConnected}
    />
  );
};

function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-primary-dark text-white relative">
        {/* Stadium light beam graphic back-glow */}
        <div className="stadium-light-overlay absolute inset-0 z-0"></div>

        {/* Global Sports Header mimics TV broadcasts */}
        <UnifiedHeader />

        {/* Primary Page Canvas */}
        <main className="flex-grow flex flex-col relative z-10 select-text">
          <Routes>
            <Route path="/" element={<LobbyPage />} />
            <Route path="/room/:roomId" element={<RoomAuthWrapper><AuctionPage /></RoomAuthWrapper>} />
            <Route path="/room/:roomId/summary" element={<RoomAuthWrapper><SummaryPage /></RoomAuthWrapper>} />
            <Route path="/room/:roomId/players" element={<RoomAuthWrapper><PlayerListPage /></RoomAuthWrapper>} />
            <Route path="/room/:roomId/category" element={<RoomAuthWrapper><CategoryPage /></RoomAuthWrapper>} />
            <Route path="/room/:roomId/manage" element={<RoomAuthWrapper><AdminPage /></RoomAuthWrapper>} />
            <Route path="/room/:roomId/teams" element={<RoomAuthWrapper><TeamHubPage /></RoomAuthWrapper>} />
          </Routes>
        </main>

        {/* Bottom Persistent Broadcast Nav */}
        <Navbar />
      </div>
    </Router>
  );
}

export default App;
