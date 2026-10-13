# Digital Songbook

A read-only, offline-capable song catalog built with HTML, CSS, vanilla JavaScript, and IndexedDB.

## Run locally

1. Open this folder in Visual Studio Code.
2. Install the **Live Server** extension if it is not already installed.
3. Right-click `index.html` and choose **Open with Live Server**.
4. Keep the local server running while using the site at its `http://localhost` address.

Do not open `index.html` directly as a `file://` URL. Service workers and PWA installation require HTTPS or localhost.

## Install the app

- **Chrome on Windows:** Use the install icon in the address bar, or use the three-dot menu and look for **Install page as app** / **Install Digital Songbook**.
- **Chrome on Android:** Open the HTTPS website in Chrome, open the three-dot menu, and select **Install app** or **Add to Home screen**.
- **Safari on iPhone/iPad:** Open the HTTPS website, tap **Share**, then choose **Add to Home Screen**.

The in-app **Install app** button opens the browser's installation prompt when supported. Otherwise it displays these installation instructions.

## Publish the website

This project includes a GitHub Actions workflow at `.github/workflows/pages.yml` that publishes the static app with GitHub Pages. To use it:

1. Create a GitHub repository and push this project to its `main` branch.
2. In the repository, open **Settings → Pages** and set the publishing source to **GitHub Actions**.
3. Open **Actions** and wait for **Deploy Digital Songbook to GitHub Pages** to finish.
4. Open the Pages URL shown in the workflow deployment summary. For a project repository it is typically `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.

The workflow publishes only the website files, icon, and bundled song catalog; it excludes the original PDF and local parser test assets. No backend, account service, or paid API is used by the app. The published site includes these files at the same site path:

- `index.html`, `styles.css`, `app.js`, `database.js`
- `manifest.json`, `service-worker.js`
- `songbook-catalog.json`
- `icons/icon.svg`

The approximately 3.2 MB `songbook-catalog.json` file is part of the website. A new browser downloads it once and seeds that browser's IndexedDB. Do not omit this file when publishing. Existing installations preserve their local catalog and do not re-seed the bundled catalog after the initial seed version.

## Offline behavior

On the first visit, open the site while online and wait for the full catalog to finish loading and the service worker to install. The service worker caches the application shell and catalog. Subsequent visits can open the catalog and search offline. Browser storage is local to that browser profile and site origin; it does not synchronize between devices.

Service worker upgrades use a versioned cache (`digital-songbook-shell-v3`). When the cache name changes in `service-worker.js`, the next worker install pre-caches the new shell, then removes older app caches during activation. User catalog records remain in IndexedDB.

## Notes

- The app is intentionally read-only: PDF uploads, song editing, and deletion are not available on the website.
- Songs include only the number, title, and artist; lyrics are not included in the bundled catalog.
- PWA installation is not available from a direct `file://` URL. Use HTTPS or localhost.
