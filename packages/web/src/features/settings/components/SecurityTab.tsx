import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  mfaVerifySetupSchema,
  mfaDisableSchema,
  type MfaVerifySetupDto,
  type MfaDisableDto,
} from "@auth-boilerplate/shared";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAuth } from "@/hooks";
import {
  useMfaSetup,
  useMfaVerifySetup,
  useMfaDisable,
  useMfaRegenerateBackupCodes,
} from "@/api/queries/mfa";
import { useApiError } from "@/hooks";

export function SecurityTab() {
  const { user } = useAuth();
  const { handleError } = useApiError();

  const [setupDialogOpen, setSetupDialogOpen] = useState(false);
  const [disableDialogOpen, setDisableDialogOpen] = useState(false);
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [backupCodesDialogOpen, setBackupCodesDialogOpen] = useState(false);

  const [qrCode, setQrCode] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  const mfaSetup = useMfaSetup();
  const mfaVerifySetup = useMfaVerifySetup();
  const mfaDisable = useMfaDisable();
  const mfaRegenerate = useMfaRegenerateBackupCodes();

  const setupForm = useForm<MfaVerifySetupDto>({
    resolver: zodResolver(mfaVerifySetupSchema),
    defaultValues: { code: "" },
  });

  const disableForm = useForm<MfaDisableDto>({
    resolver: zodResolver(mfaDisableSchema),
    defaultValues: { code: "", password: "" },
  });

  const regenerateForm = useForm<MfaVerifySetupDto>({
    resolver: zodResolver(mfaVerifySetupSchema),
    defaultValues: { code: "" },
  });

  const handleStartSetup = async () => {
    try {
      const response = await mfaSetup.mutateAsync();
      setQrCode(response.data.qr_code);
      setSetupDialogOpen(true);
    } catch (error) {
      handleError(error);
    }
  };

  const handleVerifySetup = async (data: MfaVerifySetupDto) => {
    try {
      const response = await mfaVerifySetup.mutateAsync(data);
      setBackupCodes(response.data.backup_codes);
      setSetupDialogOpen(false);
      setBackupCodesDialogOpen(true);
      setupForm.reset();
      toast.success("MFA enabled successfully");
    } catch (error) {
      handleError(error);
    }
  };

  const handleDisable = async (data: MfaDisableDto) => {
    try {
      await mfaDisable.mutateAsync(data);
      setDisableDialogOpen(false);
      disableForm.reset();
      toast.success("MFA disabled successfully");
    } catch (error) {
      handleError(error);
    }
  };

  const handleRegenerate = async (data: MfaVerifySetupDto) => {
    try {
      const response = await mfaRegenerate.mutateAsync(data);
      setBackupCodes(response.data.backup_codes);
      setRegenerateDialogOpen(false);
      setBackupCodesDialogOpen(true);
      regenerateForm.reset();
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
          <CardDescription>
            Add an extra layer of security to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Status</p>
              <p className="text-sm text-muted-foreground">
                {user?.mfa_enabled
                  ? "Your account is protected with 2FA"
                  : "2FA is not enabled"}
              </p>
            </div>
            <Badge variant={user?.mfa_enabled ? "default" : "secondary"}>
              {user?.mfa_enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            {user?.mfa_enabled ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setRegenerateDialogOpen(true)}
                >
                  Regenerate backup codes
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setDisableDialogOpen(true)}
                >
                  Disable MFA
                </Button>
              </>
            ) : (
              <Button onClick={handleStartSetup} disabled={mfaSetup.isPending}>
                {mfaSetup.isPending ? "Loading..." : "Enable MFA"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={setupDialogOpen} onOpenChange={setSetupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
            <DialogDescription>
              Scan the QR code with your authenticator app
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {qrCode && (
              <div className="flex justify-center">
                <img src={qrCode} alt="MFA QR Code" className="h-48 w-48" />
              </div>
            )}
            <Form {...setupForm}>
              <form
                onSubmit={setupForm.handleSubmit(handleVerifySetup)}
                className="space-y-4"
              >
                <FormField
                  control={setupForm.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Verification code</FormLabel>
                      <FormControl>
                        <Input placeholder="000000" maxLength={6} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={mfaVerifySetup.isPending}
                >
                  {mfaVerifySetup.isPending
                    ? "Verifying..."
                    : "Verify and enable"}
                </Button>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={disableDialogOpen} onOpenChange={setDisableDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>
              Enter your password and a current TOTP or backup code to disable
              MFA
            </DialogDescription>
          </DialogHeader>
          <Form {...disableForm}>
            <form
              onSubmit={disableForm.handleSubmit(handleDisable)}
              className="space-y-4"
            >
              <FormField
                control={disableForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Your account password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={disableForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification code</FormLabel>
                    <FormControl>
                      <Input placeholder="000000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                variant="destructive"
                className="w-full"
                disabled={mfaDisable.isPending}
              >
                {mfaDisable.isPending ? "Disabling..." : "Disable MFA"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={regenerateDialogOpen}
        onOpenChange={setRegenerateDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate backup codes</DialogTitle>
            <DialogDescription>
              This will invalidate your existing backup codes
            </DialogDescription>
          </DialogHeader>
          <Form {...regenerateForm}>
            <form
              onSubmit={regenerateForm.handleSubmit(handleRegenerate)}
              className="space-y-4"
            >
              <FormField
                control={regenerateForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification code</FormLabel>
                    <FormControl>
                      <Input placeholder="000000" maxLength={6} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={mfaRegenerate.isPending}
              >
                {mfaRegenerate.isPending
                  ? "Generating..."
                  : "Generate new codes"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={backupCodesDialogOpen}
        onOpenChange={setBackupCodesDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Backup codes</DialogTitle>
            <DialogDescription>
              Save these codes in a secure place. Each code can only be used
              once.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-4 font-mono text-sm">
            {backupCodes.map((code, i) => (
              <div key={i}>{code}</div>
            ))}
          </div>
          <Button onClick={() => setBackupCodesDialogOpen(false)}>
            I've saved these codes
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
