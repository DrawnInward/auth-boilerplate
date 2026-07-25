import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RegisterForm } from "../components";
import { useRegister } from "@/api/queries/auth";
import { useApiError } from "@/hooks";
import { useConfig } from "@/api/queries/config";

export function RegisterPage() {
  const [emailSent, setEmailSent] = useState(false);
  const register = useRegister();
  const { handleError } = useApiError();
  const { data: config, isLoading: configLoading } = useConfig();

  const registrationOpen =
    config?.data?.registration?.accountCreationMode === "open";

  const handleSubmit = async (
    data: Parameters<typeof register.mutateAsync>[0],
  ) => {
    try {
      await register.mutateAsync(data);
      setEmailSent(true);
    } catch (error) {
      handleError(error);
    }
  };

  if (configLoading) {
    return null;
  }

  if (!registrationOpen) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Registration unavailable</CardTitle>
          <CardDescription>
            Registration is currently by invitation only. Please contact an
            administrator for access.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (emailSent) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We've sent you a verification link. Click the link in the email to
            complete your registration.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Create an account</CardTitle>
        <CardDescription>Enter your email to get started</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm onSubmit={handleSubmit} isLoading={register.isPending} />
        <div className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
