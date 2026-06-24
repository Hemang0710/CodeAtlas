"use client";

import type { ReactNode } from "react";
import { ErrorAlertProvider } from "./error-alert";
import { HelpChatbot } from "./help-chatbot";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { ScrollToTop } from "./scroll-to-top";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorAlertProvider>
      {children}
      <HelpChatbot />
      <ScrollToTop />
      <KeyboardShortcuts />
    </ErrorAlertProvider>
  );
}
