import { CINESTAGE_URL } from "../../screens/config";

export const CINESTAGE_API_BASE_URL =
  process.env.EXPO_PUBLIC_CINESTAGE_API_BASE ||
  global.__CINESTAGE_API_BASE_URL ||
  CINESTAGE_URL;
