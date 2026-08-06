import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { updateUserSchema } from "@auth-boilerplate/shared";
import {
  useAdminUser,
  useAdminUpdateUser,
  useAdminDeleteUser,
  useAdminResetUserPassword,
  useAdminDisableUserMfa,
} from "@/api/queries/admin";
import { FullPageSpinner, FullPageError } from "@/components/shared";
import { useApiError } from "@/hooks";

// The shared admin update contract, narrowed to this form's fields — both
// required here because the form always submits them.
const updateUserFormSchema = updateUserSchema
  .pick({ email: true, is_active: true })
  .required();

type UpdateUserData = z.infer<typeof updateUserFormSchema>;

export function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { handleError } = useApiError();

  const { data, isLoading, isError } = useAdminUser(id);
  const updateUser = useAdminUpdateUser(id!);
  const deleteUser = useAdminDeleteUser();
  const resetPassword = useAdminResetUserPassword(id!);
  const disableMfa = useAdminDisableUserMfa(id!);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [disableMfaDialogOpen, setDisableMfaDialogOpen] = useState(false);

  const user = data?.data;

  const form = useForm<UpdateUserData>({
    resolver: zodResolver(updateUserFormSchema),
    values: {
      email: user?.email ?? "",
      is_active: user?.is_active ?? true,
    },
  });

  if (isLoading) return <FullPageSpinner />;
  if (isError || !user) return <FullPageError message="User not found" />;

  const handleUpdate = async (formData: UpdateUserData) => {
    try {
      await updateUser.mutateAsync(formData);
      toast.success("User updated successfully");
    } catch (error) {
      handleError(error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteUser.mutateAsync(id!);
      toast.success("User deleted successfully");
      navigate("/admin/users");
    } catch (error) {
      handleError(error);
    }
  };

  const handleResetPassword = async () => {
    try {
      await resetPassword.mutateAsync();
      toast.success("Password reset email sent");
      setResetPasswordDialogOpen(false);
    } catch (error) {
      handleError(error);
    }
  };

  const handleDisableMfa = async () => {
    try {
      await disableMfa.mutateAsync();
      toast.success("MFA disabled for user");
      setDisableMfaDialogOpen(false);
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Details</h1>
        <p className="text-muted-foreground">{user.email}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={user.is_active ? "default" : "secondary"}>
                {user.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email Verified</span>
              <Badge variant={user.email_verified ? "default" : "outline"}>
                {user.email_verified ? "Verified" : "Unverified"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">MFA</span>
              <Badge variant={user.mfa_enabled ? "default" : "outline"}>
                {user.mfa_enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Auth Provider</span>
              <Badge variant="outline">{user.auth_provider}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setResetPasswordDialogOpen(true)}
            >
              Send Password Reset
            </Button>
            {user.mfa_enabled && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setDisableMfaDialogOpen(true)}
              >
                Disable MFA
              </Button>
            )}
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete User
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit User</CardTitle>
          <CardDescription>Update user information</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleUpdate)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Active</FormLabel>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={resetPasswordDialogOpen}
        onOpenChange={setResetPasswordDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Password Reset Email</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a password reset email to {user.email}. The user
              will be able to set a new password using the link in the email.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetPassword}
              disabled={resetPassword.isPending}
            >
              {resetPassword.isPending ? "Sending..." : "Send Reset Email"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={disableMfaDialogOpen}
        onOpenChange={setDisableMfaDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable MFA</AlertDialogTitle>
            <AlertDialogDescription>
              This will disable MFA for {user.email} and delete all their backup
              codes. The user will need to set up MFA again if they want to use
              it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisableMfa}
              disabled={disableMfa.isPending}
            >
              {disableMfa.isPending ? "Disabling..." : "Disable MFA"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
