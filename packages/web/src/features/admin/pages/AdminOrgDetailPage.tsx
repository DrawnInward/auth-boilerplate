import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateOrganizationDtoSchema, type UpdateOrganizationDto } from "@auth-boilerplate/shared";
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
  useAdminOrganization,
  useAdminUpdateOrganization,
  useAdminDeleteOrganization,
} from "@/api/queries/admin";
import { FullPageSpinner, FullPageError } from "@/components/shared";
import { useApiError } from "@/hooks";

export function AdminOrgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { handleError } = useApiError();

  const { data, isLoading, isError } = useAdminOrganization(id);
  const updateOrg = useAdminUpdateOrganization(id!);
  const deleteOrg = useAdminDeleteOrganization();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const organization = data?.data;

  const form = useForm<UpdateOrganizationDto>({
    resolver: zodResolver(updateOrganizationDtoSchema),
    values: {
      name: organization?.name ?? "",
      slug: organization?.slug ?? "",
    },
  });

  if (isLoading) return <FullPageSpinner />;
  if (isError || !organization) return <FullPageError message="Organization not found" />;

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
      navigate("/admin/organizations");
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Organization Details</h1>
        <p className="text-muted-foreground">{organization.name}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organization Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{organization.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Slug</span>
              <span className="font-medium">/{organization.slug}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Members</span>
              <span className="font-medium">{organization.member_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">
                {organization.created_at
                  ? new Date(organization.created_at).toLocaleDateString()
                  : "-"}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete Organization
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Organization</CardTitle>
          <CardDescription>Update organization information</CardDescription>
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
    </div>
  );
}
