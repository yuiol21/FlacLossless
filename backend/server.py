"""
FlacLossless Backend: yt-dlp → MP3 streaming server
Downloads audio from YouTube and serves as MP3 via local HTTP.
"""

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import yt_dlp
import os
import uuid
import json
import threading
import time
from pathlib import Path
from datetime import datetime, timedelta
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# Configuration from env or defaults
AUDIO_DIR = os.getenv('AUDIO_DIR', './audio')
CACHE_FILE = os.getenv('CACHE_FILE', './cache.json')
CLEANUP_HOURS = int(os.getenv('CLEANUP_HOURS', 24))
DEBUG_MODE = os.getenv('DEBUG_MODE', 'False').lower() == 'true'

# Ensure audio directory exists
Path(AUDIO_DIR).mkdir(parents=True, exist_ok=True)

# Load/init cache
def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_cache(cache):
    with open(CACHE_FILE, 'w') as f:
        json.dump(cache, f, indent=2)

cache = load_cache()


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'audio_dir': AUDIO_DIR,
        'cached_videos': len(cache),
        'cleanup_hours': CLEANUP_HOURS
    })


@app.route('/download', methods=['GET', 'POST'])
def download_audio():
    """
    Download audio from YouTube and return streaming URL.
    
    GET/POST: ?url=YOUTUBE_URL
    Returns: {"file": "/stream/UUID.mp3", "metadata": {...}, "cached": bool}
    """
    
    # Get URL from query or JSON body
    url = request.args.get('url')
    if request.method == 'POST':
        data = request.get_json() or {}
        url = url or data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    try:
        # Extract video ID for caching
        video_info = yt_dlp.YoutubeDL({'quiet': True}).extract_info(url, download=False)
        video_id = video_info.get('id')
        
        # Check cache first
        if video_id in cache:
            cached_entry = cache[video_id]
            file_path = cached_entry['file']
            
            if os.path.exists(file_path):
                logger.info(f"✓ Cache hit: {video_id}")
                return jsonify({
                    'file': f"/stream/{os.path.basename(file_path)}",
                    'metadata': cached_entry.get('metadata', {}),
                    'cached': True,
                    'video_id': video_id
                })
        
        # Download: unique filename per request
        file_id = str(uuid.uuid4())
        output_path = os.path.join(AUDIO_DIR, f"{file_id}.mp3")
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(AUDIO_DIR, file_id),
            'quiet': not DEBUG_MODE,
            'no_warnings': not DEBUG_MODE,
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
        
        # Store in cache
        metadata = {
            'title': info.get('title', 'Unknown'),
            'duration': info.get('duration', 0),
            'thumbnail': info.get('thumbnail', ''),
            'uploader': info.get('uploader', 'Unknown'),
        }
        
        cache[video_id] = {
            'file': output_path,
            'metadata': metadata,
            'downloaded_at': datetime.now().isoformat(),
            'file_id': file_id
        }
        save_cache(cache)
        
        logger.info(f"✓ Downloaded: {metadata['title']}")
        
        return jsonify({
            'file': f"/stream/{file_id}.mp3",
            'metadata': metadata,
            'cached': False,
            'video_id': video_id
        })
    
    except Exception as e:
        logger.error(f"✗ Download failed: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/stream/<filename>')
def stream_audio(filename):
    """
    Stream MP3 file with proper headers.
    Supports range requests for seeking.
    """
    
    # Prevent directory traversal
    if '..' in filename or '/' in filename:
        return 'Forbidden', 403
    
    file_path = os.path.join(AUDIO_DIR, filename)
    
    if not os.path.exists(file_path):
        return 'Not Found', 404
    
    file_size = os.path.getsize(file_path)
    
    # Handle range requests (for seeking)
    range_header = request.headers.get('Range')
    if range_header:
        try:
            range_start = int(range_header.split('=')[1].split('-')[0])
            range_end = file_size - 1
            
            response = send_file(
                file_path,
                mimetype='audio/mpeg',
                as_attachment=False,
                start_range=range_start,
                end_range=range_end
            )
            response.status_code = 206  # Partial Content
            response.headers['Content-Range'] = f'bytes {range_start}-{range_end}/{file_size}'
            return response
        except:
            pass
    
    return send_file(file_path, mimetype='audio/mpeg', as_attachment=False)


@app.route('/metadata/<video_id>')
def get_metadata(video_id):
    """Retrieve cached metadata for a video"""
    
    if video_id not in cache:
        return jsonify({'error': 'Not in cache'}), 404
    
    entry = cache[video_id]
    return jsonify({
        'video_id': video_id,
        'metadata': entry.get('metadata', {}),
        'file': f"/stream/{os.path.basename(entry['file'])}",
        'downloaded_at': entry.get('downloaded_at')
    })


@app.route('/cache')
def list_cache():
    """List all cached videos"""
    items = []
    for vid, entry in cache.items():
        items.append({
            'video_id': vid,
            'title': entry.get('metadata', {}).get('title', 'Unknown'),
            'downloaded_at': entry.get('downloaded_at'),
            'file_exists': os.path.exists(entry.get('file', ''))
        })
    return jsonify({'cached': len(items), 'items': items})


@app.route('/cache/<video_id>', methods=['DELETE'])
def delete_cached(video_id):
    """Delete a specific cached video"""
    
    if video_id not in cache:
        return jsonify({'error': 'Not found'}), 404
    
    entry = cache[video_id]
    file_path = entry.get('file')
    
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
        del cache[video_id]
        save_cache(cache)
        return jsonify({'deleted': video_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def cleanup_worker():
    """Background thread: delete old MP3s based on CLEANUP_HOURS"""
    while True:
        try:
            time.sleep(3600)  # Run every hour
            
            now = datetime.now()
            cutoff = now - timedelta(hours=CLEANUP_HOURS)
            deleted = 0
            
            for video_id, entry in list(cache.items()):
                try:
                    dl_time_str = entry.get('downloaded_at')
                    if dl_time_str:
                        dl_time = datetime.fromisoformat(dl_time_str)
                        
                        if dl_time < cutoff:
                            file_path = entry.get('file')
                            if os.path.exists(file_path):
                                os.remove(file_path)
                            del cache[video_id]
                            deleted += 1
                except Exception as e:
                    logger.warning(f"Cleanup error for {video_id}: {e}")
            
            if deleted > 0:
                save_cache(cache)
                logger.info(f"✓ Cleanup: deleted {deleted} old MP3(s)")
        
        except Exception as e:
            logger.error(f"✗ Cleanup worker error: {e}")


# Start cleanup worker thread
cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
cleanup_thread.start()


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    host = os.getenv('HOST', '0.0.0.0')
    debug = DEBUG_MODE
    
    logger.info(f"🎵 FlacLossless Backend starting on {host}:{port}")
    logger.info(f"   Audio dir: {AUDIO_DIR}")
    logger.info(f"   Cleanup: {CLEANUP_HOURS}h")
    
    app.run(host=host, port=port, debug=debug, threaded=True)
