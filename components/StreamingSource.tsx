import React, { useState, useEffect } from 'react';
import { Music, Search, LogIn, LogOut, Play, Loader } from 'lucide-react';
import { spotifyService, type SpotifyPlaylist, type SpotifyTrack } from '../services/spotifyService';
import { youtubeService, type YouTubePlaylist, type YouTubeVideo } from '../services/youtubeService';
import { Track } from '../types';

interface StreamingSourceProps {
  onTracksImport: (tracks: Track[]) => void;
  onClose: () => void;
}

const StreamingSource: React.FC<StreamingSourceProps> = ({ onTracksImport, onClose }) => {
  const [activeTab, setActiveTab] = useState<'spotify' | 'youtube'>('spotify');
  const [spotifyAuth, setSpotifyAuth] = useState(spotifyService.isAuthenticated());
  const [searchQuery, setSearchQuery] = useState('');
  const [spotifyPlaylists, setSpotifyPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [youtubePlaylists, setYoutubePlaylists] = useState<YouTubePlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | YouTubePlaylist | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[] | YouTubeVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle Spotify callback on mount
  useEffect(() => {
    spotifyService.handleCallback();
    setSpotifyAuth(true);
  }, []);

  const handleSpotifyLogin = () => {
    spotifyService.login();
  };

  const handleSpotifyLogout = () => {
    spotifyService.logout();
    setSpotifyAuth(false);
    setSpotifyPlaylists([]);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'spotify' && spotifyAuth) {
        const playlists = await spotifyService.searchPlaylists(searchQuery);
        setSpotifyPlaylists(playlists);
      } else if (activeTab === 'youtube') {
        const playlists = await youtubeService.searchPlaylists(searchQuery);
        setYoutubePlaylists(playlists);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePlaylistSelect = async (playlist: SpotifyPlaylist | YouTubePlaylist) => {
    setSelectedPlaylist(playlist);
    setLoading(true);
    try {
      if (activeTab === 'spotify') {
        const tracks = await spotifyService.getPlaylistTracks((playlist as SpotifyPlaylist).id);
        setPlaylistTracks(tracks);
      } else {
        const videos = await youtubeService.getPlaylistItems((playlist as YouTubePlaylist).id);
        setPlaylistTracks(videos);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleImportPlaylist = () => {
    if (!playlistTracks) return;

    const importedTracks: Track[] = playlistTracks.map((item: any, idx: number) => {
      if (activeTab === 'spotify') {
        const spotifyTrack = item as SpotifyTrack;
        return {
          id: `spotify-${spotifyTrack.id}`,
          title: spotifyTrack.name,
          artist: spotifyTrack.artists.map(a => a.name).join(', '),
          url: spotifyTrack.preview_url || '',
          cover: spotifyTrack.album.images[0]?.url || ''
        };
      } else {
        const youtubeVideo = item as YouTubeVideo;
        return {
          id: `youtube-${youtubeVideo.videoId}`,
          title: youtubeVideo.title,
          artist: youtubeVideo.channelTitle,
          url: youtubeVideo.url, // YouTube watch URL (will open in new tab)
          cover: youtubeVideo.thumbnail || ''
        };
      }
    });

    onTracksImport(importedTracks);
    onClose();
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Tab Switcher */}
      <div className="flex gap-2 mb-4 p-2 bg-white/5 rounded-lg">
        <button
          onClick={() => setActiveTab('spotify')}
          className={`flex-1 py-2 px-3 rounded text-sm font-bold transition-all ${
            activeTab === 'spotify'
              ? 'bg-green-500 text-white'
              : 'bg-white/5 text-gray-400 hover:text-white'
          }`}
        >
          Spotify
        </button>
        <button
          onClick={() => setActiveTab('youtube')}
          className={`flex-1 py-2 px-3 rounded text-sm font-bold transition-all ${
            activeTab === 'youtube'
              ? 'bg-red-500 text-white'
              : 'bg-white/5 text-gray-400 hover:text-white'
          }`}
        >
          YouTube
        </button>
      </div>

      {/* Spotify Tab */}
      {activeTab === 'spotify' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Section */}
          <div className="flex-none mb-4 flex gap-2">
            <input
              type="text"
              placeholder="Search playlists (e.g. 'Top 50', 'Pop')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:border-white/40"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-3 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-600 text-white rounded font-bold text-sm transition-colors"
            >
              {loading ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </div>
              {selectedPlaylist ? (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <button
                    onClick={() => {
                      setSelectedPlaylist(null);
                      setPlaylistTracks([]);
                    }}
                    className="mb-2 text-xs text-cyan-400 hover:text-cyan-300"
                  >
                    ← Back to playlists
                  </button>
                  <div className="text-sm font-bold mb-2 text-white">
                    {(selectedPlaylist as SpotifyPlaylist).name}
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                    {playlistTracks.map((track: any) => (
                      <div key={track.id} className="p-2 bg-white/5 rounded hover:bg-white/10 cursor-pointer text-xs">
                        <div className="font-semibold text-white truncate">{(track as SpotifyTrack).name}</div>
                        <div className="text-gray-500 truncate">
                          {(track as SpotifyTrack).artists.map((a: any) => a.name).join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleImportPlaylist}
                    className="mt-4 w-full py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <Music size={14} /> Import Playlist
                  </button>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
                  {spotifyPlaylists.map((playlist) => (
                    <div
                      key={playlist.id}
                      onClick={() => handlePlaylistSelect(playlist)}
                      className="p-3 bg-white/5 hover:bg-white/10 rounded cursor-pointer transition-colors group"
                    >
                      <div className="flex items-start gap-2">
                        {playlist.images[0] && (
                          <img
                            src={playlist.images[0].url}
                            alt={playlist.name}
                            className="w-10 h-10 rounded object-cover flex-none"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-white truncate text-sm">{playlist.name}</div>
                          <div className="text-gray-500 truncate text-xs">{playlist.description}</div>
                        </div>
                        <Play size={16} className="flex-none text-green-400 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
        </div>
      )}

      {/* YouTube Tab */}
      {activeTab === 'youtube' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Section */}
          <div className="flex-none mb-4 flex gap-2">
            <input
              type="text"
              placeholder="Search playlists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded text-white text-sm placeholder-gray-500 focus:outline-none focus:border-white/40"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-600 text-white rounded font-bold text-sm transition-colors"
            >
              {loading ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
            </button>
          </div>

          {/* Results */}
          {selectedPlaylist ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <button
                onClick={() => {
                  setSelectedPlaylist(null);
                  setPlaylistTracks([]);
                }}
                className="mb-2 text-xs text-red-400 hover:text-red-300"
              >
                ← Back to playlists
              </button>
              <div className="text-sm font-bold mb-2 text-white">
                {(selectedPlaylist as YouTubePlaylist).title}
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                {playlistTracks.map((video: any) => (
                  <div key={video.id} className="p-2 bg-white/5 rounded hover:bg-white/10 text-xs">
                    <div className="font-semibold text-white truncate">{(video as YouTubeVideo).title}</div>
                    <div className="text-gray-500 truncate">{(video as YouTubeVideo).channelTitle}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleImportPlaylist}
                className="mt-4 w-full py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Music size={14} /> Import Playlist
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
              {youtubePlaylists.map((playlist) => (
                <div
                  key={playlist.id}
                  onClick={() => handlePlaylistSelect(playlist)}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded cursor-pointer transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    {playlist.thumbnail && (
                      <img
                        src={playlist.thumbnail}
                        alt={playlist.title}
                        className="w-10 h-10 rounded object-cover flex-none"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white truncate text-sm">{playlist.title}</div>
                      <div className="text-gray-500 text-xs">{playlist.description || 'YouTube Playlist'}</div>
                    </div>
                    <Play size={16} className="flex-none text-red-400 opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default StreamingSource;
