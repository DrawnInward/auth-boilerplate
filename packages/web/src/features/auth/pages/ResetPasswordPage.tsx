import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PasswordResetForm } from "../components";
import { useResetPassword } from "@/api/queries/auth";
import { useApiError } from "@/hooks";

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const resetPassword = useResetPassword();
  const { handleError } = useApiError();

  if (!token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Invalid link</CardTitle>
          <CardDescription>No reset token provided.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link to="/forgot-password" className="text-primary hover:underline">
            Request a new reset link
          </Link>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (password: string) => {
    try {
      await resetPassword.mutateAsync({ token, password });
      toast.success("Password reset successfully! Please sign in.");
      navigate("/login");
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>Enter your new password below</CardDescription>
      </CardHeader>
      <CardContent>
        <PasswordResetForm
          onSubmit={handleSubmit}
          isLoading={resetPassword.isPending}
        />
      </CardContent>
    </Card>
  );
}
