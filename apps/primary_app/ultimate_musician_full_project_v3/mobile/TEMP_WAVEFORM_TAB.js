// TEMPORARY WORKAROUND - Add Waveform tab without restarting Metro.
// Keep this as plain text so it does not break lint or Metro parsing.

const waveformTabExample = `
<Tab.Screen
  name="Waveform"
  component={require('./screens/WaveformScreen').default}
  options={{ title: '🎚️ Waveform' }}
/>
`;

export default waveformTabExample;
