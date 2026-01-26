import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FullPageSpinner } from "@/components/shared";

interface ProtectedRouteProps {
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function ProtectedRoute({ isAuthenticated, isLoading }: ProtectedRouteProps) {
  const location = useLocation();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
