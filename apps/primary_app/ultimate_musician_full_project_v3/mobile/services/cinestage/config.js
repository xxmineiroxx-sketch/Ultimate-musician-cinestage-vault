import { CINESTAGE_URL } from "../../screens/config";

export const CINESTAGE_API_BASE_URL =
  process.env.EXPO_PUBLIC_CINESTAGE_API_BASE ||
  global.__CINESTAGE_API_BASE_URL ||
  CINESTAGE_URL;

export const CINESTAGE_WS_BASE_URL = CINESTAGE_API_BASE_URL
  .replace(/^https:/, "wss:")
  .replace(/^http:/, "ws:");

export const CINESTAGE_BRAIN_CAPABILITIES_URL =
  `${CINESTAGE_API_BASE_URL}/api/brain/capabilities`;

export const CINESTAGE_BRAIN_BOOTSTRAP_URL =
  `${CINESTAGE_API_BASE_URL}/api/brain/bootstrap`;
