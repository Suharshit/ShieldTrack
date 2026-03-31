import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { loadSession } from '../../lib/session';

export default function DriverLayout() {
	const [allowed, setAllowed] = useState<boolean | null>(null);

	useEffect(() => {
		let mounted = true;
		loadSession()
			.then((session) => {
				if (!mounted) return;
				setAllowed(Boolean(session && session.role === 'driver'));
			})
			.catch(() => {
				if (!mounted) return;
				setAllowed(false);
			});

		return () => {
			mounted = false;
		};
	}, []);

	if (allowed === null) {
		return (
			<View style={styles.loading}>
				<ActivityIndicator size="large" color="#2574ff" />
			</View>
		);
	}

	if (!allowed) {
		return <Redirect href="/login" />;
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
