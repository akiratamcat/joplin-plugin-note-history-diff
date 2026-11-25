import joplin from 'api';
import { REVISION_FIELDS, RevisionPage, RevisionPageFetcher } from './types';

// Data API pages are capped at 100 items.
const PAGE_LIMIT = 100;

// Reads revisions through Joplin's Data API. Kept apart from the rest of the
// history code, which does not depend on `api` and can be unit tested.
export const joplinRevisionFetcher: RevisionPageFetcher = async (page: number): Promise<RevisionPage> => {
	return await joplin.data.get(['revisions'], { fields: REVISION_FIELDS, limit: PAGE_LIMIT, page });
};
