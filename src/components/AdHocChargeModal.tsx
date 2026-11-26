'use client';

import {
  AdHocChargeRecord,
  createAdHocChargeAction,
  getAdHocChargeContextAction,
} from '@/app/actions';
import { VoiceMicButton, appendTranscript } from '@/components/VoiceMicButton';
import {
  AlertTriangle,
  Boxes,
  Building2,
  CheckCircle2,
  Layers,
  PackagePlus,
  PoundSterling,
  Receipt,
  Search,
  Tag,
  Truck,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

interface AdHocChargeModalProps {
  open: boolean;
  onClose: () => void;
  userName?: string;
}

type ChargeTypeKey =
  | 'pallet'
  | 'baggies'
  | 'packaging'
  | 'kitting'
  | 'relabel'
  | 'custom';

const CHARGE_PRESETS: Array<{
  key: ChargeTypeKey;
  label: string;
  subtitle: string;
  defaultUnit: string;
  placeholderDesc: string;
}> = [
  {
    key: 'pallet',
    label: 'Pallet Job / Pallet Booked',
    subtitle: 'Pallet shipment booked outside normal system, pallet handling or offload',
    defaultUnit: 'pallets',
    placeholderDesc: 'e.g. 2 Euro pallets booked via courier to Amazon BHX4',
  },
  {
    key: 'baggies',
    label: 'Baggies / Consumables Sold',
    subtitle: 'Sending baggies, mailers or polybags out to a customer (billable stock)',
    defaultUnit: 'baggies',
    placeholderDesc: 'e.g. Sent 500 grip-seal baggies out to customer',
  },
  {
    key: 'packaging',
    label: 'Extra Packaging / Boxes',
    subtitle: 'Extra outer cartons, void fill, pallet wrap, strapping or pallets supplied',
    defaultUnit: 'boxes',
    placeholderDesc: 'e.g. Supplied 40 double-wall outer cartons & pallet wrap',
  },
  {
    key: 'kitting',
    label: 'Ad-Hoc Kit Building',
    subtitle: 'One-off kitting, gift box assembly or bundling job',
    defaultUnit: 'kits',
    placeholderDesc: 'e.g. Built 250 promotional gift kits requested by account manager',
  },
  {
    key: 'relabel',
    label: 'Re-Labelling & Barcoding',
    subtitle: 'SKU compliance relabelling, FNSKU/EAN barcode printing & application',
    defaultUnit: 'labels',
    placeholderDesc: 'e.g. Printed and applied 600 new barcode labels over old EANs',
  },
  {
    key: 'custom',
    label: 'Other Ad-Hoc Charge',
    subtitle: 'Any other non-timed billable warehouse job, material or surcharge',
    defaultUnit: 'units',
    placeholderDesc: 'e.g. Describe the ad-hoc billable work or material supplied',
  },
];

export function AdHocChargeModal({
  open,
  onClose,
  userName,
}: AdHocChargeModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clients, setClients] = useState<
    Array<{ id: string; name: string; code: string }>
  >([]);
  const [recentCharges, setRecentCharges] = useState<AdHocChargeRecord[]>([]);

  // Form state — Customer is NEVER auto-selected
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientSearch, setClientSearch] = useState('');
  const [chargeType, setChargeType] = useState<ChargeTypeKey>('pallet');
  const [customTitle, setCustomTitle] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitLabel, setUnitLabel] = useState('pallets');
  const [chargeAmountGbp, setChargeAmountGbp] = useState('');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    chargeRef: string;
    clientName: string;
    amount: string;
    summary: string;
  } | null>(null);

  const loadContext = async () => {
    setLoading(true);
    const res = await getAdHocChargeContextAction();
    setLoading(false);
    if (res.ok) {
      setClients(res.clients);
      setRecentCharges(res.recentCharges);
    }
  };

  useEffect(() => {
    if (open) {
      setSelectedClientId('');
      setClientSearch('');
      setError(null);
      setSuccessInfo(null);
      loadContext();
    }
  }, [open]);

  const activePreset = useMemo(
    () =>
      CHARGE_PRESETS.find((p) => p.key === chargeType) || CHARGE_PRESETS[0],
    [chargeType]
  );

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId),
    [clients, selectedClientId]
  );

  const filteredClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [clients, clientSearch]);

  if (!open) return null;

  const handleSelectChargeType = (preset: (typeof CHARGE_PRESETS)[number]) => {
    setChargeType(preset.key);
    setUnitLabel(preset.defaultUnit);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedClientId || !selectedClient) {
      setError('Please select a customer in Step 1 before booking or saving this charge.');
      return;
    }
    if (chargeType === 'custom' && !customTitle.trim()) {
      setError('Please enter a title for the custom ad-hoc charge.');
      return;
    }
    if (!chargeAmountGbp.trim()) {
      setError('You must enter a charge amount (£) before booking or sending.');
      return;
    }
    if (!description.trim()) {
      setError('Please describe what is being booked, sent, or charged.');
      return;
    }

    setSubmitting(true);
    const res = await createAdHocChargeAction({
      clientId: selectedClientId,
      chargeType,
      customTitle: customTitle.trim() || undefined,
      quantity: Math.max(1, parseInt(quantity, 10) || 1),
      unitLabel: unitLabel.trim() || activePreset.defaultUnit,
      chargeAmountGbp: chargeAmountGbp.trim(),
      reference: reference.trim() || undefined,
      description: description.trim(),
    });
    setSubmitting(false);

    if (!res.ok) {
      setError(res.error || 'Could not record Ad-Hoc Charge.');
      return;
    }

    const numericCharge = parseFloat(chargeAmountGbp.replace(/[^0-9.]/g, ''));
    const formattedAmount = !Number.isNaN(numericCharge)
      ? `£${numericCharge.toFixed(2)}`
      : chargeAmountGbp.trim();

    setSuccessInfo({
      chargeRef: res.chargeRef || 'CHG-OK',
      clientName: `${selectedClient.name} (${selectedClient.code})`,
      amount: formattedAmount,
      summary: `${quantity} ${unitLabel} · ${
        chargeType === 'custom' ? customTitle : activePreset.label
      }`,
    });

    // Reset form fields & clear customer so next charge requires fresh customer selection
    setSelectedClientId('');
    setChargeAmountGbp('');
    setReference('');
    setDescription('');
    setCustomTitle('');
    setQuantity('1');
    loadContext();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-slate-900 border-2 border-amber-500/70 rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-amber-950/80 via-slate-900 to-slate-900 border-b border-amber-500/30 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
              <Receipt className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                NO TIMER · DIRECT TO CUSTOMER SERVICE BILLING
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white mt-0.5">
                Log Ad-Hoc Billable Charge (Before Booking / Sending)
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* Mandatory Pre-Booking Policy Banner */}
          <div className="p-3.5 rounded-2xl bg-amber-500/15 border-2 border-amber-500/50 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-100 leading-relaxed">
              <strong className="text-amber-300 uppercase tracking-wide block">
                Mandatory Rule — Enter Charge Before You Book or Send:
              </strong>
              Before booking an ad-hoc pallet shipment, sending baggies out, supplying extra packaging, or completing an ad-hoc kitting / relabelling / barcoding job, you must enter the charge here first so Customer Service can bill the customer.
            </div>
          </div>

          {successInfo && (
            <div className="p-4 rounded-2xl bg-emerald-500/15 border-2 border-emerald-400 text-emerald-100 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-black text-emerald-300 text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>
                    Charge Recorded &amp; Sent to Customer Service Billing Queue!
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-400 text-slate-950 font-mono text-xs font-black">
                  Ref: {successInfo.chargeRef}
                </span>
              </div>
              <p className="text-xs text-emerald-200">
                <strong>{successInfo.clientName}</strong> ·{' '}
                <strong>{successInfo.amount}</strong> · {successInfo.summary}. You are now clear to book/dispatch this job.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/20 border-2 border-rose-500 text-rose-200 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* STEP 1: SELECT CUSTOMER (NEVER AUTO-SELECTED) */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4" />
                  1. Select Customer * (Never Auto-Selected)
                </label>
                {selectedClient ? (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black">
                    Selected: {selectedClient.name} ({selectedClient.code})
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-400">
                    Click a customer below
                  </span>
                )}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder={`Search ${clients.length} Cloud9 customers by name or code...`}
                  className="w-full h-10 pl-9 pr-4 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto pr-1">
                {loading ? (
                  <div className="col-span-3 text-center py-4 text-xs text-slate-400">
                    Loading Cloud9 customers...
                  </div>
                ) : (
                  filteredClients.map((c) => {
                    const isSelected = c.id === selectedClientId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedClientId(c.id);
                          setError(null);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-white shadow'
                            : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                        }`}
                      >
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-black shrink-0 ${
                            isSelected
                              ? 'bg-amber-400 text-slate-950'
                              : 'bg-emerald-500 text-slate-950'
                          }`}
                        >
                          {c.code}
                        </span>
                        <span className="text-xs font-bold truncate">
                          {c.name}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* STEP 2: WHAT IS BEING CHARGED / BOOKED? */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
              <label className="block text-xs font-black uppercase tracking-wider text-amber-300">
                2. What Is Being Booked or Charged? *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {CHARGE_PRESETS.map((preset) => {
                  const active = chargeType === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() => handleSelectChargeType(preset)}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        active
                          ? 'bg-amber-500/20 border-amber-400 text-white shadow-md'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-white">
                          {preset.label}
                        </span>
                        {preset.key === 'pallet' && (
                          <Truck className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        {preset.key === 'baggies' && (
                          <PackagePlus className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                        {preset.key === 'packaging' && (
                          <Boxes className="w-4 h-4 text-sky-400 shrink-0" />
                        )}
                        {preset.key === 'kitting' && (
                          <Layers className="w-4 h-4 text-violet-400 shrink-0" />
                        )}
                        {preset.key === 'relabel' && (
                          <Tag className="w-4 h-4 text-teal-400 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        {preset.subtitle}
                      </p>
                    </button>
                  );
                })}
              </div>

              {chargeType === 'custom' && (
                <div className="pt-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Custom Charge Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g. Container Hand-Ball Surcharge / Special Display Pack"
                    className="w-full h-11 px-3.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}
            </div>

            {/* STEP 3: MANDATORY CHARGE AMOUNT (£), QUANTITY & NOTES */}
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="text-xs font-black uppercase tracking-wider text-amber-300">
                3. Enter Charge Amount, Quantity &amp; Booking Details *
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Charge to Bill (£) *
                  </label>
                  <div className="relative">
                    <PoundSterling className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={chargeAmountGbp}
                      onChange={(e) => setChargeAmountGbp(e.target.value)}
                      placeholder="e.g. 45.00"
                      className="w-full h-11 pl-8 pr-3 rounded-xl bg-slate-900 border border-amber-500/50 text-white text-sm font-black focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-black focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Unit Type *
                  </label>
                  <input
                    type="text"
                    required
                    value={unitLabel}
                    onChange={(e) => setUnitLabel(e.target.value)}
                    placeholder="pallets / baggies / kits"
                    className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Booking / Order Ref
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. PO-884 / Consignment"
                    className="w-full h-11 px-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    What Is Being Booked / Sent / Done (For Customer Service Billing) *
                  </label>
                  <VoiceMicButton
                    onTranscript={(spoken) =>
                      setDescription((prev) => appendTranscript(prev, spoken))
                    }
                  />
                </div>
                <input
                  type="text"
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={activePreset.placeholderDesc}
                  className="w-full h-12 px-3.5 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs sm:text-sm font-bold focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-slate-400">
                  Logged by <strong className="text-white">{userName || 'Staff'}</strong> · Status:{' '}
                  <strong className="text-sky-300">NEEDS TO BE BILLED</strong>
                </span>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="h-11 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs sm:text-sm font-black shadow-lg shadow-amber-500/20 flex items-center gap-2 transition"
                  >
                    <Receipt className="w-4 h-4 stroke-[2.5]" />
                    <span>
                      {submitting
                        ? 'Recording Charge...'
                        : 'Record Billable Charge & Authorise Booking'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* RECENT AD-HOC CHARGES QUEUE */}
          {recentCharges.length > 0 && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                Recent Ad-Hoc Billable Charges ({recentCharges.length})
              </div>
              <div className="divide-y divide-slate-800/80 max-h-44 overflow-y-auto pr-1">
                {recentCharges.map((ch) => (
                  <div
                    key={ch.id}
                    className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-mono text-[10px] font-black">
                          {ch.client_code}
                        </span>
                        <span className="font-bold text-white">
                          {ch.client_name}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="font-semibold text-amber-300">
                          {ch.task_name}
                        </span>
                        {ch.order_ref && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-emerald-300">
                            {ch.order_ref}
                          </span>
                        )}
                      </div>
                      {ch.note && (
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {ch.note} · Logged by {ch.user_name}
                        </div>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        ch.billing_status === 'billed'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      }`}
                    >
                      {ch.billing_status === 'billed'
                        ? 'BILLED'
                        : 'NEEDS TO BE BILLED'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
