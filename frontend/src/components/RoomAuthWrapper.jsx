import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { socket } from '../utils/socket';
import { API_URL } from '../utils/apiConfig';

const RoomAuthWrapper = ({ children }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { getToken, userId, isLoaded } = useAuth();
  const { user } = useUser();
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passkeyInput, setPasskeyInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [roomName, setRoomName] = useState('Auction Room');

  // Check room authorization status
  useEffect(() => {
    if (!isLoaded) return;
    checkAuth();
  }, [roomId, userId, isLoaded]);

  const checkAuth = async () => {
    try {
      console.log('[Wrapper Auth] Checking room metadata...');
      const token = userId ? (await getToken()) : '';
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const roomRes = await fetch(`${API_URL}/rooms/${roomId}`, { headers });
      if (roomRes.ok) {
        const roomData = await roomRes.json();
        console.log('[Wrapper Auth] Room metadata fetched:', roomData.name);
        setRoomName(roomData.name);
        sessionStorage.setItem(`room_name_${roomId}`, roomData.name);
      } else {
        console.log('[Wrapper Auth] Room not found in metadata fetch');
        setError('Room not found.');
        return;
      }

      // 2. If user is logged in via Clerk, verify their admin/membership status on the backend
      if (userId) {
        console.log('[Wrapper Auth] Logged-in user found:', userId, 'verifying with backend...');
        const token = await getToken();
        const res = await fetch(`${API_URL}/rooms/${roomId}/verify-passkey`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        console.log('[Wrapper Auth] verify-passkey status:', res.status);
        if (res.ok) {
          const data = await res.json();
          console.log('[Wrapper Auth] verify-passkey data:', data);
          if (data.success) {
            sessionStorage.setItem(`room_auth_${roomId}`, 'true');
            if (data.isAdmin) {
              console.log('[Wrapper Auth] User is admin, setting storage room_admin true');
              sessionStorage.setItem(`room_admin_${roomId}`, 'true');
            } else {
              console.log('[Wrapper Auth] User is guest, removing room_admin');
              sessionStorage.removeItem(`room_admin_${roomId}`);
            }
            setIsAuthenticated(true);
            connectSocket();
            return;
          }
        }
      }

      // 3. Check if local sessionStorage already verified this room (for guests with passkeys)
      const isSessionAuth = sessionStorage.getItem(`room_auth_${roomId}`) === 'true';
      console.log('[Wrapper Auth] Checking sessionStorage room_auth:', isSessionAuth);
      if (isSessionAuth) {
        console.log('[Wrapper Auth] sessionStorage auth valid, allowing access');
        setIsAuthenticated(true);
        connectSocket();
        return;
      }
    } catch (err) {
      console.error('Error verifying room credentials:', err);
    }
  };

  const connectSocket = async () => {
    const storedPasskey = sessionStorage.getItem(`room_passkey_${roomId}`) || '';
    const clerkToken = userId ? (await getToken()) : '';

    if (!socket.connected) {
      socket.connect();
    }

    // Join room channel on Socket
    socket.emit('joinRoom', { roomId, passkey: storedPasskey, clerkToken }, (res) => {
      if (res.success) {
        console.log(`Socket successfully connected to Room: ${roomId}`);
      } else {
        console.error('Socket room join failed:', res.error);
        sessionStorage.removeItem(`room_auth_${roomId}`);
        sessionStorage.removeItem(`room_passkey_${roomId}`);
        setIsAuthenticated(false);
        setError(res.error || 'Connection failed.');
      }
    });
  };

  const handlePasskeySubmit = async (e) => {
    e.preventDefault();
    if (!passkeyInput.trim()) return;

    try {
      setVerifying(true);
      setError('');

      const token = userId ? (await getToken()) : '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_URL}/rooms/${roomId}/verify-passkey`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ passkey: passkeyInput })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Incorrect passkey');
      }

      if (data.success) {
        sessionStorage.setItem(`room_auth_${roomId}`, 'true');
        sessionStorage.setItem(`room_passkey_${roomId}`, passkeyInput);
        sessionStorage.setItem(`room_name_${roomId}`, roomName);
        if (data.isAdmin) {
          sessionStorage.setItem(`room_admin_${roomId}`, 'true');
        }
        setIsAuthenticated(true);
        connectSocket();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setVerifying(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 relative">
        <div className="stadium-light-overlay absolute inset-0 z-0"></div>

        <div className="w-full max-w-md glass-panel glass-panel-glow p-8 rounded-2xl border border-accent-gold/20 text-center relative z-10">
          <div className="w-16 h-16 bg-accent-gold/10 rounded-full border border-accent-gold/30 flex items-center justify-center mx-auto mb-5 text-2xl">
            🔒
          </div>

          <h1 className="text-3xl font-sporty tracking-wider text-accent-gold mb-1">ENTER PASSKEY</h1>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mb-6">Room: {roomName}</p>

          <form onSubmit={handlePasskeySubmit} className="space-y-5">
            <input
              type="password"
              value={passkeyInput}
              onChange={(e) => setPasskeyInput(e.target.value)}
              placeholder="••••"
              className="w-full px-5 py-3.5 bg-primary-dark/80 text-center text-xl font-bold tracking-[0.5em] rounded-xl border border-white/10 text-white focus:outline-none focus:border-accent-gold transition-all"
              autoFocus
            />

            {error && (
              <p className="text-red-500 font-bold text-[10px] uppercase tracking-wide bg-red-950/40 py-2 px-3 rounded-lg border border-red-500/20">
                ⚠️ {error}
              </p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-1/3 py-3.5 bg-secondary-dark hover:bg-white/5 border border-white/10 text-white font-bold rounded-xl tracking-wider text-xs uppercase transition-all cursor-pointer"
              >
                Lobby
              </button>
              <button
                type="submit"
                disabled={verifying}
                className="w-2/3 py-3.5 bg-accent-gold hover:bg-gold-hover text-primary-dark font-bold rounded-xl tracking-widest font-sporty text-base uppercase transition-all duration-300 hover:scale-[1.02] shadow-lg glow-gold cursor-pointer"
              >
                {verifying ? 'Verifying...' : 'Unlock Board'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return children;
};

export default RoomAuthWrapper;
