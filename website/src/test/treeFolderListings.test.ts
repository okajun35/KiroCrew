/**
 * Folder listings folded into the whole-project tree payload: a folder
 * past the 10,000-row cap becomes reachable once its own listing is merged.
 */
import { describe, it, expect } from 'vitest'
import { MAX_FOLDER_LISTINGS, mergeFolderListings, withFolder, type TreePayload } from '../pierre/treeFolderListings'

const base: TreePayload = {
  root: '/p',
  paths: ['README.md', 'big/a.txt'],
  directories: ['big', 'small'],
  repo: false,
  truncated: true,
  truncatedDirectories: ['', 'big'],
  hiddenOnlyDirectories: [],
  unreadableDirectories: [],
  linkedDirectories: [],
}

describe('mergeFolderListings', () => {
  it('returns the payload itself when no folder is loaded', () => {
    expect(mergeFolderListings(base, [])).toBe(base)
  })

  it('adds the folder rows and files the cap hid and un-cuts the folder', () => {
    const merged = mergeFolderListings(base, [{
      root: '/p', dir: 'big', repo: false,
      paths: ['big/a.txt', 'big/late/deep.txt'],
      directories: ['big/late'],
      truncatedDirectories: [],
    }])
    expect(merged.paths).toEqual(['README.md', 'big/a.txt', 'big/late/deep.txt'])
    expect(merged.directories).toEqual(['big', 'small', 'big/late'])
    expect(merged.truncatedDirectories).toEqual([''])
    expect(merged.truncated).toBe(true)
  })

  it('keeps a folder cut when its own listing is cut too', () => {
    const merged = mergeFolderListings(base, [{
      root: '/p', dir: 'big', repo: false, paths: [], directories: ['big/x'], truncatedDirectories: ['big'],
    }])
    expect(merged.truncatedDirectories).toEqual(['', 'big'])
  })

  it('reports the tree whole once every cut folder is loaded whole', () => {
    const merged = mergeFolderListings({ ...base, truncatedDirectories: ['big'] }, [{
      root: '/p', dir: 'big', repo: false, paths: ['big/b.txt'], truncatedDirectories: [],
    }])
    expect(merged.truncated).toBe(false)
  })

  it('ignores a listing for another project root', () => {
    expect(mergeFolderListings(base, [{ root: '/other', dir: 'big', repo: false, paths: ['big/z'] }])).toBe(base)
  })
})

describe('withFolder', () => {
  it('adds once and drops the oldest past the bound', () => {
    expect(withFolder(['a'], 'a')).toEqual(['a'])
    let folders: string[] = []
    for (let i = 0; i <= MAX_FOLDER_LISTINGS; i++) folders = withFolder(folders, `f${i}`)
    expect(folders).toHaveLength(MAX_FOLDER_LISTINGS)
    expect(folders[0]).toBe('f1')
  })
})
