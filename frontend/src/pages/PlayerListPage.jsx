import React, { useState, useEffect } from 'react';
import {
  getPlayers,
  formatRupees
} from '../utils/localStorageHelper';
import { socket } from '../utils/socket';
import './PlayerListPage.css';

const PlayerListPage = () => {
  const [players, setPlayers] = useState([]);
  
  // Search & Filter Settings
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const loadPlayers = async () => {
      const p = await getPlayers();
      setPlayers(p);
    };
    loadPlayers();

    socket.on('playersUpdated', (data) => setPlayers(data));

    return () => {
      socket.off('playersUpdated');
    };
  }, []);

  // Filter logic
  const filteredPlayers = players.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory ? p.category === filterCategory : true;
    const matchesStatus = filterStatus ? p.status === filterStatus : true;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-24 relative animate-page-in">
      <div className="stadium-light-overlay absolute inset-0 z-0"></div>

      <div className="relative z-10 mb-8">
        <h1 className="text-5xl font-sporty tracking-wider text-accent-gold text-center sm:text-left">
          DRAFT POOL DIRECTORY
        </h1>
        <p className="text-xs tracking-[0.2em] font-semibold text-gray-400 uppercase mt-1 text-center sm:text-left">
          All registered draft candidates, pricing brackets, and contract statuses
        </p>
      </div>

      {/* Directory Filter controls */}
      <div className="relative z-10 glass-panel rounded-2xl border border-white/10 p-5 mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Search Input bar */}
        <div className="md:col-span-2">
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Search Candidate Name
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter name (e.g. Virat)..."
              className="w-full pl-9 pr-4 py-2 bg-primary-dark border border-white/10 rounded-lg text-white text-xs font-semibold focus:outline-none focus:border-accent-gold placeholder:text-gray-600"
            />
          </div>
        </div>

        {/* Category Select */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Grade Category
          </label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-3 py-2 bg-primary-dark border border-white/10 rounded-lg text-white text-xs font-semibold focus:outline-none focus:border-accent-gold"
          >
            <option value="">All Categories</option>
            <option value="A">Category A</option>
            <option value="B">Category B</option>
            <option value="C">Category C</option>
          </select>
        </div>

        {/* Status Select */}
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
            Contract Status
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full px-3 py-2 bg-primary-dark border border-white/10 rounded-lg text-white text-xs font-semibold focus:outline-none focus:border-accent-gold"
          >
            <option value="">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Live">Live</option>
            <option value="Sold">Sold</option>
            <option value="Unsold">Unsold</option>
          </select>
        </div>

      </div>

      {/* Grid List of Roster Cards */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPlayers.length === 0 ? (
          <div className="col-span-full py-20 text-center text-gray-500 font-medium">
            No draft candidates match your search filters.
          </div>
        ) : (
          filteredPlayers.map(p => (
            <div
              key={p._id || p.id}
              className={`glass-panel rounded-2xl border transition-all duration-300 overflow-hidden shadow-lg relative flex flex-col justify-between ${
                p.status === 'Live'
                  ? 'border-accent-gold/50 shadow-[0_0_20px_rgba(245,166,35,0.1)] scale-[1.02]'
                  : p.status === 'Sold'
                  ? 'border-green-500/20 opacity-85'
                  : p.status === 'Unsold'
                  ? 'border-red-500/20 opacity-80'
                  : 'border-white/5 hover:border-white/15 hover:scale-[1.01]'
              }`}
            >
              {/* Top Banner indicating status */}
              <div className={`py-1.5 px-4 text-center text-[10px] font-black uppercase tracking-widest flex justify-between items-center ${
                p.status === 'Sold'
                  ? 'bg-green-500/10 text-green-400'
                  : p.status === 'Unsold'
                  ? 'bg-red-500/10 text-red-400'
                  : p.status === 'Live'
                  ? 'bg-accent-gold text-primary-dark live-pulse-badge font-black'
                  : 'bg-[#1b263b]/30 text-gray-400'
              }`}>
                <span>Category {p.category}</span>
                <span className="font-extrabold">{p.status}</span>
              </div>

              {/* Profile Body */}
              <div className="p-5 flex gap-4 items-center">
                <img
                  src={p.photo}
                  alt={p.name}
                  className="w-20 h-20 rounded-full border border-white/10 bg-primary-dark object-cover select-none"
                />
                
                <div className="min-w-0 space-y-1">
                  <h3 className="text-xl font-sporty tracking-wide text-white truncate leading-tight">
                    {p.name}
                  </h3>
                  <div className="text-xs text-gray-400">
                    Base: <span className="font-bold text-gray-300">{formatRupees(p.basePrice)}</span>
                    {p.age && <span className="text-gray-500 ml-2">• Age: {p.age}</span>}
                  </div>
                </div>
              </div>

              {/* Acquisition Details Footer (Conditional) */}
              <div className={`p-4 border-t text-xs ${
                p.status === 'Sold'
                  ? 'bg-green-950/15 border-green-500/10'
                  : p.status === 'Unsold'
                  ? 'bg-red-950/15 border-red-500/10'
                  : p.status === 'Live'
                  ? 'bg-accent-gold/5 border-accent-gold/10'
                  : 'bg-primary-dark/30 border-white/5'
              }`}>
                {p.status === 'Sold' ? (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 truncate">Bought by: <strong className="text-gray-200">{p.winningTeam}</strong></span>
                    <span className="font-black text-accent-gold text-sm">{formatRupees(p.finalPrice)}</span>
                  </div>
                ) : p.status === 'Unsold' ? (
                  <span className="text-red-400 font-bold block text-center uppercase tracking-wider text-[10px]">
                    Passed • Uncontracted draft candidate
                  </span>
                ) : p.status === 'Live' ? (
                  <span className="text-accent-gold font-bold block text-center uppercase tracking-wider text-[10px] animate-pulse">
                    ⚡ Currently Live on Main Stage!
                  </span>
                ) : (
                  <span className="text-gray-500 block text-center uppercase tracking-wider text-[10px]">
                    Awaiting bidding queue entry
                  </span>
                )}
              </div>

            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PlayerListPage;
