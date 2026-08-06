import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth, useApiError } from "@/hooks";
import { useConfig } from "@/api/queries/config";
import { useGoogleAuth, useUnlinkGoogle } from "@/api/queries/oauth";

export function OAuthTab() {
  const { user } = useAuth();
  const { data: config } = useConfig();
  const { handleError } = useApiError();
  // "Link" starts the same Google flow as login: the callback recognises the
  // existing local account, asks for its password, and links.
  const googleAuth = useGoogleAuth();
  const unlinkGoogle = useUnlinkGoogle();

  const handleUnlink = async () => {
    try {
      await unlinkGoogle.mutateAsync();
      toast.success("Google account unlinked");
    } catch (error) {
      handleError(error);
    }
  };

  const googleEnabled = config?.data?.oauth?.google ?? false;
  const hasGoogle =
    user?.auth_provider === "google" || user?.auth_provider === "both";
  const hasLocal =
    user?.auth_provider === "local" || user?.auth_provider === "both";

  if (!googleEnabled && !hasGoogle) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
          <CardDescription>
            No external authentication providers are configured
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connected Accounts</CardTitle>
        <CardDescription>
          Manage your linked authentication providers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="flex items-center gap-4">
            <svg className="h-6 w-6" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <div>
              <p className="font-medium">Google</p>
              <p className="text-sm text-muted-foreground">
                {hasGoogle ? "Connected" : "Not connected"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasGoogle && <Badge>Connected</Badge>}
            {hasGoogle && hasLocal ? (
              <Button
                variant="outline"
                disabled={unlinkGoogle.isPending}
                onClick={handleUnlink}
              >
                Unlink
              </Button>
            ) : !hasGoogle && googleEnabled ? (
              <Button
                variant="outline"
                disabled={googleAuth.isPending}
                onClick={() =>
                  googleAuth.mutate(undefined, { onError: handleError })
                }
              >
                Link
              </Button>
            ) : !hasLocal ? (
              <p className="text-xs text-muted-foreground">
                Set a password first to unlink
              </p>
            ) : null}
          </div>
        </div>

        {!hasLocal && (
          <p className="text-sm text-muted-foreground">
            You signed up with Google. To unlink your Google account, first set
            a password in the Password tab.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
