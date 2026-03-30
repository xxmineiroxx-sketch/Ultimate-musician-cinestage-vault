/**
 * Deep Linking Utilities - Ultimate Playback
 * Handle deep links from Ultimate Musician and other apps
 */

import { Linking } from 'react-native';

/**
 * Deep Link URL Schemes
 *
 * ultimateplayback://song/{songId}
 * ultimateplayback://song/{songId}/device-setup
 * ultimateplayback://song/{songId}/preset-editor/{role}/{deviceType}
 * ultimateplayback://song/{songId}/section-mapping/{role}/{deviceType}
 * ultimateplayback://song/{songId}/test
 * ultimateplayback://create-song
 * ultimateplayback://library/browse/{deviceType}
 */

export const DEEP_LINK_SCHEME = 'ultimateplayback://';

/**
 * Parse deep link URL
 * @param {string} url - Deep link URL
 * @returns {Object} Parsed route info
 */
export const parseDeepLink = (url) => {
  if (!url || !url.startsWith(DEEP_LINK_SCHEME)) {
    return null;
  }

  const path = url.replace(DEEP_LINK_SCHEME, '');
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) {
    return { screen: 'Home' };
  }

  const [resource, ...rest] = segments;

  switch (resource) {
    case 'song':
      return parseSongLink(rest);

    case 'create-song':
      return { screen: 'SongCreation' };

    case 'library':
      return parseLibraryLink(rest);

    case 'home':
      return { screen: 'Home' };

    case 'songs':
      return { screen: 'SongList' };

    default:
      return null;
  }
};

/**
 * Parse song-specific deep link
 */
const parseSongLink = (segments) => {
  if (segments.length === 0) {
    return null;
  }

  const [songId, action, ...params] = segments;

  if (!action) {
    // Just navigate to song detail (home screen with song ID)
    return {
      screen: 'Home',
      params: { songId },
    };
  }

  switch (action) {
    case 'device-setup':
      return {
        screen: 'DeviceSetup',
        params: { songId },
      };

    case 'preset-editor':
      if (params.length >= 2) {
        const [role, deviceType] = params;
        return {
          screen: 'PresetEditor',
          params: { songId, role, deviceType },
        };
      }
      return null;

    case 'section-mapping':
      if (params.length >= 2) {
        const [role, deviceType] = params;
        return {
          screen: 'SectionMapping',
          params: { songId, role, deviceType },
        };
      }
      return null;

    case 'test':
      return {
        screen: 'TestMode',
        params: { songId },
      };

    default:
      return null;
  }
};

/**
 * Parse library deep link
 */
const parseLibraryLink = (segments) => {
  if (segments.length === 0) {
    return null;
  }

  const [action, ...params] = segments;

  switch (action) {
    case 'browse':
      if (params.length > 0) {
        const [deviceType] = params;
        return {
          screen: 'PresetLibraryBrowser',
          params: { deviceType },
        };
      }
      return null;

    default:
      return null;
  }
};

/**
 * Build deep link URL
 * @param {string} path - Path after scheme
 * @returns {string} Complete deep link URL
 */
export const buildDeepLink = (path) => {
  return `${DEEP_LINK_SCHEME}${path}`;
};

/**
 * Deep link builders for common actions
 */
export const DeepLinks = {
  home: () => buildDeepLink('home'),
  songList: () => buildDeepLink('songs'),
  createSong: () => buildDeepLink('create-song'),
  song: (songId) => buildDeepLink(`song/${songId}`),
  deviceSetup: (songId) => buildDeepLink(`song/${songId}/device-setup`),
  presetEditor: (songId, role, deviceType) =>
    buildDeepLink(`song/${songId}/preset-editor/${role}/${deviceType}`),
  sectionMapping: (songId, role, deviceType) =>
    buildDeepLink(`song/${songId}/section-mapping/${role}/${deviceType}`),
  testMode: (songId) => buildDeepLink(`song/${songId}/test`),
  libraryBrowser: (deviceType) => buildDeepLink(`library/browse/${deviceType}`),
};

/**
 * Open deep link URL
 * @param {string} url - Deep link URL to open
 */
export const openDeepLink = async (url) => {
  try {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error opening deep link:', error);
    return false;
  }
};

/**
 * Handle incoming deep link
 * Call this in App.js useEffect
 *
 * @param {Function} navigationCallback - Callback with parsed route
 */
export const handleDeepLink = (navigationCallback) => {
  // Handle initial URL (app opened via deep link)
  Linking.getInitialURL().then((url) => {
    if (url) {
      const route = parseDeepLink(url);
      if (route) {
        navigationCallback(route);
      }
    }
  });

  // Handle deep links while app is running
  const subscription = Linking.addEventListener('url', (event) => {
    const route = parseDeepLink(event.url);
    if (route) {
      navigationCallback(route);
    }
  });

  return () => {
    subscription?.remove();
  };
};

/**
 * Share deep link via native share sheet
 * @param {string} url - Deep link URL
 * @param {string} message - Share message
 */
export const shareDeepLink = async (url, message = 'Check this out!') => {
  try {
    const { Share } = require('react-native');
    await Share.share({
      message: `${message}\n\n${url}`,
      url: url, // iOS uses this
    });
    return true;
  } catch (error) {
    console.error('Error sharing deep link:', error);
    return false;
  }
};

export default {
  parseDeepLink,
  buildDeepLink,
  DeepLinks,
  openDeepLink,
  handleDeepLink,
  shareDeepLink,
};
