import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import AdminUsers from './AdminUsers';
import AdminDataManagement from './AdminDataManagement';
import AdminAccounts from './AdminAccounts';
import AdminItemCatalog from './AdminItemCatalog';

const NAV = [
  { section: 'DASHBOARD' },
  { key: 'overview',  label: 'Count Cycle Details' },
  { key: 'todos',     label: 'Tasks' },
  { key: 'mycounts',  label: 'My Counts' },
  { key: 'reports',   label: 'Reports' },
  { section: 'SETTINGS' },
  { key: 'accounts',  label: 'Accounts' },
  { key: 'users',     label: 'Users' },
  { key: 'catalog',   label: 'Item Catalog' },
];

const STAT_CARDS = [
  { key: 'not_started', label: 'Not Started', cls: 'sc-red',   tc: 'c-red',   soft: 'sc-red-soft',   stc: 'c-red-soft'   },
  { key: 'in_progress', label: 'In Progress',  cls: 'sc-gold',  tc: 'c-gold',  soft: 'sc-gold-soft',  stc: 'c-gold-soft'  },
  { key: 'submitted',   label: 'Submitted',    cls: 'sc-blue',  tc: 'c-blue',  soft: 'sc-blue-soft',  stc: 'c-blue-soft'  },
  { key: 'approved',    label: 'Approved',     cls: 'sc-green', tc: 'c-green', soft: 'sc-green-soft', stc: 'c-green-soft' },
];

function Pill({ status }) {
  const map    = { not_started: 'pill-ns', in_progress: 'pill-ip', submitted: 'pill-sub', approved: 'pill-app' };
  const labels = { not_started: 'Not Started', in_progress: 'In Progress', submitted: 'Submitted', approved: 'Approved' };
  return <span className={'pill ' + (map[status] || 'pill-ns')}>{labels[status] || status}</span>;
}

function MyCounts({ cycle, profile, navigate }) {
  const [counts, setCounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cycle || !profile?.id) { setLoading(false); return; }
    supabase
      .from('inventory_counts')
      .select('id, status, account:accounts(id, name, region:regions(name))')
      .eq('cycle_id', cycle.id)
      .eq('rep_id', profile.id)
      .then(({ data }) => { setCounts(data || []); setLoading(false); });
  }, [cycle, profile]);

  if (loading) return <div className="loading-center"><div className="spinner" /></div>;

  const total     = counts.length;
  const stats = {
    not_started: counts.filter(c => c.status === 'not_started').length,
    in_progress:  counts.filter(c => c.status === 'in_progress').length,
    submitted:    counts.filter(c => c.status === 'submitted').length,
    approved:     counts.filter(c => c.status === 'approved').length,
  };
  const pct = total > 0 ? Math.round((stats.submitted + stats.approved) / total * 100) : 0;
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const needAttention = counts.filter(c => c.status === 'not_started' || c.status === 'in_progress').length;

  const statusColor = { not_started: 'var(--red)', in_progress: 'var(--amber)', submitted: 'var(--blue)', approved: 'var(--green)' };
  const statusLabel = { not_started: 'Not Started', in_progress: 'In Progress', submitted: 'Submitted', approved: 'Approved' };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{greeting}, {firstName}</div>
        <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>
          {needAttention > 0 ? needAttention + ' account' + (needAttention !== 1 ? 's' : '') + ' still need your attention' : 'All counts are up to date!'}
        </div>
      </div>

      {cycle ? (
        <div className="cycle-hero" style={{ marginBottom: 24 }}>
          <div className="hero-top">
            <div>
              <div className="hero-title">{cycle.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="hero-pct">{pct}%</div>
              <div className="hero-pct-lbl">COMPLETE</div>
            </div>
          </div>
          <div className="hero-stats">
            {STAT_CARDS.map(s => (
              <div key={s.key} className={'stat-card hero-stat-card ' + s.cls}>
                <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', position:'relative', zIndex:1 }}>
                  <div>
                    <div className={'sc-num ' + s.tc}>{stats[s.key]}</div>
                    <div className={'sc-lbl ' + s.tc}>{s.label}</div>
                  </div>
                  <div className={'sc-sub ' + s.tc} style={{ fontSize:22, fontWeight:800, lineHeight:1, opacity:0.85 }}>{total > 0 ? Math.round(stats[s.key] / total * 100) : 0}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 24, marginBottom: 24, color: 'var(--text-dim)', fontStyle: 'italic' }}>No active count cycle.</div>
      )}

      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 14 }}>Your Accounts</div>
      {counts.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)' }}>No accounts assigned to you for this cycle.</div>
      ) : counts.map(c => (
        <div key={c.id} className="card" style={{ marginBottom: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderLeft: '4px solid ' + (statusColor[c.status] || 'var(--border)') }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{c.account?.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{c.account?.region?.name}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: statusColor[c.status], marginTop: 3 }}>{statusLabel[c.status]}</div>
          </div>
          {(c.status === 'not_started' || c.status === 'in_progress') && (
            <button className="btn btn-primary" onClick={() => navigate('/count/' + c.id)}>Enter Count</button>
          )}
          {c.status === 'submitted' && (
            <button className="btn btn-outline" onClick={() => navigate('/count/' + c.id)}>View Count</button>
          )}
          {c.status === 'approved' && (
            <button className="btn btn-outline" onClick={() => navigate('/count/' + c.id)}>View Count</button>
          )}
        </div>
      ))}
    </div>
  );
}

