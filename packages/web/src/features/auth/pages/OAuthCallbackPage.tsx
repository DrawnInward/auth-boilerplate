import { useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { googleLinkSchema, type GoogleLinkDto } from "@auth-boilerplate/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { LoadingSpinner } from "@/components/shared";
import { useAuth, useApiError } from "@/hooks";
import { useGoogleCallback, useLinkGoogle } from "@/api/queries/oauth";

// Where Google sends the browser back to (GOOGLE_CALLBACK_URL points here).
// The one-shot code exchange happens against the API, which sets the session
// cookies; this page then routes by outcome: session → dashboard, MFA →
// challenge page, an unlinked local account → password prompt to link.
export function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { startMfaChallenge } = useAuth();
  const { handleError } = useApiError();

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");

  const callback = useGoogleCallback(code, state);
  const linkGoogle = useLinkGoogle();

  const form = useForm<GoogleLinkDto>({
    resolver: zodResolver(googleLinkSchema),
    defaultValues: { password: "" },
  });

  const outcome = callback.data?.data;

  const finishLogin = async () => {
    await queryClient.refetchQueries({ queryKey: ["me"] });
    navigate("/dashboard", { replace: true });
  };

  useEffect(() => {
    if (!outcome) return;
    if ("mfa_required" in outcome) {
      startMfaChallenge();
      navigate("/mfa-verify", { replace: true });
    } else if ("user_id" in outcome) {
      void finishLogin();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);

  if (providerError || !code) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Sign-in failed</CardTitle>
          <CardDescription>
            Google sign-in was cancelled or did not complete.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (callback.isError) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Sign-in failed</CardTitle>
          <CardDescription>
            {(callback.error as { message?: string })?.message ||
              "Could not complete Google sign-in."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link to="/login" className="text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (outcome && "needs_linking" in outcome) {
    const handleLink = async (data: GoogleLinkDto) => {
      try {
        const response = await linkGoogle.mutateAsync(data);
        if ("mfa_required" in response.data) {
          startMfaChallenge();
          navigate("/mfa-verify", { replace: true });
        } else {
          await finishLogin();
        }
      } catch (error) {
        handleError(error);
      }
    };

    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Link your Google account</CardTitle>
          <CardDescription>
            An account already exists for {outcome.email}. Enter its password to
            link Google sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleLink)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="********"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={linkGoogle.isPending}
              >
                {linkGoogle.isPending ? "Linking..." : "Link and sign in"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Completing sign-in</CardTitle>
        <CardDescription>Talking to Google…</CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <LoadingSpinner />
      </CardContent>
    </Card>
  );
}
