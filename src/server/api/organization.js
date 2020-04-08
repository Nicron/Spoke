import { mapFieldsToModel } from "./lib/utils";
import { r, Organization } from "../models";
import { accessRequired } from "./errors";
import { getCampaigns } from "./campaign";
import { buildSortedUserOrganizationQuery } from "./user";

export const resolvers = {
  Organization: {
    ...mapFieldsToModel(["id", "name"], Organization),
    campaigns: async (organization, { cursor, campaignsFilter }, { user }) => {
      await accessRequired(user, organization.id, "SUPERVOLUNTEER");
      return getCampaigns(organization.id, cursor, campaignsFilter);
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
    twilioApiKey: organization =>
      organization.features.indexOf("TWILIO_API_KEY") !== -1
        ? JSON.parse(organization.features).TWILIO_API_KEY
        : null,
    twilioAuthToken: organization =>
      organization.features.indexOf("TWILIO_AUTH_TOKEN") !== -1
        ? JSON.parse(organization.features).TWILIO_AUTH_TOKEN
        : null,
    twilioMessageServiceSid: organization =>
      organization.features.indexOf("TWILIO_MESSAGE_SERVICE_SID") !== -1
        ? JSON.parse(organization.features).TWILIO_MESSAGE_SERVICE_SID
        : null,
  }
};
