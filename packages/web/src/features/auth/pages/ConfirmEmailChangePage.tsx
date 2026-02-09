import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useConfirmEmailChange } from "@/api/queries/auth";

export function ConfirmEmailChangePage() {
  const { token } = useParams<{ token: string }>();
  const { data, error, isLoading } = useConfirmEmailChange(token);

  if (isLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-muted-foreground">Confirming your email change...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    const errorMessage = (error as any)?.message || "Failed to confirm email change. The link may be invalid or expired.";
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Email Change Failed</CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link to="/settings">Go to Settings</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Email Changed Successfully</CardTitle>
        <CardDescription>
          Your email has been updated to <strong>{data.data?.email}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button asChild>
          <Link to="/dashboard">Go to Dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
