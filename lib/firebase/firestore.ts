import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from './config'

export type Enquiry = {
  id: string
  name: string
  email: string
  company: string
  projectType: string
  details: string
  status: 'new' | 'reviewing' | 'active' | 'closed'
  createdAt: Date
  userId: string | null
  assignedTo: string | null
}

export async function getClientEnquiries(userId: string): Promise<Enquiry[]> {
  const q = query(collection(db, 'enquiries'), where('userId', '==', userId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Enquiry))
}
