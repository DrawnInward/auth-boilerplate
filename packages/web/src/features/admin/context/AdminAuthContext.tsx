import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type {
  PublicAdmin,
  LoginAdminDto,
  MfaVerifyDto,
  MfaBackupVerifyDto,
} from "@auth-boilerplate/shared";
import {
  useAdminMe,
  useAdminLogin,
  useAdminLogout,
  useAdminMfaLoginVerify,
  useAdminMfaLoginBackup,
  isAdminMfaRequired,
} from "@/api/queries/admin";
import { readSessionFlag, writeSessionFlag } from "@/lib/sessionFlag";

interface AdminAuthContextValue {
  admin: PublicAdmin | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mfaRequired: boolean;
  login: (data: LoginAdminDto) => Promise<void>;
  logout: () => Promise<void>;
  verifyMfa: (data: MfaVerifyDto) => Promise<void>;
  verifyMfaBackup: (data: MfaBackupVerifyDto) => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

// Mirrors the user AuthContext: the challenge cookie is httpOnly, so this
// sessionStorage flag is what lets /admin/mfa-verify survive a page refresh.
const ADMIN_MFA_PENDING_KEY = "admin_mfa_pending";

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mfaRequired, setMfaRequiredState] = useState(() =>
    readSessionFlag(ADMIN_MFA_PENDING_KEY),
  );

  const setMfaRequired = useCallback((value: boolean) => {
    writeSessionFlag(ADMIN_MFA_PENDING_KEY, value);
    setMfaRequiredState(value);
  }, []);

  const { data, isLoading } = useAdminMe();
  const loginMutation = useAdminLogin();
  const logoutMutation = useAdminLogout();
  const mfaVerifyMutation = useAdminMfaLoginVerify();
  const mfaBackupMutation = useAdminMfaLoginBackup();

  const admin = data?.data ?? null;
  const isAuthenticated = !!admin;

  const login = useCallback(
    async (credentials: LoginAdminDto) => {
      const response = await loginMutation.mutateAsync(credentials);
      if (isAdminMfaRequired(response)) {
        setMfaRequired(true);
        navigate("/admin/mfa-verify");
      } else {
        setMfaRequired(false);
        const from =
          (location.state as { from?: Location })?.from?.pathname || "/admin";
        navigate(from);
      }
    },
    [loginMutation, navigate, location.state, setMfaRequired],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    setMfaRequired(false);
    navigate("/admin/login");
  }, [logoutMutation, navigate, setMfaRequired]);

  const verifyMfa = useCallback(
    async (data: MfaVerifyDto) => {
      await mfaVerifyMutation.mutateAsync(data);
      setMfaRequired(false);
      const from =
        (location.state as { from?: Location })?.from?.pathname || "/admin";
      navigate(from);
    },
    [mfaVerifyMutation, navigate, location.state, setMfaRequired],
  );

  const verifyMfaBackup = useCallback(
    async (data: MfaBackupVerifyDto) => {
      await mfaBackupMutation.mutateAsync(data);
      setMfaRequired(false);
      const from =
        (location.state as { from?: Location })?.from?.pathname || "/admin";
      navigate(from);
    },
    [mfaBackupMutation, navigate, location.state, setMfaRequired],
  );

  const value = useMemo(
    () => ({
      admin,
      isLoading,
      isAuthenticated,
      mfaRequired,
      login,
      logout,
      verifyMfa,
      verifyMfaBackup,
    }),
    [
      admin,
      isLoading,
      isAuthenticated,
      mfaRequired,
      login,
      logout,
      verifyMfa,
      verifyMfaBackup,
    ],
  );

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error("useAdminAuth must be used within AdminAuthProvider");
  }
  return context;
}
