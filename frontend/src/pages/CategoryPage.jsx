import React, { useState, useEffect } from 'react';
import {
  getPlayers,
  formatRupees
} from '../utils/localStorageHelper';
import { socket } from '../utils/socket';
import './CategoryPage.css';

const CategoryPage = () => {
  const [players, setPlayers] = useState([]);

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

  // Compute category details
  const getCategoryMetrics = (cat) => {
    const catPlayers = players.filter(p => p.category === cat);
    const soldCount = catPlayers.filter(p => p.status === 'Sold').length;
    const totalCount = catPlayers.length;
    const averageBase = totalCount
      ? catPlayers.reduce((sum, p) => sum + p.basePrice, 0) / totalCount
      : 0;

    return {
      category: cat,
      totalCount,
      soldCount,
      pendingCount: catPlayers.filter(p => p.status === 'Pending').length,
      unsoldCount: catPlayers.filter(p => p.status === 'Unsold').length,
      averageBase
    };
  };

  const categories = [
    {
      ...getCategoryMetrics('A'),
      icon: '⭐',
      label: 'Category A (Elite)',
      desc: 'Premium marquee players & high-value assets',
      colorClass: 'border-yellow-500/25 bg-yellow-950/10 text-accent-gold'
    },
    {
      ...getCategoryMetrics('B'),
      icon: '⚡',
      label: 'Category B (Star)',
      desc: 'Consistent performers & strong squad pillars',
      colorClass: 'border-blue-500/25 bg-blue-950/10 text-blue-400'
    },
    {
      ...getCategoryMetrics('C'),
      icon: '🌟',
      label: 'Category C (Valued)',
      desc: 'Emerging prospects & crucial support athletes',
      colorClass: 'border-purple-500/25 bg-purple-950/10 text-purple-400'
    }
  ];

  // Overall counts
  const totalPlayersCount = players.length;
  const totalSold = players.filter(p => p.status === 'Sold').length;
  const totalUnsold = players.filter(p => p.status === 'Unsold').length;
  const overallSpent = players.reduce((sum, p) => sum + (p.finalPrice || 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 pb-24 relative">
      <div className="stadium-light-overlay absolute inset-0 z-0"></div>

      <div className="relative z-10 mb-8">
        <h1 className="text-5xl font-sporty tracking-wider text-accent-gold text-center sm:text-left">
          DRAFT CATEGORY ANALYTICS
        </h1>
        <p className="text-xs tracking-[0.2em] font-semibold text-gray-400 uppercase mt-1 text-center sm:text-left">
          Roster counts, average base prices, and category drafting progression
        </p>
      </div>

      {/* Global Draft Dashboard summary */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10 select-none">
        
        <div className="glass-panel rounded-2xl border border-white/5 p-6 shadow-lg text-center space-y-1">
          <h4 className="text-gray-400 uppercase tracking-widest text-[10px] font-bold">Total Draft Pool</h4>
          <div className="text-4xl font-sporty font-extrabold text-white">{totalPlayersCount} Registered</div>
        </div>

        <div className="glass-panel rounded-2xl border border-white/5 p-6 shadow-lg text-center space-y-1">
          <h4 className="text-gray-400 uppercase tracking-widest text-[10px] font-bold">Sold Players</h4>
          <div className="text-4xl font-sporty font-extrabold text-green-400">{totalSold} Hammered</div>
        </div>

        <div className="glass-panel rounded-2xl border border-white/5 p-6 shadow-lg text-center space-y-1">
          <h4 className="text-gray-400 uppercase tracking-widest text-[10px] font-bold">Passed Unsold</h4>
          <div className="text-4xl font-sporty font-extrabold text-red-400">{totalUnsold} Unsold</div>
        </div>

        <div className="glass-panel rounded-2xl border border-white/5 p-6 shadow-lg text-center space-y-1">
          <h4 className="text-gray-400 uppercase tracking-widest text-[10px] font-bold">Total Value Drafted</h4>
          <div className="text-3xl font-sporty font-extrabold text-accent-gold tracking-wide pt-1">{formatRupees(overallSpent)}</div>
        </div>

      </div>

      {/* Categories Visual Cards grid */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {categories.map((cat, index) => {
          const completionPercentage = cat.totalCount 
            ? (cat.soldCount / cat.totalCount) * 100 
            : 0;

          return (
            <div
              key={index}
              className={`glass-panel rounded-2xl border p-6 flex flex-col justify-between shadow-xl relative overflow-hidden ${cat.colorClass}`}
            >
              <div>
                {/* Header of Category Card */}
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-3xl">{cat.icon}</span>
                      <h3 className="text-3xl font-sporty tracking-wide text-white">
                        {cat.label}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{cat.desc}</p>
                  </div>

                  <div className="text-right">
                    <span className="text-xs uppercase font-bold text-gray-500 tracking-wider">Average Base</span>
                    <span className="block text-white font-extrabold text-base mt-0.5">{formatRupees(cat.averageBase)}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-2 mt-6 select-none">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-gray-400">Draft Status Progression</span>
                    <span className="text-white font-bold">{cat.soldCount} / {cat.totalCount} Drafted ({completionPercentage.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full h-3 bg-primary-dark/80 rounded-full overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-accent-gold rounded-full transition-all duration-500"
                      style={{ width: `${completionPercentage}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Status statistics logs */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs mt-8 border-t border-white/5 pt-4 select-none">
                <div className="px-2 py-1.5 bg-primary-dark/40 rounded-lg">
                  <span className="block text-gray-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Pending</span>
                  <span className="text-gray-200 font-bold text-base">{cat.pendingCount}</span>
                </div>
                <div className="px-2 py-1.5 bg-green-950/15 rounded-lg border border-green-500/5">
                  <span className="block text-green-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Sold</span>
                  <span className="text-green-400 font-extrabold text-base">{cat.soldCount}</span>
                </div>
                <div className="px-2 py-1.5 bg-red-950/15 rounded-lg border border-red-500/5">
                  <span className="block text-red-500 text-[10px] uppercase font-bold tracking-wider mb-0.5">Unsold</span>
                  <span className="text-red-400 font-extrabold text-base">{cat.unsoldCount}</span>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryPage;
