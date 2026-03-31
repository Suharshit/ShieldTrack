import { useState } from 'react';
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { apiClient } from '../lib/api';
import { saveSession } from '../lib/session';

const getDeviceId = (): string | undefined => {
	// TODO: Plug in a device ID source when available.
	return undefined;
};

export default function LoginScreen() {
	const router = useRouter();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const canSubmit = email.trim().length > 0 && password.trim().length > 0;

	const handleLogin = async () => {
		if (!canSubmit || submitting) return;
		setSubmitting(true);
		setError(null);

		const result = await apiClient.login({
			email: email.trim(),
			password,
			device_id: getDeviceId(),
		});

		if (!result.ok) {
			setError(result.error.error.message || 'Login failed');
			setSubmitting(false);
			return;
		}

		await saveSession(result.data.session);
		setSubmitting(false);
		router.replace('/(driver)/trip');
	};

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
			style={styles.container}
		>
			<View style={styles.card}>
				<Text style={[styles.title, styles.text]}>
					Driver Login
				</Text>
				<Text style={[styles.subtitle, styles.text]}>
					Sign in to start your route
				</Text>

				<TextInput
					placeholder="Email"
					autoCapitalize="none"
					autoComplete="email"
					keyboardType="email-address"
					value={email}
					onChangeText={setEmail}
					style={styles.input}
					editable={!submitting}
				/>
				<TextInput
					placeholder="Password"
					secureTextEntry
					value={password}
					onChangeText={setPassword}
					style={styles.input}
					editable={!submitting}
				/>

				{error ? <Text style={[styles.error, styles.text]}>{error}</Text> : null}

				<Pressable
					style={[styles.button, !canSubmit && styles.buttonDisabled]}
					onPress={handleLogin}
					disabled={!canSubmit || submitting}
				>
					{submitting ? (
						<ActivityIndicator color="#ffffff" />
					) : (
						<Text style={styles.buttonText}>Sign In</Text>
					)}
				</Pressable>

				<Text style={[styles.helper, styles.text]}>
					Tip: set EXPO_PUBLIC_USE_MOCKS=1 to test without backend.
				</Text>
			</View>
		</KeyboardAvoidingView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'center',
		padding: 24,
		backgroundColor: '#0c0c0f',
	},
	card: {
		backgroundColor: '#15151a',
		borderRadius: 16,
		padding: 24,
		gap: 12,
	},
	title: {
		fontSize: 28,
		fontWeight: '700',
	},
	subtitle: {
		opacity: 0.8,
		marginBottom: 8,
	},
	text: {
		color: '#ffffff',
	},
	input: {
		backgroundColor: '#1f1f26',
		borderRadius: 10,
		paddingHorizontal: 14,
		paddingVertical: 12,
		color: '#ffffff',
	},
	error: {
		color: '#ff6b6b',
	},
	button: {
		backgroundColor: '#2574ff',
		borderRadius: 10,
		paddingVertical: 12,
		alignItems: 'center',
	},
	buttonDisabled: {
		opacity: 0.5,
	},
	buttonText: {
		color: '#ffffff',
		fontWeight: '600',
	},
	helper: {
		opacity: 0.6,
		fontSize: 12,
	},
});
