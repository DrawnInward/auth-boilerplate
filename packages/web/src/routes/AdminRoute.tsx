import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FullPageSpinner } from "@/components/shared";

interface AdminRouteProps {
  isAuthenticated: boolean;
  isLoading: boolean;
}

export function AdminRoute({ isAuthenticated, isLoading }: AdminRouteProps) {
  const location = useLocation();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
