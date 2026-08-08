import * as React from 'react';
import { supabase } from '../supabaseClient';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import MenuItem from '@mui/material/MenuItem';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Tooltip from '@mui/material/Tooltip';
import DialogContentText from '@mui/material/DialogContentText';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import ReferenceAutocomplete from './ReferenceAutocomplete';
import {
  AIRPORT_OPTIONS,
  COUNTRY_OPTIONS,
  TIMEZONE_OPTIONS,
} from '../referenceData/travelReferences';

type Athlete = {
  id: string;
  name: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
  position: string | null;
  team: string | null;
  emergency_contact: string | null;
  notes: string | null;
  user_id: string | null;
  residence_country_code: string | null;
  home_timezone: string | null;
  preferred_airport_code: string | null;
  nationality_country_code: string | null;
  home_city: string | null;
  home_region: string | null;
};

type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type Candidate = {
  auth_user_id: string;
  full_name: string | null;
  email: string | null;
  provisioned: boolean;
  role: string | null;
  status: string | null;
  linked_athlete_id?: string;
  linked: boolean;
};

type OnboardingState = {
  athlete_id: string;
  invitation_id: string | null;
  invitation_status: 'Not Invited' | 'Invitation Sent' | 'Invitation Accepted' | 'Linked' | 'Expired' | string;
  invitation_email: string | null;
  invitation_sent_at: string | null;
  invitation_expires_at: string | null;
  invitation_accepted_at: string | null;
  invitation_revoked_at: string | null;
};

type AthletesProps = {
  onboardRequestKey?: number;
  onOnboardRequestHandled?: () => void;
};

const INVITATION_BASE_URL = process.env.REACT_APP_ATHLETE_INVITATION_BASE_URL || 'https://birdsofprey.app/signup';

