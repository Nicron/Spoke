import _ from "lodash";
import { Assignment, r, cacheableData, loaders } from "../models";
import { addWhereClauseForContactsFilterMessageStatusIrrespectiveOfPastDue } from "./assignment";
import { buildCampaignQuery } from "./campaign";
import { log } from "../../lib";

function getConversationsJoinsAndWhereClause(
  queryParam,
  organizationId,
  campaignsFilter,
  assignmentsFilter,
  contactsFilter,
  forData
) {
  let query = queryParam.leftJoin(
    "campaign_contact",
    "campaign.id",
    "campaign_contact.campaign_id"
  );

  query = buildCampaignQuery(query, organizationId, campaignsFilter, true);

  if (assignmentsFilter && assignmentsFilter.texterId) {
    query = query.where({ "assignment.user_id": assignmentsFilter.texterId });
  }
  if (forData || (assignmentsFilter && assignmentsFilter.texterId)) {
    query = query
      .leftJoin("assignment", "campaign_contact.assignment_id", "assignment.id")
      .leftJoin("user", "assignment.user_id", "user.id");
  }

  query = addWhereClauseForContactsFilterMessageStatusIrrespectiveOfPastDue(
    query,
    contactsFilter && contactsFilter.messageStatus
  );

  if (contactsFilter && "isOptedOut" in contactsFilter) {
    query = query.where("is_opted_out", contactsFilter.isOptedOut);
  }

  return query;
}

/*
This is necessary because the SQL query that provides the data for this resolver
is a join across several tables with non-unique column names.  In the query, we
alias the column names to make them unique.  This function creates a copy of the
results, replacing keys in the fields map with the original column name, so the
results can be consumed by downstream resolvers.
 */
function mapQueryFieldsToResolverFields(queryResult, fieldsMap) {
  const data = _.mapKeys(queryResult, (value, key) => {
    const newKey = fieldsMap[key];
    if (newKey) {
      return newKey;
    }
    return key;
  });
  return data;
}

