import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize } from 'lucide-react';

export default function VideoPlayer({ embedUrl, youtubeVideoId, title, siteName = 'ELITE MEDIA' }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [isHoveringVolume, setIsHoveringVolume] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const progressInterval = useRef(null);

  // Parse YouTube video ID from URL
  const getYouTubeId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    return match ? match[1] : null;
  };

  const normalizedYoutubeVideoId = typeof youtubeVideoId === 'string' && youtubeVideoId.trim()
    ? youtubeVideoId.trim()
    : null;
  const videoId = normalizedYoutubeVideoId || getYouTubeId(embedUrl);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!videoId) return;

    // Load YouTube IFrame API if not already loaded
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      if (!containerRef.current) return;

      // Cleanup previous player if exists
      if (playerRef.current) {
        playerRef.current.destroy();
      }

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: videoId,
        playerVars: {
          controls: 0, // Hide original controls
          disablekb: 1, // Disable keyboard controls
          fs: 0, // Disable fullscreen button
          rel: 0, // Hide related videos
          modestbranding: 1, // Hide YouTube logo
          playsinline: 1,
          iv_load_policy: 3, // Hide annotations
          showinfo: 0
        },
        events: {
          onReady: (event) => {
            setDuration(event.target.getDuration());
            setPlayerReady(true);
            setIsMuted(event.target.isMuted());
          },
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setDuration(event.target.getDuration());

              // Start progress polling
              progressInterval.current = setInterval(() => {
                setProgress(event.target.getCurrentTime());
              }, 500);
            } else {
              setIsPlaying(false);
              clearInterval(progressInterval.current);
            }
          }
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      clearInterval(progressInterval.current);
      if (playerRef.current && playerRef.current.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [videoId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;

    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  const handleRewind = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;
    const current = playerRef.current.getCurrentTime();
    const newTime = Math.max(0, current - 10);
    playerRef.current.seekTo(newTime, true);
    setProgress(newTime);
  };

  const handleSkipForward = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;
    const current = playerRef.current.getCurrentTime();
    const newTime = Math.min(duration, current + 10);
    playerRef.current.seekTo(newTime, true);
    setProgress(newTime);
  };

  const toggleMute = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;
    if (isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
      if (volume === 0) {
        setVolume(100);
        playerRef.current.setVolume(100);
      }
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  const handleVolumeChange = (e) => {
    e.stopPropagation();
    const newVolume = parseInt(e.target.value, 10);
    setVolume(newVolume);
    if (!playerRef.current || !playerReady) return;

    playerRef.current.setVolume(newVolume);
    if (newVolume === 0) {
      playerRef.current.mute();
      setIsMuted(true);
    } else if (isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
    }
  };

  const toggleFullscreen = async (e) => {
    if (e) e.stopPropagation();
    if (!wrapperRef.current) return;

    if (!document.fullscreenElement) {
      try {
        await wrapperRef.current.requestFullscreen();
      } catch (err) {
        console.error("Error attempting to enable fullscreen:", err);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const handleSeek = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;

    playerRef.current.seekTo(newTime, true);
    setProgress(newTime);
  };

  const handleContextMenu = useCallback((event) => {
    event.preventDefault();
  }, []);

  if (!embedUrl && !videoId) return null;

  // Fallback for non-YouTube videos (or if no embedUrl but fallback is somehow requested)
  // If we have an embedUrl but it's not a YouTube video (videoId is missing), we use the normal iframe
  if (!videoId && embedUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-premium-md hover:border-[var(--accent-gold)]/25 transition-[border-color] duration-500"
        style={{ paddingBottom: '56.25%' }}
        onContextMenu={handleContextMenu}
      >
        <iframe
          className="absolute inset-0 w-full h-full"
          src={embedUrl}
          title={title || 'Видео'}
          frameBorder="0"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 bg-gradient-to-t from-black/65 to-transparent flex justify-end">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">{siteName}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={wrapperRef}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`group relative w-full overflow-hidden bg-black shadow-premium-md ${isFullscreen ? 'h-screen rounded-none border-none' : 'rounded-2xl border border-[var(--border)]'
        }`}
      style={!isFullscreen ? { paddingBottom: '56.25%' } : {}}
      onContextMenu={handleContextMenu}
    >
      {/* YouTube Player Container */}
      <div className="absolute inset-0 pointer-events-none">
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* Invisible Overlay to block iframe clicks and prevent visiting YouTube */}
      <div
        className="absolute inset-0 z-10 cursor-pointer"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      {/* Custom Controls Overlay */}
      <div
        className={`absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 pt-16 pb-3 px-4 transition-opacity duration-300 ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
          }`}
      >
        {/* Progress Bar */}
        <div
          className="relative w-full h-[3px] bg-white/20 rounded-full mb-3 cursor-pointer group/progress transition-all hover:h-1"
          onClick={handleSeek}
        >
          {/* Fill */}
          <div
            className="absolute top-0 left-0 h-full bg-[var(--accent-gold)] rounded-full transition-all duration-100 ease-linear"
            style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -mt-1.5 w-3 h-3 bg-[var(--accent-gold)] rounded-full shadow-sm scale-0 group-hover/progress:scale-100 transition-transform"
            style={{ left: `calc(${duration > 0 ? (progress / duration) * 100 : 0}% - 6px)` }}
          />
        </div>

        {/* Buttons and Info */}
        <div className="flex items-center gap-4 text-white/90">
          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="hover:text-white transition-colors focus:outline-none flex-shrink-0"
            aria-label={isPlaying ? "Пауза" : "Възпроизвеждане"}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-0.5" />
            )}
          </button>

          {/* Skip Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleRewind}
              className="hover:text-white transition-colors focus:outline-none flex items-center gap-1 opacity-70 hover:opacity-100"
              aria-label="Върни 10 секунди"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-[11px] font-semibold tracking-wide">10s</span>
            </button>
            <button
              onClick={handleSkipForward}
              className="hover:text-white transition-colors focus:outline-none flex items-center gap-1 opacity-70 hover:opacity-100"
              aria-label="Напред 10 секунди"
            >
              <RotateCw className="w-4 h-4" />
              <span className="text-[11px] font-semibold tracking-wide">10s</span>
            </button>
          </div>

          {/* Volume Control */}
          <div
            className="flex items-center group/volume relative ml-1"
            onMouseEnter={() => setIsHoveringVolume(true)}
            onMouseLeave={() => setIsHoveringVolume(false)}
          >
            <button
              onClick={toggleMute}
              className="hover:text-white transition-colors focus:outline-none opacity-80 hover:opacity-100"
              aria-label={isMuted ? "Включи звук" : "Изключи звук"}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            <div
              className={`overflow-hidden transition-[width,opacity] duration-300 ease-out flex items-center absolute left-full top-1/2 -translate-y-1/2 z-10 bg-black/40 backdrop-blur-sm rounded-full pl-2 pr-3 py-1.5 ${isHoveringVolume ? 'w-20 opacity-100' : 'w-0 opacity-0 pointer-events-none'
                } sm:relative sm:left-auto sm:top-auto sm:translate-y-0 sm:bg-transparent sm:p-0 sm:z-auto sm:group-hover/volume:w-16 sm:group-hover/volume:ml-2 sm:focus-within:w-16 sm:focus-within:ml-2 sm:opacity-100 ${isHoveringVolume ? 'sm:w-16 sm:ml-2' : 'sm:w-0 sm:ml-0'
                }`}
            >
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-sm [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-sm accent-white"
                style={{
                  background: `linear-gradient(to right, white ${isMuted ? 0 : volume}%, rgba(150,150,150,0.5) ${isMuted ? 0 : volume}%)`
                }}
              />
            </div>
          </div>

          {/* Time */}
          <div className="text-[13px] font-medium tracking-wide opacity-80 ml-1">
            {formatTime(progress)} <span className="opacity-50 mx-0.5">/</span> {formatTime(duration)}
          </div>

          <div className="flex-1" />

          {/* Right Side Controls */}
          <div className="flex items-center gap-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 select-none hidden sm:block">
              {siteName}
            </div>

            <button
              onClick={toggleFullscreen}
              className="hover:text-white transition-colors focus:outline-none opacity-80 hover:opacity-100"
              aria-label={isFullscreen ? "Изход от цял екран" : "Цял екран"}
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
