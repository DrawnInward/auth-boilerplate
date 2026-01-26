import { Outlet, Link } from "react-router-dom";

export function PublicLayout() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex h-14 items-center px-4">
          <Link to="/" className="text-xl font-semibold">
            Auth Boilerplate
          </Link>
        </div>
      </header>
      <main className="container mx-auto flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
