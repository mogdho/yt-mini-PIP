/**
 * content.js — Runs in the PAGE's MAIN world (not isolated)
 * 
 * Sets up Media Session handlers and aggressively keeps autoPiP enabled,
 * especially after PiP exits (YouTube tends to re-apply disablePictureInPicture).
 */
(function () {
  'use strict';

  function enableAutoPiP(video) {
    if (!video) return;

    // Remove any YouTube-set block on PiP
    video.disablePictureInPicture = false;
    if (video.hasAttribute('disablepictureinpicture')) {
      video.removeAttribute('disablepictureinpicture');
    }

    // Enable Chrome's native auto PiP
    video.autoPictureInPicture = true;
    if (!video.hasAttribute('autopictureinpicture')) {
      video.setAttribute('autopictureinpicture', '');
    }

    // Listen for PiP exit so we can immediately re-enable properties
    // (YouTube's JS often re-sets disablePictureInPicture after PiP exits)
    if (!video._autoPipListenerAttached) {
      video._autoPipListenerAttached = true;

      video.addEventListener('leavepictureinpicture', () => {
        // Re-enable immediately after PiP exits
        setTimeout(() => {
          video.disablePictureInPicture = false;
          video.removeAttribute('disablepictureinpicture');
          video.autoPictureInPicture = true;
        }, 100);
      });
    }
  }

  function scanAndEnable() {
    document.querySelectorAll('video').forEach(enableAutoPiP);
  }

  // --- Media Session API ---
  function registerMediaSession() {
    if (!('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('enterpictureinpicture', async () => {
        const video = document.querySelector('video');
        if (video && !video.paused && !document.pictureInPictureElement) {
          video.disablePictureInPicture = false;
          try {
            await video.requestPictureInPicture();
          } catch (e) {
            // Silently fail
          }
        }
      });
    } catch (e) {
      // Handler not supported
    }

    try {
      navigator.mediaSession.setActionHandler('leavepictureinpicture', async () => {
        if (document.pictureInPictureElement) {
          try {
            await document.exitPictureInPicture();
          } catch (e) {
            // Silently fail
          }
        }
      });
    } catch (e) {
      // Handler not supported
    }
  }

  // --- Visibility Change ---
  document.addEventListener('visibilitychange', () => {
    const video = document.querySelector('video');
    if (!video) return;

    if (document.hidden) {
      // Leaving the tab — try to enter PiP
      video.disablePictureInPicture = false;
      if (!video.paused && !video.ended && !document.pictureInPictureElement) {
        video.requestPictureInPicture().catch(() => {});
      }
    } else {
      // Returning to the tab — exit PiP and re-enable for next time
      if (document.pictureInPictureElement) {
        document.exitPictureInPicture().then(() => {
          // After exit completes, re-enable immediately
          scanAndEnable();
        }).catch(() => {});
      }
      // Always re-enable in case YouTube reset things
      scanAndEnable();
    }
  });

  // --- Initialization ---
  function init() {
    scanAndEnable();
    registerMediaSession();
  }

  init();

  // Observe DOM for dynamically added videos
  const observer = new MutationObserver(() => scanAndEnable());
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // YouTube SPA navigation
  window.addEventListener('yt-navigate-finish', init);

  // Periodic enforcement — YouTube's JS resets disablePictureInPicture
  setInterval(scanAndEnable, 1500);
})();
