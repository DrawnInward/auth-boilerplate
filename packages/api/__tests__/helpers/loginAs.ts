import request from "supertest";
import app from "../../src/app";

// Cookie auth for integration specs. Logging in by hand is four lines of
// boilerplate repeated in every suite, and a failed login there yields
// `undefined` cookies that surface much later as a confusing 401 — so this
// throws instead, naming the account.
export const loginAs = async (
  email: string,
  options: { password?: string; as?: "user" | "admin" } = {},
): Promise<string> => {
  const { password = "Password1", as = "user" } = options;
  const path = as === "admin" ? "/api/admin/auth/login" : "/api/auth/login";

  const response = await request(app).post(path).send({ email, password });

  const cookies = response.headers["set-cookie"];
  if (response.status !== 200 || !cookies) {
    throw new Error(
      `loginAs(${email}) failed: ${path} returned ${response.status} ` +
        `${JSON.stringify(response.body)}`,
    );
  }

  return cookies as unknown as string;
};

export const loginAsAdmin = (
  email: string,
  password?: string,
): Promise<string> => loginAs(email, { password, as: "admin" });
