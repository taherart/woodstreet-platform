'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { OUTPUT_OPTIONS, getTotalCost, SPACE_ID } from '@/lib/woodstreet-nodes';

interface OutputRow {
  id: string;
  nodeId: string;
  label: string;
  type: 'image' | 'video';
  cost: number;
  category: string;
}

/* ─── Helper icons ─── */
const IconUpload = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-brown-primary/70">
    <rect x="4" y="12" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
    <path d="M16 28V16M16 16L12 20M16 16L20 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="28" cy="21" r="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
  </svg>
);

const IconCheck = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
    <path d="M6 10.5L9 13L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconDownload = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 2V10M8 10L5 7M8 10L11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 12V13.5H14V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const IconCoin = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="9" cy="9" r="8" stroke="currentColor" strokeWidth="1.2" />
    <circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />
    <text x="9" y="12" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor">$</text>
  </svg>
);

const IconSparkle = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 1L9.5 6.5H15L10.5 10L12 15.5L8 12L4 15.5L5.5 10L1 6.5H6.5L8 1Z" fill="currentColor" opacity="0.8" />
  </svg>
);

const IconChevronDown = ({ open }: { open: boolean }) => (
  <svg
    width="16" height="16" viewBox="0 0 16 16" fill="none"
    className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
  >
    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const categoryMeta: Record<string, { icon: string; title: string; desc: string }> = {
  product: {
    icon: '📦',
    title: 'صور المنتج الاحترافية',
    desc: 'خلفيات بيضاء بجودة عالية',
  },
  lifestyle: {
    icon: '🏠',
    title: 'صور في بيئة حقيقية',
    desc: 'تصميم داخلي مصري فاخر',
  },
  video: {
    icon: '🎥',
    title: 'فيديوهات تسويقية',
    desc: 'مقاطع متحركة احترافية',
  },
};

export default function HomePage() {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [results, setResults] = useState<any[]>([]);
  const [credits, setCredits] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminCredits, setAdminCredits] = useState('');
  const [logs, setLogs] = useState<any[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['product', 'lifestyle', 'video']));
  const [dragOver, setDragOver] = useState(false);
  const [library, setLibrary] = useState<any[]>([]);
  const [videoParams, setVideoParams] = useState<Record<string, { duration: number; aspectRatio: string }>>({
    video_orbital: { duration: 10, aspectRatio: '1:1' },
    video_cinematic: { duration: 5, aspectRatio: '1:1' },
  });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchCredits(); fetchLogs(); fetchLibrary(); }, []);

  const fetchLibrary = async () => {
    const res = await fetch('/api/library');
    const data = await res.json();
    setLibrary(data.library || []);
  };

  const fetchCredits = async () => {
    const res = await fetch('/api/credits');
    const data = await res.json();
    setCredits(data.available);
  };

  const fetchLogs = async () => {
    const res = await fetch('/api/logs');
    const data = await res.json();
    setLogs(data.logs || []);
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  };

  const toggleOutput = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleCategory = (category: string) => {
    const catIds = OUTPUT_OPTIONS.filter(o => o.category === category).map(o => o.id);
    const allSelected = catIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      catIds.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const toggleExpand = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!image || selected.size === 0) {
      setError('اختر صورة ومخرج واحد على الأقل');
      return;
    }

    const totalCost = getTotalCost(Array.from(selected));
    if (credits !== null && credits < totalCost) {
      setError(`الرصيد غير كافٍ. المطلوب: ${totalCost}، المتاح: ${credits}`);
      return;
    }

    setGenerating(true);
    setError(null);
    setStatus('جارٍ رفع الصورة...');
    setResults([]);

    try {
      const formData = new FormData();
      formData.append('image', image);
      formData.append('outputs', JSON.stringify(Array.from(selected)));
      formData.append('videoParams', JSON.stringify(videoParams));

      const res = await fetch('/api/generate', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setGenerating(false); return; }

      setStatus(`تم بدء التوليد — ${data.outputs.length} مخرجات`);

      let pollCount = 0;
      const maxPolls = 120;
      const poll = setInterval(async () => {
        pollCount++;
        const statusRes = await fetch(`/api/generate/status?genId=${data.genId}`);
        const statusData = await statusRes.json();

        setStatus(`قيد المعالجة... (${statusData.completed}/${statusData.total})`);

        if (statusData.allDone || pollCount >= maxPolls) {
          clearInterval(poll);
          setGenerating(false);
          setStatus(statusData.allDone ? 'اكتمل التوليد!' : 'انتهت المهلة');
          setResults(statusData.outputs || []);
          fetchCredits();
          fetchLogs();
          fetchLibrary();
        }
      }, 3000);
    } catch (e) {
      setError('فشل الاتصال بالخادم');
      setGenerating(false);
    }
  };

  const handleSetCredits = async () => {
    const amount = parseInt(adminCredits);
    if (!amount || amount < 0) return;
    await fetch('/api/admin/credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    setAdminCredits('');
    fetchCredits();
    fetchLogs();
  };

  const categories = [...new Set(OUTPUT_OPTIONS.map(o => o.category))];
  const totalCost = Array.from(selected).reduce((sum, id) => {
    const opt = OUTPUT_OPTIONS.find(o => o.id === id);
    if (!opt) return sum;
    if (opt.type === 'video' && videoParams[id]) {
      return sum + (videoParams[id].duration >= 10 ? 200 : 150);
    }
    return sum + opt.cost;
  }, 0);
  const completedCount = results.filter(r => r.status === 'completed').length;

  return (
    <div className="min-h-screen relative">
      {/* Ambient background */}
      <div className="ambient-bg" />

      {/* ──────── HEADER ──────── */}
      <header className="sticky top-0 z-50 border-b border-brown-light/20">
        <div className="glass-card !rounded-none !border-0 !border-b border-brown-light/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brown-primary to-brown-dark flex items-center justify-center shadow-lg shadow-brown-primary/25">
                  <span className="text-white font-bold text-sm tracking-tight">W</span>
                </div>
                <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-br from-gold-light to-brown-primary opacity-0 group-hover:opacity-100 blur-sm transition-opacity duration-500" />
              </div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-brown-dark leading-tight">Woodstreet Studio</h1>
                <p className="text-xs text-brown-muted">منصة إنتاج المحتوى التسويقي</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {/* Credits pill */}
              <div className="flex items-center gap-2 bg-white/70 backdrop-blur rounded-full px-4 py-2 border border-brown-light/30 shadow-sm">
                <span className="text-gold"><IconCoin /></span>
                <span className="font-bold text-brown-dark text-sm tabular-nums">{credits !== null ? credits.toLocaleString('ar-EG') : '—'}</span>
                <span className="text-xs text-brown-muted hidden sm:inline">كريدت</span>
              </div>

              {/* Admin toggle */}
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className={`btn-outline text-xs px-4 py-2 rounded-full inline-flex items-center gap-1.5 ${
                  adminOpen ? 'bg-brown-primary/10 border-brown-primary text-brown-primary' : ''
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M7 4.5V7.5M7 9.5H7.005" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span className="hidden sm:inline">الإدارة</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ──────── ADMIN PANEL ──────── */}
      {adminOpen && (
        <div className="animate-slide-down overflow-hidden">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
            <div className="glass-card p-6 animate-scale-in">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-bold text-brown-dark">لوحة التحكم</h2>
                  <p className="text-xs text-brown-muted mt-0.5">إدارة الرصيد ومراقبة الاستخدام</p>
                </div>
                <button
                  onClick={() => setAdminOpen(false)}
                  className="text-brown-muted hover:text-brown-dark transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M6 6L14 14M14 6L6 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Credit setter */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8 p-4 bg-cream/50 rounded-2xl border border-brown-light/20">
                <label className="text-sm font-medium text-brown-dark whitespace-nowrap">تعيين الرصيد الشهري:</label>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-none">
                    <input
                      type="number"
                      value={adminCredits}
                      onChange={e => setAdminCredits(e.target.value)}
                      placeholder="5000"
                      min="0"
                      className="w-full sm:w-36 ps-10 pe-4 py-2.5 bg-white rounded-xl border border-brown-light/40 text-sm text-brown-dark placeholder:text-brown-muted focus:outline-none focus:border-brown-primary focus:ring-2 focus:ring-brown-primary/10 transition-all"
                    />
                    <span className="absolute start-3 top-1/2 -translate-y-1/2 text-brown-muted text-sm">🪙</span>
                  </div>
                  <button
                    onClick={handleSetCredits}
                    className="btn-primary px-5 py-2.5 text-sm whitespace-nowrap"
                  >
                    تعيين الرصيد
                  </button>
                </div>
              </div>

              {/* Logs */}
              <div>
                <h3 className="text-sm font-semibold text-brown-dark mb-3 flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M5 6H11M5 9H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  سجل العمليات
                </h3>
                <div className="overflow-x-auto rounded-xl border border-brown-light/20">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>الوقت</th>
                        <th>النوع</th>
                        <th>المبلغ</th>
                        <th>الوصف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center text-brown-muted py-8">
                            لا توجد عمليات بعد
                          </td>
                        </tr>
                      ) : (
                        logs.slice(0, 20).map((log: any, i: number) => (
                          <tr key={i}>
                            <td className="text-brown-muted whitespace-nowrap">
                              {new Date(log.created_at).toLocaleString('ar-EG')}
                            </td>
                            <td>
                              <span className={`status-badge ${
                                log.action === 'debit' ? 'failed' :
                                log.action === 'admin_add' ? 'completed' : 'processing'
                              }`}>
                                {log.action === 'debit' ? 'خصم' :
                                 log.action === 'admin_add' ? 'إضافة' : 'تجديد'}
                              </span>
                            </td>
                            <td className="font-mono text-sm">{log.amount.toLocaleString('ar-EG')}</td>
                            <td className="text-brown-muted max-w-[200px] truncate">{log.description || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────── MAIN ──────── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div className="text-center mb-12 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-cream/60 backdrop-blur rounded-full border border-brown-light/20 mb-6 text-xs text-brown-muted">
            <IconSparkle />
            <span>مدعوم بتقنية Magnific AI</span>
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold text-brown-dark font-[family-name:var(--font-display)] leading-tight mb-3">
            <span className="text-gradient">حوّل منتجاتك</span>
            <br className="sm:hidden" />
            {' '}إلى محتوى تسويقي احترافي
          </h2>
          <p className="text-brown-muted text-sm sm:text-base max-w-lg mx-auto">
            ارفع صورة منتج واحد واحصل على صور وفيديوهات جاهزة للنشر — بضغطة زر
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 stagger">
          {/* ─── LEFT: Upload + Options ─── */}
          <div className="lg:col-span-3 space-y-6">

            {/* Upload Section */}
            <section
              className={`glass-card glass-card-hover upload-zone p-8 sm:p-12 text-center cursor-pointer ${
                dragOver ? 'drag-over' : ''
              } ${imagePreview ? 'border-brown-primary/30' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('image/')) {
                  setImage(file);
                  setImagePreview(URL.createObjectURL(file));
                  setError(null);
                }
              }}
            >
              {imagePreview ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="relative group">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-64 rounded-2xl shadow-card object-contain"
                    />
                    <div className="absolute inset-0 bg-brown-dark/0 group-hover:bg-brown-dark/10 rounded-2xl transition-all duration-300 flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 backdrop-blur text-brown-dark text-xs px-3 py-1.5 rounded-full shadow-sm">
                        اضغط للتغيير
                      </span>
                    </div>
                  </div>
                  <p className="text-sm text-brown-muted">{image?.name}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-5">
                  <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br from-cream to-brown-light/30 flex items-center justify-center transition-all duration-500 ${dragOver ? 'scale-110 shadow-glow' : ''}`}>
                    <IconUpload />
                  </div>
                  <div>
                    <p className="text-brown-dark font-semibold text-base mb-1">ارفع صورة المنتج</p>
                    <p className="text-brown-muted text-sm">اسحب وأفلت أو اضغط للاختيار</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-brown-muted">
                    <span className="px-2.5 py-1 bg-cream/50 rounded-full border border-brown-light/20">PNG</span>
                    <span className="px-2.5 py-1 bg-cream/50 rounded-full border border-brown-light/20">JPG</span>
                    <span className="px-2.5 py-1 bg-cream/50 rounded-full border border-brown-light/20">WebP</span>
                    <span className="text-brown-muted/60">حتى 10MB</span>
                  </div>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleImage}
                className="hidden"
              />
            </section>

            {/* Output Selection */}
            <section>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-brown-dark">اختر المخرجات</h3>
                  <p className="text-xs text-brown-muted mt-0.5">حدد المحتوى التسويقي المطلوب</p>
                </div>
                {selected.size > 0 && (
                  <span className="text-xs font-medium text-brown-primary bg-brown-primary/8 px-3 py-1.5 rounded-full">
                    {selected.size} مخرجات محددة
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {categories.map((cat) => {
                  const catOpts = OUTPUT_OPTIONS.filter(o => o.category === cat);
                  const meta = categoryMeta[cat] || { icon: '📋', title: cat, desc: '' };
                  const allCatSelected = catOpts.every(o => selected.has(o.id));
                  const someCatSelected = catOpts.some(o => selected.has(o.id));
                  const isExpanded = expandedCategories.has(cat);

                  return (
                    <div
                      key={cat}
                      className={`glass-card overflow-hidden transition-all duration-300 ${
                        someCatSelected ? 'border-brown-primary/25' : ''
                      }`}
                    >
                      {/* Category header */}
                      <button
                        onClick={() => toggleExpand(cat)}
                        className="w-full flex items-center gap-4 px-5 py-4 hover:bg-cream/30 transition-colors"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all duration-300 ${
                          someCatSelected
                            ? 'bg-brown-primary/10 shadow-sm shadow-brown-primary/10'
                            : 'bg-cream/50'
                        }`}>
                          {meta.icon}
                        </div>
                        <div className="flex-1 text-right">
                          <p className="text-sm font-semibold text-brown-dark">{meta.title}</p>
                          <p className="text-xs text-brown-muted">{meta.desc}</p>
                        </div>
                        {/* Select all */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleCategory(cat); }}
                          className={`text-xs px-3 py-1.5 rounded-full border transition-all ml-2 ${
                            allCatSelected
                              ? 'bg-brown-primary text-white border-brown-primary'
                              : 'border-brown-light/40 text-brown-muted hover:border-brown-primary hover:text-brown-primary'
                          }`}
                        >
                          {allCatSelected ? 'تم تحديد الكل' : someCatSelected ? 'تحديد الكل' : 'تحديد الكل'}
                        </button>
                        <IconChevronDown open={isExpanded} />
                      </button>

                      {/* Options grid */}
                      <div
                        className={`grid grid-cols-1 sm:grid-cols-2 gap-2 px-5 pb-4 transition-all duration-300 ${
                          isExpanded ? 'opacity-100' : 'hidden opacity-0'
                        }`}
                      >
                        {catOpts.map((opt) => (
                          <div key={opt.id}>
                            <label
                              className={`checkbox-card flex items-center gap-3 p-3.5 rounded-xl border transition-all duration-300 ${
                                selected.has(opt.id)
                                  ? 'border-brown-primary/30 bg-cream/60'
                                  : 'border-transparent bg-white/40'
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(opt.id)}
                              onChange={() => toggleOutput(opt.id)}
                            />
                            <div className="check-indicator" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-brown-dark truncate">{opt.label}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-brown-muted flex items-center gap-1">
                                  {opt.type === 'video' ? (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                      <rect x="1.5" y="2.5" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="0.8" />
                                      <polygon points="5,4 5,8 8,6" fill="currentColor" />
                                    </svg>
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                      <rect x="1.5" y="1.5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="0.8" />
                                      <circle cx="4.5" cy="4.5" r="1" stroke="currentColor" strokeWidth="0.8" />
                                      <path d="M1.5 9L4 7L6 8.5L10.5 2.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                  {opt.cost} كريدت
                                </span>
                              </div>
                            </div>
                          </label>
                            {/* Video controls */}
                            {opt.type === 'video' && selected.has(opt.id) && (
                              <div className="mt-2 p-2.5 bg-cream/40 rounded-lg border border-brown-light/15 space-y-2 animate-scale-in">
                                {/* Duration toggle */}
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-brown-muted shrink-0">المدة:</span>
                                  <div className="flex gap-1">
                                    {opt.durations?.map(d => (
                                      <button
                                        key={d}
                                        onClick={(e) => { e.stopPropagation(); setVideoParams(prev => ({ ...prev, [opt.id]: { ...prev[opt.id] || { duration: 10, aspectRatio: '1:1' }, duration: d } })); }}
                                        className={`text-[10px] px-2.5 py-1 rounded-full transition-all ${
                                          videoParams[opt.id]?.duration === d
                                            ? 'bg-brown-primary text-white'
                                            : 'bg-white/60 text-brown-muted hover:bg-white'
                                        }`}
                                      >
                                        {d}s
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {/* Aspect ratio */}
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-brown-muted shrink-0">النسبة:</span>
                                  <div className="flex gap-1">
                                    {opt.aspectRatios?.map(r => (
                                      <button
                                        key={r}
                                        onClick={(e) => { e.stopPropagation(); setVideoParams(prev => ({ ...prev, [opt.id]: { ...prev[opt.id] || { duration: 10, aspectRatio: '1:1' }, aspectRatio: r } })); }}
                                        className={`text-[10px] px-2 py-1 rounded-full transition-all ${
                                          videoParams[opt.id]?.aspectRatio === r
                                            ? 'bg-brown-primary text-white'
                                            : 'bg-white/60 text-brown-muted hover:bg-white'
                                        }`}
                                      >
                                        {r}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ─── RIGHT: Sidebar (Generate + Status) ─── */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24 space-y-5">
              {/* Summary card */}
              <div className="glass-card p-6">
                <h4 className="text-sm font-semibold text-brown-dark mb-4">ملخص الطلب</h4>

                {/* Image status */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-brown-light/15">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                    imagePreview ? 'bg-green-50 text-green-600' : 'bg-cream/50 text-brown-muted'
                  }`}>
                    {imagePreview ? '✓' : '1'}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-brown-dark">صورة المنتج</p>
                    <p className="text-[10px] text-brown-muted">
                      {imagePreview ? 'تم رفع الصورة ✓' : 'لم يتم الرفع بعد'}
                    </p>
                  </div>
                </div>

                {/* Outputs status */}
                <div className="flex items-center gap-3 mb-4 pb-4 border-b border-brown-light/15">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                    selected.size > 0 ? 'bg-brown-primary/10 text-brown-primary' : 'bg-cream/50 text-brown-muted'
                  }`}>
                    {selected.size || '0'}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-brown-dark">المخرجات المختارة</p>
                    <p className="text-[10px] text-brown-muted">
                      {selected.size > 0 ? `${selected.size} مخرجات محددة` : 'لم يتم الاختيار'}
                    </p>
                  </div>
                </div>

                {/* Cost */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-brown-muted">التكلفة الإجمالية</span>
                  <span className="text-sm font-bold text-brown-dark flex items-center gap-1">
                    <span className="text-gold text-xs">🪙</span>
                    {totalCost.toLocaleString('ar-EG')}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-5">
                  <span className="text-xs text-brown-muted">الرصيد المتاح</span>
                  <span className={`text-sm font-bold flex items-center gap-1 ${
                    credits !== null && credits < totalCost ? 'text-red-500' : 'text-brown-dark'
                  }`}>
                    <span className="text-xs">🪙</span>
                    {credits !== null ? credits.toLocaleString('ar-EG') : '—'}
                  </span>
                </div>

                {/* Generate button */}
                <button
                  onClick={handleGenerate}
                  disabled={generating || !image || selected.size === 0}
                  className="btn-primary w-full py-3.5 text-base flex items-center justify-center gap-2"
                >
                  {generating ? (
                    <>
                      <svg className="animate-spin-slow" width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="35" strokeLinecap="round" />
                      </svg>
                      جارٍ التوليد...
                    </>
                  ) : (
                    <>
                      <IconSparkle />
                      توليد المحتوى
                    </>
                  )}
                </button>

                {/* Status message */}
                {generating && status && (
                  <div className="mt-4 animate-fade-in">
                    <div className="progress-track mb-2">
                      <div className="progress-fill animate-progress" style={{ width: '100%' }} />
                    </div>
                    <p className="text-xs text-center text-brown-muted">{status}</p>
                  </div>
                )}

                {status && !generating && (
                  <p className={`mt-4 text-xs text-center font-medium ${
                    status.includes('اكتمل') ? 'text-green-600' :
                    status.includes('مهلة') ? 'text-amber-600' : 'text-brown-muted'
                  }`}>
                    {status}
                  </p>
                )}

                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl animate-scale-in">
                    <p className="text-xs text-red-600 text-center">{error}</p>
                  </div>
                )}

                {/* Credit warning */}
                {credits !== null && credits < totalCost && selected.size > 0 && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl animate-scale-in">
                    <p className="text-xs text-amber-700 text-center">
                      الرصيد غير كافٍ. تحتاج {totalCost.toLocaleString('ar-EG')} كريدت
                    </p>
                  </div>
                )}
              </div>

              {/* Quick tips */}
              {!results.length && !generating && (
                <div className="glass-card p-5 animate-fade-in" style={{ animationDelay: '0.3s' }}>
                  <h4 className="text-xs font-semibold text-brown-dark mb-3 flex items-center gap-1.5">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" />
                      <path d="M7 4V7.5M7 9.5H7.005" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    نصائح سريعة
                  </h4>
                  <ul className="space-y-2">
                    {[
                      'استخدم صورًا بخلفية بيضاء للحصول على أفضل النتائج',
                      'اختر زاوية واضحة للمنتج (3/4 أو أمامية)',
                      'يمكنك اختيار أكثر من مخرج في نفس الوقت',
                    ].map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-brown-muted">
                        <span className="text-gold mt-0.5 shrink-0">•</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ──────── RESULTS GALLERY ──────── */}
        {results.length > 0 && (
          <section className="mt-12 animate-fade-in-up">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-brown-dark">النتائج</h3>
                <p className="text-xs text-brown-muted mt-1">
                  {completedCount} من {results.length} مكتملة
                </p>
              </div>
              {completedCount === results.length && (
                <span className="status-badge completed">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" />
                    <path d="M4 6L5.5 7.5L8 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  اكتمل التوليد
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
              {results.map((r: any, i: number) => (
                <div
                  key={i}
                  className="gallery-item glass-card overflow-hidden"
                >
                  {/* Media */}
                  <div className="aspect-[4/3] bg-cream/80 flex items-center justify-center relative">
                    {r.type === 'video' ? (
                      <div className="flex flex-col items-center gap-3 text-brown-muted">
                        <div className="w-16 h-16 rounded-full bg-brown-dark/5 flex items-center justify-center">
                          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                            <rect x="4" y="6" width="24" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
                            <polygon points="13,10 13,22 24,16" fill="currentColor" />
                          </svg>
                        </div>
                        <span className="text-xs font-medium">{r.label}</span>
                      </div>
                    ) : r.preview_url ? (
                      <img
                        src={r.preview_url}
                        alt={r.label}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-brown-muted">
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                          <rect x="4" y="4" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="15" cy="15" r="4" stroke="currentColor" strokeWidth="1.5" />
                          <path d="M4 30L13 24L20 30L36 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="text-xs">قيد المعالجة...</span>
                      </div>
                    )}

                    {/* Status badge */}
                    <div className="absolute top-3 start-3">
                      <span className={`status-badge backdrop-blur-sm ${
                        r.status === 'completed' ? 'completed' :
                        r.status === 'processing' ? 'processing' : 'failed'
                      }`}>
                        {r.status === 'completed' ? 'مكتمل ✓' :
                         r.status === 'processing' ? 'قيد المعالجة' : 'فشل'}
                      </span>
                    </div>

                    {/* Overlay for completed */}
                    {r.status === 'completed' && (
                      <div className="gallery-overlay">
                        <p className="text-white/90 text-sm font-medium mb-1">{r.label}</p>
                        {r.download_url && (
                          <a
                            href={r.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur text-white text-xs px-4 py-2 rounded-full border border-white/20 hover:bg-white/30 transition-all w-fit"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <IconDownload />
                            تحميل
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Info footer */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-brown-dark truncate">{r.label}</p>
                      <p className="text-[10px] text-brown-muted">
                        {r.type === 'video' ? 'فيديو' : 'صورة'}
                      </p>
                    </div>
                    {r.status === 'completed' && r.download_url && (
                      <a
                        href={r.download_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-outline text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1"
                      >
                        <IconDownload />
                        تحميل
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ──────── LIBRARY ──────── */}
        {library.length > 0 && (
          <section className="mt-16 animate-fade-in-up">
            <div className="mb-6">
              <h3 className="text-xl font-bold text-brown-dark">المكتبة</h3>
              <p className="text-xs text-brown-muted mt-1">آخر {library.length} صورة تم إنتاجها</p>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {library.map((item: any, i: number) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-square rounded-xl overflow-hidden bg-cream/50 border border-brown-light/20 hover:border-brown-primary/40 hover:shadow-lg hover:shadow-brown-primary/10 transition-all duration-300"
                  title={item.label}
                >
                  <img
                    src={item.url}
                    alt={item.label}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  {/* Overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-brown-dark/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-2">
                    <p className="text-white text-[10px] leading-tight font-medium truncate w-full">
                      {item.label}
                    </p>
                  </div>
                  {/* Type badge */}
                  <span className="absolute top-1.5 left-1.5 bg-white/80 backdrop-blur text-[10px] font-medium px-1.5 py-0.5 rounded text-brown-dark">
                    {item.type === 'video' ? '🎥' : '🖼'}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-20 pb-8 text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 text-xs text-brown-muted/60">
            <span>Woodstreet Studio</span>
            <span>•</span>
            <span>مدعوم من Magnific AI</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
