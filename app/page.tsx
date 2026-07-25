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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchCredits(); fetchLogs(); }, []);

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

      const res = await fetch('/api/generate', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setGenerating(false); return; }

      setStatus(`تم بدء التوليد — ${data.outputs.length} مخرجات`);
      
      // Poll for results
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
  const totalCost = getTotalCost(Array.from(selected));

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[#D4C4B7] bg-[#F5F0EB]/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#8B6F47] text-white flex items-center justify-center text-sm font-bold">W</div>
            <h1 className="text-xl font-bold text-[#3C2415]">Woodstreet Studio</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-white/80 rounded-full px-4 py-1.5 border border-[#D4C4B7]">
              <span className="text-[#8B6F47] text-sm">🪙</span>
              <span className="font-semibold text-[#3C2415]">{credits ?? '...'}</span>
              <span className="text-xs text-[#8B6F47]">كريدت</span>
            </div>
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              className="text-[#8B6F47] hover:text-[#3C2415] text-sm underline"
            >
              إدارة
            </button>
          </div>
        </div>
      </header>

      {/* Admin Panel */}
      {adminOpen && (
        <div className="max-w-5xl mx-auto px-4 mt-4">
          <div className="bg-white rounded-xl border border-[#D4C4B7] p-6">
            <h2 className="text-lg font-bold text-[#3C2415] mb-4">لوحة التحكم</h2>
            <div className="flex items-center gap-4 mb-6">
              <label className="text-sm text-[#8B6F47]">الرصيد الشهري:</label>
              <input
                type="number"
                value={adminCredits}
                onChange={e => setAdminCredits(e.target.value)}
                placeholder="مثلاً: 5000"
                className="border border-[#D4C4B7] rounded-lg px-3 py-2 text-sm w-32"
              />
              <button
                onClick={handleSetCredits}
                className="bg-[#8B6F47] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#6B5437] transition"
              >
                تعيين
              </button>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#3C2415] mb-2">آخر العمليات</h3>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[#8B6F47] border-b">
                      <th className="text-left py-1">الوقت</th>
                      <th className="text-left py-1">النوع</th>
                      <th className="text-left py-1">المبلغ</th>
                      <th className="text-left py-1">الوصف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.slice(0, 10).map((log: any, i: number) => (
                      <tr key={i} className="border-b border-[#F5F0EB]">
                        <td className="py-1 text-[#8B6F47]">{new Date(log.created_at).toLocaleString('ar-EG')}</td>
                        <td className="py-1">{log.action === 'debit' ? '🔴 خصم' : log.action === 'admin_add' ? '🟢 إضافة' : '🔄 تجديد'}</td>
                        <td className="py-1 font-mono">{log.amount}</td>
                        <td className="py-1 text-[#8B6F47]">{log.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Upload Section */}
        <section className="mb-8">
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition ${
              imagePreview
                ? 'border-[#8B6F47] bg-[#F5F0EB]'
                : 'border-[#D4C4B7] hover:border-[#8B6F47] hover:bg-[#F5F0EB]/50'
            }`}
          >
            {imagePreview ? (
              <div className="flex flex-col items-center gap-4">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="max-h-64 rounded-lg shadow-md"
                />
                <span className="text-sm text-[#8B6F47]">اضغط للتغيير</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-[#F5F0EB] flex items-center justify-center text-3xl">
                  📸
                </div>
                <p className="text-[#8B6F47] font-medium">ارفع صورة المنتج</p>
                <p className="text-sm text-[#B8A590]">PNG, JPG, WebP — حتى 10MB</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleImage}
              className="hidden"
            />
          </div>
        </section>

        {/* Output Selection */}
        <section className="mb-8">
          <h2 className="text-lg font-bold text-[#3C2415] mb-4">اختر المخرجات المطلوبة</h2>
          <div className="space-y-4">
            {categories.map(cat => (
              <div key={cat} className="bg-white rounded-xl border border-[#D4C4B7] overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F5F0EB]/50 transition"
                >
                  <span className="font-semibold text-[#3C2415] text-sm">
                    {cat === 'product' ? '📦 صور المنتج' : cat === 'lifestyle' ? '🏠 صور في موقع حقيقي' : '🎥 فيديو'}
                  </span>
                  <span className="text-xs text-[#8B6F47]">
                    {OUTPUT_OPTIONS.filter(o => o.category === cat).every(o => selected.has(o.id)) ? 'إلغاء الكل' : 'تحديد الكل'}
                  </span>
                </button>
                <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {OUTPUT_OPTIONS.filter(o => o.category === cat).map(opt => (
                    <label
                      key={opt.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                        selected.has(opt.id)
                          ? 'border-[#8B6F47] bg-[#F5F0EB]'
                          : 'border-transparent hover:bg-[#F5F0EB]/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(opt.id)}
                        onChange={() => toggleOutput(opt.id)}
                        className="accent-[#8B6F47] w-4 h-4"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#3C2415]">{opt.label}</p>
                        <p className="text-xs text-[#8B6F47]">
                          {opt.type === 'video' ? '🎬' : '🖼️'} {opt.cost} كريدت
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Generate Button */}
        <section className="mb-8">
          <button
            onClick={handleGenerate}
            disabled={generating || !image || selected.size === 0}
            className="w-full py-4 rounded-xl font-bold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed bg-[#8B6F47] text-white hover:bg-[#6B5437]"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span> جارٍ التوليد...
              </span>
            ) : (
              `توليد (${selected.size} مخرجات — ${totalCost} كريدت)`
            )}
          </button>
          {status && !generating && (
            <p className="text-center mt-2 text-sm text-[#8B6F47]">{status}</p>
          )}
          {error && (
            <p className="text-center mt-2 text-sm text-red-500">{error}</p>
          )}
        </section>

        {/* Results Gallery */}
        {results.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[#3C2415] mb-4">النتائج</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((r: any, i: number) => (
                <div key={i} className="bg-white rounded-xl border border-[#D4C4B7] overflow-hidden">
                  <div className="aspect-square bg-[#F5F0EB] flex items-center justify-center">
                    {r.type === 'video' ? (
                      <span className="text-4xl">🎬</span>
                    ) : r.preview_url ? (
                      <img src={r.preview_url} alt={r.label} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl">🖼️</span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-medium text-[#3C2415]">{r.label}</p>
                    <p className="text-xs text-[#8B6F47] mt-1">
                      {r.status === 'completed' ? '✅ مكتمل' : r.status === 'processing' ? '⏳ قيد المعالجة' : '❌ فشل'}
                    </p>
                    {r.status === 'completed' && r.download_url && (
                      <a
                        href={r.download_url}
                        download
                        className="inline-block mt-2 text-xs bg-[#8B6F47] text-white px-3 py-1 rounded-full hover:bg-[#6B5437] transition"
                      >
                        تحميل ⬇
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
