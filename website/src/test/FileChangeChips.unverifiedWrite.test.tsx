import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FileChangeChips, { type FileChangeEntry } from '../components/FileChangeChips'
import enManual from '../i18n/locales/en.manual.json'

/* A write tool reported `failed` and nothing recorded the file before it, so
 * the gateway keeps the path with no diff and `omitted_reason:
 * 'unverified_write'` (`file_changes.py::_failed_write_entries`). The card must
 * say exactly that: not the turn-budget sentence (the turn was not too large)
 * and not "no changes" (the file may have changed). */

const UNVERIFIED_SENTENCE = enManual.components.fileChangeChips.diff_unavailable_unverified_write
const TURN_BUDGET_SENTENCE = "This turn's changes were too large to keep every file's diff (over 400,000 characters total)."

const unverified = (path: string): FileChangeEntry => ({
  path, before: '', after: '', truncated: true, content_omitted: true, omitted_reason: 'unverified_write',
})
const budgetDemoted = (path: string): FileChangeEntry => ({
  path, before: '', after: '', truncated: true, content_omitted: true, turn_budget_chars: 400_000,
})

describe('FileChangeChips: a failed write whose earlier file is unknown', () => {
  it('says the diff is unavailable because the write failed, and nothing else', () => {
    const { container } = render(<FileChangeChips fileChanges={[unverified('/repo/a.py')]} />)
    expect(container.querySelector('[data-fcc-turn-notice]')).toHaveTextContent(UNVERIFIED_SENTENCE)
    expect(screen.getByText('File only')).toHaveAttribute('title', UNVERIFIED_SENTENCE)
    expect(screen.queryByText(/too large/)).not.toBeInTheDocument()
    expect(screen.queryByText('No changes')).not.toBeInTheDocument()
  })

  it('states the failed write and the turn budget as two reasons, each once', () => {
    const { container } = render(
      <FileChangeChips fileChanges={[unverified('/repo/a.py'), budgetDemoted('/repo/b.py')]} />,
    )
    const notices = [...container.querySelectorAll('[data-fcc-turn-notice]')].map(n => n.textContent)
    expect(notices).toEqual([UNVERIFIED_SENTENCE, TURN_BUDGET_SENTENCE])
  })

  it('says the reason once on the minimal pill row', () => {
    const { container } = render(
      <FileChangeChips fileChanges={[unverified('/repo/a.py'), unverified('/repo/b.py')]} style="minimal" />,
    )
    const notices = container.querySelectorAll('[data-fcc-turn-notice]')
    expect(notices).toHaveLength(1)
    expect(notices[0]).toHaveTextContent(UNVERIFIED_SENTENCE)
  })

  it('never implies the file is unchanged', () => {
    expect(UNVERIFIED_SENTENCE).not.toMatch(/unchanged|no change/i)
    expect(UNVERIFIED_SENTENCE).toMatch(/failed/)
  })
})
