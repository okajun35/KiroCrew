/**
 * Folder listings merged into the whole-project tree payload.
 *
 * `GET /api/project/tree` caps folders and files together at 10,000 rows, so on
 * a project larger than that some folders are not rows at all, and the folders
 * the cut reached are named in `truncatedDirectories`. `?dir=<folder>` lists one
 * such folder on its own, under the same cap, with its paths still relative to
 * the project root. Merging that listing into the whole payload is what lets the
 * tree reach a folder past the cap: expanding a cut folder fetches its own
 * listing, and the merged payload is the one the tree renders.
 */

/** The payload fields a merge reads and writes; a subset of `api.projectTree`'s result. */
export interface TreePayload {
  root: string
  paths: string[]
  directories?: string[]
  repo: boolean
  truncated?: boolean
  truncatedDirectories?: string[]
  hiddenOnlyDirectories?: string[]
  unreadableDirectories?: string[]
  linkedDirectories?: string[]
}

/** One folder's listing: the payload plus the folder it lists. */
export interface FolderListing extends TreePayload {
  dir: string
}

/**
 * Most folder listings one tree mount keeps. Each holds up to the whole cap, so
 * an unbounded set would hand the tree an unbounded path list; past this the
 * oldest listing is dropped and its folder shows as cut again.
 */
export const MAX_FOLDER_LISTINGS = 20

const union = (...lists: Array<readonly string[] | undefined>): string[] => {
  const out = new Set<string>()
  for (const list of lists) for (const item of list ?? []) out.add(item)
  return [...out]
}

/**
 * The whole payload with every folder listing folded in.
 *
 * A listed folder is no longer cut by the whole listing's cap, so it leaves
 * `truncatedDirectories` -- unless its OWN listing is cut, which names it again
 * (its root marker comes back as the folder itself). Every other marker is a
 * union: a folder's listing only ever adds what the whole one could not reach.
 * A listing for another root (a stale one across a project switch) is ignored.
 */
export function mergeFolderListings(base: TreePayload, listings: readonly FolderListing[]): TreePayload {
  // A listing without `dir` is a gateway that predates `?dir=` answering with the
  // whole tree again: it adds nothing, so it is not merged.
  const own = listings.filter(listing => listing.root === base.root && typeof listing.dir === 'string' && listing.dir !== '')
  if (own.length === 0) return base
  const listed = new Set(own.map(listing => listing.dir))
  const truncatedDirectories = union(
    (base.truncatedDirectories ?? []).filter(dir => !listed.has(dir)),
    ...own.map(listing => listing.truncatedDirectories),
  ).sort()
  return {
    ...base,
    paths: union(base.paths, ...own.map(listing => listing.paths)),
    directories: union(base.directories, ...own.map(listing => [listing.dir, ...(listing.directories ?? [])])),
    truncated: truncatedDirectories.length > 0,
    truncatedDirectories,
    hiddenOnlyDirectories: union(base.hiddenOnlyDirectories, ...own.map(listing => listing.hiddenOnlyDirectories)),
    unreadableDirectories: union(base.unreadableDirectories, ...own.map(listing => listing.unreadableDirectories)),
    linkedDirectories: union(base.linkedDirectories, ...own.map(listing => listing.linkedDirectories)),
  }
}

/** *folders* with *folder* added last, oldest dropped past `MAX_FOLDER_LISTINGS`. */
export function withFolder(folders: readonly string[], folder: string): string[] {
  if (folders.includes(folder)) return [...folders]
  const next = [...folders, folder]
  return next.length > MAX_FOLDER_LISTINGS ? next.slice(next.length - MAX_FOLDER_LISTINGS) : next
}
