import { Outlet, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./Sidebar";

interface AdminLayoutProps {
  onLogout: () => void;
}

export function AdminLayout({ onLogout }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/admin" className="text-xl font-semibold">
            Admin Panel
          </Link>
          <Button variant="ghost" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </header>
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
