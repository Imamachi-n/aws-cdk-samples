import * as wafv2 from "aws-cdk-lib/aws-wafv2";
// import { CfnRuleGroup } from "aws-cdk-lib/aws-wafv2";
import { Stack, StackProps } from "aws-cdk-lib/core";
import { Construct } from "constructs";

/**
 * WAF トラブルシューティング素振り用の CDK スタック
 */
export class WafTroubleShootingStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // TODO: WAF Groups
    const wafLogPrefix = "aws-waf-logs";
    const cfnRuleGroup = new wafv2.CfnRuleGroup(
      this,
      "test-waf-trouble-shooting",
      {
        // Web ACL キャパシティユニット（WCU）
        // URL: https://dev.classmethod.jp/articles/web-acl-capacity-units-limits/
        capacity: 5000,
        // CLOUDFRONT | REGIONAL
        scope: "REGIONAL",
        name: "test-waf-trouble-shooting",
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: "test-waf-trouble-shooting-metrics",
          sampledRequestsEnabled: true,
        },
      }
    );

    // TODO: IP アドレス直たたきをブロック

    // TODO: Slack Link Expanding によるアクセスをブロック

    // TODO: コアルールセットの適応

    // TODO: マネージドの IP アドレスブラックリストの適応
  }
}
