// CineStage REST API — start with ~/Desktop/start_cinestage.sh
// On simulator: localhost:8000 | On device: 10.0.0.34:8000
export const CINESTAGE_API_BASE_URL =
  process.env.EXPO_PUBLIC_CINESTAGE_API_BASE ||
  global.__CINESTAGE_API_BASE_URL ||
  'http://10.0.0.34:8000';
