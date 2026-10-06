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
  // JS through this callback. Do NOT print them with console.log/console.error:
  // Sentry records every console call as a breadcrumb, the breadcrumb is synced
  // back to the native SDK, and the native SDK logs "Serializing object: ..."
  // for it - which comes straight back here. That loop nests each message
  // inside the next, floods the JS thread with tens of thousands of lines per
  // second and makes the UI stop responding to taps. (console.error also
  // raised a red LogBox screen.) Native lines are already in logcat under the
  // RNSentry tag, so this callback intentionally drops everything.
  onNativeLog: () => {},

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
