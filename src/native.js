// Native (iOS app) integration. The app is a Capacitor shell that loads the live
// EventOS site, so this file is the only place the web code behaves differently
// inside the app. On the web every helper falls back to normal browser behavior.

import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/** Call once at startup. Safe to call on the web (does nothing). */
export async function initNative() {
  if (!isNative) return;
  document.documentElement.classList.add('native');
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark }); // light text over the navy band
  } catch {
    /* plugin missing in an older build: keep the default */
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 200 });
  } catch {
    /* ignore */
  }
}

/** Open a link outside the app (the in-app Safari sheet on iOS). */
export async function openExternal(url) {
  if (!isNative) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

/**
 * Download a file from the EventOS API. In the app, iOS web views can't save
 * downloads, so the file is written to the app's cache and handed to the share
 * sheet ("Save to Files", Mail, AirDrop…).
 */
export async function downloadFile(path, filename) {
  if (!isNative) {
    const a = document.createElement('a');
    a.href = path;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const res = await fetch(path, { credentials: 'same-origin', headers: { 'X-Requested-With': 'eventos' } });
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  const text = await res.text();
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { Share } = await import('@capacitor/share');
  const { uri } = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: filename, files: [uri] });
}

/** Share a link: the native share sheet in the app, the clipboard on the web. Returns 'shared' | 'copied'. */
export async function shareLink(url, title) {
  if (isNative) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, url });
    return 'shared';
  }
  await navigator.clipboard.writeText(url);
  return 'copied';
}
