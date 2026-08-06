// App-wide auth state. This lives outside features/ because four features
// consume it (dashboard, organizations, settings, and auth itself) — a feature
// may not import another feature's internals, so the shared piece is promoted
// rather than reached into.
//
// The hook that reads this context is src/hooks/useAuth.ts; components should
// use that, not useContext directly.
import {
  createContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type {
  PublicUser,
  LoginUserDto,
  MfaVerifyDto,
  MfaBackupVerifyDto,
} from "@auth-boilerplate/shared";
import {
  useMe,
  useLogin,
  useLogout,
  useMfaLoginVerify,
  useMfaLoginBackup,
  isMfaRequired,
} from "@/api/queries/auth";

export interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  mfaRequired: boolean;
  /**
   * Marks a challenge as pending so MfaVerifyPage will render — for flows
   * (OAuth callback) that learn mfa_required outside login().
   */
  startMfaChallenge: () => void;
  login: (data: LoginUserDto) => Promise<void>;
  logout: () => Promise<void>;
  verifyMfa: (data: MfaVerifyDto) => Promise<void>;
  verifyMfaBackup: (data: MfaBackupVerifyDto) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
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
        await queryClient.refetchQueries({ queryKey: ["me"] });
        const from =
          (location.state as { from?: Location })?.from?.pathname ||
          "/dashboard";
        navigate(from);
      }
    },
    [loginMutation, navigate, location.state, queryClient],
  );

  const startMfaChallenge = useCallback(() => setMfaRequired(true), []);

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    setMfaRequired(false);
    navigate("/login");
  }, [logoutMutation, navigate]);

  const verifyMfa = useCallback(
    async (data: MfaVerifyDto) => {
      await mfaVerifyMutation.mutateAsync(data);
      setMfaRequired(false);
      await queryClient.refetchQueries({ queryKey: ["me"] });
      const from =
        (location.state as { from?: Location })?.from?.pathname || "/dashboard";
      navigate(from);
    },
    [mfaVerifyMutation, location.state, queryClient, navigate],
  );

  const verifyMfaBackup = useCallback(
    async (data: MfaBackupVerifyDto) => {
      await mfaBackupMutation.mutateAsync(data);
      setMfaRequired(false);
      await queryClient.refetchQueries({ queryKey: ["me"] });
      const from =
        (location.state as { from?: Location })?.from?.pathname || "/dashboard";
      navigate(from);
    },
    [mfaBackupMutation, location.state, queryClient, navigate],
  );

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated,
      mfaRequired,
      startMfaChallenge,
      login,
      logout,
      verifyMfa,
      verifyMfaBackup,
    }),
    [
      user,
      isLoading,
      isAuthenticated,
      mfaRequired,
      startMfaChallenge,
      login,
      logout,
      verifyMfa,
      verifyMfaBackup,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
