import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  formatRupees
} from '../utils/localStorageHelper';
import { socket } from '../utils/socket';
import './AuctionPage.css';

const AuctionPage = () => {
  const [auctionState, setAuctionState] = useState({
    livePlayer: null,
    liveStatus: 'waiting',
    soldInfo: null,
    currentBid: 0,
    highestBidder: null,
    bidHistory: []
  });

  // Draft stopwatch timer states
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerIntervalRef = useRef(null);
  
  // Track previous player id to reset stopwatch when a new player is pushed
  const prevPlayerIdRef = useRef(null);

  // Bid raised micro-animation triggers
  const [showBidAlert, setShowBidAlert] = useState(false);
  const prevBidRef = useRef(0);

  // Flash neon Bid Raised alert popover when bid increases
  useEffect(() => {
    if (auctionState.currentBid > prevBidRef.current && prevBidRef.current > 0) {
      setShowBidAlert(true);
      const timer = setTimeout(() => setShowBidAlert(false), 1200);
      return () => clearTimeout(timer);
    }
    prevBidRef.current = auctionState.currentBid;
  }, [auctionState.currentBid]);


  // Stopwatch effect
  useEffect(() => {
    if (auctionState.liveStatus === 'live' && auctionState.livePlayer) {
      // If a new player is pushed, reset stopwatch back to 0
      if (prevPlayerIdRef.current !== (auctionState.livePlayer._id || auctionState.livePlayer.id)) {
        setTimerSeconds(0);
        prevPlayerIdRef.current = auctionState.livePlayer._id || auctionState.livePlayer.id;
      }
      
      // Start timer if not already running
      if (!timerIntervalRef.current) {
        timerIntervalRef.current = setInterval(() => {
          setTimerSeconds((prev) => prev + 1);
        }, 1000);
      }
    } else {
      // Clear timer if not in live status
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setTimerSeconds(0);
      prevPlayerIdRef.current = null;
    }
  }, [auctionState.liveStatus, auctionState.livePlayer]);

  // Connect to socket and sync initial state
  useEffect(() => {
    socket.emit('fetchInitialData', (res) => {
      if (res.success) {
        setAuctionState(res.data.state);
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

  // Trigger celebration fireworks when status shifts to sold
  useEffect(() => {
    if (auctionState.liveStatus === 'sold' && auctionState.soldInfo) {
      const duration = 4 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 50 };

      const randomInRange = (min, max) => Math.random() * (max - min) + min;

      // Fireworks interval loop
      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        
        // Explode two rockets in random coordinates in the sky!
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

  // Format stopwatch timer into MM:SS format
  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center p-4 sm:p-8 relative">
      
      {/* Background Stadium light elements */}
      <div className="stadium-light-overlay absolute inset-0 z-0"></div>

      {/* Main State Canvas */}
      <div className={`w-full ${auctionState.liveStatus === 'live' && auctionState.livePlayer ? 'max-w-7xl' : 'max-w-4xl'} relative z-10`}>
        
        {/* STATE A: WAITING SCREEN */}
        {auctionState.liveStatus === 'waiting' && (
          <div className="text-center py-20 px-8 glass-panel glass-panel-glow rounded-3xl border border-white/5 relative overflow-hidden flex flex-col items-center">
            {/* Animated Turf Grid overlay */}
            <div className="absolute inset-0 turf-overlay opacity-40 z-0"></div>
            
            {/* Branding Logo Mimic */}
            <div className="relative z-10 mb-8 bg-gradient-to-tr from-cricket-green via-accent-gold to-cricket-dark p-1.5 rounded-full shadow-2xl scale-105">
              <div className="bg-primary-dark w-36 h-36 rounded-full flex flex-col items-center justify-center border border-white/10 select-none">
                <span className="text-5xl">🏏</span>
                <span className="font-sporty text-xl tracking-[0.1em] text-accent-gold mt-1">SUPER</span>
                <span className="text-[10px] tracking-[0.2em] font-semibold text-gray-400 uppercase">AUCTION</span>
              </div>
            </div>

            <h1 className="relative z-10 text-6xl md:text-7xl font-sporty tracking-wider text-white uppercase text-glow-gold">
              WAIT FOR THE NEXT PLAYER
            </h1>
            <p className="relative z-10 text-sm md:text-base tracking-[0.25em] text-gray-400 font-bold uppercase mt-4">
              Admin is preparing the draft block queue...
            </p>

            <div className="relative z-10 mt-16 flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-6 py-2">
              <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-ping"></span>
              <span className="text-xs uppercase tracking-widest font-black text-green-400 select-none">
                Live Server Synced
              </span>
            </div>

            {/* Bottom branding footer */}
            <div className="relative z-10 mt-12 text-[10px] font-black tracking-[0.3em] text-accent-gold uppercase select-none">
              MANAGED BY SUPER PLAYER AUCTION
            </div>
          </div>
        )}

        {/* STATE B: LIVE PLAYER CARD */}
        {auctionState.liveStatus === 'live' && auctionState.livePlayer && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Main Central box (shifted left) */}
            <div className="col-span-12 lg:col-span-8 glass-panel glass-panel-glow rounded-3xl border border-accent-gold/20 shadow-2xl p-6 sm:p-10 relative overflow-hidden flex flex-col sm:flex-row gap-10 items-center">
              
              {/* Animated Turf Grid overlay */}
              <div className="absolute inset-0 turf-overlay opacity-5 z-0"></div>

              {/* Pulsing live badge */}
              <div className="absolute top-6 left-6 px-4 py-1.5 bg-red-600 border border-red-500 text-white font-sporty tracking-[0.1em] text-sm uppercase rounded-lg shadow-lg live-pulse-badge flex items-center space-x-2 z-10 select-none">
                <span className="w-2 h-2 bg-white rounded-full animate-ping"></span>
                <span>LIVE AUCTION</span>
              </div>

              {/* Draft timer badge */}
              <div className="absolute top-6 right-6 px-4 py-1.5 bg-primary-dark border border-white/10 text-accent-gold font-sporty tracking-wide text-lg rounded-lg shadow-md z-10 select-none">
                ⏱️ {formatTime(timerSeconds)}
              </div>

              {/* Left side: Photo & category badge */}
              <div className="w-full sm:w-2/5 flex flex-col items-center relative z-10 mt-8 sm:mt-0 select-none border-b sm:border-b-0 sm:border-r border-white/15 pb-8 sm:pb-0 sm:pr-8">
                <div className="relative">
                  <div className="absolute -inset-1.5 bg-gradient-to-tr from-accent-gold to-cricket-green rounded-full blur opacity-75 animate-pulse"></div>
                  <img
                    src={auctionState.livePlayer.photo}
                    alt={auctionState.livePlayer.name}
                    className="relative w-48 h-48 sm:w-56 sm:h-56 rounded-full border-4 border-primary-dark bg-primary-dark shadow-2xl object-cover"
                  />
                </div>

                {/* Category badge */}
                <div className="mt-6 px-6 py-2 bg-accent-gold text-primary-dark font-sporty tracking-widest text-lg font-black uppercase rounded-full shadow-lg glow-gold">
                  {auctionState.livePlayer.category === 'A' ? '⭐ Category A' : auctionState.livePlayer.category === 'B' ? '⚡ Category B' : '🌟 Category C'}
                </div>

                <h1 className="mt-4 text-4xl font-sporty tracking-wide text-white leading-tight text-center">
                  {auctionState.livePlayer.name}
                </h1>
                
                <div className="flex items-center space-x-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1 select-none">
                  {auctionState.livePlayer.age && <span>Age: {auctionState.livePlayer.age} • </span>}
                  <span>Base Value: {formatRupees(auctionState.livePlayer.basePrice)}</span>
                </div>
              </div>

              {/* Right side: Real-Time Bidding Deck (Current Bid & Bidder Spotlight) */}
              <div className="w-full sm:w-3/5 space-y-6 relative z-10 flex flex-col justify-center">
                
                {/* Flashing Bid Raised Popover Alert */}
                <div className="h-6 flex justify-center lg:justify-start select-none">
                  {showBidAlert && (
                    <div className="bg-green-500 text-primary-dark font-black font-sporty px-4 py-0.5 rounded text-xs uppercase tracking-widest animate-bounce shadow-lg flex items-center space-x-1.5">
                      <span>⚡</span>
                      <span>BID RAISED!</span>
                    </div>
                  )}
                </div>

                {/* Current Bid Neon Card */}
                <div className="bg-primary-dark/90 rounded-2xl border-2 border-accent-gold/30 p-6 shadow-2xl text-center relative overflow-hidden group hover:border-accent-gold transition-all duration-300">
                  <div className="absolute inset-0 turf-overlay opacity-10"></div>
                  <h3 className="text-xs uppercase tracking-[0.2em] font-black text-gray-400 mb-2 select-none">
                    Current Highest Bid
                  </h3>
                  <div className="text-5xl sm:text-6xl font-sporty text-accent-gold text-glow-gold tracking-wider animate-pulse">
                    {formatRupees(auctionState.currentBid || auctionState.livePlayer.basePrice)}
                  </div>
                </div>

                {/* Leading Franchise Spotlight Card */}
                <div className="bg-primary-dark/65 rounded-2xl border border-white/10 p-5 flex items-center justify-between shadow-lg relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-accent-gold/5 to-transparent"></div>
                  
                  <div className="flex items-center space-x-4 min-w-0 z-10">
                    <div className="w-16 h-16 rounded-2xl bg-secondary-dark border border-white/10 flex items-center justify-center text-3xl select-none">
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
                    <div className="min-w-0">
                      <span className="block text-[10px] text-gray-400 uppercase tracking-widest font-black select-none">
                        Active Leading Bidder
                      </span>
                      <span className="block text-2xl font-bold text-white uppercase truncate">
                        {auctionState.highestBidder || "Awaiting Bids"}
                      </span>
                    </div>
                  </div>

                  {auctionState.highestBidder && (
                    <div className="hidden sm:block px-3 py-1 bg-green-500/10 border border-green-500/20 text-green-400 font-sporty text-xs font-black uppercase rounded-lg tracking-wider animate-pulse z-10 select-none">
                      Holding Lead
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-center lg:justify-start space-x-3 text-[10px] text-gray-500 uppercase tracking-[0.15em] py-2 px-3 border border-white/5 bg-white/[0.02] rounded-xl select-none">
                  <span>⚡</span>
                  <span>Real-time storage socket synchronizer running</span>
                </div>
              </div>

            </div>

            {/* Timeline box (right side) */}
            <div className="col-span-12 lg:col-span-4 glass-panel glass-panel-glow rounded-3xl border border-white/10 p-6 shadow-2xl relative overflow-hidden flex flex-col h-full min-h-[400px] lg:min-h-[500px]">
              <div className="absolute inset-0 turf-overlay opacity-5 z-0"></div>
              
              <h2 className="relative z-10 font-sporty text-2xl tracking-wider text-accent-gold text-glow-gold uppercase border-b border-white/10 pb-3 mb-4 select-none">
                📊 BID TIMELINE
              </h2>
              
              <div className="relative z-10 flex-grow overflow-y-auto pr-1 space-y-4 max-h-[380px] lg:max-h-[440px]">
                {auctionState.bidHistory && auctionState.bidHistory.length > 0 ? (
                  <div className="relative border-l-2 border-accent-gold/20 ml-3 pl-6 space-y-6">
                    {auctionState.bidHistory.slice().reverse().map((bid, index) => {
                      const isNewest = index === 0;
                      const bidTime = bid.time || bid.timestamp;
                      
                      return (
                        <div key={bidTime || index} className="relative group animate-page-in">
                          {/* Timeline node dot */}
                          <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-2 bg-[#0d1b2a] transition-all duration-300 ${
                            isNewest 
                              ? 'border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] scale-110' 
                              : 'border-accent-gold/40'
                          }`}>
                            {isNewest && (
                              <span className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75"></span>
                            )}
                          </div>
                          
                          {/* Bid item content */}
                          <div className={`p-3.5 rounded-xl border transition-all duration-200 ${
                            isNewest 
                              ? 'bg-green-500/10 border-green-500/30' 
                              : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04]'
                          }`}>
                            <div className="flex justify-between items-start mb-1 gap-2">
                              <span className={`font-bold text-sm uppercase truncate ${
                                isNewest ? 'text-green-400' : 'text-white'
                              }`}>
                                {bid.bidder || bid.teamName}
                              </span>
                              <span className="text-[10px] text-gray-500 font-mono font-medium shrink-0 pt-0.5">
                                {bidTime ? new Date(bidTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "Live"}
                              </span>
                            </div>
                            <div className="font-sporty text-xl text-accent-gold text-glow-gold tracking-wider">
                              {formatRupees(bid.bidAmount || bid.amount)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center py-16 text-gray-500 select-none">
                    <span className="text-4xl mb-3">⏳</span>
                    <p className="text-xs uppercase tracking-widest font-black">Awaiting First Bid</p>
                    <p className="text-[10px] text-gray-600 mt-1 max-w-[200px] leading-relaxed">Bids placed by franchises will appear here in real-time</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* STATE C: SOLD CELEBRATION SCREEN */}
        {auctionState.liveStatus === 'sold' && auctionState.soldInfo && (
          <div className="glass-panel rounded-3xl border-2 border-green-500 shadow-[0_0_50px_rgba(16,185,129,0.2)] p-10 text-center relative overflow-hidden animate-fade-in flex flex-col items-center">
            
            {/* Confetti canvas backdrop */}
            <div className="absolute inset-0 turf-overlay opacity-30 z-0"></div>

            {/* SOLD BANNER */}
            <div className="relative z-10 py-2 px-8 bg-green-500 text-primary-dark font-sporty tracking-[0.2em] text-3xl font-black rounded-lg uppercase shadow-2xl animate-pulse mb-8 select-none">
              🔨 SOLD!
            </div>

            {auctionState.livePlayer && (
              <img
                src={auctionState.livePlayer.photo}
                alt="winning player"
                className="relative z-10 w-44 h-44 rounded-full border-4 border-accent-gold bg-primary-dark shadow-2xl object-cover mb-6 select-none scale-105"
              />
            )}

            <h2 className="relative z-10 text-4xl sm:text-5xl font-sporty tracking-wide text-white mb-2 uppercase">
              {auctionState.livePlayer?.name || 'Draft Candidate'}
            </h2>

            <p className="relative z-10 text-sm tracking-[0.2em] font-bold text-gray-400 uppercase mb-8">
              Successfully Awarded to Franchise
            </p>

            {/* Hammer info banner */}
            <div className="relative z-10 w-full max-w-xl bg-primary-dark/95 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="grid grid-cols-2 gap-4 divide-x divide-white/10">
                <div className="text-center px-2">
                  <span className="block text-xs uppercase tracking-wider text-gray-500 mb-1">
                    Acquiring Team
                  </span>
                  <span className="text-xl sm:text-2xl font-bold text-white uppercase tracking-wide truncate block">
                    {auctionState.soldInfo.teamName}
                  </span>
                </div>

                <div className="text-center px-2">
                  <span className="block text-xs uppercase tracking-wider text-gray-500 mb-1">
                    Final Price
                  </span>
                  <span className="text-xl sm:text-2xl font-sporty text-accent-gold text-glow-gold tracking-wide truncate block">
                    {formatRupees(auctionState.soldInfo.price)}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-8 text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase select-none animate-pulse">
              Reverting to drafting queue in 4 seconds...
            </div>
          </div>
        )}

        {/* STATE D: UNSOLD SCREEN */}
        {auctionState.liveStatus === 'unsold' && auctionState.livePlayer && (
          <div className="glass-panel rounded-3xl border border-red-500/30 shadow-[0_0_30px_rgba(239,68,68,0.1)] p-10 text-center relative overflow-hidden flex flex-col items-center">
            
            <div className="absolute inset-0 turf-overlay opacity-20 z-0"></div>

            <div className="relative z-10 py-2 px-8 bg-red-600 text-white font-sporty tracking-[0.2em] text-2xl font-black rounded-lg uppercase shadow-2xl mb-8 select-none">
              🚫 UNSOLD
            </div>

            <img
              src={auctionState.livePlayer.photo}
              alt="unsold player"
              className="relative z-10 w-40 h-40 rounded-full border-4 border-red-950 bg-primary-dark shadow-xl object-cover mb-6 select-none opacity-50"
            />

            <h2 className="relative z-10 text-4xl font-sporty tracking-wide text-white mb-2 uppercase">
              {auctionState.livePlayer.name}
            </h2>

            <p className="relative z-10 text-sm tracking-[0.2em] font-bold text-red-400 uppercase">
              Draft Candidate Passed
            </p>

            <div className="relative z-10 mt-8 text-[10px] font-semibold tracking-[0.15em] text-gray-500 uppercase select-none">
              Returning to Waiting Stage shortly...
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default AuctionPage;
