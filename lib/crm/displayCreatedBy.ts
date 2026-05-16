import { LEGACY_REF, type MemberRef } from '@/lib/orgMembers/memberRef'

interface MaybeAttributed {
  createdByRef?: MemberRef | null
  updatedByRef?: MemberRef | null
}

export function displayCreatedBy(record: MaybeAttributed): MemberRef {
  return record.createdByRef ?? LEGACY_REF
}

export function displayUpdatedBy(record: MaybeAttributed): MemberRef {
  return record.updatedByRef ?? record.createdByRef ?? LEGACY_REF
}
