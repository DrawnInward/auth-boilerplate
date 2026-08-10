import { Link, Navigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MfaVerifyForm } from "@/components/shared";
import { useAuth } from "@/hooks";
import { useApiError } from "@/hooks";

export function MfaVerifyPage() {
  const { mfaRequired, verifyMfa, verifyMfaBackup } = useAuth();
  const { handleError } = useApiError();

  if (!mfaRequired) {
    return <Navigate to="/login" replace />;
  }

  const handleSubmitCode = async (data: Parameters<typeof verifyMfa>[0]) => {
    try {
      await verifyMfa(data);
    } catch (error) {
      handleError(error);
    }
  };

  const handleSubmitBackup = async (
    data: Parameters<typeof verifyMfaBackup>[0],
  ) => {
    try {
      await verifyMfaBackup(data);
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>
          Enter the 6-digit code from your authenticator app
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MfaVerifyForm
          onSubmitCode={handleSubmitCode}
          onSubmitBackup={handleSubmitBackup}
        />
        {/* The way out of a dead challenge (expired, or attempts spent):
            a fresh login mints a fresh one. */}
        <div className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