export default function Athletes({ onboardRequestKey = 0, onOnboardRequestHandled }: AthletesProps) {
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
    '& .MuiFormHelperText-root': {
      marginLeft: 0,
      color: '#8f8f94',
    },
    '& .MuiFormHelperText-root.Mui-error': { color: '#d98f8f' },
    '& .MuiAutocomplete-endAdornment .MuiSvgIcon-root': { color: '#9fa0a5' },
  };
  const sectionLabelSx = {
    color: '#9a9a9f',
    fontSize: 12,
    letterSpacing: 0.65,
    textTransform: 'uppercase',
    mb: 0.75,
    mt: 1.25,
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
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [athletes, setAthletes] = React.useState<Athlete[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [open, setOpen] = React.useState(false);
  const [onboardMode, setOnboardMode] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    status: 'Active',
    email: '',
    phone: '',
    dob: '',
    position: '',
    team: '',
    emergency_contact: '',
    notes: '',
    residence_country_code: '',
    home_timezone: '',
    preferred_airport_code: '',
    nationality_country_code: '',
    home_city: '',
    home_region: '',
  });
  const [formErrors, setFormErrors] = React.useState<Record<string, string>>({});
  const [editId, setEditId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState('');
  const [successMsg, setSuccessMsg] = React.useState('');

  const [profilesByUserId, setProfilesByUserId] = React.useState<Record<string, ProfileLite>>({});
  const [linkedAtByAthleteId, setLinkedAtByAthleteId] = React.useState<Record<string, string>>({});
  const [onboardingByAthleteId, setOnboardingByAthleteId] = React.useState<Record<string, OnboardingState>>({});
  const [duplicateEmailNorms, setDuplicateEmailNorms] = React.useState<Set<string>>(new Set());

  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const [unlinkAthlete, setUnlinkAthlete] = React.useState<Athlete | null>(null);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = React.useState(false);

  const [revokeAthlete, setRevokeAthlete] = React.useState<Athlete | null>(null);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = React.useState(false);

  const [linkMode, setLinkMode] = React.useState<'link' | 'relink'>('link');
  const [linkAthlete, setLinkAthlete] = React.useState<Athlete | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = React.useState(false);
  const [candidateQuery, setCandidateQuery] = React.useState('');
  const [candidateLoading, setCandidateLoading] = React.useState(false);
  const [candidateError, setCandidateError] = React.useState('');
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = React.useState<Candidate | null>(null);
  const [linkSubmitting, setLinkSubmitting] = React.useState(false);

  const normalizeEmail = React.useCallback((value: string | null | undefined) => {
    return (value || '').trim().toLowerCase();
  }, []);

  const fetchOnboardingStates = React.useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_get_athlete_onboarding_states');
    if (error) {
      return;
    }

    const map: Record<string, OnboardingState> = {};
    ((data || []) as OnboardingState[]).forEach((row) => {
      map[row.athlete_id] = row;
    });
    setOnboardingByAthleteId(map);
  }, []);

  const fetchAthletes = React.useCallback(async () => {
    setLoading(true);
    setErrorMsg('');

    const { data: athleteRows, error: athleteError } = await supabase
      .from('athletes')
      .select('*')
      .order('name', { ascending: true });

    if (athleteError) {
      setErrorMsg(athleteError.message || 'Failed to fetch athletes.');
      setAthletes([]);
      setLoading(false);
      return;
    }

    const nextAthletes = (athleteRows || []) as Athlete[];
    setAthletes(nextAthletes);

    const emailCounts: Record<string, number> = {};
    nextAthletes.forEach((a) => {
      const norm = normalizeEmail(a.email);
      if (!norm) return;
      emailCounts[norm] = (emailCounts[norm] || 0) + 1;
    });
    const dupes = new Set(Object.keys(emailCounts).filter((k) => emailCounts[k] > 1));
    setDuplicateEmailNorms(dupes);

    const userIds = Array.from(new Set(nextAthletes.map((a) => a.user_id).filter(Boolean))) as string[];

    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

      const profileMap: Record<string, ProfileLite> = {};
      (profileRows || []).forEach((p: any) => {
        profileMap[p.id] = p as ProfileLite;
      });
      setProfilesByUserId(profileMap);
    } else {
      setProfilesByUserId({});
    }

    const { data: auditRows } = await supabase
      .from('athlete_identity_link_audit')
      .select('athlete_id, created_at, operation')
      .in('operation', ['automatic_self_link', 'admin_link', 'admin_relink'])
      .order('created_at', { ascending: false })
      .limit(500);

    const linkedAtMap: Record<string, string> = {};
    (auditRows || []).forEach((row: any) => {
      if (!linkedAtMap[row.athlete_id]) {
        linkedAtMap[row.athlete_id] = row.created_at as string;
      }
    });
    setLinkedAtByAthleteId(linkedAtMap);

    setLoading(false);
  }, [normalizeEmail]);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([fetchAthletes(), fetchOnboardingStates()]);
  }, [fetchAthletes, fetchOnboardingStates]);

  const runCandidateSearch = React.useCallback(async (rawQuery: string) => {
    if (!linkAthlete) return;

    setCandidateLoading(true);
    setCandidateError('');

    const trimmed = rawQuery.trim();
    const { data, error } = await supabase.rpc('admin_search_link_candidates', {
      p_query: trimmed.length > 0 ? trimmed : null,
      p_limit: 25,
      p_include_linked: linkMode === 'relink',
      p_exclude_athlete_id: linkAthlete.id,
    });

    setCandidateLoading(false);

    if (error) {
      setCandidates([]);
      setCandidateError(error.message || 'Failed to search accounts.');
      return;
    }

    const rows = ((data || []) as any[])
      .map((row) => {
        const linkedAthleteId = row.linked_athlete_id ?? row.athlete_id ?? null;
        const provisioned = typeof row.provisioned === 'boolean' ? row.provisioned : false;
        return {
          auth_user_id: (row.auth_user_id ?? row.user_id ?? '').toString(),
          full_name: row.full_name ?? null,
          email: row.email ?? null,
          provisioned,
          role: row.role ?? null,
          status: row.status ?? null,
          linked_athlete_id: linkedAthleteId ?? undefined,
          linked: typeof row.linked === 'boolean' ? row.linked : linkedAthleteId != null,
        } as Candidate;
      })
      .filter((row) => row.auth_user_id)
      .filter((row) => {
        if (linkMode === 'link') return !row.linked;
        return true;
      });

    setCandidates(rows);
  }, [linkAthlete, linkMode]);

  const handleCompleteAccountSetup = React.useCallback(async () => {
    if (!selectedCandidate) {
      setCandidateError('Select an account first.');
      return;
    }

    setLinkSubmitting(true);
    setCandidateError('');

    const { data, error } = await supabase.rpc('admin_repair_link_candidate_account', {
      p_auth_user_id: selectedCandidate.auth_user_id,
      p_source: 'admin_portal',
    });

    setLinkSubmitting(false);

    if (error) {
      setCandidateError(error.message || 'Failed to complete account setup.');
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const resultStatus = result?.status as string | undefined;
    const resultMessage = (result?.message as string | undefined) || 'Account setup check completed.';

    if (resultStatus !== 'ok') {
      setCandidateError(resultMessage);
      return;
    }

    setSuccessMsg('Account setup completed. You can now link this account.');
    await runCandidateSearch(candidateQuery);
  }, [candidateQuery, runCandidateSearch, selectedCandidate]);

  React.useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  React.useEffect(() => {
    if (!linkDialogOpen || !linkAthlete) return;
    const timeout = setTimeout(() => {
      runCandidateSearch(candidateQuery);
    }, 250);
    return () => clearTimeout(timeout);
  }, [candidateQuery, linkDialogOpen, linkAthlete, runCandidateSearch]);

  React.useEffect(() => {
    if (!onboardRequestKey) return;
    setOnboardMode(true);
    setEditId(null);
    setForm({
      name: '',
      status: 'Active',
      email: '',
      phone: '',
      dob: '',
      position: '',
      team: '',
      emergency_contact: '',
      notes: '',
      residence_country_code: '',
      home_timezone: '',
      preferred_airport_code: '',
      nationality_country_code: '',
      home_city: '',
      home_region: '',
    });
    setOpen(true);
    onOnboardRequestHandled?.();
  }, [onOnboardRequestHandled, onboardRequestKey]);

  const buildEditablePayload = React.useCallback(() => {
    return {
      name: form.name,
      status: form.status,
      email: form.email,
      phone: form.phone,
      dob: form.dob,
      position: form.position,
      team: form.team,
      emergency_contact: form.emergency_contact,
      notes: form.notes,
      residence_country_code: form.residence_country_code.trim().toUpperCase() || null,
      home_timezone: form.home_timezone.trim() || null,
      preferred_airport_code: form.preferred_airport_code.trim().toUpperCase() || null,
      nationality_country_code: form.nationality_country_code.trim().toUpperCase() || null,
      home_city: form.home_city.trim() || null,
      home_region: form.home_region.trim() || null,
    };
  }, [form]);

  const sendInvitationEmail = React.useCallback(async (params: {
    toEmail: string;
    athleteName: string | null;
    invitationUrl: string;
    expiresAt: string | null;
  }) => {
    const { error } = await supabase.functions.invoke('send-athlete-invitation', {
      body: {
        to_email: params.toEmail,
        athlete_name: params.athleteName,
        invitation_url: params.invitationUrl,
        expires_at: params.expiresAt,
      },
    });

    if (error) {
      throw new Error(error.message || 'Failed to send invitation email.');
    }
  }, []);

  const issueInvitation = React.useCallback(async (athlete: Athlete, mode: 'send' | 'resend') => {
    if (athlete.user_id) {
      setErrorMsg('Linked athletes cannot be invited.');
      return;
    }

    const rpcName = mode === 'send' ? 'admin_create_athlete_invitation' : 'admin_resend_athlete_invitation';
    const { data, error } = await supabase.rpc(rpcName, {
      p_athlete_id: athlete.id,
      p_invitation_base_url: INVITATION_BASE_URL,
      p_valid_for_hours: 168,
      p_source: 'admin_portal',
    });

    if (error) {
      setErrorMsg(error.message || 'Failed to create invitation.');
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const status = result?.status as string | undefined;

    if (status === 'already_invited') {
      setErrorMsg('An active invitation already exists. Revoke or wait for expiration before sending a new one.');
      await fetchOnboardingStates();
      return;
    }

    if (status !== 'invited') {
      setErrorMsg((result?.message as string | undefined) || 'Invitation could not be sent.');
      await fetchOnboardingStates();
      return;
    }

    const inviteUrl = result?.invitation_url as string | undefined;
    const inviteEmail = (result?.invitation_email as string | undefined) || athlete.email || '';

    if (!inviteUrl || !inviteEmail) {
      setErrorMsg('Invitation was created, but missing email payload for delivery.');
      await fetchOnboardingStates();
      return;
    }

    try {
      await sendInvitationEmail({
        toEmail: inviteEmail,
        athleteName: athlete.name,
        invitationUrl: inviteUrl,
        expiresAt: (result?.expires_at as string | undefined) || null,
      });
      setSuccessMsg(mode === 'send' ? 'Invitation sent.' : 'Invitation resent.');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Invitation created but email delivery failed.');
    }

    await fetchOnboardingStates();
  }, [fetchOnboardingStates, sendInvitationEmail]);

  const revokeInvitation = React.useCallback(async (athlete: Athlete) => {
    const { data, error } = await supabase.rpc('admin_revoke_athlete_invitation', {
      p_athlete_id: athlete.id,
      p_reason: 'revoked_by_admin',
      p_source: 'admin_portal',
    });

    if (error) {
      setErrorMsg(error.message || 'Failed to revoke invitation.');
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    setSuccessMsg((result?.message as string | undefined) || 'Invitation revoked.');
    await fetchOnboardingStates();
  }, [fetchOnboardingStates]);

  async function addOrEditAthlete() {
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (!form.email.trim()) errors.email = 'Email is required.';
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Invalid email format.';
    if (!form.phone.trim()) errors.phone = 'Phone is required.';
    else if (!/^\d{10,}$/.test(form.phone.replace(/\D/g, ''))) errors.phone = 'Invalid phone number.';
    if (!form.status.trim()) errors.status = 'Status is required.';
    if (!form.position.trim()) errors.position = 'Position is required.';
    if (!form.team.trim()) errors.team = 'Team is required.';
    if (!form.emergency_contact.trim()) errors.emergency_contact = 'Emergency contact is required.';
    if (!form.residence_country_code.trim()) errors.residence_country_code = 'Residence country is required.';
    if (!form.home_timezone.trim()) errors.home_timezone = 'Home timezone is required.';

    const residenceCountryCode = form.residence_country_code.trim().toUpperCase();
    const nationalityCountryCode = form.nationality_country_code.trim().toUpperCase();
    const airportCode = form.preferred_airport_code.trim().toUpperCase();

    if (residenceCountryCode && !/^[A-Z]{2}$/.test(residenceCountryCode)) {
      errors.residence_country_code = 'Use a 2-letter ISO country code (e.g. US).';
    }
    if (nationalityCountryCode && !/^[A-Z]{2}$/.test(nationalityCountryCode)) {
      errors.nationality_country_code = 'Use a 2-letter ISO country code (e.g. NG).';
    }
    if (airportCode && !/^[A-Z]{3}$/.test(airportCode)) {
      errors.preferred_airport_code = 'Use a 3-letter IATA code (e.g. JFK).';
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      setSaving(false);
      setErrorMsg('Please fix the errors above.');
      return;
    }

    const payload = buildEditablePayload();

    if (editId) {
      const { error } = await supabase.from('athletes').update(payload).eq('id', editId);
      setSaving(false);

      if (error) {
        setErrorMsg(error.message || 'Failed to save athlete.');
        return;
      }

      setOpen(false);
      setEditId(null);
      setOnboardMode(false);
      setFormErrors({});
      setSuccessMsg('Athlete updated.');
      await refreshAll();
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('athletes')
      .insert([payload])
      .select('*')
      .single();

    setSaving(false);

    if (insertError || !inserted) {
      setErrorMsg(insertError?.message || 'Failed to create athlete.');
      return;
    }

    setSuccessMsg('Athlete created. Send an invitation when you are ready to begin onboarding.');
    setSearch((inserted.name || inserted.email || '').toString());

    setOpen(false);
    setForm({
      name: '',
      status: 'Active',
      email: '',
      phone: '',
      dob: '',
      position: '',
      team: '',
      emergency_contact: '',
      notes: '',
      residence_country_code: '',
      home_timezone: '',
      preferred_airport_code: '',
      nationality_country_code: '',
      home_city: '',
      home_region: '',
    });
    setEditId(null);
    setOnboardMode(false);
    setFormErrors({});
    await refreshAll();
  }

  async function deleteAthlete(id: string) {
    setDeleteId(id);
    setDeleteDialogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('athletes').delete().eq('id', deleteId);
    setDeleteDialogOpen(false);
    setDeleteId(null);
    if (!error) {
      setSuccessMsg('Athlete deleted.');
      await refreshAll();
    } else {
      setErrorMsg(error.message || 'Failed to delete athlete.');
    }
  }

  function openEdit(athlete: Athlete) {
    setForm({
      name: athlete.name || '',
      status: athlete.status || 'Active',
      email: athlete.email || '',
      phone: athlete.phone || '',
      dob: athlete.dob || '',
      position: athlete.position || '',
      team: athlete.team || '',
      emergency_contact: athlete.emergency_contact || '',
      notes: athlete.notes || '',
      residence_country_code: athlete.residence_country_code || '',
      home_timezone: athlete.home_timezone || '',
      preferred_airport_code: athlete.preferred_airport_code || '',
      nationality_country_code: athlete.nationality_country_code || '',
      home_city: athlete.home_city || '',
      home_region: athlete.home_region || '',
    });
    setEditId(athlete.id);
    setOnboardMode(false);
    setOpen(true);
  }

  function getAccountStatus(athlete: Athlete): { label: 'Linked' | 'Not Linked' | 'Conflict'; color: 'success' | 'warning' | 'error' } {
    if (athlete.user_id) return { label: 'Linked', color: 'success' };
    if (duplicateEmailNorms.has(normalizeEmail(athlete.email))) return { label: 'Conflict', color: 'error' };
    return { label: 'Not Linked', color: 'warning' };
  }

  function getOnboardingChip(athlete: Athlete) {
    const row = onboardingByAthleteId[athlete.id];
    const label = row?.invitation_status || (athlete.user_id ? 'Linked' : 'Not Invited');

    if (label === 'Linked') return { label, color: 'success' as const };
    if (label === 'Invitation Sent') return { label, color: 'info' as const };
    if (label === 'Invitation Accepted') return { label, color: 'primary' as const };
    if (label === 'Expired') return { label, color: 'warning' as const };
    return { label: 'Not Invited', color: 'default' as const };
  }

  function getTravelProfileChip(athlete: Athlete) {
    const hasResidence = !!athlete.residence_country_code?.trim();
    const hasTimezone = !!athlete.home_timezone?.trim();
    if (hasResidence && hasTimezone) return { label: 'Complete', color: 'success' as const };
    return { label: 'Incomplete', color: 'warning' as const };
  }

  function openLinkDialog(athlete: Athlete, mode: 'link' | 'relink') {
    setLinkMode(mode);
    setLinkAthlete(athlete);
    setCandidateQuery('');
    setCandidates([]);
    setCandidateError('');
    setSelectedCandidate(null);
    setLinkDialogOpen(true);
    runCandidateSearch('');
  }

  async function handleSubmitLinkAction() {
    if (!linkAthlete || !selectedCandidate) {
      setCandidateError('Select an account first.');
      return;
    }

    setLinkSubmitting(true);
    setCandidateError('');

    const rpcName = linkMode === 'link' ? 'admin_link_athlete_account' : 'admin_relink_athlete_account';
    const payload = {
      p_athlete_id: linkAthlete.id,
      p_target_user_id: selectedCandidate.auth_user_id,
      p_source: 'admin_portal',
    };

    const { data, error } = await supabase.rpc(rpcName, payload);

    setLinkSubmitting(false);

    if (error) {
      setCandidateError(error.message || 'Link operation failed.');
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    const resultStatus = result?.status as string | undefined;
    const resultMessage = (result?.message as string | undefined) || 'Operation completed.';

    if (resultStatus === 'linked' || resultStatus === 'relinked' || resultStatus === 'already_linked') {
      setSuccessMsg(resultMessage);
      setLinkDialogOpen(false);
      setLinkAthlete(null);
      setSelectedCandidate(null);
      await refreshAll();
      return;
    }

    setCandidateError(resultMessage);
  }

  async function handleUnlinkConfirmed() {
    if (!unlinkAthlete) return;

    const { data, error } = await supabase.rpc('admin_unlink_athlete_account', {
      p_athlete_id: unlinkAthlete.id,
      p_source: 'admin_portal',
    });

    setUnlinkConfirmOpen(false);

    if (error) {
      setErrorMsg(error.message || 'Unlink failed.');
      return;
    }

    const result = Array.isArray(data) ? data[0] : data;
    setSuccessMsg((result?.message as string | undefined) || 'Unlinked successfully.');
    setUnlinkAthlete(null);
    await refreshAll();
  }

  const filteredAthletes = React.useMemo(() => {
    const q = search.toLowerCase();
    return athletes.filter((a) => {
      const matches =
        (a.name || '').toLowerCase().includes(q) ||
        (a.email || '').toLowerCase().includes(q) ||
        (a.team || '').toLowerCase().includes(q);
      const statusOk = !statusFilter || a.status === statusFilter;
      return matches && statusOk;
    });
  }, [athletes, search, statusFilter]);

  const rosterSummary = React.useMemo(() => {
    let active = 0;
    let inactive = 0;
    let suspended = 0;
    let retired = 0;
    let invitationSent = 0;
    let notLinked = 0;
    let conflicts = 0;
    let travelIncomplete = 0;

    athletes.forEach((athlete) => {
      const status = (athlete.status || '').trim().toLowerCase();
      if (status === 'active') active += 1;
      if (status === 'inactive') inactive += 1;
      if (status === 'suspended') suspended += 1;
      if (status === 'retired') retired += 1;

      const onboardingRow = onboardingByAthleteId[athlete.id];
      const onboardingLabel = onboardingRow?.invitation_status || (athlete.user_id ? 'Linked' : 'Not Invited');
      if (onboardingLabel === 'Invitation Sent') invitationSent += 1;

      const normalizedEmail = normalizeEmail(athlete.email);
      const accountLabel = athlete.user_id ? 'Linked' : (duplicateEmailNorms.has(normalizedEmail) ? 'Conflict' : 'Not Linked');
      if (accountLabel === 'Not Linked') notLinked += 1;
      if (accountLabel === 'Conflict') conflicts += 1;

      const hasResidence = !!athlete.residence_country_code?.trim();
      const hasTimezone = !!athlete.home_timezone?.trim();
      const travelLabel = hasResidence && hasTimezone ? 'Complete' : 'Incomplete';
      if (travelLabel === 'Incomplete') travelIncomplete += 1;
    });

    return {
      active,
      inactive,
      suspended,
      retired,
      invitationSent,
      notLinked,
      conflicts,
      travelIncomplete,
      total: athletes.length,
    };
  }, [athletes, duplicateEmailNorms, onboardingByAthleteId, normalizeEmail]);

  return (
    <Box sx={{ bgcolor: '#0d0d0e', minHeight: '100vh', px: { xs: 2, sm: 3, md: 4 }, py: { xs: 3, sm: 4 }, position: 'relative' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', position: 'relative' }}>
      {(loading || saving || linkSubmitting) && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            bgcolor: 'rgba(9,9,10,0.55)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 3,
          }}
        >
          <span className="visually-hidden">Loading...</span>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="20" stroke="#e53935" strokeWidth="4" strokeDasharray="100" strokeDashoffset="60" />
          </svg>
        </Box>
      )}

      <Box
        sx={{
          mb: 3,
          p: { xs: 2.25, sm: 2.75 },
          borderRadius: 3,
          border: '1px solid #2a2a2d',
          bgcolor: '#151517',
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
        }}
      >
        <Box>
          <Typography sx={{ color: '#8e8e92', fontSize: 12, letterSpacing: 0.9, textTransform: 'uppercase', mb: 0.75 }}>
            MWD Command & Control
          </Typography>
          <Typography variant="h4" sx={{ color: '#fff', fontWeight: 720, letterSpacing: 0.1, mb: 0.5 }}>
            Athlete Profiles
          </Typography>
          <Typography variant="body2" sx={{ color: '#a8a8ac' }}>
            Operational roster visibility for readiness, onboarding, and account linkage.
          </Typography>
        </Box>

        <Button
          variant="contained"
          onClick={() => {
            setOpen(true);
            setEditId(null);
            setOnboardMode(false);
            setForm({
              name: '',
              status: 'Active',
              email: '',
              phone: '',
              dob: '',
              position: '',
              team: '',
              emergency_contact: '',
              notes: '',
              residence_country_code: '',
              home_timezone: '',
              preferred_airport_code: '',
              nationality_country_code: '',
              home_city: '',
              home_region: '',
            });
          }}
          sx={{
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: 2,
            px: 2,
            bgcolor: ACCENT_ORANGE,
            '&:hover': { bgcolor: ACCENT_ORANGE_DIM },
          }}
        >
          + Add Athlete
        </Button>
      </Box>

      <Card
        sx={{
          bgcolor: '#151517',
          color: '#fff',
          borderRadius: 3,
          border: '1px solid #2b2b2e',
          boxShadow: 'none',
          mb: 2.25,
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Typography sx={{ color: '#9a9a9f', fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.6, mb: 0.8 }}>
            Operations Brief
          </Typography>
          <Typography variant="h6" sx={{ color: '#f3f3f4', fontWeight: 660, mb: 1.25 }}>
            Athletes
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
              gap: 1.15,
            }}
          >
            {[
              { label: 'Active Athletes', value: rosterSummary.active, valueColor: '#5f8f62' },
              { label: 'Inactive Athletes', value: rosterSummary.inactive, valueColor: '#d6d6d9' },
              { label: 'Suspended', value: rosterSummary.suspended, valueColor: '#d25757' },
              { label: 'Retired', value: rosterSummary.retired, valueColor: '#9f9fa5' },
              { label: 'Invitation Sent', value: rosterSummary.invitationSent, valueColor: '#d6d6d9' },
              { label: 'Not Linked', value: rosterSummary.notLinked, valueColor: '#c9782d' },
              { label: 'Link Conflicts', value: rosterSummary.conflicts, valueColor: '#d25757' },
              { label: 'Travel Incomplete', value: rosterSummary.travelIncomplete, valueColor: '#c9782d' },
            ].map((metric) => (
              <Box key={metric.label} sx={{ p: 1.1, borderRadius: 2, border: '1px solid #252528', bgcolor: '#131315' }}>
                <Typography sx={{ color: '#9b9ba0', fontSize: 12.5 }}>{metric.label}</Typography>
                <Typography sx={{ mt: 0.3, fontSize: 25, fontWeight: 710, color: metric.valueColor }}>
                  {metric.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </CardContent>
      </Card>

      <Card
        sx={{
          bgcolor: '#151517',
          color: '#fff',
          borderRadius: 3,
          border: '1px solid #2b2b2e',
          boxShadow: 'none',
          mb: 2.25,
        }}
      >
        <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 1.5, alignItems: { xs: 'stretch', md: 'center' } }}>
            <TextField
              label="Search athletes"
              variant="outlined"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{
                minWidth: 220,
                flex: 1,
                '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 },
                '& .MuiInputLabel-root': { color: '#a0a0a5' },
              }}
            />
            <TextField
              label="Status"
              select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={{
                minWidth: { xs: '100%', md: 200 },
                '& .MuiOutlinedInput-root': { bgcolor: '#131315', color: '#fff', borderRadius: 2 },
                '& .MuiInputLabel-root': { color: '#a0a0a5' },
              }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="Active">Active</MenuItem>
              <MenuItem value="Inactive">Inactive</MenuItem>
              <MenuItem value="Suspended">Suspended</MenuItem>
              <MenuItem value="Retired">Retired</MenuItem>
            </TextField>
          </Box>
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onClose={() => { setOpen(false); setEditId(null); setOnboardMode(false); }}
        fullWidth
        maxWidth="md"
        PaperProps={{ sx: dialogPaperSx }}
      >
        <DialogTitle sx={dialogTitleSx}>
          {editId ? 'Edit Athlete' : (onboardMode ? 'Onboard New Athlete' : 'Add Athlete')}
        </DialogTitle>
        <DialogContent sx={dialogContentSx}>
          {saving && <Typography color="info.main">Saving...</Typography>}
          {errorMsg && (
            <Box sx={{ mb: 1, p: 1.1, borderRadius: 2, border: `1px solid ${DANGER_RED}`, bgcolor: '#2a1818' }}>
              <Typography sx={{ color: '#f2c0c0', fontSize: 13.5 }}>{errorMsg}</Typography>
            </Box>
          )}

          <Typography sx={sectionLabelSx}>Identity</Typography>

          <TextField label="Name" fullWidth margin="normal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={!!formErrors.name} helperText={formErrors.name} />
          <TextField label="Email" fullWidth margin="normal" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={!!formErrors.email} helperText={formErrors.email} />
          <TextField label="Phone" fullWidth margin="normal" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={!!formErrors.phone} helperText={formErrors.phone} />
          <TextField label="Date of Birth" type="date" fullWidth margin="normal" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} InputLabelProps={{ shrink: true }} />
          <TextField label="Emergency Contact" fullWidth margin="normal" value={form.emergency_contact} onChange={(e) => setForm({ ...form, emergency_contact: e.target.value })} error={!!formErrors.emergency_contact} helperText={formErrors.emergency_contact} />

          <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
          <Typography sx={sectionLabelSx}>Operational Assignment</Typography>

          <TextField label="Status" fullWidth margin="normal" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} error={!!formErrors.status} helperText={formErrors.status} />
          <TextField label="Position/Role" fullWidth margin="normal" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} error={!!formErrors.position} helperText={formErrors.position} />
          <TextField label="Team/Unit" fullWidth margin="normal" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} error={!!formErrors.team} helperText={formErrors.team} />

          <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
          <Typography sx={sectionLabelSx}>Travel Profile</Typography>

          <ReferenceAutocomplete
            label="Residence Country"
            value={form.residence_country_code}
            options={COUNTRY_OPTIONS}
            required
            onChange={(value) => setForm({ ...form, residence_country_code: value })}
            error={!!formErrors.residence_country_code}
            helperText={formErrors.residence_country_code}
          />
          <ReferenceAutocomplete
            label="Home Timezone"
            value={form.home_timezone}
            options={TIMEZONE_OPTIONS}
            required
            onChange={(value) => setForm({ ...form, home_timezone: value })}
            error={!!formErrors.home_timezone}
            helperText={formErrors.home_timezone}
          />
          <ReferenceAutocomplete
            label="Nationality (optional)"
            value={form.nationality_country_code}
            options={COUNTRY_OPTIONS}
            onChange={(value) => setForm({ ...form, nationality_country_code: value })}
            error={!!formErrors.nationality_country_code}
            helperText={formErrors.nationality_country_code}
          />
          <ReferenceAutocomplete
            label="Preferred Airport (optional)"
            value={form.preferred_airport_code}
            options={AIRPORT_OPTIONS}
            onChange={(value) => setForm({ ...form, preferred_airport_code: value })}
            error={!!formErrors.preferred_airport_code}
            helperText={formErrors.preferred_airport_code}
          />
          <TextField label="Home City (optional)" fullWidth margin="normal" value={form.home_city} onChange={(e) => setForm({ ...form, home_city: e.target.value })} />
          <TextField label="Home Region (optional)" fullWidth margin="normal" value={form.home_region} onChange={(e) => setForm({ ...form, home_region: e.target.value })} />

          <Divider sx={{ my: 1.5, borderColor: '#2a2a2d' }} />
          <Typography sx={sectionLabelSx}>Additional Notes</Typography>
          <TextField label="Notes/Bio" fullWidth margin="normal" multiline minRows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button onClick={() => setOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
          <Button onClick={addOrEditAthlete} variant="contained" sx={primaryButtonSx}>{editId ? 'Save' : (onboardMode ? 'Create & Continue' : 'Add')}</Button>
        </DialogActions>
      </Dialog>

      {successMsg && <Typography color="success.main" sx={{ mb: 2 }}>{successMsg}</Typography>}
      {errorMsg && <Typography color="error.main" sx={{ mb: 2 }}>{errorMsg}</Typography>}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: 2,
        }}
      >
        {filteredAthletes.length === 0 ? (
          <Card sx={{ bgcolor: '#151517', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none' }}>
            <CardContent sx={{ py: 3 }}>
              <Typography sx={{ color: '#d8d8db', fontWeight: 620, mb: 0.35 }}>
                No athletes found.
              </Typography>
              <Typography variant="body2" sx={{ color: '#9a9a9f' }}>
                Try updating search or status filters to view available athlete profiles.
              </Typography>
            </CardContent>
          </Card>
        ) : (
          filteredAthletes
            .map((athlete) => {
              const accountStatus = getAccountStatus(athlete);
              const onboarding = onboardingByAthleteId[athlete.id];
              const onboardingChip = getOnboardingChip(athlete);
              const travelProfileChip = getTravelProfileChip(athlete);
              const linkedProfile = athlete.user_id ? profilesByUserId[athlete.user_id] : null;
              const linkedAtIso = linkedAtByAthleteId[athlete.id];

              return (
                <Card key={athlete.id} sx={{ mb: 0.2, bgcolor: '#151517', color: '#fff', borderRadius: 3, border: '1px solid #2b2b2e', boxShadow: 'none', minWidth: 0 }}>
                  <CardContent sx={{ p: 2.1 }}>
                    <Tooltip title={athlete.name || ''} arrow>
                      <Typography variant="h6" fontWeight={680} mb={0.2} sx={{ maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#f5f5f6' }}>
                        {athlete.name}
                      </Typography>
                    </Tooltip>
                    <Typography variant="body2" sx={{ color: '#9fa0a5', mb: 1.15 }}>
                      {(athlete.team || 'No Team')} · {(athlete.position || 'No Position')}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.1, flexWrap: 'wrap' }}>
                      <Chip
                        label={athlete.status || 'Unknown'}
                        size="small"
                        sx={{
                          bgcolor: '#1f2022',
                          color: '#d8d8dc',
                          border: '1px solid #303136',
                          fontWeight: 550,
                        }}
                      />
                      <Chip
                        label={accountStatus.label}
                        size="small"
                        sx={{
                          bgcolor: accountStatus.color === 'error' ? '#3a1f1f' : accountStatus.color === 'success' ? '#1d2b21' : '#2f281e',
                          color: accountStatus.color === 'error' ? '#f3c2c2' : accountStatus.color === 'success' ? '#c7e2cc' : '#f0d6b2',
                          border: '1px solid #35363a',
                        }}
                      />
                      <Chip
                        label={onboardingChip.label}
                        size="small"
                        sx={{
                          bgcolor: onboardingChip.color === 'success' ? '#1d2b21' : onboardingChip.color === 'warning' ? '#2f281e' : '#20242b',
                          color: onboardingChip.color === 'success' ? '#c7e2cc' : onboardingChip.color === 'warning' ? '#f0d6b2' : '#d0d4de',
                          border: '1px solid #35363a',
                        }}
                      />
                      <Chip
                        label={`Travel ${travelProfileChip.label}`}
                        size="small"
                        sx={{
                          bgcolor: travelProfileChip.color === 'success' ? '#1d2b21' : '#2f281e',
                          color: travelProfileChip.color === 'success' ? '#c7e2cc' : '#f0d6b2',
                          border: '1px solid #35363a',
                        }}
                      />
                    </Box>

                    <Box sx={{ p: 1.2, borderRadius: 2, border: '1px solid #252528', bgcolor: '#131315', mb: 1.05 }}>
                      <Typography variant="body2" sx={{ color: '#d3d3d6', mb: 0.3 }}><strong>Email:</strong> {athlete.email || 'Not set'}</Typography>
                      <Typography variant="body2" sx={{ color: '#d3d3d6', mb: 0.3 }}><strong>Phone:</strong> {athlete.phone || 'Not set'}</Typography>
                      <Typography variant="body2" sx={{ color: '#b0b0b4', mb: 0.3 }}><strong>Residence Country:</strong> {athlete.residence_country_code || 'Not set'}</Typography>
                      <Typography variant="body2" sx={{ color: '#b0b0b4' }}><strong>Home Timezone:</strong> {athlete.home_timezone || 'Not set'}</Typography>
                    </Box>

                    <Box sx={{ p: 1.2, borderRadius: 2, border: '1px solid #252528', bgcolor: '#131315', mb: 1.05 }}>
                      <Typography variant="body2" sx={{ color: '#b0b0b4', mb: 0.3 }}><strong>Date of Birth:</strong> {athlete.dob || 'Not set'}</Typography>
                      <Typography variant="body2" sx={{ color: '#b0b0b4', mb: 0.3 }}><strong>Emergency Contact:</strong> {athlete.emergency_contact || 'Not set'}</Typography>
                      <Typography variant="body2" sx={{ color: '#b0b0b4', mb: 0.3 }}><strong>Nationality:</strong> {athlete.nationality_country_code || 'Not set'}</Typography>
                      <Typography variant="body2" sx={{ color: '#b0b0b4', mb: 0.3 }}><strong>Preferred Airport:</strong> {athlete.preferred_airport_code || 'Not set'}</Typography>
                      <Typography variant="body2" sx={{ color: '#b0b0b4', mb: 0.3 }}><strong>Home City:</strong> {athlete.home_city || 'Not set'}</Typography>
                      <Typography variant="body2" sx={{ color: '#b0b0b4', mb: 0.3 }}><strong>Home Region:</strong> {athlete.home_region || 'Not set'}</Typography>
                      <Typography variant="body2" sx={{ color: '#b0b0b4' }}><strong>Notes:</strong> {athlete.notes || 'None'}</Typography>
                    </Box>

                    <Divider sx={{ my: 1.5, borderColor: '#3b3b3b' }} />

                    {onboarding?.invitation_sent_at && onboardingChip.label !== 'Linked' && (
                      <Typography variant="body2" sx={{ mb: 0.5, color: '#b6b6ba' }}>
                        <strong>Invitation Sent:</strong> {new Date(onboarding.invitation_sent_at).toLocaleString()}
                      </Typography>
                    )}
                    {onboarding?.invitation_expires_at && onboardingChip.label === 'Invitation Sent' && (
                      <Typography variant="body2" sx={{ mb: 0.5, color: '#b6b6ba' }}>
                        <strong>Invitation Expires:</strong> {new Date(onboarding.invitation_expires_at).toLocaleString()}
                      </Typography>
                    )}

                    {athlete.user_id && (
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="body2" sx={{ color: '#d3d3d6' }}>
                          <strong>Linked Account:</strong> {linkedProfile?.full_name || 'Unnamed user'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#d3d3d6' }}>
                          <strong>Linked Email:</strong> {linkedProfile?.email || 'Unknown email'}
                        </Typography>
                        {linkedAtIso && (
                          <Typography variant="body2" sx={{ color: '#b6b6ba' }}>
                            <strong>Linked At:</strong> {new Date(linkedAtIso).toLocaleString()}
                          </Typography>
                        )}
                      </Box>
                    )}

                    {accountStatus.label === 'Conflict' && (
                      <Typography variant="body2" color="error.main" sx={{ mb: 1 }}>
                        Multiple athletes share this normalized email. Manual cleanup is required before safe self-link.
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                      <Button
                        variant="outlined"
                        onClick={() => openEdit(athlete)}
                        aria-label={`Edit athlete ${athlete.name || ''}`}
                        sx={{ borderColor: '#4f4f54', color: '#d6d6da', textTransform: 'none', '&:hover': { borderColor: ACCENT_ORANGE, color: ACCENT_ORANGE } }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => deleteAthlete(athlete.id)}
                        aria-label={`Delete athlete ${athlete.name || ''}`}
                        sx={{ textTransform: 'none' }}
                      >
                        Delete
                      </Button>

                      {!athlete.user_id && (onboardingChip.label === 'Not Invited' || onboardingChip.label === 'Expired') && (
                        <Button
                          variant="contained"
                          onClick={() => issueInvitation(athlete, onboardingChip.label === 'Expired' ? 'resend' : 'send')}
                          sx={{ bgcolor: ACCENT_ORANGE, textTransform: 'none', '&:hover': { bgcolor: ACCENT_ORANGE_DIM } }}
                        >
                          {onboardingChip.label === 'Expired' ? 'Resend Invitation' : 'Send Invitation'}
                        </Button>
                      )}

                      {!athlete.user_id && onboardingChip.label === 'Invitation Sent' && (
                        <>
                          <Button
                            variant="contained"
                            onClick={() => issueInvitation(athlete, 'resend')}
                            sx={{ bgcolor: ACCENT_ORANGE, textTransform: 'none', '&:hover': { bgcolor: ACCENT_ORANGE_DIM } }}
                          >
                            Resend Invitation
                          </Button>
                          <Button
                            variant="outlined"
                            color="warning"
                            onClick={() => {
                              setRevokeAthlete(athlete);
                              setRevokeConfirmOpen(true);
                            }}
                            sx={{ textTransform: 'none' }}
                          >
                            Revoke Invitation
                          </Button>
                        </>
                      )}

                      {!athlete.user_id && (
                        <Button
                          variant="outlined"
                          onClick={() => openLinkDialog(athlete, 'link')}
                          sx={{ borderColor: '#4f4f54', color: '#d6d6da', textTransform: 'none', '&:hover': { borderColor: ACCENT_ORANGE, color: ACCENT_ORANGE } }}
                        >
                          Link Existing Account
                        </Button>
                      )}

                      {athlete.user_id && (
                        <>
                          <Button
                            variant="outlined"
                            color="warning"
                            onClick={() => {
                              setUnlinkAthlete(athlete);
                              setUnlinkConfirmOpen(true);
                            }}
                            sx={{ textTransform: 'none' }}
                          >
                            Unlink Account
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={() => openLinkDialog(athlete, 'relink')}
                            sx={{ borderColor: '#4f4f54', color: '#d6d6da', textTransform: 'none', '&:hover': { borderColor: ACCENT_ORANGE, color: ACCENT_ORANGE } }}
                          >
                            Relink Account
                          </Button>
                        </>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              );
            })
        )}
      </Box>
      </Box>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={dialogTitleSx}>Delete Athlete</DialogTitle>
        <DialogContent sx={{ ...dialogContentSx, pt: 0.5 }}>
          <DialogContentText sx={{ color: '#b3b3b7' }}>
            Are you sure you want to delete this athlete? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button onClick={() => setDeleteDialogOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
          <Button onClick={confirmDelete} variant="contained" sx={destructiveButtonSx}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={unlinkConfirmOpen} onClose={() => setUnlinkConfirmOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={dialogTitleSx}>Unlink Athlete Account</DialogTitle>
        <DialogContent sx={{ ...dialogContentSx, pt: 0.5 }}>
          <DialogContentText sx={{ color: '#b3b3b7' }}>
            This will remove the athlete-to-account linkage. The auth account and profile are not deleted.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button onClick={() => setUnlinkConfirmOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
          <Button onClick={handleUnlinkConfirmed} variant="contained" sx={destructiveButtonSx}>
            Confirm Unlink
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={revokeConfirmOpen} onClose={() => setRevokeConfirmOpen(false)} fullWidth maxWidth="xs" PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={dialogTitleSx}>Revoke Invitation</DialogTitle>
        <DialogContent sx={{ ...dialogContentSx, pt: 0.5 }}>
          <DialogContentText sx={{ color: '#b3b3b7' }}>
            This will revoke the current active invitation for this athlete.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button onClick={() => setRevokeConfirmOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
          <Button
            onClick={async () => {
              if (!revokeAthlete) return;
              await revokeInvitation(revokeAthlete);
              setRevokeAthlete(null);
              setRevokeConfirmOpen(false);
            }}
            variant="contained"
            sx={primaryButtonSx}
          >
            Confirm Revoke
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: dialogPaperSx }}>
        <DialogTitle sx={dialogTitleSx}>{linkMode === 'link' ? 'Link Existing Account' : 'Relink Account'}</DialogTitle>
        <DialogContent sx={dialogContentSx}>
          <DialogContentText sx={{ mb: 1.8, color: '#a9a9ae' }}>
            {linkAthlete?.name ? `Athlete: ${linkAthlete.name}` : 'Select an account to continue.'}
          </DialogContentText>

          <TextField
            fullWidth
            label="Search account by name or email"
            value={candidateQuery}
            onChange={(e) => setCandidateQuery(e.target.value)}
            sx={{ mb: 1.7 }}
          />

          {candidateLoading && <Typography sx={{ color: '#9fa0a5', fontSize: 13.5, mb: 1 }}>Searching...</Typography>}
          {candidateError && <Typography sx={{ color: '#f2c0c0', fontSize: 13.5, mb: 1 }}>{candidateError}</Typography>}

          <Box sx={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #2f2f33', borderRadius: 2, bgcolor: '#131315' }}>
            {candidates.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography sx={{ color: '#d8d8db', fontWeight: 620, mb: 0.35 }}>No matching accounts.</Typography>
                <Typography variant="body2" sx={{ color: '#9a9a9f' }}>Try a different name or email search.</Typography>
              </Box>
            ) : (
              candidates.map((candidate) => {
                const isSelected = selectedCandidate?.auth_user_id === candidate.auth_user_id;
                return (
                  <Box
                    key={candidate.auth_user_id}
                    onClick={() => setSelectedCandidate(candidate)}
                    sx={{
                      p: 1.5,
                      borderBottom: '1px solid #252528',
                      cursor: 'pointer',
                      bgcolor: isSelected ? '#23252d' : 'transparent',
                      '&:hover': { bgcolor: '#1c1d22' },
                    }}
                  >
                    <Typography sx={{ fontWeight: 620, color: '#f0f0f2' }}>{candidate.full_name || 'Unnamed user'}</Typography>
                    <Typography variant="body2" sx={{ color: '#c7c7cb' }}>{candidate.email || 'No email'}</Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                      <Chip
                        size="small"
                        label={candidate.provisioned ? 'Provisioned' : 'Needs Setup'}
                        sx={{
                          bgcolor: candidate.provisioned ? '#1d2b21' : '#2f281e',
                          color: candidate.provisioned ? '#c7e2cc' : '#f0d6b2',
                          border: '1px solid #35363a',
                        }}
                      />
                      {candidate.role && <Chip size="small" label={`Role: ${candidate.role}`} sx={{ bgcolor: '#1f2022', color: '#d2d2d6', border: '1px solid #35363a' }} />}
                      {candidate.status && <Chip size="small" label={`Status: ${candidate.status}`} sx={{ bgcolor: '#1f2022', color: '#d2d2d6', border: '1px solid #35363a' }} />}
                    </Box>
                    {candidate.linked_athlete_id && linkMode === 'relink' && (
                      <Typography variant="caption" sx={{ color: '#f0d6b2' }}>
                        Currently linked to an athlete
                      </Typography>
                    )}
                  </Box>
                );
              })
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={dialogActionsSx}>
          <Button onClick={() => setLinkDialogOpen(false)} variant="outlined" sx={neutralButtonSx}>Cancel</Button>
          <Button
            onClick={handleCompleteAccountSetup}
            variant="outlined"
            disabled={!selectedCandidate || linkSubmitting || !!selectedCandidate?.provisioned}
            sx={neutralButtonSx}
          >
            Complete Account Setup
          </Button>
          <Button
            onClick={handleSubmitLinkAction}
            variant="contained"
            disabled={!selectedCandidate || linkSubmitting}
            sx={primaryButtonSx}
          >
            {linkSubmitting ? 'Saving...' : (linkMode === 'link' ? 'Confirm Link' : 'Confirm Relink')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
