/**
 * background.js — Service Worker
 * 
 * Detects tab/window focus changes and triggers PiP on YouTube tabs.
 * Uses a small delay after PiP exit to ensure Chrome is ready for re-entry.
 */

const youtubeTabs = new Set();

// Track YouTube tabs
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes('youtube.com/watch')) {
    youtubeTabs.add(tabId);
  } else if (tab.url) {
    youtubeTabs.delete(tabId);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  youtubeTabs.delete(tabId);
});

// Also seed existing YouTube tabs on startup
chrome.tabs.query({ url: '*://*.youtube.com/watch*' }, (tabs) => {
  for (const tab of tabs) {
    youtubeTabs.add(tab.id);
  }
});

/**
 * Inject a PiP enter command into a YouTube tab.
 * Retries once after a short delay if the first attempt fails.
 */
async function enterPiP(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const video = document.querySelector('video');
        if (!video) return;

        // Force-clear any blocks YouTube may have re-applied
        video.disablePictureInPicture = false;
        video.removeAttribute('disablepictureinpicture');

        if (!video.paused && !video.ended && !document.pictureInPictureElement) {
          video.requestPictureInPicture().catch(() => {});
        }
      }
    });
  } catch (e) {
    // Tab might be navigating or closed
  }
}

/**
 * Inject a PiP exit command and then re-enable autoPiP properties
 * so the next switch will work.
 */
async function exitPiPAndReset(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        if (document.pictureInPictureElement) {
          document.exitPictureInPicture().catch(() => {});
        }

        // Immediately re-enable autoPiP properties so next switch works
        const video = document.querySelector('video');
        if (video) {
          video.disablePictureInPicture = false;
          video.removeAttribute('disablepictureinpicture');
          video.autoPictureInPicture = true;
        }
      }
    });
  } catch (e) {
    // Ignore
  }
}

// When the active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const currentTabId = activeInfo.tabId;

  for (const ytTabId of youtubeTabs) {
    if (ytTabId !== currentTabId) {
      // User left this YouTube tab — wait a beat for any exit to finish, then enter PiP
      setTimeout(() => enterPiP(ytTabId), 300);
    } else {
      // User returned to this YouTube tab — exit PiP and reset state
      exitPiPAndReset(ytTabId);
    }
  }
});

// Handle window focus changes (alt-tabbing to another app)
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Lost focus — enter PiP on all YouTube tabs
    for (const ytTabId of youtubeTabs) {
      setTimeout(() => enterPiP(ytTabId), 300);
    }
  } else {
    // Regained focus — check if user is on a YouTube tab and exit PiP
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, windowId });
      if (activeTab && youtubeTabs.has(activeTab.id)) {
        exitPiPAndReset(activeTab.id);
      }
    } catch (e) {
      // Ignore
    }
  }
});
