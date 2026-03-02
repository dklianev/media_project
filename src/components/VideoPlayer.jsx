import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Info, Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize, SkipForward, SkipBack, Settings } from 'lucide-react';

const CONTROL_HIDE_DELAY_MS = 2400;
const END_AUTOPLAY_DELAY_SECONDS = 8;
const SWIPE_VOLUME_RANGE = 120;
const QUALITY_LABELS = {
  auto: 'Авто',
  tiny: '144p',
  small: '240p',
  medium: '360p',
  large: '480p',
  hd720: '720p',
  hd1080: '1080p',
  highres: 'Високо',
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const formatQuality = (quality) => QUALITY_LABELS[quality] || (quality ? quality : 'Авто');
const formatEpisodeLabel = (episode) => {
  if (!episode) return 'Няма';
  return episode.episode_number ? `Еп. ${episode.episode_number} — ${episode.title}` : episode.title;
};

export default function VideoPlayer({
  embedUrl,
  youtubeVideoId,
  title,
  siteName = 'Платформа',
  nextEpisode = null,
  previousEpisode = null,
  initialProgressSeconds = 0,
  onProgressSample = null,
}) {
  const navigate = useNavigate();
  const DOUBLE_TAP_DELAY_MS = 260;
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(100);
  const [playerReady, setPlayerReady] = useState(false);
  const [fullscreenMode, setFullscreenMode] = useState('none');
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [animState, setAnimState] = useState(null);
  const [animKey, setAnimKey] = useState(0);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverPos, setHoverPos] = useState(null);
  const [hasEnded, setHasEnded] = useState(false);
  const [autoplayCountdown, setAutoplayCountdown] = useState(null);
  const [currentQuality, setCurrentQuality] = useState('auto');
  const [availableQualities, setAvailableQualities] = useState([]);
  const [gestureLabel, setGestureLabel] = useState('');
  const [playerStatus, setPlayerStatus] = useState('ready');
  const [immersiveViewportHeight, setImmersiveViewportHeight] = useState(null);

  const playerRef = useRef(null);
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const progressInterval = useRef(null);
  const speedMenuRef = useRef(null);
  const infoPanelRef = useRef(null);
  const animTimeoutRef = useRef(null);
  const singleTapTimeoutRef = useRef(null);
  const lastInteractionRef = useRef(null);
  const controlsHideTimeoutRef = useRef(null);
  const autoplayIntervalRef = useRef(null);
  const gestureTimeoutRef = useRef(null);
  const touchGestureRef = useRef(null);
  const resumeAppliedRef = useRef(false);
  const progressDragRef = useRef(null);
  const fullscreenScrollYRef = useRef(0);

  const getYouTubeId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
    return match ? match[1] : null;
  };

  const normalizedYoutubeVideoId = typeof youtubeVideoId === 'string' && youtubeVideoId.trim()
    ? youtubeVideoId.trim()
    : null;
  const videoId = normalizedYoutubeVideoId || getYouTubeId(embedUrl);
  const nextEpisodeId = nextEpisode?.id || null;
  const previousEpisodeId = previousEpisode?.id || null;
  const isFullscreen = fullscreenMode !== 'none';
  const shouldShowControls = controlsVisible || !isPlaying || hasEnded || showSpeedMenu || showInfoPanel;
  const currentVolume = isMuted ? 0 : volume;
  const fullscreenHeight = fullscreenMode === 'immersive' && immersiveViewportHeight
    ? `${immersiveViewportHeight}px`
    : '100dvh';

  const getDocumentFullscreenElement = () => (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement ||
    null
  );

  const getPlayerIframe = (player = playerRef.current) => (
    player && typeof player.getIframe === 'function'
      ? player.getIframe()
      : null
  );

  const ensurePlayerIframePermissions = (player = playerRef.current) => {
    const iframe = getPlayerIframe(player);
    if (!iframe) return null;
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    return iframe;
  };

  const prefersMobileFullscreenFallback = () => {
    if (typeof window === 'undefined') return false;

    const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
    const narrowViewport = window.matchMedia?.('(max-width: 1024px)')?.matches ?? false;
    return coarsePointer && narrowViewport;
  };

  const getImmersiveViewportHeight = () => {
    if (typeof window === 'undefined') return null;
    const nextHeight = Math.round(window.visualViewport?.height || window.innerHeight || 0);
    return nextHeight > 0 ? nextHeight : null;
  };

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const clearControlsHideTimer = () => {
    if (controlsHideTimeoutRef.current) {
      clearTimeout(controlsHideTimeoutRef.current);
      controlsHideTimeoutRef.current = null;
    }
  };

  const clearAutoplayTimer = () => {
    if (autoplayIntervalRef.current) {
      clearInterval(autoplayIntervalRef.current);
      autoplayIntervalRef.current = null;
    }
  };

  const clearGestureTimer = () => {
    if (gestureTimeoutRef.current) {
      clearTimeout(gestureTimeoutRef.current);
      gestureTimeoutRef.current = null;
    }
  };

  const focusPlayerSurface = () => {
    if (wrapperRef.current && document.activeElement !== wrapperRef.current) {
      wrapperRef.current.focus({ preventScroll: true });
    }
  };

  const reportProgress = (currentTime, totalDuration) => {
    if (typeof onProgressSample === 'function') {
      onProgressSample(currentTime, totalDuration);
    }
  };

  const syncPlayerDiagnostics = (player = playerRef.current) => {
    if (!player) return;
    if (typeof player.getPlaybackQuality === 'function') {
      const quality = player.getPlaybackQuality();
      if (quality) setCurrentQuality(quality);
    }
    if (typeof player.getAvailableQualityLevels === 'function') {
      const qualityLevels = player.getAvailableQualityLevels();
      if (Array.isArray(qualityLevels) && qualityLevels.length > 0) {
        setAvailableQualities(qualityLevels);
      }
    }
  };

  const scheduleControlsHide = () => {
    clearControlsHideTimer();
    if (!isPlaying || hasEnded || showSpeedMenu || showInfoPanel) return;
    controlsHideTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROL_HIDE_DELAY_MS);
  };

  const revealControls = (persist = false) => {
    setControlsVisible(true);
    if (persist) {
      clearControlsHideTimer();
      return;
    }
    scheduleControlsHide();
  };

  const showGestureHint = (label) => {
    setGestureLabel(label);
    clearGestureTimer();
    gestureTimeoutRef.current = setTimeout(() => {
      setGestureLabel('');
    }, 900);
  };

  const maybeApplyResume = useCallback((player, detectedDuration = 0) => {
    if (!player || resumeAppliedRef.current) return false;

    const requestedResume = Math.max(0, Number(initialProgressSeconds) || 0);
    const resolvedDuration = Math.max(
      0,
      Number(
        detectedDuration ||
        (typeof player.getDuration === 'function' ? player.getDuration() : 0) ||
        0
      )
    );

    if (requestedResume <= 5) {
      if (resolvedDuration > 0) resumeAppliedRef.current = true;
      return false;
    }

    if (resolvedDuration <= 0) {
      return false;
    }

    const safeResumePoint = clamp(requestedResume, 0, Math.max(0, resolvedDuration - 3));

    if (safeResumePoint <= 5 || safeResumePoint >= resolvedDuration - 3) {
      resumeAppliedRef.current = true;
      return false;
    }

    player.seekTo(safeResumePoint, true);
    setProgress(safeResumePoint);
    reportProgress(safeResumePoint, resolvedDuration);
    resumeAppliedRef.current = true;
    return true;
  }, [initialProgressSeconds]);

  const applyVolume = (nextVolume, { muteAtZero = true } = {}) => {
    const normalized = clamp(Number(nextVolume) || 0, 0, 100);
    setVolume(normalized);
    if (!playerRef.current || !playerReady) return;

    playerRef.current.setVolume(normalized);
    if (normalized === 0 && muteAtZero) {
      playerRef.current.mute();
      setIsMuted(true);
    } else {
      playerRef.current.unMute();
      setIsMuted(false);
    }
  };

  const navigateToEpisode = (episode, event) => {
    if (event) event.stopPropagation();
    if (!episode?.id) return;
    clearAutoplayTimer();
    setAutoplayCountdown(null);
    navigate(`/episodes/${episode.id}`);
  };

  useEffect(() => {
    resumeAppliedRef.current = false;
    setControlsVisible(true);
    setHasEnded(false);
    setAutoplayCountdown(null);
    setShowSpeedMenu(false);
    setShowInfoPanel(false);
    setCurrentQuality('auto');
    setAvailableQualities([]);
    setPlayerStatus('ready');

    if (!videoId) return;

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      if (!containerRef.current) return;

      if (playerRef.current) {
        playerRef.current.destroy();
      }

      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3,
          showinfo: 0
        },
        events: {
          onReady: (event) => {
            ensurePlayerIframePermissions(event.target);
            const detectedDuration = event.target.getDuration();
            setDuration(detectedDuration);
            setPlayerReady(true);
            setIsMuted(event.target.isMuted());
            setVolume(event.target.getVolume() || 100);
            syncPlayerDiagnostics(event.target);

            const resumed = maybeApplyResume(event.target, detectedDuration);
            if (!resumed) {
              const currentTime = event.target.getCurrentTime() || 0;
              setProgress(currentTime);
              reportProgress(currentTime, detectedDuration);
            }
          },
          onStateChange: (event) => {
            clearInterval(progressInterval.current);
            const totalDuration = event.target.getDuration?.() || duration;

            if (
              !resumeAppliedRef.current &&
              event.data !== window.YT.PlayerState.ENDED
            ) {
              maybeApplyResume(event.target, totalDuration);
            }

            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              setHasEnded(false);
              setPlayerStatus('playing');
              setDuration(totalDuration);
              progressInterval.current = setInterval(() => {
                const currentTime = event.target.getCurrentTime();
                const totalDuration = event.target.getDuration();
                setProgress(currentTime);
                setDuration(totalDuration);
                reportProgress(currentTime, totalDuration);
                syncPlayerDiagnostics(event.target);
              }, 500);
              revealControls();
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              const currentTime = event.target.getCurrentTime?.() || 0;
              setIsPlaying(false);
              setProgress(currentTime);
              reportProgress(currentTime, totalDuration);
              setPlayerStatus('paused');
              revealControls(true);
            } else if (event.data === window.YT.PlayerState.ENDED) {
              const finalDuration = totalDuration;
              setIsPlaying(false);
              setHasEnded(true);
              setProgress(finalDuration);
              reportProgress(finalDuration, finalDuration);
              setPlayerStatus('ended');
              revealControls(true);
            } else if (event.data === window.YT.PlayerState.BUFFERING) {
              setIsPlaying(false);
              setPlayerStatus('buffering');
              revealControls(true);
            } else {
              setIsPlaying(false);
              setPlayerStatus('ready');
            }
          },
          onPlaybackQualityChange: (event) => {
            setCurrentQuality(event.data || 'auto');
          },
          onPlaybackRateChange: (event) => {
            setPlaybackSpeed(Number(event.data) || 1);
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
  }, [initialProgressSeconds, maybeApplyResume, videoId]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement = getDocumentFullscreenElement();
      if (fullscreenElement) {
        setFullscreenMode('native');
        return;
      }
      setFullscreenMode((current) => (current === 'native' ? 'none' : current));
    };
    handleFullscreenChange();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (speedMenuRef.current && !speedMenuRef.current.contains(event.target)) {
        setShowSpeedMenu(false);
      }
      if (infoPanelRef.current && !infoPanelRef.current.contains(event.target)) {
        setShowInfoPanel(false);
      }
    }
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      setImmersiveViewportHeight(null);
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyLeft = document.body.style.left;
    const previousBodyRight = document.body.style.right;
    const previousBodyWidth = document.body.style.width;
    const previousHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    const visualViewport = window.visualViewport;
    const orientation = window.screen?.orientation || null;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overscrollBehavior = 'none';

    const syncViewportHeight = () => {
      const nextHeight = getImmersiveViewportHeight();
      if (nextHeight) {
        setImmersiveViewportHeight(nextHeight);
      }
    };

    if (fullscreenMode === 'immersive') {
      fullscreenScrollYRef.current = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${fullscreenScrollYRef.current}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';

      syncViewportHeight();

      visualViewport?.addEventListener('resize', syncViewportHeight);
      visualViewport?.addEventListener('scroll', syncViewportHeight);
      window.addEventListener('resize', syncViewportHeight);
      window.addEventListener('orientationchange', syncViewportHeight);

      if (orientation && typeof orientation.lock === 'function') {
        Promise.resolve()
          .then(() => orientation.lock('landscape'))
          .catch(() => {});
      }
    } else {
      setImmersiveViewportHeight(null);
    }

    return () => {
      if (fullscreenMode === 'immersive') {
        visualViewport?.removeEventListener('resize', syncViewportHeight);
        visualViewport?.removeEventListener('scroll', syncViewportHeight);
        window.removeEventListener('resize', syncViewportHeight);
        window.removeEventListener('orientationchange', syncViewportHeight);

        if (orientation && typeof orientation.unlock === 'function') {
          try {
            orientation.unlock();
          } catch {}
        }
      }

      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.left = previousBodyLeft;
      document.body.style.right = previousBodyRight;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overscrollBehavior = previousHtmlOverscroll;

      if (fullscreenMode === 'immersive') {
        window.scrollTo(0, fullscreenScrollYRef.current);
      }
    };
  }, [fullscreenMode, isFullscreen]);

  useEffect(() => () => {
    if (animTimeoutRef.current) clearTimeout(animTimeoutRef.current);
    if (singleTapTimeoutRef.current) clearTimeout(singleTapTimeoutRef.current);
    clearControlsHideTimer();
    clearAutoplayTimer();
    clearGestureTimer();
  }, []);

  useEffect(() => {
    clearControlsHideTimer();
    if (!isPlaying || hasEnded || showSpeedMenu || showInfoPanel) {
      setControlsVisible(true);
      return undefined;
    }

    controlsHideTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, CONTROL_HIDE_DELAY_MS);

    return () => clearControlsHideTimer();
  }, [hasEnded, isPlaying, showInfoPanel, showSpeedMenu]);

  useEffect(() => {
    clearAutoplayTimer();

    if (!hasEnded || !nextEpisodeId) {
      setAutoplayCountdown(null);
      return undefined;
    }

    setAutoplayCountdown(END_AUTOPLAY_DELAY_SECONDS);
    autoplayIntervalRef.current = setInterval(() => {
      setAutoplayCountdown((current) => {
        if (current == null) return null;
        if (current <= 1) {
          clearAutoplayTimer();
          navigateToEpisode(nextEpisode);
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => clearAutoplayTimer();
  }, [hasEnded, nextEpisode, nextEpisodeId]);

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
      setPlayerStatus('paused');
    } else {
      if (hasEnded) {
        playerRef.current.seekTo(0, true);
        setProgress(0);
        reportProgress(0, duration);
        setHasEnded(false);
      }
      playerRef.current.playVideo();
      triggerAnimation('play');
      setPlayerStatus('playing');
    }
    revealControls();
  };

  const handleRewind = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;
    const current = playerRef.current.getCurrentTime();
    const newTime = Math.max(0, current - 10);
    playerRef.current.seekTo(newTime, true);
    setProgress(newTime);
    reportProgress(newTime, duration);
    triggerAnimation('rewind');
    revealControls();
  };

  const handleSkipForward = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;
    const current = playerRef.current.getCurrentTime();
    const newTime = Math.min(duration, current + 10);
    playerRef.current.seekTo(newTime, true);
    setProgress(newTime);
    reportProgress(newTime, duration);
    triggerAnimation('forward');
    revealControls();
  };

  const toggleMute = (e) => {
    if (e) e.stopPropagation();
    if (!playerRef.current || !playerReady) return;

    if (isMuted || volume === 0) {
      const restoredVolume = volume > 0 ? volume : 100;
      playerRef.current.unMute();
      playerRef.current.setVolume(restoredVolume);
      setIsMuted(false);
      setVolume(restoredVolume);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
    revealControls();
  };

  const handleVolumeChange = (e) => {
    e.stopPropagation();
    applyVolume(parseInt(e.target.value, 10));
    revealControls();
  };

  const changePlaybackSpeed = (speed, e) => {
    if (e) e.stopPropagation();
    setPlaybackSpeed(speed);
    if (playerRef.current && playerRef.current.setPlaybackRate) {
      playerRef.current.setPlaybackRate(speed);
    }
    setShowSpeedMenu(false);
    revealControls(true);
  };

  const replayEpisode = (e) => {
    if (e) e.stopPropagation();
    clearAutoplayTimer();
    setAutoplayCountdown(null);
    setHasEnded(false);
    if (!playerRef.current || !playerReady) return;
    playerRef.current.seekTo(0, true);
    setProgress(0);
    reportProgress(0, duration);
    playerRef.current.playVideo();
    revealControls();
  };

  const requestNativeFullscreen = async (element) => {
    if (!element) return false;

    try {
      if (typeof element.requestFullscreen === 'function') {
        await element.requestFullscreen();
        return true;
      }
      if (typeof element.webkitRequestFullscreen === 'function') {
        element.webkitRequestFullscreen();
        return true;
      }
      if (typeof element.msRequestFullscreen === 'function') {
        element.msRequestFullscreen();
        return true;
      }
    } catch {
      return false;
    }

    return false;
  };

  const exitNativeFullscreen = async () => {
    try {
      if (typeof document.exitFullscreen === 'function') {
        await document.exitFullscreen();
        return true;
      }
      if (typeof document.webkitExitFullscreen === 'function') {
        document.webkitExitFullscreen();
        return true;
      }
      if (typeof document.msExitFullscreen === 'function') {
        document.msExitFullscreen();
        return true;
      }
    } catch {
      return false;
    }

    return false;
  };

  const toggleFullscreen = async (e) => {
    if (e) e.stopPropagation();
    if (!wrapperRef.current) return;

    if (fullscreenMode === 'immersive') {
      setFullscreenMode('none');
      revealControls(true);
      focusPlayerSurface();
      return;
    }

    if (getDocumentFullscreenElement()) {
      const exited = await exitNativeFullscreen();
      if (!exited) {
        setFullscreenMode('none');
      }
      revealControls(true);
      focusPlayerSurface();
      return;
    }

    const iframe = ensurePlayerIframePermissions();
    const shouldSkipIframeNativeFullscreen = prefersMobileFullscreenFallback();
    const enteredNative =
      await requestNativeFullscreen(wrapperRef.current) ||
      (!shouldSkipIframeNativeFullscreen && await requestNativeFullscreen(iframe));

    if (enteredNative) {
      setFullscreenMode('native');
    } else {
      setFullscreenMode('immersive');
    }

    revealControls(true);
    focusPlayerSurface();
  };

  const seekToClientPosition = (clientX, target) => {
    if (!playerRef.current || !playerReady || !duration || !target) return;

    const rect = target.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;

    playerRef.current.seekTo(newTime, true);
    setProgress(newTime);
    reportProgress(newTime, duration);
  };

  const handleSeek = (e) => {
    if (e) e.stopPropagation();
    seekToClientPosition(e.clientX, e.currentTarget);
    revealControls();
  };

  const releaseProgressPointer = (target, pointerId) => {
    if (typeof target?.releasePointerCapture === 'function') {
      try {
        target.releasePointerCapture(pointerId);
      } catch {}
    }
    progressDragRef.current = null;
  };

  const handleProgressPointerDown = (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || !playerReady || !duration) return;
    e.stopPropagation();
    progressDragRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    seekToClientPosition(e.clientX, e.currentTarget);
    revealControls(true);
  };

  const handleProgressPointerMove = (e) => {
    if (progressDragRef.current !== e.pointerId) return;
    e.stopPropagation();
    seekToClientPosition(e.clientX, e.currentTarget);
    revealControls(true);
  };

  const handleProgressPointerUp = (e) => {
    if (progressDragRef.current !== e.pointerId) return;
    e.stopPropagation();
    seekToClientPosition(e.clientX, e.currentTarget);
    releaseProgressPointer(e.currentTarget, e.pointerId);
    revealControls();
  };

  const handleProgressPointerCancel = (e) => {
    if (progressDragRef.current !== e.pointerId) return;
    releaseProgressPointer(e.currentTarget, e.pointerId);
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

  const handleOverlayPointerDown = (e) => {
    focusPlayerSurface();
    revealControls();

    if (e.pointerType !== 'touch' || !e.isPrimary) return;

    touchGestureRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startVolume: currentVolume,
      mode: null,
      consumed: false,
    };
  };

  const handleOverlayPointerMove = (e) => {
    if (e.pointerType !== 'touch' || !e.isPrimary || !touchGestureRef.current) return;

    const gesture = touchGestureRef.current;
    if (gesture.pointerId !== e.pointerId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const deltaX = e.clientX - gesture.startX;
    const deltaY = e.clientY - gesture.startY;

    if (!gesture.mode) {
      const isVolumeSwipe =
        gesture.startX >= rect.width * 0.55 &&
        Math.abs(deltaY) > 18 &&
        Math.abs(deltaY) > Math.abs(deltaX) + 8;

      if (!isVolumeSwipe) return;
      gesture.mode = 'volume';
    }

    if (gesture.mode === 'volume') {
      e.preventDefault();
      gesture.consumed = true;
      const volumeDelta = ((gesture.startY - e.clientY) / rect.height) * SWIPE_VOLUME_RANGE;
      const nextVolume = clamp(Math.round(gesture.startVolume + volumeDelta), 0, 100);
      applyVolume(nextVolume);
      showGestureHint(`Звук ${nextVolume}%`);
      revealControls(true);
    }
  };

  const handleOverlayPointerCancel = () => {
    touchGestureRef.current = null;
  };

  const handleOverlayPointerUp = (e) => {
    if ((e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary) return;

    focusPlayerSurface();

    const touchGesture = touchGestureRef.current;
    if (touchGesture && touchGesture.pointerId === e.pointerId) {
      touchGestureRef.current = null;
      if (touchGesture.consumed) {
        return;
      }
    }

    e.preventDefault();
    e.stopPropagation();
    revealControls();

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
      if (e.pointerType === 'touch' && isPlaying && !controlsVisible) {
        revealControls(true);
        return;
      }
      togglePlay();
    }, DOUBLE_TAP_DELAY_MS);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const wrapper = wrapperRef.current;
      const activeElement = document.activeElement;
      const isEditable =
        activeElement?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement?.tagName);
      const playerHasFocus = wrapper && (activeElement === wrapper || wrapper.contains(activeElement));

      if (!playerReady || isEditable || (!playerHasFocus && !isFullscreen)) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const key = event.key.toLowerCase();
      const handledKeys = [' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'escape', 'k', 'j', 'l', 'm', 'f', 'n', 'p'];
      if (handledKeys.includes(key)) event.preventDefault();

      switch (key) {
        case ' ':
        case 'k':
          togglePlay();
          break;
        case 'j':
          handleRewind();
          break;
        case 'l':
          handleSkipForward();
          break;
        case 'arrowleft': {
          const newTime = Math.max(0, playerRef.current.getCurrentTime() - 5);
          playerRef.current.seekTo(newTime, true);
          setProgress(newTime);
          reportProgress(newTime, duration);
          revealControls();
          break;
        }
        case 'arrowright': {
          const newTime = Math.min(duration, playerRef.current.getCurrentTime() + 5);
          playerRef.current.seekTo(newTime, true);
          setProgress(newTime);
          reportProgress(newTime, duration);
          revealControls();
          break;
        }
        case 'arrowup':
          applyVolume(currentVolume + 5, { muteAtZero: false });
          revealControls();
          break;
        case 'arrowdown':
          applyVolume(currentVolume - 5);
          revealControls();
          break;
        case 'm':
          toggleMute();
          break;
        case 'escape':
          if (fullscreenMode === 'immersive') {
            setFullscreenMode('none');
            revealControls(true);
          }
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'n':
          navigateToEpisode(nextEpisode);
          break;
        case 'p':
          navigateToEpisode(previousEpisode);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    currentVolume,
    duration,
    isFullscreen,
    fullscreenMode,
    nextEpisode,
    playerReady,
    previousEpisode,
    isPlaying,
    hasEnded,
    isMuted,
    volume
  ]);

  const handleContextMenu = useCallback((event) => {
    event.preventDefault();
  }, []);

  if (!embedUrl && !videoId) return null;

  if (!videoId && embedUrl) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-black shadow-premium-md transition-[border-color] duration-500 hover:border-[var(--accent-gold)]/25"
        style={{ paddingBottom: '56.25%' }}
        onContextMenu={handleContextMenu}
      >
        <iframe
          className="absolute inset-0 h-full w-full"
          src={embedUrl}
          title={title || 'Видео'}
          frameBorder="0"
          sandbox="allow-scripts allow-same-origin allow-presentation"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-end bg-gradient-to-t from-black/65 to-transparent p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">{siteName}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={wrapperRef}
      tabIndex={0}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={`relative w-full overflow-hidden bg-black shadow-premium-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm ${isFullscreen ? 'fixed inset-0 z-[9999] w-screen rounded-none border-none' : 'rounded-2xl border border-[var(--border)]'}`}
      style={isFullscreen ? { height: fullscreenHeight } : { paddingBottom: '56.25%' }}
      onContextMenu={handleContextMenu}
      onPointerMove={(event) => {
        if (event.pointerType === 'mouse') revealControls();
      }}
      onMouseLeave={() => {
        if (isPlaying && !hasEnded && !showSpeedMenu && !showInfoPanel) {
          setControlsVisible(false);
        }
      }}
    >
      <div className="pointer-events-none absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      <div
        className="absolute inset-0 z-10 flex cursor-pointer touch-manipulation items-center justify-center overflow-hidden"
        onPointerDown={handleOverlayPointerDown}
        onPointerMove={handleOverlayPointerMove}
        onPointerUp={handleOverlayPointerUp}
        onPointerCancel={handleOverlayPointerCancel}
      >
        <AnimatePresence>
          {animState === 'play' && (
            <motion.div
              key="anim-play"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 0.4 }}
              className="rounded-full bg-black/40 p-5 backdrop-blur-md"
            >
              <Play className="ml-1 h-12 w-12 fill-current text-white sm:ml-2 sm:h-16 sm:w-16" />
            </motion.div>
          )}
          {animState === 'pause' && (
            <motion.div
              key="anim-pause"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 0.4 }}
              className="rounded-full bg-black/40 p-5 backdrop-blur-md"
            >
              <Pause className="h-12 w-12 fill-current text-white sm:h-16 sm:w-16" />
            </motion.div>
          )}
          {animState === 'rewind' && (
            <motion.div
              key={`anim-rewind-${animKey}`}
              initial={{ opacity: 0, x: -50, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 0.4 }}
              className="mr-24 flex flex-col items-center justify-center rounded-full bg-black/40 p-5 backdrop-blur-md sm:mr-48"
            >
              <RotateCcw className="mb-1 h-10 w-10 text-white sm:h-14 sm:w-14" />
              <span className="text-xs font-bold text-white sm:text-sm">10s</span>
            </motion.div>
          )}
          {animState === 'forward' && (
            <motion.div
              key={`anim-forward-${animKey}`}
              initial={{ opacity: 0, x: 50, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 0.4 }}
              className="ml-24 flex flex-col items-center justify-center rounded-full bg-black/40 p-5 backdrop-blur-md sm:ml-48"
            >
              <RotateCw className="mb-1 h-10 w-10 text-white sm:h-14 sm:w-14" />
              <span className="text-xs font-bold text-white sm:text-sm">10s</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {gestureLabel && (
            <motion.div
              key={gestureLabel}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/65 px-3 py-2 text-xs font-semibold tracking-wide text-white shadow-xl backdrop-blur-md"
              style={isFullscreen ? {
                right: 'max(1rem, env(safe-area-inset-right))',
                top: 'max(1rem, env(safe-area-inset-top))',
              } : undefined}
            >
              {gestureLabel}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {hasEnded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm"
          >
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-black/75 p-5 shadow-2xl">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-white/50">{siteName}</p>
              <h3 className="text-2xl font-semibold text-white">Епизодът приключи</h3>
              <p className="mt-2 text-sm text-white/70">
                {nextEpisode ? `Следващ е ${formatEpisodeLabel(nextEpisode)}.` : 'Можеш да го пуснеш отново или да продължиш към друг епизод.'}
              </p>
              {nextEpisode && autoplayCountdown != null && (
                <div className="mt-4 rounded-2xl border border-[var(--accent-gold)]/20 bg-[var(--accent-gold)]/10 px-4 py-3 text-sm text-white/85">
                  Автоматично преминаване след <span className="font-semibold text-[var(--accent-gold-light)]">{autoplayCountdown}s</span>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-3">
                <button onClick={replayEpisode} className="btn-gold inline-flex items-center gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Пусни отначало
                </button>
                {previousEpisode && (
                  <button onClick={(event) => navigateToEpisode(previousEpisode, event)} className="btn-outline inline-flex items-center gap-2">
                    <SkipBack className="h-4 w-4" />
                    Предишен
                  </button>
                )}
                {nextEpisode && (
                  <button onClick={(event) => navigateToEpisode(nextEpisode, event)} className="btn-outline inline-flex items-center gap-2">
                    <SkipForward className="h-4 w-4" />
                    Следващ
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={`absolute bottom-0 inset-x-0 z-30 bg-gradient-to-t from-black/90 px-4 pb-3 pt-16 transition-opacity duration-300 ${shouldShowControls ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        style={isFullscreen ? {
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        } : undefined}
      >
        <div
          className="group/progress mb-1 flex w-full cursor-pointer items-center py-3"
          onPointerDown={handleProgressPointerDown}
          onPointerMove={handleProgressPointerMove}
          onPointerUp={handleProgressPointerUp}
          onPointerCancel={handleProgressPointerCancel}
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
        >
          <div className="relative h-[3px] w-full rounded-full bg-white/20 transition-all duration-200 group-hover/progress:h-[8px]">
            {hoverTime !== null && hoverPos !== null && (
              <div
                className="pointer-events-none absolute -top-10 z-30 -translate-x-1/2 whitespace-nowrap rounded border border-white/5 bg-black/80 px-2 py-1 text-[11px] font-semibold text-white shadow-md backdrop-blur-sm"
                style={{ left: `${hoverPos}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-[var(--accent-gold)] transition-all duration-100 ease-linear"
              style={{ width: `${duration > 0 ? (progress / duration) * 100 : 0}%` }}
            />
            <div
              className="absolute top-1/2 -mt-1.5 h-3 w-3 scale-0 rounded-full bg-[var(--accent-gold)] shadow-sm transition-transform group-hover/progress:scale-100"
              style={{ left: `calc(${duration > 0 ? (progress / duration) * 100 : 0}% - 6px)` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-white/90 sm:flex-nowrap sm:gap-4">
          <button onClick={togglePlay} className="flex-shrink-0 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm" aria-label={isPlaying ? 'Пауза' : 'Възпроизвеждане'}>
            {isPlaying ? <Pause className="h-6 w-6 fill-current" /> : <Play className="ml-0.5 h-6 w-6 fill-current" />}
          </button>
          <div className="flex items-center gap-2 sm:gap-3">
            {previousEpisode && (
              <button
                onClick={(event) => navigateToEpisode(previousEpisode, event)}
                className="flex items-center gap-1 opacity-75 transition-colors hover:text-white hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm"
                aria-label="Предишен епизод"
              >
                <SkipBack className="h-5 w-5 fill-current" />
              </button>
            )}
            <button onClick={handleRewind} className="flex items-center gap-1 opacity-70 transition-colors hover:text-white hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm" aria-label="Върни 10 секунди">
              <RotateCcw className="h-4 w-4" />
              <span className="hidden text-[11px] font-semibold tracking-wide sm:inline">10s</span>
            </button>
            <button onClick={handleSkipForward} className="flex items-center gap-1 opacity-70 transition-colors hover:text-white hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm" aria-label="Напред 10 секунди">
              <RotateCw className="h-4 w-4" />
              <span className="hidden text-[11px] font-semibold tracking-wide sm:inline">10s</span>
            </button>
            {nextEpisodeId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/episodes/${nextEpisodeId}`);
                }}
                className="ml-1 flex items-center gap-1 opacity-70 transition-colors hover:text-white hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm sm:ml-2"
                aria-label="Следващ епизод"
              >
                <SkipForward className="h-5 w-5 fill-current" />
              </button>
            )}
          </div>
          <div className="group/volume relative ml-1 flex items-center gap-2">
            <button onClick={toggleMute} className="opacity-80 transition-colors hover:text-white hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm" aria-label={isMuted ? 'Включи звук' : 'Изключи звук'}>
              {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <div className="flex w-16 items-center rounded-full bg-black/30 px-2 py-1.5 backdrop-blur-sm transition-colors duration-200 group-hover/volume:bg-black/45 sm:w-20">
              <input
                type="range"
                min="0"
                max="100"
                value={currentVolume}
                onInput={handleVolumeChange}
                onChange={handleVolumeChange}
                className="m-0 h-1 w-full cursor-pointer appearance-none rounded-full bg-white/30 p-0 accent-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-black [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:bg-white [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:-mt-[3px] [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                style={{
                  background: `linear-gradient(to right, white ${currentVolume}%, rgba(255,255,255,0.3) ${currentVolume}%)`
                }}
              />
            </div>
          </div>
          <div className="order-last basis-full text-[12px] font-medium tracking-wide opacity-80 sm:order-none sm:basis-auto sm:ml-1 sm:text-[13px]">
            {formatTime(progress)} <span className="mx-0.5 opacity-50">/</span> {formatTime(duration)}
            {initialProgressSeconds > 5 && duration > 0 && progress < Math.max(0, initialProgressSeconds - 3) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!playerRef.current || !playerReady) return;
                  playerRef.current.seekTo(initialProgressSeconds, true);
                  playerRef.current.playVideo();
                  setProgress(initialProgressSeconds);
                  reportProgress(initialProgressSeconds, duration);
                  revealControls();
                }}
                className="ml-3 hidden cursor-pointer rounded-full border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--accent-gold-light)] transition-colors hover:bg-[var(--accent-gold)]/30 sm:inline-block focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm"
                aria-label={`Продължи от ${formatTime(initialProgressSeconds)}`}
              >
                Продължи от {formatTime(initialProgressSeconds)}
              </button>
            )}
          </div>
          <div className="hidden flex-1 sm:block" />
          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <div className="hidden select-none text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 sm:block">{siteName}</div>
            <div className="relative" ref={infoPanelRef}>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setShowInfoPanel((current) => !current);
                  revealControls(true);
                }}
                className={`flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm ${showInfoPanel ? 'text-white opacity-100' : 'opacity-80 hover:text-white hover:opacity-100'}`}
                aria-label="Информация за плеъра"
              >
                <Info className="h-5 w-5" />
              </button>

              {showInfoPanel && (
                <div className="absolute bottom-full right-0 mb-4 w-72 rounded-2xl border border-white/10 bg-black/80 p-4 text-sm text-white/85 shadow-2xl backdrop-blur-md">
                  <div className="mb-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Източник</p>
                    <p className="mt-1 font-medium">YouTube secure embed</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-[13px]">
                    <div>
                      <p className="text-white/45">Статус</p>
                      <p className="mt-1 font-medium">{playerStatus === 'playing' ? 'Възпроизвеждане' : playerStatus === 'paused' ? 'Пауза' : playerStatus === 'ended' ? 'Приключи' : playerStatus === 'buffering' ? 'Буфериране' : 'Готово'}</p>
                    </div>
                    <div>
                      <p className="text-white/45">Качество</p>
                      <p className="mt-1 font-medium">{formatQuality(currentQuality)}</p>
                    </div>
                    <div>
                      <p className="text-white/45">Скорост</p>
                      <p className="mt-1 font-medium">{playbackSpeed}x</p>
                    </div>
                    <div>
                      <p className="text-white/45">Звук</p>
                      <p className="mt-1 font-medium">{currentVolume}%</p>
                    </div>
                    <div>
                      <p className="text-white/45">Продължи от</p>
                      <p className="mt-1 font-medium">{initialProgressSeconds > 0 ? formatTime(initialProgressSeconds) : 'Няма'}</p>
                    </div>
                    <div>
                      <p className="text-white/45">Навигация</p>
                      <p className="mt-1 font-medium">{previousEpisode || nextEpisode ? 'Налична' : 'Няма'}</p>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-white/10 pt-3 text-[12px] text-white/70">
                    <p className="font-semibold text-white/45">Налични качества</p>
                    <p className="mt-1">{availableQualities.length > 0 ? availableQualities.map(formatQuality).join(', ') : 'Автоматично'}</p>
                  </div>
                  <div className="mt-3 border-t border-white/10 pt-3 text-[12px] text-white/70">
                    <p className="font-semibold text-white/45">Предишен</p>
                    <p className="mt-1">{formatEpisodeLabel(previousEpisode)}</p>
                  </div>
                  <div className="mt-3 text-[12px] text-white/70">
                    <p className="font-semibold text-white/45">Следващ</p>
                    <p className="mt-1">{formatEpisodeLabel(nextEpisode)}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="relative" ref={speedMenuRef}>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setShowSpeedMenu((current) => !current);
                  revealControls(true);
                }}
                className={`flex items-center gap-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm ${showSpeedMenu ? 'text-white opacity-100' : 'opacity-80 hover:text-white hover:opacity-100'}`}
                aria-label="Скорост на възпроизвеждане"
              >
                <Settings className="h-5 w-5" />
                {playbackSpeed !== 1 && <span className="hidden text-[10px] font-bold leading-none sm:inline-block">{playbackSpeed}x</span>}
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-4 flex min-w-[120px] flex-col gap-1 rounded-xl border border-white/10 bg-black/80 p-2 shadow-2xl backdrop-blur-md">
                  {[0.5, 1, 1.25, 1.5, 2].map((speed) => (
                    <button
                      key={speed}
                      onClick={(event) => changePlaybackSpeed(speed, event)}
                      className={`rounded-lg px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/10 ${playbackSpeed === speed ? 'bg-white/15 font-semibold text-white' : 'text-white/80'}`}
                    >
                      {speed === 1 ? 'Нормална' : `${speed}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={toggleFullscreen} className="opacity-80 transition-colors hover:text-white hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-gold)] focus-visible:ring-offset-1 focus-visible:ring-offset-black rounded-sm" aria-label={isFullscreen ? 'Изход от цял екран' : 'Цял екран'}>
              {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
