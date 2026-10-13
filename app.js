import { getAllSongs, isBundledCatalogSeeded, seedBundledCatalog, seedSongsIfEmpty } from './database.js';

const sampleSongs = [
  { songNumber: '001', songName: 'A Thousand Years', singerArtist: 'Christina Perri' },
  { songNumber: '002', songName: 'All of Me', singerArtist: 'John Legend' },
  { songNumber: '003', songName: 'Can You Feel the Love Tonight', singerArtist: 'Elton John' },
  { songNumber: '004', songName: 'Dancing Queen', singerArtist: 'ABBA' },
  { songNumber: '005', songName: 'Fix You', singerArtist: 'Coldplay' },
  { songNumber: '006', songName: 'Here Comes the Sun', singerArtist: 'The Beatles' },
  { songNumber: '007', songName: 'Imagine', singerArtist: 'John Lennon' },
  { songNumber: '008', songName: 'Just the Way You Are', singerArtist: 'Bruno Mars' },
  { songNumber: '009', songName: 'Perfect', singerArtist: 'Ed Sheeran' },
  { songNumber: '010', songName: 'Stand by Me', singerArtist: 'Ben E. King' },
  { songNumber: '011', songName: 'The Climb', singerArtist: 'Miley Cyrus' },
  { songNumber: '012', songName: 'You Raise Me Up', singerArtist: 'Josh Groban' }
];

const BUNDLED_CATALOG_VERSION = 'songhub-2026-10-v1';
const RESULT_BATCH_SIZE = 100;
const songList = document.querySelector('#song-list');
const songCount = document.querySelector('#song-count');
const footerStatus = document.querySelector('#footer-status');
const searchInput = document.querySelector('#song-search');
const clearSearchButton = document.querySelector('#clear-search');
const searchResultsCount = document.querySelector('#search-results-count');
const emptyTitle = document.querySelector('#empty-title');
const emptyDescription = document.querySelector('#empty-description');
const loadMoreButton = document.querySelector('#load-more-button');
const emptyState = document.querySelector('#empty-state');
const themeToggle = document.querySelector('#theme-toggle');
const applicationError = document.querySelector('#application-error');
const announcement = document.querySelector('#catalog-announcement');
const installButton = document.querySelector('#install-button');
const installDialog = document.querySelector('#install-dialog');
const connectionStatus = document.querySelector('#connection-status');
let songs = [];
let filteredSongs = [];
let visibleSongLimit = RESULT_BATCH_SIZE;
let deferredInstallPrompt = null;

