import { StyleSheet, Text, View } from 'react-native';

export default function SOSConfirmScreen() {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>SOS Confirm</Text>
			<Text style={styles.subtitle}>Emergency trigger confirmation modal.</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 24,
		justifyContent: 'center',
		backgroundColor: '#2b0000',
	},
	title: {
		fontSize: 28,
		fontWeight: '700',
		color: '#ff4444',
	},
	subtitle: {
		opacity: 0.8,
		marginTop: 8,
		color: '#ffcccc',
	},
});
