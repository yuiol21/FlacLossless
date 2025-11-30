// Spotify Integration Service
const SPOTIFY_CLIENT_ID = (import.meta as any).env.VITE_SPOTIFY_CLIENT_ID || '';
// For local development, use localhost. Spotify will accept http://localhost for development
const SPOTIFY_REDIRECT_URI = typeof window !== 'undefined' 
  ? window.location.hostname === 'localhost' 
    ? `http://localhost:${window.location.port || 3001}`
    : window.location.origin // Use full origin (with https) for production
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
      alert('⚠️ Spotify Client ID not configured.\n\nSteps:\n1. Visit https://developer.spotify.com/dashboard\n2. Log in or create account\n3. Create an Application\n4. Copy your Client ID\n5. Open .env.local and paste it:\n   VITE_SPOTIFY_CLIENT_ID=your_client_id_here\n6. Refresh the page');
      return;
    }

    const state = Math.random().toString(36).substring(7);
    localStorage.setItem('spotify_auth_state', state);

    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.append('client_id', this.clientId);
    authUrl.searchParams.append('response_type', 'token');
    authUrl.searchParams.append('redirect_uri', SPOTIFY_REDIRECT_URI);
    authUrl.searchParams.append('state', state);

    console.log('Redirecting to Spotify with URI:', SPOTIFY_REDIRECT_URI);
    window.location.href = authUrl.toString();
  }

  handleCallback(): boolean {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');
    const state = params.get('state');
    const error = params.get('error');
    const errorDescription = params.get('error_description');

    if (error) {
      console.error('Spotify auth error:', error, errorDescription);
      
      if (error === 'invalid_request' && errorDescription?.includes('redirect')) {
        alert(`❌ Redirect URI Error\n\nFix in Spotify Dashboard:\n\n1. Go to https://developer.spotify.com/dashboard\n2. Select your app\n3. Click "Edit Settings"\n4. Add this Redirect URI:\n   http://localhost:3001\n\n5. Save and try again`);
      } else {
        alert(`Spotify auth failed: ${error}\n\n${errorDescription || ''}`);
      }
      return false;
    }

    if (accessToken && expiresIn) {
      this.accessToken = accessToken;
      const expiresInMs = parseInt(expiresIn) * 1000;
      localStorage.setItem('spotify_access_token', accessToken);
      localStorage.setItem('spotify_token_expiry', String(Date.now() + expiresInMs));
      // Clear the hash from URL
      window.history.replaceState(null, '', window.location.pathname);
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
