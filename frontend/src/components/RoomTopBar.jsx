import React from 'react';
import { Link } from 'react-router-dom';

const RoomTopBar = ({ roomId, roomName, liveStatus, timerSeconds, isConnected }) => {
  const getCountdownTime = (seconds) => {
    const remaining = Math.max(0, 30 - seconds);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const countdown = Math.max(0, 30 - timerSeconds);

  let timerColorClass = 'text-[#F8FAFC]';
  let pulseClass = '';
  if (liveStatus === 'live') {
    if (countdown <= 3) {
      timerColorClass = 'text-[#DC2626] font-bold';
      pulseClass = 'timer-pulse-active';
    } else if (countdown <= 5) {
      timerColorClass = 'text-[#DC2626] font-bold';
    } else if (countdown <= 10) {
      timerColorClass = 'text-[#F59E0B] font-bold';
    }
  }

  return (
    <div className="w-full bg-[#1A2430] border-b border-white/5 py-4 px-8 select-none shadow-sm relative z-25">
      <div className="max-w-[90%] mx-auto flex justify-between items-center text-sm">
        
        {/* Left: Logo & Connection */}
        <div className="flex items-center space-x-6">
          <Link to="/" className="flex items-center space-x-2 font-bold tracking-wider text-[#C8A03C] hover:opacity-90 transition-opacity">
            <span>🏏</span>
            <span className="font-sporty text-lg tracking-wider uppercase">SUPER PLAYER AUCTION</span>
          </Link>
          
          <div className="text-xs text-[#94A3B8] font-medium">
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
        </div>

        {/* Center: Room Name & Status */}
        <div className="flex items-center space-x-4">
          <span className="font-bold text-[#F8FAFC]">
            Room {roomName || roomId}
          </span>
          
          <div className="h-3 w-[1px] bg-white/10"></div>
          
          <div>
            {liveStatus === 'live' ? (
              <span className="px-2.5 py-0.5 bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] text-[10px] font-bold uppercase rounded">
                LIVE
              </span>
            ) : liveStatus === 'sold' ? (
              <span className="px-2.5 py-0.5 bg-[#16A34A]/10 border border-[#16A34A]/20 text-[#16A34A] text-[10px] font-bold uppercase rounded">
                SOLD
              </span>
            ) : liveStatus === 'unsold' ? (
              <span className="px-2.5 py-0.5 bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] text-[10px] font-bold uppercase rounded">
                UNSOLD
              </span>
            ) : (
              <span className="px-2.5 py-0.5 bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-bold uppercase rounded">
                WAITING
              </span>
            )}
          </div>
        </div>

        {/* Right: Live Countdown Timer */}
        <div className="flex items-center space-x-2 text-xs font-medium text-[#94A3B8]">
          <span>Time Left</span>
          <div className={`px-2.5 py-1 bg-[#263241] border border-white/5 rounded text-sm font-mono tracking-wider text-center min-w-[55px] transition-all duration-200 ${timerColorClass} ${pulseClass}`}>
            {liveStatus === 'live' ? getCountdownTime(timerSeconds) : '00:00'}
          </div>
        </div>

      </div>
    </div>
  );
};

export default RoomTopBar;
