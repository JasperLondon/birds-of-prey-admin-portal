import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  OutlinedInput,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import { supabase } from '../supabaseClient';
import './EsimRequests.scoped.css';

type EsimRequestStatus = 'requested' | 'under_review' | 'approved' | 'cancelled';

type EsimRequestRow = {
  id: string;
  athlete_id: string;
  athlete_name: string | null;
  athlete_email: string | null;
  trip_id: string;
  trip_name: string | null;
  trip_start_date: string | null;
  trip_end_date: string | null;
  trip_status: string | null;
  status: EsimRequestStatus;
  destination_country_code: string | null;
  residence_country_code: string | null;
  eligibility_status: string | null;
  international_travel: boolean | null;
  athlete_notes: string | null;
  admin_notes: string | null;
  requested_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
};

type HistoryRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  reason: string | null;
  changed_by_user_id: string | null;
  created_at: string;
};

type CatalogPlanOption = {
  id: string;
  provider_bundle_id: string;
  name: string;
  data_amount_display: string;
  validity_days: number;
  price_amount: number | null;
  price_currency: string | null;
  plan_type: string;
  fetched_at: string;
};

type PlanSelectionRow = {
  id: string;
  catalog_plan_id: string;
  selection_type: 'recommended' | 'selected';
  recommendation_reason: string | null;
  estimated_price_amount: number | null;
  estimated_price_currency: string | null;
  provider_bundle_id_snapshot: string;
  plan_name_snapshot: string;
  data_allowance_snapshot: string;
  validity_days_snapshot: number;
  created_at: string;
};

type RecommendationPlan = {
  planId: string;
  providerBundleId: string | null;
  name: string | null;
  dataAllowance: string | null;
  validityDays: number | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  recommendationReason: string | null;
  isCompromise: boolean;
  meetsValidity: boolean | null;
  meetsDataRequirement: boolean | null;
};

type RecommendationContext = {
  destinationCountryCode: string | null;
  tripDurationDays: number | null;
};

type ValidationRow = {
  id: string;
  status: 'pending' | 'passed' | 'failed';
  provider_order_reference: string | null;
  validated_price_amount: number | null;
  validated_price_currency: string | null;
  balance_sufficient: boolean | null;
  provider_error_message: string | null;
  requested_at: string;
  completed_at: string | null;
};

type ProvisioningState = {
  status: 'awaiting_provisioning' | 'provisioning' | 'provisioned' | 'failed' | 'reconciliation_required';
  providerOrderReference: string | null;
  iccid: string | null;
  matchingId: string | null;
  activationCodeAvailable: boolean | null;
  qrAvailable: boolean | null;
  provisionedAt: string | null;
  readyForAthleteInstallation: boolean;
  providerError: string | null;
};

type ProvisioningRow = {
  id: string;
  status: string;
  provisioning_status: string | null;
  provider_order_reference: string | null;
  provider_iccid: string | null;
  provider_matching_id: string | null;
  provider_activation_code: string | null;
  provider_qr_code_url: string | null;
  provisioning_error_message: string | null;
  completed_at: string | null;
  provisioned_at: string | null;
};

type LifecycleState = {
  exists: boolean;
  lifecycleStatus: string | null;
  installationStatus: 'ready_to_install' | 'installed' | null;
  installedAt: string | null;
  devicePlatform: string | null;
  activationStatus: 'installed' | 'activation_pending' | 'active' | 'expired' | 'check_failed' | null;
  activatedAt: string | null;
  lastCheckedAt: string | null;
  providerProfileStatus: string | null;
  providerBundleStatus: string | null;
  initialData: string | null;
  usedData: string | null;
  remainingData: string | null;
  bundleExpiry: string | null;
  expiredAt: string | null;
  isMock: boolean;
  mockWarning: string | null;
};

type TimelineStage = {
  label: string;
  timestamp: string | null;
};

type ProviderShapeSummary = {
  requestId?: unknown;
  providerStatus?: unknown;
  topLevelType?: unknown;
  topLevelKeys?: unknown;
  detectedArrayPath?: unknown;
  totalItemCount?: unknown;
  firstTwoItemFieldNames?: unknown;
  nestedCoverageFieldNames?: unknown;
  redactedSamples?: unknown;
};

const REDACTED_KEYS_PATTERN = /(authorization|jwt|api[_-]?key|service[_-]?role|raw.*provider.*payload|provider.*payload|secret|password)/i;

const redactUnsafeFields = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    return input.map((item) => redactUnsafeFields(item));
  }

  if (!input || typeof input !== 'object') {
    return input;
  }

  const output: Record<string, unknown> = {};
  Object.entries(input as Record<string, unknown>).forEach(([key, value]) => {
    if (REDACTED_KEYS_PATTERN.test(key)) {
      output[key] = '[REDACTED]';
      return;
    }
    output[key] = redactUnsafeFields(value);
  });

  return output;
};

const STATUS_FILTERS: Array<{ label: string; value: string }> = [
  { label: 'All', value: 'all' },
  { label: 'Requested', value: 'requested' },
  { label: 'Under Review', value: 'under_review' },
  { label: 'Approved', value: 'approved' },
  { label: 'Cancelled', value: 'cancelled' },
];

const formatStatus = (status: string | null | undefined) => {
  if (!status) return 'Unknown';
  if (status === 'under_review') return 'Under Review';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const statusChipToneClass = (status: string | null | undefined) => {
  const key = (status || '').toLowerCase();
  if (key === 'requested') return 'mwd-status-chip requested';
  if (key === 'under_review') return 'mwd-status-chip under-review';
  if (key === 'approved') return 'mwd-status-chip approved';
  if (key === 'cancelled') return 'mwd-status-chip cancelled';
  if (key === 'passed') return 'mwd-status-chip approved';
  if (key === 'failed') return 'mwd-status-chip cancelled';
  if (key === 'pending') return 'mwd-status-chip requested';
  return 'mwd-status-chip neutral';
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'N/A';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
};

const formatDateOnly = (value: string | null | undefined) => {
  if (!value) return 'N/A';
  return value;
};

const toNullableString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const toNullableBoolean = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return null;
};

const formatLifecycleStatusLabel = (status: string | null | undefined) => {
  if (!status) return 'Unknown';
  const key = status.trim().toLowerCase();
  if (key === 'ready_to_install') return 'Ready to Install';
  if (key === 'installed') return 'Installed';
  if (key === 'activation_pending') return 'Activation Pending';
  if (key === 'active') return 'Active';
  if (key === 'expired') return 'Expired';
  if (key === 'check_failed') return 'Check Failed';
  return key.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
};

const formatEdgeFunctionError = async (fnError: unknown, fallbackMessage: string) => {
  const baseMessage = typeof (fnError as any)?.message === 'string' && (fnError as any).message.trim()
    ? (fnError as any).message.trim()
    : fallbackMessage;

  const context = (fnError as any)?.context;
  if (!context) {
    return baseMessage;
  }

  try {
    const responseLike = typeof context.clone === 'function' ? context.clone() : context;
    if (typeof responseLike?.json !== 'function') {
      return baseMessage;
    }

    const payload = await responseLike.json();
    const err = payload?.error;
    if (!err || typeof err !== 'object') {
      return baseMessage;
    }

    const parts: string[] = [];
    const message = typeof err.message === 'string' && err.message.trim() ? err.message.trim() : baseMessage;
    parts.push(message);

    if (typeof err.code === 'string' && err.code.trim()) {
      parts.push(`code: ${err.code.trim()}`);
    }
    if (typeof err.stage === 'string' && err.stage.trim()) {
      parts.push(`stage: ${err.stage.trim()}`);
    }
    if (typeof err.requestId === 'string' && err.requestId.trim()) {
      parts.push(`requestId: ${err.requestId.trim()}`);
    }

    return parts.join(' | ');
  } catch {
    return baseMessage;
  }
};

