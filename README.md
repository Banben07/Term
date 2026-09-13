# Term

Desktop client for [ptyhub](https://github.com/Banben07/ptyhub). Host list in the window; each connection opens that server's existing web UI. The client itself has no command shortcuts, so ptyhub's own keymap still works.

## Run

```bash
npm install
npm start
```

## Package (macOS)

```bash
npm run pack
```

The app lands in `dist/mac-arm64/Term.app`. It is unsigned: first launch may need right-click → Open.

## Android

Do not compile on a laptop. GitHub Actions generates the Capacitor Android project and uploads a debug APK.

Push to `main` starts the **Android** workflow. Download the `Term-debug` artifact from that run.

Install the APK on the phone (unknown sources). Sessions still live in `ptyd`; this shell only keeps the host list and a WebView.

## License

MIT
