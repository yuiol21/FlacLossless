// YouTube Integration Service
// NOTE: YouTube doesn't provide direct audio streaming via API
// This service is for discovery/linking only
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
  async searchPlaylists(query: string): Promise<YouTubePlaylist[]> {
    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY.includes('your_')) {
      console.error('YouTube API key not configured');
      alert('YouTube API key not configured.\n\nAdd to .env.local:\nVITE_YOUTUBE_API_KEY=your_api_key');
      return [];
    }

    try {
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=playlist&q=${encodeURIComponent(query)}&maxResults=10&key=${YOUTUBE_API_KEY}`
      );
      
      if (!response.ok) {
        const error = await response.json();
        console.error('YouTube API error:', error);
        alert(`YouTube Error: ${error.error?.message || 'Unknown error'}`);
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
      alert(`Error searching YouTube: ${e instanceof Error ? e.message : 'Unknown error'}`);
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
