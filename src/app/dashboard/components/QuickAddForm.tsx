"use client";

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Plus, Upload, Loader2, X, Camera, CameraOff, CircleDot, Trash2, PackagePlus, CheckCheck, Pencil, Sun } from 'lucide-react';
import type { SystemCategory, ExpenseRecord } from '@/data/types';
import { uploadReceiptAndParse } from '../utils/ocr-client';
import { useSettings } from '@/context/SettingsContext';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingTransaction {
  id: string;                 // client-side uuid for keying
  amount: string;
  currency: 'USD';
  category: SystemCategory;
  date: string;
  description: string;
}

// ---------------------------------------------------------------------------
// CameraView — live viewfinder + shutter (unchanged from previous version)
// ---------------------------------------------------------------------------

interface CameraViewProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

function CameraView({ onCapture, onClose }: CameraViewProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  type CameraState = 'requesting' | 'live' | 'denied' | 'error';
  const [camState, setCamState] = React.useState<CameraState>('requesting');
  const [errorMsg, setErrorMsg] = React.useState('');
  const [flash, setFlash] = React.useState(false);

  const [exposureSupported, setExposureSupported] = React.useState(false);
  const [exposureMin, setExposureMin] = React.useState(-2);
  const [exposureMax, setExposureMax] = React.useState(2);
  const [exposureStep, setExposureStep] = React.useState(0.1);
  const [exposureValue, setExposureValue] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = (track.getCapabilities?.() || {}) as any;
          if (capabilities.exposureCompensation) {
            setExposureSupported(true);
            setExposureMin(capabilities.exposureCompensation.min ?? -2);
            setExposureMax(capabilities.exposureCompensation.max ?? 2);
            setExposureStep(capabilities.exposureCompensation.step ?? 0.1);
            
            const settings = (track.getSettings?.() || {}) as any;
            if (settings.exposureCompensation !== undefined) {
              setExposureValue(settings.exposureCompensation);
            }
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCamState('live');
      } catch (err: any) {
        if (cancelled) return;
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') setCamState('denied');
        else { setCamState('error'); setErrorMsg(err?.message ?? 'Unable to access camera.'); }
      }
    }
    startCamera();
    return () => { cancelled = true; streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  }, []);

  const handleCapture = React.useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      onCapture(file);
    }, 'image/jpeg', 0.92);
  }, [onCapture]);

  const handleClose = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setExposureValue(0);
    onClose();
  }, [onClose]);

  const handleExposureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setExposureValue(val);
    const track = streamRef.current?.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      try {
        await track.applyConstraints({
          advanced: [{ exposureCompensation: val }]
        } as any);
      } catch (err) {
        console.warn('Failed to apply exposure compensation:', err);
      }
    }
  };

  if (camState === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 gap-4 text-center">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#f5f5f5', border: '1px solid #e5e7eb' }}>
          <CameraOff className="w-6 h-6 text-[var(--color-text-mute)]" />
        </div>
        <p className="text-body-sm-strong text-[var(--color-text-ink)]">Camera access denied</p>
        <p className="text-body-sm text-[var(--color-text-mute)] max-w-xs">Allow camera access in your browser settings, then reload the page.</p>
        <Button variant="ghost" onClick={handleClose} className="gap-2"><X className="w-4 h-4" /> Go Back</Button>
      </div>
    );
  }
  if (camState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 gap-4 text-center">
        <CameraOff className="w-7 h-7 text-[var(--color-text-mute)]" />
        <p className="text-body-sm-strong text-[var(--color-text-ink)]">Camera unavailable</p>
        <p className="text-body-sm text-[var(--color-text-mute)]">{errorMsg}</p>
        <Button variant="ghost" onClick={handleClose} className="gap-2"><X className="w-4 h-4" /> Go Back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative w-full overflow-hidden" style={{ borderRadius: 'var(--radius-md)', background: '#000', aspectRatio: '4 / 3' }}>
        {camState === 'requesting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-white opacity-60" />
          </div>
        )}
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" style={{ opacity: camState === 'live' ? 1 : 0, transition: 'opacity 0.3s' }} />
        {flash && <div className="absolute inset-0 pointer-events-none" style={{ background: 'white', opacity: 0.6 }} />}
        {camState === 'live' && (
          <>
            <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-white opacity-70 rounded-tl" />
            <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-white opacity-70 rounded-tr" />
            <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-white opacity-70 rounded-bl" />
            <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-white opacity-70 rounded-br" />
            
            {/* Exposure Slider UI Overlay */}
            {exposureSupported && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-3 bg-black/40 backdrop-blur-md p-3 rounded-full border border-white/20">
                <Sun className="w-5 h-5 text-white drop-shadow-md" />
                <input
                  type="range"
                  min={exposureMin}
                  max={exposureMax}
                  step={exposureStep}
                  value={exposureValue}
                  onChange={handleExposureChange}
                  className="w-1.5 h-32 appearance-none bg-white/30 rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg cursor-pointer"
                  style={{ writingMode: 'vertical-rl', direction: 'rtl' }}
                />
              </div>
            )}
          </>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="flex items-center justify-between px-1">
        <Button type="button" variant="ghost" onClick={handleClose} className="gap-2 text-[var(--color-text-mute)]">
          <X className="w-4 h-4" /> Cancel
        </Button>
        <button
          type="button"
          id="camera-capture-btn"
          onClick={handleCapture}
          disabled={camState !== 'live'}
          aria-label="Capture photo"
          className="flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40"
          style={{ width: 56, height: 56, borderRadius: '50%', background: '#000', border: '3px solid #fff', boxShadow: '0 0 0 2px #000', cursor: camState === 'live' ? 'pointer' : 'not-allowed' }}
        >
          <CircleDot className="w-6 h-6 text-white" />
        </button>
        <div style={{ width: 80 }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PendingList — scrollable summary of staged transactions
// ---------------------------------------------------------------------------

interface PendingListProps {
  items: PendingTransaction[];
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

function PendingList({ items, onRemove, onEdit }: PendingListProps) {
  if (items.length === 0) return null;

  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--color-hairline)] overflow-hidden"
      style={{ marginTop: 12 }}
    >
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-3 py-2 text-caption-mono text-[var(--color-text-mute)] uppercase"
        style={{ background: '#f9f9f9', borderBottom: '1px solid var(--color-hairline)' }}
      >
        <span>Pending Items</span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{items.length}</span>
      </div>

      {/* Scrollable item list — max 3 rows visible before scrolling */}
      <div style={{ maxHeight: 132, overflowY: 'auto' }}>
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="flex items-center justify-between px-3 py-2 text-body-sm"
            style={{
              borderTop: idx > 0 ? '1px solid var(--color-hairline)' : undefined,
              background: '#fff',
            }}
          >
            {/* Left: index + description */}
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-caption-mono text-[var(--color-text-mute)] shrink-0"
                style={{ fontVariantNumeric: 'tabular-nums', width: 18, textAlign: 'right' }}
              >
                {idx + 1}.
              </span>
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text-ink)] truncate" style={{ maxWidth: 160 }}>
                  {item.description || '—'}
                </p>
                <p className="text-caption-mono text-[var(--color-text-mute)]">
                  {item.date} · {item.category}
                </p>
              </div>
            </div>

            {/* Right: amount + edit + remove */}
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <span className="font-mono font-medium text-[var(--color-text-ink)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                ${parseFloat(item.amount).toFixed(2)}
              </span>
              <button
                type="button"
                aria-label={`Edit item ${idx + 1}`}
                onClick={() => onEdit(item.id)}
                className="text-[var(--color-text-mute)] hover:text-[var(--color-text-ink)] transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                aria-label={`Remove item ${idx + 1}`}
                onClick={() => onRemove(item.id)}
                className="text-[var(--color-text-mute)] hover:text-[var(--color-error)] transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer: total */}
      <div
        className="flex items-center justify-between px-3 py-2 text-body-sm-strong"
        style={{ background: '#f9f9f9', borderTop: '1px solid var(--color-hairline)' }}
      >
        <span className="text-[var(--color-text-mute)]">Total</span>
        <span className="font-mono text-[var(--color-text-ink)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
          ${items.reduce((s, i) => s + parseFloat(i.amount || '0'), 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blankForm(): { amount: string; merchant: string; category: SystemCategory; date: string } {
  return { amount: '', merchant: '', category: 'Food', date: '' };
}

function clientId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// QuickAddForm — main export
// ---------------------------------------------------------------------------

export function QuickAddForm({ onAddSuccess }: { onAddSuccess?: (newExpenses: ExpenseRecord[]) => void }) {
  const router = useRouter();
  const { categories } = useSettings();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isSavingAll, setIsSavingAll] = React.useState(false);
  const [showCamera, setShowCamera] = React.useState(false);

  // Pending (staged) transactions
  const [pendingTransactions, setPendingTransactions] = React.useState<PendingTransaction[]>([]);

  // Current form fields
  const [amount, setAmount] = React.useState('');
  const [merchant, setMerchant] = React.useState('');
  const [category, setCategory] = React.useState<SystemCategory>('Food');
  const [date, setDate] = React.useState('');

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const resetCurrentFields = () => {
    const blank = blankForm();
    setAmount(blank.amount);
    setMerchant(blank.merchant);
    setCategory(blank.category);
    setDate(blank.date);
  };

  const handleClose = () => {
    setIsOpen(false);
    setShowCamera(false);
    setPendingTransactions([]);
    resetCurrentFields();
  };

  // ── "Add Item" — stage current fields into pendingTransactions ────────────

  const handleAddItem = () => {
    if (!amount || !date || !merchant) return;

    const item: PendingTransaction = {
      id: clientId(),
      amount,
      currency: 'USD',
      category,
      date,
      description: merchant,
    };

    setPendingTransactions((prev) => [...prev, item]);
    resetCurrentFields();
  };

  const handleRemoveItem = (id: string) => {
    setPendingTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  const handleEditItem = (id: string) => {
    const item = pendingTransactions.find((t) => t.id === id);
    if (!item) return;
    
    // Load item data back into the main form
    setAmount(item.amount);
    setMerchant(item.description);
    setCategory(item.category);
    setDate(item.date);
    
    // Remove it from the pending list so it's not duplicated
    handleRemoveItem(id);
  };

  // ── "Save All" — POST every pending item concurrently ────────────────────

  const handleSaveAll = async () => {
    // If there are no pending items but the form has data, treat it as a single add
    const queue: PendingTransaction[] =
      pendingTransactions.length > 0
        ? pendingTransactions
        : amount && date && merchant
        ? [{ id: clientId(), amount, currency: 'USD', category, date, description: merchant }]
        : [];

    if (queue.length === 0) return;

    setIsSavingAll(true);
    try {
      const results = await Promise.allSettled(
        queue.map((item) =>
          fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: parseFloat(item.amount),
              currency: item.currency,
              category: item.category,
              date: item.date,
              description: item.description,
            }),
          }).then(async (res) => {
              if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error?.message || 'Save failed');
            }
            const data = await res.json();
            return data.data as ExpenseRecord;
          })
        )
      );

      const successful = results
        .filter((r): r is PromiseFulfilledResult<ExpenseRecord> => r.status === 'fulfilled')
        .map((r) => r.value);

      if (successful.length > 0 && onAddSuccess) {
        onAddSuccess(successful);
      }

      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        const messages = (failed as PromiseRejectedResult[]).map((f) => f.reason?.message).join('\n');
        alert(`${failed.length} item(s) failed to save:\n${messages}`);
      }

      router.refresh();
      handleClose();
    } catch (err: any) {
      alert(err.message || 'Unexpected error saving transactions.');
    } finally {
      setIsSavingAll(false);
    }
  };

  // ── OCR pipeline (shared by gallery + camera) ─────────────────────────────

  const runOcr = async (file: File) => {
    setShowCamera(false);
    setIsProcessing(true);
    try {
      const result = await uploadReceiptAndParse(file);
      
      const newTransactions: PendingTransaction[] = [];
      const globalDate = result.date || new Date().toISOString().slice(0, 10);
      const globalCategory = result.category || 'Food';

      if (result.items && result.items.length > 0) {
        result.items.forEach(item => {
          newTransactions.push({
            id: clientId(),
            amount: item.price.toString(),
            currency: 'USD',
            category: globalCategory,
            date: globalDate,
            description: item.name + (item.qty > 1 ? ` (x${item.qty})` : ''),
          });
        });
        
        setPendingTransactions(prev => [...prev, ...newTransactions]);
      } else {
        if (result.category) setCategory(result.category);
        if (result.date) setDate(result.date);
        alert('No distinct line items found. You can add them manually.');
      }
    } catch (err: any) {
      alert(err.message || 'OCR failed. Please fill in details manually.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await runOcr(file);
  };

  // ── Derived UI state ──────────────────────────────────────────────────────

  const currentFormFilled = !!amount && !!date && !!merchant;
  const totalQueued = pendingTransactions.length;
  // "Save All" saves pending list; if list is empty but form is filled, saves just the one item
  const saveCount = totalQueued > 0 ? totalQueued : currentFormFilled ? 1 : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      {!isOpen && (
        <Button onClick={() => setIsOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Quick Add
        </Button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <Card
            className="w-full max-w-md shadow-[var(--shadow-modal)] relative flex flex-col"
            style={{ maxHeight: 'calc(100dvh - 2rem)', overflowY: 'auto' }}
          >
            {/* Close */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 text-[var(--color-text-mute)] hover:text-[var(--color-text-ink)] z-10"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <CardHeader className="pb-3">
              <CardTitle>Add Transaction</CardTitle>
              <CardDescription>
                {showCamera
                  ? 'Point your camera at a receipt and tap the shutter.'
                  : totalQueued > 0
                  ? `${totalQueued} item${totalQueued !== 1 ? 's' : ''} staged — fill in the next one below.`
                  : 'Enter details manually or scan a receipt.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-0">

              {/* ── OCR Processing ────────────────────────────────────── */}
              {isProcessing && (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
                  <p className="text-body-sm text-[var(--color-text-body)]">Processing receipt…</p>
                </div>
              )}

              {/* ── Camera Viewfinder ──────────────────────────────────── */}
              {!isProcessing && showCamera && (
                <CameraView onCapture={runOcr} onClose={() => setShowCamera(false)} />
              )}

              {/* ── Main Form ─────────────────────────────────────────── */}
              {!isProcessing && !showCamera && (
                <div className="space-y-4">

                  {/* Scan buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      id="gallery-upload-btn"
                      className="gap-2 border-dashed border-[var(--color-hairline-strong)] text-[var(--color-text-mute)] hover:text-[var(--color-text-ink)] hover:border-[var(--color-text-ink)]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-4 h-4" />
                      <span>Upload Photo</span>
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      id="camera-capture-open-btn"
                      className="gap-2 border-dashed border-[var(--color-hairline-strong)] text-[var(--color-text-mute)] hover:text-[var(--color-text-ink)] hover:border-[var(--color-text-ink)]"
                      onClick={() => setShowCamera(true)}
                    >
                      <Camera className="w-4 h-4" />
                      <span>Take Photo</span>
                    </Button>
                  </div>

                  {/* Amount + Date */}
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <label className="text-body-sm-strong text-[var(--color-text-ink)]">Amount</label>
                      <Input
                        placeholder="0.00"
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-body-sm-strong text-[var(--color-text-ink)]">Date</label>
                      <Input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Merchant */}
                  <div className="space-y-1.5">
                    <label className="text-body-sm-strong text-[var(--color-text-ink)]">Merchant / Description</label>
                    <Input
                      placeholder="e.g. Uber Eats"
                      value={merchant}
                      onChange={(e) => setMerchant(e.target.value)}
                    />
                  </div>

                  {/* Category */}
                  <div className="space-y-1.5">
                    <label className="text-body-sm-strong text-[var(--color-text-ink)]">Category</label>
                    <select
                      className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 py-2 text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SystemCategory)}
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* "+ Add Item" — stage current entry */}
                  <button
                    type="button"
                    id="add-item-btn"
                    onClick={handleAddItem}
                    disabled={!currentFormFilled}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-[var(--radius-sm)] text-body-sm-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      border: '1.5px dashed #a1a1a1',
                      color: currentFormFilled ? 'var(--color-text-ink)' : 'var(--color-text-mute)',
                      background: 'transparent',
                    }}
                    onMouseEnter={(e) => { if (currentFormFilled) (e.currentTarget as HTMLButtonElement).style.borderColor = '#000'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#a1a1a1'; }}
                  >
                    <PackagePlus className="w-4 h-4" />
                    + Add Item
                  </button>

                  {/* Pending transactions list */}
                  <PendingList items={pendingTransactions} onRemove={handleRemoveItem} onEdit={handleEditItem} />

                  {/* Action row */}
                  <div className="pt-2 flex items-center justify-between gap-3 border-t border-[var(--color-hairline)]" style={{ marginTop: 8, paddingTop: 16 }}>
                    <Button type="button" variant="ghost" onClick={handleClose}>
                      Cancel
                    </Button>

                    <Button
                      type="button"
                      id="save-all-btn"
                      onClick={handleSaveAll}
                      disabled={saveCount === 0 || isSavingAll}
                      className="gap-2"
                    >
                      {isSavingAll ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        <>
                          <CheckCheck className="w-4 h-4" />
                          {saveCount === 1
                            ? 'Save Transaction'
                            : `Save All (${saveCount} Items)`}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
