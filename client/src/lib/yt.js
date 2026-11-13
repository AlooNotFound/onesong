let apiPromise;

const API_URL = 'https://www.youtube.com/iframe_api';
const timeout = 15_000;

export function loadYTApi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(
      new Error('yt player needs a browser'),
    );
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    let settled = false;
    const prevCall = window.onYouTubeIframeAPIReady;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (error) {
        reject(error);
      } else if (window.YT?.Player) {
        resolve(window.YT);
      } else {
        reject(
          new Error('yt api callback ran but YT.Player is not available'),
        );
      }
    };

    window.onYouTubeIframeAPIReady = () => {
      try {
        if (typeof prevCall === 'function') {
          prevCall();
        }
      } catch (error) {
        console.error(
          'existing yt api callback failed',
          error,
        );
      }

      finish();
    };

    const timeoutId = window.setTimeout(() => {
      finish(
        new Error('timeout'),
      );
    }, timeout);

    let script = document.querySelector(
      'script[data-onesong-youtube-api]',
    );

    if (!script) {
      script = Array.from(document.scripts).find((candidate) =>
        candidate.src.includes('youtube.com/iframe_api'),
      );
    }

    if (!script) {
      script = document.createElement('script');
      script.src = API_URL;
      script.async = true;
      script.dataset.onesongYoutubeApi = 'true';
      document.head.appendChild(script);
    }

    script.addEventListener(
      'error',
      () =>
        finish(
          new Error('iframe not loading'),
        ),
      { once: true },
    );
  }).catch((error) => {
    apiPromise = undefined;
    throw error;
  });

  return apiPromise;
}