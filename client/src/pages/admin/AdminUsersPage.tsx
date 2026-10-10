import { useState } from "react";
import { Link } from "react-router";
import { Alert } from "../../components/ui/Alert";
import { Avatar } from "../../components/ui/Avatar";
import { Badge } from "../../components/ui/Badge";
import { LoadMore } from "../../components/ui/LoadMore";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { StateMessage } from "../../components/ui/StateMessage";
import type { UserFilter, UserRow } from "../../features/admin/api";
import { rowGrid } from "../../features/admin/components/AdminUi";
import { useAdminUsers } from "../../features/admin/hooks";
import { formatDateTime, formatNumber, formatRelativeTime } from "../../lib/format";
import { getFormError } from "../../lib/form-errors";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { usePageTitle } from "../../lib/usePageTitle";

const FILTERS: { value: UserFilter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "verified", label: "Confirmed" },
  { value: "unverified", label: "Waiting" },
  { value: "no-email", label: "No email" },
];

const COLUMNS = "md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_5rem_5rem_9rem]";

function EmailStatus({ user }: { user: UserRow }) {
  if (!user.email) return <Badge>No email</Badge>;
  return user.emailVerified ? <span className="sr-only">confirmed</span> : <Badge>Not confirmed</Badge>;
}

function UserListRow({ user }: { user: UserRow }) {
  return (
    <li>
      <Link
        to={`/admin/users/${user.id}`}
        className={`flex flex-col gap-1.5 rounded-2xl px-3 py-3 transition hover:bg-surface ${rowGrid} ${COLUMNS}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={user.displayName} size="md" />
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-2">
              <span className="truncate font-semibold">{user.displayName}</span>
              {user.isAdmin && <Badge>Admin</Badge>}
            </span>
            <span className="truncate text-sm text-sub">@{user.username}</span>
          </span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-[0.9375rem]">
          <span className="truncate">{user.email ?? <span className="text-sub">—</span>}</span>
          <EmailStatus user={user} />
        </span>
        {/* One line on a phone; three columns from md (the wrapper then steps out of the grid's way). */}
        <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-sub md:contents">
          <span>
            <span className="md:hidden">Groups: </span>
            {formatNumber(user.groupCount)}
          </span>
          <span>
            <span className="md:hidden">Posts: </span>
            {formatNumber(user.photoCount)}
          </span>
          <span title={`Joined ${formatDateTime(user.createdAt)}`}>
            <span className="md:hidden">Active: </span>
            {user.lastActiveAt ? formatRelativeTime(user.lastActiveAt) : "signed out"}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function AdminUsersPage() {
  usePageTitle("Admin · Users");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const q = useDebouncedValue(search.trim(), 300);
  const users = useAdminUsers(q, filter);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] leading-tight font-semibold font-stretch-112%">Users</h1>
        <p className="text-sm text-sub">Search by name, username, email address or id.</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <label htmlFor="user-search" className="sr-only">
            Search users
          </label>
          <input
            id="user-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search people…"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="min-h-12 w-full rounded-2xl border-2 border-transparent bg-surface px-4 text-base text-fg outline-none transition placeholder:text-sub focus:border-fg"
          />
        </div>
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={option.value === filter}
              onClick={() => setFilter(option.value)}
              className={`min-h-11 rounded-full px-4 text-[0.9375rem] font-semibold transition ${
                option.value === filter ? "bg-inverse text-on-inverse" : "bg-surface text-fg hover:bg-line"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {users.isPending && <ListSkeleton rows={6} />}
      {users.isError && !users.data && <Alert>Couldn't load people: {getFormError(users.error)}</Alert>}

      {users.data && users.data.length === 0 && (
        <StateMessage emoji="🔍" title="Nobody found" description={q ? `No one matches “${q}” here.` : "There's no one in this list."} />
      )}

      {users.data && users.data.length > 0 && (
        <div>
          <div
            aria-hidden
            className={`hidden px-3 pb-2 text-[0.8125rem] font-medium text-sub md:grid md:gap-4 ${COLUMNS}`}
          >
            <span>Person</span>
            <span>Email</span>
            <span>Groups</span>
            <span>Posts</span>
            <span>Last active</span>
          </div>
          <ul className="flex flex-col">
            {users.data.map((user) => (
              <UserListRow key={user.id} user={user} />
            ))}
          </ul>
          <LoadMore
            hasMore={Boolean(users.hasNextPage)}
            isLoading={users.isFetchingNextPage}
            isError={users.isFetchNextPageError}
            onLoadMore={() => void users.fetchNextPage()}
            label="Load more people"
            endMessage={`${formatNumber(users.data.length)} ${users.data.length === 1 ? "person" : "people"}`}
          />
        </div>
      )}
    </div>
  );
}
