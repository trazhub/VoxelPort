import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import TitleBar from "./components/TitleBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Toast from "./components/Toast.jsx";
import Home from "./pages/Home.jsx";
import Install from "./pages/Install.jsx";
import Mods from "./pages/Mods.jsx";
import CreateRoom from "./pages/CreateRoom.jsx";
import JoinRoom from "./pages/JoinRoom.jsx";
import Settings from "./pages/Settings.jsx";

const AppContext = createContext(null);
const ToastContext = createContext(null);

export function useAppContext() {
  return useContext(AppContext);
}

export function useToast() {
  return useContext(ToastContext);
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded border border-danger/50 bg-danger/10 p-4 text-danger">
          Something went wrong. Please reload the app.
        </div>
      );
    }
    return this.props.children;
  }
}

function AppLayout() {
  const [servers, setServers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [selectedServerId, setSelectedServerId] = useState(null);
  const [loadingServers, setLoadingServers] = useState(true);
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = "info") => {
    if (!message) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4000);
  }, []);

  const refreshServers = useCallback(async () => {
    setLoadingServers(true);
    try {
      const res = await window.api.getServers();
      if (res.success) {
        const list = res.data || [];
        setServers(list);
        setSelectedServerId((currentId) => {
          if (!currentId) return list[0]?.id || null;
          return list.find((server) => server.id === currentId) ? currentId : list[0]?.id || null;
        });
      }
    } finally {
      setLoadingServers(false);
    }
  }, []);

  useEffect(() => {
    refreshServers();
    window.api.getSettings().then((res) => {
      if (res.success) setSettings(res.data);
    });
    window.api.getAppVersion().then((res) => {
      if (res.success) setAppVersion(res.data?.version || "1.0.0");
    });
  }, [refreshServers]);

  const appValue = useMemo(
    () => ({
      servers,
      refreshServers,
      loadingServers,
      selectedServerId,
      setSelectedServerId,
      settings,
      setSettings
    }),
    [servers, refreshServers, loadingServers, selectedServerId, settings]
  );

  const toastValue = useMemo(
    () => ({ showToast }),
    [showToast]
  );

  return (
    <AppContext.Provider value={appValue}>
      <ToastContext.Provider value={toastValue}>
        <div className="flex h-screen flex-col overflow-hidden bg-bg-primary text-text-primary">
          <TitleBar />
          <Toast toasts={toasts} onClose={removeToast} />

          <div className="flex min-h-0 flex-1">
            <Sidebar version={appVersion} />
            <main className="min-w-0 flex-1 overflow-y-auto p-6">
              <Routes>
                <Route path="/" element={<ErrorBoundary><Home /></ErrorBoundary>} />
                <Route path="/install" element={<ErrorBoundary><Install /></ErrorBoundary>} />
                <Route path="/mods" element={<ErrorBoundary><Mods /></ErrorBoundary>} />
                <Route path="/create-room" element={<ErrorBoundary><CreateRoom /></ErrorBoundary>} />
                <Route path="/join-room" element={<ErrorBoundary><JoinRoom /></ErrorBoundary>} />
                <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </ToastContext.Provider>
    </AppContext.Provider>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppLayout />
    </HashRouter>
  );
}
