import dotenv from "dotenv";
dotenv.config();

const { AWS_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID } = process.env;
if (!AWS_REGION || !COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) {
  throw new Error("Missing env: AWS_REGION / COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID");
}

import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand
} from "@aws-sdk/client-cognito-identity-provider";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import secretHash from "./secretHash.js";

const client = new CognitoIdentityProviderClient({ region: AWS_REGION });

export const signUp = (username, password, email) =>
  client.send(new SignUpCommand({
    ClientId: COGNITO_CLIENT_ID,
    Username: username,
    Password: password,
    SecretHash: secretHash(username),
    UserAttributes: [{ Name: "email", Value: email }]
  }));

export const confirmSignUp = (username, code) =>
  client.send(new ConfirmSignUpCommand({
    ClientId: COGNITO_CLIENT_ID,
    Username: username,
    ConfirmationCode: code,
    SecretHash: secretHash(username)
  }));

export const login = (username, password) =>
  client.send(new InitiateAuthCommand({
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: username,
      PASSWORD: password,
      SECRET_HASH: secretHash(username)
    }
  }));

export const accessVerifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_USER_POOL_ID,
  tokenUse: "access"
});

export const idVerifier = CognitoJwtVerifier.create({
  userPoolId: COGNITO_USER_POOL_ID,
  tokenUse: "id",
  clientId: COGNITO_CLIENT_ID
});

export const verifyAccessToken = (t) => accessVerifier.verify(t);
