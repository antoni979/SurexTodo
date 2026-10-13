import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// El cliente de Supabase y la sesión se inicializan en src/data/ al
// importarse; no hace falta ningún provider envolviendo la app.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
