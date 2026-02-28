import React, { useEffect, useState } from "react";
import { View, Text, Button } from "react-native";
import { connectSync, send, subscribeSync, getSyncStatus } from "../services/syncClient";
import { armState, getLastArmMeta } from "../services/stickySync";

// NOTE:
// - On real iPad/iPhone, replace localhost with your Mac's LAN IP:
//   ws://10.x.x.x:8000/ws

export default function OrganizerScreen({ navigation }) {
  const [status, setStatus] = useState(getSyncStatus());
  const [lastMeta, setLastMeta] = useState(getLastArmMeta());

  useEffect(() => {
    connectSync("ws://localhost:8000/ws");

    const off = subscribeSync((evt) => {
      if (evt?.type === "SYNC_STATUS") {
        setStatus(getSyncStatus());
      }
    });

    const t = setInterval(() => {
      setLastMeta(getLastArmMeta());
      setStatus(getSyncStatus());
    }, 500);

    return () => {
      off();
      clearInterval(t);
    };
  }, []);

  function pushArm(payload) {
    const armed = armState(payload, { by: "Organizer" });
    send({ type: "arm/update", ...armed });
    setLastMeta(getLastArmMeta());
  }

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: "#000" }}>
      <Text style={{ fontSize: 28, fontWeight: "bold", color: "#fff" }}>
        Organizer Console
      </Text>

      <Text style={{ marginTop: 8, color: "#9ca3af" }}>
        Sync: {status === "connected" ? "Connected" : "Disconnected"}
      </Text>

      <Text style={{ marginBottom: 12, color: "#64748b" }}>
        Last ARM: {lastMeta.by} @{" "}
        {lastMeta.at ? new Date(lastMeta.at).toLocaleTimeString() : "—"}
      </Text>

      <Button title="Service Plan" onPress={() => navigation.navigate("ServicePlan")} />
      <Button title="Stage Display" onPress={() => navigation.navigate("StageDisplay")} />

      <View style={{ height: 16 }} />

      <Button
        title="ARM: Start Service (Example)"
        onPress={() =>
          pushArm({
            mode: "RUN_SERVICE",
            currentItemIndex: 0,
            currentCueIndex: 0,
          })
        }
      />
    </View>
  );
}
