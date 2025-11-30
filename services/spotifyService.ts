// Spotify Integration Service
const SPOTIFY_CLIENT_ID = (import.meta as any).env.VITE_SPOTIFY_CLIENT_ID || '';
// Redirect URI - auto-detects localhost vs production
const SPOTIFY_REDIRECT_URI = typeof window !== 'undefined' 
  ? window.location.hostname === 'localhost' 
    ? `http://localhost:${window.location.port || 3001}`
    : `${window.location.protocol}//${window.location.hostname}` // Production: https://sonicpulse-drab.vercel.app
  : 'http://localhost:3001';

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  external_urls: { spotify: string };
  preview_url: string | null;
}

interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string;
  images: { url: string }[];
  tracks: {
    items: SpotifyTrack[];
    next: string | null;
  };
}

class SpotifyService {
  private accessToken: string | null = null;
  private clientId: string = SPOTIFY_CLIENT_ID;

  constructor() {
    // Try to restore token on initialization
    const storedToken = localStorage.getItem('spotify_access_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');

    if (storedToken && tokenExpiry && parseInt(tokenExpiry) > Date.now()) {
      this.accessToken = storedToken;
    }
  }

  async authenticate(): Promise<boolean> {
    if (!this.clientId || this.clientId.includes('your_')) {
      console.error('Spotify Client ID not configured in .env.local');
      alert('⚠️ Spotify Client ID not configured.\n\n1. Go to https://developer.spotify.com/dashboard\n2. Create an app\n3. Copy the Client ID\n4. Add to .env.local: VITE_SPOTIFY_CLIENT_ID=your_client_id');
      return false;
    }

    // Check if we have a valid token
    const storedToken = localStorage.getItem('spotify_access_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');

    if (storedToken && tokenExpiry && parseInt(tokenExpiry) > Date.now()) {
      this.accessToken = storedToken;
      return true;
    }

    return false;
  }

  login(): void {
    if (!this.clientId || this.clientId.includes('your_')) {
      alert('❌ Spotify Client ID NOT configured!\n\n✅ FIX:\n1. https://developer.spotify.com/dashboard\n2. Copy your Client ID\n3. On Vercel: Add env var VITE_SPOTIFY_CLIENT_ID=<your_id>\n4. Redeploy\n5. Refresh this page');
      console.error('Spotify Client ID missing or invalid:', this.clientId);
      return;
    }

    const state = Math.random().toString(36).substring(7);
    localStorage.setItem('spotify_auth_state', state);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', this.clientId);
    authUrl.searchParams.append('response_type', 'code'); // Changed from 'token' to 'code' for auth code flow
    authUrl.searchParams.append('redirect_uri', SPOTIFY_REDIRECT_URI);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', 'playlist-read-public');
    authUrl.searchParams.append('show_dialog', 'true');

    console.log('🎵 Spotify Auth:', {
      clientId: this.clientId.substring(0, 10) + '...',
      redirectUri: SPOTIFY_REDIRECT_URI
    });

    window.location.href = authUrl.toString();
  }

  handleCallback(): boolean {
    const hash = window.location.hash.substring(1);
    const search = window.location.search.substring(1);
    const params = new URLSearchParams(hash || search);
    
    // For authorization code flow
    const code = params.get('code');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (error) {
      console.error('Spotify auth error:', error, errorDescription);
      alert(`❌ Spotify Error: ${error}\n\n${errorDescription || ''}`);
      return false;
    }

    if (code) {
      console.log('Got auth code, exchanging for token...');
      // For now, store the code - in production you'd exchange this with backend
      localStorage.setItem('spotify_auth_code', code);
      // Clear URL hash
      window.history.replaceState(null, '', window.location.pathname);
      
      // Simulate token for demo (in production, exchange code with backend)
      const mockToken = 'mock_token_' + Math.random().toString(36);
      this.accessToken = mockToken;
      localStorage.setItem('spotify_access_token', mockToken);
      localStorage.setItem('spotify_token_expiry', String(Date.now() + 3600000));
      
      return true;
    }

    return false;
  }

  logout(): void {
    this.accessToken = null;
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_token_expiry');
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  async getUserPlaylists(): Promise<SpotifyPlaylist[]> {
    if (!this.accessToken) return [];

    try {
      const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: { 'Authorization': `Bearer ${this.accessToken}` }
      });

      if (response.status === 401) {
        this.logout();
        throw new Error('Token expired. Please log in again.');
      }

      const data = await response.json();
      return data.items || [];
    } catch (e) {
      console.error('Failed to fetch Spotify playlists:', e);
      return [];
    }
  }

  async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    if (!this.accessToken) return [];

    try {
      let allTracks: SpotifyTrack[] = [];
      let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

      while (url) {
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${this.accessToken}` }
        });

        if (response.status === 401) {
          this.logout();
          throw new Error('Token expired');
        }

        const data = await response.json();
        const tracks = data.items?.map((item: any) => item.track).filter(Boolean) || [];
        allTracks = [...allTracks, ...tracks];
        url = data.next || '';
      }

      return allTracks;
    } catch (e) {
      console.error('Failed to fetch playlist tracks:', e);
      return [];
    }
  }

  async searchPlaylists(query: string): Promise<SpotifyPlaylist[]> {
    if (!this.accessToken) return [];

    try {
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=20`,
        { 
          headers: { 'Authorization': `Bearer ${this.accessToken}` },
          method: 'GET'
        }
      );

      if (response.status === 401) {
        this.logout();
        return [];
      }

      if (!response.ok) {
        console.error(`Spotify API error: ${response.status} ${response.statusText}`);
        const errorData = await response.json().catch(() => ({}));
        console.error('Error details:', errorData);
        return [];
      }

      const data = await response.json();
      return data.playlists?.items || [];
    } catch (e) {
      console.error('Failed to search Spotify playlists:', e);
      return [];
    }
  }
}

export const spotifyService = new SpotifyService();
export type { SpotifyTrack, SpotifyPlaylist };
