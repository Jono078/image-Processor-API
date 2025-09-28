import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
export const doc = DynamoDBDocumentClient.from(ddb);

export const Tables = {
    files: process.env.DDB_FILES_TABLE,
    jobs: process.env.DDB_JOBS_TABLE,
    jobLogs: process.env.DDB_JOBLOGS_TABLE,
};

// helpers
export const ddbPut = (TableName, Item) => doc.send(new PutCommand({ TableName, Item}));
export const ddbGet = (TableName, Key) => doc.send(new GetCommand({ TableName, Key}));
export const ddbQuery = (params) => doc.send(new QueryCommand(params));
export const ddbUpdate = (params) => doc.send(new UpdateCommand(params));
