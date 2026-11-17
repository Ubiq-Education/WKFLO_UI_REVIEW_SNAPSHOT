import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "next-themes";
import { MsalProvider } from "@azure/msal-react";
import { msalInstance } from "./authConfig";
import { initializeI18n } from "./lib/i18n";

// Initialize i18n system
initializeI18n();

createRoot(document.getElementById("root")!).render(
  <MsalProvider instance={msalInstance}>
    <ThemeProvider attribute="class" defaultTheme="light">
      <App />
    </ThemeProvider>
  </MsalProvider>
);
