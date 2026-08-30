import { useCallback, useState } from 'react'
import type { MailboxAddress, MailboxScope } from '../../../shared/api'
import { ComposeDialog } from '../../compose/components/ComposeDialog'

export function useDraftEditor() {
  const [draftId, open] = useState<string | null | undefined>()
  const [instance, setInstance] = useState(0)
  const [refreshRequest, setRefreshRequest] = useState(0)
  const refresh = useCallback(() => setRefreshRequest((current) => current + 1), [])
  const close = useCallback(() => { open(undefined); refresh() }, [refresh])
  const openNew = useCallback(() => { open(null); setInstance((current) => current + 1) }, [])
  return { draftId, instance, refreshRequest, open, openNew, refresh, close }
}

export function DraftComposer({
  draftId,
  instance,
  inline,
  mailboxes,
  scope,
  onChanged,
  onClose,
  onSent,
}: {
  draftId: string | null | undefined
  instance: number
  inline: boolean
  mailboxes: MailboxAddress[]
  scope: MailboxScope
  onChanged: () => void
  onClose: () => void
  onSent: () => void
}) {
  if (draftId === undefined) return null
  const activeMailboxes = mailboxes.filter((mailbox) => mailbox.isActive)
  const initialMailbox = scope.type === 'mailbox'
    && activeMailboxes.some((mailbox) => mailbox.address === scope.value)
    ? scope.value
    : activeMailboxes.find((mailbox) => mailbox.isPrimary)?.address || activeMailboxes[0]?.address || ''
  return <ComposeDialog
    key={draftId ?? `new-${instance}`}
    mailboxes={activeMailboxes}
    initialMailbox={initialMailbox}
    draftId={draftId}
    presentation={inline ? 'inline' : 'modal'}
    onDraftChanged={onChanged}
    onClose={onClose}
    onSent={onSent}
  />
}
