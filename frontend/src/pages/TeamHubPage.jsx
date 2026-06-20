import React, { useState, useEffect } from 'react';
import {
  getPlayers,
  getTeams,
  formatRupees,
  getRules,
  initializeDatabase
} from '../utils/localStorageHelper';
import { socket } from '../utils/socket';
import './TeamHubPage.css';

const TeamHubPage = () => {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [rules, setRules] = useState({
    basePrices: { A: 10000000, B: 5000000, C: 2000000 },
    slots: { A: 2, B: 3, C: 5 },
    minPlayers: 5,
    maxPlayers: 15
  });
  
  // Selected Team Context ID
  const [selectedTeamId, setSelectedTeamId] = useState(() => {
    return localStorage.getItem('team_hub_context_id') || '';
  });

  // Filters for the Upcoming Pipeline section
  const [pipelineCategoryFilter, setPipelineCategoryFilter] = useState('All');
  const [pipelineSearchQuery, setPipelineSearchQuery] = useState('');

  // Load all databases
  const syncState = async () => {
    const p = await getPlayers();
    const t = await getTeams();
    const r = await getRules();
    setPlayers(p);
    setTeams(t);
    setRules(r);
  };

  useEffect(() => {
    syncState();
    
    socket.on('playersUpdated', (data) => setPlayers(data));
    socket.on('teamsUpdated', (data) => setTeams(data));
    socket.on('rulesUpdated', (data) => setRules(data));

    return () => {
      socket.off('playersUpdated');
      socket.off('teamsUpdated');
      socket.off('rulesUpdated');
    };
  }, []);

  // Save selected team preference to localStorage so it stays active on reload
  const handleSelectTeam = (id) => {
    setSelectedTeamId(id);
    if (id) {
      localStorage.setItem('team_hub_context_id', id);
    } else {
      localStorage.removeItem('team_hub_context_id');
    }
  };

  // Find selected team details
  const activeTeam = teams.find(t => (t._id || t.id) === selectedTeamId);
  const activeTeamPlayers = activeTeam
    ? players.filter(p => p.status === 'Sold' && p.winningTeam === activeTeam.name)
    : [];

  // Filter pending players (upcoming)
  const upcomingPlayers = players.filter(p => {
    const isPending = p.status === 'Pending';
    const matchesCategory = pipelineCategoryFilter === 'All' ? true : p.category === pipelineCategoryFilter;
    const matchesSearch = p.name.toLowerCase().includes(pipelineSearchQuery.toLowerCase());
    return isPending && matchesCategory && matchesSearch;
  });

  // Get logo emoji based on franchise name
  const getTeamEmoji = (teamName) => {
    if (!teamName) return '🛡️';
    const name = teamName.toLowerCase();
    if (name.includes('chennai')) return '🦁';
    if (name.includes('mumbai')) return '⚡';
    if (name.includes('pune')) return '🐾';
    if (name.includes('bangalore')) return '🐂';
    if (name.includes('delhi')) return '🌪️';
    if (name.includes('kolkata')) return '👑';
    return '🛡️';
  };

  // 1. SELECTOR GRID PORTAL (No team selected)
  if (!activeTeam) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 pb-24 relative select-none animate-slide-up">
        <div className="text-center mb-10">
          <h1 className="text-5xl font-sporty tracking-wider text-accent-gold">
            FRANCHISE SQUAD HQ
          </h1>
          <p className="text-xs tracking-[0.2em] font-semibold text-gray-400 uppercase mt-1">
            Select your franchise to enter the team command dashboard
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {teams.map(t => {
            const boughtCount = players.filter(p => p.status === 'Sold' && p.winningTeam === t.name).length;
            const emoji = getTeamEmoji(t.name);
            return (
              <button
                key={t._id || t.id}
                onClick={() => handleSelectTeam(t._id || t.id)}
                className="team-select-card glass-panel rounded-2xl border border-white/5 p-6 text-center flex flex-col items-center justify-between cursor-pointer"
              >
                <div className="text-5xl mb-4">{emoji}</div>
                <h3 className="text-xl font-bold font-sporty text-white tracking-wide uppercase mb-2">
                  {t.name}
                </h3>
                <div className="w-full border-t border-white/5 pt-3 flex justify-between text-xs text-gray-400">
                  <span>Wallet: <strong className="text-accent-gold">{formatRupees(t.budget)}</strong></span>
                  <span>Roster: <strong className="text-white">{boughtCount}</strong></span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // 2. DASHBOARD VIEW (Team Context Active)
  const spendPercentage = ((activeTeam.initialBudget - activeTeam.budget) / activeTeam.initialBudget) * 100;
  
  // Roster slot math
  const boughtA = activeTeamPlayers.filter(p => p.category === 'A').length;
  const boughtB = activeTeamPlayers.filter(p => p.category === 'B').length;
  const boughtC = activeTeamPlayers.filter(p => p.category === 'C').length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 pb-24 relative animate-slide-up select-text">
      
      {/* Top Banner Control Deck */}
      <div className="glass-panel active-squad-glow rounded-3xl border p-6 flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
        <div className="flex items-center space-x-5 select-none">
          <div className="text-6xl bg-primary-dark border border-white/10 p-3 rounded-2xl">
            {getTeamEmoji(activeTeam.name)}
          </div>
          <div>
            <h1 className="text-4xl font-sporty tracking-wide text-white uppercase leading-none">
              {activeTeam.name}
            </h1>
            <p className="text-xs uppercase tracking-widest text-accent-gold font-bold mt-1">
              Active Team HQ Control Room
            </p>
          </div>
        </div>

        {/* Budget Bar and Selector Switch */}
        <div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-6">
          <div className="w-full sm:w-64 space-y-1.5 select-none">
            <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
              <span className="text-gray-400">Cap Space Left:</span>
              <span className="text-accent-gold">{formatRupees(activeTeam.budget)}</span>
            </div>
            <div className="w-full h-3 bg-primary-dark/80 rounded-full overflow-hidden border border-white/5">
              <div 
                className="h-full bg-accent-gold rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, 100 - spendPercentage))}%` }}
              />
            </div>
          </div>

          <button
            onClick={() => handleSelectTeam('')}
            className="w-full sm:w-auto px-5 py-3 bg-secondary-dark hover:bg-white/10 border border-white/10 hover:border-accent-gold/40 text-gray-300 hover:text-white text-xs font-bold uppercase tracking-widest rounded-xl transition duration-300 cursor-pointer select-none"
          >
            🔄 Switch Team
          </button>
        </div>
      </div>

      {/* Main 3-Column Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUMN 1: SQUAD ROSTER (LEFT) */}
        <div className="glass-panel rounded-2xl border border-white/10 p-5 flex flex-col h-[75vh]">
          <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-3 select-none">
            <h2 className="text-xl font-sporty tracking-wider text-white">
              🛡️ YOUR ACQUIRED SQUAD ({activeTeamPlayers.length})
            </h2>
            {activeTeamPlayers.length < (rules.minPlayers || 5) ? (
              <span className="text-[10px] text-yellow-500 font-bold">UNDERSIZE ({activeTeamPlayers.length}/{rules.minPlayers || 5})</span>
            ) : activeTeamPlayers.length >= (rules.maxPlayers || 15) ? (
              <span className="text-[10px] text-red-500 font-bold">SQUAD FULL ({activeTeamPlayers.length}/{rules.maxPlayers || 15})</span>
            ) : (
              <span className="text-[10px] text-green-500 font-bold">SQUAD VALID</span>
            )}
          </div>

          {/* Slots checklist summary */}
          <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-gray-400 mb-4 select-none">
            <div className="py-1.5 rounded border border-white/5 bg-primary-dark/40">
              🅰️ Category A: {boughtA}
            </div>
            <div className="py-1.5 rounded border border-white/5 bg-primary-dark/40">
              🅱️ Category B: {boughtB}
            </div>
            <div className="py-1.5 rounded border border-white/5 bg-primary-dark/40">
              🅲 Category C: {boughtC}
            </div>
          </div>

          {/* Roster list */}
          <div className="flex-grow overflow-y-auto custom-scroll-container pr-1 space-y-3">
            {activeTeamPlayers.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-gray-500 text-xs py-20 select-none">
                No players have been acquired under your franchise yet.
              </div>
            ) : (
              activeTeamPlayers.map(p => (
                <div key={p._id || p.id} className="bg-primary-dark/40 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-4">
                  <div className="flex items-center space-x-3 min-w-0">
                    <img 
                      src={p.photo} 
                      alt={p.name} 
                      className="w-12 h-12 rounded-full border border-white/10 bg-primary-dark object-cover select-none"
                    />
                    <div className="min-w-0">
                      <span className="block font-bold text-white text-sm truncate">{p.name}</span>
                      <span className="text-[10px] text-gray-400 font-bold uppercase">
                        Cat {p.category} • Age: {p.age || '—'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="block text-xs text-gray-500 font-bold uppercase select-none">Hammer Price</span>
                    <span className="block font-sporty text-accent-gold text-base">{formatRupees(p.finalPrice)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMN 2: COMPETITOR WATCH (MIDDLE) */}
        <div className="glass-panel rounded-2xl border border-white/10 p-5 flex flex-col h-[75vh]">
          <div className="mb-4 border-b border-white/5 pb-3 select-none">
            <h2 className="text-xl font-sporty tracking-wider text-white">
              👁️ COMPETITOR WATCH DECK
            </h2>
            <p className="text-[10px] text-gray-400 uppercase mt-0.5 font-semibold">Monitor bidding leverage and budget</p>
          </div>

          <div className="flex-grow overflow-y-auto custom-scroll-container pr-1 space-y-4">
            {teams.filter(t => (t._id || t.id) !== (activeTeam._id || activeTeam.id)).map(t => {
              const oppPlayers = players.filter(p => p.status === 'Sold' && p.winningTeam === t.name);
              const spent = t.initialBudget - t.budget;
              const emoji = getTeamEmoji(t.name);
              
              const oppA = oppPlayers.filter(p => p.category === 'A').length;
              const oppB = oppPlayers.filter(p => p.category === 'B').length;
              const oppC = oppPlayers.filter(p => p.category === 'C').length;

              return (
                <div key={t._id || t.id} className="bg-primary-dark/30 border border-white/5 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2.5">
                      <span className="text-2xl select-none">{emoji}</span>
                      <h4 className="font-bold text-white uppercase text-xs truncate max-w-[130px]" title={t.name}>{t.name}</h4>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block uppercase select-none">Wallet Left</span>
                      <span className="font-bold text-accent-gold text-xs">{formatRupees(t.budget)}</span>
                    </div>
                  </div>

                  {/* Opponent Progress indicators */}
                  <div className="grid grid-cols-3 gap-1.5 text-[9px] text-center font-bold text-gray-400 select-none">
                    <div className="py-1 rounded bg-primary-dark/65">
                      🅰️ {oppA}
                    </div>
                    <div className="py-1 rounded bg-primary-dark/65">
                      🅱️ {oppB}
                    </div>
                    <div className="py-1 rounded bg-primary-dark/65">
                      🅲 {oppC}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN 3: PIPELINE PIPES (RIGHT - YET TO COME) */}
        <div className="glass-panel rounded-2xl border border-white/10 p-5 flex flex-col h-[75vh]">
          <div className="mb-4 border-b border-white/5 pb-3 select-none">
            <h2 className="text-xl font-sporty tracking-wider text-white">
              🎯 PLAYERS YET TO COME ({upcomingPlayers.length})
            </h2>
            <p className="text-[10px] text-gray-400 uppercase mt-0.5 font-semibold">Forecast drafts and configure budget bidding plans</p>
          </div>

          {/* Filter Pipeline Deck */}
          <div className="space-y-3 mb-4 select-none">
            {/* Search filter input */}
            <input
              type="text"
              value={pipelineSearchQuery}
              onChange={(e) => setPipelineSearchQuery(e.target.value)}
              placeholder="Search upcoming names..."
              className="w-full px-3 py-2 bg-primary-dark border border-white/10 rounded-lg text-white text-xs font-semibold focus:outline-none focus:border-accent-gold placeholder:text-gray-600"
            />
            
            {/* Category horizontal filters */}
            <div className="flex gap-1.5 p-0.5 bg-primary-dark/60 rounded-lg border border-white/5">
              {['All', 'A', 'B', 'C'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setPipelineCategoryFilter(cat)}
                  className={`flex-grow py-1 rounded text-[10px] font-bold uppercase transition duration-200 cursor-pointer ${
                    pipelineCategoryFilter === cat
                      ? 'bg-accent-gold text-primary-dark'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {cat === 'All' ? 'All' : `Cat ${cat}`}
                </button>
              ))}
            </div>
          </div>

          {/* Upcoming players scroll list */}
          <div className="flex-grow overflow-y-auto custom-scroll-container pr-1 space-y-3">
            {upcomingPlayers.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center text-gray-500 text-xs py-20 select-none">
                No upcoming players fit your filter query.
              </div>
            ) : (
              upcomingPlayers.map(p => (
                <div key={p._id || p.id} className="bg-primary-dark/40 border border-white/5 rounded-xl p-3 flex items-center justify-between gap-4">
                  <div className="flex items-center space-x-3 min-w-0">
                    <img 
                      src={p.photo} 
                      alt={p.name} 
                      className="w-10 h-10 rounded-full border border-white/10 bg-primary-dark object-cover select-none"
                    />
                    <div className="min-w-0">
                      <span className="block font-bold text-white text-xs truncate">{p.name}</span>
                      <span className="text-[9px] text-gray-500 font-bold uppercase">
                        Age: {p.age || '—'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="bg-[#1b263b] border border-white/5 text-accent-gold px-2 py-0.5 rounded text-[8px] font-bold uppercase">
                      Cat {p.category}
                    </span>
                    <span className="block font-bold text-[10px] text-gray-300 mt-1 select-none">
                      {formatRupees(p.basePrice)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default TeamHubPage;