export async function getConversations(
  cursor,
  organizationId,
  campaignsFilter,
  assignmentsFilter,
  contactsFilter,
  utc,
  awsContext
) {
  /* Query #1 == get campaign_contact.id for all the conversations matching
   * the criteria with offset and limit. */
  const starttime = new Date();
  let offsetLimitQuery = r.knex.select("campaign_contact.id as cc_id");

  offsetLimitQuery = getConversationsJoinsAndWhereClause(
    offsetLimitQuery,
    organizationId,
    campaignsFilter,
    assignmentsFilter,
    contactsFilter
  );

  offsetLimitQuery = offsetLimitQuery.orderBy("cc_id");
  offsetLimitQuery = offsetLimitQuery.limit(cursor.limit).offset(cursor.offset);
  console.log(
    "getConversations sql",
    awsContext && awsContext.awsRequestId,
    cursor,
    assignmentsFilter,
    offsetLimitQuery.toString()
  );

  const ccIdRows = await offsetLimitQuery;

  console.log(
    "getConversations contact ids",
    awsContext && awsContext.awsRequestId,
    Number(new Date()) - Number(starttime),
    ccIdRows.length
  );
  const ccIds = ccIdRows.map(ccIdRow => {
    return ccIdRow.cc_id;
  });

  /* Query #2 -- get all the columns we need, including messages, using the
   * cc_ids from Query #1 to scope the results to limit, offset */
  let query = r.knex.select(
    "campaign_contact.id as cc_id",
    "campaign_contact.first_name as cc_first_name",
    "campaign_contact.last_name as cc_last_name",
    "campaign_contact.cell",
    "campaign_contact.message_status",
    "campaign_contact.is_opted_out",
    "campaign_contact.updated_at",
    "assignment.id as assignment_id",
    "user.id as u_id",
    "user.first_name as u_first_name",
    "user.last_name as u_last_name",
    "campaign.id as cmp_id",
    "campaign.title",
    "campaign.due_by",
    "assignment.id as ass_id",
    "message.id as mess_id",
    "message.text",
    "message.user_number",
    "message.contact_number",
    "message.created_at",
    "message.is_from_contact"
  );

  query = getConversationsJoinsAndWhereClause(
    query,
    organizationId,
    campaignsFilter,
    assignmentsFilter,
    contactsFilter,
    true
  );

  query = query.whereIn("campaign_contact.id", ccIds);

  query = query.leftJoin("message", table => {
    table.on("message.campaign_contact_id", "=", "campaign_contact.id");
  });

  query = query.orderBy("cc_id").orderBy("message.created_at");
  console.log(
    "getConversations query2",
    awsContext && awsContext.awsRequestId,
    query
  );
  const conversationRows = await query;
  console.log(
    "getConversations query2 result",
    awsContext && awsContext.awsRequestId,
    Number(new Date()) - Number(starttime),
    conversationRows.length
  );
  /* collapse the rows to produce an array of objects, with each object
   * containing the fields for one conversation, each having an array of
   * message objects */
  const messageFields = [
    "mess_id",
    "text",
    "user_number",
    "contact_number",
    "created_at",
    "is_from_contact"
  ];

  let ccId = undefined;
  let conversation = undefined;
  const conversations = [];
  for (const conversationRow of conversationRows) {
    if (ccId !== conversationRow.cc_id) {
      ccId = conversationRow.cc_id;
      conversation = _.omit(conversationRow, messageFields);
      conversation.messages = [];
      conversations.push(conversation);
    }
    conversation.messages.push(
      mapQueryFieldsToResolverFields(_.pick(conversationRow, messageFields), {
        mess_id: "id"
      })
    );
  }

  /* Query #3 -- get the count of all conversations matching the criteria.
   * We need this to show total number of conversations to support paging */
  const countQuery = r.knex.count("*").timeout(4000, { cancel: true });
  console.log(
    "getConversations query3",
    Number(new Date()) - Number(starttime)
  );
  const conversationsCountQuery = getConversationsJoinsAndWhereClause(
    countQuery,
    organizationId,
    campaignsFilter,
    assignmentsFilter,
    contactsFilter
  );
  console.log(
    "getConversations query3 sql",
    conversationsCountQuery.toString()
  );
  let conversationCountArray;
  try {
    conversationCountArray = await conversationsCountQuery;
  } catch (err) {
    // default fake value that means 'a lot'
    conversationCountArray = [{ count: 9999 }];
    console.log("getConversations timeout", err);
  }

  console.log(
    "getConversations query3 result",
    Number(new Date()) - Number(starttime),
    conversationCountArray,
    conversations
  );
  const pageInfo = {
    limit: cursor.limit,
    offset: cursor.offset,
    total: conversationCountArray[0].count
  };

  return {
    conversations,
    pageInfo
  };
}

export async function getCampaignIdMessageIdsAndCampaignIdContactIdsMaps(
  organizationId,
  campaignsFilter,
  assignmentsFilter,
  contactsFilter
) {
  let query = r.knex.select(
    "campaign_contact.id as cc_id",
    "campaign.id as cmp_id",
    "message.id as mess_id"
  );

  query = getConversationsJoinsAndWhereClause(
    query,
    organizationId,
    campaignsFilter,
    assignmentsFilter,
    contactsFilter
  );

  query = query.leftJoin("message", table => {
    table.on("message.campaign_contact_id", "=", "campaign_contact.id");
  });

  query = query.orderBy("cc_id");

  const conversationRows = await query;

  const campaignIdContactIdsMap = new Map();
  const campaignIdMessagesIdsMap = new Map();

  let ccId = undefined;
  for (const conversationRow of conversationRows) {
    if (ccId !== conversationRow.cc_id) {
      const ccId = conversationRow.cc_id;
      campaignIdContactIdsMap[conversationRow.cmp_id] = ccId;

      if (!campaignIdContactIdsMap.has(conversationRow.cmp_id)) {
        campaignIdContactIdsMap.set(conversationRow.cmp_id, []);
      }

      campaignIdContactIdsMap.get(conversationRow.cmp_id).push(ccId);

      if (!campaignIdMessagesIdsMap.has(conversationRow.cmp_id)) {
        campaignIdMessagesIdsMap.set(conversationRow.cmp_id, []);
      }
    }

    if (conversationRow.mess_id) {
      campaignIdMessagesIdsMap
        .get(conversationRow.cmp_id)
        .push(conversationRow.mess_id);
    }
  }

  return {
    campaignIdContactIdsMap,
    campaignIdMessagesIdsMap
  };
}