export default function EsimRequests() {
  const ACCENT_ORANGE = '#c9782d';
  const ACCENT_ORANGE_DIM = '#ab621f';
  const DANGER_RED = '#d25757';
  const dialogPaperSx = {
    bgcolor: '#151517',
    color: '#f3f3f4',
    borderRadius: 3,
    border: '1px solid #2b2b2e',
    boxShadow: 'none',
  };
  const dialogTitleSx = {
    pb: 1,
    '& .MuiTypography-root': {
      fontWeight: 690,
      letterSpacing: 0.1,
      color: '#f4f4f5',
    },
  };
  const dialogContentSx = {
    pt: 0.5,
    '& .MuiTextField-root': { mb: 0.65 },
    '& .MuiInputLabel-root': { color: '#9fa0a5' },
    '& .MuiOutlinedInput-root': {
      bgcolor: '#131315',
      color: '#f1f1f2',
      borderRadius: 2,
      '& fieldset': { borderColor: '#313136' },
      '&:hover fieldset': { borderColor: '#4a4a50' },
      '&.Mui-focused fieldset': { borderColor: '#595960' },
    },
  };
  const dialogActionsSx = {
    px: 3,
    pb: 2.2,
    pt: 1,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 1,
    flexWrap: 'wrap',
  };
  const neutralButtonSx = {
    textTransform: 'none',
    borderRadius: 2,
    borderColor: '#4f4f54',
    color: '#d6d6da',
    '&:hover': { borderColor: ACCENT_ORANGE, color: ACCENT_ORANGE },
  };
  const primaryButtonSx = {
    textTransform: 'none',
    borderRadius: 2,
    bgcolor: ACCENT_ORANGE,
    '&:hover': { bgcolor: ACCENT_ORANGE_DIM },
  };
  const destructiveButtonSx = {
    textTransform: 'none',
    borderRadius: 2,
    bgcolor: DANGER_RED,
    '&:hover': { bgcolor: '#bb4a4a' },
  };

  const [statusFilter, setStatusFilter] = useState<string>('requested');
  const [searchQuery, setSearchQuery] = useState('');
  const [rows, setRows] = useState<EsimRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<EsimRequestRow | null>(null);
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [assignmentConfirmed, setAssignmentConfirmed] = useState<boolean | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [catalogPlans, setCatalogPlans] = useState<CatalogPlanOption[]>([]);
  const [catalogFetchedAt, setCatalogFetchedAt] = useState<string | null>(null);
  const [selectedSelection, setSelectedSelection] = useState<PlanSelectionRow | null>(null);
  const [latestValidation, setLatestValidation] = useState<ValidationRow | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [catalogWorking, setCatalogWorking] = useState(false);
  const [recommendWorking, setRecommendWorking] = useState(false);
  const [validateWorking, setValidateWorking] = useState(false);
  const [provisionWorking, setProvisionWorking] = useState(false);
  const [requestRefreshWorking, setRequestRefreshWorking] = useState(false);
  const [provisioningState, setProvisioningState] = useState<ProvisioningState | null>(null);
  const [lifecycleState, setLifecycleState] = useState<LifecycleState | null>(null);
  const [lifecycleReadIssue, setLifecycleReadIssue] = useState<string | null>(null);
  const [providerShapeWorking, setProviderShapeWorking] = useState(false);
  const [providerShapeOpen, setProviderShapeOpen] = useState(false);
  const [providerShapeJson, setProviderShapeJson] = useState('');
  const [recommendAuditWorking, setRecommendAuditWorking] = useState(false);
  const [recommendAuditOpen, setRecommendAuditOpen] = useState(false);
  const [recommendAuditJson, setRecommendAuditJson] = useState('');
  const [recommendationResponse, setRecommendationResponse] = useState<Record<string, unknown> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState('');
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);

  const deriveProvisioningState = useCallback((input: {
    row: ProvisioningRow | null;
    latestProviderOrderReference: string | null;
  }): ProvisioningState => {
    const row = input.row;
    if (!row) {
      return {
        status: 'awaiting_provisioning',
        providerOrderReference: input.latestProviderOrderReference,
        iccid: null,
        matchingId: null,
        activationCodeAvailable: null,
        qrAvailable: null,
        provisionedAt: null,
        readyForAthleteInstallation: false,
        providerError: null,
      };
    }

    const normalizedStatus = (row.status || '').trim().toLowerCase();
    const normalizedProvisioningStatus = (row.provisioning_status || '').trim().toLowerCase();
    const providerOrderReference = row.provider_order_reference || input.latestProviderOrderReference;
    const hasAssignmentIdentifier = Boolean(providerOrderReference || row.provider_iccid || row.provider_matching_id);
    const hasInstallSignal = Boolean(row.provider_activation_code || row.provider_qr_code_url);

    const strictlyProvisioned =
      normalizedProvisioningStatus === 'provisioned'
      && Boolean(providerOrderReference)
      && hasAssignmentIdentifier;

    let status: ProvisioningState['status'] = 'awaiting_provisioning';
    if (strictlyProvisioned) {
      status = 'provisioned';
    } else if (normalizedStatus === 'pending') {
      status = 'provisioning';
    } else if (normalizedStatus === 'failed') {
      status = 'failed';
    } else if (normalizedStatus === 'reconciliation_required') {
      status = 'reconciliation_required';
    } else if (normalizedStatus === 'provisioned' || normalizedStatus === 'already_provisioned') {
      status = 'reconciliation_required';
    }

    return {
      status,
      providerOrderReference,
      iccid: row.provider_iccid,
      matchingId: row.provider_matching_id,
      activationCodeAvailable: row.provider_activation_code ? true : false,
      qrAvailable: row.provider_qr_code_url ? true : false,
      provisionedAt: row.provisioned_at || row.completed_at,
      readyForAthleteInstallation: strictlyProvisioned && hasInstallSignal,
      providerError: row.provisioning_error_message || null,
    };
  }, []);

  const deriveLifecycleState = useCallback((raw: unknown): LifecycleState | null => {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;

    const lifecycleStatus = toNullableString(row.lifecycle_status, row.status);
    const installationStatusRaw = toNullableString(row.installation_status);
    const activationStatusRaw = toNullableString(row.activation_status, lifecycleStatus);

    const isInstalled = (installationStatusRaw || '').toLowerCase() === 'installed'
      || Boolean(toNullableString(row.installed_at));

    const installationStatus: LifecycleState['installationStatus'] = isInstalled
      ? 'installed'
      : lifecycleStatus || activationStatusRaw
        ? 'ready_to_install'
        : null;

    const activationKey = (activationStatusRaw || '').toLowerCase();
    let activationStatus: LifecycleState['activationStatus'] = null;
    if (activationKey === 'installed') activationStatus = 'installed';
    else if (activationKey === 'activation_pending') activationStatus = 'activation_pending';
    else if (activationKey === 'active') activationStatus = 'active';
    else if (activationKey === 'expired') activationStatus = 'expired';
    else if (activationKey === 'check_failed') activationStatus = 'check_failed';
    else if (isInstalled) activationStatus = 'installed';

    const isMock = Boolean(toNullableBoolean(row.is_mock, row.mock, row.mock_provisioning));

    const formatDataAmount = (...values: unknown[]) => {
      const text = toNullableString(...values);
      if (text) return text;
      const value = values.find((item) => typeof item === 'number');
      if (typeof value === 'number') {
        if (value <= 0) return '0';
        const gb = value / (1024 ** 3);
        if (gb >= 1) return `${gb.toFixed(2)} GB`;
        const mb = value / (1024 ** 2);
        return `${mb.toFixed(2)} MB`;
      }
      return null;
    };

    return {
      exists: true,
      lifecycleStatus,
      installationStatus,
      installedAt: toNullableString(row.installed_at),
      devicePlatform: toNullableString(row.device_platform, row.platform),
      activationStatus,
      activatedAt: toNullableString(row.activated_at),
      lastCheckedAt: toNullableString(row.last_checked_at, row.provider_last_checked_at),
      providerProfileStatus: toNullableString(row.provider_profile_status),
      providerBundleStatus: toNullableString(row.provider_bundle_status),
      initialData: formatDataAmount(row.initial_data, row.initial_data_amount, row.initial_data_amount_bytes),
      usedData: formatDataAmount(row.used_data, row.used_data_amount, row.used_data_amount_bytes),
      remainingData: formatDataAmount(row.remaining_data, row.remaining_data_amount, row.remaining_data_amount_bytes),
      bundleExpiry: toNullableString(row.bundle_expiry, row.bundle_expires_at),
      expiredAt: toNullableString(row.expired_at),
      isMock,
      mockWarning: isMock ? 'Mock Provisioning - Development Test Only. Mock activation is simulated.' : null,
    };
  }, []);

  const tripDurationDays = useMemo(() => {
    if (!selected?.trip_start_date || !selected?.trip_end_date) return null;
    const start = new Date(selected.trip_start_date);
    const end = new Date(selected.trip_end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const diffMs = end.getTime() - start.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
    return days > 0 ? days : null;
  }, [selected?.trip_end_date, selected?.trip_start_date]);

  const recommendationContext = useMemo<RecommendationContext>(() => {
    return {
      destinationCountryCode: selected?.destination_country_code || null,
      tripDurationDays,
    };
  }, [selected?.destination_country_code, tripDurationDays]);

  const normalizeRecommendationPlan = useCallback((raw: unknown): RecommendationPlan | null => {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const planId = (row.planId ?? row.catalogPlanId ?? row.id ?? '').toString();
    if (!planId) return null;

    const validityRaw = row.validityDays ?? row.validity_days ?? null;
    const priceAmountRaw = row.priceAmount ?? row.price_amount ?? null;

    return {
      planId,
      providerBundleId: (row.providerBundleId ?? row.provider_bundle_id ?? null) as string | null,
      name: (row.name ?? row.planName ?? row.plan_name ?? null) as string | null,
      dataAllowance: (row.dataAllowance ?? row.data_allowance ?? row.data ?? row.data_amount_display ?? null) as string | null,
      validityDays: typeof validityRaw === 'number' ? validityRaw : (typeof validityRaw === 'string' && validityRaw.trim() ? Number(validityRaw) : null),
      priceAmount: typeof priceAmountRaw === 'number' ? priceAmountRaw : (typeof priceAmountRaw === 'string' && priceAmountRaw.trim() ? Number(priceAmountRaw) : null),
      priceCurrency: (row.priceCurrency ?? row.price_currency ?? null) as string | null,
      recommendationReason: (row.recommendationReason ?? row.reason ?? row.recommendation_reason ?? null) as string | null,
      isCompromise: Boolean(row.isCompromise ?? row.is_compromise),
      meetsValidity: typeof (row.meetsValidity ?? row.meets_validity) === 'boolean' ? Boolean(row.meetsValidity ?? row.meets_validity) : null,
      meetsDataRequirement: typeof (row.meetsDataRequirement ?? row.meets_data_requirement) === 'boolean' ? Boolean(row.meetsDataRequirement ?? row.meets_data_requirement) : null,
    };
  }, []);

  const recommendationPlan = useMemo(() => {
    if (!recommendationResponse) return null;
    const root = recommendationResponse;
    const direct = normalizeRecommendationPlan(root.recommendation ?? root.recommendedPlan ?? root.recommended ?? null);
    if (direct) return direct;
    return normalizeRecommendationPlan(root);
  }, [normalizeRecommendationPlan, recommendationResponse]);

  const recommendationAlternatives = useMemo(() => {
    if (!recommendationResponse) return [] as RecommendationPlan[];
    const root = recommendationResponse;
    const rawAlternatives =
      (Array.isArray(root.alternatives) ? root.alternatives : null)
      || (Array.isArray(root.candidatePlans) ? root.candidatePlans : null)
      || (Array.isArray(root.candidates) ? root.candidates : null)
      || [];

    return (rawAlternatives as unknown[])
      .map((item) => normalizeRecommendationPlan(item))
      .filter((item): item is RecommendationPlan => item !== null)
      .filter((item) => item.planId !== recommendationPlan?.planId);
  }, [normalizeRecommendationPlan, recommendationPlan?.planId, recommendationResponse]);

  const selectedPlanForValidation = useMemo(() => {
    return selectedSelection?.catalog_plan_id || null;
  }, [selectedSelection?.catalog_plan_id]);

  const hasValidationPassed = latestValidation?.status === 'passed';
  const hasProvisionedAssignment = provisioningState?.status === 'provisioned';

  const canProvision = useMemo(() => {
    if (!selected || selected.status !== 'approved') return false;
    if (!hasValidationPassed) return false;
    if (!selectedPlanForValidation) return false;
    if (hasProvisionedAssignment) return false;
    return true;
  }, [hasProvisionedAssignment, hasValidationPassed, selected, selectedPlanForValidation]);

  const canRetryProvisioning = useMemo(() => {
    return (provisioningState?.status === 'failed' || provisioningState?.status === 'reconciliation_required')
      && !hasProvisionedAssignment;
  }, [hasProvisionedAssignment, provisioningState?.status]);

  const normalizeProvisioningResponse = useCallback((raw: unknown): ProvisioningState => {
    const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const assignment = (source.assignment && typeof source.assignment === 'object' ? source.assignment : {}) as Record<string, unknown>;
    const order = (source.order && typeof source.order === 'object' ? source.order : {}) as Record<string, unknown>;
    const provisioning = (source.provisioning && typeof source.provisioning === 'object' ? source.provisioning : {}) as Record<string, unknown>;

    const getString = (...values: unknown[]) => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      return null;
    };

    const getBoolean = (...values: unknown[]) => {
      for (const value of values) {
        if (typeof value === 'boolean') return value;
        if (value === 'true') return true;
        if (value === 'false') return false;
      }
      return null;
    };

    const providerOrderReference = getString(
      source.providerOrderReference,
      source.provider_order_reference,
      source.orderReference,
      source.order_reference,
      order.providerOrderReference,
      order.provider_order_reference,
      assignment.providerOrderReference,
      assignment.provider_order_reference,
      latestValidation?.provider_order_reference,
    );

    const iccid = getString(source.iccid, assignment.iccid, order.iccid, provisioning.iccid);
    const matchingId = getString(source.matchingId, source.matching_id, assignment.matchingId, assignment.matching_id, provisioning.matchingId, provisioning.matching_id);
    const activationCodeAvailable = getBoolean(
      source.activationCodeAvailable,
      source.activation_code_available,
      assignment.activationCodeAvailable,
      assignment.activation_code_available,
      Boolean(getString(source.activationCode, source.activation_code, assignment.activationCode, assignment.activation_code)),
    );
    const qrAvailable = getBoolean(
      source.qrAvailable,
      source.qr_available,
      assignment.qrAvailable,
      assignment.qr_available,
      Boolean(getString(source.qrCode, source.qr_code, source.qrCodeUrl, source.qr_code_url, assignment.qrCode, assignment.qr_code, assignment.qrCodeUrl, assignment.qr_code_url)),
    );
    const provisionedAt = getString(
      source.provisionedAt,
      source.provisioned_at,
      source.completedAt,
      source.completed_at,
      assignment.provisionedAt,
      assignment.provisioned_at,
      assignment.created_at,
      provisioning.provisionedAt,
      provisioning.provisioned_at,
    );

    const readyForAthleteInstallation = Boolean(
      getBoolean(
        source.readyForAthleteInstallation,
        source.ready_for_athlete_installation,
        assignment.readyForAthleteInstallation,
        assignment.ready_for_athlete_installation,
      ) ?? (iccid && matchingId),
    );

    const providerError = getString(
      source.provider_error_message,
      source.providerErrorMessage,
      source.error_message,
      source.error,
      provisioning.error,
    );

    const localStatus = getString(provisioning.status, source.status);
    const normalizedProvisioningStatus = getString(source.provisioning_status, provisioning.provisioning_status);
    const hasAssignmentIdentifier = Boolean(providerOrderReference || iccid || matchingId);
    const isProvisioned =
      (normalizedProvisioningStatus || '').toLowerCase() === 'provisioned'
      && Boolean(providerOrderReference)
      && hasAssignmentIdentifier;

    let nextStatus: ProvisioningState['status'] = 'awaiting_provisioning';
    if (isProvisioned) {
      nextStatus = 'provisioned';
    } else if ((localStatus || '').toLowerCase() === 'pending') {
      nextStatus = 'provisioning';
    } else if ((localStatus || '').toLowerCase() === 'failed') {
      nextStatus = 'failed';
    } else if ((localStatus || '').toLowerCase() === 'reconciliation_required') {
      nextStatus = 'reconciliation_required';
    } else if ((localStatus || '').toLowerCase() === 'provisioned' || (localStatus || '').toLowerCase() === 'already_provisioned') {
      nextStatus = 'reconciliation_required';
    } else if (providerError) {
      nextStatus = 'failed';
    }

    return {
      status: nextStatus,
      providerOrderReference,
      iccid,
      matchingId,
      activationCodeAvailable,
      qrAvailable,
      provisionedAt,
      readyForAthleteInstallation: Boolean(readyForAthleteInstallation && isProvisioned),
      providerError,
    };
  }, [latestValidation?.provider_order_reference]);

  const provisioningStatusLabel = useMemo(() => {
    if (provisionWorking) return 'Provisioning';
    if (provisioningState?.status === 'provisioned') return 'Provisioned';
    if (provisioningState?.status === 'reconciliation_required') return 'Reconciliation Required';
    if (provisioningState?.status === 'failed') return 'Provisioning Failed';
    return 'Awaiting Provisioning';
  }, [provisionWorking, provisioningState?.status]);

  const workflowStatusLabel = useMemo(() => {
    if (provisionWorking) {
      return 'Provisioning';
    }
    if (provisioningState?.status === 'provisioned') {
      return 'Provisioned - ready for athlete installation';
    }
    if (provisioningState?.status === 'reconciliation_required') {
      return 'Provisioning requires reconciliation';
    }
    if (latestValidation?.status === 'passed') {
      return 'Validation passed - awaiting provisioning';
    }
    if (selectedSelection) {
      return 'Selected plan ready for validation';
    }
    if (recommendationPlan) {
      return 'Recommended plan awaiting admin acceptance';
    }
    return 'Recommendation has not been generated';
  }, [latestValidation?.status, provisionWorking, provisioningState?.status, recommendationPlan, selectedSelection]);

  const lifecycleTimeline = useMemo<TimelineStage[]>(() => {
    const isInstalled = lifecycleState?.installationStatus === 'installed';
    const activationStatus = lifecycleState?.activationStatus;

    const stages: TimelineStage[] = [
      { label: 'Requested', timestamp: selected?.requested_at || null },
      { label: 'Approved', timestamp: selected?.approved_at || null },
      { label: 'Plan Selected', timestamp: selectedSelection?.created_at || null },
      {
        label: 'Validated',
        timestamp: latestValidation?.status === 'passed'
          ? (latestValidation.completed_at || latestValidation.requested_at)
          : null,
      },
      { label: 'Provisioned', timestamp: provisioningState?.provisionedAt || null },
      { label: 'Installed', timestamp: isInstalled ? (lifecycleState?.installedAt || null) : null },
      {
        label: 'Activation Pending',
        timestamp: activationStatus === 'activation_pending'
          ? (lifecycleState?.lastCheckedAt || lifecycleState?.installedAt || null)
          : null,
      },
    ];

    if (lifecycleState?.exists) {
      stages.push({
        label: 'Active',
        timestamp: activationStatus === 'active'
          ? (lifecycleState?.activatedAt || lifecycleState?.lastCheckedAt || null)
          : null,
      });
      stages.push({
        label: 'Expired',
        timestamp: activationStatus === 'expired' ? (lifecycleState?.expiredAt || null) : null,
      });
    }

    return stages;
  }, [lifecycleState, latestValidation?.completed_at, latestValidation?.requested_at, latestValidation?.status, provisioningState?.provisionedAt, selected?.approved_at, selected?.requested_at, selectedSelection?.created_at]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) => {
      const athlete = `${row.athlete_name || ''} ${row.athlete_email || ''} ${row.athlete_id || ''}`.toLowerCase();
      const trip = `${row.trip_name || ''} ${row.trip_id || ''}`.toLowerCase();
      const destination = `${row.destination_country_code || ''}`.toLowerCase();
      const residence = `${row.residence_country_code || ''}`.toLowerCase();
      const status = `${row.status || ''}`.toLowerCase();
      return athlete.includes(query) || trip.includes(query) || destination.includes(query) || residence.includes(query) || status.includes(query);
    });
  }, [rows, searchQuery]);

  const queueSummary = useMemo(() => {
    let requested = 0;
    let underReview = 0;
    let approved = 0;
    let cancelled = 0;

    rows.forEach((row) => {
      if (row.status === 'requested') requested += 1;
      if (row.status === 'under_review') underReview += 1;
      if (row.status === 'approved') approved += 1;
      if (row.status === 'cancelled') cancelled += 1;
    });

    return { requested, underReview, approved, cancelled };
  }, [rows]);

  const requiredNextStep = useMemo(() => {
    if (!selected) return 'Select a request to review.';
    if (selected.status === 'requested') return 'Review assignment and triage request status.';
    if (selected.status === 'under_review') return 'Approve or cancel after notes and plan checks.';
    if (selected.status === 'approved') {
      if (!selectedSelection) return 'Generate recommendation and select a plan.';
      if (!hasValidationPassed) return 'Validate selected plan before provisioning.';
      if (!hasProvisionedAssignment) return 'Provision eSIM when validation is passed.';
      return 'Confirm athlete installation readiness and monitor lifecycle.';
    }
    if (selected.status === 'cancelled') return 'No further workflow action required.';
    return 'Continue review workflow.';
  }, [hasProvisionedAssignment, hasValidationPassed, selected, selectedSelection]);

  const requestConfirmation = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmMessage(message);
      setConfirmOpen(true);
    });
  }, []);

  const closeConfirmation = useCallback((answer: boolean) => {
    setConfirmOpen(false);
    setConfirmMessage('');
    if (confirmResolverRef.current) {
      confirmResolverRef.current(answer);
      confirmResolverRef.current = null;
    }
  }, []);

  const fetchQueue = useCallback(async (filter: string) => {
    setLoading(true);
    setError('');

    const statusArg = filter === 'all' ? null : filter;
    const { data, error: rpcError } = await supabase.rpc('admin_get_esim_requests', {
      p_status: statusArg,
      p_athlete_id: null,
      p_trip_id: null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setRows([]);
      setLoading(false);
      return [] as EsimRequestRow[];
    }

    const nextRows = (data || []) as EsimRequestRow[];
    setRows(nextRows);
    setLoading(false);
    return nextRows;
  }, []);

  useEffect(() => {
    void fetchQueue(statusFilter);
  }, [fetchQueue, statusFilter]);

  const selectedStatusHistory = useMemo(() => {
    return historyRows.slice().sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });
  }, [historyRows]);

  const loadPlanAndValidationState = useCallback(async (row: EsimRequestRow) => {
    const [plansResult, selectionResult, validationResult, provisioningResult, lifecycleResult] = await Promise.all([
      supabase
        .from('esim_catalog_plans')
        .select('id, provider_bundle_id, name, data_amount_display, validity_days, price_amount, price_currency, plan_type, fetched_at')
        .eq('provider', 'esimgo')
        .eq('is_active', true)
        .contains('countries', [row.destination_country_code || ''])
        .order('price_amount', { ascending: true, nullsFirst: false })
        .limit(30),
      supabase
        .from('esim_request_plan_selections')
        .select('id, catalog_plan_id, selection_type, recommendation_reason, estimated_price_amount, estimated_price_currency, provider_bundle_id_snapshot, plan_name_snapshot, data_allowance_snapshot, validity_days_snapshot, created_at')
        .eq('request_id', row.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('esim_order_validations')
        .select('id, status, validated_price_amount, validated_price_currency, balance_sufficient, provider_error_message, requested_at, completed_at')
        .eq('request_id', row.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('esim_order_provisionings')
        .select('id, status, provisioning_status, provider_order_reference, provider_iccid, provider_matching_id, provider_activation_code, provider_qr_code_url, provisioning_error_message, completed_at, provisioned_at, requested_at')
        .eq('request_id', row.id)
        .order('requested_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('esim_lifecycles')
        .select('*')
        .eq('request_id', row.id)
        .maybeSingle(),
    ]);

    if (!plansResult.error) {
      const plans = (plansResult.data || []) as CatalogPlanOption[];
      setCatalogPlans(plans);
      setCatalogFetchedAt(plans.length > 0 ? plans[0].fetched_at : null);
    }

    if (!selectionResult.error) {
      const selections = (selectionResult.data || []) as PlanSelectionRow[];
      const selected = selections.find((item) => item.selection_type === 'selected') || null;
      setSelectedSelection(selected);
      setSelectedPlanId(selected?.catalog_plan_id || '');
    }

    if (!validationResult.error) {
      const nextValidation = (validationResult.data as ValidationRow) || null;
      setLatestValidation(nextValidation);
    }

    if (!provisioningResult.error) {
      const rowData = (provisioningResult.data as ProvisioningRow) || null;
      setProvisioningState(deriveProvisioningState({
        row: rowData,
        latestProviderOrderReference: ((validationResult.data as ValidationRow | null)?.provider_order_reference) || null,
      }));
    }

    if (!lifecycleResult.error) {
      setLifecycleReadIssue(null);
      const normalized = deriveLifecycleState(lifecycleResult.data);
      setLifecycleState(normalized || {
        exists: false,
        lifecycleStatus: null,
        installationStatus: null,
        installedAt: null,
        devicePlatform: null,
        activationStatus: null,
        activatedAt: null,
        lastCheckedAt: null,
        providerProfileStatus: null,
        providerBundleStatus: null,
        initialData: null,
        usedData: null,
        remainingData: null,
        bundleExpiry: null,
        expiredAt: null,
        isMock: false,
        mockWarning: null,
      });
    } else {
      setLifecycleState(null);
      setLifecycleReadIssue(`Lifecycle unavailable: ${lifecycleResult.error.message}`);
    }
  }, [deriveLifecycleState, deriveProvisioningState]);

  async function openRequest(row: EsimRequestRow) {
    setSelected(row);
    setAdminNotes('');
    setCancelReason('');
    setAssignmentConfirmed(null);
    setHistoryRows([]);
    setCatalogPlans([]);
    setCatalogFetchedAt(null);
    setSelectedSelection(null);
    setLatestValidation(null);
    setSelectedPlanId('');
    setRecommendationResponse(null);
    setProvisionWorking(false);
    setProvisioningState(null);
    setLifecycleState(null);
    setLifecycleReadIssue(null);

    const [historyResult, assignmentResult] = await Promise.all([
      supabase
        .from('esim_request_status_history')
        .select('id, from_status, to_status, reason, changed_by_user_id, created_at')
        .eq('request_id', row.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('trip_athletes')
        .select('trip_id')
        .eq('trip_id', row.trip_id)
        .eq('athlete_id', row.athlete_id)
        .limit(1),
    ]);

    if (!historyResult.error) {
      setHistoryRows((historyResult.data || []) as HistoryRow[]);
    }

    if (!assignmentResult.error) {
      setAssignmentConfirmed((assignmentResult.data || []).length > 0);
    } else {
      const fallback = await supabase
        .from('trips')
        .select('id')
        .eq('id', row.trip_id)
        .eq('athlete_id', row.athlete_id)
        .limit(1);
      if (!fallback.error) {
        setAssignmentConfirmed((fallback.data || []).length > 0);
      }
    }

    await loadPlanAndValidationState(row);
  }

  async function refreshRequestDetails() {
    if (!selected || requestRefreshWorking) return;
    setRequestRefreshWorking(true);
    setError('');
    await loadPlanAndValidationState(selected);
    setRequestRefreshWorking(false);
  }

  async function refreshCatalogue() {
    if (!selected || catalogWorking) return;
    if (!selected.destination_country_code) {
      setError('Destination country is required to refresh catalogue.');
      return;
    }

    setCatalogWorking(true);
    setError('');

    const { error: fnError } = await supabase.functions.invoke('esimgo-catalogue', {
      body: {
        destinationCountryCode: selected.destination_country_code,
        forceRefresh: true,
      },
    });

    if (fnError) {
      setCatalogWorking(false);
      setError(await formatEdgeFunctionError(fnError, 'Failed to refresh catalogue.'));
      return;
    }

    await loadPlanAndValidationState(selected);
    setCatalogWorking(false);
  }

  async function inspectProviderShape() {
    if (!selected || providerShapeWorking) return;
    if (!selected.destination_country_code) {
      setError('Destination country is required to inspect provider shape.');
      return;
    }

    setProviderShapeWorking(true);
    setError('');

    const { data, error: fnError } = await supabase.functions.invoke('esimgo-catalogue', {
      body: {
        destinationCountryCode: selected.destination_country_code,
        debugProviderShape: true,
      },
    });

    if (fnError) {
      setProviderShapeWorking(false);
      setError(await formatEdgeFunctionError(fnError, 'Failed to inspect provider shape.'));
      return;
    }

    const source = ((data && typeof data === 'object' ? data : {}) as Record<string, unknown>);
    const diagnostic = source.diagnostic && typeof source.diagnostic === 'object'
      ? (source.diagnostic as Record<string, unknown>)
      : source;
    const summary: ProviderShapeSummary = {
      requestId: source.requestId,
      providerStatus: diagnostic.providerStatus ?? source.providerStatus,
      topLevelType: diagnostic.topLevelType ?? source.topLevelType,
      topLevelKeys: diagnostic.topLevelKeys ?? source.topLevelKeys,
      detectedArrayPath: diagnostic.detectedArrayPath ?? source.detectedArrayPath,
      totalItemCount: diagnostic.totalItemCount ?? source.totalItemCount,
      firstTwoItemFieldNames: diagnostic.firstTwoItemFieldNames ?? source.firstTwoItemFieldNames,
      nestedCoverageFieldNames: diagnostic.nestedCoverageFieldNames ?? source.nestedCoverageFieldNames,
      redactedSamples: diagnostic.redactedSamples ?? source.redactedSamples,
    };

    setProviderShapeJson(JSON.stringify(summary, null, 2));
    setProviderShapeOpen(true);
    setProviderShapeWorking(false);
  }

  async function recommendPlan(forceRefresh = false, planOverrideId?: string) {
    if (!selected || recommendWorking) return;
    setRecommendWorking(true);
    setError('');

    const { data, error: fnError } = await supabase.functions.invoke('esimgo-recommend-plan', {
      body: {
        requestId: selected.id,
        forceRefresh,
        selectedPlanId: planOverrideId || null,
      },
    });

    if (fnError) {
      setRecommendWorking(false);
      setError(await formatEdgeFunctionError(fnError, 'Failed to recommend/select plan.'));
      return;
    }

    const retained = (data && typeof data === 'object') ? (data as Record<string, unknown>) : { value: data };
    setRecommendationResponse(retained);

    await loadPlanAndValidationState(selected);
    setRecommendWorking(false);
  }

  async function applyRecommendedPlan() {
    if (!recommendationPlan?.planId || !selected) {
      setError('No recommended plan is available to accept.');
      return;
    }

    if (selectedSelection && selectedSelection.catalog_plan_id !== recommendationPlan.planId) {
      const confirmed = await requestConfirmation('A selected plan already exists. Replace it with the recommended plan?');
      if (!confirmed) return;
    }

    await recommendPlan(false, recommendationPlan.planId);
  }

  async function selectAlternativePlan(planId: string) {
    if (!selected || !planId) return;

    if (selectedSelection && selectedSelection.catalog_plan_id !== planId) {
      const confirmed = await requestConfirmation('A selected plan already exists. Replace it with this alternative plan?');
      if (!confirmed) return;
    }

    await recommendPlan(false, planId);
  }

  async function selectChosenPlan() {
    if (!selectedPlanId) {
      setError('Choose a different plan before selecting.');
      return;
    }

    if (selectedSelection && selectedSelection.catalog_plan_id !== selectedPlanId) {
      const confirmed = await requestConfirmation('A selected plan already exists. Replace it with this chosen plan?');
      if (!confirmed) return;
    }

    await recommendPlan(false, selectedPlanId);
  }

  async function inspectRecommendationAudit() {
    if (!selected || recommendAuditWorking) return;

    setRecommendAuditWorking(true);
    setError('');

    const { data, error: fnError } = await supabase.functions.invoke('esimgo-recommend-plan', {
      body: {
        requestId: selected.id,
        debugRecommendationAudit: true,
      },
    });

    if (fnError) {
      setRecommendAuditWorking(false);
      setError(await formatEdgeFunctionError(fnError, 'Failed to inspect recommendation audit.'));
      return;
    }

    const safeData = redactUnsafeFields(data && typeof data === 'object' ? data : { ok: true, requestId: selected.id, data });
    setRecommendAuditJson(JSON.stringify(safeData, null, 2));
    setRecommendAuditOpen(true);
    setRecommendAuditWorking(false);
  }

  async function validateOrder() {
    if (!selected || validateWorking) return;
    const planId = selectedPlanForValidation;
    if (!planId) {
      setError('A selected plan is required before validation.');
      return;
    }

    setValidateWorking(true);
    setError('');

    const idempotencyKey = `validate-${selected.id}-${planId}-${Date.now()}`;
    const { error: fnError } = await supabase.functions.invoke('esimgo-validate-order', {
      body: {
        requestId: selected.id,
        catalogPlanId: planId,
        idempotencyKey,
      },
    });

    if (fnError) {
      setValidateWorking(false);
      setError(await formatEdgeFunctionError(fnError, 'Validation failed.'));
      return;
    }

    await loadPlanAndValidationState(selected);
    setValidateWorking(false);
  }

  async function provisionOrder() {
    if (!selected || provisionWorking) return;

    if (hasProvisionedAssignment) {
      setError('This request is already provisioned. Provisioning cannot run twice.');
      return;
    }

    if (!hasValidationPassed || !selectedPlanForValidation) {
      setError('Validation must pass with a selected plan before provisioning.');
      return;
    }

    setProvisionWorking(true);
    setError('');
    setProvisioningState((prev) => ({
      status: 'provisioning',
      providerOrderReference: prev?.providerOrderReference ?? latestValidation?.provider_order_reference ?? null,
      iccid: prev?.iccid ?? null,
      matchingId: prev?.matchingId ?? null,
      activationCodeAvailable: prev?.activationCodeAvailable ?? null,
      qrAvailable: prev?.qrAvailable ?? null,
      provisionedAt: prev?.provisionedAt ?? null,
      readyForAthleteInstallation: prev?.readyForAthleteInstallation ?? false,
      providerError: null,
    }));

    const { data, error: fnError } = await supabase.functions.invoke('esimgo-provision-order', {
      body: {
        requestId: selected.id,
        catalogPlanId: selectedPlanForValidation,
      },
    });

    if (fnError) {
      const message = await formatEdgeFunctionError(fnError, 'Provisioning failed.');
      setProvisionWorking(false);
      setError(message);
      setProvisioningState((prev) => ({
        status: 'failed',
        providerOrderReference: prev?.providerOrderReference ?? latestValidation?.provider_order_reference ?? null,
        iccid: prev?.iccid ?? null,
        matchingId: prev?.matchingId ?? null,
        activationCodeAvailable: prev?.activationCodeAvailable ?? null,
        qrAvailable: prev?.qrAvailable ?? null,
        provisionedAt: prev?.provisionedAt ?? null,
        readyForAthleteInstallation: prev?.readyForAthleteInstallation ?? false,
        providerError: message,
      }));
      return;
    }

    const nextProvisioning = normalizeProvisioningResponse(data);
    setProvisioningState(nextProvisioning);

    await loadPlanAndValidationState(selected);
    setProvisionWorking(false);
  }

  async function submitReview(action: 'under_review' | 'approved' | 'cancelled') {
    if (!selected || reviewing) return;

    if (action === 'cancelled' && !cancelReason.trim()) {
      setError('Cancellation reason is required.');
      return;
    }

    setReviewing(true);
    setError('');

    const { error: reviewError } = await supabase.rpc('admin_review_esim_request', {
      p_request_id: selected.id,
      p_action: action,
      p_notes: adminNotes.trim() || null,
      p_cancellation_reason: action === 'cancelled' ? cancelReason.trim() : null,
    });

    if (reviewError) {
      setReviewing(false);
      setError(reviewError.message);
      return;
    }

    const refreshedRows = await fetchQueue(statusFilter);
    const refreshed = refreshedRows.find((r) => r.id === selected.id);
    setSelected(refreshed || null);
    if (refreshed) {
      await openRequest(refreshed);
    }

    setReviewing(false);
  }

  return (
    <div className="mwd-esim-shell">
      <div className="mwd-esim-command">
        <div>
          <h2>eSIM Requests</h2>
          <p>Review requests, progress provider workflow, and monitor activation readiness.</p>
        </div>
      </div>

      <div className="mwd-esim-summary-grid">
        <div className="mwd-summary-card"><span className="label">Requested</span><strong>{queueSummary.requested}</strong></div>
        <div className="mwd-summary-card"><span className="label">Under Review</span><strong>{queueSummary.underReview}</strong></div>
        <div className="mwd-summary-card"><span className="label">Approved</span><strong>{queueSummary.approved}</strong></div>
        <div className="mwd-summary-card"><span className="label">Cancelled</span><strong>{queueSummary.cancelled}</strong></div>
      </div>

      <div className="mwd-esim-filters">
        <div className="mwd-filter-field">
          <label htmlFor="esim-search">Search</label>
          <input
            id="esim-search"
            className="mwd-control"
            placeholder="Search athlete, trip, destination, residence, or status"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
        <div className="mwd-filter-field">
          <label htmlFor="esim-status-filter">Status</label>
          <FormControl size="small" className="mwd-select-wrap">
            <InputLabel id="esim-status-filter-label">Status</InputLabel>
            <Select
              labelId="esim-status-filter-label"
              id="esim-status-filter"
              value={statusFilter}
              label="Status"
              onChange={(event) => setStatusFilter(event.target.value)}
              input={<OutlinedInput label="Status" />}
            >
              {STATUS_FILTERS.map((filter) => (
                <MenuItem key={filter.value} value={filter.value}>{filter.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
        <div className="mwd-filter-spacer" />
        <span className="mwd-filter-count" aria-live="polite">{filteredRows.length} shown</span>
        <button
          className="modern-btn secondary"
          type="button"
          onClick={() => {
            setSearchQuery('');
            setStatusFilter('requested');
          }}
        >
          Clear Filters
        </button>
      </div>

      {error ? <div className="mwd-alert danger">{error}</div> : null}

      {loading ? (
        <div className="mwd-state-card">
          <div className="mwd-loading-dot" aria-hidden="true" />
          <div>
            <h3>Loading eSIM requests</h3>
            <p>Pulling latest queue state.</p>
          </div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="mwd-state-card">
          <div>
            <h3>No eSIM requests for this filter.</h3>
            <p>Adjust filters to view matching requests.</p>
          </div>
        </div>
      ) : (
        <div className="mwd-esim-table-wrap">
          <table className="mwd-esim-table">
            <thead>
              <tr>
                <th className="mwd-th">Athlete</th>
                <th className="mwd-th">Trip</th>
                <th className="mwd-th">Destination</th>
                <th className="mwd-th">Dates</th>
                <th className="mwd-th">Residence</th>
                <th className="mwd-th">Eligibility Snapshot</th>
                <th className="mwd-th">Request Date</th>
                <th className="mwd-th">Status</th>
                <th className="mwd-th">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td className="mwd-td">
                    <div className="mwd-athlete-primary">{row.athlete_name || row.athlete_email || row.athlete_id}</div>
                    <div className="mwd-athlete-secondary">{row.athlete_email || row.athlete_id}</div>
                  </td>
                  <td className="mwd-td">
                    <div className="mwd-athlete-primary">{row.trip_name || row.trip_id}</div>
                    <div className="mwd-athlete-secondary">{row.trip_status || 'N/A'}</div>
                  </td>
                  <td className="mwd-td">{row.destination_country_code || 'N/A'}</td>
                  <td className="mwd-td">{formatDateOnly(row.trip_start_date)} - {formatDateOnly(row.trip_end_date)}</td>
                  <td className="mwd-td">{row.residence_country_code || 'N/A'}</td>
                  <td className="mwd-td">{row.eligibility_status || 'unknown'} / {row.international_travel ? 'international' : 'not international'}</td>
                  <td className="mwd-td mwd-time-cell">{formatDate(row.requested_at)}</td>
                  <td className="mwd-td"><span className={statusChipToneClass(row.status)}>{formatStatus(row.status)}</span></td>
                  <td className="mwd-td">
                    <Button size="small" variant="outlined" sx={neutralButtonSx} onClick={() => void openRequest(row)}>
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="lg" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={dialogTitleSx}>eSIM Request Review</DialogTitle>
        <DialogContent sx={dialogContentSx}>
          {selected ? (
            <Box sx={{ mt: 1 }}>
              <Box className="mwd-review-summary-grid">
                <Field label="Who Requested This?" value={selected.athlete_email || selected.athlete_id} />
                <Field label="Which Athlete?" value={selected.athlete_name || selected.athlete_email || selected.athlete_id} />
                <Field label="Which Trip?" value={selected.trip_name || selected.trip_id} />
                <Field label="Destination" value={selected.destination_country_code || 'N/A'} />
                <Field label="Current Workflow Stage" value={formatStatus(selected.status)} />
                <Field label="What Action Is Required Next?" value={requiredNextStep} />
              </Box>

              <Box className="mwd-dialog-section">
                <Typography variant="subtitle1" sx={{ fontWeight: 680, mb: 1 }}>Review Notes</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25 }}>
                  <Field label="Trip Dates" value={`${formatDateOnly(selected.trip_start_date)} - ${formatDateOnly(selected.trip_end_date)}`} />
                  <Field label="Trip Status" value={selected.trip_status || 'N/A'} />
                  <Field label="Residence Country" value={selected.residence_country_code || 'N/A'} />
                  <Field label="Eligibility" value={`${selected.eligibility_status || 'unknown'} / ${selected.international_travel ? 'international' : 'not international'}`} />
                  <Field label="Assignment Confirmation" value={assignmentConfirmed === null ? 'Checking...' : assignmentConfirmed ? 'Confirmed' : 'Not Confirmed'} />
                  <Field label="Athlete Notes" value={selected.athlete_notes || 'None'} />
                </Box>
              </Box>

              <TextField
                fullWidth
                label="Admin Notes"
                value={adminNotes}
                onChange={(event) => setAdminNotes(event.target.value)}
                multiline
                minRows={2}
              />

              <TextField
                fullWidth
                label="Cancellation Reason (required when cancelling)"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
              />

              <Box className="mwd-dialog-section">
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Status History</Typography>
                <Box sx={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #2f3035', borderRadius: 1, p: 1, bgcolor: '#101113' }}>
                  {selectedStatusHistory.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#b7b7bc' }}>No history yet.</Typography>
                  ) : (
                    selectedStatusHistory.map((h) => (
                      <Box key={h.id} sx={{ py: 0.5 }}>
                        <Typography variant="body2">
                          {formatDate(h.created_at)}: {formatStatus(h.from_status)} {' -> '} {formatStatus(h.to_status)}
                        </Typography>
                        {h.reason ? <Typography variant="caption">Reason: {h.reason}</Typography> : null}
                      </Box>
                    ))
                  )}
                </Box>
              </Box>

              <Box className="mwd-dialog-section">
                <Typography variant="subtitle1" sx={{ fontWeight: 680, mb: 1 }}>Provider Actions</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.25 }}>
                  <Button variant="outlined" sx={neutralButtonSx} onClick={() => void refreshRequestDetails()} disabled={requestRefreshWorking || !selected}>
                    {requestRefreshWorking ? 'Refreshing Request...' : 'Refresh Request Data'}
                  </Button>
                  <Button variant="outlined" sx={neutralButtonSx} onClick={() => void refreshCatalogue()} disabled={catalogWorking || selected?.status !== 'approved'}>
                    {catalogWorking ? 'Refreshing...' : 'Refresh Catalogue'}
                  </Button>
                  <Button variant="outlined" sx={neutralButtonSx} onClick={() => void recommendPlan(false)} disabled={recommendWorking || selected?.status !== 'approved'}>
                    {recommendWorking ? 'Recommending...' : 'Recommend Plan'}
                  </Button>
                  <Button variant="outlined" sx={neutralButtonSx} onClick={() => void selectChosenPlan()} disabled={recommendWorking || !selectedPlanId || selected?.status !== 'approved'}>
                    {recommendWorking ? 'Selecting...' : 'Select Chosen Plan'}
                  </Button>
                  <Button variant="contained" sx={primaryButtonSx} onClick={() => void validateOrder()} disabled={validateWorking || !selectedPlanForValidation || selected?.status !== 'approved'}>
                    {validateWorking ? 'Validating...' : 'Validate Order'}
                  </Button>
                  <Button variant="contained" color="success" onClick={() => void provisionOrder()} disabled={provisionWorking || (!canProvision && !canRetryProvisioning)}>
                    {provisionWorking ? 'Provisioning...' : canRetryProvisioning ? 'Retry Provision eSIM' : 'Provision eSIM'}
                  </Button>
                </Box>

                <details className="mwd-advanced-tools">
                  <summary>Advanced Tools</summary>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                    <Button variant="outlined" color="warning" onClick={() => void inspectProviderShape()} disabled={providerShapeWorking || selected?.status !== 'approved'}>
                      {providerShapeWorking ? 'Inspecting...' : 'Inspect Provider Shape'}
                    </Button>
                    <Button variant="outlined" color="warning" onClick={() => void inspectRecommendationAudit()} disabled={recommendAuditWorking || selected?.status !== 'approved'}>
                      {recommendAuditWorking ? 'Inspecting...' : 'Inspect Recommendation Audit'}
                    </Button>
                  </Box>
                </details>
              </Box>

              <Box className="mwd-dialog-section">
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Plan & Cost</Typography>
                <Box sx={{ border: '1px solid #2f3035', borderRadius: 1, p: 1.5, bgcolor: '#101113' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>Workflow Status: {workflowStatusLabel}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', mb: 1.25, color: '#bdbdbd' }}>
                    Requested {'->'} Approved {'->'} Recommendation Ready {'->'} Selected {'->'} Validation Passed {'->'} Provisioning {'->'} Provisioned {'->'} Ready for Athlete Installation
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>Catalogue fetched: {catalogFetchedAt ? formatDate(catalogFetchedAt) : 'Not fetched yet'}</Typography>

                  {recommendationPlan ? (
                    <Box sx={{ mb: 1.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>Recommended Plan</Typography>
                      <Typography variant="body2">{recommendationPlan.name || 'Unknown plan'}</Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>Provider Bundle ID: {recommendationPlan.providerBundleId || 'N/A'}</Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        Data: {recommendationPlan.dataAllowance || 'N/A'} · Validity: {recommendationPlan.validityDays ?? 'N/A'} days · Price: {recommendationPlan.priceAmount ?? 'N/A'} {recommendationPlan.priceCurrency || ''}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        Destination: {recommendationContext.destinationCountryCode || 'N/A'} · Trip Duration: {recommendationContext.tripDurationDays ?? 'N/A'} days
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>Compromise: {recommendationPlan.isCompromise ? 'Yes' : 'No'}</Typography>
                      {recommendationPlan.recommendationReason ? (
                        <Typography variant="caption" sx={{ display: 'block' }}>Reason: {recommendationPlan.recommendationReason}</Typography>
                      ) : null}
                      <Button variant="contained" sx={{ ...primaryButtonSx, mt: 1 }} onClick={() => void applyRecommendedPlan()} disabled={recommendWorking || selected?.status !== 'approved'}>
                        Use Recommended Plan
                      </Button>
                    </Box>
                  ) : (
                    <Typography variant="body2" sx={{ mb: 1.5 }}>Recommendation has not been generated</Typography>
                  )}

                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Selected Plan</Typography>
                    {selectedSelection ? (
                      <>
                        <Typography variant="body2">{selectedSelection.plan_name_snapshot}</Typography>
                        <Typography variant="caption" sx={{ display: 'block' }}>Provider Bundle ID: {selectedSelection.provider_bundle_id_snapshot}</Typography>
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          {selectedSelection.data_allowance_snapshot} · {selectedSelection.validity_days_snapshot} days · {selectedSelection.estimated_price_amount ?? 'N/A'} {selectedSelection.estimated_price_currency || ''}
                        </Typography>
                      </>
                    ) : (
                      <Typography variant="body2">No selected plan yet.</Typography>
                    )}
                  </Box>

                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>Alternative Plans</Typography>
                    {recommendationAlternatives.length > 0 ? (
                      recommendationAlternatives.map((alt) => (
                        <Box key={alt.planId} sx={{ border: '1px solid #555', borderRadius: 1, p: 1, mb: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{alt.name || alt.planId}</Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {alt.dataAllowance || 'N/A'} · {alt.validityDays ?? 'N/A'} days · {alt.priceAmount ?? 'N/A'} {alt.priceCurrency || ''}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            Meets validity: {alt.meetsValidity === null ? 'Unknown' : alt.meetsValidity ? 'Yes' : 'No'} · Meets data: {alt.meetsDataRequirement === null ? 'Unknown' : alt.meetsDataRequirement ? 'Yes' : 'No'}
                          </Typography>
                          <Button variant="outlined" size="small" sx={{ ...neutralButtonSx, mt: 0.5 }} onClick={() => void selectAlternativePlan(alt.planId)} disabled={recommendWorking || selected?.status !== 'approved'}>
                            Select This Alternative
                          </Button>
                        </Box>
                      ))
                    ) : (
                      <Typography variant="body2">No recommendation alternatives returned.</Typography>
                    )}
                  </Box>

                  <TextField
                    select
                    fullWidth
                    label="Choose a Different Plan"
                    value={selectedPlanId}
                    onChange={(event) => setSelectedPlanId(event.target.value)}
                    sx={{ mb: 1.5 }}
                    disabled={selected?.status !== 'approved'}
                  >
                    {catalogPlans.map((plan) => (
                      <MenuItem key={plan.id} value={plan.id}>
                        {plan.name} · {plan.data_amount_display} · {plan.validity_days}d · {plan.price_amount ?? 'N/A'} {plan.price_currency || ''}
                      </MenuItem>
                    ))}
                  </TextField>

                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>Validation Result</Typography>
                    {latestValidation ? (
                      <>
                        <Typography variant="body2">Status: {formatStatus(latestValidation.status)}</Typography>
                        <Typography variant="body2">Cost: {latestValidation.validated_price_amount ?? 'N/A'} {latestValidation.validated_price_currency || ''}</Typography>
                        <Typography variant="body2">Balance: {latestValidation.balance_sufficient === null ? 'Unknown' : latestValidation.balance_sufficient ? 'Sufficient' : 'Insufficient'}</Typography>
                        <Typography variant="body2">Validated At: {formatDate(latestValidation.completed_at || latestValidation.requested_at)}</Typography>
                        {latestValidation.provider_error_message ? <Typography variant="caption">Provider-safe error: {latestValidation.provider_error_message}</Typography> : null}
                        {latestValidation.status === 'passed' ? <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 700 }}>Validation passed</Typography> : null}
                      </>
                    ) : (
                      <Typography variant="body2">Validation has not been run yet.</Typography>
                    )}
                  </Box>
                </Box>
              </Box>

              <Box className="mwd-dialog-section">
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Lifecycle</Typography>
                <Box sx={{ border: '1px solid #2f3035', borderRadius: 1, p: 1.5, bgcolor: '#101113' }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>Provisioning</Typography>
                  <Typography variant="body2">Current provisioning status: {provisioningStatusLabel}</Typography>
                  <Typography variant="body2">Order reference: {provisioningState?.providerOrderReference || latestValidation?.provider_order_reference || 'N/A'}</Typography>
                  <Typography variant="body2">ICCID: {provisioningState?.iccid || 'N/A'}</Typography>
                  <Typography variant="body2">Matching ID: {provisioningState?.matchingId || 'N/A'}</Typography>
                  <Typography variant="body2">Activation code available: {provisioningState?.activationCodeAvailable === null ? 'Unknown' : provisioningState?.activationCodeAvailable ? 'Yes' : 'No'}</Typography>
                  <Typography variant="body2">QR available: {provisioningState?.qrAvailable === null ? 'Unknown' : provisioningState?.qrAvailable ? 'Yes' : 'No'}</Typography>
                  <Typography variant="body2">Provisioned timestamp: {formatDate(provisioningState?.provisionedAt || null)}</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: provisioningState?.readyForAthleteInstallation ? '#81c784' : '#e0e0e0' }}>
                    {provisioningState?.readyForAthleteInstallation ? 'Ready for Athlete Installation' : 'Not ready for athlete installation'}
                  </Typography>
                  {provisioningState?.providerError ? <Typography variant="caption" sx={{ color: '#ff8a80', display: 'block', mt: 0.5 }}>Provider error: {provisioningState.providerError}</Typography> : null}
                  {hasProvisionedAssignment ? <Typography variant="caption" sx={{ color: '#81c784', display: 'block', mt: 0.5 }}>Existing assignment detected. Provisioning retry is disabled.</Typography> : null}

                  <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px solid #444' }}>
                    {lifecycleReadIssue ? <Typography variant="caption" sx={{ color: '#ffb74d', display: 'block', mb: 1 }}>{lifecycleReadIssue}</Typography> : null}

                    {lifecycleState?.exists ? (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>Installation</Typography>
                        <Typography variant="body2">Status: {lifecycleState.installationStatus === 'installed' ? 'Installed' : 'Ready to Install'}</Typography>
                        <Typography variant="body2">Installed at: {formatDate(lifecycleState.installedAt)}</Typography>
                        <Typography variant="body2">Device platform: {lifecycleState.devicePlatform || 'N/A'}</Typography>

                        <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>Activation</Typography>
                        <Typography variant="body2">Status: {formatLifecycleStatusLabel(lifecycleState.activationStatus)}</Typography>
                        <Typography variant="body2">Activated at: {formatDate(lifecycleState.activatedAt)}</Typography>
                        <Typography variant="body2">Last checked: {formatDate(lifecycleState.lastCheckedAt)}</Typography>
                        <Typography variant="body2">Provider profile status: {lifecycleState.providerProfileStatus || 'N/A'}</Typography>
                        <Typography variant="body2">Provider bundle status: {lifecycleState.providerBundleStatus || 'N/A'}</Typography>

                        <Typography variant="body2" sx={{ fontWeight: 700, mt: 1 }}>Usage</Typography>
                        <Typography variant="body2">Initial data: {lifecycleState.initialData || 'N/A'}</Typography>
                        <Typography variant="body2">Used data: {lifecycleState.usedData || 'N/A'}</Typography>
                        <Typography variant="body2">Remaining data: {lifecycleState.remainingData || 'N/A'}</Typography>
                        <Typography variant="body2">Bundle expiry: {formatDate(lifecycleState.bundleExpiry)}</Typography>
                        <Typography variant="body2">Expired at: {formatDate(lifecycleState.expiredAt)}</Typography>

                        {lifecycleState.isMock ? <Typography variant="caption" sx={{ color: '#ffb74d', fontWeight: 700, display: 'block', mt: 1 }}>{lifecycleState.mockWarning}</Typography> : null}
                      </>
                    ) : (
                      <Typography variant="body2">Lifecycle not started</Typography>
                    )}

                    <Box sx={{ mt: 1.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.75 }}>Lifecycle Timeline</Typography>
                      <Box sx={{ borderLeft: '2px solid #555', pl: 1.25 }}>
                        {lifecycleTimeline.map((stage) => (
                          <Box key={stage.label} sx={{ mb: 0.75 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{stage.label}</Typography>
                            {stage.timestamp ? <Typography variant="caption" sx={{ color: '#bdbdbd' }}>{formatDate(stage.timestamp)}</Typography> : null}
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ ...dialogActionsSx, justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ color: '#9fa0a5', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.55 }}>Review Actions</Typography>
            <Button sx={neutralButtonSx} variant="outlined" onClick={() => void submitReview('under_review')} disabled={reviewing || !selected || selected.status === 'under_review' || selected.status === 'approved' || selected.status === 'cancelled'}>
              Mark Under Review
            </Button>
            <Button color="success" variant="contained" onClick={() => void submitReview('approved')} disabled={reviewing || !selected || selected.status === 'approved' || selected.status === 'cancelled'}>
              Approve
            </Button>
            <Button sx={destructiveButtonSx} variant="contained" onClick={() => void submitReview('cancelled')} disabled={reviewing || !selected || selected.status === 'cancelled'}>
              Cancel Request
            </Button>
          </Box>
          <Button sx={neutralButtonSx} variant="outlined" onClick={() => setSelected(null)} disabled={reviewing}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => closeConfirmation(false)} maxWidth="xs" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={dialogTitleSx}>Confirm Action</DialogTitle>
        <DialogContent sx={dialogContentSx}>
          <Typography>{confirmMessage}</Typography>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button variant="outlined" sx={neutralButtonSx} onClick={() => closeConfirmation(false)}>Cancel</Button>
          <Button variant="contained" sx={primaryButtonSx} onClick={() => closeConfirmation(true)}>Confirm</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={providerShapeOpen} onClose={() => setProviderShapeOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={dialogTitleSx}>Inspect Provider Shape (Debug Only)</DialogTitle>
        <DialogContent sx={dialogContentSx}>
          <Typography variant="caption" sx={{ color: '#ffb74d', fontWeight: 700, display: 'block', mb: 1 }}>
            DEBUG ONLY - Remove after Phase 2 catalogue parser validation.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Showing only safe summary fields. Raw provider payloads and secrets are intentionally excluded.
          </Typography>
          <Box component="pre" sx={{ m: 0, p: 1.5, borderRadius: 1, bgcolor: '#121212', color: '#e0e0e0', maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid #333' }}>
            {providerShapeJson || '{}'}
          </Box>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button variant="outlined" sx={neutralButtonSx} onClick={() => setProviderShapeOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={recommendAuditOpen} onClose={() => setRecommendAuditOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={dialogTitleSx}>Inspect Recommendation Audit (Debug Only)</DialogTitle>
        <DialogContent sx={dialogContentSx}>
          <Typography variant="caption" sx={{ color: '#ffb74d', fontWeight: 700, display: 'block', mb: 1.5 }}>
            DEBUG ONLY - Remove after recommendation validation.
          </Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Full safe audit response (pretty-printed). Sensitive fields and raw provider payloads are redacted.
          </Typography>
          <Box component="pre" sx={{ m: 0, p: 1.5, borderRadius: 1, bgcolor: '#121212', color: '#e0e0e0', maxHeight: 420, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', border: '1px solid #333' }}>
            {recommendAuditJson || '{}'}
          </Box>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button variant="outlined" sx={neutralButtonSx} onClick={() => setRecommendAuditOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box className="mwd-field-card">
      <Typography variant="caption" sx={{ color: '#8f9096', letterSpacing: 0.38 }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: '#ececee', fontWeight: 620 }}>{value}</Typography>
    </Box>
  );
}
