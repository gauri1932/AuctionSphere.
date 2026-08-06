import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import LobbyPage from './pages/LobbyPage';
import Navbar from './components/Navbar';
import RoomAuthWrapper from './components/RoomAuthWrapper';
import AuctionPage from './pages/AuctionPage';
import SummaryPage from './pages/SummaryPage';
import PlayerListPage from './pages/PlayerListPage';
import CategoryPage from './pages/CategoryPage';
import AdminPage from './pages/AdminPage';
import TeamHubPage from './pages/TeamHubPage';
import './index.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-primary-dark text-white relative">
        {/* Stadium light beam graphic back-glow */}
        <div className="stadium-light-overlay absolute inset-0 z-0"></div>

        {/* Global Sports Header mimics TV broadcasts */}
        <header className="relative z-10 w-full bg-gradient-to-b from-[#1b263b] to-transparent py-6 border-b border-white/5 shadow-md">
          <div className="max-w-6xl mx-auto px-4 flex justify-between items-center select-none">
            
            {/* Branding logo title */}
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

            {/* Broadcast live tag */}
            <div className="hidden sm:flex items-center space-x-2 bg-red-600/10 border border-red-500/35 rounded-full px-3 py-1 text-[10px] font-black text-red-500 uppercase tracking-widest">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
              <span>BROADCAST STATE SYNC</span>
            </div>

          </div>
        </header>

        {/* Primary Page Canvas */}
        <main className="flex-grow relative z-10 select-text">
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
