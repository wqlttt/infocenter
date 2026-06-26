/** 消息 linkUrl 解析：支持业务深链、HTML 嵌入、内外链 */

export type TeamJoinAction = {
  kind: 'team-join';
  userId: string;
  username: string;
  teamId: string;
  teamName: string;
  href: string;
  label: string;
};

export type ExternalLinkAction = {
  kind: 'external';
  href: string;
  label: string;
};

export type MessageAction = TeamJoinAction | ExternalLinkAction;

export function buildTeamJoinLink(params: {
  userId: string;
  username: string;
  teamId: string;
  teamName: string;
}): string {
  const q = new URLSearchParams({
    userId: params.userId,
    username: params.username,
    teamId: params.teamId,
    teamName: params.teamName,
  });
  return `/approvals/team-join?${q.toString()}`;
}

/** 从 HTML 片段或纯文本中提取 href */
export function extractHref(raw: string): string {
  const trimmed = raw.trim();
  const htmlMatch = trimmed.match(/href\s*=\s*["']([^"']+)["']/i);
  if (htmlMatch?.[1]) return htmlMatch[1].trim();
  return trimmed;
}

/** 规范化为可跳转地址 */
export function normalizeHref(raw: string): string {
  const href = extractHref(raw);
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/')) return href;
  if (/^[\w-]+(\/|\?)/.test(href)) return `/${href.replace(/^\//, '')}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(href)) return `https://${href}`;
  return href;
}

export function parseMessageLink(linkUrl?: string | null): MessageAction | null {
  if (!linkUrl?.trim()) return null;
  const raw = linkUrl.trim();

  try {
    if (raw.startsWith('{')) {
      const data = JSON.parse(raw) as Record<string, string>;
      if (data.action === 'team-join' || data.kind === 'team-join') {
        const team = teamJoinFromParams(data);
        if (team) {
          if (data.label) team.label = data.label;
          return team;
        }
      }
      const jsonHref = data.href || data.url || data.link;
      if (jsonHref) {
        return externalFromHref(jsonHref, data.label || data.title);
      }
    }
  } catch { /* fall through */ }

  const href = normalizeHref(raw);

  if (href.startsWith('/approvals/team-join') || href.includes('/approvals/team-join?')) {
    try {
      const url = new URL(href, 'http://local');
      const team = teamJoinFromParams(Object.fromEntries(url.searchParams.entries()));
      if (team) return team;
    } catch { /* ignore */ }
  }

  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/')) {
    return externalFromHref(href);
  }

  if (href) {
    return externalFromHref(href.startsWith('/') ? href : `/${href}`);
  }

  return null;
}

function externalFromHref(href: string, label?: string): ExternalLinkAction {
  const normalized = normalizeHref(href);
  return {
    kind: 'external',
    href: normalized,
    label: label?.trim() || '立即跳转',
  };
}

function teamJoinFromParams(data: Record<string, string>): TeamJoinAction | null {
  const userId = data.userId;
  const username = data.username;
  const teamId = data.teamId;
  const teamName = data.teamName ?? '组织';
  if (!userId || !teamId) return null;
  const href = buildTeamJoinLink({ userId, username: username ?? '成员', teamId, teamName });
  return {
    kind: 'team-join',
    userId,
    username: username ?? '成员',
    teamId,
    teamName,
    href,
    label: '前往审批入团申请',
  };
}

export function messageCategory(title: string, linkUrl?: string): 'system' | 'team' | 'task' | 'general' {
  const action = parseMessageLink(linkUrl);
  if (action?.kind === 'team-join') return 'team';
  if (/任务|标注|审查|workflow/i.test(title)) return 'task';
  if (/系统|上线|通知/i.test(title)) return 'system';
  return 'general';
}

export function categoryMeta(cat: ReturnType<typeof messageCategory>) {
  const map = {
    team: { label: '入团申请', icon: '👥', accent: '#8b5cf6' },
    task: { label: '任务通知', icon: '⚡', accent: '#0ea5e9' },
    system: { label: '系统', icon: '🔔', accent: '#64748b' },
    general: { label: '站内信', icon: '💬', accent: '#2563eb' },
  };
  return map[cat];
}

export function isExternalUrl(href: string): boolean {
  return /^https?:\/\//i.test(href) && !href.startsWith(window.location.origin);
}
