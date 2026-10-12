# Ntoma mobile app

The Android and iPhone app for Ntoma, built with [Expo](https://expo.dev).

It shows the Ntoma website inside a native app. Every feature of the website works the same here, and new website features appear in the app straight away without publishing an update. On top of the website, the app adds:

- Location permission, so "Use my current location" and live location work
- The Android back button goes back a page instead of closing the app
- Phone numbers, directions and other links open in the phone's own apps
- Mobile Money checkout stays inside the app
- An offline screen with a "Try again" button
- An app icon and splash screen

## Setup

1. Put your live website address in `app.json` under `expo.extra.webUrl`, for example `https://ntoma.com.gh`. To test against your computer, use its local network address, for example `http://192.168.1.20:3000`.
2. Install and run:

   ```bash
   npm install
   npx expo start
   ```

   Scan the QR code with the **Expo Go** app on your phone.

## Publishing to the app stores

You build with [EAS](https://docs.expo.dev/build/introduction/), Expo's build service. You need a free Expo account. Google Play also needs a one-time US$25 developer account, and the Apple App Store needs a US$99/year Apple Developer account.

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview      # an APK you can install and share directly
eas build --platform android --profile production   # an App Bundle for Google Play
eas build --platform ios --profile production       # for the App Store
eas submit --platform android                       # upload to Google Play
```
