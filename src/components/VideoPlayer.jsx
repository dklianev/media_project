import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';

export default function VideoPlayer({ embedUrl, title, siteName = 'Платформа' }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const progressInterval = useRef(null);

  // Parse YouTube video ID from URL
  const getYouTubeId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    return match ? match[1] : null;
  };

  const videoId = getYouTubeId(embedUrl);

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

  const toggleMute = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;
    if (isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
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

  if (!embedUrl) return null;

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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 bg-gradient-to-t from-black/65 to-transparent">
          <p className="text-xs uppercase tracking-[0.22em] text-white/55">{siteName}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="group relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-premium-md"
      style={{ paddingBottom: '56.25%' }}
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
        onDoubleClick={handleRewind}
      />

      {/* Custom Controls Overlay */}
      <div
        className={`absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 pt-12 pb-4 px-5 transition-opacity duration-300 ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
          }`}
      >
        {/* Progress Bar */}
        <div
          className="relative w-full h-1.5 bg-white/20 rounded-full mb-4 cursor-pointer group/progress"
          onClick={handleSeek}
        >
          {/* Fill */}
          <div
            className="absolute top-0 left-0 h-full bg-[var(--accent-gold)] rounded-full transition-all duration-100 ease-linear"
            style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 -mt-1.5 w-3 h-3 bg-white rounded-full shadow-sm scale-0 group-hover/progress:scale-100 transition-transform"
            style={{ left: `calc(${duration > 0 ? (progress / duration) * 100 : 0}% - 6px)` }}
          />
        </div>

        {/* Buttons and Info */}
        <div className="flex items-center gap-5">
          <button
            onClick={togglePlay}
            className="text-white hover:text-[var(--accent-gold)] transition-colors focus:outline-none"
            aria-label={isPlaying ? "Пауза" : "Възпроизвеждане"}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={handleRewind}
            className="text-white/80 hover:text-white transition-colors focus:outline-none flex items-center gap-1.5"
            aria-label="Върни 10 секунди"
            title="Върни 10 секунди (двоен клик върху видеото)"
          >
            <RotateCcw className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-wider">10s</span>
          </button>

          <button
            onClick={toggleMute}
            className="text-white/80 hover:text-white transition-colors focus:outline-none ml-2"
            aria-label={isMuted ? "Включи звук" : "Изключи звук"}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>

          <div className="text-xs text-white/75 tabular-nums font-medium tracking-wide">
            {formatTime(progress)} / {formatTime(duration)}
          </div>

          <div className="ml-auto text-[10px] font-bold uppercase tracking-[0.25em] text-white/30 truncate max-w-[120px] select-none">
            {siteName}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
