import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

import {
  handleNotificationResponse,
  syncPushRegistration,
} from '../services/pushNotifications';

export default function PushNotificationManager({ navigationRef }) {
  useEffect(() => {
    const sync = () => {
      syncPushRegistration().catch(() => {});
    };

    sync();

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        handleNotificationResponse(response, navigationRef);
      },
    );

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleNotificationResponse(response, navigationRef);
      })
      .catch(() => {});

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        sync();
      }
    });

    return () => {
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [navigationRef]);

  return null;
}
