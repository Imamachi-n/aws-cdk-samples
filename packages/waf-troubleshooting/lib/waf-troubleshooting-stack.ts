import { Stack, StackProps } from "aws-cdk-lib/core";
import { Construct } from "constructs";

/**
 * WAF トラブルシューティング素振り用の CDK スタック
 */
export class WafTroubleShootingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // TODO: WAF Groups

    // TODO: IP アドレス直たたきをブロック

    // TODO: Slack Link Expanding によるアクセスをブロック

    // TODO: コアルールセットの適応

    // TODO: マネージドの IP アドレスブラックリストの適応
  }
}
