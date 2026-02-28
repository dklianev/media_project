import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, SkipForward, Settings } from 'lucide-react';

export default function VideoPlayer({ embedUrl, youtubeVideoId, title, siteName = 'Платформа', nextEpisodeId }) {
  const navigate = useNavigate();
  const DOUBLE_TAP_DELAY_MS = 260;
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [playerReady, setPlayerReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [animState, setAnimState] = useState(null);
  const [animKey, setAnimKey] = useState(0);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);

  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const progressInterval = useRef(null);
  const speedMenuRef = useRef(null);
  const animTimeoutRef = useRef(null);
  const singleTapTimeoutRef = useRef(null);
  const lastInteractionRef = useRef(null);

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
            setVolume(event.target.getVolume() || 100);
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

  useEffect(() => {
    function handleClickOutside(event) {
      if (speedMenuRef.current && !speedMenuRef.current.contains(event.target)) {
        setShowSpeedMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => () => {
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
  }, []);

  const triggerAnimation = (type) => {
    setAnimState(type);
    setAnimKey((prev) => prev + 1);
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    animTimeoutRef.current = setTimeout(() => {
      setAnimState(null);
    }, 600);
  };

  const togglePlay = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;

    if (isPlaying) {
      playerRef.current.pauseVideo();
      triggerAnimation('pause');
    } else {
      playerRef.current.playVideo();
      triggerAnimation('play');
    }
  };

  const handleRewind = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;
    const current = playerRef.current.getCurrentTime();
    const newTime = Math.max(0, current - 10);
    playerRef.current.seekTo(newTime, true);
    setProgress(newTime);
    triggerAnimation('rewind');
  };

  const handleSkipForward = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;
    const current = playerRef.current.getCurrentTime();
    const newTime = Math.min(duration, current + 10);
    playerRef.current.seekTo(newTime, true);
    setProgress(newTime);
    triggerAnimation('forward');
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

  const changePlaybackSpeed = (speed, e) => {
    if (e) e.stopPropagation();
    setPlaybackSpeed(speed);
    if (playerRef.current && playerRef.current.setPlaybackRate) {
      playerRef.current.setPlaybackRate(speed);
    }
    setShowSpeedMenu(false);
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

  const handleProgressMouseMove = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    setHoverTime(percentage * duration);
    setHoverPos(percentage * 100);
  };

  const handleProgressMouseLeave = () => {
    setHoverTime(null);
    setHoverPos(null);
  };

  const handleOverlayDoubleAction = (x, width) => {
    if (x < width / 3) {
      handleRewind();
    } else if (x > (width / 3) * 2) {
      handleSkipForward();
    } else {
      toggleFullscreen();
    }
  };

  const handleOverlayPointerUp = (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const now = Date.now();
    const lastInteraction = lastInteractionRef.current;
    const isDoubleInteraction =
      lastInteraction &&
      lastInteraction.pointerType === e.pointerType &&
      now - lastInteraction.timestamp <= DOUBLE_TAP_DELAY_MS;

    if (singleTapTimeoutRef.current) {
      clearTimeout(singleTapTimeoutRef.current);
      singleTapTimeoutRef.current = null;
    }

    if (isDoubleInteraction) {
      lastInteractionRef.current = null;
      handleOverlayDoubleAction(x, width);
      return;
    }

    lastInteractionRef.current = {
      pointerType: e.pointerType,
      timestamp: now,
    };

    singleTapTimeoutRef.current = setTimeout(() => {
      lastInteractionRef.current = null;
      togglePlay();
    }, DOUBLE_TAP_DELAY_MS);
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
        className="absolute inset-0 z-10 cursor-pointer touch-manipulation flex items-center justify-center overflow-hidden"
        onPointerUp={handleOverlayPointerUp}
      >
        <AnimatePresence>
          {animState === 'play' && (
            <motion.div
              key="anim-play"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 0.4 }}
              className="bg-black/40 rounded-full p-5 backdrop-blur-md"
            >
              <Play className="w-12 h-12 sm:w-16 sm:h-16 text-white fill-current ml-1 sm:ml-2" />
            </motion.div>
          )}
          {animState === 'pause' && (
            <motion.div
              key="anim-pause"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 0.4 }}
              className="bg-black/40 rounded-full p-5 backdrop-blur-md"
            >
              <Pause className="w-12 h-12 sm:w-16 sm:h-16 text-white fill-current" />
            </motion.div>
          )}
          {animState === 'rewind' && (
            <motion.div
              key={`anim-rewind-${animKey}`}
              initial={{ opacity: 0, x: -50, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 0.4 }}
              className="bg-black/40 rounded-full p-5 backdrop-blur-md flex flex-col items-center justify-center mr-24 sm:mr-48"
            >
              <RotateCcw className="w-10 h-10 sm:w-14 sm:h-14 text-white mb-1" />
              <span className="text-white font-bold text-xs sm:text-sm">10s</span>
            </motion.div>
          )}
          {animState === 'forward' && (
            <motion.div
              key={`anim-forward-${animKey}`}
              initial={{ opacity: 0, x: 50, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 0.4 }}
              className="bg-black/40 rounded-full p-5 backdrop-blur-md flex flex-col items-center justify-center ml-24 sm:ml-48"
            >
              <RotateCw className="w-10 h-10 sm:w-14 sm:h-14 text-white mb-1" />
              <span className="text-white font-bold text-xs sm:text-sm">10s</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Custom Controls Overlay */}
      <div
        className={`absolute bottom-0 inset-x-0 z-20 bg-gradient-to-t from-black/90 pt-16 pb-3 px-4 transition-opacity duration-300 ${isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
          }`}
      >
        {/* Progress Container (Larger Hit Area) */}
        <div
          className="w-full flex items-center cursor-pointer group/progress py-2 mb-1"
          onClick={handleSeek}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
        >
          {/* Visible Progress Bar */}
          <div className="relative w-full h-[3px] group-hover/progress:h-[6px] bg-white/20 rounded-full transition-all duration-200">
            {/* Hover Tooltip */}
            {hoverTime !== null && hoverPos !== null && (
              <div
                className="absolute -top-10 -translate-x-1/2 bg-black/80 backdrop-blur-sm text-white text-[11px] font-semibold px-2 py-1 rounded pointer-events-none z-30 shadow-md border border-white/5 whitespace-nowrap"
                style={{ left: `${hoverPos}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
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
        </div>

        {/* Buttons and Info */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-white/90 sm:flex-nowrap sm:gap-4">
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
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleRewind}
              className="hover:text-white transition-colors focus:outline-none flex items-center gap-1 opacity-70 hover:opacity-100"
              aria-label="Върни 10 секунди"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden text-[11px] font-semibold tracking-wide sm:inline">10s</span>
            </button>
            <button
              onClick={handleSkipForward}
              className="hover:text-white transition-colors focus:outline-none flex items-center gap-1 opacity-70 hover:opacity-100"
              aria-label="Напред 10 секунди"
            >
              <RotateCw className="w-4 h-4" />
              <span className="hidden text-[11px] font-semibold tracking-wide sm:inline">10s</span>
            </button>
            {nextEpisodeId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/episodes/${nextEpisodeId}`);
                }}
                className="hover:text-white transition-colors focus:outline-none flex items-center gap-1 opacity-70 hover:opacity-100 ml-1 sm:ml-2"
                aria-label="Следващ епизод"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
            )}
          </div>

          {/* Volume Control */}
          <div className="group/volume relative ml-1 flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="hover:text-white transition-colors focus:outline-none opacity-80 hover:opacity-100"
              aria-label={isMuted ? "Включи звук" : "Изключи звук"}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            <div
              className="flex w-16 items-center rounded-full bg-black/30 px-2 py-1.5 backdrop-blur-sm transition-colors duration-200 group-hover/volume:bg-black/45 sm:w-20"
            >
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onInput={handleVolumeChange}
                onChange={handleVolumeChange}
                className="w-full h-1 p-0 m-0 bg-white/30 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:-mt-[3px] [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full accent-white"
                style={{
                  background: `linear-gradient(to right, white ${isMuted ? 0 : volume}%, rgba(255,255,255,0.3) ${isMuted ? 0 : volume}%)`
                }}
              />
            </div>
          </div>

          {/* Time */}
          <div className="order-last basis-full text-[12px] font-medium tracking-wide opacity-80 sm:order-none sm:basis-auto sm:ml-1 sm:text-[13px]">
            {formatTime(progress)} <span className="opacity-50 mx-0.5">/</span> {formatTime(duration)}
          </div>

          <div className="hidden flex-1 sm:block" />

          {/* Right Side Controls */}
          <div className="ml-auto flex items-center gap-3 sm:gap-4 relative">
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 select-none hidden sm:block">
              {siteName}
            </div>

            <div className="relative" ref={speedMenuRef}>
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className={`hover:text-white transition-colors focus:outline-none flex items-center gap-1 ${showSpeedMenu ? 'opacity-100 text-white' : 'opacity-80 hover:opacity-100'}`}
                aria-label="Скорост на възпроизвеждане"
              >
                <Settings className="w-5 h-5" />
                {playbackSpeed !== 1 && (
                  <span className="hidden text-[10px] font-bold sm:inline-block leading-none">{playbackSpeed}x</span>
                )}
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-4 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 p-2 min-w-[120px] shadow-2xl flex flex-col gap-1 z-50">
                  {[0.5, 1, 1.25, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={(e) => changePlaybackSpeed(speed, e)}
                      className={`text-left px-3 py-1.5 text-sm rounded-lg hover:bg-white/10 transition-colors ${playbackSpeed === speed ? 'bg-white/15 font-semibold text-white' : 'text-white/80'}`}
                    >
                      {speed === 1 ? 'Нормална' : `${speed}x`}
                    </button>
                  ))}
                </div>
              )}
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
