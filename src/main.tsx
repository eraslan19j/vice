import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);

// PWA: offline cache + installability (only works when served over http(s) with sw.js next to index.html)
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
