import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { requestEmailChangeSchema, type RequestEmailChangeDto } from "@auth-boilerplate/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useAuth } from "@/features/auth/context/AuthContext";
import { useRequestEmailChange } from "@/api/queries/auth";
import { useApiError } from "@/hooks";

export function ProfileTab() {
  const { user } = useAuth();
  const requestEmailChange = useRequestEmailChange();
  const { handleError } = useApiError();
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const form = useForm<RequestEmailChangeDto>({
    resolver: zodResolver(requestEmailChangeSchema),
    defaultValues: { newEmail: "", password: "" },
  });

  const handleSubmit = async (data: RequestEmailChangeDto) => {
    try {
      await requestEmailChange.mutateAsync(data);
      setPendingEmail(data.newEmail);
      form.reset();
      toast.success("Verification email sent! Check your new email inbox.");
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Manage your account email address</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">Current Email</label>
          <Input value={user?.email ?? ""} disabled className="bg-muted" />
        </div>

        {pendingEmail && (
          <div className="rounded-md bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            A verification email has been sent to <strong>{pendingEmail}</strong>.
            Please check your inbox and click the link to confirm the change.
          </div>
        )}

        <div className="border-t pt-6">
          <h3 className="text-sm font-medium mb-4">Change Email Address</h3>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="newEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Enter new email address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter your password" {...field} />
                    </FormControl>
                    <FormDescription>
                      Required to verify your identity
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={requestEmailChange.isPending}>
                {requestEmailChange.isPending ? "Sending..." : "Send Verification Email"}
              </Button>
            </form>
          </Form>
        </div>
      </CardContent>
    </Card>
  );
}
