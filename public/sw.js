// Service Worker mínimo — Fase 2. Hoy solo habilita que el navegador
// ofrezca "Agregar a pantalla de inicio" y deja el enganche listo para
// Web Push real el día que la app tenga un dominio con HTTPS.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Deja pasar todas las requests tal cual (sin cache offline por ahora).
self.addEventListener("fetch", () => {});

// Cuando haya push real desde el servidor (VAPID + HTTPS), esto ya queda
// listo para mostrar la notificación del sistema.
self.addEventListener("push", (event) => {
  const datos = event.data ? event.data.json() : { titulo: "Improfor", mensaje: "" };
  event.waitUntil(
    self.registration.showNotification(datos.titulo || "Improfor · Bodega", {
      body: datos.mensaje || "",
      icon: "/icon.svg",
    })
  );
});
