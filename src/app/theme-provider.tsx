import { PropsWithChildren, useEffect } from "react";

export function ThemeProvider({ children }: PropsWithChildren) {
  useEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  return <>{children}</>;
}
