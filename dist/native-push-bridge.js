(function () {
  const BACKEND_URL_KEY = 'noir_webpush_backend_url';
  const BACKEND_ENABLED_KEY = 'noir_webpush_enabled';
  const SUBSCRIBED_KEY = 'noir_webpush_subscribed';
  const TOKEN_KEY = 'noir_native_push_token';
  const LAST_SYNCED_BACKEND_KEY = 'noir_native_push_last_backend_url';
  const LAST_SYNCED_AT_KEY = 'noir_native_push_last_sync_at';
  const LAST_REGISTER_ATTEMPT_AT_KEY = 'noir_native_push_last_register_attempt_at';
  const CHANNEL_ID = 'roche_messages';
  const TOKEN_RESYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const TOKEN_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

  let listenersReady = false;
  let registerInFlight = false;
  let nativeBuildConfigPromise = null;

  const cleanUrl = (url) => String(url || '').replace(/\/+$/, '');

  const getCapacitor = () => window.Capacitor || null;
  const getPlatform = () => {
    const capacitor = getCapacitor();
    if (!capacitor) return 'web';
    if (typeof capacitor.getPlatform === 'function') return capacitor.getPlatform();
    return capacitor.platform || 'web';
  };

  const isNativeAndroid = () => {
    const capacitor = getCapacitor();
    if (!capacitor) return false;
    const nativePlatform = typeof capacitor.isNativePlatform === 'function'
      ? capacitor.isNativePlatform()
      : getPlatform() !== 'web';
    return nativePlatform && getPlatform() === 'android';
  };

  const getPush = () => getCapacitor()?.Plugins?.PushNotifications || null;
  const getLocal = () => getCapacitor()?.Plugins?.LocalNotifications || null;

  const loadNativeBuildConfig = async () => {
    if (!isNativeAndroid()) return null;

    if (!nativeBuildConfigPromise) {
      const configUrl = new URL('native-build-config.json', window.location.href).toString();
      nativeBuildConfigPromise = fetch(configUrl, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) return null;

          const json = await response.json();
          return json && typeof json === 'object' ? json : null;
        })
        .catch((error) => {
          console.warn('[native-push-bridge] Failed to load native build config:', error);
          return null;
        });
    }

    return nativeBuildConfigPromise;
  };

  const openPendingDb = () => new Promise((resolve, reject) => {
    const req = indexedDB.open('roche-push-pending', 3);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingPushResponses')) {
        db.createObjectStore('pendingPushResponses', { keyPath: 'requestId' });
      }
      if (!db.objectStoreNames.contains('appState')) {
        db.createObjectStore('appState');
      }
      if (!db.objectStoreNames.contains('pendingNotificationOpens')) {
        db.createObjectStore('pendingNotificationOpens', { keyPath: 'openKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const savePendingResponse = async (data) => {
    const db = await openPendingDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('pendingPushResponses', 'readwrite');
      tx.objectStore('pendingPushResponses').put(data);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  };

  const savePendingNotificationOpen = async (data) => {
    const db = await openPendingDb();
    const requestId = String(data?.requestId || '').trim();
    const chatId = String(data?.chatId || data?.conversationId || '').trim();
    const pushType = String(data?.pushType || data?.type || '').trim();
    const timestamp = Number(data?.timestamp) > 0 ? Number(data.timestamp) : Date.now();
    const openKey = requestId
      ? `request:${requestId}`
      : (chatId && pushType ? `open:${chatId}:${pushType}:${timestamp}` : `open:${Date.now()}`);

    await new Promise((resolve, reject) => {
      const tx = db.transaction('pendingNotificationOpens', 'readwrite');
      tx.objectStore('pendingNotificationOpens').put({
        openKey,
        requestId,
        chatId,
        conversationId: chatId,
        backendUrl: String(data?.backendUrl || '').trim(),
        pushType,
        timestamp,
        source: String(data?.source || 'notification').trim(),
        openedAt: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  };

  const notifyAppToProcessPending = (detail) => {
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new CustomEvent('roche-native-push-received', {
        detail: detail || {}
      }));
    } catch (error) {
      console.warn('[native-push-bridge] Failed to notify app runtime:', error);
    }
  };

  const syncTokenToBackend = async (token, backendUrl) => {
    const url = cleanUrl(backendUrl);
    if (!url || !token) return;

    const response = await fetch(`${url}/subscribe/native`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        platform: 'android',
        appId: 'com.roche.app',
        nativeDisplayMode: 'android_service_v1'
      })
    });

    if (!response.ok) {
      const errorText = (await response.text()).trim();
      throw new Error(`Native subscribe failed: ${response.status}${errorText ? ` ${errorText}` : ''}`);
    }

    localStorage.setItem(LAST_SYNCED_BACKEND_KEY, url);
    localStorage.setItem(LAST_SYNCED_AT_KEY, String(Date.now()));
  };

  const isOlderThan = (storageKey, maxAgeMs) => {
    const lastAt = Number(localStorage.getItem(storageKey) || 0);
    return !Number.isFinite(lastAt) || lastAt <= 0 || (Date.now() - lastAt) > maxAgeMs;
  };

  const shouldResyncToken = (backendUrl) => {
    const lastSyncedBackend = cleanUrl(localStorage.getItem(LAST_SYNCED_BACKEND_KEY) || '');
    return lastSyncedBackend !== backendUrl || isOlderThan(LAST_SYNCED_AT_KEY, TOKEN_RESYNC_INTERVAL_MS);
  };

  const shouldRefreshNativeToken = () => {
    return isOlderThan(LAST_REGISTER_ATTEMPT_AT_KEY, TOKEN_REFRESH_INTERVAL_MS);
  };

  const refreshNativeTokenSoon = async () => {
    const push = getPush();
    if (!push?.register) return;

    localStorage.setItem(LAST_REGISTER_ATTEMPT_AT_KEY, String(Date.now()));
    await push.register();
  };

  const preloadPendingResult = async (rawData, options = {}) => {
    const requestId = String(rawData?.requestId || '');
    const backendUrl = cleanUrl(rawData?.backendUrl || localStorage.getItem(BACKEND_URL_KEY) || '');
    let resolvedChatId = String(rawData?.chatId || rawData?.conversationId || '');
    const openedFromAction = options.openedFromAction === true;

    if (openedFromAction) {
      try {
        await savePendingNotificationOpen({
          ...(rawData || {}),
          requestId,
          chatId: resolvedChatId,
          conversationId: resolvedChatId,
          backendUrl,
          pushType: rawData?.pushType || rawData?.type,
          source: 'notification'
        });
      } catch (error) {
        console.warn('[native-push-bridge] Failed to persist notification open payload:', error);
      }
    }

    if (!requestId || !backendUrl) {
      notifyAppToProcessPending({
        ...(rawData || {}),
        chatId: resolvedChatId,
        conversationId: resolvedChatId,
        openedFromAction
      });
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/result/${requestId}`);
      if (response.ok) {
        const result = await response.json();
        resolvedChatId = String(result.chatId || resolvedChatId || '');
        await savePendingResponse({
          ...result,
          requestId,
          chatId: resolvedChatId,
          charId: result.charId || rawData?.charId || '',
          pushType: result.pushType || rawData?.type || 'ai_response',
          chatTitle: result.chatTitle || rawData?.title || 'Roche',
          timestamp: result.timestamp || Date.now(),
          backendUrl,
          processed: false
        });
      }
    } catch (error) {
      console.warn('[native-push-bridge] Failed to preload pending result:', error);
    }

    notifyAppToProcessPending({
      ...(rawData || {}),
      requestId,
      chatId: resolvedChatId,
      conversationId: resolvedChatId,
      backendUrl,
      openedFromAction
    });
  };

  const createChannel = async (plugin, description) => {
    if (!plugin?.createChannel) return;

    await plugin.createChannel({
      id: CHANNEL_ID,
      name: 'Roche Messages',
      description,
      importance: 5,
      visibility: 1,
      sound: 'default',
      vibration: true
    });
  };

  const ensureChannel = async () => {
    const results = await Promise.allSettled([
      createChannel(getLocal(), 'Roche local notifications'),
      createChannel(getPush(), 'Roche push notifications')
    ]);

    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.warn('[native-push-bridge] Failed to create channel:', result.reason);
      }
    });
  };

  const setupListeners = async () => {
    if (listenersReady || !isNativeAndroid()) return;

    const push = getPush();
    if (!push?.addListener) return;

    listenersReady = true;

    await push.addListener('registration', async (token) => {
      const value = token?.value || '';
      if (!value) return;

      localStorage.setItem(TOKEN_KEY, value);
      localStorage.setItem(SUBSCRIBED_KEY, 'true');

      const backendUrl = cleanUrl(localStorage.getItem(BACKEND_URL_KEY) || '');
      if (backendUrl) {
        try {
          await syncTokenToBackend(value, backendUrl);
        } catch (error) {
          console.warn('[native-push-bridge] Failed to sync token automatically:', error);
        }
      }
    });

    await push.addListener('registrationError', (error) => {
      console.error('[native-push-bridge] Registration error:', error);
    });

    await push.addListener('pushNotificationReceived', async (notification) => {
      await preloadPendingResult(notification?.data || {}, { openedFromAction: false });
    });

    await push.addListener('pushNotificationActionPerformed', async (action) => {
      await preloadPendingResult(action?.notification?.data || {}, { openedFromAction: true });
    });
  };

  const requestPermission = async () => {
    const local = getLocal();
    const push = getPush();
    let localPermission = 'default';

    try {
      const localResult = await local?.requestPermissions?.();
      const display = localResult?.display;
      if (display === 'granted' || display === 'denied' || display === 'prompt') {
        localPermission = display;
      }
    } catch (error) {
      console.warn('[native-push-bridge] Local notification permission request failed:', error);
    }

    const result = await push?.requestPermissions?.();
    return result?.receive || localPermission;
  };

  const ensureRegistered = async () => {
    if (!isNativeAndroid() || registerInFlight) return;

    const backendEnabled = localStorage.getItem(BACKEND_ENABLED_KEY) === 'true';
    const backendUrl = cleanUrl(localStorage.getItem(BACKEND_URL_KEY) || '');
    if (!backendEnabled || !backendUrl) return;

    registerInFlight = true;

    try {
      await setupListeners();
      await ensureChannel();

      const permission = await requestPermission();
      if (permission !== 'granted') return;

      const existingToken = localStorage.getItem(TOKEN_KEY) || '';
      if (existingToken) {
        if (shouldResyncToken(backendUrl)) {
          await syncTokenToBackend(existingToken, backendUrl);
        }

        if (shouldRefreshNativeToken()) {
          await refreshNativeTokenSoon();
        }
        return;
      }

      const buildConfig = await loadNativeBuildConfig();
      if (buildConfig?.androidFirebaseConfigured === false) {
        console.warn('[native-push-bridge] Firebase Android config is missing, skip native registration.');
        return;
      }

      await refreshNativeTokenSoon();
    } catch (error) {
      console.warn('[native-push-bridge] Native registration failed:', error);
    } finally {
      registerInFlight = false;
    }
  };

  const sendTestNotification = async () => {
    const local = getLocal();
    if (!local?.schedule) return false;

    const permission = await requestPermission();
    if (permission !== 'granted') return false;

    await ensureChannel();
    await local.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647,
          title: 'Noir Studio',
          body: 'This is a native Android notification test.',
          schedule: { at: new Date(Date.now() + 1000) },
          channelId: CHANNEL_ID,
          extra: { type: 'native_test' }
        }
      ]
    });
    return true;
  };

  window.__rocheNativePush = {
    ensureRegistered,
    requestPermission,
    sendTestNotification
  };

  if (!isNativeAndroid()) return;

  setupListeners().catch((error) => {
    console.warn('[native-push-bridge] Listener setup failed:', error);
  });

  ensureChannel().catch((error) => {
    console.warn('[native-push-bridge] Initial notification channel setup failed:', error);
  });

  ensureRegistered().catch((error) => {
    console.warn('[native-push-bridge] Initial native registration failed:', error);
  });

  setInterval(() => {
    ensureRegistered().catch((error) => {
      console.warn('[native-push-bridge] Periodic native registration failed:', error);
    });
  }, 5000);
})();
