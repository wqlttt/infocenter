export type DemoRole = 'admin' | 'leader' | 'member';

export interface DemoAccount {
  role: DemoRole;
  username: string;
  password: string;
  title: string;
  description: string;
  permissions: string[];
}

export const DEMO_PASSWORD = 'demo123';

export const ADMIN_ACCOUNT: DemoAccount = {
  role: 'admin',
  username: 'admin',
  password: DEMO_PASSWORD,
  title: '消息中心',
  description: '管理员：全员群发消息、查看全部收件箱',
  permissions: ['全员群发', '查看全部消息'],
};

export const LEADER_ACCOUNT: DemoAccount = {
  role: 'leader',
  username: 'leader',
  password: DEMO_PASSWORD,
  title: '队长',
  description: '队长（系统角色 leader）：接收消息、审批入团、向队员发消息',
  permissions: ['接收广播与队内消息', '查看入团申请', '向队员发消息'],
};

export const MEMBER_ACCOUNTS: DemoAccount[] = Array.from({ length: 10 }, (_, i) => {
  const n = i + 1;
  return {
    role: 'member' as const,
    username: `member${n}`,
    password: DEMO_PASSWORD,
    title: `成员 ${n}`,
    description: `成员 member${n}：仅可发起入团申请，接收消息`,
    permissions: ['申请加入 Demo Team', '接收广播与队内消息'],
  };
});

/** @deprecated 兼容旧引用 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  ADMIN_ACCOUNT,
  LEADER_ACCOUNT,
  ...MEMBER_ACCOUNTS,
];

export function getDemoRoute(role: DemoRole) {
  return role === 'admin' ? '/admin' : `/${role}`;
}

export function findDemoAccount(username: string) {
  return DEMO_ACCOUNTS.find((a) => a.username === username);
}
