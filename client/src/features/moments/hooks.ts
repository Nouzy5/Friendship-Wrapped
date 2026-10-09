import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import type { Photo, PhotoPage } from "../photos/types";
import { deleteMoment, endMoment, fetchMoment, fetchMomentPhotos, fetchMoments, fetchOpenMoment, startMoment } from "./api";
import type { Moment, MomentPage, NewMoment } from "./types";

export const momentKeys = {
  all: ["moments"] as const,
  list: (groupId: string) => [...momentKeys.all, "list", groupId] as const,
  open: (groupId: string) => [...momentKeys.all, "open", groupId] as const,
  detail: (momentId: string) => [...momentKeys.all, "detail", momentId] as const,
  photos: (momentId: string) => [...momentKeys.all, "photos", momentId] as const,
};

const allPhotos = (data: InfiniteData<PhotoPage, string | null>): Photo[] => data.pages.flatMap((page) => page.photos);
const allMoments = (data: InfiniteData<MomentPage, string | null>): Moment[] => data.pages.flatMap((page) => page.moments);

/** A group's moments, newest first, a page at a time. */
export function useMoments(groupId: string) {
  return useInfiniteQuery({
    queryKey: momentKeys.list(groupId),
    queryFn: ({ pageParam, signal }) => fetchMoments(groupId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: allMoments,
  });
}

/**
 * The moment taking photos now. Asked again every minute, so one that has run out stops being
 * offered without a reload.
 */
export function useOpenMoment(groupId: string) {
  return useQuery({
    queryKey: momentKeys.open(groupId),
    queryFn: ({ signal }) => fetchOpenMoment(groupId, signal),
    refetchInterval: 60_000,
  });
}

export function useMoment(momentId: string | null) {
  return useQuery({
    queryKey: momentKeys.detail(momentId ?? ""),
    queryFn: ({ signal }) => fetchMoment(momentId!, signal),
    enabled: Boolean(momentId),
  });
}

/** A moment's photos, oldest first, a page at a time. */
export function useMomentPhotos(momentId: string) {
  return useInfiniteQuery({
    queryKey: momentKeys.photos(momentId),
    queryFn: ({ pageParam, signal }) => fetchMomentPhotos(momentId, pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: allPhotos,
  });
}

/** After a moment changed: keep its detail, and refresh the lists it appears in. */
function momentChanged(queryClient: QueryClient, moment: Moment) {
  queryClient.setQueryData(momentKeys.detail(moment.id), moment);
  void queryClient.invalidateQueries({ queryKey: momentKeys.list(moment.groupId) });
  void queryClient.invalidateQueries({ queryKey: momentKeys.open(moment.groupId) });
}

export function useStartMoment(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (moment: NewMoment) => startMoment(groupId, moment),
    onSuccess: (moment) => momentChanged(queryClient, moment),
  });
}

export function useEndMoment(momentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => endMoment(momentId),
    onSuccess: (moment) => momentChanged(queryClient, moment),
  });
}

export function useDeleteMoment(moment: Pick<Moment, "id" | "groupId">) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteMoment(moment.id),
    onSuccess: () => {
      // Only marked stale: the page is still on screen until the caller navigates away, and
      // removing its data would make it fetch the deleted moment again (404).
      for (const queryKey of [momentKeys.detail(moment.id), momentKeys.photos(moment.id)]) {
        void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
      }
      void queryClient.invalidateQueries({ queryKey: momentKeys.list(moment.groupId) });
      void queryClient.invalidateQueries({ queryKey: momentKeys.open(moment.groupId) });
      // The photos stay in the group, no longer in a moment.
      void queryClient.invalidateQueries({ queryKey: ["photos"] });
    },
  });
}
