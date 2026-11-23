import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { FahhErrorBoundary } from "./ui/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FahhErrorBoundary>
      <App />
    </FahhErrorBoundary>
  </StrictMode>,
);
