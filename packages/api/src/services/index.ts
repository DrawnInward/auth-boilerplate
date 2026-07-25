// The composition root: the single place where services are handed their real
// dependencies. Everything below this file takes its collaborators as
// arguments, so swapping an adapter (a different email provider, a fake in a
// test) is a change here and nowhere else.
//
// loadEnv comes first: the config read below must see the .env file, whatever
// order the rest of the application happens to import things in.
import "../utils/loadEnv";

import { getAppName, getFrontendUrl } from "../utils/config";
import { getEmailProvider } from "../utils/email";
import { EmailProvider } from "../interfaces/email";
import { createEmailService, EmailService } from "./email.service";

export type Services = {
  email: EmailService;
};

// The provider is resolved per send, as the old sendEmail helper did, so
// EMAIL_PROVIDER stays a runtime knob rather than becoming import-order
// sensitive.
const emailProvider: EmailProvider = {
  send: (options) => getEmailProvider().send(options),
};

export const services: Services = {
  email: createEmailService({
    provider: emailProvider,
    appName: getAppName(),
    frontendUrl: getFrontendUrl(),
  }),
};

export { createEmailService } from "./email.service";
export type { EmailService, EmailServiceDeps } from "./email.service";
