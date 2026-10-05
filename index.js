/**
 * @format
 */

import { AppRegistry } from 'react-native';
import * as Sentry from '@sentry/react-native';
import App from './App';
import { name as appName } from './app.json';

// Initialized before the app module renders so a throw during module
// evaluation or first render is still captured.
Sentry.init({
  dsn: 'https://fa5c35e23e58e082c1765c9ac8e62f0c@o4511882967121920.ingest.de.sentry.io/4512205901201488',

  // Release/dist are injected by the Sentry Gradle plugin at build time.
  enableNative: true,

  // Native-only app: the web-only replay/feedback packages are already
  // excluded in metro.config.js, and no PII should leave the device.
  tracesSampleRate: 0,
  sendDefaultPii: false,

  // Verbose SDK logging in dev only, so init problems are visible in logcat
  // without spamming a release build.
  debug: __DEV__,

  // With `debug` on, the SDK forwards the native Sentry SDK's own log lines to
  // JS and, by default, prints the error-level ones with console.error - which
  // React Native turns into a red "Console Error" LogBox screen. Two of those
  // are harmless SDK-internal noise, not app faults:
  //  - "addListener of NativeEventEmitter can't be used on Android!" is the
  //    native module's stub for the NativeEventEmitter contract, logged when the
  //    log listener itself subscribes.
  //  - "Failed to delete '<cache>/sentry/....envelope' after trying to capture
  //    it" is the offline cache losing a race with a file that is already gone.
  // Known noise is dropped; anything else stays visible in Metro/logcat but as a
  // plain log, so it can no longer cover the app with a red error screen.
  onNativeLog: ({ level, component, message }) => {
    if (
      /addListener of NativeEventEmitter can't be used on Android/i.test(message) ||
      /Failed to delete .*\.envelope/i.test(message)
    ) {
      return;
    }
    console.log(`[Sentry native ${level}] [${component}] ${message}`);
  },

  beforeSend(event) {
    // yt-dlp downloads and MediaStore writes surface expected conditions as
    // failures (a 403 on a probe, a cancelled download, a codec with no
    // poster frame). Drop those so real faults stay visible.
    const message = event.exception?.values?.[0]?.value ?? '';
    if (/postprocessing|ffprobe|yt-dlp|Unsupported filetypes/i.test(message)) {
      return null;
    }
    return event;
  },
});

AppRegistry.registerComponent(appName, () => App);
