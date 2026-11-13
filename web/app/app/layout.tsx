import type { Viewport } from "next";
import "../portal.css";

// The portal's styles (app/portal.css), for every screen under /app.
// the portal's own bar colour for the browser chrome (the public site keeps its own in the root layout)
export const viewport: Viewport = { themeColor: "#121316", colorScheme: "dark", width: "device-width", initialScale: 1 };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
