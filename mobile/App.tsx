import NetInfo from "@react-native-community/netinfo";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";

// The TailorConnect website this app shows. Set "extra.webUrl" in app.json to your live address.
const WEB_URL = String(Constants.expoConfig?.extra?.webUrl ?? "https://tailorconnect.example.com").replace(/\/$/, "");
const HOST = new URL(WEB_URL).host;

// Pages that must open inside the app even though they're on another site (payment checkout).
const IN_APP_HOSTS = [HOST, "checkout.paystack.com", "standard.paystack.co"];

const GREEN = "#0d7352";

export default function App() {
  const webview = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  // Ask for location up front so "Use my current location" works inside the app.
  useEffect(() => {
    Location.requestForegroundPermissionsAsync().catch(() => {});
  }, []);

  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)), []);

  // Android back button goes back a page instead of closing the app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webview.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Phone calls, directions and other sites open in the right app instead of inside TailorConnect.
  const shouldLoad = useCallback((req: { url: string }) => {
    const url = req.url;
    if (url.startsWith("about:") || url.startsWith("data:") || url.startsWith("blob:")) return true;
    if (!/^https?:/i.test(url)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    if (IN_APP_HOSTS.includes(new URL(url).host)) return true;
    Linking.openURL(url).catch(() => {});
    return false;
  }, []);

  const retry = () => {
    setFailed(false);
    setLoading(true);
    webview.current?.reload();
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <StatusBar style="dark" />
        {!online || failed ? (
          <View style={styles.center}>
            <Text style={styles.emoji}>📶</Text>
            <Text style={styles.title}>{online ? "Couldn't load TailorConnect" : "You're offline"}</Text>
            <Text style={styles.body}>Check your data or Wi-Fi connection, then try again.</Text>
            <Pressable style={styles.button} onPress={retry}>
              <Text style={styles.buttonText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <WebView
              ref={webview}
              source={{ uri: `${WEB_URL}/dashboard` }}
              onNavigationStateChange={(nav: WebViewNavigation) => setCanGoBack(nav.canGoBack)}
              onShouldStartLoadWithRequest={shouldLoad}
              onLoadEnd={() => setLoading(false)}
              onError={() => setFailed(true)}
              geolocationEnabled
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled
              allowsBackForwardNavigationGestures
              pullToRefreshEnabled
              applicationNameForUserAgent="TailorConnectApp/1.0"
              setSupportMultipleWindows={false}
            />
            {loading && (
              <View style={styles.loading} pointerEvents="none">
                <ActivityIndicator size="large" color={GREEN} />
              </View>
            )}
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#ffffff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fafaf9" },
  emoji: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: "700", marginTop: 8, color: "#1c1917" },
  body: { fontSize: 15, color: "#57534e", textAlign: "center", marginTop: 8 },
  button: { backgroundColor: GREEN, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12, marginTop: 20 },
  buttonText: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffffcc" },
});
