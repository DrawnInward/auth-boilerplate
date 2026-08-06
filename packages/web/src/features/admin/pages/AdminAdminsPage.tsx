import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  inviteAdminSchema,
  type InviteAdminDto,
  type PublicAdmin,
} from "@auth-boilerplate/shared";
import {
  useAdminAdmins,
  useAdminInviteAdmin,
  useAdminDisableAdmin,
} from "@/api/queries/admin";
import { useAdminAuth } from "../context/AdminAuthContext";
import { LoadingSpinner } from "@/components/shared";
import { useApiError } from "@/hooks";

export function AdminAdminsPage() {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [adminToDisable, setAdminToDisable] = useState<PublicAdmin | null>(
    null,
  );
  const { admin: me } = useAdminAuth();
  const { data, isLoading } = useAdminAdmins();
  const inviteAdmin = useAdminInviteAdmin();
  const disableAdmin = useAdminDisableAdmin();
  const { handleError } = useApiError();

  // Invite and disable are root-only server-side; the buttons follow.
  const isRoot = me?.root ?? false;

  const form = useForm<InviteAdminDto>({
    resolver: zodResolver(inviteAdminSchema),
    defaultValues: { email: "" },
  });

  const admins = data?.data ?? [];

  const handleInvite = async (formData: InviteAdminDto) => {
    try {
      await inviteAdmin.mutateAsync(formData);
      toast.success("Invitation sent successfully");
      form.reset();
      setInviteModalOpen(false);
    } catch (error) {
      handleError(error);
    }
  };

  const handleDisable = async () => {
    if (!adminToDisable) return;
    try {
      await disableAdmin.mutateAsync(adminToDisable.admin_id);
      toast.success("Admin deactivated");
    } catch (error) {
      handleError(error);
    } finally {
      setAdminToDisable(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Admins</h1>
          <p className="text-muted-foreground">Manage platform admins</p>
        </div>
        {isRoot && (
          <Button onClick={() => setInviteModalOpen(true)}>Invite Admin</Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Admins</CardTitle>
          <CardDescription>
            Platform administrators and their status
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : admins.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No admins found
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>MFA</TableHead>
                  {isRoot && (
                    <TableHead className="w-[100px]">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((admin) => (
                  <TableRow key={admin.admin_id}>
                    <TableCell className="font-medium">{admin.email}</TableCell>
                    <TableCell>
                      <Badge variant={admin.root ? "default" : "outline"}>
                        {admin.root ? "Root" : "Admin"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={admin.is_active ? "default" : "secondary"}
                      >
                        {admin.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={admin.mfa_enabled ? "default" : "outline"}
                      >
                        {admin.mfa_enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    {isRoot && (
                      <TableCell>
                        {admin.is_active && !admin.root && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAdminToDisable(admin)}
                          >
                            Disable
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Admin</DialogTitle>
            <DialogDescription>
              Send an invitation email to create a new platform admin account
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleInvite)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="admin@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <p className="text-sm text-muted-foreground">
                The invitee will receive an email with a link to set their
                password.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInviteModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={inviteAdmin.isPending}>
                  {inviteAdmin.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!adminToDisable}
        onOpenChange={(open) => !open && setAdminToDisable(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate admin?</AlertDialogTitle>
            <AlertDialogDescription>
              {adminToDisable?.email} will be signed out everywhere and can no
              longer sign in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisable}
              disabled={disableAdmin.isPending}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
