// ビルド時に GitHub Discussions を取得し、記事一覧にコメント数・いいね(リアクション)数を
// 表示するためのユーティリティ。
//
// 静的サイト (SSG) なのでカウントは「最後にビルドした時点」のスナップショット。
// GitHub Actions では自動付与される GITHUB_TOKEN を使えるため、デプロイのたびに更新される。
//
// token 未設定 / repo 未設定 / 取得失敗のいずれでも空 Map を返し、ビルドは止めない
// （その場合カードにカウントは出ない＝グレースフルデグレード）。

import { GISCUS_CONFIG, isGiscusConfigured } from '../config/giscus';

export interface DiscussionStat {
  /** トップレベルのコメント数 */
  comments: number;
  /** Discussion 本体へのリアクション数（= いいね） */
  reactions: number;
  url: string;
}

interface DiscussionNode {
  title: string;
  url: string;
  comments: { totalCount: number };
  reactions: { totalCount: number };
}

interface GraphQLResponse {
  data?: {
    repository?: {
      discussions: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: DiscussionNode[];
      };
    } | null;
  };
  errors?: { message: string }[];
}

const QUERY = `
  query ($owner: String!, $name: String!, $category: ID, $cursor: String) {
    repository(owner: $owner, name: $name) {
      discussions(first: 100, after: $cursor, categoryId: $category) {
        pageInfo { hasNextPage endCursor }
        nodes {
          title
          url
          comments { totalCount }
          reactions { totalCount }
        }
      }
    }
  }
`;

async function fetchDiscussionStats(): Promise<Map<string, DiscussionStat>> {
  const result = new Map<string, DiscussionStat>();

  const token = process.env.GISCUS_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token || !isGiscusConfigured()) return result;

  const [owner, name] = GISCUS_CONFIG.repo.split('/');
  if (!owner || !name) return result;

  try {
    let cursor: string | null = null;
    // ページネーション（100 件/ページ）。1000 件で安全弁。
    for (let page = 0; page < 10; page++) {
      const res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: QUERY,
          variables: {
            owner,
            name,
            category: GISCUS_CONFIG.categoryId,
            cursor,
          },
        }),
      });

      if (!res.ok) {
        console.warn(`[discussions] GitHub API responded ${res.status}; skipping counts.`);
        break;
      }

      const json = (await res.json()) as GraphQLResponse;
      if (json.errors?.length) {
        console.warn(`[discussions] GraphQL error: ${json.errors[0].message}; skipping counts.`);
        break;
      }

      const discussions = json.data?.repository?.discussions;
      if (!discussions) break;

      for (const node of discussions.nodes) {
        // mapping: 'specific' では Discussion タイトル === term (= note.id)。
        result.set(node.title, {
          comments: node.comments.totalCount,
          reactions: node.reactions.totalCount,
          url: node.url,
        });
      }

      if (!discussions.pageInfo.hasNextPage) break;
      cursor = discussions.pageInfo.endCursor;
    }
  } catch (err) {
    console.warn('[discussions] Failed to fetch discussion stats; skipping counts.', err);
  }

  return result;
}

// 複数ページが import するため、ビルド中は 1 回だけ取得してキャッシュする。
let cache: Promise<Map<string, DiscussionStat>> | null = null;

export function getDiscussionStats(): Promise<Map<string, DiscussionStat>> {
  if (!cache) cache = fetchDiscussionStats();
  return cache;
}
