// Spotify Integration Service - Simplified Direct Search
const SPOTIFY_CLIENT_ID = (import.meta as any).env.VITE_SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = (import.meta as any).env.VITE_SPOTIFY_CLIENT_SECRET || '';

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
  private clientCredentialsToken: string | null = null;
  private tokenExpiry: number = 0;

  async getClientCredentialsToken(): Promise<string> {
    // Check if token is still valid
    if (this.clientCredentialsToken && this.tokenExpiry > Date.now()) {
      return this.clientCredentialsToken;
    }

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      throw new Error('Spotify credentials not configured');
    }

    const auth = btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`);
    
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (!response.ok) {
        throw new Error(`Token request failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.clientCredentialsToken = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000);

      return data.access_token;
    } catch (e) {
      console.error('Failed to get Spotify token:', e);
      throw e;
    }
  }

  login(): void {
    alert('✅ Direct search enabled!\n\nYou can now search Spotify playlists without login.');
  }

  handleCallback(): boolean {
    return true;
  }

  logout(): void {
    // No-op for simplified flow
  }

  isAuthenticated(): boolean {
    return true; // Always authenticated with client credentials
  }

  async searchPlaylists(query: string): Promise<SpotifyPlaylist[]> {
    if (!query.trim()) return [];

    try {
      const token = await this.getClientCredentialsToken();
      
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=playlist&limit=20`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!response.ok) {
        console.error('Spotify search error:', response.status, response.statusText);
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      return (data.playlists?.items || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description || '',
        images: item.images || [],
        tracks: { items: [], next: null }
      }));
    } catch (e) {
      console.error('Failed to search Spotify:', e);
      alert(`Error: ${e instanceof Error ? e.message : 'Search failed'}`);
      return [];
    }
  }

  async getPlaylistTracks(playlistId: string): Promise<SpotifyTrack[]> {
    try {
      const token = await this.getClientCredentialsToken();
      
      let allTracks: SpotifyTrack[] = [];
      let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

      while (url && allTracks.length < 200) {
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch tracks: ${response.statusText}`);
        }

        const data = await response.json();
        const tracks = (data.items || [])
          .map((item: any) => item.track)
          .filter((track: any) => track && track.id); // Only require id, not preview_url
        
        allTracks = [...allTracks, ...tracks];
        url = data.next || '';
      }

      return allTracks;
    } catch (e) {
      console.error('Failed to fetch playlist tracks:', e);
      throw e;
    }
  }

  async getUserPlaylists(): Promise<SpotifyPlaylist[]> {
    return [];
  }
}

export const spotifyService = new SpotifyService();
export type { SpotifyTrack, SpotifyPlaylist };
