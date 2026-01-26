import { useParams, Navigate, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/shared";
import { useVerifyToken } from "@/api/queries/auth";

export function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const { data, isLoading, isError } = useVerifyToken(token);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Invalid or expired link</CardTitle>
          <CardDescription>
            This verification link is invalid or has expired.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link to="/register">Try registering again</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Email verified</CardTitle>
        <CardDescription>
          Your email {data?.data?.email} has been verified. Set your password to complete registration.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button asChild>
          <Link to={`/complete-registration?token=${token}`}>Set password</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
