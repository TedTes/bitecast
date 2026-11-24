import { Redirect } from 'expo-router';

/** DawnBite 1.0 is free-only. Keep old development links from opening a purchase flow. */
export default function PaywallRedirect() {
  return <Redirect href="/(tabs)/today" />;
}
