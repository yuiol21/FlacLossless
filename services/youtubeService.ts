// YouTube Integration Service - Search for songs and convert to audio
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
  // Convert YouTube URL to audio stream via API
  private getAudioStreamUrl(videoId: string): string {
    // Using noCookie embed and yt-dlp proxy services
    // Option 1: Direct MP3 conversion via API
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  // Get playable audio URL using HLS streaming or direct extraction
  async getPlayableAudioUrl(videoId: string): Promise<string> {
    // Use multiple audio extraction services that work reliably
    const audioServices = [
      // Service 1: Using youtube-mp3 style API
      {
        name: 'yt-audio-proxy',
        url: `https://www.yt-download.org/api/button/mp3/${videoId}`
      },
      // Service 2: Direct extraction via API
      {
        name: 'simple-api',
        url: `https://api.mservices.net/youtube/mp3?url=https://www.youtube.com/watch?v=${videoId}`
      },
      // Service 3: Using another proxy
      {
        name: 'ytproxy',
        url: `https://youtubepp.com/download?v=${videoId}`
      }
    ];

    console.log(`[YouTube] Attempting to get audio URL for: ${videoId}`);

    // Try each service
    for (const service of audioServices) {
      try {
        console.log(`[YouTube] Trying service: ${service.name}`);
        
        const response = await fetch(service.url, {
          signal: AbortSignal.timeout(8000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (response.ok) {
          const data = await response.json();
          
          // Different services return different formats
          let audioUrl = '';
          
          if (data.link) audioUrl = data.link; // yt-download format
          else if (data.url) audioUrl = data.url; // simple-api format
          else if (data.mp3) audioUrl = data.mp3; // alternative format
          else if (data.data?.url) audioUrl = data.data.url; // nested format
          
          if (audioUrl && audioUrl.length > 50) { // Basic validation
            console.log(`[YouTube] ✓ Got audio from ${service.name}:`, audioUrl.substring(0, 60) + '...');
            return audioUrl;
          }
        }
      } catch (e) {
        console.warn(`[YouTube] ${service.name} failed:`, e instanceof Error ? e.message : String(e));
      }
    }

    // Last resort: Try direct HLS conversion
    try {
      console.log(`[YouTube] Trying HLS stream conversion...`);
      const hlsUrl = `https://www.youtube.com/watch?v=${videoId}`;
      // Return a proxy that can serve audio
      const proxyUrl = `https://yt-stream.herokuapp.com/api/audio/${videoId}`;
      
      const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          console.log(`[YouTube] ✓ Got HLS stream`);
          return data.url;
        }
      }
    } catch (e) {
      console.warn(`[YouTube] HLS conversion failed`, e);
    }

    console.warn(`[YouTube] All audio extraction services failed`);
    return `https://www.youtube.com/watch?v=${videoId}`; // Fallback
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
