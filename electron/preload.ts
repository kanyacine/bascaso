import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  ready: () => ipcRenderer.send("app-ready"),
  onNavigate: (cb: (path: string) => void) => {
    const handler = (_: unknown, path: string) => cb(path);
    ipcRenderer.on("navigate", handler);
    return () => { ipcRenderer.removeListener("navigate", handler); };
  },
  updates: {
    checkNow: () => ipcRenderer.send("check-for-updates"),
    installNow: () => ipcRenderer.send("install-update"),
    onStatus: (cb: (status: { state: string; message?: string; notes?: string[] }) => void) => {
      const handler = (_: unknown, status: { state: string; message?: string; notes?: string[] }) => cb(status);
      ipcRenderer.on("update-status", handler);
      return () => { ipcRenderer.removeListener("update-status", handler); };
    },
    getAutoCheck: () => ipcRenderer.invoke("get-auto-check-updates") as Promise<boolean>,
    setAutoCheck: (enabled: boolean) => ipcRenderer.send("set-auto-check-updates", enabled),
  },
  store: {
    purchase: () => ipcRenderer.invoke("storekit-purchase"),
    restore: () => ipcRenderer.invoke("storekit-restore"),
    getProduct: () => ipcRenderer.invoke("storekit-product") as Promise<{ title: string; price: string } | null>,
    onLicenseUpdated: (cb: () => void) => {
      const handler = () => cb();
      ipcRenderer.on("license-updated", handler);
      return () => { ipcRenderer.removeListener("license-updated", handler); };
    },
    onError: (cb: (message: string) => void) => {
      const handler = (_: unknown, message: string) => cb(message);
      ipcRenderer.on("storekit-error", handler);
      return () => { ipcRenderer.removeListener("storekit-error", handler); };
    },
  },
});
