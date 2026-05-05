import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

export interface AuditKeyword {
  keyword: string
  currentPosition: number | null
  currentImpressions: number
  currentClicks: number
}

export interface AuditReportProps {
  clientName: string
  siteUrl: string
  capturedAt: string
  sprintDay: number
  traffic: {
    impressions: number
    clicks: number
    ctr: number
    avgPosition: number
  }
  rankings: {
    top100: number
    top10: number
    top3: number
  }
  authority: {
    referringDomains: number
    totalBacklinks: number
  }
  content: {
    pagesIndexed: number
    postsPublished: number
    comparisonPagesLive: number
  }
  topKeywords: AuditKeyword[]
}

const BRAND = '#4F46E5'
const LIGHT = '#EEF2FF'
const GREY = '#6B7280'
const DARK = '#111827'

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: DARK, padding: 32 },
  header: {
    backgroundColor: BRAND,
    borderRadius: 6,
    padding: '12 16',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 16, color: '#fff', fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  headerSub: { fontSize: 9, color: '#C7D2FE' },
  headerRight: { alignItems: 'flex-end' },
  headerDay: { fontSize: 22, color: '#fff', fontFamily: 'Helvetica-Bold' },
  headerDayLabel: { fontSize: 8, color: '#C7D2FE' },

  sectionTitle: { fontSize: 8, color: GREY, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginTop: 14 },

  row: { flexDirection: 'row', gap: 8 },
  statCard: { flex: 1, backgroundColor: LIGHT, borderRadius: 4, padding: '8 10' },
  statValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: BRAND },
  statLabel: { fontSize: 7.5, color: GREY, marginTop: 2 },

  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 0 },
  badge: { flex: 1, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 4, padding: '7 10', alignItems: 'center' },
  badgeValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: DARK },
  badgeLabel: { fontSize: 7.5, color: GREY, marginTop: 1 },

  twoCol: { flexDirection: 'row', gap: 8 },
  infoBox: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 4, padding: '8 10' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  infoKey: { color: GREY, fontSize: 8 },
  infoVal: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: DARK },

  table: { marginTop: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: BRAND, borderRadius: '2 2 0 0', padding: '4 6' },
  tableRow: { flexDirection: 'row', padding: '3 6', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tableRowAlt: { flexDirection: 'row', padding: '3 6', backgroundColor: LIGHT, borderBottomWidth: 1, borderBottomColor: '#E0E7FF' },
  thKeyword: { width: '40%', color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  thNum: { flex: 1, color: '#fff', fontFamily: 'Helvetica-Bold', fontSize: 7.5, textAlign: 'right' },
  tdKeyword: { width: '40%', fontSize: 7.5 },
  tdNum: { flex: 1, fontSize: 7.5, textAlign: 'right', color: GREY },

  footer: { marginTop: 'auto', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: GREY },
})

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

function pct(n: number) {
  return (n * 100).toFixed(1) + '%'
}

export function AuditReportPDF(props: AuditReportProps) {
  const { clientName, siteUrl, capturedAt, sprintDay, traffic, rankings, authority, content, topKeywords } = props
  const date = new Date(capturedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Document title={`SEO Audit Report — ${clientName}`} author="Partners in Biz">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.headerTitle}>SEO Audit Report</Text>
            <Text style={s.headerSub}>{clientName}  ·  {siteUrl}</Text>
            <Text style={[s.headerSub, { marginTop: 4 }]}>{date}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerDay}>Day {sprintDay}</Text>
            <Text style={s.headerDayLabel}>of 90</Text>
          </View>
        </View>

        {/* Traffic */}
        <Text style={s.sectionTitle}>Traffic</Text>
        <View style={s.row}>
          <View style={s.statCard}><Text style={s.statValue}>{fmt(traffic.impressions)}</Text><Text style={s.statLabel}>Impressions</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{fmt(traffic.clicks)}</Text><Text style={s.statLabel}>Clicks</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{pct(traffic.ctr)}</Text><Text style={s.statLabel}>CTR</Text></View>
          <View style={s.statCard}><Text style={s.statValue}>{fmt(traffic.avgPosition, 1)}</Text><Text style={s.statLabel}>Avg Position</Text></View>
        </View>

        {/* Rankings */}
        <Text style={s.sectionTitle}>Rankings</Text>
        <View style={s.badgeRow}>
          <View style={s.badge}><Text style={s.badgeValue}>{rankings.top100}</Text><Text style={s.badgeLabel}>Top 100</Text></View>
          <View style={s.badge}><Text style={s.badgeValue}>{rankings.top10}</Text><Text style={s.badgeLabel}>Top 10</Text></View>
          <View style={s.badge}><Text style={s.badgeValue}>{rankings.top3}</Text><Text style={s.badgeLabel}>Top 3</Text></View>
        </View>

        {/* Authority + Content */}
        <Text style={s.sectionTitle}>Authority & Content</Text>
        <View style={s.twoCol}>
          <View style={s.infoBox}>
            <Text style={[s.infoKey, { fontFamily: 'Helvetica-Bold', marginBottom: 5 }]}>Authority</Text>
            <View style={s.infoRow}><Text style={s.infoKey}>Referring Domains</Text><Text style={s.infoVal}>{fmt(authority.referringDomains)}</Text></View>
            <View style={s.infoRow}><Text style={s.infoKey}>Total Backlinks</Text><Text style={s.infoVal}>{fmt(authority.totalBacklinks)}</Text></View>
          </View>
          <View style={s.infoBox}>
            <Text style={[s.infoKey, { fontFamily: 'Helvetica-Bold', marginBottom: 5 }]}>Content</Text>
            <View style={s.infoRow}><Text style={s.infoKey}>Pages Indexed</Text><Text style={s.infoVal}>{fmt(content.pagesIndexed)}</Text></View>
            <View style={s.infoRow}><Text style={s.infoKey}>Posts Published</Text><Text style={s.infoVal}>{fmt(content.postsPublished)}</Text></View>
            <View style={s.infoRow}><Text style={s.infoKey}>Comparison Pages Live</Text><Text style={s.infoVal}>{fmt(content.comparisonPagesLive)}</Text></View>
          </View>
        </View>

        {/* Keywords table */}
        {topKeywords.length > 0 && (
          <>
            <Text style={s.sectionTitle}>Top Keywords by Position</Text>
            <View style={s.table}>
              <View style={s.tableHeader}>
                <Text style={s.thKeyword}>Keyword</Text>
                <Text style={s.thNum}>Position</Text>
                <Text style={s.thNum}>Impressions</Text>
                <Text style={s.thNum}>Clicks</Text>
                <Text style={s.thNum}>CTR</Text>
              </View>
              {topKeywords.map((kw, i) => {
                const rowStyle = i % 2 === 0 ? s.tableRow : s.tableRowAlt
                const kwCtr = kw.currentImpressions > 0 ? kw.currentClicks / kw.currentImpressions : 0
                return (
                  <View key={i} style={rowStyle}>
                    <Text style={s.tdKeyword}>{kw.keyword}</Text>
                    <Text style={s.tdNum}>{kw.currentPosition != null ? fmt(kw.currentPosition, 1) : '—'}</Text>
                    <Text style={s.tdNum}>{fmt(kw.currentImpressions)}</Text>
                    <Text style={s.tdNum}>{fmt(kw.currentClicks)}</Text>
                    <Text style={s.tdNum}>{pct(kwCtr)}</Text>
                  </View>
                )
              })}
            </View>
          </>
        )}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>Partners in Biz — partnersinbiz.online</Text>
          <Text style={s.footerText}>Generated {date}</Text>
        </View>
      </Page>
    </Document>
  )
}
