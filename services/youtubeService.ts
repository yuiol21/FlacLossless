// YouTube Integration Service - Search for songs and convert to audio
import { backendService } from './backendService';

const YOUTUBE_API_KEY = (import.meta as any).env.VITE_YOUTUBE_API_KEY || '';

interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  videoId: string;
  url: string; // Direct YouTube watch URL
}

interface YouTubePlaylist {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
}

class YouTubeService {
  // Convert YouTube URL to audio stream via BACKEND (not direct API)
  private getAudioStreamUrl(videoId: string): string {
    // Using backend service instead of proxy APIs
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  // Get playable audio URL using backend yt-dlp server
  async getPlayableAudioUrl(videoId: string): Promise<string> {
    try {
      // First, try to get from cache (no re-download)
      try {
        console.log(`[YouTube] Checking backend cache for: ${videoId}`);
        const cached = await backendService.getMetadata(videoId);
        console.log(`[YouTube] ✓ Cache hit: ${videoId}`);
        return cached.streamUrl;
      } catch (e) {
        // Not in cache, proceed to download
      }

      // Download via backend
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      console.log(`[YouTube] Downloading via backend: ${youtubeUrl}`);

      const result = await backendService.downloadAudio(youtubeUrl);
      
      console.log(`[YouTube] ✓ Got audio from backend:`, {
        title: result.metadata.title,
        cached: result.cached,
        streamUrl: result.streamUrl.substring(0, 60)
      });

      return result.streamUrl;
    } catch (e) {
      console.error('[YouTube] Backend audio extraction failed:', e);
      throw e;
    }
  }


  async searchSongs(query: string): Promise<YouTubeVideo[]> {
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY.includes('your_')) {
      console.error('YouTube API key not configured');
      return [];
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query + ' audio')}&maxResults=20&key=${YOUTUBE_API_KEY}&videoEmbeddable=true`
      );
      
      if (!response.ok) {
        const error = await response.json();
        console.error('YouTube API error:', error);
        return [];
      }

      const data = await response.json();
      
      return (data.items || []).map((item: any) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle || 'Unknown',
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
        videoId: item.id.videoId,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`
      }));
    } catch (e) {
      console.error('Failed to search YouTube songs:', e);
      return [];
    }
  }

  async searchPlaylists(query: string): Promise<YouTubePlaylist[]> {
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY.includes('your_')) {
      console.error('YouTube API key not configured');
      return [];
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=playlist&q=${encodeURIComponent(query)}&maxResults=10&key=${YOUTUBE_API_KEY}`
      );
      
      if (!response.ok) {
        const error = await response.json();
        console.error('YouTube API error:', error);
        return [];
      }

      const data = await response.json();
      
      return (data.items || []).map((item: any) => ({
        id: item.id.playlistId,
        title: item.snippet.title,
        description: item.snippet.description || '',
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || ''
      }));
    } catch (e) {
      console.error('Failed to search YouTube playlists:', e);
      return [];
    }
  }

  async getPlaylistItems(playlistId: string): Promise<YouTubeVideo[]> {
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY.includes('your_')) {
      return [];
    }

    try {
      let allItems: YouTubeVideo[] = [];
      let nextPageToken = '';
      let iterations = 0;
      const maxIterations = 5; // Limit to 250 items (5 * 50)

      while (iterations < maxIterations) {
        const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
        url.searchParams.append('part', 'snippet');
        url.searchParams.append('playlistId', playlistId);
        url.searchParams.append('maxResults', '50');
        url.searchParams.append('key', YOUTUBE_API_KEY);
        if (nextPageToken) url.searchParams.append('pageToken', nextPageToken);

        const response = await fetch(url.toString());
        
        if (!response.ok) {
          console.error(`YouTube API error: ${response.status}`);
          break;
        }

        const data = await response.json();
        const items = (data.items || []).map((item: any) => ({
          id: item.id,
          title: item.snippet.title,
          channelTitle: item.snippet.videoOwnerChannelTitle || item.snippet.channelTitle || 'Unknown',
          thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
          videoId: item.snippet.resourceId.videoId,
          url: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`
        }));

        allItems = [...allItems, ...items];
        nextPageToken = data.nextPageToken;
        
        if (!nextPageToken) break;
        iterations++;
      }

      return allItems;
    } catch (e) {
      console.error('Failed to fetch YouTube playlist items:', e);
      return [];
    }
  }
}

export const youtubeService = new YouTubeService();
export type { YouTubeVideo, YouTubePlaylist };