function TodoSection({ todos, onComplete, onApproveEdit, onDenyEdit, onApproveCount, onRejectCount }) {
  const [reviewModal, setReviewModal] = useState(null);
  const [denyReason, setDenyReason]       = useState('');
  const [rejectReason, setRejectReason]   = useState('');
  
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [showDenyBox, setShowDenyBox]     = useState(false);
  const [countItems, setCountItems]     = useState([]);
  const [countMeta, setCountMeta] = useState({});
  const [countLoading, setCountLoading] = useState(false);

  const editRequests   = todos.filter(t => t.todo_type === 'edit_request');
  const countApprovals = todos.filter(t => t.todo_type === 'count_approval');
  const closureFlags   = todos.filter(t => t.todo_type === 'account_closure');
  const general        = todos.filter(t => !t.todo_type || t.todo_type === 'general');

  function parseMeta(t) { try { return JSON.parse(t.metadata || '{}'); } catch { return {}; } }

  async function openReview(todo) {
    setReviewModal(todo);
    setDenyReason(''); setShowDenyBox(false);
    setRejectReason(''); setShowRejectBox(false);
    setCountItems([]); setCountMeta({});
    if (todo.todo_type === 'count_approval' && todo.count_id) {
      setCountLoading(true);
      const [{ data: items }, { data: countData }] = await Promise.all([
        supabase
          .from('count_line_items')
          .select('id, item_number_raw, description_raw, vendor_raw, quantity, not_in_catalog, is_new_item')
          .eq('inventory_count_id', todo.count_id)
          .order('item_number_raw'),
        supabase
          .from('inventory_counts')
          .select('submitted_at, rep_id, account:accounts(name, region:regions(name)), rep:profiles(full_name)')
          .eq('id', todo.count_id)
          .single(),
      ]);
      setCountItems(items || []);
      setCountMeta({
        submittedAt: countData?.submitted_at || null,
        accountName: countData?.account?.name || null,
        repName: countData?.rep?.full_name || null,
        region: countData?.account?.region?.name || null,
        repId: countData?.rep_id || null,
      });
      setCountLoading(false);
    }
  }
  function closeModal() {
    setReviewModal(null); setCountMeta({});
    setDenyReason(''); setShowDenyBox(false);
    setRejectReason(''); setShowRejectBox(false);
    setCountItems([]);
  }

  function TodoCard({ title, count, children, emptyMsg }) {
    return (
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid var(--border)', marginBottom: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: count > 0 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{title}</div>
          <span style={{ background: count > 0 ? '#EF4444' : '#E2E8F0', color: count > 0 ? 'white' : 'var(--text-dim)', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 10 }}>{count}</span>
        </div>
        {count === 0
          ? <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)', fontStyle: 'italic', fontSize: 13 }}>{emptyMsg || 'No items pending.'}</div>
          : children}
      </div>
    );
  }

  function ReviewBtn({ todo }) {
    return (
      <button onClick={() => openReview(todo)}
        style={{ background: 'var(--blue-action)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        Review
      </button>
    );
  }

  const meta = reviewModal ? parseMeta(reviewModal) : {};
  const zeroQty = countItems.filter(i => (i.quantity || 0) === 0).length;

  return (
    <div>
      <TodoCard title="Edit Requests" count={editRequests.length} emptyMsg="No edit requests pending.">
        {editRequests.map(t => {
          const m = parseMeta(t);
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{m.account_name || t.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>{m.rep_name} &middot; {m.region}</div>
                {m.reason && <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 3 }}>Reason: <strong>{m.reason.replace(/_/g,' ')}</strong></div>}
              </div>
              <ReviewBtn todo={t} />
            </div>
          );
        })}
      </TodoCard>

      <TodoCard title="Count Review" count={countApprovals.length} emptyMsg="No counts awaiting review.">
        {countApprovals.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{t.title?.replace('Count to approve: ', '')}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>{t.description}</div>
            </div>
            <ReviewBtn todo={t} />
          </div>
        ))}
      </TodoCard>

      <TodoCard title="Closure Review" count={closureFlags.length} emptyMsg="No closure flags pending.">
        {closureFlags.map(t => {
          const m = parseMeta(t);
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{m.account_name || t.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>Rep: {m.rep_name} &middot; Reason: {m.reason?.replace(/_/g,' ')}</div>
                {m.notes && <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 3 }}>{m.notes}</div>}
              </div>
              <ReviewBtn todo={t} />
            </div>
          );
        })}
      </TodoCard>

      <TodoCard title="General Tasks" count={general.length} emptyMsg="No general tasks pending.">
        {general.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{t.title}</div>
              {t.description && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>{t.description}</div>}
            </div>
            <ReviewBtn todo={t} />
          </div>
        ))}
      </TodoCard>

      {reviewModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{
            maxWidth: reviewModal.todo_type === 'count_approval' ? 780 : 520,
            width: '95vw',
            height: reviewModal.todo_type === 'count_approval' ? '92vh' : 'auto',
            maxHeight: '92vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}>

            {/* HEADER â€” fixed, never scrolls */}
            <div style={{ background: 'linear-gradient(135deg, #1565C0, #0D47A1)', padding: '22px 24px', flexShrink: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
                {reviewModal.todo_type === 'edit_request'    && 'Edit Request'}
                {reviewModal.todo_type === 'count_approval'  && 'Count Review'}
                {reviewModal.todo_type === 'account_closure' && 'Closure Review'}
                {(!reviewModal.todo_type || reviewModal.todo_type === 'general') && 'General Task'}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 10 }}>
                {reviewModal.todo_type === 'count_approval'
                  ? (countMeta.accountName || reviewModal.title?.replace('Count to approve: ', ''))
                  : (meta.account_name || reviewModal.title)}
                {reviewModal.todo_type === 'count_approval' && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: '#DCFCE7', color: '#15803D', padding: '3px 8px', borderRadius: 6 }}>Submitted</span>
                )}
              </div>
              {reviewModal.todo_type === 'count_approval'
                ? <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                    {'Submitted by ' + (countMeta.repName || (reviewModal.description || '').replace(/^Rep /, '').split(' submitted')[0] || 'Unknown') + (countMeta.region ? '  |  ' + countMeta.region : '') + (countMeta.submittedAt ? '  |  ' + new Date(countMeta.submittedAt).toLocaleDateString() : '')}
                  </div>
                : meta.rep_name && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{'Submitted by ' + meta.rep_name + (meta.region ? '  |  ' + meta.region : '')}</div>
              }
            </div>

            {/* COUNT APPROVAL LAYOUT */}
            {reviewModal.todo_type === 'count_approval' && (
              <>
                {/* STAT BAR â€” fixed */}
                <div style={{ display: 'flex', background: '#F7F9FC', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  {[
                    { label: 'Total Items',    value: countLoading ? '...' : String(countItems.length) },
                    { label: 'Items Counted',  value: countLoading ? '...' : String(countItems.filter(i => (i.quantity || 0) > 0).length) },
                    { label: 'Zero Qty',       value: countLoading ? '...' : String(zeroQty), red: zeroQty > 0 },
                    { label: 'Submitted', value: countMeta.submittedAt ? new Date(countMeta.submittedAt).toLocaleDateString() + ' ' + new Date(countMeta.submittedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : (countLoading ? '...' : '--') },
                  ].map(s => (
                    <div key={s.label} style={{ flex: 1, padding: '12px 16px', borderRight: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)' }}>{s.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: s.red ? '#EF4444' : 'var(--text)', marginTop: 2 }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* ITEM TABLE â€” scrollable, takes all remaining space */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 10 }}>Count Details</div>
                  {countLoading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>Loading count data...</div>
                  ) : countItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)', fontStyle: 'italic' }}>No items found for this count.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                        <tr style={{ background: '#F7F9FC' }}>
                          <th style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Item #</th>
                          <th style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Description</th>
                          <th style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Vendor</th>
                          <th style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {countItems.map((item, idx) => {
                          const isManual = item.not_in_catalog === true;
                          return (
                            <tr key={item.id} style={{ background: isManual ? '#FFF5F5' : idx % 2 === 0 ? 'white' : '#F7F9FC' }}>
                              <td style={{ padding: '9px 10px', fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: isManual ? '#DC2626' : 'var(--blue-action)', borderBottom: '1px solid #F1F5F9', whiteSpace: 'nowrap' }}>
                                {item.item_number_raw}
                                {isManual && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '1px 5px', borderRadius: 4, letterSpacing: 0.5 }}>MANUAL</span>}
                              </td>
                              <td style={{ padding: '9px 10px', fontSize: 13, color: isManual ? '#DC2626' : 'var(--text)', borderBottom: '1px solid #F1F5F9' }}>{item.description_raw}</td>
                              <td style={{ padding: '9px 10px', fontSize: 13, color: 'var(--text-mid)', borderBottom: '1px solid #F1F5F9' }}>{item.vendor_raw || '--'}</td>
                              <td style={{ padding: '9px 10px', fontSize: 13, fontWeight: 700, textAlign: 'right', color: (item.quantity || 0) === 0 ? '#EF4444' : 'var(--text)', borderBottom: '1px solid #F1F5F9' }}>{item.quantity ?? 0}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {!countLoading && countItems.some(i => i.not_in_catalog === true) && (
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '1px 5px', borderRadius: 4, letterSpacing: 0.5 }}>MANUAL</span>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Item was manually entered and does not match a catalog item number.</span>
                    </div>
                  )}
                </div>

                {/* REJECTION NOTES â€” always visible, fixed at bottom */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #E2E8F0', background: '#F8FAFC', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 8 }}>Rejection Notes (optional) â€” sent to rep if rejected</div>
                  <textarea
                    className="form-ta"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Add notes for the rep explaining what needs to be corrected before resubmitting..."
                    style={{ width: '100%', boxSizing: 'border-box', minHeight: 72, resize: 'vertical' }}
                  />
                </div>

                {/* ACTIONS */}
                <div className="modal-actions" style={{ flexShrink: 0 }}>
                  <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
                  <button className="btn btn-danger" onClick={() => { onRejectCount(reviewModal, rejectReason, countMeta); closeModal(); }}>Reject Count</button>
                  <button className="btn btn-primary" style={{ background: '#16A34A' }} onClick={() => { onApproveCount(reviewModal.count_id); onComplete(reviewModal.id); closeModal(); }}>Approve Count</button>
                </div>
              </>
            )}

            {/* ALL OTHER MODAL TYPES */}
            {reviewModal.todo_type === 'edit_request' && (
              <div className="modal-body">
                {meta.reason && <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', minWidth: 80, paddingTop: 2 }}>Reason</div><div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{meta.reason.replace(/_/g,' ')}</div></div>}
                {meta.urgency && <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', minWidth: 80, paddingTop: 2 }}>Urgency</div><div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{meta.urgency}</div></div>}
                {meta.details && <div style={{ marginBottom: 14 }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 8 }}>Rep's Explanation</div><div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6 }}>{meta.details}</div></div>}
                {showDenyBox && <div style={{ marginTop: 12 }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 8 }}>Reason for Denial</div><textarea className="form-ta" value={denyReason} onChange={e => setDenyReason(e.target.value)} placeholder="Explain why this request is being denied..." /></div>}
              </div>
            )}
            {reviewModal.todo_type === 'account_closure' && (
              <div className="modal-body">
                {meta.reason && <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', minWidth: 80, paddingTop: 2 }}>Reason</div><div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{meta.reason.replace(/_/g,' ')}</div></div>}
                {meta.notes && <div><div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 8 }}>Notes</div><div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.6 }}>{meta.notes}</div></div>}
              </div>
            )}
            {(!reviewModal.todo_type || reviewModal.todo_type === 'general') && (
              <div className="modal-body">
                <div style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.7 }}>{reviewModal.description || 'No additional details provided.'}</div>
              </div>
            )}

            {/* Actions for non-count modals */}
            {reviewModal.todo_type !== 'count_approval' && (
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
                {reviewModal.todo_type === 'edit_request' && (
                  showDenyBox ? (
                    <><button className="btn btn-outline" onClick={() => setShowDenyBox(false)}>Back</button><button className="btn btn-danger" onClick={() => { onDenyEdit(reviewModal, denyReason); closeModal(); }}>Confirm Denial</button></>
                  ) : (
                    <><button className="btn btn-danger" onClick={() => setShowDenyBox(true)}>Deny Request</button><button className="btn btn-primary" onClick={() => { onApproveEdit(reviewModal); closeModal(); }}>Approve &amp; Reopen</button></>
                  )
                )}
                {reviewModal.todo_type === 'account_closure' && <button className="btn btn-primary" onClick={() => { onComplete(reviewModal.id); closeModal(); }}>Mark Reviewed</button>}
                {(!reviewModal.todo_type || reviewModal.todo_type === 'general') && <button className="btn btn-primary" onClick={() => { onComplete(reviewModal.id); closeModal(); }}>Mark Complete</button>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


export default function AdminDashboard() {
  const { profile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [tab, setTab]               = useState('overview');
  const [cycle, setCycle]           = useState(null);
  const [progress, setProgress]     = useState([]);
  const [todos, setTodos]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [progressFilter, setProgressFilter] = useState('all');
  const [cycleForm, setCycleForm]   = useState({ name: '', quarter: 'Q1', year: new Date().getFullYear() });
  const [collapsedRegions, setCollapsedRegions] = useState({});

  useEffect(() => { loadData(); }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  async function loadData() {
    setLoading(true);
    const [{ data: cycleData }, { data: todoData }] = await Promise.all([
      supabase.from('count_cycles').select('*').eq('status', 'open').single(),
      supabase.from('todos').select('*').eq('is_complete', false).order('created_at', { ascending: false }),
    ]);
    setCycle(cycleData);
    setTodos(todoData || []);

    if (cycleData) {
      const { data: counts } = await supabase
        .from('inventory_counts')
        .select('id, status, submitted_at, approved_at, rep_id, account:accounts(id, name, region:regions(name))')
        .eq('cycle_id', cycleData.id)
        .order('status').limit(500);
      const { data: reps } = await supabase.from('profiles').select('id, full_name');
      const { data: acctReps } = await supabase.from('account_reps').select('account_id, rep_id');
      const repMap = {};
      for (const r of reps || []) repMap[r.id] = r;
      const acctRepsMap = {};
      for (const ar of acctReps || []) {
        if (!acctRepsMap[ar.account_id]) acctRepsMap[ar.account_id] = [];
        acctRepsMap[ar.account_id].push(repMap[ar.rep_id]);
      }
      setProgress((counts || []).map(c => ({ ...c, rep: c.rep_id ? repMap[c.rep_id] : null, allReps: acctRepsMap[c.account?.id] || [] })));
      // Default all regions to collapsed
      const regionNames = [...new Set((counts || []).map(c => c.account?.region?.name || 'Unassigned'))];
      setCollapsedRegions(Object.fromEntries(regionNames.map(r => [r, true])));
    }
    setLoading(false);
  }

  async function openCycle() {
    if (!cycleForm.name) { toast.error('Enter a cycle name'); return; }
    const { data: newCycle, error } = await supabase.from('count_cycles').insert({
      name: cycleForm.name, quarter: cycleForm.quarter, year: cycleForm.year,
      status: 'open', opened_at: new Date().toISOString(),
    }).select().single();
    if (error) { toast.error('Error: ' + error.message); return; }
    toast.info('Cycle "' + cycleForm.name + '" created -- populating counts...');
    const { data: accounts } = await supabase.from('accounts').select('id, name, assigned_rep_id').eq('is_active', true);
    if (!accounts?.length) { toast.warning('No active accounts found.'); loadData(); return; }
    for (let i = 0; i < accounts.length; i += 100) {
      const batch = accounts.slice(i, i + 100).map(a => ({ cycle_id: newCycle.id, account_id: a.id, rep_id: a.assigned_rep_id || null, status: 'not_started' }));
      await supabase.from('inventory_counts').insert(batch);
    }
    toast.success('Cycle "' + cycleForm.name + '" opened!');
    loadData();
  }

  async function closeCycle() {
    if (!window.confirm('Close cycle "' + cycle?.name + '"? Reps will no longer be able to submit.')) return;
    await supabase.from('count_cycles').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', cycle.id);
    toast.success('Count cycle closed.');
    setCycle(null); setProgress([]); loadData();
  }

  async function approveCount(countId) {
    const { data: countData } = await supabase.from('inventory_counts').select('rep_id, account:accounts(name)').eq('id', countId).single();
    await supabase.from('inventory_counts').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', countId);
    setProgress(prev => prev.map(p => p.id === countId ? { ...p, status: 'approved' } : p));
    if (countData?.rep_id) {
      await supabase.from('alerts').insert({ alert_type: 'count_approved', title: 'Count Approved', message: 'Your count for ' + (countData.account?.name || '') + ' has been approved!', is_read: false, rep_id: countData.rep_id, inventory_count_id: countId });
    }
    toast.success('Count approved!');
  }

  async function rejectCount(todo, reason, countMeta) {
    const countId = todo.count_id;
    const repId = countMeta?.repId || todo._repId;
    const accountName = countMeta?.accountName || todo.title?.replace('Count to approve: ', '') || '';
    await supabase.from('inventory_counts').update({ status: 'in_progress' }).eq('id', countId);
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todo.id);
    if (repId) {
      // Alert -- shows as a notification on the rep's dashboard
      await supabase.from('alerts').insert({
        alert_type: 'count_rejected',
        title: 'Count Rejected \u2014 Action Required',
        message: 'Your count for ' + accountName + ' was rejected and needs corrections.' + (reason ? ' Reason: ' + reason : ''),
        is_read: false,
        rep_id: repId,
        inventory_count_id: countId,
      });
      // Rep-facing todo task so they must acknowledge and resubmit
      await supabase.from('todos').insert({
        title: 'Resubmit count: ' + accountName,
        description: 'Your count was rejected.' + (reason ? ' Reason: ' + reason : '') + ' Please make corrections and resubmit.',
        priority: 'high',
        todo_type: 'resubmit_required',
        account_id: todo.account_id,
        count_id: countId,
        rep_id: repId,
        is_complete: false,
      });
    }
    setProgress(prev => prev.map(p => p.id === countId ? { ...p, status: 'in_progress' } : p));
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    toast.info('Count rejected \u2014 rep has been notified.');
  }

  async function completeTodo(todoId) {
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todoId);
    setTodos(prev => prev.filter(t => t.id !== todoId));
    toast.success('Task marked complete!');
  }

  async function approveEditRequest(todo) {
    let meta = {}; try { meta = JSON.parse(todo.metadata || '{}'); } catch {}
    if (todo.count_id) await supabase.from('inventory_counts').update({ status: 'in_progress' }).eq('id', todo.count_id);
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todo.id);
    const { data: countData } = await supabase.from('inventory_counts').select('rep_id').eq('id', todo.count_id).single();
    await supabase.from('alerts').insert({ alert_type: 'edit_approved', title: 'Edit Request Approved', message: 'Your request to reopen ' + (meta.account_name || '') + ' has been approved.', is_read: false, rep_id: countData?.rep_id, inventory_count_id: todo.count_id });
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    toast.success('Edit request approved!');
    loadData();
  }

  async function denyEditRequest(todo, reason) {
    let meta = {}; try { meta = JSON.parse(todo.metadata || '{}'); } catch {}
    await supabase.from('todos').update({ is_complete: true, completed_at: new Date().toISOString() }).eq('id', todo.id);
    const { data: countData } = await supabase.from('inventory_counts').select('rep_id').eq('id', todo.count_id).single();
    await supabase.from('alerts').insert({ alert_type: 'edit_denied', title: 'Edit Request Denied', message: 'Your request to reopen ' + (meta.account_name || '') + ' was denied.' + (reason ? ' Reason: ' + reason : ''), is_read: false, rep_id: countData?.rep_id, inventory_count_id: todo.count_id });
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    toast.info('Edit request denied.');
  }

  function toggleRegion(rName) {
    setCollapsedRegions(prev => ({ ...prev, [rName]: !prev[rName] }));
  }

  const stats = {
    not_started: progress.filter(p => p.status === 'not_started').length,
    in_progress:  progress.filter(p => p.status === 'in_progress').length,
    submitted:    progress.filter(p => p.status === 'submitted').length,
    approved:     progress.filter(p => p.status === 'approved').length,
  };
  const total = progress.length;
  const pct   = total > 0 ? Math.round((stats.submitted + stats.approved) / total * 100) : 0;

  const filteredProgress = progressFilter === 'all' ? progress : progress.filter(p => p.status === progressFilter);
  const regionMap = {};
  filteredProgress.forEach(p => {
    const rName = p.account?.region?.name || 'Unassigned';
    if (!regionMap[rName]) regionMap[rName] = [];
    regionMap[rName].push(p);
  });

  const pageTitle = NAV.find(n => n.key === tab)?.label || 'Dashboard';

  if (loading) return (
    <div className="app-shell">
      <div className="sidebar" />
      <div className="main-col" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="loading-center"><div className="spinner" /><span>Loading...</span></div>
      </div>
    </div>
  );

  return (
    <div className="app-shell">
      {/* SIDEBAR */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-text"><span>Med</span><span>Ex</span></div>
          <div className="logo-sub">Inventory Count System</div>
        </div>

        {NAV.map((item, i) => {
          if (item.section) return (
            <div key={i} className="nav-section">
              <div className="nav-section-label">{item.section}</div>
            </div>
          );
          return (
            <div key={item.key} style={{ padding: '0 12px 2px' }}>
              <div className={'nav-item' + (tab === item.key ? ' active' : '')} onClick={() => setTab(item.key)}>
                <div className="nav-dot" />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.key === 'todos' && todos.length > 0 && (
                  <span style={{ background: '#EF4444', color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>{todos.length}</span>
                )}
              </div>
            </div>
          );
        })}

        <div className="sidebar-bottom">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="user-name">{profile?.full_name}</div>
              <div className="user-role">Administrator</div>
            </div>
            <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit' }}>
              Sign Out
            </button>
          </div>
        </div>
        <div className="sidebar-accent-bar" />
      </nav>

      {/* MAIN */}
      <div className="main-col">
        <div className="topbar">
          <div>
            <h1>{pageTitle}</h1>
            <p>
              {tab === 'overview'  && (cycle ? cycle.name + ' \u2014 ' + total + ' accounts' : 'No active cycle')}
              {tab === 'todos'     && todos.length + ' pending task' + (todos.length !== 1 ? 's' : '')}
              {tab === 'mycounts'  && 'Your assigned accounts for the active cycle'}
              {tab === 'reports'   && 'Export count data'}
              {tab === 'accounts'  && 'Manage account assignments'}
              {tab === 'users'     && 'Manage rep accounts'}
              {tab === 'catalog'   && 'Manage inventory items'}
            </p>
          </div>
          {tab === 'overview' && cycle && (
            <button className="btn btn-danger" onClick={closeCycle}>Close Cycle</button>
          )}
        </div>

        <div className="content-area">

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <>
              {!cycle ? (
                <div className="card" style={{ maxWidth: 560 }}>
                  <div className="card-head">
                    <div>
                      <div className="card-head-title">Open a Count Cycle</div>
                      <div className="card-head-sub">No active cycle \u2014 create one to begin</div>
                    </div>
                  </div>
                  <div className="card-body">
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <label className="input-label">Cycle Name</label>
                        <input className="input" style={{ width: 180 }} value={cycleForm.name} onChange={e => setCycleForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Q1 2026" />
                      </div>
                      <div>
                        <label className="input-label">Quarter</label>
                        <select className="select" value={cycleForm.quarter} onChange={e => setCycleForm(p => ({ ...p, quarter: e.target.value }))}>
                          <option>Q1</option><option>Q2</option><option>Q3</option><option>Q4</option>
                        </select>
                      </div>
                      <div>
                        <label className="input-label">Year</label>
                        <input className="input" type="number" style={{ width: 100 }} value={cycleForm.year} onChange={e => setCycleForm(p => ({ ...p, year: parseInt(e.target.value) }))} />
                      </div>
                      <button className="btn btn-primary" onClick={openCycle}>Open Cycle</button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Hero card */}
                  <div className="cycle-hero">
                    <div className="hero-top">
                      <div>
                        <div className="hero-title">{cycle.name} Count Cycle</div>
                        <div className="hero-meta">Opened {new Date(cycle.opened_at).toLocaleDateString()} &middot; {total} accounts total</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="hero-pct">{pct}%</div>
                        <div className="hero-pct-lbl">COMPLETE</div>
                      </div>
                    </div>
                    <div className="hero-stats">
                      {STAT_CARDS.map(s => (
                        <div key={s.key}
                          className={'stat-card hero-stat-card ' + s.cls}
                          style={{ outline: progressFilter === s.key ? '2.5px solid white' : 'none', outlineOffset: 2 }}
                          onClick={() => setProgressFilter(f => f === s.key ? 'all' : s.key)}>
                          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', position:'relative', zIndex:1 }}>
                            <div>
                              <div className={'sc-num ' + s.tc}>{stats[s.key]}</div>
                              <div className={'sc-lbl ' + s.tc}>{s.label}</div>
                            </div>
                            <div className={'sc-sub ' + s.tc} style={{ fontSize:22, fontWeight:800, lineHeight:1, opacity:0.85 }}>{total > 0 ? Math.round(stats[s.key] / total * 100) : 0}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Region blocks */}
                  {Object.keys(regionMap).sort().map(rName => {
                    const counts = regionMap[rName];
                    const allForRegion = progress.filter(p => (p.account?.region?.name || 'Unassigned') === rName);
                    const rTotal     = allForRegion.length;
                    const rApproved  = allForRegion.filter(p => p.status === 'approved').length;
                    const rSubmitted = allForRegion.filter(p => p.status === 'submitted').length;
                    const rPct       = rTotal > 0 ? Math.round((rApproved + rSubmitted) / rTotal * 100) : 0;
                    const progColor  = rPct === 100 ? '#16A34A' : '#1565C0';
                    const isCollapsed = collapsedRegions[rName];
                    const rStats = {
                      not_started: allForRegion.filter(p => p.status === 'not_started').length,
                      in_progress:  allForRegion.filter(p => p.status === 'in_progress').length,
                      submitted:    allForRegion.filter(p => p.status === 'submitted').length,
                      approved:     allForRegion.filter(p => p.status === 'approved').length,
                    };

                    return (
                      <div key={rName} className="region-block">
                        {/* Clickable region header */}
                        <div className="region-header" onClick={() => toggleRegion(rName)} style={{ cursor: 'pointer' }}>
                          {/* Top row: region name | centered stats | pct + chevron */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            {/* Left: region name + account count */}
                            <div style={{ minWidth: 140 }}>
                              <div className="region-name" style={{ fontSize: 22 }}>{rName}</div>
                              <div style={{ fontSize: 12, color: '#4a6a8a', marginTop: 3, fontWeight: 500 }}>{rTotal} account{rTotal !== 1 ? 's' : ''}</div>
                            </div>
                            {/* Center: stat cards fill all available space equally */}
                            <div style={{ display: 'flex', gap: 8, flex: 1, margin: '0 16px' }}>
                              {STAT_CARDS.map(s => (
                                <div key={s.key} className={'stat-card ' + s.soft} style={{ padding: '8px 10px', flex: '1 1 0' }}>
                                  <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', position:'relative', zIndex:1 }}>
                                    <div>
                                      <div className={'sc-num ' + s.stc} style={{ fontSize:22, letterSpacing:'-0.5px' }}>{rStats[s.key]}</div>
                                      <div className={'sc-lbl ' + s.stc} style={{ fontSize:9 }}>{s.label}</div>
                                    </div>
                                    <div className={'sc-sub ' + s.stc} style={{ fontSize:16, fontWeight:800, lineHeight:1, opacity:0.85 }}>{rTotal > 0 ? Math.round(rStats[s.key] / rTotal * 100) : 0}%</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {/* Right: pct + chevron */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 90, justifyContent: 'flex-end' }}>
                              <div style={{ textAlign: 'right' }}>
                                <div className="region-pct-num">{rPct}%</div>
                                <div className="region-pct-lbl">Complete</div>
                              </div>
                              <div style={{ fontSize: 16, color: '#1a3a5c', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>&#9660;</div>
                            </div>
                          </div>
                        </div>

                        {/* Collapsible table */}
                        {!isCollapsed && (
                          <div className="region-detail">
                            <table>
                              <thead>
                                <tr><th>Account</th><th>Rep(s)</th><th>Status</th><th>Submitted</th><th>Actions</th></tr>
                              </thead>
                              <tbody>
                                {counts.map(p => (
                                  <tr key={p.id}>
                                    <td style={{ fontWeight: 700 }}>{p.account?.name}</td>
                                    <td>
                                      {p.allReps?.length > 0
                                        ? p.allReps.filter(Boolean).map(r => <span key={r.id} className="rep-tag">{r.full_name}</span>)
                                        : <span style={{ color: 'var(--red)', fontSize: 12 }}>Unassigned</span>}
                                    </td>
                                    <td><Pill status={p.status} /></td>
                                    <td style={{ color: 'var(--text-dim)' }}>{p.submitted_at ? new Date(p.submitted_at).toLocaleDateString() : '\u2014'}</td>
                                    <td>
                                      {p.status === 'submitted'    && <button className="tbl-btn" onClick={e => { e.stopPropagation(); approveCount(p.id); }}>Approve</button>}
                                      {(p.status === 'not_started' || p.status === 'in_progress') && <button className="tbl-btn" onClick={e => { e.stopPropagation(); navigate('/count/' + p.id); }}>Enter Count</button>}
                                      {p.status === 'approved'     && <button className="tbl-btn" onClick={e => { e.stopPropagation(); navigate('/count/' + p.id); }}>View Count</button>}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {progressFilter !== 'all' && (
                    <div style={{ textAlign: 'center', marginTop: 12 }}>
                      <button className="btn btn-outline" onClick={() => setProgressFilter('all')}>Clear Filter \u2014 Show All</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {tab === 'todos'    && <TodoSection todos={todos} onComplete={completeTodo} onApproveEdit={approveEditRequest} onDenyEdit={denyEditRequest} onApproveCount={approveCount} onRejectCount={rejectCount} />}
          {tab === 'mycounts' && <MyCounts cycle={cycle} profile={profile} navigate={navigate} />}
          {tab === 'accounts' && <AdminAccounts />}
          {tab === 'users'    && <AdminUsers />}
          {tab === 'catalog'  && <AdminItemCatalog />}
          {tab === 'reports'  && <AdminDataManagement cycle={cycle} />}

        </div>
      </div>
    </div>
  );
}
