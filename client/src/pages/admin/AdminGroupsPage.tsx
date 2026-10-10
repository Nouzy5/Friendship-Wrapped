import { useState } from "react";
import { Link } from "react-router";
import { Alert } from "../../components/ui/Alert";
import { LoadMore } from "../../components/ui/LoadMore";
import { ListSkeleton } from "../../components/ui/Skeleton";
import { StateMessage } from "../../components/ui/StateMessage";
import type { GroupRow } from "../../features/admin/api";
import { rowGrid } from "../../features/admin/components/AdminUi";
import { useAdminGroups } from "../../features/admin/hooks";
import { formatDateTime, formatNumber, formatRelativeTime } from "../../lib/format";
import { getFormError } from "../../lib/form-errors";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { usePageTitle } from "../../lib/usePageTitle";

const COLUMNS = "md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_5rem_5rem_9rem]";

function GroupListRow({ group }: { group: GroupRow }) {
  return (
    <li>
      <Link
        to={`/admin/groups/${group.id}`}
        className={`flex flex-col gap-1.5 rounded-2xl px-3 py-3 transition hover:bg-surface ${rowGrid} ${COLUMNS}`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface text-2xl">
            {group.emoji}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{group.name}</span>
            <span className="truncate text-sm text-sub" title={`Created ${formatDateTime(group.createdAt)}`}>
              created {formatRelativeTime(group.createdAt)}
            </span>
          </span>
        </span>
        <span className="truncate text-[0.9375rem]">
          <span className="text-sub md:hidden">Owner: </span>
          {group.owner ? `${group.owner.displayName} @${group.owner.username}` : <span className="text-sub">none</span>}
        </span>
        <span className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-sub md:contents">
          <span>
            <span className="md:hidden">Members: </span>
            {formatNumber(group.memberCount)}
          </span>
          <span>
            <span className="md:hidden">Posts: </span>
            {formatNumber(group.photoCount)}
          </span>
          <span>
            <span className="md:hidden">Last post: </span>
            {group.lastPostAt ? formatRelativeTime(group.lastPostAt) : "never"}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function AdminGroupsPage() {
  usePageTitle("Admin · Groups");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 300);
  const groups = useAdminGroups(q);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] leading-tight font-semibold font-stretch-112%">Groups</h1>
        <p className="text-sm text-sub">Search by name or id. You see who is in a group and how active it is, not what they posted.</p>
      </div>

      <div>
        <label htmlFor="group-search" className="sr-only">
          Search groups
        </label>
        <input
          id="group-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search groups…"
          autoComplete="off"
          spellCheck={false}
          className="min-h-12 w-full rounded-2xl border-2 border-transparent bg-surface px-4 text-base text-fg outline-none transition placeholder:text-sub focus:border-fg"
        />
      </div>

      {groups.isPending && <ListSkeleton rows={5} />}
      {groups.isError && !groups.data && <Alert>Couldn't load groups: {getFormError(groups.error)}</Alert>}

      {groups.data && groups.data.length === 0 && (
        <StateMessage emoji="🔍" title="No groups found" description={q ? `No group matches “${q}”.` : "Nobody has made a group yet."} />
      )}

      {groups.data && groups.data.length > 0 && (
        <div>
          <div aria-hidden className={`hidden px-3 pb-2 text-[0.8125rem] font-medium text-sub md:grid md:gap-4 ${COLUMNS}`}>
            <span>Group</span>
            <span>Owner</span>
            <span>Members</span>
            <span>Posts</span>
            <span>Last post</span>
          </div>
          <ul className="flex flex-col">
            {groups.data.map((group) => (
              <GroupListRow key={group.id} group={group} />
            ))}
          </ul>
          <LoadMore
            hasMore={Boolean(groups.hasNextPage)}
            isLoading={groups.isFetchingNextPage}
            isError={groups.isFetchNextPageError}
            onLoadMore={() => void groups.fetchNextPage()}
            label="Load more groups"
            endMessage={`${formatNumber(groups.data.length)} ${groups.data.length === 1 ? "group" : "groups"}`}
          />
        </div>
      )}
    </div>
  );
}
