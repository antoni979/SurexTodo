import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import "./index.css";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;

if (!convexUrl) {
  throw new Error(
    "Falta VITE_CONVEX_URL. Ejecuta `npx convex dev` y revisa el archivo .env.local",
  );
}

// Marca de build para diagnóstico remoto. Si en la consola de antonio NO
// aparece esta línea (o el número es viejo), está corriendo una build cacheada.
export const BUILD_ID = "2026-07-06-eventlog";
// eslint-disable-next-line no-console
console.log(
  `%c[SUREX] build ${BUILD_ID} · convex ${convexUrl}`,
  "color:#2563eb;font-weight:bold",
);

const convex = new ConvexReactClient(convexUrl);

// Exponer el cliente para inspección manual desde la consola:
//   window.__surex.connectionState?.()
// @ts-expect-error debug global
window.__surex = convex;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </React.StrictMode>,
);
