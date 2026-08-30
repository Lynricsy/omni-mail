import { AlertCircle } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, type DraftSummary } from '../../../shared/api'
import { errorMessage } from '../../../shared/api/errorMessage'
import { DraftList } from './DraftList'

export function DraftFolderContent({
  active,
  refreshRequest,
  selectedDraftId,
  onOpen,
  onCountChange,
}: {
  active: boolean
  refreshRequest: number
  selectedDraftId: string | null | undefined
  onOpen: (draftId: string | undefined) => void
  onCountChange: (count: number) => void
}) {
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  const [limit, setLimit] = useState(5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadDrafts = useCallback(async () => {
    setError('')
    try {
      const result = await api.drafts()
      setDrafts(result.drafts)
      setLimit(result.limit)
      onCountChange(result.drafts.length)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => {
    if (active) void loadDrafts()
  }, [active, loadDrafts, refreshRequest])

  async function deleteDraft(draft: DraftSummary) {
    await api.discardDraft(draft.id)
    if (selectedDraftId === draft.id) onOpen(undefined)
    await loadDrafts()
  }

  return <>
    {active && error && <p className="list-error" role="alert"><AlertCircle size={15} />{error}</p>}
    {active && <DraftList
      drafts={drafts}
      limit={limit}
      loading={loading}
      selectedId={selectedDraftId}
      onOpen={(draft) => onOpen(draft.id)}
      onDelete={deleteDraft}
    />}
  </>
}
