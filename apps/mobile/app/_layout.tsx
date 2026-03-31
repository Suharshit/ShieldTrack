import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';

import { loadSession } from '../lib/session';

type AuthState =
	| { status: 'loading' }
	| { status: 'signedOut' }
	| { status: 'signedIn' };

export default function RootLayout() {
	const router = useRouter();
	const segments = useSegments();
	const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

	useEffect(() => {
		let mounted = true;
		loadSession()
			.then((session) => {
				if (!mounted) return;
				setAuth({ status: session ? 'signedIn' : 'signedOut' });
			})
			.catch(() => {
				if (!mounted) return;
				setAuth({ status: 'signedOut' });
			});

		return () => {
			mounted = false;
		};
	}, []);

	useEffect(() => {
		if (auth.status === 'loading') return;

		const rootSegment = segments[0];
		const inDriverGroup = rootSegment === '(driver)';
		const inLogin = rootSegment === 'login';

		if (auth.status === 'signedOut' && !inLogin) {
			router.replace('/login');
			return;
		}

		if (auth.status === 'signedIn' && !inDriverGroup) {
			router.replace('/(driver)/trip');
		}
	}, [auth.status, router, segments]);

	if (auth.status === 'loading') {
		return (
			<View style={styles.loading}>
				<ActivityIndicator size="large" color="#2574ff" />
			</View>
		);
	}

	return <Stack screenOptions={{ headerShown: false }} />;
}

const styles = StyleSheet.create({
	loading: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#0c0c0f',
	},
});
