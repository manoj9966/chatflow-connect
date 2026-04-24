import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { ChatApp } from "@/components/chat/ChatApp";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // No-op, kept for future redirects
  useEffect(() => { void navigate; }, [navigate]);

  if (loading) {
    return (
      <main className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </main>
    );
  }

  return user ? <ChatApp /> : <AuthScreen />;
}
