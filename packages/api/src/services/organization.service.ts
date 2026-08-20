// Creating an organisation and seating its owner are one fact: an org row
// with no owner membership is unreachable by anyone, so the pair commits
// together whichever caller (a user for themselves, an admin on a user's
// behalf) asks for it.

import type * as organizationModels from "../models/organization.models";
import type * as memberModels from "../models/organizationMembers.models";
import { Organization } from "@auth-boilerplate/shared";
import { RunTransaction } from "../utils/withTransaction";

export type OrganizationServiceDeps = {
  organizations: Pick<typeof organizationModels, "createOrganization">;
  members: Pick<typeof memberModels, "addOrganizationMember">;
  runTransaction: RunTransaction;
};

export type CreateOrganizationInput = {
  name: string;
  slug?: string;
  ownerId: string;
};

export type OrganizationService = {
  createOrganization(input: CreateOrganizationInput): Promise<Organization>;
};

export const createOrganizationService = ({
  organizations,
  members,
  runTransaction,
}: OrganizationServiceDeps): OrganizationService => ({
  createOrganization: ({ name, slug, ownerId }) =>
    runTransaction(async (client) => {
      const org = await organizations.createOrganization(
        { name, slug, owner_id: ownerId },
        client,
      );
      await members.addOrganizationMember(
        org.id,
        { user_id: ownerId, role: "owner" },
        null,
        client,
      );
      return org;
    }),
});
