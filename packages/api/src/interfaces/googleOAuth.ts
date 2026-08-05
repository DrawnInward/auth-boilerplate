export interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token?: string;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

// The Google OAuth adapter: everything the app asks of Google, behind one
// interface so the composition root decides the implementation and tests
// inject a deterministic fake — no app code touches the wire protocol.
export interface GoogleOAuthProvider {
  isConfigured(): boolean;
  generateState(): string;
  getAuthUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse>;
  getUserInfo(accessToken: string): Promise<GoogleUserInfo>;
}
