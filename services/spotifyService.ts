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
  private codeVerifier: string = '';

  constructor() {
    // Try to restore token on initialization
    const storedToken = localStorage.getItem('spotify_access_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');

    if (storedToken && tokenExpiry && parseInt(tokenExpiry) > Date.now()) {
      this.accessToken = storedToken;
    }
  }

  // Generate PKCE code verifier and challenge
  private generatePKCE() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let verifier = '';
    for (let i = 0; i < 128; i++) {
      verifier += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.codeVerifier = verifier;
    return verifier;
  }

  private async sha256(plain: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plain);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashString = hashArray.map(b => String.fromCharCode(b)).join('');
    return btoa(hashString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  async authenticate(): Promise<boolean> {
    if (!this.clientId || this.clientId.includes('your_')) {
      console.error('Spotify Client ID not configured');
      return false;
    }

    const storedToken = localStorage.getItem('spotify_access_token');
    const tokenExpiry = localStorage.getItem('spotify_token_expiry');

    if (storedToken && tokenExpiry && parseInt(tokenExpiry) > Date.now()) {
      this.accessToken = storedToken;
      return true;
    }

    return false;
  }

  async login(): Promise<void> {
    if (!this.clientId || this.clientId.includes('your_')) {
      alert('❌ Spotify Client ID NOT configured!\n\n✅ FIX:\n1. https://developer.spotify.com/dashboard\n2. Copy your Client ID\n3. On Vercel: Add env var VITE_SPOTIFY_CLIENT_ID=<your_id>\n4. Redeploy\n5. Refresh this page');
      return;
    }

    const state = Math.random().toString(36).substring(7);
    const verifier = this.generatePKCE();
    const challenge = await this.sha256(verifier);

    localStorage.setItem('spotify_auth_state', state);
    localStorage.setItem('spotify_code_verifier', verifier);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', this.clientId);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('redirect_uri', SPOTIFY_REDIRECT_URI);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('scope', 'playlist-read-public');
    authUrl.searchParams.append('code_challenge_method', 'S256');
    authUrl.searchParams.append('code_challenge', challenge);
    authUrl.searchParams.append('show_dialog', 'true');

    console.log('🎵 Spotify Auth with PKCE:', SPOTIFY_REDIRECT_URI);
    window.location.href = authUrl.toString();
  }

  async handleCallback(): Promise<boolean> {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (error) {
      console.error('Spotify auth error:', error, errorDescription);
      alert(`❌ Spotify Error: ${error}\n\n${errorDescription || ''}`);
      return false;
    }

    if (code && state) {
      try {
        const storedState = localStorage.getItem('spotify_auth_state');
        if (storedState !== state) {
          alert('State mismatch - possible CSRF attack');
          return false;
        }

        const verifier = localStorage.getItem('spotify_code_verifier');
        if (!verifier) {
          alert('Missing code verifier');
          return false;
        }

        // Exchange code for token using PKCE
        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: this.clientId,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: SPOTIFY_REDIRECT_URI,
            code_verifier: verifier
          }).toString()
        });

        if (!response.ok) {
          const error = await response.json();
          console.error('Token exchange error:', error);
          alert(`Failed to get token: ${error.error_description || error.error}`);
          return false;
        }

        const data = await response.json();
        this.accessToken = data.access_token;
        
        localStorage.setItem('spotify_access_token', data.access_token);
        localStorage.setItem('spotify_token_expiry', String(Date.now() + (data.expires_in * 1000)));
        localStorage.removeItem('spotify_code_verifier');
        localStorage.removeItem('spotify_auth_state');

        // Clear URL
        window.history.replaceState(null, '', window.location.pathname);
        return true;
      } catch (e) {
        console.error('Token exchange failed:', e);
        alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
        return false;
      }
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
