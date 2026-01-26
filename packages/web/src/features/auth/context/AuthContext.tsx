import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { PublicUser, LoginUserDto, MfaVerifyDto, MfaBackupVerifyDto } from "@auth-boilerplate/shared";
import { useMe, useLogin, useLogout, useMfaLoginVerify, useMfaLoginBackup, isMfaRequired } from "@/api/queries/auth";

interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mfaRequired: boolean;
  login: (data: LoginUserDto) => Promise<void>;
  logout: () => Promise<void>;
  verifyMfa: (data: MfaVerifyDto) => Promise<void>;
  verifyMfaBackup: (data: MfaBackupVerifyDto) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [mfaRequired, setMfaRequired] = useState(false);

  const { data, isLoading } = useMe();
  const loginMutation = useLogin();
  const logoutMutation = useLogout();
  const mfaVerifyMutation = useMfaLoginVerify();
  const mfaBackupMutation = useMfaLoginBackup();

  const user = data?.data ?? null;
  const isAuthenticated = !!user;

  const login = useCallback(
    async (credentials: LoginUserDto) => {
      const response = await loginMutation.mutateAsync(credentials);
      if (isMfaRequired(response)) {
        setMfaRequired(true);
        navigate("/mfa-verify");
      } else {
        setMfaRequired(false);
        const from = (location.state as { from?: Location })?.from?.pathname || "/dashboard";
        navigate(from);
      }
    },
    [loginMutation, navigate, location.state]
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    setMfaRequired(false);
    navigate("/login");
  }, [logoutMutation, navigate]);

  const verifyMfa = useCallback(
    async (data: MfaVerifyDto) => {
      await mfaVerifyMutation.mutateAsync(data);
      setMfaRequired(false);
      const from = (location.state as { from?: Location })?.from?.pathname || "/dashboard";
      navigate(from);
    },
    [mfaVerifyMutation, navigate, location.state]
  );

  const verifyMfaBackup = useCallback(
    async (data: MfaBackupVerifyDto) => {
      await mfaBackupMutation.mutateAsync(data);
      setMfaRequired(false);
      const from = (location.state as { from?: Location })?.from?.pathname || "/dashboard";
      navigate(from);
    },
    [mfaBackupMutation, navigate, location.state]
  );

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated,
      mfaRequired,
      login,
      logout,
      verifyMfa,
      verifyMfaBackup,
    }),
    [user, isLoading, isAuthenticated, mfaRequired, login, logout, verifyMfa, verifyMfaBackup]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
