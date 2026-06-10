import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callFn } from '@/lib/rpc';

// Family data flows through the `family` Appwrite Function.
// listFamily → { children, links, linked_athletes } (raw Appwrite documents).
export function useFamily(user) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['family', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const res = await callFn('family', { action: 'listFamily' });
      const normalize = (doc) => ({ ...doc, id: doc.$id, created_date: doc.$createdAt });
      const children = [
        ...(res?.children || []),
        ...(res?.linked_athletes || []),
      ].map(normalize);
      const links = (res?.links || []).map(normalize);
      return { children, links };
    },
  });

  const children = query.data?.children || [];
  const links = query.data?.links || [];
  const linkByAthleteId = {};
  for (const link of links) linkByAthleteId[link.athlete_id] = link;

  const childNamesById = {};
  for (const child of children) {
    childNamesById[child.id] = [child.first_name, child.last_name].filter(Boolean).join(' ');
  }

  return {
    children,
    links,
    linkByAthleteId,
    childNamesById,
    childIds: children.map((child) => child.id),
    loading: query.isLoading && !!user?.id,
    error: query.error,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['family'] }),
  };
}
