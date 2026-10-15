"use client";

import { useEffect } from "react";

export default function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Sin HTTPS (ej. en un preview local) el registro puede fallar —
        // no es crítico para el resto de la app.
      });
    }
  }, []);
  return null;
}
