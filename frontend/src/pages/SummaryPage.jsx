import React, { useState, useEffect } from 'react';
import {
  getPlayers,
  getTeams,
  formatRupees,
  getRules
} from '../utils/localStorageHelper';
import { socket } from '../utils/socket';
import './SummaryPage.css';

const SummaryPage = () => {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [rules, setRules] = useState({
    basePrices: { A: 1000000, B: 500000, C: 200000 },
    slots: { A: 2, B: 3, C: 5 },
    minPlayers: 5,
    maxPlayers: 15
  });

  // Filter & Sort Settings
  const [filterTeam, setFilterTeam] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [sortBy, setSortBy] = useState('price-desc'); // price-desc, price-asc, name-asc

  useEffect(() => {
    const loadData = async () => {
      const p = await getPlayers();
      const t = await getTeams();
      const r = await getRules();
      setPlayers(p);
      setTeams(t);
      setRules(r);
    };
    loadData();

    socket.on('playersUpdated', (data) => setPlayers(data));
    socket.on('teamsUpdated', (data) => setTeams(data));
    socket.on('rulesUpdated', (data) => setRules(data));

    return () => {
      socket.off('playersUpdated');
      socket.off('teamsUpdated');
      socket.off('rulesUpdated');
    };
  }, []);

  // Filter only sold players
  const soldPlayers = players.filter(p => p.status === 'Sold');

  // Filter logic
  const filteredSoldPlayers = soldPlayers.filter(p => {
    const matchesTeam = filterTeam ? p.winningTeam === filterTeam : true;
    const matchesCategory = filterCategory ? p.category === filterCategory : true;
    return matchesTeam && matchesCategory;
  });

  // Sort logic
  const sortedPlayers = [...filteredSoldPlayers].sort((a, b) => {
    if (sortBy === 'price-desc') {
      return b.finalPrice - a.finalPrice;
    }
    if (sortBy === 'price-asc') {
      return a.finalPrice - b.finalPrice;
    }
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    }
    return 0;
  });

  // Export to CSV Function
  const exportToCSV = () => {
    if (soldPlayers.length === 0) {
      alert('No sold players to export yet!');
      return;
    }

    const headers = ['Player Name', 'Category', 'Age', 'Base Price (INR)', 'Sold Price (INR)', 'Winning Team'];
    const rows = soldPlayers.map(p => [
      `"${p.name}"`,
      `"${p.category}"`,
      p.age || '',
      p.basePrice,
      p.finalPrice,
      `"${p.winningTeam}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Super_Auction_Sold_Players_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-24 relative animate-page-in">
      <div className="stadium-light-overlay absolute inset-0 z-0"></div>

      <div className="relative z-10 mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-5xl font-sporty tracking-wider text-accent-gold text-center sm:text-left">
            AUCTION STATS & STANDINGS
          </h1>
          <p className="text-xs tracking-[0.2em] font-semibold text-gray-400 uppercase mt-1 text-center sm:text-left">
            Official Draft summary, team balances, and hammer records
          </p>
        </div>

        <button
          onClick={exportToCSV}
          className="px-6 py-3.5 bg-accent-gold hover:bg-gold-hover text-primary-dark font-bold font-sporty tracking-widest text-lg uppercase rounded-xl transition duration-300 shadow-lg glow-gold hover:scale-105 cursor-pointer"
        >
          📥 Export Draft (CSV)
        </button>
      </div>

      {/* Franchise Summary Standing Grid */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {teams.map(t => {
          const playersBought = players.filter(p => p.status === 'Sold' && p.winningTeam === t.name);
          const totalSpent = t.initialBudget - t.budget;

          const catACount = playersBought.filter(p => p.category === 'A').length;
          const catBCount = playersBought.filter(p => p.category === 'B').length;
          const catCCount = playersBought.filter(p => p.category === 'C').length;

          return (
            <div key={t._id || t.id} className="glass-panel rounded-2xl border border-white/5 p-4 flex flex-col justify-between hover:border-accent-gold/20 transition-all duration-300">
              <div>
                <h4 className="font-bold text-gray-200 uppercase text-xs tracking-wider truncate mb-1">{t.name}</h4>
                <div className="text-xl font-sporty text-accent-gold tracking-wider">
                  {formatRupees(t.budget)} <span className="text-[10px] text-gray-400">left</span>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs text-gray-400 mt-4 border-t border-white/5 pt-2">
                  <span>Total Spent:</span>
                  <span className="font-bold text-gray-300">{formatRupees(totalSpent)}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-400 mt-1">
                  <span>Players:</span>
                  <span className={`font-bold px-2 py-0.5 rounded-full border text-[11px] ${
                    playersBought.length < (rules.minPlayers || 5)
                      ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
                      : playersBought.length >= (rules.maxPlayers || 15)
                        ? 'text-red-500 bg-red-500/10 border-red-500/20'
                        : 'text-white bg-accent-gold/10 border-accent-gold/20'
                  }`}>
                    {playersBought.length} / {rules.maxPlayers || 15}
                  </span>
                </div>

                {/* Grade Category Breakdown */}
                <div className="mt-3 pt-2 border-t border-white/5 grid grid-cols-3 gap-1 text-[10px] text-center font-bold text-gray-400 select-none">
                  <div className="bg-primary-dark/60 py-1 rounded" title="Category A">
                    🅰️ {catACount}
                  </div>
                  <div className="bg-primary-dark/60 py-1 rounded" title="Category B">
                    🅱️ {catBCount}
                  </div>
                  <div className="bg-primary-dark/60 py-1 rounded" title="Category C">
                    🅲 {catCCount}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters Panel */}
      <div className="relative z-10 glass-panel rounded-2xl border border-white/10 p-5 mb-8 flex flex-col md:flex-row justify-between gap-4">
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 flex-grow">
          {/* Franchise filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Filter by Franchise
            </label>
            <select
              value={filterTeam}
              onChange={(e) => setFilterTeam(e.target.value)}
              className="w-full px-3 py-2 bg-primary-dark border border-white/10 rounded-lg text-white text-xs font-semibold focus:outline-none focus:border-accent-gold"
            >
              <option value="">All Teams ({soldPlayers.length})</option>
              {teams.map(t => (
                <option key={t._id || t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Category filter */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Filter by Category
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

          {/* Sorter Dropdown */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">
              Sort Order
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 bg-primary-dark border border-white/10 rounded-lg text-white text-xs font-semibold focus:outline-none focus:border-accent-gold"
            >
              <option value="price-desc">Price: High to Low 📈</option>
              <option value="price-asc">Price: Low to High 📉</option>
              <option value="name-asc">Name: A to Z 🔠</option>
            </select>
          </div>
        </div>

      </div>

      {/* Roster Acquired Table */}
      <div className="relative z-10 glass-panel rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-primary-dark/80 border-b border-white/10 text-gray-400 font-bold uppercase tracking-wider text-xs select-none">
                <th className="py-4 px-6 text-center w-20">Photo</th>
                <th className="py-4 px-6">Player Name</th>
                <th className="py-4 px-6">Grade Category</th>
                <th className="py-4 px-6">Age</th>
                <th className="py-4 px-6">Base Value</th>
                <th className="py-4 px-6">Winning Bid</th>
                <th className="py-4 px-6">Bought Franchise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedPlayers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-16 text-center text-gray-500 font-medium">
                    {soldPlayers.length === 0
                      ? "No players have been auctioned off yet. Keep drafting!"
                      : "No drafted players match the selected filters."}
                  </td>
                </tr>
              ) : (
                sortedPlayers.map(p => (
                  <tr key={p._id || p.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Photo thumbnail */}
                    <td className="py-3 px-6 text-center select-none">
                      <img
                        src={p.photo}
                        alt={p.name}
                        className="w-12 h-12 rounded-full border border-white/15 bg-primary-dark object-cover mx-auto"
                      />
                    </td>

                    {/* Name */}
                    <td className="py-3 px-6 font-bold text-white text-base">
                      {p.name}
                    </td>

                    {/* Category badge */}
                    <td className="py-3 px-6 select-none">
                      <span className="bg-[#1b263b] border border-white/5 text-accent-gold font-semibold uppercase px-3 py-1 rounded-full text-xs">
                        {p.category === 'A' ? '⭐ Cat A' : p.category === 'B' ? '⚡ Cat B' : '🌟 Cat C'}
                      </span>
                    </td>

                    {/* Age */}
                    <td className="py-3 px-6 text-gray-300">
                      {p.age || '—'}
                    </td>

                    {/* Base Value */}
                    <td className="py-3 px-6 text-gray-400">
                      {formatRupees(p.basePrice)}
                    </td>

                    {/* Winning Bid */}
                    <td className="py-3 px-6 font-extrabold text-accent-gold text-base">
                      {formatRupees(p.finalPrice)}
                    </td>

                    {/* Bought Team */}
                    <td className="py-3 px-6 font-bold text-gray-200 uppercase tracking-wide">
                      🛡️ {p.winningTeam}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default SummaryPage;
