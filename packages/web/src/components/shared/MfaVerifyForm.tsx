import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  mfaVerifySchema,
  mfaBackupVerifySchema,
  type MfaVerifyDto,
  type MfaBackupVerifyDto,
} from "@auth-boilerplate/shared";
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

interface MfaVerifyFormProps {
  onSubmitCode: (data: MfaVerifyDto) => Promise<void>;
  onSubmitBackup: (data: MfaBackupVerifyDto) => Promise<void>;
  isLoading?: boolean;
}

export function MfaVerifyForm({
  onSubmitCode,
  onSubmitBackup,
  isLoading,
}: MfaVerifyFormProps) {
  const [useBackup, setUseBackup] = useState(false);

  const codeForm = useForm<MfaVerifyDto>({
    resolver: zodResolver(mfaVerifySchema),
    defaultValues: { code: "" },
  });

  const backupForm = useForm<MfaBackupVerifyDto>({
    resolver: zodResolver(mfaBackupVerifySchema),
    defaultValues: { code: "" },
  });

  if (useBackup) {
    return (
      <Form {...backupForm} key="backup">
        <form
          onSubmit={backupForm.handleSubmit(onSubmitBackup)}
          className="space-y-4"
        >
          <FormField
            control={backupForm.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Backup Code</FormLabel>
                <FormControl>
                  <Input placeholder="Enter backup code" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Verifying..." : "Verify"}
          </Button>
          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => setUseBackup(false)}
          >
            Use authenticator code instead
          </Button>
        </form>
      </Form>
    );
  }

  return (
    <Form {...codeForm} key="code">
      <form
        onSubmit={codeForm.handleSubmit(onSubmitCode)}
        className="space-y-4"
      >
        <FormField
          control={codeForm.control}
          name="code"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Verification Code</FormLabel>
              <FormControl>
                <Input placeholder="000000" maxLength={6} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Verifying..." : "Verify"}
        </Button>
        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={() => setUseBackup(true)}
        >
          Use backup code instead
        </Button>
      </form>
    </Form>
  );
}