function compareSongNumbers(first, second) {
  const a = first.songNumber.trim();
  const b = second.songNumber.trim();
  const numericA = /^\d+$/.test(a);
  const numericB = /^\d+$/.test(b);
  if (numericA && numericB) {
    const difference = BigInt(a) - BigInt(b);
    return difference < 0n ? -1 : difference > 0n ? 1 : a.localeCompare(b);
  }
  if (numericA !== numericB) return numericA ? -1 : 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function getArtist(song) {
  return String(song.artist ?? song.singerArtist ?? '');
}

function renderSongs({ resetLimit = true } = {}) {
  if (resetLimit) visibleSongLimit = RESULT_BATCH_SIZE;
  const query = searchInput.value.trim().toLocaleLowerCase();
  filteredSongs = query
    ? songs.filter((song) => song.songName.toLocaleLowerCase().includes(query)
      || getArtist(song).toLocaleLowerCase().includes(query))
    : songs;
  const visibleSongs = filteredSongs.slice(0, visibleSongLimit);
  songList.replaceChildren();

  for (const song of visibleSongs) {
    const row = document.createElement('tr');
    const numberCell = document.createElement('td');
    const nameCell = document.createElement('td');
    const artistCell = document.createElement('td');
    const number = document.createElement('span');
    const artist = document.createElement('div');
    const avatar = document.createElement('span');
    const artistName = document.createElement('span');

    number.className = 'song-number';
    number.textContent = song.songNumber;
    numberCell.append(number);
    nameCell.className = 'song-name-cell';
    nameCell.textContent = song.songName;
    artist.className = 'artist-cell';
    avatar.className = 'artist-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = getArtist(song).trim().charAt(0) || '♪';
    artistName.textContent = getArtist(song);
    artist.append(avatar, artistName);
    artistCell.append(artist);
    row.append(numberCell, nameCell, artistCell);
    songList.append(row);
  }

  const total = songs.length;
  const matched = filteredSongs.length;
  const shown = visibleSongs.length;
  songCount.textContent = `${total.toLocaleString()} ${total === 1 ? 'song' : 'songs'}`;
  footerStatus.textContent = `Showing ${shown.toLocaleString()} of ${matched.toLocaleString()} ${query ? 'matches' : 'songs'}`;
  searchResultsCount.textContent = query
    ? `${matched.toLocaleString()} ${matched === 1 ? 'match' : 'matches'}`
    : `All ${total.toLocaleString()} ${total === 1 ? 'song' : 'songs'}`;
  clearSearchButton.hidden = query.length === 0;
  emptyState.hidden = matched !== 0;
  emptyTitle.textContent = 'No songs match that search';
  emptyDescription.textContent = 'Try a different song name or singer / artist.';
  loadMoreButton.hidden = shown >= matched;
  if (shown < matched) loadMoreButton.textContent = `Load ${Math.min(RESULT_BATCH_SIZE, matched - shown)} more results`;
}

async function refreshSongs() {
  songs = await getAllSongs();
  songs.sort(compareSongNumbers);
  renderSongs();
}

searchInput.addEventListener('input', () => renderSongs());
clearSearchButton.addEventListener('click', () => {
  searchInput.value = '';
  renderSongs();
  searchInput.focus();
});
loadMoreButton.addEventListener('click', () => {
  visibleSongLimit += RESULT_BATCH_SIZE;
  renderSongs({ resetLimit: false });
});

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`);
  try { localStorage.setItem('digital-songbook-theme', theme); } catch { /* Session-only theme fallback. */ }
}

let savedTheme = null;
try { savedTheme = localStorage.getItem('digital-songbook-theme'); } catch { /* Use system preference. */ }
setTheme(savedTheme === 'dark' || savedTheme === 'light'
  ? savedTheme
  : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.textContent = 'Install app';
});

installButton.addEventListener('click', async () => {
  if (!deferredInstallPrompt) {
    installDialog.showModal();
    return;
  }

  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  if (outcome === 'accepted') announcement.textContent = 'Digital Songbook is being installed.';
});

document.querySelector('#close-install').addEventListener('click', () => installDialog.close());
document.querySelector('#done-install').addEventListener('click', () => installDialog.close());
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installButton.hidden = true;
  announcement.textContent = 'Digital Songbook was installed.';
});

function updateConnectionStatus() {
  const offline = !navigator.onLine;
  connectionStatus.lastChild.textContent = offline ? ' Offline catalog' : ' Catalog included';
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('./service-worker.js', import.meta.url), { scope: './', updateViaCache: 'none' })
      .then(() => {
        connectionStatus.lastChild.textContent = navigator.onLine ? ' Offline-ready' : ' Offline catalog';
      })
      .catch((error) => {
        connectionStatus.lastChild.textContent = ' Catalog included';
        console.warn('Offline support could not be registered:', error);
      });
  }, { once: true });
}

async function startApp() {
  try {
    await seedSongsIfEmpty(sampleSongs);
    if (!await isBundledCatalogSeeded(BUNDLED_CATALOG_VERSION)) {
      footerStatus.textContent = 'Preparing the bundled song catalog…';
      const response = await fetch('./songbook-catalog.json', { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Bundled catalog file could not be loaded (${response.status}).`);
      const catalog = await response.json();
      if (catalog.version !== 1 || !Array.isArray(catalog.songs)) throw new Error('The bundled catalog file has an unsupported format.');
      const result = await seedBundledCatalog(catalog.songs, BUNDLED_CATALOG_VERSION);
      announcement.textContent = `Catalog ready. ${result.addedCount.toLocaleString()} bundled songs added; ${result.duplicateCount.toLocaleString()} exact records were already present.`;
    }
    await refreshSongs();
    applicationError.hidden = true;
  } catch (error) {
    await refreshSongs().catch(() => {});
    applicationError.textContent = `The local song catalog could not be prepared. ${error.message}`;
    applicationError.hidden = false;
  }
}

startApp();
