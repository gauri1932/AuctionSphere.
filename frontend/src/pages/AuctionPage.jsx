import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import confetti from 'canvas-confetti';
import {
  formatRupees,
  getPlayers,
  getTeams
} from '../utils/localStorageHelper';
import { socket } from '../utils/socket';
import './AuctionPage.css';

const AuctionPage = () => {
  const { roomId } = useParams();
  const roomName = sessionStorage.getItem(`room_name_${roomId}`) || 'Draft Board';

  const [auctionState, setAuctionState] = useState({
    livePlayer: null,
    liveStatus: 'waiting',
    soldInfo: null,
    currentBid: 0,
    highestBidder: null,
    bidHistory: []
  });

  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [isConnected, setIsConnected] = useState(socket.connected);

  // Micro-interaction animation triggers
  const [bidUpdated, setBidUpdated] = useState(false);
  const [fadeBidder, setFadeBidder] = useState(false);
  const [fadePlayer, setFadePlayer] = useState(false);

  // Draft stopwatch timer states
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerIntervalRef = useRef(null);
  
  // Track previous player id to reset stopwatch when a new player is pushed
  const prevPlayerIdRef = useRef(null);

  // Track active player ID to trigger crossfade transition
  const activePlayerId = auctionState.livePlayer?._id || auctionState.livePlayer?.id;

  // Track connection status
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

  // Sync players & teams lists for progress calculation
  useEffect(() => {
    const loadData = async () => {
      const p = await getPlayers();
      const t = await getTeams();
      setPlayers(p);
      setTeams(t);
    };
    loadData();

    socket.on('playersUpdated', (data) => setPlayers(data));
    socket.on('teamsUpdated', (data) => setTeams(data));

    return () => {
      socket.off('playersUpdated');
      socket.off('teamsUpdated');
    };
  }, []);

  // Soft gold highlight trigger on current bid updates
  useEffect(() => {
    if (auctionState.currentBid > 0) {
      setBidUpdated(true);
      const timer = setTimeout(() => setBidUpdated(false), 250);
      return () => clearTimeout(timer);
    }
  }, [auctionState.currentBid]);

  // Leading bidder change crossfade trigger
  useEffect(() => {
    setFadeBidder(true);
    const timer = setTimeout(() => setFadeBidder(false), 200);
    return () => clearTimeout(timer);
  }, [auctionState.highestBidder]);

  // Player change crossfade trigger
  useEffect(() => {
    setFadePlayer(true);
    const timer = setTimeout(() => setFadePlayer(false), 200);
    return () => clearTimeout(timer);
  }, [activePlayerId]);

  // Stopwatch effect
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

  // Sync initial state
  useEffect(() => {
    socket.emit('fetchInitialData', (res) => {
      if (res.success) {
        setAuctionState(res.data.state);
        if (res.data.players) setPlayers(res.data.players);
        if (res.data.teams) setTeams(res.data.teams);
      }
    });

    socket.on('syncAuctionState', (state) => {
      setAuctionState(state);
    });

    socket.on('auctionStateUpdated', (state) => {
      setAuctionState(state);
    });

    socket.on('bidAccepted', (state) => {
      setAuctionState(state);
    });

    return () => {
      socket.off('syncAuctionState');
      socket.off('auctionStateUpdated');
      socket.off('bidAccepted');
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Celebration Confetti
  useEffect(() => {
    if (auctionState.liveStatus === 'sold' && auctionState.soldInfo) {
      const duration = 4 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 50 };

      const randomInRange = (min, max) => Math.random() * (max - min) + min;

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        
        confetti({ 
          ...defaults, 
          particleCount, 
          origin: { x: randomInRange(0.15, 0.35), y: Math.random() * 0.4 + 0.2 } 
        });
        confetti({ 
          ...defaults, 
          particleCount, 
          origin: { x: randomInRange(0.65, 0.85), y: Math.random() * 0.4 + 0.2 } 
        });
      }, 300);

      return () => clearInterval(interval);
    }
  }, [auctionState.liveStatus, auctionState.soldInfo]);

  // Progress stats
  const totalPlayers = players.length;
  const processedPlayers = players.filter(p => p.status === 'Sold' || p.status === 'Unsold').length;
  const currentPlayerNum = auctionState.livePlayer ? Math.min(totalPlayers, processedPlayers + 1) : processedPlayers;
  const progressPercent = totalPlayers > 0 ? (currentPlayerNum / totalPlayers) * 100 : 0;

  return (
    <div className="flex-grow flex flex-col justify-start relative z-10 w-[90%] mx-auto py-4 select-text animate-page-in">
      
      {/* STATE A: WAITING SCREEN */}
      {auctionState.liveStatus === 'waiting' && (
        <div className="flex-grow flex items-center justify-center py-20">
          <div className="bg-[#1A2430] border border-white/5 max-w-md w-full p-8 text-center flex flex-col items-center rounded-xl shadow-sm">
            <div className="w-16 h-16 bg-[#263241] rounded-xl flex items-center justify-center border border-white/5 mb-6 text-3xl shadow-inner select-none">
              🏏
            </div>
            <h1 className="text-[36px] font-sporty tracking-wider text-[#F8FAFC]">
              WAIT FOR THE NEXT PLAYER
            </h1>
            <p className="text-[14px] text-[#94A3B8] font-medium mt-2 select-none">
              Admin is preparing the draft block queue
            </p>
          </div>
        </div>
      )}

      {/* STATE B: LIVE PLAYER CARD */}
      {auctionState.liveStatus === 'live' && auctionState.livePlayer && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch mt-2 flex-grow mb-6">
          
          {/* 1. PLAYER CARD SECTION (4 columns) */}
          <div className="col-span-12 lg:col-span-4 flex flex-col justify-between h-full space-y-6">
            
            {/* Portrait Image with increased height (~25% larger) & bottom gradient */}
            <div className="w-full h-80 lg:h-[380px] xl:h-[420px] rounded-xl overflow-hidden border border-white/5 bg-[#1A2430] select-none relative shadow-sm">
              <img
                src={auctionState.livePlayer.photo}
                alt={auctionState.livePlayer.name}
                className={`w-full h-full object-contain object-[center_top] bg-[#1A2430] transition-opacity duration-200 ${
                  fadePlayer ? 'opacity-0' : 'opacity-100'
                }`}
              />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0E1621] to-transparent pointer-events-none"></div>
            </div>

            {/* Profile Details */}
            <div className="space-y-4">
              <div className={`transition-opacity duration-200 ${fadePlayer ? 'opacity-0' : 'opacity-100'}`}>
                <div className="flex items-start justify-between gap-4">
                  <h1 className={`font-bold text-[#F8FAFC] leading-tight uppercase tracking-wide line-clamp-2 ${
                    auctionState.livePlayer.name.length > 20
                      ? 'text-[24px]'
                      : auctionState.livePlayer.name.length > 14
                        ? 'text-[28px]'
                        : 'text-[36px]'
                  }`}>
                    {auctionState.livePlayer.name}
                  </h1>
                  <span className="px-2.5 py-1 bg-[#C8A03C]/10 border border-[#C8A03C]/20 text-[#C8A03C] text-[10px] font-bold uppercase rounded shrink-0 select-none">
                    Category {auctionState.livePlayer.category}
                  </span>
                </div>
              </div>

              {/* Clean rows without nested card grids */}
              <div className="divide-y divide-white/5 text-[14px]">
                {auctionState.livePlayer.role && (
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-[#94A3B8]">Role</span>
                    <span className="font-semibold text-[#F8FAFC]">{auctionState.livePlayer.role}</span>
                  </div>
                )}
                {auctionState.livePlayer.age && (
                  <div className="flex justify-between items-center py-2.5">
                    <span className="text-[#94A3B8]">Age</span>
                    <span className="font-semibold text-[#F8FAFC]">{auctionState.livePlayer.age} Years</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-[#94A3B8]">Base Price</span>
                  <span className="font-semibold text-[#F8FAFC]">
                    {formatRupees(auctionState.livePlayer.basePrice)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 2. CURRENT BID CARD (5 columns - THE HERO ELEMENT) */}
          <div className={`col-span-12 lg:col-span-5 border rounded-xl p-[20px] flex flex-col justify-between h-full shadow-sm relative select-none transition-all duration-250 ${
            bidUpdated ? 'bg-[#C8A03C]/10 border-[#C8A03C]/30 shadow-[0_4px_16px_rgba(200,160,60,0.12)]' : 'bg-[#1A2430] border-white/5'
          }`}>
            
            {/* Current Highest Bid Section */}
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-center justify-center flex-grow mb-4">
              <span className="text-[10px] font-bold text-[#94A3B8] tracking-[0.2em] uppercase block mb-2">
                CURRENT HIGHEST BID
              </span>
              
              <div className="overflow-hidden h-[60px] relative flex justify-center items-center">
                <div 
                  key={auctionState.currentBid}
                  className="text-[48px] font-bold text-[#C8A03C] tracking-wide leading-none animate-[bidSlideUp_250ms_ease-out]"
                >
                  {formatRupees(auctionState.currentBid || auctionState.livePlayer.basePrice)}
                </div>
              </div>
            </div>

            {/* Active Leading Bidder Section */}
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 flex flex-col items-start justify-center">
              <span className="text-[10px] font-bold text-[#94A3B8] tracking-[0.2em] uppercase block mb-3">
                ACTIVE LEADING BIDDER
              </span>
              
              <div className={`flex items-center space-x-3 transition-opacity duration-200 ${
                fadeBidder ? 'opacity-0' : 'opacity-100'
              }`}>
                <div className="text-2xl select-none">
                  {(() => {
                    const name = auctionState.highestBidder;
                    if (!name) return "🛡️";
                    if (name.toLowerCase().includes("chennai")) return "🦁";
                    if (name.toLowerCase().includes("mumbai")) return "⚡";
                    if (name.toLowerCase().includes("pune")) return "🐾";
                    if (name.toLowerCase().includes("bangalore")) return "🐂";
                    if (name.toLowerCase().includes("delhi")) return "🌪️";
                    if (name.toLowerCase().includes("kolkata")) return "👑";
                    return "🛡️";
                  })()}
                </div>
                <span className="text-[18px] font-bold text-[#F8FAFC] uppercase truncate tracking-wide">
                  {auctionState.highestBidder || "AWAITING BIDS"}
                </span>
              </div>
            </div>
          </div>

          {/* 3. BID ACTIVITY (3 columns) */}
          <div className="col-span-12 lg:col-span-3 flex flex-col justify-between h-full space-y-4">
            <div className="flex flex-col h-full justify-start">
              <span className="text-[10px] font-bold text-[#94A3B8] tracking-widest uppercase block select-none mb-4">
                Bid Activity
              </span>
              
              <div className="space-y-1.5 overflow-y-auto pr-1 flex-grow max-h-[360px] lg:max-h-[400px] xl:max-h-[460px]">
                {auctionState.bidHistory && auctionState.bidHistory.length > 0 ? (
                  auctionState.bidHistory.slice().reverse().map((bid, index) => {
                    const isNewest = index === 0;
                    const bidTime = bid.time || bid.timestamp;
                    return (
                      <div
                        key={bidTime || index}
                        className={`py-2 px-3 flex items-center justify-between text-[14px] border-b border-white/5 transition-all duration-200 rounded-lg ${
                          isNewest && bidUpdated
                            ? 'bg-[#C8A03C]/10 border border-[#C8A03C]/20 text-[#C8A03C]'
                            : 'bg-transparent text-[#94A3B8]'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="text-[10px] text-[#94A3B8] font-mono">
                            {bidTime ? new Date(bidTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "Live"}
                          </span>
                          <span className="font-bold text-[#F8FAFC] uppercase truncate">
                            {bid.bidder || bid.teamName}
                          </span>
                        </div>
                        <span className="font-sporty font-bold text-[#C8A03C] text-[18px] tracking-wider shrink-0">
                          {formatRupees(bid.bidAmount || bid.amount)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-[#94A3B8] text-[14px] select-none py-2">
                    No bids yet
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* STATE C: SOLD Splash */}
      {auctionState.liveStatus === 'sold' && auctionState.soldInfo && (
        <div className="flex-grow flex items-center justify-center py-10 animate-[fadeIn_0.4s_ease-out]">
          <div className="bg-[#1A2430] border border-[#16A34A]/30 max-w-xl w-full p-8 rounded-xl text-center flex flex-col items-center relative overflow-hidden shadow-sm">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-[#16A34A]"></div>
            
            <div className="px-4 py-0.5 bg-[#16A34A]/10 border border-[#16A34A]/20 text-[#16A34A] font-sporty tracking-[0.2em] text-[16px] font-black uppercase rounded mb-6 select-none">
              SOLD
            </div>

            {auctionState.livePlayer && (
              <div className="w-24 aspect-[3/4] rounded-xl overflow-hidden border border-white/5 shadow-sm mb-4 bg-slate-900/60 select-none">
                <img
                  src={auctionState.livePlayer.photo}
                  alt={auctionState.livePlayer.name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <h2 className="text-[36px] font-sporty tracking-wide text-[#F8FAFC] uppercase mb-1 leading-none">
              {auctionState.livePlayer?.name || 'Draft Candidate'}
            </h2>

            <p className="text-[10px] tracking-[0.15em] font-bold text-[#94A3B8] uppercase mb-6 select-none">
              Draft Block Complete
            </p>

            <div className="w-full bg-[#263241]/40 border border-white/5 rounded-[10px] p-4 shadow-sm">
              <div className="grid grid-cols-2 gap-4 divide-x divide-white/10">
                <div className="text-center">
                  <span className="block text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1 select-none">
                    ACQUIRING TEAM
                  </span>
                  <span className="text-[18px] font-bold text-[#F8FAFC] uppercase tracking-wide truncate block">
                    {auctionState.soldInfo.teamName}
                  </span>
                </div>

                <div className="text-center">
                  <span className="block text-[10px] uppercase tracking-wider text-[#94A3B8] mb-1 select-none">
                    CONTRACT PRICE
                  </span>
                  <span className="text-[18px] font-sporty font-bold text-[#C8A03C] tracking-wider truncate block">
                    {formatRupees(auctionState.soldInfo.price)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATE D: UNSOLD Splash */}
      {auctionState.liveStatus === 'unsold' && auctionState.livePlayer && (
        <div className="flex-grow flex items-center justify-center py-10 animate-[fadeIn_0.4s_ease-out]">
          <div className="bg-[#1A2430] border border-[#DC2626]/30 max-w-xl w-full p-8 rounded-xl text-center flex flex-col items-center relative overflow-hidden shadow-sm">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-[#DC2626]"></div>

            <div className="px-4 py-0.5 bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] font-sporty tracking-[0.2em] text-[16px] font-black uppercase rounded mb-6 select-none">
              UNSOLD
            </div>

            <div className="w-24 aspect-[3/4] rounded-xl overflow-hidden border border-white/5 shadow-sm mb-4 bg-slate-900/60 opacity-40 select-none">
              <img
                src={auctionState.livePlayer.photo}
                alt={auctionState.livePlayer.name}
                className="w-full h-full object-cover"
              />
            </div>

            <h2 className="text-[36px] font-sporty tracking-wide text-[#F8FAFC] uppercase mb-1 leading-none">
              {auctionState.livePlayer.name}
            </h2>

            <p className="text-[10px] tracking-[0.15em] font-bold text-[#DC2626] uppercase mb-4 select-none">
              Passed Draft Board
            </p>
          </div>
        </div>
      )}

      {/* Bottom Information Bar */}
      <div className="w-full mt-auto pt-6 pb-2 select-none border-t border-white/5">
        <div className="flex flex-wrap justify-between items-center text-[14px] text-[#94A3B8] mb-2 gap-4">
          <div>
            Current Player: <span className="text-[#F8FAFC] font-semibold">{auctionState.livePlayer?.name || 'None'}</span>
          </div>
          <div>
            Bids Placed: <span className="text-[#F8FAFC] font-semibold">{auctionState.bidHistory?.length || 0}</span>
          </div>
          <div>
            Active Teams: <span className="text-[#F8FAFC] font-semibold">{teams.length}</span>
          </div>
          <div>
            Progress: <span className="text-[#F8FAFC] font-semibold">{currentPlayerNum} / {totalPlayers}</span>
          </div>
        </div>
        <div className="w-full bg-[#1A2430] h-1.5 rounded-full overflow-hidden border border-white/5">
          <div
            className="bg-[#C8A03C] h-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default AuctionPage;
