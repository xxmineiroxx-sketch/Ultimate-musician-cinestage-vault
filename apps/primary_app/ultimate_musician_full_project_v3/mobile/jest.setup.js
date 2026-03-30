import mockAsyncStorage from "@react-native-async-storage/async-storage/jest/async-storage-mock";

jest.mock("@react-native-async-storage/async-storage", () => mockAsyncStorage);

jest.mock("expo-av", () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn(async () => ({ sound: {}, status: {} })),
    },
    setAudioModeAsync: jest.fn(async () => {}),
  },
}));

if (typeof window === "undefined") {
  global.window = global;
}

if (typeof global.window.dispatchEvent !== "function") {
  global.window.dispatchEvent = () => {};
}
