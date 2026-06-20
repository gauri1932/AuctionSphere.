import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';

const Navbar = () => {
  const location = useLocation();
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

  const navItems = [
    { path: '/', label: 'Auction Page', icon: '🏏' },
    { path: '/summary', label: 'Summary', icon: '📊' },
    { path: '/players', label: 'Player List', icon: '👥' },
    { path: '/teams', label: 'Team Hub', icon: '🛡️' },
    { path: '/category', label: 'Category', icon: '🏷️' },
    { path: '/manage', label: 'Manage', icon: '⚙️' }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-white/10 shadow-[0_-5px_30px_rgba(0,0,0,0.5)]">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          {/* Main Links */}
          <div className="flex space-x-1 sm:space-x-4 overflow-x-auto no-scrollbar scroll-smooth flex-grow py-1">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium tracking-wide uppercase transition-all duration-300 select-none whitespace-nowrap ${
                    isActive
                      ? 'bg-accent-gold text-primary-dark font-bold scale-105 shadow-lg glow-gold'
                      : 'text-gray-300 hover:text-accent-gold hover:bg-white/5'
                  }`}
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="hidden md:inline font-sporty tracking-[0.05em]">{item.label}</span>
                  <span className="md:hidden font-sporty text-xs tracking-wider">
                    {item.label.split(' ')[0]}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Full Screen Toggler */}
          <div className="pl-4 border-l border-white/10 flex items-center h-8 select-none">
            <button
              onClick={toggleFullscreen}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium tracking-wide uppercase font-sporty transition-all duration-300 ${
                isFullscreen
                  ? 'bg-red-600 hover:bg-red-700 text-white font-bold glow-red shadow-lg'
                  : 'bg-secondary-dark hover:bg-white/10 text-accent-gold border border-accent-gold/30 hover:border-accent-gold'
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
