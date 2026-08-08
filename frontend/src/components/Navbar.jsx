import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();
  
  // Extract roomId from path (e.g. /room/6a72190c...)
  const match = location.pathname.match(/^\/room\/([^/]+)/);
  const roomId = match ? match[1] : null;

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Monitor fullscreen status
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // Hide Navbar completely on the main lobby page
  if (location.pathname === '/' || !roomId) {
    return null;
  }

  const isAdmin = sessionStorage.getItem(`room_admin_${roomId}`) === 'true';

  const navItems = [
    { path: `/room/${roomId}`, label: 'Auction Page', icon: '🏏' },
    { path: `/room/${roomId}/summary`, label: 'Summary', icon: '📊' },
    { path: `/room/${roomId}/players`, label: 'Player List', icon: '👥' },
    { path: `/room/${roomId}/teams`, label: 'Team Hub', icon: '🛡️' },
    { path: `/room/${roomId}/category`, label: 'Category', icon: '🏷️' }
  ];

  if (isAdmin) {
    navItems.push({ path: `/room/${roomId}/manage`, label: 'Manage', icon: '⚙️' });
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#1A2430]/90 backdrop-blur-md border-t border-white/5 shadow-lg">
      <div className="max-w-[90%] mx-auto px-6">
        <div className="flex justify-between items-center h-16">
          {/* Main Links */}
          <div className="flex space-x-4 sm:space-x-8 overflow-x-auto no-scrollbar scroll-smooth flex-grow py-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex items-center space-x-2.5 px-4 py-2 text-xs font-bold uppercase select-none whitespace-nowrap group rounded-md transition-all duration-200 ease-out hover:bg-white/[0.02] ${
                    isActive
                      ? 'text-[#F8FAFC] -translate-y-[2px]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:-translate-y-[2px]'
                  }`}
                >
                  <span className={`text-[16px] transition-opacity duration-200 ease-out ${
                    isActive ? 'opacity-100' : 'opacity-70 group-hover:opacity-100'
                  }`}>
                    {item.icon}
                  </span>
                  <span className="hidden md:inline font-sans tracking-[0.05em]">{item.label}</span>
                  <span className="md:hidden font-sans text-xs tracking-wider">
                    {item.label.split(' ')[0]}
                  </span>
                  
                  {/* Underline Indicator for Active State */}
                  <span className={`absolute bottom-0 left-4 right-4 h-[2px] bg-[#C8A03C] transition-all duration-200 ease-out rounded ${
                    isActive ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0 group-hover:scale-x-50 group-hover:opacity-50'
                  }`} />
                </Link>
              );
            })}
          </div>

          {/* Full Screen Toggler */}
          <div className="pl-6 border-l border-white/5 flex items-center h-8 select-none">
            <button
              onClick={toggleFullscreen}
              className={`flex items-center space-x-2 px-4 py-2 rounded-[10px] text-xs font-bold tracking-wider uppercase font-sans border transition-all duration-150 active:scale-[0.97] hover:-translate-y-[2px] cursor-pointer ${
                isFullscreen
                  ? 'bg-red-600/10 border-red-500/35 text-red-500 hover:bg-red-600/20'
                  : 'bg-transparent border-white/10 text-[#C8A03C] hover:border-[#C8A03C]/30 hover:bg-white/5'
              }`}
            >
              <span>{isFullscreen ? '⏳' : '⛶'}</span>
              <span className="hidden sm:inline">{isFullscreen ? 'Exit Full' : 'Full Screen'}</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