export async function reassignConversations(
  campaignIdContactIdsMap,
  campaignIdMessagesIdsMap,
  newTexterUserId
) {
  // ensure existence of assignments
  const campaignIdAssignmentIdMap = new Map();
  for (const [campaignId, _] of campaignIdContactIdsMap) {
    let assignment = await r
      .table("assignment")
      .getAll(newTexterUserId, { index: "user_id" })
      .filter({ campaign_id: campaignId })
      .limit(1)(0)
      .default(null);
    if (!assignment) {
      assignment = await Assignment.save({
        user_id: newTexterUserId,
        campaign_id: campaignId,
        max_contacts: parseInt(process.env.MAX_CONTACTS_PER_TEXTER || 0, 10)
      });
    }
    campaignIdAssignmentIdMap.set(campaignId, assignment.id);
  }

  // do the reassignment
  const returnCampaignIdAssignmentIds = [];

  // TODO(larry) do this in a transaction!
  try {
    for (const [campaignId, campaignContactIds] of campaignIdContactIdsMap) {
      const assignmentId = campaignIdAssignmentIdMap.get(campaignId);

      await r
        .knex("campaign_contact")
        .where("campaign_id", campaignId)
        .whereIn("id", campaignContactIds)
        .update({
          assignment_id: assignmentId
        });

      // Clear the DataLoader cache for the campaign contacts affected by the foregoing
      // SQL statement to keep the cache in sync.  This will force the campaignContact
      // to be refreshed. We also update the assignment in the cache
      await Promise.all(
        campaignContactIds.map(async campaignContactId => {
          loaders.campaignContact.clear(campaignContactId.toString());
          await cacheableData.campaignContact.updateAssignmentCache(
            campaignContactId,
            assignmentId,
            newTexterUserId,
            campaignId
          );
        })
      );

      returnCampaignIdAssignmentIds.push({
        campaignId,
        assignmentId: assignmentId.toString()
      });
    }
  } catch (error) {
    log.error(error);
  }

  return returnCampaignIdAssignmentIds;
}

export const resolvers = {
  PaginatedConversations: {
    conversations: queryResult => {
      console.log(
        "getConversations paginatedconversations conversations",
        queryResult.conversations
      );
      return queryResult.conversations;
    },
    pageInfo: queryResult => {
      if ("pageInfo" in queryResult) {
        return queryResult.pageInfo;
      } else {
        return null;
      }
    }
  },
  Conversation: {
    texter: queryResult => {
      console.log("getConversation texter");
      return mapQueryFieldsToResolverFields(queryResult, {
        u_id: "id",
        u_first_name: "first_name",
        u_last_name: "last_name"
      });
    },
    contact: queryResult => {
      console.log("getConversation contact", queryResult);
      return mapQueryFieldsToResolverFields(queryResult, {
        cc_id: "id",
        cc_first_name: "first_name",
        cc_last_name: "last_name"
      });
    },
    campaign: queryResult => {
      console.log("getConversation campaign");
      return mapQueryFieldsToResolverFields(queryResult, { cmp_id: "id" });
    }
  }
};
