import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateOrganizationDtoSchema, type UpdateOrganizationDto } from "@auth-boilerplate/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  useOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  useLeaveOrganization,
} from "@/api/queries/organizations";
import {
  MembersList,
  InviteMemberModal,
  TransferOwnershipModal,
  InvitationsList,
} from "../components";
import { FullPageSpinner, FullPageError } from "@/components/shared";
import { useApiError } from "@/hooks";

export function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { handleError } = useApiError();

  const { data, isLoading, isError } = useOrganization(id);
  const updateOrg = useUpdateOrganization(id!);
  const deleteOrg = useDeleteOrganization();
  const leaveOrg = useLeaveOrganization();

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  const organization = data?.data;
  const isOwner = organization?.role === "owner";
  const canManage = isOwner || organization?.role === "admin";

  const form = useForm<UpdateOrganizationDto>({
    resolver: zodResolver(updateOrganizationDtoSchema),
    values: {
      name: organization?.name ?? "",
      slug: organization?.slug ?? "",
    },
  });

  if (isLoading) return <FullPageSpinner />;
  if (isError || !organization) {
    return <FullPageError message="Organization not found" />;
  }

  const handleUpdate = async (formData: UpdateOrganizationDto) => {
    try {
      await updateOrg.mutateAsync(formData);
      toast.success("Organization updated successfully");
    } catch (error) {
      handleError(error);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteOrg.mutateAsync(id!);
      toast.success("Organization deleted successfully");
      navigate("/organizations");
    } catch (error) {
      handleError(error);
    }
  };

  const handleLeave = async () => {
    try {
      await leaveOrg.mutateAsync(id!);
      toast.success("You have left the organization");
      navigate("/organizations");
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold">{organization.name}</h1>
            <Badge variant="outline">{organization.role}</Badge>
          </div>
          <p className="text-muted-foreground">/{organization.slug}</p>
        </div>
        {!isOwner && (
          <Button variant="outline" onClick={() => setLeaveDialogOpen(true)}>
            Leave Organization
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          {canManage && <TabsTrigger value="invitations">Invitations</TabsTrigger>}
          {isOwner && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <span className="text-sm text-muted-foreground">Name:</span>
                <p className="font-medium">{organization.name}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Slug:</span>
                <p className="font-medium">/{organization.slug}</p>
              </div>
              <div>
                <span className="text-sm text-muted-foreground">Your Role:</span>
                <p className="font-medium capitalize">{organization.role}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Members</CardTitle>
                <CardDescription>Manage organization members</CardDescription>
              </div>
              {canManage && (
                <Button onClick={() => setInviteModalOpen(true)}>Invite Member</Button>
              )}
            </CardHeader>
            <CardContent>
              <MembersList orgId={id!} userRole={organization.role} />
            </CardContent>
          </Card>
        </TabsContent>

        {canManage && (
          <TabsContent value="invitations">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Pending Invitations</CardTitle>
                  <CardDescription>Manage pending invitations</CardDescription>
                </div>
                <Button onClick={() => setInviteModalOpen(true)}>Send Invitation</Button>
              </CardHeader>
              <CardContent>
                <InvitationsList orgId={id!} />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isOwner && (
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Organization Settings</CardTitle>
                <CardDescription>Update organization details</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleUpdate)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="slug"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Slug</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" disabled={updateOrg.isPending}>
                      {updateOrg.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

            <Card className="border-destructive">
              <CardHeader>
                <CardTitle>Danger Zone</CardTitle>
                <CardDescription>Irreversible actions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Transfer Ownership</p>
                    <p className="text-sm text-muted-foreground">
                      Transfer this organization to another member
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => setTransferModalOpen(true)}>
                    Transfer
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Delete Organization</p>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete this organization and all its data
                    </p>
                  </div>
                  <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <InviteMemberModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        orgId={id!}
      />

      <TransferOwnershipModal
        open={transferModalOpen}
        onOpenChange={setTransferModalOpen}
        orgId={id!}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{organization.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave "{organization.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave}>Leave</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
