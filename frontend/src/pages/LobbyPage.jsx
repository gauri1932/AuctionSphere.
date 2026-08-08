import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignedIn, SignedOut, SignInButton, UserButton, useUser, useAuth } from '@clerk/clerk-react';
import './LobbyPage.css';
import { API_URL } from '../utils/apiConfig';

const LobbyPage = () => {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Room Creation Form State
  const [roomName, setRoomName] = useState('');
  const [passkey, setPasskey] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Passkey Modal State
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [enteredPasskey, setEnteredPasskey] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState('');

  const navigate = useNavigate();
  const { isLoaded: authLoaded, getToken } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const clerkLoaded = authLoaded && userLoaded;

  // Fetch all rooms on boot
  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/rooms`);
      if (!res.ok) throw new Error('Failed to load rooms');
      const data = await res.json();
      setRooms(data);
      setError('');
    } catch (err) {
      console.error(err);
      setError('Could not connect to the server. Please ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Room Creation
  const handleCreateRoom = async (e) => {
    e.preventDefault();
    if (!roomName.trim() || !passkey.trim()) {
      setCreateError('Please fill in all fields.');
      return;
    }
    
    try {
      setCreating(true);
      setCreateError('');
      const token = await getToken();

      const res = await fetch(`${API_URL}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name: roomName, passkey })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create room');
      }

      const newRoom = await res.json();
      
      // Auto authorize room admin locally
      sessionStorage.setItem(`room_auth_${newRoom._id}`, 'true');
      sessionStorage.setItem(`room_admin_${newRoom._id}`, 'true');
      sessionStorage.setItem(`room_name_${newRoom._id}`, newRoom.name);

      // Navigate straight to the admin manager page
      navigate(`/room/${newRoom._id}/manage`);
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Open Passkey prompt or auto-redirect if already verified
  const handleRoomClick = async (room) => {
    const isAuth = sessionStorage.getItem(`room_auth_${room._id}`) === 'true';
    if (isAuth) {
      sessionStorage.setItem(`room_name_${room._id}`, room.name);
      navigate(`/room/${room._id}`);
      return;
    }

    // Otherwise, open passkey verification modal
    setSelectedRoom(room);
    setEnteredPasskey('');
    setVerificationError('');
  };

  // Verify Passkey
  const handleVerifyPasskey = async (e) => {
    e.preventDefault();
    if (!enteredPasskey.trim()) return;

    try {
      setVerifying(true);
      setVerificationError('');
      
      let headers = { 'Content-Type': 'application/json' };
      // Check if user has token (optional, in case they are authenticated)
      const token = await getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_URL}/rooms/${selectedRoom._id}/verify-passkey`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ passkey: enteredPasskey })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Incorrect passkey');
      }

      if (data.success) {
        sessionStorage.setItem(`room_auth_${selectedRoom._id}`, 'true');
        sessionStorage.setItem(`room_name_${selectedRoom._id}`, selectedRoom.name);
        if (data.isAdmin) {
          sessionStorage.setItem(`room_admin_${selectedRoom._id}`, 'true');
        }
        setSelectedRoom(null);
        navigate(`/room/${selectedRoom._id}`);
      }
    } catch (err) {
      setVerificationError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 relative select-none">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left/Middle: Rooms Lobby list */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center border-b border-white/10 pb-4">
            <div>
              <h1 className="text-3xl font-sporty tracking-wider text-accent-gold text-glow-gold">DRAFT BOARD LOBBY</h1>
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mt-1">Select an active room or join an ongoing draft</p>
            </div>
            <button 
              onClick={fetchRooms}
              className="px-4 py-2 bg-secondary-dark/60 hover:bg-white/5 border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-300 transition-all cursor-pointer"
            >
              🔄 Refresh List
            </button>
          </div>

          {error && (
            <div className="bg-red-950/40 border border-red-500/20 rounded-xl p-6 text-center">
              <span className="text-3xl block mb-2">⚠️</span>
              <p className="text-red-400 font-bold uppercase tracking-wide text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <span className="w-12 h-12 border-4 border-accent-gold border-t-transparent rounded-full animate-spin"></span>
              <p className="text-sm font-semibold tracking-wider text-gray-400 uppercase">Fetching live rooms...</p>
            </div>
          ) : rooms.length === 0 ? (
            <div className="glass-panel p-12 text-center border border-white/5 rounded-2xl">
              <span className="text-5xl block mb-4">🏏</span>
              <h3 className="text-xl font-sporty text-gray-300 mb-2">NO ACTIVE ROOMS</h3>
              <p className="text-sm text-gray-400 max-w-sm mx-auto mb-6">There are no active draft boards right now. Log in as an administrator on the right to start a new auction board!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {rooms.map((room) => {
                const isOwner = user && room.adminUserId === user.id;
                return (
                  <div 
                    key={room._id} 
                    onClick={() => handleRoomClick(room)}
                    className="glass-panel p-6 rounded-2xl border border-white/10 hover:border-accent-gold/40 hover:scale-[1.01] transition-all duration-300 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
                  >
                    {/* Glowing side accent */}
                    <div className="absolute top-0 bottom-0 left-0 w-1 bg-accent-gold/40 group-hover:bg-accent-gold transition-all"></div>

                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <h3 className="font-sporty text-xl text-white tracking-wide group-hover:text-accent-gold transition-colors">{room.name}</h3>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black tracking-widest uppercase border ${
                          room.status === 'active' 
                            ? 'bg-green-500/10 text-green-400 border-green-500/35'
                            : room.status === 'ended'
                              ? 'bg-gray-500/10 text-gray-400 border-gray-500/35'
                              : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/35'
                        }`}>
                          {room.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider mb-4">Admin: {room.adminName || 'Draft Manager'}</p>
                    </div>

                    <div className="flex justify-between items-center text-xs border-t border-white/5 pt-3 mt-4">
                      <span className="text-[10px] text-gray-500 font-medium">Created: {new Date(room.createdAt).toLocaleDateString()}</span>
                      <span className="text-accent-gold font-bold uppercase tracking-wider group-hover:translate-x-1 transition-transform">
                        Enter Draft ➡️
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right side: Admin authentication & Room Creation */}
        <div className="glass-panel glass-panel-glow p-8 rounded-2xl border border-white/10 h-fit space-y-6">
          <h2 className="text-2xl font-sporty text-accent-gold tracking-wide border-b border-white/10 pb-3">LOCKER ROOM ACCESS</h2>
          
          {!clerkLoaded ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <span className="w-8 h-8 border-4 border-accent-gold border-t-transparent rounded-full animate-spin"></span>
              <p className="text-[10px] font-bold tracking-wider text-gray-500 uppercase">Loading Security...</p>
            </div>
          ) : (
            <>
              <SignedOut>
                <div className="text-center py-6 space-y-4">
                  <span className="text-4xl block">🔑</span>
                  <h4 className="font-sporty text-gray-300 text-lg">DRAFT MANAGER LOGIN</h4>
                  <p className="text-xs text-gray-400 leading-relaxed">Sign in to your Clerk account to create and manage draft rooms, rules, players, and teams.</p>
                  
                  <div className="pt-2">
                    <SignInButton mode="modal">
                      <button className="w-full py-3.5 bg-accent-gold hover:bg-gold-hover text-primary-dark font-bold rounded-xl tracking-widest font-sporty text-lg uppercase transition-all duration-300 hover:scale-[1.02] shadow-lg glow-gold cursor-pointer">
                        Log In / Register
                      </button>
                    </SignInButton>
                  </div>
                </div>
              </SignedOut>

              <SignedIn>
                <div className="space-y-6">
                  {/* Profile Card Header */}
                  <div className="flex items-center space-x-4 bg-primary-dark/40 border border-white/5 p-4 rounded-xl">
                    <UserButton afterSignOutUrl="/" />
                    <div>
                      <h4 className="font-bold text-sm text-white">Logged in as</h4>
                      <p className="text-xs text-accent-gold font-medium">{user?.primaryEmailAddress?.emailAddress}</p>
                    </div>
                  </div>

                  {/* My Managed Rooms list */}
                  {(() => {
                    const myRooms = rooms.filter(room => user && room.adminUserId === user.id);
                    if (myRooms.length === 0) return null;
                    return (
                      <div className="space-y-3 pt-2 border-t border-white/10 animate-fade-in">
                        <h4 className="font-sporty text-base text-gray-200 tracking-wide uppercase">My Managed Rooms</h4>
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {myRooms.map(room => (
                            <div key={room._id} className="flex justify-between items-center bg-primary-dark/60 border border-white/5 p-3 rounded-xl text-xs gap-3">
                              <div className="truncate min-w-0">
                                <span className="font-bold text-white block truncate">{room.name}</span>
                                <span className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">{room.status}</span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sessionStorage.setItem(`room_auth_${room._id}`, 'true');
                                  sessionStorage.setItem(`room_admin_${room._id}`, 'true');
                                  navigate(`/room/${room._id}/manage`);
                                }}
                                className="px-3.5 py-2 bg-accent-gold hover:bg-gold-hover text-primary-dark font-bold uppercase tracking-wider rounded-lg text-[10px] transition-all cursor-pointer whitespace-nowrap"
                              >
                                Manage ⚙️
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Room Creation Form */}
                  <form onSubmit={handleCreateRoom} className="space-y-4 pt-4 border-t border-white/10">
                    <h3 className="font-sporty text-lg text-gray-200 tracking-wide">CREATE AUCTION ROOM</h3>
                    
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase font-bold text-gray-300 tracking-wider">Draft Room Name</label>
                      <input
                        type="text"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        placeholder="e.g. BCL Season 5"
                        className="w-full px-4 py-3 bg-primary-dark/80 rounded-lg border border-white/10 text-white focus:outline-none focus:border-accent-gold transition-all text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase font-bold text-gray-300 tracking-wider">Secret Room Passkey (PIN)</label>
                      <input
                        type="password"
                        value={passkey}
                        onChange={(e) => setPasskey(e.target.value)}
                        placeholder="e.g. 1234"
                        className="w-full px-4 py-3 bg-primary-dark/80 rounded-lg border border-white/10 text-white focus:outline-none focus:border-accent-gold transition-all text-sm font-mono tracking-widest"
                      />
                      <p className="text-[9px] text-gray-500 font-medium">Guests must enter this code to view the live dashboard.</p>
                    </div>

                    {createError && (
                      <p className="text-red-500 font-bold text-[10px] uppercase tracking-wide bg-red-950/40 py-2 px-3 rounded-lg border border-red-500/20">
                        ⚠️ {createError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={creating}
                      className="w-full py-3.5 bg-accent-gold hover:bg-gold-hover disabled:bg-gray-600 disabled:glow-none text-primary-dark font-bold rounded-xl tracking-widest font-sporty text-lg uppercase transition-all duration-300 hover:scale-[1.02] shadow-lg glow-gold cursor-pointer"
                    >
                      {creating ? 'Seeding Roster...' : 'Create & Seed Room'}
                    </button>
                  </form>
                </div>
              </SignedIn>
            </>
          )}
        </div>
      </div>

      {/* PASSKEY VERIFICATION MODAL */}
      {selectedRoom && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-sm">
          <div className="w-full max-w-md glass-panel glass-panel-glow p-8 rounded-2xl border border-accent-gold/20 text-center relative">
            <button 
              onClick={() => setSelectedRoom(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-lg transition-colors cursor-pointer"
            >
              ✕
            </button>

            <div className="w-16 h-16 bg-accent-gold/10 rounded-full border border-accent-gold/30 flex items-center justify-center mx-auto mb-5 text-2xl">
              🔒
            </div>

            <h3 className="text-2xl font-sporty tracking-wider text-accent-gold mb-1">ENTER ROOM PASSKEY</h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-6">Access Room: {selectedRoom.name}</p>

            <form onSubmit={handleVerifyPasskey} className="space-y-4">
              <input
                type="password"
                value={enteredPasskey}
                onChange={(e) => setEnteredPasskey(e.target.value)}
                placeholder="••••"
                className="w-full px-5 py-3.5 bg-primary-dark/80 text-center text-xl font-bold tracking-[0.5em] rounded-xl border border-white/10 text-white focus:outline-none focus:border-accent-gold transition-all placeholder:text-gray-600"
                autoFocus
              />

              {verificationError && (
                <p className="text-red-500 font-bold text-[10px] uppercase tracking-wide bg-red-950/40 py-2 px-3 rounded-lg border border-red-500/20">
                  ⚠️ {verificationError}
                </p>
              )}

              <button
                type="submit"
                disabled={verifying}
                className="w-full py-3.5 bg-accent-gold hover:bg-gold-hover disabled:bg-gray-600 disabled:glow-none text-primary-dark font-bold rounded-xl tracking-widest font-sporty text-lg uppercase transition-all duration-300 hover:scale-[1.02] shadow-lg glow-gold cursor-pointer"
              >
                {verifying ? 'Verifying PIN...' : 'Verify Passkey'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LobbyPage;
