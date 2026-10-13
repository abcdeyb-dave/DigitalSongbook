const DATABASE_NAME = 'digital-songbook';
const DATABASE_VERSION = 3;
const SONGS_STORE = 'songs';
const META_STORE = 'app-meta';

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support IndexedDB. Try a current version of Edge, Chrome, or Firefox.'));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (event) => {
      const database = request.result;
      let songs;

      if (!database.objectStoreNames.contains(SONGS_STORE)) {
        songs = database.createObjectStore(SONGS_STORE, { keyPath: 'id' });
      } else {
        songs = request.transaction.objectStore(SONGS_STORE);
      }

      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE, { keyPath: 'key' });
      }

      // Schema migrations belong here: add a new database version and migrate
      // records in this upgrade transaction when the data shape changes.
      if (!songs.indexNames.contains('by-song-number')) {
        songs.createIndex('by-song-number', 'songNumberNormalized', { unique: false });
      } else if (songs.index('by-song-number').unique) {
        songs.deleteIndex('by-song-number');
        songs.createIndex('by-song-number', 'songNumberNormalized', { unique: false });
      }

      if (!songs.indexNames.contains('by-identity')) {
        songs.createIndex('by-identity', 'identityKey', { unique: false });
      }

      if (event.oldVersion < 2) {
        const cursorRequest = songs.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const record = cursor.value;
          record.artist = record.artist || record.singerArtist || '';
          delete record.singerArtist;
          record.identityKey = makeIdentityKey(record);
          cursor.update(record);
          cursor.continue();
        };
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };

    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error || new Error('Could not open the local song database.'));
    };

    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error('The song database update is blocked. Close other Digital Songbook tabs and try again.'));
    };
  });

  return databasePromise;
}

