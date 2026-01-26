import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import type { PublicUser } from "@auth-boilerplate/shared";

interface ProtectedLayoutProps {
  user: PublicUser | null;
  onLogout: () => void;
}

export function ProtectedLayout({ user, onLogout }: ProtectedLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header user={user} onLogout={onLogout} />
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
