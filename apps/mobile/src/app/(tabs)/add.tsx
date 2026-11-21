import { Redirect } from 'expo-router';

/**
 * Placeholder for the centre “Log a trip” tab button. The button itself opens the log form
 * (see (tabs)/_layout.tsx); if this route is ever reached directly, go to the form.
 */
export default function AddTab() {
  return <Redirect href="/log/new" />;
}