function normalizeIdentityPart(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function makeIdentityKey(song) {
  return [song.songNumber, song.songName, song.artist || song.singerArtist]
    .map(normalizeIdentityPart)
    .join('\u001f');
}

function makeSongRecord(song, existing = {}) {
  const now = new Date().toISOString();
  const songNumber = String(song.songNumber).trim();
  const id = existing.id || song.id || (crypto.randomUUID
    ? crypto.randomUUID()
    : `song-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const record = {
    id,
    songNumber,
    songNumberNormalized: songNumber.toLocaleLowerCase(),
    songName: String(song.songName).trim(),
    artist: String(song.artist ?? song.singerArtist ?? '').trim(),
    createdAt: existing.createdAt || song.createdAt || now,
    updatedAt: now,
    identityKey: ''
  };
  record.identityKey = makeIdentityKey(record);
  return record;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('The database request failed.'));
  });
}

export async function getAllSongs() {
  const database = await openDatabase();
  const transaction = database.transaction(SONGS_STORE, 'readonly');
  const songs = await requestResult(transaction.objectStore(SONGS_STORE).getAll());
  return songs;
}

export async function isBundledCatalogSeeded(version) {
  const database = await openDatabase();
  const transaction = database.transaction(META_STORE, 'readonly');
  const marker = await requestResult(transaction.objectStore(META_STORE).get('bundled-catalog'));
  return marker?.version === version;
}

export async function seedBundledCatalog(records, version) {
  if (!Array.isArray(records) || !version) throw new Error('The bundled song catalog has an invalid format.');
  for (const song of records) {
    if (!song || typeof song.songNumber !== 'string' || typeof song.songName !== 'string' || typeof song.artist !== 'string') {
      throw new Error('The bundled song catalog contains an invalid record. No catalog changes were made.');
    }
  }

  const database = await openDatabase();
  const transaction = database.transaction([SONGS_STORE, META_STORE], 'readwrite');
  const songStore = transaction.objectStore(SONGS_STORE);
  const metaStore = transaction.objectStore(META_STORE);
  const result = { addedCount: 0, duplicateCount: 0, alreadySeeded: false };

  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('Could not add the bundled song catalog.'));
    transaction.onerror = () => reject(transaction.error || new Error('Could not add the bundled song catalog.'));

    const markerRequest = metaStore.get('bundled-catalog');
    markerRequest.onerror = () => reject(markerRequest.error || new Error('Could not read the catalog setup marker.'));
    markerRequest.onsuccess = () => {
      if (markerRequest.result?.version === version) {
        result.alreadySeeded = true;
        return;
      }

      const existingRequest = songStore.getAll();
      existingRequest.onerror = () => reject(existingRequest.error || new Error('Could not check existing songs before setting up the catalog.'));
      existingRequest.onsuccess = () => {
        const knownIdentities = new Set(existingRequest.result.map((song) => song.identityKey || makeIdentityKey(song)));
        for (const song of records) {
          const record = makeSongRecord(song);
          if (knownIdentities.has(record.identityKey)) {
            result.duplicateCount += 1;
            continue;
          }
          knownIdentities.add(record.identityKey);
          songStore.add(record);
          result.addedCount += 1;
        }
        metaStore.put({ key: 'bundled-catalog', version, seededAt: new Date().toISOString() });
      };
    };
  });

  return result;
}

export async function addSong(song) {
  const result = await addSongs([song]);
  if (!result.addedCount) {
    const error = new Error('This exact song record is already in the catalog.');
    error.name = 'DuplicateRecordError';
    throw error;
  }
  return result.records[0];
}

export async function addSongs(songs) {
  if (!songs.length) return { records: [], addedCount: 0, duplicateCount: 0 };

  const database = await openDatabase();
  const transaction = database.transaction(SONGS_STORE, 'readwrite');
  const store = transaction.objectStore(SONGS_STORE);
  let result = { records: [], addedCount: 0, duplicateCount: 0 };

  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('The import was cancelled because one or more records could not be saved.'));
    transaction.onerror = () => reject(transaction.error || new Error('The import could not be saved.'));

    const existingRequest = store.getAll();
    existingRequest.onerror = () => reject(existingRequest.error || new Error('Could not check existing songs before importing.'));
    existingRequest.onsuccess = () => {
      const knownIdentities = new Set(existingRequest.result.map((song) => song.identityKey || makeIdentityKey(song)));
      const accepted = [];

      for (const song of songs) {
        const record = makeSongRecord(song);
        if (knownIdentities.has(record.identityKey)) {
          result.duplicateCount += 1;
          continue;
        }
        knownIdentities.add(record.identityKey);
        accepted.push(record);
      }

      result.records = accepted;
      result.addedCount = accepted.length;
      for (const record of accepted) store.add(record);
    };
  });

  return result;
}

export async function updateSong(id, song) {
  const database = await openDatabase();
  const transaction = database.transaction(SONGS_STORE, 'readwrite');
  const store = transaction.objectStore(SONGS_STORE);
  const existing = await requestResult(store.get(id));

  if (!existing) throw new Error('This song no longer exists. Refresh the catalog and try again.');

  const record = makeSongRecord(song, existing);
  const duplicateCheck = store.index('by-identity').getAll(record.identityKey);
  const committed = new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(record);
    transaction.onabort = () => reject(transaction.error || new Error('The song update was cancelled.'));
    transaction.onerror = () => reject(transaction.error || new Error('The song update failed.'));
  });
  duplicateCheck.onsuccess = () => {
    if (duplicateCheck.result.some((song) => song.id !== id)) {
      transaction.abort();
      return;
    }
    store.put(record);
  };
  return committed;
}

export async function deleteSong(id) {
  const database = await openDatabase();
  const transaction = database.transaction(SONGS_STORE, 'readwrite');
  await requestResult(transaction.objectStore(SONGS_STORE).delete(id));
}

export async function seedSongsIfEmpty(songs) {
  const database = await openDatabase();
  const transaction = database.transaction(SONGS_STORE, 'readwrite');
  const store = transaction.objectStore(SONGS_STORE);
  const existingCount = await requestResult(store.count());

  if (existingCount > 0) return false;

  for (const song of songs) {
    store.add(makeSongRecord(song));
  }

  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('Could not add the starter songs.'));
    transaction.onerror = () => reject(transaction.error || new Error('Could not add the starter songs.'));
  });

  return true;
}
