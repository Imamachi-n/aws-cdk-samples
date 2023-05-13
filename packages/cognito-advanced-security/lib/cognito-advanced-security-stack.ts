import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib/core";
import { Construct } from "constructs";
import {
  AccountRecovery,
  AdvancedSecurityMode,
  CfnUserPoolRiskConfigurationAttachment,
  UserPool,
  VerificationEmailStyle,
} from "aws-cdk-lib/aws-cognito";
import { SlackChannelConfiguration } from "aws-cdk-lib/aws-chatbot";
import { Topic } from "aws-cdk-lib/aws-sns";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { Alarm, ComparisonOperator, Metric } from "aws-cdk-lib/aws-cloudwatch";

/**
 * アドバンスドセキュリティのイベントアクション
 */
type EventAction = "BLOCK" | "NO_ACTION";

/**
 * アドバンスドセキュリティのメトリクス種別
 */
const COGNITO_ADVANCED_SECURITY_METRIC_OPTIONS = {
  ACCOUNT_TAKEOUT_RISK: "AccountTakeoverRisk",
  COMPROMISED_CREDENTIAL_RISK: "CompromisedCredentialRisk",
} as const;
type CognitoAdvancedSecurityMetricOptions =
  (typeof COGNITO_ADVANCED_SECURITY_METRIC_OPTIONS)[keyof typeof COGNITO_ADVANCED_SECURITY_METRIC_OPTIONS];

/**
 * アドバンスドセキュリティのオペレーション種別
 */
const COGNITO_ADVANCED_SECURITY_OPERATION_OPTIONS = {
  PASSWORD_CHANGE: "PasswordChange",
  SIGN_IN: "SignIn",
  SIGN_UP: "SignUp",
} as const;
type CognitoAdvancedSecurityOperationOptions =
  (typeof COGNITO_ADVANCED_SECURITY_OPERATION_OPTIONS)[keyof typeof COGNITO_ADVANCED_SECURITY_OPERATION_OPTIONS];

/**
 * アドバンスドセキュリティのリスクレベル種別
 */
const COGNITO_ADVANCED_SECURITY_RISK_LEVEL_OPTIONS = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
} as const;
type CognitoAdvancedSecurityRiskLevelOptions =
  (typeof COGNITO_ADVANCED_SECURITY_RISK_LEVEL_OPTIONS)[keyof typeof COGNITO_ADVANCED_SECURITY_RISK_LEVEL_OPTIONS];

/**
 * Cognito アドバンスドセキュリティの検証用 CDK スタック
 */
export class CognitoAdvancedSecurityStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Cognito ユーザプール設定: アドバンスドセキュリティ（フル機能 & ブロック）
    const userPool = this.createCognitoUserPool(
      AdvancedSecurityMode.ENFORCED,
      "full",
      "BLOCK"
    );
    // Cognito ユーザプール設定: アドバンスドセキュリティ（監査のみ）
    this.createCognitoUserPool(AdvancedSecurityMode.AUDIT, "audit");

    // Slack ワークスペース ID の取得（環境変数から取得）
    const slackWorkspaceId = scope.node.tryGetContext("slackWorkspaceId");
    if (!slackWorkspaceId) {
      console.warn(
        "slackWorkspaceId が環境変数として指定されていません: yarn deploy -c slackWorkspaceId=${SlackワークスペースID}"
      );
      return;
    }

    // Cognito アラート通知設定
    this.createCognitoNotification(slackWorkspaceId, userPool);
  }

  /**
   * Cognito ユーザプールの作成
   */
  private createCognitoUserPool(
    advancedSecurityMode: AdvancedSecurityMode,
    name: string,
    eventAction: EventAction = "NO_ACTION"
  ): UserPool {
    // Cognito ユーザープールの設定
    const userPoolAs = new UserPool(this, `user-pool-as-${name}`, {
      // ユーザプール名
      userPoolName: `cognito-test-as-${name}`,
      // メールアドレスの大文字小文字の区別をしない
      signInCaseSensitive: false, // case insensitive is preferred in most situations
      // セルフサインアップ: NG
      selfSignUpEnabled: false,
      // ユーザ確認
      userVerification: {
        emailSubject: "メール認証を完了してください！",
        emailBody: "サインアップを完了してください。認証コードは {####} です。",
        emailStyle: VerificationEmailStyle.CODE, // 認証コードを入力する方式
        smsMessage:
          "サインアップを完了してください。認証コードは {####} です。",
      },
      // サインインで使えるユーザ名
      // MEMO: 既存のユーザープールに対しては適応不可
      signInAliases: {
        email: true,
      },
      // パスワードポリシー
      passwordPolicy: {
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: Duration.days(21), // 仮パスワードは21日間有効
      },
      // アカウントリカバリ（ログインパスワードを忘れてしまった場合）
      accountRecovery: AccountRecovery.EMAIL_ONLY,
      // アドバンスドセキュリティ: ON / ブロック
      advancedSecurityMode,
      // デバイストラッキング（ユーザーがログインしているデバイスの追跡）
      // URL: https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/amazon-cognito-user-pools-device-tracking.html
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: true,
      },
      // 削除保護（デフォルトでは false）
      // WARNING: false にしていますが、本番運用では true にして削除保護するようにしましょう
      deletionProtection: false,
    });

    // クライアントの設定
    // URL: https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/cognito-user-pools-app-idp-settings.html
    const cognitoClient = userPoolAs.addClient(`user-pool-as-${name}-client`, {
      userPoolClientName: `cognito-test-as-${name}-client`,
      oAuth: {
        callbackUrls: ["https://example.com"],
      },
      // 認証フローセッション持続期間（3-15min）
      authSessionValidity: Duration.minutes(15),
      // JWT トークンの有効期限
      idTokenValidity: Duration.minutes(60),
      // リフレッシュトークンの有効期限
      refreshTokenValidity: Duration.days(30),
    });

    // ドメインの設定
    const cognitoDomain = userPoolAs.addDomain(`user-pool-as-${name}-domain`, {
      cognitoDomain: {
        // MEMO: `-` や大文字アルファベットは使用不可
        domainPrefix: `astest${name}`,
      },
    });
    cognitoDomain.signInUrl(cognitoClient, {
      redirectUri: "https://example.com", // must be a URL configured under 'callbackUrls' with the client
    });

    // アドバンスドセキュリティの詳細設定
    if (advancedSecurityMode === AdvancedSecurityMode.ENFORCED) {
      const cfnUserPoolRiskConfigurationAttachment =
        new CfnUserPoolRiskConfigurationAttachment(
          this,
          "MyCfnUserPoolRiskConfigurationAttachment",
          {
            clientId: cognitoClient.userPoolClientId,
            userPoolId: userPoolAs.userPoolId,
            accountTakeoverRiskConfiguration: {
              // 悪意のあるアクティビティの可能性を検出した場合のアクション: BLOCK | MFA_IF_CONFIGURED | MFA_REQUIRED | NO_ACTION
              // FIXME: 機能しない
              actions: {
                highAction: {
                  eventAction,
                  notify: false,
                },
                lowAction: {
                  eventAction,
                  notify: false,
                },
                mediumAction: {
                  eventAction,
                  notify: false,
                },
              },
            },
            compromisedCredentialsRiskConfiguration: {
              actions: {
                // 漏えいした認証情報の対するアクション: BLOCK | NO_ACTION
                // FIXME: 機能しない
                eventAction,
              },
            },
            // ブロック or 除外 IP リスト
            // riskExceptionConfiguration: {
            //   blockedIpRangeList: ["blockedIpRangeList"],
            //   skippedIpRangeList: ["skippedIpRangeList"],
            // },
          }
        );
    }

    // 削除ポリシー
    // WARNING: 検証用のユーザープールなので問答無用で削除します
    userPoolAs.applyRemovalPolicy(RemovalPolicy.DESTROY);
    cognitoClient.applyRemovalPolicy(RemovalPolicy.DESTROY);
    cognitoDomain.applyRemovalPolicy(RemovalPolicy.DESTROY);

    return userPoolAs;
  }

  /**
   * Cognito アラート通知設定
   */
  private createCognitoNotification(
    slackWorkspaceId: string,
    userPool: UserPool
  ) {
    // SNS -> ChatBot 経由での Slack 通知設定
    const slackChannel = new SlackChannelConfiguration(
      this,
      `cognito-as-slack-bot`,
      {
        slackChannelConfigurationName: `cognito-as-slack-bot`,
        slackWorkspaceId,
        slackChannelId: "random",
      }
    );
    const snsTopic = new Topic(this, `cognito-as-sns-topic`);
    slackChannel.addNotificationTopic(snsTopic);
    const snsAction = new SnsAction(snsTopic);

    // accountTakeoverRisk のメトリクスに対してアラート設定
    this.createCloudWatchAlarm(
      userPool,
      snsAction,
      "AccountTakeoverRisk",
      "PasswordChange"
    );
    this.createCloudWatchAlarm(
      userPool,
      snsAction,
      "AccountTakeoverRisk",
      "SignIn"
    );
    this.createCloudWatchAlarm(
      userPool,
      snsAction,
      "AccountTakeoverRisk",
      "SignUp"
    );

    // accountTakeoverRisk のメトリクスに対してアラート設定
    this.createCloudWatchAlarm(
      userPool,
      snsAction,
      "CompromisedCredentialRisk",
      "PasswordChange"
    );
    this.createCloudWatchAlarm(
      userPool,
      snsAction,
      "CompromisedCredentialRisk",
      "SignIn"
    );
    this.createCloudWatchAlarm(
      userPool,
      snsAction,
      "CompromisedCredentialRisk",
      "SignUp"
    );
  }

  /**
   * アラームの設定
   */
  private createCloudWatchAlarm(
    userPool: UserPool,
    snsAction: SnsAction,
    metricName: CognitoAdvancedSecurityMetricOptions,
    operation: CognitoAdvancedSecurityOperationOptions,
    level?: CognitoAdvancedSecurityRiskLevelOptions,
    threshold?: number
  ) {
    const riskLevel = level || "high";

    // Cognito アドバンスドセキュリティのメトリクスに対してアラート設定
    // URL: https://docs.aws.amazon.com/ja_jp/cognito/latest/developerguide/user-pool-settings-viewing-advanced-security-metrics.html
    const alarm = new Alarm(
      this,
      `cognito-as-${metricName}-${operation}-${riskLevel}`,
      {
        metric: new Metric({
          namespace: "AWS/Cognito",
          metricName,
          statistic: "SUM",
          dimensionsMap: {
            UserPoolId: userPool.userPoolId,
            Operation: operation,
            RiskLevel: riskLevel,
          },
          period: Duration.minutes(5),
        }),
        evaluationPeriods: 1,
        threshold: threshold || 3, // 3件以上でアラートを発砲
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        alarmDescription: `${metricName} (${operation}) is too high`,
      }
    );
    alarm.addAlarmAction(snsAction);
    return alarm;
  }
}
