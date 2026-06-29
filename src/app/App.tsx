import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "@/app/routes";
import { ThemeProvider } from "@/app/theme-provider";
import { AuthProvider } from "@/hooks/useAuth";
import { NexusDataProvider } from "@/providers/NexusDataProvider";

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <NexusDataProvider>
            <AppRoutes />
          </NexusDataProvider>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
