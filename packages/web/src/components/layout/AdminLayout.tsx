import { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./Sidebar";

interface AdminLayoutProps {
  onLogout: () => void;
}

export function AdminLayout({ onLogout }: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
            <Link to="/admin" className="text-xl font-semibold">
              Admin Panel
            </Link>
          </div>
          <Button variant="ghost" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </header>
      <div className="flex">
        <Sidebar
          mobileOpen={mobileMenuOpen}
          onMobileClose={() => setMobileMenuOpen(false)}
        />
        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
