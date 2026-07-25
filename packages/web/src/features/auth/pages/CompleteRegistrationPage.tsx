import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PasswordResetForm } from "../components";
import { useCompleteRegistration } from "@/api/queries/auth";
import { useApiError } from "@/hooks";

export function CompleteRegistrationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");
  const completeRegistration = useCompleteRegistration();
  const { handleError } = useApiError();

  if (!token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Invalid link</CardTitle>
          <CardDescription>No token provided.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link to="/register" className="text-primary hover:underline">
            Try registering again
          </Link>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (password: string) => {
    try {
      await completeRegistration.mutateAsync({ token, password });
      toast.success("Account created successfully! Please sign in.");
      navigate("/login");
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Set your password</CardTitle>
        <CardDescription>
          Create a password to complete your registration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PasswordResetForm
          onSubmit={handleSubmit}
          isLoading={completeRegistration.isPending}
          submitLabel="Complete registration"
        />
      </CardContent>
    </Card>
  );
}
