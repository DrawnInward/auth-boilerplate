import { useParams, useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  acceptInviteSchema,
  type AcceptInviteDto,
} from "@auth-boilerplate/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useInvitation, useAcceptInvitation } from "@/api/queries/invitations";
import { FullPageSpinner } from "@/components/shared";
import { useApiError } from "@/hooks";

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { handleError } = useApiError();

  const { data, isLoading, isError } = useInvitation(token);
  const acceptInvitation = useAcceptInvitation(token!);

  const invitation = data?.data;

  const form = useForm<AcceptInviteDto>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: { password: "" },
  });

  if (!token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Invalid invitation</CardTitle>
          <CardDescription>No invitation token provided.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link to="/login" className="text-primary hover:underline">
            Go to login
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <FullPageSpinner />;

  if (isError || !invitation) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Invalid or expired invitation</CardTitle>
          <CardDescription>
            This invitation link is invalid or has expired.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link to="/login" className="text-primary hover:underline">
            Go to login
          </Link>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (formData: AcceptInviteDto) => {
    try {
      await acceptInvitation.mutateAsync(formData);
      toast.success("Invitation accepted!");
      if (invitation.organization_id) {
        navigate(`/organizations/${invitation.organization_id}`);
      } else {
        navigate("/dashboard");
      }
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle>Accept Invitation</CardTitle>
        <CardDescription>
          You've been invited to join{" "}
          {invitation.organization_name || "an organization"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 rounded-md bg-muted p-4">
          {invitation.organization_name && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">
                Organization:
              </span>
              <span className="font-medium">
                {invitation.organization_name}
              </span>
            </div>
          )}
          {invitation.role && (
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Role:</span>
              <Badge variant="outline">{invitation.role}</Badge>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Email:</span>
            <span className="font-medium">{invitation.email}</span>
          </div>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            {!invitation.is_existing_user && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Create a password"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Create a password for your new account
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {invitation.is_existing_user && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Enter your password"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter your account password to confirm
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={acceptInvitation.isPending}
            >
              {acceptInvitation.isPending
                ? "Accepting..."
                : "Accept Invitation"}
            </Button>
          </form>
        </Form>

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
