// TEMPORARY WORKAROUND - Add Waveform tab without restarting Metro
// This file can be hot-reloaded if needed

// Add this line to HomeScreen.js or wherever your tab navigation is:

// Example for Bottom Tab Navigator:
<Tab.Screen 
  name="Waveform" 
  component={require('./screens/WaveformScreen').default} 
  options={{ title: '🎚️ Waveform' }} 
/>

// If React Navigation crashes after reload, comment out the above and use:
// The screen is navigable via Stack.Navigator even without tab

// Navigate by:
// navigation.navigate('Waveform');
