import { Secret, SecretProps } from "aws-cdk-lib/aws-secretsmanager";
import { RemovalPolicy, Stack, StackProps } from "aws-cdk-lib/core";
import { Construct } from "constructs";

type SecretsProps = {
  secrets: {
    slackWorkspaceId: string;
  };
} & StackProps;

/**
 * secret のパラメータを保存するための CDK スタック
 * MEMO: 未使用
 */
export class SecretManagerStack extends Stack {
  constructor(scope: Construct, id: string, props: SecretsProps) {
    super(scope, id, props);

    const secret = new Secret(this, `cognito-as-secrets`, {
      secretName: `cognito-as-secrets`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify(props.secrets),
      },
    });
  }
}
