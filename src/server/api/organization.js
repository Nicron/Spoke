import { mapFieldsToModel } from "./lib/utils";
import { getConfig } from "./lib/config";
import { r, Organization } from "../models";
import { accessRequired } from "./errors";
import { getCampaigns } from "./campaign";
import { buildSortedUserOrganizationQuery } from "./user";
import {
  getAvailableActionHandlers,
  getActionChoiceData
} from "../../integrations/action-handlers";

export const resolvers = {
  Organization: {
    ...mapFieldsToModel(["id", "name"], Organization),
    campaigns: async (
      organization,
      { cursor, campaignsFilter, sortBy },
      { user }
    ) => {
      await accessRequired(user, organization.id, "SUPERVOLUNTEER");
      return getCampaigns(organization.id, cursor, campaignsFilter, sortBy);
    },
    uuid: async (organization, _, { user }) => {
      await accessRequired(user, organization.id, "SUPERVOLUNTEER");
      const result = await r
        .knex("organization")
        .column("uuid")
        .where("id", organization.id);
      return result[0].uuid;
    },
    optOuts: async (organization, _, { user }) => {
      await accessRequired(user, organization.id, "ADMIN");
      return r
        .table("opt_out")
        .getAll(organization.id, { index: "organization_id" });
    },
    people: async (organization, { role, campaignId, sortBy }, { user }) => {
      await accessRequired(user, organization.id, "SUPERVOLUNTEER");
      return buildSortedUserOrganizationQuery(
        organization.id,
        role,
        campaignId,
        sortBy
      );
    },
    availableActions: async (organization, _, { user, loaders }) => {
      await accessRequired(user, organization.id, "SUPERVOLUNTEER");
      const availableHandlers = await getAvailableActionHandlers(
        organization,
        user
      );

      const promises = availableHandlers.map(handler => {
        return getActionChoiceData(handler, organization, user, loaders).then(
          clientChoiceData => {
            return {
              name: handler.name,
              displayName: handler.displayName(),
              instructions: handler.instructions(),
              clientChoiceData
            };
          }
        );
      });

      return Promise.all(promises);
    },
    threeClickEnabled: organization =>
      organization.features.indexOf("threeClick") !== -1,
    textingHoursEnforced: organization => organization.texting_hours_enforced,
    optOutMessage: organization =>
      (organization.features &&
      organization.features.indexOf("opt_out_message") !== -1
        ? JSON.parse(organization.features).opt_out_message
        : process.env.OPT_OUT_MESSAGE) ||
      "I'm opting you out of texts immediately. Have a great day.",
    textingHoursStart: organization => organization.texting_hours_start,
    textingHoursEnd: organization => organization.texting_hours_end,
    cacheable: org =>
      // quanery logic.  levels are 0, 1, 2
      (r.redis && (getConfig("REDIS_CONTACT_CACHE", org) ? 2 : 1)) || 0
  }
};
