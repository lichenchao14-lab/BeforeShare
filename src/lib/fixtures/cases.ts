import type { FamilyState } from "@/lib/types";

export interface FixtureCase {
  id: string;
  name: string;
  text: string;
  state: FamilyState;
  /** 用于自检：该案例的预期风险等级 */
  expect: "high" | "suspicious" | "undetermined" | "no_anomaly";
}

/** 预置案例：用于 spike 命中率测试与后续回归，全部为脱敏改写文本 */
export const FIXTURES: FixtureCase[] = [
  {
    id: "f1",
    name: "快递理赔 + 屏幕共享",
    state: "remote_access",
    expect: "high",
    text: "您好，我是中通快递客服，您的包裹在运输中破损，我们可以为您办理三倍理赔。请添加理赔专员微信，下载会议软件并开启屏幕共享，按指引填写银行卡号和短信验证码完成退款。",
  },
  {
    id: "f2",
    name: "冒充公检法 + 安全账户",
    state: "transferred",
    expect: "high",
    text: "我是市公安局经侦支队民警，您的身份证涉嫌一起洗钱案件，稍后会有检察官联系您。请保持电话畅通，不要挂断也不要告诉家人，将名下资金转入安全账户接受资金核查，否则将依法冻结您的账户并影响征信。",
  },
  {
    id: "f3",
    name: "刷单返利",
    state: "joined_group",
    expect: "high",
    text: "亲，我们招募线上兼职，做任务返利日结，垫付越多佣金越高。先做三单小额任务建立信任，之后需要您连续刷满五单才能提现，中途退出视为违约，保证金不予退还。",
  },
  {
    id: "f4",
    name: "AI 换脸冒充熟人借钱",
    state: "message_only",
    expect: "high",
    text: "是我，现在不方便打电话，我在开会。有个急事需要你先帮我转两万块钱到一个账户，明天就还你，先别告诉别人，等我方便了再跟你解释。",
  },
  {
    id: "f5",
    name: "养老投资 + 低价旅游",
    state: "transferred",
    expect: "high",
    text: "我们公司是政府扶持的养老项目，投入十万元每月固定返利百分之八，还赠送云南双飞六日游。名额有限，今天签约还能额外获得一千元购物卡，请您尽快把资金转到公司指定账户。",
  },
  {
    id: "f6",
    name: "正常通知：快递柜取件（特异性测试）",
    state: "message_only",
    expect: "no_anomaly",
    text: "您好，您的顺丰快递已放置小区丰巢柜，取件码 123456，请在两日内取件，超时退回。查询可拨打顺丰官方客服电话 95338。",
  },
  {
    id: "f7",
    name: "查无实据：陌生读书会逾期通知（不确定态测试）",
    state: "message_only",
    expect: "undetermined",
    text: "您好，我们是青禾读书会客服，您上月借阅的山月记已逾期三天，请今天内归还到前台，逾期会产生滞纳金。",
  },
];
