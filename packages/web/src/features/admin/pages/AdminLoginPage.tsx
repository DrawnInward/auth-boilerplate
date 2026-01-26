import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminLoginForm } from "../components";
import { useAdminAuth } from "../context/AdminAuthContext";
import { useApiError } from "@/hooks";

export function AdminLoginPage() {
  const { login } = useAdminAuth();
  const { handleError } = useApiError();

  const handleSubmit = async (data: Parameters<typeof login>[0]) => {
    try {
      await login(data);
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Admin Login</CardTitle>
        <CardDescription>Sign in to the admin panel</CardDescription>
      </CardHeader>
      <CardContent>
        <AdminLoginForm onSubmit={handleSubmit} />
      </CardContent>
    </Card>
  );
}
